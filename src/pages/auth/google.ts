import type { APIRoute } from 'astro';
import { createSupabaseServerClient, isAuthConfigured, safeNext } from '../../lib/supabase';
import { NEXT_COOKIE } from '../../lib/authNext';

export const prerender = false;

/**
 * Google 로그인 시작: Supabase가 만든 Google 동의 화면 주소로 보낸다.
 * 폼 POST가 아니라 링크(GET)로 시작한다 — vercel.json CSP의 form-action 'self'가 외부 리디렉트를 막기 때문.
 * redirectTo에 쿼리를 붙이면 Supabase 허용 목록과 맞지 않아 사이트 홈으로 돌아오므로,
 * 돌아갈 페이지(next)는 짧은 수명의 쿠키에 두고 redirectTo는 /auth/callback 그대로 쓴다.
 */
export const GET: APIRoute = async ({ request, cookies, url, redirect }) => {
  const next = safeNext(url.searchParams.get('next'));
  if (!isAuthConfigured) return redirect('/login?error=config');

  cookies.set(NEXT_COOKIE, next, {
    path: '/auth/callback',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    maxAge: 60 * 10,
  });

  const supabase = createSupabaseServerClient(request, cookies);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${url.origin}/auth/callback`,
      skipBrowserRedirect: true,
      // 매번 Google 계정 선택 화면을 띄워 다른 계정으로 바꿔 로그인할 수 있게 한다
      queryParams: { prompt: 'select_account' },
    },
  });
  if (error || !data.url) return redirect('/login?error=auth&next=' + encodeURIComponent(next));
  return redirect(data.url);
};
