-- =====================================================================
-- Phase 6-3. 채팅 함수
-- 13번, 14번 실행 후에 실행한다. 여러 번 실행해도 된다.
--
-- 메시지·읽음·신고·차단은 모두 이 함수들로만 바뀐다 (security definer). 화면에서 보는 오류 코드:
--   sign_in, conversation_not_found, account_inactive, conversation_closed, blocked, rate_limited,
--   invalid_message, invalid_reason, already_reported
-- =====================================================================

-- ---------------------------------------------------------------------
-- request_booking(): Phase 5 함수(11번 파일)와 같고, 예약을 만든 직후 대화방을 만드는 부분만 더했다.
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

  -- (Phase 6) 대화방: 예약마다 1개. 이미 있으면 그대로 쓴다. 확정 전에도 질문은 할 수 있다.
  insert into public.conversations (booking_id, traveler_id, jigi_id)
  values (v_id, me, v_slot.jigi_id)
  on conflict (booking_id) do nothing;

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
-- 도우미: 이 대화에서 나는 누구인가 ('traveler' / 'jigi' / null)
-- ---------------------------------------------------------------------
create or replace function public.chat_role(c public.conversations, p_user uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when c.traveler_id = p_user then 'traveler' when c.jigi_id = p_user then 'jigi' end
$$;

-- 둘 사이에 차단이 있는가 (어느 쪽이든)
create or replace function public.chat_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.blocks
    where (blocker_id = p_a and blocked_id = p_b) or (blocker_id = p_b and blocked_id = p_a)
  )
$$;

