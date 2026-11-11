# 연온(YEONON) 랜딩사이트

외국인 여행자와 성수동 현지 친구 '지기'를 연결하는 연온의 사전 등록(Pre-launch) 랜딩사이트입니다.
Astro + Tailwind CSS v4 사이트입니다 (공개 페이지는 정적, 로그인 영역은 Vercel 서버 렌더링). 신청은 앱 미리보기 페이지 하단 폼(여행자 `/app-preview`, 지기 `/app-preview-jigi`)으로 받아 Google Apps Script로 스프레드시트에 저장합니다. (로그인·DB는 실서비스 전환 작업 중 — 아래 '로그인 · 회원 영역')

**신청 버튼 연결** (`src/config/cta.ts` 한 곳 — 회원 기능 공개 스위치 `PUBLIC_MEMBER_UI`에 따라 바뀜)
- 여행자: 사전 등록 중 `Join the early list` → `/app-preview` / 공개 후 `Find my route` → Google 로그인 → `/app/discover`
  (헤더, 홈(히어로·하단), `/travelers`(히어로·하단), 모바일 하단 고정 버튼, 앱 미리보기 결과 화면)
- 지기: 사전 등록 중 `지기 지원하기` → `/app-preview-jigi` / 공개 후 `Google로 시작하고 지원하기` → Google 로그인 → `/partner/apply`
  (`/jigi`(히어로·하단), `/jigi` 모바일 하단 고정 버튼, 지기 앱 미리보기 완료 화면)
- 공개 후에는 앱 미리보기 하단의 대기자·지기 사전 신청 폼 대신 로그인 안내가 보이고, 푸터의 '사전 등록 단계' 문구가 바뀐다.

## 페이지

| 경로 | 내용 | 언어 |
|---|---|---|
| `/` | 홈 — 프로그램 소개, 진행 방식(`#how-it-works`: 탭, 매칭 다이어그램, 안전, 비교) | 영문 + 한국어 요약 |
| `/travelers` | 여행자 페이지 | 영문 |
| `/jigi` | 지기 모집 페이지 | 한글 |
| `/privacy` | 개인정보처리방침 (초안 — 법률 검토 필요) | 한글 기본 + 영문 전환 |
| `/terms` | 이용약관 (초안 — 법률 검토 필요) | 한글 기본 + 영문 전환 |
| `/404`, `/500` | 없는 주소 / 서버 오류 화면 | 영문 + 한글 |

## 로컬 실행 · 빌드

Node.js 18.20 이상 (20+ 권장)

```bash
npm install        # 의존성 설치
npm run dev        # 개발 서버 → http://localhost:4321
npm run build      # 빌드 → .vercel/output/ (공개 페이지는 정적 HTML, 로그인 영역은 서버 함수)
```

Vercel 어댑터를 쓰므로 `npm run preview`는 지원되지 않는다. 확인은 `npm run dev` 또는 Vercel 미리보기 배포로 한다.

## 로그인 · 회원 영역 (실서비스 전환, 진행 중)

계획: `../yeonon-service-plan-v2.md`. Phase 7(후기·관리자 완성·약관·대기자 이전)까지 구현됨. 오픈 전 할 일: [`docs/launch-checklist.md`](docs/launch-checklist.md)

