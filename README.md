# Influencer → Lemonn → Telegram

Landing page → Lemonn OAuth (OTP + PIN) → user-details check → eligibility decision tree → single-use Telegram invite link (or a dedicated ineligibility page). The invite link is delivered to the user via an httpOnly cookie so it never appears in the page DOM, URL bar, or browser history — only the final `t.me/+...` redirect is visible to the user when they click "Join Channel".

This app is single-tenant — one deployment per influencer. Currently configured for **Influencer**. To onboard a new influencer, clone the repo (or fork), deploy as a new Vercel project, and fill in their env values. No code changes.

## Tech stack

- Next.js 16 (App Router, Turbopack, Node runtime for routes that talk to Lemonn / Telegram)
- React 19
- Tailwind v4
- shadcn/ui (Base UI primitives)
- zod for env validation
- Node `crypto` — Ed25519 for Lemonn signature, HMAC-SHA256 for the invite-token cookie

## Local setup

```bash
npm install
# 1. Create .env.local using the template below
# 2. Fill in real values (see "Environment variables")
npm run dev
```

Visit `http://localhost:3000`.

## End-to-end flow

```
[ User on / ]
    │ clicks "Login with Lemonn"
    ▼
[ lemonn-pro.lemonn.co.in/login?api_key=… ]
    │ user enters phone → OTP → PIN
    ▼
[ /callback?client_id=…&request_token=… ]   (registered with Lemonn offline)
    │   1. Ed25519-signs (request_token + api_key) using LEMONN_SECRET_KEY
    │   2. GETs LEMONN_USER_DETAILS_URL with headers
    │        x-api-key, x-request-token, x-signature, x-request-id
    │      → returns user details (is_dra_matched, kyc_status, FNO statuses, name, …)
    │   3. Runs the eligibility decision tree (see below)
    │   4. For "eligible" only:
    │      calls Telegram createChatInviteLink:
    │        chat_id = TELEGRAM_CHANNEL_ID
    │        member_limit = 1
    │        expire_date = now + 24h
    │        name = "lemonn:<id>"   (the user's name, or rt:<request-token-prefix>)
    │      → fresh https://t.me/+xxxxx (unique per user)
    │      wraps the URL in an HMAC-signed invite-token (key from INVITE_TOKEN_SECRET)
    │      sets the token as httpOnly cookie "lemonn_invite_token"
    │      307 → /welcome
    │   5. For any other outcome: 307 directly to the matching page.
    ▼
[ /welcome ]      (eligible users only — cookie required)
    │   Reads cookie. If missing or invalid → /
    │   Renders only a "Join Channel" button (HTML form posting to /join).
    │   No URL visible anywhere.
    ▼ user clicks (form submit, POST)
[ POST /join ]
    │   Reads cookie → verifyInviteToken → extracts t.me URL
    │   Clears cookie (one-shot)
    │   303 → t.me/+xxxxx
    │
    │   (Direct GET to /join — URL bar, crawler, prefetch — 303s to /
    │    without touching the cookie. POST-only avoids browsers
    │    speculatively burning the cookie before a real click.)
    ▼
[ Telegram app opens → user joins channel ]
```

## Eligibility decision tree

The logic lives in `decideOutcome()` in `src/lib/lemonn.ts`. First failing check wins; later checks assume earlier ones passed. Missing/undefined fields are treated as "fail" so malformed Lemonn responses can never accidentally pass.

```
fetch-user-details ──► is_dra_matched ──┬─ false ──────────────────────────► /not-associated
                                        │
                                        └─ true ──► kyc_status ──┬─ !COMPLETED ─► /kyc-pending
                                                                 │
                                                                 └─ COMPLETED ──► nse_fno && bse_fno ──┬─ !TRADE_READY ─► /not-trade-ready
                                                                                                       │
                                                                                                       └─ TRADE_READY ──► /welcome ✅
```

| Outcome | Landing page |
|---|---|
| `is_dra_matched !== true` | `/not-associated` |
| `kyc_status !== "COMPLETED"` | `/kyc-pending` (links out to `https://kyc.lemonn.co.in`) |
| `nse_fno_status !== "TRADE_READY"` OR `bse_fno_status !== "TRADE_READY"` | `/not-trade-ready` |
| All pass | `/welcome` (invite-link cookie set) |
| `request_token` missing (direct `/callback` hit) | `/` |
| Lemonn API errored | `/error-page` |
| Telegram `createChatInviteLink` errored after retries | `/error-page` |

