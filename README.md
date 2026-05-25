# Influencer → Lemonn → Telegram

Landing page → Lemonn OAuth (OTP + PIN) → eligibility check → single-use Telegram invite link (or `/non-eligible`). The invite link is delivered to the user via an httpOnly cookie so it never appears in the page DOM, URL bar, or browser history — only the final `t.me/+...` redirect is visible.

This app is single-tenant — one deployment per influencer. Currently configured for **Booming Bulls**. To onboard a new influencer, clone the repo (or fork), deploy as a new Vercel project, and fill in their env values. No code changes.

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
    │   2. POSTs to LEMONN_SESSION_TOKEN_URL → receives access_token
    │   3. Calls eligibility endpoint (default: true while LEMONN_ELIGIBILITY_URL is empty)
    │   4. Calls Telegram createChatInviteLink:
    │        chat_id = TELEGRAM_CHANNEL_ID
    │        member_limit = 1
    │        expire_date = now + 24h
    │        name = "lemonn:<client_id>"
    │      → fresh https://t.me/+xxxxx (unique per user)
    │   5. Wraps the URL in an HMAC-signed invite-token (key from INVITE_TOKEN_SECRET)
    │   6. Sets the token as httpOnly cookie "lemonn_invite_token"
    │   7. 307 → /welcome
    ▼
[ /welcome ]
    │   Reads cookie. If missing or invalid → /
    │   Renders only a "Join Channel" button. No URL visible anywhere.
    ▼ user clicks
[ /join ]
    │   Reads cookie → verifyInviteToken → extracts t.me URL
    │   Clears cookie (one-shot)
    │   307 → t.me/+xxxxx
    ▼
[ Telegram app opens → user joins channel ]
```

Ineligible (or any failure along the way) → redirect to `/non-eligible`.

## Lemonn OAuth — partner onboarding

Partners are onboarded **offline** by Lemonn. During onboarding you provide:

- A **static outbound IP** for allowlisting (Vercel native or QuotaGuard — see Deployment).
- A **redirect URL** (HTTPS in prod; `http://localhost:3000/callback` for dev).

Lemonn issues:

- `LEMONN_API_KEY` (the public key, in hex)
- `LEMONN_SECRET_KEY` (32-byte Ed25519 private seed, hex-encoded — **shared only once**, store securely)
- Validity: 1 year

> **Eligibility endpoint not yet provided.** While `LEMONN_ELIGIBILITY_URL` is empty, `checkEligibility` returns `true` with a server log warning so the rest of the flow can be tested. The expected response field (`eligible` or `is_eligible`) is a best-effort guess; confirm with Lemonn and update `src/lib/lemonn.ts::checkEligibility` once they share the contract.

## Telegram — channel onboarding

To go live on a real channel, the influencer (channel owner) must:

