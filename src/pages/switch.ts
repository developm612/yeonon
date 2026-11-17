/**
 * 상단 Travelers | 지기 탭 전환 (yeonon-app-first-plan.md 1-3).
 * 어느 쪽 화면을 볼지 고르는 것일 뿐 계정 역할은 바꾸지 않는다. 고른 탭을 쿠키에 기억하고 그 탭의 첫 화면으로 보낸다.
 */
import type { APIRoute } from 'astro';

export const prerender = false;

export const GET: APIRoute = ({ url, cookies, redirect }) => {
  const to = url.searchParams.get('to') === 'jigi' ? 'jigi' : 'travelers';
  cookies.set('yeonon_tab', to, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', secure: url.protocol === 'https:' });
  return redirect(to === 'jigi' ? '/partner' : '/', 302);
};
