/**
 * 캐시하는 공개 화면(루트 피드·루트 상세)에서 지금 보는 사람의 로그인 상태를 한 번만 가져온다 (/api/session).
 * 헤더(scripts/headerAccount.ts)와 페이지 스크립트가 같은 결과를 나눠 쓴다. 지기 탭으로 돌려보낼 사람이면 바로 이동한다.
 */
import type { SessionInfo } from '../pages/api/session';

let pending: Promise<SessionInfo | null> | null = null;

export function getSession(): Promise<SessionInfo | null> {
  if (!pending) {
    const q = new URLSearchParams({ tab: 'travelers' });
    if (location.pathname === '/' && !location.search) q.set('home', '1');
    pending = fetch(`/api/session?${q}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? (r.json() as Promise<SessionInfo>) : null))
      .catch(() => null)
      .then((s) => {
        if (s?.bounce) location.replace(s.bounce);
        return s;
      });
  }
  return pending;
}

/** 사람마다 다른 조각(HTML)을 가져온다 (/fragments/*, 캐시하지 않음). 실패하면 null — 화면은 비로그인 모습 그대로 */
export async function getFragment(path: string): Promise<DocumentFragment | null> {
  try {
    const r = await fetch(path, { credentials: 'same-origin' });
    if (!r.ok) return null;
    const html = (await r.text()).trim();
    if (!html) return null;
    return document.createRange().createContextualFragment(html);
  } catch {
    return null;
  }
}
