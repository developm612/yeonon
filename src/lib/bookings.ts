/**
 * 예약(bookings) 읽기 도우미와 오류 문구. 테이블·함수: supabase/migrations/20261110000010~11
 * 읽기 권한은 RLS가 정한다 — 같은 쿼리라도 여행자는 자기 예약만, 지기는 자기 루트 예약만, 관리자는 전부 받는다.
 * 예약 변경은 /api/bookings/* → DB 함수(request_booking·respond_booking·cancel_booking)로만 한다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingStatus, Lang } from '../data/bookingOptions';
import { kstToday } from './availability';
import { readInput, toQuery } from './recommend/input';
import { kstDay } from './routes';

export interface BookingRow {
  id: string;
  slot_id: string | null;
  route_id: string;
  traveler_id: string;
  jigi_id: string;
  starts_at: string;
  ends_at: string;
  route_title: string;
  meeting_area: string | null;
  meeting_point_note: string | null;
  traveler_name: string;
  jigi_name: string | null;
  party_size: number;
  note: string | null;
  status: BookingStatus;
  confirm_mode: 'manual' | 'instant';
  respond_by: string | null;
  responded_at: string | null;
  confirmed_at: string | null;
  decline_reason: string | null;
  cancelled_at: string | null;
  cancelled_role: 'traveler' | 'jigi' | 'admin' | 'system' | null;
  cancel_reason: string | null;
  late_cancel: boolean;
  expired_at: string | null;
  completed_at: string | null;
  list_price: number;
  discount_rate: number;
  final_price: number;
  promotion_name: string | null;
  recommendation_id: string | null;
  created_at: string;
  updated_at: string;
}

export const BOOKING_COLUMNS =
  'id, slot_id, route_id, traveler_id, jigi_id, starts_at, ends_at, route_title, meeting_area, meeting_point_note, traveler_name, jigi_name, party_size, note, status, confirm_mode, respond_by, responded_at, confirmed_at, decline_reason, cancelled_at, cancelled_role, cancel_reason, late_cancel, expired_at, completed_at, list_price, discount_rate, final_price, promotion_name, recommendation_id, created_at, updated_at';

/** 예약 메모 최대 길이 (DB: bookings.note 300자) */
export const BOOKING_NOTE_MAX = 300;

export interface BookingSettings {
  respond_minutes: number;
  urgent_window_minutes: number;
  urgent_respond_minutes: number;
  max_pending_per_traveler: number;
  min_lead_minutes: number;
  late_cancel_minutes: number;
  default_discount_rate: number;
}

export const SETTINGS_COLUMNS =
  'respond_minutes, urgent_window_minutes, urgent_respond_minutes, max_pending_per_traveler, min_lead_minutes, late_cancel_minutes, default_discount_rate';

const DEFAULT_SETTINGS: BookingSettings = {
  respond_minutes: 720,
  urgent_window_minutes: 1440,
  urgent_respond_minutes: 120,
  max_pending_per_traveler: 3,
  min_lead_minutes: 120,
  late_cancel_minutes: 1440,
  default_discount_rate: 0,
};

/** 예약 규칙 (booking_settings 한 행). 읽지 못하면 마이그레이션 기본값 */
export async function loadBookingSettings(supabase: SupabaseClient): Promise<BookingSettings> {
  const { data } = await supabase.from('booking_settings').select(SETTINGS_COLUMNS).maybeSingle();
  return (data as BookingSettings | null) ?? DEFAULT_SETTINGS;
}

/** "12 hours" / "2시간" 처럼 분을 읽기 쉽게 */
export function fmtMinutes(min: number, lang: Lang): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (lang === 'ko') return [h && `${h}시간`, m && `${m}분`].filter(Boolean).join(' ') || '0분';
  return [h && `${h} hour${h === 1 ? '' : 's'}`, m && `${m} min`].filter(Boolean).join(' ') || '0 min';
}

