// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import vercel from '@astrojs/vercel';

// 서버가 믿어도 되는 접속 주소. Vercel은 실제 브라우저 주소를 x-forwarded-host로 넘기는데,
// 여기 없는 주소면 Astro가 무시해서 Astro.url이 https://localhost가 되고 폼 전송(CSRF 검사)·로그인 주소가 틀어진다.
// Astro 패턴은 '*'를 맨 앞에만 쓸 수 있어 yeonon-*-developm612s-projects.vercel.app 를 그대로 적을 수 없으므로,
// Vercel 빌드 때 주어지는 이 배포의 주소들 중 그 모양에 맞는 것만 정확한 이름으로 넣는다.
const PREVIEW_HOST = /^yeonon-[a-z0-9-]+-developm612s-projects\.vercel\.app$/;
const previewHosts = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL].filter(
  (host) => typeof host === 'string' && PREVIEW_HOST.test(host),
);
const allowedDomains = [
  { protocol: 'http', hostname: 'localhost', port: '4321' },
  { protocol: 'https', hostname: 'yeonon.vercel.app' },
  ...[...new Set(previewHosts)].map((hostname) => ({ protocol: 'https', hostname })),
];

export default defineConfig({
  // 공개 페이지는 정적 그대로, `export const prerender = false`인 페이지(로그인·회원 영역)만 서버에서 렌더링
  output: 'static',
  adapter: vercel(),
  // TODO: 도메인 확정 후 교체 (canonical / OG URL에 사용)
  site: 'https://yeonon.xyz',
  trailingSlash: 'ignore',
  // checkOrigin(다른 사이트의 폼 전송 차단)은 기본값 그대로 켜 둔다
  security: { checkOrigin: true, allowedDomains },
  vite: {
    plugins: [tailwindcss()],
  },
});
