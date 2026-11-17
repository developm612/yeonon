/**
 * 브라우저에서 그리는 RouteCard (추천 결과는 화면에서 /api/recommend를 불러 그린다).
 * 서버용 components/ui/RouteCard.astro와 같은 모양·클래스를 쓴다 — 한쪽을 바꾸면 다른 쪽도 맞출 것.
 * 글자는 모두 이스케이프한다.
 */
import { photoUrl } from './routePhotos';
import { ROUTE_THUMB_BG, routeThumbSvg } from './routeThumb';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** 미니 루트 라인 (점 n개, 이름 없이) — RouteLine.astro variant="mini" bare 와 같은 그림 */
export function miniLineSvg(n: number): string {
  const k = Math.max(n, 1);
  const cx = (i: number) => `${((i + 0.5) / k) * 100}%`;
  const line = k > 1 ? `<line x1="${cx(0)}" x2="${cx(k - 1)}" y1="11" y2="11" stroke="var(--color-line2)" stroke-width="4" stroke-linecap="round"/>` : '';
  const dots = Array.from({ length: k }, (_, i) =>
    `<circle cx="${cx(i)}" cy="11" r="6" fill="var(--color-paper)" stroke="var(--color-line2)" stroke-width="3.5"/>`).join('');
  return `<svg class="block h-[22px] w-full overflow-visible" aria-hidden="true">${line}${dots}</svg>`;
}

// components/Icon.astro와 같은 선
const ICON = {
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.3"/>',
  star: '<path d="m12 3.8 2.5 5.2 5.6.8-4 4 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-4 5.6-.8z"/>',
};
const icon = (name: keyof typeof ICON, cls: string) =>
  `<svg viewBox="0 0 24 24" class="${cls}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

export interface CardData {
  href: string;
  title: string;
  photo: string | null;
  stops: string[];
  duration: string;
  area: string;
  host: { name: string; rating: number | null; reviews: number };
  match?: number;
  reason?: string;
  slots: string[];
  slotCount: number;
  chips: number;
}

const chipLabel = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString('en-US', { timeZone: 'Asia/Seoul', weekday: 'short' });
  const time = d.toLocaleTimeString('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' });
  return `${day} ${time}`;
};

export function routeCardHtml(c: CardData): string {
  const media = c.photo
    ? `<img src="${esc(photoUrl(c.photo))}" alt="" loading="lazy" decoding="async" width="1600" height="1200" class="absolute inset-0 size-full object-cover">`
    : `<div class="absolute inset-0 size-full" style="${ROUTE_THUMB_BG}" aria-hidden="true">${routeThumbSvg(c.stops)}</div>`;
  const badge = c.match === undefined ? ''
    : `<span class="absolute top-3 left-3 rounded-full bg-paper px-3 py-1.5 text-[0.9375rem] leading-none text-ink"><span class="t-num">${c.match}%</span> match</span>`;
  const reason = c.reason
    ? `<blockquote class="t-small mt-2 border-l-[3px] border-hairline pl-3 font-normal text-ink">“${esc(c.reason)}”</blockquote>` : '';
  const rating = c.host.rating !== null && c.host.reviews > 0
    ? `<span class="ml-auto inline-flex shrink-0 items-center gap-1" aria-label="Rated ${c.host.rating.toFixed(1)} out of 5">${icon('star', 'size-4')}<span class="t-num">${c.host.rating.toFixed(1)}</span></span>` : '';
  const shown = c.slots.slice(0, c.chips);
  const more = c.slotCount - shown.length;
  const chips = shown.length
    ? `<ul class="mt-auto flex flex-wrap gap-1.5 pt-4" aria-label="Open times (KST)">${shown
        .map((iso) => `<li class="rounded-full border border-line2/40 bg-line2/[0.06] px-3 py-1 text-[0.875rem] font-semibold text-line2-text tabular-nums">${chipLabel(iso)}</li>`)
        .join('')}${more > 0 ? `<li class="px-1 py-1 text-[0.875rem] font-semibold text-stone">+${more}</li>` : ''}</ul>` : '';
  return `<article class="group relative flex h-full flex-col overflow-hidden rounded-card border border-hairline bg-paper transition-colors hover:border-ink">
  <div class="relative overflow-hidden bg-concrete" style="aspect-ratio: 4 / 3">${media}${badge}</div>
  <div class="flex flex-1 flex-col p-4 md:p-5">
    <h3 class="t-heading"><a href="${esc(c.href)}" class="after:absolute after:inset-0 focus-visible:outline-none group-has-[a:focus-visible]:underline">${esc(c.title)}</a></h3>
    ${reason}
    <div class="mt-4 flex items-start gap-3">
      <div class="min-w-0 flex-1" role="img" aria-label="${c.stops.length} stops: ${esc(c.stops.join(', '))}">${miniLineSvg(c.stops.length)}</div>
      <span class="t-small shrink-0 leading-[22px] text-stone">${c.stops.length} stops</span>
    </div>
    <dl class="t-small mt-3 grid grid-cols-2 gap-3 text-ink">
      <div class="flex items-center gap-2"><dt>${icon('clock', 'size-[18px] text-stone')}<span class="sr-only">Duration</span></dt><dd>${esc(c.duration)}</dd></div>
      <div class="flex min-w-0 items-center gap-2"><dt>${icon('pin', 'size-[18px] text-stone')}<span class="sr-only">Area</span></dt><dd class="truncate">${esc(c.area)}</dd></div>
    </dl>
    <p class="t-small mt-3 flex items-center gap-2 text-ink">
      <span class="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-concrete text-[0.875rem] font-bold" aria-hidden="true">${esc(c.host.name.slice(0, 1))}</span>
      <span class="min-w-0 truncate">${esc(c.host.name)}</span>${rating}
    </p>
    ${chips}
  </div>
</article>`;
}
