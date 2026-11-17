/**
 * 폼 공통 입력 정리·검증 — 지기 신청서(scripts/jigiApply.ts, lib/jigiApplication.ts)와 서버 쪽 입력 정리(clean)가 같이 쓴다.
 *
 * 보안 메모
 * - 사용자 입력은 화면에 다시 그릴 때 textContent만 쓴다 (innerHTML 금지).
 * - 브라우저 검증은 안내용이다. 저장 전에 서버(DB 함수)가 같은 규칙으로 다시 확인한다.
 * (공개 대기자·사전 신청 폼의 Apps Script 전송 코드는 새 랜딩 사이트로 옮겨 지웠다 — yeonon-app-first-plan.md 2-2)
 */

export interface Rule {
  /** 입력값을 저장 형식으로 정리 */
  normalize: (v: string) => string;
  /** 정리된 값 검사 */
  test: RegExp;
}

/** 로컬 파트: 영문·숫자·._%+- (점으로 시작·끝·연속 불가) / 도메인: 라벨 1~63자 + 영문 최상위 도메인 */
export const EMAIL: Rule = {
  normalize: (v) => v.toLowerCase(),
  test: /^(?=.{6,254}$)[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/,
};

/** 국제 형식(E.164): + 국가번호 포함 숫자 8~15자리. 공백·하이픈·괄호·점은 지우고, 00으로 시작하면 +로 */
export const WHATSAPP: Rule = {
  normalize: (v) => (/^[+\d\s().-]+$/.test(v) ? v.replace(/[\s().-]/g, '').replace(/^00/, '+') : v),
  test: /^\+[1-9]\d{7,14}$/,
};

/** 한국 휴대폰: 010-1234-5678 형식으로 정리 (+82 10…, 공백·점도 허용) */
export const KR_MOBILE: Rule = {
  normalize: (v) => {
    if (!/^[+\d\s().-]+$/.test(v)) return v;
    const d = v.replace(/\D/g, '').replace(/^82(?=1)/, '0');
    const m = d.match(/^(01[016789])(\d{3,4})(\d{4})$/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : d;
  },
  test: /^01[016789]-\d{3,4}-\d{4}$/,
};

/** 인스타그램: 영문·숫자·밑줄·점 1~30자, 점으로 시작·끝·연속 불가. 프로필 주소를 붙여넣어도 아이디만 남긴다 */
export const INSTAGRAM: Rule = {
  normalize: (v) => '@' + v
    .replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i, '')
    .replace(/[/?#].*$/, '')
    .replace(/^@/, '')
    .toLowerCase(),
  test: /^@(?!\.)(?!.*\.\.)[a-z0-9._]{1,30}(?<!\.)$/,
};

/** 사람 이름: 문자(모든 언어)·공백과 . ' ’ - 만, 2~30자 */
export const PERSON_NAME = /^[\p{L}\p{M} .'’-]{2,30}$/u;
/** 추천인 이름: 문자(모든 언어)·숫자·공백과 . ' ’ - _ @ 만 */
export const REFERRER = /^[\p{L}\p{M}\p{N} .'’_@-]{1,60}$/u;


/** 유니코드 정규화, 제어·보이지 않는 문자와 꺾쇠 제거, 공백 정리, 길이 제한 */
export function clean(value: string, max: number): string {
  return value
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** 규칙으로 정리·검사. 통과하면 정리된 값, 아니면 null */
export function check(rule: Rule, raw: string, max = 254): string | null {
  const v = rule.normalize(clean(raw, max));
  return rule.test.test(v) ? v : null;
}

/** 선택 상자는 페이지에 처음 렌더된 보기만 허용 */
export const allowedOptions = (select: HTMLSelectElement) =>
  new Set([...select.options].filter((o) => !o.disabled).map((o) => o.value));

/** 폼 오류 표시: 오류 상자에 문구, 해당 칸에 aria-invalid + 포커스 */
export function errorShower(form: HTMLFormElement, box: HTMLElement) {
  const clear = () => {
    box.classList.add('hidden');
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  };
  const show = (msg: string, field?: HTMLElement): null => {
    clear();
    box.textContent = msg;
    box.classList.remove('hidden');
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
    return null;
  };
  return { show, clear };
}
