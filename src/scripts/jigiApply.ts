/**
 * /app-preview-jigi 지기 사전 신청 폼.
 * 검증·정리한 값만 form=jigi와 함께 SITE.waitlistEndpoint로 POST 한다 (Apps Script가 'Jigi' 시트에 저장).
 * 입력 정리·검증 규칙과 보안 메모는 scripts/formSafety.ts.
 */
import { SITE, isTodo } from '../config/site';
import { SPOTS, START_TIMES, TASTE_KO } from '../data/jigiPreview';
import {
  EMAIL, INSTAGRAM, KR_MOBILE, PERSON_NAME, REFERRER, addUtm, allowedOptions, check, clean, errorShower, send,
} from './formSafety';

const INTRO_MIN = 20;
const INTRO_MAX = 300;
const TASTE_LABELS = new Set<string>(Object.values(TASTE_KO));
const SPOT_NAMES = new Set<string>(SPOTS.map((s) => s.name));
const START_VALUES = new Set(START_TIMES.map((s) => s.value));

const form = document.querySelector<HTMLFormElement>('[data-jigi-form]');
if (form) {
  const $ = <T extends Element>(sel: string) => form.querySelector<T>(sel)!;
  const name = $<HTMLInputElement>('#ja-name');
  const phone = $<HTMLInputElement>('#ja-phone');
  const email = $<HTMLInputElement>('#ja-email');
  const age = $<HTMLSelectElement>('#ja-age');
  const relation = $<HTMLSelectElement>('#ja-relation');
  const intro = $<HTMLTextAreaElement>('#ja-intro');
  const introCount = $<HTMLElement>('[data-ja-intro-count]');
  const insta = $<HTMLInputElement>('#ja-insta');
  const heardFrom = $<HTMLSelectElement>('#ja-source');
  const referrer = $<HTMLInputElement>('#ja-ref');
  const taste = $<HTMLInputElement>('[data-ja-taste]');
  const course = $<HTMLInputElement>('[data-ja-course]');
  const honeypot = $<HTMLInputElement>('[data-ja-hp]');
  const consent = $<HTMLInputElement>('[data-ja-consent]');
  const submit = $<HTMLButtonElement>('[data-ja-submit]');
  const success = document.querySelector<HTMLElement>('[data-ja-success]')!;
  const { show: showError, clear: clearError } = errorShower(form, $<HTMLElement>('[data-ja-error]'));

  const ALLOWED_AGE = allowedOptions(age);
  const ALLOWED_RELATION = allowedOptions(relation);
  const ALLOWED_HEARD = allowedOptions(heardFrom);

  /** 체크박스 묶음: 페이지에 렌더된 값 중 체크된 것만 */
  const checkedValues = (group: string) =>
    Array.from(form!.querySelectorAll<HTMLInputElement>(`[data-ja-${group}] input:checked`)).map((i) => i.value);

  intro.addEventListener('input', () => {
    introCount.textContent = `${intro.value.length} / ${INTRO_MAX}`;
  });

  // 칸을 벗어날 때 형식이 맞으면 정리된 값으로 바꿔 보여 준다
  for (const [input, rule] of [[phone, KR_MOBILE], [email, EMAIL]] as const) {
    input.addEventListener('blur', () => {
      const v = input.value.trim() && check(rule, input.value);
      if (v) {
        input.value = v;
        input.removeAttribute('aria-invalid');
      }
    });
  }

  /** 앱 미리보기에서 넘어온 코스: "코스 이름 | 시작 시각 | 장소 → 장소" 중 알려진 장소만 남긴다 */
  function cleanCourse(raw: string) {
    const [title = '', start = '', stops = ''] = raw.split(' | ');
    const places = stops.split(' → ').filter((s) => SPOT_NAMES.has(s));
    if (!places.length) return '';
    const t = clean(title, 30).replace(/[|→]/g, '');
    return [t, START_VALUES.has(start) ? start : '', places.join(' → ')].join(' | ');
  }

  /** 검증을 통과하면 보낼 데이터를, 아니면 오류를 보여 주고 null을 돌려준다 */
  function collect(): URLSearchParams | null {
    const nameValue = clean(name.value, 30);
    if (!PERSON_NAME.test(nameValue)) return showError('이름을 2~30자로 입력해 주세요. (문자, 공백, . \' - 만 사용할 수 있어요)', name);

    const phoneValue = check(KR_MOBILE, phone.value, 20);
    if (!phoneValue) return showError('휴대폰 번호를 010-1234-5678 형식으로 입력해 주세요.', phone);

    const emailValue = check(EMAIL, email.value);
    if (!emailValue) return showError('올바른 이메일 주소를 입력해 주세요. (예: you@example.com)', email);

    if (!ALLOWED_AGE.has(age.value)) return showError('나이대를 선택해 주세요.', age);
    if (!ALLOWED_RELATION.has(relation.value)) return showError('성수동과의 관계를 선택해 주세요.', relation);

    const langs = checkedValues('languages');
    if (!langs.length) return showError('대화 가능한 외국어를 하나 이상 선택해 주세요.', $<HTMLElement>('[data-ja-languages] input'));
    const times = checkedValues('availability');
    if (!times.length) return showError('활동 가능한 시간을 하나 이상 선택해 주세요.', $<HTMLElement>('[data-ja-availability] input'));

    const introValue = clean(intro.value, INTRO_MAX);
    if (introValue.length < INTRO_MIN) return showError(`자기소개를 ${INTRO_MIN}자 이상 적어 주세요.`, intro);

    let instaValue = '';
    if (insta.value.trim()) {
      instaValue = check(INSTAGRAM, insta.value, 100) ?? '';
      if (!instaValue) return showError('인스타그램 아이디를 확인해 주세요. (영문, 숫자, . _ 만 사용, 예: @yourhandle)', insta);
    }

    if (!ALLOWED_HEARD.has(heardFrom.value)) return showError('연온을 알게 된 경로를 선택해 주세요.', heardFrom);

    const ref = clean(referrer.value, 60);
    if (ref && !REFERRER.test(ref)) return showError('추천인 이름에는 문자, 숫자, 공백과 . \' - _ @ 만 사용할 수 있어요.', referrer);

    if (!consent.checked) return showError('개인정보 수집·이용에 동의해 주셔야 신청할 수 있어요.', consent);

    const data = new URLSearchParams({
      form: 'jigi',
      name: nameValue,
      phone: phoneValue,
      email: emailValue,
      age_group: age.value,
      seongsu_relation: relation.value,
      languages: langs.join(', '),
      availability: times.join(', '),
      intro: introValue,
      instagram: instaValue,
      heard_from: heardFrom.value,
      referred_by: ref,
      taste: taste.value.split(', ').filter((t) => TASTE_LABELS.has(t)).join(', '),
      course: cleanCourse(course.value),
      consent: 'yes',
      source_page: 'app-preview-jigi',
      submitted_at: new Date().toISOString(),
    });
    addUtm(data);
    return data;
  }

  const showSuccess = () => {
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
      showError('아직 신청을 받을 준비가 되지 않았어요. 잠시 후 다시 시도해 주세요.');
      return;
    }

    submit.disabled = true;
    submit.textContent = '신청하는 중…';
    try {
      await send(data);
      showSuccess();
    } catch {
      showError('전송 중 문제가 생겼어요. 인터넷 연결을 확인하고 다시 시도해 주세요.');
    } finally {
      submit.disabled = false;
      submit.textContent = '지기 사전 신청하기';
    }
  });
}
