# Telegram join → client_id mapping (Phase 1)

**Date:** 2026-06-15
**Status:** Design — pending review
**Scope:** Capture and persist `client_id ↔ telegram_user_id ↔ username` when a user actually joins the Telegram channel. **Mapping only.** No removal, no trading checks, no activity-based actions — those are explicitly a later phase.

---

## 1. Goal & non-goals

**Goal:** From the moment this ships, every user who joins the channel via one of our minted invite links has their Telegram identity (`user_id`, and `username`/`first_name` when present) recorded onto their existing `entries` row, keyed by `client_id`. This builds the mapping that future features (removal, analytics, re-admit) will stand on.

**Non-goals (Phase 2+, deliberately excluded):**
- Removing / banning anyone.
- Calling any Lemonn trading-status API.
- Any scheduled job / cron / sweep.
- Re-admitting users.
- **Changing the consume logic.** The `/join` route is **untouched** in Phase 1; `invite_state='consumed'` is still set on the button click as it is today. Moving consume to the webhook (so it fires on the *real* join — which fixes the "clicked-but-didn't-join → stuck with an expired link" dead-end) is a deliberate fast-follow, **gated on the webhook being proven reliable in prod first.** Decided 2026-06-15.
- Backfilling the **existing** members already in the channel (impossible retroactively via the Bot API — see §9). This is **going-forward only.**

**Top constraint:** the site is **live and in use**. Nothing here may alter or risk the existing `/callback → /welcome → /join` funnel. The design is purely additive (new route + new nullable columns the funnel never reads or writes).

---

## 2. How the mapping is captured (mechanism)

We already mint **one unique, single-use invite link per `client_id`** (`src/lib/telegram.ts`, `createChatInviteLink`, `member_limit:1`), and store its URL in `entries.invite_url` (`saveIssued`).

When a user **actually joins** the channel on Telegram (not when they click our button — when their membership status flips to *member*), Telegram sends the bot a `chat_member` update. That update carries:

- `new_chat_member.user.id` — the numeric Telegram **user_id** (always present).
- `new_chat_member.user.username` — the **@handle** (Optional — only if the user set one).
- `new_chat_member.user.first_name` — always present (fallback label).
- `invite_link.invite_link` — the **exact invite-link URL** they joined with ("for joining by invite link events only").

Because link ↔ `client_id` is 1:1, we match `invite_link.invite_link` against `entries.invite_url` and write the Telegram identity onto that row.

**Verified facts (Telegram Bot API):**
- `chat_member` updates are **NOT** delivered by default. The bot **must be a channel admin** AND `setWebhook` must pass `allowed_updates: ["chat_member"]`. Miss either → zero events.
- Our links are **direct-join** (no `creates_join_request`), so a join produces a `chat_member` event immediately (not a `chat_join_request`).
- `user.id` is required; `username` is optional. So **`user_id` is guaranteed; `username` is best-effort.**

---

## 3. Data model — additive migration

New migration `supabase/migrations/<timestamp>_add_telegram_mapping.sql`. Both columns nullable, no defaults, no changes to existing columns/constraints.

```sql
alter table public.entries
  add column telegram_user_id  bigint,   -- numeric Telegram id (guaranteed on join)
  add column telegram_username text;      -- @handle without '@' (nullable: optional in Telegram)

-- NON-unique on purpose: invite_url is '' during claim and repeats for placeholder-mode rows.
create index entries_invite_url_idx on public.entries (invite_url);
```

**Decided scope (2026-06-15):** only the two core mapping columns. `first_name`, `joined_at`, `membership_state`, `left_at` and leave/kick tracking are deferred to a later phase (additive then too). The `(influencer, telegram_user_id)` index is also deferred — the removal phase that queries by user_id can add it.

**Why this is safe on a live DB:**
- Adding nullable columns with no default is a **metadata-only** change in Postgres (no table rewrite, no long lock).
- The `CHECK` is satisfied by `NULL` for all existing rows, so it validates instantly.
- The `updated_at` IST trigger fires on the webhook's UPDATE automatically — consistent with the rest of the table.
- If the `entries` table is ever large, create the indexes with `CREATE INDEX CONCURRENTLY` (outside a txn) to avoid a write lock. For a one-row-per-user table this is not a concern.

---

## 4. New inbound route — `POST /api/telegram/webhook`

New file `src/app/api/telegram/webhook/route.ts`, same conventions as `src/app/join/route.ts`:

```ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) { /* withLogContext → handler */ }
```

**Handler logic (in order):**

1. **Auth:** constant-time compare the `X-Telegram-Bot-Api-Secret-Token` header against `env.TELEGRAM_WEBHOOK_SECRET`. Missing/mismatch, or secret unset → **403**, do nothing.
2. **Parse** JSON body. Only act on `update.chat_member`; anything else → **200** ignore.
3. **Scope guard:** ignore unless `chat.id` matches `env.TELEGRAM_CHANNEL_ID` → **200** ignore.
4. **Identify a join-by-link event.** `invite_link` is populated *only* on a join-via-invite-link event, so use it as the gate: act only when `invite_link` is present AND `new_chat_member.status` ∈ {`member`, `restricted`(is_member), `administrator`, `creator`}. Everything else — leaves, kicks, admin-rights changes, joins without a link — → **200** ignore. (Leave/kick tracking is deferred; no column for it in Phase 1.)
5. **Record the mapping:**
   - Extract `user.id`, `user.username`, and `invite_link.invite_link`.
   - `recordTelegramJoin(influencer = env.INFLUENCER_SLUG, inviteUrl, { userId, username })`.
   - If 0 rows matched → log `telegram.join.unmatched` + **200**.
