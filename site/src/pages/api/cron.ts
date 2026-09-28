import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';
import { runScheduled } from '../../lib/server/leads';

export const prerender = false;

/** Manual trigger for the scheduled job (same code the cron runs). Needs the CRON_SECRET header; used for testing/ops. */
export const POST: APIRoute = async ({ request, url }) => {
  const env = getEnv();
  if (!env.CRON_SECRET || request.headers.get('x-cron-secret') !== env.CRON_SECRET) return new Response('unauthorized', { status: 401 });
  // `?at=<ISO time>` lets us test the daytime-only reminder and the Monday heartbeat. Ignored outside local stub mode.
  const at = env.DEV_STUBS === '1' ? Date.parse(url.searchParams.get('at') ?? '') : NaN;
  return new Response(JSON.stringify(await runScheduled(env, Number.isNaN(at) ? {} : { nowMs: at })), { headers: { 'content-type': 'application/json' } });
};
