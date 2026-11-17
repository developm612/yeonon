/**
 * 공개 루트 카드 목록 (components/ui/RouteCard.astro에 넘길 값) — 첫 화면 루트 피드(loadFeed)와 견본 페이지가 쓴다.
 * 공개(published) 루트만 — 읽기 권한은 DB RLS가 다시 거른다. 지기 이름은 public_jigis(일부만).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { areaName } from '../data/routeOptions';
import { dbError } from './forms';
import { ROUTE_COLUMNS, type PublicJigi, type RouteRow } from './routes';

export interface RouteCardData {
  id: string;
  title: string;
  photo: string | null;
  stops: string[];
  durationMinutes: number;
  area: string;
  host: { name: string; rating: number | null; reviews: number };
  slots: string[];
  slotCount: number;
}

export async function loadRouteCards(
  supabase: SupabaseClient,
  { tag = null, limit = 60, exclude = [] }: { tag?: string | null; limit?: number; exclude?: string[] } = {},
): Promise<RouteCardData[]> {
  let query = supabase.from('routes').select(ROUTE_COLUMNS).eq('status', 'published').order('published_at', { ascending: false }).limit(limit + exclude.length);
  if (tag) query = query.contains('tags', [tag]);
  const { data, error } = await query;
  dbError(error, 'list public routes');
  const routes = ((data ?? []) as RouteRow[]).filter((r) => !exclude.includes(r.id)).slice(0, limit);
  return cardsFor(supabase, routes);
}

/** 루트 행 → 카드 값 (정류장 이름, 앞으로 열린 시간, 지기 이름·평점) */
async function cardsFor(supabase: SupabaseClient, routes: RouteRow[]): Promise<RouteCardData[]> {
  const ids = routes.map((r) => r.id);
  if (!ids.length) return [];
  const [{ data: stops }, { data: slots }, { data: jigis }] = await Promise.all([
    supabase.from('route_stops').select('route_id, order_no, place_name').in('route_id', ids).order('order_no'),
    supabase.from('slots').select('route_id, starts_at').in('route_id', ids).eq('status', 'open').gt('starts_at', new Date().toISOString()).order('starts_at').limit(1000),
    supabase.from('public_jigis').select('*').in('user_id', [...new Set(routes.map((r) => r.jigi_id))]),
  ]);
  const stopNames = new Map<string, string[]>();
  for (const s of stops ?? []) stopNames.set(s.route_id, [...(stopNames.get(s.route_id) ?? []), s.place_name]);
  const open = new Map<string, string[]>();
  for (const s of slots ?? []) open.set(s.route_id, [...(open.get(s.route_id) ?? []), s.starts_at]);
  const hosts = new Map(((jigis ?? []) as PublicJigi[]).map((j) => [j.user_id, j]));

  return routes.map((r) => {
    const h = hosts.get(r.jigi_id);
    const times = open.get(r.id) ?? [];
    return {
      id: r.id,
      title: r.title,
      photo: r.cover_photo,
      stops: stopNames.get(r.id) ?? [],
      durationMinutes: r.duration_minutes,
      area: areaName(r.area, 'en'),
      host: {
        name: h?.display_name ?? 'Jigi',
        rating: h && h.rating_count > 0 && h.rating_avg !== null ? Number(h.rating_avg) : null,
        reviews: h?.rating_count ?? 0,
      },
      slots: times.slice(0, 3),
      slotCount: times.length,
    };
  });
}

/**
 * 첫 화면 루트 피드 (yeonon-app-first-plan.md 1-1): 검색어·관심사로 거르고, 가장 가까운 열린 시간 순으로.
 * 열린 시간이 없는 루트는 맨 뒤 (최근 공개 순). page마다 perPage개씩 더 보여 준다 ('Load more').
 */
export async function loadFeed(
  supabase: SupabaseClient,
  { tag = null, q = '', page = 1, perPage = 20 }: { tag?: string | null; q?: string; page?: number; perPage?: number },
): Promise<{ items: RouteCardData[]; total: number }> {
  let query = supabase.from('routes').select(ROUTE_COLUMNS).eq('status', 'published').order('published_at', { ascending: false }).limit(200);
  if (tag) query = query.contains('tags', [tag]);
  // 검색어는 PostgREST 필터 문법 문자( , ( ) * % \ )를 빼고 제목·소개에서 찾는다
  const term = q.replace(/[,()*%\\]/g, ' ').trim().slice(0, 50);
  if (term) query = query.or(`title.ilike.%${term}%,summary.ilike.%${term}%`);
  const { data, error } = await query;
  dbError(error, 'load route feed');
  const ids = ((data ?? []) as RouteRow[]).map((r) => r.id);
  if (!ids.length) return { items: [], total: 0 };
  const all = await cardsFor(supabase, (data ?? []) as RouteRow[]);
  const sorted = all
    .map((c, i) => ({ c, i }))
    .sort((a, b) => {
      const x = a.c.slots[0], y = b.c.slots[0];
      if (x && y) return x.localeCompare(y);
      if (x || y) return x ? -1 : 1;
      return a.i - b.i;
    })
    .map(({ c }) => c);
  return { items: sorted.slice(0, page * perPage), total: sorted.length };
}
