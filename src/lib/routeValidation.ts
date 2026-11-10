/**
 * 루트 빌더 폼 읽기·검증.
 * 브라우저(scripts/routeBuilder.ts, 저장 전 안내)와 서버(pages/partner/routes/*, 저장 전 재검증)가 같은 함수를 쓴다.
 * DB에도 같은 제약이 있고(20261110000004_routes.sql), 저장은 save_route 함수로만 한다.
 *
 * 정류장 칸은 정류장마다 같은 이름(stop_place, stop_area …)으로 반복되며, 화면 순서가 코스 순서다.
 */
import { isInterestId } from '../data/interests';
import {
  DURATIONS, LIMITS, PARTY_MAX, PRICE_MAX, ROUTE_TAG_MAX, ROUTE_TAG_MIN, STAY_OPTIONS, STOP_MAX, STOP_MIN, STOP_TAG_MAX,
  WALK_MIN, isRouteArea, isRouteLanguage,
} from '../data/routeOptions';
import { courseMinutes, fmtDuration } from './course';
import { clean } from '../scripts/formSafety';

export interface RouteDraft {
  title: string;
  summary: string;
  tags: string[];
  vibe: string;
  duration_minutes: number;
  meeting_point_note: string;
  area: string;
  max_party_size: number;
  languages: string[];
  list_price: number;
}

export interface StopDraft {
  place_name: string;
  area: string;
  stay_minutes: number;
  activity: string;
  tip: string;
  tags: string[];
}

export interface RouteForm {
  route: RouteDraft;
  stops: StopDraft[];
}

export interface RouteError {
  field: string;
  /** 정류장 칸이면 몇 번째 정류장인지 (0부터) */
  index?: number;
  message: string;
}

const int = (v: string) => (/^\d{1,7}$/.test(v.trim()) ? Number(v.trim()) : NaN);
const uniq = (values: string[]) => [...new Set(values)];

/** get: 한 칸의 값, getAll: 같은 이름 칸들의 값 (FormData의 get/getAll과 같은 모양) */
export function readRouteForm(get: (name: string) => string, getAll: (name: string) => string[]): RouteForm {
  const route: RouteDraft = {
    title: clean(get('title'), LIMITS.title[1]),
    summary: clean(get('summary'), LIMITS.summary[1]),
    tags: uniq(getAll('tags')).filter(isInterestId),
    vibe: get('vibe'),
    duration_minutes: int(get('duration_minutes')),
    meeting_point_note: clean(get('meeting_point_note'), LIMITS.meeting[1]),
    area: get('area'),
    max_party_size: int(get('max_party_size')),
    languages: uniq(getAll('languages')).filter(isRouteLanguage),
    // 쉼표·원 표시를 붙여 써도 숫자만 읽는다
    list_price: int(get('list_price').replace(/[,\s₩원]/g, '') || 'x'),
  };
  const places = getAll('stop_place');
  const stops = places.slice(0, STOP_MAX + 1).map((place, i) => ({
    place_name: clean(place, LIMITS.place[1]),
    area: getAll('stop_area')[i] ?? '',
    stay_minutes: int(getAll('stop_stay')[i] ?? ''),
    activity: clean(getAll('stop_activity')[i] ?? '', LIMITS.activity[1]),
    tip: clean(getAll('stop_tip')[i] ?? '', LIMITS.tip[1]),
    tags: uniq((getAll('stop_tags')[i] ?? '').split(',')).filter(isInterestId).slice(0, STOP_TAG_MAX),
  }));
  return { route, stops };
}

const len = (v: string, [min, max]: readonly [number, number]) => v.length >= min && v.length <= max;

/** 통과하면 null, 아니면 첫 번째 문제 */
export function validateRoute({ route: r, stops }: RouteForm): RouteError | null {
  if (!len(r.title, LIMITS.title)) return { field: 'title', message: `루트 이름을 ${LIMITS.title[0]}~${LIMITS.title[1]}자로 적어 주세요.` };
  if (!len(r.summary, LIMITS.summary)) return { field: 'summary', message: `한 줄 소개를 ${LIMITS.summary[0]}~${LIMITS.summary[1]}자로 적어 주세요.` };
  if (r.tags.length < ROUTE_TAG_MIN || r.tags.length > ROUTE_TAG_MAX) return { field: 'tags', message: `테마 태그를 ${ROUTE_TAG_MIN}~${ROUTE_TAG_MAX}개 골라 주세요.` };
  if (r.vibe !== 'slow' && r.vibe !== 'active') return { field: 'vibe', message: '분위기를 골라 주세요.' };
  if (!DURATIONS.includes(r.duration_minutes)) return { field: 'duration_minutes', message: '소요 시간을 골라 주세요.' };
  if (!isRouteArea(r.area)) return { field: 'area', message: '만나는 구역을 골라 주세요.' };
  if (!len(r.meeting_point_note, LIMITS.meeting)) return { field: 'meeting_point_note', message: `만나는 곳을 ${LIMITS.meeting[0]}~${LIMITS.meeting[1]}자로 적어 주세요. (공개 장소, 대략적인 위치)` };
  if (!(r.max_party_size >= 1 && r.max_party_size <= PARTY_MAX)) return { field: 'max_party_size', message: '최대 인원을 골라 주세요.' };
  if (!r.languages.length) return { field: 'languages', message: '진행할 수 있는 언어를 하나 이상 골라 주세요.' };
  if (!(r.list_price >= 0 && r.list_price <= PRICE_MAX && r.list_price % 1000 === 0)) {
    return { field: 'list_price', message: `정가를 0~${PRICE_MAX.toLocaleString('ko-KR')}원 사이, 1,000원 단위로 적어 주세요.` };
  }

  if (stops.length < STOP_MIN || stops.length > STOP_MAX) return { field: 'stops', message: `코스 장소를 ${STOP_MIN}~${STOP_MAX}곳 담아 주세요.` };
  for (const [i, s] of stops.entries()) {
    const no = `${i + 1}번 장소`;
    if (!len(s.place_name, LIMITS.place)) return { field: 'stop_place', index: i, message: `${no}의 이름을 ${LIMITS.place[0]}~${LIMITS.place[1]}자로 적어 주세요.` };
    if (!isRouteArea(s.area)) return { field: 'stop_area', index: i, message: `${no}의 구역을 골라 주세요.` };
    if (!STAY_OPTIONS.includes(s.stay_minutes)) return { field: 'stop_stay', index: i, message: `${no}에서 머무는 시간을 골라 주세요.` };
    if (!len(s.activity, LIMITS.activity)) return { field: 'stop_activity', index: i, message: `${no}에서 하는 일을 ${LIMITS.activity[0]}~${LIMITS.activity[1]}자로 적어 주세요.` };
  }
  const total = courseMinutes(stops.map((s) => s.stay_minutes), WALK_MIN);
  if (total > r.duration_minutes) {
    return { field: 'duration_minutes', message: `코스가 이동 포함 약 ${fmtDuration(total)}이라 소요 시간(${fmtDuration(r.duration_minutes)})보다 길어요. 소요 시간을 늘리거나 머무는 시간을 줄여 주세요.` };
  }
  return null;
}

/** save_route 함수에 보낼 모양 */
export const toRpcArgs = (id: string | null, { route, stops }: RouteForm) => ({
  p_id: id,
  p_route: route,
  p_stops: stops.map((s) => ({ ...s, tip: s.tip || null })),
});
