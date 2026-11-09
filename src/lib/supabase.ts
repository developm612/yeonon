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

/** 로그인 후 돌아갈 주소. 같은 사이트 안의 경로만 허용한다 (외부로 보내는 오픈 리디렉트 방지) */
export function safeNext(value: string | null | undefined, fallback = '/app'): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
  return value;
}
