-- =====================================================================
-- 20. 루트 사진: 대표 사진 1장 + 정류장 사진 각 1장 (yeonon-traveler-ui-plan.md 7장)
-- 19번까지 실행한 뒤 실행한다. 여러 번 실행해도 된다.
--
--   저장소   : Storage 공개 버킷 'route-photos' (읽기는 누구나 공개 주소로, 목록 보기는 불가)
--   파일 이름: <지기 user id>/<무작위 uuid>.webp|.jpg  — 브라우저가 긴 변 2000px로 줄이고 위치 정보(EXIF)를 지운 뒤 올린다
--   올리기   : 승인되어 활동 중인 지기만, 자기 폴더에만 (Storage RLS)
--   붙이기   : routes.cover_photo, route_stops.photo 칸. save_route 함수로만 바뀌고,
--              그 지기 폴더에 실제로 올라간 파일인지 확인한다 (남의 사진·없는 파일은 붙일 수 없음)
--   검수     : 사진을 바꾸는 것도 루트 저장이라, 공개 중이던 루트는 '작성 중'으로 돌아가 다시 검수를 받는다 (기존 규칙 그대로)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) 칸 추가 (사진은 선택 — 비어 있으면 화면이 루트 라인 썸네일을 그린다)
-- ---------------------------------------------------------------------
alter table public.routes add column if not exists cover_photo text;
alter table public.route_stops add column if not exists photo text;

alter table public.routes drop constraint if exists routes_cover_photo_check;
alter table public.routes add constraint routes_cover_photo_check
  check (cover_photo ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$');
alter table public.route_stops drop constraint if exists route_stops_photo_check;
alter table public.route_stops add constraint route_stops_photo_check
  check (photo ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$');

-- ---------------------------------------------------------------------
-- 2) 버킷: 공개 읽기, 한 장 3MB, webp·jpeg만
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('route-photos', 'route-photos', true, 3145728, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 올릴 수 있는 사람인지 (Storage RLS에서 부른다). is_approved_jigi는 화면에서 직접 못 부르므로 본인 확인만 감싼다
create or replace function public.can_upload_route_photo()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_approved_jigi(auth.uid())
$$;

revoke execute on function public.can_upload_route_photo() from public, anon;
grant execute on function public.can_upload_route_photo() to authenticated;

-- ---------------------------------------------------------------------
-- 3) Storage RLS (storage.objects). 공개 버킷이라 공개 주소 읽기에는 정책이 필요 없다.
--    올리기: 승인된 지기, 자기 폴더(<user id>/)에만, 정해진 파일 이름 모양만
--    보기·지우기: 자기 폴더의 파일만 (덮어쓰기(update)는 허용하지 않는다 — 바꿀 때는 새 이름으로 올린다)
-- ---------------------------------------------------------------------
drop policy if exists "route-photos: jigi upload own folder" on storage.objects;
create policy "route-photos: jigi upload own folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'route-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|jpg)$'
    and (select public.can_upload_route_photo())
  );

