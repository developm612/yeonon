import type { APIRoute } from 'astro';
import { chatErrorCode, chatFail, chatMember, chatOk, readJson } from '../../../lib/chat';
import { UUID } from '../../../lib/routes';

export const prerender = false;

/**
 * 대화 상대 차단/해제. 본문: { conversation_id, block: true|false }
 * 차단하면 둘 다 이 상대와 메시지를 보낼 수 없다. 예약은 그대로다 (필요하면 예약 화면에서 취소).
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const me = chatMember(locals);
  if (me instanceof Response) return me;
  const body = await readJson(request);
  const id = typeof body?.conversation_id === 'string' ? body.conversation_id : '';
  if (!UUID.test(id) || typeof body?.block !== 'boolean') return chatFail(UUID.test(id) ? 'invalid_input' : 'conversation_not_found', me.lang);

  const { data, error } = await me.supabase.rpc('block_conversation_user', { p_conversation: id, p_block: body.block });
  if (error) return chatFail(chatErrorCode(error, 'block_conversation_user'), me.lang);
  return chatOk({ blocked: data });
};
