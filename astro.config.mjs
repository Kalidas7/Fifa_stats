// @ts-check
import { defineConfig } from 'astro/config';

// FootStats — FIFA World Cup 2026 stats site.
//
// Static output so it deploys on ANY free tier (Cloudflare Pages / Vercel / Netlify /
// GitHub Pages). The build is base-path-agnostic: internal links are built with
// import.meta.env.BASE_URL (see src/lib/url.ts), so deploying to a GitHub Pages *project*
// site under a sub-path won't break links — just set BASE_PATH at build time.
//
//   SITE_URL=https://you.example   BASE_PATH=/FootStats/   npm run build
//
export default defineConfig({
  site: process.env.SITE_URL || 'https://footstats.example',
  base: process.env.BASE_PATH || '/',
  output: 'static',
  trailingSlash: 'ignore',
  build: {
    // Emit /match/123/index.html so routes work without a server rewrite layer.
    format: 'directory',
  },
});
