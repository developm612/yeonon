/**
 * 대화 화면 (Preact 아일랜드) — 여행자 /app/messages/[id](영문), 지기 /partner/messages/[id](한글).
 * Realtime으로 새 메시지·읽음 표시를 바로 받고, 보이는 동안 받은 메시지를 읽음 처리한다.
 * 보내기·읽음·신고·차단·번역은 /api/chat/* 로 보낸다 (권한·차단·제한 확인은 DB 함수).
 * 모바일: 입력창이 키보드에 가려지지 않게 화면에 보이는 높이(visualViewport)에 맞춰 대화 영역 높이를 맞춘다.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingStatus } from '../../data/bookingOptions';
import { CLOSED_NOTICE, PENDING_NOTICE, REPORT_REASONS, SAFETY_NOTICE } from '../../data/chatOptions';
import type { MessageRow } from '../../lib/chat';
import { subscribeLive } from '../../lib/realtime';

const MAX = 1000;
const COLUMNS = 'id, conversation_id, sender_id, recipient_id, body, flagged, flag_reasons, created_at, read_at';

interface Props {
  conversationId: string;
  userId: string;
  lang: 'en' | 'ko';
  otherName: string;
  bookingStatus: BookingStatus;
  canSend: boolean;
  blockedByMe: boolean;
  initialMessages: MessageRow[];
  translateEnabled: boolean;
}

const T = {
  en: {
    placeholder: 'Write a message…', send: 'Send', sending: 'Sending…', read: 'Read', sent: 'Sent', translate: 'Translate', hideTranslation: 'Hide translation',
    translating: 'Translating…', menu: 'Chat options', report: 'Report', block: 'Block', unblock: 'Unblock', empty: 'Say hi and ask anything about the route.',
    reportTitle: 'Report this conversation', reportHint: 'Our team will review this conversation. Only reported chats are ever opened by YEONON staff.',
    detail: 'Details (optional)', submitReport: 'Send report', cancel: 'Cancel', reported: 'Thanks — your report was sent. Our team will review it.',
    blockTitle: 'Block', blockHint: 'Neither of you will be able to send messages. Your booking stays as it is — cancel it from Bookings if you need to.',
    confirmBlock: 'Block', blockedMe: 'You blocked', blockedOther: 'You can’t send messages in this conversation.', unblocked: 'Unblocked. You can message again.',
    error: 'Something went wrong. Please try again.', newBelow: 'New messages ↓', today: 'Today', translationLabel: 'Translation',
  },
  ko: {
    placeholder: '메시지를 입력하세요…', send: '보내기', sending: '보내는 중…', read: '읽음', sent: '보냄', translate: '번역', hideTranslation: '번역 숨기기',
    translating: '번역 중…', menu: '대화 메뉴', report: '신고', block: '차단', unblock: '차단 해제', empty: '여행자의 질문에 답해 주세요.',
    reportTitle: '이 대화 신고하기', reportHint: '운영팀이 이 대화를 확인해요. 연온 운영팀은 신고된 대화만 열람해요.',
    detail: '내용 (선택)', submitReport: '신고하기', cancel: '취소', reported: '신고가 접수됐어요. 운영팀이 확인할게요.',
    blockTitle: '차단', blockHint: '서로 메시지를 보낼 수 없게 돼요. 예약은 그대로라서, 필요하면 예약 화면에서 취소해 주세요.',
    confirmBlock: '차단하기', blockedMe: '차단한 상대예요:', blockedOther: '이 대화에서는 메시지를 보낼 수 없어요.', unblocked: '차단을 해제했어요.',
    error: '처리하지 못했어요. 다시 시도해 주세요.', newBelow: '새 메시지 ↓', today: '오늘', translationLabel: '번역',
  },
};

/** 상단 고정 사이트 헤더의 아래 끝 (없으면 0) */
const headerBottom = () => Math.max(0, document.querySelector('body > header')?.getBoundingClientRect().bottom ?? 0);

const kstDayKey =(iso: string) => new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });

