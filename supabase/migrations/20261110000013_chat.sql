-- =====================================================================
-- Phase 6-1. 채팅: 대화방(conversations) · 메시지(messages) · 신고(message_reports) · 차단(blocks) · 채팅 규칙
-- 12번 실행 후에 실행한다. 여러 번 실행해도 된다.
-- 이 파일은 테이블·읽기 권한(RLS)만 만든다. 쓰기는 15번 파일의 함수로만 한다.
--
-- 읽기 규칙
--   대화방·메시지: 그 대화의 당사자(여행자·지기)만. 관리자도 일반 조회는 할 수 없다.
--     관리자는 신고된 대화만 admin_view_report_conversation() 함수로 열람하고, 열람할 때마다 audit_log에 남는다.
--   메시지는 보낸 뒤 수정·삭제할 수 없다 (신고 증거 보존). 읽음 표시(read_at)만 함수가 바꾼다.
-- =====================================================================

-- ---------------------------------------------------------------------
-- chat_settings: 채팅 규칙 한 행. 값을 바꿀 곳은 여기 한 곳이다 (SQL Editor에서 update).
--   예) 보관 기간을 3개월로: update public.chat_settings set retention_months = 3;
-- ---------------------------------------------------------------------
create table if not exists public.chat_settings (
  id                    boolean primary key default true check (id),
  retention_months      integer not null default 6  check (retention_months between 1 and 60),  -- 만남 완료·취소 후 대화 보관 기간
  send_per_minute       integer not null default 20 check (send_per_minute between 1 and 200),  -- 사용자당 1분 메시지 수
  unread_mail_minutes   integer not null default 10 check (unread_mail_minutes between 1 and 1440), -- 이만큼 안 읽으면 메일 1회
  reports_per_day       integer not null default 10 check (reports_per_day between 1 and 100),  -- 사용자당 하루 신고 수
  updated_at            timestamptz not null default now()
);

insert into public.chat_settings (id) values (true) on conflict (id) do nothing;

alter table public.chat_settings enable row level security;
revoke all on public.chat_settings from anon, authenticated;
grant select on public.chat_settings to authenticated;

drop policy if exists "chat_settings: member read" on public.chat_settings;
create policy "chat_settings: member read" on public.chat_settings
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- conversations: 예약 1건당 대화방 1개. 매칭 요청(request_booking)이 만든다.
--   대화 가능 여부는 예약 상태를 따른다: pending(질문만 안내)·confirmed·completed → 보낼 수 있음,
--   cancelled·declined·expired → 읽기만.
--   *_read_at: 각자 마지막으로 읽은 시각 / *_mailed_at: 안 읽은 메시지 메일을 마지막으로 보낸 시각
-- ---------------------------------------------------------------------
create table if not exists public.conversations (
  id                  uuid primary key default gen_random_uuid(),
  booking_id          uuid not null unique references public.bookings (id) on delete cascade,
  traveler_id         uuid not null references public.profiles (id) on delete cascade,
  jigi_id             uuid not null references public.profiles (id) on delete cascade,
  created_at          timestamptz not null default now(),
  last_message_at     timestamptz,
  traveler_read_at    timestamptz,
  jigi_read_at        timestamptz,
  traveler_mailed_at  timestamptz,
  jigi_mailed_at      timestamptz
);

create index if not exists conversations_traveler_idx on public.conversations (traveler_id, last_message_at desc nulls last);
create index if not exists conversations_jigi_idx on public.conversations (jigi_id, last_message_at desc nulls last);

alter table public.conversations enable row level security;
revoke all on public.conversations from anon, authenticated;
grant select on public.conversations to authenticated;

drop policy if exists "conversations: parties" on public.conversations;
create policy "conversations: parties" on public.conversations
  for select to authenticated
  using (traveler_id = (select auth.uid()) or jigi_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- messages: 텍스트만 (이미지는 1차 제외), 1~1000자.
--   recipient_id: 받는 사람 (헤더 안 읽은 수·Realtime 구독 필터용)
--   flagged / flag_reasons: 연락처·외부 결제 유도로 보이는 메시지 (규칙: 14번 파일 chat_safety_flags). 보내지는 되고 화면에 안전 안내.
-- ---------------------------------------------------------------------
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.conversations (id) on delete cascade,
  sender_id        uuid not null references public.profiles (id) on delete cascade,
  recipient_id     uuid not null references public.profiles (id) on delete cascade,
  body             text not null check (char_length(btrim(body)) between 1 and 1000),
  flagged          boolean not null default false,
  flag_reasons     text[] not null default '{}',
  created_at       timestamptz not null default now(),
  read_at          timestamptz
);

