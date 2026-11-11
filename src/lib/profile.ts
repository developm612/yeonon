/**
 * 회원 프로필(profiles 테이블)과 역할별 이동 규칙.
 * 테이블 정의: supabase/migrations/20261110000001_profiles.sql
 */
export type Role = 'traveler' | 'jigi' | 'admin';

export interface Profile {
  id: string;
  role: Role | null;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  locale: 'en' | 'ko';
  nationality: string | null;
  languages: string[];
  interests: string[];
  marketing_opt_in: boolean;
  terms_agreed_at: string | null;
  /** 동의한 약관·개인정보처리방침 시행일 (src/config/legal.ts와 다르면 다시 동의) */
  terms_version: string | null;
  privacy_version: string | null;
  status: 'active' | 'suspended' | 'deleted';
  created_at: string;
}

export const PROFILE_COLUMNS =
  'id, role, display_name, email, avatar_url, locale, nationality, languages, interests, marketing_opt_in, terms_agreed_at, terms_version, privacy_version, status, created_at';

/** 관리자는 온보딩 없이 들어올 수 있다 (역할을 SQL로 부여하므로) */
export const isOnboarded = (p: Profile) => p.role === 'admin' || (p.role !== null && p.terms_agreed_at !== null);

/** 로그인한 사람이 기본으로 갈 곳 */
export function homeFor(p: Profile | null): string {
  if (!p) return '/onboarding';
  if (p.status !== 'active') return '/suspended';
  if (!isOnboarded(p)) return '/onboarding';
  if (p.role === 'admin') return '/admin';
  return p.role === 'jigi' ? '/partner' : '/app';
}

/** 영역별로 들어갈 수 있는 역할 (관리자는 확인용으로 모든 영역에 들어갈 수 있다) */
export const AREAS: { base: string; roles: Role[] }[] = [
  { base: '/app', roles: ['traveler', 'admin'] },
  { base: '/partner', roles: ['jigi', 'admin'] },
  { base: '/admin', roles: ['admin'] },
];

export const inArea = (path: string, base: string) => path === base || path.startsWith(base + '/');
