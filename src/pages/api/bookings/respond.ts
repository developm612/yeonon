import type { APIRoute } from 'astro';
import { DECLINE_REASONS, reasonValue } from '../../../data/bookingOptions';
import { bookingFail, bookingOk, guardMember, readBookingRequest, str } from '../../../lib/bookingApi';
import { bookingErrorCode } from '../../../lib/bookings';
import { mailBookingNotifications } from '../../../lib/mail';
import { redactContacts } from '../../../lib/recommend/input';
import { UUID } from '../../../lib/routes';

export const prerender = false;

/**
 * 지기의 수락/거절. 본문: { booking_id, accept: true|false, reason?(거절 사유 코드), detail?(기타일 때) }
 * 그 예약의 지기인지·기한 안인지는 respond_booking()이 확인한다. 오류 문구는 한국어.
 */
export const POST: APIRoute = async (ctx) => {
  const started = new Date();
  const req = await readBookingRequest(ctx.request, '/partner/bookings');
  const denied = guardMember(ctx, req, 'ko');
  if (denied) return denied;
  if (!req) return bookingFail(req, 'invalid_input', 'ko');
  const supabase = ctx.locals.supabase!;
  if (ctx.locals.profile!.role !== 'jigi') return bookingFail(req, 'jigi_inactive', 'ko');

  const id = str(req.body.booking_id);
  const accept = str(req.body.accept) === 'true';
  const code = str(req.body.reason);
  if (!UUID.test(id)) return bookingFail(req, 'booking_not_found', 'ko');
  if (!accept && !DECLINE_REASONS.some((r) => r.id === code)) return bookingFail(req, 'reason_required', 'ko');

  const { data, error } = await supabase.rpc('respond_booking', {
    p_id: id,
    p_accept: accept,
    p_reason: accept ? null : reasonValue(code, redactContacts(str(req.body.detail))),
  });
  if (error) return bookingFail(req, bookingErrorCode(error, 'respond_booking'), 'ko');

  await mailBookingNotifications(id, started, ctx.url.origin);
  return bookingOk(req, data as Record<string, unknown>, `/partner/bookings/${id}`, accept ? 'accepted' : 'declined');
};
