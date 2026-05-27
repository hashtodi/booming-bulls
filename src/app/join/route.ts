import { NextRequest, NextResponse } from "next/server";
import {
  verifyInviteToken,
  INVITE_COOKIE_NAME,
} from "@/lib/invite-token";

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
