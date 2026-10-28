# 연온(YEONON) 랜딩사이트

외국인 여행자와 성수동 현지 친구 '지기'를 연결하는 연온의 사전 등록(Pre-launch) 랜딩사이트입니다.
Astro + Tailwind CSS v4 정적 사이트이며, 신청은 모두 외부 설문 링크로 연결됩니다. (사이트 내 폼·DB·로그인 없음)

## 페이지

| 경로 | 내용 | 언어 |
|---|---|---|
| `/` | 홈 — 프로그램 소개 | 영문 |
| `/travelers` | 여행자 페이지 | 영문 |
| `/jigi` | 지기 모집 페이지 | 한글 |
| `/how-it-works` | 진행 방식 (탭, 매칭 다이어그램) | 영문 + 한국어 요약 |
| `/privacy` | 개인정보 안내 | 영문 + 한글 |

## 로컬 실행 · 빌드

Node.js 18.20 이상 (20+ 권장)

```bash
npm install        # 의존성 설치
npm run dev        # 개발 서버 → http://localhost:4321
npm run build      # 정적 빌드 → dist/
npm run preview    # 빌드 결과 미리보기
```

## 배포 (Vercel)

1. 이 폴더를 GitHub 저장소에 올린다.
2. vercel.com → **Add New Project** → 저장소 선택. Framework Preset은 **Astro**로 자동 인식된다.
   (Build Command `npm run build`, Output Directory `dist`)
3. 배포 후 **Settings → Domains**에서 도메인 연결.
4. 도메인이 정해지면 `astro.config.mjs`의 `site`와 `src/config/site.ts`의 `url`을 바꾸고 다시 배포한다. (canonical·OG URL에 쓰임)

CLI로 배포하려면: `npx vercel` (미리보기) → `npx vercel --prod` (프로덕션)

## 바꿔야 할 값은 한 곳에: `src/config/site.ts`

`TODO:`로 시작하는 값은 배포 전에 채워야 합니다.
설문 링크가 `TODO` 상태이면 버튼은 `#`로 렌더링되고 눌러도 이동하지 않습니다.

| 상수 | 설명 |
|---|---|
| `travelerFormUrl` / `jigiFormUrl` | 여행자·지기 외부 설문 링크. UTM(`utm_source=landing&utm_medium=<버튼 위치>&utm_campaign=prelaunch`)이 자동으로 붙음 |
| `contactEmail`, `operator`, `url` | 문의 이메일, 운영 주체명, 도메인 |
| `showPrice` | `false`면 `/travelers` 가격 섹션과 FAQ 가격 문항이 사라짐 |
| `priceLabel` | 가격 문구 (1인/팀 기준 확정 후 수정) |
| `formTool`, `retentionPeriod` | 개인정보 페이지의 설문 도구명, 보관 기간 |
| `STAT_SOURCES` | `/jigi` 통계 수치 출처 (각주) |

UTM `utm_medium` 값: `header_cta`, `sticky_cta`, `hero_cta`, `final_cta`, `travelers_hero_cta`, `travelers_final_cta`, `jigi_hero_cta`, `jigi_final_cta`, `hiw_final_cta`

## 이미지

`public/images/`에 아래 파일명으로 넣으면 자동으로 표시되고, 없으면 브랜드 색 그라디언트 일러스트가 대신 보입니다.

| 파일 | 위치 |
|---|---|
| `hero.jpg` | 홈 히어로 (성수동 거리에서 두 사람이 걷는 사진) |
| `travelers-hero.jpg` | 여행자 페이지 히어로 |
| `jigi-hero.jpg` | 지기 페이지 히어로 (실제 지기 사진은 동의 후에만, 뒷모습·풍경 권장) |
| `og-image.png` | 공유 미리보기 이미지 1200×630 |

로고: 원본 `public/images/logo-power-symbol.png`에서 여백을 자르고 흰 배경을 투명 처리한 `public/images/logo.png`(495×96)를 씁니다 (`src/components/Logo.astro`). 파비콘 `public/favicon.png`·`apple-touch-icon.png`는 로고의 전원 심볼 부분입니다. 로고를 바꾸면 이 파일들을 교체하세요.

## 구조

