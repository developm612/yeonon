import type { APIRoute } from 'astro';
import { createSupabaseServerClient, isAuthConfigured } from '../../lib/supabase';

export const prerender = false;

/** 로그아웃은 POST만 받는다. 다른 사이트에서 보낸 POST는 src/middleware.ts가 막는다 */
export const POST: APIRoute = async ({ request, cookies, redirect }) => {
  if (isAuthConfigured) {
    const supabase = createSupabaseServerClient(request, cookies);
    await supabase.auth.signOut();
  }
  return redirect('/');
};
