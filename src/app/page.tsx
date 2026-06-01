import { branding } from "@/lib/branding";
import { LoginButton } from "@/components/login-button";
import { SignupButton } from "@/components/signup-button";

export default function LandingPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-5 py-8 pb-[max(env(safe-area-inset-bottom),1.5rem)] sm:py-10">
      <div className="flex w-full max-w-md flex-col items-center gap-5 sm:gap-6">
        {/* Live pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1.5 text-xs font-medium text-foreground/90 backdrop-blur">
          <span className="relative flex size-2">
            <span className="live-dot absolute inline-flex size-full rounded-full bg-primary" />
            <span className="relative inline-flex size-2 rounded-full bg-primary" />
          </span>
          Live Channel
        </div>

        {/* Headline */}
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">
            {branding.name}
            <br />
             VIP Access.
          </h1>
          <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Get real-time trade alerts, high-conviction setups, market insights, and members-only updates.
          </p>
        </div>

        {/* How-it-works steps */}
        <div className="flex w-full flex-col gap-2.5">
          <p className="text-center text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            How to unlock VIP access
          </p>
          <ul className="w-full divide-y divide-border rounded-2xl border border-border bg-card/60 backdrop-blur">
            <StepRow
              n={1}
              title="Open your Lemonn account"
              description="Use the Sign Up button below to create your account."
            />
            <StepRow
              n={2}
              title="Complete your first F&O trade"
              description="Place one F&O trade from your Lemonn account."
            />
            <StepRow
              n={3}
              title="Return and click Unlock"
              description="Come back to this page once your trade is done."
            />
            <StepRow
              n={4}
              title="VIP access unlocks automatically"
              description="We verify your account and unlock your access instantly."
            />
          </ul>
        </div>

        {/* CTA */}
        <div className="flex w-full flex-col items-center gap-4">
          <SignupButton />
          <LoginButton />
        </div>
      </div>
    </main>
  );
}

function StepRow({
  n,
  title,
  description,
}: {
  n: number;
  title: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-3 px-4 py-3 sm:px-5">
      <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold tabular-nums text-foreground/90 ring-1 ring-border">
        {n}
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

