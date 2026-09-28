import type { AppEnv } from './env';
import { GOAL_LABEL, prettyMobile, type Goal } from '../validate';

export interface LeadRow {
  id: string;
  created_at: string;
  lead_type: 'trial' | 'waitlist';
  name: string;
  whatsapp_e164: string;
  society: string;
  occupation: string | null;
  goal: string;
  goal_other: string | null;
  regular_training_time: string;
  source: string;
  source_society: string | null;
  scheduling_method: 'manual' | 'calcom';
  trial_when: string | null;
  lead_status: 'new' | 'contacted' | 'booked' | 'attended' | 'not-a-fit';
  first_contacted_at: string | null;
  nudged_at: string | null;
  telegram_status: 'pending' | 'sent' | 'failed';
  telegram_message_id: number | null;
  sheet_status: 'pending' | 'sent' | 'failed';
  notify_attempts: number;
  last_attempt_at: string | null;
  last_error: string | null;
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const short = (id: string) => id.slice(0, 8);

export async function outbox(env: AppEnv, channel: string, payload: unknown) {
  await env.DB.prepare('INSERT INTO dev_outbox (created_at, channel, payload) VALUES (?, ?, ?)')
    .bind(new Date().toISOString(), channel, JSON.stringify(payload))
    .run();
}

interface TgResult { ok: boolean; result?: { message_id?: number }; description?: string }

/**
 * Thin Telegram Bot API call. With DEV_STUBS=1 and no token it records the call in dev_outbox instead of
 * hitting the network. In production a missing token is a *failure* (visible in D1), never a silent stub.
 */
export async function tg(env: AppEnv, method: string, body: Record<string, unknown>): Promise<TgResult> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    if (env.DEV_STUBS === '1') {
      await outbox(env, `telegram:${method}`, body);
      return { ok: true, result: { message_id: Math.floor(Math.random() * 1e9) } };
    }
    return { ok: false, description: 'TELEGRAM_BOT_TOKEN is not configured' };
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(8000),
    });
    return (await res.json()) as TgResult;
  } catch (e) {
    return { ok: false, description: `network: ${String(e).slice(0, 200)}` };
  }
}

export const istTime = (iso: string) =>
  new Date(iso).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }) + ' IST';

// l.goal is a comma-joined list of goal slugs (checkboxes let a lead pick more than one).
export const goalText = (l: Pick<LeadRow, 'goal' | 'goal_other'>) =>
  l.goal.split(',').filter(Boolean).map((g) => GOAL_LABEL[g as Goal] ?? g).join(', ') + (l.goal_other ? ` (${l.goal_other})` : '');

export function leadMessage(l: LeadRow): string {
  const head = l.lead_type === 'waitlist' ? '⏳ <b>New waitlist lead</b>' : '🆕 <b>New free-trial lead</b>';
  const src = l.source + (l.source_society ? ` · ${l.source_society}` : '');
  return [
    head,
    `<b>${esc(l.name)}</b>`,
    `📱 ${prettyMobile(l.whatsapp_e164)}`,
    `🏢 ${esc(l.society)}`,
    l.occupation ? `💼 ${esc(l.occupation)}` : '',
    `🎯 ${esc(goalText(l))}`,
    `🕗 ${esc(l.regular_training_time)}`,
    `📍 Source: ${esc(src)}`,
    `🕐 ${istTime(l.created_at)}`,
    l.trial_when ? `📅 Trial: ${esc(l.trial_when)}` : '',
    `ID #${short(l.id)}`,
  ].filter(Boolean).join('\n');
}

// DRAFT wording for Akhil to approve; it only prefills the WhatsApp box, he still taps Send.
const openerFor = (l: LeadRow) => {
  const first = l.name.split(' ')[0];
  return l.lead_type === 'waitlist'
    ? `Hi ${first}, this is Akhil from Akhil’s Fitness Coaching. Thanks for your interest. I’ll message you as soon as a training slot opens up.`
    : `Hi ${first}, this is Akhil from Akhil’s Fitness Coaching. Thanks for requesting a free trial. When are you free this week for a session?`;
};

/** callback_data = "l:<action>:<32-hex id>" (<= 64 bytes). Selected status is marked with a tick. */
export function leadKeyboard(l: LeadRow) {
  const mark = (s: LeadRow['lead_status'], label: string) => (l.lead_status === s ? `✓ ${label}` : label);
  return {
    inline_keyboard: [
      [{ text: 'Message on WhatsApp', url: `https://wa.me/${l.whatsapp_e164}?text=${encodeURIComponent(openerFor(l))}` }],
      [
        { text: mark('contacted', 'Contacted'), callback_data: `l:c:${l.id}` },
        { text: mark('booked', 'Booked'), callback_data: `l:b:${l.id}` },
        { text: mark('not-a-fit', 'Not a fit'), callback_data: `l:n:${l.id}` },
      ],
    ],
  };
}

export async function sendLeadToTelegram(env: AppEnv, l: LeadRow): Promise<{ ok: boolean; messageId?: number; error?: string }> {
  if (!env.TELEGRAM_CHAT_ID) return { ok: false, error: 'TELEGRAM_CHAT_ID is not configured' };
  const r = await tg(env, 'sendMessage', {
    chat_id: env.TELEGRAM_CHAT_ID,
    text: leadMessage(l),
    parse_mode: 'HTML',
    reply_markup: leadKeyboard(l),
    disable_web_page_preview: true,
  });
  return r.ok ? { ok: true, messageId: r.result?.message_id } : { ok: false, error: `telegram: ${r.description ?? 'unknown error'}` };
}
