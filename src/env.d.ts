/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly PUBLIC_SUPABASE_URL: string;
  readonly PUBLIC_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare namespace App {
  interface Locals {
    /** 로그인한 사용자 (서버 렌더링 페이지에서만 채워진다) */
    user: import('@supabase/supabase-js').User | null;
    /** 로그인한 사용자의 profiles 행 (없으면 null — 마이그레이션 전이거나 트리거 실패) */
    profile: import('./lib/profile').Profile | null;
    supabase?: import('@supabase/supabase-js').SupabaseClient;
  }
}
