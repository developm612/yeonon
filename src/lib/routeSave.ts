/**
 * 루트 빌더 POST 처리 (새 루트·수정이 같이 쓴다): 폼 읽기 → 검증 → save_route → (검수 요청이면) submit_route.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { dbError, field, fields } from './forms';
import { readRouteForm, toRpcArgs, validateRoute, type RouteError, type RouteForm } from './routeValidation';

/** DB 함수 오류 → 지기에게 보일 문구 */
function rpcMessage(message: string): string {
  if (/in review/.test(message)) return '검수 중인 루트는 고칠 수 없어요. 목록에서 검수 요청을 취소한 뒤 고쳐 주세요.';
  if (/too many routes/.test(message)) return '루트는 20개까지 만들 수 있어요.';
  if (/approved jigi only/.test(message)) return '승인된 지기만 루트를 만들 수 있어요.';
  if (/longer than/.test(message)) return '코스의 머무는 시간 합이 소요 시간보다 길어요.';
  if (/not found/.test(message)) return '루트를 찾을 수 없어요.';
  return '저장하지 못했어요. 입력한 내용을 확인하고 다시 시도해 주세요.';
}

export async function saveRouteFromForm(
  supabase: SupabaseClient,
  id: string | null,
  fd: FormData,
): Promise<{ redirect: string } | { form: RouteForm; error: RouteError }> {
  const form = readRouteForm((k) => field(fd, k), (k) => fields(fd, k));
  const invalid = validateRoute(form);
  if (invalid) return { form, error: invalid };

  const { data: savedId, error } = await supabase.rpc('save_route', toRpcArgs(id, form));
  if (dbError(error, 'save route')) return { form, error: { field: '', message: rpcMessage(error!.message) } };

  if (field(fd, 'intent') === 'review') {
    const { error: submitError } = await supabase.rpc('submit_route', { p_id: savedId });
    if (dbError(submitError, 'submit route')) return { redirect: '/partner/routes?notice=saved_not_submitted' };
    return { redirect: '/partner/routes?notice=submitted' };
  }
  return { redirect: '/partner/routes?notice=saved' };
}
