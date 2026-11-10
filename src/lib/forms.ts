/** 서버 렌더링 페이지의 폼 처리 도우미 (POST → 검증 → 저장 → 같은 페이지로 리디렉트) */
export const field = (fd: FormData, name: string) => String(fd.get(name) ?? '');
export const fields = (fd: FormData, name: string) => fd.getAll(name).map(String);

/** 저장 후 다시 보여 줄 때 쓰는 한 번짜리 알림 (?notice=saved 등) — 미리 정한 문구만 보여 준다 */
export function notice<T extends Record<string, string>>(url: URL, messages: T): string | null {
  const key = url.searchParams.get('notice');
  return key && key in messages ? messages[key] : null;
}

/** Supabase/Postgres 오류를 사용자 문구로. 자세한 내용은 서버 로그에만 남긴다 */
export function dbError(error: { message?: string; code?: string } | null, context: string): string | null {
  if (!error) return null;
  console.error(`[YEONON] ${context}:`, error.code, error.message);
  return error.message ?? 'unknown';
}
