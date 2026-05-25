import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

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

export type LemonnSession = {
  access_token: string;
  user_id: string;
  client_id: string;
  expires_at: string;
};

export type LemonnUser = {
  id: string;
  client_id: string;
  access_token: string;
  expires_at: string;
};

export type VerifyResult =
  | { eligible: true; user: LemonnUser }
  | { eligible: false; user: LemonnUser | null; reason: string };

// Fields safe to log from a Lemonn response. NEVER include `data` (which
// contains access_token) or any other field that could carry a credential.
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

async function exchangeRequestToken(
  requestToken: string,
): Promise<LemonnSession> {
  const signature = signEd25519(
    requestToken + env.LEMONN_API_KEY,
    env.LEMONN_SECRET_KEY,
  );

  const res = await fetch(env.LEMONN_SESSION_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": env.LEMONN_API_KEY,
      "x-request-token": requestToken,
      "x-signature": signature,
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
      `Lemonn session exchange returned HTTP ${res.status}: ${JSON.stringify(safe)}`,
    );
  }

  const body = (await res.json()) as {
    status?: string;
    msg?: string;
    data?: LemonnSession;
  };

  if (body.status !== "success" || !body.data?.access_token) {
    // Build a sanitized body for the error — drop `data` entirely so we never
    // log access_token or anything else credential-shaped.
    throw new Error(
      `Lemonn session exchange returned non-success: ${JSON.stringify(safeErrorBody(body))}`,
    );
  }

  // Dev-time visibility. Logs the metadata fields and a short token prefix so
  // you can confirm the exchange worked without pasting the full bearer in logs.
  console.log("[lemonn] session received:", {
    user_id: body.data.user_id,
    client_id: body.data.client_id,
    expires_at: body.data.expires_at,
    access_token_prefix: body.data.access_token.slice(0, 16) + "…",
    access_token_length: body.data.access_token.length,
  });

  return body.data;
}

async function checkEligibility(session: LemonnSession): Promise<boolean> {
  const url = env.LEMONN_ELIGIBILITY_URL;
  if (!url) {
    console.warn(
      "[lemonn] LEMONN_ELIGIBILITY_URL not configured. Defaulting to eligible=true. " +
        "Set this env var once Lemonn provides the eligibility endpoint.",
    );
    return true;
  }

  // TODO: confirm the exact request shape (GET vs POST, auth header style,
  // and the response field name) once Lemonn shares the endpoint contract.
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
  });

  if (!res.ok) return false;

  const body = (await res.json()) as Record<string, unknown>;
  return Boolean(body.eligible ?? body.is_eligible);
}

export async function verifyLemonnCallback(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<VerifyResult> {
  const requestToken = first(searchParams.request_token);
  if (!requestToken) {
    return { eligible: false, user: null, reason: "missing_request_token" };
  }

  let session: LemonnSession;
  try {
    session = await exchangeRequestToken(requestToken);
  } catch (err) {
    console.error("[lemonn] session exchange failed:", err);
    return { eligible: false, user: null, reason: "session_exchange_failed" };
  }

  const user: LemonnUser = {
    id: session.user_id,
    client_id: session.client_id,
    access_token: session.access_token,
    expires_at: session.expires_at,
  };

  try {
    const eligible = await checkEligibility(session);
    return eligible
      ? { eligible: true, user }
      : { eligible: false, user, reason: "not_eligible" };
  } catch (err) {
    console.error("[lemonn] eligibility check failed:", err);
    return { eligible: false, user, reason: "eligibility_check_failed" };
  }
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}
