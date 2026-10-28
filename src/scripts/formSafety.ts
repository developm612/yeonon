/**
 * 사이트 폼 공통 입력 정리·검증 (대기자 폼 scripts/waitlist.ts, 지기 신청 폼 scripts/jigiApply.ts).
 *
 * 보안 메모
 * - 사용자 입력은 화면에 다시 그릴 때 textContent만 쓴다 (innerHTML 금지).
 * - FormData를 통째로 보내지 않고 각 폼에서 정한 필드만, 정리(clean)·검증한 값으로 보낸다.
 * - 엔드포인트는 공개 URL이라 여기 검증은 우회될 수 있다. 같은 검증과 스프레드시트 수식 주입 방지를
 *   Apps Script(apps-script/Code.gs)에서도 한다. 정규식을 바꾸면 Code.gs도 같이 바꾼다.
 */
import { SITE } from '../config/site';

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

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const UTM_VALUE = /^[\p{L}\p{N} ._~+-]{1,100}$/u;

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

/** 주소의 UTM 파라미터 중 정해진 키만, 안전한 문자일 때만 담는다 */
export function addUtm(data: URLSearchParams) {
  const query = new URLSearchParams(location.search);
  for (const key of UTM_KEYS) {
    const v = clean(query.get(key) ?? '', 100);
    if (UTM_VALUE.test(v)) data.set(key, v);
  }
}

/**
 * SITE.waitlistEndpoint(Apps Script 웹앱)로 전송.
 * Apps Script는 CORS 응답을 주지 않으므로 no-cors로 보낸다 (네트워크 오류만 감지 가능).
 */
export function send(data: URLSearchParams) {
  return fetch(SITE.waitlistEndpoint, { method: 'POST', mode: 'no-cors', body: data, credentials: 'omit', referrerPolicy: 'no-referrer' });
}

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