| 경로 | 내용 |
|---|---|
| `/login` | Google 로그인 (`?next=`로 돌아갈 곳 지정, 사이트 안 경로만 허용) |
| `/auth/google` → `/auth/callback` | Supabase OAuth 시작 / 세션 쿠키 발급 |
| `/auth/signout` | 로그아웃 (POST) |
| `/onboarding` | 첫 로그인 후 한 번: 역할(여행자/지기) + 필수 동의(약관·개인정보·만 18세) + 선택 동의(마케팅) |
| `/account` | 헤더 `My page` → 역할별 홈으로 이동 |
| `/account/delete` | 회원 탈퇴 (프로필·지기 신청·지기 프로필 함께 삭제) |
| `/account/consent` | 약관·개인정보처리방침 다시 동의 — 동의한 시행일이 `src/config/legal.ts`와 다르면 미들웨어가 이리로 보낸다 |
| `/app`, `/app/profile` | 여행자 홈(다가오는 만남·진행 중 요청·Find my route)·프로필 (영문) |
| `/app/discover` → `/app/discover/results` | AI 추천 입력(관심사 3~5개·날짜·시간대·인원·언어·분위기·자유 문장) → 결과(Perfect match / Closest matches, 일치율·추천 이유·가능 시간) |
| `/app/routes/[id]` | 여행자 영역 루트 상세. 추천 카드에서 오면 클릭 기록. 시간 칩 선택 → 인원·메모 → `Request this route`, 가격 `₩45,000 → ₩0 · Early member` |
| `/app/bookings`, `/app/bookings/[id]` | 내 예약 목록 / 상태 타임라인(실시간)·응답 기한·만남 안내·취소·만료·거절 시 `See other routes`(같은 조건의 /app/discover)·완료 후 후기(별점·코멘트·안전 문제 체크, 24시간 안 수정·삭제) |
| `/api/bookings/request`·`respond`·`cancel` | 예약 API (POST, JSON 또는 폼). 입력 검증 → DB 함수 → 오류 코드를 여행자 영문·지기 한글 문구로 |
| `/account/notifications` | 알림 목록·읽음 처리 (헤더 알림 종의 전체 보기) |
| `/app/messages`, `/app/messages/[id]` | 메시지 목록(상대 이름·마지막 메시지·안 읽은 수) / 대화(실시간·읽음 표시·번역·신고·차단, 예약 요약) (영문) |
| `/partner/messages`, `/partner/messages/[id]` | 같은 구성 (한글) |
| `/api/chat/send`·`read`·`report`·`block`·`translate` | 채팅 API (POST JSON). 번역은 LLM 키가 있을 때만 |
| `/api/cron/chat-unread-mail` | 안 읽은 메시지 메일 (GET, `CRON_SECRET` 필요 — DB 크론이 부름) |
| `/api/recommend` | 추천 API (POST, 로그인한 여행자만) |
| `/partner`, `/partner/apply` | 지기 홈(신청 상태 / 승인 후 새 요청 실시간·응답 기한 카운트다운·이번 주 만남)·지기 신청서 (한글) |
| `/partner/bookings`, `/partner/bookings/[id]` | 예약 목록 / 상세(수락·거절 사유·취소, 실시간)·완료 후 여행자 후기 (비공개) |
| `/partner/routes`, `/partner/routes/new`, `/partner/routes/[id]/edit` | 내 루트 목록·루트 빌더(기본 정보 → 코스 → 미리보기 → 검수 요청). 승인된 지기만 |
| `/partner/availability` | 주간 반복 시간·날짜별 예외·확정 방식(수락 후 확정/즉시 확정) → 앞으로 4주 슬롯 자동 생성 |
| `/admin` | 대시보드(기간: 오늘·7일·30일): 처리 대기 신고·안전 후기, 가입 수, 역할별 회원, 공개 루트, 요청·확정·완료·만료·취소·거절, 수락률·평균 응답 시간, AI 추천 → 요청 전환율, 후기, 대기자 명단 |
| `/admin/users`, `/admin/jigi-applications`, `/admin/routes` | 회원 관리(정지·메모)·지기 신청 심사·루트 검수(공개/수정 요청/비공개) (한글) |
| `/admin/recommendations` | 추천 로그(조건·결과·모델·지연·대체 여부·클릭·요청), 대체 비율, 임베딩 백필 |
| `/admin/bookings` | 상태별 예약 현황, 강제 취소(사유 → audit_log), 기한 만료·완료 [지금 처리] |
| `/admin/promotions` | 할인(할인율·대상·기간·사용 한도·켜고 끄기) + 예약 규칙(응답 기한·대기 요청 수 등) |
| `/admin/reports` | 안전 문제가 체크된 후기(확인 메모 → 확인 완료) + 채팅 신고 목록 → 상세 → [대화 열람](열람마다 audit_log) → 처리(문제없음·경고·정지) |
| `/admin/waitlist` | 대기자 명단: Google 시트 CSV 가져오기(중복 제거), 같은 이메일 가입 시 자동 연결·얼리 멤버, 초대 보냄 표시·삭제 |
| `/api/admin/export` | 관리자 목록 CSV 내보내기 (POST, 각 목록 화면의 [CSV 내보내기]). 민감 항목은 체크해야만 포함, 내보낼 때마다 audit_log |
| `/routes`, `/routes/[id]` | 공개 루트 둘러보기·상세 (누구나, 영문)·지기 평점·최근 후기(여행자 이름 첫 글자만). 공개 전 루트는 주인 지기·관리자에게만 미리보기로 보임 |

