/**
 * 가능 시간 폼 읽기·검증 (/partner/availability). DB 함수 save_availability가 같은 규칙을 다시 확인한다.
 * 시간은 한국 시간 기준, 30분 단위.
 */
import { AVAILABILITY_RULE_MAX, WEEKDAYS } from '../data/routeOptions';
import { toMinutes } from './course';

/** 고를 수 있는 시각: 07:00 ~ 23:00, 30분 단위 */
export const TIME_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const m = 7 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
});
const isTime = (v: string) => TIME_OPTIONS.includes(v);

export interface Rule {
  weekday: number;
  start_time: string;
  end_time: string;
}

/** 요일·시작·끝이 같은 순서로 반복되는 칸들. 빈 줄은 건너뛴다 */
export function readRules(weekdays: string[], starts: string[], ends: string[]): { rules: Rule[]; error?: string } {
  const rules: Rule[] = [];
  for (const [i, w] of weekdays.entries()) {
    const start = starts[i] ?? '';
    const end = ends[i] ?? '';
    if (!w && !start && !end) continue;
    const weekday = Number(w);
    if (!/^[0-6]$/.test(w) || !isTime(start) || !isTime(end)) return { rules, error: '요일과 시작·끝 시각을 모두 골라 주세요.' };
    if (toMinutes(end) <= toMinutes(start)) return { rules, error: `${WEEKDAYS[weekday]}요일: 끝나는 시각이 시작보다 늦어야 해요.` };
    rules.push({ weekday, start_time: start, end_time: end });
  }
  if (rules.length > AVAILABILITY_RULE_MAX) return { rules, error: `반복 시간은 ${AVAILABILITY_RULE_MAX}개까지 정할 수 있어요.` };
  for (const [i, a] of rules.entries()) {
    for (const b of rules.slice(i + 1)) {
      if (a.weekday === b.weekday && toMinutes(a.start_time) < toMinutes(b.end_time) && toMinutes(b.start_time) < toMinutes(a.end_time)) {
        return { rules, error: `${WEEKDAYS[a.weekday]}요일 시간이 서로 겹쳐요. 하나로 합치거나 겹치지 않게 바꿔 주세요.` };
      }
    }
  }
  rules.sort((a, b) => a.weekday - b.weekday || toMinutes(a.start_time) - toMinutes(b.start_time));
  return { rules };
}

export function readException(date: string, type: string, start: string, end: string, today: string, lastDay: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > lastDay) return { error: '오늘부터 90일 안의 날짜를 골라 주세요.' };
  if (type !== 'closed' && type !== 'extra') return { error: '쉬는 날인지 추가로 여는 날인지 골라 주세요.' };
  if (!start && !end) {
    if (type === 'extra') return { error: '추가로 여는 날은 시작·끝 시각을 골라 주세요.' };
    return { value: { p_date: date, p_type: type, p_start: null, p_end: null } };
  }
  if (!isTime(start) || !isTime(end)) return { error: '시작·끝 시각을 모두 골라 주세요.' };
  if (toMinutes(end) <= toMinutes(start)) return { error: '끝나는 시각이 시작보다 늦어야 해요.' };
  return { value: { p_date: date, p_type: type, p_start: start, p_end: end } };
}

/** 한국 날짜 "YYYY-MM-DD" (+ days일) */
export const kstToday = (days = 0) => new Date(Date.now() + days * 86_400_000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
