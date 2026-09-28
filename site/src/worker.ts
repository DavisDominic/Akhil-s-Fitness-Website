// Custom Worker entry: everything Astro serves, plus the scheduled job (cron trigger in wrangler.jsonc).
import { handle } from '@astrojs/cloudflare/handler';
import { runScheduled } from './lib/server/leads';
import { retryFailedTestimonials } from './lib/server/testimonials';
import type { AppEnv } from './lib/server/env';

export default {
  fetch: handle,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    const e = env as unknown as AppEnv;
    ctx.waitUntil(Promise.all([runScheduled(e), retryFailedTestimonials(e)]));
  },
} satisfies ExportedHandler<Env>;
