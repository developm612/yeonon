/**
 * 취향 칩 여러 개 중 min~max개 고르기 — For you 입력(/for-you)의 관심사 칩 (components/app/InterestChips.astro).
 * (옛 앱 미리보기 scripts/phoneApp.ts에서 옮겼다)
 */
const $ = <T extends Element>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;

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
