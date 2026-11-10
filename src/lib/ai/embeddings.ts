/**
 * 임베딩(문장 → 벡터) 호출. 공급자는 EMBEDDING_MODEL 이름으로 고른다:
 *   voyage-*          → Voyage AI   (output_dimension = EMBEDDING_DIM)
 *   text-embedding-3-* → OpenAI     (dimensions = EMBEDDING_DIM)
 * 공급자를 더하려면 PROVIDERS에 { matches, embed }를 하나 추가한다. 결과 벡터 길이는 반드시 EMBEDDING_DIM이어야 한다.
 */
import { EMBEDDING_DIM } from '../../config/recommend';
import { embeddingConfig, type ProviderConfig } from './env';

/** document = 루트 내용(저장용), query = 여행자 취향(검색용). 공급자에 따라 다르게 처리된다 */
export type EmbedKind = 'document' | 'query';

interface EmbeddingProvider {
  name: string;
  matches: (model: string) => boolean;
  embed: (cfg: ProviderConfig, texts: string[], kind: EmbedKind, signal: AbortSignal) => Promise<number[][]>;
}

async function postJson(url: string, apiKey: string, body: unknown, signal: AbortSignal) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(`embedding API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<{ data: { embedding: number[]; index: number }[] }>;
}

const byIndex = (data: { embedding: number[]; index: number }[]) =>
  [...data].sort((a, b) => a.index - b.index).map((d) => d.embedding);

const PROVIDERS: EmbeddingProvider[] = [
  {
    name: 'voyage',
    matches: (m) => m.startsWith('voyage-'),
    embed: async (cfg, texts, kind, signal) =>
      byIndex((await postJson('https://api.voyageai.com/v1/embeddings', cfg.apiKey, {
        model: cfg.model, input: texts, input_type: kind, output_dimension: EMBEDDING_DIM,
      }, signal)).data),
  },
  {
    name: 'openai',
    matches: (m) => m.startsWith('text-embedding-3'),
    embed: async (cfg, texts, _kind, signal) =>
      byIndex((await postJson('https://api.openai.com/v1/embeddings', cfg.apiKey, {
        model: cfg.model, input: texts, dimensions: EMBEDDING_DIM,
      }, signal)).data),
  },
];

/** 지금 설정된 임베딩 모델 이름 (키나 공급자가 없으면 null) */
export function embeddingModel(): string | null {
  const cfg = embeddingConfig();
  return cfg && PROVIDERS.some((p) => p.matches(cfg.model)) ? cfg.model : null;
}

/**
 * 여러 문장을 한 번에 벡터로. 설정이 없으면 null (호출한 쪽이 AI 없이 진행한다).
 * 시간 초과·API 오류·차원 불일치는 예외로 던진다.
 */
export async function embedTexts(texts: string[], kind: EmbedKind, timeoutMs: number) {
  const cfg = embeddingConfig();
  if (!cfg || texts.length === 0) return null;
  const provider = PROVIDERS.find((p) => p.matches(cfg.model));
  if (!provider) {
    console.warn(`[YEONON] EMBEDDING_MODEL "${cfg.model}" has no provider in src/lib/ai/embeddings.ts`);
    return null;
  }
  const vectors = await provider.embed(cfg, texts, kind, AbortSignal.timeout(timeoutMs));
  if (vectors.length !== texts.length || vectors.some((v) => v.length !== EMBEDDING_DIM)) {
    throw new Error(`embedding size mismatch (expected ${texts.length} × ${EMBEDDING_DIM})`);
  }
  return { vectors, model: cfg.model };
}

/** pgvector 입력 형식 '[0.1,0.2,…]' */
export const toPgVector = (v: number[]) => `[${v.join(',')}]`;
