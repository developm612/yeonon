/**
 * Supabase 서버 클라이언트 (쿠키 세션).
 * 키가 비어 있으면(isAuthConfigured = false) 로그인 기능 전체가 꺼지고, 공개 페이지는 그대로 동작한다.
 * 키 설정: .env.example 참고, 발급 순서: yeonon-service-plan-v2.md 8장
 */
import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import type { AstroCookies } from 'astro';

export const SUPABASE_URL = import.meta.env.PUBLIC_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY = import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '';
export const isAuthConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
/**
 * 회원 기능 공개 스위치 (.env.example 참고). 'true'가 아니면 헤더의 로그인 메뉴를 숨기고,
 * /routes는 로그인한 사람에게만 보이며, 서버 렌더링 페이지 전체가 검색엔진에 노출되지 않는다. /login 주소 직접 접속은 된다.
 * PUBLIC_ 값은 빌드할 때 페이지에 들어가므로 Vercel에서 바꾸면 다시 배포해야 한다.
 */
export const isMemberUiPublic = import.meta.env.PUBLIC_MEMBER_UI === 'true';

export function createSupabaseServerClient(request: Request, cookies: AstroCookies) {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.get('Cookie') ?? '').map(({ name, value }) => ({ name, value: value ?? '' }));
      },
      setAll(list) {
        list.forEach(({ name, value, options }) => cookies.set(name, value, options));
      },
    },
  });
}

/** 요청에 실려 온 Supabase 쿠키(sb-로 시작: 세션 토큰 조각, PKCE code-verifier 등)를 모두 지운다 */
export function clearSupabaseCookies(request: Request, cookies: AstroCookies) {
  for (const { name } of parseCookieHeader(request.headers.get('Cookie') ?? '')) {
    if (name.startsWith('sb-')) cookies.delete(name, { path: '/' });
  }
}

/** 로그인 후 돌아갈 주소. 같은 사이트 안의 경로만 허용한다 (외부로 보내는 오픈 리디렉트 방지) */
export function safeNext(value: string | null | undefined, fallback = '/app'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
