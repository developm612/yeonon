/**
 * 예약 상태 패널 (Preact 아일랜드) — 여행자 /app/bookings/[id](영문), 지기 /partner/bookings/[id](한글).
 * 상태 머리말·응답 기한 카운트다운·상태 타임라인·버튼(취소 / 수락·거절)을 그리고,
 * Realtime으로 이 예약 행이 바뀌면(수락·거절·만료·취소·완료) 바로 다시 그린다.
 * 버튼은 /api/bookings/respond, /api/bookings/cancel 로 보낸다 (권한·기한 확인은 DB 함수).
 */
import { useEffect, useState } from 'preact/hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  BOOKING_STATUS,
  DECLINE_REASONS,
  JIGI_CANCEL_REASONS,
  REASON_DETAIL_MAX,
  STATUS_TONE_CLASS,
  TRAVELER_CANCEL_REASONS,
  isActive,
  kstWhen,
  reasonLabel,
  timeLeft,
  type Reason,
} from '../../data/bookingOptions';
import type { BookingRow } from '../../lib/bookings';
import { subscribeLive } from '../../lib/realtime';

export type PanelBooking = Pick<
  BookingRow,
  | 'id' | 'status' | 'confirm_mode' | 'starts_at' | 'ends_at' | 'respond_by' | 'responded_at' | 'confirmed_at'
  | 'decline_reason' | 'cancelled_at' | 'cancelled_role' | 'cancel_reason' | 'late_cancel' | 'expired_at' | 'completed_at' | 'created_at'
  | 'jigi_name'
>;

const PANEL_COLUMNS =
  'id, status, confirm_mode, starts_at, ends_at, respond_by, responded_at, confirmed_at, decline_reason, cancelled_at, cancelled_role, cancel_reason, late_cancel, expired_at, completed_at, created_at, jigi_name';

interface Props {
  booking: PanelBooking;
  viewer: 'traveler' | 'jigi';
  /** 여행자: 만료·거절·취소 후 "See other routes" (같은 조건의 /app/discover) */
  discoverHref?: string;
  /** 이 시간 안에 취소하면 늦은 취소로 기록 (분, booking_settings) */
  lateCancelMinutes: number;
}

type Step = { label: string; at: string | null; state: 'done' | 'current' | 'next' | 'off' };

