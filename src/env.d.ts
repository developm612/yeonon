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
    supabase?: import('@supabase/supabase-js').SupabaseClient;
  }
}