- **접근 규칙** (`src/middleware.ts`): 로그인 전 → `/login`, 온보딩 전 → `/onboarding`, 정지 → `/suspended`, 다른 역할의 영역 → 자기 홈. 관리자는 모든 영역에 들어갈 수 있다. 다른 사이트에서 보낸 폼 전송(POST)은 모두 거절한다.
- **키 설정**: `.env.example`을 `.env`로 복사해 Supabase 값을 채운다. 값이 비어 있으면 로그인 기능이 꺼지고 헤더의 Sign in도 보이지 않는다 (기존 사이트와 같은 화면).

### DB (Supabase)

`supabase/migrations/`의 SQL을 **파일 이름 순서대로** Supabase Dashboard → SQL Editor에 붙여넣어 실행한다. 여러 번 실행해도 된다.

1. `20261110000001_profiles.sql` — profiles, `is_admin()`, 가입 트리거 + 기존 가입자 백필, audit_log, admin_notes
2. `20261110000002_jigi.sql` — jigi_applications, jigi_application_notes(심사 메모), jigi_profiles, `review_jigi_application()`
3. `20261110000003_account.sql` — `complete_onboarding()`, `admin_set_user_status()`, `admin_set_user_memo()`, `delete_my_account()`
4. `20261110000004_routes.sql` — routes, route_stops, route_review_notes(검수 메모), public_jigis 뷰(지기 이름 일부만)
5. `20261110000005_availability_slots.sql` — availability_rules·availability_exceptions, slots, 슬롯 계산·갱신 함수
6. `20261110000006_route_functions.sql` — `save_route()`·`submit_route()`·`withdraw_route()`·`delete_route()`, `admin_review_route()`, `save_availability()`·예외 추가/삭제
7. `20261110000007_slots_cron.sql` — (선택) pg_cron으로 매일 00:05 KST에 4주 창을 앞으로 민다. Dashboard → Database → Extensions에서 pg_cron을 먼저 켠다
8. `20261110000008_route_embeddings.sql` — pgvector(`vector` 확장), routes.embedding(1024차원)·is_sample, `set_route_embedding()`, `match_routes()`
9. `20261110000009_recommendations.sql` — recommendation_requests, `save_recommendation()`, `record_recommendation_click()`
10. `20261110000010_bookings.sql` — booking_settings(예약 규칙 한 행), promotions(+얼리 멤버 100% 기본 1건, 가입 시 얼리 멤버 자동), bookings(슬롯당 활성 예약 1건 유니크 인덱스, 가격 스냅샷), notifications, 겹치는 슬롯 처리
11. `20261110000011_booking_functions.sql` — `request_booking()`·`respond_booking()`·`cancel_booking()`, `expire_pending_bookings()`·`complete_past_bookings()`, `booking_quote()`, `mark_notifications_read()`, 관리자 함수, 탈퇴 시 진행 중 예약 취소
12. `20261110000012_bookings_cron_realtime.sql` — pg_cron 5분마다 만료·완료 처리, Realtime publication에 bookings·notifications 추가
13. `20261110000013_chat.sql` — chat_settings(보관 기간 등 한 행), conversations, messages, message_reports, blocks, translation_requests, cron_hooks + 기존 예약의 대화방
14. `20261110000014_chat_safety.sql` — 연락처·외부 결제 유도 감지 규칙 `chat_safety_flags()` (규칙은 이 파일 한 곳)
15. `20261110000015_chat_functions.sql` — `request_booking()`(대화방 자동 생성), `send_message()`·`mark_read()`·`my_conversations()`·`conversation_info()`, 신고·차단, 관리자 열람·처리, 번역 사용량, 안 읽은 메일 후보, `purge_old_conversations()`
16. `20261110000016_chat_cron_realtime.sql` — pg_net, 보관 기간 삭제(매일), 안 읽은 메일 호출(5분), Realtime publication에 messages·conversations 추가
17. `20261110000017_reviews.sql` — review_settings, reviews, `save_review()`·`delete_review()`·`public_jigi_reviews()`·`admin_resolve_safety_review()`, 지기 지표 갱신(`refresh_jigi_metrics()` + 트리거 + 매일 크론), `match_routes()` 품질 점수 연결, 후기 요청 알림 문구
18. `20261110000018_waitlist.sql` — waitlist_imports, 가입 시 같은 이메일 연결·얼리 멤버 트리거, `admin_import_waitlist()`·초대 표시·삭제
19. `20261110000019_admin_legal_retention.sql` — 동의 버전(profiles.terms_version·privacy_version), `complete_onboarding()` 새 버전·`accept_legal_update()`, `admin_dashboard_stats()`, `admin_log_export()`, data_retention(보관 기간) + `purge_expired_records()` 매일 크론

