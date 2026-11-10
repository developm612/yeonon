/**
 * 로그인 후 지기 신청서(/partner/apply) 검증.
 * 브라우저(scripts/jigiApply.ts, 제출 전 안내)와 서버(pages/partner/apply.astro, 저장 전 재검증)가 같은 함수를 쓴다.
 * 정리·검증 규칙은 사전 신청 폼과 같은 scripts/formSafety.ts. DB에도 같은 형식 제약이 있다 (20261110000002_jigi.sql).
 */
import { AGES, AVAILABILITY, INTRO_MAX, INTRO_MIN, LANGUAGES, RELATIONS, SAMPLE_COURSE_MAX, SOURCES } from '../data/jigiApplyOptions';
import { INTEREST_MAX, INTEREST_MIN, isInterestId } from '../data/interests';
import { INSTAGRAM, KR_MOBILE, PERSON_NAME, REFERRER, check, clean } from '../scripts/formSafety';

export interface JigiApplicationData {
  name: string;
  phone: string;
  age_group: string;
  seongsu_relation: string;
  languages: string[];
  availability_note: string;
  intro: string;
  instagram: string | null;
  taste: string[];
  sample_course: string | null;
  heard_from: string;
  referred_by: string | null;
}

export type Validation =
  | { ok: true; data: JigiApplicationData }
  | { ok: false; field: string; message: string };

const fail = (field: string, message: string): Validation => ({ ok: false, field, message });
const only = (allowed: string[], values: string[]) => [...new Set(values)].filter((v) => allowed.includes(v));

/** get: 한 칸의 값, getAll: 체크박스 묶음의 값들 (FormData의 get/getAll과 같은 모양) */
export function validateJigiApplication(get: (name: string) => string, getAll: (name: string) => string[]): Validation {
  const name = clean(get('name'), 30);
  if (!PERSON_NAME.test(name)) return fail('name', '이름을 2~30자로 입력해 주세요. (문자, 공백, . \' - 만 사용할 수 있어요)');

  const phone = check(KR_MOBILE, get('phone'), 20);
  if (!phone) return fail('phone', '휴대폰 번호를 010-1234-5678 형식으로 입력해 주세요.');

  const age = get('age_group');
  if (!AGES.includes(age)) return fail('age_group', '나이대를 선택해 주세요.');
  const relation = get('seongsu_relation');
  if (!RELATIONS.includes(relation)) return fail('seongsu_relation', '성수동과의 관계를 선택해 주세요.');

  const languages = only(LANGUAGES, getAll('languages'));
  if (!languages.length) return fail('languages', '대화 가능한 외국어를 하나 이상 선택해 주세요.');
  const availability = only(AVAILABILITY, getAll('availability'));
  if (!availability.length) return fail('availability', '활동 가능한 시간을 하나 이상 선택해 주세요.');

  const taste = [...new Set(getAll('taste'))].filter(isInterestId);
  if (taste.length < INTEREST_MIN || taste.length > INTEREST_MAX) return fail('taste', `나의 취향을 ${INTEREST_MIN}~${INTEREST_MAX}개 골라 주세요.`);

  const intro = clean(get('intro'), INTRO_MAX);
  if (intro.length < INTRO_MIN) return fail('intro', `자기소개를 ${INTRO_MIN}자 이상 적어 주세요.`);

  const sampleCourse = clean(get('sample_course'), SAMPLE_COURSE_MAX);

  let instagram: string | null = null;
  if (get('instagram').trim()) {
    instagram = check(INSTAGRAM, get('instagram'), 100);
    if (!instagram) return fail('instagram', '인스타그램 아이디를 확인해 주세요. (영문, 숫자, . _ 만 사용, 예: @yourhandle)');
  }

  const heardFrom = get('heard_from');
  if (!SOURCES.includes(heardFrom)) return fail('heard_from', '연온을 알게 된 경로를 선택해 주세요.');

  const referrer = clean(get('referred_by'), 60);
  if (referrer && !REFERRER.test(referrer)) return fail('referred_by', '추천인 이름에는 문자, 숫자, 공백과 . \' - _ @ 만 사용할 수 있어요.');

  if (get('consent') !== 'yes') return fail('consent', '개인정보 수집·이용에 동의해 주셔야 신청할 수 있어요.');

  return {
    ok: true,
    data: {
      name,
      phone,
      age_group: age,
      seongsu_relation: relation,
      languages,
      availability_note: availability.join(', '),
      intro,
      instagram,
      taste,
      sample_course: sampleCourse || null,
      heard_from: heardFrom,
      referred_by: referrer || null,
    },
  };
}
