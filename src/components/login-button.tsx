import { cn } from "@/lib/utils";
import { buildLemonnLoginUrl } from "@/lib/lemonn";

export function LoginButton() {
  const href = buildLemonnLoginUrl();
  return (
    <a
      href={href}
      className={cn(
        "group/cta relative inline-flex h-12 w-full select-none items-center justify-center gap-3",
        "rounded-2xl px-6 text-base font-medium tracking-tight",
        "border border-white bg-card/60 backdrop-blur",
        "transition-colors duration-150 ease-out",
        "hover:bg-card",
        "active:translate-y-px",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <span>
        <span className="font-semibold text-foreground">Unlock VIP Access</span>
        <span className="ml-1.5 text-muted-foreground">(Lemonn Traders only)</span>
      </span>
    </a>
  );
}
