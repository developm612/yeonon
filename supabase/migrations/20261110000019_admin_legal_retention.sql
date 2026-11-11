-- =====================================================================
-- Phase 7-3. 관리자 대시보드 지표 · CSV 내보내기 기록 · 약관/방침 동의 버전(재동의) · 보관 기간 자동 삭제
-- 18번 실행 후에 실행한다. 여러 번 실행해도 된다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 약관·개인정보처리방침 동의 버전
--   동의한 문서의 시행일(예: '2026-11-11')을 남긴다. 사이트의 현재 버전은 src/config/legal.ts (LEGAL.termsVersion·privacyVersion).
--   버전이 다르면(문서를 개정하면) 로그인한 회원에게 /account/consent에서 다시 동의를 받는다 (src/middleware.ts).
--   이 칸이 생기기 전에 가입한 회원은 null → 다음 접속 때 한 번 다시 동의한다.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists terms_version text check (terms_version ~ '^\d{4}-\d{2}-\d{2}$');
alter table public.profiles add column if not exists privacy_version text check (privacy_version ~ '^\d{4}-\d{2}-\d{2}$');

-- complete_onboarding(): Phase 2 함수에 동의 버전 두 칸만 더했다. 예전 6칸짜리는 지우고, 새 두 칸은 기본값 null이라
-- 이 SQL을 먼저 실행하고 새 코드를 배포하기 전까지도 예전 화면의 온보딩이 그대로 동작한다.
drop function if exists public.complete_onboarding(text, text, boolean, boolean, boolean, boolean);
create or replace function public.complete_onboarding(
  p_role text,
  p_display_name text,
  p_terms boolean,
  p_privacy boolean,
  p_adult boolean,
  p_marketing boolean default false,
  p_terms_version text default null,
  p_privacy_version text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  v_name text := btrim(coalesce(p_display_name, ''));
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if me.status <> 'active' then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if me.terms_agreed_at is not null then
    raise exception 'already onboarded' using errcode = '23505';
  end if;
  if p_role not in ('traveler', 'jigi') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if not (coalesce(p_terms, false) and coalesce(p_privacy, false) and coalesce(p_adult, false)) then
    raise exception 'required consent missing' using errcode = '22023';
  end if;
  if char_length(v_name) not between 1 and 40 then
    raise exception 'invalid display name' using errcode = '22023';
  end if;
  -- 버전이 없으면(예전 화면) null로 남고, 다음 접속 때 /account/consent에서 다시 동의를 받는다
  if p_terms_version !~ '^\d{4}-\d{2}-\d{2}$' or p_privacy_version !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid consent version' using errcode = '22023';
  end if;

  update public.profiles
     set role = case when me.role = 'admin' then 'admin' else p_role end,
         display_name = v_name,
         locale = case when p_role = 'jigi' then 'ko' else 'en' end,
         marketing_opt_in = coalesce(p_marketing, false),
         terms_agreed_at = now(),
         privacy_agreed_at = now(),
         adult_confirmed_at = now(),
         terms_version = p_terms_version,
         privacy_version = p_privacy_version
   where id = me.id;
end;
$$;

-- accept_legal_update(): 개정된 약관·방침에 다시 동의 (온보딩을 마친 회원). 마케팅 수신은 이때 다시 고를 수 있다.
create or replace function public.accept_legal_update(p_terms_version text, p_privacy_version text, p_marketing boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid() for update;
  if not found or me.status <> 'active' then
    raise exception 'account is not active' using errcode = '42501';
  end if;
  if me.terms_agreed_at is null then
    raise exception 'not onboarded' using errcode = '22023';
  end if;
  if coalesce(p_terms_version, '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(p_privacy_version, '') !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid consent version' using errcode = '22023';
  end if;
  update public.profiles
     set terms_version = p_terms_version, privacy_version = p_privacy_version,
         terms_agreed_at = now(), privacy_agreed_at = now(),
         marketing_opt_in = coalesce(p_marketing, marketing_opt_in)
   where id = me.id;
end;
$$;

revoke execute on function public.complete_onboarding(text, text, boolean, boolean, boolean, boolean, text, text) from public, anon;
revoke execute on function public.accept_legal_update(text, text, boolean) from public, anon;
grant execute on function public.complete_onboarding(text, text, boolean, boolean, boolean, boolean, text, text) to authenticated;
grant execute on function public.accept_legal_update(text, text, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 2) 관리자 대시보드 지표 (/admin). p_days = 0이면 오늘(한국 날짜), 아니면 최근 p_days일.
--   수락률·평균 응답 시간: 그 기간 '수락 후 확정' 요청 기준 (admin_booking_stats와 같은 정의)
--   추천 → 요청 전환율: 그 기간 추천 중 요청까지 이어진(booked) 비율
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats(p_days integer default 7)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today timestamptz := ((now() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul';
  v_days integer := greatest(least(coalesce(p_days, 7), 365), 0);
  v_since timestamptz;
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  v_since := case when v_days = 0 then v_today else now() - make_interval(days => v_days) end;

  select jsonb_build_object(
    'days', v_days,
    'signups_today', (select count(*) from public.profiles where created_at >= v_today),
    'signups_7d', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
    'members', (select jsonb_build_object(
        'total', count(*),
        'traveler', count(*) filter (where role = 'traveler'),
        'jigi', count(*) filter (where role = 'jigi'),
        'jigi_approved', (select count(*) from public.jigi_profiles where is_active),
        'admin', count(*) filter (where role = 'admin'),
        'not_onboarded', count(*) filter (where role is null),
        'suspended', count(*) filter (where status = 'suspended'),
        'early_member', count(*) filter (where early_member))
      from public.profiles),
    'published_routes', (select count(*) from public.routes where status = 'published'),
    'bookings', (select jsonb_build_object(
        'requested', count(*) filter (where created_at >= v_since),
        'confirmed', count(*) filter (where confirmed_at >= v_since),
        'completed', count(*) filter (where completed_at >= v_since),
        'expired', count(*) filter (where expired_at >= v_since),
        'cancelled', count(*) filter (where cancelled_at >= v_since),
        'declined', count(*) filter (where status = 'declined' and responded_at >= v_since),
        'late_cancels', count(*) filter (where late_cancel and cancelled_at >= v_since),
        'pending_now', count(*) filter (where status = 'pending'),
        'accepted_manual', count(*) filter (where confirm_mode = 'manual' and confirmed_at is not null and responded_at >= v_since),
        'declined_manual', count(*) filter (where confirm_mode = 'manual' and status = 'declined' and responded_at >= v_since),
        'expired_manual', count(*) filter (where confirm_mode = 'manual' and expired_at >= v_since),
        'avg_response_minutes', round(avg(extract(epoch from (responded_at - created_at)) / 60)
                                  filter (where confirm_mode = 'manual' and responded_at >= v_since)))
      from public.bookings),
    'open_reports', (select count(*) from public.message_reports where status = 'open'),
    'open_safety_reviews', (select count(*) from public.reviews where safety_issue and safety_status = 'open'),
    'reviews', (select jsonb_build_object('count', count(*) filter (where created_at >= v_since),
                                          'avg_rating', round(avg(rating) filter (where created_at >= v_since), 2))
                from public.reviews where author_role = 'traveler'),
    'recommendations', (select jsonb_build_object('total', count(*), 'booked', count(*) filter (where booked),
                                                  'clicked', count(*) filter (where clicked_route_id is not null))
                        from public.recommendation_requests where created_at >= v_since),
    'waitlist', (select jsonb_build_object('total', count(*), 'invited', count(*) filter (where invite_sent_at is not null),
                                           'joined', count(*) filter (where joined_user_id is not null))
                 from public.waitlist_imports)
  ) into v;
  return v;
end;
$$;

revoke execute on function public.admin_dashboard_stats(integer) from public, anon;
grant execute on function public.admin_dashboard_stats(integer) to authenticated;

-- ---------------------------------------------------------------------
-- 3) CSV 내보내기 기록. 서버(/api/admin/export)가 파일을 만들기 전에 부르고, 기록이 실패하면 내보내지 않는다.
--   detail: 목록 이름, 민감 항목 포함 여부, 행 수, 필터 조건 (개인정보는 넣지 않는다)
-- ---------------------------------------------------------------------
create or replace function public.admin_log_export(p_list text, p_sensitive boolean, p_rows integer, p_filters jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if coalesce(p_list, '') !~ '^[a-z_]{2,40}$' then
    raise exception 'invalid list' using errcode = '22023';
  end if;
  insert into public.audit_log (actor_id, action, target_table, detail)
  values (auth.uid(), 'export.csv', p_list,
          jsonb_build_object('sensitive', coalesce(p_sensitive, false), 'rows', greatest(coalesce(p_rows, 0), 0),
                             'filters', case when jsonb_typeof(p_filters) = 'object' then p_filters else '{}'::jsonb end));
end;
$$;

revoke execute on function public.admin_log_export(text, boolean, integer, jsonb) from public, anon;
grant execute on function public.admin_log_export(text, boolean, integer, jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 4) 보관 기간 (개인정보처리방침의 보관 기간 표와 같은 값이어야 한다 — 바꾸면 /privacy도 같이 고친다)
--   채팅 보관 기간은 chat_settings.retention_months (Phase 6, 기본 6개월)에 따로 있다.
--   예) 관리 기록을 5년으로: update public.data_retention set audit_log_months = 60;
-- ---------------------------------------------------------------------
create table if not exists public.data_retention (
  id                       boolean primary key default true check (id),
  audit_log_months         integer not null default 36 check (audit_log_months between 1 and 120),          -- 관리 기록
  resolved_report_months   integer not null default 36 check (resolved_report_months between 1 and 120),    -- 처리 끝난 신고 기록
  recommendation_months    integer not null default 12 check (recommendation_months between 1 and 120),     -- AI 추천 기록
  notification_months      integer not null default 12 check (notification_months between 1 and 120),       -- 사이트 알림
  waitlist_months          integer not null default 12 check (waitlist_months between 1 and 120),           -- 가져온 대기자 명단
  translation_log_days     integer not null default 2  check (translation_log_days between 1 and 365),      -- 번역 사용 횟수 기록
  updated_at               timestamptz not null default now()
);

insert into public.data_retention (id) values (true) on conflict (id) do nothing;

alter table public.data_retention enable row level security;
revoke all on public.data_retention from anon, authenticated;
grant select on public.data_retention to authenticated;

drop policy if exists "data_retention: admin read" on public.data_retention;
create policy "data_retention: admin read" on public.data_retention
  for select to authenticated
  using ((select public.is_admin()));

-- purge_expired_records(): 보관 기간이 지난 기록 삭제 (pg_cron 하루 한 번). 지운 건수를 돌려준다.
create or replace function public.purge_expired_records()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.data_retention;
  n_audit integer;
  n_reports integer;
  n_recs integer;
  n_notes integer;
  n_wait integer;
  n_tr integer;
begin
  select * into s from public.data_retention where id;
  delete from public.audit_log where created_at < now() - make_interval(months => s.audit_log_months);
  get diagnostics n_audit = row_count;
  delete from public.message_reports
   where status <> 'open' and coalesce(handled_at, created_at) < now() - make_interval(months => s.resolved_report_months);
  get diagnostics n_reports = row_count;
  delete from public.recommendation_requests where created_at < now() - make_interval(months => s.recommendation_months);
  get diagnostics n_recs = row_count;
  delete from public.notifications where created_at < now() - make_interval(months => s.notification_months);
  get diagnostics n_notes = row_count;
  delete from public.waitlist_imports where imported_at < now() - make_interval(months => s.waitlist_months);
  get diagnostics n_wait = row_count;
  delete from public.translation_requests where created_at < now() - make_interval(days => s.translation_log_days);
  get diagnostics n_tr = row_count;
  return jsonb_build_object('audit_log', n_audit, 'message_reports', n_reports, 'recommendation_requests', n_recs,
                            'notifications', n_notes, 'waitlist_imports', n_wait, 'translation_requests', n_tr);
end;
$$;

revoke execute on function public.purge_expired_records() from public, anon, authenticated;

-- 매일 한국 시간 새벽 4시 30분
select cron.unschedule(jobid) from cron.job where jobname = 'yeonon-purge-expired-records';
select cron.schedule('yeonon-purge-expired-records', '30 19 * * *', 'select public.purge_expired_records()');
