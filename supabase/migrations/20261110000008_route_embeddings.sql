-- =====================================================================
-- Phase 4-1. 루트 임베딩(pgvector) · 추천 후보 함수 match_routes · 샘플 표시(is_sample)
-- 1~6번 실행 후에 실행한다. 여러 번 실행해도 된다.
--
-- 벡터 차원: 1024
--   EMBEDDING_MODEL이 1024차원 벡터를 내도록 맞춘다 (src/config/recommend.ts의 EMBEDDING_DIM과 같아야 한다).
--     · Voyage AI  voyage-3.5 / voyage-3.5-lite / voyage-3-large  → output_dimension 1024 (기본값)
--     · OpenAI     text-embedding-3-small / text-embedding-3-large → dimensions 1024 로 요청
--   다른 차원의 모델로 바꾸려면: 이 칸을 새 차원으로 다시 만들고(기존 벡터는 버림),
--   EMBEDDING_DIM을 바꾼 뒤 /admin/recommendations에서 임베딩 백필을 다시 돌린다.
--   모델만 바꿔도(차원이 같아도) 벡터끼리 비교할 수 없으므로 백필해야 한다 — 추천은 모델이 같은 벡터만 쓴다.
-- =====================================================================

create schema if not exists extensions;
create extension if not exists vector with schema extensions;

-- ---------------------------------------------------------------------
-- routes.embedding: 제목 + 소개 + 태그 + 정류장 설명으로 만든 벡터 (서버가 만들어 set_route_embedding으로 저장)
--   embedding_model: 만든 모델 / embedding_hash: 만든 글의 해시(내용이 바뀌었는지 백필이 비교) / embedded_at: 만든 시각
-- 공개 루트 내용에서 만든 값이라 개인정보는 없다. 화면 쿼리는 칸을 골라 읽으므로 벡터를 내려받지 않는다.
-- 행 수가 적고 추천은 조건으로 거른 뒤 점수를 섞어 정렬하므로 벡터 인덱스(HNSW)는 아직 두지 않는다.
-- ---------------------------------------------------------------------
alter table public.routes add column if not exists embedding extensions.vector(1024);
alter table public.routes add column if not exists embedding_model text check (char_length(embedding_model) <= 80);
alter table public.routes add column if not exists embedding_hash text check (char_length(embedding_hash) <= 128);
alter table public.routes add column if not exists embedded_at timestamptz;

-- 추천 테스트용 시드 데이터 표시 (supabase/seed/). 지울 때는 seed 폴더의 정리 SQL을 쓴다.
alter table public.profiles add column if not exists is_sample boolean not null default false;
alter table public.jigi_profiles add column if not exists is_sample boolean not null default false;
alter table public.routes add column if not exists is_sample boolean not null default false;

-- 임베딩만 저장할 때는 '마지막 수정 시각'을 바꾸지 않는다 (지기 목록 정렬·표시가 흔들리지 않게)
drop trigger if exists routes_touch on public.routes;
create trigger routes_touch before update on public.routes
  for each row
  when (old.embedded_at is not distinct from new.embedded_at)
  execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- set_route_embedding(): 서버가 만든 임베딩을 저장한다.
