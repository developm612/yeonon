/**
 * /app-preview 상태 머신.
 * drop → splash → home → select → matching → found → results
 * 상태는 [data-app]의 data-state 하나로 관리하고, 모든 타이머는 timers 배열에 모아 한 번에 취소한다.
 */
import { INTERESTS, LANG_FLAGS, PICK_MAX, PICK_MIN, TIMING, matchJigis } from '../data/appPreview';

type State = 'drop' | 'splash' | 'home' | 'select' | 'matching' | 'found' | 'results';

const LIVE_TEXT: Record<State, string> = {
  drop: '',
  splash: 'Loading the YEONON app',
  home: 'Home screen',
  select: `Choose ${PICK_MIN} to ${PICK_MAX} travel interests`,
  matching: 'Finding your Jigis',
  found: 'We found your Jigis!',
  results: 'Your Jigis — sample profiles',
};
const MATCHING_TEXT = ['Reading your travel story…', 'Looking for Jigis in Seongsu…', 'Matching by taste…'];
const MATCHING_STEP_MS = 800;

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const splashDelayMs = reduceMotion ? 0 : TIMING.splashDelayMs;
const dropMs = reduceMotion ? 0 : TIMING.dropMs;
const headlineMs = reduceMotion ? 0 : TIMING.headlineMs;

const $ = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;

const app = $<HTMLElement>('[data-app]');
const stage = $<HTMLElement>('[data-phone-stage]');
const screen = $<HTMLElement>('[data-phone-screen]');
const viewport = $<HTMLElement>('[data-phone-viewport]');
const live = $<HTMLElement>('[data-live]', app);
const splashBar = $<HTMLElement>('[data-splash-bar]', app);
const chipList = $<HTMLElement>('[data-chips]', app);
const chips = Array.from(app.querySelectorAll<HTMLButtonElement>('[data-chip]'));
const countEl = $<HTMLElement>('[data-count]', app);
const limitMsg = $<HTMLElement>('[data-limit-msg]', app);
const findBtn = $<HTMLButtonElement>('[data-find]', app);
const orbit = $<HTMLElement>('[data-orbit]', app);
const matchingText = $<HTMLElement>('[data-matching-text]', app);
const foundSub = $<HTMLElement>('[data-found-sub]', app);
const resultsList = $<HTMLElement>('[data-results]', app);
const template = $<HTMLTemplateElement>('template[data-jigi-template]');

/* ── 화면 크기 맞추기: 393×852 앱을 실제 화면 폭에 맞게 scale ── */
new ResizeObserver(() => {
  viewport.style.setProperty('--app-scale', String(screen.clientWidth / 393));
}).observe(screen);

/* ── 타이머 ── */
const timers: number[] = [];
const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));
const clearTimers = () => {
  timers.forEach((t) => clearTimeout(t));
  timers.length = 0;
};

/* ── 상태 전환 ── */
let userInteracted = false;
const selected: string[] = [];

function setState(state: State) {
  app.dataset.state = state;
  app.querySelectorAll<HTMLElement>('[data-screen]').forEach((s) => {
    s.inert = s.dataset.screen !== state;
  });
  live.textContent = LIVE_TEXT[state];

  // 사용자가 직접 진행 중일 때만 새 화면 제목으로 포커스 이동 (첫 로드 시 포커스를 뺏지 않음)
  const heading = app.querySelector<HTMLElement>(`[data-screen="${state}"] [data-focus]`);
  if (heading && userInteracted) heading.focus({ preventScroll: true });

  if (state === 'splash') runSplash();
  if (state === 'select') app.querySelector('[data-screen="select"] .app-scroll')?.scrollTo(0, 0);
}

function runSplash() {
  splashBar.style.transition = 'none';
  splashBar.style.width = '0%';
  void splashBar.offsetWidth; // reflow로 transition 재시작
  splashBar.style.transition = `width ${TIMING.splashMs}ms linear`;
  splashBar.style.width = '100%';
  later(() => setState('home'), TIMING.splashMs);
}

function startIntro() {
  clearTimers();
  resetSelection();
  stage.classList.remove('is-dropping', 'is-landed');
  void stage.offsetWidth;
  stage.classList.add('is-dropping');
  setState('drop');
  later(() => setState('splash'), headlineMs + dropMs + splashDelayMs);
}

function skipIntro() {
  clearTimers();
  stage.classList.remove('is-dropping');
  stage.classList.add('is-landed');
  setState('home');
}

/* ── 취향 선택 ── */
function resetSelection() {
  selected.length = 0;
  chips.forEach((c) => c.setAttribute('aria-pressed', 'false'));
  limitMsg.textContent = '';
  updateSelection();
}

function updateSelection() {
  const n = selected.length;
  countEl.textContent =
    n < PICK_MIN ? `${n} / ${PICK_MAX} selected · pick at least ${PICK_MIN}` : `${n} / ${PICK_MAX} selected · ready to match`;
  chipList.classList.toggle('is-maxed', n >= PICK_MAX);
  findBtn.setAttribute('aria-disabled', String(n < PICK_MIN));
  if (n < PICK_MAX) limitMsg.textContent = '';
}

