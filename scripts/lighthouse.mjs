#!/usr/bin/env node
/**
 * Lighthouse 모바일 측정 → 중앙값 표 + JSON 저장 (docs/performance.md 5번).
 *
 *   npm run lh -- --label before                     # 운영(https://yeonon.vercel.app)의 / 와 첫 공개 루트를 3번씩
 *   npm run lh -- --label after --runs 5             # 바꾼 뒤 다시
 *   npm run lh -- --compare lighthouse/before.json lighthouse/after.json
 *   npm run lh -- --base https://<미리보기 주소> --label preview
 *   npm run lh -- --url https://yeonon.vercel.app/routes/<id> --label one
 *
 * 값: 성능 점수, LCP(가장 큰 요소가 그려진 시각), TBT(입력이 막힌 시간), CLS(흔들림), 서버 응답 시간(HTML 첫 바이트까지).
 * Lighthouse 모바일 기본값(느린 4G·CPU 4배 느리게 흉내)이라 실행마다 몇 점씩 오르내린다 → 여러 번 재서 중앙값을 본다.
 * 크롬이 필요하다: CHROME_PATH 환경 변수, 없으면 Windows 기본 설치 경로를 찾는다.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const all = (name) => args.flatMap((a, i) => (a === `--${name}` ? [args[i + 1]] : []));

const METRICS = [
  ['perf', '성능', (v) => String(v)],
  ['lcp', 'LCP', (v) => `${(v / 1000).toFixed(2)}s`],
  ['tbt', 'TBT', (v) => `${Math.round(v)}ms`],
  ['cls', 'CLS', (v) => v.toFixed(3)],
  ['server', '서버 응답', (v) => `${Math.round(v)}ms`],
];

function table(results) {
  const rows = [['화면', ...METRICS.map((m) => m[1])]];
  for (const r of results) rows.push([r.name, ...METRICS.map(([k, , f]) => f(r.median[k]))]);
  const w = rows[0].map((_, c) => Math.max(...rows.map((row) => String(row[c]).length)));
  return rows.map((row) => row.map((cell, c) => String(cell).padEnd(w[c])).join('  ')).join('\n');
}

if (args.includes('--compare')) {
  const i = args.indexOf('--compare');
  const [a, b] = [args[i + 1], args[i + 2]];
  const before = JSON.parse(readFileSync(a, 'utf8'));
  const after = JSON.parse(readFileSync(b, 'utf8'));
  console.log(`\n${before.label} (${before.at})  →  ${after.label} (${after.at}), 중앙값\n`);
  const rows = [['화면', ...METRICS.map((m) => m[1])]];
  for (const r of after.results) {
    const o = before.results.find((x) => x.name === r.name);
    rows.push([r.name, ...METRICS.map(([k, , f]) => (o ? `${f(o.median[k])} → ${f(r.median[k])}` : f(r.median[k])))]);
  }
  const w = rows[0].map((_, c) => Math.max(...rows.map((row) => String(row[c]).length)));
  console.log(rows.map((row) => row.map((cell, c) => String(cell).padEnd(w[c])).join('  ')).join('\n'));
  process.exit(0);
}

const base = (opt('base', 'https://yeonon.vercel.app')).replace(/\/$/, '');
const runs = Number(opt('runs', '3'));
const label = opt('label', new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-'));
const chrome =
  process.env.CHROME_PATH ||
  ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'].find(existsSync);
if (!chrome) {
  console.error('크롬을 찾지 못했어요. CHROME_PATH 환경 변수로 크롬 실행 파일 경로를 알려 주세요.');
  process.exit(1);
}

let urls = all('url');
if (!urls.length) {
  // 첫 화면과, 피드의 첫 공개 루트 상세
  const html = await (await fetch(`${base}/`)).text();
  const id = html.match(/href="\/routes\/([0-9a-f-]{36})"/)?.[1];
  urls = [`${base}/`, ...(id ? [`${base}/routes/${id}`] : [])];
}

const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
const tmp = join(tmpdir(), `yeonon-lh-${process.pid}`);
mkdirSync(tmp, { recursive: true });

const results = [];
for (const url of urls) {
  const name = new URL(url).pathname.replace(/^\/routes\/.+/, '/routes/[id]');
  const samples = [];
  for (let i = 0; i < runs; i++) {
    const out = join(tmp, `r${results.length}-${i}.json`);
    process.stdout.write(`  ${name} ${i + 1}/${runs}…`);
    execSync(
      `npx -y lighthouse@12 "${url}" --quiet --output=json --output-path="${out}" --only-categories=performance --chrome-flags="--headless=new --no-sandbox"`,
      { env: { ...process.env, CHROME_PATH: chrome }, stdio: 'ignore' },
    );
    const r = JSON.parse(readFileSync(out, 'utf8'));
    const a = r.audits;
    const s = {
      perf: Math.round(r.categories.performance.score * 100),
      lcp: a['largest-contentful-paint'].numericValue,
      tbt: a['total-blocking-time'].numericValue,
      cls: a['cumulative-layout-shift'].numericValue,
      server: a['document-latency-insight']?.details?.debugData?.serverResponseTime ?? a['server-response-time']?.numericValue ?? 0,
    };
    samples.push(s);
    console.log(` ${s.perf}점`);
  }
  results.push({ name, url, samples, median: Object.fromEntries(METRICS.map(([k]) => [k, median(samples.map((s) => s[k]))])) });
}
rmSync(tmp, { recursive: true, force: true });

console.log(`\n${label} — Lighthouse 모바일, ${runs}회 중앙값\n`);
console.log(table(results));
mkdirSync('lighthouse', { recursive: true });
const file = join('lighthouse', `${label}.json`);
writeFileSync(file, JSON.stringify({ label, at: new Date().toISOString(), base, runs, results }, null, 2));
console.log(`\n저장: ${file}  (비교: npm run lh -- --compare lighthouse/<전>.json ${file})`);
