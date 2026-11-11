/**
 * 채팅 메시지 번역 (영어 ↔ 한국어). LLM_API_KEY·LLM_MODEL이 있을 때만 동작한다 — 없으면 화면에 번역 버튼을 그리지 않는다.
 * 번역 결과는 저장하지 않는다. 메시지 본문만 보내고 이름·이메일 같은 회원 정보는 보내지 않는다.
 */
import { CHAT } from '../../config/chat';
import { generateJson, llmModel } from './llm';

export const isTranslateEnabled = () => llmModel() !== null;

/** 한글이 섞여 있으면 한국어 → 영어, 아니면 영어 → 한국어 */
export const translateTarget = (text: string): 'en' | 'ko' => (/[ㄱ-ㆎ가-힣]/.test(text) ? 'en' : 'ko');

const SYSTEM = `You translate short chat messages between a traveler and a local friend ("jigi") in Seoul.
Translate the user's message faithfully into the requested language. Keep the tone, emoji, times, numbers and place names.
Do not add, explain, answer or summarize. If part of the message is already in the target language, keep it as is.`;

export async function translateText(text: string, to: 'en' | 'ko'): Promise<string | null> {
  const res = await generateJson({
    system: SYSTEM,
    prompt: `Target language: ${to === 'en' ? 'English' : 'Korean'}\n\nMessage:\n${text}`,
    schema: {
      type: 'object',
      properties: { translation: { type: 'string' } },
      required: ['translation'],
      additionalProperties: false,
    },
    maxTokens: CHAT.translateMaxTokens,
    timeoutMs: CHAT.translateTimeoutMs,
    effort: 'low',
  });
  if (!res) return null;
  const parsed = JSON.parse(res.text) as { translation?: unknown };
  return typeof parsed.translation === 'string' && parsed.translation.trim() ? parsed.translation.trim().slice(0, CHAT.messageMax * 2) : null;
}
