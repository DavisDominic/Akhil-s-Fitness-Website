import type { AppEnv } from './env';
import { PRIVACY_NOTICE_VERSION } from './leads';
import { esc, short, tg } from './telegram';

const MAX_ATTEMPTS = 8;
const RETRY_AFTER_MS = 2 * 60 * 1000;

export interface TestimonialRow {
  id: string;
  created_at: string;
  name: string;
  society: string;
  occupation: string | null;
  quote: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_at: string | null;
  telegram_status: 'pending' | 'sent' | 'failed';
  telegram_message_id: number | null;
  notify_attempts: number;
  last_attempt_at: string | null;
  last_error: string | null;
  ip_hash: string | null;
}

export interface NewTestimonial {
  name: string;
  society: string;
  occupation: string;
  quote: string;
  ipHash: string;
}

/** Capture first, same as leads: the insert is the moment the submission is safe. */
export async function insertTestimonial(env: AppEnv, t: NewTestimonial): Promise<string> {
  const id = crypto.randomUUID().replace(/-/g, '');
  await env.DB.prepare(
    `INSERT INTO testimonials (id, created_at, name, society, occupation, quote, ip_hash, privacy_notice_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, new Date().toISOString(), t.name, t.society, t.occupation || null, t.quote, t.ipHash, PRIVACY_NOTICE_VERSION)
    .run();
  return id;
}

export const getTestimonial = (env: AppEnv, id: string) =>
  env.DB.prepare('SELECT * FROM testimonials WHERE id = ?').bind(id).first<TestimonialRow>();

/** Approved submissions, newest-approved first — the actual public-facing read, used by index.astro to render
 * real testimonials alongside the hand-picked baseline in src/data/testimonials.ts. Approving in Telegram only
 * ever flips the DB row's status; this query is what makes that approval actually reach the live page. */
export async function getApprovedTestimonials(env: AppEnv, limit = 20): Promise<TestimonialRow[]> {
  const r = await env.DB.prepare(`SELECT * FROM testimonials WHERE status = 'approved' ORDER BY reviewed_at DESC LIMIT ?`)
    .bind(limit)
    .all<TestimonialRow>();
  return r.results;
}

function testimonialMessage(t: TestimonialRow): string {
  return [
    '📝 <b>New testimonial submitted</b>',
    `<b>${esc(t.name)}</b>${t.occupation ? ` · ${esc(t.occupation)}` : ''}`,
    `🏢 ${esc(t.society)}`,
    '',
    esc(t.quote),
    '',
    `ID #${short(t.id)}`,
  ].join('\n');
}

/** Selected status gets a tick, same convention as the lead keyboard. */
function testimonialKeyboard(t: TestimonialRow) {
  const mark = (s: TestimonialRow['status'], label: string) => (t.status === s ? `✓ ${label}` : label);
  return {
    inline_keyboard: [[
      { text: mark('approved', 'Approve'), callback_data: `t:a:${t.id}` },
      { text: mark('rejected', 'Reject'), callback_data: `t:r:${t.id}` },
    ]],
  };
}

async function sendTestimonialToTelegram(env: AppEnv, t: TestimonialRow): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  if (!env.TELEGRAM_CHAT_ID) return { ok: false, error: 'TELEGRAM_CHAT_ID is not configured' };
  const r = await tg(env, 'sendMessage', {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: testimonialMessage(t),
    parse_mode: 'HTML',
    reply_markup: testimonialKeyboard(t),
  });
  return r.ok ? { ok: true, messageId: r.result?.message_id } : { ok: false, error: `telegram: ${r.description ?? 'unknown error'}` };
}

/** Safe to call repeatedly (initial send, retries): a submission already marked "sent" is never re-sent. */
export async function notifyTestimonial(env: AppEnv, id: string): Promise<void> {
  const t = await getTestimonial(env, id);
  if (!t || t.telegram_status === 'sent') return;
  const r = await sendTestimonialToTelegram(env, t);
  await env.DB.prepare(
    `UPDATE testimonials SET telegram_status = ?, telegram_message_id = ?, notify_attempts = notify_attempts + 1,
       last_attempt_at = ?, last_error = ? WHERE id = ?`,
  ).bind(r.ok ? 'sent' : 'failed', r.messageId ?? null, new Date().toISOString(), r.ok ? null : r.error ?? null, id).run();
}

/** Tap on Approve/Reject in Telegram. Flips the DB row's status; getApprovedTestimonials() above is what
 * picks approved rows up for the live site, on the next request (index.astro is server-rendered, not cached). */
export async function applyTestimonialAction(env: AppEnv, id: string, action: 'a' | 'r', chatId: number | string, messageId: number): Promise<string> {
  const t = await getTestimonial(env, id);
  if (!t) return 'Testimonial not found';
  const status = action === 'a' ? 'approved' : 'rejected';
  await env.DB.prepare('UPDATE testimonials SET status = ?, reviewed_at = ? WHERE id = ?').bind(status, new Date().toISOString(), id).run();
  const updated = { ...t, status } as TestimonialRow;
  await tg(env, 'editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: testimonialKeyboard(updated) });
  return status === 'approved' ? 'Marked as approved' : 'Marked as rejected';
}

/** Cron-driven retry for submissions whose Telegram alert failed the first time. */
export async function retryFailedTestimonials(env: AppEnv, opts: { nowMs?: number } = {}): Promise<number> {
  const now = opts.nowMs ?? Date.now();
  const retryBefore = new Date(now - RETRY_AFTER_MS).toISOString();
  const pending = await env.DB.prepare(
    `SELECT id FROM testimonials WHERE telegram_status != 'sent' AND notify_attempts < ?
       AND (last_attempt_at IS NULL OR last_attempt_at < ?) ORDER BY created_at LIMIT 20`,
  ).bind(MAX_ATTEMPTS, retryBefore).all<{ id: string }>();
  for (const r of pending.results) await notifyTestimonial(env, r.id);
  return pending.results.length;
}
