import type { AppEnv } from './env';
import { esc, istTime, leadKeyboard, leadMessage, outbox, sendLeadToTelegram, short, tg, type LeadRow } from './telegram';
import { prettyMobile } from '../validate';

export const PRIVACY_NOTICE_VERSION = '2026-09-draft';
const MAX_ATTEMPTS = 8;
const RETRY_AFTER_MS = 2 * 60 * 1000;
const NUDGE_AFTER_MS = 4 * 60 * 60 * 1000;

export const newId = () => crypto.randomUUID().replace(/-/g, '');

export async function sha256Hex(s: string) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export interface NewLead {
  leadType: 'trial' | 'waitlist';
  name: string;
  whatsappE164: string;
  society: string;
  occupation: string;
  goal: string;
  goalOther: string;
  regularTrainingTime: string;
  source: string;
  sourceSociety: string | null;
  idempotencyKey: string;
  ipHash: string;
}

/** Capture first: this insert is the moment the lead is safe. Everything after it may fail without losing it. */
export async function insertLead(env: AppEnv, l: NewLead): Promise<string> {
  const id = newId();
  await env.DB.prepare(
    `INSERT INTO leads (id, created_at, lead_type, name, whatsapp_e164, society, occupation, goal, goal_other, regular_training_time,
       source, source_society, idempotency_key, ip_hash, privacy_notice_version)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(id, new Date().toISOString(), l.leadType, l.name, l.whatsappE164, l.society, l.occupation || null, l.goal, l.goalOther || null,
      l.regularTrainingTime, l.source, l.sourceSociety, l.idempotencyKey, l.ipHash, PRIVACY_NOTICE_VERSION)
    .run();
  return id;
}

export const getLead = (env: AppEnv, id: string) =>
  env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(id).first<LeadRow>();

/** Independent backup: appends one row to Akhil's Google Sheet through an Apps Script web app (docs/apps-script/Code.gs). */
export async function appendToSheet(env: AppEnv, l: LeadRow): Promise<{ ok: boolean; error?: string }> {
  const row = {
    id: l.id, createdAt: l.created_at, type: l.lead_type, name: l.name, whatsapp: `+${l.whatsapp_e164}`, society: l.society,
    occupation: l.occupation ?? '', goal: l.goal_other ? `${l.goal} (${l.goal_other})` : l.goal, regularTrainingTime: l.regular_training_time,
    source: l.source, sourceSociety: l.source_society ?? '', status: l.lead_status, trialWhen: l.trial_when ?? '',
  };
  if (!env.SHEET_WEBHOOK_URL) {
    if (env.DEV_STUBS === '1') { await outbox(env, 'sheet:append', row); return { ok: true }; }
    return { ok: false, error: 'SHEET_WEBHOOK_URL is not configured' };
  }
  try {
    const res = await fetch(env.SHEET_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=utf-8' }, // avoids a CORS-style preflight on Apps Script
      body: JSON.stringify({ secret: env.SHEET_WEBHOOK_SECRET, row }),
      signal: AbortSignal.timeout(10000),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    return json?.ok ? { ok: true } : { ok: false, error: `sheet: ${json?.error ?? res.status}` };
  } catch (e) {
    return { ok: false, error: `sheet network: ${String(e).slice(0, 200)}` };
  }
}

/**
 * Try every channel that has not succeeded yet, then record the outcome. Safe to call repeatedly (retries, cron):
 * a channel that already succeeded is never re-sent. The lead counts as "reached Akhil" if either channel worked.
 */
export async function notifyLead(env: AppEnv, id: string): Promise<void> {
  const lead = await getLead(env, id);
  if (!lead) return;
  const errors: string[] = [];
  let tgStatus = lead.telegram_status;
  let msgId = lead.telegram_message_id;
  let shStatus = lead.sheet_status;

  await Promise.all([
    tgStatus !== 'sent' &&
      sendLeadToTelegram(env, lead).then((r) => {
        tgStatus = r.ok ? 'sent' : 'failed';
        if (r.ok) msgId = r.messageId ?? null; else errors.push(r.error ?? 'telegram failed');
      }),
    shStatus !== 'sent' &&
      appendToSheet(env, lead).then((r) => {
        shStatus = r.ok ? 'sent' : 'failed';
        if (!r.ok) errors.push(r.error ?? 'sheet failed');
      }),
  ]);

  await env.DB.prepare(
    `UPDATE leads SET telegram_status = ?, telegram_message_id = ?, sheet_status = ?, notify_attempts = notify_attempts + 1,
       last_attempt_at = ?, last_error = ? WHERE id = ?`,
  ).bind(tgStatus, msgId, shStatus, new Date().toISOString(), errors.join(' | ') || null, id).run();
}

type Action = 'c' | 'b' | 'n';

/** Button taps from the Telegram lead message. Returns the toast text for answerCallbackQuery. */
export async function applyLeadAction(env: AppEnv, id: string, action: Action, chatId: number | string, messageId: number): Promise<string> {
  const lead = await getLead(env, id);
  if (!lead) return 'Lead not found';
  const now = new Date().toISOString();
  const status = action === 'c' ? 'contacted' : action === 'b' ? 'booked' : 'not-a-fit';
  await env.DB.prepare(
    'UPDATE leads SET lead_status = ?, first_contacted_at = COALESCE(first_contacted_at, ?) WHERE id = ?',
  ).bind(status, action === 'n' ? null : now, id).run();
  const updated = { ...lead, lead_status: status } as LeadRow;
  await tg(env, 'editMessageReplyMarkup', { chat_id: chatId, message_id: messageId, reply_markup: leadKeyboard(updated) });
  if (action === 'b') {
    // Stateless follow-up: Akhil replies to this prompt and the reply is matched by the #id in its text.
    await tg(env, 'sendMessage', {
      chat_id: chatId,
      text: `Trial time for #${short(id)} (${esc(lead.name)})? Reply to this message with the date and time, e.g. “Sat 7 AM”.`,
      parse_mode: 'HTML',
      reply_markup: { force_reply: true, selective: true, input_field_placeholder: 'Sat 7 AM' },
    });
  }
  return status === 'booked' ? 'Marked as booked' : status === 'contacted' ? 'Marked as contacted' : 'Marked as not a fit';
}

