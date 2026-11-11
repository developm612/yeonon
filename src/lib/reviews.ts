/**
 * 후기(reviews) 읽기·저장 도우미. 테이블·함수: supabase/migrations/20261110000017_reviews.sql
 *   - 만남이 끝난(completed) 예약의 당사자만, 예약당 1인 1회. 수정·삭제는 작성 후 24시간(review_settings.edit_hours)까지.
 *   - 저장은 DB 함수 save_review·delete_review로만 한다. 이 파일은 예약 상세 페이지의 폼 처리(handleReviewPost)를 같이 쓴다.
 *   - 공개 후기는 public_jigi_reviews() — 여행자가 지기에게 쓴 후기 중 안전 체크가 없는 것만, 쓴 사람은 이름 첫 글자만.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Lang } from '../data/bookingOptions';
import { dbError, field } from './forms';
import { clean } from '../scripts/formSafety';

export const REVIEW_COMMENT_MAX = 500;

export interface MyReview {
  id: string;
  rating: number;
  comment: string | null;
  safety_issue: boolean;
  created_at: string;
}

export interface PublicReview {
  id: string;
  rating: number;
  comment: string | null;
  route_id: string | null;
  route_title: string;
  author_initial: string;
  created_at: string;
}

/** 이 예약에 내가 쓴 후기 (없으면 null) + 수정 가능 시간 */
export async function loadMyReview(supabase: SupabaseClient, bookingId: string, userId: string) {
  const [{ data }, { data: settings }] = await Promise.all([
    supabase.from('reviews').select('id, rating, comment, safety_issue, created_at').eq('booking_id', bookingId).eq('author_id', userId).maybeSingle(),
    supabase.from('review_settings').select('edit_hours').maybeSingle(),
  ]);
  const editHours = (settings?.edit_hours as number | undefined) ?? 24;
  const review = (data as MyReview | null) ?? null;
  const editableUntil = review ? new Date(new Date(review.created_at).getTime() + editHours * 3_600_000) : null;
  return { review, editHours, editable: !review || (editableUntil !== null && editableUntil > new Date()), editableUntil };
}

/** 지기 공개 후기 (누구나). 키가 없는 정적 빌드·마이그레이션 전이면 빈 목록 */
export async function loadPublicReviews(supabase: SupabaseClient | null | undefined, jigiId: string, limit = 5): Promise<PublicReview[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('public_jigi_reviews', { p_jigi: jigiId, p_limit: limit });
  dbError(error, 'public_jigi_reviews');
  return (data ?? []) as PublicReview[];
}

export const REVIEW_ERRORS = {
  sign_in: { en: 'Please sign in again.', ko: '다시 로그인해 주세요.' },
  booking_not_found: { en: "We couldn't find that booking.", ko: '예약을 찾을 수 없어요.' },
  not_completed: { en: 'You can leave a review after the meetup ends.', ko: '만남이 끝난 뒤에 후기를 쓸 수 있어요.' },
  invalid_rating: { en: 'Please choose a rating from 1 to 5 stars.', ko: '별점을 1~5개 중에서 골라 주세요.' },
  edit_closed: { en: 'Reviews can only be changed within 24 hours of posting.', ko: '후기는 쓴 뒤 24시간 안에만 고칠 수 있어요.' },
  server: { en: 'Something went wrong. Please try again.', ko: '저장하지 못했어요. 다시 시도해 주세요.' },
} as const;

/**
 * 예약 상세 페이지의 후기 폼 POST 처리. 후기 폼이 아니면 null (페이지가 다른 처리를 이어 간다).
 * 성공하면 { redirect }, 실패하면 { error } (화면 문구).
 */
export async function handleReviewPost(
  supabase: SupabaseClient,
  fd: FormData,
  bookingId: string,
  lang: Lang,
): Promise<{ redirect: string } | { error: string } | null> {
  const action = field(fd, 'review_action');
  if (action !== 'save' && action !== 'delete') return null;
  const { error } =
    action === 'delete'
      ? await supabase.rpc('delete_review', { p_booking: bookingId })
      : await supabase.rpc('save_review', {
          p_booking: bookingId,
          p_rating: Number.parseInt(field(fd, 'rating'), 10) || 0,
          p_comment: clean(field(fd, 'comment'), REVIEW_COMMENT_MAX),
          p_safety_issue: field(fd, 'safety_issue') === 'yes',
        });
  if (!error) return { redirect: `?notice=${action === 'delete' ? 'review_deleted' : 'review_saved'}#review` };
  const code = (error.message in REVIEW_ERRORS ? error.message : 'server') as keyof typeof REVIEW_ERRORS;
  if (code === 'server') dbError(error, `review ${action}`);
  return { error: REVIEW_ERRORS[code][lang] };
}
