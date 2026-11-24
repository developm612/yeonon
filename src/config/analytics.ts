/**
 * Google Analytics 4 (gtag.js) 설정.
 * 태그는 운영 주소(yeonon.vercel.app)에서만 불러온다 — 로컬(localhost)·Vercel 미리보기 주소에서는 아무것도 보내지 않는다.
 * 태그: components/Analytics.astro (BaseLayout <head>), 화면 이벤트: scripts/analytics.ts, 서버 완료 이벤트: lib/analytics.ts
 * 이름·이메일·전화번호 같은 개인 식별 정보는 이벤트 값으로 보내지 않는다.
 */
export const GA_MEASUREMENT_ID = 'G-S53E5T9G48';
/** 데이터를 모으는 유일한 주소 */
export const GA_HOSTNAME = 'yeonon.vercel.app';
/** 서버에서 끝난 일(로그인·가입·매칭 신청)을 다음 화면에서 GA로 보내려고 잠깐 담아 두는 쿠키 */
export const GA_EVENT_COOKIE = 'yeonon_ga_evt';
