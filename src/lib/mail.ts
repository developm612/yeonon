/**
 * 예약 알림 메일 (Resend). 서버 전용 — 키는 astro:env/server 에서만 읽는다 (PUBLIC_ 금지, .env.example 참고).
 *
 * RESEND_API_KEY · MAIL_FROM · SUPABASE_SERVICE_ROLE_KEY 가 모두 있을 때만 보낸다. 하나라도 없으면 메일만 건너뛰고,
 * 사이트 알림(notifications, 알림 종)은 DB 함수가 이미 만들어 두었으므로 그대로 남는다.
 *
 * 서비스 키는 RLS를 넘어야 하는 두 가지에만 쓴다: 받는 사람(상대방)의 이메일 조회, 알림의 emailed_at 표시.
 * 알림 제목·내용은 DB 함수가 받는 사람 언어(여행자 영어 / 지기 한국어)로 만들어 둔 것을 그대로 보낸다.
 * 크론 작업(기한 만료·만남 완료)의 알림은 서버를 거치지 않으므로 사이트 알림만 남는다.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { MAIL_FROM, RESEND_API_KEY, SUPABASE_SERVICE_ROLE_KEY } from 'astro:env/server';
import { SUPABASE_URL } from './supabase';

const SEND_TIMEOUT_MS = 4000;

export const isMailConfigured = () => Boolean(RESEND_API_KEY && MAIL_FROM && SUPABASE_SERVICE_ROLE_KEY && SUPABASE_URL);

let serviceClient: SupabaseClient | undefined;
function service(): SupabaseClient {
  serviceClient ??= createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

async function send(to: string, subject: string, text: string, html: string): Promise<boolean> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: MAIL_FROM, to: [to], subject, text, html }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) console.error('[YEONON] mail send failed:', res.status, (await res.text()).slice(0, 200));
  return res.ok;
}

/**
 * 안 읽은 채팅 메시지 메일 (Phase 6). DB 크론이 5분마다 /api/cron/chat-unread-mail 을 부르면 실행된다.
 * 후보(chat_unread_mail_candidates): 받은 메시지를 10분(설정값) 넘게 안 읽었고, 마지막 메일 뒤로 안 읽은 대화 — 대화당 1회.
 * 메시지 내용은 메일에 넣지 않는다 (상대 이름·루트 이름·안 읽은 수만). 보낸 수를 돌려준다.
 */
export async function sendChatUnreadMails(origin: string): Promise<{ sent: number; skipped: string | null }> {
  if (!isMailConfigured()) return { sent: 0, skipped: 'mail_not_configured' };
  const sb = service();
  const { data, error } = await sb.rpc('chat_unread_mail_candidates');
  if (error) {
    console.error('[YEONON] chat mail: candidates:', error.message);
    return { sent: 0, skipped: 'db_error' };
  }
  const rows = (data ?? []) as { conversation_id: string; recipient_id: string; recipient_role: 'traveler' | 'jigi'; email: string; unread: number; route_title: string; other_name: string | null }[];
  let sent = 0;
  for (const r of rows) {
    // 샘플·테스트 계정은 보내지 않지만, 다시 후보가 되지 않게 보낸 것으로 표시한다
    if (r.email && !r.email.endsWith('.invalid')) {
      const ko = r.recipient_role === 'jigi';
      const url = `${origin}/${ko ? 'partner' : 'app'}/messages/${r.conversation_id}`;
      const who = r.other_name ?? (ko ? '여행자' : 'Your jigi');
      const subject = ko ? `[YEONON] ${who}님의 안 읽은 메시지 ${r.unread}개` : `[YEONON] ${r.unread} unread message${r.unread === 1 ? '' : 's'} from ${who}`;
      const text = ko
        ? `${r.route_title} 대화에 안 읽은 메시지가 있어요.\n\n${url}\n\n— YEONON`
        : `You have unread messages about ${r.route_title}.\n\n${url}\n\n— YEONON`;
      const html = `<p>${escapeHtml(text.split('\n\n')[0])}</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p style="color:#667085">— YEONON</p>`;
      try {
        if (!(await send(r.email, subject, text, html))) continue;
        sent++;
      } catch (e) {
        console.error('[YEONON] chat mail send error:', (e as Error).message);
        continue;
      }
    }
    const { error: markError } = await sb.rpc('chat_mark_unread_mailed', { p_conversation: r.conversation_id, p_recipient: r.recipient_id });
    if (markError) console.error('[YEONON] chat mail: mark:', markError.message);
  }
  return { sent, skipped: null };
}

/**
 * 방금(since 이후) 이 예약에 만들어진 알림 중 아직 메일로 안 보낸 것을 받는 사람에게 보낸다.
 * 실패해도 예약 처리에는 영향이 없다 (로그만 남긴다).
 */
export async function mailBookingNotifications(bookingId: string, since: Date, origin: string): Promise<void> {
  if (!isMailConfigured()) return;
  try {
    const sb = service();
    // 서버와 DB 시계 차이를 감안해 1분 앞부터
    const from = new Date(since.getTime() - 60_000).toISOString();
    const { data: found, error } = await sb
      .from('notifications')
      .select('id, user_id, title, body, link, created_at')
      .eq('booking_id', bookingId)
      .is('emailed_at', null)
      .gte('created_at', from);
    if (error || !found?.length) {
      if (error) console.error('[YEONON] mail: load notifications:', error.message);
      return;
    }
    // 방금 그 DB 함수 호출(한 트랜잭션 = 같은 created_at)이 만든 알림만. 그전에 못 보낸 알림까지 다시 보내지 않는다
    const latest = found.reduce((max, n) => (n.created_at > max ? n.created_at : max), found[0].created_at);
    const notes = found.filter((n) => n.created_at === latest);
    const { data: people } = await sb
      .from('profiles')
      .select('id, email, status')
      .in('id', [...new Set(notes.map((n) => n.user_id))]);
    const emailOf = new Map((people ?? []).filter((p) => p.status === 'active' && p.email).map((p) => [p.id, p.email as string]));

    const sent: string[] = [];
    await Promise.all(
      notes.map(async (n) => {
        const to = emailOf.get(n.user_id);
        // 샘플·테스트 계정(.invalid)에는 보내지 않는다
        if (!to || to.endsWith('.invalid')) return;
        const url = n.link ? `${origin}${n.link}` : origin;
        const text = `${n.body}\n\n${url}\n\n— YEONON`;
        const html = `<p>${escapeHtml(n.body)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p><p style="color:#667085">— YEONON</p>`;
        try {
          if (await send(to, `[YEONON] ${n.title}`, text, html)) sent.push(n.id);
        } catch (e) {
          console.error('[YEONON] mail send error:', (e as Error).message);
        }
      }),
    );
    if (sent.length) await sb.from('notifications').update({ emailed_at: new Date().toISOString() }).in('id', sent);
  } catch (e) {
    console.error('[YEONON] mail failed:', (e as Error).message);
  }
}
