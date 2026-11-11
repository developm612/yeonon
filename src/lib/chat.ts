/**
 * 채팅 읽기 도우미와 오류 문구. 테이블·함수: supabase/migrations/20261110000013~15
 * 메시지·읽음·신고·차단은 /api/chat/* → DB 함수(send_message·mark_read·report_conversation·block_conversation_user)로만 바뀐다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingStatus, Lang } from '../data/bookingOptions';
import { CHAT } from '../config/chat';

export interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  flagged: boolean;
  flag_reasons: string[];
  created_at: string;
  read_at: string | null;
}

export const MESSAGE_COLUMNS = 'id, conversation_id, sender_id, recipient_id, body, flagged, flag_reasons, created_at, read_at';

export interface ConversationInfo {
  conversation_id: string;
  booking_id: string;
  booking_status: BookingStatus;
  route_title: string;
  starts_at: string;
  ends_at: string;
  party_size: number;
  meeting_area: string | null;
  meeting_point_note: string | null;
  my_role: 'traveler' | 'jigi';
  other_id: string;
  other_name: string | null;
  can_send: boolean;
  blocked_by_me: boolean;
  blocked_any: boolean;
}

export interface ConversationListItem {
  conversation_id: string;
  booking_id: string;
  booking_status: BookingStatus;
  route_title: string;
  starts_at: string;
  my_role: 'traveler' | 'jigi';
  other_name: string | null;
  last_body: string | null;
  last_at: string | null;
  last_from_me: boolean | null;
  unread: number;
  can_send: boolean;
  blocked_by_me: boolean;
}

/** 대화 하나 + 최근 메시지 (당사자가 아니면 null — RLS·함수가 막는다) */
export async function loadConversation(supabase: SupabaseClient, id: string) {
  const { data: info } = await supabase.rpc('conversation_info', { p_conversation: id });
  const row = ((info as ConversationInfo[] | null) ?? [])[0];
  if (!row) return null;
  const { data: msgs } = await supabase
    .from('messages')
    .select(MESSAGE_COLUMNS)
    .eq('conversation_id', id)
    .order('created_at', { ascending: false })
    .limit(CHAT.initialMessages);
  return { info: row, messages: ((msgs ?? []) as MessageRow[]).reverse() };
}

/** 예약 화면의 "채팅 열기" 대상 */
export async function conversationIdForBooking(supabase: SupabaseClient, bookingId: string) {
  const { data } = await supabase.from('conversations').select('id').eq('booking_id', bookingId).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

// ---------------------------------------------------------------------
// 오류 코드 → 화면 문구
// ---------------------------------------------------------------------
export const CHAT_ERRORS = {
  sign_in: { status: 401, en: 'Please sign in again.', ko: '다시 로그인해 주세요.' },
  account_inactive: { status: 403, en: 'Your account is not active.', ko: '이용이 제한된 계정이에요.' },
  invalid_input: { status: 400, en: 'Please check your message and try again.', ko: '입력값을 확인해 주세요.' },
  invalid_message: { status: 400, en: `Messages can be 1 to ${CHAT.messageMax} characters.`, ko: `메시지는 1~${CHAT.messageMax}자예요.` },
  invalid_reason: { status: 400, en: 'Please choose a reason.', ko: '사유를 골라 주세요.' },
  conversation_not_found: { status: 404, en: "We couldn't find this conversation.", ko: '대화를 찾을 수 없어요.' },
  message_not_found: { status: 404, en: "We couldn't find that message.", ko: '메시지를 찾을 수 없어요.' },
  conversation_closed: { status: 409, en: 'This booking is closed, so you can’t send new messages.', ko: '종료된 예약이라 새 메시지를 보낼 수 없어요.' },
  blocked: { status: 409, en: 'You can’t send messages in this conversation.', ko: '이 대화에서는 메시지를 보낼 수 없어요.' },
  already_reported: { status: 409, en: 'You already reported this conversation. Our team is reviewing it.', ko: '이미 신고한 대화예요. 운영팀이 확인하고 있어요.' },
  rate_limited: { status: 429, en: 'You’re sending too fast. Please wait a moment.', ko: '너무 빠르게 보내고 있어요. 잠시 후 다시 시도해 주세요.' },
  translate_unavailable: { status: 503, en: 'Translation isn’t available right now.', ko: '지금은 번역을 쓸 수 없어요.' },
  translate_limit: { status: 429, en: 'Translation limit reached. Please try again later.', ko: '번역 횟수를 다 썼어요. 잠시 후 다시 시도해 주세요.' },
  server: { status: 500, en: 'Something went wrong. Please try again.', ko: '처리하지 못했어요. 잠시 후 다시 시도해 주세요.' },
} as const;

export type ChatErrorCode = keyof typeof CHAT_ERRORS;

export function chatErrorCode(error: { message?: string; code?: string } | null, context: string): ChatErrorCode {
  const msg = error?.message ?? '';
  if (msg in CHAT_ERRORS) return msg as ChatErrorCode;
  console.error(`[YEONON] ${context}:`, error?.code, msg);
  return 'server';
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } });

export const chatOk = (body: unknown) => json(body);
export const chatFail = (code: ChatErrorCode, lang: Lang) => json({ error: code, message: CHAT_ERRORS[code][lang] }, CHAT_ERRORS[code].status);

/**
 * 채팅 API 공통 확인: 로그인·온보딩·활성 회원, 여행자 또는 지기 (관리자는 채팅 당사자가 아니다).
 * 통과하면 { supabase, userId, lang }, 아니면 바로 돌려줄 Response.
 */
export function chatMember(locals: App.Locals): { supabase: SupabaseClient; userId: string; lang: Lang } | Response {
  const { user, profile, supabase } = locals;
  const lang: Lang = profile?.role === 'traveler' ? 'en' : 'ko';
  if (!user || !supabase || !profile || !profile.terms_agreed_at) return chatFail('sign_in', lang);
  if (profile.status !== 'active') return chatFail('account_inactive', lang);
  if (profile.role !== 'traveler' && profile.role !== 'jigi') return chatFail('conversation_not_found', lang);
  return { supabase, userId: user.id, lang };
}

/** JSON 본문 (객체가 아니면 null) */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = (await request.json()) as unknown;
    return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
