/**
 * /app-preview-jigi (지기용 앱 미리보기) 데모 데이터.
 * 서버·DB 없이 이 파일의 샘플만 사용한다. 장소는 특정 가게가 아닌 예시 묘사다.
 * 취향 id는 여행자 미리보기(data/appPreview.ts INTERESTS)와 같다 — 같은 취향끼리 매칭되기 때문.
 */
import { INTERESTS, type InterestId } from './appPreview';

/** 취향 한국어 이름 */
export const TASTE_KO: Record<InterestId, string> = {
  'korean-food': '한식 투어',
  kpop: 'K-팝 명소',
  popup: '팝업스토어',
  'night-view': '야경',
  healing: '힐링·느린 여행',
  market: '전통시장',
  cafe: '숨은 카페',
  tradition: '전통문화',
  bakery: '빵지순례',
  design: '디자인·문구',
  'street-food': '길거리 음식',
  bar: '수제맥주·바',
  fashion: 'K-패션 쇼핑',
  river: '한강·서울숲',
  beauty: 'K-뷰티',
  vegan: '비건·건강식',
  photo: '사진 산책',
  art: '전시·갤러리',
  vintage: '빈티지·구제',
  workshop: '공방 체험',
};

export const TASTES = INTERESTS.map((it) => ({ id: it.id, emoji: it.emoji, label: TASTE_KO[it.id] }));

export const TASTE_MIN = 3;
export const TASTE_MAX = 5;

/** 코스에 담을 수 있는 장소 수 */
export const COURSE_MIN = 2;
export const COURSE_MAX = 5;
/** 장소 사이 이동 시간 (분) */
export const WALK_MIN = 15;

/** 코스 시작 시각 */
export const START_TIMES = [
  { value: '10:00', label: '오전 10시' },
  { value: '14:00', label: '오후 2시' },
  { value: '18:00', label: '오후 6시' },
];

/** 코스 등록 로딩 시간 (ms) */
export const PUBLISH_MS = 2600;

export const SPOTS = [
  { id: 'roastery', emoji: '☕', name: '수제화 골목 뒤 작은 로스터리', desc: '원두 향 가득한 바 좌석', min: 50, tags: ['cafe'] },
  { id: 'bakery', emoji: '🥐', name: '아침마다 줄 서는 동네 빵집', desc: '갓 구운 크루아상 한 봉지', min: 30, tags: ['bakery', 'cafe'] },
  { id: 'popup', emoji: '🛍️', name: '이번 주 새로 연 팝업스토어', desc: '매주 바뀌는 브랜드 체험', min: 40, tags: ['popup', 'fashion', 'design'] },
  { id: 'stationery', emoji: '✏️', name: '간판 없는 문구 편집숍', desc: '노트·스티커 덕후의 성지', min: 30, tags: ['design'] },
  { id: 'forest', emoji: '🌿', name: '서울숲 느린 산책', desc: '사슴 우리까지 천천히', min: 60, tags: ['healing', 'river', 'photo'] },
  { id: 'gallery', emoji: '🎨', name: '공장을 고친 갤러리', desc: '붉은 벽돌 속 현대 미술', min: 50, tags: ['art', 'design', 'photo'] },
  { id: 'market', emoji: '🧺', name: '뚝도시장 골목 구경', desc: '떡·전·반찬 가게 사이로', min: 40, tags: ['market', 'street-food', 'korean-food'] },
  { id: 'soup', emoji: '🍲', name: '40년 된 국밥집 점심', desc: '할머니 손맛 그대로', min: 50, tags: ['korean-food'] },
  { id: 'snack', emoji: '🍢', name: '포장마차 분식 한 접시', desc: '떡볶이·어묵·튀김', min: 30, tags: ['street-food'] },
  { id: 'vintage', emoji: '🧥', name: '창고형 빈티지 매장', desc: '보물찾기 같은 구제 쇼핑', min: 50, tags: ['vintage', 'fashion'] },
  { id: 'beauty', emoji: '💄', name: 'K-뷰티 편집숍', desc: '테스터 마음껏 발라 보기', min: 40, tags: ['beauty'] },
  { id: 'brewery', emoji: '🍻', name: '동네 수제 맥줏집', desc: '성수에서 만든 맥주 한 잔', min: 60, tags: ['bar', 'night-view'] },
  { id: 'bridge', emoji: '🌃', name: '해 질 녘 한강 다리 뷰', desc: '노을부터 야경까지', min: 40, tags: ['night-view', 'river', 'photo'] },
  { id: 'pottery', emoji: '🧶', name: '도자기 원데이 클래스', desc: '내 손으로 만드는 컵 하나', min: 90, tags: ['workshop', 'healing'] },
  { id: 'dance', emoji: '🎤', name: 'K-팝 댄스 오픈 클래스', desc: '초보도 따라 하는 한 곡', min: 60, tags: ['kpop'] },
  { id: 'fancafe', emoji: '💜', name: '아이돌 생일 카페 투어', desc: '포토 카드와 컵홀더 받기', min: 40, tags: ['kpop', 'cafe'] },
  { id: 'tea', emoji: '🏮', name: '한옥 찻집 다도 체험', desc: '차 한 잔으로 배우는 예절', min: 50, tags: ['tradition', 'healing'] },
  { id: 'vegan', emoji: '🥗', name: '식물성 브런치 카페', desc: '비건도 걱정 없는 한 끼', min: 50, tags: ['vegan', 'cafe'] },
] as const satisfies readonly { id: string; emoji: string; name: string; desc: string; min: number; tags: readonly InterestId[] }[];

export type Spot = (typeof SPOTS)[number];