```
src/
  components/  Header, Footer, Hero, Card, StepTimeline, FAQ, CTASection, StickyCTA,
               StatCard, MatchDiagram, SmartImage, SectionHeading, Button, Icon, Logo
  layouts/     BaseLayout.astro   (lang 속성, SEO·OG 메타, 폰트)
  pages/       index, travelers, jigi, how-it-works, privacy
  config/      site.ts            (모든 TODO 값·외부 링크·SHOW_PRICE)
  styles/      global.css         (색상 토큰, 공통 클래스)
public/
  images/
  favicon.png, apple-touch-icon.png
```

JS는 모바일 메뉴(Header), 탭 토글(how-it-works)에만 사용합니다. FAQ는 `<details>` 기반이라 JS가 없습니다.

### 디자인 메모
- 로고 색을 기준으로 한 블루톤입니다. (명세서의 아이보리·레드·그린·오렌지 팔레트에서 변경)
  역할별 토큰: `brand` 네이비 `#0B3D91`(연온·매칭) / `traveler` 블루 `#1A5FD0`(여행자) / `jigi` 시안 `#0B6E91`·`#19B5E6`(지기).
  `-strong`은 버튼·텍스트용(WCAG AA 대비), `-soft`는 아이콘 배경용입니다. 값은 `src/styles/global.css`의 `@theme`에서 바꿉니다.
- 모바일 헤더 가운데에 `Traveler | 지기` 전환 버튼이 고정되어 `/travelers`, `/jigi`로 이동합니다 (현재 페이지는 채워진 상태로 표시).
- 한글 페이지·블록은 `word-break: keep-all`, Pretendard 폰트 적용.

## 배포 전 체크 (명세 8장)

- [x] 5개 페이지 렌더링
- [x] 375 / 768 / 1280px 가로 스크롤 없음 (헤드리스 브라우저로 확인)
- [x] 모든 CTA가 `site.ts` 외부 링크로 연결 (새 탭, `rel="noopener"`, UTM)
- [x] "Book", "예약", "결제", 가짜 후기·프로필 없음
- [x] 지기를 "가이드"로 지칭하지 않음 (FAQ의 "가이드가 아니라" 부정 문맥만 사용)
- [x] 통계 수치 출처 각주
- [x] `showPrice=false` 시 가격 섹션 숨김
- [ ] Lighthouse 모바일 성능·접근성 90+ (배포 후 측정)
- [ ] 아래 TODO 채우기

## 사람이 직접 채울 것 (TODO)

1. 여행자용·지기용 외부 설문 링크
2. 도메인, 문의 이메일, 운영 주체명
3. 가격 기준(1인/팀) 확정 또는 `showPrice: false`
4. 지기에게 요구할 영어 수준 (`src/pages/jigi.astro`)
5. 통계 수치 출처 링크 (`STAT_SOURCES`)
6. 로고 파일, 히어로 이미지, OG 이미지
7. 개인정보 보관 기간
8. 신고·보험 절차 확정 후 `/travelers` Safety 문구 추가

## 참고: 외부 설문 질문 제안

### 여행자용
- 이름(닉네임), 이메일, 국가, 사용 언어
- 방한 예정 시기, 일행 구성(혼자/커플/가족/친구)
- 관심사 복수 선택
- 원하는 시간(2/3/4시간)
- 4시간 ₩120,000에 대한 반응 (너무 비쌈 / 적당 / 저렴 / 더 낼 의향 있음)
- 이전에 현지인을 찾으려 했던 경험 (자유 응답)
- 인터뷰 참여 의향 (예/아니오)
- 개인정보 수집·이용 동의

### 지기용
- 이름, 연락처, 이메일, 나이대
- 성수동과의 관계(거주/직장/학교/자주 방문), 기간
- 직업/활동 분야
- 영어 수준, 그 밖의 가능 언어
- 소개하고 싶은 장소나 테마 (자유 응답)
- 활동 가능 요일·시간대
- 기대하는 활동 보상 수준, 가장 걱정되는 점 (자유 응답)
- 인터뷰 참여 가능 여부
- 개인정보 수집·이용 동의

## 앱 미리보기 페이지 (`/app-preview`)

