import { cn } from "@/lib/utils";
import { env } from "@/lib/env";

// Primary CTA. Aimed at users who don't yet have a Lemonn account (they'd
// otherwise fail the is_dra_matched check after logging in). Links to
// LEMONN_SIGNUP_URL. Server-only component (reads the server env); renders
// nothing when the var is empty, so the funnel degrades cleanly.
export function SignupButton() {
  const href = env.LEMONN_SIGNUP_URL;
  if (!href) return null;

  return (
    <a
      href={href}
      className={cn(
        "group/signup relative inline-flex h-12 w-full select-none items-center justify-center gap-2",
        "rounded-2xl px-6 text-base font-medium tracking-tight text-neutral-900",
        "bg-gradient-to-b from-white to-[oklch(0.93_0.005_95)]",
        "shadow-[inset_0_1px_0_oklch(1_0_0_/_0.9),inset_0_-1px_0_oklch(0_0_0_/_0.06)]",
        "ring-1 ring-inset ring-black/5",
        "transition-[transform,box-shadow] duration-150 ease-out",
        "hover:from-white hover:to-[oklch(0.96_0.005_95)]",
        "active:translate-y-px",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.85_0.18_95)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <span>
        <span className="font-medium text-neutral-600">New to Lemonn?</span>
        <span className="ml-1.5 font-semibold">Sign Up</span>
      </span>
    </a>
  );
}
