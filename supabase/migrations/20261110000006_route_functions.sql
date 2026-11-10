-- =====================================================================
-- Phase 3-3. 루트·가능 시간 저장 함수
-- 4번, 5번 실행 후에 실행한다. 여러 번 실행해도 된다.
-- 루트·정류장·가능 시간·슬롯은 화면에서 직접 쓰지 못하고 이 함수들로만 바뀐다.
--   지기: 승인되어 활동 중인 지기만, 자기 것만. 상태는 작성 중 ↔ 검수 중만 바꿀 수 있다.
--   관리자: 공개 승인 / 수정 요청(사유 필수) / 비공개
-- =====================================================================

-- ---------------------------------------------------------------------
-- save_route(): 루트 기본 정보 + 정류장 전체를 한 번에 저장한다 (새 루트면 p_id = null).
--   p_route: {title, summary, tags[], vibe, duration_minutes, meeting_point_note, area, max_party_size, languages[], list_price}
--   p_stops: [{place_name, area, stay_minutes, activity, tip, tags[]}, …] 2~6곳, 배열 순서가 코스 순서
-- 검수 중인 루트는 고칠 수 없다. 공개·비공개 루트를 고치면 '작성 중'으로 돌아가 다시 검수를 받는다.
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

  v_tags := array(select jsonb_array_elements_text(coalesce(p_route -> 'tags', '[]')));
  v_languages := array(select jsonb_array_elements_text(coalesce(p_route -> 'languages', '[]')));

  if p_id is null then
    if (select count(*) from public.routes where jigi_id = me) >= 20 then
      raise exception 'too many routes' using errcode = '54000';
    end if;
    insert into public.routes (jigi_id, title, summary, tags, vibe, duration_minutes, meeting_point_note, area,
                               max_party_size, languages, list_price)
    values (me, btrim(p_route ->> 'title'), btrim(p_route ->> 'summary'), v_tags, p_route ->> 'vibe',
            (p_route ->> 'duration_minutes')::int, btrim(p_route ->> 'meeting_point_note'), p_route ->> 'area',
            (p_route ->> 'max_party_size')::int, v_languages, (p_route ->> 'list_price')::int)
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
           status = v_status
     where id = p_id;
    v_id := p_id;
    delete from public.route_stops where route_id = v_id;
  end if;

  insert into public.route_stops (route_id, order_no, place_name, area, stay_minutes, activity, tip, tags)
  select v_id, s.n, btrim(s.stop ->> 'place_name'), s.stop ->> 'area', (s.stop ->> 'stay_minutes')::int,
         btrim(s.stop ->> 'activity'), nullif(btrim(coalesce(s.stop ->> 'tip', '')), ''),
         array(select jsonb_array_elements_text(coalesce(s.stop -> 'tags', '[]')))
  from jsonb_array_elements(p_stops) with ordinality as s(stop, n);

  -- 공개 중이던 루트가 작성 중으로 돌아가면 예약 가능 시간(open 슬롯)도 내린다
  if prev.status = 'published' then
    perform public.refresh_jigi_slots(me);
  end if;
  return v_id;
end;
$$;

