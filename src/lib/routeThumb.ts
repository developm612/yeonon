/**
 * 사진 없는 루트의 노선도 썸네일 SVG (정류장 점 + 이름). 서버(components/ui/RouteThumb.astro)와
 * 브라우저(추천 결과 카드)가 같은 그림을 그리도록 문자열로 만든다. 정류장 이름은 이스케이프한다.
 */
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function routeThumbSvg(stops: readonly string[]): string {
  const names = stops.length ? stops.slice(0, 6) : ['', '', ''];
  const n = names.length;
  // 정류장이 많으면 같은 줄 이웃 이름끼리 겹치지 않게 글자를 줄인다
  const font = n >= 5 ? 13 : 15;
  const maxLen = n >= 5 ? 12 : 15;
  const pts = names.map((name, i) => ({
    name: name.length > maxLen ? `${name.slice(0, maxLen - 1)}…` : name,
    // 양 끝 이름이 상자 밖으로 나가지 않게 가로 80~320 안에 둔다
    x: n === 1 ? 200 : 80 + (i * 240) / (n - 1),
    y: n === 1 ? 150 : i % 2 === 0 ? 132 : 180,
    up: i % 2 === 0,
  }));
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y}`).join(' ');
  const line = n > 1
    ? `<path d="${d}" fill="none" stroke="var(--color-line2)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`
    : '';
  const dots = pts.map((p) =>
    `<circle cx="${p.x.toFixed(1)}" cy="${p.y}" r="10.5" fill="var(--color-paper)" stroke="var(--color-line2)" stroke-width="4.5"/>` +
    (p.name
      ? `<text x="${p.x.toFixed(1)}" y="${p.up ? p.y - 24 : p.y + 38}" text-anchor="middle" font-size="${font}" font-weight="650" fill="var(--color-ink)" style="font-family: var(--font-display)">${esc(p.name)}</text>`
      : ''),
  ).join('');
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid meet" width="100%" height="100%" aria-hidden="true">${line}${dots}</svg>`;
}

/** 바탕 격자 (골목) — 썸네일 상자에 style로 붙인다 */
export const ROUTE_THUMB_BG =
  'background-color: var(--color-concrete); background-image: linear-gradient(var(--color-hairline) 1px, transparent 1px), linear-gradient(90deg, var(--color-hairline) 1px, transparent 1px); background-size: 36px 36px; background-position: -1px -1px;';
