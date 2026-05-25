import { NextRequest, NextResponse } from "next/server";
import {
  verifyInviteToken,
  INVITE_COOKIE_NAME,
} from "@/lib/invite-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(INVITE_COOKIE_NAME)?.value;
  if (!token) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  const result = verifyInviteToken(token);
  if (!result.ok) {
    console.warn("[join] invalid token:", result.reason);
    const res = NextResponse.redirect(new URL("/", req.url));
    res.cookies.delete(INVITE_COOKIE_NAME);
    return res;
  }

  // One-shot: clear the cookie so the same browser session can't replay /join.
  // Note: the underlying Telegram invite link is already member_limit: 1, so
  // this is defense-in-depth, not the primary security control.
  const res = NextResponse.redirect(result.url);
  res.cookies.delete(INVITE_COOKIE_NAME);
  return res;
}
