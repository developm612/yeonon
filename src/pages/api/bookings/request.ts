import type { APIRoute } from 'astro';
import { bookingFail, bookingOk, guardMember, readBookingRequest, str } from '../../../lib/bookingApi';
import { BOOKING_NOTE_MAX, bookingErrorCode, loadBookingSettings } from '../../../lib/bookings';
import { mailBookingNotifications } from '../../../lib/mail';
import { redactContacts } from '../../../lib/recommend/input';
import { UUID } from '../../../lib/routes';

export const prerender = false;

/**
 * 매칭 요청 (여행자). 입력 검증 → request_booking() 한 번 (슬롯 잠금·예약·할인·알림이 한 트랜잭션).
 * 본문: { slot_id, party_size, note?, route_id?, recommendation_id? }
 *   route_id는 '방금 마감됐어요'일 때 같은 루트의 다른 시간(alternatives)을 돌려주는 데만 쓴다.
 * 메모의 연락처(이메일·전화·링크·SNS 아이디)는 지우고 저장한다 — 연락은 매칭 후 YEONON 안에서.
 */
export const POST: APIRoute = async (ctx) => {
  const started = new Date();
  const req = await readBookingRequest(ctx.request, '/app');
  const denied = guardMember(ctx, req, 'en');
  if (denied) return denied;
  if (!req) return bookingFail(req, 'invalid_input', 'en');
  const supabase = ctx.locals.supabase!;
  if (ctx.locals.profile!.role !== 'traveler') return bookingFail(req, 'travelers_only', 'en');

  const slotId = str(req.body.slot_id);
  const routeId = str(req.body.route_id);
  const recId = str(req.body.recommendation_id);
  const party = Number(str(req.body.party_size));
  const rawNote = str(req.body.note);
  if (!UUID.test(slotId)) return bookingFail(req, 'slot_not_found', 'en');
  if (!Number.isInteger(party) || party < 1 || party > 6) return bookingFail(req, 'invalid_party_size', 'en');
  if (rawNote.length > BOOKING_NOTE_MAX * 2) return bookingFail(req, 'invalid_input', 'en');
  const note = redactContacts(rawNote).slice(0, BOOKING_NOTE_MAX);

  const { data, error } = await supabase.rpc('request_booking', {
    p_slot: slotId,
    p_party_size: party,
    p_note: note || null,
    p_recommendation: UUID.test(recId) ? recId : null,
  });

  if (error) {
    const code = bookingErrorCode(error, 'request_booking');
    if (code === 'slot_taken' || code === 'slot_not_found' || code === 'too_soon') {
      // 같은 루트의 다른 열린 시간 (요청 가능한 것만, 최대 4개)
      let alternatives: { id: string; starts_at: string }[] = [];
      if (UUID.test(routeId)) {
        const settings = await loadBookingSettings(supabase);
        const { data: alt } = await supabase
          .from('slots')
          .select('id, starts_at')
          .eq('route_id', routeId)
          .eq('status', 'open')
          .gt('starts_at', new Date(Date.now() + settings.min_lead_minutes * 60_000).toISOString())
          .neq('id', slotId)
          .order('starts_at')
          .limit(4);
        alternatives = alt ?? [];
      }
      return bookingFail(req, code, 'en', { alternatives });
    }
    const max = code === 'too_many_pending' ? (await loadBookingSettings(supabase)).max_pending_per_traveler : undefined;
    return bookingFail(req, code, 'en', {}, { max });
  }

  const result = data as { id: string; status: string; respond_by: string | null };
  await mailBookingNotifications(result.id, started, ctx.url.origin);
  return bookingOk(req, result, `/app/bookings/${result.id}`, 'requested');
};
