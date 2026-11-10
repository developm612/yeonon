import type { APIRoute } from 'astro';
import { createSupabaseServerClient, isAuthConfigured, safeNext } from '../../lib/supabase';
import { NEXT_COOKIE } from '../../lib/authNext';

export const prerender = false;

/** Google 동의 후 돌아오는 곳: 받은 code를 세션 쿠키로 바꾸고 원래 가려던 페이지(쿠키에 저장)로 보낸다 */
export const GET: APIRoute = async ({ request, cookies, url, redirect }) => {
  const next = safeNext(cookies.get(NEXT_COOKIE)?.value);
  cookies.delete(NEXT_COOKIE, { path: '/auth/callback' });
  const code = url.searchParams.get('code');
  if (!isAuthConfigured) return redirect('/login?error=config');
  if (!code) return redirect('/login?error=auth&next=' + encodeURIComponent(next));

  const supabase = createSupabaseServerClient(request, cookies);
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return redirect('/login?error=auth&next=' + encodeURIComponent(next));
  return redirect(next);
};
