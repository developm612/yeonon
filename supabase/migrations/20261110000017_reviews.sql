-- =====================================================================
-- Phase 7-1. 후기(reviews) · 지기 품질 지표(평점·수락률·응답 시간) · 추천 점수 품질 항목 연결
-- 16번 실행 후에 실행한다. 여러 번 실행해도 된다.
--
-- 후기 규칙
--   - 만남이 끝난(completed) 예약의 당사자(여행자·지기)만, 예약 1건당 1인 1회 쓴다.
--   - 별점 1~5, 코멘트 500자 이내(선택), '안전 문제가 있었어요'(safety_issue) 체크.
--   - 수정·삭제는 처음 쓴 뒤 24시간(review_settings.edit_hours)까지만. 그 뒤로는 바꿀 수 없다.
--   - 쓰기는 save_review()·delete_review() 함수로만 한다 (화면에서 직접 insert/update/delete 금지).
-- 읽기 규칙
--   - 후기 행 전체(안전 체크 포함): 쓴 사람과 관리자만.
--   - 공개: 여행자가 지기에게 쓴 후기 중 안전 체크가 없는 것만 public_jigi_reviews() 함수로
--           (별점·코멘트·루트 이름·날짜·쓴 사람 이름 첫 글자). 지기가 여행자에게 쓴 후기는 공개하지 않는다.
--   - safety_issue가 체크된 후기는 관리자 대시보드 상단과 /admin/reports에 표시되고, 관리자에게 알림이 간다.
-- 품질 지표 (jigi_profiles)
--   rating_avg·rating_count: 여행자 → 지기 후기 전체 (안전 체크 후기도 별점은 포함)
--   accept_rate(%)·avg_response_minutes: 최근 review_settings.metrics_days일의 '수락 후 확정' 요청 기준
--     (수락률 = 수락 / (수락 + 거절 + 기한 만료), 응답 시간 = 요청 → 수락·거절까지). 관리자 대시보드와 같은 정의.
--   후기 저장·삭제, 요청 응답·만료 때 바로 갱신하고, 기간이 밀리는 것은 매일 크론이 다시 계산한다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- review_settings: 후기·지표 규칙 한 행 (SQL Editor에서 update)
-- ---------------------------------------------------------------------
create table if not exists public.review_settings (
  id            boolean primary key default true check (id),
  edit_hours    integer not null default 24  check (edit_hours between 0 and 720),   -- 작성 후 수정·삭제 가능 시간
  metrics_days  integer not null default 180 check (metrics_days between 7 and 3650), -- 수락률·응답 시간 계산 기간
  updated_at    timestamptz not null default now()
);

insert into public.review_settings (id) values (true) on conflict (id) do nothing;

alter table public.review_settings enable row level security;
revoke all on public.review_settings from anon, authenticated;
grant select on public.review_settings to authenticated;

drop policy if exists "review_settings: member read" on public.review_settings;
create policy "review_settings: member read" on public.review_settings
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- reviews
--   예약이 지워지면(회원 탈퇴 등) 후기도 함께 지워진다.
--   safety_status: 안전 체크 후기의 관리자 확인 상태 (open → resolved). 안전 체크가 없으면 null.
-- ---------------------------------------------------------------------
create table if not exists public.reviews (
  id                 uuid primary key default gen_random_uuid(),
  booking_id         uuid not null references public.bookings (id) on delete cascade,
  author_id          uuid not null references public.profiles (id) on delete cascade,
  target_id          uuid not null references public.profiles (id) on delete cascade,
  author_role        text not null check (author_role in ('traveler', 'jigi')),
  route_id           uuid references public.routes (id) on delete set null,
  route_title        text not null default '',
  rating             integer not null check (rating between 1 and 5),
  comment            text check (char_length(comment) <= 500),
  safety_issue       boolean not null default false,
  safety_status      text check (safety_status in ('open', 'resolved')),
  safety_handled_by  uuid references public.profiles (id) on delete set null,
  safety_handled_at  timestamptz,
  safety_note        text check (char_length(safety_note) <= 500),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (booking_id, author_id),
  check (author_id <> target_id),
  check ((safety_issue and safety_status is not null) or (not safety_issue and safety_status is null))
);

create index if not exists reviews_target_idx on public.reviews (target_id, created_at desc);
create index if not exists reviews_author_idx on public.reviews (author_id, created_at desc);
create index if not exists reviews_safety_idx on public.reviews (safety_status, created_at desc) where safety_issue;

