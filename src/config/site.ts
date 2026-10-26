/**
 * 사이트 전역 상수.
 * 배포 전에 사람이 채워야 하는 값은 모두 여기 모여 있다. ('TODO:'로 시작하는 값)
 * 'TODO:'로 시작하는 링크는 빌드 시 '#'로 렌더링되고 콘솔에 경고가 찍힌다.
 */
export const SITE = {
  name: 'YEONON',
  nameKo: '연온',
  url: 'TODO: https://yeonon.xyz',
  contactEmail: 'TODO: hello@yeonon.xyz',
  operator: 'TODO: 운영 주체명 (예: 제이어스케어)',
  travelerFormUrl: 'TODO: 여행자 사전등록 설문 링크',
  jigiFormUrl: 'TODO: 지기 지원 설문 링크',
  formTool: 'TODO: Google Forms / Tally',
  retentionPeriod: 'TODO: 예) 사전 등록 종료 후 6개월 또는 삭제 요청 시',

  /** false면 /travelers의 가격 섹션 전체와 FAQ의 가격 문항이 숨겨진다. */
  showPrice: true,
  // TODO: 1인 기준인지 팀 기준인지 확정 후 문구 수정
  priceLabel: 'Around ₩120,000 for 4 hours',

  taglineEn: "Meet a local friend in Seoul who shares your taste — not a tour, a friend.",
  taglineKo: "외국인 여행자에게 취향이 맞는 한국인 현지 친구 '지기'를 연결해 주는 로컬 여행 매칭 플랫폼",
  sloganEn: 'Travel that starts with people, not products.',
  sloganKo: '상품이 아니라 사람으로 시작되는 여행',
} as const;

/** 지기 페이지 통계의 출처. TODO: 각 수치 출처 링크 확인 후 기입 */
export const STAT_SOURCES = [
  { id: 1, label: '한국관광공사 한국관광통계 (2025 방한 외래관광객)', url: 'TODO: 출처 링크' },
  { id: 2, label: '서울교통공사 성수역 외국인 승차 통계 (2026 상반기)', url: 'TODO: 출처 링크' },
  { id: 3, label: '성동구 외국인 카드 소비 데이터 (2026년 1~5월)', url: 'TODO: 출처 링크' },
];

export const isTodo = (value: string) => value.trim().startsWith('TODO');

/**
 * 외부 설문 링크에 UTM 파라미터를 붙인다. (유입 경로 기록용)
 * 링크가 아직 TODO면 '#'를 돌려준다.
 */
export function withUtm(url: string, medium: string, campaign = 'prelaunch'): string {
  if (isTodo(url)) return '#';
  const u = new URL(url);
  u.searchParams.set('utm_source', 'landing');
  u.searchParams.set('utm_medium', medium);
  u.searchParams.set('utm_campaign', campaign);
  return u.toString();
}

export const travelerForm = (medium: string) => withUtm(SITE.travelerFormUrl, medium);
export const jigiForm = (medium: string) => withUtm(SITE.jigiFormUrl, medium);
