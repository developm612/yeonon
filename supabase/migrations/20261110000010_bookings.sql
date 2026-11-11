-- =====================================================================
-- Phase 5-1. 예약 규칙(설정) · 프로모션(무료 이용) · 예약(bookings) · 알림(notifications)
-- 9번 실행 후에 실행한다. 여러 번 실행해도 된다.
-- 이 파일은 테이블·읽기 권한(RLS)·슬롯 겹침 처리만 만든다. 예약을 바꾸는 함수는 11번 파일.
--
-- 쓰기 규칙: bookings·notifications·promotions·booking_settings는 화면(클라이언트)에서 직접 insert/update/delete 할 수 없다.
--   모든 변경은 security definer DB 함수(11번)로만 하고, 함수가 권한·상태·기한을 확인한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- booking_settings: 예약 규칙. 한 행만 있다. 값을 바꿀 곳은 여기 한 곳이다.
--   관리자 화면 /admin/promotions 아래 [예약 규칙]에서 바꾸거나, SQL Editor에서 직접 update 한다.
--   예) 기한 만료를 빨리 확인하려면: update public.booking_settings set respond_minutes = 3, urgent_respond_minutes = 3;
--       (이미 만들어진 요청의 기한은 그대로다 — 바꾼 뒤 새로 요청한다)
-- ---------------------------------------------------------------------
create table if not exists public.booking_settings (
  id                        boolean primary key default true check (id),
  respond_minutes           integer not null default 720  check (respond_minutes between 1 and 2880),   -- 응답 기한 기본 12시간
  urgent_window_minutes     integer not null default 1440 check (urgent_window_minutes between 0 and 10080), -- 만남이 24시간 이내면
  urgent_respond_minutes    integer not null default 120  check (urgent_respond_minutes between 1 and 1440), -- 응답 기한 2시간
  max_pending_per_traveler  integer not null default 3    check (max_pending_per_traveler between 1 and 20), -- 여행자 1명의 대기 요청 최대 수
  min_lead_minutes          integer not null default 120  check (min_lead_minutes between 0 and 2880),    -- 시작 N분 전까지만 요청 가능
  late_cancel_minutes       integer not null default 1440 check (late_cancel_minutes between 0 and 10080), -- 이 시간 안의 취소는 '늦은 취소'로 기록
  default_discount_rate     integer not null default 0    check (default_discount_rate between 0 and 100), -- 맞는 프로모션이 없을 때 할인율(%)
  updated_by                uuid references public.profiles (id) on delete set null,
  updated_at                timestamptz not null default now()
);

insert into public.booking_settings (id) values (true) on conflict (id) do nothing;

alter table public.booking_settings enable row level security;
revoke all on public.booking_settings from anon, authenticated;
-- 규칙 값은 비밀이 아니다 (화면이 '시작 2시간 전까지 요청 가능' 같은 안내에 쓴다)
grant select on public.booking_settings to authenticated;

