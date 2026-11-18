/**
 * 캐시하는 공개 화면의 헤더에 채팅·알림 아일랜드를 붙인다 (회원일 때만 불러오는 조각 — 비로그인 방문자는 받지 않는다).
 * 다른 화면은 AppTopBar가 서버에서 바로 그린다 (client:idle).
 */
import { h, render } from 'preact';
import ChatBadge from '../components/islands/ChatBadge';
import NotificationBell from '../components/islands/NotificationBell';

export function mountHeaderIslands(
  root: HTMLElement,
  m: { id: string; role: 'traveler' | 'jigi' | 'admin' },
) {
  const lang = m.role === 'traveler' ? 'en' : 'ko';
  const chat = root.querySelector<HTMLElement>('[data-chat-mount]');
  if (chat) render(h(ChatBadge, { userId: m.id, lang, href: m.role === 'traveler' ? '/chats' : '/partner/messages' }), chat);
  const bell = root.querySelector<HTMLElement>('[data-bell-mount]');
  if (bell) render(h(NotificationBell, { userId: m.id, lang }), bell);
}
