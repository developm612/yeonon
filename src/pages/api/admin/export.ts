import type { APIRoute } from 'astro';
import { EXPORTS, fetchExportRows } from '../../../lib/adminExport';
import { toCsv } from '../../../lib/csv';
import { dbError, field } from '../../../lib/forms';

export const prerender = false;

/**
 * 관리자 목록 CSV 내보내기 (폼 POST — components/admin/ExportForm.astro).
 * 본문: list(목록 이름), sensitive=yes(민감 항목 포함), 그 목록의 필터 값.
 * 파일을 만들기 전에 audit_log('export.csv')에 남기고, 기록이 실패하면 내보내지 않는다.
 * 같은 사이트에서 보낸 요청만 받는다 (미들웨어 Origin 확인). 관리자 확인은 여기와 DB(RLS·admin_log_export) 양쪽에서 한다.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const { supabase, profile } = locals;
  if (!supabase || !profile || profile.role !== 'admin' || profile.status !== 'active') return new Response('Forbidden', { status: 403 });

  const fd = await request.formData();
  const name = field(fd, 'list');
  const list = Object.hasOwn(EXPORTS, name) ? EXPORTS[name] : null;
  if (!list) return new Response('Unknown list', { status: 400 });
  const sensitive = field(fd, 'sensitive') === 'yes' && list.columns.some((c) => c.sensitive);
  const filters = Object.fromEntries(list.filters.map((k) => [k, field(fd, k).slice(0, 60)]).filter(([, val]) => val));

  const { rows, error } = await fetchExportRows(supabase, list, filters);
  if (dbError(error, `export ${name}`)) return new Response('목록을 읽지 못했어요. 다시 시도해 주세요.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  const { error: logError } = await supabase.rpc('admin_log_export', { p_list: name, p_sensitive: sensitive, p_rows: rows.length, p_filters: filters });
  if (dbError(logError, 'admin_log_export')) {
    return new Response('관리 기록을 남기지 못해 내보내지 않았어요. 마이그레이션 19번을 실행했는지 확인해 주세요.', { status: 500, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  const columns = list.columns.filter((c) => sensitive || !c.sensitive);
  const csv = toCsv(columns.map((c) => c.header), rows.map((r) => columns.map((c) => c.get(r))));
  const stamp = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Seoul' }).replace(/[-:]/g, '').replace(' ', '-').slice(0, 13);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="yeonon-${name}${sensitive ? '-full' : ''}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
};
