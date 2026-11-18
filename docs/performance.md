# 성능 (Lighthouse) — 무료 요금제 안에서

Vercel Hobby·Supabase Free 그대로, 기능·보안 로직(RLS·DB 함수·로그인·Origin 확인)은 바꾸지 않고 한 것들입니다.

## 0. 서버 위치
- `vercel.json`의 `"regions": ["icn1"]` — 화면을 만드는 서버를 DB(Supabase 서울)와 같은 서울에서 돌린다.
  응답 헤더 `x-vercel-id`가 `icn1::icn1::…`이면 적용된 것. 미국 동부(`iad1`)일 때 루트 상세 첫 응답이 약 2.8초였다.

## 1. 공개 화면 캐시 (루트 피드 `/`, 루트 상세 `/routes/[id]`)
- 규칙: `src/lib/publicCache.ts`, 적용: `src/middleware.ts`.
- 응답: `Cache-Control: public, max-age=0, s-maxage=60, stale-while-revalidate=300`
  — Vercel CDN이 60초 동안 같은 HTML을 주고, 그 뒤 5분까지는 옛 사본을 주면서 뒤에서 새로 그린다. 브라우저는 매번 확인한다.
- **CDN 캐시는 쿠키를 구분하지 않는다** (같은 주소면 누구에게나 같은 HTML. `Vary: Cookie`는 Vercel이 아예 캐시하지 않는다).
  그래서 이 두 화면은 세션을 읽지 않고 **비로그인 기준**으로 그린다 (쿠키 없는 Supabase 클라이언트 → 공개 데이터만).
  응답에 `Set-Cookie`가 있으면 캐시되지 않으므로 탭 기억 쿠키도 이 응답에서는 쓰지 않는다.
- 사람마다 다른 부분은 브라우저가 따로 가져온다 (모두 `private, no-store`):

  | 부분 | 가져오는 곳 | 코드 |
  |---|---|---|
  | 헤더 오른쪽(로그인/Sign up/채팅·알림·내 정보·관리자), 탭 기억 쿠키, 지기 탭으로 돌려보내기 | `/api/session` | `scripts/session.ts`, `scripts/headerAccount.ts`, `AppTopBar.astro`의 `<template>` |
  | 피드 위 '다가오는 만남·답을 기다리는 요청' | `/fragments/my-rows` | `components/feed/MyBookingRows.astro` |
  | 루트 상세 요청 영역(여행자 폼·가입 마치기·안내)과 할인가 | `/fragments/route-cta/[id]` | `components/routes/RequestCta.astro`, `RoutePrice.astro` |

  채팅·알림 아일랜드(Preact)는 회원일 때만 불러온다 (`scripts/headerIslands.ts`) — 비로그인 방문자는 받지 않는다.
- 주소에 다른 값이 붙으면 지금처럼 그 사람 기준으로 서버에서 그리고 캐시하지 않는다:
  `?slot=`(로그인 후 돌아온 주소), `?rec=`(추천 클릭 기록), `?error=`, `?preview=1`(공개 전 루트 미리보기).
  피드는 `?q=` `?tag=` `?page=`까지 캐시한다.
- 공개 전 루트는 캐시 화면에서 404다. 지기 '내 루트'·관리자 화면의 미리보기 링크는 `?preview=1`을 붙인다.
- 루트를 고치거나 공개해도 최대 60초(+재검증 5분 안에서 한 번) 옛 화면이 보일 수 있다. 예약 가능 여부는 요청할 때 DB 함수가 다시 확인한다.

## 2. 이미지
- `components/ui/RoutePhoto.astro`: 고정 비율 상자(aspect-ratio + width/height) — 레이아웃 흔들림(CLS) 없음.
- 첫 화면에서 가장 큰 사진만 `priority`(바로 + `fetchpriority=high`): 피드 첫 줄 사진, 루트 상세 대표 사진.
  피드 1~4번째 줄은 바로(eager), 나머지는 `loading=lazy`.
- 크기별 `srcset`은 Vercel 이미지 최적화가 만든다. 형식은 브라우저에 맞춰 AVIF/WebP (`astro.config.mjs` `imagesConfig.formats`).
  피드 썸네일(화면에서 104~128px)은 256·384px만 만든다 (전에는 480px부터).

## 3. 글꼴
- 영문 제목 Bricolage Grotesque: 굵기 600~700, 영문·숫자·문장부호만 → 약 55KB (전: 77KB + 확장 글자 30KB).
- 영문 본문 Inter: 굵기 400~800, 같은 글자 → 약 27KB (전: 48KB). 여행자 화면도 영문은 Inter, 한글은 Pretendard
  (Pretendard로 영문을 그리면 글자 묶음 파일을 12개 넘게 받았다).
- 모두 `font-display: swap`. 첫 화면 글꼴만 preload: 여행자 화면은 Bricolage, 지기·관리자 화면은 Inter.
- 한글 Pretendard는 쓰는 글자 묶음만 받는 dynamic subset 그대로, 다만 그 CSS를 첫 화면 CSS에서 빼서 그린 뒤 불러온다
  (첫 화면 CSS 27KB → 12KB, gzip). 그동안 한글은 시스템 글꼴로 보인다.
- 글꼴 파일 다시 만들기: `python -m pip install fonttools brotli` 후 `python scripts/build-fonts.py`
  (원본은 `@fontsource-variable/*` 패키지). 글자 범위를 바꾸면 `src/styles/fonts.css`의 `unicode-range`도 함께.

## 4. 자바스크립트
- 헤더 채팅·알림 아일랜드: `client:load` → `client:idle` (첫 화면을 그린 뒤 한가할 때). 캐시 화면에서는 회원일 때만.
- 화면의 핵심인 아일랜드(예약 상태 `BookingPanel`, 대화 `ChatRoom`·`ConversationList`, 새 요청 `PartnerRequests`)는 들어오자마자 실시간 연결이 필요해 `client:load` 그대로.
- 나머지 스크립트는 Astro가 `type="module"`(문서를 다 읽은 뒤 실행)로 넣는다.

## 5. 측정 (바꾸기 전·후 비교)
```bash
npm run lh -- --label before            # 운영의 / 와 첫 공개 루트 상세를 3번씩 (모바일)
# … 배포 …
npm run lh -- --label after
npm run lh -- --compare lighthouse/before.json lighthouse/after.json
```
- 값: 성능 점수, LCP, TBT, CLS, 서버 응답 시간(HTML 첫 바이트), 실행 횟수의 **중앙값**. 결과는 `lighthouse/<label>.json`.
- 다른 주소: `--base https://<미리보기 주소>`, 특정 화면: `--url https://…/routes/<id>` (여러 번 가능), 횟수: `--runs 5`.
- 크롬이 필요하다 (`CHROME_PATH` 환경 변수, 없으면 기본 설치 경로).
- Lighthouse 모바일은 느린 4G·느린 CPU를 흉내 내는 계산이라 실행마다 몇 점씩 다르다. 한 번 값보다 중앙값을 본다.
- 캐시가 맞았는지: `curl -sI https://yeonon.vercel.app/ | grep -i x-vercel-cache` → 두 번째 요청부터 `HIT`(또는 `STALE`).
- 브라우저로 직접: 크롬 개발자 도구 → Lighthouse 탭 → Mode: Navigation, Device: Mobile, Categories: Performance → Analyze.
  (시크릿 창에서 — 확장 프로그램이 점수를 낮춘다)
