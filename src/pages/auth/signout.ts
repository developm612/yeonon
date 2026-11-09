import type { APIRoute } from 'astro';
import { createSupabaseServerClient, isAuthConfigured } from '../../lib/supabase';

export const prerender = false;

/** 로그아웃은 우리 사이트에서 보낸 POST만 받는다 (다른 사이트가 사용자를 몰래 로그아웃시키지 못하게) */
export const POST: APIRoute = async ({ request, cookies, url, redirect }) => {
  if (request.headers.get('Origin') !== url.origin) return new Response('Forbidden', { status: 403 });
  if (isAuthConfigured) {
    const supabase = createSupabaseServerClient(request, cookies);
    await supabase.auth.signOut();
  }
  return redirect('/');
};
