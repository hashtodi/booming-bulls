// ─────────────────────────────────────────────────────────────────────────────
// 🧪 TEST MODE — deletable
//
// This entire directory (src/app/test/) is the dev test harness. To remove
// test mode completely:
//   1. `rm -rf src/app/test/`
//   2. (optional) delete the ENABLE_TEST_MODE env var from Vercel / .env.local
//
// No other file references anything in here. callback/route.ts and lemonn.ts
// are unchanged when this directory is deleted.
//
// To gate access in production: set env var `ENABLE_TEST_MODE=true`. Without
// it, /test and /test/run both 404. Real users on prod always go through
// /callback (which never knows about test mode).
// ─────────────────────────────────────────────────────────────────────────────

import "server-only";
import { NextResponse } from "next/server";
import {
  decideOutcome,
  type LemonnUserDetails,
  type LemonnUser,
} from "@/lib/lemonn";
import { issueInviteLink } from "@/lib/telegram";
import {
  signInviteToken,
  INVITE_COOKIE_NAME,
  INVITE_COOKIE_TTL_SECONDS,
} from "@/lib/invite-token";

const KYC_REDIRECT_URL = "https://kyc.lemonn.co.in";

export function isTestModeEnabled(): boolean {
  return process.env.ENABLE_TEST_MODE === "true";
}

// Synthetic responses that exercise each branch of decideOutcome.
export const MOCK_USER_DETAILS: Record<string, LemonnUserDetails> = {
  not_associated: {
    is_dra_matched: false,
    name: "Mock Not-Associated",
    kyc_status: "COMPLETED",
  },
  kyc_pending: {
    is_dra_matched: true,
    name: "Mock KYC-Pending",
    kyc_status: "PENDING",
  },
  not_trade_ready: {
    is_dra_matched: true,
    name: "Mock Not-Trade-Ready",
    kyc_status: "COMPLETED",
    nse_fno_status: "PENDING",
    bse_fno_status: "TRADE_READY",
  },
  no_fno_trade: {
    is_dra_matched: true,
    name: "Mock No-FNO-Trade",
    kyc_status: "COMPLETED",
    nse_fno_status: "TRADE_READY",
    bse_fno_status: "TRADE_READY",
    fno_order_executed: false,
  },
  eligible: {
    is_dra_matched: true,
    name: "Mock Eligible",
    kyc_status: "COMPLETED",
    nse_fno_status: "TRADE_READY",
    bse_fno_status: "TRADE_READY",
    fno_order_executed: true,
  },
};

export type TestOutcome = {
  kind: string;
  title: string;
  destination: string;
  description: string;
};

// UI metadata for the /test page's cards. Stays in sync with MOCK_USER_DETAILS
// because both live in this file.
export const OUTCOMES: TestOutcome[] = [
  {
    kind: "not_associated",
    title: "Not associated with the influencer",
    destination: "/not-associated",
    description:
      "is_dra_matched is false → user isn't linked to this influencer.",
  },
  {
    kind: "kyc_pending",
    title: "KYC not completed",
    destination: "→ kyc.lemonn.co.in (external)",
    description: "is_dra_matched is true but kyc_status is not COMPLETED.",
  },
  {
    kind: "not_trade_ready",
    title: "FNO not trade-ready",
    destination: "/not-trade-ready",
    description:
      "Either nse_fno_status or bse_fno_status is not TRADE_READY.",
  },
  {
    kind: "no_fno_trade",
    title: "No FNO trade yet",
    destination: "/no-fno-trade",
    description:
      "Both FNO statuses are TRADE_READY but the user hasn't executed an FNO trade.",
  },
  {
    kind: "eligible",
    title: "Eligible (happy path)",
    destination: "/welcome → /join → Telegram channel",
    description:
      "All checks pass. Telegram invite link is generated and stored in an httpOnly cookie.",
  },
];

// Executes a mocked outcome end-to-end: runs decideOutcome, dispatches to the
// matching destination, and (for "eligible") issues a real Telegram invite
// link and sets the cookie. Mirrors the real /callback's dispatch table.
export async function handleMockRun(
  kind: string,
  requestUrl: string | URL,
): Promise<NextResponse> {
  const details = MOCK_USER_DETAILS[kind];
  if (!details) {
    console.warn(`[test] unknown mock kind "${kind}".`);
    return NextResponse.redirect(new URL("/error-page", requestUrl));
  }

  console.warn(`[test] MOCK MODE — running outcome="${kind}"`);

  const user: LemonnUser = { id: `mock-${kind}`, details };
  const outcome = decideOutcome(user);

  switch (outcome.kind) {
    case "not_associated":
      return NextResponse.redirect(new URL("/not-associated", requestUrl));

    case "kyc_pending":
      return NextResponse.redirect(KYC_REDIRECT_URL);

    case "not_trade_ready":
      return NextResponse.redirect(new URL("/not-trade-ready", requestUrl));

    case "no_fno_trade":
      return NextResponse.redirect(new URL("/no-fno-trade", requestUrl));

    case "eligible": {
      let inviteUrl: string;
      try {
        const invite = await issueInviteLink(outcome.user);
        inviteUrl = invite.url;
      } catch (err) {
        console.error("[test] issueInviteLink failed:", err);
        return NextResponse.redirect(new URL("/error-page", requestUrl));
      }

      const token = signInviteToken(inviteUrl, INVITE_COOKIE_TTL_SECONDS);
      const response = NextResponse.redirect(new URL("/welcome", requestUrl));
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
