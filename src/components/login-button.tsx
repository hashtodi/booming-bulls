import { cn } from "@/lib/utils";
import { buildLemonnLoginUrl } from "@/lib/lemonn";

export function LoginButton() {
  const href = buildLemonnLoginUrl();
  return (
    <a
      href={href}
      className={cn(
        "group/cta relative inline-flex h-14 w-full select-none items-center justify-center gap-3",
        "rounded-2xl px-6 text-base font-semibold tracking-tight text-neutral-900",
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
        <span className="font-medium text-neutral-700">Already a Lemonn User?</span>
        <span className="ml-1.5">Login</span>
      </span>
    </a>
  );
}
