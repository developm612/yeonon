-- =====================================================================
-- Phase 7-2. 대기자 명단 이전 (Google 시트 Waitlist·Jigi 탭 → CSV → waitlist_imports)
-- 17번 실행 후에 실행한다. 여러 번 실행해도 된다.
--
-- 원칙 (계획서 9장)
--   - 대기자를 자동으로 회원 가입시키지 않는다. 여기에는 시트 내용만 옮겨 두고, 초대는 사람이 보낸 뒤 [초대 표시]만 한다.
--   - 같은 이메일로 Google 가입을 하면 그때 연결(joined_user_id)하고 얼리 멤버(early_member)를 준다.
--     이미 가입한 사람이 있으면 가져올 때 바로 연결한다.
--   - 중복: 같은 탭(source) 안에서 이메일(없으면 연락처·휴대폰)이 같으면 한 번만 들어간다 (다시 올려도 안전).
--   - 관리자만 읽는다. 쓰기는 아래 함수로만 하고, 가져오기·초대 표시·삭제는 audit_log에 남는다(개인정보 없이 건수만).
--   - 보관: 가져온 날부터 data_retention.waitlist_months(19번 파일, 기본 12개월)가 지나면 자동 삭제.
-- =====================================================================

create table if not exists public.waitlist_imports (
  id              uuid primary key default gen_random_uuid(),
  source          text not null check (source in ('waitlist', 'jigi')),
  dedupe_key      text not null check (char_length(dedupe_key) between 3 and 254),
  email           text check (char_length(email) <= 254),
  name            text check (char_length(name) <= 60),
  contact_method  text check (char_length(contact_method) <= 20),
  contact         text check (char_length(contact) <= 254),
  phone           text check (char_length(phone) <= 20),
  nationality     text check (char_length(nationality) <= 60),
  heard_from      text check (char_length(heard_from) <= 60),
  referred_by     text check (char_length(referred_by) <= 60),
  interests       text check (char_length(interests) <= 300),
  details         jsonb not null default '{}' check (jsonb_typeof(details) = 'object'),
  consent         text check (char_length(consent) <= 20),
  submitted_at    timestamptz,
  batch_id        uuid,
  imported_by     uuid references public.profiles (id) on delete set null,
  imported_at     timestamptz not null default now(),
  invite_sent_at  timestamptz,
  invite_sent_by  uuid references public.profiles (id) on delete set null,
  joined_user_id  uuid references public.profiles (id) on delete set null,
  joined_at       timestamptz,
  unique (source, dedupe_key)
);

create index if not exists waitlist_imports_email_idx on public.waitlist_imports (email) where email is not null;
create index if not exists waitlist_imports_imported_idx on public.waitlist_imports (imported_at desc);

alter table public.waitlist_imports enable row level security;
revoke all on public.waitlist_imports from anon, authenticated;
grant select on public.waitlist_imports to authenticated;

drop policy if exists "waitlist_imports: admin read" on public.waitlist_imports;
create policy "waitlist_imports: admin read" on public.waitlist_imports
  for select to authenticated
  using ((select public.is_admin()));

