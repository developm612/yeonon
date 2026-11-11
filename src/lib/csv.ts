/**
 * CSV 만들기·읽기 (관리자 내보내기 /api/admin/export, 대기자 가져오기 /admin/waitlist).
 * 만들 때: 엑셀에서 한글이 깨지지 않게 BOM을 붙이고, 수식으로 실행될 수 있는 값(=, +, -, @로 시작)은 앞에 '를 붙인다.
 */
export type CsvValue = string | number | boolean | null | undefined | string[];

const FORMULA = /^[=+\-@\t\r]/;

function cell(v: CsvValue): string {
  let s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : String(v);
  if (FORMULA.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: CsvValue[][]): string {
  return '﻿' + [headers, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

/** RFC 4180 CSV → 행 배열 (따옴표 안의 쉼표·줄바꿈·"" 처리). 첫 줄의 BOM은 버린다 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = '';
  let quoted = false;
  const s = text.replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        value += '"';
        i++;
      } else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(value);
      value = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = '';
    } else value += c;
  }
  if (value !== '' || row.length) {
    row.push(value);
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}
