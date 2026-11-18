/**
 * 캐시하는 공개 화면(루트 피드·루트 상세)의 헤더 오른쪽 — 로그인 상태를 브라우저에서 채운다 (scripts/session.ts).
 * HTML에는 비로그인 모습(Sign in)이 들어 있고, 회원이면 AppTopBar의 <template>을 복제해 채팅·알림·내 정보로 바꾼다.
 * 모양과 규칙은 서버에서 그리는 AppTopBar와 같다 (회원 / 가입 전 Sign up / 그 밖 Sign in).
 */
import { getSession } from './session';

const box = document.querySelector<HTMLElement>('[data-account]');
if (box) {
  getSession().then(async (s) => {
    if (!s || s.bounce) return;
    const tpl = (name: string) => box.querySelector<HTMLTemplateElement>(`template[data-tpl="${name}"]`)!.content.cloneNode(true) as DocumentFragment;
    if (s.member) {
      const m = s.member;
      const frag = tpl(m.role === 'admin' ? 'admin' : 'member');
      if (m.role !== 'admin') {
        const jigi = m.role === 'jigi';
        const avatar = frag.querySelector<HTMLAnchorElement>('[data-avatar]')!;
        avatar.href = jigi ? '/partner/me' : '/me';
        avatar.setAttribute('aria-label', jigi ? '내 정보' : 'My account');
        if (m.initial) frag.querySelector<HTMLElement>('[data-initial]')!.textContent = m.initial;
      }
      box.querySelector('[data-signin]')?.remove();
      box.prepend(frag);
      const { mountHeaderIslands } = await import('./headerIslands');
      mountHeaderIslands(box, m);
    } else if (s.signup) {
      box.querySelector('[data-signin]')?.remove();
      box.prepend(tpl('signup'));
    }
  });
}
