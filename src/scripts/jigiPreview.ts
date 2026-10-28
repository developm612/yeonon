/**
 * /app-preview-jigi (지기) 화면 흐름.
 * drop → splash → home → taste → course → preview → publishing → done
 * 공통 동작(낙하·스플래시·화면 전환·타이머·칩 선택)은 scripts/phoneApp.ts.
 * 사용자 입력(코스 이름)은 textContent로만 화면에 넣는다.
 */
import {
  COURSE_MAX, COURSE_MIN, PUBLISH_MS, SPOTS, START_TIMES, TASTE_KO, TASTE_MAX, TASTE_MIN, WALK_MIN,
  type Spot,
} from '../data/jigiPreview';
import type { InterestId } from '../data/appPreview';
import { $, createPicker, initPhoneApp } from './phoneApp';

const PUBLISH_TEXT = ['코스를 정리하고 있어요…', '여행자에게 보일 카드를 만드는 중…', '거의 다 됐어요…'];

const phone = initPhoneApp<'taste' | 'course' | 'preview' | 'publishing' | 'done'>({
  liveText: {
    drop: '',
    splash: '연온 지기 앱을 여는 중',
    home: '홈 화면',
    taste: `취향 ${TASTE_MIN}~${TASTE_MAX}개 고르기`,
    course: `나만의 코스 만들기, 장소 ${COURSE_MIN}~${COURSE_MAX}곳`,
    preview: '여행자에게 보이는 코스 미리보기',
    publishing: '코스 등록 중',
    done: '코스가 준비됐어요',
  },
  onEnter: (state) => {
    if (state === 'course') renderSpots();
    if (state === 'preview') enterPreview();
  },
  onReset: () => resetAll(),
});
const { app, live, setState, later } = phone;

/* ── 1. 취향 ── */
const picker = createPicker($('[data-screen="taste"]', app), {
  min: TASTE_MIN,
  max: TASTE_MAX,
  countText: (n) => (n < TASTE_MIN ? `${n} / ${TASTE_MAX}개 선택 · ${TASTE_MIN}개 이상 골라 주세요` : `${n} / ${TASTE_MAX}개 선택 · 좋아요!`),
  limitText: `최대 ${TASTE_MAX}개까지 고를 수 있어요.`,
});
const tastes = picker.selected as InterestId[];
picker.onNext(() => setState('course'));

/* ── 2. 코스 만들기 ── */
const course: Spot[] = [];
let justAdded = '';

const courseList = $<HTMLElement>('[data-course-list]', app);
const courseEmpty = $<HTMLElement>('[data-course-empty]', app);
const courseCount = $<HTMLElement>('[data-course-count]', app);
const courseSummary = $<HTMLElement>('[data-course-summary]', app);
const courseMsg = $<HTMLElement>('[data-course-msg]', app);
const courseNext = $<HTMLButtonElement>('[data-course-next]', app);
const spotsMatch = $<HTMLElement>('[data-spots-match]', app);
const spotsOther = $<HTMLElement>('[data-spots-other]', app);
const spotTpl = $<HTMLTemplateElement>('template[data-spot-template]');
const stopTpl = $<HTMLTemplateElement>('template[data-stop-template]');

/** 머무는 시간 합 + 장소 사이 이동 시간 */
const totalMin = () => course.reduce((sum, s) => sum + s.min, 0) + Math.max(0, course.length - 1) * WALK_MIN;
const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h && `${h}시간`, m && `${m}분`].filter(Boolean).join(' ') || '0분';
};
const overlap = (s: Spot) => s.tags.filter((t) => tastes.includes(t)).length;

const clone = (tpl: HTMLTemplateElement) => tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
const fill = (node: HTMLElement, key: string, text: string) => (node.querySelector<HTMLElement>(`[data-${key}]`)!.textContent = text);

/** 장소 후보: 내 취향과 겹치는 곳을 위에 (겹치는 수 많은 순) */
function renderSpots() {
  const matched = SPOTS.filter((s) => overlap(s) > 0).sort((a, b) => overlap(b) - overlap(a));
  const others = SPOTS.filter((s) => overlap(s) === 0);
  const card = (spot: Spot) => {
    const li = clone(spotTpl);
    fill(li, 'emoji', spot.emoji);
    fill(li, 'name', spot.name);
    fill(li, 'desc', `${spot.desc} · ${spot.min}분`);
    const btn = li.querySelector<HTMLButtonElement>('[data-add]')!;
    btn.dataset.add = spot.id;
    btn.addEventListener('click', () => toggleSpot(spot, btn));
    return li;
  };
  spotsMatch.replaceChildren(...matched.map(card));
  spotsOther.replaceChildren(...others.map(card));
  updateCourse();
}

