/**
 * 이용약관(/terms)·개인정보처리방침(/privacy)에 들어가는 사업자 정보와 버전.
 * ⚠️ 두 문서는 초안이다 — 공개 전에 법률 전문가 검토를 받는다 (docs/launch-checklist.md).
 * 확정되지 않은 값은 'TODO:'로 시작한다. 화면에는 'TODO:'를 떼고 "확인 중"으로 보인다 (legalValue()).
 *
 * 버전(시행일) 규칙
 *   - termsVersion·privacyVersion은 각 문서의 시행일(YYYY-MM-DD)이다. 회원이 동의하면 profiles.terms_version·privacy_version에 남는다.
 *   - 문서 내용을 바꾸면 여기 날짜를 새 시행일로 바꾸고 history에 한 줄 더한다.
 *     → 다음 접속 때 모든 회원에게 /account/consent에서 다시 동의를 받는다 (src/middleware.ts).
 *   - 오타 수정처럼 동의를 다시 받을 필요가 없으면 날짜를 바꾸지 않는다.
 */
import { SITE } from './site';

export const LEGAL = {
  /** TODO: 법률 검토 후 실제 시행일로 바꾼다 (바꾸면 그전에 동의한 회원은 다시 동의) */
  termsVersion: '2026-11-11',
  privacyVersion: '2026-11-11',

  business: {
    name: SITE.operator,
    serviceName: '연온(YEONON)',
    representative: 'TODO: 대표자 이름',
    registrationNumber: 'TODO: 사업자등록번호',
    address: 'TODO: 사업장 주소',
    phone: 'TODO: 대표 전화번호',
    email: SITE.contactEmail,
  },

  /** 개인정보 보호책임자 */
  privacyOfficer: {
    name: 'TODO: 개인정보 보호책임자 이름',
    title: 'TODO: 직책',
    email: SITE.contactEmail,
    phone: 'TODO: 연락처',
  },

  /**
   * 보관 기간 (개인정보처리방침 표). 실제 자동 삭제는 DB 설정값이 한다 — 둘이 같아야 한다:
   *   chatMonths → chat_settings.retention_months (마이그레이션 13번), 나머지 → data_retention (19번)
   * DB 값을 바꾸면 여기도 바꾸고, 방침이 바뀌므로 privacyVersion(시행일)도 새로 정한다.
   */
  retention: {
    chatMonths: 6,
    auditLogMonths: 36,
    resolvedReportMonths: 36,
    recommendationMonths: 12,
    notificationMonths: 12,
    waitlistMonths: 12,
    translationLogDays: 2,
  },

  /** 분쟁 시 관할 법원 (약관 분쟁 조항) */
  court: 'TODO: 관할 법원 (예: 민사소송법상 관할 법원)',

  /**
   * 처리 위탁·국외 이전 (개인정보처리방침 표). 실제 계약·설정과 맞는지 확인이 필요한 칸은 TODO.
   *   items: 넘어가는 항목 / purpose: 목적 / retention: 업체에서의 보관 기간
   */
  processors: [
    {
      name: 'Supabase Inc.',
      country: '미국 (데이터 저장: 대한민국 서울 리전)',
      countryEn: 'USA (data stored in the Seoul, South Korea region)',
      items: '회원 정보, 지기 신청서, 루트·예약·채팅·후기·알림, 추천 기록, 로그인 세션',
      itemsEn: 'Account and profile data, jigi applications, routes, bookings, chats, reviews, notifications, recommendation logs, sign-in sessions',
      purpose: '데이터베이스·로그인(인증)·실시간 전달',
      purposeEn: 'Database, sign-in and real-time delivery',
      retention: '이 방침의 보관 기간과 같음 (탈퇴·보관 기간 만료 시 삭제)',
      retentionEn: 'Same as the retention periods in this notice',
      transfer: 'TODO: 이전 일시·방법 확인 (서비스 이용 시 네트워크로 전송)',
    },
    {
      name: 'Vercel Inc.',
      country: '미국',
      countryEn: 'USA',
      items: '접속 기록(IP 주소, 브라우저 정보, 요청 주소), 화면을 만드는 동안 거치는 요청 내용',
      itemsEn: 'Access logs (IP address, browser, requested pages) and request data passing through while pages are served',
      purpose: '웹사이트 호스팅·서버 실행',
      purposeEn: 'Website hosting and server functions',
      retention: 'TODO: Vercel 로그 보관 기간 확인 (요금제별 상이)',
      retentionEn: 'TODO: confirm Vercel log retention for our plan',
      transfer: 'TODO: 이전 일시·방법 확인',
    },
    {
      name: 'Google LLC',
      country: '미국',
      countryEn: 'USA',
      items: 'Google 로그인 시 이름·이메일·프로필 사진 (Google에서 연온으로 전달)',
      itemsEn: 'Name, email and profile photo shared by Google when you sign in',
      purpose: 'Google 계정 로그인',
      purposeEn: 'Sign in with Google',
      retention: 'Google 계정 정책에 따름',
      retentionEn: "Under Google's account policies",
      transfer: 'TODO: 확인 (로그인 시)',
    },
    {
      name: 'Anthropic PBC',
      country: '미국',
      countryEn: 'USA',
      items: '추천: 취향 조건(관심사·날짜·인원·언어·분위기·자유 문장 — 연락처는 지운 뒤)과 루트 공개 정보 / 번역: [번역]을 누른 메시지 내용',
      itemsEn: 'Recommendations: your preferences (interests, dates, group size, languages, vibe, free-text note with contact details removed) and public route info / Translation: the message you tap Translate on',
      purpose: 'AI 추천 순서·추천 이유 작성, 채팅 번역',
      purposeEn: 'AI ranking and "why this fits you" text, chat translation',
      retention: 'TODO: Anthropic API 데이터 보관 정책 확인 (계약·설정에 따름)',
      retentionEn: "TODO: confirm under Anthropic's API data policy",
      transfer: 'TODO: 확인 (추천·번역 요청 시)',
    },
    {
      name: 'Voyage AI (MongoDB, Inc.)',
      country: '미국',
      countryEn: 'USA',
      items: '취향 조건(관심사·자유 문장 — 연락처는 지운 뒤), 루트 공개 정보(제목·소개·태그·정류장 설명)',
      itemsEn: 'Your interests and note (contact details removed) and public route text',
      purpose: '의미 유사도 계산용 임베딩(문장 → 숫자 벡터) 생성',
      purposeEn: 'Creating embeddings to measure how similar routes are to your taste',
      retention: 'TODO: Voyage AI 데이터 보관 정책 확인',
      retentionEn: 'TODO: confirm under Voyage AI data policy',
      transfer: 'TODO: 확인 (추천 요청·루트 저장 시)',
    },
    {
      name: 'Resend, Inc.',
      country: '미국',
      countryEn: 'USA',
      items: '받는 사람 이메일 주소, 알림 메일 제목·내용 (채팅 메시지 내용은 넣지 않음)',
      itemsEn: 'Recipient email address and notification text (never chat message content)',
      purpose: '알림 메일 발송 (메일 기능을 켠 경우에만)',
      purposeEn: 'Sending notification emails (only when email is turned on)',
      retention: 'TODO: Resend 발송 기록 보관 기간 확인',
      retentionEn: 'TODO: confirm Resend log retention',
      transfer: 'TODO: 확인 (메일 발송 시)',
    },
    {
      name: 'Google LLC (Google Sheets·Gmail)',
      country: '미국',
      countryEn: 'USA',
      items: '사전 등록 대기자·지기 사전 신청 내용 (서비스 정식 오픈 전 폼)',
      itemsEn: 'Pre-launch waitlist and jigi pre-application form answers',
      purpose: '기존 대기자 명단 보관·새 신청 알림 메일',
      purposeEn: 'Storing the pre-launch waitlist and new-signup notification emails',
      retention: 'TODO: 서비스 이전 완료 후 시트 삭제 시점 확정 (계획: 이전 완료 2주 후 폼 중지, 보관 기간 후 삭제)',
      retentionEn: 'TODO: set the deletion date after migration',
      transfer: 'TODO: 확인 (폼 제출 시)',
    },
  ],

  /** 변경 이력 (최신이 위) */
  history: [
    { date: '2026-11-11', ko: '회원 서비스(로그인·루트·매칭·채팅·후기·AI 추천) 기준으로 전면 개정 (초안)', en: 'Rewritten for the member service: sign-in, routes, matching, chat, reviews and AI recommendations (draft)' },
    { date: '2026-10-01', ko: '사전 등록(대기자·지기 신청 폼) 안내 게시', en: 'Pre-launch waitlist and jigi application notice' },
  ],
} as const;

/** TODO 값은 화면에 "확인 중 / To be confirmed"로 보인다 (페이지에 TODO 글자가 그대로 나가지 않게) */
export const legalValue = (v: string, lang: 'ko' | 'en' = 'ko') =>
  v.trim().startsWith('TODO') ? (lang === 'ko' ? '확인 중' : 'To be confirmed') : v;

/** 'YYYY-MM-DD' → '2026년 11월 11일' / 'November 11, 2026' */
export function legalDate(iso: string, lang: 'ko' | 'en') {
  const [y, m, d] = iso.split('-').map(Number);
  return lang === 'ko'
    ? `${y}년 ${m}월 ${d}일`
    : new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric' });
}

/** 회원이 동의한 버전이 지금 문서와 같은지 (다르면 다시 동의) */
export const needsLegalConsent = (p: { terms_version?: string | null; privacy_version?: string | null }) =>
  p.terms_version !== LEGAL.termsVersion || p.privacy_version !== LEGAL.privacyVersion;
