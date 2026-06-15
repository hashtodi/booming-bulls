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
