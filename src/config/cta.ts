/**
 * 공개 페이지의 주요 버튼(CTA). 회원 기능 공개 스위치(PUBLIC_MEMBER_UI)에 따라 바뀐다 — 계획서 5장 'CTA 교체'.
 *   false(지금): 사전 등록 흐름 — 여행자 'Join the early list' → /app-preview 대기자 폼, 지기 '지기 지원하기' → /app-preview-jigi 사전 신청 폼
 *   true(오픈):  로그인 흐름 — 여행자 'Find my route' → Google 로그인 → 온보딩 → AI 추천(/app/discover),
 *                지기 'Google로 시작하고 지원하기' → Google 로그인 → 온보딩(지기 선택) → 지기 신청서(/partner/apply)
 * PUBLIC_ 값은 빌드할 때 페이지에 들어가므로 Vercel에서 바꾸면 다시 배포해야 한다.
 */
import { isMemberUiPublic } from '../lib/supabase';

export const MEMBER_OPEN = isMemberUiPublic;

export const TRAVELER_CTA = MEMBER_OPEN
  ? { href: `/login?next=${encodeURIComponent('/app/discover')}`, label: 'Find my route' }
  : { href: '/app-preview', label: 'Join the early list' };

export const JIGI_CTA = MEMBER_OPEN
  ? { href: `/login?next=${encodeURIComponent('/partner/apply')}`, label: 'Google로 시작하고 지원하기' }
  : { href: '/app-preview-jigi', label: '지기 지원하기' };

/** 앱 미리보기(데모) 결과 화면의 버튼 — 오픈 후에는 실제 추천으로 (계획서 9장) */
export const PREVIEW_RESULT_CTA = MEMBER_OPEN
  ? { href: TRAVELER_CTA.href, label: 'Find my real route' }
  : { href: '#waitlist', label: 'Join the early list' };
