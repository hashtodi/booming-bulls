# Telegram Join → client_id Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Git policy (repo owner's rule — STRICT):** Do NOT run any git commands. Each task ends with a **Checkpoint** giving a suggested commit message for the *owner* to run manually.

**Goal:** When a user actually joins the Telegram channel via their minted invite link, record their `telegram_user_id` and `telegram_username` onto their existing `entries` row — building the `client_id ↔ telegram_user_id` mapping, going forward.

**Architecture:** Purely additive. A new inbound route `POST /api/telegram/webhook` receives Telegram `chat_member` updates, a pure parser extracts the join fields, and one store function writes two new nullable columns matched by `invite_url`. The live `/callback → /welcome → /join` funnel is never touched and never reads/writes the new columns.

**Tech Stack:** Next.js 16.2.6 (App Router, route handlers), TypeScript, Supabase (`@supabase/supabase-js`, service-role), Zod, vitest (new, for the pure parser), Telegram Bot API.

**Spec:** `docs/superpowers/specs/2026-06-15-telegram-join-mapping-design.md`

**Prerequisite already satisfied:** prod mints real `t.me` links and the bot is already a channel admin — so `chat_member` delivery only needs `setWebhook` with `allowed_updates: ["chat_member"]`.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `vitest.config.ts` | Create | Minimal vitest config (node env, `src/**/*.test.ts`) |
| `package.json` | Modify | Add `vitest` devDep + `"test"` script |
| `src/lib/telegram-webhook.ts` | Create | **Pure** parser: `chat_member` update → join fields or ignore. No I/O, no env. |
| `src/lib/telegram-webhook.test.ts` | Create | vitest unit tests for the parser |
| `supabase/migrations/20260615120000_add_telegram_mapping.sql` | Create | Add `telegram_user_id`, `telegram_username` + non-unique `invite_url` index |
| `src/lib/env.ts` | Modify | Add `TELEGRAM_WEBHOOK_SECRET` (optional) |
| `src/lib/invites-store.ts` | Modify | Add `recordTelegramJoin()` — writes only the two new columns |
| `src/app/api/telegram/webhook/route.ts` | Create | Inbound webhook: secret check → parse → record → 200/500 |
| `scripts/set-telegram-webhook.mjs` | Create | One-time `getWebhookInfo` + `setWebhook` (run with `node`) |

---

## Task 1: Add vitest tooling

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1: Install vitest as a dev dependency**

Run: `npm install -D vitest`
Expected: `vitest` appears under `devDependencies` in `package.json`, install exits 0.

- [ ] **Step 2: Add a `test` script**

In `package.json`, add `"test": "vitest run"` to the `scripts` block so it reads:

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

// Vitest runs ONLY pure unit tests under src (currently the Telegram webhook
// parser). It never touches Next, the build, or runtime — it's dev-only.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Verify the runner works (no tests yet)**

Run: `npm test`
Expected: vitest starts and reports "No test files found" (or similar) and exits 0. (Real tests arrive in Task 2.)

- [ ] **Step 5: Confirm typecheck still clean**

Run: `npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Checkpoint (owner commits — do not run git):**
`chore: add vitest for unit tests`

---

## Task 2: Pure `chat_member` parser (TDD)

The parser is the only non-trivial logic, so it gets full test coverage. It is **pure**: it imports nothing from the app (no `env`, no `server-only`), takes a plain object, and returns a result. That keeps it trivially testable and reusable by the route.

**Files:**
- Create: `src/lib/telegram-webhook.test.ts`
- Create: `src/lib/telegram-webhook.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/telegram-webhook.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseChatMemberUpdate } from "./telegram-webhook";