-- 검수 요청: 작성 중 / 수정 요청 → 검수 중
create or replace function public.submit_route(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.routes;
begin
  if not public.is_approved_jigi(auth.uid()) then
    raise exception 'approved jigi only' using errcode = '42501';
  end if;
  select * into r from public.routes where id = p_id and jigi_id = auth.uid() for update;
  if not found then
    raise exception 'route not found' using errcode = 'P0002';
  end if;
  if r.status not in ('draft', 'changes_requested') then
    raise exception 'route cannot be submitted from %', r.status using errcode = '55000';
  end if;
  if (select count(*) from public.route_stops where route_id = p_id) < 2 then
    raise exception 'route needs 2 to 6 stops' using errcode = '22023';
  end if;
  update public.routes set status = 'in_review', submitted_at = now() where id = p_id;
end;
$$;

-- 검수 요청 취소: 검수 중 → 작성 중 (고치고 다시 요청할 때)
create or replace function public.withdraw_route(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.routes set status = 'draft'
   where id = p_id and jigi_id = auth.uid() and status = 'in_review';
  if not found then
    raise exception 'route not in review' using errcode = '55000';
  end if;
end;
$$;

-- 루트 삭제: 작성 중·수정 요청 상태만. 공개·비공개·검수 중인 루트는 지울 수 없다 (비공개로 둔다).
create or replace function public.delete_route(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.routes
   where id = p_id and jigi_id = auth.uid() and status in ('draft', 'changes_requested');
  if not found then
    raise exception 'route cannot be deleted' using errcode = '55000';
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- admin_review_route(): 관리자 검수.
--   publish: 검수 중·비공개 → 공개 (슬롯 생성)
--   request_changes: 검수 중·공개·비공개 → 수정 요청 (사유 필수, 지기에게 보임)
--   hide: 검수 중·공개·수정 요청 → 비공개 (open 슬롯 정리)
-- ---------------------------------------------------------------------
create or replace function public.admin_review_route(p_id uuid, p_action text, p_memo text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.routes;
  v_memo text := left(btrim(coalesce(p_memo, '')), 500);
  v_to text;
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select * into r from public.routes where id = p_id for update;
  if not found then
    raise exception 'route not found' using errcode = 'P0002';
  end if;

  if p_action = 'publish' then
    if r.status not in ('in_review', 'hidden') then
      raise exception 'cannot publish from %', r.status using errcode = '55000';
    end if;
    if not public.is_approved_jigi(r.jigi_id) then
      raise exception 'jigi is not active' using errcode = '55000';
    end if;
    v_to := 'published';
  elsif p_action = 'request_changes' then
    if r.status not in ('in_review', 'published', 'hidden') then
      raise exception 'cannot request changes from %', r.status using errcode = '55000';
    end if;
    if v_memo = '' then
      raise exception 'reason required' using errcode = '22023';
    end if;
    v_to := 'changes_requested';
  elsif p_action = 'hide' then
    if r.status not in ('in_review', 'published', 'changes_requested') then
      raise exception 'cannot hide from %', r.status using errcode = '55000';
    end if;
    v_to := 'hidden';
  else
    raise exception 'invalid action' using errcode = '22023';
  end if;

  update public.routes
     set status = v_to,
         published_at = case when v_to = 'published' then now() else published_at end,
         reviewed_by = auth.uid(),
         reviewed_at = now()
   where id = p_id;

  insert into public.route_review_notes (route_id, memo, updated_by, updated_at)
  values (p_id, v_memo, auth.uid(), now())
  on conflict (route_id) do update
    set memo = excluded.memo, updated_by = excluded.updated_by, updated_at = excluded.updated_at;

  perform public.refresh_jigi_slots(r.jigi_id);

  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'route.review', 'routes', p_id::text,
          jsonb_build_object('from', r.status, 'to', v_to, 'memo', nullif(v_memo, '')));
end;
$$;

-- ---------------------------------------------------------------------
-- save_availability(): 주간 반복 시간 전체 + 확정 방식을 저장하고 슬롯을 다시 맞춘다.
--   p_rules: [{weekday, start_time 'HH:MM', end_time 'HH:MM'}, …] 최대 28개, 같은 요일끼리 겹치면 안 됨
-- ---------------------------------------------------------------------
create or replace function public.save_availability(p_rules jsonb, p_confirm_mode text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
begin
  if not public.is_approved_jigi(me) then
    raise exception 'approved jigi only' using errcode = '42501';
  end if;
  if p_confirm_mode not in ('manual', 'instant') then
    raise exception 'invalid confirm mode' using errcode = '22023';
  end if;
  if jsonb_typeof(p_rules) is distinct from 'array' or jsonb_array_length(p_rules) > 28 then
    raise exception 'invalid rules' using errcode = '22023';
  end if;

  delete from public.availability_rules where jigi_id = me;
  insert into public.availability_rules (jigi_id, weekday, start_time, end_time)
  select me, (x ->> 'weekday')::smallint, (x ->> 'start_time')::time, (x ->> 'end_time')::time
  from jsonb_array_elements(p_rules) x;

  if exists (
    select 1
    from public.availability_rules a
    join public.availability_rules b
      on b.jigi_id = a.jigi_id and b.weekday = a.weekday and b.id <> a.id
     and a.start_time < b.end_time and b.start_time < a.end_time
    where a.jigi_id = me
  ) then
    raise exception 'overlapping rules' using errcode = '22023';
  end if;

  update public.jigi_profiles set confirm_mode = p_confirm_mode where user_id = me;
  perform public.refresh_jigi_slots(me);
end;
$$;

-- 날짜별 예외 추가: 오늘부터 90일 안. closed는 시간 없이(하루 종일) 또는 시간 지정, extra는 시간 필수.
create or replace function public.add_availability_exception(p_date date, p_type text, p_start time default null, p_end time default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  v_today date := (now() at time zone 'Asia/Seoul')::date;
  v_id uuid;
begin
  if not public.is_approved_jigi(me) then
    raise exception 'approved jigi only' using errcode = '42501';
  end if;
  if p_date is null or p_date < v_today or p_date > v_today + 90 then
    raise exception 'date out of range' using errcode = '22023';
  end if;
  if (select count(*) from public.availability_exceptions where jigi_id = me and date >= v_today) >= 60 then
    raise exception 'too many exceptions' using errcode = '54000';
  end if;
  insert into public.availability_exceptions (jigi_id, date, type, start_time, end_time)
  values (me, p_date, p_type, p_start, p_end)
  returning id into v_id;
  perform public.refresh_jigi_slots(me);
  return v_id;
end;
$$;

create or replace function public.delete_availability_exception(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.availability_exceptions where id = p_id and jigi_id = auth.uid();
  if not found then
    raise exception 'exception not found' using errcode = 'P0002';
  end if;
  perform public.refresh_jigi_slots(auth.uid());
end;
$$;

revoke execute on function public.save_route(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public.submit_route(uuid) from public, anon;
revoke execute on function public.withdraw_route(uuid) from public, anon;
revoke execute on function public.delete_route(uuid) from public, anon;
revoke execute on function public.admin_review_route(uuid, text, text) from public, anon;
revoke execute on function public.save_availability(jsonb, text) from public, anon;
revoke execute on function public.add_availability_exception(date, text, time, time) from public, anon;
revoke execute on function public.delete_availability_exception(uuid) from public, anon;

grant execute on function public.save_route(uuid, jsonb, jsonb) to authenticated;
grant execute on function public.submit_route(uuid) to authenticated;
grant execute on function public.withdraw_route(uuid) to authenticated;
grant execute on function public.delete_route(uuid) to authenticated;
grant execute on function public.admin_review_route(uuid, text, text) to authenticated;
grant execute on function public.save_availability(jsonb, text) to authenticated;
grant execute on function public.add_availability_exception(date, text, time, time) to authenticated;
grant execute on function public.delete_availability_exception(uuid) to authenticated;