-- ---------------------------------------------------------------------
-- link_waitlist_email(): 같은 이메일의 가입 전 대기자 행을 회원과 연결하고 얼리 멤버를 준다. 연결한 행 수를 돌려준다.
-- ---------------------------------------------------------------------
create or replace function public.link_waitlist_email(p_user uuid, p_email text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if p_user is null or nullif(btrim(coalesce(p_email, '')), '') is null then
    return 0;
  end if;
  update public.waitlist_imports
     set joined_user_id = p_user, joined_at = now()
   where email = lower(btrim(p_email)) and joined_user_id is null;
  get diagnostics n = row_count;
  if n > 0 then
    update public.profiles set early_member = true where id = p_user and not early_member;
  end if;
  return n;
end;
$$;

revoke execute on function public.link_waitlist_email(uuid, text) from public, anon, authenticated;

-- 가입(프로필 생성) 때 연결
create or replace function public.profiles_link_waitlist()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.link_waitlist_email(new.id, new.email);
  return null;
end;
$$;

revoke execute on function public.profiles_link_waitlist() from public, anon, authenticated;

drop trigger if exists profiles_link_waitlist on public.profiles;
create trigger profiles_link_waitlist after insert on public.profiles
  for each row execute function public.profiles_link_waitlist();

-- ---------------------------------------------------------------------
-- admin_import_waitlist(): CSV에서 읽은 행들(jsonb 배열)을 넣는다. 서버(/admin/waitlist)가 칸 이름을 맞춰서 보낸다.
--   행 칸: email, name, contact_method, contact, phone, nationality, heard_from, referred_by, interests, consent,
--          submitted_at, details(object)
--   돌려주는 값: {"received", "inserted", "duplicates", "invalid", "linked"}
-- ---------------------------------------------------------------------
create or replace function public.admin_import_waitlist(p_source text, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row jsonb;
  v_email text;
  v_method text;
  v_contact text;
  v_phone text;
  v_key text;
  v_at timestamptz;
  v_batch uuid := gen_random_uuid();
  n_received integer := 0;
  n_inserted integer := 0;
  n_invalid integer := 0;
  n_linked integer := 0;
  n integer;
  v record;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if p_source not in ('waitlist', 'jigi') then
    raise exception 'invalid source' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 5000 then
    raise exception 'too many rows' using errcode = '22023';
  end if;

  for v_row in select * from jsonb_array_elements(p_rows) loop
    n_received := n_received + 1;
    if jsonb_typeof(v_row) <> 'object' then
      n_invalid := n_invalid + 1;
      continue;
    end if;
    v_method := lower(nullif(btrim(coalesce(v_row ->> 'contact_method', '')), ''));
    v_contact := nullif(left(btrim(coalesce(v_row ->> 'contact', '')), 254), '');
    v_email := lower(nullif(btrim(coalesce(v_row ->> 'email', '')), ''));
    if v_email is null and v_method = 'email' then
      v_email := lower(v_contact);
    end if;
    if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
      v_email := null;
    end if;
    v_phone := nullif(left(btrim(coalesce(v_row ->> 'phone', '')), 20), '');
    v_key := left(coalesce(v_email, lower(v_contact), regexp_replace(coalesce(v_phone, ''), '\D', '', 'g')), 254);
    if coalesce(char_length(v_key), 0) < 3 then
      n_invalid := n_invalid + 1;
      continue;
    end if;
    begin
      v_at := nullif(btrim(coalesce(v_row ->> 'submitted_at', '')), '')::timestamptz;
    exception when others then
      v_at := null;
    end;

    insert into public.waitlist_imports (source, dedupe_key, email, name, contact_method, contact, phone, nationality,
                                         heard_from, referred_by, interests, details, consent, submitted_at, batch_id, imported_by)
    values (p_source, v_key, v_email,
            nullif(left(btrim(coalesce(v_row ->> 'name', '')), 60), ''),
            left(v_method, 20), v_contact, v_phone,
            nullif(left(btrim(coalesce(v_row ->> 'nationality', '')), 60), ''),
            nullif(left(btrim(coalesce(v_row ->> 'heard_from', '')), 60), ''),
            nullif(left(btrim(coalesce(v_row ->> 'referred_by', '')), 60), ''),
            nullif(left(btrim(coalesce(v_row ->> 'interests', '')), 300), ''),
            case when jsonb_typeof(v_row -> 'details') = 'object' then v_row -> 'details' else '{}'::jsonb end,
            nullif(left(btrim(coalesce(v_row ->> 'consent', '')), 20), ''),
            v_at, v_batch, auth.uid())
    on conflict (source, dedupe_key) do nothing;
    get diagnostics n = row_count;
    n_inserted := n_inserted + n;
  end loop;

  -- 이미 같은 이메일로 가입한 회원과 연결
  for v in
    select distinct p.id, p.email from public.profiles p
    join public.waitlist_imports w on w.email = lower(p.email) and w.joined_user_id is null
  loop
    n_linked := n_linked + public.link_waitlist_email(v.id, v.email);
  end loop;

  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'waitlist.import', 'waitlist_imports', v_batch::text,
          jsonb_build_object('source', p_source, 'received', n_received, 'inserted', n_inserted,
                             'duplicates', n_received - n_inserted - n_invalid, 'invalid', n_invalid, 'linked', n_linked));
  return jsonb_build_object('received', n_received, 'inserted', n_inserted,
                            'duplicates', n_received - n_inserted - n_invalid, 'invalid', n_invalid, 'linked', n_linked);
end;
$$;

-- 초대 발송 표시 / 표시 취소 (실제 발송은 사람이 한다)
create or replace function public.admin_mark_waitlist_invited(p_ids uuid[], p_invited boolean)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if cardinality(coalesce(p_ids, '{}')) > 1000 then
    raise exception 'too many rows' using errcode = '22023';
  end if;
  update public.waitlist_imports
     set invite_sent_at = case when p_invited then coalesce(invite_sent_at, now()) end,
         invite_sent_by = case when p_invited then coalesce(invite_sent_by, auth.uid()) end
   where id = any (p_ids);
  get diagnostics n = row_count;
  insert into public.audit_log (actor_id, action, target_table, detail)
  values (auth.uid(), case when p_invited then 'waitlist.invite_mark' else 'waitlist.invite_unmark' end, 'waitlist_imports',
          jsonb_build_object('rows', n));
  return n;
end;
$$;

-- 삭제 요청 처리 등 (연결된 회원 계정에는 영향 없음)
create or replace function public.admin_delete_waitlist(p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if cardinality(coalesce(p_ids, '{}')) > 1000 then
    raise exception 'too many rows' using errcode = '22023';
  end if;
  delete from public.waitlist_imports where id = any (p_ids);
  get diagnostics n = row_count;
  insert into public.audit_log (actor_id, action, target_table, detail)
  values (auth.uid(), 'waitlist.delete', 'waitlist_imports', jsonb_build_object('rows', n));
  return n;
end;
$$;

revoke execute on function public.admin_import_waitlist(text, jsonb) from public, anon;
revoke execute on function public.admin_mark_waitlist_invited(uuid[], boolean) from public, anon;
revoke execute on function public.admin_delete_waitlist(uuid[]) from public, anon;
grant execute on function public.admin_import_waitlist(text, jsonb) to authenticated;
grant execute on function public.admin_mark_waitlist_invited(uuid[], boolean) to authenticated;
grant execute on function public.admin_delete_waitlist(uuid[]) to authenticated;