describe("parseChatMemberUpdate", () => {
  it("returns a join with userId, username, inviteUrl for a join-via-link", () => {
    const r = parseChatMemberUpdate({
      chat_member: {
        chat: { id: -1001234567890 },
        invite_link: { invite_link: "https://t.me/+abc123" },
        new_chat_member: { status: "member", user: { id: 42, username: "neo" } },
      },
    });
    expect(r).toEqual({
      kind: "join",
      userId: 42,
      username: "neo",
      inviteUrl: "https://t.me/+abc123",
    });
  });

  it("username is null when the user has no @handle", () => {
    const r = parseChatMemberUpdate({
      chat_member: {
        invite_link: { invite_link: "https://t.me/+abc" },
        new_chat_member: { status: "member", user: { id: 7 } },
      },
    });
    expect(r).toEqual({
      kind: "join",
      userId: 7,
      username: null,
      inviteUrl: "https://t.me/+abc",
    });
  });

  it("ignores a join with no invite_link (joined some other way)", () => {
    const r = parseChatMemberUpdate({
      chat_member: { new_chat_member: { status: "member", user: { id: 1 } } },
    });
    expect(r).toEqual({ kind: "ignore", reason: "no_invite_link" });
  });

  it("ignores a leave (status left)", () => {
    const r = parseChatMemberUpdate({
      chat_member: {
        invite_link: { invite_link: "https://t.me/+abc" },
        new_chat_member: { status: "left", user: { id: 1 } },
      },
    });
    expect(r).toEqual({ kind: "ignore", reason: "status_left" });
  });

  it("ignores a kick (status kicked)", () => {
    const r = parseChatMemberUpdate({
      chat_member: {
        invite_link: { invite_link: "https://t.me/+abc" },
        new_chat_member: { status: "kicked", user: { id: 1 } },
      },
    });
    expect(r).toEqual({ kind: "ignore", reason: "status_kicked" });
  });

  it("ignores a restricted member who is not actually in the chat", () => {
    const r = parseChatMemberUpdate({
      chat_member: {
        invite_link: { invite_link: "https://t.me/+abc" },
        new_chat_member: {
          status: "restricted",
          is_member: false,
          user: { id: 1 },
        },
      },
    });
    expect(r).toEqual({ kind: "ignore", reason: "status_restricted" });
  });

  it("ignores updates that aren't chat_member", () => {
    expect(parseChatMemberUpdate({})).toEqual({
      kind: "ignore",
      reason: "not_chat_member",
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './telegram-webhook'` (file doesn't exist yet).

- [ ] **Step 3: Implement the parser**

Create `src/lib/telegram-webhook.ts`:

```ts
// Pure parsing of Telegram `chat_member` updates — NO I/O, NO env imports, so
// it stays trivially unit-testable and reusable by the webhook route.
//
// We only care about ONE event: a user JOINING our channel via an invite link.
// The `invite_link` field is populated by Telegram only for join-by-invite-link
// events, so its presence (plus a membership status) is the gate. Everything
// else — leaves, kicks, admin-rights changes, joins without a link — is ignored.

// Minimal shapes of the payload we read; extra keys are tolerated and ignored.
type TgUser = { id?: number; username?: string };
type TgChatMember = { status?: string; is_member?: boolean; user?: TgUser };
type TgInviteLink = { invite_link?: string };
type TgChatMemberUpdated = {
  chat?: { id?: number | string };
  new_chat_member?: TgChatMember;
  invite_link?: TgInviteLink;
};
export type TgUpdate = { chat_member?: TgChatMemberUpdated };

export type ParseResult =
  | { kind: "join"; userId: number; username: string | null; inviteUrl: string }
  | { kind: "ignore"; reason: string };

// Statuses that mean "is currently in the chat". `restricted` only counts when
// is_member === true (a restricted user can be restricted-but-not-in-the-chat).
const MEMBER_STATUSES = new Set([
  "member",
  "administrator",
  "creator",
  "restricted",
]);

export function parseChatMemberUpdate(update: TgUpdate): ParseResult {
  const cm = update.chat_member;
  if (!cm) return { kind: "ignore", reason: "not_chat_member" };

  const inviteUrl = cm.invite_link?.invite_link;
  if (!inviteUrl) return { kind: "ignore", reason: "no_invite_link" };

  const member = cm.new_chat_member;
  const status = member?.status;
  if (!status) return { kind: "ignore", reason: "no_status" };

  const isMember =
    MEMBER_STATUSES.has(status) &&
    (status !== "restricted" || member?.is_member === true);
  if (!isMember) return { kind: "ignore", reason: `status_${status}` };

  const userId = member?.user?.id;
  if (typeof userId !== "number") {
    return { kind: "ignore", reason: "no_user_id" };
  }

  return {
    kind: "join",
    userId,
    username: member?.user?.username ?? null,
    inviteUrl,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — all 7 tests green.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Checkpoint (owner commits — do not run git):**
`feat: add pure Telegram chat_member parser with tests`

---

## Task 3: Database migration (additive columns + index)

**Files:**
- Create: `supabase/migrations/20260615120000_add_telegram_mapping.sql`

> Filename note: the timestamp must sort **after** the latest existing migration (`20260609090009_consumed_reserves_link.sql`). `20260615120000` does. If your team generates migrations via the Supabase CLI, create it with `supabase migration new add_telegram_mapping` and paste the SQL body below instead.

- [ ] **Step 1: Create the migration file**

```sql
-- Phase 1 of Telegram membership tracking: map a user who JOINED the channel
-- back to their entries row. The webhook (POST /api/telegram/webhook) writes
-- these on a real channel join, matching the chat_member update's invite_link
-- against entries.invite_url.
--
-- SAFE ON LIVE: additive + nullable, no defaults, no changes to existing
-- columns/constraints. The /callback → /welcome → /join funnel never reads or
-- writes these. Both columns stay NULL for every existing row, so this is a
-- metadata-only change (no table rewrite) and is safe to apply before or after
-- the code ships.
alter table public.entries
  add column telegram_user_id  bigint,   -- numeric Telegram user id (always present on join)
  add column telegram_username text;      -- @handle without '@'; NULL if the user has none

-- Speeds up the webhook lookup (UPDATE ... WHERE invite_url = $1).
-- NON-unique on purpose: claim_invite seeds invite_url = '' and placeholder-mode
-- rows all share TELEGRAM_PLACEHOLDER_URL, so invite_url is not unique.
create index entries_invite_url_idx on public.entries (invite_url);
```

- [ ] **Step 2: Apply the migration**

Use your existing Supabase migration process — either:
- CLI: `supabase db push` (or `supabase migration up`), **or**
- Supabase dashboard → SQL Editor → run the SQL above.

Expected: success, no errors.

- [ ] **Step 3: Verify the columns and index exist**

Run this query (CLI `supabase db execute` or the SQL Editor):

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'entries'
  and column_name in ('telegram_user_id', 'telegram_username');

select indexname from pg_indexes
where tablename = 'entries' and indexname = 'entries_invite_url_idx';
```

Expected: 2 column rows (`telegram_user_id` = `bigint`, `telegram_username` = `text`, both `is_nullable = YES`) and 1 index row.

- [ ] **Step 4: Confirm the live funnel is unaffected (sanity)**

Confirm a normal login still works end to end on the current deployment (no code change yet — this just proves the additive migration didn't disturb anything): log in via the funnel and confirm you reach `/welcome` as before.

- [ ] **Checkpoint (owner commits — do not run git):**
`feat(db): add telegram_user_id + telegram_username to entries`

---

## Task 4: Add `TELEGRAM_WEBHOOK_SECRET` to env

**Files:**
- Modify: `src/lib/env.ts`

- [ ] **Step 1: Add the optional env var**

In `src/lib/env.ts`, inside `serverEnvSchema`, add `TELEGRAM_WEBHOOK_SECRET` directly below the existing Telegram block. Change:

```ts
  // Telegram (placeholder until bot is admin on the channel).
  // Allow empty string so .env.local can be templated with TELEGRAM_BOT_TOKEN= etc.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHANNEL_ID: z.string().optional(),
  TELEGRAM_PLACEHOLDER_URL: z.url(),
```

to:

```ts
  // Telegram (placeholder until bot is admin on the channel).
  // Allow empty string so .env.local can be templated with TELEGRAM_BOT_TOKEN= etc.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHANNEL_ID: z.string().optional(),
  TELEGRAM_PLACEHOLDER_URL: z.url(),

  // Shared secret echoed by Telegram in the X-Telegram-Bot-Api-Secret-Token
  // header on every webhook call (set via setWebhook's secret_token). The
  // /api/telegram/webhook route rejects requests whose header doesn't match.
  // Optional so the app still boots before the webhook is configured; while
  // unset the webhook route returns 403 (feature dormant).
  // Generate with `openssl rand -hex 32`.
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Set the secret locally and in prod**

Generate a value: `openssl rand -hex 32`. Add `TELEGRAM_WEBHOOK_SECRET=<value>` to `.env.local` and to the Vercel project's environment variables (Production). Use the **same** value you'll pass to `setWebhook` in Task 8.

- [ ] **Checkpoint (owner commits — do not run git):**
`feat(env): add TELEGRAM_WEBHOOK_SECRET`

---

## Task 5: `recordTelegramJoin` store function

**Files:**
- Modify: `src/lib/invites-store.ts`

- [ ] **Step 1: Add the function at the end of the file**

Append to `src/lib/invites-store.ts` (after `markConsumed`):

```ts
// Record the Telegram identity of a user who actually JOINED the channel, found
// by matching the invite-link URL they used against the row's invite_url. Writes
// ONLY the two telegram_* columns, so — like recordLogin — it can never clobber
// the invite lifecycle (invite_url / invite_state / expires_at / consumed_at).
// Returns whether a row matched, so the caller can log unmatched joins (e.g. a
// join via a link we didn't mint). The entries_set_updated_at trigger bumps
// updated_at automatically.
export async function recordTelegramJoin(
  influencer: string,
  inviteUrl: string,
  tg: { userId: number; username: string | null },
): Promise<{ matched: boolean }> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      telegram_user_id: tg.userId,
      telegram_username: tg.username,
    })
    .eq("influencer", influencer)
    .eq("invite_url", inviteUrl)
    .neq("invite_url", "") // never match the claim_invite placeholder ('')
    .select("client_id");

  if (error) {
    throw new Error(`entries recordTelegramJoin failed: ${error.message}`);
  }
  return { matched: (data?.length ?? 0) > 0 };
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0. (No unit test here — it's a thin, typed Supabase call with no branching logic; its correctness is exercised by the Task 8 smoke test. The parser, which has the real logic, is unit-tested in Task 2.)

- [ ] **Checkpoint (owner commits — do not run git):**
`feat(store): add recordTelegramJoin (writes telegram_user_id/username)`

---

## Task 6: Inbound webhook route

**Files:**
- Create: `src/app/api/telegram/webhook/route.ts`

- [ ] **Step 1: Create the route handler**

```ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { recordTelegramJoin } from "@/lib/invites-store";
import { parseChatMemberUpdate, type TgUpdate } from "@/lib/telegram-webhook";
import { log, withLogContext } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Telegram echoes setWebhook's secret_token in this header on every delivery.
const SECRET_HEADER = "x-telegram-bot-api-secret-token";

// Constant-time check of the secret header. Returns false (dormant) when the
// secret env var is unset, so the route is inert until explicitly configured.
function secretValid(req: NextRequest): boolean {
  const expected = env.TELEGRAM_WEBHOOK_SECRET;
  if (!expected) return false;
  const got = req.headers.get(SECRET_HEADER) ?? "";
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const requestId = req.headers.get("x-vercel-id") ?? undefined;
  return withLogContext({ route: "telegram-webhook", requestId }, () =>
    handle(req),
  );
}

async function handle(req: NextRequest): Promise<NextResponse> {
  if (!secretValid(req)) {
    return new NextResponse("forbidden", { status: 403 });
  }

  let update: TgUpdate;
  try {
    update = (await req.json()) as TgUpdate;
  } catch {
    // Authenticated but unparseable body: ack so Telegram doesn't retry.
    log.warn("telegram.webhook.bad_json");
    return NextResponse.json({ ok: true });
  }

  const parsed = parseChatMemberUpdate(update);
  if (parsed.kind === "ignore") {
    return NextResponse.json({ ok: true });
  }

  // A join via a link we didn't mint (other channel / forwarded) simply won't
  // match any row — recordTelegramJoin returns matched:false and we log it.
  try {
    const { matched } = await recordTelegramJoin(
      env.INFLUENCER_SLUG,
      parsed.inviteUrl,
      { userId: parsed.userId, username: parsed.username },
    );
    log[matched ? "info" : "warn"](
      matched ? "telegram.join.mapped" : "telegram.join.unmatched",
      { user_id: parsed.userId },
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    // Transient DB failure → 500 so Telegram retries delivery later.
    log.error("telegram.webhook.store_failed", err, { user_id: parsed.userId });
    return new NextResponse("error", { status: 500 });
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: exits 0.

- [ ] **Step 3: Local smoke of the auth gate (no DB needed)**

Start the app (`npm run dev`) with `TELEGRAM_WEBHOOK_SECRET` set in `.env.local`, then:

```bash
# Wrong/no secret → 403
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/telegram/webhook \
  -H "Content-Type: application/json" -d '{}'
# Correct secret, non-join body → 200 (ignored)
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/telegram/webhook \
  -H "Content-Type: application/json" \
  -H "X-Telegram-Bot-Api-Secret-Token: <your-secret>" -d '{}'
```

Expected: first prints `403`, second prints `200`.

- [ ] **Checkpoint (owner commits — do not run git):**
`feat(api): add Telegram chat_member webhook route`

---

## Task 7: One-time `setWebhook` script

**Files:**
- Create: `scripts/set-telegram-webhook.mjs`

- [ ] **Step 1: Create the script**

Plain ESM (`.mjs`) so it runs with `node` (Node 22 has global `fetch`) — no TS/tsx dependency.

```js
// One-time setup: point the bot's webhook at our route and subscribe ONLY to
// chat_member updates. Safe to re-run. Run AFTER the code is deployed:
//
//   TELEGRAM_BOT_TOKEN=xxx \
//   TELEGRAM_WEBHOOK_SECRET=yyy \
//   WEBHOOK_URL=https://<prod-domain>/api/telegram/webhook \
//   node scripts/set-telegram-webhook.mjs
//
// It first calls getWebhookInfo. If a DIFFERENT webhook is already set, it
// ABORTS unless you re-run with FORCE=1 — so it can't silently clobber another
// integration's webhook on this bot.

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const url = process.env.WEBHOOK_URL;

if (!token || !secret || !url) {
  console.error(
    "Required env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, WEBHOOK_URL",
  );
  process.exit(1);
}

const api = (method) => `https://api.telegram.org/bot${token}/${method}`;

async function main() {
  const info = await (await fetch(api("getWebhookInfo"))).json();
  console.log("Current webhook info:", JSON.stringify(info.result, null, 2));

  const existing = info.result?.url;
  if (existing && existing !== url && process.env.FORCE !== "1") {
    console.error(
      `\nA different webhook is already set:\n  ${existing}\n` +
        "Re-run with FORCE=1 to overwrite it. Aborting.",
    );
    process.exit(1);
  }

  const set = await (
    await fetch(api("setWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secret,
        allowed_updates: ["chat_member"],
      }),
    })
  ).json();

  console.log("setWebhook result:", JSON.stringify(set, null, 2));
  if (!set.ok) process.exit(1);
  console.log("\n✅ Webhook set. Verify with getWebhookInfo after a test join.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 2: Verify it parses/runs (dry, expect the env guard)**

Run: `node scripts/set-telegram-webhook.mjs`
Expected: prints `Required env: ...` and exits 1 (no env set). This confirms the script is syntactically valid without touching Telegram.

- [ ] **Checkpoint (owner commits — do not run git):**
`chore: add one-time set-telegram-webhook script`

---

## Task 8: Deploy, register, and smoke test (rollout)

No code changes — this turns the feature on and proves it end to end. Order matters: the route ships **dormant** (no `setWebhook` yet), then we register last.

- [ ] **Step 1: Deploy to production**

Deploy via your normal flow (push to the branch Vercel builds, or `vercel --prod`). Confirm the build succeeds and `TELEGRAM_WEBHOOK_SECRET` is set in the Production environment.

- [ ] **Step 2: Confirm the route is reachable and guarded**

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST \
  https://<prod-domain>/api/telegram/webhook \
  -H "Content-Type: application/json" -d '{}'
```
Expected: `403` (no secret header). This proves the route is live and the auth gate works.

- [ ] **Step 3: Register the webhook**

```bash
TELEGRAM_BOT_TOKEN=<token> \
TELEGRAM_WEBHOOK_SECRET=<same-secret-as-prod> \
WEBHOOK_URL=https://<prod-domain>/api/telegram/webhook \
node scripts/set-telegram-webhook.mjs
```
Expected: `getWebhookInfo` shows no conflicting webhook, then `setWebhook result: { "ok": true, "result": true, ... }`.

- [ ] **Step 4: Live join smoke test (on MOBILE)**

Take a test Lemonn account through the real funnel until it mints a fresh invite link, then tap **Join** in the Telegram **mobile** app (desktop `tg://join` can silently no-op). Use an account **not already in the channel**.

- [ ] **Step 5: Verify the mapping landed**

Query the `entries` row for that test client_id:

```sql
select client_id, invite_url, telegram_user_id, telegram_username, updated_at
from entries
where telegram_user_id is not null
order by updated_at desc
limit 5;
```
Expected: a row for the test user with `telegram_user_id` populated (and `telegram_username` if that account has an @handle).

Also confirm in Vercel Runtime Logs: a line with `event: "telegram.join.mapped"` and the matching `user_id`. (`telegram.join.unmatched` means the invite_link URL didn't match `invite_url` — investigate before going further.)

- [ ] **Step 6: Confirm delivery health**

```bash
curl -s "https://api.telegram.org/bot<token>/getWebhookInfo"
```
Expected: `url` is your route, `pending_update_count` is 0 (or draining), and `last_error_message` is absent/empty.

- [ ] **Rollback (if needed):** `curl -s "https://api.telegram.org/bot<token>/deleteWebhook"` stops all ingestion instantly. The route goes dormant and the columns sit harmlessly NULL.

- [ ] **Checkpoint (owner commits — do not run git):** no code to commit; rollout only.

---

## Done criteria

- A real mobile join writes `telegram_user_id` (+ `telegram_username` when present) to the joiner's `entries` row, confirmed by query and by a `telegram.join.mapped` log line.
- The live `/callback → /welcome → /join` funnel is unchanged.
- `npm test` and `npm run typecheck` pass.

## Out of scope (later phases)

- Moving `invite_state='consumed'` from the `/join` click to the webhook (the "clicked-but-didn't-join → expired-link dead-end" fix) — gated on this webhook being proven reliable first.
- Removal/ban of non-traders, the Lemonn trading-status check, any cron/sweep.
- Backfilling members who joined before the webhook existed.
- Leave/kick tracking (no column for it in Phase 1).
