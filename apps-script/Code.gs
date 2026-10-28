/** 신청을 저장할 스프레드시트 ID (주소 docs.google.com/spreadsheets/d/<ID>/edit 의 <ID>) */
const SHEET_ID = '1PzTyJ5IHwvi4u9GtpG0z6yoj6GqvAqeRfQVUTB-g5lA';

/**
 * YEONON 신청 수신용 Google Apps Script.
 * - 여행자 대기자 폼 (/app-preview)      → 'Waitlist' 시트
 * - 지기 사전 신청 폼 (/app-preview-jigi) → 'Jigi' 시트   (form=jigi 로 구분)
 * 저장할 때마다 NOTIFY_EMAIL로 알림 메일을 보낸다.
 *
 * 시트에 연결되지 않은 독립 Apps Script 프로젝트로 쓰고, 시트는 맨 위 SHEET_ID로 연다 (openById).
 *
 * 설치: script.google.com → 새 프로젝트 → 이 파일 내용 전체 붙여넣기 → SHEET_ID 확인 → 저장
 *       → 배포 → 새 배포 → 웹 앱 (실행 계정: 나 / 액세스 권한: 모든 사용자) → 웹 앱 URL을
 *       src/config/site.ts 의 waitlistEndpoint 에 넣는다. (자세한 순서는 README)
 * 코드를 고친 뒤에는 배포 → 배포 관리 → 편집 → 버전 '새 버전' 으로 다시 배포해야 반영된다.
 */

/** 새 신청 알림을 받을 메일 주소 */
const NOTIFY_EMAIL = 'yeonon.official2026@gmail.com';

const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];

