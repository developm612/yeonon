/**
 * 코스 카드(components/routes/CourseCard.astro) 채우기. 앱 미리보기와 루트 빌더가 같이 쓴다.
 * 사용자 입력(코스 이름·장소 이름)은 textContent로만 넣는다.
 */
import { clock, courseMinutes, courseTimeline, fmtDuration, toMinutes, type CourseStop } from '../lib/course';

export interface CourseCardData {
  title: string;
  /** 취향 이름 (화면에 보일 글자) */
  tags: string[];
  stops: CourseStop[];
  /** 시작 시각 "HH:MM" */
  start: string;
  walk: number;
}

export function renderCourseCard(card: HTMLElement, data: CourseCardData) {
  const q = (key: string) => card.querySelector<HTMLElement>(`[data-card-${key}]`)!;
  q('emojis').textContent = data.stops.map((s) => s.emoji).join('');
  q('title').textContent = data.title;
  q('duration').textContent = `약 ${fmtDuration(courseMinutes(data.stops.map((s) => s.min), data.walk))} · ${data.stops.length}곳`;
  q('tags').replaceChildren(
    ...data.tags.map((label) => {
      const li = document.createElement('li');
      li.className = 'rounded-full bg-jigi-soft px-2.5 py-1 text-[12px] font-semibold text-jigi-strong';
      li.textContent = label;
      return li;
    }),
  );
  q('timeline').replaceChildren(
    ...courseTimeline(data.stops, toMinutes(data.start), data.walk).map((item) => {
      const li = document.createElement('li');
      if (item.kind === 'walk') {
        li.className = 'pb-3 text-[12px] text-muted';
        li.textContent = `🚶 걸어서 ${item.minutes}분`;
        return li;
      }
      li.className = 'relative pb-3 last:pb-0';
      const dot = document.createElement('span');
      dot.className = 'absolute top-[5px] -left-[23px] size-[12px] rounded-full border-2 border-white bg-jigi-strong';
      dot.setAttribute('aria-hidden', 'true');
      const time = document.createElement('span');
      time.className = 'block text-[12px] font-bold text-jigi-strong tabular-nums';
      time.textContent = clock(item.at);
      const name = document.createElement('span');
      name.className = 'block text-[14px] font-semibold';
      name.textContent = `${item.stop.emoji} ${item.stop.name}`;
      li.append(dot, time, name);
      return li;
    }),
  );
}
