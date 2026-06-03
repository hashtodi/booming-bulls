import "server-only";
import crypto from "node:crypto";
import { env } from "./env";

// v2 added channelId + clientId to the payload (for marking the invite store
// row consumed on /join). Bumping the version invalidates any in-flight v1
// cookies — harmless, the user just re-logs in.
const TOKEN_VERSION = "v2";

// Derive a per-purpose key from INVITE_TOKEN_SECRET, domain-separated by
// "invite-token-<version>". Keeps the raw secret out of the HMAC input so we
// can introduce other token types later (each with its own domain string)
// without overlap, and rotating INVITE_TOKEN_SECRET cleanly invalidates only
// invite tokens — not Lemonn auth or anything else.
function deriveSigningKey(): Buffer {
  return crypto
    .createHmac("sha256", Buffer.from(env.INVITE_TOKEN_SECRET, "hex"))
    .update(`invite-token-${TOKEN_VERSION}`)
    .digest();
}

type TokenPayload = {
  url: string;
  channelId: string;
  clientId: string;
  exp: number;
  v: string;
};

export type InviteTokenData = {
  url: string;
  channelId: string;
  clientId: string;
};

export function signInviteToken(
  data: InviteTokenData,
  ttlSeconds: number,
): string {
  const payload: TokenPayload = {
    url: data.url,
    channelId: data.channelId,
    clientId: data.clientId,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    v: TOKEN_VERSION,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf-8").toString(
    "base64url",
  );
  const signature = crypto
    .createHmac("sha256", deriveSigningKey())
    .update(payloadB64)
    .digest("base64url");
  return `${payloadB64}.${signature}`;
}

export type VerifyInviteTokenResult =
  | { ok: true; url: string; channelId: string; clientId: string }
  | {
      ok: false;
      reason: "malformed" | "bad_signature" | "expired" | "bad_payload";
    };

export function verifyInviteToken(token: string): VerifyInviteTokenResult {
  const parts = token.split(".");
  if (parts.length !== 2) return { ok: false, reason: "malformed" };
  const [payloadB64, signature] = parts;

  const expected = crypto
    .createHmac("sha256", deriveSigningKey())
    .update(payloadB64)
    .digest("base64url");

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) {
    return { ok: false, reason: "bad_signature" };
  }
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: Partial<TokenPayload>;
  try {
    payload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf-8"),
    );
  } catch {
    return { ok: false, reason: "bad_payload" };
  }

  if (
    payload.v !== TOKEN_VERSION ||
    typeof payload.url !== "string" ||
    typeof payload.channelId !== "string" ||
    typeof payload.clientId !== "string" ||
    typeof payload.exp !== "number"
  ) {
    return { ok: false, reason: "bad_payload" };
  }
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return { ok: false, reason: "expired" };
  }

  return {
    ok: true,
    url: payload.url,
    channelId: payload.channelId,
    clientId: payload.clientId,
  };
}

export const INVITE_COOKIE_NAME = "lemonn_invite_token";
export const INVITE_COOKIE_TTL_SECONDS = 24 * 60 * 60;
