-- =====================================================================
-- Phase 4-2. AI 추천 기록 (recommendation_requests)
-- 8번 실행 후에 실행한다. 여러 번 실행해도 된다.
--
-- 추천 한 번 = 한 행. 같은 조건의 30분 캐시와 시간당 호출 제한도 이 표로 판단한다 (서버: /api/recommend).
-- 입력(input)에는 취향 조건만 둔다 — 이름·이메일·연락처·국적 등 개인정보는 넣지 않는다.
-- 자유 문장(note)은 서버가 이메일·전화번호·링크를 지운 뒤 200자 이내로만 저장한다.
-- 읽기: 본인과 관리자. 쓰기: 아래 DB 함수로만.
-- =====================================================================

create table if not exists public.recommendation_requests (
  id                uuid primary key default gen_random_uuid(),
  traveler_id       uuid not null references public.profiles (id) on delete cascade,
  input             jsonb not null,
  cache_key         text not null check (char_length(cache_key) between 16 and 128),
  candidates        jsonb not null default '[]',
  results           jsonb not null default '[]',
  model             text check (char_length(model) <= 80),
  embedding_model   text check (char_length(embedding_model) <= 80),
  used_fallback     boolean not null default false,
  fallback_reason   text check (char_length(fallback_reason) <= 40),
  latency_ms        integer check (latency_ms between 0 and 600000),
  clicked_route_id  uuid references public.routes (id) on delete set null,
  clicked_at        timestamptz,
  booked            boolean not null default false,  -- Phase 5: 추천에서 요청까지 이어졌는지
  created_at        timestamptz not null default now(),
  check (jsonb_typeof(input) = 'object' and jsonb_typeof(candidates) = 'array' and jsonb_typeof(results) = 'array')
);

create index if not exists recommendation_requests_user_idx on public.recommendation_requests (traveler_id, created_at desc);
create index if not exists recommendation_requests_cache_idx on public.recommendation_requests (traveler_id, cache_key, created_at desc);
create index if not exists recommendation_requests_created_idx on public.recommendation_requests (created_at desc);

alter table public.recommendation_requests enable row level security;
revoke all on public.recommendation_requests from anon, authenticated;
grant select on public.recommendation_requests to authenticated;

drop policy if exists "recommendation_requests: own or admin" on public.recommendation_requests;
create policy "recommendation_requests: own or admin" on public.recommendation_requests
  for select to authenticated
  using (traveler_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------
-- save_recommendation(): 추천 결과를 기록하고 id를 돌려준다.
--   여행자(또는 확인용 관리자)만. input은 정해진 칸만 골라 저장한다(다른 칸은 버림).
--   서버의 시간당 제한(설정값)과 별도로, 직접 호출을 막는 안전 상한(시간당 30회)을 둔다.
-- ---------------------------------------------------------------------
create or replace function public.save_recommendation(
  p_input jsonb,
  p_cache_key text,
  p_candidates jsonb,
  p_results jsonb,
  p_model text,
  p_embedding_model text,
  p_used_fallback boolean,
  p_fallback_reason text,
  p_latency_ms integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_id uuid;
  v_input jsonb;
begin
  if not exists (
    select 1 from public.profiles
    where id = me and status = 'active' and (role = 'admin' or (role = 'traveler' and terms_agreed_at is not null))
  ) then
    raise exception 'travelers only' using errcode = '42501';
  end if;
  if (select count(*) from public.recommendation_requests where traveler_id = me and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'rate limited' using errcode = '54000';
  end if;
  if jsonb_typeof(p_input) is distinct from 'object' or jsonb_typeof(p_candidates) is distinct from 'array'
     or jsonb_typeof(p_results) is distinct from 'array'
     or jsonb_array_length(p_candidates) > 20 or jsonb_array_length(p_results) > 10
     or pg_column_size(p_candidates) + pg_column_size(p_results) > 100000 then
    raise exception 'invalid recommendation data' using errcode = '22023';
  end if;

  v_input := jsonb_strip_nulls(jsonb_build_object(
    'interests',   p_input -> 'interests',
    'date_from',   p_input -> 'date_from',
    'date_to',     p_input -> 'date_to',
    'time_of_day', p_input -> 'time_of_day',
    'party_size',  p_input -> 'party_size',
    'languages',   p_input -> 'languages',
    'vibe',        p_input -> 'vibe',
    'note',        to_jsonb(left(p_input ->> 'note', 200))
  ));

  insert into public.recommendation_requests (
    traveler_id, input, cache_key, candidates, results, model, embedding_model,
    used_fallback, fallback_reason, latency_ms
  )
  values (
    me, v_input, p_cache_key, p_candidates, p_results, left(p_model, 80), left(p_embedding_model, 80),
    coalesce(p_used_fallback, false), left(p_fallback_reason, 40), least(greatest(coalesce(p_latency_ms, 0), 0), 600000)
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- record_recommendation_click(): 추천 카드를 눌러 루트를 열었을 때 (첫 클릭만 남긴다).
--   본인 기록이고, 그 추천 결과에 있던 루트일 때만.
-- ---------------------------------------------------------------------
create or replace function public.record_recommendation_click(p_id uuid, p_route uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.recommendation_requests
     set clicked_route_id = p_route, clicked_at = now()
   where id = p_id
     and traveler_id = auth.uid()
     and clicked_route_id is null
     and exists (select 1 from jsonb_array_elements(results) e where e ->> 'route_id' = p_route::text);
  return found;
end;
$$;

revoke execute on function public.save_recommendation(jsonb, text, jsonb, jsonb, text, text, boolean, text, integer) from public, anon;
revoke execute on function public.record_recommendation_click(uuid, uuid) from public, anon;
grant execute on function public.save_recommendation(jsonb, text, jsonb, jsonb, text, text, boolean, text, integer) to authenticated;
grant execute on function public.record_recommendation_click(uuid, uuid) to authenticated;
