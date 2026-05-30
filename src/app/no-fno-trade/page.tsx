import Link from "next/link";
import { headers } from "next/headers";
import { userAgent } from "next/server";
import { Info } from "lucide-react";
import { branding } from "@/lib/branding";
import { primaryCtaClassName } from "@/lib/cta";

// Where we send users to place their first F&O trade. Mobile/tablet users go
// to the Lemonn app's F&O home; desktop/laptop users get the web trading
// terminal (the app deep-link isn't useful on a desktop browser).
const MOBILE_FNO_URL = "https://lmnn.in/fno-home";
const DESKTOP_FNO_URL = "https://tv.lemonn.co.in/";

export default async function NoFnoTradePage() {
  // Server-side UA sniff via Next's helper. `device.type` is "mobile" or
  // "tablet" on touch devices and undefined on desktop. Reading headers()
  // opts this route into dynamic rendering, which is fine for a status page.
  const { device } = userAgent({ headers: await headers() });
  const isMobile = device.type === "mobile" || device.type === "tablet";
  const tradeUrl = isMobile ? MOBILE_FNO_URL : DESKTOP_FNO_URL;

  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <span className="eyebrow text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {branding.name}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          Complete your first F&amp;O trade
        </h1>
        <p className="text-base text-muted-foreground">
          You&rsquo;re fully set up, but you haven&rsquo;t placed an F&amp;O
          trade on your Lemonn account yet.
        </p>

        {/* Eligibility callout — the key requirement, made prominent. */}
        <div className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card/60 px-4 py-4 text-left backdrop-blur">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80 ring-1 ring-border">
            <Info className="size-[18px]" aria-hidden />
          </span>
          <p className="text-sm leading-relaxed text-foreground/90">
            Your VIP access will be activated only after you complete your
            first F&amp;O trade. Accounts without a completed F&amp;O trade
            will not be eligible for verification.
          </p>
        </div>

        <a
          href={tradeUrl}
          target="_blank"
          rel="noreferrer"
          className={primaryCtaClassName}
        >
          Trade on Lemonn
        </a>
        <Link
          href="/"
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
