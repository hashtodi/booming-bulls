# Handoff — multi-tenant `entries` table refactor

## ▶️ PROMPT TO PASTE IN A NEW SESSION

> Read `handoff.md` in the project root in full, then implement the approved refactor described in **"Next task"** — replacing the current `channel_invites` design with a single shared, multi-tenant **`entries`** table (Option A unified + Option ② tenant column).
>
> Rules: I manage git — never run git write commands; suggest a commit message at the end. This is **Next.js 16.2.6 with breaking changes** — read the relevant files under `node_modules/next/dist/docs/` before writing Next code (per `AGENTS.md`). Use the **supabase** skill (fetch current docs/changelog; RLS-on + revoke for private tables; pin `@supabase/supabase-js` v2). Verify with throwaway probe scripts run via `node --env-file=.env.local _probe.mjs` and delete them after — never leave temp files. I'll apply migrations in the Supabase SQL editor and tell you when done so you can run verification.
>
> Start with: env var → migration SQL (give it to me to run) → store refactor → callback/join wiring → verification.

---

## What this project is
A **white-label "VIP Telegram access" funnel** (Next.js 16.2.6, App Router). A user logs in via Lemonn (broker), `/callback` checks eligibility, and eligible users get a single-use Telegram invite link. Deployed **once per influencer** (branding via `NEXT_PUBLIC_INFLUENCER_*`). User manages git (hands-off). See `AGENTS.md`.

## Why we're refactoring
We built a "one invite per `client_id`" dedup feature on a `channel_invites` table keyed `(channel_id, client_id)`. The user then decided:
- Log **every** login (not just eligible) with name + outcome + IST timestamps.
- One **shared** Supabase project for **all** influencers, isolated by an **`influencer` tenant column** (not a table-per-influencer, not `channel_id`).
- **Unify** everything into one table called **`entries`**.
- All timestamps in **IST**.
- New env **`INFLUENCER_SLUG`**.
- **Drop** the old `channel_invites` + `claim_invite`.

---

## Next task (APPROVED — implement this)

### Target schema — `entries` (one shared table, all influencers)
```sql
create table entries (
  influencer    text not null,             -- tenant slug, e.g. 'booming_bulls' (= env INFLUENCER_SLUG)
  client_id     text not null,             -- Lemonn id
  name          text,                       -- details.name (nullable)
  outcome       text not null              -- latest login result, for EVERY user
                  check (outcome in ('eligible','not_associated','kyc_pending',
                                     'not_trade_ready','no_fno_trade')),
  invite_url    text,                       -- nullable; eligible + minted only
  invite_state  text                        -- nullable; seat lifecycle (eligible only)
                  check (invite_state in ('pending','issued','consumed')),
  expires_at    timestamp,                  -- IST (naive)
  consumed_at   timestamp,                  -- IST (naive)
  created_at    timestamp not null default (now() at time zone 'Asia/Kolkata'),  -- IST
  updated_at    timestamp not null default (now() at time zone 'Asia/Kolkata'),  -- IST
  primary key (influencer, client_id)
);
alter table entries enable row level security;       -- no policies → closed to anon/authenticated
revoke all on table entries from anon, authenticated;
grant select, insert, update, delete on table entries to service_role;
```

### IST timestamps — GOTCHA
Columns are **naive `timestamp` holding IST wall-clock**, so they read as IST in the Supabase editor. Therefore:
- **Do NOT use `moddatetime`** for `updated_at` (it writes `now()` = UTC). Use a custom trigger:
```sql
create or replace function set_updated_at_ist() returns trigger language plpgsql as $$
begin new.updated_at := now() at time zone 'Asia/Kolkata'; return new; end; $$;
create trigger entries_set_updated_at before update on entries
  for each row execute function set_updated_at_ist();
```
- Everywhere you compare/stamp "now" in SQL, use `(now() at time zone 'Asia/Kolkata')` (naive IST) so it's consistent with the columns.

