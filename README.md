# 연온(YEONON) 앱

외국인 여행자와 성수동 현지 친구 '지기'를 연결하는 연온의 **바로 쓰는 앱**입니다 (yeonon.vercel.app).
서비스 설명과 대기자·설문은 **별도의 새 랜딩 사이트**가 맡고, 이 프로젝트는 들어오자마자 루트 목록이 보이는 앱만 남겼습니다 (`../yeonon-app-first-plan.md`).
Astro 5 + Tailwind CSS v4 + Supabase, Vercel 서버 렌더링. 디자인 시스템은 "성수 라인" (`yeonon-traveler-ui-plan.md`).

- 둘러보기(루트 피드·루트 상세)는 로그인 없이, 요청·채팅·루트 작성 같은 **행동을 할 때만 로그인**합니다.
- 상단 `Travelers | 지기` 탭은 어느 쪽 화면을 볼지 고르는 스위치입니다 (계정 역할은 바꾸지 않음, 마지막 탭을 쿠키 `yeonon_tab`에 기억).
- 모바일은 역할별 하단 탭바, 데스크톱은 상단 바 메뉴(여행자)·상단 바 아래 얇은 메뉴(지기)를 씁니다.

## 페이지

| 경로 | 내용 | 로그인 |
|---|---|---|
| `/` | Travelers 탭 = 루트 피드: 검색(`?q=`)·관심사 칩(`?tag=`)·For you 입구·가장 가까운 열린 시간 순·Load more(`?page=`). 로그인한 여행자에겐 다가오는 만남·답을 기다리는 요청 한 줄 | 필요 없음 |
| `/routes/[id]` | 루트 상세. 비로그인은 시간을 고르고 `Sign in to request` → 로그인 → 같은 화면(`?slot=`, 고른 시간 선택된 채로) | 필요 없음 (요청은 여행자) |
| `/for-you` → `/for-you/results` | AI 추천 입력 3단계 → 결과 | 여행자 |
| `/bookings`, `/bookings/[id]` | 내 예약 / 상세 | 여행자 |
| `/chats`, `/chats/[id]` | 채팅 목록 / 대화 | 여행자 |
| `/me` | 내 정보(프로필·알림·로그아웃·탈퇴·약관 링크) | 여행자 |
| `/partner` | 지기 탭: 비로그인 → 시작 화면, 여행자 계정 → 안내, 신청 전·심사 중 → 신청 상태, 승인 → 새 요청·이번 주 만남 | 필요 없음 (상태별) |
| `/partner/*` | 지기 앱 (아래 표) · `/partner/me` 지기 내 정보 | 지기 |
| `/admin/*` | 관리자 (아래 표) | 관리자 |
| `/switch?to=travelers\|jigi` | 상단 탭 전환 (쿠키 기억 후 그 탭 첫 화면으로) | — |
| `/privacy`, `/terms` | 개인정보처리방침·이용약관 (앱 쪽이 정본, 랜딩은 링크만) | — |
| `/404`, `/500` | 없는 주소 / 서버 오류 | — |

**옛 주소는 301로 이동** (`src/data/paths.ts`의 `legacyRedirect`, `src/middleware.ts`) — 이미 보낸 알림·메일·공유 링크가 깨지지 않게:
`/app` → `/`, `/app/discover(/results)` → `/for-you(/results)`, `/app/bookings/*` → `/bookings/*`, `/app/messages/*` → `/chats/*`, `/app/profile` → `/me`, `/app/routes/[id]` → `/routes/[id]`, `/routes` → `/`, `/jigi` → `/partner`,
`/travelers`·`/how-it-works`·`/app-preview`·`/app-preview-jigi` → 새 랜딩 사이트(주소가 정해지기 전에는 `/`). DB 함수가 만든 알림 링크(`/app/bookings/…`)도 이 이동으로 새 주소에 닿는다.

## 로컬 실행 · 빌드

Node.js 18.20 이상 (20+ 권장)

```bash
npm install        # 의존성 설치
npm run dev        # 개발 서버 → http://localhost:4321
npm run build      # 빌드 → .vercel/output/ (공개 페이지는 정적 HTML, 로그인 영역은 서버 함수)
```

Vercel 어댑터를 쓰므로 `npm run preview`는 지원되지 않는다. 확인은 `npm run dev` 또는 Vercel 미리보기 배포로 한다.

