-- =====================================================================
-- Phase 2-3. 온보딩 · 관리자 회원 관리 · 회원 탈퇴
-- 1번, 2번 실행 후에 실행한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- complete_onboarding(): 역할 선택 + 필수 동의 + 만 18세 확인. 한 번만 할 수 있다 (역할은 나중에 직접 못 바꿈).
-- 관리자 역할은 여기서 고를 수 없다 (SQL로만 부여).
-- ---------------------------------------------------------------------
create or replace function public.complete_onboarding(
  p_role text,
  p_display_name text,
  p_terms boolean,
  p_privacy boolean,
  p_adult boolean,
  p_marketing boolean default false
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

  update public.profiles
     set role = case when me.role = 'admin' then 'admin' else p_role end,
         display_name = v_name,
         locale = case when p_role = 'jigi' then 'ko' else 'en' end,
         marketing_opt_in = coalesce(p_marketing, false),
         terms_agreed_at = now(),
         privacy_agreed_at = now(),
         adult_confirmed_at = now()
   where id = me.id;
end;
$$;

revoke execute on function public.complete_onboarding(text, text, boolean, boolean, boolean, boolean) from public, anon;
grant execute on function public.complete_onboarding(text, text, boolean, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- admin_set_user_status(): 회원 정지/해제. 자기 자신과 다른 관리자는 바꿀 수 없다.
-- ---------------------------------------------------------------------
create or replace function public.admin_set_user_status(p_user uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target public.profiles;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_status not in ('active', 'suspended') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_user = auth.uid() then
    raise exception 'cannot change your own status' using errcode = '42501';
  end if;

  select * into target from public.profiles where id = p_user for update;
  if not found then
    raise exception 'user not found' using errcode = 'P0002';
  end if;
  if target.role = 'admin' then
    raise exception 'cannot change another admin' using errcode = '42501';
  end if;

  update public.profiles set status = p_status where id = p_user;
  -- 정지된 지기는 공개 프로필도 숨긴다 (해제하면 승인된 지기만 다시 보인다)
  update public.jigi_profiles jp
     set is_active = (p_status = 'active' and exists (
       select 1 from public.jigi_applications a where a.user_id = jp.user_id and a.status = 'approved'))
   where jp.user_id = p_user;

  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'user.set_status', 'profiles', p_user::text,
          jsonb_build_object('from', target.status, 'to', p_status, 'reason', nullif(left(btrim(coalesce(p_reason, '')), 300), '')));
end;
$$;

revoke execute on function public.admin_set_user_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_user_status(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- admin_set_user_memo(): 회원별 관리자 메모 저장
-- ---------------------------------------------------------------------
create or replace function public.admin_set_user_memo(p_user uuid, p_memo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  insert into public.admin_notes (user_id, memo, updated_by, updated_at)
  values (p_user, left(btrim(coalesce(p_memo, '')), 1000), auth.uid(), now())
  on conflict (user_id) do update
    set memo = excluded.memo, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  insert into public.audit_log (actor_id, action, target_table, target_id)
  values (auth.uid(), 'user.set_memo', 'profiles', p_user::text);
end;
$$;

revoke execute on function public.admin_set_user_memo(uuid, text) from public, anon;
grant execute on function public.admin_set_user_memo(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- delete_my_account(): 회원 탈퇴. auth.users 를 지우면 profiles·지기 신청·지기 프로필·메모가 함께 지워진다.
-- 기록에는 개인정보 없이 역할만 남긴다. 관리자는 먼저 SQL로 역할을 바꾼 뒤 탈퇴한다 (실수 방지).
-- ---------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  if not found then
    raise exception 'profile not found' using errcode = 'P0002';
  end if;
  if me.role = 'admin' then
    raise exception 'admins cannot delete their account here' using errcode = '42501';
  end if;

  insert into public.audit_log (actor_id, action, target_table, detail)
  values (null, 'account.deleted', 'profiles', jsonb_build_object('role', me.role));

  delete from auth.users where id = me.id;
end;
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
