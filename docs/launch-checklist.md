# 연온 오픈 전 체크리스트 (사람이 직접 할 일)

계획서 `yeonon-service-plan-v2.md` 10장(오픈 전 필수 체크) 기준. 위에서부터 순서대로 하면 된다.
SQL은 Supabase Dashboard → SQL Editor에서 실행한다. ⚠️ 표시는 되돌릴 수 없는 작업이다.

---

## 1. 법률 검토 (가장 먼저)

- [ ] **관광진흥법 검토**: 지기가 루트(일정표)를 올리고 여행자가 골라 요청하는 구조가 '여행업(여행 상품 판매·알선)'에 해당하는지 멘토·전문가에게 확인한다. 무료여도 판단에 영향이 있을 수 있다.
  - 결과에 따라 고칠 곳: 화면 문구(예약 → 만남 요청), 루트 표현, 지기 역할 범위, 약관 제1·2조(`src/pages/terms.astro`)
- [ ] **이용약관 전문가 검토** (`/terms`, `src/pages/terms.astro`): 서비스 성격, 책임 범위(제15조), 할인 종료 고지(제10조), 정지·탈퇴, 관할 법원
- [ ] **개인정보처리방침 전문가 검토** (`/privacy`, `src/pages/privacy.astro`)
  - 국외 이전 고지(이전 일시·방법·거부 방법), 처리 위탁 표의 TODO 칸
  - 온보딩 동의 화면(`/onboarding`)에 필수 동의의 수집 항목·목적·보관 기간 요약을 따로 보여 줘야 하는지 (지금은 방침 링크만)
  - 「통신비밀보호법」 접속 기록 보관 의무 적용 여부
- [ ] 검토 결과를 반영한 뒤 `src/config/legal.ts`의 `termsVersion`·`privacyVersion`을 **실제 시행일**로 바꾸고 `history`에 한 줄 더한다.
  → 이미 가입한 회원은 다음 접속 때 `/account/consent`에서 다시 동의한다.
- [ ] 할인 표시: 루트 정가가 **실제로 받을 계획이 있는 가격**인지 확인 (부풀린 정가 + 100% 할인은 광고 문제 소지)

## 2. `src/config/legal.ts` TODO 채우기

- [ ] `business.representative` 대표자 이름
- [ ] `business.registrationNumber` 사업자등록번호
- [ ] `business.address` 사업장 주소
- [ ] `business.phone` 대표 전화번호
- [ ] `privacyOfficer.name`·`title`·`phone` 개인정보 보호책임자
- [ ] `court` 관할 법원
- [ ] `processors[].retention`·`transfer` 업체별 보관 기간·이전 일시·방법 (각 업체 DPA·약관 확인)
- [ ] 개인정보처리방침의 '원본 Google 시트 삭제 시점', '권리 요청 처리 기한'
- [ ] `src/config/site.ts`의 남은 TODO (`url`, 설문 링크, `retentionPeriod`)

TODO 값은 화면에 "확인 중 / To be confirmed"로 보인다. 모두 채운 뒤 다시 배포한다.

## 3. 테스트 데이터 정리

- [ ] ⚠️ **추천 샘플 데이터 삭제**: `supabase/seed/recommend_sample_cleanup.sql` 실행 (샘플 지기 계정·루트·슬롯과 그 루트의 예약이 함께 지워진다)
- [ ] **테스트 계정 확인**: 먼저 목록을 본다.
  ```sql
  select id, email, role, status, created_at from public.profiles order by created_at;
  ```
- [ ] ⚠️ **테스트 계정 삭제**: 남길 계정(관리자 등)을 빼고 지운다. 계정을 지우면 그 계정의 프로필·지기 신청·루트·예약·대화·후기·알림이 함께 지워진다.
  ```sql
  delete from auth.users where email in ('test-a@example.com', 'test-b@example.com');  -- 실제 테스트 이메일로 바꿔서
  ```
- [ ] 남은 테스트 기록 확인 (0이어야 정상, 아니면 내용을 보고 정리)
  ```sql
  select
    (select count(*) from public.bookings) as bookings,
    (select count(*) from public.reviews) as reviews,
    (select count(*) from public.message_reports) as reports,
    (select count(*) from public.recommendation_requests) as recommendations,
    (select count(*) from public.waitlist_imports) as waitlist;
  ```
