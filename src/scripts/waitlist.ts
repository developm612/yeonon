/**
 * /app-preview 대기자 등록 폼.
 * 연락 방법에 따라 Contact 칸의 형식을 바꾸고, 검증·정리한 값만 SITE.waitlistEndpoint로 POST 한다.
 * 입력 정리·검증 규칙과 보안 메모는 scripts/formSafety.ts.
 */
import { SITE, isTodo } from '../config/site';
import { INTERESTS } from '../data/appPreview';
import { EMAIL, INSTAGRAM, REFERRER, WHATSAPP, addUtm, allowedOptions, check, clean, errorShower, send, type Rule } from './formSafety';

interface ContactField {
  rule: Rule;
  type: string;
  inputMode: string;
  placeholder: string;
  autocomplete: string;
  maxLength: number;
  error: string;
}

const CONTACT: Record<string, ContactField> = {
  email: {
    rule: EMAIL, type: 'email', inputMode: 'email', placeholder: 'you@example.com', autocomplete: 'email', maxLength: 254,
    error: 'Please enter a valid email address (e.g. you@example.com).',
  },
  whatsapp: {
    rule: WHATSAPP, type: 'tel', inputMode: 'tel', placeholder: '+82 10 1234 5678 (with country code)', autocomplete: 'tel', maxLength: 24,
    error: 'Please enter your WhatsApp number starting with + and your country code (e.g. +82 10 1234 5678).',
  },
  instagram: {
    rule: INSTAGRAM, type: 'text', inputMode: 'text', placeholder: '@yourhandle', autocomplete: 'off', maxLength: 100,
    error: 'Please enter a valid Instagram handle (letters, numbers, . and _ only, e.g. @yourhandle).',
  },
};
const METHOD_NAME: Record<string, string> = { email: 'email', whatsapp: 'WhatsApp', instagram: 'Instagram' };
const INTEREST_LABELS = new Set<string>(INTERESTS.map((i) => i.label));

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
  const submit = form.querySelector<HTMLButtonElement>('[data-wl-submit]')!;
  const success = document.querySelector<HTMLElement>('[data-wl-success]')!;
  const successMsg = document.querySelector<HTMLElement>('[data-wl-success-msg]')!;
  const { show: showError, clear: clearError } = errorShower(form, form.querySelector<HTMLElement>('[data-wl-error]')!);

  const ALLOWED_NATIONALITY = allowedOptions(nationality);
  const ALLOWED_HEARD = allowedOptions(heardFrom);

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
    const v = check(c.rule, contact.value, c.maxLength);
    if (v) {
      contact.value = v;
      contact.removeAttribute('aria-invalid');
    }
  });

  /** 검증을 통과하면 보낼 데이터를, 아니면 오류를 보여 주고 null을 돌려준다 */
  function collect(): URLSearchParams | null {
    const c = CONTACT[method.value];
    if (!c) return showError('Please choose how we can reach you.', method);

    const contactValue = check(c.rule, contact.value, c.maxLength);
    if (!contactValue) return showError(c.error, contact);

    if (!ALLOWED_NATIONALITY.has(nationality.value)) return showError('Please select your nationality.', nationality);
    if (!ALLOWED_HEARD.has(heardFrom.value)) return showError('Please tell us how you heard about us.', heardFrom);

    const ref = clean(referrer.value, 60);
    if (ref && !REFERRER.test(ref)) {
      return showError("Please use only letters, numbers, spaces and . ' - _ @ in the referrer's name.", referrer);
    }
    if (!consent.checked) return showError('Please agree to the data collection notice to continue.', consent);

    const picked = interests.value.split(', ').filter((label) => INTEREST_LABELS.has(label));

    const data = new URLSearchParams({
      form: 'waitlist',
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
    addUtm(data);
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
    clearError();

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
      await send(data);
      showSuccess();
    } catch {
      showError('Something went wrong. Please check your connection and try again.');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Join the waitlist';
    }
  });
}
