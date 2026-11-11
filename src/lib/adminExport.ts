/**
 * 관리자 목록 CSV 내보내기 정의 (/api/admin/export가 쓴다).
 * 목록마다 칸(columns)과 읽기(fetch)를 둔다. sensitive: true인 칸(이메일·휴대폰·연락처·자유 입력 글 등)은
 * 관리자가 '민감 항목 포함'을 체크했을 때만 들어간다. 내보낼 때마다 audit_log('export.csv')에 남는다.
 * 읽기 권한은 RLS가 정한다 (관리자만 전체를 읽는다). 필터 값은 각 관리자 화면의 검색 조건과 같다.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CsvValue } from './csv';

type Row = Record<string, unknown>;
interface Column {
  header: string;
  get: (r: Row) => CsvValue;
  sensitive?: boolean;
}
export interface ExportList {
  label: string;
  /** 화면에서 넘어올 수 있는 필터 이름 (그 밖의 값은 무시) */
  filters: string[];
  columns: Column[];
  fetch: (supabase: SupabaseClient, f: Record<string, string>, from: number, to: number) => PromiseLike<{ data: Row[] | null; error: { message: string } | null }>;
}

/** 한 번에 내보낼 수 있는 최대 행 수 */
export const EXPORT_MAX_ROWS = 10_000;

const v = (k: string): Column['get'] => (r) => r[k] as CsvValue;
const col = (header: string, key: string, sensitive = false): Column => ({ header, get: v(key), sensitive });
const SEARCH = /[,()*%\\]/g;

