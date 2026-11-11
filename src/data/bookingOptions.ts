/**
 * 예약 상태·사유 선택지 (여행자 화면 영어, 지기·관리자 화면 한국어).
 * 서버 페이지와 Preact 아일랜드가 같이 쓴다 — 서버 전용 코드를 import 하지 않는다.
 * 상태 흐름: supabase/migrations/20261110000010_bookings.sql
 */
export type BookingStatus = 'pending' | 'confirmed' | 'declined' | 'expired' | 'cancelled' | 'completed';
export type Lang = 'en' | 'ko';

export const BOOKING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'completed', 'declined', 'expired', 'cancelled'];

export const BOOKING_STATUS: Record<BookingStatus, { en: string; ko: string; tone: 'wait' | 'ok' | 'done' | 'off' }> = {
  pending: { en: 'Waiting for reply', ko: '응답 대기', tone: 'wait' },
  confirmed: { en: 'Confirmed', ko: '확정', tone: 'ok' },
  completed: { en: 'Completed', ko: '완료', tone: 'done' },
  declined: { en: 'Declined', ko: '거절', tone: 'off' },
  expired: { en: 'Expired', ko: '기한 만료', tone: 'off' },
  cancelled: { en: 'Cancelled', ko: '취소', tone: 'off' },
};

export const STATUS_TONE_CLASS = {
  wait: 'bg-[#FFF4D6] text-[#7A5200]',
  ok: 'bg-jigi-soft text-jigi-strong',
  done: 'bg-traveler-soft text-traveler-strong',
  off: 'bg-text/5 text-muted',
} as const;

/** 진행 중(대기·확정)인지 */
export const isActive = (s: BookingStatus) => s === 'pending' || s === 'confirmed';

/**
 * 사유는 코드로 저장한다 (예: 'schedule', 기타는 'other: 직접 쓴 말').
 * 상대방에게는 코드에 맞는 미리 정한 문구만 보여 주고, 직접 쓴 말은 보여 주지 않는다.
 */
export interface Reason { id: string; ko: string; en: string }

/** 지기의 거절 사유 */
export const DECLINE_REASONS: Reason[] = [
  { id: 'schedule', ko: '그 시간에 일정이 생겼어요', en: 'That time no longer works for your jigi.' },
  { id: 'party', ko: '인원이 루트와 맞지 않아요', en: "The group size doesn't fit this route." },
  { id: 'language', ko: '요청한 언어로 함께하기 어려워요', en: "Your jigi can't host in your language this time." },
  { id: 'other', ko: '기타', en: "Your jigi couldn't take this request." },
];

/** 여행자의 취소 사유 */
export const TRAVELER_CANCEL_REASONS: Reason[] = [
  { id: 'plans_changed', en: 'My plans changed', ko: '여행자 일정이 바뀌었어요' },
  { id: 'found_other', en: 'I picked another route', ko: '여행자가 다른 루트를 골랐어요' },
  { id: 'party_changed', en: 'My group size changed', ko: '여행자 인원이 바뀌었어요' },
  { id: 'other', en: 'Other reason', ko: '기타 사유' },
];

/** 지기의 취소 사유 */
export const JIGI_CANCEL_REASONS: Reason[] = [
  { id: 'schedule', ko: '일정이 생겼어요', en: 'Your jigi had a schedule conflict.' },
  { id: 'emergency', ko: '급한 사정이 생겼어요', en: 'Your jigi had an emergency.' },
  { id: 'safety', ko: '안전이 걱정돼요 (운영팀이 확인해요)', en: 'Your jigi had to cancel.' },
  { id: 'other', ko: '기타', en: 'Your jigi had to cancel.' },
];

export const REASON_DETAIL_MAX = 150;

/** 저장된 사유('schedule' / 'other: …')를 상대방에게 보여 줄 문구로 */
export function reasonLabel(stored: string | null, list: Reason[], lang: Lang): string | null {
  if (!stored) return null;
  const code = stored.split(':')[0].trim();
  return list.find((r) => r.id === code)?.[lang] ?? null;
}

/** 사유 코드 + (기타일 때) 직접 쓴 말 → 저장 형식 */
export function reasonValue(code: string, detail: string): string {
  const text = detail.trim().slice(0, REASON_DETAIL_MAX);
  return code === 'other' && text ? `other: ${text}` : code;
}

/** "₩45,000 → ₩0 · Early member" */
export function priceText(list: number, final: number, promotion: string | null): string {
  const won = (n: number) => `₩${n.toLocaleString('en-US')}`;
  if (final >= list) return won(list);
  return `${won(list)} → ${won(final)}${promotion ? ` · ${promotion}` : ''}`;
}

/** 한국 시간 표시 (아일랜드·서버 공용) */
export function kstWhen(iso: string, lang: Lang): string {
  const d = new Date(iso);
  return lang === 'ko'
    ? d.toLocaleString('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    : d.toLocaleString('en-US', { timeZone: 'Asia/Seoul', weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

/** 남은 시간 "3h 12m" / "3시간 12분" (지나면 null) */
export function timeLeft(iso: string, now: number, lang: Lang): string | null {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return null;
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (lang === 'ko') return h ? `${h}시간 ${m}분` : `${m}분`;
  return h ? `${h}h ${m}m` : `${m}m`;
}