drop trigger if exists reviews_touch on public.reviews;
create trigger reviews_touch before update on public.reviews
  for each row execute function public.touch_updated_at();

alter table public.reviews enable row level security;
revoke all on public.reviews from anon, authenticated;
grant select on public.reviews to authenticated;

drop policy if exists "reviews: author or admin" on public.reviews;
create policy "reviews: author or admin" on public.reviews
  for select to authenticated
  using (author_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------
-- 지기 품질 지표 칸 추가: 수락률 계산에 쓴 요청 수(response_count), 마지막 계산 시각
-- ---------------------------------------------------------------------
alter table public.jigi_profiles add column if not exists response_count integer not null default 0;
alter table public.jigi_profiles add column if not exists metrics_updated_at timestamptz;

-- ---------------------------------------------------------------------
-- refresh_jigi_metrics(): 지기 1명의 평점·수락률·응답 시간 다시 계산 (함수 안에서만 부른다)
-- ---------------------------------------------------------------------
create or replace function public.refresh_jigi_metrics(p_jigi uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - make_interval(days => (select metrics_days from public.review_settings where id));
  v_avg numeric;
  v_cnt integer;
  v_acc integer;
  v_dec integer;
  v_exp integer;
  v_resp numeric;
begin
  if p_jigi is null then
    return;
  end if;
  select round(avg(rating)::numeric, 2), count(*)::int into v_avg, v_cnt
  from public.reviews where target_id = p_jigi and author_role = 'traveler';

  select count(*) filter (where confirmed_at is not null and responded_at >= v_since)::int,
         count(*) filter (where status = 'declined' and responded_at >= v_since)::int,
         count(*) filter (where status = 'expired' and expired_at >= v_since)::int,
         avg(extract(epoch from (responded_at - created_at)) / 60) filter (where responded_at >= v_since)
    into v_acc, v_dec, v_exp, v_resp
  from public.bookings
  where jigi_id = p_jigi and confirm_mode = 'manual';

  update public.jigi_profiles
     set rating_avg = v_avg,
         rating_count = v_cnt,
         accept_rate = case when v_acc + v_dec + v_exp > 0 then round(100.0 * v_acc / (v_acc + v_dec + v_exp), 2) end,
         avg_response_minutes = round(v_resp)::int,
         response_count = v_acc + v_dec + v_exp,
         metrics_updated_at = now()
   where user_id = p_jigi;
end;
$$;

-- 모든 지기 다시 계산 (매일 크론, 처음 실행할 때 한 번)
create or replace function public.refresh_all_jigi_metrics()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v uuid;
  n integer := 0;
begin
  for v in select user_id from public.jigi_profiles loop
    perform public.refresh_jigi_metrics(v);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.refresh_jigi_metrics(uuid) from public, anon, authenticated;
revoke execute on function public.refresh_all_jigi_metrics() from public, anon, authenticated;

-- 요청에 응답(수락·거절)하거나 기한이 지나면 그 지기의 지표를 바로 갱신한다
create or replace function public.bookings_refresh_metrics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status = 'pending' and new.status <> 'pending' and new.confirm_mode = 'manual' then
    perform public.refresh_jigi_metrics(new.jigi_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.bookings_refresh_metrics() from public, anon, authenticated;

drop trigger if exists bookings_refresh_metrics on public.bookings;
create trigger bookings_refresh_metrics after update of status on public.bookings
  for each row execute function public.bookings_refresh_metrics();

-- 후기가 생기거나 바뀌거나 지워지면(탈퇴로 함께 지워질 때 포함) 받은 사람의 평점을 갱신한다
create or replace function public.reviews_refresh_metrics()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.author_role = 'traveler' then
      perform public.refresh_jigi_metrics(old.target_id);
    end if;
  elsif new.author_role = 'traveler' then
    perform public.refresh_jigi_metrics(new.target_id);
  end if;
  return null;
end;
$$;

revoke execute on function public.reviews_refresh_metrics() from public, anon, authenticated;

drop trigger if exists reviews_refresh_metrics on public.reviews;
create trigger reviews_refresh_metrics after insert or update of rating or delete on public.reviews
  for each row execute function public.reviews_refresh_metrics();

-- ---------------------------------------------------------------------
-- save_review(): 후기 쓰기·고치기. 돌려주는 값: {"id", "created": true|false}
--   오류 코드: sign_in, booking_not_found, not_completed, invalid_rating, edit_closed
-- ---------------------------------------------------------------------
create or replace function public.save_review(p_booking uuid, p_rating integer, p_comment text, p_safety_issue boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  b public.bookings;
  r public.reviews;
  v_role text;
  v_comment text := nullif(left(btrim(coalesce(p_comment, '')), 500), '');
  v_safety boolean := coalesce(p_safety_issue, false);
  v_hours integer := (select edit_hours from public.review_settings where id);
  v_id uuid;
  v_admin uuid;
begin
  if me is null then
    raise exception using message = 'sign_in', errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = me and status = 'active') then
    raise exception using message = 'sign_in', errcode = '42501';
  end if;
  select * into b from public.bookings where id = p_booking;
  v_role := case when b.traveler_id = me then 'traveler' when b.jigi_id = me then 'jigi' end;
  if not found or v_role is null then
    raise exception using message = 'booking_not_found', errcode = 'P0002';
  end if;
  if b.status <> 'completed' then
    raise exception using message = 'not_completed', errcode = 'P0001';
  end if;
  if p_rating is null or p_rating not between 1 and 5 then
    raise exception using message = 'invalid_rating', errcode = '22023';
  end if;

  select * into r from public.reviews where booking_id = b.id and author_id = me for update;
  if found then
    if r.created_at < now() - make_interval(hours => v_hours) then
      raise exception using message = 'edit_closed', errcode = 'P0001';
    end if;
    update public.reviews
       set rating = p_rating, comment = v_comment, safety_issue = v_safety,
           safety_status = case when not v_safety then null else coalesce(r.safety_status, 'open') end,
           safety_handled_by = case when v_safety then r.safety_handled_by end,
           safety_handled_at = case when v_safety then r.safety_handled_at end,
           safety_note = case when v_safety then r.safety_note end
     where id = r.id;
    v_id := r.id;
  else
    insert into public.reviews (booking_id, author_id, target_id, author_role, route_id, route_title,
                                rating, comment, safety_issue, safety_status)
    values (b.id, me, case when v_role = 'traveler' then b.jigi_id else b.traveler_id end, v_role,
            b.route_id, b.route_title, p_rating, v_comment, v_safety, case when v_safety then 'open' end)
    returning id into v_id;
  end if;

  -- 안전 체크가 새로 켜지면 관리자에게 알린다
  if v_safety and (r.id is null or not r.safety_issue) then
    for v_admin in select id from public.profiles where role = 'admin' and status = 'active' loop
      perform public.add_notification(v_admin, 'review_safety', '안전 문제가 체크된 후기가 있어요',
        format('%s · %s %s', b.route_title, public.kst_label(b.starts_at, 'ko'),
               case when v_role = 'traveler' then '(여행자가 작성)' else '(지기가 작성)' end),
        '/admin/reports?safety=' || v_id || '#safety-' || v_id, null);
    end loop;
  end if;
  return jsonb_build_object('id', v_id, 'created', r.id is null);
end;
$$;

-- delete_review(): 내 후기 지우기 (작성 후 edit_hours 안에만)
create or replace function public.delete_review(p_booking uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := auth.uid();
  r public.reviews;
begin
  if me is null then
    raise exception using message = 'sign_in', errcode = '42501';
  end if;
  select * into r from public.reviews where booking_id = p_booking and author_id = me for update;
  if not found then
    raise exception using message = 'booking_not_found', errcode = 'P0002';
  end if;
  if r.created_at < now() - make_interval(hours => (select edit_hours from public.review_settings where id)) then
    raise exception using message = 'edit_closed', errcode = 'P0001';
  end if;
  delete from public.reviews where id = r.id;
end;
$$;

-- ---------------------------------------------------------------------
-- public_jigi_reviews(): 지기 공개 후기 (누구나). 여행자 이름은 첫 글자만.
--   안전 체크 후기와 지기 → 여행자 후기는 내보내지 않는다.
-- ---------------------------------------------------------------------
create or replace function public.public_jigi_reviews(p_jigi uuid, p_limit integer default 5)
returns table (id uuid, rating integer, comment text, route_id uuid, route_title text, author_initial text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.comment, r.route_id, r.route_title,
         coalesce(nullif(left(btrim(p.display_name), 1), ''), 'T'), r.created_at
  from public.reviews r
  join public.profiles p on p.id = r.author_id
  join public.jigi_profiles j on j.user_id = r.target_id and j.is_active
  where r.target_id = p_jigi and r.author_role = 'traveler' and not r.safety_issue
  order by r.created_at desc
  limit least(greatest(coalesce(p_limit, 5), 1), 20)
$$;

-- ---------------------------------------------------------------------
-- 관리자: 안전 체크 후기 확인 처리 (audit_log 'review.safety_resolve')
-- ---------------------------------------------------------------------
create or replace function public.admin_resolve_safety_review(p_review uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.reviews;
  v_note text := nullif(left(btrim(coalesce(p_note, '')), 500), '');
begin
  if not public.is_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  select * into r from public.reviews where id = p_review for update;
  if not found or not r.safety_issue then
    raise exception 'review not found' using errcode = 'P0002';
  end if;
  if r.safety_status = 'resolved' then
    raise exception 'review already handled' using errcode = '55000';
  end if;
  if v_note is null then
    raise exception 'note required' using errcode = '22023';
  end if;
  update public.reviews
     set safety_status = 'resolved', safety_handled_by = auth.uid(), safety_handled_at = now(), safety_note = v_note
   where id = r.id;
  insert into public.audit_log (actor_id, action, target_table, target_id, detail)
  values (auth.uid(), 'review.safety_resolve', 'reviews', r.id::text,
          jsonb_build_object('booking_id', r.booking_id, 'author_role', r.author_role, 'note', v_note));
end;
$$;

-- ---------------------------------------------------------------------
-- complete_past_bookings(): 만남이 끝나면 completed + 양쪽에 후기 요청 알림 (Phase 5 함수의 알림 문구만 바꿨다)
-- ---------------------------------------------------------------------
create or replace function public.complete_past_bookings()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
  n integer := 0;
begin
  for b in
    update public.bookings set status = 'completed', completed_at = now()
     where id in (select id from public.bookings where status = 'confirmed' and ends_at <= now() order by ends_at limit 500)
       and status = 'confirmed'
    returning *
  loop
    perform public.add_notification(b.traveler_id, 'review_request', 'How was your walk? Leave a review',
      format('%s with your jigi. A quick rating helps other travelers — and tell us if anything felt unsafe.', b.route_title),
      '/app/bookings/' || b.id || '#review', b.id);
    perform public.add_notification(b.jigi_id, 'review_request', '만남은 어떠셨나요? 후기를 남겨 주세요',
      format('%s · %s · %s명 만남이 끝났어요. 안전 문제가 있었다면 후기에서 알려 주세요.', b.route_title, public.kst_label(b.starts_at, 'ko'), b.party_size),
      '/partner/bookings/' || b.id || '#review', b.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke execute on function public.complete_past_bookings() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- match_routes(): 품질 항목이 실제 지표를 쓰도록 바꿨다 (나머지는 8번 파일과 같다).
--   품질 = 데이터가 충분한 항목만의 가중 평균. 하나도 없으면 quality_default.
--     · 평점: 후기 quality_min_reviews개 이상이면 rating_avg / 5                 (가중치 qw_rating)
--     · 수락률: 응답한 요청 quality_min_requests개 이상이면 accept_rate / 100     (가중치 qw_accept)
--     · 응답 속도: 같은 조건에서 speed_fast분 이하 1점 → speed_slow분 이상 0점    (가중치 qw_speed)
--   값은 서버 설정(src/config/recommend.ts의 quality)이 filters로 넘긴다. 없으면 아래 기본값.
-- ---------------------------------------------------------------------
create or replace function public.match_routes(query_embedding extensions.vector, filters jsonb)
returns table (
  route_id          uuid,
  jigi_id           uuid,
  title             text,
  summary           text,
  tags              text[],
  vibe              text,
  duration_minutes  integer,
  area              text,
  max_party_size    integer,
  languages         text[],
  list_price        integer,
  jigi_name         text,
  stops             jsonb,
  matched_tags      text[],
  tag_score         numeric,
  similarity        numeric,
  quality           numeric,
  score             numeric,
  slot_count        integer,
  slot_times        timestamptz[]
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_interests  text[] := array(select distinct jsonb_array_elements_text(coalesce(filters -> 'interests', '[]')));
  v_langs      text[] := array(select distinct jsonb_array_elements_text(coalesce(filters -> 'languages', '[]')));
  v_today      date := (now() at time zone 'Asia/Seoul')::date;
  v_from       date := coalesce((filters ->> 'date_from')::date, (now() at time zone 'Asia/Seoul')::date);
  v_to         date;
  v_time       text := coalesce(filters ->> 'time_of_day', 'any');
  v_party      integer := coalesce((filters ->> 'party_size')::int, 1);
  v_limit      integer := coalesce((filters ->> 'limit')::int, 10);
  v_model      text := filters ->> 'embedding_model';
  w_tag        numeric := coalesce((filters ->> 'w_tag')::numeric, 0.45);
  w_sim        numeric := coalesce((filters ->> 'w_sim')::numeric, 0.40);
  w_q          numeric := coalesce((filters ->> 'w_quality')::numeric, 0.15);
  sim_floor    numeric := coalesce((filters ->> 'sim_floor')::numeric, 0);
  sim_ceil     numeric := coalesce((filters ->> 'sim_ceil')::numeric, 1);
  q_default    numeric := coalesce((filters ->> 'quality_default')::numeric, 0.5);
  q_reviews    integer := coalesce((filters ->> 'quality_min_reviews')::int, 3);
  q_requests   integer := coalesce((filters ->> 'quality_min_requests')::int, 3);
  qw_rating    numeric := coalesce((filters ->> 'qw_rating')::numeric, 0.6);
  qw_accept    numeric := coalesce((filters ->> 'qw_accept')::numeric, 0.25);
  qw_speed     numeric := coalesce((filters ->> 'qw_speed')::numeric, 0.15);
  speed_fast   numeric := coalesce((filters ->> 'speed_fast')::numeric, 60);
  speed_slow   numeric := coalesce((filters ->> 'speed_slow')::numeric, 720);
  v_slot_max   integer := coalesce((filters ->> 'slot_limit')::int, 8);
begin
  v_to := coalesce((filters ->> 'date_to')::date, v_from + 27);
  if cardinality(v_interests) not between 1 and 10 or not public.valid_interest_tags(v_interests) then
    raise exception 'invalid interests' using errcode = '22023';
  end if;
  if v_from < v_today - 1 or v_to < v_from or v_to - v_from > 60 then
    raise exception 'invalid date range' using errcode = '22023';
  end if;
  if v_time not in ('any', 'morning', 'afternoon', 'evening') or v_party not between 1 and 20
     or v_limit not between 1 and 50 or v_slot_max not between 1 and 20 or cardinality(v_langs) > 10 then
    raise exception 'invalid filters' using errcode = '22023';
  end if;
  if w_tag < 0 or w_sim < 0 or w_q < 0 or w_tag + w_q <= 0 or sim_ceil <= sim_floor or q_default not between 0 and 1 then
    raise exception 'invalid weights' using errcode = '22023';
  end if;
  if qw_rating < 0 or qw_accept < 0 or qw_speed < 0 or qw_rating + qw_accept + qw_speed <= 0
     or speed_slow <= speed_fast or q_reviews < 0 or q_requests < 0 then
    raise exception 'invalid quality weights' using errcode = '22023';
  end if;
  if query_embedding is not null and extensions.vector_dims(query_embedding) <> 1024 then
    raise exception 'query embedding must have 1024 dimensions' using errcode = '22023';
  end if;

  return query
  with cand as (
    select r.*, j.rating_avg, j.rating_count, j.accept_rate, j.avg_response_minutes, j.response_count,
           p.display_name as host_name
    from public.routes r
    join public.jigi_profiles j on j.user_id = r.jigi_id
    join public.profiles p on p.id = r.jigi_id
    where r.status = 'published'
      and j.is_active and p.status = 'active' and p.role = 'jigi'
      and r.max_party_size >= v_party
      and (cardinality(v_langs) = 0 or r.languages && v_langs)
  ),
  open_slots as (
    select s.route_id as rid,
           count(*)::int as n,
           (array_agg(s.starts_at order by s.starts_at))[1:v_slot_max] as times
    from public.slots s
    join cand c on c.id = s.route_id
    where s.status = 'open'
      and s.starts_at > now()
      and (s.starts_at at time zone 'Asia/Seoul')::date between v_from and v_to
      and (
        v_time = 'any'
        or (v_time = 'morning' and extract(hour from s.starts_at at time zone 'Asia/Seoul') < 12)
        or (v_time = 'afternoon' and extract(hour from s.starts_at at time zone 'Asia/Seoul') between 12 and 16)
        or (v_time = 'evening' and extract(hour from s.starts_at at time zone 'Asia/Seoul') >= 17)
      )
    group by s.route_id
  ),
  parts as (
    select c.*, o.n, o.times,
           st.stops_json,
           array(select unnest(c.tags) intersect select unnest(v_interests)) as route_hits,
           array(
             select unnest(st.stop_tags) intersect select unnest(v_interests)
             except select unnest(c.tags)
           ) as stop_hits,
           case
             when query_embedding is null or c.embedding is null
               or (v_model is not null and c.embedding_model is distinct from v_model) then null
             else (1 - (c.embedding operator(extensions.<=>) query_embedding))::numeric
           end as cos_sim,
           qs.q
    from cand c
    join open_slots o on o.rid = c.id
    cross join lateral (
      select coalesce(jsonb_agg(jsonb_build_object(
               'place_name', x.place_name, 'area', x.area, 'stay_minutes', x.stay_minutes,
               'activity', x.activity, 'tags', x.tags) order by x.order_no), '[]'::jsonb) as stops_json,
             coalesce((select array_agg(distinct t) from public.route_stops y, unnest(y.tags) as t where y.route_id = c.id),
                      '{}') as stop_tags
      from public.route_stops x
      where x.route_id = c.id
    ) st
    cross join lateral (
      select coalesce(
               (coalesce(qw_rating * comp.rating, 0) + coalesce(qw_accept * comp.accept, 0) + coalesce(qw_speed * comp.speed, 0))
               / nullif(case when comp.rating is null then 0 else qw_rating end
                        + case when comp.accept is null then 0 else qw_accept end
                        + case when comp.speed is null then 0 else qw_speed end, 0),
               q_default) as q
      from (
        select
          case when c.rating_count >= q_reviews and c.rating_avg is not null then least(1, c.rating_avg / 5) end as rating,
          case when c.response_count >= q_requests and c.accept_rate is not null then least(1, c.accept_rate / 100) end as accept,
          case when c.response_count >= q_requests and c.avg_response_minutes is not null
               then greatest(0, least(1, 1 - (c.avg_response_minutes - speed_fast) / (speed_slow - speed_fast))) end as speed
      ) comp
    ) qs
  ),
  scored as (
    select p.*,
           least(1, (cardinality(p.route_hits) + 0.5 * cardinality(p.stop_hits))
                    / least(cardinality(v_interests), 3))::numeric as t_score,
           case when p.cos_sim is null then null
                else greatest(0, least(1, (p.cos_sim - sim_floor) / (sim_ceil - sim_floor))) end as s_norm
    from parts p
  )
  select s.id, s.jigi_id, s.title, s.summary, s.tags, s.vibe, s.duration_minutes, s.area,
         s.max_party_size, s.languages, s.list_price,
         public.mask_name(s.host_name),
         s.stops_json,
         s.route_hits || s.stop_hits,
         round(s.t_score, 4),
         round(s.cos_sim, 4),
         round(s.q, 4),
         round(case
           when s.s_norm is null then (w_tag * s.t_score + w_q * s.q) / (w_tag + w_q)
           else (w_tag * s.t_score + w_sim * s.s_norm + w_q * s.q) / (w_tag + w_sim + w_q)
         end, 4) as final_score,
         s.n,
         s.times
  from scored s
  order by final_score desc, s.n desc, s.published_at desc nulls last, s.id
  limit v_limit;
end;
$$;

-- ---------------------------------------------------------------------
-- 권한
-- ---------------------------------------------------------------------
revoke execute on function public.save_review(uuid, integer, text, boolean) from public, anon;
revoke execute on function public.delete_review(uuid) from public, anon;
revoke execute on function public.public_jigi_reviews(uuid, integer) from public;
revoke execute on function public.admin_resolve_safety_review(uuid, text) from public, anon;
revoke execute on function public.match_routes(extensions.vector, jsonb) from public, anon;

grant execute on function public.save_review(uuid, integer, text, boolean) to authenticated;
grant execute on function public.delete_review(uuid) to authenticated;
grant execute on function public.public_jigi_reviews(uuid, integer) to anon, authenticated;
grant execute on function public.admin_resolve_safety_review(uuid, text) to authenticated;
grant execute on function public.match_routes(extensions.vector, jsonb) to authenticated;

-- 매일 한 번 지표 다시 계산 (기간이 밀리며 빠지는 요청 반영). 한국 시간 새벽 4시 20분
select cron.unschedule(jobid) from cron.job where jobname = 'yeonon-refresh-jigi-metrics';
select cron.schedule('yeonon-refresh-jigi-metrics', '20 19 * * *', 'select public.refresh_all_jigi_metrics()');

-- 처음 실행할 때 지금까지의 예약으로 지표를 채운다
select public.refresh_all_jigi_metrics();