아직 없는 연온 앱의 경험을 여행자가 직접 눌러 보는 인터랙티브 데모입니다 (영문, PRD: `yeonon-app-preview-prd.md`).
폰 낙하 → 로고·로딩 → 앱 홈 → 취향 3~5개 선택 → 매칭 로딩 → "We found your Jigis!" → 추천 지기 목록 → `Join the early list`(UTM `utm_medium=app_preview`) 순서로 진행되며, 서버·DB 없이 샘플 데이터만 씁니다. 지기 프로필은 모두 가상 인물이고 `Demo` 배지가 붙습니다.
- 데이터·타이밍: `src/data/appPreview.ts` — `TIMING`(낙하·스플래시·매칭 시간), `INTERESTS`(취향 20개), `SAMPLE_JIGIS`(가상 지기 6명), `matchJigis()`(매칭률 = 72 + 겹침 비율 × 26)
- 동작: `src/scripts/appPreview.ts` (화면 흐름) / 화면: `src/components/app/AppScreens.astro`
- 지기 미리보기와 공통: `src/scripts/phoneApp.ts`(낙하·스플래시·화면 전환·타이머·칩 선택), `src/components/app/PhoneStage.astro`(헤드라인·낙하 무대·Replay/Skip), `src/components/app/PhoneFrame.astro`(폰 프레임), `src/styles/app-preview.css`(화면 공통 스타일, 강조색은 `[data-app]` 변수)
- 앱 UI는 393×852 기준으로 그리고 폰 크기에 맞춰 scale 합니다. 폰은 최대 590px 폭(1.5배)이며 브라우저 높이에 맞춰 줄어듭니다.
- 이 페이지는 모바일 하단 고정 CTA를 숨깁니다 (`BaseLayout`의 `sticky="none"`). 헤더 메뉴에는 없고, `/how-it-works`의 `Join as a traveler`와 `/travelers`의 `Try the app preview` 버튼으로 들어옵니다.
- 앱 결과 화면의 `Join the early list`는 같은 페이지 하단 대기자 등록 폼(`#waitlist`)으로 스크롤합니다.

## 지기 앱 미리보기 페이지 (`/app-preview-jigi`)

한국인 지기 지원자가 지기 앱을 직접 눌러 보는 데모입니다 (한국어, 청록 강조색). 헤더 메뉴에는 링크가 없습니다.
폰 낙하 → 로고 → 홈 → ① 취향 3~5개 고르기 → ② 나만의 코스 만들기(장소 2~5곳 담기·순서 바꾸기·빼기, 이동 포함 총 시간 계산) → ③ 여행자에게 보이는 코스 카드 미리보기(코스 이름 수정, 시작 시간 선택 → 장소별 도착 시각 계산) → 코스 등록 로딩 → 완료 → `지기 사전 신청하기`로 하단 폼 이동.
- 데이터: `src/data/jigiPreview.ts` — 취향 한국어 이름(`TASTE_KO`, id는 여행자 취향과 같음), 장소 후보 `SPOTS`(18곳, 특정 가게가 아닌 예시 묘사), 코스 규칙(`COURSE_MIN/MAX`, 이동 시간 `WALK_MIN`, `START_TIMES`)
- 동작: `src/scripts/jigiPreview.ts` / 화면: `src/components/app/JigiScreens.astro`
- 완료 화면에서 신청 폼으로 넘어가면 고른 취향과 만든 코스가 폼에 함께 담겨 `taste`, `course` 칸으로 저장됩니다.

### 지기 사전 신청 폼 (`/app-preview-jigi` 하단)

`src/components/app/JigiApplyForm.astro` + `src/scripts/jigiApply.ts`. 이름, 휴대폰 번호(010 형식으로 정리), 이메일, 나이대, 성수동과의 관계, 외국어(복수), 활동 가능 시간(복수), 자기소개(20~300자), 인스타그램·추천인(선택), 알게 된 경로, 개인정보 동의를 받습니다.
대기자 폼과 같은 `SITE.waitlistEndpoint`로 `form=jigi`를 붙여 보내고, Apps Script가 `Jigi` 시트에 저장하고 `[연온] 새 지기 신청` 메일을 보냅니다.
두 폼의 입력 정리·검증 규칙(정규식)과 보안 처리는 `src/scripts/formSafety.ts`에 모여 있습니다.

