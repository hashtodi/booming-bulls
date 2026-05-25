import "server-only";
import { env } from "./env";
import type { LemonnUser } from "./lemonn";

export type InviteLink = {
  url: string;
  source: "telegram-api" | "placeholder";
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

// Replace the bot token with a placeholder anywhere it might appear in a string.
// Used to scrub errors before logging or re-throwing, since the token is part of
// the Telegram API URL and could end up in fetch error stack traces.
function scrubToken(message: string, token: string): string {
  if (!token) return message;
  return message.split(token).join("<bot_token>");
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
    return { url: env.TELEGRAM_PLACEHOLDER_URL, source: "placeholder" };
  }

  const url = `https://api.telegram.org/bot${token}/createChatInviteLink`;
  const expireDate = Math.floor(Date.now() / 1000) + INVITE_LINK_TTL_SECONDS;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        member_limit: 1,
        expire_date: expireDate,
        // Use client_id (e.g. "CS31258138") for audit visibility — Lemonn's
        // user_id field has been observed coming back as 0, while client_id is
        // the stable per-user identifier.
        name: `lemonn:${user.client_id}`,
      }),
      cache: "no-store",
    });
  } catch (err) {
    // fetch may throw on network errors and the message can include the full
    // URL — bot token and all. Scrub before re-throwing so callers (and any
    // log shipper) never see the secret.
    const raw = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Telegram createChatInviteLink network error: ${scrubToken(raw, token)}`,
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
    lemonn_client_id: user.client_id,
    lemonn_user_id: user.id,
    name: body.result.name,
    expires_at: new Date(expireDate * 1000).toISOString(),
  });

  return { url: body.result.invite_link, source: "telegram-api" };
}
