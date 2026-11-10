/**
 * 루트 임베딩 만들기 (제목 + 소개 + 태그 + 정류장 설명).
 * 루트 저장(지기)·공개 승인(관리자) 직후에 한 번, 관리자 백필로 한꺼번에 만든다.
 * 저장은 DB 함수 set_route_embedding으로만 한다 (마이그레이션 8번). 실패해도 저장·승인은 그대로 진행된다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { RECOMMEND } from '../../config/recommend';
import { interestNames } from '../../data/interests';
import { areaName, vibeName } from '../../data/routeOptions';
import { dbError } from '../forms';
import { embedTexts, embeddingModel, toPgVector } from './embeddings';

interface RouteText {
  title: string;
  summary: string;
  tags: string[];
  vibe: string;
  area: string;
  route_stops?: { order_no: number; place_name: string; activity: string; tags: string[] }[];
}

/** 임베딩할 글 — 공개 정보만 (지기 정보·가격·만나는 곳은 넣지 않는다) */
export function routeEmbeddingText(r: RouteText): string {
  const stops = [...(r.route_stops ?? [])].sort((a, b) => a.order_no - b.order_no);
  return [
    r.title,
    r.summary,
    `Interests: ${interestNames(r.tags, 'en').join(', ')}`,
    `Vibe: ${vibeName(r.vibe, 'en')}. Area: ${areaName(r.area, 'en')}, Seongsu, Seoul.`,
    ...stops.map((s, i) => `Stop ${i + 1}: ${s.place_name} — ${s.activity}${s.tags.length ? ` (${interestNames(s.tags, 'en').join(', ')})` : ''}`),
  ].join('\n');
}

export async function sha256(text: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const EMBED_SELECT = 'id, title, summary, tags, vibe, area, status, embedding_model, embedding_hash, route_stops(order_no, place_name, activity, tags)';
type EmbedRow = RouteText & { id: string; status: string; embedding_model: string | null; embedding_hash: string | null };

/** 내용과 모델이 그대로면 다시 만들 필요가 없다 */
async function needsEmbedding(row: EmbedRow, model: string) {
  const hash = await sha256(routeEmbeddingText(row));
  return { hash, stale: row.embedding_model !== model || row.embedding_hash !== hash };
}

async function saveEmbeddings(supabase: SupabaseClient, rows: { id: string; hash: string; text: string }[]) {
  const result = await embedTexts(rows.map((r) => r.text), 'document', RECOMMEND.routeEmbeddingTimeoutMs);
  if (!result) return 0;
  let saved = 0;
  for (const [i, row] of rows.entries()) {
    const { error } = await supabase.rpc('set_route_embedding', {
      p_id: row.id, p_embedding: toPgVector(result.vectors[i]), p_model: result.model, p_hash: row.hash,
    });
    if (!dbError(error, 'set_route_embedding')) saved++;
  }
  return saved;
}

/**
 * 루트 하나의 임베딩을 (필요하면) 만든다. 키가 없거나 실패하면 조용히 넘어간다 — 추천은 태그 점수로 동작한다.
 * 호출한 사람의 권한으로 읽고 저장한다 (지기: 자기 작성 중 루트, 관리자: 전부).
 */
export async function embedRoute(supabase: SupabaseClient, id: string) {
  const model = embeddingModel();
  if (!model) return false;
  try {
    const { data } = await supabase.from('routes').select(EMBED_SELECT).eq('id', id).maybeSingle();
    if (!data) return false;
    const row = data as unknown as EmbedRow;
    const { hash, stale } = await needsEmbedding(row, model);
    if (!stale) return true;
    return (await saveEmbeddings(supabase, [{ id, hash, text: routeEmbeddingText(row) }])) === 1;
  } catch (e) {
    console.error('[YEONON] route embedding failed:', (e as Error).message);
    return false;
  }
}

/** 관리자 백필: 임베딩이 없거나, 모델이 다르거나, 내용이 바뀐 루트를 한 번에 최대 backfillBatch개 만든다 */
export async function backfillRouteEmbeddings(supabase: SupabaseClient) {
  const model = embeddingModel();
  if (!model) return { ok: false as const, reason: 'no_key' as const };
  const { data, error } = await supabase.from('routes').select(EMBED_SELECT).neq('status', 'draft').order('published_at', { ascending: false, nullsFirst: false });
  if (dbError(error, 'backfill: load routes')) return { ok: false as const, reason: 'db' as const };

  const todo: { id: string; hash: string; text: string }[] = [];
  for (const row of (data ?? []) as unknown as EmbedRow[]) {
    const { hash, stale } = await needsEmbedding(row, model);
    if (stale) todo.push({ id: row.id, hash, text: routeEmbeddingText(row) });
  }
  const batch = todo.slice(0, RECOMMEND.backfillBatch);
  try {
    const saved = await saveEmbeddings(supabase, batch);
    return { ok: true as const, saved, remaining: todo.length - saved };
  } catch (e) {
    console.error('[YEONON] backfill failed:', (e as Error).message);
    return { ok: false as const, reason: 'api' as const, remaining: todo.length };
  }
}

/** 관리자 화면용: 임베딩 상태 (공개 루트 기준) */
export async function embeddingStatus(supabase: SupabaseClient) {
  const model = embeddingModel();
  const { data } = await supabase.from('routes').select(EMBED_SELECT).eq('status', 'published');
  const rows = (data ?? []) as unknown as EmbedRow[];
  let ready = 0;
  for (const row of rows) if (model && !(await needsEmbedding(row, model)).stale) ready++;
  return { model, published: rows.length, ready, stale: rows.length - ready };
}
