/**
 * 루트 상세 데이터 (pages/routes/[id].astro, 그리고 캐시된 공개 화면에서 브라우저가 가져가는 /fragments/route-cta/[id]).
 * 루트·정류장·예약 설정 → 지기·열린 시간·후기, 그리고 보는 사람이 여행자이면 할인가(booking_quote)·대기 중 요청 수·추천 기록.
 * 읽기 권한은 DB RLS가 정한다 (공개 전 루트는 주인 지기·관리자에게만).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadBookingSettings, type BookingSettings } from './bookings';
import { dbError } from './forms';
import { isOnboarded, type Profile } from './profile';
import { loadPublicReviews, type PublicReview } from './reviews';
import { loadRoute, UUID, type PublicJigi, type RouteRow, type SlotRow, type StopRow } from './routes';

export interface Quote { list_price: number; discount_rate: number; final_price: number; promotion_name: string | null }

export interface RouteView {
  route: RouteRow;
  stops: StopRow[];
  settings: BookingSettings;
  isPreview: boolean;
  /** 요청할 수 있는 사람: 가입을 마친 활동 여행자 */
  canRequest: boolean;
  host: PublicJigi | null;
  slots: SlotRow[];
  reviews: PublicReview[];
  quote: Quote | null;
  pendingCount: number;
  /** 추천 결과에서 왔을 때(?rec=) 그 추천의 조건 */
  recInput: Record<string, unknown> | null;
}

export async function loadRouteView(
  supabase: SupabaseClient,
  id: string,
  { profile = null, rec = '', reviews: withReviews = true }: { profile?: Profile | null; rec?: string; reviews?: boolean } = {},
): Promise<RouteView | null> {
  // 루트와 예약 설정은 서로 기다릴 필요가 없어 한 번에 불러온다 (DB 왕복을 줄여 첫 화면을 빨리)
  const [loaded, settings] = await Promise.all([loadRoute(supabase, id), loadBookingSettings(supabase)]);
  if (!loaded) return null;
  const { route } = loaded;
  const isPreview = route.status !== 'published';
  const canRequest = Boolean(profile && profile.role === 'traveler' && isOnboarded(profile) && profile.status === 'active');
  // 시작 N분(설정값) 전까지만 요청할 수 있으므로 그보다 이른 시간은 보여 주지 않는다
  const earliest = new Date(Date.now() + settings.min_lead_minutes * 60_000).toISOString();
  const [{ data: j }, { data: s }, recRow, q, pend, rv] = await Promise.all([
    supabase.from('public_jigis').select('*').eq('user_id', route.jigi_id).maybeSingle(),
    supabase.from('slots').select('id, route_id, starts_at, ends_at, status').eq('route_id', route.id).eq('status', 'open')
      .gt('starts_at', earliest).order('starts_at').limit(200),
    canRequest && UUID.test(rec)
      ? supabase.from('recommendation_requests').select('id, input').eq('id', rec).maybeSingle()
      : Promise.resolve({ data: null }),
    canRequest && !isPreview ? supabase.rpc('booking_quote', { p_route: route.id }) : Promise.resolve({ data: null, error: null }),
    canRequest ? supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('traveler_id', profile!.id).eq('status', 'pending') : Promise.resolve({ count: 0 }),
    withReviews ? loadPublicReviews(supabase, route.jigi_id) : Promise.resolve([] as PublicReview[]),
  ]);
  dbError(q.error, 'booking quote');
  return {
    ...loaded,
    settings,
    isPreview,
    canRequest,
    host: (j as PublicJigi | null) ?? null,
    slots: (s ?? []) as SlotRow[],
    reviews: rv,
    quote: ((q.data as Quote[] | null) ?? [])[0] ?? null,
    pendingCount: pend.count ?? 0,
    recInput: (recRow.data?.input as Record<string, unknown> | undefined) ?? null,
  };
}

/** 보는 사람에 따른 요청 영역 (components/routes/RequestCta.astro) */
export function ctaViewer(user: unknown, profile: Profile | null, canRequest: boolean): 'traveler' | 'anon' | 'signup' | 'other' {
  if (canRequest) return 'traveler';
  if (!user) return 'anon';
  if (profile && !isOnboarded(profile)) return 'signup';
  return 'other';
}