// ---------------------------------------------------------------------
// 오류 코드 → 화면 문구 (여행자 영어, 지기·관리자 한국어)
// ---------------------------------------------------------------------
export const BOOKING_ERRORS = {
  sign_in: { status: 401, en: 'Please sign in again.', ko: '다시 로그인해 주세요.' },
  travelers_only: { status: 403, en: 'Only traveler accounts can request routes.', ko: '여행자 계정만 요청할 수 있어요.' },
  jigi_inactive: { status: 403, en: 'This jigi is not active right now.', ko: '승인되어 활동 중인 지기만 응답할 수 있어요.' },
  invalid_input: { status: 400, en: 'Please check your request and try again.', ko: '입력값을 확인해 주세요.' },
  invalid_party_size: { status: 400, en: 'Choose a group size from 1 to 6.', ko: '인원은 1~6명이에요.' },
  party_too_large: { status: 400, en: 'Your group is larger than this route allows.', ko: '루트 최대 인원보다 많아요.' },
  reason_required: { status: 400, en: 'Please choose a reason.', ko: '사유를 골라 주세요.' },
  slot_not_found: { status: 404, en: 'That time is no longer available. Pick another time.', ko: '없는 시간이에요.' },
  booking_not_found: { status: 404, en: "We couldn't find that booking.", ko: '예약을 찾을 수 없어요.' },
  slot_taken: { status: 409, en: 'That time was just taken. Pick another time.', ko: '방금 다른 요청으로 마감된 시간이에요.' },
  too_soon: { status: 409, en: 'That time starts too soon to request. Pick a later time.', ko: '시작이 너무 가까워 요청할 수 없는 시간이에요.' },
  route_unavailable: { status: 409, en: "This route isn't taking requests right now.", ko: '지금은 요청을 받을 수 없는 루트예요.' },
  time_conflict: { status: 409, en: 'You already have a meetup or request at that time.', ko: '같은 시간에 이미 다른 예약이 있어요.' },
  not_pending: { status: 409, en: 'This request has already been answered.', ko: '이미 처리된 요청이에요.' },
  respond_expired: { status: 409, en: 'The reply deadline has passed.', ko: '응답 기한이 지나 처리할 수 없어요. 요청은 곧 자동으로 만료돼요.' },
  not_cancellable: { status: 409, en: "This booking can't be cancelled anymore.", ko: '이미 끝났거나 취소된 예약이에요.' },
  too_many_pending: { status: 429, en: 'You already have {max} requests waiting for a reply. Wait for an answer or cancel one first.', ko: '대기 중인 요청이 너무 많아요.' },
  too_many_requests: { status: 429, en: 'Too many requests in the last hour. Please try again later.', ko: '잠시 후 다시 시도해 주세요.' },
  server: { status: 500, en: 'Something went wrong. Please try again.', ko: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.' },
} as const;

export type BookingErrorCode = keyof typeof BOOKING_ERRORS;

/** DB 함수 오류 메시지가 정해진 코드면 그 코드, 아니면 server (자세한 내용은 서버 로그에만) */
export function bookingErrorCode(error: { message?: string; code?: string } | null, context: string): BookingErrorCode {
  const msg = error?.message ?? '';
  if (msg in BOOKING_ERRORS) return msg as BookingErrorCode;
  console.error(`[YEONON] ${context}:`, error?.code, msg);
  return 'server';
}

export function bookingMessage(code: BookingErrorCode, lang: Lang, ctx: { max?: number } = {}): string {
  return BOOKING_ERRORS[code][lang].replace('{max}', String(ctx.max ?? 3));
}

/**
 * 만료·거절·취소된 예약의 "See other routes" — 같은 조건으로 /app/discover를 연다.
 * 추천에서 왔으면 그 추천 조건(날짜가 지났으면 오늘부터), 아니면 이 루트의 관심사·날짜·인원으로 채운다.
 */
export function discoverHrefFor(
  booking: Pick<BookingRow, 'starts_at' | 'party_size'>,
  route: { tags: string[]; languages: string[] } | null,
  recInput: Record<string, unknown> | null,
): string {
  const today = kstToday();
  if (recInput) {
    const input = readInput((k) => recInput[k]);
    if (input.date_from < today) input.date_from = today;
    if (!input.date_to || input.date_to < input.date_from) input.date_to = kstToday(13);
    return `/app/discover?${toQuery(input)}`;
  }
  const day = kstDay(booking.starts_at) < today ? today : kstDay(booking.starts_at);
  const q = new URLSearchParams({ from: day, to: day, party: String(booking.party_size) });
  if (route) {
    q.set('interests', route.tags.slice(0, 5).join(','));
    q.set('lang', route.languages.slice(0, 3).join(','));
  }
  return `/app/discover?${q}`;
}