## 로그인 · 회원 영역

계획: `../yeonon-service-plan-v2.md`. Phase 7(후기·관리자 완성·약관·대기자 이전)까지 구현됨. 오픈 전 할 일: [`docs/launch-checklist.md`](docs/launch-checklist.md)

| 경로 | 내용 |
|---|---|
| `/login` | Google 로그인 (`?next=`로 돌아갈 곳 지정, 사이트 안 경로만 허용) |
| `/auth/google` → `/auth/callback` | Supabase OAuth 시작 / 세션 쿠키 발급 |
| `/auth/signout` | 로그아웃 (POST) |
| `/onboarding` | 첫 로그인 후 한 번: 역할(여행자/지기) + 필수 동의(약관·개인정보·만 18세) + 선택 동의(마케팅) |
| `/account` | 역할별 홈으로 이동 (여행자 `/`, 지기 `/partner`, 관리자 `/admin`) |
| `/account/delete` | 회원 탈퇴 (프로필·지기 신청·지기 프로필 함께 삭제) |
| `/account/consent` | 약관·개인정보처리방침 다시 동의 — 동의한 시행일이 `src/config/legal.ts`와 다르면 미들웨어가 이리로 보낸다 |
| `/for-you` → `/for-you/results` | AI 추천 입력(관심사 3~5개·날짜·시간대·인원·언어·분위기·자유 문장) → 결과(Perfect match / Closest matches, 일치율·추천 이유·가능 시간) |
| `/routes/[id]` | 루트 상세(누구나). 추천 카드에서 오면 클릭 기록. 여행자는 시간 칩 → 인원·메모 → `Request this route`, 가격 `₩45,000 → ₩0 · Early member`. 공개 전 루트는 주인 지기·관리자에게만 미리보기 |
| `/bookings`, `/bookings/[id]` | 내 예약 목록 / 상태 타임라인(실시간)·응답 기한·만남 안내·취소·만료·거절 시 `See other routes`(같은 조건의 /for-you)·완료 후 후기(별점·코멘트·안전 문제 체크, 24시간 안 수정·삭제) |
| `/api/bookings/request`·`respond`·`cancel` | 예약 API (POST, JSON 또는 폼). 입력 검증 → DB 함수 → 오류 코드를 여행자 영문·지기 한글 문구로 |
| `/account/notifications` | 알림 목록·읽음 처리 (헤더 알림 종의 전체 보기) |
| `/chats`, `/chats/[id]` | 메시지 목록(상대 이름·마지막 메시지·안 읽은 수) / 대화(실시간·읽음 표시·번역·신고·차단, 예약 요약) (영문) |
| `/partner/messages`, `/partner/messages/[id]` | 같은 구성 (한글) |
| `/api/chat/send`·`read`·`report`·`block`·`translate` | 채팅 API (POST JSON). 번역은 LLM 키가 있을 때만 |
| `/api/cron/chat-unread-mail` | 안 읽은 메시지 메일 (GET, `CRON_SECRET` 필요 — DB 크론이 부름) |
| `/api/recommend` | 추천 API (POST, 로그인한 여행자만) |
| `/partner`, `/partner/apply`, `/partner/me` | 지기 탭(비로그인 시작 화면 / 신청 상태 / 승인 후 새 요청 실시간·응답 기한 카운트다운·이번 주 만남)·지기 신청서·지기 내 정보 (한글) |
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

- **접근 규칙** (`src/middleware.ts`): `/`, `/routes/*`, `/partner`(시작 화면)는 로그인 없이 열린다. 그 밖의 회원 영역은 로그인 전 → `/login`, 온보딩 전 → `/onboarding`, 정지 → `/suspended`, 다른 역할의 영역 → 자기 홈. 관리자는 모든 영역에 들어갈 수 있다. 다른 사이트에서 보낸 폼 전송(POST)은 모두 거절한다.
- **키 설정**: `.env.example`을 `.env`로 복사해 Supabase 값을 채운다. 값이 비어 있으면 로그인 기능이 꺼지고 상단 바의 Sign in도 보이지 않는다.

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

## 바꿔야 할 값: `src/config/site.ts`, 환경 변수

