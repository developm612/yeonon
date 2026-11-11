/**
 * /api/bookings/* 공통 처리. JSON(화면 스크립트·아일랜드)과 일반 폼 전송(스크립트가 없을 때) 둘 다 받는다.
 *   JSON → JSON으로 답한다 ({ id, status } 또는 { error, message })
 *   폼   → next 주소로 돌려보낸다 (?notice=… 또는 ?error=코드)
 * 다른 사이트에서 보낸 POST는 src/middleware.ts의 Origin 검사가 먼저 막는다.
 */
import type { APIContext } from 'astro';
import type { Lang } from '../data/bookingOptions';
import { BOOKING_ERRORS, bookingMessage, type BookingErrorCode } from './bookings';
import { isOnboarded } from './profile';
import { safeNext } from './supabase';

export interface BookingApiRequest {
  body: Record<string, unknown>;
  isForm: boolean;
  next: string;
}

export async function readBookingRequest(request: Request, fallbackNext: string): Promise<BookingApiRequest | null> {
  const type = request.headers.get('Content-Type') ?? '';
  try {
    if (type.includes('application/json')) {
      const body = (await request.json()) as unknown;
      if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
      return { body: body as Record<string, unknown>, isForm: false, next: fallbackNext };
    }
    const fd = await request.formData();
    const body = Object.fromEntries([...fd.keys()].map((k) => [k, String(fd.get(k) ?? '')]));
    return { body, isForm: true, next: safeNext(String(fd.get('next') ?? ''), fallbackNext) };
  } catch {
    return null;
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });

const withParam = (path: string, key: string, value: string) => {
  const url = new URL(path, 'http://x');
  url.searchParams.delete('notice');
  url.searchParams.delete('error');
  url.searchParams.set(key, value);
  return url.pathname + url.search + url.hash;
};

export function bookingOk(req: BookingApiRequest | null, data: Record<string, unknown>, redirectTo: string, notice: string) {
  if (req?.isForm) return new Response(null, { status: 303, headers: { Location: withParam(redirectTo, 'notice', notice) } });
  return json(data);
}

export function bookingFail(
  req: BookingApiRequest | null,
  code: BookingErrorCode,
  lang: Lang,
  extra: Record<string, unknown> = {},
  ctx: { max?: number } = {},
) {
  if (req?.isForm) return new Response(null, { status: 303, headers: { Location: withParam(req.next, 'error', code) } });
  return json({ error: code, message: bookingMessage(code, lang, ctx), ...extra }, BOOKING_ERRORS[code].status);
}

/** 로그인·온보딩·활성 회원 확인. 통과하면 null */
export function guardMember(ctx: APIContext, req: BookingApiRequest | null, lang: Lang) {
  const { user, profile, supabase } = ctx.locals;
  if (!user || !supabase) return bookingFail(req, 'sign_in', lang);
  if (!profile || profile.status !== 'active' || !isOnboarded(profile)) return bookingFail(req, 'sign_in', lang);
  return null;
}

/** 화면에서 보낸 값을 문자열로 (없으면 '') */
export const str = (v: unknown) => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');