- [ ] 테스트 중 바꾼 규칙 값을 되돌렸는지 확인 (예: 응답 기한을 3분으로 줄였다면)
  ```sql
  select * from public.booking_settings;  -- 기본: respond_minutes 720, urgent_respond_minutes 120
  select * from public.chat_settings;     -- 기본: retention_months 6
  select * from public.data_retention;
  ```
- [ ] 관리 기록(audit_log)은 남겨 둔다 (테스트 기록이 섞여도 무방, 3년 뒤 자동 삭제)

## 4. Google 로그인

- [ ] Google Cloud Console → OAuth 동의 화면 → **앱 게시(프로덕션)**. '테스트' 상태에서는 등록한 테스트 사용자만 로그인된다.
- [ ] 동의 화면의 앱 정보: 앱 이름, 지원 이메일, 로고, **홈페이지·개인정보처리방침(`/privacy`)·서비스 약관(`/terms`) 주소**, 승인된 도메인
- [ ] scope는 `openid`, `email`, `profile`만 (민감 scope가 없으면 Google 검수 없이 게시된다)

## 5. 도메인 연결 시 바꿀 곳

- [ ] Vercel → Settings → Domains에 도메인 추가 (www와 맨 도메인 중 하나로 리디렉트)
- [ ] Vercel 환경 변수 **`SITE_URL`** = `https://<도메인>` → 다시 배포 (canonical·OG 이미지 주소, 폼 보안 검사의 허용 주소가 함께 바뀐다 — `astro.config.mjs`). www도 쓰면 리디렉트로 하나만 남긴다.
- [ ] `src/config/site.ts`의 `url`
- [ ] Supabase → Authentication → URL Configuration: **Site URL**을 새 도메인으로, **Redirect URLs**에 `https://<도메인>/auth/callback` 추가 (기존 vercel.app 주소는 정리 전까지 둔다)
- [ ] Google Cloud OAuth: 승인된 도메인, 동의 화면의 홈페이지·방침·약관 주소 (리디렉션 URI는 Supabase 주소라 그대로)
- [ ] Resend: 보내는 도메인 인증(DNS) → `MAIL_FROM` = `YEONON <hello@<도메인>>`
- [ ] 안 읽은 채팅 메일 크론 주소 (SQL)
  ```sql
  update public.cron_hooks set url = 'https://<도메인>/api/cron/chat-unread-mail', updated_at = now() where name = 'chat_unread_mail';
  ```
- [ ] 문의 메일 주소를 도메인 메일로 바꾼다면 `src/config/site.ts`의 `contactEmail`

## 6. 키·환경 변수 (Vercel → Settings → Environment Variables → Production)

- [ ] **`PUBLIC_MEMBER_UI=true`** → **다시 배포** (PUBLIC_ 값은 빌드 때 들어간다)
  - 바뀌는 것: 헤더 Sign in/My page 표시, 공개 페이지 버튼이 'Find my route'·'Google로 시작하고 지원하기'(로그인 흐름)로, 앱 미리보기 하단 폼 → 로그인 안내, `/routes` 공개·검색 노출, 푸터 문구
- [ ] AI: `LLM_API_KEY`, `LLM_MODEL`, `EMBEDDING_API_KEY`, `EMBEDDING_MODEL` → 배포 후 `/admin/recommendations` [임베딩 백필]
- [ ] AI 업체 콘솔에서 **월 사용 한도·예산 알림** 설정
- [ ] 메일: `RESEND_API_KEY`, `MAIL_FROM`, `SUPABASE_SERVICE_ROLE_KEY`
- [ ] 안 읽은 채팅 메일: `CRON_SECRET`(16자 이상 임의 문자열) + SQL
  ```sql
  insert into public.cron_hooks (name, url, secret)
  values ('chat_unread_mail', 'https://<사이트 주소>/api/cron/chat-unread-mail', '<CRON_SECRET과 같은 값>')
  on conflict (name) do update set url = excluded.url, secret = excluded.secret, updated_at = now();
  ```
- [ ] 서버 전용 키에 `PUBLIC_`이 붙지 않았는지, Preview 환경에 운영 키를 넣지 않았는지 확인

