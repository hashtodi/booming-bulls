import Link from "next/link";
import { branding } from "@/lib/branding";

export default function NotTradeReadyPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          You&rsquo;re not trade ready yet
        </h1>
        <p className="text-base text-muted-foreground">
          Your FNO trading isn&rsquo;t active on both NSE and BSE yet. Activate
          FNO on your Lemonn account, then come back to join {branding.name}.
        </p>
        <a
          href="https://lemonn.co.in"
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Go to Lemonn
        </a>
        <Link
          href="/"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