### `claim_invite` RPC (keyed on influencer+client_id, operates on `entries`)
The row already exists when claim runs (because `recordLogin` writes it first for eligible users — see callback order). So claim is an atomic UPDATE:
```sql
create or replace function claim_invite(
  p_influencer text, p_client_id text, p_claim_ttl_seconds int default 30
) returns table (action text, invite_url text) language plpgsql as $$
declare v_now timestamp := now() at time zone 'Asia/Kolkata';
        v_rows int; v_state text; v_url text; v_exp timestamp;
begin
  update entries
     set invite_state = 'pending', invite_url = '',
         expires_at = v_now + make_interval(secs => p_claim_ttl_seconds)
   where influencer = p_influencer and client_id = p_client_id
     and ( invite_state is null
        or (invite_state in ('issued','pending') and expires_at <= v_now) );
  get diagnostics v_rows = row_count;
  if v_rows > 0 then action := 'mint'; invite_url := null; return next; return; end if;

  select invite_state, entries.invite_url, expires_at into v_state, v_url, v_exp
    from entries where influencer = p_influencer and client_id = p_client_id;
  if v_state = 'consumed' then action := 'consumed'; invite_url := null;
  elsif v_state = 'issued' and v_exp > v_now then action := 'serve'; invite_url := v_url;
  else action := 'wait'; invite_url := null;   -- non-expired pending = someone else minting
  end if;
  return next;
end; $$;
revoke all on function claim_invite(text,text,int) from public, anon, authenticated;
grant execute on function claim_invite(text,text,int) to service_role;
```
*(Edge: if the row somehow doesn't exist — claim called without a prior `recordLogin` — the UPDATE hits 0 rows and the SELECT finds nothing → falls to `'wait'`. In practice `recordLogin` always runs first in `/callback`. Decide if you want claim to insert-on-missing for extra safety.)*

### Code changes
1. **`src/lib/env.ts`** — add `INFLUENCER_SLUG: z.string().regex(/^[a-z0-9_]+$/)` (required, lowercase slug). Keep `SUPABASE_URL`/`SUPABASE_SECRET_KEY`. `TELEGRAM_CHANNEL_ID` **stays** (it's the Telegram target — separate from the DB tenant key).
2. **`src/lib/invites-store.ts`** — `const TABLE = "entries"`. Re-key all fns on `(influencer, clientId)`:
   - **NEW** `recordLogin(influencer, clientId, name, outcome)` — upsert that sets ONLY `influencer, client_id, name, outcome, updated_at`; **must NOT clobber** `invite_url`/`invite_state`/`expires_at`/`consumed_at` (use `on conflict do update set name=excluded.name, outcome=excluded.outcome` — leave invite cols alone; `updated_at` via trigger).
   - `claimInvite(influencer, clientId)` → `.rpc('claim_invite', { p_influencer, p_client_id })`.
   - `saveIssued(influencer, clientId, inviteUrl, expiresAt)` → update `invite_url, invite_state='issued', expires_at, consumed_at=null` on the row.
   - `markConsumed(influencer, clientId)` → set `invite_state='consumed', consumed_at = now()-IST`.
   - Remove `getInvite` (claim replaced it) unless useful.
3. **`src/app/callback/route.ts`** — `const influencer = env.INFLUENCER_SLUG`. After `verifyLemonnCallback`, **best-effort** `recordLogin` for **every non-`transient_error`** outcome that has a `client_id` (await in try/catch, never block the funnel), THEN the existing `switch`. Eligible branch: `claimInvite(influencer, clientId)` loop → mint → `saveIssued(influencer, clientId, …)`. Cookie: `signInviteToken({ url, influencer, clientId }, …)`.
4. **`src/lib/invite-token.ts`** — rename `channelId`→`influencer` in payload/types, bump `TOKEN_VERSION` `v2`→`v3`, update sign/verify.
5. **`src/app/join/route.ts`** — read `result.influencer`; `markConsumed(influencer, clientId)`.
6. **Migration** — one new file under `supabase/migrations/`: `drop table if exists channel_invites cascade; drop function if exists claim_invite(text,text,int);` then create `entries` + RLS/grants + IST trigger + new `claim_invite`. (Old `channel_invites` data is throwaway test data.)

### Verification (after user applies the migration)
Write throwaway probes (`node --env-file=.env.local _x.mjs`, delete after):
- **recordLogin**: each outcome writes a row with right `outcome`; re-login updates `outcome`/`updated_at`, keeps `created_at` **and** invite fields (no clobber).
- **eligible flow**: claim → mint → `saveIssued` fills invite fields; `/join` → `markConsumed`.
- **concurrency**: 10 simultaneous `claim_invite` for one (influencer, client) → exactly 1 `mint`, rest `wait`.
- **multi-tenant**: same `client_id` under two `influencer` values = two independent rows.
- **RLS**: with the publishable key, SELECT/INSERT/UPDATE on `entries` are denied (`permission denied`).
- **IST**: timestamps read as IST.
- Then `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run build`.

---

## Current state (already built & verified for the OLD `channel_invites` design)
These files exist and work; the refactor above modifies them. **Working tree is uncommitted** (user manages git).

**Files (feature):**
- `supabase/migrations/20260603092552_create_channel_invites.sql` — old table (to be dropped)
- `supabase/migrations/20260603110149_add_claim_invite.sql` — old RPC (to be dropped)
- `src/lib/supabase.ts` — cached service-role client (`getSupabaseAdmin()`) — **reuse as-is**
- `src/lib/invites-store.ts` — getInvite/claimInvite/saveIssued/markConsumed (keyed channel_id) — **refactor**
- `src/app/already-member/page.tsx` — "you already have access" page — **reuse as-is**
- `src/lib/env.ts` — has SUPABASE_URL/SECRET_KEY (optional) — **add INFLUENCER_SLUG**
- `src/lib/telegram.ts` — `issueInviteLink` returns `{url, source, expiresAt}`; label = `lemonn:${client_id}` (sliced 25); logs `client_id` — **reuse**
- `src/lib/invite-token.ts` — v2 `{url, channelId, clientId}` — **bump v3, channelId→influencer**
- `src/lib/lemonn.ts` — `LemonnUser.clientId` (pickUserId/`id` removed); decision log + fetch-user-details log carry `client_id` — **reuse; recordLogin reads outcome.kind + user.clientId + details.name**
- `src/app/callback/route.ts` — eligible branch claim loop + client_id guard — **add recordLogin; re-key to influencer**
- `src/app/join/route.ts` — strict markConsumed before redirect — **re-key to influencer**
- `.gitignore` — supabase CLI artifacts added
- `package.json` — `@supabase/supabase-js@^2.107.0` (pinned v2; do NOT go v3 prerelease)

**Verified (old design, all green):** build/typecheck/lint · store CRUD 12/12 · full app flow on dev 14/14 · strict /join fail 4/4 · anon RLS denied 6/6 · atomic claim concurrency 7/7.

**Supabase:** one project, URL `https://eyvzkbdnujgdqpndldlh.supabase.co`. `SUPABASE_URL` + `SUPABASE_SECRET_KEY` are in `.env.local` (gitignored). Publishable (anon) key is in the dashboard (public; used only for RLS probes). Both old migrations are currently applied — the refactor migration drops them.

---

## Known open issues / decisions (NOT part of the entries refactor)
1. **Abandon trap (high):** `invite_state='consumed'` is set on the Join *click* and is terminal. A user who clicks Join but never completes the join inside Telegram is stuck on `/already-member` with no self-recovery (needs manual DB reset). Not fixed. Options: make consumed non-terminal (re-serve while link valid), admin-reset runbook, or proper fix via Telegram identity binding (`getChatMember` — "Option B", needs a bot webhook + deep-link `?start=` token). Decide separately.
2. **Duplicate `/callback` (medium):** Prod logs show the **same login** firing `/callback` 2–3× within ~0.2s. The `request_token` is single-use, so the sibling calls fail with `VALIDATION_FAILED: Invalid API key or request token` (the credentials are fine — a sibling call succeeds). Source of the duplicate not yet identified (prefetch? in-app browser? scanner?). Robust fix: make `/callback` idempotent per `request_token` (cache first result, serve dupes from it). Gather evidence: do failing + succeeding `/callback` in the same second share a `request_token`, and what's the duplicate's user-agent?
3. **Prod env not set:** prod host needs `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, **`INFLUENCER_SLUG`** (+ existing `TELEGRAM_*`, `LEMONN_*`, `INVITE_TOKEN_SECRET`). The feature now hard-depends on Supabase (strict `/join` + callback). Mind env drift (it's bitten twice).
4. **`client_id` not confirmed via a real login:** the whole design assumes Lemonn returns a stable `client_id`. Never observed in a real response (can't call Lemonn without a real `request_token`). The `[lemonn] fetch-user-details data: { client_id }` log will show it — do **one real Lemonn login** (dev or prod) to confirm presence + format/length before relying on it.
5. **Prod runs OLD code:** none of the dedup / `client_id` / claim / entries work is deployed yet.

---

## Must-knows / conventions
- **Git:** user manages it. Never commit/push/branch. Suggest a commit message at the end.
- **Next 16.2.6:** read `node_modules/next/dist/docs/` before Next code (per `AGENTS.md`). Verified-fine patterns: `route.ts` GET/POST handlers, `req.cookies.get`, `response.cookies.set`, `await cookies()`, `NextResponse.redirect(url, 303)`.
- **Supabase:** use the supabase skill. service_role/secret key bypasses RLS; RLS-on + no policies + `revoke from anon, authenticated` = private (verified). Migrations: hand the SQL to the user to run in the SQL editor (no CLI linked).
- **Verification:** throwaway `_*.mjs` probes via `node --env-file=.env.local`; `redirect: "manual"` for fetch; `getSupabaseAdmin`/supabase-js for DB; **delete probes after**; keep the working tree clean.
- **PII / secrets:** logs carry `client_id` (pseudonymous), not the name. Never put secret keys in committed files. `.env*` is gitignored.
- **`influencer` (DB tenant key) ≠ `TELEGRAM_CHANNEL_ID` (Telegram target).** Both per-deployment, different purposes.