| 값 | 설명 |
|---|---|
| `SITE.landingUrl` | 새 랜딩 사이트 주소. `TODO`인 동안은 랜딩 링크(About YEONON·자세히 알아보기·Get updates)를 숨기고, 옛 설명 주소는 `/`로 보낸다. 정하면 이 한 줄만 바꾸고 다시 배포 |
| `SITE.contactEmail`, `SITE.operator` | 문의 이메일, 운영 주체명 (앱 하단 작은 링크 줄·약관·개인정보) |
| `PUBLIC_APP_OPEN` | 앱 오픈 스위치 (`.env.example`). 오픈 전에도 피드·루트 상세는 공개, 차이는 검색 노출 — `true`일 때만 `/`와 `/routes/[id]`가 검색에 허용된다 |

랜딩 사이트 쪽 버튼은 앱으로 연결한다: 여행자 → `https://<앱 주소>/?utm_source=landing`, 지기 → `https://<앱 주소>/partner?utm_source=landing`.
앱에서 랜딩으로 가는 링크에는 `utm_source=app`이 붙는다.

## 이미지

| 파일 | 위치 |
|---|---|
| `public/images/og-image.png` | 공유 미리보기 이미지 1200×630 |
| `public/images/logo.png` | 로고 (`src/components/Logo.astro`). 파비콘 `public/favicon.png`·`apple-touch-icon.png`는 로고의 전원 심볼 |

루트 사진은 Supabase Storage `route-photos` 버킷 (마이그레이션 20번, 지기가 루트 빌더에서 올림).

## 구조

```
src/
  components/ui/      AppTopBar(상단 바), TabBar(모바일 하단 탭, 여행자·지기), AppFootnote(작은 링크 줄),
                      RouteRow(피드 한 줄), RouteCard, RouteLine, RoutePhoto, BottomSheet, StatusBadge, UiButton, EmptyState …
  components/partner/ PartnerStart(지기 탭 시작 화면)
  data/paths.ts       새 주소·옛 주소 301 규칙
  data/accountNav.ts  여행자·지기 메뉴 (하단 탭바와 데스크톱 메뉴가 같이 씀)
  layouts/BaseLayout  SEO·OG 메타, 폰트, 상단 바·하단 탭바
  lib/routeCards.ts   루트 피드 (검색·관심사·가장 가까운 열린 시간 순)
  config/site.ts      랜딩 주소·연락처
  styles/global.css   색 토큰 (성수 라인은 .ui-traveler 범위)
```

### 디자인 메모
- 여행자 화면(`/`, `/routes/*`, `/for-you`, `/bookings`, `/chats`, `/me`)은 "성수 라인" 토큰(`.ui-traveler`): 제목 Bricolage Grotesque, 본문 Pretendard 17px, 배경 Concrete, 행동은 ON Blue, 루트 라인은 2호선 초록.
- 지기·관리자 화면은 기존 토큰 (`brand` 네이비, `jigi` 시안). 한글 블록은 `word-break: keep-all`.

## 성능
공개 화면 캐시(피드·루트 상세는 비로그인 기준 HTML을 CDN에 60초, 로그인 상태는 브라우저가 `/api/session`·`/fragments/*`로),
서울 리전, 글꼴·이미지·스크립트 정리, Lighthouse 전·후 측정(`npm run lh`) — `docs/performance.md`.

## 배포 전 체크

- [x] 375 / 768 / 1280px 가로 스크롤 없음 (헤드리스 브라우저로 확인)
- [x] 설명 문단·대기자 폼·Apps Script 호출 없음 (`yeonon-app-first-plan.md` A3·A5)
- [x] 옛 주소 301 이동
- [ ] Lighthouse 모바일 성능·접근성 90+ (배포 후 측정)
- [ ] 새 랜딩 주소(`SITE.landingUrl`)·도메인 정하기

## 사람이 직접 채울 것 (TODO)

1. 새 랜딩 사이트 주소 → `src/config/site.ts`의 `landingUrl`
2. 도메인 (앱·랜딩을 어떻게 나눌지) → `SITE_URL`
3. 사업자 정보·개인정보 보호책임자 등 `src/config/legal.ts`의 TODO (`docs/launch-checklist.md` 2번)
4. 오픈할 때 Vercel 환경 변수 `PUBLIC_APP_OPEN=true` (다시 배포)
