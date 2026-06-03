import { NextRequest, NextResponse } from "next/server";
import {
  verifyInviteToken,
  INVITE_COOKIE_NAME,
} from "@/lib/invite-token";
import { markConsumed } from "@/lib/invites-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// /join is an action endpoint, not a navigable page. It consumes the
// single-shot invite-token cookie. Exposing it as GET let browsers (Chrome's
// omnibox prefetcher, link-rel=prefetch, Next.js Link prefetch) silently fire
// the request before the user actually clicks, burning the cookie before the
// real click and landing the user on / instead of Telegram. POST is never
// speculatively prefetched, so the cookie is only ever consumed on intent.
export async function POST(req: NextRequest) {
  const token = req.cookies.get(INVITE_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/", req.url), 303);
  }

  const result = verifyInviteToken(token);
  if (!result.ok) {
    console.warn("[join] invalid token:", result.reason);
    const res = NextResponse.redirect(new URL("/", req.url), 303);
    res.cookies.delete(INVITE_COOKIE_NAME);
    return res;
  }

  // Mark the seat consumed BEFORE letting the user through, so a later re-login
  // lands on /already-member instead of getting a fresh link. Strict: if the
  // store write fails we do NOT redirect to Telegram — handing out access on an
  // unrecorded seat is exactly the gap we're closing. Send them to /error-page
  // with the cookie intact so they can retry once the store recovers. Skipped
  // in placeholder mode where channelId is empty.
  if (result.channelId && result.clientId) {
    try {
      await markConsumed(result.channelId, result.clientId);
    } catch (err) {
      console.error("[join] markConsumed failed; refusing to redirect:", err);
      return NextResponse.redirect(new URL("/error-page", req.url), 303);
    }
  }

  // One-shot: clear the cookie so the same browser session can't replay /join.
  // Note: the underlying Telegram invite link is already member_limit: 1, so
  // this is defense-in-depth, not the primary security control.
  // 303 (See Other) converts the POST into a GET on the redirect target so
  // the browser doesn't try to POST to t.me.
  const res = NextResponse.redirect(result.url, 303);
  res.cookies.delete(INVITE_COOKIE_NAME);
  return res;
}

// Anyone typing /join directly into the URL bar (or a crawler hitting it)
// lands on /. Idempotent — does not touch the cookie. Keeps the route
// prefetch-safe.
export async function GET(req: NextRequest) {
  return NextResponse.redirect(new URL("/", req.url));
}
