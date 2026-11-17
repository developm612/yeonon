/**
 * 메뉴 (yeonon-app-first-plan.md 1장·5장). 여행자·지기는 모바일 하단 탭바(components/ui/TabBar)와 데스크톱 메뉴가 같은 목록을 쓴다.
 * icon은 components/Icon.astro 이름.
 */
export const TRAVELER_NAV = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/for-you', label: 'For you', icon: 'spark' },
  { href: '/bookings', label: 'Bookings', icon: 'calendar' },
  { href: '/chats', label: 'Chats', icon: 'chat' },
  { href: '/me', label: 'My', icon: 'user' },
] as const;

/** 지기 하단 탭바 (모바일) */
export const PARTNER_TABS = [
  { href: '/partner', label: '요청', icon: 'bell' },
  { href: '/partner/routes', label: '내 루트', icon: 'route' },
  { href: '/partner/availability', label: '가능 시간', icon: 'clock' },
  { href: '/partner/messages', label: '채팅', icon: 'chat' },
  { href: '/partner/me', label: '내 정보', icon: 'user' },
] as const;

/** 지기 데스크톱 메뉴 (상단 바 아래 얇은 메뉴) */
export const PARTNER_NAV = [
  { href: '/partner', label: '지기 홈' },
  { href: '/partner/bookings', label: '예약' },
  { href: '/partner/messages', label: '채팅' },
  { href: '/partner/routes', label: '내 루트' },
  { href: '/partner/availability', label: '가능 시간' },
  { href: '/partner/me', label: '내 정보' },
];

export const ADMIN_NAV = [
  { href: '/admin', label: '대시보드' },
  { href: '/admin/users', label: '회원' },
  { href: '/admin/jigi-applications', label: '지기 신청' },
  { href: '/admin/routes', label: '루트 검수' },
  { href: '/admin/bookings', label: '예약' },
  { href: '/admin/promotions', label: '할인·예약 규칙' },
  { href: '/admin/reports', label: '신고·안전' },
  { href: '/admin/recommendations', label: '추천 로그' },
  { href: '/admin/waitlist', label: '대기자 명단' },
];

/** 여행자가 고를 수 있는 사용 언어 */
export const TRAVELER_LANGUAGES = ['English', 'Korean', 'Japanese', 'Chinese', 'Spanish', 'French', 'German', 'Other'];
