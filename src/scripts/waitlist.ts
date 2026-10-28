/**
 * /app-preview 대기자 등록 폼.
 * 연락 방법에 따라 Contact 칸의 형식을 바꾸고, 검증·정리한 값만 SITE.waitlistEndpoint로 POST 한다.
 *
 * 보안 메모
 * - 사용자 입력은 화면에 다시 그릴 때 textContent만 쓴다 (innerHTML 금지).
 * - FormData를 통째로 보내지 않고 아래에서 정한 필드만, 정리(clean)·검증한 값으로 보낸다.
 * - 엔드포인트는 공개 URL이라 여기 검증은 우회될 수 있다. 같은 검증과 스프레드시트 수식 주입 방지를
 *   Apps Script(doPost)에서도 반드시 한다 (README 참고).
 */
import { SITE, isTodo } from '../config/site';
import { INTERESTS } from '../data/appPreview';

interface ContactRule {
  type: string;
  inputMode: string;
  placeholder: string;
  autocomplete: string;
  maxLength: number;
  /** 입력값을 저장 형식으로 정리 */
  normalize: (v: string) => string;
  /** 정리된 값 검사 */
  test: RegExp;
  error: string;
}

const CONTACT: Record<string, ContactRule> = {
  email: {
    type: 'email', inputMode: 'email', placeholder: 'you@example.com', autocomplete: 'email', maxLength: 254,
    normalize: (v) => v.toLowerCase(),
    // 로컬 파트: 영문·숫자·._%+- (점으로 시작·끝·연속 불가) / 도메인: 라벨 1~63자 + 영문 최상위 도메인
    test: /^(?=.{6,254}$)[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/,
    error: 'Please enter a valid email address (e.g. you@example.com).',
  },
  whatsapp: {
    type: 'tel', inputMode: 'tel', placeholder: '+82 10 1234 5678 (with country code)', autocomplete: 'tel', maxLength: 24,
    // 공백·하이픈·괄호·점은 지우고, 00으로 시작하면 +로 바꾼다. 다른 문자가 섞이면 그대로 둬서 검사에서 걸리게 한다.
    normalize: (v) => (/^[+\d\s().-]+$/.test(v) ? v.replace(/[\s().-]/g, '').replace(/^00/, '+') : v),
    // 국제 형식(E.164): + 국가번호 포함 숫자 8~15자리
    test: /^\+[1-9]\d{7,14}$/,
    error: 'Please enter your WhatsApp number starting with + and your country code (e.g. +82 10 1234 5678).',
  },
  instagram: {
    type: 'text', inputMode: 'text', placeholder: '@yourhandle', autocomplete: 'off', maxLength: 100,
    // 프로필 주소를 붙여넣어도 아이디만 남긴다
    normalize: (v) => '@' + v
      .replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i, '')
      .replace(/[/?#].*$/, '')
      .replace(/^@/, '')
      .toLowerCase(),
    // 영문·숫자·밑줄·점 1~30자, 점으로 시작·끝·연속 불가
    test: /^@(?!\.)(?!.*\.\.)[a-z0-9._]{1,30}(?<!\.)$/,
    error: 'Please enter a valid Instagram handle (letters, numbers, . and _ only, e.g. @yourhandle).',
  },
};
const METHOD_NAME: Record<string, string> = { email: 'email', whatsapp: 'WhatsApp', instagram: 'Instagram' };

/** 추천인 이름: 문자(모든 언어)·숫자·공백과 . ' ’ - _ @ 만 */
const REFERRER = /^[\p{L}\p{M}\p{N} .'’_@-]{1,60}$/u;
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const UTM_VALUE = /^[\p{L}\p{N} ._~+-]{1,100}$/u;
const INTEREST_LABELS = new Set<string>(INTERESTS.map((i) => i.label));

/** 유니코드 정규화, 제어·보이지 않는 문자와 꺾쇠 제거, 공백 정리, 길이 제한 */
function clean(value: string, max: number): string {
  return value
    .normalize('NFC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const form = document.querySelector<HTMLFormElement>('[data-waitlist-form]');
if (form) {
  const method = form.querySelector<HTMLSelectElement>('[data-wl-method]')!;
  const contact = form.querySelector<HTMLInputElement>('[data-wl-contact]')!;
  const nationality = form.querySelector<HTMLSelectElement>('[name="nationality"]')!;
  const heardFrom = form.querySelector<HTMLSelectElement>('[name="heard_from"]')!;
  const referrer = form.querySelector<HTMLInputElement>('[name="referred_by"]')!;
  const interests = form.querySelector<HTMLInputElement>('[data-wl-interests]')!;
  const honeypot = form.querySelector<HTMLInputElement>('[data-wl-hp]')!;
  const consent = form.querySelector<HTMLInputElement>('[data-wl-consent]')!;
  const errorBox = form.querySelector<HTMLElement>('[data-wl-error]')!;
  const submit = form.querySelector<HTMLButtonElement>('[data-wl-submit]')!;
  const success = document.querySelector<HTMLElement>('[data-wl-success]')!;
  const successMsg = document.querySelector<HTMLElement>('[data-wl-success-msg]')!;

  // 선택 상자는 페이지에 처음 렌더된 보기만 허용한다
  const allowed = (select: HTMLSelectElement) => new Set([...select.options].filter((o) => !o.disabled).map((o) => o.value));
  const ALLOWED_NATIONALITY = allowed(nationality);
  const ALLOWED_HEARD = allowed(heardFrom);

  method.addEventListener('change', () => {
    const c = CONTACT[method.value];
    if (!c) return;
    contact.disabled = false;
    contact.value = '';
    contact.type = c.type;
    contact.inputMode = c.inputMode;
    contact.placeholder = c.placeholder;
    contact.maxLength = c.maxLength;
    contact.autocomplete = c.autocomplete as AutoFill;
    contact.removeAttribute('aria-invalid');
    contact.focus();
  });

  /** 칸을 벗어날 때 형식이 맞으면 정리된 값으로 바꿔 보여 준다 (예: +82 10-1234-5678 → +821012345678) */
  contact.addEventListener('blur', () => {
    const c = CONTACT[method.value];
    if (!c || !contact.value.trim()) return;
    const v = c.normalize(clean(contact.value, c.maxLength));
    if (c.test.test(v)) {
      contact.value = v;
      contact.removeAttribute('aria-invalid');
    }
  });

  const showError = (msg: string, field?: HTMLElement) => {
    errorBox.textContent = msg;
    errorBox.classList.remove('hidden');
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    if (field) {
      field.setAttribute('aria-invalid', 'true');
      field.focus();
    }
    return null;
  };

  /** 검증을 통과하면 보낼 데이터를, 아니면 오류를 보여 주고 null을 돌려준다 */
  function collect(): URLSearchParams | null {
    const c = CONTACT[method.value];
    if (!c) return showError('Please choose how we can reach you.', method);

    const contactValue = c.normalize(clean(contact.value, c.maxLength));
    if (!c.test.test(contactValue)) return showError(c.error, contact);

    if (!ALLOWED_NATIONALITY.has(nationality.value)) return showError('Please select your nationality.', nationality);
    if (!ALLOWED_HEARD.has(heardFrom.value)) return showError('Please tell us how you heard about us.', heardFrom);

    const ref = clean(referrer.value, 60);
    if (ref && !REFERRER.test(ref)) {
      return showError("Please use only letters, numbers, spaces and . ' - _ @ in the referrer's name.", referrer);
    }
    if (!consent.checked) return showError('Please agree to the data collection notice to continue.', consent);

    const picked = interests.value.split(', ').filter((label) => INTEREST_LABELS.has(label));

    const data = new URLSearchParams({
      contact_method: method.value,
      contact: contactValue,
      nationality: nationality.value,
      heard_from: heardFrom.value,
      referred_by: ref,
      interests: picked.join(', '),
      consent: 'yes',
      source_page: 'app-preview',
      submitted_at: new Date().toISOString(),
    });
    const query = new URLSearchParams(location.search);
    for (const key of UTM_KEYS) {
      const v = clean(query.get(key) ?? '', 100);
      if (UTM_VALUE.test(v)) data.set(key, v);
    }
    return data;
  }

  const showSuccess = () => {
    successMsg.textContent = `We'll reach out by ${METHOD_NAME[method.value]} the day YEONON launches.`;
    form.classList.add('hidden');
    success.classList.remove('hidden');
    success.focus();
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (submit.disabled) return;
    const data = collect();
    if (!data) return;
    errorBox.classList.add('hidden');
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));

    // 사람에게는 보이지 않는 칸이 채워져 있으면 스팸 봇으로 보고, 보내지 않은 채 완료 화면만 보여 준다
    if (honeypot.value) return showSuccess();

    if (isTodo(SITE.waitlistEndpoint)) {
      console.warn('[YEONON] waitlistEndpoint is not set yet — see src/config/site.ts');
      showError("Sorry, the waitlist isn't open yet. Please check back soon.");
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Joining…';
    try {
      // Google Apps Script 웹앱은 CORS 응답을 주지 않으므로 no-cors로 보낸다 (네트워크 오류만 감지 가능)
      await fetch(SITE.waitlistEndpoint, { method: 'POST', mode: 'no-cors', body: data, credentials: 'omit', referrerPolicy: 'no-referrer' });
      showSuccess();
    } catch {
      showError('Something went wrong. Please check your connection and try again.');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Join the waitlist';
    }
  });
}