function toggleSpot(spot: Spot, btn: HTMLButtonElement) {
  const i = course.findIndex((s) => s.id === spot.id);
  if (i >= 0) {
    course.splice(i, 1);
  } else if (course.length >= COURSE_MAX) {
    courseMsg.textContent = `코스에는 최대 ${COURSE_MAX}곳까지 담을 수 있어요.`;
    btn.classList.remove('is-shake');
    void btn.offsetWidth;
    btn.classList.add('is-shake');
    return;
  } else {
    course.push(spot);
    justAdded = spot.id;
  }
  updateCourse();
}

function updateCourse() {
  courseList.replaceChildren(
    ...course.map((spot, i) => {
      const li = clone(stopTpl);
      if (spot.id === justAdded) li.classList.add('is-new');
      fill(li, 'no', String(i + 1));
      fill(li, 'emoji', spot.emoji);
      fill(li, 'name', spot.name);
      fill(li, 'min', `${spot.min}분 머물기`);
      const up = li.querySelector<HTMLButtonElement>('[data-up]')!;
      up.disabled = i === 0;
      up.setAttribute('aria-label', `${spot.name} 순서 앞으로`);
      up.addEventListener('click', () => {
        [course[i - 1], course[i]] = [course[i], course[i - 1]];
        justAdded = '';
        updateCourse();
        // 옮긴 장소의 버튼에 포커스 유지 (맨 위로 오면 위로 버튼이 꺼지므로 빼기 버튼)
        const moved = courseList.children[i - 1];
        moved?.querySelector<HTMLButtonElement>(i - 1 === 0 ? '[data-remove]' : '[data-up]')?.focus();
      });
      const remove = li.querySelector<HTMLButtonElement>('[data-remove]')!;
      remove.setAttribute('aria-label', `${spot.name} 빼기`);
      remove.addEventListener('click', () => {
        course.splice(i, 1);
        justAdded = '';
        updateCourse();
      });
      return li;
    }),
  );
  justAdded = '';

  const n = course.length;
  courseEmpty.hidden = n > 0;
  courseCount.textContent = `${n}곳`;
  courseSummary.textContent =
    n < COURSE_MIN ? `${n}곳 담음 · ${COURSE_MIN}곳 이상 담아 주세요` : `${n}곳 · 이동 포함 약 ${fmtDuration(totalMin())}`;
  if (n < COURSE_MAX) courseMsg.textContent = '';
  courseNext.setAttribute('aria-disabled', String(n < COURSE_MIN));

  app.querySelectorAll<HTMLButtonElement>('[data-add]').forEach((btn) => {
    const added = course.some((s) => s.id === btn.dataset.add);
    btn.setAttribute('aria-pressed', String(added));
    btn.textContent = added ? '담김 ✓' : '+ 담기';
  });
}

courseNext.addEventListener('click', () => {
  if (courseNext.getAttribute('aria-disabled') !== 'true') setState('preview');
});
app.addEventListener('animationend', (e) => (e.target as HTMLElement).classList?.remove('is-shake'));

/* ── 3. 미리보기 ── */
const titleInput = $<HTMLInputElement>('[data-course-title]', app);
const startBtns = Array.from(app.querySelectorAll<HTMLButtonElement>('[data-start]'));
const cardEmojis = $<HTMLElement>('[data-card-emojis]', app);
const cardTitle = $<HTMLElement>('[data-card-title]', app);
const cardDuration = $<HTMLElement>('[data-card-duration]', app);
const cardTags = $<HTMLElement>('[data-card-tags]', app);
const cardTimeline = $<HTMLElement>('[data-card-timeline]', app);
let startTime = START_TIMES[0].value;
let titleEdited = false;

const defaultTitle = () => `${TASTE_KO[tastes[0]] ?? '성수'} 좋아하는 지기의 성수 산책`;
const courseTitle = () => titleInput.value.trim() || defaultTitle();

function enterPreview() {
  if (!titleEdited) titleInput.value = defaultTitle();
  renderCard();
}

