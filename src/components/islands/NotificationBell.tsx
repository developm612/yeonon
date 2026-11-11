/**
 * 헤더 알림 종 (Preact 아일랜드). 안 읽은 수 배지 + 최근 알림 목록, Realtime으로 바로 갱신.
 * 알림은 본인 것만 읽힌다 (notifications RLS). 읽음 처리는 mark_notifications_read() 함수.
 * 전체 목록: /account/notifications
 */
import { useEffect, useRef, useState } from 'preact/hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import { subscribeLive } from '../../lib/realtime';

interface Item {
  id: string;
  title: string;
  body: string;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

interface Props {
  userId: string;
  lang: 'en' | 'ko';
}

const RECENT = 8;
const T = {
  en: { label: 'Notifications', unread: (n: number) => `${n} unread`, empty: "You're all caught up.", all: 'See all', readAll: 'Mark all read', title: 'Notifications' },
  ko: { label: '알림', unread: (n: number) => `안 읽음 ${n}개`, empty: '새 알림이 없어요.', all: '전체 보기', readAll: '모두 읽음', title: '알림' },
};

function ago(iso: string, lang: 'en' | 'ko') {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (min < 1) return lang === 'ko' ? '방금' : 'just now';
  if (min < 60) return lang === 'ko' ? `${min}분 전` : `${min}m ago`;
  const h = Math.round(min / 60);
  if (h < 24) return lang === 'ko' ? `${h}시간 전` : `${h}h ago`;
  const d = Math.round(h / 24);
  return lang === 'ko' ? `${d}일 전` : `${d}d ago`;
}

export default function NotificationBell({ userId, lang }: Props) {
  const t = T[lang];
  const [items, setItems] = useState<Item[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const sbRef = useRef<SupabaseClient | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  const reload = async (sb: SupabaseClient) => {
    sbRef.current = sb;
    const [list, count] = await Promise.all([
      sb.from('notifications').select('id, title, body, link, read_at, created_at').order('created_at', { ascending: false }).limit(RECENT),
      sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null),
    ]);
    if (!list.error) setItems((list.data ?? []) as Item[]);
    if (!count.error) setUnread(count.count ?? 0);
  };

  useEffect(
    () =>
      subscribeLive<Item & Record<string, unknown>>({
        channel: `notifications:${userId}`,
        table: 'notifications',
        filter: `user_id=eq.${userId}`,
        reload,
        onChange: (p) => {
          if (p.eventType === 'INSERT') {
            const n = p.new as Item;
            setItems((prev) => [n, ...prev.filter((x) => x.id !== n.id)].slice(0, RECENT));
            if (!n.read_at) setUnread((u) => u + 1);
          } else if (p.eventType === 'UPDATE') {
            const n = p.new as Item;
            setItems((prev) => {
              const was = prev.find((x) => x.id === n.id);
              if (was && !was.read_at && n.read_at) setUnread((u) => Math.max(0, u - 1));
              return prev.map((x) => (x.id === n.id ? n : x));
            });
          }
        },
      }),
    [userId],
  );

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('click', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const markRead = async (ids: string[] | null) => {
    const sb = sbRef.current;
    if (!sb) return;
    const { error } = await sb.rpc('mark_notifications_read', { p_ids: ids });
    if (error) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((x) => (ids === null || ids.includes(x.id) ? { ...x, read_at: x.read_at ?? now } : x)));
    setUnread((u) => (ids === null ? 0 : Math.max(0, u - items.filter((x) => ids.includes(x.id) && !x.read_at).length)));
  };

  const go = async (e: MouseEvent, item: Item) => {
    if (item.read_at) return;
    e.preventDefault();
    await markRead([item.id]);
    if (item.link) location.href = item.link;
  };

  const badge = unread > 9 ? '9+' : String(unread);
  return (
    <div class="relative" ref={wrap}>
      <button
        ref={button}
        type="button"
        class="relative inline-flex size-11 items-center justify-center rounded-full text-text transition-colors hover:bg-text/5"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls="notification-panel"
        onClick={() => setOpen((o) => !o)}
      >
        <span class="sr-only">{unread ? `${t.label}, ${t.unread(unread)}` : t.label}</span>
        <svg viewBox="0 0 24 24" class="size-[22px]" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span class="absolute top-1 right-1 inline-flex min-w-[18px] items-center justify-center rounded-full bg-[#D92D20] px-1 text-[11px] leading-[18px] font-bold text-white tabular-nums" aria-hidden="true">
            {badge}
          </span>
        )}
      </button>

      {open && (
        <div
          id="notification-panel"
          lang={lang}
          class="fixed inset-x-4 top-[68px] z-50 rounded-2xl border border-border bg-surface shadow-xl md:absolute md:inset-x-auto md:top-12 md:right-0 md:w-[360px]"
        >
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <p class="font-bold">{t.title}</p>
            {unread > 0 && (
              <button type="button" class="min-h-9 rounded-full px-3 text-sm font-semibold text-muted hover:bg-text/5 hover:text-text" onClick={() => markRead(null)}>
                {t.readAll}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p class="px-4 py-6 text-center text-sm text-muted">{t.empty}</p>
          ) : (
            <ul class="max-h-[60vh] divide-y divide-border overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <a
                    href={n.link ?? '/account/notifications'}
                    onClick={(e) => go(e as unknown as MouseEvent, n)}
                    class={`flex gap-3 px-4 py-3 transition-colors hover:bg-text/5 ${n.read_at ? '' : 'bg-traveler-soft/40'}`}
                  >
                    <span class={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-[#D92D20]'}`} aria-hidden="true" />
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold">{n.title}</span>
                      <span class="mt-0.5 line-clamp-2 block text-sm text-muted">{n.body}</span>
                      <span class="mt-1 block text-xs text-muted">{ago(n.created_at, lang)}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          <a href="/account/notifications" class="block rounded-b-2xl border-t border-border px-4 py-3 text-center text-sm font-semibold hover:bg-text/5">
            {t.all}
          </a>
        </div>
      )}
    </div>
  );
}
