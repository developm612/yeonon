-- =====================================================================
-- 21. 관리자 권한 주기·거두기 (관리자 회원 화면 /admin/users)
-- 20번까지 실행한 뒤 실행한다. 여러 번 실행해도 된다. 표·칸은 바꾸지 않고 함수 하나만 추가한다.
-- ※ 23번에서 이 함수를 지웠다 (관리자 지정·해제는 SQL Editor에서 — README '관리자 지정·해제').
--
--   주기   : 활성 관리자가, 활성 상태인 '여행자' 또는 '온보딩 전' 회원에게만.
--            지기는 안 된다 (루트·가능 시간·예약이 끊긴다). 진행 중(대기·확정) 예약이 있는 여행자도 안 된다.
--   거두기 : 이 함수로 권한을 받은 관리자만, 받기 전 역할(여행자 / 온보딩 전)로 되돌린다.
--            SQL로 직접 지정한 처음 관리자(예: 운영 대표 계정)는 화면에서 거둘 수 없다. 본인 권한도 거둘 수 없다.
--   기록   : audit_log 'user.set_admin' (from·to 역할, 사유)
-- =====================================================================

create or replace function public.admin_set_admin(p_user uuid, p_grant boolean, p_reason text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles;
  v_from text;
  v_to text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot change your own role' using errcode = '42501';
  end if;

  select * into target from public.profiles where id = p_user for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;

  if p_grant then
    if target.role = 'admin' then
      raise exception 'already admin' using errcode = '22023';
    end if;
    if target.status <> 'active' then
      raise exception 'user not active' using errcode = '22023';
    end if;
    if target.role = 'jigi' then
      raise exception 'jigi cannot be admin' using errcode = '22023';
    end if;
    if exists (select 1 from public.bookings b where b.traveler_id = p_user and b.status in ('pending', 'confirmed')) then
      raise exception 'has active bookings' using errcode = '22023';
    end if;
    v_from := target.role;
    v_to := 'admin';
  else
    if target.role is distinct from 'admin' then
      raise exception 'not admin' using errcode = '22023';
    end if;
    -- 이 함수로 받은 권한만 거둘 수 있다. 받기 전 역할은 마지막 '주기' 기록에서 읽는다
    select l.detail ->> 'from' into v_to
      from public.audit_log l
     where l.action = 'user.set_admin' and l.target_id = p_user::text and l.detail ->> 'to' = 'admin'
     order by l.created_at desc, l.id desc
     limit 1;
    if not found then
      raise exception 'original admin' using errcode = '42501';
    end if;
    v_from := 'admin';
  end if;

  update public.profiles set role = v_to where id = p_user;

  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'user.set_admin', 'profiles', p_user::text,
          jsonb_build_object('from', v_from, 'to', v_to, 'reason', nullif(left(btrim(coalesce(p_reason, '')), 300), '')));
  return v_to;
end;
$$;

revoke execute on function public.admin_set_admin(uuid, boolean, text) from public, anon;
grant execute on function public.admin_set_admin(uuid, boolean, text) to authenticated;