function renderCard() {
  cardEmojis.textContent = course.map((s) => s.emoji).join('');
  cardTitle.textContent = courseTitle();
  cardDuration.textContent = `약 ${fmtDuration(totalMin())} · ${course.length}곳`;
  cardTags.replaceChildren(
    ...tastes.map((id) => {
      const li = document.createElement('li');
      li.className = 'rounded-full bg-jigi-soft px-2.5 py-1 text-[12px] font-semibold text-jigi-strong';
      li.textContent = TASTE_KO[id];
      return li;
    }),
  );

  // 시작 시각부터 머무는 시간 + 이동 시간을 더해 각 장소 도착 시각 계산
  const [h, m] = startTime.split(':').map(Number);
  let t = h * 60 + m;
  const clock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
  cardTimeline.replaceChildren(
    ...course.flatMap((spot, i) => {
      const li = document.createElement('li');
      li.className = 'relative pb-3 last:pb-0';
      const dot = document.createElement('span');
      dot.className = 'absolute top-[5px] -left-[23px] size-[12px] rounded-full border-2 border-white bg-jigi-strong';
      dot.setAttribute('aria-hidden', 'true');
      const time = document.createElement('span');
      time.className = 'block text-[12px] font-bold text-jigi-strong tabular-nums';
      time.textContent = clock(t);
      const name = document.createElement('span');
      name.className = 'block text-[14px] font-semibold';
      name.textContent = `${spot.emoji} ${spot.name}`;
      li.append(dot, time, name);
      t += spot.min;
      if (i === course.length - 1) return [li];
      const walk = document.createElement('li');
      walk.className = 'pb-3 text-[12px] text-muted';
      walk.textContent = `🚶 걸어서 ${WALK_MIN}분`;
      t += WALK_MIN;
      return [li, walk];
    }),
  );
}

titleInput.addEventListener('input', () => {
  titleEdited = true;
  cardTitle.textContent = courseTitle();
});
startBtns.forEach((btn) =>
  btn.addEventListener('click', () => {
    startTime = btn.dataset.start!;
    startBtns.forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
    renderCard();
  }),
);

/* ── 4. 등록 → 완료 ── */
const orbit = $<HTMLElement>('[data-orbit]', app);
const publishText = $<HTMLElement>('[data-publish-text]', app);

$<HTMLButtonElement>('[data-publish]', app).addEventListener('click', () => {
  orbit.replaceChildren(
    ...course.map((spot, i) => {
      const wrap = document.createElement('div');
      wrap.className = 'orbit-chip';
      wrap.style.setProperty('--a', `${(360 / course.length) * i - 90}deg`);
      const span = document.createElement('span');
      span.textContent = spot.emoji;
      wrap.append(span);
      return wrap;
    }),
  );
  PUBLISH_TEXT.forEach((text, i) =>
    later(() => {
      publishText.textContent = text;
      live.textContent = text;
    }, i * (PUBLISH_MS / PUBLISH_TEXT.length)),
  );
  $<HTMLElement>('[data-done-title]', app).textContent = courseTitle();
  $<HTMLElement>('[data-done-meta]', app).textContent =
    `${START_TIMES.find((s) => s.value === startTime)!.label} 시작 · ${course.length}곳 · 약 ${fmtDuration(totalMin())}`;
  setState('publishing');
  later(() => setState('done'), PUBLISH_MS);
});

/* ── 처음부터 ── */
function resetAll() {
  picker.reset();
  course.length = 0;
  titleEdited = false;
  titleInput.value = '';
  startTime = START_TIMES[0].value;
  startBtns.forEach((b, i) => b.setAttribute('aria-checked', String(i === 0)));
  updateCourse();
}

// 완료 화면 '지기 사전 신청하기' → 페이지 하단 신청 폼으로 이동 (고른 취향·코스를 폼에 함께 담음)
$<HTMLElement>('[data-to-apply]', app).addEventListener('click', (e) => {
  e.preventDefault();
  const taste = document.querySelector<HTMLInputElement>('[data-ja-taste]');
  const courseField = document.querySelector<HTMLInputElement>('[data-ja-course]');
  if (taste) taste.value = tastes.map((id) => TASTE_KO[id]).join(', ');
  if (courseField) courseField.value = `${courseTitle()} | ${startTime} | ${course.map((s) => s.name).join(' → ')}`;
  phone.scrollToForm('jigi-apply', '#ja-name');
});

phone.start();
