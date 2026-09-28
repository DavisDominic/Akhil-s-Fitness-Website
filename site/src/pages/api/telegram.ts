import type { APIRoute } from 'astro';
import { getEnv } from '../../lib/server/env';
import { applyLeadAction, saveTrialTime } from '../../lib/server/leads';
import { applyTestimonialAction } from '../../lib/server/testimonials';
import { esc, tg } from '../../lib/server/telegram';

export const prerender = false;

interface Update {
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { message_id: number; chat: { id: number } } };
  message?: { from?: { id: number }; chat: { id: number }; text?: string; reply_to_message?: { text?: string } };
}

const ok = () => new Response('ok', { status: 200 });

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/**
 * Telegram webhook. Two locks: (1) Telegram must present our secret header, (2) the sender must be Akhil's chat.
 * Everything else is ignored with a 200 so Telegram never retries into duplicate work.
 */
export const POST: APIRoute = async ({ request }) => {
  const env = getEnv();
  const secret = env.TELEGRAM_WEBHOOK_SECRET;
  const given = request.headers.get('x-telegram-bot-api-secret-token') ?? '';
  if (!secret || !safeEqual(given, secret)) return new Response('unauthorized', { status: 401 });

  let update: Update;
  try { update = await request.json(); } catch { return ok(); }
  const owner = String(env.TELEGRAM_CHAT_ID ?? '');

  const cb = update.callback_query;
  if (cb) {
    if (String(cb.from.id) !== owner || !cb.message) return ok();
    const lm = /^l:([cbn]):([0-9a-f]{32})$/.exec(cb.data ?? '');
    const tm = /^t:([ar]):([0-9a-f]{32})$/.exec(cb.data ?? '');
    let toast = 'Unknown action';
    if (lm) toast = await applyLeadAction(env, lm[2], lm[1] as 'c' | 'b' | 'n', cb.message.chat.id, cb.message.message_id);
    else if (tm) toast = await applyTestimonialAction(env, tm[2], tm[1] as 'a' | 'r', cb.message.chat.id, cb.message.message_id);
    await tg(env, 'answerCallbackQuery', { callback_query_id: cb.id, text: toast });
    return ok();
  }

  const msg = update.message;
  if (msg && String(msg.from?.id) === owner && msg.text) {
    const m = /Trial time for #([0-9a-f]{8})/.exec(msg.reply_to_message?.text ?? '');
    if (m) {
      const name = await saveTrialTime(env, m[1], msg.text);
      await tg(env, 'sendMessage', {
        chat_id: msg.chat.id,
        text: name ? `Saved: <b>${esc(name)}</b> · ${esc(msg.text.slice(0, 80))}` : 'Couldn’t find that lead.',
        parse_mode: 'HTML',
      });
    }
  }
  return ok();
};
