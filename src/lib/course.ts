/**
 * 코스(정류장 순서) 시간 계산. 앱 미리보기(/app-preview-jigi), 루트 빌더, 공개 루트 화면이 같이 쓴다.
 * 이동 시간은 장소 사이마다 같은 값(WALK_MIN)으로 어림한다.
 */
import { INTERESTS } from '../data/interests';

export interface CourseStop {
  emoji: string;
  name: string;
  /** 머무는 시간 (분) */
  min: number;
}

export type TimelineItem = { kind: 'stop'; at: number; stop: CourseStop; index: number } | { kind: 'walk'; minutes: number };

/** 머무는 시간 합 + 장소 사이 이동 시간 */
export const courseMinutes = (stays: number[], walk: number) =>
  stays.reduce((sum, m) => sum + m, 0) + Math.max(0, stays.length - 1) * walk;

export function fmtDuration(min: number, lang: 'ko' | 'en' = 'ko') {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (lang === 'en') return [h && `${h}h`, m && `${m}m`].filter(Boolean).join(' ') || '0m';
  return [h && `${h}시간`, m && `${m}분`].filter(Boolean).join(' ') || '0분';
}

/** 하루 기준 분 → "HH:MM" */
export const clock = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** 시작 시각(분)부터 머무는 시간 + 이동 시간을 더해 각 장소 도착 시각을 계산한다 */
export function courseTimeline(stops: CourseStop[], startMin: number, walk: number): TimelineItem[] {
  let t = startMin;
  return stops.flatMap((stop, index) => {
    const item: TimelineItem = { kind: 'stop', at: t, stop, index };
    t += stop.min;
    if (index === stops.length - 1) return [item];
    t += walk;
    return [item, { kind: 'walk', minutes: walk } as TimelineItem];
  });
}

/** 정류장 이모지: 첫 취향 태그의 이모지, 없으면 핀 */
export const stopEmoji = (tags: readonly string[]) => INTERESTS.find((it) => it.id === tags[0])?.emoji ?? '📍';
