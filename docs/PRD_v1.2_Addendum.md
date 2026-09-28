# Akhil’s Fitness Coaching — PRD v1.2 Addendum (Decisions, Gap Fixes, Architecture)

Supersedes conflicting statements in PRD v1.1 §46, §16, §48.3, §48.10. Everything else in v1.1 stands.
Status: aligned Sept 2026, pre-build. Tool/pricing facts verified Sept 2026; re-check before launch.

## 1. Locked decisions

| # | Decision | Notes |
|---|---|---|
| D1 | Build in **Astro + Tailwind (v4, `@theme` tokens from Design System V5.1)** | Not Framer. Resolves PRD §46 vs §48.10. |
| D2 | Host on **Cloudflare Workers (static assets + API routes)** | Astro adapter no longer targets Pages. |
| D3 | Store in **D1** (leads, testimonials, config); photos in **R2** | R2 requires a payment card on file (free within limits). Akhil owns the account. |
| D4 | Notify via **Telegram bot**; independent backup = **Google Sheet via Apps Script webhook** | Notification status tracked per lead. |
| D5 | Trial scheduling = **Cal.com free** (live slot booking), manual WhatsApp as fallback | See §3. Replaces "manual for v1" recommendation. |
| D6 | Analytics = **Umami Cloud free** (100k events/mo incl. custom events, cookieless) | Cloudflare Web Analytics can't track custom events. |
| D7 | Anti-spam = honeypot + Cloudflare Turnstile + per-IP rate limit | All free. |
| D8 | Domain: **not yet purchased**. Build on a free `*.workers.dev` subdomain; buy domain before launch | Needed for OG links, QR codes, Turnstile hostname, Telegram is unaffected. |
| D9 | Telegram: Akhil uses it | Needs bot created via @BotFather in Akhil's account. |

## 2. Rejected tools (and why)

- **Vercel Hobby** — non-commercial only; lead-gen for a paid service counts; accounts get paused.
- **Netlify free** — hard 300-credit monthly cap, site goes offline when exhausted; each prod deploy = 15 credits.
- **Supabase free** — pauses after 7 days of low activity → silent lead loss in a quiet week.
- **Calendly free** — no webhooks, one event type. (Cal.com free has webhooks.)

## 3. Trial scheduling with Cal.com (revised flow)

```
Trial form → POST /api/trial → D1 (captured) → Telegram alert + Sheet backup
          → success screen: "Request received" + [Pick a time] (Cal.com embed/link, prefilled name + phone)
          → Cal.com BOOKING_CREATED webhook → POST /api/calcom (HMAC-verified)
          → match lead by WhatsApp number → set trialDateTime, schedulingMethod=calcom
          → Telegram: "Trial booked: <date/time>"
```

Rules:
- Lead capture always happens **before** scheduling. Cal.com failure/unavailable → success screen still says "Akhil will contact you on WhatsApp within 24 hours" + WhatsApp button.
- Success copy claims a booked time **only** after webhook confirmation or Cal.com's own confirmation screen.
- Link booking ↔ lead by the **WhatsApp number** (prefilled into a Cal.com phone field), not by trusting URL metadata. Unmatched bookings still alert Akhil with the raw details.
- **WhatsApp-first (no-email users):** the success screen's primary path is "Akhil will message you on WhatsApp within 24 hours". Secondary button: "Message Akhil now" (`wa.me` with pre-filled text including the visitor's name; also gives Akhil a verified contact if the number was mistyped). Cal.com is an optional link ("Prefer to pick a slot yourself?"), shown only when availability ≠ full. Visitors without an email simply skip it and lose nothing.
- **Akhil-side manual path:** the Telegram lead alert includes a one-tap "Message <name> on WhatsApp" button; Akhil proposes slots in chat, then taps **Booked** and enters the trial date/time so `trialDateTime` is still recorded (`schedulingMethod=manual`).
- **Open item (verify in Cal.com dashboard during setup):** Cal.com requires an attendee email by default. Check whether phone-only booking exists on the free plan; if so, promote Cal.com to a co-primary path. Do **not** add an email field to our form, and do **not** use fake/placeholder emails (bounces, account-flag risk).
- Event type: "Free trial session", duration TBD by Akhil, availability synced to his calendar.
- Webhook endpoint verifies `X-Cal-Signature-256` (HMAC-SHA256, timing-safe compare).

## 4. Gap fixes (added to spec)

