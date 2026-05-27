import { branding } from "@/lib/branding";

export default function NoFnoTradePage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Place your first FNO trade
        </h1>
        <p className="text-base text-muted-foreground">
          You&rsquo;re fully set up, but you haven&rsquo;t executed an FNO
          trade on Lemonn yet. Place at least one FNO trade, then come back to
          join {branding.name}.
        </p>
        <a
          href="https://lemonn.co.in"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Trade on Lemonn
        </a>
        <a
          href="/"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to home
        </a>
      </div>
    </main>
  );
}