revoke execute on function public.chat_role(public.conversations, uuid) from public, anon, authenticated;
revoke execute on function public.chat_blocked(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- send_message(): 메시지 보내기. 당사자 확인 → 활성 회원 → 예약 상태(대화 가능?) → 차단 → 1분 제한 → 저장.
--   연락처·외부 결제 유도로 보이면(chat_safety_flags) flagged로 저장한다 (보내지는 된다).
-- 오류 코드: sign_in, conversation_not_found, account_inactive, conversation_closed, blocked, rate_limited, invalid_message
-- 돌려주는 값: 저장된 메시지 {id, conversation_id, sender_id, recipient_id, body, flagged, flag_reasons, created_at, read_at}
-- ---------------------------------------------------------------------
create or replace function public.send_message(p_conversation uuid, p_body text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c public.conversations;
  v_role text;
  v_status text;
  v_body text := btrim(coalesce(p_body, ''));
  v_set public.chat_settings;
  v_other uuid;
  m public.messages;
begin
  if me is null then
    raise exception using message = 'sign_in', errcode = '42501';
  end if;
  select * into c from public.conversations where id = p_conversation;
  v_role := public.chat_role(c, me);
  if not found or v_role is null then
    raise exception using message = 'conversation_not_found', errcode = 'P0002';
  end if;
  if not exists (select 1 from public.profiles where id = me and status = 'active') then
    raise exception using message = 'account_inactive', errcode = '42501';
  end if;
  select status into v_status from public.bookings where id = c.booking_id;
  if v_status not in ('pending', 'confirmed', 'completed') then
    raise exception using message = 'conversation_closed', errcode = 'P0001';
  end if;
  v_other := case when v_role = 'traveler' then c.jigi_id else c.traveler_id end;
  if public.chat_blocked(me, v_other) then
    raise exception using message = 'blocked', errcode = 'P0001';
  end if;
  if char_length(v_body) not between 1 and 1000 then
    raise exception using message = 'invalid_message', errcode = '22023';
  end if;
  select * into v_set from public.chat_settings where id;
  if (select count(*) from public.messages where sender_id = me and created_at > now() - interval '1 minute') >= v_set.send_per_minute then
    raise exception using message = 'rate_limited', errcode = '54000';
  end if;

  insert into public.messages (conversation_id, sender_id, recipient_id, body, flagged, flag_reasons)
  select c.id, me, v_other, v_body, cardinality(f) > 0, f
  from (select public.chat_safety_flags(v_body) as f) x
  returning * into m;

  update public.conversations
     set last_message_at = m.created_at,
         traveler_read_at = case when v_role = 'traveler' then m.created_at else traveler_read_at end,
         jigi_read_at = case when v_role = 'jigi' then m.created_at else jigi_read_at end
   where id = c.id;
  return to_jsonb(m);
end;
$$;

-- ---------------------------------------------------------------------
-- mark_read(): 이 대화에서 내가 받은 메시지를 모두 읽음으로. 읽은 개수를 돌려준다.
-- ---------------------------------------------------------------------
create or replace function public.mark_read(p_conversation uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c public.conversations;
  v_role text;
  n integer;
begin
  select * into c from public.conversations where id = p_conversation;
  v_role := public.chat_role(c, me);
  if not found or v_role is null then
    raise exception using message = 'conversation_not_found', errcode = 'P0002';
  end if;
  update public.messages set read_at = now()
   where conversation_id = c.id and recipient_id = me and read_at is null;
  get diagnostics n = row_count;
  update public.conversations
     set traveler_read_at = case when v_role = 'traveler' then now() else traveler_read_at end,
         jigi_read_at = case when v_role = 'jigi' then now() else jigi_read_at end
   where id = c.id;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- my_conversations(): 내 대화 목록 (메시지 목록 화면). 상대 표시 이름·마지막 메시지·안 읽은 수·보낼 수 있는지.
--   상대 이름: 여행자에게는 지기 이름(확정 전에는 가린 이름 김**), 지기에게는 여행자 표시 이름.
-- ---------------------------------------------------------------------
create or replace function public.my_conversations()
returns table (
  conversation_id uuid, booking_id uuid, booking_status text, route_title text, starts_at timestamptz,
  my_role text, other_name text, last_body text, last_at timestamptz, last_from_me boolean,
  unread integer, can_send boolean, blocked_by_me boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, b.id, b.status, b.route_title, b.starts_at,
         public.chat_role(c, auth.uid()),
         case when c.traveler_id = auth.uid()
              then coalesce(b.jigi_name, public.mask_name((select display_name from public.profiles where id = c.jigi_id)))
              else nullif(b.traveler_name, '') end,
         left(lm.body, 120), lm.created_at, lm.sender_id = auth.uid(),
         (select count(*)::int from public.messages u where u.conversation_id = c.id and u.recipient_id = auth.uid() and u.read_at is null),
         b.status in ('pending', 'confirmed', 'completed')
           and not public.chat_blocked(c.traveler_id, c.jigi_id),
         exists (select 1 from public.blocks k where k.blocker_id = auth.uid()
                  and k.blocked_id = case when c.traveler_id = auth.uid() then c.jigi_id else c.traveler_id end)
  from public.conversations c
  join public.bookings b on b.id = c.booking_id
  left join lateral (
    select m.body, m.created_at, m.sender_id from public.messages m
    where m.conversation_id = c.id order by m.created_at desc limit 1
  ) lm on true
  where c.traveler_id = auth.uid() or c.jigi_id = auth.uid()
  order by coalesce(c.last_message_at, c.created_at) desc
  limit 200
$$;

-- 대화 하나의 머리 정보 (대화 화면). 당사자가 아니면 빈 결과.
create or replace function public.conversation_info(p_conversation uuid)
returns table (
  conversation_id uuid, booking_id uuid, booking_status text, route_title text, starts_at timestamptz, ends_at timestamptz,
  party_size integer, meeting_area text, meeting_point_note text, my_role text, other_id uuid, other_name text,
  can_send boolean, blocked_by_me boolean, blocked_any boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, b.id, b.status, b.route_title, b.starts_at, b.ends_at, b.party_size, b.meeting_area, b.meeting_point_note,
         public.chat_role(c, auth.uid()),
         case when c.traveler_id = auth.uid() then c.jigi_id else c.traveler_id end,
         case when c.traveler_id = auth.uid()
              then coalesce(b.jigi_name, public.mask_name((select display_name from public.profiles where id = c.jigi_id)))
              else nullif(b.traveler_name, '') end,
         b.status in ('pending', 'confirmed', 'completed') and not public.chat_blocked(c.traveler_id, c.jigi_id),
         exists (select 1 from public.blocks k where k.blocker_id = auth.uid()
                  and k.blocked_id = case when c.traveler_id = auth.uid() then c.jigi_id else c.traveler_id end),
         public.chat_blocked(c.traveler_id, c.jigi_id)
  from public.conversations c
  join public.bookings b on b.id = c.booking_id
  where c.id = p_conversation and (c.traveler_id = auth.uid() or c.jigi_id = auth.uid())
$$;

-- ---------------------------------------------------------------------
-- 차단 / 차단 해제 (대화 상대 기준). 차단해도 예약은 그대로 — 필요하면 예약 화면에서 취소한다.
-- ---------------------------------------------------------------------
create or replace function public.block_conversation_user(p_conversation uuid, p_block boolean)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c public.conversations;
  v_role text;
  v_other uuid;
begin
  select * into c from public.conversations where id = p_conversation;
  v_role := public.chat_role(c, me);
  if not found or v_role is null then
    raise exception using message = 'conversation_not_found', errcode = 'P0002';
  end if;
  v_other := case when v_role = 'traveler' then c.jigi_id else c.traveler_id end;
  if coalesce(p_block, true) then
    insert into public.blocks (blocker_id, blocked_id) values (me, v_other) on conflict do nothing;
  else
    delete from public.blocks where blocker_id = me and blocked_id = v_other;
  end if;
  return coalesce(p_block, true);
end;
$$;

-- ---------------------------------------------------------------------
-- report_conversation(): 대화 신고 (당사자만). 같은 대화에 처리 대기 중인 내 신고가 있으면 already_reported.
--   관리자에게 알림을 남긴다. 신고 내용(detail)은 연락처를 지운 뒤 500자까지 (서버가 지운다).
-- ---------------------------------------------------------------------
create or replace function public.report_conversation(p_conversation uuid, p_reason text, p_detail text default null, p_message uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  c public.conversations;
  v_role text;
  v_id uuid;
  v_set public.chat_settings;
  v_admin uuid;
begin
  select * into c from public.conversations where id = p_conversation;
  v_role := public.chat_role(c, me);
  if not found or v_role is null then
    raise exception using message = 'conversation_not_found', errcode = 'P0002';
  end if;
  if p_reason not in ('harassment', 'contact_payment', 'safety', 'spam', 'other') then
    raise exception using message = 'invalid_reason', errcode = '22023';
  end if;
  if exists (select 1 from public.message_reports where conversation_id = c.id and reporter_id = me and status = 'open') then
    raise exception using message = 'already_reported', errcode = 'P0001';
  end if;
  select * into v_set from public.chat_settings where id;
  if (select count(*) from public.message_reports where reporter_id = me and created_at > now() - interval '1 day') >= v_set.reports_per_day then
    raise exception using message = 'rate_limited', errcode = '54000';
  end if;
  if p_message is not null and not exists (select 1 from public.messages where id = p_message and conversation_id = c.id) then
    p_message := null;
  end if;

  insert into public.message_reports (conversation_id, message_id, reporter_id, reported_id, reason, detail)
  values (c.id, p_message, me, case when v_role = 'traveler' then c.jigi_id else c.traveler_id end,
          p_reason, nullif(left(btrim(coalesce(p_detail, '')), 500), ''))
  returning id into v_id;

  for v_admin in select id from public.profiles where role = 'admin' and status = 'active' loop
    perform public.add_notification(v_admin, 'report_new', '새 채팅 신고가 접수됐어요',
      '처리 대기 신고를 확인해 주세요.', '/admin/reports?id=' || v_id, null);
  end loop;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------
-- 관리자: 신고된 대화 열람 (신고 건만). 부를 때마다 audit_log 'report.view_conversation' 기록.
-- ---------------------------------------------------------------------
create or replace function public.admin_view_report_conversation(p_report uuid)
returns table (id uuid, sender_role text, body text, flagged boolean, flag_reasons text[], created_at timestamptz, read_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  r public.message_reports;
  c public.conversations;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select * into r from public.message_reports where message_reports.id = p_report;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  select * into c from public.conversations where conversations.id = r.conversation_id;
  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'report.view_conversation', 'message_reports', p_report::text,
          jsonb_build_object('conversation_id', r.conversation_id, 'available', c.id is not null));
  if c.id is null then
    return;
  end if;
  return query
    select m.id, case when m.sender_id = c.traveler_id then 'traveler' else 'jigi' end, m.body, m.flagged, m.flag_reasons, m.created_at, m.read_at
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at;
end;
$$;

-- 관리자: 신고 처리. dismiss(문제없음) / warn(경고 알림) / suspend(신고된 회원 정지). audit_log 기록, 신고자에게 처리 알림.
create or replace function public.admin_resolve_report(p_report uuid, p_action text, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.message_reports;
  v_status text;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
  v_target public.profiles;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select * into r from public.message_reports where id = p_report for update;
  if not found then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  if r.status <> 'open' then
    raise exception 'report already handled' using errcode = '55000';
  end if;
  v_status := case p_action when 'dismiss' then 'dismissed' when 'warn' then 'warned' when 'suspend' then 'suspended' end;
  if v_status is null then
    raise exception 'invalid action' using errcode = '22023';
  end if;
  select * into v_target from public.profiles where id = r.reported_id;

  if p_action = 'suspend' then
    if v_target.id is null then
      raise exception 'reported user not found' using errcode = 'P0002';
    end if;
    perform public.admin_set_user_status(v_target.id, 'suspended', coalesce(v_note, '채팅 신고 처리'));
  elsif p_action = 'warn' and v_target.id is not null then
    perform public.add_notification(v_target.id, 'report_warning',
      case when v_target.role = 'jigi' then '운영팀 안내: 채팅 이용 경고' else 'A note from YEONON about your chat' end,
      case when v_target.role = 'jigi'
        then '신고가 접수되어 확인했어요. 연락처 공유·앱 밖 결제 유도·불쾌한 표현은 이용 제한 사유예요. 다시 확인되면 이용이 정지될 수 있어요.'
        else 'We reviewed a report about your chat. Sharing contact details, asking for payment outside YEONON or offensive messages can lead to suspension.' end,
      null, null);
  end if;

  update public.message_reports
     set status = v_status, handled_by = auth.uid(), handled_at = now(), handle_note = v_note
   where id = r.id;

  if r.reporter_id is not null then
    perform public.add_notification(r.reporter_id, 'report_handled',
      case when (select role from public.profiles where id = r.reporter_id) = 'jigi' then '신고를 확인했어요' else 'We reviewed your report' end,
      case when (select role from public.profiles where id = r.reporter_id) = 'jigi'
        then '알려 주셔서 고마워요. 운영팀이 확인하고 필요한 조치를 했어요.'
        else 'Thanks for letting us know. Our team reviewed it and took action where needed.' end,
      null, null);
  end if;

  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'report.resolve', 'message_reports', r.id::text,
          jsonb_build_object('action', p_action, 'reported_id', r.reported_id, 'reason', r.reason, 'note', v_note));
end;
$$;

-- ---------------------------------------------------------------------
-- 번역 사용량: 이번 호출을 기록하고 허용되면 true (최근 1시간 p_limit회까지). 서버(/api/chat/translate)가 부른다.
-- ---------------------------------------------------------------------
create or replace function public.use_translation_quota(p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    return false;
  end if;
  if (select count(*) from public.translation_requests where user_id = me and created_at > now() - interval '1 hour')
     >= least(greatest(coalesce(p_limit, 30), 1), 200) then
    return false;
  end if;
  insert into public.translation_requests (user_id) values (me);
  return true;
end;
$$;

-- ---------------------------------------------------------------------
-- 안 읽은 메시지 메일 (서버 /api/cron/chat-unread-mail 이 서비스 키로 부른다 — 화면에서는 부를 수 없다)
--   받은 메시지를 unread_mail_minutes(기본 10분) 넘게 안 읽었고, 마지막 메일 뒤로 한 번도 안 읽었으면 → 후보.
--   그래서 대화당 '안 읽은 묶음'마다 메일은 1회다 (읽고 나서 다시 쌓이면 다시 1회).
-- ---------------------------------------------------------------------
create or replace function public.chat_unread_mail_candidates()
returns table (conversation_id uuid, recipient_id uuid, recipient_role text, email text, unread integer, route_title text, other_name text)
language sql
stable
security definer
set search_path = ''
as $$
  with s as (select unread_mail_minutes from public.chat_settings where id),
  sides as (
    select c.id, c.booking_id, 'traveler' as role, c.traveler_id as uid, c.traveler_read_at as read_at, c.traveler_mailed_at as mailed_at from public.conversations c
    union all
    select c.id, c.booking_id, 'jigi', c.jigi_id, c.jigi_read_at, c.jigi_mailed_at from public.conversations c
  )
  select x.id, x.uid, x.role, p.email,
         (select count(*)::int from public.messages m where m.conversation_id = x.id and m.recipient_id = x.uid and m.read_at is null),
         b.route_title,
         case when x.role = 'traveler' then coalesce(b.jigi_name, public.mask_name(jp.display_name)) else nullif(b.traveler_name, '') end
  from sides x
  cross join s
  join public.profiles p on p.id = x.uid and p.status = 'active' and p.email is not null
  join public.bookings b on b.id = x.booking_id
  left join public.profiles jp on jp.id = b.jigi_id
  where exists (
          select 1 from public.messages m
          where m.conversation_id = x.id and m.recipient_id = x.uid and m.read_at is null
            and m.created_at <= now() - make_interval(mins => s.unread_mail_minutes)
            and (x.mailed_at is null or m.created_at > x.mailed_at)
        )
    and (x.mailed_at is null or (x.read_at is not null and x.read_at > x.mailed_at))
  limit 200
$$;

create or replace function public.chat_mark_unread_mailed(p_conversation uuid, p_recipient uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.conversations
     set traveler_mailed_at = case when traveler_id = p_recipient then now() else traveler_mailed_at end,
         jigi_mailed_at = case when jigi_id = p_recipient then now() else jigi_mailed_at end
   where id = p_conversation;
$$;

-- ---------------------------------------------------------------------
-- 보관 기간이 지난 대화 지우기 (pg_cron 하루 한 번 — 16번 파일).
--   만남 완료·취소·거절·만료 후 chat_settings.retention_months(기본 6개월)가 지난 대화와 메시지를 지운다.
--   처리 대기 중인 신고가 있는 대화는 남긴다. 지운 대화 수를 돌려준다.
-- ---------------------------------------------------------------------
create or replace function public.purge_old_conversations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.conversations c
   using public.bookings b, public.chat_settings s
   where b.id = c.booking_id and s.id
     and b.status in ('completed', 'cancelled', 'declined', 'expired')
     and coalesce(b.completed_at, b.cancelled_at, b.expired_at, b.responded_at, b.updated_at)
         < now() - make_interval(months => s.retention_months)
     and not exists (select 1 from public.message_reports r where r.conversation_id = c.id and r.status = 'open');
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ---------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------
revoke execute on function public.send_message(uuid, text) from public, anon;
revoke execute on function public.mark_read(uuid) from public, anon;
revoke execute on function public.my_conversations() from public, anon;
revoke execute on function public.conversation_info(uuid) from public, anon;
revoke execute on function public.block_conversation_user(uuid, boolean) from public, anon;
revoke execute on function public.report_conversation(uuid, text, text, uuid) from public, anon;
revoke execute on function public.admin_view_report_conversation(uuid) from public, anon;
revoke execute on function public.admin_resolve_report(uuid, text, text) from public, anon;
revoke execute on function public.use_translation_quota(integer) from public, anon;
revoke execute on function public.chat_unread_mail_candidates() from public, anon, authenticated;
revoke execute on function public.chat_mark_unread_mailed(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.purge_old_conversations() from public, anon, authenticated;

grant execute on function public.send_message(uuid, text) to authenticated;
grant execute on function public.mark_read(uuid) to authenticated;
grant execute on function public.my_conversations() to authenticated;
grant execute on function public.conversation_info(uuid) to authenticated;
grant execute on function public.block_conversation_user(uuid, boolean) to authenticated;
grant execute on function public.report_conversation(uuid, text, text, uuid) to authenticated;
grant execute on function public.admin_view_report_conversation(uuid) to authenticated;
grant execute on function public.admin_resolve_report(uuid, text, text) to authenticated;
grant execute on function public.use_translation_quota(integer) to authenticated;
-- 안 읽은 메시지 메일: 서버의 서비스 키(service_role)만
grant execute on function public.chat_unread_mail_candidates() to service_role;
grant execute on function public.chat_mark_unread_mailed(uuid, uuid) to service_role;