1. **Add our bot as an admin** on their channel with **only** the "Invite Users via Link" permission. The bot needs no other permissions.
2. **Share the channel ID** (numeric, starts with `-100`). Easiest way: forward any one message from the channel to [@JsonDumpBot](https://t.me/JsonDumpBot) — it returns the JSON containing `chat.id`.

The bot itself is created via [@BotFather](https://t.me/BotFather). We hold the token; the influencer never sees it. Suggested naming convention: display name `<Influencer> Access`, username `@<influencer>_access_bot` (e.g., `@boomingbulls_access_bot`).

Each successful eligible login generates a **fresh** invite link with `member_limit: 1` and a 24-hour `expire_date`. Even if a user shares the link, only the first person to click it joins — the link is dead after that. Telegram's admin UI displays each generated link labeled `lemonn:<client_id>` for auditing.

## Environment variables

Create `.env.local` in the project root with the following keys. Server vars are required (the app refuses to boot if any are missing or malformed). `NEXT_PUBLIC_*` vars are exposed to the browser — never put secrets here.

```bash
# ─── Lemonn credentials (issued offline; secret shared only once) ───────────
LEMONN_API_KEY=
# 64-char hex (32-byte Ed25519 seed). Do NOT put a trailing comment on this line.
LEMONN_SECRET_KEY=

# ─── Lemonn endpoints ───────────────────────────────────────────────────────
LEMONN_LOGIN_URL=https://lemonn-pro.lemonn.co.in/login
LEMONN_SESSION_TOKEN_URL=https://cs-prod.lemonn.co.in/api-trading/api/v1/generate_session_token
# Leave empty until Lemonn provides the URL. While empty, all users default to eligible (with a log warning).
LEMONN_ELIGIBILITY_URL=

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
NEXT_PUBLIC_INFLUENCER_NAME=Booming Bulls
NEXT_PUBLIC_INFLUENCER_TAGLINE=Join my premium Telegram channel
NEXT_PUBLIC_INFLUENCER_LOGO_URL=
NEXT_PUBLIC_BRAND_PRIMARY_COLOR=#111111
NEXT_PUBLIC_NON_ELIGIBLE_MESSAGE=You need an active Lemonn account to join this channel. Complete your account setup and try again.
```

## Architecture

```
src/
├── app/
│   ├── layout.tsx              ← root layout, branding-aware metadata
│   ├── page.tsx                ← /  landing page with Login button
│   ├── callback/route.ts       ← /callback  Lemonn handshake + Telegram link + cookie
│   ├── welcome/route is a page ← /welcome   reads cookie, renders Join button
│   ├── join/route.ts           ← /join      verifies cookie, 307s to t.me, clears cookie
│   └── non-eligible/page.tsx   ← /non-eligible
├── lib/
│   ├── env.ts                  ← zod-validated env (fail-fast on boot)
│   ├── lemonn.ts               ← Ed25519 signing, session-token exchange, eligibility
│   ├── telegram.ts             ← createChatInviteLink wrapper (member_limit:1)
│   ├── invite-token.ts         ← HMAC sign/verify of the cookie payload
│   ├── branding.ts             ← typed NEXT_PUBLIC_* reader
│   └── utils.ts                ← shadcn cn() helper
├── components/
│   ├── login-button.tsx        ← builds Lemonn login URL with api_key
│   ├── join-channel-button.tsx ← client component, links to /join, right-click disabled
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
| `src/lib/lemonn.ts` | OAuth flow, Ed25519 signing, session exchange, eligibility check | **Live**, except eligibility URL is still TBD (see above). |
| `src/lib/telegram.ts` | `issueInviteLink(user)` — calls `createChatInviteLink` with `member_limit: 1` | **Live** when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHANNEL_ID` are set; falls back to `TELEGRAM_PLACEHOLDER_URL` otherwise. |
| `src/lib/invite-token.ts` | HMAC-SHA256 sign/verify for the cookie | **Live**. |

### Cryptography — two distinct schemes

| | Lemonn signature | Invite-token |
|---|---|---|
| Algorithm | Ed25519 (asymmetric) | HMAC-SHA256 (symmetric) |
| Key | `LEMONN_SECRET_KEY` | derived from `INVITE_TOKEN_SECRET` |
| Who verifies | Lemonn's server | This app's `/welcome` and `/join` routes |
| Purpose | Prove "this request comes from the partner who owns api_key X" | Prove "this cookie was issued by our server, unaltered, still in date" |
| Lives in | HTTP header `x-signature` (outbound) | httpOnly cookie `lemonn_invite_token` |

### Testing without real Lemonn credentials

Hitting `/callback` with no params (or a stale / forged request_token) returns the not-eligible branch:

- `http://localhost:3000/callback` → redirects to `/non-eligible` (`reason=missing_request_token`)
- `http://localhost:3000/callback?request_token=fake` → redirects to `/non-eligible` (`reason=session_exchange_failed`, logged server-side as `Invalid signature` from Lemonn)

To test the eligible branch you need real Lemonn credentials and to complete a real login on `lemonn-pro.lemonn.co.in`.

The `scripts/` directory contains three diagnostic helpers (instructions inside each file):

- `node scripts/derive-public-key.mjs` — prints the Ed25519 public key derived from your secret, so you can ask Lemonn to confirm it matches what they have on file.
- `node scripts/self-verify-signature.mjs <request_token>` — signs a message and verifies locally; useful to prove the math is right before pinging Lemonn support.
- `python3 scripts/verify_with_python.py <request_token>` — runs Lemonn's exact published Python sample against your env. If this passes locally but Lemonn rejects, the bug is on Lemonn's side.

## Deployment

- **Host**: Vercel (Pro plan required for Vercel native Static IPs).
- **Static IP** (Lemonn requires this for allowlisting your outbound traffic):
  - **Option A — Vercel native Static IPs**: $100/mo per project + Private Data Transfer. Toggle in Project Settings → Networking.
  - **Option B — QuotaGuard proxy**: ~$19/mo, dedicated IP, set `QUOTAGUARD_STATIC_URL` env var and route Lemonn `fetch` calls through it.
- **Runtime**: all Lemonn / Telegram / crypto calls live in `src/lib/`, invoked only from route handlers pinned to `runtime = "nodejs"`. Middleware/edge bypasses static IPs and lacks Node's `crypto` primitives we use, so do **not** move these calls there.

## Security notes

- **Server secrets** (`LEMONN_SECRET_KEY`, `INVITE_TOKEN_SECRET`, `TELEGRAM_BOT_TOKEN`) must be marked "Sensitive" in Vercel project settings.
- **No `NEXT_PUBLIC_` prefix on secrets** — those values are inlined into the client bundle at build time.
- **Bot token scrubbing**: any error thrown from `src/lib/telegram.ts` runs through `scrubToken()` so the token never appears in stack traces sent to log shippers.
- **Lemonn error sanitization**: `src/lib/lemonn.ts` only logs `{ status, msg, error_code }` from Lemonn responses; the `data` field (which contains `access_token`) is never logged.
- **Cookie hardening**: `lemonn_invite_token` is `httpOnly` (no JS access), `sameSite=Lax`, `secure` in production, and HMAC-signed.

## Known open items

| | Item | Where |
|---|---|---|
| C1 | CSRF state cookie on `/callback` to prevent callback-injection attacks. | `src/app/callback/route.ts` |
| C2 | Validate `https://t.me/+` prefix in `/join` before redirecting (defense-in-depth). | `src/app/join/route.ts` |
| M1 | Rate limiting on `/callback` (Vercel WAF rule). | platform |
| M2 | Security headers (HSTS, X-Frame-Options, Referrer-Policy, CSP) in `next.config.ts`. | `next.config.ts` |
| M3 | `URLSearchParams.forEach` collapses duplicate keys; switch to `get(key)` per field. | `src/app/callback/route.ts` |
| M5 | Better UX on `/callback` retry — distinguish "token already used" from "not eligible". | `src/lib/lemonn.ts` |
| — | **Lifetime-cap loophole**: same Lemonn user can log in repeatedly to farm fresh invite links. Needs Vercel KV. | `src/lib/telegram.ts` |
| — | Wire `LEMONN_ELIGIBILITY_URL` when Lemonn ships it. | `src/lib/lemonn.ts::checkEligibility` |
| — | Real branding values (`NEXT_PUBLIC_INFLUENCER_LOGO_URL`, `..._BRAND_PRIMARY_COLOR`) from the influencer. | env / Vercel |

## Adding a new influencer

1. Fork this repo (or create a separate Vercel project pointing at the same repo).
2. Set this new influencer's `LEMONN_API_KEY`, `LEMONN_SECRET_KEY`, `INVITE_TOKEN_SECRET` (fresh `openssl rand -hex 32`), `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHANNEL_ID`, and branding envs.
3. Register the new deployment's domain + static IP with Lemonn (offline).
4. Add the new bot as admin on the influencer's Telegram channel ("Invite Users via Link" permission).
5. Deploy.
