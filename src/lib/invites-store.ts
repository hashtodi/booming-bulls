import "server-only";
import { getSupabaseAdmin } from "./supabase";

// Persistence for the "one VIP seat per eligible Lemonn user, per channel"
// rule. Keyed on (channel_id, client_id) — see the migration in
// supabase/migrations for the table + RLS setup.

const TABLE = "channel_invites";

export type InviteStatus = "issued" | "consumed";

export type InviteRecord = {
  inviteUrl: string;
  status: InviteStatus;
  expiresAt: string; // ISO timestamp
};

type Row = {
  invite_url: string;
  status: InviteStatus;
  expires_at: string;
};

export type ClaimAction = "mint" | "serve" | "consumed" | "wait";
export type ClaimResult = { action: ClaimAction; inviteUrl: string | null };

// Atomically resolve what to do for this user+channel, fixing the concurrency
// double-mint race (see the claim_invite migration). One concurrent caller gets
// 'mint' (and must then call saveIssued with the new link); others get 'serve'
// (existing valid link), 'consumed', or 'wait' (someone else is mid-mint).
export async function claimInvite(
  channelId: string,
  clientId: string,
): Promise<ClaimResult> {
  const { data, error } = await getSupabaseAdmin().rpc("claim_invite", {
    p_channel_id: channelId,
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

// Fetch the existing invite row for this user+channel, or null if none.
export async function getInvite(
  channelId: string,
  clientId: string,
): Promise<InviteRecord | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(TABLE)
    .select("invite_url, status, expires_at")
    .eq("channel_id", channelId)
    .eq("client_id", clientId)
    .maybeSingle<Row>();

  if (error) {
    throw new Error(`channel_invites lookup failed: ${error.message}`);
  }
  if (!data) return null;

  return {
    inviteUrl: data.invite_url,
    status: data.status,
    expiresAt: data.expires_at,
  };
}

// Record (or refresh) the issued link for this user+channel. Upsert on the
// composite PK keeps it to exactly one row even if two logins race — at worst
// one freshly-minted link is orphaned, which is harmless (it's member_limit:1).
// Never downgrades a 'consumed' row: callers only reach here when the user is
// not yet consumed.
export async function saveIssued(
  channelId: string,
  clientId: string,
  inviteUrl: string,
  expiresAt: Date,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .upsert(
      {
        channel_id: channelId,
        client_id: clientId,
        invite_url: inviteUrl,
        status: "issued",
        expires_at: expiresAt.toISOString(),
        consumed_at: null,
      },
      { onConflict: "channel_id,client_id" },
    );

  if (error) {
    throw new Error(`channel_invites upsert failed: ${error.message}`);
  }
}

// Mark the seat as used when the user clicks Join. Best-effort: a forwarded
// link used directly in Telegram never hits /join, so this is for the "you're
// already in" UX, not the core dedup guarantee (that's getInvite + the single
// row). Idempotent.
export async function markConsumed(
  channelId: string,
  clientId: string,
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from(TABLE)
    .update({ status: "consumed", consumed_at: new Date().toISOString() })
    .eq("channel_id", channelId)
    .eq("client_id", clientId);

  if (error) {
    throw new Error(`channel_invites markConsumed failed: ${error.message}`);
  }
}
