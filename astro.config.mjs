// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  output: 'static',
  // TODO: 도메인 확정 후 교체 (canonical / OG URL에 사용)
  site: 'https://yeonon.xyz',
  trailingSlash: 'ignore',
  vite: {
    plugins: [tailwindcss()],
  },
});
