import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { branding } from "@/lib/branding";
import { primaryCtaClassName } from "@/lib/cta";

// Shown when an eligible user logs in again after their invite was already
// consumed. Their single VIP seat is spent — we don't mint a new link.
export default function AlreadyMemberPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <span className="eyebrow text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {branding.name}
        </span>
        <div className="inline-flex items-center gap-2 rounded-full border border-[oklch(0.72_0.18_152_/_0.3)] bg-[oklch(0.72_0.18_152_/_0.08)] px-3 py-1.5 text-xs font-medium text-[oklch(0.85_0.15_152)]">
          <CircleCheck className="size-3.5" aria-hidden />
          Already a Member
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          You already have access
        </h1>
        <p className="text-base text-muted-foreground">
          Your invite to the {branding.name} channel has already been claimed.
          Open Telegram to find the channel in your chats. If you can&rsquo;t
          see it, contact {branding.name} support.
        </p>
        <Link href="/" className={primaryCtaClassName}>
          Back to home
        </Link>
      </div>
    </main>
  );
}
