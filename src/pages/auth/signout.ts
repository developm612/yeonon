import type { APIRoute } from 'astro';
import { clearSupabaseCookies, createSupabaseServerClient, isAuthConfigured } from '../../lib/supabase';

export const prerender = false;

/**
 * 로그아웃은 POST만 받는다. 다른 사이트에서 보낸 POST는 src/middleware.ts가 막는다.
 * 서버 로그아웃이 실패해도(토큰 만료 등) 이 브라우저의 sb- 쿠키는 모두 지우고, 캐시하지 않는 응답으로 홈에 보낸다.
 */
export const POST: APIRoute = async ({ request, cookies }) => {
  if (isAuthConfigured) {
    const supabase = createSupabaseServerClient(request, cookies);
    await supabase.auth.signOut().catch(() => {});
  }
  clearSupabaseCookies(request, cookies);
  return new Response(null, {
    status: 303,
    headers: { Location: '/', 'Cache-Control': 'no-store, max-age=0' },
  });
};