## Lemonn — partner onboarding

Partners are onboarded **offline** by Lemonn. During onboarding you provide a registered redirect URL (HTTPS in prod; `http://localhost:3000/callback` for dev).

Lemonn issues:

- `LEMONN_API_KEY` (the public key, in hex)
- `LEMONN_SECRET_KEY` (32-byte Ed25519 private seed, hex-encoded — **shared only once**, store securely)
- `LEMONN_REQUEST_ID` (per-partner allowlisted value for the `x-request-id` header; ask Lemonn what your value is — `canary-app-123` worked during integration testing)
- Validity: 1 year

Single API call after Lemonn redirects the user back:

```
GET https://cs-prod.lemonn.co.in/api-trading/api/v1/fetch-user-details
Headers:
  x-api-key:        <LEMONN_API_KEY>
  x-request-token:  <UUID from the callback URL>
  x-signature:      Ed25519(request_token + api_key) with LEMONN_SECRET_KEY
  x-request-id:     <LEMONN_REQUEST_ID>

Response (200 OK):
{
  "status": "success",
  "msg": "User details fetched successfully",
  "data": {
    "is_dra_matched": true,
    "name": "HARSH TODI",
    "kyc_status": "COMPLETED",
    "nse_cash_status": "TRADE_READY",
    "bse_cash_status": "TRADE_READY",
    "nse_fno_status": "TRADE_READY",
    "bse_fno_status": "TRADE_READY",
    "fno_order_executed": false,
    "fno_order_executed_at": null
    // additional fields may be added by Lemonn over time
  }
}
```

## Telegram — channel onboarding

To go live on a real channel, the influencer (channel owner) must:

