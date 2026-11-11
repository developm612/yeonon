/**
 * 루트(일정표) 선택지와 길이 제한.
 * 루트 빌더(/partner/routes), 서버 검증(lib/routeValidation.ts), 공개 화면(/routes)이 같이 쓴다.
 * DB 제약과 같아야 한다 — supabase/migrations/20261110000004_routes.sql (구역·언어 목록, 길이·범위 check)
 * 루트 태그는 공용 취향 목록(data/interests.ts)을 쓴다.
 */

/** 구역 — DB에는 id만 저장 */
export const ROUTE_AREAS = [
  { id: 'seongsu1', ko: '성수1가', en: 'Seongsu 1-ga' },
  { id: 'seongsu2', ko: '성수2가', en: 'Seongsu 2-ga' },
  { id: 'seoul-forest', ko: '서울숲', en: 'Seoul Forest' },
  { id: 'ttukseom', ko: '뚝섬', en: 'Ttukseom' },
  { id: 'songjeong', ko: '송정동', en: 'Songjeong-dong' },
  { id: 'nearby', ko: '성수 근처', en: 'Near Seongsu' },
] as const;
export type RouteAreaId = (typeof ROUTE_AREAS)[number]['id'];
export const isRouteArea = (v: string): v is RouteAreaId => ROUTE_AREAS.some((a) => a.id === v);
export const areaName = (id: string, lang: 'en' | 'ko') => ROUTE_AREAS.find((a) => a.id === id)?.[lang] ?? id;

/** 진행 언어 — 여행자 프로필 언어(data/accountNav.ts TRAVELER_LANGUAGES)와 같은 값 */
export const ROUTE_LANGUAGES = [
  { id: 'English', ko: '영어' },
  { id: 'Korean', ko: '한국어' },
  { id: 'Japanese', ko: '일본어' },
  { id: 'Chinese', ko: '중국어' },
  { id: 'Spanish', ko: '스페인어' },
  { id: 'French', ko: '프랑스어' },
  { id: 'German', ko: '독일어' },
] as const;
export const isRouteLanguage = (v: string) => ROUTE_LANGUAGES.some((l) => l.id === v);
export const languageName = (id: string, lang: 'en' | 'ko') => (lang === 'en' ? id : ROUTE_LANGUAGES.find((l) => l.id === id)?.ko ?? id);

export const VIBES = [
  { id: 'slow', ko: '느긋하게', en: 'Slow & easy' },
  { id: 'active', ko: '활동적으로', en: 'Active' },
] as const;
export const vibeName = (id: string, lang: 'en' | 'ko') => VIBES.find((v) => v.id === id)?.[lang] ?? id;

/** 소요 시간 2~4시간, 30분 단위 */
export const DURATIONS = [120, 150, 180, 210, 240];
export const PARTY_MAX = 6;
export const PRICE_MAX = 500_000;

export const ROUTE_TAG_MIN = 2;
export const ROUTE_TAG_MAX = 5;
export const STOP_MIN = 2;
export const STOP_MAX = 6;
export const STOP_TAG_MAX = 3;
/** 머무는 시간 10~180분, 10분 단위 */
export const STAY_OPTIONS = Array.from({ length: 18 }, (_, i) => (i + 1) * 10);
/** 장소 사이 이동 시간 (분) — 코스 미리보기의 도착 시각 계산용 */
export const WALK_MIN = 15;

export const LIMITS = {
  title: [4, 40],
  summary: [10, 140],
  meeting: [5, 100],
  place: [2, 40],
  activity: [5, 200],
  tip: [0, 200],
} as const;

/** 루트 상태 이름·설명 (지기·관리자 화면) */
export const ROUTE_STATUS = {
  draft: { label: '작성 중', desc: '아직 여행자에게 보이지 않아요. 다 쓰면 검수를 요청해 주세요.' },
  in_review: { label: '검수 중', desc: '연온이 내용을 확인하고 있어요. 검수 중에는 고칠 수 없어요.' },
  published: { label: '공개', desc: '여행자에게 보이고 있어요.' },
  changes_requested: { label: '수정 요청', desc: '아래 사유를 확인하고 고친 뒤 다시 검수를 요청해 주세요.' },
  hidden: { label: '비공개', desc: '연온이 비공개로 바꿨어요. 고친 뒤 다시 검수를 요청할 수 있어요.' },
} as const;
export type RouteStatus = keyof typeof ROUTE_STATUS;
export const ROUTE_STATUSES = Object.keys(ROUTE_STATUS) as RouteStatus[];

/** 가능 시간 */
export const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const WEEKDAYS_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const AVAILABILITY_RULE_MAX = 28;
export const CONFIRM_MODES = [
  { id: 'manual', label: '수락 후 확정', desc: '요청이 오면 응답 기한(기본 12시간, 만남이 24시간 안이면 2시간) 안에 내가 수락해야 확정돼요. 기한이 지나면 자동으로 만료돼요. (추천)' },
  { id: 'instant', label: '즉시 확정', desc: '열어 둔 시간에 요청이 오면 바로 확정돼요. 확정 후 취소하면 기록이 남으니 꼭 지킬 수 있는 시간만 열어 주세요.' },
] as const;
