-- =====================================================================
-- 22. 역할 바꾸기 — 여행자 ↔ 지기 (관리자 회원 화면 /admin/users)
-- 21번까지 실행한 뒤 실행한다. 여러 번 실행해도 된다. 표·칸은 바꾸지 않고 함수 하나만 추가한다.
--
-- 가입할 때 역할을 잘못 고른 회원이 메일로 문의하면, 관리자가 확인한 뒤 바꿔 준다 (본인이 직접 바꾸는 기능은 없다).
--   조건 : 활성 관리자만. 본인·관리자 계정은 안 된다. 대상은 가입(온보딩)을 마친 활성 여행자/지기.
--          진행 중(대기·확정) 예약이 있으면 안 된다 (여행자로서든 지기로서든).
--          30일에 한 번만 (마지막 역할 변경 기록에서 30일이 지나야 한다).
--   지기 → 여행자 : 지기 공개 프로필을 숨기고(is_active = false), 공개·검수 중 루트는 비공개(hidden)로,
--                   앞으로 열린 시간은 기존 규칙(refresh_jigi_slots)이 지운다. 지기 신청서·루트 내용은 지우지 않는다.
--   여행자 → 지기 : 예전에 승인된 지기였다면 공개 프로필을 다시 켠다 (루트는 비공개 그대로 — 다시 검수 요청).
--                   처음이면 지기 신청서(/partner/apply)부터.
--   기록 : audit_log 'user.set_role' (from·to 역할, 사유), 회원에게 알림 한 건.
-- =====================================================================

create or replace function public.admin_set_role(p_user uuid, p_role text, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles;
  v_last timestamptz;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 300), '');
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot change your own role' using errcode = '42501';
  end if;
  if p_role not in ('traveler', 'jigi') then
    raise exception 'invalid role' using errcode = '22023';
  end if;
  if v_reason is null then
    raise exception 'reason required' using errcode = '22023';
  end if;

  select * into target from public.profiles where id = p_user for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if target.role = 'admin' then
    raise exception 'cannot change an admin' using errcode = '42501';
  end if;
  if target.role is null or target.terms_agreed_at is null then
    raise exception 'not onboarded' using errcode = '22023';
  end if;
  if target.status <> 'active' then
    raise exception 'user not active' using errcode = '22023';
  end if;
  if target.role = p_role then
    raise exception 'same role' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.bookings b
     where (b.traveler_id = p_user or b.jigi_id = p_user) and b.status in ('pending', 'confirmed')
  ) then
    raise exception 'has active bookings' using errcode = '22023';
  end if;

  select max(l.created_at) into v_last
    from public.audit_log l
   where l.action = 'user.set_role' and l.target_id = p_user::text;
  if v_last is not null and v_last > now() - interval '30 days' then
    raise exception 'changed recently: %', to_char((v_last + interval '30 days') at time zone 'Asia/Seoul', 'YYYY-MM-DD')
      using errcode = '22023';
  end if;

  -- 역할을 먼저 바꾼다 (열린 시간 계산 refresh_jigi_slots가 '활성 지기'인지를 역할로 본다)
  update public.profiles
     set role = p_role,
         locale = case when p_role = 'jigi' then 'ko' else 'en' end
   where id = p_user;

  if p_role = 'traveler' then
    -- 지기 활동을 멈춘다 (내용은 남겨 둔다). 앞으로 열린 시간은 기존 규칙(refresh_jigi_slots)이 지운다
    update public.jigi_profiles set is_active = false where user_id = p_user;
    update public.routes set status = 'hidden' where jigi_id = p_user and status in ('published', 'in_review');
    perform public.refresh_jigi_slots(p_user);
  else
    -- 예전에 승인된 지기였다면 공개 프로필을 다시 켠다 (루트는 비공개 그대로라 열린 시간은 다시 공개할 때 생긴다)
    update public.jigi_profiles j set is_active = true
     where j.user_id = p_user
       and exists (select 1 from public.jigi_applications a where a.user_id = p_user and a.status = 'approved');
    perform public.refresh_jigi_slots(p_user);
  end if;

  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'user.set_role', 'profiles', p_user::text,
          jsonb_build_object('from', target.role, 'to', p_role, 'reason', v_reason));

  perform public.add_notification(
    p_user, 'account_role',
    case when p_role = 'jigi' then '지기 계정으로 바뀌었어요' else 'Your account is now a traveler account' end,
    case when p_role = 'jigi' then '요청하신 대로 역할을 바꿨어요. 지기 탭에서 이어서 진행해 주세요.'
         else 'We changed your role as you asked. Browse routes on the Travelers tab.' end,
    case when p_role = 'jigi' then '/partner' else '/me' end,  -- 링크는 '/' 하나만은 안 된다 (notifications.link 규칙)
    null
  );
  return p_role;
end;
$$;

revoke execute on function public.admin_set_role(uuid, text, text) from public, anon;
grant execute on function public.admin_set_role(uuid, text, text) to authenticated;