6. **Responses:** **200** for handled/ignored; **500** only on a transient DB error so Telegram retries. Never throw uncaught.
7. **Idempotent:** re-delivery of the same event re-writes the same values — no harm.

**Security note:** the route is public (Telegram must reach it). Safety comes from the secret-token header, and from the route only ever writing the new `telegram_*` columns — even a bad actor with the URL but not the secret gets 403, and even a malformed-but-authed payload can't corrupt the funnel.

---

## 5. Store functions — `src/lib/invites-store.ts`

One new function, touching **only** the two new columns (so the no-clobber guarantee holds):

```ts
// Returns whether a row matched (so the route can log unmatched joins).
export async function recordTelegramJoin(
  influencer: string,
  inviteUrl: string,
  tg: { userId: number; username: string | null },
): Promise<{ matched: boolean }>;
//   UPDATE entries SET telegram_user_id = $userId, telegram_username = $username
//   WHERE influencer = $influencer AND invite_url = $inviteUrl AND invite_url <> ''
//   (.select() to get matched row count)
```

The `entries_set_updated_at` trigger bumps `updated_at` automatically on this UPDATE — consistent with the rest of the table.

---

## 6. Webhook registration — one-time, out of the live path

A small script `scripts/set-telegram-webhook.ts` (run manually; or an equivalent `curl`):

1. `getWebhookInfo` first — **confirm no existing webhook** is set on this bot and note `pending_update_count` (safety: this bot is currently outbound-only — no `getUpdates`/webhook consumer in the codebase — but we verify before changing global bot state).
2. `setWebhook` with:
   - `url`: `https://<prod-domain>/api/telegram/webhook`
   - `secret_token`: `env.TELEGRAM_WEBHOOK_SECRET`
   - `allowed_updates: ["chat_member"]` (only this — we won't receive messages etc.)
3. Reversible: `deleteWebhook` instantly stops all ingestion (route goes dormant, columns stay harmlessly).

---

## 7. Config — new env var

Add to `src/lib/env.ts` (consistent with the other optional Telegram vars, so the app still boots without it):

```ts
TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
```

Generate with `openssl rand -hex 32`. When unset, the webhook route returns 403 (feature dormant).

---

## 8. Rollout — zero-downtime, fully reversible

Each step is independently safe; the funnel is never touched.

1. **Apply migration** (additive nullable columns) — safe anytime; live code ignores them.
2. **Deploy** the code (webhook route + store fns + env). Route is **dormant** — Telegram isn't calling it yet.
3. **Bot is already a channel admin** (confirmed 2026-06-15 — it mints real links in prod today, which itself requires admin). `chat_member` delivery only needs admin status, which it has. (Ban rights aren't needed until the Phase 2 removal work.)
4. **`getWebhookInfo`** — confirm no existing webhook.
5. **`setWebhook`** against the production URL with the secret + `allowed_updates`.
6. **Live smoke test:** a test account joins via a freshly minted link **on mobile** (desktop `tg://join` can silently no-op per prior lessons) → confirm the row gets `telegram_user_id` + `membership_state='member'`.

**Rollback:** `deleteWebhook` → ingestion stops instantly. Code and columns are inert when idle.

---

## 9. Known limitation — existing members

Everyone **already** in the channel cannot be mapped retroactively: the Bot API can't list members, and a past join doesn't expose which link (hence `client_id`) it used. A one-off `messages.getChatInviteImporters` recovery exists but needs an **admin user-account** MTProto session (bots can't call it) and may fail on our expired 24h links. **Out of scope here** — documented so it isn't forgotten.

---

## 10. Testing

- **Pure parser unit tests:** extract "is this a join-by-link event, and what are the fields?" into a pure function and test it with fixture payloads (join via link, join without link, leave, kick, admin-rights change, missing username). The repo has **no test runner today** — this adds **vitest** for `src/lib` units only (no build/runtime impact). [Decided: yes.]
- **Live smoke test:** the mobile join in §8 step 6 — the only true proof of end-to-end delivery.
- **Manual unmatched/permission checks:** join via a non-minted link (expect `unmatched` log + 200); bot not admin (expect zero events — validates the prerequisite).

---

## 11. Decisions (resolved 2026-06-15)

1. **Column set:** **just `telegram_user_id` + `telegram_username`.** Bonus columns + leave tracking deferred.
2. **Leave/kick tracking:** **deferred** (no column for it in Phase 1).
3. **Testing:** **add vitest** for the parser unit tests.
4. **Webhook trigger:** **committed `scripts/set-telegram-webhook.ts`** (runs `getWebhookInfo` first).
5. **Prerequisite confirmed:** prod mints real `t.me` links and the bot is **already a channel admin** — so the webhook's main prerequisite is already satisfied.
