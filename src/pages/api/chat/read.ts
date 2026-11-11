import type { APIRoute } from 'astro';
import { chatErrorCode, chatFail, chatMember, chatOk, readJson } from '../../../lib/chat';
import { UUID } from '../../../lib/routes';

export const prerender = false;

/** 읽음 처리. 본문: { conversation_id } → 이 대화에서 내가 받은 메시지를 모두 읽음으로 (mark_read) */
export const POST: APIRoute = async ({ request, locals }) => {
  const me = chatMember(locals);
  if (me instanceof Response) return me;
  const body = await readJson(request);
  const id = typeof body?.conversation_id === 'string' ? body.conversation_id : '';
  if (!UUID.test(id)) return chatFail('conversation_not_found', me.lang);

  const { data, error } = await me.supabase.rpc('mark_read', { p_conversation: id });
  if (error) return chatFail(chatErrorCode(error, 'mark_read'), me.lang);
  return chatOk({ read: data });
};
