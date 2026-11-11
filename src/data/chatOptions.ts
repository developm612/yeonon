/**
 * 채팅 화면 문구·선택지 (여행자 영어, 지기·관리자 한국어). 서버 페이지와 Preact 아일랜드가 같이 쓴다.
 */
import type { Lang } from './bookingOptions';

export const REPORT_REASONS: { id: string; en: string; ko: string }[] = [
  { id: 'harassment', en: 'Rude or harassing messages', ko: '불쾌하거나 괴롭히는 메시지' },
  { id: 'contact_payment', en: 'Asked for contact details or payment outside YEONON', ko: '연락처 요구 또는 앱 밖 결제 유도' },
  { id: 'safety', en: 'I feel unsafe', ko: '안전이 걱정돼요' },
  { id: 'spam', en: 'Spam or advertising', ko: '스팸·광고' },
  { id: 'other', en: 'Something else', ko: '기타' },
];

export const REPORT_STATUS: Record<string, { ko: string }> = {
  open: { ko: '처리 대기' },
  dismissed: { ko: '문제없음' },
  warned: { ko: '경고' },
  suspended: { ko: '정지' },
};

/** flagged 메시지 아래 안전 안내 */
export const SAFETY_NOTICE: Record<Lang, string> = {
  en: 'For your safety, keep chats and payments in YEONON. Sharing contact details or paying outside the app isn’t allowed.',
  ko: '안전을 위해 대화와 결제는 연온 안에서만 해 주세요. 연락처 공유나 앱 밖 결제 유도는 허용되지 않아요.',
};

/** 확정 전(대기 중) 대화 안내 */
export const PENDING_NOTICE: Record<Lang, string> = {
  en: 'Before confirmation: questions only. Your jigi can answer here while deciding.',
  ko: '확정 전에는 질문만 주고받아요. 요청을 수락하면 자유롭게 대화할 수 있어요.',
};

export const CLOSED_NOTICE: Record<Lang, string> = {
  en: 'This booking is closed, so the chat is read-only.',
  ko: '종료된 예약이라 대화는 읽기만 할 수 있어요.',
};
