import { NextRequest, NextResponse } from "next/server";
import { verifyLemonnCallback } from "@/lib/lemonn";
import { issueInviteLink } from "@/lib/telegram";
import { recordLogin, claimInvite, saveIssued } from "@/lib/invites-store";
import { env } from "@/lib/env";
import { log, withLogContext } from "@/lib/log";
import {
  signInviteToken,
  INVITE_COOKIE_NAME,
  INVITE_COOKIE_TTL_SECONDS,
} from "@/lib/invite-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// On a rare concurrent collision the loser gets 'wait' while the winner mints.
// Retry briefly until the winner fills the row (mint = a Telegram round-trip,
// ~hundreds of ms), then give up to /error-page rather than hang.
const CLAIM_MAX_ATTEMPTS = 6;
const CLAIM_RETRY_DELAY_MS = 350;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function GET(req: NextRequest) {
  // Correlate every log line for this login under one request id (Vercel sets
  // x-vercel-id). All logging here is server-side only — never reaches the
  // browser. influencer is the DB tenant key for this deployment.
  const requestId = req.headers.get("x-vercel-id") ?? undefined;
  return withLogContext(
    { route: "callback", requestId, influencer: env.INFLUENCER_SLUG },
    () => handleCallback(req),
  );
}

async function handleCallback(req: NextRequest) {
  const requestToken =
    req.nextUrl.searchParams.get("request_token") ?? undefined;
  const result = await verifyLemonnCallback(requestToken);

  const influencer = env.INFLUENCER_SLUG;

  // Log every login to `entries` (name + outcome + association + raw Lemonn
  // details). Best-effort and non-blocking: a store hiccup must never deny a
  // user the page they earned. Safe because claim_invite is insert-on-missing,
  // so the eligible branch below still works even if this write fails. Skips
  // transient errors (no user) and any result without a client_id.
  if (result.kind !== "transient_error" && result.user.clientId) {
    const details = result.user.details;
    try {
      await recordLogin(influencer, result.user.clientId, {
        name: details.name ?? null,
        outcome: result.kind,
        associated: details.is_dra_matched === true,
        userDetail: details,
      });
    } catch (err) {
      log.error("callback.record_login_failed", err, {
        client_id: result.user.clientId,
      });
    }
  }

  switch (result.kind) {
    case "transient_error":
      // No token at all = user hit /callback directly (bookmark, crawler,
      // back-button after the original params were stripped). Send them to
      // the landing page so they can start a real login, instead of the
      // misleading "Something went wrong" error page.
      if (result.reason === "missing_request_token") {
        return NextResponse.redirect(new URL("/", req.url));
      }
      return NextResponse.redirect(new URL("/error-page", req.url));

    case "not_associated":
      return NextResponse.redirect(new URL("/not-associated", req.url));

    case "kyc_pending":
      // In-app page that explains KYC is pending and links out to Lemonn's KYC
      // site. User completes KYC there and re-initiates the login flow after.
      return NextResponse.redirect(new URL("/kyc-pending", req.url));

    case "not_trade_ready":
      return NextResponse.redirect(new URL("/not-trade-ready", req.url));

    case "no_fno_trade":
      return NextResponse.redirect(new URL("/no-fno-trade", req.url));

    case "eligible": {
      // Dedup key. An eligible user with no client_id would create an invite
      // we can't track — refuse rather than silently break the one-seat rule.
      const clientId = result.user.clientId;
      if (!clientId) {
        log.error("callback.no_client_id");
        return NextResponse.redirect(new URL("/error-page", req.url));
      }

      // channelId is the Telegram target (for the link), separate from the
      // `influencer` DB tenant key used by the invite store / cookie.
      const channelId = env.TELEGRAM_CHANNEL_ID ?? "";
      const telegramConfigured = Boolean(env.TELEGRAM_BOT_TOKEN && channelId);

      let inviteUrl: string | null = null;
      try {
        if (!telegramConfigured) {
          // Placeholder mode (Telegram unconfigured): no real channel, so no
          // dedup — just hand back the placeholder URL.
          inviteUrl = (await issueInviteLink(result.user)).url;
        } else {
          // One seat per (influencer, client_id), resolved atomically so two
          // concurrent logins can't both mint a link. Exactly one caller is
          // told to 'mint'; others 'serve' the existing link or briefly 'wait'.
          for (let attempt = 0; attempt < CLAIM_MAX_ATTEMPTS; attempt++) {
            const claim = await claimInvite(influencer, clientId);

            // A still-valid issued link OR an already-consumed seat: re-show
            // the SAME stored link. A consumed seat is never re-minted (even
            // once its link has expired, by design) — this lets a user who
            // clicked Join but didn't finish get their original link back,
            // without ever granting a second seat.
            if (
              (claim.action === "serve" || claim.action === "consumed") &&
              claim.inviteUrl
            ) {
              inviteUrl = claim.inviteUrl;
              break;
            }
            if (claim.action === "mint") {
              const invite = await issueInviteLink(result.user);
              await saveIssued(
                influencer,
                clientId,
                invite.url,
                invite.expiresAt,
              );
              inviteUrl = invite.url;
              break;
            }
            // 'wait': another request is mid-mint — back off and retry.
            await sleep(CLAIM_RETRY_DELAY_MS);
          }

          if (!inviteUrl) {
            log.error("callback.claim_giveup", undefined, {
              client_id: clientId,
            });
            return NextResponse.redirect(new URL("/error-page", req.url));
          }
        }
      } catch (err) {
        log.error("callback.issue_failed", err, { client_id: clientId });
        return NextResponse.redirect(new URL("/error-page", req.url));
      }

      if (!inviteUrl) {
        return NextResponse.redirect(new URL("/error-page", req.url));
      }

      const token = signInviteToken(
        { url: inviteUrl, influencer, clientId },
        INVITE_COOKIE_TTL_SECONDS,
      );
      const response = NextResponse.redirect(new URL("/welcome", req.url));
      response.cookies.set({
        name: INVITE_COOKIE_NAME,
        value: token,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: INVITE_COOKIE_TTL_SECONDS,
      });
      return response;
    }
  }
}