export default function BookingPanel({ booking: initial, viewer, discoverHref, lateCancelMinutes }: Props) {
  const lang = viewer === 'traveler' ? 'en' : 'ko';
  const ko = lang === 'ko';
  const [b, setB] = useState(initial);
  const [now, setNow] = useState(() => Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [mode, setMode] = useState<'none' | 'decline' | 'cancel'>('none');
  const [reason, setReason] = useState('');
  const [detail, setDetail] = useState('');

  const reload = async (sb: SupabaseClient) => {
    const { data } = await sb.from('bookings').select(PANEL_COLUMNS).eq('id', initial.id).maybeSingle();
    if (data) setB((prev) => ({ ...prev, ...(data as PanelBooking) }));
  };

  useEffect(
    () =>
      subscribeLive<PanelBooking & Record<string, unknown>>({
        channel: `booking:${initial.id}`,
        table: 'bookings',
        filter: `id=eq.${initial.id}`,
        reload,
        onChange: (p) => {
          if (p.eventType !== 'UPDATE') return;
          setB((prev) => {
            const next = { ...prev, ...(p.new as PanelBooking) };
            if (next.status !== prev.status) setFlash(ko ? `상태가 바뀌었어요: ${BOOKING_STATUS[next.status].ko}` : `Updated: ${BOOKING_STATUS[next.status].en}`);
            return next;
          });
        },
      }),
    [initial.id],
  );

  // 카운트다운: 대기 중일 때만 1초마다
  useEffect(() => {
    if (b.status !== 'pending') return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [b.status]);

  const post = async (path: string, body: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ booking_id: b.id, ...body }) });
      const data = (await res.json().catch(() => ({}))) as { status?: PanelBooking['status']; message?: string };
      if (!res.ok) {
        setError(data.message ?? (ko ? '처리하지 못했어요. 다시 시도해 주세요.' : 'Something went wrong. Please try again.'));
        return;
      }
      setMode('none');
      setReason('');
      setDetail('');
      if (data.status) setB((prev) => ({ ...prev, status: data.status! }));
      // 시각 칸까지 맞추기 (Realtime이 늦을 때)
      const { getSupabaseBrowserClient } = await import('../../lib/realtime');
      void reload(getSupabaseBrowserClient());
    } catch {
      setError(ko ? '연결이 불안정해요. 다시 시도해 주세요.' : 'Connection problem. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const left = b.respond_by ? timeLeft(b.respond_by, now, lang) : null;
  const pendingOpen = b.status === 'pending' && left !== null;
  const startsIn = new Date(b.starts_at).getTime() - now;
  const willBeLate = startsIn <= lateCancelMinutes * 60_000;
  const cancelReasons: Reason[] = viewer === 'traveler' ? TRAVELER_CANCEL_REASONS : JIGI_CANCEL_REASONS;
  const who = b.jigi_name ?? (ko ? '지기' : 'your jigi');

  // ---- 머리말
  const head = (() => {
    if (ko) {
      switch (b.status) {
        case 'pending': return pendingOpen ? '새 요청이에요. 응답 기한 안에 수락하거나 거절해 주세요.' : '응답 기한이 지났어요. 곧 자동으로 만료돼요.';
        case 'confirmed': return b.confirm_mode === 'instant' && !b.responded_at ? '즉시 확정된 만남이에요.' : '확정된 만남이에요.';
        case 'completed': return '만남이 끝났어요. 후기 기능은 곧 열려요.';
        case 'declined': return '거절한 요청이에요.';
        case 'expired': return '응답 기한이 지나 만료된 요청이에요.';
        case 'cancelled': return b.cancelled_role === 'jigi' ? '내가 취소한 예약이에요.' : b.cancelled_role === 'traveler' ? '여행자가 취소한 예약이에요.' : '운영팀 또는 시스템이 취소한 예약이에요.';
      }
    }
    switch (b.status) {
      case 'pending': return pendingOpen ? `Waiting for ${who} to reply.` : 'The reply deadline has passed — this request will close shortly.';
      case 'confirmed': return "You're matched! See you there.";
      case 'completed': return 'Hope you had a great walk!';
      case 'declined': return `${b.jigi_name ?? 'Your jigi'} couldn't take this request.`;
      case 'expired': return 'No reply in time, so the time slot is free again.';
      case 'cancelled': return b.cancelled_role === 'traveler' ? 'You cancelled this booking.' : b.cancelled_role === 'jigi' ? 'Your jigi cancelled this meetup.' : 'This booking was cancelled.';
    }
  })();

  const reasonText = (() => {
    if (b.status === 'declined') return ko ? reasonLabel(b.decline_reason, DECLINE_REASONS, 'ko') : reasonLabel(b.decline_reason, DECLINE_REASONS, 'en');
    if (b.status !== 'cancelled') return null;
    if (b.cancelled_role === 'traveler') return reasonLabel(b.cancel_reason, TRAVELER_CANCEL_REASONS, lang);
    if (b.cancelled_role === 'jigi') return reasonLabel(b.cancel_reason, JIGI_CANCEL_REASONS, lang);
    if (b.cancelled_role === 'system') return ko ? '상대방이 탈퇴했어요.' : 'The other account was closed.';
    return ko ? '운영팀이 취소했어요.' : 'Cancelled by the YEONON team.';
  })();

  // ---- 타임라인
  const steps: Step[] = [{ label: ko ? '요청 접수' : 'Requested', at: b.created_at, state: 'done' }];
  if (b.status === 'pending') {
    steps.push({ label: ko ? `응답 기한 ${b.respond_by ? kstWhen(b.respond_by, 'ko') : ''}` : `Reply by ${b.respond_by ? kstWhen(b.respond_by, 'en') : ''} KST`, at: null, state: 'current' });
    steps.push({ label: ko ? '확정' : 'Confirmed', at: null, state: 'next' });
  } else if (b.confirmed_at) {
    steps.push({ label: b.confirm_mode === 'instant' && !b.responded_at ? (ko ? '즉시 확정' : 'Confirmed instantly') : ko ? '수락·확정' : 'Accepted', at: b.confirmed_at, state: 'done' });
  }
  if (b.status === 'declined') steps.push({ label: ko ? '거절' : 'Declined', at: b.responded_at, state: 'off' });
  if (b.status === 'expired') steps.push({ label: ko ? '기한 만료' : 'Expired — no reply', at: b.expired_at, state: 'off' });
  if (b.status === 'cancelled') steps.push({ label: ko ? `취소${b.late_cancel ? ' (만남 24시간 이내)' : ''}` : 'Cancelled', at: b.cancelled_at, state: 'off' });
  if (b.status === 'pending' || b.status === 'confirmed' || b.status === 'completed') {
    steps.push({ label: ko ? `만남 ${kstWhen(b.starts_at, 'ko')}` : `Meetup · ${kstWhen(b.starts_at, 'en')} KST`, at: null, state: b.status === 'completed' ? 'done' : b.status === 'confirmed' ? 'current' : 'next' });
    steps.push({ label: ko ? '완료 · 후기' : 'Completed · review', at: b.completed_at, state: b.status === 'completed' ? 'done' : 'next' });
  }

  const tone = STATUS_TONE_CLASS[BOOKING_STATUS[b.status].tone];
  const btn = 'inline-flex min-h-11 items-center justify-center rounded-full px-5 font-semibold disabled:cursor-not-allowed disabled:opacity-60';
  const primary = viewer === 'traveler' ? 'bg-traveler-strong text-white hover:bg-[#134FB0]' : 'bg-jigi-strong text-white hover:bg-[#08566F]';
  const showSeeOther = viewer === 'traveler' && discoverHref && (b.status === 'declined' || b.status === 'expired' || (b.status === 'cancelled' && b.cancelled_role !== 'traveler'));
  const canCancel = isActive(b.status) && startsIn > 0 && !(viewer === 'jigi' && b.status === 'pending');

  const reasonPicker = (list: Reason[], name: string) => (
    <fieldset class="mt-4">
      <legend class="text-sm font-semibold">{ko ? '사유' : 'Reason'}</legend>
      <div class="mt-2 grid gap-2">
        {list.map((r) => (
          <label key={r.id} class="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border bg-surface px-3.5 has-checked:border-text">
            <input type="radio" name={name} value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} class="size-[18px]" />
            <span>{r[lang]}</span>
          </label>
        ))}
      </div>
      {reason === 'other' && (
        <label class="mt-3 block text-sm font-semibold">
          {ko ? '내용 (선택, 상대방에게는 보이지 않아요)' : "Details (optional — not shown to your jigi)"}
          <textarea
            value={detail}
            maxLength={REASON_DETAIL_MAX}
            rows={2}
            onInput={(e) => setDetail((e.target as HTMLTextAreaElement).value)}
            class="mt-1 block w-full rounded-xl border border-border bg-surface px-3 py-2 font-normal"
          />
        </label>
      )}
    </fieldset>
  );

  return (
    <div lang={lang}>
      <div class="flex flex-wrap items-center gap-2">
        <span class={`rounded-full px-3 py-1 text-sm font-bold ${tone}`}>{BOOKING_STATUS[b.status][lang]}</span>
        {b.status === 'pending' && left && (
          <span class={`rounded-full px-3 py-1 text-sm font-bold tabular-nums ${new Date(b.respond_by!).getTime() - now < 3600_000 ? 'bg-[#FDECEC] text-[#8A1C1C]' : 'bg-text/5 text-text'}`} role="timer">
            {ko ? `남은 시간 ${left}` : `${left} left to reply`}
          </span>
        )}
      </div>
      <p class="mt-3 text-lg font-bold">{head}</p>
      {reasonText && <p class="mt-1 text-muted">{reasonText}</p>}
      <p class="sr-only" role="status" aria-live="polite">{flash ?? ''}</p>

      <ol class="mt-6 border-l-2 border-border pl-5" aria-label={ko ? '진행 상태' : 'Status timeline'}>
        {steps.map((s, i) => (
          <li key={i} class="relative pb-4 last:pb-0">
            <span
              class={`absolute top-[5px] -left-[27px] size-3 rounded-full border-2 ${
                s.state === 'done' ? 'border-jigi-strong bg-jigi-strong'
                : s.state === 'current' ? 'border-traveler-strong bg-surface ring-4 ring-traveler-soft'
                : s.state === 'off' ? 'border-muted bg-muted'
                : 'border-border bg-surface'
              }`}
              aria-hidden="true"
            />
            <p class={`text-sm font-semibold ${s.state === 'next' ? 'text-muted' : ''}`}>{s.label}</p>
            {s.at && <p class="text-xs text-muted tabular-nums">{kstWhen(s.at, lang)}{ko ? '' : ' KST'}</p>}
          </li>
        ))}
      </ol>

      {error && <p role="alert" class="mt-5 rounded-xl bg-[#FDECEC] px-4 py-3 text-sm font-medium text-[#8A1C1C]">{error}</p>}

      <div class="mt-6 flex flex-wrap gap-3">
        {viewer === 'jigi' && pendingOpen && mode === 'none' && (
          <>
            <button type="button" class={`${btn} ${primary}`} disabled={busy} onClick={() => post('/api/bookings/respond', { accept: true })}>수락하기</button>
            <button type="button" class={`${btn} border border-border bg-surface hover:border-text`} disabled={busy} onClick={() => { setMode('decline'); setReason(''); }}>거절하기</button>
          </>
        )}
        {canCancel && mode === 'none' && (
          <button type="button" class={`${btn} text-[#B42318] hover:bg-[#FDECEC]`} disabled={busy} onClick={() => { setMode('cancel'); setReason(''); }}>
            {ko ? '예약 취소' : b.status === 'pending' ? 'Cancel request' : 'Cancel booking'}
          </button>
        )}
        {showSeeOther && (
          <a href={discoverHref} class={`${btn} ${primary}`}>See other routes</a>
        )}
      </div>

      {mode !== 'none' && (
        <form
          class="mt-5 rounded-2xl border border-border bg-bg p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason) {
              setError(ko ? '사유를 골라 주세요.' : 'Please choose a reason.');
              return;
            }
            void post(mode === 'decline' ? '/api/bookings/respond' : '/api/bookings/cancel', { accept: false, reason, detail });
          }}
        >
          <p class="font-bold">{mode === 'decline' ? '요청 거절' : ko ? '예약 취소' : 'Cancel this booking?'}</p>
          {mode === 'decline' && <p class="mt-1 text-sm text-muted">여행자에게는 고른 사유에 맞는 짧은 안내만 보여요. 시간은 다시 열려요.</p>}
          {mode === 'cancel' && willBeLate && b.status === 'confirmed' && (
            <p class="mt-1 text-sm font-medium text-[#8A1C1C]">
              {ko ? '만남 24시간 이내 취소는 기록되어 활동 지표에 반영돼요.' : 'This meetup starts within 24 hours. Late cancellations are recorded.'}
            </p>
          )}
          {reasonPicker(mode === 'decline' ? DECLINE_REASONS : cancelReasons, `reason-${mode}`)}
          <div class="mt-4 flex flex-wrap gap-3">
            <button type="submit" class={`${btn} ${mode === 'decline' ? primary : 'bg-[#B42318] text-white hover:bg-[#912018]'}`} disabled={busy}>
              {mode === 'decline' ? '거절하기' : ko ? '취소하기' : 'Yes, cancel'}
            </button>
            <button type="button" class={`${btn} border border-border bg-surface hover:border-text`} disabled={busy} onClick={() => { setMode('none'); setError(null); }}>
              {ko ? '돌아가기' : 'Keep it'}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
