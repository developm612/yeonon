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
