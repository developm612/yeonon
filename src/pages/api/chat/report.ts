import type { APIRoute } from 'astro';
import { CHAT } from '../../../config/chat';
import { REPORT_REASONS } from '../../../data/chatOptions';
import { chatErrorCode, chatFail, chatMember, chatOk, readJson } from '../../../lib/chat';
import { redactContacts } from '../../../lib/recommend/input';
import { UUID } from '../../../lib/routes';

export const prerender = false;

/**
 * 대화 신고. 본문: { conversation_id, reason, detail?, message_id? }
 * 관리자는 신고된 대화만 열람할 수 있다 (열람 기록이 남는다). 신고 내용의 연락처는 지우고 저장한다.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const me = chatMember(locals);
  if (me instanceof Response) return me;
  const body = await readJson(request);
  const id = typeof body?.conversation_id === 'string' ? body.conversation_id : '';
  const reason = typeof body?.reason === 'string' ? body.reason : '';
  const messageId = typeof body?.message_id === 'string' && UUID.test(body.message_id) ? body.message_id : null;
  const detail = typeof body?.detail === 'string' ? redactContacts(body.detail).slice(0, CHAT.reportDetailMax) : '';
  if (!UUID.test(id)) return chatFail('conversation_not_found', me.lang);
  if (!REPORT_REASONS.some((r) => r.id === reason)) return chatFail('invalid_reason', me.lang);

  const { data, error } = await me.supabase.rpc('report_conversation', {
    p_conversation: id,
    p_reason: reason,
    p_detail: detail || null,
    p_message: messageId,
  });
  if (error) return chatFail(chatErrorCode(error, 'report_conversation'), me.lang);
  return chatOk({ report_id: data });
};
