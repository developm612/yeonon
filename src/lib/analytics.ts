import type { AstroCookies } from 'astro';
import { GA_EVENT_COOKIE } from '../config/analytics';

export type AnalyticsParams = Record<string, string | number | boolean>;

/**
 * 서버에서 실제로 성공한 일(로그인·회원가입·매칭 신청)을 GA 이벤트로 예약한다.
 * 짧은 수명의 쿠키에 담아 두면 다음에 열리는 화면(components/Analytics.astro)이 한 번 보내고 바로 지운다.
 * 개인 식별 정보(이름·이메일·전화번호·메모)는 넣지 않는다.
 */
export function queueAnalyticsEvent(cookies: AstroCookies, url: URL, name: string, params: AnalyticsParams = {}) {
  let list: { n: string; p: AnalyticsParams }[] = [];
  try {
    const prev = cookies.get(GA_EVENT_COOKIE)?.json();
    if (Array.isArray(prev)) list = prev.slice(-4);
  } catch {
    list = [];
  }
  list.push({ n: name, p: params });
  cookies.set(GA_EVENT_COOKIE, JSON.stringify(list), {
    path: '/',
    maxAge: 60 * 10,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    httpOnly: false,
  });
}
