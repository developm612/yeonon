/** 지기 신청서 선택지 — 신청 폼(components/app/JigiApplyForm.astro)과 서버 검증(lib/jigiApplication.ts)이 같이 쓴다 */
export const AGES = ['20대', '30대', '40대', '50대 이상'];
export const RELATIONS = ['성수동에 살아요', '성수동에서 일해요', '성수동 근처 학교에 다녀요', '성수동에 자주 놀러 가요', '기타'];
export const LANGUAGES = ['영어', '일본어', '중국어', '기타 외국어'];
export const AVAILABILITY = ['평일 낮', '평일 저녁', '주말'];
export const SOURCES = ['인스타그램', '지인 소개', '대학·학교 커뮤니티', '지역 커뮤니티(당근 등)', '검색', '기타'];

export const INTRO_MIN = 20;
export const INTRO_MAX = 300;
export const SAMPLE_COURSE_MAX = 300;
