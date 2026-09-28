import { env as cfEnv } from 'cloudflare:workers';

/** Bindings + secrets. Optional ones are unset until the real accounts exist (see docs/SETUP.md). */
export interface AppEnv {
  DB: D1Database;
  /** "1" = local stand-ins: Telegram/Sheet messages go to the dev_outbox table instead of the network. */
  DEV_STUBS?: string;
  IP_HASH_SALT?: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  SHEET_WEBHOOK_URL?: string;
  SHEET_WEBHOOK_SECRET?: string;
  CRON_SECRET?: string;
}

export const getEnv = (): AppEnv => cfEnv as unknown as AppEnv;
