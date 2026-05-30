// Shared "primary" CTA styling — the white, raised button used on the landing
// page. Apply to any <a>/<Link>/<button> that is the primary action on a page
// so every primary CTA across the app matches the landing page's look.
//
// Pass through cn() at the call site to add layout-specific bits (e.g. a
// `group/cta` name for icon hover, or `disabled:*` states):
//   className={cn("group/cta", primaryCtaClassName, "disabled:opacity-75")}
export const primaryCtaClassName = [
  "relative inline-flex h-12 w-full select-none items-center justify-center gap-2",
  "rounded-2xl px-6 text-base font-semibold tracking-tight text-neutral-900",
  "bg-gradient-to-b from-white to-[oklch(0.93_0.005_95)]",
  "shadow-[inset_0_1px_0_oklch(1_0_0_/_0.9),inset_0_-1px_0_oklch(0_0_0_/_0.06)]",
  "ring-1 ring-inset ring-black/5",
  "transition-[transform,box-shadow] duration-150 ease-out",
  "hover:from-white hover:to-[oklch(0.96_0.005_95)]",
  "active:translate-y-px",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.85_0.18_95)] focus-visible:ring-offset-2 focus-visible:ring-offset-background",
].join(" ");
