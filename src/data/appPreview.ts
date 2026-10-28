/**
 * /app-preview 데모 데이터.
 * 서버·DB 없이 이 파일의 샘플 데이터만 사용한다. 지기는 모두 가상 인물이다.
 */

/** 화면 전환 타이밍 (ms) */
export const TIMING = {
  headlineMs: 400,     // 헤드라인 페이드인 (폰 낙하 전)
  dropMs: 900,         // 폰 낙하 애니메이션
  splashDelayMs: 1000, // 착지 후 로고 등장까지
  splashMs: 3000,      // 로고 + 로딩
  matchingMs: 2500,    // 지기 찾는 중
  foundMs: 2000,       // '찾았어요' 문구 유지
};

export const PICK_MIN = 3;
export const PICK_MAX = 5;

export const INTERESTS = [
  { id: 'korean-food', emoji: '🍲', label: 'Korean Food Tour' },
  { id: 'kpop', emoji: '🎤', label: 'K-Pop Spots' },
  { id: 'popup', emoji: '🛍️', label: 'Pop-up Store Tour' },
  { id: 'night-view', emoji: '🌃', label: 'Night Views' },
  { id: 'healing', emoji: '🌿', label: 'Healing & Slow Travel' },
  { id: 'market', emoji: '🧺', label: 'Local Markets' },
  { id: 'cafe', emoji: '☕', label: 'Hidden Cafés' },
  { id: 'tradition', emoji: '🏮', label: 'Traditional Culture' },
  { id: 'bakery', emoji: '🥐', label: 'Bakery Hopping' },
  { id: 'design', emoji: '✏️', label: 'Design & Stationery' },
  { id: 'street-food', emoji: '🍢', label: 'Street Food' },
  { id: 'bar', emoji: '🍻', label: 'Craft Beer & Bars' },
  { id: 'fashion', emoji: '👟', label: 'K-Fashion Shopping' },
  { id: 'river', emoji: '🌊', label: 'Han River & Seoul Forest' },
  { id: 'beauty', emoji: '💄', label: 'K-Beauty' },
  { id: 'vegan', emoji: '🥗', label: 'Vegan & Healthy Eats' },
  { id: 'photo', emoji: '📸', label: 'Photo Walk' },
  { id: 'art', emoji: '🎨', label: 'Art & Galleries' },
  { id: 'vintage', emoji: '🧥', label: 'Vintage & Thrift' },
  { id: 'workshop', emoji: '🧶', label: 'Craft Workshops' },
] as const;

export type InterestId = (typeof INTERESTS)[number]['id'];

export const LANG_FLAGS: Record<string, string> = {
  Korean: '🇰🇷',
  English: '🇬🇧',
  Japanese: '🇯🇵',
};

// TODO: 샘플 지기 6명의 이름·소개 문구 최종 확인
export const SAMPLE_JIGIS = [
  { id: 'minji',   name: 'Minji',   age: '20s', role: 'Design student',       bio: 'I know every quiet café in Seongsu — and which pop-up is worth the line.', tags: ['cafe', 'popup', 'design', 'photo', 'bakery'], spots: ['A tiny roastery behind the shoe factories', 'A stationery shop with no sign', 'The best croissant on Yeonmujang-gil'], langs: ['Korean', 'English'] },
  { id: 'junho',   name: 'Junho',   age: '30s', role: 'Chef & foodie',        bio: "Let's eat like locals do — from grandma's soup to late-night street snacks.", tags: ['korean-food', 'street-food', 'market', 'bar', 'night-view'], spots: ['A 40-year-old seolleongtang place', 'Ttukseom night market stalls', 'A neighborhood craft brewery'], langs: ['Korean', 'English'] },
  { id: 'seoyeon', name: 'Seoyeon', age: '20s', role: 'Fashion creator',      bio: 'Pop-ups, vintage racks, and K-beauty finds — I shop Seongsu every weekend.', tags: ['fashion', 'popup', 'vintage', 'beauty', 'photo'], spots: ['A vintage warehouse store', 'A K-beauty concept shop', 'The rooftop for outfit photos'], langs: ['Korean', 'English', 'Japanese'] },
  { id: 'dohyun',  name: 'Dohyun',  age: '30s', role: 'Photographer',         bio: 'I walk Seongsu with a camera every day. I will show you the light.', tags: ['photo', 'art', 'night-view', 'river', 'design'], spots: ['Seoul Forest at golden hour', 'A gallery in an old factory', 'A bridge view after sunset'], langs: ['Korean', 'English'] },
  { id: 'hana',    name: 'Hana',    age: '20s', role: 'Yoga teacher',         bio: 'Slow mornings, green walks, and the best vegan bowls I know.', tags: ['healing', 'river', 'vegan', 'cafe', 'workshop'], spots: ['A morning walk in Seoul Forest', 'A plant-based brunch spot', 'A pottery class for beginners'], langs: ['Korean', 'English'] },
  { id: 'taeo',    name: 'Taeo',    age: '20s', role: 'K-pop dance student',  bio: 'Dance studios, fan cafés, and the places idols actually go.', tags: ['kpop', 'fashion', 'street-food', 'tradition', 'night-view'], spots: ['A K-pop dance studio open class', 'A themed fan café', 'A hanok street nearby for photos'], langs: ['Korean', 'English'] },
] as const;

export type Jigi = (typeof SAMPLE_JIGIS)[number];
export interface Match { jigi: Jigi; overlap: number; percent: number; }

/**
 * 데모용 단순 매칭.
 * 점수 = 겹치는 태그 수 / 선택한 태그 수, 표시 매칭률 = 72 + 점수 × 26 (72~98%).
 * 점수 높은 순(동점이면 데이터 순서), 겹치는 사람이 적어도 최소 3명·최대 4명.
 */
export function matchJigis(selected: readonly string[]): Match[] {
  const scored = SAMPLE_JIGIS.map((jigi, index) => {
    const overlap = jigi.tags.filter((t) => selected.includes(t)).length;
    const score = selected.length ? overlap / selected.length : 0;
    return { jigi, overlap, score, index, percent: Math.round(72 + score * 26) };
  }).sort((a, b) => b.score - a.score || a.index - b.index);

  const withOverlap = scored.filter((s) => s.overlap > 0).length;
  const count = Math.min(4, Math.max(3, withOverlap));
  return scored.slice(0, count).map(({ jigi, overlap, percent }) => ({ jigi, overlap, percent }));
}
