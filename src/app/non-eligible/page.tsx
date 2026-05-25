import { ArrowLeft, Lock } from "lucide-react";
import { branding } from "@/lib/branding";

export default function NonEligiblePage() {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-10 pb-[max(env(safe-area-inset-bottom),2.5rem)] sm:py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-7 sm:gap-8">
        <span className="eyebrow text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {branding.name}
        </span>

        {/* Lock icon */}
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-[oklch(0.65_0.20_25_/_0.15)] blur-2xl" aria-hidden />
          <div className="relative flex size-16 items-center justify-center rounded-2xl border border-border bg-card/60 text-[oklch(0.78_0.15_45)] backdrop-blur">
            <Lock className="size-7" aria-hidden />
          </div>
        </div>

        {/* Headline */}
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Not eligible yet.
          </h1>
          <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            {branding.nonEligibleMessage}
          </p>
        </div>

        {/* Back link */}
        <a
          href="/"
          className="group/back inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-4 py-2 text-sm font-medium text-foreground/90 backdrop-blur transition-colors hover:bg-muted"
        >
          <ArrowLeft
            className="size-4 transition-transform duration-200 group-hover/back:-translate-x-0.5"
            aria-hidden
          />
          Back to home
        </a>
      </div>
    </main>
  );
}
