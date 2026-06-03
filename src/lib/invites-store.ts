import "server-only";
import { getSupabaseAdmin } from "./supabase";

// Persistence for the shared, multi-tenant `entries` table: one row per
// (influencer, client_id) that logs EVERY login (name + outcome + association +
// the raw Lemonn user-details payload) and folds the invite/seat lifecycle for
// eligible users into the same row. Rows are isolated by the `influencer`
// tenant slug (= env INFLUENCER_SLUG). See the migration in supabase/migrations
// for the table, RLS setup, and the claim_invite RPC.

const TABLE = "entries";

// The five terminal login outcomes we persist; the transient_error case never
// reaches the store. Mirrors the `outcome` CHECK constraint on `entries`.
export type Outcome =
  | "eligible"
  | "not_associated"
  | "kyc_pending"
  | "not_trade_ready"
  | "no_fno_trade";

export type ClaimAction = "mint" | "serve" | "consumed" | "wait";
export type ClaimResult = { action: ClaimAction; inviteUrl: string | null };

// The `entries` timestamp columns are naive `timestamp` holding IST wall-clock
// (so they read as IST in the Supabase editor). created_at/updated_at and the
// claim_invite RPC compute IST in SQL, but the writes below originate from this
// JS client, which can't call `now() at time zone` — so we format the instant
// as an IST wall-clock string here. India is a fixed UTC+5:30 with no DST, but
// we go through the Intl time zone (not a hardcoded offset) so it stays correct
// regardless of where the server runs.
const IST_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function toIstNaive(date: Date): string {
  const p: Record<string, string> = {};
  for (const part of IST_FORMAT.formatToParts(date)) {
    p[part.type] = part.value;
  }
  // PostgREST writes this verbatim into a `timestamp` (without time zone)
  // column — no offset shifting — so it lands as IST wall-clock to match the
  // SQL-side defaults/trigger.
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

// Log this login. Upsert that touches ONLY the identity/outcome columns, so it
// must never clobber the invite lifecycle (invite_url / invite_state /
// expires_at / consumed_at) or created_at: a re-login refreshes
// name/outcome/associated/user_detail (and updated_at, via the trigger) while
// leaving an in-flight or already-consumed seat untouched. PostgREST's upsert
// only updates the columns present in the payload, which is exactly the
// no-clobber behaviour we rely on. Best-effort at the call site — /callback
// swallows errors so logging can never block the funnel.
export async function recordLogin(
  influencer: string,
  clientId: string,
  fields: {
    name: string | null;
    outcome: Outcome;
    associated: boolean;
    userDetail: Record<string, unknown> | null;
  },
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      {
        influencer,
        client_id: clientId,
        name: fields.name,
        outcome: fields.outcome,
        associated: fields.associated,
        user_detail: fields.userDetail,
      },
      { onConflict: "influencer,client_id" },
    );

  if (error) {
    throw new Error(`entries recordLogin failed: ${error.message}`);
  }
}

// Atomically resolve what to do for this user, fixing the concurrent
// double-mint race (see the claim_invite migration). One caller gets 'mint'
// (and must then call saveIssued with the new link); others get 'serve'
// (existing valid link), 'consumed', or 'wait' (someone else is mid-mint).
// Insert-on-missing: claim creates the row itself (outcome='eligible') if
// recordLogin's best-effort write didn't land first.
export async function claimInvite(
  influencer: string,
  clientId: string,
): Promise<ClaimResult> {
  const { data, error } = await getSupabaseAdmin().rpc("claim_invite", {
    p_influencer: influencer,
    p_client_id: clientId,
  });
  if (error) {
    throw new Error(`claim_invite failed: ${error.message}`);
  }
  // claim_invite RETURNS TABLE → PostgREST returns a one-element array.
  const row = (Array.isArray(data) ? data[0] : data) as
    | { action: ClaimAction; invite_url: string | null }
    | undefined;
  if (!row?.action) {
    throw new Error("claim_invite returned no action");
  }
  return { action: row.action, inviteUrl: row.invite_url ?? null };
}

// Record the freshly-minted link on the (already-existing, claimed-as-pending)
// row: flip the seat to 'issued' and stamp the Telegram TTL. Runs only after a
// 'mint', so the row is guaranteed to exist. consumed_at is reset to null
// because this row is, by definition, a live un-consumed seat.
export async function saveIssued(
  influencer: string,
  clientId: string,
  inviteUrl: string,
  expiresAt: Date,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      invite_url: inviteUrl,
      invite_state: "issued",
      expires_at: toIstNaive(expiresAt),
      consumed_at: null,
    })
    .eq("influencer", influencer)
    .eq("client_id", clientId);

  if (error) {
    throw new Error(`entries saveIssued failed: ${error.message}`);
  }
}

// Mark the seat used when the user clicks Join. Best-effort for the dedup
// guarantee (a forwarded link used directly in Telegram never hits /join) but
// gates the "you're already in" UX on re-login. Idempotent.
export async function markConsumed(
  influencer: string,
  clientId: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({
      invite_state: "consumed",
      consumed_at: toIstNaive(new Date()),
    })
    .eq("influencer", influencer)
    .eq("client_id", clientId);

  if (error) {
    throw new Error(`entries markConsumed failed: ${error.message}`);
  }
}
