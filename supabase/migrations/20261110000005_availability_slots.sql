-- =====================================================================
-- Phase 3-2. 가능 시간(주간 반복 · 날짜별 예외) · 슬롯 · 슬롯 자동 생성
-- 4번 실행 후에 실행한다. 여러 번 실행해도 된다.
-- 시간은 모두 한국 시간(Asia/Seoul) 기준으로 입력·계산한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- availability_rules: 주간 반복 시간 (예: 토 14:00–18:00). weekday 0=일 … 6=토.
-- ---------------------------------------------------------------------
create table if not exists public.availability_rules (
  id          uuid primary key default gen_random_uuid(),
  jigi_id     uuid not null references public.jigi_profiles (user_id) on delete cascade,
  weekday     smallint not null check (weekday between 0 and 6),
  start_time  time not null check (extract(minute from start_time)::int % 30 = 0 and extract(second from start_time) = 0),
  end_time    time not null check (extract(minute from end_time)::int % 30 = 0 and extract(second from end_time) = 0),
  valid_from  date,
  valid_to    date,
  created_at  timestamptz not null default now(),
  check (end_time > start_time),
  check (valid_from is null or valid_to is null or valid_to >= valid_from)
);

create index if not exists availability_rules_jigi_idx on public.availability_rules (jigi_id, weekday);

-- ---------------------------------------------------------------------
-- availability_exceptions: 날짜별 예외.
--   closed + 시간 없음 = 그날 하루 쉼 / closed + 시간 = 그 시간만 쉼 / extra + 시간 = 그날만 추가로 엶
-- ---------------------------------------------------------------------
create table if not exists public.availability_exceptions (
  id          uuid primary key default gen_random_uuid(),
  jigi_id     uuid not null references public.jigi_profiles (user_id) on delete cascade,
  date        date not null,
  type        text not null check (type in ('closed', 'extra')),
  start_time  time check (start_time is null or (extract(minute from start_time)::int % 30 = 0 and extract(second from start_time) = 0)),
  end_time    time check (end_time is null or (extract(minute from end_time)::int % 30 = 0 and extract(second from end_time) = 0)),
  created_at  timestamptz not null default now(),
  check ((start_time is null) = (end_time is null)),
  check (start_time is null or end_time > start_time),
  check (type = 'closed' or start_time is not null)
);

create index if not exists availability_exceptions_jigi_idx on public.availability_exceptions (jigi_id, date);

-- 가능 시간은 지기 본인과 관리자만 본다. 여행자에게는 만들어진 슬롯만 보인다.
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
revoke all on public.availability_rules, public.availability_exceptions from anon, authenticated;
grant select on public.availability_rules, public.availability_exceptions to authenticated;

