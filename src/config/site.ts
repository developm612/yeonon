/**
 * 사이트 전역 상수.
 * 서비스 설명·대기자 설문은 새 랜딩 사이트가 맡는다 (yeonon-app-first-plan.md 4장). 이 앱에서 랜딩으로 가는 곳은
 * 내 정보의 About YEONON, 지기 탭 비로그인 화면의 '자세히 알아보기', 빈 피드 화면, 옛 설명 주소의 301 이동뿐이다.
 * 'TODO:'로 시작하는 값은 아직 정해지지 않은 것 — 랜딩 링크는 숨기고, 옛 설명 주소는 앱 첫 화면(/)으로 보낸다.
 */
export const SITE = {
  name: 'YEONON',
  nameKo: '연온',
  /** 새 랜딩 사이트 주소 (예: https://yeonon.com). 정해지면 여기 한 줄만 바꾸면 된다 */
  landingUrl: 'TODO: 새 랜딩 사이트 주소',
  contactEmail: 'yeonon.official2026@gmail.com',
  operator: '주식회사 제이어스케어',
  taglineEn: "Meet a local friend in Seoul who shares your taste — not a tour, a friend.",
} as const;

export const isTodo = (value: string) => value.trim().startsWith('TODO');

/** 랜딩 사이트 링크 (앱에서 온 것을 구분하는 UTM 포함). 주소가 아직 TODO면 null — 링크를 그리지 않는다 */
export function landingUrl(medium: string): string | null {
  if (isTodo(SITE.landingUrl)) return null;
  const u = new URL(SITE.landingUrl);
  u.searchParams.set('utm_source', 'app');
  u.searchParams.set('utm_medium', medium);
  return u.toString();
}
