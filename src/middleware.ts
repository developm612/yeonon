import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient, isAuthConfigured } from './lib/supabase';

/** 로그인해야 들어갈 수 있는 영역. /app-preview 같은 공개 페이지는 해당하지 않는다 */
const PROTECTED = ['/app', '/partner', '/admin'];
const isProtected = (path: string) => PROTECTED.some((base) => path === base || path.startsWith(base + '/'));

export const onRequest = defineMiddleware(async (context, next) => {
  // 정적(공개) 페이지는 빌드할 때 한 번 만들어지므로 세션을 보지 않는다
  if (context.isPrerendered) return next();

  context.locals.user = null;
  if (isAuthConfigured) {
    const supabase = createSupabaseServerClient(context.request, context.cookies);
    context.locals.supabase = supabase;
    // getUser()는 토큰을 Supabase에서 검증하고, 만료가 가까우면 갱신해 쿠키에 다시 쓴다
    const { data } = await supabase.auth.getUser();
    context.locals.user = data.user;
  }

  const path = context.url.pathname.replace(/\/$/, '') || '/';
  if (isProtected(path) && !context.locals.user) {
    return context.redirect('/login?next=' + encodeURIComponent(context.url.pathname + context.url.search));
  }

  const response = await next();
  // 로그인 상태에 따라 내용이 달라지는 페이지는 캐시하지 않는다
  if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'private, no-store');
  return response;
});
