"use client";

import { cn } from "@/lib/utils";

export function JoinChannelButton() {
  return (
    <a
      href="/join"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
      rel="nofollow noreferrer"
      className={cn(
        "group/cta relative inline-flex h-14 w-full select-none items-center justify-center gap-3",
        "rounded-2xl px-6 text-base font-semibold tracking-tight text-white",
        "bg-[oklch(0.68_0.14_245)]",
        "shadow-[0_8px_24px_-12px_oklch(0.68_0.14_245_/_0.5)]",
        "transition-colors duration-150 ease-out",
        "hover:bg-[oklch(0.72_0.14_245)]",
        "active:translate-y-px active:bg-[oklch(0.64_0.14_245)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <PaperPlaneIcon />
      <span>Join Telegram Channel</span>
    </a>
  );
}

function PaperPlaneIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="-translate-y-px transition-transform duration-200 group-hover/cta:translate-x-0.5"
    >
      <path d="M21.5 2.5 2.5 11.5l7 2.5 2.5 7 9-18.5Z" />
      <path d="m9.5 14 5-5" />
    </svg>
  );
}
