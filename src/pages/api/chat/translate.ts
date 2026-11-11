import type { APIRoute } from 'astro';
import { CHAT } from '../../../config/chat';
import { isTranslateEnabled, translateTarget, translateText } from '../../../lib/ai/translate';
import { chatErrorCode, chatFail, chatMember, chatOk, readJson } from '../../../lib/chat';
import { UUID } from '../../../lib/routes';

export const prerender = false;

/**
 * 메시지 번역 (영 ↔ 한). 본문: { message_id }
 * LLM 키가 없으면 503 (화면은 키가 없으면 버튼을 그리지 않는다). 번역은 저장하지 않는다.
 * 메시지는 사용자 권한으로 읽으므로(RLS) 내 대화의 메시지만 번역할 수 있다. 사용자당 시간당 횟수 제한.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const me = chatMember(locals);
  if (me instanceof Response) return me;
  if (!isTranslateEnabled()) return chatFail('translate_unavailable', me.lang);
  const body = await readJson(request);
  const id = typeof body?.message_id === 'string' ? body.message_id : '';
  if (!UUID.test(id)) return chatFail('message_not_found', me.lang);

  const { data: msg } = await me.supabase.from('messages').select('id, body').eq('id', id).maybeSingle();
  if (!msg) return chatFail('message_not_found', me.lang);

  const { data: allowed, error } = await me.supabase.rpc('use_translation_quota', { p_limit: CHAT.translatePerHour });
  if (error) return chatFail(chatErrorCode(error, 'use_translation_quota'), me.lang);
  if (!allowed) return chatFail('translate_limit', me.lang);

  const to = translateTarget(msg.body as string);
  try {
    const translation = await translateText(msg.body as string, to);
    if (!translation) return chatFail('translate_unavailable', me.lang);
    return chatOk({ translation, to });
  } catch (e) {
    console.error('[YEONON] translate failed:', (e as Error).message);
    return chatFail('translate_unavailable', me.lang);
  }
};
