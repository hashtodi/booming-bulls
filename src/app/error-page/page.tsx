import { branding } from "@/lib/branding";

export default function TransientErrorPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Something went wrong
        </h1>
        <p className="text-base text-muted-foreground">
          We couldn&rsquo;t finish setting you up just now. This is usually a
          temporary glitch. Please try logging in again.
        </p>
        <a
          href="/"
          className="inline-flex h-12 items-center justify-center rounded-full bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          Try again
        </a>
        <p className="text-xs text-muted-foreground">
          If this keeps happening, contact {branding.name} support.
        </p>
      </div>
    </main>
  );
}
