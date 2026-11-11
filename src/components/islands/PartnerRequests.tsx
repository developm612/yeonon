/**
 * 지기의 새 요청(응답 대기) 목록 (Preact 아일랜드) — /partner 홈, /partner/bookings.
 * Realtime으로 새 요청이 들어오면 바로 위에 추가하고, 수락·거절·만료·취소되면 목록에서 뺀다.
 * 응답 기한 카운트다운은 1초마다 갱신 (1시간 안 남으면 빨간색).
 */
import { useEffect, useState } from 'preact/hooks';
import type { SupabaseClient } from '@supabase/supabase-js';
import { kstWhen, timeLeft } from '../../data/bookingOptions';
import type { BookingRow } from '../../lib/bookings';
import { subscribeLive } from '../../lib/realtime';

export type RequestItem = Pick<BookingRow, 'id' | 'status' | 'route_title' | 'starts_at' | 'party_size' | 'traveler_name' | 'note' | 'respond_by' | 'created_at'>;
const COLUMNS = 'id, status, route_title, starts_at, party_size, traveler_name, note, respond_by, created_at';

interface Props {
  jigiId: string;
  initial: RequestItem[];
}

const sortByDeadline = (list: RequestItem[]) =>
  [...list].sort((a, b) => new Date(a.respond_by ?? 0).getTime() - new Date(b.respond_by ?? 0).getTime());

export default function PartnerRequests({ jigiId, initial }: Props) {
  const [items, setItems] = useState(() => sortByDeadline(initial));
  const [fresh, setFresh] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const reload = async (sb: SupabaseClient) => {
    const { data, error } = await sb.from('bookings').select(COLUMNS).eq('jigi_id', jigiId).eq('status', 'pending').order('respond_by').limit(50);
    if (!error) setItems(sortByDeadline((data ?? []) as RequestItem[]));
  };

  useEffect(
    () =>
      subscribeLive<RequestItem & Record<string, unknown>>({
        channel: `jigi-requests:${jigiId}`,
        table: 'bookings',
        filter: `jigi_id=eq.${jigiId}`,
        reload,
        onChange: (p) => {
          if (p.eventType === 'DELETE') return;
          const row = p.new as RequestItem;
          setItems((prev) => {
            const rest = prev.filter((x) => x.id !== row.id);
            return row.status === 'pending' ? sortByDeadline([...rest, row]) : rest;
          });
          if (p.eventType === 'INSERT' && row.status === 'pending') setFresh((f) => [...f, row.id]);
        },
      }),
    [jigiId],
  );

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div lang="ko">
      <p class="sr-only" role="status" aria-live="polite">{fresh.length ? `새 요청 ${fresh.length}건이 도착했어요` : ''}</p>
      {items.length === 0 ? (
        <p class="rounded-xl bg-surface px-4 py-5 text-center text-muted shadow-card">응답을 기다리는 요청이 없어요. 새 요청이 오면 여기에 바로 보여요.</p>
      ) : (
        <ul class="space-y-3">
          {items.map((b) => {
            const left = b.respond_by ? timeLeft(b.respond_by, now, 'ko') : null;
            const urgent = b.respond_by ? new Date(b.respond_by).getTime() - now < 3600_000 : false;
            return (
              <li key={b.id}>
                <a
                  href={`/partner/bookings/${b.id}`}
                  class={`card block p-4 transition-colors hover:border-text md:p-5 ${fresh.includes(b.id) ? 'ring-2 ring-jigi-strong' : ''}`}
                >
                  <div class="flex flex-wrap items-center gap-2">
                    {fresh.includes(b.id) && <span class="rounded-full bg-jigi-strong px-2.5 py-0.5 text-xs font-bold text-white">NEW</span>}
                    <span class={`rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${!left ? 'bg-text/5 text-muted' : urgent ? 'bg-[#FDECEC] text-[#8A1C1C]' : 'bg-[#FFF4D6] text-[#7A5200]'}`} role="timer">
                      {left ? `응답 기한까지 ${left}` : '기한 지남 · 곧 만료'}
                    </span>
                  </div>
                  <p class="mt-2 font-bold">{b.route_title}</p>
                  <p class="mt-0.5 text-sm text-muted tabular-nums">
                    {kstWhen(b.starts_at, 'ko')} · {b.party_size}명 · {b.traveler_name || '여행자'}
                  </p>
                  {b.note && <p class="mt-2 line-clamp-2 rounded-lg bg-bg px-3 py-2 text-sm">“{b.note}”</p>}
                  <p class="mt-3 text-sm font-semibold text-jigi-strong">수락 / 거절하기 →</p>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