⚠️ 17~19번은 **새 코드를 배포하기 전에** 실행한다 (새 코드는 profiles의 동의 버전 칸을 읽는다). 19번을 먼저 실행해도 지금 배포된 화면은 그대로 동작한다.

추천 테스트용 샘플(선택, 마이그레이션 뒤): `supabase/seed/recommend_sample.sql` → 테스트 후 `supabase/seed/recommend_sample_cleanup.sql`로 한 번에 삭제.

첫 관리자: 관리자 계정으로 한 번 로그인한 뒤 SQL Editor에서 `update public.profiles set role = 'admin' where email = 'yeonon.official2026@gmail.com';`

- 모든 테이블 RLS 사용. 역할·상태·동의 시각·심사 결과는 클라이언트가 직접 못 바꾸고 위 DB 함수로만 바뀐다 (함수가 권한 확인 + audit_log 기록).
- 지기 휴대폰 번호는 본인과 관리자만 볼 수 있다. 심사 메모·회원 메모는 관리자만 볼 수 있도록 별도 테이블에 둔다.
- 루트·정류장·가능 시간·슬롯도 DB 함수로만 쓴다. 공개·비공개 루트를 고치면 작성 중으로 돌아가 다시 검수를 받는다. 슬롯은 공개 루트마다 가능 시간 안에서 루트 소요 시간 간격으로 만들어지고(한국 시간), 요청·확정된 슬롯은 가능 시간을 바꿔도 남는다.
- 취향 id 목록은 `src/data/interests.ts` 한 곳에서 관리한다 (여행자 관심사·지기 취향·루트 태그 공용). DB의 `valid_interest_tags()`와 같아야 한다.
- **AI 추천** (`src/lib/recommend/`, `src/lib/ai/`, 설정 `src/config/recommend.ts`): 캐시(같은 조건 30분) → 시간당 10회 제한 → 쿼리 임베딩 → `match_routes` 상위 10개(태그 0.45 + 유사도 0.40 + 품질 0.15) → LLM이 최종 5개·영어 이유·perfect/close를 JSON으로 → 기록. LLM·임베딩 키가 없거나 LLM이 6초를 넘기거나 JSON이 아니면 점수 순서 + 템플릿 이유로 대체한다. LLM에는 취향 조건과 루트 공개 정보만 보내고, 자유 문장의 이메일·전화번호·링크는 지운다.
- **예약** (계획서 2-4·2-6): 요청·수락·거절·취소·만료·완료는 모두 DB 함수 하나(트랜잭션)로만 바뀐다. bookings는 클라이언트가 직접 insert/update 할 수 없다.
  - 동시 요청: 같은 지기의 예약 변경은 지기 행 잠금으로 줄을 세우고, 같은 슬롯은 유니크 인덱스가 한 번 더 막는다 → 두 사람이 동시에 눌러도 1명만 성공, 다른 사람은 '방금 마감' + 같은 루트의 다른 시간.
  - 한 슬롯이 요청·확정되면 같은 지기의 시간이 겹치는 다른 루트 슬롯은 내려가고, 예약이 풀리면 다시 생긴다.
  - 규칙 값(응답 기한 12시간 / 만남 24시간 이내면 2시간, 대기 요청 3건, 시작 2시간 전까지 요청, 24시간 이내 취소 기록, 기본 할인율)은 `booking_settings` 한 행 — /admin/promotions에서 바꾼다.
  - 결제는 없다. 예약에 정가·할인율·최종 가격·프로모션을 스냅샷으로 남긴다.
  - 메모·사유의 연락처(이메일·전화·링크·SNS 아이디)는 서버가 지운다. 여행자 이메일은 지기에게 보이지 않는다.
