import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

// External destination for users whose KYC isn't done. Lives here (not in env)
// because it's a Lemonn-owned host, not an app config knob.
export const KYC_REDIRECT_URL = "https://kyc.lemonn.co.in";

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
  // A stable per-login identifier used for Telegram invite-link audit naming
  // and our own logs. Prefers Lemonn's client_id when present, falls back to
  // a short prefix of the request_token.
  id: string;
  details: LemonnUserDetails;
};

// Discriminated union over every possible outcome of /callback. The route
// handler maps each kind to a specific page / redirect.
export type VerifyOutcome =
  | { kind: "eligible"; user: LemonnUser }
  | { kind: "not_associated"; user: LemonnUser }
  | { kind: "kyc_pending"; user: LemonnUser }
  | { kind: "not_trade_ready"; user: LemonnUser }
  | { kind: "no_fno_trade"; user: LemonnUser }
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
//
// Exported so the (deletable) dev test harness in src/app/test can dispatch
// mocked details through the same logic without going through the network.
export function decideOutcome(
  user: LemonnUser,
): Exclude<VerifyOutcome, { kind: "transient_error" }> {
  const d = user.details;

  if (d.is_dra_matched !== true) {
    return { kind: "not_associated", user };
  }

  if (d.kyc_status !== "COMPLETED") {
    return { kind: "kyc_pending", user };
  }

  if (
    d.nse_fno_status !== "TRADE_READY" ||
    d.bse_fno_status !== "TRADE_READY"
  ) {
    return { kind: "not_trade_ready", user };
  }

  if (d.fno_order_executed !== true) {
    return { kind: "no_fno_trade", user };
  }

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
    console.error("[lemonn] fetch-user-details failed:", err);
    return {
      kind: "transient_error",
      reason: "fetch_user_details_failed",
    };
  }

  const user: LemonnUser = {
    id: pickUserId(details, requestToken),
    details,
  };

  const outcome = decideOutcome(user);
  // Slim ops log: which user got which outcome. No PII beyond the audit id
  // that already lives in the Telegram admin panel.
  console.log("[lemonn] decision:", { id: user.id, kind: outcome.kind });
  return outcome;
}

// Prefer the human-readable `name` Lemonn returns (e.g. "HARSH TODI"). Falls
// back to a request_token prefix when name is missing/empty so the audit
// label is never blank.
// Telegram caps invite-link names at 32 chars total; the "lemonn:" prefix
// consumes 7, so the per-user portion is sliced to 25.
function pickUserId(details: LemonnUserDetails, requestToken: string): string {
  const name =
    typeof details.name === "string" ? details.name.trim() : "";
  if (name.length > 0) {
    return name.slice(0, 25);
  }
  return `rt:${requestToken.split("-")[0]}`;
}

