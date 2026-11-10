/**
 * 루트 데이터 모양과 읽기 도우미. 테이블 정의: supabase/migrations/20261110000004_routes.sql
 * 읽기 권한은 RLS가 정한다 — 같은 쿼리라도 비회원은 공개 루트만, 지기 본인은 자기 루트 전부, 관리자는 전부 받는다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RouteStatus } from '../data/routeOptions';

export interface RouteRow {
  id: string;
  jigi_id: string;
  title: string;
  summary: string;
  tags: string[];
  vibe: 'slow' | 'active';
  duration_minutes: number;
  meeting_point_note: string;
  area: string;
  max_party_size: number;
  languages: string[];
  list_price: number;
  status: RouteStatus;
  submitted_at: string | null;
  published_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StopRow {
  order_no: number;
  place_name: string;
  area: string;
  stay_minutes: number;
  activity: string;
  tip: string | null;
  tags: string[];
}

export interface SlotRow {
  id: string;
  route_id: string;
  starts_at: string;
  ends_at: string;
  status: 'open' | 'held' | 'booked' | 'closed';
}

export interface PublicJigi {
  user_id: string;
  display_name: string;
  headline: string | null;
  bio: string | null;
  languages: string[];
  rating_avg: number | null;
  rating_count: number;
}

export const ROUTE_COLUMNS =
  'id, jigi_id, title, summary, tags, vibe, duration_minutes, meeting_point_note, area, max_party_size, languages, list_price, status, submitted_at, published_at, reviewed_at, created_at, updated_at';
export const STOP_COLUMNS = 'order_no, place_name, area, stay_minutes, activity, tip, tags';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** 루트 하나 + 정류장 (읽을 권한이 없으면 null) */
export async function loadRoute(supabase: SupabaseClient, id: string) {
  if (!UUID.test(id)) return null;
  const [{ data: route }, { data: stops }] = await Promise.all([
    supabase.from('routes').select(ROUTE_COLUMNS).eq('id', id).maybeSingle(),
    supabase.from('route_stops').select(STOP_COLUMNS).eq('route_id', id).order('order_no'),
  ]);
  if (!route) return null;
  return { route: route as RouteRow, stops: (stops ?? []) as StopRow[] };
}

export const won = (n: number) => `₩${n.toLocaleString('en-US')}`;

/** 한국 시간 기준 날짜·시각 표시 */
export const kstDate = (iso: string, locale: 'ko-KR' | 'en-US', opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString(locale, { timeZone: 'Asia/Seoul', ...opts });
export const kstDay = (iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
export const kstTime = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });

/** 승인되어 활동 중인 지기인지 (루트·가능 시간을 만들 수 있는 사람). DB 함수도 같은 조건을 다시 확인한다 */
export async function loadApprovedJigi(supabase: SupabaseClient, profile: { id: string; role: string | null; status: string }) {
  if (profile.role !== 'jigi' || profile.status !== 'active') return null;
  const { data } = await supabase.from('jigi_profiles').select('user_id, confirm_mode, is_active').eq('user_id', profile.id).maybeSingle();
  return data?.is_active ? (data as { user_id: string; confirm_mode: 'manual' | 'instant'; is_active: true }) : null;
}
