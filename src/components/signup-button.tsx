import { cn } from "@/lib/utils";
import { env } from "@/lib/env";

// Secondary CTA shown beneath the primary "Login with Lemonn" button. Aimed at
// users who don't yet have a Lemonn account (they'd otherwise fail the
// is_dra_matched check after logging in). Links to LEMONN_SIGNUP_URL.
// Server-only component (reads the server env); renders nothing when the var
// is empty, so the funnel degrades cleanly. Must not be used client-side.
export function SignupButton() {
  const href = env.LEMONN_SIGNUP_URL;
  if (!href) return null;

  return (
    <a
      href={href}
      className={cn(
        "group/signup relative inline-flex h-12 w-full select-none items-center justify-center gap-2",
        "rounded-2xl px-6 text-base font-medium tracking-tight",
        "border border-white bg-card/60 backdrop-blur",
        "transition-colors duration-150 ease-out",
        "hover:bg-card",
        "active:translate-y-px",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <span>
        <span className="text-muted-foreground">New to Lemonn?</span>
        <span className="ml-1.5 font-semibold text-foreground">Sign Up</span>
      </span>
    </a>
  );
}