## 7. Supabase 점검

- [ ] Dashboard → **Advisors → Security Advisor**: 경고 0건 목표. 알려진 항목:
  - `public_jigis` 뷰가 security definer 뷰로 표시될 수 있다 (지기 공개 정보만 내보내도록 일부러 만든 뷰). 유지할지, 함수로 바꿀지 결정한다.
- [ ] **Performance Advisor** 확인 (인덱스 제안 등)
- [ ] Database → Extensions: `vector`, `pg_cron`, `pg_net` 켜짐
- [ ] Integrations → Cron: 작업 7개가 성공하는지 (`yeonon-refresh-slots`, `yeonon-expire-bookings`, `yeonon-complete-bookings`, `yeonon-purge-conversations`, `yeonon-chat-unread-mail`, `yeonon-refresh-jigi-metrics`, `yeonon-purge-expired-records` — 메일을 안 켰으면 unread-mail은 아무 일도 하지 않는다)
  ```sql
  select jobname, schedule, active from cron.job order by jobname;
  ```
- [ ] Database → Publications → `supabase_realtime`에 bookings, notifications, messages, conversations
- [ ] Authentication → Providers: Google만 켜져 있는지 (이메일 가입 끔)
- [ ] 첫 관리자 지정 확인: `select email, role from public.profiles where role = 'admin';`

## 8. 백업

- [ ] 요금제의 자동 백업 확인 (무료 플랜은 자동 백업·시점 복구가 없다 → 정식 운영 전 Pro 검토)
- [ ] 오픈 직전 수동 백업: Database → Backups, 또는 `pg_dump` (Project Settings → Database의 연결 문자열 사용)
- [ ] Google 시트(Waitlist·Jigi) 전체를 CSV로 내려받아 안전한 곳에 보관

## 9. 대기자 명단 이전

- [ ] Google 시트 Waitlist·Jigi 탭을 각각 CSV로 내려받는다 (파일 → 다운로드 → .csv)
- [ ] `/admin/waitlist`에서 탭을 골라 올린다 (같은 파일을 다시 올려도 중복은 들어가지 않는다)
- [ ] 초대 메일·메시지는 직접 보내고, 보낸 사람은 [초대 보냄 표시] (자동 가입은 하지 않는다)
- [ ] 같은 이메일로 가입하면 자동으로 연결되고 얼리 멤버가 된다. ※ 지금은 모든 가입자가 얼리 멤버다(`profiles.early_member` 기본값 true). 대기자만 얼리 멤버로 하려면 기본값을 바꾼다:
  ```sql
  alter table public.profiles alter column early_member set default false;
  ```
- [ ] 이전이 끝나고 2주 뒤 Apps Script 웹앱 배포 중지, 시트는 정한 보관 기간 뒤 삭제 (방침에 적은 날짜와 맞춘다)

## 10. 마지막 확인 (실제 사이트에서)

- [ ] 새 Google 계정으로 가입 → 온보딩 동의 → 여행자 추천 → 요청 → 지기 수락 → 채팅 → (만남 시간 뒤) 완료 → 양쪽 후기
- [ ] 비로그인으로 `/routes/[id]`에서 평점·후기가 보이고, 이메일·연락처가 어디에도 보이지 않는지
- [ ] `/terms`, `/privacy` 한국어·영문 전환, TODO가 남아 있지 않은지 ("확인 중" 검색)
- [ ] 없는 주소 → 404 화면
- [ ] 공유 미리보기(OG): 카카오톡·슬랙에 주소를 붙여 이미지·제목 확인 (카카오는 developers.kakao.com 공유 디버거로 캐시 초기화)
- [ ] 375px·1280px 화면, Lighthouse 모바일 성능·접근성 90+
- [ ] 회원 영역(`/app`, `/partner`, `/admin`, `/account`, `/login`)이 검색엔진에 노출되지 않는지 (응답 헤더 `X-Robots-Tag: noindex`)
- [ ] 긴급 상황 안내·신고 방법이 화면(후기·채팅·약관)에 보이는지
- [ ] 요금제 재검토: Vercel Hobby는 원칙적으로 비상업용, Supabase 무료 플랜은 7일 무활동 시 일시정지 → 정식 운영 전 유료 전환 검토
