// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

export default defineConfig({
  // 공개 페이지는 정적 그대로, `export const prerender = false`인 페이지(로그인·회원 영역)만 서버에서 렌더링
  output: 'static',
  adapter: vercel(),
  // TODO: 도메인 확정 후 교체 (canonical / OG URL에 사용)
  site: 'https://yeonon.xyz',
  trailingSlash: 'ignore',
  vite: {
    plugins: [tailwindcss()],
  },
});
