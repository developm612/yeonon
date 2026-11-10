/**
 * AI 공급자 설정 (서버 전용). 키·모델 이름은 환경 변수에서만 읽는다 — astro.config.mjs의 env.schema, .env.example 참고.
 * 키가 없으면 해당 기능은 null이 되고, 추천은 AI 없이(태그 겹침 + 품질 점수, 템플릿 이유) 동작한다.
 */
import { EMBEDDING_API_KEY, EMBEDDING_MODEL, LLM_API_KEY, LLM_MODEL } from 'astro:env/server';

export interface ProviderConfig {
  apiKey: string;
  model: string;
}

const pick = (key: string | undefined, model: string | undefined): ProviderConfig | null => {
  const k = key?.trim();
  const m = model?.trim();
  return k && m ? { apiKey: k, model: m } : null;
};

export const llmConfig = () => pick(LLM_API_KEY, LLM_MODEL);
export const embeddingConfig = () => pick(EMBEDDING_API_KEY, EMBEDDING_MODEL);
