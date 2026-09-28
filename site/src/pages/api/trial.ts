import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';
import { getLead, insertLead, notifyLead, sha256Hex } from '../../lib/server/leads';
import { UUID_RE, cleanSociety, cleanSource, validateTrial } from '../../lib/validate';
import { site } from '../../data/site';

export const prerender = false;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 15; // generous on purpose: many phones share one IP (carrier NAT, society Wi-Fi) and a lost lead costs more than a spam row

/**
 * POST /api/trial: capture first, notify second (PRD §48.1).
 * The response goes out as soon as the lead is stored; Telegram + Sheet run afterwards and are retried by the cron.
 */
export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  const env = getEnv();

  // Same-origin only (JSON requests aren't covered by Astro's built-in form CSRF check).
  const origin = request.headers.get('origin');
  if (origin && new URL(origin).host !== new URL(request.url).host) return json({ ok: false, error: 'forbidden' }, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return json({ ok: false, error: 'unsupported' }, 415);
  if (Number(request.headers.get('content-length') ?? 0) > 10_000) return json({ ok: false, error: 'too-large' }, 413);

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad-json' }, 400); }

  // Honeypot: bots fill the hidden field. Answer as if it worked so they learn nothing, and store nothing.
  if (String(body.website ?? '').trim() !== '') return json({ ok: true, leadType: 'trial', name: 'there' });

  const v = validateTrial(body as never);
  if (!v.ok) return json({ ok: false, errors: v.errors }, 400);
  const key = String(body.idempotencyKey ?? '');
  if (!UUID_RE.test(key)) return json({ ok: false, error: 'bad-key' }, 400);

  // Duplicate protection: the same form session, or the same number within 10 minutes, never creates a second lead.
  const byKey = await env.DB.prepare('SELECT id FROM leads WHERE idempotency_key = ?').bind(key).first<{ id: string }>();
  const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
  const byNumber = byKey ? null : await env.DB.prepare('SELECT id FROM leads WHERE whatsapp_e164 = ? AND created_at > ?').bind(v.value.whatsappE164, since).first<{ id: string }>();
  const existing = byKey ?? byNumber;
  const leadType = site.availability === 'full' ? 'waitlist' : 'trial';
  const first = v.value.name.split(' ')[0];
  if (existing) return json({ ok: true, duplicate: true, leadType, name: first });

  // Rate limit per (salted, hashed) IP. The raw address is never stored.
  let ip = 'unknown';
  try { ip = clientAddress; } catch { /* dev without a proxy */ }
  const ipHash = (await sha256Hex(`${env.IP_HASH_SALT ?? 'dev'}:${ip}`)).slice(0, 32);
  const recent = await env.DB.prepare('SELECT COUNT(*) AS n FROM leads WHERE ip_hash = ? AND created_at > ?').bind(ipHash, since).first<{ n: number }>();
  if ((recent?.n ?? 0) >= RATE_MAX) return json({ ok: false, error: 'rate-limited' }, 429);

  let id: string;
  try {
    id = await insertLead(env, {
      leadType,
      name: v.value.name,
      whatsappE164: v.value.whatsappE164,
      society: v.value.society,
      occupation: v.value.occupation ?? '',
      goal: v.value.goal,
      goalOther: v.value.goalOther,
      regularTrainingTime: v.value.regularTrainingTime,
      source: cleanSource(body.source),
      sourceSociety: cleanSociety(body.sourceSociety),
      idempotencyKey: key,
      ipHash,
    });
  } catch (e) {
    // Two identical requests racing: the UNIQUE key rejects the second. That is a duplicate, not a failure.
    if (String(e).includes('UNIQUE')) return json({ ok: true, duplicate: true, leadType, name: first });
    console.error('lead insert failed', e);
    return json({ ok: false, error: 'server' }, 500);
  }

  const work = notifyLead(env, id).catch((e) => console.error('notify failed', id, e));
  if (locals.cfContext?.waitUntil) locals.cfContext.waitUntil(work); else await work;

  return json({ ok: true, leadType, name: first });
};

// Anything else is not part of the API.
export const ALL: APIRoute = () => json({ ok: false, error: 'method-not-allowed' }, 405);
