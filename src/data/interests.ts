/**
 * 서비스 전체 공용 취향(관심사) 목록.
 * 여행자 관심사, 지기 취향, 루트 태그(Phase 3), AI 추천(Phase 4)이 모두 이 id를 쓴다.
 * DB에는 id만 저장하므로 id는 바꾸지 말 것 (이름·이모지는 바꿔도 된다).
 */
export const INTERESTS = [
  { id: 'korean-food', emoji: '🍲', label: 'Korean Food Tour', ko: '한식 투어' },
  { id: 'kpop', emoji: '🎤', label: 'K-Pop Spots', ko: 'K-팝 명소' },
  { id: 'popup', emoji: '🛍️', label: 'Pop-up Store Tour', ko: '팝업스토어' },
  { id: 'night-view', emoji: '🌃', label: 'Night Views', ko: '야경' },
  { id: 'healing', emoji: '🌿', label: 'Healing & Slow Travel', ko: '힐링·느린 여행' },
  { id: 'market', emoji: '🧺', label: 'Local Markets', ko: '전통시장' },
  { id: 'cafe', emoji: '☕', label: 'Hidden Cafés', ko: '숨은 카페' },
  { id: 'tradition', emoji: '🏮', label: 'Traditional Culture', ko: '전통문화' },
  { id: 'bakery', emoji: '🥐', label: 'Bakery Hopping', ko: '빵지순례' },
  { id: 'design', emoji: '✏️', label: 'Design & Stationery', ko: '디자인·문구' },
  { id: 'street-food', emoji: '🍢', label: 'Street Food', ko: '길거리 음식' },
  { id: 'bar', emoji: '🍻', label: 'Craft Beer & Bars', ko: '수제맥주·바' },
  { id: 'fashion', emoji: '👟', label: 'K-Fashion Shopping', ko: 'K-패션 쇼핑' },
  { id: 'river', emoji: '🌊', label: 'Han River & Seoul Forest', ko: '한강·서울숲' },
  { id: 'beauty', emoji: '💄', label: 'K-Beauty', ko: 'K-뷰티' },
  { id: 'vegan', emoji: '🥗', label: 'Vegan & Healthy Eats', ko: '비건·건강식' },
  { id: 'photo', emoji: '📸', label: 'Photo Walk', ko: '사진 산책' },
  { id: 'art', emoji: '🎨', label: 'Art & Galleries', ko: '전시·갤러리' },
  { id: 'vintage', emoji: '🧥', label: 'Vintage & Thrift', ko: '빈티지·구제' },
  { id: 'workshop', emoji: '🧶', label: 'Craft Workshops', ko: '공방 체험' },
] as const;

export type InterestId = (typeof INTERESTS)[number]['id'];

/** 한 사람이 고르는 취향 수 */
export const INTEREST_MIN = 3;
export const INTEREST_MAX = 5;

const IDS = new Set<string>(INTERESTS.map((it) => it.id));
export const isInterestId = (v: string): v is InterestId => IDS.has(v);

/** DB에 저장된 id 목록을 화면용 이름으로 (모르는 id는 그대로) */
export const interestNames = (ids: readonly string[], lang: 'en' | 'ko') =>
  ids.map((id) => {
    const it = INTERESTS.find((i) => i.id === id);
    return it ? (lang === 'ko' ? it.ko : it.label) : id;
  });
