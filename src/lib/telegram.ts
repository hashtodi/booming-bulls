import "server-only";
import { env } from "./env";
import type { LemonnUser } from "./lemonn";

export type InviteLink = {
  url: string;
  source: "telegram-api" | "placeholder";
  // When the link stops working. Persisted by the invite store so /callback
  // knows whether a stored link can be re-served or must be re-minted.
  expiresAt: Date;
};

type CreateChatInviteLinkResponse = {
  ok: boolean;
  result?: {
    invite_link: string;
    name?: string;
    expire_date?: number;
    member_limit?: number;
    is_revoked?: boolean;
  };
  description?: string;
};

const INVITE_LINK_TTL_SECONDS = 24 * 60 * 60;
// One automatic retry with a short backoff catches the most common transient
// network blips (ETIMEDOUT, ECONNRESET, brief DNS hiccup) without dragging
// total latency to multi-second levels.
const RETRY_ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 600;

// Replace the bot token with a placeholder anywhere it might appear in a string.
// Used to scrub errors before logging or re-throwing, since the token is part of
// the Telegram API URL and could end up in fetch error stack traces.
function scrubToken(message: string, token: string): string {
  if (!token) return message;
  return message.split(token).join("<bot_token>");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function issueInviteLink(user: LemonnUser): Promise<InviteLink> {
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHANNEL_ID;

  // Graceful fallback while the bot / channel aren't configured yet.
  if (!token || !chatId) {
    console.warn(
      "[telegram] TELEGRAM_BOT_TOKEN or TELEGRAM_CHANNEL_ID is empty. " +
        "Returning placeholder invite URL. Fill both env vars to issue real links.",
    );
    return {
      url: env.TELEGRAM_PLACEHOLDER_URL,
      source: "placeholder",
      expiresAt: new Date(Date.now() + INVITE_LINK_TTL_SECONDS * 1000),
    };
  }

  const url = `https://api.telegram.org/bot${token}/createChatInviteLink`;
  const expireDate = Math.floor(Date.now() / 1000) + INVITE_LINK_TTL_SECONDS;

  const requestBody = JSON.stringify({
    chat_id: chatId,
    member_limit: 1,
    expire_date: expireDate,
    // Audit label shown in Telegram's invite-links admin panel — uses the
    // Lemonn client_id so a link maps straight back to the account. Telegram
    // caps the name at 32 chars; "lemonn:" takes 7, so client_id is sliced to
    // 25. clientId is always present here (the /callback eligible branch guards
    // on it before calling this); the fallback only guards the type.
    name: `lemonn:${(user.clientId ?? "unknown").slice(0, 25)}`,
  });

  let res: Response | undefined;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: requestBody,
        cache: "no-store",
      });
      lastErr = undefined;
      break;
    } catch (err) {
      lastErr = err;
      const raw = err instanceof Error ? err.message : String(err);
      const cause =
        err instanceof Error && err.cause
          ? ` (cause: ${err.cause instanceof Error ? err.cause.message : String(err.cause)})`
          : "";
      console.warn(
        `[telegram] createChatInviteLink network error on attempt ${attempt}/${RETRY_ATTEMPTS}: ${scrubToken(raw + cause, token)}`,
      );
      if (attempt < RETRY_ATTEMPTS) {
        await sleep(RETRY_BACKOFF_MS);
      }
    }
  }

  if (!res) {
    // All attempts failed with a network error. Surface the last cause with
    // the bot token scrubbed out before re-throwing.
    const raw = lastErr instanceof Error ? lastErr.message : String(lastErr);
    const cause =
      lastErr instanceof Error && lastErr.cause
        ? ` (cause: ${lastErr.cause instanceof Error ? lastErr.cause.message : String(lastErr.cause)})`
        : "";
    throw new Error(
      `Telegram createChatInviteLink network error after ${RETRY_ATTEMPTS} attempts: ${scrubToken(raw + cause, token)}`,
    );
  }

  const body = (await res.json().catch(() => ({}))) as CreateChatInviteLinkResponse;

  if (!res.ok || !body.ok || !body.result?.invite_link) {
    const description = body.description ?? "(no description)";
    throw new Error(
      `Telegram createChatInviteLink failed: HTTP ${res.status} ${scrubToken(description, token)}`,
    );
  }

  console.log("[telegram] invite link issued:", {
    client_id: user.clientId,
    name: body.result.name,
    expires_at: new Date(expireDate * 1000).toISOString(),
  });

  return {
    url: body.result.invite_link,
    source: "telegram-api",
    expiresAt: new Date(expireDate * 1000),
  };
}
