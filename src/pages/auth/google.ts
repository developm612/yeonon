import type { APIRoute } from 'astro';
import { createSupabaseServerClient, isAuthConfigured, safeNext } from '../../lib/supabase';

export const prerender = false;

/**
 * Google 로그인 시작: Supabase가 만든 Google 동의 화면 주소로 보낸다.
 * 폼 POST가 아니라 링크(GET)로 시작한다 — vercel.json CSP의 form-action 'self'가 외부 리디렉트를 막기 때문.
 */
export const GET: APIRoute = async ({ request, cookies, url, redirect }) => {
  const next = safeNext(url.searchParams.get('next'));
  if (!isAuthConfigured) return redirect('/login?error=config');

  const supabase = createSupabaseServerClient(request, cookies);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${url.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      skipBrowserRedirect: true,
    },
  });
  if (error || !data.url) return redirect('/login?error=auth&next=' + encodeURIComponent(next));
  return redirect(data.url);
};