create index if not exists messages_conversation_idx on public.messages (conversation_id, created_at);
create index if not exists messages_unread_idx on public.messages (recipient_id) where read_at is null;
create index if not exists messages_sender_recent_idx on public.messages (sender_id, created_at desc);

alter table public.messages enable row level security;
-- 직접 insert/update/delete 금지 → send_message()·mark_read() 로만
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;

drop policy if exists "messages: parties" on public.messages;
create policy "messages: parties" on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (c.traveler_id = (select auth.uid()) or c.jigi_id = (select auth.uid()))
  ));

-- ---------------------------------------------------------------------
-- message_reports: 대화 신고. 신고한 사람은 자기 신고만, 관리자는 신고 목록을 읽는다 (대화 내용은 함수로만).
--   status: open(처리 대기) → dismissed(문제없음) / warned(경고) / suspended(정지)
--   대화가 지워져도(보관 기간) 신고 기록은 남는다. 처리 대기 신고가 있는 대화는 지우지 않는다.
-- ---------------------------------------------------------------------
create table if not exists public.message_reports (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references public.conversations (id) on delete set null,
  message_id       uuid references public.messages (id) on delete set null,
  reporter_id      uuid references public.profiles (id) on delete set null,
  reported_id      uuid references public.profiles (id) on delete set null,
  reason           text not null check (reason in ('harassment', 'contact_payment', 'safety', 'spam', 'other')),
  detail           text check (char_length(detail) <= 500),
  status           text not null default 'open' check (status in ('open', 'dismissed', 'warned', 'suspended')),
  handled_by       uuid references public.profiles (id) on delete set null,
  handled_at       timestamptz,
  handle_note      text check (char_length(handle_note) <= 500),
  created_at       timestamptz not null default now()
);

create index if not exists message_reports_status_idx on public.message_reports (status, created_at desc);
create index if not exists message_reports_conversation_idx on public.message_reports (conversation_id);

alter table public.message_reports enable row level security;
revoke all on public.message_reports from anon, authenticated;
grant select on public.message_reports to authenticated;

drop policy if exists "message_reports: reporter or admin" on public.message_reports;
create policy "message_reports: reporter or admin" on public.message_reports
  for select to authenticated
  using (reporter_id = (select auth.uid()) or (select public.is_admin()));

-- ---------------------------------------------------------------------
-- blocks: 차단. 둘 중 한 명이라도 차단하면 그 둘 사이에는 메시지를 보낼 수 없다.
--   차단한 사람만 자기 차단 목록을 읽는다 (차단당한 사람에게는 '보낼 수 없음'으로만 보인다).
-- ---------------------------------------------------------------------
create table if not exists public.blocks (
  blocker_id  uuid not null references public.profiles (id) on delete cascade,
  blocked_id  uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked_id);

alter table public.blocks enable row level security;
revoke all on public.blocks from anon, authenticated;
grant select on public.blocks to authenticated;

drop policy if exists "blocks: own" on public.blocks;
create policy "blocks: own" on public.blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- translation_requests: 번역 버튼 사용 기록 (사용자당 시간당 제한용). 번역 결과는 저장하지 않는다.
-- ---------------------------------------------------------------------
create table if not exists public.translation_requests (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now()
);

create index if not exists translation_requests_user_idx on public.translation_requests (user_id, created_at desc);

alter table public.translation_requests enable row level security;
revoke all on public.translation_requests from anon, authenticated;

-- ---------------------------------------------------------------------
-- cron_hooks: DB 크론이 부를 서버 주소와 비밀 값 (안 읽은 메시지 메일, 16번 파일).
--   화면·회원은 읽을 수 없다 (권한 없음). SQL Editor에서만 넣는다 — README Phase 6 참고.
-- ---------------------------------------------------------------------
create table if not exists public.cron_hooks (
  name        text primary key,
  url         text not null check (url ~ '^https://'),
  secret      text not null check (char_length(secret) >= 16),
  updated_at  timestamptz not null default now()
);

alter table public.cron_hooks enable row level security;
revoke all on public.cron_hooks from anon, authenticated;

-- 이미 있는 예약(Phase 5)에도 대화방을 만든다
insert into public.conversations (booking_id, traveler_id, jigi_id, created_at)
select b.id, b.traveler_id, b.jigi_id, b.created_at
from public.bookings b
on conflict (booking_id) do nothing;