chips.forEach((chip) =>
  chip.addEventListener('click', () => {
    const id = chip.dataset.chip!;
    const i = selected.indexOf(id);
    if (i >= 0) {
      selected.splice(i, 1);
      chip.setAttribute('aria-pressed', 'false');
    } else if (selected.length >= PICK_MAX) {
      limitMsg.textContent = `You can pick up to ${PICK_MAX}.`;
      chip.classList.remove('is-shake');
      void chip.offsetWidth;
      chip.classList.add('is-shake');
      return;
    } else {
      selected.push(id);
      chip.setAttribute('aria-pressed', 'true');
    }
    updateSelection();
  }),
);
chips.forEach((c) => c.addEventListener('animationend', () => c.classList.remove('is-shake')));

/* ── 매칭 ── */
function runMatching() {
  // 선택한 취향 이모지를 원 위에 배치
  orbit.replaceChildren(
    ...selected.map((id, i) => {
      const item = INTERESTS.find((it) => it.id === id)!;
      const wrap = document.createElement('div');
      wrap.className = 'orbit-chip';
      wrap.style.setProperty('--a', `${(360 / selected.length) * i - 90}deg`);
      const span = document.createElement('span');
      span.textContent = item.emoji;
      wrap.append(span);
      return wrap;
    }),
  );
  MATCHING_TEXT.forEach((text, i) =>
    later(() => {
      matchingText.textContent = text;
      live.textContent = text;
    }, i * MATCHING_STEP_MS),
  );

  const matches = matchJigis(selected);
  renderResults(matches);
  foundSub.textContent = `${matches.length} locals who share your taste`;

  setState('matching');
  later(() => setState('found'), TIMING.matchingMs);
  later(() => setState('results'), TIMING.matchingMs + TIMING.foundMs);
}

function renderResults(matches: ReturnType<typeof matchJigis>) {
  const labelOf = (id: string) => INTERESTS.find((it) => it.id === id)?.label ?? id;
  resultsList.replaceChildren(
    ...matches.map(({ jigi, percent }, i) => {
      const node = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
      const q = <T extends HTMLElement>(k: string) => node.querySelector<T>(`[data-${k}]`)!;
      node.style.setProperty('--delay', `${i * 100}ms`);
      q('avatar').textContent = jigi.name[0];
      q('name').textContent = jigi.name;
      q('meta').textContent = `${jigi.age} · ${jigi.role}`;
      q('match').textContent = `${percent}% match`;
      q('bio').textContent = jigi.bio;
      q('langs').textContent = jigi.langs.map((l) => `${LANG_FLAGS[l] ?? ''} ${l}`.trim()).join(' · ');

      // 사용자가 고른 취향과 겹치는 태그를 먼저, 파란색으로
      const tags = [...jigi.tags].sort((a, b) => Number(selected.includes(b)) - Number(selected.includes(a)));
      q('tags').replaceChildren(
        ...tags.map((t) => {
          const li = document.createElement('li');
          const shared = selected.includes(t);
          li.className = shared
            ? 'rounded-full bg-traveler-strong px-2.5 py-1 text-[12px] font-semibold text-white'
            : 'rounded-full bg-bg px-2.5 py-1 text-[12px] font-medium text-muted';
          li.textContent = labelOf(t);
          if (shared) li.setAttribute('aria-label', `${labelOf(t)} (shared interest)`);
          return li;
        }),
      );
      q('spots').replaceChildren(
        ...jigi.spots.map((s) => {
          const li = document.createElement('li');
          li.textContent = `📍 ${s}`;
          return li;
        }),
      );

      const toggle = q<HTMLButtonElement>('toggle');
      const panel = q('panel');
      panel.id = `jigi-panel-${jigi.id}`;
      toggle.setAttribute('aria-controls', panel.id);
      toggle.addEventListener('click', () => {
        const open = toggle.getAttribute('aria-expanded') !== 'true';
        toggle.setAttribute('aria-expanded', String(open));
        toggle.textContent = open ? 'Hide profile' : 'View profile';
        panel.hidden = !open;
      });
      return node;
    }),
  );
}

/* ── 이벤트 ── */
app.addEventListener('click', () => (userInteracted = true), { capture: true });

app.querySelectorAll<HTMLElement>('[data-go]').forEach((btn) =>
  btn.addEventListener('click', () => setState(btn.dataset.go as State)),
);
findBtn.addEventListener('click', () => {
  if (findBtn.getAttribute('aria-disabled') === 'true') return;
  runMatching();
});
$<HTMLElement>('[data-start-over]', app).addEventListener('click', () => {
  clearTimers();
  resetSelection();
  setState('home');
});
// 결과 화면 'Join the early list' → 페이지 하단 대기자 등록 폼으로 이동 (고른 취향을 폼에 함께 담음)
$<HTMLElement>('[data-to-waitlist]', app).addEventListener('click', (e) => {
  e.preventDefault();
  const interests = document.querySelector<HTMLInputElement>('[data-wl-interests]');
  if (interests) interests.value = selected.map((id) => INTERESTS.find((it) => it.id === id)?.label ?? id).join(', ');
  document.getElementById('waitlist')?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  document.querySelector<HTMLElement>('[data-wl-method]')?.focus({ preventScroll: true });
});
$<HTMLElement>('[data-replay]').addEventListener('click', () => {
  userInteracted = true;
  startIntro();
});
$<HTMLElement>('[data-skip]').addEventListener('click', () => {
  userInteracted = true;
  skipIntro();
});

startIntro();
