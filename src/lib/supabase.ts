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
 * 앱 오픈 스위치 PUBLIC_APP_OPEN (.env.example, yeonon-app-first-plan.md 3장).
 * 오픈 전(true가 아님)에도 루트 피드(/)·루트 상세는 누구나 둘러보고, 요청·채팅 같은 행동만 로그인한다.
 * 차이는 검색 노출: 오픈 전에는 모든 페이지가 noindex, 오픈 후에는 /와 /routes/[id]만 검색에 허용한다.
 * PUBLIC_ 값은 빌드할 때 페이지에 들어가므로 Vercel에서 바꾸면 다시 배포해야 한다.
 */
export const isAppOpen = import.meta.env.PUBLIC_APP_OPEN === 'true';

/**
 * 쿠키를 보지 않는 비로그인 클라이언트 — 공개 화면 캐시(lib/publicCache.ts)용.
 * 누가 요청했든 비로그인 방문자가 보는 것(RLS 기준 공개 데이터)만 읽으므로, 그 결과를 CDN에 담아 모두에게 줘도 된다.
 */
export function createSupabasePublicClient() {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll() {} },
  });
}

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

/**
 * 로그인 후 돌아갈 주소. 같은 사이트 안의 경로만 허용한다 (외부로 보내는 오픈 리디렉트 방지)
 * 기본값 /account는 역할별 홈으로 보낸다 (여행자 /, 지기 /partner, 관리자 /admin).
 */
export function safeNext(value: string | null | undefined, fallback = '/account'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
