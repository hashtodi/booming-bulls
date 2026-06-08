import Link from "next/link";
import { Info } from "lucide-react";
import { branding, supportWhatsAppUrl } from "@/lib/branding";
import { primaryCtaClassName } from "@/lib/cta";

// Lemonn-owned KYC host. Users finish KYC here, then re-initiate the login
// flow. Kept inline (like the F&O URLs on /not-trade-ready) since this page is
// its only consumer.
const KYC_URL = "https://kyc.lemonn.co.in";

export default function KycPendingPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <span className="eyebrow text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {branding.name}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          Complete your KYC
        </h1>
        <p className="text-base text-muted-foreground">
          Your KYC isn&rsquo;t verified on your Lemonn account yet. Finish it,
          then come back to join {branding.name}.
        </p>

        {/* Eligibility callout — the key requirement, made prominent. */}
        <div className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card/60 px-4 py-4 text-left backdrop-blur">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80 ring-1 ring-border">
            <Info className="size-[18px]" aria-hidden />
          </span>
          <p className="text-sm leading-relaxed text-foreground/90">
            Your VIP access will be activated once your KYC is verified.
            Accounts without completed KYC won&rsquo;t be eligible for
            verification.
          </p>
        </div>

        <a
          href={KYC_URL}
          target="_blank"
          rel="noreferrer"
          className={primaryCtaClassName}
        >
          Complete KYC
        </a>
        <Link
          href="/"
          className="text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Back to home
        </Link>

        <p className="text-xs text-muted-foreground">
          Need help? Contact {branding.name}{" "}
          <a
            href={supportWhatsAppUrl}
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline underline-offset-4 hover:text-foreground/70"
          >
            support
          </a>
          .
        </p>
      </div>
    </main>
  );
}
