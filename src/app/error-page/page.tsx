import Link from "next/link";
import { branding } from "@/lib/branding";
import { primaryCtaClassName } from "@/lib/cta";

export default function TransientErrorPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <span className="eyebrow text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {branding.name}
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-base text-muted-foreground">
          We couldn&rsquo;t finish setting you up just now. This is usually a
          temporary glitch. Please try logging in again.
        </p>
        <Link
          href="/"
          className={primaryCtaClassName}
        >
          Try again
        </Link>
        <p className="text-xs text-muted-foreground">
          If this keeps happening, contact {branding.name} support.
        </p>
      </div>
    </main>
  );
}
