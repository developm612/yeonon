/**
 * 메시지 목록 (Preact 아일랜드) — /app/messages(영문), /partner/messages(한글).
 * 상대 표시 이름·루트·마지막 메시지·안 읽은 수. 새 메시지가 오면(Realtime) my_conversations()로 다시 읽는다.
 */
import { useEffect, useState } from 'preact/hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BOOKING_STATUS } from '../../data/bookingOptions';
import type { ConversationListItem } from '../../lib/chat';
import { subscribeLive } from '../../lib/realtime';

interface Props {
  userId: string;
  lang: 'en' | 'ko';
  base: '/app/messages' | '/partner/messages';
  initial: ConversationListItem[];
}

function when(iso: string | null, lang: 'en' | 'ko') {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }) === new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
  return sameDay
    ? d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric' });
}

export default function ConversationList({ userId, lang, base, initial }: Props) {
  const [items, setItems] = useState(initial);
  const ko = lang === 'ko';

  const reload = async (sb: SupabaseClient) => {
    const { data, error } = await sb.rpc('my_conversations');
    if (!error) setItems((data ?? []) as ConversationListItem[]);
  };

  useEffect(
    () =>
      subscribeLive({
        channel: `inbox:${userId}`,
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

  if (items.length === 0) {
    return (
      <p lang={lang} class="rounded-xl bg-surface px-4 py-6 text-center text-muted shadow-card">
        {ko ? '아직 대화가 없어요. 매칭 요청이 오면 여기에서 대화할 수 있어요.' : 'No conversations yet. A chat opens when you request a route.'}
      </p>
    );
  }
  return (
    <ul lang={lang} class="divide-y divide-border overflow-hidden rounded-2xl bg-surface shadow-card">
      {items.map((c) => {
        const closed = !c.can_send;
        return (
          <li key={c.conversation_id}>
            <a href={`${base}/${c.conversation_id}`} class={`flex gap-3 px-4 py-4 transition-colors hover:bg-text/5 ${c.unread ? 'bg-traveler-soft/40' : ''}`}>
              <span class="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-jigi-soft font-bold text-jigi-strong" aria-hidden="true">
                {(c.other_name ?? '?').slice(0, 1)}
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline justify-between gap-2">
                  <span class="truncate font-bold">{c.other_name ?? (ko ? '여행자' : 'Your jigi')}</span>
                  <span class="shrink-0 text-xs text-muted tabular-nums">{when(c.last_at, lang)}</span>
                </span>
                <span class="block truncate text-xs text-muted">
                  {c.route_title} · {BOOKING_STATUS[c.booking_status][lang]}
                  {closed && (c.blocked_by_me ? (ko ? ' · 차단함' : ' · Blocked') : '')}
                </span>
                <span class="mt-1 flex items-center justify-between gap-2">
                  <span class={`truncate text-sm ${c.unread ? 'font-semibold text-text' : 'text-muted'}`}>
                    {c.last_body ? `${c.last_from_me ? (ko ? '나: ' : 'You: ') : ''}${c.last_body}` : ko ? '아직 메시지가 없어요' : 'No messages yet'}
                  </span>
                  {c.unread > 0 && (
                    <span class="inline-flex min-w-[22px] shrink-0 items-center justify-center rounded-full bg-[#D92D20] px-1.5 text-xs leading-[22px] font-bold text-white tabular-nums">
                      <span class="sr-only">{ko ? '안 읽음 ' : 'Unread '}</span>{c.unread > 99 ? '99+' : c.unread}
                    </span>
                  )}
                </span>
              </span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
