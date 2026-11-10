import { defineMiddleware } from 'astro:middleware';
import { createSupabaseServerClient, isAuthConfigured } from './lib/supabase';
import { AREAS, PROFILE_COLUMNS, homeFor, inArea, isOnboarded, type Profile } from './lib/profile';

/** 로그인해야 들어갈 수 있는 곳. /app-preview 같은 공개 페이지는 해당하지 않는다 */
const LOGIN_REQUIRED = [...AREAS.map((a) => a.base), '/onboarding', '/account'];

export const onRequest = defineMiddleware(async (context, next) => {
  // 정적(공개) 페이지는 빌드할 때 한 번 만들어지므로 세션을 보지 않는다
  if (context.isPrerendered) return next();

  // TODO(임시): 미리보기 주소에서 CSRF 403 원인 확인용. 확인 후 지운다.
  // Astro의 checkOrigin은 이 미들웨어보다 먼저 실행돼, 막힌 POST 자체는 여기 찍히지 않는다 — 같은 페이지의 GET 로그로 비교한다.
  console.log('[origin-debug]', {
    method: context.request.method,
    path: context.url.pathname,
    urlOrigin: context.url.origin,
    origin: context.request.headers.get('origin'),
    host: context.request.headers.get('host'),
    xForwardedHost: context.request.headers.get('x-forwarded-host'),
    xForwardedProto: context.request.headers.get('x-forwarded-proto'),
  });

  // 폼 전송(POST 등)은 우리 사이트에서 보낸 것만 받는다 (다른 사이트가 몰래 제출시키는 공격 방지)
  if (!['GET', 'HEAD'].includes(context.request.method) && context.request.headers.get('Origin') !== context.url.origin) {
    return new Response('Forbidden', { status: 403 });
  }

  context.locals.user = null;
  context.locals.profile = null;
  if (isAuthConfigured) {
    const supabase = createSupabaseServerClient(context.request, context.cookies);
    context.locals.supabase = supabase;
    // getUser()는 토큰을 Supabase에서 검증하고, 만료가 가까우면 갱신해 쿠키에 다시 쓴다
    const { data } = await supabase.auth.getUser();
    context.locals.user = data.user;
    if (data.user) {
      const { data: profile } = await supabase.from('profiles').select(PROFILE_COLUMNS).eq('id', data.user.id).maybeSingle();
      context.locals.profile = (profile as Profile | null) ?? null;
    }
  }

  const path = context.url.pathname.replace(/\/$/, '') || '/';
  const { user, profile } = context.locals;
  const here = context.url.pathname + context.url.search;

  if (LOGIN_REQUIRED.some((base) => inArea(path, base))) {
    if (!user) return context.redirect('/login?next=' + encodeURIComponent(here));
    // 프로필이 없으면 DB 마이그레이션 전 — 온보딩 화면이 안내를 보여 준다
    if (!profile) {
      if (path !== '/onboarding') return context.redirect('/onboarding');
    } else if (profile.status !== 'active') {
      return context.redirect('/suspended');
    } else if (!isOnboarded(profile)) {
      if (path !== '/onboarding' && !inArea(path, '/account')) return context.redirect('/onboarding?next=' + encodeURIComponent(here));
    } else {
      const area = AREAS.find((a) => inArea(path, a.base));
      // 다른 역할의 영역에 들어오면 자기 홈으로 보낸다 (예: 여행자가 /partner, 지기가 /app)
      if (area && !area.roles.includes(profile.role!)) return context.redirect(homeFor(profile));
    }
  }

  const response = await next();
  // 로그인 상태에 따라 내용이 달라지는 페이지는 캐시하지 않는다
  if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'private, no-store');
  return response;
});
