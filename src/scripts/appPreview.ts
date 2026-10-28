/**
 * /app-preview (여행자) 화면 흐름.
 * drop → splash → home → select → matching → found → results
 * 공통 동작(낙하·스플래시·화면 전환·타이머·칩 선택)은 scripts/phoneApp.ts.
 */
import { INTERESTS, LANG_FLAGS, PICK_MAX, PICK_MIN, TIMING, matchJigis } from '../data/appPreview';
import { $, createPicker, initPhoneApp } from './phoneApp';

const MATCHING_TEXT = ['Reading your travel story…', 'Looking for Jigis in Seongsu…', 'Matching by taste…'];
const MATCHING_STEP_MS = 800;

const phone = initPhoneApp<'select' | 'matching' | 'found' | 'results'>({
  liveText: {
    drop: '',
    splash: 'Loading the YEONON app',
    home: 'Home screen',
    select: `Choose ${PICK_MIN} to ${PICK_MAX} travel interests`,
    matching: 'Finding your Jigis',
    found: 'We found your Jigis!',
    results: 'Your Jigis — sample profiles',
  },
  onReset: () => picker.reset(),
});
const { app, live, setState, later } = phone;

const picker = createPicker($('[data-screen="select"]', app), {
  min: PICK_MIN,
  max: PICK_MAX,
  countText: (n) =>
    n < PICK_MIN ? `${n} / ${PICK_MAX} selected · pick at least ${PICK_MIN}` : `${n} / ${PICK_MAX} selected · ready to match`,
  limitText: `You can pick up to ${PICK_MAX}.`,
});
const selected = picker.selected;

const orbit = $<HTMLElement>('[data-orbit]', app);
const matchingText = $<HTMLElement>('[data-matching-text]', app);
const foundSub = $<HTMLElement>('[data-found-sub]', app);
const resultsList = $<HTMLElement>('[data-results]', app);
const template = $<HTMLTemplateElement>('template[data-jigi-template]');

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
picker.onNext(runMatching);

// 결과 화면 'Join the early list' → 페이지 하단 대기자 등록 폼으로 이동 (고른 취향을 폼에 함께 담음)
$<HTMLElement>('[data-to-waitlist]', app).addEventListener('click', (e) => {
  e.preventDefault();
  const interests = document.querySelector<HTMLInputElement>('[data-wl-interests]');
  if (interests) interests.value = selected.map((id) => INTERESTS.find((it) => it.id === id)?.label ?? id).join(', ');
  phone.scrollToForm('waitlist', '[data-wl-method]');
});

phone.start();
