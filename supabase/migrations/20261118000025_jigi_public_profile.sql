-- =====================================================================
-- 25. 지기 공개 프로필 (루트 상세 'Your local friend') — 지기가 직접 고친다 (/partner/profile)
-- 24번까지 실행한 뒤 실행한다. 여러 번 실행해도 된다. 표·칸은 바꾸지 않는다.
--
--   save_jigi_profile (새 함수) : 한 줄 소개(60자)·소개글(500자)·대화 가능 언어(1개 이상).
--                                 연락처·SNS·외부 링크·외부 결제 안내가 있으면 저장하지 않는다 (채팅과 같은 규칙 chat_safety_flags).
--                                 이 검사를 건너뛰지 못하게 지기가 표를 직접 고치던 권한은 닫는다.
--   언어 값 맞추기             : 지기 신청서 언어('영어' 등)를 루트·여행자와 같은 값('English' 등)으로 바꾼다
--                                 (전에는 영어 화면에 'Speaks 영어'로 나왔다). 승인할 때도 바꿔서 넣는다.
--   지원서 자기소개 정리       : 예전 버전이 승인할 때 지원서 자기소개(심사용 글)를 공개 소개로 복사했다.
--                                 지금도 그대로인 소개글은 비우고, 그 지기에게 공개 소개를 써 달라는 알림을 보낸다 (한 번만).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 언어 값: 한국어 이름 → 영어 id (루트 진행 언어 src/data/routeOptions.ts ROUTE_LANGUAGES와 같은 순서)
--    목록에 없는 값('기타 외국어' 등)은 뺀다
-- ---------------------------------------------------------------------
create or replace function public.jigi_language_ids(p_langs text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(l.id order by l.ord), '{}')
  from (values ('English', '영어', 1), ('Korean', '한국어', 2), ('Japanese', '일본어', 3), ('Chinese', '중국어', 4),
               ('Spanish', '스페인어', 5), ('French', '프랑스어', 6), ('German', '독일어', 7)) as l(id, ko, ord)
  where l.id = any(coalesce(p_langs, '{}')) or l.ko = any(coalesce(p_langs, '{}'))
$$;

update public.jigi_profiles
   set languages = public.jigi_language_ids(languages)
 where languages is distinct from public.jigi_language_ids(languages);

-- 승인할 때도 영어 id로 넣는다 (나머지는 10번 정의와 같다)
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
    -- 신청서 자기소개(관리자에게 쓴 글)는 공개 프로필로 옮기지 않는다. 공개 소개는 지기가 /partner/profile 에서 쓴다.
    insert into public.jigi_profiles (user_id, languages, is_active)
    values (app.user_id, public.jigi_language_ids(app.languages), true)
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

-- ---------------------------------------------------------------------
-- 2) 공개 프로필 저장
-- ---------------------------------------------------------------------
create or replace function public.save_jigi_profile(p_headline text, p_bio text, p_languages text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headline text := nullif(btrim(coalesce(p_headline, '')), '');
  v_bio text := nullif(btrim(coalesce(p_bio, '')), '');
  v_langs text[] := public.jigi_language_ids(p_languages);
begin
  if not public.is_approved_jigi(auth.uid()) then
    raise exception 'approved jigi only' using errcode = '42501';
  end if;
  if char_length(v_headline) > 60 then
    raise exception 'headline too long' using errcode = '22023';
  end if;
  if char_length(v_bio) > 500 then
    raise exception 'bio too long' using errcode = '22023';
  end if;
  if cardinality(v_langs) = 0 then
    raise exception 'language required' using errcode = '22023';
  end if;
  if cardinality(public.chat_safety_flags(coalesce(v_headline, '') || E'\n' || coalesce(v_bio, ''))) > 0 then
    raise exception 'contact or payment info' using errcode = '22023';
  end if;

  update public.jigi_profiles
     set headline = v_headline, bio = v_bio, languages = v_langs
   where user_id = auth.uid();
end;
$$;

revoke execute on function public.jigi_language_ids(text[]) from public, anon, authenticated;
revoke execute on function public.save_jigi_profile(text, text, text[]) from public, anon;
grant execute on function public.save_jigi_profile(text, text, text[]) to authenticated;

-- 지기가 표를 직접 고치던 권한을 닫는다 (위 함수로만 — 연락처 검사를 건너뛰지 못하게)
revoke update on public.jigi_profiles from authenticated;
revoke update (headline, bio, avatar_style, languages, confirm_mode) on public.jigi_profiles from authenticated;

-- ---------------------------------------------------------------------
-- 3) 지원서 자기소개를 복사한 공개 소개글 비우기 + 알림 (띄어쓰기·줄바꿈만 다른 것도 같은 글로 본다)
--    다시 실행해도 이미 비운 글은 없으므로 알림이 또 가지 않는다
-- ---------------------------------------------------------------------
with copied as (
  update public.jigi_profiles j
     set bio = null
   where j.bio is not null
     and exists (
       select 1 from public.jigi_applications a
        where a.user_id = j.user_id
          and char_length(regexp_replace(j.bio, '\s', '', 'g')) > 0
          and left(regexp_replace(a.intro, '\s', '', 'g'), char_length(regexp_replace(j.bio, '\s', '', 'g')))
              = regexp_replace(j.bio, '\s', '', 'g')
     )
  returning j.user_id
)
select public.add_notification(
  c.user_id, 'jigi_profile',
  '여행자에게 보일 소개를 써 주세요',
  '지기 신청서의 자기소개(심사용)가 루트 화면에 보이고 있어 내렸어요. 내 정보 → 공개 프로필에서 여행자에게 보일 소개를 새로 써 주세요.',
  '/partner/profile', null
)
from copied c;
