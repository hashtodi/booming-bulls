import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { OUTCOMES, MOCK_USER_DETAILS, isTestModeEnabled } from "./data";

const TREE_ASCII = `
  fetch-user-details ──► is_dra_matched ──┬─ false ──────────────────────────► /not-associated
                                          │
                                          └─ true ──► kyc_status ──┬─ !COMPLETED ─► kyc.lemonn.co.in
                                                                   │
                                                                   └─ COMPLETED ──► nse_fno && bse_fno ──┬─ !TRADE_READY ─► /not-trade-ready
                                                                                                         │
                                                                                                         └─ TRADE_READY ──► fno_order_executed ──┬─ false ─► /no-fno-trade
                                                                                                                                                 │
                                                                                                                                                 └─ true ──► /welcome ✅
`;

export default function TestPage() {
  if (!isTestModeEnabled()) {
    notFound();
  }

  return (
    <main className="flex flex-1 flex-col items-center px-6 py-12">
      <div className="flex w-full max-w-5xl flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            Eligibility decision tree — test harness
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Each card simulates a Lemonn{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              fetch-user-details
            </code>{" "}
            response and routes through{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              /test/run/&lt;kind&gt;
            </code>
            . Real Lemonn API is bypassed. Gated by env{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              ENABLE_TEST_MODE=true
            </code>
            ; this whole directory (
            <code className="rounded bg-muted px-1 py-0.5 text-xs">
              src/app/test/
            </code>
            ) can be deleted when no longer needed.
          </p>
        </header>

        <section className="rounded-lg border bg-muted/30 p-4 overflow-x-auto">
          <pre className="text-xs leading-relaxed font-mono whitespace-pre">
            {TREE_ASCII}
          </pre>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {OUTCOMES.map((o) => (
            <Card key={o.kind} className="flex flex-col">
              <CardHeader>
                <CardTitle className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {o.kind}
                  </span>
                  <span className="text-base">{o.title}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-4">
                <p className="text-sm text-muted-foreground">
                  {o.description}
                </p>
                <div className="text-xs text-muted-foreground">
                  Lands on:{" "}
                  <code className="rounded bg-muted px-1 py-0.5">
                    {o.destination}
                  </code>
                </div>
                <pre className="rounded-md border bg-muted/40 p-3 text-xs leading-relaxed font-mono overflow-x-auto">
                  {JSON.stringify(MOCK_USER_DETAILS[o.kind], null, 2)}
                </pre>
                <div className="mt-auto flex gap-2">
                  <a
                    href={`/test/run/${o.kind}`}
                    className={cn(
                      buttonVariants({ size: "lg" }),
                      "h-10 flex-1 rounded-md text-sm font-medium",
                    )}
                  >
                    Test this outcome →
                  </a>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <footer className="text-xs text-muted-foreground">
          Tip: open each link in a new tab so the cookies / redirects
          don&rsquo;t interfere with each other across clicks.
        </footer>
      </div>
    </main>
  );
}
