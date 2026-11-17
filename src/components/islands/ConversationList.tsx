/**
 * 메시지 목록 (Preact 아일랜드) — /app/messages(영문), /partner/messages(한글).
 * 상대 표시 이름·루트·마지막 메시지·안 읽은 수. 새 메시지가 오면(Realtime) my_conversations()로 다시 읽는다.
 * 여행자 화면(en)은 성수 라인 모양: 아바타 + 루트 이름 + 마지막 메시지 + 시간, 안 읽음은 ON Blue 점.
 */
import { useEffect, useState } from 'preact/hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import { BOOKING_STATUS, TRAVELER_STATUS } from '../../data/bookingOptions';
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

  if (!ko) {
    if (items.length === 0) {
      return (
        <div lang="en" class="rounded-card border border-hairline bg-paper px-6 py-10 text-center">
          <p class="t-heading">No conversations yet</p>
          <p class="t-body mx-auto mt-2 max-w-md text-stone">A chat opens when you request a route. Find one for your days in Seoul.</p>
          <a href="/app/discover" class="mt-6 inline-flex min-h-[52px] items-center justify-center rounded-control bg-on-blue px-6 font-semibold text-white hover:bg-on-blue-hover">Find my route</a>
        </div>
      );
    }
    return (
      <ul lang="en" class="divide-y divide-hairline overflow-hidden rounded-card border border-hairline bg-paper">
        {items.map((c) => (
          <li key={c.conversation_id}>
            <a href={`${base}/${c.conversation_id}`} class="flex items-center gap-3.5 px-4 py-4 transition-colors hover:bg-concrete md:px-5">
              <span class="t-num inline-flex size-12 shrink-0 items-center justify-center rounded-full bg-concrete text-[1.125rem] text-ink" aria-hidden="true">
                {(c.other_name ?? '?').slice(0, 1)}
              </span>
              <span class="min-w-0 flex-1">
                <span class="flex items-baseline justify-between gap-3">
                  <span class="t-heading truncate">{c.other_name ?? 'Your jigi'}</span>
                  <span class={`t-caption shrink-0 tabular-nums ${c.unread ? 'text-on-blue' : 'font-normal text-stone'}`}>{when(c.last_at, 'en')}</span>
                </span>
                <span class="t-caption block truncate font-normal text-stone">
                  {c.route_title} · {TRAVELER_STATUS[c.booking_status].label}{!c.can_send && c.blocked_by_me ? ' · Blocked' : ''}
                </span>
                <span class="mt-0.5 flex items-center justify-between gap-3">
                  <span class={`t-small truncate ${c.unread ? 'font-semibold text-ink' : 'font-normal text-stone'}`}>
                    {c.last_body ? `${c.last_from_me ? 'You: ' : ''}${c.last_body}` : 'No messages yet'}
                  </span>
                  {c.unread > 0 && (
                    <span class="size-2.5 shrink-0 rounded-full bg-on-blue">
                      <span class="sr-only">{c.unread} unread</span>
                    </span>
                  )}
                </span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    );
  }

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