drop policy if exists "availability_rules: own or admin" on public.availability_rules;
create policy "availability_rules: own or admin" on public.availability_rules
  for select to authenticated
  using (jigi_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "availability_exceptions: own or admin" on public.availability_exceptions;
create policy "availability_exceptions: own or admin" on public.availability_exceptions
  for select to authenticated
  using (jigi_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------
-- slots: 루트별 예약 가능한 시작 시각. 가능 시간과 루트 소요 시간으로 자동으로 만든다.
--   open(예약 가능) / held(요청 대기, Phase 5) / booked(확정, Phase 5) / closed(닫힘)
-- 쓰기는 DB 함수만 한다.
-- ---------------------------------------------------------------------
create table if not exists public.slots (
  id          uuid primary key default gen_random_uuid(),
  route_id    uuid not null references public.routes (id) on delete cascade,
  jigi_id     uuid not null references public.jigi_profiles (user_id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  status      text not null default 'open' check (status in ('open', 'held', 'booked', 'closed')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (route_id, starts_at),
  check (ends_at > starts_at)
);

create index if not exists slots_jigi_idx on public.slots (jigi_id, starts_at);
create index if not exists slots_route_open_idx on public.slots (route_id, starts_at) where status = 'open';

drop trigger if exists slots_touch on public.slots;
create trigger slots_touch before update on public.slots
  for each row execute function public.touch_updated_at();

alter table public.slots enable row level security;
revoke all on public.slots from anon, authenticated;
grant select on public.slots to anon, authenticated;

-- 누구나: 공개 루트(routes RLS로 확인)의 앞으로 남은 open 슬롯
drop policy if exists "slots: public read open" on public.slots;
create policy "slots: public read open" on public.slots
  for select to anon
  using (
    status = 'open' and starts_at > now()
    and exists (select 1 from public.routes r where r.id = slots.route_id and r.status = 'published')
  );

drop policy if exists "slots: member read" on public.slots;
create policy "slots: member read" on public.slots
  for select to authenticated
  using (
    (status = 'open' and starts_at > now()
      and exists (select 1 from public.routes r where r.id = slots.route_id and r.status = 'published'))
    or jigi_id = (select auth.uid())
    or (select public.is_admin())
  );

-- ---------------------------------------------------------------------
-- compute_jigi_slots(): 앞으로 4주(오늘 포함 28일) 동안 만들어야 할 슬롯 목록을 계산한다.
--   가능 시간(주간 반복 + 추가로 연 날) 안에서, 공개 루트마다 시작 시각을 루트 소요 시간 간격으로 놓는다.
--   예) 토 14:00–18:00, 3시간 루트 → 14:00 / 2시간 루트 → 14:00, 16:00
--   쉬는 날·쉬는 시간과 겹치는 슬롯, 이미 지난 시각은 뺀다.
-- ---------------------------------------------------------------------
create or replace function public.compute_jigi_slots(p_jigi uuid)
returns table (route_id uuid, starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with params as (
    select (now() at time zone 'Asia/Seoul')::date as today
  ),
  days as (
    select p.today + g as day from params p, generate_series(0, 27) g
  ),
  windows as (
    select d.day, r.start_time, r.end_time
    from days d
    join public.availability_rules r
      on r.jigi_id = p_jigi
     and r.weekday = extract(dow from d.day)::int
     and (r.valid_from is null or d.day >= r.valid_from)
     and (r.valid_to is null or d.day <= r.valid_to)
    union
    select e.date, e.start_time, e.end_time
    from public.availability_exceptions e, params p
    where e.jigi_id = p_jigi and e.type = 'extra' and e.date between p.today and p.today + 27
  ),
  starts as (
    select rt.id as route_id, w.day, rt.duration_minutes as dur,
           w.start_time + make_interval(mins => rt.duration_minutes * k) as t0
    from windows w
    join public.routes rt on rt.jigi_id = p_jigi and rt.status = 'published'
    cross join lateral generate_series(
      0, (extract(epoch from (w.end_time - w.start_time)) / 60)::int / rt.duration_minutes - 1
    ) as k
  )
  select distinct s.route_id,
         (s.day + s.t0) at time zone 'Asia/Seoul',
         (s.day + s.t0 + make_interval(mins => s.dur)) at time zone 'Asia/Seoul'
  from starts s
  where public.is_approved_jigi(p_jigi)
    and (s.day + s.t0) at time zone 'Asia/Seoul' > now()
    and not exists (
      select 1 from public.availability_exceptions e
      where e.jigi_id = p_jigi and e.type = 'closed' and e.date = s.day
        and (e.start_time is null or (s.t0 < e.end_time and s.t0 + make_interval(mins => s.dur) > e.start_time))
    )
$$;

-- ---------------------------------------------------------------------
-- refresh_jigi_slots(): 계산 결과에 맞춰 슬롯을 다시 맞춘다.
--   새로 필요한 슬롯은 만들고, 더 이상 맞지 않거나 지난 open 슬롯은 지운다.
--   요청·확정된 슬롯(held/booked)은 가능 시간이 바뀌어도 건드리지 않는다.
-- 루트 공개·가능 시간 저장·지기 활성 변경 때 자동으로 불리고, 하루 한 번 크론으로도 불린다(7번 파일).
-- ---------------------------------------------------------------------
create or replace function public.refresh_jigi_slots(p_jigi uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  with wanted as materialized (
    select * from public.compute_jigi_slots(p_jigi)
  )
  delete from public.slots s
  where s.jigi_id = p_jigi
    and s.status = 'open'
    and not exists (select 1 from wanted w where w.route_id = s.route_id and w.starts_at = s.starts_at);

  insert into public.slots (route_id, jigi_id, starts_at, ends_at)
  select c.route_id, p_jigi, c.starts_at, c.ends_at
  from public.compute_jigi_slots(p_jigi) c
  on conflict (route_id, starts_at) do nothing;
end;
$$;

-- 모든 지기의 슬롯을 다시 맞춘다 (매일 크론: 4주 창을 하루씩 앞으로 민다)
create or replace function public.refresh_all_slots()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_jigi uuid;
begin
  for v_jigi in
    select jigi_id from public.routes where status = 'published'
    union
    select jigi_id from public.slots where status = 'open'
  loop
    perform public.refresh_jigi_slots(v_jigi);
  end loop;
end;
$$;

revoke execute on function public.compute_jigi_slots(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_jigi_slots(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_all_slots() from public, anon, authenticated;

-- 지기가 정지·승인 취소되면(open 슬롯 정리) 또는 다시 활성화되면(슬롯 생성) 바로 반영한다
create or replace function public.jigi_profiles_sync_slots()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_active is distinct from old.is_active then
    perform public.refresh_jigi_slots(new.user_id);
  end if;
  return new;
end;
$$;

revoke execute on function public.jigi_profiles_sync_slots() from public, anon, authenticated;

drop trigger if exists jigi_profiles_sync_slots on public.jigi_profiles;
create trigger jigi_profiles_sync_slots after update of is_active on public.jigi_profiles
  for each row execute function public.jigi_profiles_sync_slots();
