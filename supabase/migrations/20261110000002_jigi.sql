-- =====================================================================
-- Phase 2-2. 지기 신청 · 지기 프로필 · 신청 심사
-- 1번(profiles) 실행 후에 실행한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- jigi_applications: 지기 신청서. 1인 1건. 이름·이메일은 profiles 에서, 연락처는 여기에만 둔다.
-- 휴대폰 번호는 본인과 관리자만 볼 수 있다 (여행자에게는 절대 노출하지 않음).
-- ---------------------------------------------------------------------
create table if not exists public.jigi_applications (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null unique default auth.uid() references public.profiles (id) on delete cascade,
  name               text not null check (char_length(name) between 2 and 30),
  phone              text not null check (phone ~ '^01[016789]-[0-9]{3,4}-[0-9]{4}$'),
  age_group          text not null check (char_length(age_group) <= 20),
  seongsu_relation   text not null check (char_length(seongsu_relation) <= 40),
  languages          text[] not null check (cardinality(languages) between 1 and 10),
  availability_note  text not null check (char_length(availability_note) <= 100),
  intro              text not null check (char_length(intro) between 20 and 300),
  instagram          text check (instagram ~ '^@[a-z0-9._]{1,30}$'),
  taste              text[] not null default '{}' check (cardinality(taste) <= 5),
  sample_course      text check (char_length(sample_course) <= 300),
  heard_from         text not null check (char_length(heard_from) <= 40),
  referred_by        text check (char_length(referred_by) <= 60),
  status             text not null default 'submitted'
                       check (status in ('submitted', 'interview', 'approved', 'on_hold', 'rejected')),
  id_verified        boolean not null default false,
  reviewed_by        uuid references public.profiles (id) on delete set null,
  reviewed_at        timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists jigi_applications_status_idx on public.jigi_applications (status, created_at desc);

drop trigger if exists jigi_applications_touch on public.jigi_applications;
create trigger jigi_applications_touch before update on public.jigi_applications
  for each row execute function public.touch_updated_at();

alter table public.jigi_applications enable row level security;

-- 신청자는 내용 칸만 넣을 수 있다. 상태·신원 확인·심사 칸은 기본값으로 시작하고 심사 함수만 바꾼다.
revoke all on public.jigi_applications from anon;
revoke insert, update, delete on public.jigi_applications from authenticated;
grant select on public.jigi_applications to authenticated;
grant insert (user_id, name, phone, age_group, seongsu_relation, languages, availability_note, intro,
              instagram, taste, sample_course, heard_from, referred_by)
  on public.jigi_applications to authenticated;

drop policy if exists "jigi_applications: read own or admin" on public.jigi_applications;
create policy "jigi_applications: read own or admin" on public.jigi_applications
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_admin()));

-- 온보딩에서 '지기'를 고른 활성 회원만 본인 명의로 신청할 수 있다
drop policy if exists "jigi_applications: jigi applies for self" on public.jigi_applications;
create policy "jigi_applications: jigi applies for self" on public.jigi_applications
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.role = 'jigi' and p.status = 'active' and p.terms_agreed_at is not null
    )
  );

-- ---------------------------------------------------------------------
-- jigi_application_notes: 심사 메모 (계획서의 review_memo).
-- 신청자는 자기 신청서 행을 읽을 수 있으므로 메모는 따로 두고 관리자만 읽는다.
-- ---------------------------------------------------------------------
create table if not exists public.jigi_application_notes (
  application_id  uuid primary key references public.jigi_applications (id) on delete cascade,
  memo            text not null default '' check (char_length(memo) <= 1000),
  updated_by      uuid references public.profiles (id) on delete set null,
  updated_at      timestamptz not null default now()
);

alter table public.jigi_application_notes enable row level security;
revoke all on public.jigi_application_notes from anon, authenticated;
grant select on public.jigi_application_notes to authenticated;

