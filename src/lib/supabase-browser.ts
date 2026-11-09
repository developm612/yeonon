/**
 * Supabase 브라우저 클라이언트 — 채팅·실시간 알림처럼 브라우저에서 직접 구독할 때만 쓴다 (Phase 5~6).
 * 세션은 서버와 같은 쿠키를 공유한다. 공개 페이지에서는 불러오지 않는다 (번들 크기).
 */
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

let client: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  client ??= createBrowserClient(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_ANON_KEY);
  return client;
}
