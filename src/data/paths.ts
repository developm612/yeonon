/**
 * 앱 주소 (yeonon-app-first-plan.md 2장). 여행자 주소는 짧게, 지기는 /partner/*, 관리자는 /admin/*.
 * 옛 주소(/app/*, /routes, 설명·미리보기 페이지)는 301로 새 주소에 연결한다 — 이미 보낸 알림·메일·공유 링크가 깨지지 않게.
 *   규칙은 아래 legacyRedirect() 한 곳 — 옛 주소는 다른 페이지에 걸리지 않으므로 src/pages/[...legacy].astro(서버)가 받아 이동시킨다.
 *   (정적 404로 빠지면 운영에서 이동 규칙이 돌지 않으므로 서버 페이지로 받는다.) 랜딩 주소는 site.ts landingUrl을 따른다.
 */
import { landingUrl } from '../config/site';

export const PATHS = {
  home: '/',
  forYou: '/for-you',
  forYouResults: '/for-you/results',
  bookings: '/bookings',
  chats: '/chats',
  me: '/me',
  partner: '/partner',
  route: (id: string) => `/routes/${id}`,
} as const;

/** 로그인이 필요한 여행자 영역 */
export const TRAVELER_BASES = [PATHS.forYou, PATHS.bookings, PATHS.chats, PATHS.me];

/** 옛 주소 → 새 주소 (없으면 null). 쿼리(?…)는 middleware가 그대로 붙인다 */
export function legacyRedirect(path: string): string | null {
  const p = path.replace(/\/$/, '') || '/';
  const m = (re: RegExp) => p.match(re);
  let r: RegExpMatchArray | null;
  if (p === '/app') return PATHS.home;
  if (p === '/app/discover') return PATHS.forYou;
  if (p === '/app/discover/results') return PATHS.forYouResults;
  if ((r = m(/^\/app\/bookings(\/.*)?$/))) return PATHS.bookings + (r[1] ?? '');
  if ((r = m(/^\/app\/messages(\/.*)?$/))) return PATHS.chats + (r[1] ?? '');
  if (p === '/app/profile') return PATHS.me;
  if ((r = m(/^\/app\/routes\/([^/]+)$/))) return PATHS.route(r[1]);
  if (p.startsWith('/app/')) return PATHS.home;
  if (p === '/routes') return PATHS.home;
  if (p === '/jigi') return PATHS.partner;
  // 설명·미리보기 페이지는 새 랜딩 사이트로 (주소가 아직 없으면 앱 첫 화면)
  if (['/travelers', '/how-it-works', '/app-preview', '/app-preview-jigi'].includes(p)) return landingUrl('app_redirect') ?? PATHS.home;
  return null;
}