- **알림**: 사이트 알림(notifications)은 DB 함수가 받는 사람 언어로 만든다. 헤더 알림 종(Preact 아일랜드, `src/components/islands/`)이 Realtime으로 바로 보여 준다. 메일은 `RESEND_API_KEY`·`MAIL_FROM`·`SUPABASE_SERVICE_ROLE_KEY`가 모두 있을 때만 보낸다 (`src/lib/mail.ts`). 크론이 만든 알림(만료·완료)은 사이트 알림만 남는다.
- **실시간 RLS 확인**: Realtime(postgres_changes)은 구독자 토큰으로 bookings·notifications의 select 정책을 확인한 뒤에만 보낸다. 브라우저 2개(여행자 A·B)로 A가 요청할 때 B의 알림 종·예약 화면이 바뀌지 않는지, 지기 화면에는 바로 뜨는지 본다. 연결이 안 되면 화면은 30초마다 다시 읽는다.
- **채팅** (계획서 2-5): 예약마다 대화방 1개(매칭 요청 때 생성). 대기 중엔 '질문만' 안내, 거절·만료·취소되면 읽기만.
  - 메시지는 당사자만 읽고, send_message()로만 보낸다 (1~1000자, 1분 20개, 차단 시 양쪽 모두 불가). 보낸 메시지는 수정·삭제할 수 없다.
  - 연락처·외부 결제 유도로 보이면 보내지되 flagged + 양쪽 화면에 안전 안내. 감지 규칙은 `20261110000014_chat_safety.sql` 한 곳.
  - 관리자는 대화를 일반 조회할 수 없다. 신고 건만 /admin/reports에서 [대화 열람] → 열람마다 audit_log.
  - 보관: 만남 완료·취소 후 6개월(`chat_settings.retention_months`)이 지나면 매일 크론이 지운다 (처리 대기 신고가 있으면 남김).
  - 번역: `LLM_API_KEY`가 있을 때만 버튼이 보인다. 결과는 저장하지 않고, 사용자당 시간당 30회(`src/config/chat.ts`).
  - 안 읽은 메시지 메일: 10분 넘게 안 읽으면 대화당 1회(읽은 뒤 다시 쌓이면 다시 1회). 메일 키 + `CRON_SECRET` + cron_hooks 설정이 모두 있어야 동작한다. 메일에는 메시지 내용을 넣지 않는다.
- **후기·품질 지표** (Phase 7): 만남이 끝난(completed) 예약의 당사자만 예약당 1회, 작성 후 24시간(`review_settings.edit_hours`)까지 수정·삭제. 여행자 → 지기 후기만 공개(`public_jigi_reviews()`, 이름 첫 글자, 안전 체크 후기 제외). 안전 체크는 관리자 알림 + /admin/reports. 지기 평점·수락률·평균 응답 시간은 후기·응답·만료 때 트리거가 바로 갱신하고 매일 크론이 다시 계산한다. 추천 품질 점수 = 평점(후기 3개↑)·수락률·응답 속도(응답 3건↑) 가중 평균, 데이터가 없으면 0.5 (`src/config/recommend.ts`의 quality).
- **약관·동의 버전**: `src/config/legal.ts`의 `termsVersion`·`privacyVersion`(시행일)을 바꾸면 회원은 다음 접속 때 `/account/consent`에서 다시 동의한다. 사업자 정보 TODO도 이 파일에 모여 있다(화면에는 "확인 중").
- **보관 기간**: 채팅 6개월(`chat_settings`), 관리 기록·처리된 신고 3년, 추천 기록·알림·대기자 명단 12개월, 번역 사용 기록 2일(`data_retention`). 값을 바꾸면 `LEGAL.retention`과 개인정보처리방침도 같이 바꾼다.
- **렌더링**: 공개 페이지는 지금처럼 빌드 때 정적 HTML로 만들고, `export const prerender = false`인 페이지만 요청마다 서버에서 렌더링한다.
- **헤더 로그인 표시**: 정적 페이지는 브라우저의 Supabase 세션 쿠키 유무로 `Sign in` ↔ `My page`를 바꿔 보여 줄 뿐이고, 실제 접근 확인은 서버가 한다.

## 배포 (Vercel)

1. 이 폴더를 GitHub 저장소에 올린다.
2. vercel.com → **Add New Project** → 저장소 선택. Framework Preset은 **Astro**로 자동 인식된다.
   (Build Command `npm run build`. Vercel 어댑터가 `.vercel/output`을 만들므로 Output Directory는 따로 지정하지 않는다)
