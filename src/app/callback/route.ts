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

// External destination for users whose KYC isn't done. Hardcoded for now;
// extract to env if Lemonn ever changes this host.
const KYC_REDIRECT_URL = "https://kyc.lemonn.co.in";

export async function GET(req: NextRequest) {
  const params: Record<string, string> = {};
  req.nextUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });

  const result = await verifyLemonnCallback(params);

  switch (result.kind) {
    case "transient_error":
      return NextResponse.redirect(new URL("/error-page", req.url));

    case "not_associated":
      return NextResponse.redirect(new URL("/not-associated", req.url));

    case "kyc_pending":
      // External redirect to Lemonn's KYC site. User completes KYC there and
      // would re-initiate the login flow afterwards.
      return NextResponse.redirect(KYC_REDIRECT_URL);

    case "not_trade_ready":
      return NextResponse.redirect(new URL("/not-trade-ready", req.url));

    case "no_fno_trade":
      return NextResponse.redirect(new URL("/no-fno-trade", req.url));

    case "eligible": {
      let inviteUrl: string;
      try {
        const invite = await issueInviteLink(result.user);
        inviteUrl = invite.url;
      } catch (err) {
        console.error("[callback] issueInviteLink failed:", err);
        return NextResponse.redirect(new URL("/error-page", req.url));
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
  }
}
