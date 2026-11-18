import { defineMiddleware } from 'astro:middleware';
import { createSupabasePublicClient, createSupabaseServerClient, isAppOpen, isAuthConfigured } from './lib/supabase';
import { PUBLIC_CACHE_CONTROL, isPublicShell } from './lib/publicCache';
import { AREAS, PROFILE_COLUMNS, homeFor, inArea, isOnboarded, type Profile } from './lib/profile';
import { needsLegalConsent } from './config/legal';
import { legacyRedirect } from './data/paths';

/**
 * 로그인해야 들어갈 수 있는 곳 (yeonon-app-first-plan.md 6장).
 * 루트 피드(/)·루트 상세(/routes/*)·지기 시작 화면(/partner)은 로그인 없이 열리고, 요청·채팅·루트 작성 같은 행동만 로그인으로 보낸다.
 */
const LOGIN_REQUIRED = [...AREAS.map((a) => a.base), '/onboarding', '/account'];
/** 마지막으로 본 탭 (Travelers / 지기) — 다음 방문 때 그 탭으로 연다 */
const TAB_COOKIE = 'yeonon_tab';
const TAB_MAX_AGE = 60 * 60 * 24 * 365;

export const onRequest = defineMiddleware(async (context, next) => {
  // 옛 주소(/app/*, /routes, 설명·미리보기 페이지) → 새 주소로 영구 이동. 쿼리는 그대로 붙인다
  // (옛 페이지는 지워져서 404로 들어오므로 정적 페이지 확인보다 먼저 본다)
  if (context.request.method === 'GET' || context.request.method === 'HEAD') {
    const to = legacyRedirect(context.url.pathname);
    // 없는 주소(404)로 들어온 요청은 context.url에 쿼리가 빠질 수 있어 원래 요청 주소에서 읽는다
    if (to) return context.redirect(to.startsWith('http') ? to : to + new URL(context.request.url).search, 301);
  }

  // 정적(공개) 페이지는 빌드할 때 한 번 만들어지므로 세션을 보지 않는다
  if (context.isPrerendered) return next();

  // 폼 전송(POST 등)은 우리 사이트에서 보낸 것만 받는다 (다른 사이트가 몰래 제출시키는 공격 방지)
  if (!['GET', 'HEAD'].includes(context.request.method) && context.request.headers.get('Origin') !== context.url.origin) {
    return new Response('Forbidden', { status: 403 });
  }

  context.locals.user = null;
  context.locals.profile = null;
  // 공개 화면 캐시(lib/publicCache.ts): 루트 피드·루트 상세는 세션을 읽지 않고 비로그인 기준으로 그린다.
  // 같은 HTML을 CDN이 누구에게나 주므로, 로그인 상태에 따른 부분은 브라우저가 /api/session·/fragments/*로 따로 가져온다.
  const shell = isPublicShell(context.request.method, context.url);
  context.locals.shell = shell;
  if (isAuthConfigured && shell) {
    context.locals.supabase = createSupabasePublicClient();
  } else if (isAuthConfigured) {
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

  // 첫 화면(/)을 주소창에 바로 열면 마지막으로 본 탭으로. 지기 계정은 기본이 지기 탭.
  // 여행자 계정의 첫 화면은 언제나 Travelers (지기 탭을 둘러본 뒤에도 — 다른 역할 영역에서 홈으로 보낼 때 맴돌지 않게)
  // (상단 Travelers 탭은 /switch?to=travelers 를 거쳐 쿠키를 바꾸므로 여기서 다시 지기 탭으로 튕기지 않는다)
  const tab = context.cookies.get(TAB_COOKIE)?.value;
  // (캐시하는 공개 화면에서는 세션을 모르므로 브라우저가 /api/session 결과로 대신한다 — scripts/session.ts)
  if (!shell && path === '/' && context.request.method === 'GET' && !context.url.search) {
    if (profile?.role !== 'traveler' && (tab === 'jigi' || (!tab && profile?.role === 'jigi'))) return context.redirect('/partner');
  }

  // /partner(지기 시작 화면)는 로그인 없이 열린다. 로그인했으면 아래 확인(온보딩·동의·정지)은 그대로 하되, 역할 이동은 하지 않는다
  const partnerStart = path === '/partner';
  const needsLogin = !partnerStart && LOGIN_REQUIRED.some((base) => inArea(path, base));
  if (needsLogin || (partnerStart && user)) {
    if (!user) return context.redirect('/login?next=' + encodeURIComponent(here));
    // 프로필이 없으면 DB 마이그레이션 전 — 온보딩 화면이 안내를 보여 준다
    if (!profile) {
      if (path !== '/onboarding') return context.redirect('/onboarding');
    } else if (profile.status !== 'active') {
      return context.redirect('/suspended');
    } else if (!isOnboarded(profile)) {
      if (path !== '/onboarding' && !inArea(path, '/account')) return context.redirect('/onboarding?next=' + encodeURIComponent(here));
    } else if (profile.role !== 'admin' && needsLegalConsent(profile) && !inArea(path, '/account')) {
      // 약관·개인정보처리방침이 개정되었으면(동의한 시행일이 다르면) 먼저 다시 동의를 받는다 (/account/consent)
      return context.redirect('/account/consent?next=' + encodeURIComponent(here));
    } else if (!partnerStart) {
      const area = AREAS.find((a) => inArea(path, a.base));
      // 다른 역할의 영역에 들어오면 자기 홈으로 보낸다 (예: 여행자가 /partner/routes, 지기가 /bookings)
      if (area && !area.roles.includes(profile.role!)) return context.redirect(homeFor(profile));
    }
  }

  const response = await next();
  if (shell) {
    // 공개 화면: CDN에 잠깐 담아 둔다 (쿠키를 쓰지 않으므로 Set-Cookie도 없다 — 있으면 Vercel이 캐시하지 않는다)
    if (!response.headers.has('Cache-Control') && (response.status === 200 || response.status === 404)) {
      response.headers.set('Cache-Control', PUBLIC_CACHE_CONTROL);
    }
  }
  // 로그인 상태에 따라 내용이 달라지는 페이지는 캐시하지 않는다
  if (!response.headers.has('Cache-Control')) response.headers.set('Cache-Control', 'private, no-store');
  // 검색 노출: 앱 오픈(PUBLIC_APP_OPEN=true) 후 루트 피드(/)와 루트 상세만 허용
  const indexable = isAppOpen && (path === '/' || /^\/routes\/[^/]+$/.test(path));
  if (!indexable) response.headers.set('X-Robots-Tag', 'noindex, nofollow');

  // 마지막으로 본 탭 기억 (화면을 성공적으로 보여 줄 때만)
  // (공개 화면 캐시에서는 /api/session이 대신 기억한다 — 응답에 쿠키가 있으면 캐시되지 않으므로)
  if (!shell && context.request.method === 'GET' && response.status === 200) {
    const seen = inArea(path, '/partner') ? 'jigi' : path === '/' || inArea(path, '/routes') || AREAS.slice(0, 4).some((a) => inArea(path, a.base)) ? 'travelers' : null;
    if (seen && seen !== tab) {
      response.headers.append('Set-Cookie', `${TAB_COOKIE}=${seen}; Path=/; Max-Age=${TAB_MAX_AGE}; SameSite=Lax${context.url.protocol === 'https:' ? '; Secure' : ''}`);
    }
  }
  return response;
});
