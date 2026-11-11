-- =====================================================================
-- Phase 6-4. 채팅 예약 작업(pg_cron) · 안 읽은 메시지 메일 호출(pg_net) · 실시간(Realtime)
-- 15번 실행 후에 실행한다. 여러 번 실행해도 된다.
-- pg_cron은 7번 파일에서 켰다. pg_net은 아래에서 켠다 (Dashboard → Database → Extensions → pg_net 으로도 켤 수 있다).
-- =====================================================================

create extension if not exists pg_net;

-- 1. 보관 기간 지난 대화 지우기: 매일 04:10 KST (= 19:10 UTC)
select cron.unschedule(jobid) from cron.job where jobname in ('yeonon-purge-conversations', 'yeonon-chat-unread-mail');
select cron.schedule('yeonon-purge-conversations', '10 19 * * *', 'select public.purge_old_conversations()');

-- 2. 안 읽은 메시지 메일: 5분마다 서버 주소를 부른다. 메일은 서버(Resend)가 보낸다.
--    cron_hooks에 'chat_unread_mail' 주소·비밀 값이 없으면 아무것도 하지 않는다. 넣는 방법:
--      insert into public.cron_hooks (name, url, secret)
--      values ('chat_unread_mail', 'https://<사이트 주소>/api/cron/chat-unread-mail', '<Vercel CRON_SECRET과 같은 값>')
--      on conflict (name) do update set url = excluded.url, secret = excluded.secret, updated_at = now();
--    서버도 메일 키(RESEND_API_KEY·MAIL_FROM·SUPABASE_SERVICE_ROLE_KEY)가 없으면 건너뛴다.
create or replace function public.run_chat_unread_mail_hook()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  h public.cron_hooks;
begin
  select * into h from public.cron_hooks where name = 'chat_unread_mail';
  if not found then
    return;
  end if;
  perform net.http_get(
    url := h.url,
    headers := jsonb_build_object('Authorization', 'Bearer ' || h.secret),
    timeout_milliseconds := 20000
  );
end;
$$;

revoke execute on function public.run_chat_unread_mail_hook() from public, anon, authenticated;
select cron.schedule('yeonon-chat-unread-mail', '*/5 * * * *', 'select public.run_chat_unread_mail_hook()');

-- 3. Realtime: 메시지·대화방 변경을 브라우저로 바로 보낸다 (postgres_changes).
--    Realtime도 구독자의 로그인 토큰으로 위 RLS(select 정책)를 확인한 뒤에만 보내므로, 내 대화가 아닌 메시지는 받지 못한다.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations') then
    alter publication supabase_realtime add table public.conversations;
  end if;
end;
$$;
