/**
 * YEONON 대기자 등록 수신용 Google Apps Script.
 * /app-preview 대기자 폼 → 이 웹앱(doPost) → 'Waitlist' 시트에 한 줄 저장 + 알림 메일 발송.
 *
 * 설치: 구글 스프레드시트 → 확장 프로그램 → Apps Script → 이 파일 내용 전체 붙여넣기 → 저장
 *       → 배포 → 새 배포 → 웹 앱 (실행 계정: 나 / 액세스 권한: 모든 사용자) → 웹 앱 URL을
 *       src/config/site.ts 의 waitlistEndpoint 에 넣는다. (자세한 순서는 README)
 * 코드를 고친 뒤에는 배포 → 배포 관리 → 편집 → 버전 '새 버전' 으로 다시 배포해야 반영된다.
 */

/** 새 신청 알림을 받을 메일 주소 */
const NOTIFY_EMAIL = 'yeonon.official2026@gmail.com';

const SHEET_NAME = 'Waitlist';
const KEYS = ['submitted_at', 'contact_method', 'contact', 'nationality', 'heard_from', 'referred_by',
  'interests', 'consent', 'source_page', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'];
const METHOD_NAME = { email: 'Email', whatsapp: 'WhatsApp', instagram: 'Instagram' };

// 웹앱 URL은 공개 주소라 사이트를 거치지 않고 직접 보낼 수도 있다. 그래서 여기서 한 번 더 검증한다.
// src/scripts/waitlist.ts 의 CONTACT 정규식과 같게 유지
const CONTACT = {
  email: /^(?=.{6,254}$)[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/,
  whatsapp: /^\+[1-9]\d{7,14}$/,
  instagram: /^@(?!\.)(?!.*\.\.)[a-z0-9._]{1,30}(?<!\.)$/,
};

/** 제어 문자·꺾쇠 제거, 앞뒤 공백 제거, 길이 제한 */
function text(value, max) {
  return String(value || '').replace(/[\x00-\x1F\x7F<>]/g, '').trim().slice(0, max || 120);
}

/** 시트 저장용: = + - @ 로 시작하면 앞에 ' 를 붙여 수식이 아닌 글자로 저장 (수식 주입 방지) */
function cell(value) {
  return /^[=+\-@]/.test(value) ? "'" + value : value;
}

function doPost(e) {
  const p = (e && e.parameter) || {};
  if (p.company) return reply('ok'); // 스팸 봇 (숨은 칸이 채워짐) — 저장하지 않음

  const row = {};
  KEYS.forEach((k) => { row[k] = text(p[k], k === 'interests' ? 400 : 120); });

  const rule = CONTACT[row.contact_method];
  if (!rule || !rule.test(row.contact) || row.consent !== 'yes' || !row.nationality || !row.heard_from) {
    return reply('invalid');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const lock = LockService.getScriptLock();
  lock.waitLock(10000); // 동시에 여러 명이 제출해도 행이 겹치지 않게
  try {
    const sheet = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sheet.getLastRow() === 0) sheet.appendRow(KEYS);
    sheet.appendRow(KEYS.map((k) => cell(row[k])));
  } finally {
    lock.releaseLock();
  }

  // 메일이 실패해도 시트 저장은 이미 끝났으므로 오류만 기록한다
  try {
    notify(row, ss.getUrl());
  } catch (err) {
    console.error('notify failed: ' + err);
  }
  return reply('ok');
}

/** 새 신청 알림 메일 (일반 텍스트) */
function notify(row, sheetUrl) {
  const method = METHOD_NAME[row.contact_method] || row.contact_method;
  const utm = ['utm_source', 'utm_medium', 'utm_campaign'].map((k) => row[k]).filter(String).join(' / ');
  MailApp.sendEmail({
    to: NOTIFY_EMAIL,
    subject: '[연온] 새 대기자 신청 – ' + method + ' · ' + row.nationality,
    body:
      '연락 방법: ' + method + '\n' +
      '연락처: ' + row.contact + '\n' +
      '국적: ' + row.nationality + '\n' +
      '알게 된 경로: ' + row.heard_from + '\n' +
      '추천인: ' + (row.referred_by || '-') + '\n' +
      '관심사: ' + (row.interests || '-') + '\n' +
      '유입(UTM): ' + (utm || '-') + '\n' +
      '제출 시각: ' + row.submitted_at + '\n\n' +
      '전체 목록: ' + sheetUrl,
  });
}

function reply(message) {
  return ContentService.createTextOutput(message);
}

/** 설치 확인용: Apps Script 편집기에서 이 함수를 한 번 실행하면 권한 허용 창이 뜨고, 테스트 행과 메일이 생긴다 */
function testSubmit() {
  doPost({ parameter: {
    submitted_at: new Date().toISOString(), contact_method: 'email', contact: 'test@example.com',
    nationality: 'Japan', heard_from: 'Instagram', referred_by: 'TEST', interests: 'K-Pop Spots',
    consent: 'yes', source_page: 'apps-script-test',
  } });
}
