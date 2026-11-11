/**
 * 헤더 채팅 아이콘 + 안 읽은 메시지 수 (Preact 아일랜드). 여행자·지기만.
 * 내가 받은 메시지(recipient_id = 나)가 오거나 읽음 처리되면(Realtime) 개수를 다시 센다.
 */
import { useEffect, useState } from 'preact/hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import { subscribeLive } from '../../lib/realtime';

interface Props {
  userId: string;
  lang: 'en' | 'ko';
  href: '/app/messages' | '/partner/messages';
}

export default function ChatBadge({ userId, lang, href }: Props) {
  const [unread, setUnread] = useState(0);

  const reload = async (sb: SupabaseClient) => {
    const { count, error } = await sb.from('messages').select('id', { count: 'exact', head: true }).eq('recipient_id', userId).is('read_at', null);
    if (!error) setUnread(count ?? 0);
  };

  useEffect(
    () =>
      subscribeLive({
        channel: `chat-badge:${userId}`,
        table: 'messages',
        filter: `recipient_id=eq.${userId}`,
        reload,
        onChange: async () => {
          const { getSupabaseBrowserClient } = await import('../../lib/realtime');
          void reload(getSupabaseBrowserClient());
        },
      }),
    [userId],
  );

  const label = lang === 'ko' ? (unread ? `메시지, 안 읽음 ${unread}개` : '메시지') : unread ? `Messages, ${unread} unread` : 'Messages';
  return (
    <a href={href} class="relative inline-flex size-11 items-center justify-center rounded-full text-text transition-colors hover:bg-text/5" data-chat-badge>
      <span class="sr-only">{label}</span>
      <svg viewBox="0 0 24 24" class="size-[22px]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {unread > 0 && (
        <span class="absolute top-1 right-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#D92D20] px-1 text-[11px] leading-[18px] font-bold text-white tabular-nums" aria-hidden="true">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </a>
  );
}
