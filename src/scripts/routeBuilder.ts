/**
 * 루트 빌더(components/routes/RouteBuilder.astro) 동작.
 * - 정류장 추가·빼기·순서 바꾸기 (앱 미리보기 '코스 만들기'와 같은 번호·위로·빼기 버튼)
 * - 태그 개수 제한, 정류장별 취향 칩
 * - 입력하는 대로 여행자용 코스 카드 미리보기 갱신 (scripts/courseCard.ts)
 * - 제출 전 서버와 같은 검증(lib/routeValidation.ts)으로 안내
 * 사용자 입력은 textContent로만 화면에 넣는다.
 */
import { INTERESTS } from '../data/interests';
import { STOP_MAX, STOP_TAG_MAX } from '../data/routeOptions';
import { courseMinutes, fmtDuration, stopEmoji } from '../lib/course';
import { readRouteForm, validateRoute } from '../lib/routeValidation';
import { renderCourseCard } from './courseCard';

const form = document.querySelector<HTMLFormElement>('[data-route-builder]');
if (form) {
  const $ = <T extends Element>(sel: string, root: ParentNode = form) => root.querySelector<T>(sel)!;
  const walk = Number(form.dataset.walk);
  const list = $<HTMLOListElement>('[data-stops]');
  const tpl = document.querySelector<HTMLTemplateElement>('template[data-stop-template]')!;
  const addBtn = $<HTMLButtonElement>('[data-add-stop]');
  const summary = $<HTMLElement>('[data-stops-summary]');
  const errorBox = $<HTMLElement>('[data-rb-error]');
  const card = $<HTMLElement>('[data-course-card]');
  const startBtns = Array.from(form.querySelectorAll<HTMLButtonElement>('[data-start]'));
  let start = startBtns[0]?.dataset.start ?? '14:00';
  const TAG_KO = new Map<string, string>(INTERESTS.map((it) => [it.id, it.ko]));

  const read = () => {
    const fd = new FormData(form);
    return readRouteForm((k) => String(fd.get(k) ?? ''), (k) => fd.getAll(k).map(String));
  };
  const stopsEls = () => Array.from(list.querySelectorAll<HTMLElement>('[data-stop]'));

  /** 번호·버튼 상태·요약·미리보기를 지금 입력에 맞춘다 */
  function refresh() {
    const els = stopsEls();
    els.forEach((el, i) => {
      $<HTMLElement>('[data-no]', el).textContent = String(i + 1);
      const name = $<HTMLInputElement>('[name="stop_place"]', el).value.trim();
      $<HTMLElement>('[data-stop-title]', el).textContent = name || `${i + 1}번 장소`;
      $<HTMLButtonElement>('[data-up]', el).disabled = i === 0;
      $<HTMLButtonElement>('[data-up]', el).setAttribute('aria-label', `${i + 1}번 장소 순서 앞으로`);
      $<HTMLButtonElement>('[data-remove]', el).setAttribute('aria-label', `${i + 1}번 장소 빼기`);
    });
    addBtn.disabled = els.length >= STOP_MAX;

    const { route, stops } = read();
    const total = courseMinutes(stops.map((s) => s.stay_minutes || 0), walk);
    const over = route.duration_minutes > 0 && total > route.duration_minutes;
    summary.textContent =
      `${stops.length}곳 · 이동 포함 약 ${fmtDuration(total)}` +
      (route.duration_minutes > 0 ? ` / 소요 시간 ${fmtDuration(route.duration_minutes)}${over ? ' — 코스가 더 길어요' : ''}` : '');
    summary.classList.toggle('text-[#B42318]', over);

    renderCourseCard(card, {
      title: route.title || '루트 이름',
      tags: route.tags.map((id) => TAG_KO.get(id) ?? id),
      stops: stops.map((s, i) => ({ emoji: stopEmoji(s.tags), name: s.place_name || `${i + 1}번 장소`, min: s.stay_minutes || 0 })),
      start,
      walk,
    });

    // 태그 최대 개수: 다 고르면 나머지는 잠근다
    const tagBox = $<HTMLElement>('[data-rb-tags]');
    const boxes = Array.from(tagBox.querySelectorAll<HTMLInputElement>('input'));
    const full = boxes.filter((b) => b.checked).length >= Number(tagBox.dataset.max);
    boxes.forEach((b) => (b.disabled = full && !b.checked));
  }

  function addStop() {
    if (stopsEls().length >= STOP_MAX) return;
    const el = tpl.content.firstElementChild!.cloneNode(true) as HTMLElement;
    list.append(el);
    refresh();
    $<HTMLInputElement>('[name="stop_place"]', el).focus();
  }

  addBtn.addEventListener('click', addStop);

  list.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const el = target.closest<HTMLElement>('[data-stop]');
    if (!el) return;
    if (target.closest('[data-up]')) {
      const prev = el.previousElementSibling;
      if (prev) list.insertBefore(el, prev);
      refresh();
      // 옮긴 장소의 버튼에 포커스 유지 (맨 위로 오면 위로 버튼이 꺼지므로 빼기 버튼)
      $<HTMLButtonElement>(el.previousElementSibling ? '[data-up]' : '[data-remove]', el).focus();
    } else if (target.closest('[data-remove]')) {
      const next = (el.nextElementSibling ?? el.previousElementSibling) as HTMLElement | null;
      el.remove();
      refresh();
      (next ? $<HTMLButtonElement>('[data-remove]', next) : addBtn).focus();
    } else {
      const chip = target.closest<HTMLButtonElement>('[data-tag]');
      if (!chip) return;
      const hidden = $<HTMLInputElement>('[data-stop-tags]', el);
      const tags = hidden.value.split(',').filter(Boolean);
      const id = chip.dataset.tag!;
      if (tags.includes(id)) tags.splice(tags.indexOf(id), 1);
      else if (tags.length < STOP_TAG_MAX) tags.push(id);
      hidden.value = tags.join(',');
      el.querySelectorAll<HTMLButtonElement>('[data-tag]').forEach((b) => b.setAttribute('aria-pressed', String(tags.includes(b.dataset.tag!))));
      refresh();
    }
  });

  form.addEventListener('input', refresh);
  form.addEventListener('change', refresh);
  startBtns.forEach((btn) =>
    btn.addEventListener('click', () => {
      start = btn.dataset.start!;
      startBtns.forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
      refresh();
    }),
  );

  form.addEventListener('submit', (e) => {
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    const error = validateRoute(read());
    if (error) {
      e.preventDefault();
      errorBox.textContent = error.message;
      errorBox.classList.remove('hidden');
      const target =
        error.index !== undefined
          ? stopsEls()[error.index]?.querySelector<HTMLElement>(`[name="${error.field}"]`)
          : error.field === 'stops'
            ? addBtn
            : form.querySelector<HTMLElement>(`[name="${error.field}"]`);
      target?.setAttribute('aria-invalid', 'true');
      target?.focus();
      return;
    }
    errorBox.classList.add('hidden');
    form.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach((b) => (b.disabled = true));
    // 비활성화된 버튼은 값이 전송되지 않으므로 누른 버튼의 의도를 숨은 칸으로 보낸다
    const submitter = (e as SubmitEvent).submitter as HTMLButtonElement | null;
    const intent = document.createElement('input');
    intent.type = 'hidden';
    intent.name = 'intent';
    intent.value = submitter?.value ?? 'save';
    form.append(intent);
    if (submitter) submitter.textContent = '저장하는 중…';
  });

  // 서버 검증에서 돌아온 경우 문제 칸으로 이동
  form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  refresh();
}
