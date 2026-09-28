import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';
import { sha256Hex } from '../../lib/server/leads';
import { insertTestimonial, notifyTestimonial } from '../../lib/server/testimonials';
import { validateTestimonial } from '../../lib/validate';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 8; // lower than the trial form's: no legitimate reason for one visitor to submit many of these

/** POST /api/testimonial: capture first, notify Akhil second — same shape as /api/trial, just no idempotency
 * key (a duplicate testimonial is a minor annoyance, not a double-booking, so it doesn't need that machinery). */
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const env = getEnv();

  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ ok: false, error: 'forbidden' }, 403);
  if (Number(request.headers.get('content-length') ?? 0) > 20_000) return json({ ok: false, error: 'too-large' }, 413);

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ ok: false, error: 'bad-form' }, 400); }

  // Honeypot: bots fill the hidden field. Answer as if it worked so they learn nothing, and store nothing.
  if (String(form.get('website') ?? '').trim() !== '') return json({ ok: true });

  const v = validateTestimonial({
    name: form.get('name'), society: form.get('society'), occupation: form.get('occupation'),
    quote: form.get('quote'), consent: form.get('consent'),
  });
  if (!v.ok) return json({ ok: false, errors: v.errors }, 400);

  let ip = 'unknown';
  try { ip = clientAddress; } catch { /* dev without a proxy */ }
  const ipHash = (await sha256Hex(`${env.IP_HASH_SALT ?? 'dev'}:${ip}`)).slice(0, 32);
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM testimonials WHERE ip_hash = ? AND created_at > ?').bind(ipHash, since).first<{ n: number }>();
  if ((recent?.n ?? 0) >= RATE_MAX) return json({ ok: false, error: 'rate-limited' }, 429);

  let id: string;
  try {
    id = await insertTestimonial(env, { name: v.value.name, society: v.value.society, occupation: v.value.occupation, quote: v.value.quote, ipHash });
  } catch (e) {
    console.error('testimonial insert failed', e);
    return json({ ok: false, error: 'server' }, 500);
  }

  const work = notifyTestimonial(env, id).catch((e) => console.error('testimonial notify failed', id, e));
  if (locals.cfContext?.waitUntil) locals.cfContext.waitUntil(work); else await work;

  return json({ ok: true });
};

// Anything else is not part of the API.
export const ALL: APIRoute = () => json({ ok: false, error: 'method-not-allowed' }, 405);
