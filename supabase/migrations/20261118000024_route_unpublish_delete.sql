-- =====================================================================
-- 24. 지기가 자기 루트를 직접 공개 내리기·삭제·다시 검수 요청 (지기 '내 루트' /partner/routes)
-- 23번까지 실행한 뒤 실행한다. 여러 번 실행해도 된다. 표·칸은 바꾸지 않는다.
--
--   unpublish_route (새 함수) : 공개 → 비공개(hidden). 그 루트에 진행 중(대기·확정) 예약이 있으면 안 된다.
--                               앞으로 열린 시간은 기존 규칙(refresh_jigi_slots)이 지운다. 기록: audit_log 'route.unpublish'
--   delete_route  (바꿈)      : 예약 기록이 하나도 없으면 어떤 상태든 지울 수 있다 (전에는 작성 중·수정 요청만).
--                               예약 기록이 있으면 지울 수 없다 (기록 보존) — 대신 공개 내리기.
--   submit_route  (바꿈)      : 비공개(hidden) 루트도 바로 다시 검수 요청할 수 있다 (전에는 고친 뒤에만).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 공개 내리기
-- ---------------------------------------------------------------------
create or replace function public.unpublish_route(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.routes;
begin
  select * into r from public.routes where id = p_id and jigi_id = auth.uid() for update;
  if not found then
    raise exception 'route not found' using errcode = 'P0002';
  end if;
  if r.status <> 'published' then
    raise exception 'route not published' using errcode = '55000';
  end if;
  if exists (select 1 from public.bookings b where b.route_id = p_id and b.status in ('pending', 'confirmed')) then
    raise exception 'route has active bookings' using errcode = '55000';
  end if;

  update public.routes set status = 'hidden' where id = p_id;
  perform public.refresh_jigi_slots(r.jigi_id);

  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'route.unpublish', 'routes', p_id::text, jsonb_build_object('from', r.status, 'to', 'hidden'));
end;
$$;

-- ---------------------------------------------------------------------
-- 삭제 — 내 루트이고 예약 기록이 없으면 (상태 상관없음)
-- ---------------------------------------------------------------------
create or replace function public.delete_route(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.routes;
begin
  select * into r from public.routes where id = p_id and jigi_id = auth.uid() for update;
  if not found then
    raise exception 'route cannot be deleted' using errcode = '55000';
  end if;
  if exists (select 1 from public.bookings where route_id = p_id) then
    raise exception 'route has bookings' using errcode = '55000';
  end if;

  delete from public.routes where id = p_id;  -- 정류장·열린 시간은 함께 지워진다 (on delete cascade)
  if r.status = 'published' then
    perform public.refresh_jigi_slots(r.jigi_id);  -- 겹쳐서 내려가 있던 다른 루트 시간이 다시 계산되게
  end if;

  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'route.delete', 'routes', p_id::text, jsonb_build_object('status', r.status, 'title', r.title));
end;
$$;

-- ---------------------------------------------------------------------
-- 검수 요청 — 비공개(hidden)에서도
-- ---------------------------------------------------------------------
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
  if r.status not in ('draft', 'changes_requested', 'hidden') then
    raise exception 'route cannot be submitted from %', r.status using errcode = '55000';
  end if;
  if (select count(*) from public.route_stops where route_id = p_id) < 2 then
    raise exception 'route needs 2 to 6 stops' using errcode = '22023';
  end if;
  update public.routes set status = 'in_review', submitted_at = now() where id = p_id;
end;
$$;

revoke execute on function public.unpublish_route(uuid) from public, anon;
revoke execute on function public.delete_route(uuid) from public, anon;
revoke execute on function public.submit_route(uuid) from public, anon;
grant execute on function public.unpublish_route(uuid) to authenticated;
grant execute on function public.delete_route(uuid) to authenticated;
grant execute on function public.submit_route(uuid) to authenticated;
