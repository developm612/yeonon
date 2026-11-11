/**
 * 추천 입력(/app/discover) 읽기·검증. 화면(폼·결과 페이지 주소)과 /api/recommend가 같이 쓴다.
 * 입력은 취향 조건뿐이다 — 이름·이메일·연락처 같은 개인정보는 받지 않고, 자유 문장에서도 지운다.
 */
import { DISCOVER, DISCOVER_VIBES, RECOMMEND, TIMES_OF_DAY, type DiscoverVibe, type TimeOfDay } from '../../config/recommend';
import { INTEREST_MAX, INTEREST_MIN, isInterestId } from '../../data/interests';
import { isRouteLanguage } from '../../data/routeOptions';
import { kstToday } from '../availability';

export interface DiscoverInput {
  interests: string[];
  date_from: string;
  date_to: string;
  time_of_day: TimeOfDay;
  party_size: number;
  languages: string[];
  vibe: DiscoverVibe;
  note: string;
}

export type DiscoverField = keyof DiscoverInput;
export type DiscoverErrors = Partial<Record<DiscoverField, string>>;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const list = (v: unknown): string[] =>
  Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? v.split(',') : [];
const unique = (a: string[]) => [...new Set(a.map((s) => s.trim()).filter(Boolean))];

/** 연락처처럼 보이는 것(이메일·전화번호·링크·SNS 아이디)을 지운다 — 예약 메모도 같이 쓴다 */
export function redactContacts(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, '[removed]')
    .replace(/(https?:\/\/|www\.)\S+/gi, '[removed]')
    .replace(/\+?\d[\d\s().-]{7,}\d/g, '[removed]')
    .replace(/(^|\s)@[\w.]{2,}/g, '$1[removed]')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 추천 자유 문장: 연락처를 지우고 200자까지 */
export const redactNote = (text: string) => redactContacts(text).slice(0, DISCOVER.noteMax);

/** 처음 열었을 때 기본값: 오늘~2주 뒤, 시간 무관, 2명, 영어 */
export function defaultInput(profile?: { interests: string[]; languages: string[] } | null): DiscoverInput {
  const langs = (profile?.languages ?? []).filter(isRouteLanguage).slice(0, DISCOVER.languagesMax);
  return {
    interests: (profile?.interests ?? []).filter(isInterestId).slice(0, INTEREST_MAX),
    date_from: kstToday(),
    date_to: kstToday(DISCOVER.defaultDays),
    time_of_day: 'any',
    party_size: 2,
    languages: langs.length ? langs : ['English'],
    vibe: 'any',
    note: '',
  };
}

/** 주소(?interests=a,b&from=…)나 JSON 본문을 같은 모양으로 읽는다 (검증 전) */
export function readInput(get: (k: string) => unknown): DiscoverInput {
  return {
    interests: unique(list(get('interests'))),
    date_from: String(get('date_from') ?? get('from') ?? ''),
    date_to: String(get('date_to') ?? get('to') ?? ''),
    time_of_day: String(get('time_of_day') ?? get('time') ?? 'any') as TimeOfDay,
    party_size: Number(get('party_size') ?? get('party') ?? 0),
    languages: unique(list(get('languages') ?? get('lang'))),
    vibe: String(get('vibe') ?? 'any') as DiscoverVibe,
    note: String(get('note') ?? '').slice(0, DISCOVER.noteMax * 2),
  };
}

export function validateInput(raw: DiscoverInput): { input: DiscoverInput; errors: DiscoverErrors } {
  const errors: DiscoverErrors = {};
  const today = kstToday();
  const last = kstToday(DISCOVER.maxDaysAhead);

  if (raw.interests.length < INTEREST_MIN || raw.interests.length > INTEREST_MAX || !raw.interests.every(isInterestId)) {
    errors.interests = `Pick ${INTEREST_MIN} to ${INTEREST_MAX} interests.`;
  }
  if (!DATE.test(raw.date_from) || !DATE.test(raw.date_to)) errors.date_from = 'Choose your dates.';
  else if (raw.date_from < today) errors.date_from = 'Start date can’t be in the past.';
  else if (raw.date_to < raw.date_from) errors.date_to = 'End date must be on or after the start date.';
  else if (raw.date_to > last) errors.date_to = `You can search up to 4 weeks ahead (until ${last}).`;
  if (!TIMES_OF_DAY.some((t) => t.id === raw.time_of_day)) errors.time_of_day = 'Choose a time of day.';
  if (!Number.isInteger(raw.party_size) || raw.party_size < 1 || raw.party_size > DISCOVER.partyMax) {
    errors.party_size = `Group size must be 1 to ${DISCOVER.partyMax}.`;
  }
  if (raw.languages.length < 1 || raw.languages.length > DISCOVER.languagesMax || !raw.languages.every(isRouteLanguage)) {
    errors.languages = `Pick 1 to ${DISCOVER.languagesMax} languages.`;
  }
  if (!DISCOVER_VIBES.some((v) => v.id === raw.vibe)) errors.vibe = 'Choose a vibe.';
  if (raw.note.trim().length > DISCOVER.noteMax) errors.note = `Keep it under ${DISCOVER.noteMax} characters.`;

  return { input: { ...raw, note: redactNote(raw.note) }, errors };
}

/** 결과 페이지 주소용 쿼리 (?interests=…&from=…) */
export function toQuery(input: DiscoverInput): string {
  const q = new URLSearchParams({
    interests: input.interests.join(','),
    from: input.date_from,
    to: input.date_to,
    time: input.time_of_day,
    party: String(input.party_size),
    lang: input.languages.join(','),
    vibe: input.vibe,
  });
  if (input.note) q.set('note', input.note);
  return q.toString();
}

/** 같은 조건이면 같은 키 (순서 무관). 가중치·모델이 바뀌면 캐시도 새로 */
export async function cacheKey(input: DiscoverInput, models: { llm: string | null; embedding: string | null }) {
  const canonical = JSON.stringify({
    v: 1,
    i: [...input.interests].sort(),
    f: input.date_from,
    t: input.date_to,
    tod: input.time_of_day,
    p: input.party_size,
    l: [...input.languages].sort(),
    vb: input.vibe,
    n: input.note.toLowerCase(),
    w: RECOMMEND.weights,
    m: models,
  });
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