drop policy if exists "booking_settings: member read" on public.booking_settings;
create policy "booking_settings: member read" on public.booking_settings
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- promotions: 할인 설정 (계획서 2-6). 결제는 없고, 예약에 가격 스냅샷만 남긴다.
--   eligible: early_member(얼리 멤버만) / all(모든 여행자)
--   max_uses: 사용 한도(예약 건수, null = 무제한). used_count는 진행 중·완료 예약 수 —
--             거절·만료·취소되면 다시 1 줄어든다 (11번 함수가 관리).
--   여러 개가 동시에 맞으면 할인율이 가장 큰 것 하나만 적용한다.
-- 관리자만 읽는다. 여행자에게는 booking_quote() 함수가 적용 결과(할인율·최종 가격·이름)만 알려 준다.
-- ---------------------------------------------------------------------
create table if not exists public.promotions (
  id             uuid primary key default gen_random_uuid(),
  name           text not null check (char_length(name) between 2 and 40),
  discount_rate  integer not null check (discount_rate between 0 and 100),
  eligible       text not null default 'early_member' check (eligible in ('early_member', 'all')),
  starts_at      timestamptz,
  ends_at        timestamptz,
  max_uses       integer check (max_uses is null or max_uses between 1 and 1000000),
  used_count     integer not null default 0 check (used_count >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (starts_at is null or ends_at is null or ends_at > starts_at)
);

drop trigger if exists promotions_touch on public.promotions;
create trigger promotions_touch before update on public.promotions
  for each row execute function public.touch_updated_at();

alter table public.promotions enable row level security;
revoke all on public.promotions from anon, authenticated;
grant select on public.promotions to authenticated;

drop policy if exists "promotions: admin read" on public.promotions;
create policy "promotions: admin read" on public.promotions
  for select to authenticated
  using ((select public.is_admin()));

-- 기본 데이터: 얼리 멤버 100% 할인 1건 (기간·한도 없음). 처음 실행할 때만 넣고, 이후 관리자가 바꾼 값은 건드리지 않는다.
-- 얼리 멤버 부여 규칙(일단): 가입하면 자동으로 얼리 멤버 (profiles.early_member 기본값 true).
-- 이 프로모션을 처음 만들 때 한 번, 이미 가입한 회원도 모두 얼리 멤버로 표시한다.
-- 규칙을 바꿀 때는 아래 기본값을 false로 바꾸고, 대상자만 update 한다 (예: Phase 7 대기자 연결 시).
alter table public.profiles alter column early_member set default true;

do $$
begin
  if not exists (select 1 from public.promotions where id = '00000000-0000-4000-8000-0000000e0001') then
    insert into public.promotions (id, name, discount_rate, eligible, is_active)
    values ('00000000-0000-4000-8000-0000000e0001', 'Early member', 100, 'early_member', true);
    update public.profiles set early_member = true where not early_member;
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- bookings: 매칭 요청·예약.
--   pending(지기 응답 대기) → confirmed(확정) → completed(만남 끝)
--   pending → declined(지기 거절) / expired(응답 기한 지남) / cancelled(취소)
--   confirmed → cancelled
-- 시작·끝 시각, 루트 이름·만나는 곳, 가격은 요청할 때의 값을 그대로 남긴다(스냅샷).
-- 슬롯이 나중에 지워지거나 루트가 비공개가 되어도 예약 화면은 그대로 보인다.
-- 여행자 이름은 지기에게 보여 줄 표시 이름만 (이메일·연락처는 두지 않는다).
-- 지기 표시 이름(jigi_name)은 확정될 때 채운다 — 확정 전에는 공개 프로필의 가린 이름(김**)만 보인다.
-- ---------------------------------------------------------------------
create table if not exists public.bookings (
  id                 uuid primary key default gen_random_uuid(),
  slot_id            uuid references public.slots (id) on delete set null,
  route_id           uuid not null references public.routes (id),
  traveler_id        uuid not null references public.profiles (id) on delete cascade,
  jigi_id            uuid not null references public.jigi_profiles (user_id) on delete cascade,
  starts_at          timestamptz not null,
  ends_at            timestamptz not null,
  route_title        text not null,
  meeting_area       text,
  meeting_point_note text,
  traveler_name      text not null default '',
  jigi_name          text,
  party_size         integer not null check (party_size between 1 and 6),
  note               text check (char_length(note) <= 300),
  status             text not null default 'pending'
                       check (status in ('pending', 'confirmed', 'declined', 'expired', 'cancelled', 'completed')),
  confirm_mode       text not null check (confirm_mode in ('manual', 'instant')),
  respond_by         timestamptz,
  responded_at       timestamptz,
  confirmed_at       timestamptz,
  decline_reason     text check (char_length(decline_reason) <= 200),
  cancelled_at       timestamptz,
  cancelled_by       uuid references public.profiles (id) on delete set null,
  cancelled_role     text check (cancelled_role in ('traveler', 'jigi', 'admin', 'system')),
  cancel_reason      text check (char_length(cancel_reason) <= 200),
  late_cancel        boolean not null default false,
  expired_at         timestamptz,
  completed_at       timestamptz,
  list_price         integer not null check (list_price >= 0),
  discount_rate      integer not null default 0 check (discount_rate between 0 and 100),
  final_price        integer not null check (final_price >= 0 and final_price <= list_price),
  promotion_id       uuid references public.promotions (id) on delete set null,
  promotion_name     text,
  recommendation_id  uuid references public.recommendation_requests (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (ends_at > starts_at),
  check (status <> 'pending' or respond_by is not null)
);

-- 중복 예약 방지: 한 슬롯에 진행 중(대기·확정) 예약은 1건만. 동시에 눌러도 DB가 한 명만 통과시킨다.
create unique index if not exists bookings_one_active_per_slot
  on public.bookings (slot_id) where status in ('pending', 'confirmed');

create index if not exists bookings_traveler_idx on public.bookings (traveler_id, created_at desc);
create index if not exists bookings_jigi_idx on public.bookings (jigi_id, starts_at);
create index if not exists bookings_status_idx on public.bookings (status, created_at desc);
create index if not exists bookings_pending_due_idx on public.bookings (respond_by) where status = 'pending';
create index if not exists bookings_confirmed_end_idx on public.bookings (ends_at) where status = 'confirmed';

drop trigger if exists bookings_touch on public.bookings;
create trigger bookings_touch before update on public.bookings
  for each row execute function public.touch_updated_at();

alter table public.bookings enable row level security;
-- 직접 insert/update/delete 금지 → 11번 함수(request_booking 등)로만 바뀐다
revoke all on public.bookings from anon, authenticated;
grant select on public.bookings to authenticated;

-- 읽기: 그 예약의 여행자·지기, 관리자. (Realtime 구독에도 같은 정책이 적용된다)
drop policy if exists "bookings: parties or admin" on public.bookings;
create policy "bookings: parties or admin" on public.bookings
  for select to authenticated
  using (traveler_id = (select auth.uid()) or jigi_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------
-- notifications: 알림 종. 본인 것만 읽는다. 만들기·읽음 처리는 함수로만.
--   제목·내용은 받는 사람 언어로 만들어 둔다 (여행자 영어, 지기 한국어).
--   emailed_at: 서버가 메일로도 보냈는지 (RESEND_API_KEY가 있을 때만 보낸다)
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null check (char_length(type) <= 40),
  title       text not null check (char_length(title) <= 120),
  body        text not null default '' check (char_length(body) <= 400),
  link        text check (link ~ '^/[^/\\]' and char_length(link) <= 300),
  booking_id  uuid references public.bookings (id) on delete set null,
  read_at     timestamptz,
  emailed_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index if not exists notifications_booking_idx on public.notifications (booking_id, created_at);

alter table public.notifications enable row level security;
revoke all on public.notifications from anon, authenticated;
grant select on public.notifications to authenticated;

drop policy if exists "notifications: own" on public.notifications;
create policy "notifications: own" on public.notifications
  for select to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 슬롯 겹침 처리: 지기 한 명의 서로 다른 루트 슬롯은 시간이 겹칠 수 있다 (예: 14:00 3시간 루트, 15:00 2시간 루트).
-- 한 슬롯이 요청·확정(held/booked)되면, 같은 지기의 겹치는 open 슬롯은 만들지 않는다(refresh가 지운다).
-- 예약이 풀리면 refresh가 다시 만든다. (Phase 3 compute_jigi_slots에 이 조건만 더했다)
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
  ),
  candidates as (
    select distinct s.route_id, s.day, s.t0, s.dur,
           (s.day + s.t0) at time zone 'Asia/Seoul' as s_start,
           (s.day + s.t0 + make_interval(mins => s.dur)) at time zone 'Asia/Seoul' as s_end
    from starts s
  )
  select c.route_id, c.s_start, c.s_end
  from candidates c
  where public.is_approved_jigi(p_jigi)
    and c.s_start > now()
    and not exists (
      select 1 from public.availability_exceptions e
      where e.jigi_id = p_jigi and e.type = 'closed' and e.date = c.day
        and (e.start_time is null or (c.t0 < e.end_time and c.t0 + make_interval(mins => c.dur) > e.start_time))
    )
    and not exists (
      select 1 from public.slots b
      where b.jigi_id = p_jigi and b.status in ('held', 'booked')
        and b.starts_at < c.s_end and b.ends_at > c.s_start
        and not (b.route_id = c.route_id and b.starts_at = c.s_start)
    )
$$;

revoke execute on function public.compute_jigi_slots(uuid) from public, anon, authenticated;

-- 예약 기록이 있는 루트는 지울 수 없다 (기록 보존). 지우는 대신 비공개로 둔다.
create or replace function public.delete_route(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.bookings where route_id = p_id) then
    raise exception 'route has bookings' using errcode = '55000';
  end if;
  delete from public.routes
   where id = p_id and jigi_id = auth.uid() and status in ('draft', 'changes_requested');
  if not found then
    raise exception 'route cannot be deleted' using errcode = '55000';
  end if;
end;
$$;

revoke execute on function public.delete_route(uuid) from public, anon;
grant execute on function public.delete_route(uuid) to authenticated;