### Data model additions
- **Trial lead:** `leadType` (`trial` | `waitlist`), `idempotencyKey`, `source` allowlist `poster|mygate|business-card|direct` (+ `referral`/`other` set manually), `sourceSociety` (allowlisted slug), `whatsappE164`, `goalOther` (free text when "Other"), `consentToContact` + `privacyNoticeVersion`, `firstContactedAt`, `leadStatus` (`new|contacted|booked|attended|not-a-fit`), `notificationStatus` (`pending|sent|failed`), `notificationAttempts`.
- **Testimonial:** status adds `unpublished`; `displayOrder`, `featured`; `consentAt`, `consentTextVersion`; `photoKey` (R2); `origin` (`submitted|seeded`); `quote` max ~1,000 chars.
- **Site config:** `availability` (`taking|limited|full`), contact details, WhatsApp number, Cal.com link.

### Behaviour
1. **Duplicate protection:** client sends an idempotency key per form session; server dedupes on key, and on same WhatsApp number within 10 minutes. Button disabled while sending is UX only.
2. **Source persistence:** read `source`/`society` on first landing, allowlist-validate, keep in `sessionStorage` so Home→Connect keeps attribution; default `direct`. No personal data in URLs, ever.
3. **Waitlist mode:** when availability = `full`, same form, CTA label "Join the waitlist", stored as `leadType=waitlist`. Cal.com step is hidden in this mode.
4. **Availability control (no CMS):** Akhil sends `/status taking|limited|full` to the bot; value stored in D1; site reads it via a short-cached endpoint with a static default.
5. **Testimonial publishing:** Home reads approved + consented testimonials at runtime from a cached endpoint (≈60s), with the seeded testimonials baked into the HTML as fallback. No rebuilds. Home shows the top 3–4 by `featured` then `displayOrder`. Zero-approved state shows no empty section.
6. **Telegram approve/reject:** inline buttons; `callback_data` ≤ 64 bytes (use short IDs); webhook verifies `X-Telegram-Bot-Api-Secret-Token` and allowlists Akhil's chat ID; transitions idempotent; message shows the full quote (≤ 4096 chars); photo sent via `sendPhoto`.
7. **Lead follow-up:** lead message carries buttons *Contacted / Booked / Not a fit* (updates `leadStatus`, records `firstContactedAt`). A scheduled Worker (cron) retries failed notifications and nudges if a lead is un-contacted after a set time (default 4h; Akhil to confirm). Weekly heartbeat ping so silent failure is noticed.
8. **Photo upload:** accept JPG/PNG/WebP ≤ 10 MB; resize/convert to WebP client-side before upload; validate type/size again server-side; never lose the rest of the form on failure.
9. **Validation:** WhatsApp normalised to E.164; Indian mobile pattern `^[6-9]\d{9}$` after stripping +91/0/spaces.
10. **Privacy:** small `/privacy` utility page (like 404, not a fourth marketing page) + one-line notice under each form; consent stored with timestamp and wording version; contact route for removal/deletion; retention periods to be set (proposal: rejected testimonials 12 months, closed leads 12 months). Built to satisfy India DPDP Rules 2025 (full compliance date 13 May 2027). Not legal advice.
11. **Ownership:** Cloudflare, Telegram bot, Google Sheet, Cal.com and Umami accounts belong to Akhil; developer gets delegated access only.

## 5. Design-system corrections and additions (V5.1 → V5.2, done in code)

- Hero headline is 9 words vs the 8-word uppercase rule → formal exception for the hero Display only.
- Add desktop specs (≥900px): header/nav, hero, About, two-column Connect, footer.
- New components: "Other" goal text reveal; waitlist form state; Cal.com pick-a-time success panel; About photo frame; testimonial empty/loading state; full footer (email, phone, WhatsApp, optional socials, Privacy link).
- Adopt design-system consent wording (names name/society/photo) over PRD short wording.
- Correct doc: control border on field measures 3.53:1 (passes 3:1), not 3.7:1.
- Self-host Barlow Condensed (600–800) and Manrope (400–800), Latin subset, `font-display: swap`.
- Temporary wordmark-based favicon and OG image until logo exists.

## 6. Assets and inputs needed from Akhil (checklist)