drop policy if exists "route-photos: owner read" on storage.objects;
create policy "route-photos: owner read" on storage.objects
  for select to authenticated
  using (bucket_id = 'route-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "route-photos: owner delete" on storage.objects;
create policy "route-photos: owner delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'route-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------
-- 4) 붙일 수 있는 사진인지: 비어 있거나(null), 그 지기 폴더에 실제로 있는 파일
-- ---------------------------------------------------------------------
create or replace function public.valid_route_photo(p_owner uuid, p_path text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_path is null
      or (
        split_part(p_path, '/', 1) = p_owner::text
        and exists (select 1 from storage.objects o where o.bucket_id = 'route-photos' and o.name = p_path)
      )
$$;

revoke execute on function public.valid_route_photo(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) save_route(): 6번 파일의 함수에 사진 두 가지만 더했다.
--   p_route.cover_photo : 대표 사진 경로 또는 null
--   p_stops[].photo     : 정류장 사진 경로 또는 null (배열 순서 = 코스 순서라 정류장을 옮기면 사진도 같이 옮겨진다)
--   예전 화면(사진 칸 없음)이 부르면 사진이 null로 저장된다 → 이 SQL을 실행한 뒤 새 코드를 배포한다.
-- ---------------------------------------------------------------------
create or replace function public.save_route(p_id uuid, p_route jsonb, p_stops jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  prev public.routes;
  v_id uuid;
  v_status text := 'draft';
  v_stops int;
  v_stay int;
  v_tags text[];
  v_languages text[];
  v_cover text := nullif(btrim(coalesce(p_route ->> 'cover_photo', '')), '');
begin
  if not public.is_approved_jigi(me) then
    raise exception 'approved jigi only' using errcode = '42501';
  end if;
  if jsonb_typeof(p_route) is distinct from 'object' or jsonb_typeof(p_stops) is distinct from 'array' then
    raise exception 'invalid route data' using errcode = '22023';
  end if;
  v_stops := jsonb_array_length(p_stops);
  if v_stops not between 2 and 6 then
    raise exception 'route needs 2 to 6 stops' using errcode = '22023';
  end if;
  select sum((s ->> 'stay_minutes')::int) into v_stay from jsonb_array_elements(p_stops) s;
  if v_stay > (p_route ->> 'duration_minutes')::int then
    raise exception 'stops are longer than the route duration' using errcode = '22023';
  end if;
  -- 사진: 이 지기 폴더에 실제로 올라간 파일만
  if not public.valid_route_photo(me, v_cover)
     or exists (
       select 1 from jsonb_array_elements(p_stops) s
        where not public.valid_route_photo(me, nullif(btrim(coalesce(s ->> 'photo', '')), ''))
     ) then
    raise exception 'invalid route photo' using errcode = '22023';
  end if;

  v_tags := array(select jsonb_array_elements_text(coalesce(p_route -> 'tags', '[]')));
  v_languages := array(select jsonb_array_elements_text(coalesce(p_route -> 'languages', '[]')));

  if p_id is null then
    if (select count(*) from public.routes where jigi_id = me) >= 20 then
      raise exception 'too many routes' using errcode = '54000';
    end if;
    insert into public.routes (jigi_id, title, summary, tags, vibe, duration_minutes, meeting_point_note, area,
                               max_party_size, languages, list_price, cover_photo)
    values (me, btrim(p_route ->> 'title'), btrim(p_route ->> 'summary'), v_tags, p_route ->> 'vibe',
            (p_route ->> 'duration_minutes')::int, btrim(p_route ->> 'meeting_point_note'), p_route ->> 'area',
            (p_route ->> 'max_party_size')::int, v_languages, (p_route ->> 'list_price')::int, v_cover)
    returning id into v_id;
  else
    select * into prev from public.routes where id = p_id and jigi_id = me for update;
    if not found then
      raise exception 'route not found' using errcode = 'P0002';
    end if;
    if prev.status = 'in_review' then
      raise exception 'route is in review' using errcode = '55000';
    end if;
    -- 수정 요청을 받은 루트는 그 상태를 유지하고(사유를 계속 보여 줌), 나머지는 작성 중으로
    v_status := case when prev.status = 'changes_requested' then 'changes_requested' else 'draft' end;

    update public.routes
       set title = btrim(p_route ->> 'title'),
           summary = btrim(p_route ->> 'summary'),
           tags = v_tags,
           vibe = p_route ->> 'vibe',
           duration_minutes = (p_route ->> 'duration_minutes')::int,
           meeting_point_note = btrim(p_route ->> 'meeting_point_note'),
           area = p_route ->> 'area',
           max_party_size = (p_route ->> 'max_party_size')::int,
           languages = v_languages,
           list_price = (p_route ->> 'list_price')::int,
           cover_photo = v_cover,
           status = v_status
     where id = p_id;
    v_id := p_id;
    delete from public.route_stops where route_id = v_id;
  end if;

  insert into public.route_stops (route_id, order_no, place_name, area, stay_minutes, activity, tip, tags, photo)
  select v_id, s.n, btrim(s.stop ->> 'place_name'), s.stop ->> 'area', (s.stop ->> 'stay_minutes')::int,
         btrim(s.stop ->> 'activity'), nullif(btrim(coalesce(s.stop ->> 'tip', '')), ''),
         array(select jsonb_array_elements_text(coalesce(s.stop -> 'tags', '[]'))),
         nullif(btrim(coalesce(s.stop ->> 'photo', '')), '')
  from jsonb_array_elements(p_stops) with ordinality as s(stop, n);

  -- 공개 중이던 루트가 작성 중으로 돌아가면 예약 가능 시간(open 슬롯)도 내린다
  if prev.status = 'published' then
    perform public.refresh_jigi_slots(me);
  end if;
  return v_id;
end;
$$;

revoke execute on function public.save_route(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_route(uuid, jsonb, jsonb) to authenticated;