3. 배포 후 **Settings → Domains**에서 도메인 연결.
4. 도메인이 정해지면 Vercel 환경 변수 `SITE_URL`(예: `https://yeonon.xyz`)을 넣고 `src/config/site.ts`의 `url`을 바꾼 뒤 다시 배포한다. (canonical·OG URL, 폼 보안 검사 허용 주소에 쓰임. 비어 있으면 `https://yeonon.vercel.app`) — 바꿀 곳 전체 목록은 `docs/launch-checklist.md` 5번

CLI로 배포하려면: `npx vercel` (미리보기) → `npx vercel --prod` (프로덕션)

## 바꿔야 할 값은 한 곳에: `src/config/site.ts`

`TODO:`로 시작하는 값은 배포 전에 채워야 합니다.
설문 링크가 `TODO` 상태이면 버튼은 `#`로 렌더링되고 눌러도 이동하지 않습니다.

| 상수 | 설명 |
|---|---|
| `travelerFormUrl` / `jigiFormUrl` | 여행자·지기 외부 설문 링크. **현재 사이트 버튼에서는 쓰지 않음** (버튼은 앱 미리보기 페이지로 연결). 다시 쓰려면 `travelerForm()` / `jigiForm()`으로 UTM을 붙여 사용 |
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
| `og-image.png` | 공유 미리보기 이미지 1200×630 |

홈, `/travelers`, `/jigi` 히어로는 페이지를 열 때마다 순서가 무작위로 정해지는 사진 슬라이더입니다 (`src/components/HeroSlider.astro`, 목록과 대체 텍스트는 `src/data/heroSlides.ts`). 파일은 `public/images/hero/`의 `<번호>.webp`(1254px), `<번호>-800.webp`(모바일용)이며, 원본은 1:1 정사각형으로 준비합니다.

로고: 원본 `public/images/logo-power-symbol.png`에서 여백을 자르고 흰 배경을 투명 처리한 `public/images/logo.png`(495×96)를 씁니다 (`src/components/Logo.astro`). 파비콘 `public/favicon.png`·`apple-touch-icon.png`는 로고의 전원 심볼 부분입니다. 로고를 바꾸면 이 파일들을 교체하세요.

## 구조

```
src/
  components/  Header, Footer, Hero, Card, StepTimeline, FAQ, CTASection, StickyCTA,
               StatCard, MatchDiagram, SmartImage, SectionHeading, Button, Icon, Logo
  layouts/     BaseLayout.astro   (lang 속성, SEO·OG 메타, 폰트)
  pages/       index, travelers, jigi, privacy
  config/      site.ts            (모든 TODO 값·외부 링크·SHOW_PRICE)
  styles/      global.css         (색상 토큰, 공통 클래스)
public/
  images/
  favicon.png, apple-touch-icon.png
```

JS는 모바일 메뉴(Header), 탭 토글(홈 How it works 섹션)에만 사용합니다. FAQ는 `<details>` 기반이라 JS가 없습니다.

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
6. 로고 파일, 히어로 이미지 (OG 이미지 `public/images/og-image.png`는 Phase 7에서 만듦)
7. 사업자 정보·개인정보 보호책임자 등 `src/config/legal.ts`의 TODO (`docs/launch-checklist.md` 2번)
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
- 이 페이지는 모바일 하단 고정 CTA를 숨깁니다 (`BaseLayout`의 `sticky="none"`). 사이트의 모든 여행자 신청 버튼(`Join the early list`, `Join as a traveler`)이 이 페이지로 연결됩니다.
- 앱 결과 화면의 `Join the early list`는 같은 페이지 하단 대기자 등록 폼(`#waitlist`)으로 스크롤합니다.

## 지기 앱 미리보기 페이지 (`/app-preview-jigi`)

한국인 지기 지원자가 지기 앱을 직접 눌러 보는 데모입니다 (한국어, 청록 강조색). 사이트의 모든 지기 신청 버튼(`지기 지원하기`, `지기로 지원하기`)이 이 페이지로 연결됩니다.
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

> `apps-script/*.gs`는 로컬에만 두고 GitHub에는 올리지 않습니다(`.gitignore`). 새로 clone하면 이 파일이 없으니, 현재 Apps Script 프로젝트의 코드를 가져오세요.

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
