-- =====================================================================
-- Phase 3-4. 슬롯 4주 창을 매일 앞으로 미는 예약 작업 (pg_cron)
-- 6번 실행 후에 실행한다. 여러 번 실행해도 된다.
-- 먼저 Supabase Dashboard → Database → Extensions 에서 pg_cron 을 켠다.
-- 이 작업이 없어도 루트 공개·가능 시간 저장 때마다 슬롯이 다시 만들어지지만,
-- 아무것도 바꾸지 않으면 4주 창이 줄어들기만 하므로 매일 한 번 돌린다.
-- =====================================================================

create extension if not exists pg_cron;

select cron.unschedule(jobid) from cron.job where jobname = 'yeonon-refresh-slots';

-- 매일 00:05 (한국 시간) = 15:05 UTC
select cron.schedule('yeonon-refresh-slots', '5 15 * * *', 'select public.refresh_all_slots()');