### 대기자 등록 폼 (`/app-preview` 하단)

`src/components/app/WaitlistForm.astro` + `src/scripts/waitlist.ts`. 연락 방법(Email/WhatsApp/Instagram), 연락처, 국적, 유입 경로, 추천인(선택), 개인정보 동의를 받고,
데모에서 고른 취향(`interests`)·UTM 파라미터·제출 시각을 함께 `SITE.waitlistEndpoint`로 POST 합니다. 사이트 자체에는 아무것도 저장하지 않습니다.
`waitlistEndpoint`가 `TODO`이면 제출해도 데이터를 보내지 않고 "아직 열리지 않았다"는 안내만 보여 줍니다.

**구글 스프레드시트로 받기 + 메일 알림 (무료)**

수신 코드는 `apps-script/Code.gs`에 있습니다. 대기자 응답은 `Waitlist` 시트, 지기 신청은 `Jigi` 시트에 한 줄씩 쌓이고(시트는 첫 신청 때 자동 생성), 새 신청이 들어올 때마다 `NOTIFY_EMAIL`(현재 `yeonon.official2026@gmail.com`)로 알림 메일이 갑니다.

1. **yeonon.official2026@gmail.com 계정으로** Google 스프레드시트를 새로 만듭니다 (이름 예: `YEONON Waitlist`). 주소 `docs.google.com/spreadsheets/d/<ID>/edit`의 `<ID>`를 복사해 둡니다.
2. [script.google.com](https://script.google.com) → 새 프로젝트 → 기본 코드를 지우고 `apps-script/Code.gs` 내용 전체를 붙여넣기 → 맨 위 `SHEET_ID`가 1번의 ID와 같은지 확인 → 저장.
   이 스크립트는 시트에 연결되지 않은 **독립 프로젝트**이고, 시트는 `SpreadsheetApp.openById(SHEET_ID)`로 엽니다. (`getActiveSpreadsheet()`는 독립 프로젝트에서 동작하지 않으니 쓰지 마세요.)
3. 함수 선택에서 `testSubmit` → 실행 → 권한 검토 → 계정 선택 → (확인되지 않은 앱 경고가 나오면) 고급 → 이동 → 허용.
   시트에 테스트 행이 생기고 알림 메일이 오면 정상입니다. 지기 쪽은 `testJigiSubmit`으로 같은 확인을 할 수 있습니다. 테스트 행은 지워도 됩니다(첫 줄 제목 행은 남겨 두세요).
4. 배포 → 새 배포 → 유형 `웹 앱`, 실행 계정 `나`, 액세스 권한 `모든 사용자` → 배포 → **웹 앱 URL**(`https://script.google.com/macros/s/…/exec`) 복사.
5. `src/config/site.ts`의 `waitlistEndpoint`에 URL을 붙여넣고 사이트를 다시 배포합니다.
6. 배포된 `/app-preview`에서 직접 한 번 제출해 시트에 행이 생기고 메일이 오는지 확인합니다.

- 코드를 고친 뒤에는 배포 → 배포 관리 → 편집 → 버전 `새 버전`으로 다시 배포해야 반영됩니다(URL은 그대로).
- 웹앱 URL은 공개 주소라 사이트를 거치지 않고 직접 보낼 수도 있어서, `Code.gs`에서 연락처 형식을 한 번 더 검증하고 `= + - @`로 시작하는 값은 글자로 저장합니다(스프레드시트 수식 주입 방지). 정규식을 바꿀 때는 `src/scripts/formSafety.ts`와 같이 바꾸세요.
- 일반 Gmail 계정의 Apps Script 메일 발송 한도는 하루 약 100통입니다. 넘으면 메일만 안 가고 시트 저장은 계속됩니다.
- 시트 값을 나중에 다른 웹페이지·관리 도구에 띄울 때는 반드시 글자(text)로 출력하세요. HTML로 끼워 넣으면 안 됩니다.

> 브라우저 보안 정책(CORS) 때문에 폼은 응답 내용을 읽지 않고 보냅니다. 네트워크 오류만 실패로 표시되므로, 연결 후 6번처럼 꼭 직접 제출해 확인하세요.
