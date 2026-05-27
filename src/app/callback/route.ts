import { NextRequest, NextResponse } from "next/server";
import { verifyLemonnCallback, KYC_REDIRECT_URL } from "@/lib/lemonn";
import { issueInviteLink } from "@/lib/telegram";
import {
  signInviteToken,
  INVITE_COOKIE_NAME,
  INVITE_COOKIE_TTL_SECONDS,
} from "@/lib/invite-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requestToken =
    req.nextUrl.searchParams.get("request_token") ?? undefined;
  const result = await verifyLemonnCallback(requestToken);

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
