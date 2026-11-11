import type { APIRoute } from 'astro';
import { CHAT } from '../../../config/chat';
import { chatErrorCode, chatFail, chatMember, chatOk, readJson } from '../../../lib/chat';
import { UUID } from '../../../lib/routes';

export const prerender = false;

/**
 * 메시지 보내기. 본문: { conversation_id, body }
 * 당사자·차단·예약 상태·1분 제한·연락처 감지(flagged)는 send_message()가 확인한다. 저장된 메시지를 돌려준다.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const me = chatMember(locals);
  if (me instanceof Response) return me;
  const body = await readJson(request);
  const id = typeof body?.conversation_id === 'string' ? body.conversation_id : '';
  const text = typeof body?.body === 'string' ? body.body.trim() : '';
  if (!UUID.test(id)) return chatFail('conversation_not_found', me.lang);
  if (!text || text.length > CHAT.messageMax) return chatFail('invalid_message', me.lang);

  const { data, error } = await me.supabase.rpc('send_message', { p_conversation: id, p_body: text });
  if (error) return chatFail(chatErrorCode(error, 'send_message'), me.lang);
  return chatOk({ message: data });
};
