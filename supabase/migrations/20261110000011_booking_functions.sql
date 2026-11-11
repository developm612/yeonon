-- =====================================================================
-- Phase 5-2. 예약 함수 (계획서 2-4, 6장 핵심 DB 함수)
-- 10번 실행 후에 실행한다. 여러 번 실행해도 된다.
--
-- 모든 예약 변경은 이 함수들로만 한다 (security definer, 함수 하나 = 트랜잭션 하나).
-- 실패하면 알아보기 쉬운 오류 코드를 메시지로 돌려준다 (서버 /api/bookings/* 가 화면 문구로 바꾼다):
--   sign_in, travelers_only, invalid_party_size, slot_not_found, slot_taken, too_soon, route_unavailable,
--   party_too_large, too_many_pending, too_many_requests, time_conflict, booking_not_found, jigi_inactive, not_pending,
--   respond_expired, reason_required, not_cancellable
--
-- 동시 요청: 같은 지기의 예약 변경은 jigi_profiles 행 잠금으로 한 줄로 세운다 (잠금 순서: 지기 → 슬롯 → 예약).
--   같은 슬롯을 두 사람이 동시에 요청하면 먼저 잠근 사람만 성공하고, 다른 사람은 slot_taken을 받는다.
--   그래도 뚫리는 경우를 대비해 bookings_one_active_per_slot 유니크 인덱스가 한 번 더 막는다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 도우미 (화면에서 직접 부르지 않음)
-- ---------------------------------------------------------------------

-- 알림 문구용 한국 시간 표시: en → "Sat, Nov 15 · 14:00", ko → "11/15(토) 14:00"
create or replace function public.kst_label(p_ts timestamptz, p_lang text)
returns text
language sql
stable
set search_path = ''
as $$
  select case when p_lang = 'ko'
    then to_char(p_ts at time zone 'Asia/Seoul', 'FMMM/FMDD')
         || '(' || (array['일', '월', '화', '수', '목', '금', '토'])[extract(dow from p_ts at time zone 'Asia/Seoul')::int + 1] || ') '
         || to_char(p_ts at time zone 'Asia/Seoul', 'HH24:MI')
    else to_char(p_ts at time zone 'Asia/Seoul', 'Dy, Mon FMDD · HH24:MI')
  end
$$;

create or replace function public.add_notification(
  p_user uuid, p_type text, p_title text, p_body text, p_link text, p_booking uuid
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, title, body, link, booking_id)
  values (p_user, p_type, left(p_title, 120), left(coalesce(p_body, ''), 400), p_link, p_booking);
$$;

-- 이 여행자에게 지금 적용할 수 있는 프로모션인가
create or replace function public.promotion_applies(p public.promotions, p_traveler uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p.is_active
     and (p.starts_at is null or p.starts_at <= now())
     and (p.ends_at is null or p.ends_at > now())
     and (p.max_uses is null or p.used_count < p.max_uses)
     and (p.eligible = 'all' or (p.eligible = 'early_member' and exists (
           select 1 from public.profiles u
           where u.id = p_traveler and u.early_member and (u.early_member_until is null or u.early_member_until > now()))))
$$;

-- 예약이 끝나(거절·만료·취소) 슬롯을 풀 때: 시작 전이면 다시 open, 지났으면 closed.
-- 그다음 refresh가 겹쳐서 내려 두었던 다른 루트의 슬롯을 다시 만들고, 이제 맞지 않는 슬롯은 정리한다.
create or replace function public.release_booking_slot(p_slot uuid, p_jigi uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_slot is not null then
    update public.slots
       set status = case when starts_at > now() then 'open' else 'closed' end
     where id = p_slot and status in ('held', 'booked');
  end if;
  perform public.refresh_jigi_slots(p_jigi);
end;
$$;

-- 취소 공통 처리 (cancel_booking, 회원 탈퇴가 쓴다). 권한 확인은 부르는 쪽이 한다. 예약 행을 이미 잠근 상태여야 한다.
create or replace function public.booking_cancel_core(p_id uuid, p_actor uuid, p_role text, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  s public.booking_settings;
  v_late boolean;
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
begin
  select * into s from public.booking_settings where id;
  select * into b from public.bookings where id = p_id;
  v_late := b.starts_at - now() <= make_interval(mins => s.late_cancel_minutes);

  update public.bookings
     set status = 'cancelled', cancelled_at = now(), cancelled_by = p_actor, cancelled_role = p_role,
         cancel_reason = v_reason, late_cancel = v_late
   where id = p_id;

  perform public.release_booking_slot(b.slot_id, b.jigi_id);
  if b.promotion_id is not null then
    update public.promotions set used_count = greatest(used_count - 1, 0) where id = b.promotion_id;
  end if;

  -- 취소한 사람이 아닌 쪽에 알린다 (관리자·시스템 취소는 양쪽 모두)
  if p_role <> 'traveler' then
    perform public.add_notification(b.traveler_id, 'booking_cancelled',
      case when p_role = 'jigi' then 'Your jigi cancelled this meetup' else 'Your booking was cancelled' end,
      format('%s · %s KST. Sorry about that — see other routes that fit your plans.', b.route_title, public.kst_label(b.starts_at, 'en')),
      '/app/bookings/' || b.id, b.id);
  end if;
  if p_role <> 'jigi' then
    perform public.add_notification(b.jigi_id, 'booking_cancelled',
      case when p_role = 'traveler' then '여행자가 예약을 취소했어요' else '예약이 취소됐어요' end,
      format('%s · %s · %s명%s', b.route_title, public.kst_label(b.starts_at, 'ko'), b.party_size,
             case when p_role = 'admin' then ' (운영팀 취소)' when p_role = 'system' then ' (상대방 탈퇴)' else '' end),
      '/partner/bookings/' || b.id, b.id);
  end if;
end;
$$;

revoke execute on function public.kst_label(timestamptz, text) from public, anon, authenticated;
revoke execute on function public.add_notification(uuid, text, text, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.promotion_applies(public.promotions, uuid) from public, anon, authenticated;
revoke execute on function public.release_booking_slot(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.booking_cancel_core(uuid, uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- booking_quote(): 루트 상세에 보여 줄 가격. 지금 로그인한 사람 기준으로 적용될 할인.
--   예) list_price 45000, discount_rate 100, final_price 0, promotion_name 'Early member'
-- 프로모션 표 자체는 관리자만 읽으므로, 적용 결과만 이 함수로 알려 준다.
-- ---------------------------------------------------------------------
create or replace function public.booking_quote(p_route uuid)
returns table (list_price integer, discount_rate integer, final_price integer, promotion_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_price integer;
  v_promo public.promotions;
  v_rate integer;
begin
  select r.list_price into v_price from public.routes r where r.id = p_route and r.status = 'published';
  if v_price is null then
    return;
  end if;
  select p.* into v_promo from public.promotions p
   where public.promotion_applies(p, auth.uid())
   order by p.discount_rate desc, p.created_at
   limit 1;
  v_rate := coalesce(v_promo.discount_rate, (select default_discount_rate from public.booking_settings where id));
  return query select v_price, v_rate, v_price * (100 - v_rate) / 100, v_promo.name;
end;
$$;

-- ---------------------------------------------------------------------
-- request_booking(): 매칭 요청 (계획서 2-4).
--   로그인 여행자 확인 → 슬롯 open 확인·잠금 → 예약 생성 → 확정 방식(즉시 확정이면 confirmed, 아니면 pending + 응답 기한)
--   → 슬롯 상태 변경(held/booked) → 할인 적용(가격 스냅샷) → 추천 기록에 '요청까지 이어짐' 표시 → 양쪽 알림
-- 돌려주는 값: {"id": 예약 id, "status": "pending"|"confirmed", "respond_by": 기한}
-- ---------------------------------------------------------------------
create or replace function public.request_booking(
  p_slot uuid,
  p_party_size integer,
  p_note text default null,
  p_recommendation uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_me public.profiles;
  v_set public.booking_settings;
  v_slot public.slots;
  v_jigi public.jigi_profiles;
  v_route public.routes;
  v_promo public.promotions;
  v_rec uuid;
  v_rate integer;
  v_status text;
  v_respond_by timestamptz;
  v_jigi_name text;
  v_id uuid;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 300), '');
begin
  if me is null then
    raise exception using message = 'sign_in', errcode = '42501';
  end if;
  -- 같은 여행자의 동시 요청도 한 줄로 세운다 (대기 요청 3건 제한이 동시에 뚫리지 않게)
  select * into v_me from public.profiles where id = me for update;
  if not found or v_me.status <> 'active' or v_me.role is distinct from 'traveler' or v_me.terms_agreed_at is null then
    raise exception using message = 'travelers_only', errcode = '42501';
  end if;
  if p_party_size is null or p_party_size not between 1 and 6 then
    raise exception using message = 'invalid_party_size', errcode = '22023';
  end if;
  -- 요청·취소를 반복해 슬롯을 흔드는 것을 막는 안전 상한
  if (select count(*) from public.bookings where traveler_id = me and created_at > now() - interval '1 hour') >= 20 then
    raise exception using message = 'too_many_requests', errcode = '54000';
  end if;
  select * into v_set from public.booking_settings where id;

  select * into v_slot from public.slots where id = p_slot;
  if not found then
    raise exception using message = 'slot_not_found', errcode = 'P0002';
  end if;
  -- 잠금: 지기 → 슬롯. 같은 지기의 다른(겹치는) 루트 슬롯을 동시에 요청해도 한 명만 통과한다.
  select * into v_jigi from public.jigi_profiles where user_id = v_slot.jigi_id for update;
  select * into v_slot from public.slots where id = p_slot for update;
  if not found or v_slot.status <> 'open' then
    raise exception using message = 'slot_taken', errcode = 'P0001';
  end if;
  if v_slot.starts_at <= now() + make_interval(mins => v_set.min_lead_minutes) then
    raise exception using message = 'too_soon', errcode = 'P0001';
  end if;

  select * into v_route from public.routes where id = v_slot.route_id;
  if v_route.status <> 'published' or not public.is_approved_jigi(v_slot.jigi_id) then
    raise exception using message = 'route_unavailable', errcode = 'P0001';
  end if;
  if p_party_size > v_route.max_party_size then
    raise exception using message = 'party_too_large', errcode = '22023';
  end if;
  if (select count(*) from public.bookings where traveler_id = me and status = 'pending') >= v_set.max_pending_per_traveler then
    raise exception using message = 'too_many_pending', errcode = '54000';
  end if;
  if exists (
    select 1 from public.bookings
    where traveler_id = me and status in ('pending', 'confirmed')
      and starts_at < v_slot.ends_at and ends_at > v_slot.starts_at
  ) then
    raise exception using message = 'time_conflict', errcode = 'P0001';
  end if;
  -- 같은 지기의 겹치는 시간이 이미 요청·확정됐으면 (refresh 전에 남아 있던 슬롯)
  if exists (
    select 1 from public.slots b
    where b.jigi_id = v_slot.jigi_id and b.id <> v_slot.id and b.status in ('held', 'booked')
      and b.starts_at < v_slot.ends_at and b.ends_at > v_slot.starts_at
  ) then
    raise exception using message = 'slot_taken', errcode = 'P0001';
  end if;

  -- 할인: 맞는 프로모션 중 할인율이 가장 큰 것 (한도가 동시에 넘지 않게 잠근다)
  select p.* into v_promo from public.promotions p
   where public.promotion_applies(p, me)
   order by p.discount_rate desc, p.created_at
   limit 1
   for update;
  v_rate := coalesce(v_promo.discount_rate, v_set.default_discount_rate);

  -- 본인 추천 기록일 때만 연결
  if p_recommendation is not null then
    select id into v_rec from public.recommendation_requests where id = p_recommendation and traveler_id = me;
  end if;

  if v_jigi.confirm_mode = 'instant' then
    v_status := 'confirmed';
    select display_name into v_jigi_name from public.profiles where id = v_slot.jigi_id;
  else
    v_status := 'pending';
    v_respond_by := least(
      now() + make_interval(mins => case
        when v_slot.starts_at - now() <= make_interval(mins => v_set.urgent_window_minutes) then v_set.urgent_respond_minutes
        else v_set.respond_minutes end),
      v_slot.starts_at);
  end if;

  begin
    insert into public.bookings (
      slot_id, route_id, traveler_id, jigi_id, starts_at, ends_at, route_title, meeting_area, meeting_point_note, traveler_name, jigi_name,
      party_size, note, status, confirm_mode, respond_by, confirmed_at,
      list_price, discount_rate, final_price, promotion_id, promotion_name, recommendation_id
    )
    values (
      v_slot.id, v_route.id, me, v_slot.jigi_id, v_slot.starts_at, v_slot.ends_at, v_route.title, v_route.area, v_route.meeting_point_note,
      v_me.display_name, v_jigi_name,
      p_party_size, v_note, v_status, v_jigi.confirm_mode, v_respond_by, case when v_status = 'confirmed' then now() end,
      v_route.list_price, v_rate, v_route.list_price * (100 - v_rate) / 100, v_promo.id, v_promo.name, v_rec
    )
    returning id into v_id;
  exception when unique_violation then
    raise exception using message = 'slot_taken', errcode = 'P0001';
  end;

  update public.slots set status = case when v_status = 'confirmed' then 'booked' else 'held' end where id = v_slot.id;
  if v_promo.id is not null then
    update public.promotions set used_count = used_count + 1 where id = v_promo.id;
  end if;
  if v_rec is not null then
    update public.recommendation_requests set booked = true where id = v_rec;
  end if;
  -- 겹치는 다른 루트의 open 슬롯을 내린다
  perform public.refresh_jigi_slots(v_slot.jigi_id);

  if v_status = 'confirmed' then
    perform public.add_notification(me, 'booking_confirmed', 'You''re matched!',
      format('%s · %s KST. See your meetup details.', v_route.title, public.kst_label(v_slot.starts_at, 'en')),
      '/app/bookings/' || v_id, v_id);
    perform public.add_notification(v_slot.jigi_id, 'booking_confirmed', '새 만남이 확정됐어요 (즉시 확정)',
      format('%s · %s · %s명', v_route.title, public.kst_label(v_slot.starts_at, 'ko'), p_party_size),
      '/partner/bookings/' || v_id, v_id);
  else
    perform public.add_notification(me, 'booking_requested', 'Request sent',
      format('%s · %s KST. Your jigi will reply by %s KST.', v_route.title,
             public.kst_label(v_slot.starts_at, 'en'), public.kst_label(v_respond_by, 'en')),
      '/app/bookings/' || v_id, v_id);
    perform public.add_notification(v_slot.jigi_id, 'booking_request', '새 매칭 요청이 왔어요',
      format('%s · %s · %s명 — %s까지 수락 또는 거절해 주세요.', v_route.title,
             public.kst_label(v_slot.starts_at, 'ko'), p_party_size, public.kst_label(v_respond_by, 'ko')),
      '/partner/bookings/' || v_id, v_id);
  end if;

  return jsonb_build_object('id', v_id, 'status', v_status, 'respond_by', v_respond_by);
end;
$$;

-- ---------------------------------------------------------------------
-- respond_booking(): 지기의 수락/거절. 그 예약의 지기만, 응답 기한 안에만.
--   수락 → confirmed (슬롯 booked) / 거절(사유 필수) → declined (슬롯 다시 open)
-- ---------------------------------------------------------------------
create or replace function public.respond_booking(p_id uuid, p_accept boolean, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  b public.bookings;
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
begin
  if me is null then
    raise exception using message = 'sign_in', errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_id;
  if not found or b.jigi_id <> me then
    raise exception using message = 'booking_not_found', errcode = 'P0002';
  end if;
  if not public.is_approved_jigi(me) then
    raise exception using message = 'jigi_inactive', errcode = '42501';
  end if;
  perform 1 from public.jigi_profiles where user_id = b.jigi_id for update;
  select * into b from public.bookings where id = p_id for update;
  if b.status <> 'pending' then
    raise exception using message = 'not_pending', errcode = 'P0001';
  end if;
  if b.respond_by <= now() then
    raise exception using message = 'respond_expired', errcode = 'P0001';
  end if;

  if coalesce(p_accept, false) then
    update public.bookings
       set status = 'confirmed', responded_at = now(), confirmed_at = now(),
           jigi_name = (select display_name from public.profiles where id = me)
     where id = p_id;
    update public.slots set status = 'booked' where id = b.slot_id;
    perform public.add_notification(b.traveler_id, 'booking_confirmed', 'You''re matched!',
      format('%s · %s KST. Your jigi accepted — see your meetup details.', b.route_title, public.kst_label(b.starts_at, 'en')),
      '/app/bookings/' || b.id, b.id);
    return jsonb_build_object('id', b.id, 'status', 'confirmed');
  end if;

  if v_reason = '' then
    raise exception using message = 'reason_required', errcode = '22023';
  end if;
  update public.bookings set status = 'declined', responded_at = now(), decline_reason = v_reason where id = p_id;
  perform public.release_booking_slot(b.slot_id, b.jigi_id);
  if b.promotion_id is not null then
    update public.promotions set used_count = greatest(used_count - 1, 0) where id = b.promotion_id;
  end if;
  perform public.add_notification(b.traveler_id, 'booking_declined', 'Your jigi couldn''t take this request',
    format('%s · %s KST. See other routes that fit your plans.', b.route_title, public.kst_label(b.starts_at, 'en')),
    '/app/bookings/' || b.id, b.id);
  return jsonb_build_object('id', b.id, 'status', 'declined');
end;
$$;

-- ---------------------------------------------------------------------
-- cancel_booking(): 취소. 그 예약의 여행자·지기만 (관리자는 강제 취소 — 사유 필수, audit_log에 기록).
--   대기·확정 상태만. 시작 전이면 슬롯을 다시 연다. 시작 24시간(설정값) 이내 취소는 late_cancel로 기록한다.
-- ---------------------------------------------------------------------
create or replace function public.cancel_booking(p_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  b public.bookings;
  v_role text;
  v_reason text := left(btrim(coalesce(p_reason, '')), 200);
begin
  if me is null then
    raise exception using message = 'sign_in', errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_id;
  if not found then
    raise exception using message = 'booking_not_found', errcode = 'P0002';
  end if;
  v_role := case when b.traveler_id = me then 'traveler' when b.jigi_id = me then 'jigi'
                 when public.is_admin() then 'admin' end;
  if v_role is null then
    raise exception using message = 'booking_not_found', errcode = 'P0002';
  end if;
  if v_reason = '' then
    raise exception using message = 'reason_required', errcode = '22023';
  end if;

  perform 1 from public.jigi_profiles where user_id = b.jigi_id for update;
  select * into b from public.bookings where id = p_id for update;
  if b.status not in ('pending', 'confirmed') then
    raise exception using message = 'not_cancellable', errcode = 'P0001';
  end if;

  perform public.booking_cancel_core(p_id, me, v_role, v_reason);

  if v_role = 'admin' then
    insert into public.audit_log (actor_id, action, target_table, target_id, detail)
    values (me, 'booking.force_cancel', 'bookings', p_id::text,
            jsonb_build_object('from', b.status, 'reason', v_reason, 'starts_at', b.starts_at));
  end if;
  return jsonb_build_object('id', p_id, 'status', 'cancelled');
end;
$$;

-- ---------------------------------------------------------------------
-- 예약 작업 (pg_cron으로 5분마다 — 12번 파일)
-- expire_pending_bookings(): 응답 기한이 지난 대기 요청 → expired, 슬롯 해제, 여행자에게 '다른 루트 보기' 알림
-- complete_past_bookings(): 끝난 시각이 지난 확정 예약 → completed, 양쪽에 후기 요청 알림 (후기 기능은 Phase 7)
-- 둘 다 처리한 건수를 돌려준다.
-- ---------------------------------------------------------------------
create or replace function public.expire_pending_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v record;
  b public.bookings;
  n integer := 0;
begin
  for v in
    select id, jigi_id from public.bookings
    where status = 'pending' and respond_by <= now()
    order by respond_by
    limit 500
  loop
    perform 1 from public.jigi_profiles where user_id = v.jigi_id for update;
    update public.bookings set status = 'expired', expired_at = now()
     where id = v.id and status = 'pending' and respond_by <= now()
    returning * into b;
    if not found then
      continue;
    end if;
    perform public.release_booking_slot(b.slot_id, b.jigi_id);
    if b.promotion_id is not null then
      update public.promotions set used_count = greatest(used_count - 1, 0) where id = b.promotion_id;
    end if;
    perform public.add_notification(b.traveler_id, 'booking_expired', 'No reply in time — see other routes',
      format('%s · %s KST. Your jigi didn''t reply before the deadline, so the time is free again.',
             b.route_title, public.kst_label(b.starts_at, 'en')),
      '/app/bookings/' || b.id, b.id);
    perform public.add_notification(b.jigi_id, 'booking_expired', '응답 기한이 지나 요청이 만료됐어요',
      format('%s · %s · %s명', b.route_title, public.kst_label(b.starts_at, 'ko'), b.party_size),
      '/partner/bookings/' || b.id, b.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

create or replace function public.complete_past_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  n integer := 0;
begin
  for b in
    update public.bookings set status = 'completed', completed_at = now()
     where id in (select id from public.bookings where status = 'confirmed' and ends_at <= now() order by ends_at limit 500)
       and status = 'confirmed'
    returning *
  loop
    perform public.add_notification(b.traveler_id, 'review_request', 'How was your walk?',
      format('%s with your jigi. Reviews open soon — we''ll let you know.', b.route_title),
      '/app/bookings/' || b.id, b.id);
    perform public.add_notification(b.jigi_id, 'review_request', '만남은 어떠셨나요?',
      format('%s · %s · %s명 만남이 끝났어요. 후기 기능은 곧 열려요.', b.route_title, public.kst_label(b.starts_at, 'ko'), b.party_size),
      '/partner/bookings/' || b.id, b.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- 관리자 확인용: 크론을 기다리지 않고 바로 실행 (/admin/bookings [지금 처리])
create or replace function public.admin_run_booking_jobs()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return jsonb_build_object('expired', public.expire_pending_bookings(), 'completed', public.complete_past_bookings());
end;
$$;

-- ---------------------------------------------------------------------
-- 알림 읽음 처리: p_ids가 null이면 내 안 읽은 알림 전부
-- ---------------------------------------------------------------------
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.notifications set read_at = now()
   where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- 관리자: 프로모션 저장 (p_id = null이면 새로 만든다), 예약 규칙 저장, 예약 지표
-- ---------------------------------------------------------------------
create or replace function public.admin_save_promotion(
  p_id uuid, p_name text, p_discount_rate integer, p_eligible text,
  p_starts_at timestamptz, p_ends_at timestamptz, p_max_uses integer, p_is_active boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  prev public.promotions;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_id is null then
    insert into public.promotions (name, discount_rate, eligible, starts_at, ends_at, max_uses, is_active)
    values (btrim(p_name), p_discount_rate, p_eligible, p_starts_at, p_ends_at, p_max_uses, coalesce(p_is_active, false))
    returning id into v_id;
  else
    select * into prev from public.promotions where id = p_id for update;
    if not found then
      raise exception 'promotion not found' using errcode = 'P0002';
    end if;
    update public.promotions
       set name = btrim(p_name), discount_rate = p_discount_rate, eligible = p_eligible, starts_at = p_starts_at,
           ends_at = p_ends_at, max_uses = p_max_uses, is_active = coalesce(p_is_active, false)
     where id = p_id;
    v_id := p_id;
  end if;
  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'promotion.save', 'promotions', v_id::text,
          jsonb_build_object('name', btrim(p_name), 'discount_rate', p_discount_rate, 'eligible', p_eligible,
                             'starts_at', p_starts_at, 'ends_at', p_ends_at, 'max_uses', p_max_uses,
                             'is_active', coalesce(p_is_active, false), 'was_active', prev.is_active));
  return v_id;
end;
$$;

create or replace function public.admin_save_booking_settings(
  p_respond_minutes integer, p_urgent_window_minutes integer, p_urgent_respond_minutes integer,
  p_max_pending integer, p_min_lead_minutes integer, p_late_cancel_minutes integer, p_default_discount_rate integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  update public.booking_settings
     set respond_minutes = p_respond_minutes, urgent_window_minutes = p_urgent_window_minutes,
         urgent_respond_minutes = p_urgent_respond_minutes, max_pending_per_traveler = p_max_pending,
         min_lead_minutes = p_min_lead_minutes, late_cancel_minutes = p_late_cancel_minutes,
         default_discount_rate = p_default_discount_rate, updated_by = auth.uid(), updated_at = now()
   where id;
  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'booking_settings.save', 'booking_settings', 'true',
          jsonb_build_object('respond_minutes', p_respond_minutes, 'urgent_window_minutes', p_urgent_window_minutes,
                             'urgent_respond_minutes', p_urgent_respond_minutes, 'max_pending', p_max_pending,
                             'min_lead_minutes', p_min_lead_minutes, 'late_cancel_minutes', p_late_cancel_minutes,
                             'default_discount_rate', p_default_discount_rate));
end;
$$;

-- 대시보드 지표. '오늘'은 한국 날짜. 평균 응답 시간·수락률은 최근 p_days일의 '수락 후 확정' 요청 기준:
--   평균 응답 시간 = 요청 → 수락/거절까지 걸린 시간 평균 (분)
--   수락률 = 수락 / (수락 + 거절 + 기한 만료)
create or replace function public.admin_booking_stats(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_today timestamptz := ((now() at time zone 'Asia/Seoul')::date)::timestamp at time zone 'Asia/Seoul';
  v_since timestamptz := now() - make_interval(days => greatest(least(coalesce(p_days, 30), 365), 1));
  v jsonb;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select jsonb_build_object(
    'today_requests',  count(*) filter (where created_at >= v_today),
    'today_confirmed', count(*) filter (where confirmed_at >= v_today),
    'today_expired',   count(*) filter (where expired_at >= v_today),
    'today_declined',  count(*) filter (where status = 'declined' and responded_at >= v_today),
    'today_cancelled', count(*) filter (where cancelled_at >= v_today),
    'pending_now',     count(*) filter (where status = 'pending'),
    'upcoming_confirmed', count(*) filter (where status = 'confirmed' and starts_at > now()),
    'late_cancels',    count(*) filter (where late_cancel and cancelled_at >= v_since),
    'avg_response_minutes', round(avg(extract(epoch from (responded_at - created_at)) / 60)
                              filter (where confirm_mode = 'manual' and responded_at >= v_since)),
    'accepted',  count(*) filter (where confirm_mode = 'manual' and confirmed_at is not null and responded_at >= v_since),
    'declined',  count(*) filter (where confirm_mode = 'manual' and status = 'declined' and responded_at >= v_since),
    'expired',   count(*) filter (where expired_at >= v_since),
    'days', greatest(least(coalesce(p_days, 30), 365), 1)
  ) into v
  from public.bookings;
  return v;
end;
$$;

-- ---------------------------------------------------------------------
-- 회원 탈퇴: 진행 중인 예약을 먼저 취소하고(상대방에게 알림, 슬롯 해제) 탈퇴한다.
-- (Phase 2 delete_my_account에 이 처리만 더했다)
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
  v record;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if me.role = 'admin' then
    raise exception 'admins cannot delete their account here' using errcode = '42501';
  end if;

  for v in
    select id, jigi_id from public.bookings
    where (traveler_id = me.id or jigi_id = me.id) and status in ('pending', 'confirmed')
  loop
    perform 1 from public.jigi_profiles where user_id = v.jigi_id for update;
    perform 1 from public.bookings where id = v.id for update;
    perform public.booking_cancel_core(v.id, null, 'system', 'account deleted');
  end loop;

  insert into public.audit_log (actor_id, action, target_table, detail)
  values (null, 'account.deleted', 'profiles', jsonb_build_object('role', me.role));

  delete from auth.users where id = me.id;
end;
$$;

-- ---------------------------------------------------------------------
-- 권한: 화면(로그인 회원)이 부를 수 있는 것만 열고, 크론 작업은 막는다
-- ---------------------------------------------------------------------
revoke execute on function public.booking_quote(uuid) from public, anon;
revoke execute on function public.request_booking(uuid, integer, text, uuid) from public, anon;
revoke execute on function public.respond_booking(uuid, boolean, text) from public, anon;
revoke execute on function public.cancel_booking(uuid, text) from public, anon;
revoke execute on function public.expire_pending_bookings() from public, anon, authenticated;
revoke execute on function public.complete_past_bookings() from public, anon, authenticated;
revoke execute on function public.admin_run_booking_jobs() from public, anon;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
revoke execute on function public.admin_save_promotion(uuid, text, integer, text, timestamptz, timestamptz, integer, boolean) from public, anon;
revoke execute on function public.admin_save_booking_settings(integer, integer, integer, integer, integer, integer, integer) from public, anon;
revoke execute on function public.admin_booking_stats(integer) from public, anon;
revoke execute on function public.delete_my_account() from public, anon;

grant execute on function public.booking_quote(uuid) to authenticated;
grant execute on function public.request_booking(uuid, integer, text, uuid) to authenticated;
grant execute on function public.respond_booking(uuid, boolean, text) to authenticated;
grant execute on function public.cancel_booking(uuid, text) to authenticated;
grant execute on function public.admin_run_booking_jobs() to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;
grant execute on function public.admin_save_promotion(uuid, text, integer, text, timestamptz, timestamptz, integer, boolean) to authenticated;
grant execute on function public.admin_save_booking_settings(integer, integer, integer, integer, integer, integer, integer) to authenticated;
grant execute on function public.admin_booking_stats(integer) to authenticated;
grant execute on function public.delete_my_account() to authenticated;
