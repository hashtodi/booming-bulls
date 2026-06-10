import "server-only";
import crypto from "node:crypto";
import { env } from "./env";
import { log } from "./log";

// ASN.1 DER prefix for an Ed25519 PKCS#8 private key with a 32-byte raw seed.
const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

function signEd25519(message: string, privateKeyHex: string): string {
  const seed = Buffer.from(privateKeyHex, "hex");
  const der = Buffer.concat([ED25519_PKCS8_PREFIX, seed]);
  const keyObject = crypto.createPrivateKey({
    key: der,
    format: "der",
    type: "pkcs8",
  });
  const sig = crypto.sign(null, Buffer.from(message, "utf-8"), keyObject);
  return sig.toString("hex");
}

// Open shape: Lemonn's response will grow over time. We type the fields we
// know about today and tolerate additional keys via [k: string] without
// trusting them.
export type LemonnUserDetails = {
  is_dra_matched?: boolean;
  name?: string;
  kyc_status?: string;
  nse_cash_status?: string;
  bse_cash_status?: string;
  nse_fno_status?: string;
  bse_fno_status?: string;
  fno_order_executed?: boolean;
  fno_order_executed_at?: string | null;
  client_id?: string;
  user_id?: string | number;
  [k: string]: unknown;
};

export type LemonnUser = {
  // Stable Lemonn client_id — the single identifier used for dedup (the invite
  // store), the Telegram invite-link label, and our logs. Optional because some
  // responses may omit it; the /callback eligible branch guards on it before
  // issuing an invite.
  clientId?: string;
  details: LemonnUserDetails;
};

// Discriminated union over every possible outcome of /callback. The route
// handler maps each kind to a specific page / redirect.
export type VerifyOutcome =
  | { kind: "eligible"; user: LemonnUser }
  | { kind: "not_associated"; user: LemonnUser }
  | { kind: "kyc_pending"; user: LemonnUser }
  | { kind: "not_trade_ready"; user: LemonnUser }
  | { kind: "transient_error"; reason: string };

type LemonnErrorBody = {
  status?: unknown;
  msg?: unknown;
  error_code?: unknown;
};

function safeErrorBody(body: unknown): {
  status?: unknown;
  msg?: unknown;
  error_code?: unknown;
} {
  const b = (body ?? {}) as LemonnErrorBody;
  return {
    status: b.status,
    msg: b.msg,
    error_code: b.error_code,
  };
}

export function buildLemonnLoginUrl(): string {
  const url = new URL(env.LEMONN_LOGIN_URL);
  url.searchParams.set("api_key", env.LEMONN_API_KEY);
  return url.toString();
}

async function fetchUserDetails(
  requestToken: string,
): Promise<LemonnUserDetails> {
  const signature = signEd25519(
    requestToken + env.LEMONN_API_KEY,
    env.LEMONN_SECRET_KEY,
  );
  // Lemonn allowlists x-request-id values per partner account. Using a UUID
  // returns a misleading "Invalid access token format" 401. The value comes
  // from env so we can update it once Lemonn tells us the official one.
  const requestId = env.LEMONN_REQUEST_ID;

  const res = await fetch(env.LEMONN_USER_DETAILS_URL, {
    method: "GET",
    headers: {
      "x-api-key": env.LEMONN_API_KEY,
      "x-request-token": requestToken,
      "x-signature": signature,
      "x-request-id": requestId,
    },
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let safe: object;
    try {
      safe = safeErrorBody(JSON.parse(text));
    } catch {
      safe = { status: "non_json_response" };
    }
    throw new Error(
      `Lemonn fetch-user-details returned HTTP ${res.status}: ${JSON.stringify(safe)}`,
    );
  }

  const body = (await res.json()) as {
    status?: string;
    msg?: string;
    data?: LemonnUserDetails;
  };

  if (body.status !== "success" || !body.data) {
    throw new Error(
      `Lemonn fetch-user-details returned non-success: ${JSON.stringify(safeErrorBody(body))}`,
    );
  }

  return body.data;
}

// Eligibility decision tree. The first failing condition wins; later checks
// assume earlier ones passed. Conservative defaults: missing fields treated
// as the "fail" value so a malformed response never accidentally lets a user
// through.
function decideOutcome(
  user: LemonnUser,
): Exclude<VerifyOutcome, { kind: "transient_error" }> {
  const d = user.details;

  if (d.is_dra_matched !== true) {
    return { kind: "not_associated", user };
  }

  // KYC must be done (COMPLETED) or still in progress (PROCESSING). Matched
  // case-insensitively so a casing change from Lemonn can't silently block a
  // user; a missing/unknown status fails closed to kyc_pending.
  const kyc = (d.kyc_status ?? "").toUpperCase();
  if (kyc !== "COMPLETED" && kyc !== "PROCESSING") {
    return { kind: "kyc_pending", user };
  }

  // No F&O gate: associated + past KYC is enough to be eligible. The
  // `not_trade_ready` outcome and its /not-trade-ready page are kept but are
  // no longer produced here.
  return { kind: "eligible", user };
}

export async function verifyLemonnCallback(
  requestToken: string | undefined,
): Promise<VerifyOutcome> {
  if (!requestToken) {
    return { kind: "transient_error", reason: "missing_request_token" };
  }

  let details: LemonnUserDetails;
  try {
    details = await fetchUserDetails(requestToken);
  } catch (err) {
    log.error("lemonn.fetch_failed", err);
    return {
      kind: "transient_error",
      reason: "fetch_user_details_failed",
    };
  }

  const user: LemonnUser = {
    clientId: details.client_id,
    details,
  };

  const outcome = decideOutcome(user);
  // Light per-login trace: who logged in (client_id + name) and the result.
  log.info("lemonn.user_details", {
    client_id: user.clientId,
    name: details.name ?? null,
    outcome: outcome.kind,
  });
  return outcome;
}


