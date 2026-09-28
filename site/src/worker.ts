// Custom Worker entry: everything Astro serves, plus the scheduled job (cron trigger in wrangler.jsonc).
import { handle } from '@astrojs/cloudflare/handler';
import { runScheduled } from './lib/server/leads';
import type { AppEnv } from './lib/server/env';

export default {
  fetch: handle,
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runScheduled(env as unknown as AppEnv));
  },
} satisfies ExportedHandler<Env>;