export default function ChatRoom(props: Props) {
  const { conversationId, userId, lang, otherName, translateEnabled } = props;
  const t = T[lang];
  const [messages, setMessages] = useState<MessageRow[]>(props.initialMessages);
  const [status, setStatus] = useState(props.bookingStatus);
  const [canSend, setCanSend] = useState(props.canSend);
  const [blockedByMe, setBlockedByMe] = useState(props.blockedByMe);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<'none' | 'report' | 'block'>('none');
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');
  const [translations, setTranslations] = useState<Record<string, string | 'loading' | null>>({});
  const [showNew, setShowNew] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const nearBottom = useRef(true);
  const reading = useRef(false);
  const fitRef = useRef<() => void>(() => {});

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversation_id: conversationId, ...body }) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { message?: unknown; error?: string };
    return { ok: res.ok, data };
  };

  const markRead = async () => {
    if (reading.current || document.visibilityState !== 'visible') return;
    reading.current = true;
    try {
      await post('/api/chat/read', {});
    } finally {
      reading.current = false;
    }
  };

  const merge = (incoming: MessageRow[]) =>
    setMessages((prev) => {
      const byId = new Map(prev.map((m) => [m.id, m]));
      for (const m of incoming) byId.set(m.id, { ...byId.get(m.id), ...m });
      return [...byId.values()].sort((a, b) => a.created_at.localeCompare(b.created_at));
    });

  const reload = async (sb: SupabaseClient) => {
    const [{ data: msgs }, { data: head }] = await Promise.all([
      sb.from('messages').select(COLUMNS).eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(200),
      sb.rpc('conversation_info', { p_conversation: conversationId }),
    ]);
    if (msgs) merge(msgs as MessageRow[]);
    const h = ((head as { booking_status: BookingStatus; can_send: boolean; blocked_by_me: boolean }[] | null) ?? [])[0];
    if (h) {
      setStatus(h.booking_status);
      setCanSend(h.can_send);
      setBlockedByMe(h.blocked_by_me);
    }
    if ((msgs as MessageRow[] | null)?.some((m) => m.recipient_id === userId && !m.read_at)) void markRead();
  };

  useEffect(
    () =>
      subscribeLive<MessageRow & Record<string, unknown>>({
        channel: `chat:${conversationId}`,
        table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
        reload,
        onChange: (p) => {
          if (p.eventType === 'DELETE') return;
          const m = p.new as MessageRow;
          merge([m]);
          if (p.eventType === 'INSERT' && m.recipient_id === userId) void markRead();
        },
      }),
    [conversationId],
  );

  // 처음 열면 맨 아래로, 받은 메시지 읽음 처리
  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight;
    if (props.initialMessages.some((m) => m.recipient_id === userId && !m.read_at)) void markRead();
    const onVisible = () => document.visibilityState === 'visible' && void markRead();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  // 새 메시지: 아래쪽을 보고 있었거나 내가 보낸 것이면 맨 아래로, 아니면 '새 메시지' 버튼
  useLayoutEffect(() => {
    const el = list.current;
    const last = messages[messages.length - 1];
    if (!el || !last) return;
    if (nearBottom.current || last.sender_id === userId) {
      el.scrollTop = el.scrollHeight;
      setShowNew(false);
    } else setShowNew(true);
  }, [messages.length]);

  // 모바일 키보드: 보이는 영역(visualViewport) 바닥에 입력창이 오도록 대화 영역 높이를 맞춘다.
  // 사이트 헤더(상단 고정) 아래부터 계산해서 대화창 머리(상대 이름·메뉴)가 헤더에 가려지지 않게 한다.
  useEffect(() => {
    const vv = window.visualViewport;
    const fit = () => {
      const el = panel.current;
      if (!el) return;
      const top = Math.max(el.getBoundingClientRect().top, headerBottom());
      const visibleBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
      el.style.height = `${Math.max(320, Math.round(visibleBottom - top - 8))}px`;
      if (nearBottom.current && list.current) list.current.scrollTop = list.current.scrollHeight;
    };
    fitRef.current = fit;
    fit();
    vv?.addEventListener('resize', fit);
    vv?.addEventListener('scroll', fit);
    window.addEventListener('resize', fit);
    return () => {
      vv?.removeEventListener('resize', fit);
      vv?.removeEventListener('scroll', fit);
      window.removeEventListener('resize', fit);
    };
  }, []);

  const onScroll = () => {
    const el = list.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    if (nearBottom.current) setShowNew(false);
  };

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    if (body.length > MAX) {
      setError(lang === 'ko' ? `메시지는 ${MAX}자까지예요.` : `Messages can be up to ${MAX} characters.`);
      return;
    }
    setSending(true);
    setError(null);
    try {
      const { ok, data } = await post('/api/chat/send', { body });
      if (!ok) {
        setError(typeof data.message === 'string' ? data.message : t.error);
        if (data.error === 'conversation_closed' || data.error === 'blocked') setCanSend(false);
        return;
      }
      merge([data.message as MessageRow]);
      setDraft('');
      nearBottom.current = true;
      input.current?.focus();
    } catch {
      setError(t.error);
    } finally {
      setSending(false);
    }
  };

  const translate = async (m: MessageRow) => {
    if (translations[m.id] && translations[m.id] !== 'loading') {
      setTranslations((x) => ({ ...x, [m.id]: null }));
      return;
    }
    setTranslations((x) => ({ ...x, [m.id]: 'loading' }));
    const res = await fetch('/api/chat/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message_id: m.id }) });
    const data = (await res.json().catch(() => ({}))) as { translation?: string; message?: string };
    if (!res.ok || !data.translation) {
      setTranslations((x) => ({ ...x, [m.id]: null }));
      setError(data.message ?? t.error);
      return;
    }
    setTranslations((x) => ({ ...x, [m.id]: data.translation! }));
  };

  const submitReport = async (e: Event) => {
    e.preventDefault();
    if (!reason) {
      setError(lang === 'ko' ? '사유를 골라 주세요.' : 'Please choose a reason.');
      return;
    }
    const { ok, data } = await post('/api/chat/report', { reason, detail });
    if (!ok) {
      setError(typeof data.message === 'string' ? data.message : t.error);
      return;
    }
    setDialog('none');
    setReason('');
    setDetail('');
    setError(null);
    setInfo(t.reported);
  };

  const toggleBlock = async (block: boolean) => {
    const { ok, data } = await post('/api/chat/block', { block });
    if (!ok) {
      setError(typeof data.message === 'string' ? data.message : t.error);
      return;
    }
    setDialog('none');
    setBlockedByMe(block);
    setInfo(block ? null : t.unblocked);
    const { getSupabaseBrowserClient } = await import('../../lib/realtime');
    void reload(getSupabaseBrowserClient());
  };

  const closed = status === 'cancelled' || status === 'declined' || status === 'expired';
  const lastMineRead = [...messages].reverse().find((m) => m.sender_id === userId);
  const accent = lang === 'en' ? 'bg-traveler-strong text-white' : 'bg-jigi-strong text-white';
  const btn = 'inline-flex min-h-11 items-center justify-center rounded-full px-5 font-semibold disabled:opacity-60';

  let lastDay = '';
  return (
    <div ref={panel} lang={lang} class="relative flex min-h-[360px] flex-col overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
      <div class="flex items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <p class="min-w-0 truncate font-bold">{otherName}</p>
        <div class="relative">
          <button type="button" class="inline-flex size-10 items-center justify-center rounded-full text-xl leading-none hover:bg-text/5" aria-label={t.menu} aria-expanded={menu} onClick={() => setMenu((x) => !x)}>⋯</button>
          {menu && (
            <div class="absolute top-11 right-0 z-10 w-44 overflow-hidden rounded-xl border border-border bg-surface shadow-xl" role="menu">
              <button type="button" role="menuitem" class="block w-full px-4 py-3 text-left hover:bg-text/5" onClick={() => { setMenu(false); setDialog('report'); setError(null); }}>{t.report}</button>
              <button type="button" role="menuitem" class="block w-full px-4 py-3 text-left text-[#B42318] hover:bg-[#FDECEC]" onClick={() => { setMenu(false); blockedByMe ? void toggleBlock(false) : setDialog('block'); }}>
                {blockedByMe ? t.unblock : t.block}
              </button>
            </div>
          )}
        </div>
      </div>

      {status === 'pending' && !closed && <p class="border-b border-border bg-[#FFF4D6] px-4 py-2 text-sm font-medium text-[#7A5200]">{PENDING_NOTICE[lang]}</p>}

      <div ref={list} onScroll={onScroll} class="flex-1 space-y-2 overflow-y-auto overscroll-contain px-3 py-4 md:px-5" aria-live="polite" aria-relevant="additions" data-chat-list>
        {messages.length === 0 && <p class="py-10 text-center text-sm text-muted">{t.empty}</p>}
        {messages.map((m) => {
          const mine = m.sender_id === userId;
          const day = kstDayKey(m.created_at);
          const sep = day !== lastDay;
          lastDay = day;
          const tr = translations[m.id];
          return (
            <div key={m.id}>
              {sep && (
                <p class="my-3 text-center text-xs font-semibold text-muted">
                  {day === kstDayKey(new Date().toISOString()) ? t.today : new Date(m.created_at).toLocaleDateString(lang === 'ko' ? 'ko-KR' : 'en-US', { timeZone: 'Asia/Seoul', month: 'short', day: 'numeric', weekday: 'short' })}
                </p>
              )}
              <div class={`flex flex-col ${mine ? 'items-end' : 'items-start'}`} data-message={mine ? 'mine' : 'theirs'}>
                <div class={`max-w-[85%] rounded-2xl px-3.5 py-2 whitespace-pre-wrap break-words md:max-w-[70%] ${mine ? `${accent} rounded-br-md` : 'rounded-bl-md bg-bg'}`}>{m.body}</div>
                {tr && tr !== 'loading' && (
                  <div class="mt-1 max-w-[85%] rounded-xl border border-border bg-surface px-3 py-1.5 text-sm md:max-w-[70%]" data-translation>
                    <span class="mr-1 text-xs font-semibold text-muted">{t.translationLabel}</span>{tr}
                  </div>
                )}
                {m.flagged && <p class="mt-1 max-w-[85%] rounded-xl bg-[#FDECEC] px-3 py-1.5 text-xs font-medium text-[#8A1C1C] md:max-w-[70%]" role="note" data-safety>⚠️ {SAFETY_NOTICE[lang]}</p>}
                <p class="mt-0.5 flex items-center gap-2 text-[11px] text-muted tabular-nums">
                  {timeOf(m.created_at)}
                  {mine && lastMineRead?.id === m.id && <span data-receipt>{m.read_at ? t.read : t.sent}</span>}
                  {!mine && translateEnabled && (
                    <button type="button" class="font-semibold underline underline-offset-2 hover:text-text" onClick={() => translate(m)} disabled={tr === 'loading'}>
                      {tr === 'loading' ? t.translating : tr ? t.hideTranslation : t.translate}
                    </button>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {showNew && (
        <button type="button" class={`absolute bottom-24 left-1/2 -translate-x-1/2 rounded-full px-4 py-2 text-sm font-semibold shadow-lg ${accent}`}
          onClick={() => { list.current && (list.current.scrollTop = list.current.scrollHeight); setShowNew(false); }}>
          {t.newBelow}
        </button>
      )}

      {(error || info) && (
        <p role={error ? 'alert' : 'status'} class={`mx-3 mb-2 rounded-xl px-3 py-2 text-sm font-medium ${error ? 'bg-[#FDECEC] text-[#8A1C1C]' : 'bg-brand-soft text-brand'}`}>{error ?? info}</p>
      )}

      {dialog === 'report' && (
        <form class="mx-3 mb-3 rounded-2xl border border-border bg-bg p-4" onSubmit={submitReport}>
          <p class="font-bold">{t.reportTitle}</p>
          <p class="mt-1 text-sm text-muted">{t.reportHint}</p>
          <div class="mt-3 grid gap-2">
            {REPORT_REASONS.map((r) => (
              <label key={r.id} class="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3.5 has-checked:border-text">
                <input type="radio" name="report-reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} class="size-[18px]" />
                <span class="text-sm">{r[lang]}</span>
              </label>
            ))}
          </div>
          <label class="mt-3 block text-sm font-semibold">{t.detail}
            <textarea rows={2} maxLength={500} value={detail} onInput={(e) => setDetail((e.target as HTMLTextAreaElement).value)} class="mt-1 block w-full rounded-xl border border-border bg-surface px-3 py-2 font-normal" />
          </label>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="submit" class={`${btn} bg-[#B42318] text-white`}>{t.submitReport}</button>
            <button type="button" class={`${btn} border border-border bg-surface`} onClick={() => setDialog('none')}>{t.cancel}</button>
          </div>
        </form>
      )}

      {dialog === 'block' && (
        <div class="mx-3 mb-3 rounded-2xl border border-border bg-bg p-4">
          <p class="font-bold">{t.blockTitle} {otherName}?</p>
          <p class="mt-1 text-sm text-muted">{t.blockHint}</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class={`${btn} bg-[#B42318] text-white`} onClick={() => toggleBlock(true)}>{t.confirmBlock}</button>
            <button type="button" class={`${btn} border border-border bg-surface`} onClick={() => setDialog('none')}>{t.cancel}</button>
          </div>
        </div>
      )}

      {closed ? (
        <p class="border-t border-border px-4 py-3 text-center text-sm text-muted">{CLOSED_NOTICE[lang]}</p>
      ) : blockedByMe ? (
        <p class="border-t border-border px-4 py-3 text-center text-sm text-muted">
          {t.blockedMe} {otherName}.{' '}
          <button type="button" class="font-semibold underline underline-offset-2" onClick={() => toggleBlock(false)}>{t.unblock}</button>
        </p>
      ) : !canSend ? (
        <p class="border-t border-border px-4 py-3 text-center text-sm text-muted">{t.blockedOther}</p>
      ) : (
        <form class="flex items-end gap-2 border-t border-border p-2.5" onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label class="sr-only" for="chat-input">{t.placeholder}</label>
          <textarea
            id="chat-input"
            ref={input}
            rows={1}
            value={draft}
            maxLength={MAX}
            placeholder={t.placeholder}
            onInput={(e) => {
              const el = e.target as HTMLTextAreaElement;
              setDraft(el.value);
              el.style.height = 'auto';
              el.style.height = `${Math.min(el.scrollHeight, 132)}px`;
            }}
            onKeyDown={(e) => {
              // Enter = 보내기, Shift+Enter = 줄바꿈. 한글 입력 중(조합 중)에는 보내지 않는다
              if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(pointer: fine)').matches) {
                e.preventDefault();
                void send();
              }
            }}
            onFocus={() => {
              // 터치 기기: 키보드가 올라오면 대화창 머리를 헤더 바로 아래에 맞추고 맨 아래 메시지를 보여 준다
              if (window.matchMedia('(pointer: coarse)').matches && panel.current) {
                const gap = panel.current.getBoundingClientRect().top - headerBottom();
                if (Math.abs(gap) > 4) window.scrollBy({ top: gap });
                fitRef.current();
              }
              setTimeout(() => {
                fitRef.current();
                if (list.current && nearBottom.current) list.current.scrollTop = list.current.scrollHeight;
              }, 300);
            }}
            class="max-h-[132px] min-h-11 flex-1 resize-none rounded-2xl border border-border bg-bg px-3.5 py-2.5 text-base"
          />
          <button type="submit" class={`${btn} ${accent} shrink-0`} disabled={sending || !draft.trim()} data-chat-send>{sending ? t.sending : t.send}</button>
        </form>
      )}
      {draft.length > MAX - 100 && canSend && !closed && <p class="px-4 pb-2 text-right text-xs text-muted tabular-nums">{draft.length} / {MAX}</p>}
    </div>
  );
}