1. **Add our bot as an admin** on their channel with **only** the "Invite Users via Link" permission. The bot needs no other permissions.
2. **Share the channel ID** (numeric, starts with `-100`). Easiest way: forward any one message from the channel to [@JsonDumpBot](https://t.me/JsonDumpBot) — it returns the JSON containing `chat.id`.

The bot itself is created via [@BotFather](https://t.me/BotFather). We hold the token; the influencer never sees it. 

Each successful eligible login generates a **fresh** invite link with `member_limit: 1` and a 24-hour `expire_date`. Even if a user shares the link, only the first person to click it joins — the link is dead after that. Telegram's admin UI displays each generated link labeled `lemonn:<id>` for auditing (`<id>` resolves to the user's `name` from Lemonn's response, e.g., `lemonn:HARSH TODI`, truncated to 25 chars; falls back to `rt:<request-token-prefix>` when no `name` field is returned).

## Environment variables

Create `.env.local` in the project root with the following keys. Server vars are required (the app refuses to boot if any are missing or malformed). `NEXT_PUBLIC_*` vars are exposed to the browser — never put secrets here.

```bash
# ─── Lemonn credentials (issued offline; secret shared only once) ───────────
LEMONN_API_KEY=
# 64-char hex (32-byte Ed25519 seed). Do NOT put a trailing comment on this line.
LEMONN_SECRET_KEY=

# ─── Lemonn endpoints ───────────────────────────────────────────────────────
LEMONN_LOGIN_URL=https://lemonn-pro.lemonn.co.in/login
LEMONN_USER_DETAILS_URL=https://cs-prod.lemonn.co.in/api-trading/api/v1/fetch-user-details
# Per-partner allowlisted x-request-id value. Ask Lemonn for the official value;
# canary-app-123 was the dev/integration default. Anything else (e.g. UUIDs)
# returns a misleading 401 "Invalid access token format".
LEMONN_REQUEST_ID=canary-app-123

# ─── Telegram (real values once bot is admin on the channel) ────────────────
# From @BotFather after /newbot. Looks like 123456789:ABC…
TELEGRAM_BOT_TOKEN=
# Numeric channel id, e.g. -1001234567890. Get via @JsonDumpBot.
TELEGRAM_CHANNEL_ID=
# Fallback shown only if BOT_TOKEN or CHANNEL_ID above are empty (placeholder mode).
TELEGRAM_PLACEHOLDER_URL=https://t.me/+placeholder

# ─── App-internal secret for signing the invite-token cookie ────────────────
# Generate once per deployment with: openssl rand -hex 32
# Kept separate from LEMONN_SECRET_KEY so Lemonn key rotation doesn't break
# in-flight user sessions, and vice versa.
INVITE_TOKEN_SECRET=

# ─── Branding (safe to expose to the browser) ───────────────────────────────
NEXT_PUBLIC_INFLUENCER_NAME=
NEXT_PUBLIC_INFLUENCER_TAGLINE=
# Support WhatsApp shown on the error / already-member pages. Digits only,
# country code included, no "+" (e.g. 917828599621). Defaults to 917828599621.
NEXT_PUBLIC_SUPPORT_WHATSAPP=

# ─── Optional: dev test mode (delete src/app/test/ to remove entirely) ──────
# When "true", enables the /test page and /test/run/<kind> endpoints to mock
# every branch of the decision tree without going through Lemonn.
# Read directly from process.env (NOT validated in env.ts), so removing this
# variable is a no-op for the rest of the app.
ENABLE_TEST_MODE=
```

## Architecture

```
src/
├── app/
│   ├── layout.tsx              ← root layout, branding-aware metadata
│   ├── page.tsx                ← /  landing page with Login button
│   ├── callback/route.ts       ← /callback  Lemonn handshake + dispatch
│   ├── welcome/page.tsx        ← /welcome   reads cookie, renders Join button
│   ├── join/route.ts           ← /join      POST: verifies cookie, 303s to t.me, clears cookie. GET: 303 to / (no cookie touch).
│   ├── not-associated/         ← /not-associated   is_dra_matched=false
│   ├── kyc-pending/            ← /kyc-pending      kyc_status != COMPLETED
│   ├── not-trade-ready/        ← /not-trade-ready  FNO status check
│   ├── error-page/             ← /error-page       transient/auth failure
│   └── test/                   ← /test + /test/run/<kind>  (deletable; see below)
├── lib/
│   ├── env.ts                  ← zod-validated env (fail-fast on boot)
│   ├── lemonn.ts               ← Ed25519 signing, fetch-user-details, decideOutcome
│   ├── telegram.ts             ← createChatInviteLink wrapper (member_limit:1, with retry)
│   ├── invite-token.ts         ← HMAC sign/verify of the cookie payload
│   ├── branding.ts             ← typed NEXT_PUBLIC_* reader
│   └── utils.ts                ← shadcn cn() helper
├── components/
│   ├── login-button.tsx        ← builds Lemonn login URL with api_key
│   ├── join-channel-button.tsx ← client component, HTML form posting to /join, synchronous double-submit guard
│   └── ui/{button,card}.tsx    ← shadcn / Base UI
└── ...
scripts/
├── derive-public-key.mjs       ← diagnostic: derive Ed25519 pubkey from secret
├── self-verify-signature.mjs   ← diagnostic: prove our signature math is correct
└── verify_with_python.py       ← diagnostic: run Lemonn's exact Python sample against our values
```

### Swappable adapters

| File | Purpose | Status |
|---|---|---|
| `src/lib/lemonn.ts` | Ed25519 signing, fetch-user-details, eligibility decision tree | **Live**. |
| `src/lib/telegram.ts` | `issueInviteLink(user)` — calls `createChatInviteLink` with `member_limit: 1`, retries network errors once | **Live** when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID` are set; falls back to `TELEGRAM_PLACEHOLDER_URL` otherwise. |
| `src/lib/invite-token.ts` | HMAC-SHA256 sign/verify for the cookie | **Live**. |

### Cryptography — two distinct schemes

| | Lemonn signature | Invite-token |
|---|---|---|
| Algorithm | Ed25519 (asymmetric) | HMAC-SHA256 (symmetric) |
| Key | `LEMONN_SECRET_KEY` | derived from `INVITE_TOKEN_SECRET` |
| Who verifies | Lemonn's server | This app's `/welcome` and `/join` routes |
| Purpose | Prove "this request comes from the partner who owns api_key X" | Prove "this cookie was issued by our server, unaltered, still in date" |
| Lives in | HTTP header `x-signature` (outbound) | httpOnly cookie `lemonn_invite_token` |

## Test mode — `/test` (deletable)

Everything related to test mode lives inside `src/app/test/`. Three files:

- `src/app/test/data.ts` — mock data, decision dispatch, `isTestModeEnabled()` helper
- `src/app/test/page.tsx` — the visual `/test` page (decision tree + 5 cards)
- `src/app/test/run/[kind]/route.ts` — server route that runs the mocked outcome

Test mode is gated by the env var `ENABLE_TEST_MODE`. Set to `"true"` to enable, anything else (or unset) → both `/test` and `/test/run/<kind>` return 404.

**When test mode is enabled and somebody hits `/test/run/eligible`, a real Telegram invite link is created and a real channel join is possible — Lemonn is fully bypassed.** Keep this in mind on production.

To remove test mode entirely after you're done with it:

```bash
rm -rf src/app/test/
# and optionally remove the ENABLE_TEST_MODE env var from Vercel / .env.local
```

No other files reference anything inside `src/app/test/` — deleting the directory is a complete uninstall. `decideOutcome` (which the test harness reuses) stays in `src/lib/lemonn.ts` because the real flow needs it; nothing else moves.

### Testing without real Lemonn credentials

With `ENABLE_TEST_MODE=true`:

- Visit `http://localhost:3000/test` → click any "Test this outcome →" card.
- Or hit `/test/run/<kind>` directly: `not_associated`, `kyc_pending`, `not_trade_ready`, `eligible`.

Without test mode, hitting `/callback` with no params or a bad token routes to `/error-page` via the real flow.

The `scripts/` directory has three diagnostic helpers (instructions inside each file):

- `node scripts/derive-public-key.mjs` — prints the Ed25519 public key derived from your secret, so you can ask Lemonn to confirm it matches what they have on file.
- `node scripts/self-verify-signature.mjs <request_token>` — signs a message and verifies locally; useful to prove the math is right before pinging Lemonn support.
- `python3 scripts/verify_with_python.py <request_token>` — runs Lemonn's exact published Python sample against your env. If this passes locally but Lemonn rejects, the bug is on Lemonn's side.

## Deployment

- **Host**: Vercel (Hobby plan is sufficient — no static IP required).
- **Runtime**: all Lemonn / Telegram / crypto calls live in `src/lib/`, invoked only from route handlers pinned to `runtime = "nodejs"`. Middleware/edge bypasses Node's `crypto` primitives we use, so do **not** move these calls there.
- **Outbound IP allowlisting is no longer required** — Lemonn's `fetch-user-details` endpoint authenticates by signature only. If that ever changes, see commit history for the QuotaGuard / Vercel native comparison we evaluated.

## Security

- Server secrets (`LEMONN_SECRET_KEY`, `INVITE_TOKEN_SECRET`, `TELEGRAM_BOT_TOKEN`) must be marked **Sensitive** in Vercel project settings.
- The HMAC signing key for invite tokens is derived from `INVITE_TOKEN_SECRET` (not `LEMONN_SECRET_KEY`) — Lemonn rotations don't invalidate active sessions.
- Bot token and Lemonn error bodies are scrubbed before logging.
- Invite-token cookie is `httpOnly`, `secure` in production, `sameSite=Lax`, HMAC-signed, and cleared by `/join` after redirect.
- `/join` is **POST-only**. Browsers do not speculatively prefetch POST requests, so the single-shot cookie can only be consumed by a deliberate form submission. The GET handler 303s to `/` without touching the cookie. This closes a real-world bug where Chrome's omnibox prefetcher (and `link rel=prefetch` / Next.js Link prefetch) was firing GET `/join` ahead of the real click and burning the cookie.
- The Join button has a synchronous `useRef` double-submit guard so fast double-clicks can't fire two POSTs (which would leave the user stranded on `/` with the invite link orphaned).
- Telegram invite links are `member_limit: 1` + 24h `expire_date` — single-use even if leaked.

## Adding a new influencer

1. Fork this repo (or create a separate Vercel project pointing at the same repo).
2. Set this new influencer's `LEMONN_API_KEY`, `LEMONN_SECRET_KEY`, `LEMONN_REQUEST_ID`, `INVITE_TOKEN_SECRET` (fresh `openssl rand -hex 32`), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, and branding envs.
3. Register the new deployment's domain with Lemonn (offline).
4. Add the new bot as admin on the influencer's Telegram channel ("Invite Users via Link" permission only).
5. Deploy.
