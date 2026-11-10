-- =====================================================================
-- Phase 3-1. 루트(routes) · 코스 정류장(route_stops) · 검수 메모 · 공개 지기 정보
-- 1~3번 실행 후에 실행한다. 여러 번 실행해도 된다.
-- 쓰기는 모두 DB 함수(6번 파일)로만 한다. 이 파일은 테이블과 읽기 권한(RLS)만 만든다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 선택지 검사. 화면 쪽 목록과 같아야 한다.
--   취향 id: src/data/interests.ts / 구역·언어: src/data/routeOptions.ts
-- ---------------------------------------------------------------------
create or replace function public.valid_interest_tags(tags text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select tags <@ array[
    'korean-food', 'kpop', 'popup', 'night-view', 'healing', 'market', 'cafe', 'tradition', 'bakery', 'design',
    'street-food', 'bar', 'fashion', 'river', 'beauty', 'vegan', 'photo', 'art', 'vintage', 'workshop'
  ]::text[]
$$;

create or replace function public.valid_route_area(area text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select area in ('seongsu1', 'seongsu2', 'seoul-forest', 'ttukseom', 'songjeong', 'nearby')
$$;

-- ---------------------------------------------------------------------
-- is_approved_jigi(): 승인되어 활동 중인 지기인지. 루트·시간을 만들 수 있는 사람.
-- DB 함수 안에서만 쓴다 (화면에서 직접 부르지 않음).
-- ---------------------------------------------------------------------
create or replace function public.is_approved_jigi(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.jigi_profiles j on j.user_id = p.id
    where p.id = p_user and p.role = 'jigi' and p.status = 'active' and j.is_active
  )
$$;

revoke execute on function public.is_approved_jigi(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- routes: 지기가 만든 루트(일정표).
-- 상태: draft(작성 중) → in_review(검수 중) → published(공개) / changes_requested(수정 요청) / hidden(비공개)
-- 정가(list_price)는 표시용이다. 실제로 받을 계획이 있는 가격이어야 한다 (계획서 2-6).
-- ---------------------------------------------------------------------
create table if not exists public.routes (
  id                  uuid primary key default gen_random_uuid(),
  jigi_id             uuid not null references public.jigi_profiles (user_id) on delete cascade,
  title               text not null check (char_length(title) between 4 and 40),
  summary             text not null check (char_length(summary) between 10 and 140),
  tags                text[] not null check (cardinality(tags) between 2 and 5 and public.valid_interest_tags(tags)),
  vibe                text not null check (vibe in ('slow', 'active')),
  duration_minutes    integer not null check (duration_minutes between 120 and 240 and duration_minutes % 30 = 0),
  meeting_point_note  text not null check (char_length(meeting_point_note) between 5 and 100),
  area                text not null check (public.valid_route_area(area)),
  max_party_size      integer not null check (max_party_size between 1 and 6),
  languages           text[] not null check (
                        cardinality(languages) between 1 and 7
                        and languages <@ array['English', 'Korean', 'Japanese', 'Chinese', 'Spanish', 'French', 'German']::text[]
                      ),
  list_price          integer not null check (list_price between 0 and 500000 and list_price % 1000 = 0),
  status              text not null default 'draft'
                        check (status in ('draft', 'in_review', 'published', 'changes_requested', 'hidden')),
  submitted_at        timestamptz,
  published_at        timestamptz,
  reviewed_by         uuid references public.profiles (id) on delete set null,
  reviewed_at         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
-- embedding vector(...) 칸은 Phase 4(AI 추천)에서 pgvector와 함께 추가한다.

create index if not exists routes_jigi_idx on public.routes (jigi_id, updated_at desc);
create index if not exists routes_status_idx on public.routes (status, published_at desc);
create index if not exists routes_tags_idx on public.routes using gin (tags);

drop trigger if exists routes_touch on public.routes;
create trigger routes_touch before update on public.routes
  for each row execute function public.touch_updated_at();

alter table public.routes enable row level security;
revoke all on public.routes from anon, authenticated;
grant select on public.routes to anon, authenticated;

-- 누구나: 공개된 루트 중 활동 중인 지기의 것만 (지기가 정지되면 바로 안 보인다)
drop policy if exists "routes: public read published" on public.routes;
create policy "routes: public read published" on public.routes
  for select to anon
  using (
    status = 'published'
    and exists (select 1 from public.jigi_profiles j where j.user_id = routes.jigi_id and j.is_active)
  );

-- 회원: 위와 같고, 지기 본인은 자기 루트 전부, 관리자는 전부
drop policy if exists "routes: member read" on public.routes;
create policy "routes: member read" on public.routes
  for select to authenticated
  using (
    (status = 'published' and exists (select 1 from public.jigi_profiles j where j.user_id = routes.jigi_id and j.is_active))
    or jigi_id = (select auth.uid())
    or (select public.is_admin())
  );

-- ---------------------------------------------------------------------
-- route_stops: 코스 정류장 2~6곳 (개수는 저장 함수가 확인).
-- 읽기: 그 루트를 읽을 수 있는 사람 (routes의 RLS를 그대로 따른다)
-- ---------------------------------------------------------------------
create table if not exists public.route_stops (
  id            uuid primary key default gen_random_uuid(),
  route_id      uuid not null references public.routes (id) on delete cascade,
  order_no      smallint not null check (order_no between 1 and 6),
  place_name    text not null check (char_length(place_name) between 2 and 40),
  area          text not null check (public.valid_route_area(area)),
  stay_minutes  integer not null check (stay_minutes between 10 and 180 and stay_minutes % 10 = 0),
  activity      text not null check (char_length(activity) between 5 and 200),
  tip           text check (char_length(tip) <= 200),
  tags          text[] not null default '{}' check (cardinality(tags) <= 3 and public.valid_interest_tags(tags)),
  unique (route_id, order_no)
);

alter table public.route_stops enable row level security;
revoke all on public.route_stops from anon, authenticated;
grant select on public.route_stops to anon, authenticated;

drop policy if exists "route_stops: read with route" on public.route_stops;
create policy "route_stops: read with route" on public.route_stops
  for select to anon, authenticated
  using (exists (select 1 from public.routes r where r.id = route_stops.route_id));

-- ---------------------------------------------------------------------
-- route_review_notes: 관리자의 검수 메모(수정 요청 사유 등) — 계획서의 routes.review_memo.
-- 공개 루트 행은 누구나 읽으므로 메모는 따로 두고, 루트 주인(지기)과 관리자만 읽는다.
-- ---------------------------------------------------------------------
create table if not exists public.route_review_notes (
  route_id    uuid primary key references public.routes (id) on delete cascade,
  memo        text not null default '' check (char_length(memo) <= 500),
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.route_review_notes enable row level security;
revoke all on public.route_review_notes from anon, authenticated;
grant select on public.route_review_notes to authenticated;

drop policy if exists "route_review_notes: owner or admin" on public.route_review_notes;
create policy "route_review_notes: owner or admin" on public.route_review_notes
  for select to authenticated
  using (
    (select public.is_admin())
    or exists (select 1 from public.routes r where r.id = route_review_notes.route_id and r.jigi_id = (select auth.uid()))
  );

-- ---------------------------------------------------------------------
-- public_jigis: 루트 화면에 보여 줄 지기 정보. 이름은 일부만(김** 처럼), 연락처·이메일·사진은 없다.
-- profiles는 본인·관리자만 읽을 수 있으므로, 공개해도 되는 칸만 이 뷰로 내보낸다.
-- ---------------------------------------------------------------------
create or replace function public.mask_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when char_length(btrim(coalesce(p_name, ''))) <= 1 then btrim(coalesce(p_name, '')) || '*'
    else left(btrim(p_name), 1) || repeat('*', least(char_length(btrim(p_name)) - 1, 2))
  end
$$;

create or replace view public.public_jigis as
  select j.user_id, public.mask_name(p.display_name) as display_name, j.headline, j.bio, j.languages,
         j.rating_avg, j.rating_count
  from public.jigi_profiles j
  join public.profiles p on p.id = j.user_id
  where j.is_active and p.status = 'active' and p.role = 'jigi';

revoke all on public.public_jigis from anon, authenticated;
grant select on public.public_jigis to anon, authenticated;

-- Phase 2 초기 버전은 승인 시 신청서 자기소개를 공개 프로필 소개(bio)로 복사했다. 신청서 내용은 공개하지 않으므로 지운다.
update public.jigi_profiles j
   set bio = null
  from public.jigi_applications a
 where a.user_id = j.user_id and j.bio = a.intro;
