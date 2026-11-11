/**
 * 채팅 서버 설정 (Phase 6). DB 쪽 규칙(1분 메시지 수·보관 기간·안 읽은 메일 기준)은 supabase chat_settings 한 행에 있다.
 * 연락처·외부 결제 감지 규칙: supabase/migrations/20261110000014_chat_safety.sql
 */
export const CHAT = {
  /** 메시지 최대 길이 (DB check와 같다) */
  messageMax: 1000,
  /** 대화 화면에서 처음 불러오는 최근 메시지 수 */
  initialMessages: 200,
  /** 신고 내용 최대 길이 */
  reportDetailMax: 500,
  /** 번역: 사용자당 시간당 횟수, LLM 시간 제한 (LLM_API_KEY가 있을 때만 버튼이 보인다) */
  translatePerHour: 30,
  translateTimeoutMs: 8000,
  translateMaxTokens: 1500,
} as const;
