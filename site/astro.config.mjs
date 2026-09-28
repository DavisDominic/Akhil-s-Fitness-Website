// @ts-check
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import tailwindcss from '@tailwindcss/vite';

// Placeholder until the real domain is bought (see docs/PRD_v1.2_Addendum.md D8).
export default defineConfig({
  site: 'https://akhil-fitness.workers.dev',
  // No sessions: the site has no logins. (Also avoids the KV binding and an Astro virtual-module
  // bug with the apostrophe in this folder's path.)
  session: false,
  adapter: cloudflare({ imageService: 'passthrough' }),
  vite: { plugins: [tailwindcss()] },
});
