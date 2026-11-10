/**
 * LLM 호출 (JSON 응답). 공급자는 LLM_MODEL 이름으로 고른다:
 *   claude-* → Anthropic (공식 SDK @anthropic-ai/sdk, 구조화 출력 output_config.format)
 * 다른 공급자를 더하려면 PROVIDERS에 { matches, generateJson }을 하나 추가한다.
 * 결과 검증(형식·내용)은 호출한 쪽(lib/recommend)이 다시 한다 — 여기서는 문자열만 돌려준다.
 */
import Anthropic from '@anthropic-ai/sdk';
import { llmConfig, type ProviderConfig } from './env';

export interface JsonRequest {
  system: string;
  prompt: string;
  /** JSON Schema (object). 지원하는 공급자는 응답을 이 형식으로 강제한다 */
  schema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
  effort?: 'low' | 'medium' | 'high' | null;
}

interface LlmProvider {
  name: string;
  matches: (model: string) => boolean;
  generateJson: (cfg: ProviderConfig, req: JsonRequest) => Promise<string>;
}

/** 거절(refusal) 시 서버에서 다른 모델로 다시 시도하는 기능(fallbacks: 'default')을 받는 모델 */
const ANTHROPIC_FALLBACK_MODELS = new Set(['claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);
/** effort를 받지 않는 예전 모델 */
const ANTHROPIC_NO_EFFORT = /^claude-(haiku-4-5|sonnet-4-5|opus-4-1|3)/;

export class LlmRefusalError extends Error {}

/** 시간 제한에 걸린 오류인지 (대체 사유를 'llm_timeout'으로 남기기 위해) */
export const isTimeoutError = (e: unknown) =>
  e instanceof Anthropic.APIConnectionTimeoutError ||
  e instanceof Anthropic.APIUserAbortError ||
  (e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError'));

const anthropic: LlmProvider = {
  name: 'anthropic',
  matches: (m) => m.startsWith('claude-'),
  async generateJson(cfg, req) {
    // 시간 제한을 넘기면 바로 대체 결과를 보여 주므로 SDK 자동 재시도는 끈다
    const client = new Anthropic({ apiKey: cfg.apiKey, maxRetries: 0, timeout: req.timeoutMs });
    const params = {
      model: cfg.model,
      max_tokens: req.maxTokens,
      system: req.system,
      messages: [{ role: 'user' as const, content: req.prompt }],
      output_config: {
        format: { type: 'json_schema' as const, schema: req.schema },
        ...(req.effort && !ANTHROPIC_NO_EFFORT.test(cfg.model) ? { effort: req.effort } : {}),
      },
    };
    const signal = AbortSignal.timeout(req.timeoutMs);
    const response = ANTHROPIC_FALLBACK_MODELS.has(cfg.model)
      ? await client.beta.messages.create(
          { ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' },
          { signal },
        )
      : await client.messages.create(params, { signal });

    if (response.stop_reason === 'refusal') throw new LlmRefusalError('model declined the request');
    if (response.stop_reason === 'max_tokens') throw new Error('LLM response cut off (max_tokens)');
    return response.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
  },
};

const PROVIDERS: LlmProvider[] = [anthropic];

/** 지금 설정된 LLM 모델 이름 (키나 공급자가 없으면 null) */
export function llmModel(): string | null {
  const cfg = llmConfig();
  return cfg && PROVIDERS.some((p) => p.matches(cfg.model)) ? cfg.model : null;
}

/** JSON 문자열을 받는다. 설정이 없으면 null. 시간 초과·API 오류·거절은 예외로 던진다 */
export async function generateJson(req: JsonRequest) {
  const cfg = llmConfig();
  if (!cfg) return null;
  const provider = PROVIDERS.find((p) => p.matches(cfg.model));
  if (!provider) {
    console.warn(`[YEONON] LLM_MODEL "${cfg.model}" has no provider in src/lib/ai/llm.ts`);
    return null;
  }
  return { text: await provider.generateJson(cfg, req), model: cfg.model };
}