export const EXPORTS: Record<string, ExportList> = {
  users: {
    label: '회원',
    filters: ['q', 'role', 'status'],
    columns: [
      col('id', 'id'), col('표시 이름', 'display_name'), col('이메일', 'email', true), col('역할', 'role'), col('상태', 'status'),
      col('국적', 'nationality'), col('언어', 'languages'), col('관심사', 'interests'), col('얼리 멤버', 'early_member'),
      col('마케팅 수신', 'marketing_opt_in'), col('약관 버전', 'terms_version'), col('방침 버전', 'privacy_version'),
      col('약관 동의 시각', 'terms_agreed_at'), col('가입 시각', 'created_at'),
    ],
    fetch: (sb, f, from, to) => {
      let q = sb.from('profiles')
        .select('id, display_name, email, role, status, nationality, languages, interests, early_member, marketing_opt_in, terms_version, privacy_version, terms_agreed_at, created_at')
        .order('created_at', { ascending: false }).range(from, to);
      const s = (f.q ?? '').replace(SEARCH, '').slice(0, 50);
      if (s) q = q.or(`email.ilike.%${s}%,display_name.ilike.%${s}%`);
      if (f.role === 'none') q = q.is('role', null);
      else if (['traveler', 'jigi', 'admin'].includes(f.role)) q = q.eq('role', f.role);
      if (['active', 'suspended', 'deleted'].includes(f.status)) q = q.eq('status', f.status);
      return q;
    },
  },
  jigi_applications: {
    label: '지기 신청',
    filters: ['status'],
    columns: [
      col('id', 'id'), col('이름', 'name', true), col('휴대폰', 'phone', true),
      { header: '이메일', get: (r) => (r.profiles as { email?: string } | null)?.email ?? '', sensitive: true },
      col('나이대', 'age_group'), col('성수동과의 관계', 'seongsu_relation'), col('외국어', 'languages'), col('활동 가능 시간', 'availability_note'),
      col('자기소개', 'intro', true), col('인스타그램', 'instagram', true), col('취향', 'taste'), col('예시 코스', 'sample_course'),
      col('알게 된 경로', 'heard_from'), col('추천인', 'referred_by', true), col('상태', 'status'), col('신원 확인', 'id_verified'),
      col('신청 시각', 'created_at'), col('심사 시각', 'reviewed_at'),
    ],
    fetch: (sb, f, from, to) => {
      let q = sb.from('jigi_applications').select('*, profiles!jigi_applications_user_id_fkey(email)').order('created_at').range(from, to);
      if (['submitted', 'interview', 'approved', 'on_hold', 'rejected'].includes(f.status)) q = q.eq('status', f.status);
      return q;
    },
  },
  routes: {
    label: '루트',
    filters: ['status'],
    columns: [
      col('id', 'id'), col('제목', 'title'), col('상태', 'status'), col('지기 id', 'jigi_id'), col('구역', 'area'), col('태그', 'tags'),
      col('분위기', 'vibe'), col('소요 시간(분)', 'duration_minutes'), col('최대 인원', 'max_party_size'), col('언어', 'languages'),
      col('정가', 'list_price'), col('만나는 곳', 'meeting_point_note'), col('공개 시각', 'published_at'), col('만든 시각', 'created_at'),
    ],
    fetch: (sb, f, from, to) => {
      let q = sb.from('routes')
        .select('id, title, status, jigi_id, area, tags, vibe, duration_minutes, max_party_size, languages, list_price, meeting_point_note, published_at, created_at')
        .order('created_at', { ascending: false }).range(from, to);
      if (['draft', 'in_review', 'published', 'changes_requested', 'hidden'].includes(f.status)) q = q.eq('status', f.status);
      return q;
    },
  },
  bookings: {
    label: '예약',
    filters: ['status'],
    columns: [
      col('id', 'id'), col('상태', 'status'), col('루트', 'route_title'), col('시작', 'starts_at'), col('끝', 'ends_at'),
      col('여행자 id', 'traveler_id'), col('여행자 표시 이름', 'traveler_name'), col('지기 id', 'jigi_id'), col('지기 표시 이름', 'jigi_name'),
      col('인원', 'party_size'), col('여행자 메모', 'note', true), col('확정 방식', 'confirm_mode'), col('응답 기한', 'respond_by'),
      col('확정 시각', 'confirmed_at'), col('거절 사유', 'decline_reason', true), col('취소 시각', 'cancelled_at'), col('취소한 쪽', 'cancelled_role'),
      col('취소 사유', 'cancel_reason', true), col('늦은 취소', 'late_cancel'), col('만료 시각', 'expired_at'), col('완료 시각', 'completed_at'),
      col('정가', 'list_price'), col('할인율', 'discount_rate'), col('최종 가격', 'final_price'), col('프로모션', 'promotion_name'),
      col('추천에서 옴', 'recommendation_id'), col('요청 시각', 'created_at'),
    ],
    fetch: (sb, f, from, to) => {
      let q = sb.from('bookings').select('*').order('created_at', { ascending: false }).range(from, to);
      if (['pending', 'confirmed', 'completed', 'declined', 'expired', 'cancelled'].includes(f.status)) q = q.eq('status', f.status);
      return q;
    },
  },
  reports: {
    label: '채팅 신고',
    filters: ['status'],
    columns: [
      col('id', 'id'), col('상태', 'status'), col('사유', 'reason'), col('신고 내용', 'detail', true), col('신고한 회원 id', 'reporter_id'),
      col('신고된 회원 id', 'reported_id'), col('대화 id', 'conversation_id'), col('신고 시각', 'created_at'), col('처리 시각', 'handled_at'),
      col('처리 메모', 'handle_note'),
    ],
    fetch: (sb, f, from, to) => {
      let q = sb.from('message_reports')
        .select('id, status, reason, detail, reporter_id, reported_id, conversation_id, created_at, handled_at, handle_note')
        .order('created_at', { ascending: false }).range(from, to);
      if (['open', 'dismissed', 'warned', 'suspended'].includes(f.status)) q = q.eq('status', f.status);
      return q;
    },
  },
  safety_reviews: {
    label: '안전 체크 후기',
    filters: ['safety'],
    columns: [
      col('id', 'id'), col('확인 상태', 'safety_status'), col('예약 id', 'booking_id'), col('작성자', 'author_role'), col('작성자 id', 'author_id'),
      col('대상 id', 'target_id'), col('루트', 'route_title'), col('별점', 'rating'), col('코멘트', 'comment', true), col('작성 시각', 'created_at'),
      col('확인 시각', 'safety_handled_at'), col('확인 메모', 'safety_note'),
    ],
    fetch: (sb, f, from, to) => {
      let q = sb.from('reviews')
        .select('id, safety_status, booking_id, author_role, author_id, target_id, route_title, rating, comment, created_at, safety_handled_at, safety_note')
        .eq('safety_issue', true).order('created_at', { ascending: false }).range(from, to);
      if (['open', 'resolved'].includes(f.safety)) q = q.eq('safety_status', f.safety);
      return q;
    },
  },
  recommendations: {
    label: 'AI 추천 기록',
    filters: ['days'],
    columns: [
      col('id', 'id'), col('여행자 id', 'traveler_id', true), col('시각', 'created_at'),
      { header: '관심사', get: (r) => ((r.input as Row)?.interests as string[]) ?? [] },
      { header: '날짜', get: (r) => `${(r.input as Row)?.date_from ?? ''} ~ ${(r.input as Row)?.date_to ?? ''}` },
      { header: '시간대', get: (r) => (r.input as Row)?.time_of_day as string },
      { header: '인원', get: (r) => (r.input as Row)?.party_size as number },
      { header: '언어', get: (r) => ((r.input as Row)?.languages as string[]) ?? [] },
      { header: '분위기', get: (r) => (r.input as Row)?.vibe as string },
      { header: '자유 문장', get: (r) => (r.input as Row)?.note as string, sensitive: true },
      { header: '추천 루트', get: (r) => ((r.results as Row[]) ?? []).map((x) => String(x.route_id)) },
      col('모델', 'model'), col('대체', 'used_fallback'), col('대체 이유', 'fallback_reason'), col('지연(ms)', 'latency_ms'),
      col('클릭한 루트', 'clicked_route_id'), col('요청까지', 'booked'),
    ],
    fetch: (sb, f, from, to) => {
      let q = sb.from('recommendation_requests')
        .select('id, traveler_id, created_at, input, results, model, used_fallback, fallback_reason, latency_ms, clicked_route_id, booked')
        .order('created_at', { ascending: false }).range(from, to);
      const days = f.days === '30' ? 30 : f.days === 'all' ? null : 7;
      if (days) q = q.gte('created_at', new Date(Date.now() - days * 86_400_000).toISOString());
      return q;
    },
  },
  promotions: {
    label: '할인',
    filters: [],
    columns: [
      col('id', 'id'), col('이름', 'name'), col('할인율', 'discount_rate'), col('대상', 'eligible'), col('시작', 'starts_at'), col('끝', 'ends_at'),
      col('사용 한도', 'max_uses'), col('사용 수', 'used_count'), col('사용 중', 'is_active'), col('만든 시각', 'created_at'),
    ],
    fetch: (sb, _f, from, to) => sb.from('promotions').select('*').order('created_at').range(from, to),
  },
  waitlist: {
    label: '대기자 명단',
    filters: ['source', 'state', 'q'],
    columns: [
      col('id', 'id'), col('탭', 'source'), col('이메일', 'email', true), col('이름', 'name', true), col('연락 방법', 'contact_method'),
      col('연락처', 'contact', true), col('휴대폰', 'phone', true), col('국적', 'nationality'), col('알게 된 경로', 'heard_from'),
      col('추천인', 'referred_by', true), col('관심사', 'interests'), col('제출 시각', 'submitted_at'), col('가져온 시각', 'imported_at'),
      col('초대 표시', 'invite_sent_at'), { header: '가입 연결', get: (r) => Boolean(r.joined_user_id) }, col('가입 시각', 'joined_at'),
    ],
    fetch: (sb, f, from, to) => waitlistQuery(sb, f).order('imported_at', { ascending: false }).range(from, to),
  },
};

