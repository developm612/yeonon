-- =====================================================================
-- Phase 2-1. 회원 프로필 · 관리자 확인 · 가입 트리거 · 관리 기록
-- 실행: Supabase Dashboard → SQL Editor에 파일 전체를 붙여넣고 Run (1번 → 2번 → 3번 순서)
-- 여러 번 실행해도 되도록 if not exists / or replace / drop if exists 로 작성했다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- profiles: auth.users 1명당 1행. 가입하면 트리거가 자동으로 만든다.
-- role 이 null 이면 아직 온보딩(역할 선택·동의) 전이다.
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  role                text check (role in ('traveler', 'jigi', 'admin')),
  display_name        text not null default '' check (char_length(display_name) <= 40),
  email               text,
  avatar_url          text,
  locale              text not null default 'en' check (locale in ('en', 'ko')),
  nationality         text check (char_length(nationality) <= 60),
  languages           text[] not null default '{}' check (cardinality(languages) <= 10),
  interests           text[] not null default '{}' check (cardinality(interests) <= 5),
  early_member        boolean not null default false,
  early_member_until  timestamptz,
  marketing_opt_in    boolean not null default false,
  terms_agreed_at     timestamptz,
  privacy_agreed_at   timestamptz,
  adult_confirmed_at  timestamptz,
  status              text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role);
create index if not exists profiles_created_at_idx on public.profiles (created_at desc);

alter table public.profiles enable row level security;

-- ---------------------------------------------------------------------
-- is_admin(): 지금 로그인한 사람이 활성 관리자인지. 관리자 권한은 profiles.role = 'admin' 으로만 부여한다.
-- security definer: RLS 정책 안에서 profiles 를 다시 읽을 때 정책이 무한 반복되지 않게 한다.
-- ---------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- updated_at 자동 갱신 (다른 테이블도 같이 쓴다)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- 권한: 본인 행만 읽고, 본인이 바꿔도 되는 칸만 수정. 역할·상태·동의 시각은 아래 함수로만 바뀐다.
-- 행 추가는 가입 트리거, 삭제는 탈퇴 함수(delete_my_account)만 한다.
-- ---------------------------------------------------------------------
revoke all on public.profiles from anon;
revoke insert, update, delete on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, locale, nationality, languages, interests, marketing_opt_in) on public.profiles to authenticated;

drop policy if exists "profiles: read own or admin" on public.profiles;
create policy "profiles: read own or admin" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "profiles: update own" on public.profiles;
create policy "profiles: update own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) and status = 'active')
  with check (id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 가입 트리거: auth.users 에 새 사용자가 생기면 profiles 행을 만든다 (Google 이름·사진 사용)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), ''), 40),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 이미 가입한 사용자(Phase 1 테스트 계정 등)에게도 profiles 행을 만든다
insert into public.profiles (id, email, display_name, avatar_url)
select
  u.id,
  u.email,
  left(coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', split_part(u.email, '@', 1), ''), 40),
  coalesce(u.raw_user_meta_data ->> 'avatar_url', u.raw_user_meta_data ->> 'picture')
from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- audit_log: 관리자 행동·탈퇴 기록. 관리자만 읽고, 쓰기는 security definer 함수만 한다.
-- ---------------------------------------------------------------------
create table if not exists public.audit_log (
  id            bigint generated always as identity primary key,
  actor_id      uuid references public.profiles (id) on delete set null,
  action        text not null,
  target_table  text,
  target_id     text,
  detail        jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;

drop policy if exists "audit_log: admin read" on public.audit_log;
create policy "audit_log: admin read" on public.audit_log
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- admin_notes: 회원별 관리자 메모. profiles 에 두면 본인도 읽을 수 있어 따로 둔다 (관리자만 읽기)
-- ---------------------------------------------------------------------
create table if not exists public.admin_notes (
  user_id     uuid primary key references public.profiles (id) on delete cascade,
  memo        text not null default '' check (char_length(memo) <= 1000),
  updated_by  uuid references public.profiles (id) on delete set null,
  updated_at  timestamptz not null default now()
);

alter table public.admin_notes enable row level security;
revoke all on public.admin_notes from anon, authenticated;
grant select on public.admin_notes to authenticated;

drop policy if exists "admin_notes: admin read" on public.admin_notes;
create policy "admin_notes: admin read" on public.admin_notes
  for select to authenticated
  using ((select public.is_admin()));