export async function saveTrialTime(env: AppEnv, shortId: string, text: string): Promise<string | null> {
  const row = await env.DB.prepare('SELECT id, name FROM leads WHERE id LIKE ? LIMIT 2').bind(`${shortId}%`).all<{ id: string; name: string }>();
  if (row.results.length !== 1) return null;
  const when = text.replace(/\s+/g, ' ').trim().slice(0, 80);
  await env.DB.prepare(
    "UPDATE leads SET trial_when = ?, lead_status = 'booked', first_contacted_at = COALESCE(first_contacted_at, ?) WHERE id = ?",
  ).bind(when, new Date().toISOString(), row.results[0].id).run();
  return row.results[0].name;
}

const istHour = (ms: number) => Number(new Date(ms).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false })) % 24;

/** Cron: retry failed notifications, nudge un-contacted leads (daytime only), weekly "alerts are working" ping. */
export async function runScheduled(env: AppEnv, opts: { nowMs?: number } = {}): Promise<{ retried: number; nudged: number; heartbeat: boolean }> {
  const now = opts.nowMs ?? Date.now(); // nowMs is only ever passed by the dev-only test hook
  const retryBefore = new Date(now - RETRY_AFTER_MS).toISOString();

  const pending = await env.DB.prepare(
    `SELECT id FROM leads WHERE (telegram_status != 'sent' OR sheet_status != 'sent') AND notify_attempts < ?
       AND (last_attempt_at IS NULL OR last_attempt_at < ?) ORDER BY created_at LIMIT 20`,
  ).bind(MAX_ATTEMPTS, retryBefore).all<{ id: string }>();
  for (const r of pending.results) await notifyLead(env, r.id);

  let nudged = 0;
  const hour = istHour(now);
  if (hour >= 8 && hour < 21 && env.TELEGRAM_CHAT_ID) {
    const due = await env.DB.prepare(
      `SELECT * FROM leads WHERE lead_status = 'new' AND nudged_at IS NULL AND telegram_status = 'sent' AND created_at < ? LIMIT 10`,
    ).bind(new Date(now - NUDGE_AFTER_MS).toISOString()).all<LeadRow>();
    for (const l of due.results) {
      const r = await tg(env, 'sendMessage', {
        chat_id: env.TELEGRAM_CHAT_ID,
        text: `⏰ <b>${esc(l.name)}</b> (${prettyMobile(l.whatsapp_e164)}) asked for a trial ${istTime(l.created_at)} and hasn’t been contacted yet.`,
        parse_mode: 'HTML',
        reply_markup: leadKeyboard(l),
        ...(l.telegram_message_id ? { reply_parameters: { message_id: l.telegram_message_id, allow_sending_without_reply: true } } : {}),
      });
      if (r.ok) { await env.DB.prepare('UPDATE leads SET nudged_at = ? WHERE id = ?').bind(new Date(now).toISOString(), l.id).run(); nudged++; }
    }
  }

  // Weekly heartbeat (Mondays ~9am IST): proves the alert channel still works, so silence never means "broken".
  let heartbeat = false;
  const ist = new Date(now + 5.5 * 3600 * 1000);
  const weekKey = `${ist.getUTCFullYear()}-W${Math.floor((Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - Date.UTC(ist.getUTCFullYear(), 0, 1)) / 6048e5)}`;
  if (ist.getUTCDay() === 1 && hour >= 9 && env.TELEGRAM_CHAT_ID) {
    const last = await env.DB.prepare("SELECT value FROM meta WHERE key = 'heartbeat_week'").first<{ value: string }>();
    if (last?.value !== weekKey) {
      const stats = await env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE created_at > ?").bind(new Date(now - 7 * 864e5).toISOString()).first<{ n: number }>();
      const r = await tg(env, 'sendMessage', { chat_id: env.TELEGRAM_CHAT_ID, text: `✅ Lead alerts are working. ${stats?.n ?? 0} new leads in the last 7 days.` });
      if (r.ok) {
        await env.DB.prepare("INSERT INTO meta (key, value) VALUES ('heartbeat_week', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(weekKey).run();
        heartbeat = true;
      }
    }
  }
  return { retried: pending.results.length, nudged, heartbeat };
}

export { leadMessage };