- [ ] Akhil's photo(s) — portrait 4:5, in-gym 3:2
- [ ] WhatsApp number, phone, email
- [ ] Telegram: create bot via @BotFather, send `/start` to it
- [ ] Domain choice + purchase (Akhil's account)
- [ ] Cloudflare account with card on file (for R2), Cal.com account, Google account for the Sheet, Umami account
- [ ] The five existing testimonials: text, confirmed consent, optional photos
- [ ] Verified figures: 4+ years / 2,400+ hours / 50+ clients (already locked)
- [ ] Free-trial session length and availability hours (for Cal.com)
- [ ] Un-contacted-lead reminder threshold (default 4h)

## 7. Build order

1. Astro + Tailwind v4 scaffold, tokens, self-hosted fonts, primitives (button, fields, chips, consent, upload, alerts, avatar)
2. Cards, sections, mobile shell (header, menu, sticky bar, footer); static Home / About / Connect / 404 / Privacy with placeholder media
3. Trial pipeline end to end (D1 + Telegram + Sheet + retry cron) and Cal.com webhook
4. Testimonial pipeline (submit, R2 photo, Telegram approve/reject, runtime publish, seeded fallback)
5. Analytics events, SEO (titles, OG, sitemap, robots, JSON-LD), QR codes with source tags, accessibility + real-device Lighthouse pass
6. Launch checklist (PRD §48.16), domain cutover, Turnstile hostname, secrets audit

## 8. Cost summary

Recurring: ₹0 within free tiers. One-off/annual: domain (typically under ~₹1,000/yr for a `.in`; confirm at purchase). Card on file at Cloudflare for R2 (not charged within free limits).
Paid upgrade triggers to watch: D1 free daily limits (queries fail past them from 1 Sept 2026), Workers 100k requests/day, Umami 100k events/month.

## 9. Step 3 build notes (trial pipeline, built with local stand-ins)

Built and verified locally: D1 lead capture, Telegram alert with **Message on WhatsApp / Contacted / Booked / Not a fit** buttons,
"Booked" flow (Akhil replies with the trial time, stored as free text in `trial_when`), Google Sheet backup via Apps Script
(`site/docs/apps-script/Code.gs`), retry cron (every 10 min, 8 attempts), one-time "still un-contacted after 4h" reminder
(08:00-21:00 IST only), Monday "alerts are working" heartbeat, honeypot, idempotency + same-number dedupe, same-origin check,
per-IP rate limit, WhatsApp-first success screens, failure state with retry + WhatsApp fallback. Setup for the real accounts: `site/docs/SETUP.md`.

Decisions made while building (change if Akhil disagrees):
- **Rate limit is 15 leads / 10 min per IP**, deliberately generous: many phones share one IP (carrier NAT, society Wi-Fi), and blocking a real lead is worse than a spam row. Turnstile (step 6) adds the stronger bot filter.
- **Same WhatsApp number within 10 minutes** is treated as a duplicate (returns success, stores nothing).
- **Notification outcome per channel** (`telegram_status`, `sheet_status`): the lead counts as delivered if either channel worked; a failed channel is retried independently.
- **Missing secrets in production are recorded as failures**, never silently stubbed. Stubs only run with `DEV_STUBS=1`.
- **Draft wording awaiting Akhil's approval:** the two success messages, the waitlist message, the WhatsApp opener he sends prospects, the reminder text.

Not built yet (deliberately deferred): Cal.com webhook + optional "pick a slot" link (needs the Cal.com account; the link shows when `PUBLIC_CAL_URL` is set),
`/status taking|limited|full` bot command (availability is still the `site.availability` setting), Turnstile widget (step 6), testimonial pipeline (step 4),
retention cleanup job (needs the retention periods confirmed).

Untested against real services: Telegram API calls, the Apps Script webhook and the deployed cron all ran only against local stand-ins. Test them once with the real accounts (SETUP.md §4).

## 10. Revisions after review (Sept 2026)

- **Brand name is now "Akhil’s Fitness Coaching"** (was "Akhil Fitness" in PRD v1.1 / Design System V5.1). Single source: `site.name` in `src/data/site.ts` and the `Wordmark` component. The logo remains a text wordmark; the OG image and QR posters must use the new name.
- **Hero eyebrow** under the availability pill: "Personal training with Akhil" (was "Personal training").
- **Connect layout:** trial intro on the left and form on the right (stacked on phones); **"What happens next?" is a horizontal row below the form** (4 across from 700px, 2×2 on phones); Questions follow. Replaces the vertical side column in PRD §47 layout.
- **All icons are Lucide** (`lucide-static`, emitted as one SVG sprite in `IconSprite.astro`). Design System V5.1's hand-drawn icon set is superseded. Lucide has no WhatsApp logo, so WhatsApp buttons use Lucide `message-circle` and always carry the word "WhatsApp" or an aria-label. If a recognisable WhatsApp glyph is wanted on icon-only buttons, that needs a non-Lucide brand mark (decision for Akhil).
