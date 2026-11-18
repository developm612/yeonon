/**
 * 역할 바꾸기(여행자 ↔ 지기) 문의 — 본인이 직접 바꾸는 기능은 없고, 메일로 문의하면 관리자가 확인한 뒤 바꿔 준다
 * (관리자 회원 화면 /admin/users, DB 함수 admin_set_role — 마이그레이션 22번).
 * 조건(DB 함수가 다시 확인): 진행 중(대기·확정) 예약이 없을 것, 30일에 한 번.
 */
import { SITE } from '../config/site';

export const ROLE_CHANGE_DAYS = 30;

type Role = 'traveler' | 'jigi';

/** 메일 앱을 열어 문의 내용을 미리 채운다 (계정 이메일·현재 역할·바꿀 역할) */
export function roleChangeMailto(from: Role, email?: string | null): string {
  const to: Role = from === 'traveler' ? 'jigi' : 'traveler';
  const name = { traveler: '여행자 (Traveler)', jigi: '지기 (Local host)' };
  const subject = '[YEONON] 역할 변경 요청 · Role change request';
  const body = [
    `가입한 Google 이메일 · Account email: ${email ?? ''}`,
    `지금 역할 · Current role: ${name[from]}`,
    `바꾸고 싶은 역할 · Change to: ${name[to]}`,
    '이유 · Reason: ',
    '',
    `※ 진행 중인 예약이 없어야 하고, 역할은 ${ROLE_CHANGE_DAYS}일에 한 번 바꿀 수 있어요.`,
    `※ No active bookings, and roles can change once every ${ROLE_CHANGE_DAYS} days.`,
  ].join('\n');
  return `mailto:${SITE.contactEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
