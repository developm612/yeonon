-- =====================================================================
-- 추천 테스트용 샘플 데이터 한 번에 지우기 (recommend_sample.sql 로 만든 것)
-- 샘플 계정(is_sample)을 지우면 프로필 → 지기 프로필 → 루트 → 정류장·슬롯, 가능 시간이 함께 지워진다.
-- 추천 기록(recommendation_requests)은 남는다 — 클릭한 루트 칸만 비워진다.
-- (Phase 5) 샘플 루트에 들어온 예약(bookings)도 함께 지워진다. 여행자의 알림은 남고 예약 링크만 비워진다.
-- =====================================================================

begin;

delete from auth.users where id in (select id from public.profiles where is_sample);
-- 혹시 계정과 떨어져 남은 샘플 행이 있으면
delete from public.routes where is_sample;
delete from public.jigi_profiles where is_sample;

commit;

select
  (select count(*) from public.profiles where is_sample) as sample_profiles,
  (select count(*) from public.routes where is_sample) as sample_routes;
