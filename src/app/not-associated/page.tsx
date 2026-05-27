import Link from "next/link";
import { branding } from "@/lib/branding";

export default function NotAssociatedPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          You&rsquo;re not associated with {branding.name}
        </h1>
        <p className="text-base text-muted-foreground">
          Your Lemonn account isn&rsquo;t linked to {branding.name}. To join
          this premium channel, you need to be onboarded through{" "}
          {branding.name}.
        </p>
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
