-- =====================================================================
-- Phase 6-2. 채팅 안전 감지 규칙 — 규칙은 이 파일 한 곳에만 둔다.
-- 13번 실행 후에 실행한다. 여러 번 실행해도 된다. 규칙을 바꾸면 이 파일만 고쳐 다시 실행한다.
--
-- chat_safety_flags(본문) → 걸린 이유 목록 (없으면 빈 배열)
--   'contact' : 이메일·전화번호·메신저 ID·SNS 아이디·외부 링크
--   'payment' : 앱 밖 결제·송금 유도
-- 걸려도 메시지는 보내진다. send_message()가 flagged = true 로 저장하고, 화면은 양쪽에 안전 안내를 보여 준다.
-- 관리자는 신고된 대화를 볼 때 이 표시를 함께 본다. (오탐이 있을 수 있으니 차단·삭제에는 쓰지 않는다)
-- =====================================================================

create or replace function public.chat_safety_flags(p_body text)
returns text[]
language sql
immutable
set search_path = ''
as $$
  with t as (select lower(coalesce(p_body, '')) as b)
  select array_remove(array[
    case when
      -- 이메일
      b ~ '[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}'
      -- 한국 휴대폰 (010-1234-5678, 010 1234 5678, 01012345678)
      or b ~ '01[016789][\s.-]?[0-9]{3,4}[\s.-]?[0-9]{4}'
      -- 국제 번호 (+82 10 1234 5678, +1-555-123-4567)
      or b ~ '\+[0-9]{1,3}[\s.-]?[0-9]{1,4}([\s.-]?[0-9]{2,4}){2,4}'
      -- 구분 없이 9자리 이상 숫자
      or b ~ '[0-9]{9,}'
      -- 메신저·SNS (이름 + 아이디/주소를 알려 주는 표현)
      or b ~ '(kakao\s*(talk|id)|카톡|카카오\s*톡|카카오\s*(아이디|id)|open\.kakao|line\s*(id|app)|라인\s*(아이디|id)|whats\s*app|왓츠\s*앱|telegram|텔레그램|t\.me/|wa\.me/|wechat|weixin|위챗|instagram|인스타\s*(그램|아이디|id)?|insta\s*[:@]|\mig\s*[:@]|snapchat|스냅챗|discord|디스코드)'
      -- @아이디
      or b ~ '(^|[\s(])@[a-z0-9_.]{3,}'
      -- 외부 링크
      or b ~ '(https?://|www\.)'
    then 'contact' end,
    case when
      b ~ '(paypal|페이팔|venmo|zelle|cash\s*app|western\s*union|wise\.com|revolut|bank\s*transfer|wire\s*transfer|pay\s*(me\s*)?(directly|outside|in\s*cash)|\mcash\M|계좌|송금|입금|이체|현금|토스\s*(로|으로|송금|아이디)|카카오\s*페이|카카오페이|kakao\s*pay|네이버\s*페이|직거래|따로\s*(결제|돈))'
    then 'payment' end
  ], null)
  from t
$$;

revoke execute on function public.chat_safety_flags(text) from public, anon, authenticated;
