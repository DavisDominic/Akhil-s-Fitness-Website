# Setup: from local stand-ins to the real accounts

Everything below is done **once**, in Akhil's own accounts. Until then the site runs locally with stand-ins
(`DEV_STUBS=1`): Telegram and Sheet messages are written to the `dev_outbox` table instead of being sent.

## Local development

```bash
cd site
npm install
cp .dev.vars.example .dev.vars        # local stand-in secrets
npm run db:migrate:local              # creates the local database
npm run dev                           # http://localhost:4321
npm test                              # validation unit tests
```

Inspect local data / what would have been sent:

```bash
npx wrangler d1 execute akhil-fitness --local --command "SELECT name, lead_status, telegram_status, sheet_status FROM leads"
npx wrangler d1 execute akhil-fitness --local --command "SELECT channel, payload FROM dev_outbox ORDER BY id DESC LIMIT 5"
```

## Going live

### 1. Cloudflare (hosting, database)
1. Create a free Cloudflare account under the business Gmail. Add a payment card (needed later for R2 photo storage; nothing is charged within free limits).
2. `npx wrangler login`
3. `npx wrangler d1 create akhil-fitness`, then copy the printed `database_id` into `wrangler.jsonc` (`d1_databases[0].database_id`).
4. `npx wrangler d1 migrations apply akhil-fitness --remote`

### 2. Telegram bot (instant lead alerts)
1. In Telegram, message **@BotFather** > `/newbot`. Copy the token.
2. Open the new bot in Telegram and press **Start** (a bot cannot message someone who has not started it).
3. Get Akhil's numeric chat id: open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and read `message.chat.id`.
4. Set the secrets (each command prompts for the value):
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put TELEGRAM_CHAT_ID
   npx wrangler secret put TELEGRAM_WEBHOOK_SECRET   # any long random string
   npx wrangler secret put IP_HASH_SALT               # any long random string
   npx wrangler secret put CRON_SECRET                # any long random string
   ```
5. After the first deploy, point Telegram at the site (replace the values):
   ```bash
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
     -d "url=https://<your-site>/api/telegram" \
     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" \
     -d 'allowed_updates=["message","callback_query"]'
   ```

### 3. Google Sheet backup
Follow the header of `docs/apps-script/Code.gs`, then:
```bash
npx wrangler secret put SHEET_WEBHOOK_URL
npx wrangler secret put SHEET_WEBHOOK_SECRET       # same value as the script's SECRET property
```

### 4. Deploy and verify
```bash
npm run build && npx wrangler deploy
```
Then submit a real trial request on the live site and confirm **all four**: the row is in D1, the Telegram alert arrives with
its buttons, the Sheet row appears, and the buttons update the lead. Leave `DEV_STUBS` unset in production: with it unset, a
missing secret is recorded as a **failed** notification (visible in D1, retried by the cron) instead of being silently stubbed.

## What the cron does (every 10 minutes)
- Retries any lead whose Telegram or Sheet delivery failed (up to 8 attempts, 2 minutes apart).
- Reminds Akhil once about a lead still marked *new* after 4 hours (only 08:00 to 21:00 IST).
- Mondays around 09:00 IST: a "Lead alerts are working" message. If that message stops arriving, alerts are broken.

## Data handling reminders
- Raw IP addresses are never stored; only a salted hash used for rate limiting.
- `PRIVACY_NOTICE_VERSION` in `src/lib/server/leads.ts` is stored with each lead. Bump it whenever the privacy page changes.
- Retention periods on the privacy page are still proposals: confirm them, then add a scheduled cleanup.