drop policy if exists "jigi_application_notes: admin read" on public.jigi_application_notes;
create policy "jigi_application_notes: admin read" on public.jigi_application_notes
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- jigi_profiles: 승인된 지기의 공개 프로필. 승인할 때 심사 함수가 만든다.
-- 공개 정보만 둔다 (연락처 없음). 활성 프로필은 누구나 읽을 수 있다 (Phase 3 루트 화면에서 사용).
-- ---------------------------------------------------------------------
create table if not exists public.jigi_profiles (
  user_id               uuid primary key references public.profiles (id) on delete cascade,
  headline              text check (char_length(headline) <= 60),
  bio                   text check (char_length(bio) <= 500),
  avatar_style          text check (char_length(avatar_style) <= 40),
  languages             text[] not null default '{}' check (cardinality(languages) <= 10),
  confirm_mode          text not null default 'manual' check (confirm_mode in ('manual', 'instant')),
  rating_avg            numeric(3, 2),
  rating_count          integer not null default 0,
  accept_rate           numeric(5, 2),
  avg_response_minutes  integer,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

drop trigger if exists jigi_profiles_touch on public.jigi_profiles;
create trigger jigi_profiles_touch before update on public.jigi_profiles
  for each row execute function public.touch_updated_at();

alter table public.jigi_profiles enable row level security;

-- 지기는 소개·언어·확정 방식만 바꿀 수 있다. 평점·수락률 같은 지표와 활성 여부는 시스템·관리자 몫.
revoke insert, update, delete on public.jigi_profiles from anon, authenticated;
grant select on public.jigi_profiles to anon, authenticated;
grant update (headline, bio, avatar_style, languages, confirm_mode) on public.jigi_profiles to authenticated;

-- 비회원은 활성 프로필만. (비회원은 is_admin()을 실행할 권한이 없으므로 정책을 나눈다)
drop policy if exists "jigi_profiles: public read active" on public.jigi_profiles;
create policy "jigi_profiles: public read active" on public.jigi_profiles
  for select to anon
  using (is_active);

drop policy if exists "jigi_profiles: member read" on public.jigi_profiles;
create policy "jigi_profiles: member read" on public.jigi_profiles
  for select to authenticated
  using (is_active or user_id = (select auth.uid()) or (select public.is_admin()));

drop policy if exists "jigi_profiles: update own" on public.jigi_profiles;
create policy "jigi_profiles: update own" on public.jigi_profiles
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- review_jigi_application(): 관리자 심사. 상태 변경 + 승인 시 지기 프로필 생성 + 기록을 한 번에 처리한다.
-- 승인은 신원 확인(인터뷰에서 확인 후 체크)이 된 신청만 가능하다.
-- ---------------------------------------------------------------------
create or replace function public.review_jigi_application(
  p_id uuid,
  p_status text,
  p_id_verified boolean,
  p_memo text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  app public.jigi_applications;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_status not in ('submitted', 'interview', 'approved', 'on_hold', 'rejected') then
    raise exception 'invalid status: %', p_status using errcode = '22023';
  end if;

  select * into app from public.jigi_applications where id = p_id for update;
  if not found then
    raise exception 'application not found' using errcode = 'P0002';
  end if;
  if p_status = 'approved' and not coalesce(p_id_verified, false) then
    raise exception 'identity must be verified before approval' using errcode = '22023';
  end if;

  update public.jigi_applications
     set status = p_status,
         id_verified = coalesce(p_id_verified, false),
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_id;

  insert into public.jigi_application_notes (application_id, memo, updated_by, updated_at)
  values (p_id, left(btrim(coalesce(p_memo, '')), 1000), auth.uid(), now())
  on conflict (application_id) do update
    set memo = excluded.memo, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  if p_status = 'approved' then
    insert into public.jigi_profiles (user_id, bio, languages, is_active)
    values (app.user_id, app.intro, app.languages, true)
    on conflict (user_id) do update set is_active = true;
  elsif app.status = 'approved' then
    -- 승인을 취소하면 공개 프로필을 숨긴다 (작성한 내용은 남겨 둔다)
    update public.jigi_profiles set is_active = false where user_id = app.user_id;
  end if;

  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'jigi_application.review', 'jigi_applications', p_id::text,
          jsonb_build_object('from', app.status, 'to', p_status, 'id_verified', coalesce(p_id_verified, false)));
end;
$$;

revoke execute on function public.review_jigi_application(uuid, text, boolean, text) from public, anon;
grant execute on function public.review_jigi_application(uuid, text, boolean, text) to authenticated;
