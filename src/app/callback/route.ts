import { NextRequest, NextResponse } from "next/server";
import { verifyLemonnCallback } from "@/lib/lemonn";
import { issueInviteLink } from "@/lib/telegram";
import {
  signInviteToken,
  INVITE_COOKIE_NAME,
  INVITE_COOKIE_TTL_SECONDS,
} from "@/lib/invite-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  const result = await verifyLemonnCallback(params);

  if (!result.eligible) {
    return NextResponse.redirect(new URL("/non-eligible", req.url));
  }

  let inviteUrl: string;
  try {
    const invite = await issueInviteLink(result.user);
    inviteUrl = invite.url;
  } catch (err) {
    console.error("[callback] issueInviteLink failed:", err);
    return NextResponse.redirect(new URL("/non-eligible", req.url));
  }

  const token = signInviteToken(inviteUrl, INVITE_COOKIE_TTL_SECONDS);
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
