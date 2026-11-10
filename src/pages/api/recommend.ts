import type { APIRoute } from 'astro';
import { isOnboarded } from '../../lib/profile';
import { RateLimitedError, recommend } from '../../lib/recommend/engine';
import { readInput, validateInput } from '../../lib/recommend/input';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });

/**
 * AI 루트 추천 (POST, JSON). 로그인한 여행자만 (관리자는 확인용으로 허용).
 * 다른 사이트에서 보낸 POST는 src/middleware.ts의 Origin 검사가 막는다.
 * 키(LLM·임베딩)는 서버에만 있고, 없어도 점수 순 추천으로 동작한다 — lib/recommend/engine.ts
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const { user, profile, supabase } = locals;
  if (!user || !supabase) return json({ error: 'sign_in' }, 401);
  if (!profile || profile.status !== 'active' || !isOnboarded(profile) || !['traveler', 'admin'].includes(profile.role ?? '')) {
    return json({ error: 'travelers_only' }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('not an object');
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const { input, errors } = validateInput(readInput((k) => body[k]));
  if (Object.keys(errors).length) return json({ error: 'invalid_input', fields: errors }, 400);

  try {
    return json(await recommend(supabase, user.id, input));
  } catch (e) {
    if (e instanceof RateLimitedError) return json({ error: 'rate_limited', retry_after_minutes: e.retryAfterMinutes }, 429);
    console.error('[YEONON] /api/recommend failed:', (e as Error).message);
    return json({ error: 'server' }, 500);
  }
};