// 웹앱 URL은 공개 주소라 사이트를 거치지 않고 직접 보낼 수도 있다. 그래서 여기서 한 번 더 검증한다.
// src/scripts/formSafety.ts 의 정규식과 같게 유지
const RULES = {
  email: /^(?=.{6,254}$)[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/,
  whatsapp: /^\+[1-9]\d{7,14}$/,
  instagram: /^@(?!\.)(?!.*\.\.)[a-z0-9._]{1,30}(?<!\.)$/,
  krMobile: /^01[016789]-\d{3,4}-\d{4}$/,
};

const FORMS = {
  waitlist: {
    sheet: 'Waitlist',
    keys: ['submitted_at', 'contact_method', 'contact', 'nationality', 'heard_from', 'referred_by',
      'interests', 'consent', 'source_page'].concat(UTM_KEYS),
    valid: (r) => {
      const rule = { email: RULES.email, whatsapp: RULES.whatsapp, instagram: RULES.instagram }[r.contact_method];
      return !!rule && rule.test(r.contact) && !!r.nationality && !!r.heard_from;
    },
    subject: (r) => '[연온] 새 대기자 신청 – ' + (METHOD_NAME[r.contact_method] || r.contact_method) + ' · ' + r.nationality,
    lines: (r) => [
      ['연락 방법', METHOD_NAME[r.contact_method] || r.contact_method], ['연락처', r.contact], ['국적', r.nationality],
      ['알게 된 경로', r.heard_from], ['추천인', r.referred_by], ['관심사', r.interests],
    ],
  },
  jigi: {
    sheet: 'Jigi',
    keys: ['submitted_at', 'name', 'phone', 'email', 'age_group', 'seongsu_relation', 'languages', 'availability',
      'intro', 'instagram', 'heard_from', 'referred_by', 'taste', 'course', 'consent', 'source_page'].concat(UTM_KEYS),
    valid: (r) =>
      r.name.length >= 2 && RULES.krMobile.test(r.phone) && RULES.email.test(r.email) &&
      (!r.instagram || RULES.instagram.test(r.instagram)) &&
      !!r.age_group && !!r.seongsu_relation && !!r.languages && !!r.availability && r.intro.length >= 20 && !!r.heard_from,
    subject: (r) => '[연온] 새 지기 신청 – ' + r.name + ' · ' + r.seongsu_relation,
    lines: (r) => [
      ['이름', r.name], ['휴대폰', r.phone], ['이메일', r.email], ['나이대', r.age_group], ['성수동과의 관계', r.seongsu_relation],
      ['외국어', r.languages], ['활동 가능 시간', r.availability], ['인스타그램', r.instagram], ['알게 된 경로', r.heard_from],
      ['추천인', r.referred_by], ['고른 취향', r.taste], ['만든 코스', r.course], ['자기소개', r.intro],
    ],
  },
};
const METHOD_NAME = { email: 'Email', whatsapp: 'WhatsApp', instagram: 'Instagram' };

/** 제어 문자·꺾쇠 제거, 앞뒤 공백 제거, 길이 제한 */
function text(value, max) {
  return String(value || '').replace(/[\x00-\x1F\x7F<>]/g, '').trim().slice(0, max || 120);
}

/**
 * 시트 저장용: = + - @ 로 시작하면 앞에 ' 를 붙여 수식이 아닌 글자로 저장 (수식 주입 방지).
 * 0으로 시작하는 숫자(010-… 휴대폰 번호)도 숫자로 바뀌어 0이 사라지지 않게 글자로 저장한다.
 */
function cell(value) {
  return /^[=+\-@]|^0\d/.test(value) ? "'" + value : value;
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  if (p.company) return reply('ok'); // 스팸 봇 (숨은 칸이 채워짐) — 저장하지 않음

  const form = FORMS[p.form === 'jigi' ? 'jigi' : 'waitlist'];
  const row = {};
  form.keys.forEach((k) => { row[k] = text(p[k], k === 'intro' ? 300 : k === 'interests' || k === 'course' ? 400 : 120); });
  if (row.consent !== 'yes' || !form.valid(row)) return reply('invalid');

  const ss = SpreadsheetApp.openById(SHEET_ID);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // 동시에 여러 명이 제출해도 행이 겹치지 않게
  try {
    const sheet = ss.getSheetByName(form.sheet) || ss.insertSheet(form.sheet);
    if (sheet.getLastRow() === 0) sheet.appendRow(form.keys);
    sheet.appendRow(form.keys.map((k) => cell(row[k])));
  } finally {
    lock.releaseLock();
  }

  // 메일이 실패해도 시트 저장은 이미 끝났으므로 오류만 기록한다
  try {
    notify(form, row, ss.getUrl());
  } catch (err) {
    console.error('notify failed: ' + err);
  }
  return reply('ok');
}

/** 새 신청 알림 메일 (일반 텍스트) */
function notify(form, row, sheetUrl) {
  const utm = ['utm_source', 'utm_medium', 'utm_campaign'].map((k) => row[k]).filter(String).join(' / ');
  const lines = form.lines(row).concat([['유입(UTM)', utm], ['제출 시각', row.submitted_at]]);
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: form.subject(row),
    body: lines.map(([k, v]) => k + ': ' + (v || '-')).join('\n') + '\n\n전체 목록 (' + form.sheet + ' 시트): ' + sheetUrl,
  });
}

function reply(message) {
  return ContentService.createTextOutput(message);
}

/** 설치 확인용: Apps Script 편집기에서 실행하면 'Waitlist' 시트에 테스트 행과 메일이 생긴다 */
function testSubmit() {
  doPost({ parameter: {
    submitted_at: new Date().toISOString(), contact_method: 'email', contact: 'test@example.com',
    nationality: 'Japan', heard_from: 'Instagram', referred_by: 'TEST', interests: 'K-Pop Spots',
    consent: 'yes', source_page: 'apps-script-test',
  } });
}

/** 설치 확인용: 'Jigi' 시트에 테스트 행과 메일이 생긴다 */
function testJigiSubmit() {
  doPost({ parameter: {
    form: 'jigi', submitted_at: new Date().toISOString(), name: '테스트', phone: '010-0000-0000', email: 'test@example.com',
    age_group: '20대', seongsu_relation: '성수동에서 일해요', languages: '영어', availability: '주말',
    intro: '테스트 신청입니다. 확인 후 이 행은 지워 주세요.', heard_from: '기타', taste: '숨은 카페',
    course: '테스트 코스 | 14:00 | 아침마다 줄 서는 동네 빵집 → 서울숲 느린 산책', consent: 'yes', source_page: 'apps-script-test',
  } });
}
