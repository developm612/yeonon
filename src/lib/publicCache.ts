/**
 * 공개 화면 캐시 (docs/performance.md 1번).
 * 루트 피드(/)와 루트 상세(/routes/[id])는 로그인과 상관없는 화면이라, 비로그인 기준으로 그린 HTML을 Vercel CDN에 잠깐 담아 둔다.
 *   CDN 캐시는 쿠키를 구분하지 않으므로(같은 주소면 누구에게나 같은 HTML), 이 요청에서는 세션을 아예 읽지 않는다 (middleware).
 *   사람마다 다른 부분 — 헤더의 로그인 상태·알림, 피드 위 내 예약 줄, 루트 상세의 요청 폼·할인가, 지기 탭으로 돌려보내기 —
 *   은 브라우저가 /api/session 과 /fragments/* (캐시하지 않음)에서 따로 가져온다 (scripts/session.ts).
 * 주소에 아래 목록 밖의 값이 붙으면(로그인 후 돌아온 ?slot=, 추천 클릭 ?rec=, 미리보기 ?preview=1, 오류 ?error= …)
 * 지금처럼 그 사람 기준으로 서버에서 그리고 캐시하지 않는다.
 */
import { UUID } from './routes';

/** 피드에서 캐시해도 되는 주소 값 (검색어·관심사·페이지) */
const FEED_KEYS = new Set(['q', 'tag', 'page']);

/** CDN 60초 신선 + 5분 동안은 옛 사본을 주면서 뒤에서 새로 그림. 브라우저는 매번 확인(max-age=0) */
export const PUBLIC_CACHE_CONTROL = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

export function isPublicShell(method: string, url: URL): boolean {
  if (method !== 'GET' && method !== 'HEAD') return false;
  const path = url.pathname.replace(/\/$/, '') || '/';
  const keys = [...url.searchParams.keys()];
  if (path === '/') return keys.every((k) => FEED_KEYS.has(k));
  const m = path.match(/^\/routes\/([^/]+)$/);
  return Boolean(m && UUID.test(m[1]) && keys.length === 0);
}