--   관리자: 모든 루트 (공개 승인·백필)
--   지기: 자기 루트 중 작성 중·검수 중·수정 요청 상태만 (저장 직후). 공개된 루트는 관리자만 —
--         공개는 언제나 관리자 승인을 거치고 그때 다시 만들므로, 공개 루트의 벡터는 서버가 만든 값이다.
-- ---------------------------------------------------------------------
create or replace function public.set_route_embedding(p_id uuid, p_embedding extensions.vector, p_model text, p_hash text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.routes;
begin
  select * into r from public.routes where id = p_id for update;
  if not found then
    raise exception 'route not found' using errcode = 'P0002';
  end if;
  if not (
    public.is_admin()
    or (r.jigi_id = auth.uid() and public.is_approved_jigi(auth.uid()) and r.status in ('draft', 'in_review', 'changes_requested'))
  ) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_embedding is null or extensions.vector_dims(p_embedding) <> 1024 then
    raise exception 'embedding must have 1024 dimensions' using errcode = '22023';
  end if;
  if char_length(coalesce(p_model, '')) not between 1 and 80 or char_length(coalesce(p_hash, '')) not between 1 and 128 then
    raise exception 'invalid embedding metadata' using errcode = '22023';
  end if;

  update public.routes
     set embedding = p_embedding, embedding_model = p_model, embedding_hash = p_hash, embedded_at = now()
   where id = p_id;
end;
$$;

revoke execute on function public.set_route_embedding(uuid, extensions.vector, text, text) from public, anon;
grant execute on function public.set_route_embedding(uuid, extensions.vector, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- match_routes(): AI 추천 후보 (계획서 7장).
--   거르기: 공개 루트 + 활동 중인 지기, 인원 수용 가능, 언어 하나 이상 일치,
--           요청 날짜(한국 시간)·시간대에 앞으로 남은 open 슬롯이 있음
--   점수:  score = (w_tag × 태그 겹침 + w_sim × 임베딩 유사도 + w_quality × 품질) / 가중치 합
--     · 태그 겹침: 관심사 ∩ 루트 태그는 1, 루트 태그엔 없고 정류장 태그에만 있으면 0.5.
--                  min(관심사 수, 3)개가 맞으면 만점 (관심사 5개 중 3개 일치 = 1.0)
--     · 유사도: 코사인 유사도를 [sim_floor, sim_ceil] 구간에서 0~1로 편다.
--               query_embedding이 null이거나 루트 벡터가 없거나 모델이 다르면 유사도 없이
--               (w_tag × 태그 + w_quality × 품질) / (w_tag + w_quality) 로 계산한다.
--     · 품질: 후기 quality_min_reviews개 이상이면 평점/5, 그 전에는 quality_default
--   가중치·구간·기본값은 서버 설정(src/config/recommend.ts)이 filters로 넘긴다. 없으면 아래 기본값.
--
--   filters (jsonb):
--     interests text[] (필수 1~10), date_from / date_to 'YYYY-MM-DD' (한국 날짜),
--     time_of_day 'any'|'morning'(~12시)|'afternoon'(12~17시)|'evening'(17시~), party_size int,
--     languages text[] (비어 있으면 언어 조건 없음), embedding_model text, limit int (1~50),
--     w_tag, w_sim, w_quality, sim_floor, sim_ceil, quality_default, quality_min_reviews, slot_limit
--
-- security definer: 호출한 사람과 상관없이 공개 정보만 돌려준다 (지기 이름은 일부만).
-- ---------------------------------------------------------------------
drop function if exists public.match_routes(extensions.vector, jsonb);
create function public.match_routes(query_embedding extensions.vector, filters jsonb)
returns table (
  route_id          uuid,
  jigi_id           uuid,
  title             text,
  summary           text,
  tags              text[],
  vibe              text,
  duration_minutes  integer,
  area              text,
  max_party_size    integer,
  languages         text[],
  list_price        integer,
  jigi_name         text,
  stops             jsonb,
  matched_tags      text[],
  tag_score         numeric,
  similarity        numeric,
  quality           numeric,
  score             numeric,
  slot_count        integer,
  slot_times        timestamptz[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_interests  text[] := array(select distinct jsonb_array_elements_text(coalesce(filters -> 'interests', '[]')));
  v_langs      text[] := array(select distinct jsonb_array_elements_text(coalesce(filters -> 'languages', '[]')));
  v_today      date := (now() at time zone 'Asia/Seoul')::date;
  v_from       date := coalesce((filters ->> 'date_from')::date, (now() at time zone 'Asia/Seoul')::date);
  v_to         date;
  v_time       text := coalesce(filters ->> 'time_of_day', 'any');
  v_party      integer := coalesce((filters ->> 'party_size')::int, 1);
  v_limit      integer := coalesce((filters ->> 'limit')::int, 10);
  v_model      text := filters ->> 'embedding_model';
  w_tag        numeric := coalesce((filters ->> 'w_tag')::numeric, 0.45);
  w_sim        numeric := coalesce((filters ->> 'w_sim')::numeric, 0.40);
  w_q          numeric := coalesce((filters ->> 'w_quality')::numeric, 0.15);
  sim_floor    numeric := coalesce((filters ->> 'sim_floor')::numeric, 0);
  sim_ceil     numeric := coalesce((filters ->> 'sim_ceil')::numeric, 1);
  q_default    numeric := coalesce((filters ->> 'quality_default')::numeric, 0.5);
  q_reviews    integer := coalesce((filters ->> 'quality_min_reviews')::int, 3);
  v_slot_max   integer := coalesce((filters ->> 'slot_limit')::int, 8);
begin
  v_to := coalesce((filters ->> 'date_to')::date, v_from + 27);
  if cardinality(v_interests) not between 1 and 10 or not public.valid_interest_tags(v_interests) then
    raise exception 'invalid interests' using errcode = '22023';
  end if;
  if v_from < v_today - 1 or v_to < v_from or v_to - v_from > 60 then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  if v_time not in ('any', 'morning', 'afternoon', 'evening') or v_party not between 1 and 20
     or v_limit not between 1 and 50 or v_slot_max not between 1 and 20 or cardinality(v_langs) > 10 then
    raise exception 'invalid filters' using errcode = '22023';
  end if;
  if w_tag < 0 or w_sim < 0 or w_q < 0 or w_tag + w_q <= 0 or sim_ceil <= sim_floor or q_default not between 0 and 1 then
    raise exception 'invalid weights' using errcode = '22023';
  end if;
  if query_embedding is not null and extensions.vector_dims(query_embedding) <> 1024 then
    raise exception 'query embedding must have 1024 dimensions' using errcode = '22023';
  end if;

  return query
  with cand as (
    select r.*, j.rating_avg, j.rating_count, p.display_name as host_name
    from public.routes r
    join public.jigi_profiles j on j.user_id = r.jigi_id
    join public.profiles p on p.id = r.jigi_id
    where r.status = 'published'
      and j.is_active and p.status = 'active' and p.role = 'jigi'
      and r.max_party_size >= v_party
      and (cardinality(v_langs) = 0 or r.languages && v_langs)
  ),
  open_slots as (
    select s.route_id as rid,
           count(*)::int as n,
           (array_agg(s.starts_at order by s.starts_at))[1:v_slot_max] as times
    from public.slots s
    join cand c on c.id = s.route_id
    where s.status = 'open'
      and s.starts_at > now()
      and (s.starts_at at time zone 'Asia/Seoul')::date between v_from and v_to
      and (
        v_time = 'any'
        or (v_time = 'morning' and extract(hour from s.starts_at at time zone 'Asia/Seoul') < 12)
        or (v_time = 'afternoon' and extract(hour from s.starts_at at time zone 'Asia/Seoul') between 12 and 16)
        or (v_time = 'evening' and extract(hour from s.starts_at at time zone 'Asia/Seoul') >= 17)
      )
    group by s.route_id
  ),
  parts as (
    select c.*, o.n, o.times,
           st.stops_json,
           array(select unnest(c.tags) intersect select unnest(v_interests)) as route_hits,
           array(
             select unnest(st.stop_tags) intersect select unnest(v_interests)
             except select unnest(c.tags)
           ) as stop_hits,
           case
             when query_embedding is null or c.embedding is null
               or (v_model is not null and c.embedding_model is distinct from v_model) then null
             else (1 - (c.embedding operator(extensions.<=>) query_embedding))::numeric
           end as cos_sim,
           case
             when c.rating_count >= q_reviews and c.rating_avg is not null then least(1, c.rating_avg / 5)
             else q_default
           end as q
    from cand c
    join open_slots o on o.rid = c.id
    cross join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
               'place_name', x.place_name, 'area', x.area, 'stay_minutes', x.stay_minutes,
               'activity', x.activity, 'tags', x.tags) order by x.order_no), '[]'::jsonb) as stops_json,
             coalesce((select array_agg(distinct t) from public.route_stops y, unnest(y.tags) as t where y.route_id = c.id),
                      '{}') as stop_tags
      from public.route_stops x
      where x.route_id = c.id
    ) st
  ),
  scored as (
    select p.*,
           least(1, (cardinality(p.route_hits) + 0.5 * cardinality(p.stop_hits))
                    / least(cardinality(v_interests), 3))::numeric as t_score,
           case when p.cos_sim is null then null
                else greatest(0, least(1, (p.cos_sim - sim_floor) / (sim_ceil - sim_floor))) end as s_norm
    from parts p
  )
  select s.id, s.jigi_id, s.title, s.summary, s.tags, s.vibe, s.duration_minutes, s.area,
         s.max_party_size, s.languages, s.list_price,
         public.mask_name(s.host_name),
         s.stops_json,
         s.route_hits || s.stop_hits,
         round(s.t_score, 4),
         round(s.cos_sim, 4),
         round(s.q, 4),
         round(case
           when s.s_norm is null then (w_tag * s.t_score + w_q * s.q) / (w_tag + w_q)
           else (w_tag * s.t_score + w_sim * s.s_norm + w_q * s.q) / (w_tag + w_sim + w_q)
         end, 4) as final_score,
         s.n,
         s.times
  from scored s
  order by final_score desc, s.n desc, s.published_at desc nulls last, s.id
  limit v_limit;
end;
$$;

revoke execute on function public.match_routes(extensions.vector, jsonb) from public, anon;
grant execute on function public.match_routes(extensions.vector, jsonb) to authenticated;
