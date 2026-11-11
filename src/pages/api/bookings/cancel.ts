import type { APIRoute } from 'astro';
import { JIGI_CANCEL_REASONS, TRAVELER_CANCEL_REASONS, reasonValue } from '../../../data/bookingOptions';
import { bookingFail, bookingOk, guardMember, readBookingRequest, str } from '../../../lib/bookingApi';
import { bookingErrorCode } from '../../../lib/bookings';
import { mailBookingNotifications } from '../../../lib/mail';
import { redactContacts } from '../../../lib/recommend/input';
import { UUID } from '../../../lib/routes';

export const prerender = false;

/**
 * 취소. 본문: { booking_id, reason(사유 코드), detail?(기타일 때) }
 *   여행자(영문 문구)·지기(한글 문구)는 자기 예약만, 관리자는 강제 취소(사유 직접 입력, audit_log 기록) — cancel_booking()이 확인한다.
 */
export const POST: APIRoute = async (ctx) => {
  const started = new Date();
  const role = ctx.locals.profile?.role;
  const lang = role === 'traveler' ? 'en' : 'ko';
  const home = role === 'traveler' ? '/app/bookings' : role === 'jigi' ? '/partner/bookings' : '/admin/bookings';
  const req = await readBookingRequest(ctx.request, home);
  const denied = guardMember(ctx, req, lang);
  if (denied) return denied;
  if (!req) return bookingFail(req, 'invalid_input', lang);
  const supabase = ctx.locals.supabase!;

  const id = str(req.body.booking_id);
  const code = str(req.body.reason);
  const detail = redactContacts(str(req.body.detail));
  if (!UUID.test(id)) return bookingFail(req, 'booking_not_found', lang);
  let reason: string;
  if (role === 'admin') {
    reason = detail.slice(0, 200);
    if (!reason) return bookingFail(req, 'reason_required', lang);
  } else {
    const list = role === 'traveler' ? TRAVELER_CANCEL_REASONS : JIGI_CANCEL_REASONS;
    if (!list.some((r) => r.id === code)) return bookingFail(req, 'reason_required', lang);
    reason = reasonValue(code, detail);
  }

  const { data, error } = await supabase.rpc('cancel_booking', { p_id: id, p_reason: reason });
  if (error) return bookingFail(req, bookingErrorCode(error, 'cancel_booking'), lang);

  await mailBookingNotifications(id, started, ctx.url.origin);
  const back = role === 'traveler' ? `/app/bookings/${id}` : role === 'jigi' ? `/partner/bookings/${id}` : req.next;
  return bookingOk(req, data as Record<string, unknown>, back, 'cancelled');
};
