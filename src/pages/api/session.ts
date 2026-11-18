/**
 * 지금 보는 사람의 로그인 상태 (캐시하는 공개 화면용 — lib/publicCache.ts, scripts/session.ts).
 * 루트 피드·루트 상세의 HTML은 CDN이 누구에게나 같은 것을 주므로, 사람마다 다른 부분은 브라우저가 이 값을 보고 채운다.
 * middleware가 세션을 읽고(만료가 가까우면 갱신 쿠키도 여기서 쓴다) 캐시하지 않는다(private, no-store).
 *   ?tab=travelers|jigi : 그 화면을 봤다고 기억 (yeonon_tab 쿠키 — middleware가 다른 페이지에서 하는 것과 같다)
 *   ?home=1             : 주소에 아무 값 없이 첫 화면(/)을 연 경우 — 지기 탭으로 돌려보낼지 (middleware와 같은 규칙)
 */
import type { APIRoute } from 'astro';
import { isOnboarded } from '../../lib/profile';

export const prerender = false;

const TAB_COOKIE = 'yeonon_tab';

export interface SessionInfo {
  /** 가입을 마친 활동 회원 (헤더 알림·채팅·내 정보) */
  member: { id: string; role: 'traveler' | 'jigi' | 'admin'; initial: string } | null;
  /** 로그인했지만 가입(온보딩) 전 → 헤더에 Sign up */
  signup: boolean;
  /** 이 주소로 바로 이동 (지기 탭 기억) */
  bounce: string | null;
}

export const GET: APIRoute = ({ url, cookies, locals }) => {
  const { user, profile } = locals;
  const active = Boolean(user && profile && profile.status === 'active');
  const member = active && isOnboarded(profile!) ? profile! : null;
  const tab = cookies.get(TAB_COOKIE)?.value;

  // middleware.ts의 첫 화면 규칙과 같다: 여행자 계정이 아니고, 마지막 탭이 지기(또는 기억이 없는 지기 계정)이면 /partner
  const bounce =
    url.searchParams.get('home') === '1' && profile?.role !== 'traveler' && (tab === 'jigi' || (!tab && profile?.role === 'jigi'))
      ? '/partner'
      : null;

  const seen = url.searchParams.get('tab');
  if (!bounce && (seen === 'travelers' || seen === 'jigi') && seen !== tab) {
    cookies.set(TAB_COOKIE, seen, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: url.protocol === 'https:' });
  }

  const body: SessionInfo = {
    member: member
      ? { id: member.id, role: member.role as 'traveler' | 'jigi' | 'admin', initial: member.display_name?.slice(0, 1) ?? '' }
      : null,
    signup: active && !member,
    bounce,
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });
};
