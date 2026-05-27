import { Bell, Radio, ShieldCheck } from "lucide-react";
import { branding } from "@/lib/branding";
import { LoginButton } from "@/components/login-button";

export default function LandingPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-10 pb-[max(env(safe-area-inset-bottom),2.5rem)] sm:py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-7 sm:gap-8">
        <span className="eyebrow text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {branding.name}
        </span>

        {/* Live pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground/90 backdrop-blur">
          <span className="relative flex size-2">
            <span className="live-dot absolute inline-flex size-full rounded-full bg-primary" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Live Channel
        </div>

        {/* Headline */}
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            The signal
            <br />
            in the noise.
          </h1>
          <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Join our premium Telegram channel. Real-time calls, conviction-only setups, and
            members-only access.
          </p>
        </div>

        {/* Feature stack */}
        <ul className="w-full divide-y divide-border rounded-2xl border border-border bg-card/60 backdrop-blur">
          <FeatureRow
            icon={<Bell className="size-[18px]" />}
            title="Instant Alerts"
            description="Get notified the moment a setup forms."
          />
          <FeatureRow
            icon={<Radio className="size-[18px]" />}
            title="Direct Calls"
            description="Unfiltered market commentary, no noise."
          />
          <FeatureRow
            icon={<ShieldCheck className="size-[18px]" />}
            title="Verified Access"
            description="Single-use invite. Members only."
          />
        </ul>

        {/* CTA */}
        <div className="flex w-full flex-col items-center gap-3">
          <LoginButton />
        </div>
      </div>
    </main>
  );
}

function FeatureRow({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-4 sm:px-5">
      <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/80 ring-1 ring-border">
        {icon}
      </span>
      <div className="flex flex-col gap-0.5">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {description}
        </p>
      </div>
    </li>
  );
}

