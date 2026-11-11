import type { APIRoute } from 'astro';
import { CRON_SECRET } from 'astro:env/server';
import { sendChatUnreadMails } from '../../../lib/mail';

export const prerender = false;

/**
 * 안 읽은 채팅 메시지 메일 (GET). Supabase pg_cron이 pg_net으로 5분마다 부른다
 * (supabase/migrations/20261110000016_chat_cron_realtime.sql, cron_hooks 'chat_unread_mail').
 * Authorization: Bearer <CRON_SECRET> 이 맞아야 한다. CRON_SECRET이 없으면 이 주소는 꺼져 있다(404).
 * 메일 키가 없으면 아무것도 보내지 않고 skipped를 돌려준다.
 */
export const GET: APIRoute = async ({ request, url }) => {
  const secret = CRON_SECRET?.trim();
  if (!secret || secret.length < 16) return new Response('Not found', { status: 404 });
  if (request.headers.get('Authorization') !== `Bearer ${secret}`) return new Response('Unauthorized', { status: 401 });
  const result = await sendChatUnreadMails(url.origin);
  return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
};