/** /admin/waitlist 화면과 내보내기가 같이 쓰는 필터 (source: waitlist|jigi, state: new|invited|joined, q: 이메일·이름·연락처) */
export function waitlistQuery(sb: SupabaseClient, f: Record<string, string>, opts?: { count?: 'exact' }) {
  let q = sb.from('waitlist_imports').select('*', opts);
  if (f.source === 'waitlist' || f.source === 'jigi') q = q.eq('source', f.source);
  if (f.state === 'new') q = q.is('invite_sent_at', null).is('joined_user_id', null);
  else if (f.state === 'invited') q = q.not('invite_sent_at', 'is', null).is('joined_user_id', null);
  else if (f.state === 'joined') q = q.not('joined_user_id', 'is', null);
  const s = (f.q ?? '').replace(SEARCH, '').slice(0, 50);
  if (s) q = q.or(`email.ilike.%${s}%,name.ilike.%${s}%,contact.ilike.%${s}%`);
  return q;
}

/** 내보낼 행 전부 읽기 (1000행씩, 최대 EXPORT_MAX_ROWS) */
export async function fetchExportRows(sb: SupabaseClient, list: ExportList, filters: Record<string, string>) {
  const rows: Row[] = [];
  for (let from = 0; from < EXPORT_MAX_ROWS; from += 1000) {
    const { data, error } = await list.fetch(sb, filters, from, Math.min(from + 999, EXPORT_MAX_ROWS - 1));
    if (error) return { rows, error };
    rows.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return { rows, error: null };
}
