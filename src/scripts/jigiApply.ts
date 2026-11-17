/**
 * 지기 신청 폼 (components/app/JigiApplyForm.astro) — 로그인 후 /partner/apply.
 * 서버와 같은 검증(lib/jigiApplication.ts)으로 먼저 안내하고, 통과하면 정리한 값으로 바꿔 그대로 제출한다. 서버가 다시 검증해 저장한다.
 * (공개 사전 신청 폼과 Apps Script 전송은 새 랜딩 사이트로 옮겨 여기서 지웠다 — yeonon-app-first-plan.md 2-2)
 * 입력 정리·검증 규칙과 보안 메모는 scripts/formSafety.ts.
 */
import { INTRO_MAX } from '../data/jigiApplyOptions';
import { validateJigiApplication } from '../lib/jigiApplication';
import { KR_MOBILE, check, errorShower } from './formSafety';

const accountForm = document.querySelector<HTMLFormElement>('[data-jigi-form][data-mode="account"]');
if (accountForm) {
  const intro = accountForm.querySelector<HTMLTextAreaElement>('#ja-intro')!;
  const introCount = accountForm.querySelector<HTMLElement>('[data-ja-intro-count]')!;
  const phone = accountForm.querySelector<HTMLInputElement>('#ja-phone')!;
  const insta = accountForm.querySelector<HTMLInputElement>('#ja-insta')!;
  const submit = accountForm.querySelector<HTMLButtonElement>('[data-ja-submit]')!;
  const { show: showError, clear: clearError } = errorShower(accountForm, accountForm.querySelector<HTMLElement>('[data-ja-error]')!);

  intro.addEventListener('input', () => {
    introCount.textContent = `${intro.value.length} / ${INTRO_MAX}`;
  });
  phone.addEventListener('blur', () => {
    const v = phone.value.trim() && check(KR_MOBILE, phone.value);
    if (v) phone.value = v;
  });

  accountForm.addEventListener('submit', (e) => {
    if (submit.disabled) return e.preventDefault();
    const data = new FormData(accountForm);
    const result = validateJigiApplication((k) => String(data.get(k) ?? ''), (k) => data.getAll(k).map(String));
    if (!result.ok) {
      e.preventDefault();
      const target = accountForm.querySelector<HTMLElement>(`[name="${result.field}"]`) ?? undefined;
      showError(result.message, target);
      return;
    }
    clearError();
    // 서버에도 정리된 형식으로 보낸다 (예: 01012345678 → 010-1234-5678)
    phone.value = result.data.phone;
    insta.value = result.data.instagram ?? '';
    submit.disabled = true;
    submit.textContent = '신청하는 중…';
  });
}
