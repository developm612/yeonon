-- =====================================================================
-- Phase 5-3. 예약 작업(pg_cron 5분마다) · 실시간(Realtime) 전달
-- 11번 실행 후에 실행한다. 여러 번 실행해도 된다.
-- pg_cron은 7번 파일에서 켰다 (Dashboard → Database → Extensions → pg_cron).
-- =====================================================================

-- 5분마다: 응답 기한 지난 요청 만료 → 끝난 만남 완료 처리
select cron.unschedule(jobid) from cron.job where jobname in ('yeonon-expire-bookings', 'yeonon-complete-bookings');
select cron.schedule('yeonon-expire-bookings', '*/5 * * * *', 'select public.expire_pending_bookings()');
select cron.schedule('yeonon-complete-bookings', '*/5 * * * *', 'select public.complete_past_bookings()');

-- ---------------------------------------------------------------------
-- Realtime: bookings·notifications 변경을 브라우저로 바로 보낸다 (postgres_changes 구독).
-- Realtime도 각 구독자의 로그인 토큰으로 위 RLS(select 정책)를 확인한 뒤에만 보내므로,
-- 내 예약·내 알림이 아닌 변경은 받지 못한다. (확인 방법: README Phase 5 '실시간 RLS 확인')
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings') then
    alter publication supabase_realtime add table public.bookings;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;
