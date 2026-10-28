/**
 * 앱 미리보기 공통 엔진 (/app-preview, /app-preview-jigi).
 * - 폰 낙하 → 스플래시 → 홈 인트로, Replay/Skip 버튼
 * - 393×852 앱 화면을 실제 폰 크기에 맞게 scale
 * - 화면 전환: [data-app]의 data-state + 보이는 [data-screen]에 .is-active
 * - 타이머는 timers 배열에 모아 한 번에 취소
 * - 취향 칩 선택 (createPicker)
 */
import { TIMING } from '../data/appPreview';

type BaseState = 'drop' | 'splash' | 'home';

interface PhoneAppOptions<S extends string> {
  /** 화면 전환 시 스크린리더에 읽어 줄 문구 */
  liveText: Record<BaseState | S, string>;
  /** 화면에 들어갈 때마다 호출 */
  onEnter?: (state: BaseState | S) => void;
  /** 인트로 재시작·처음부터 할 때 각 페이지의 선택 상태 초기화 */
  onReset?: () => void;
}

export const $ = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;

export function initPhoneApp<S extends string>({ liveText, onEnter, onReset }: PhoneAppOptions<S>) {
  type State = BaseState | S;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const splashDelayMs = reduceMotion ? 0 : TIMING.splashDelayMs;
  const dropMs = reduceMotion ? 0 : TIMING.dropMs;
  const headlineMs = reduceMotion ? 0 : TIMING.headlineMs;

  const app = $<HTMLElement>('[data-app]');
  const stage = $<HTMLElement>('[data-phone-stage]');
  const screen = $<HTMLElement>('[data-phone-screen]');
  const viewport = $<HTMLElement>('[data-phone-viewport]');
  const live = $<HTMLElement>('[data-live]', app);
  const splashBar = $<HTMLElement>('[data-splash-bar]', app);
  const screens = Array.from(app.querySelectorAll<HTMLElement>('[data-screen]'));

  /* ── 화면 크기 맞추기 ── */
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

  function setState(state: State) {
    app.dataset.state = state;
    screens.forEach((s) => {
      const active = s.dataset.screen === state;
      s.classList.toggle('is-active', active);
      s.inert = !active;
    });
    live.textContent = liveText[state];

    // 사용자가 직접 진행 중일 때만 새 화면 제목으로 포커스 이동 (첫 로드 시 포커스를 뺏지 않음)
    const heading = app.querySelector<HTMLElement>(`[data-screen="${state}"] [data-focus]`);
    if (heading && userInteracted) heading.focus({ preventScroll: true });
    app.querySelector(`[data-screen="${state}"] .app-scroll`)?.scrollTo(0, 0);

    if (state === 'splash') runSplash();
    onEnter?.(state);
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
    onReset?.();
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

  /** 처음부터: 선택 초기화 후 홈으로 */
  function restart() {
    clearTimers();
    onReset?.();
    setState('home');
  }

  /* ── 공통 이벤트 ── */
  app.addEventListener('click', () => (userInteracted = true), { capture: true });
  app.querySelectorAll<HTMLElement>('[data-go]').forEach((btn) =>
    btn.addEventListener('click', () => setState(btn.dataset.go as State)),
  );
  app.querySelectorAll<HTMLElement>('[data-start-over]').forEach((btn) => btn.addEventListener('click', restart));
  $<HTMLElement>('[data-replay]').addEventListener('click', () => {
    userInteracted = true;
    startIntro();
  });
  $<HTMLElement>('[data-skip]').addEventListener('click', () => {
    userInteracted = true;
    skipIntro();
  });

  /** 페이지 하단 폼으로 스크롤하고 첫 칸에 포커스 */
  function scrollToForm(sectionId: string, firstField: string) {
    document.getElementById(sectionId)?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    document.querySelector<HTMLElement>(firstField)?.focus({ preventScroll: true });
  }

  return { app, live, reduceMotion, setState, later, clearTimers, start: startIntro, scrollToForm };
}

interface PickerOptions {
  min: number;
  max: number;
  /** 선택 개수 안내 문구 */
  countText: (n: number) => string;
  /** 최대 개수를 넘겨 누를 때 문구 */
  limitText: string;
}

/**
 * 칩 여러 개 중 min~max개 고르기.
 * root 안의 [data-chips] 목록, [data-chip] 버튼, [data-count], [data-limit-msg], [data-pick-next] 버튼을 쓴다.
 */
export function createPicker(root: ParentNode, { min, max, countText, limitText }: PickerOptions) {
  const list = $<HTMLElement>('[data-chips]', root);
  const chips = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-chip]'));
  const countEl = $<HTMLElement>('[data-count]', root);
  const limitMsg = $<HTMLElement>('[data-limit-msg]', root);
  const next = $<HTMLButtonElement>('[data-pick-next]', root);
  const selected: string[] = [];

  function update() {
    const n = selected.length;
    countEl.textContent = countText(n);
    list.classList.toggle('is-maxed', n >= max);
    next.setAttribute('aria-disabled', String(n < min));
    if (n < max) limitMsg.textContent = '';
  }

  function reset() {
    selected.length = 0;
    chips.forEach((c) => c.setAttribute('aria-pressed', 'false'));
    limitMsg.textContent = '';
    update();
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const id = chip.dataset.chip!;
      const i = selected.indexOf(id);
      if (i >= 0) {
        selected.splice(i, 1);
        chip.setAttribute('aria-pressed', 'false');
      } else if (selected.length >= max) {
        limitMsg.textContent = limitText;
        chip.classList.remove('is-shake');
        void chip.offsetWidth;
        chip.classList.add('is-shake');
        return;
      } else {
        selected.push(id);
        chip.setAttribute('aria-pressed', 'true');
      }
      update();
    });
    chip.addEventListener('animationend', () => chip.classList.remove('is-shake'));
  });

  /** 다음 버튼: 최소 개수를 채웠을 때만 실행 */
  const onNext = (fn: () => void) =>
    next.addEventListener('click', () => {
      if (next.getAttribute('aria-disabled') !== 'true') fn();
    });

  update();
  return { selected, reset, onNext };
}
