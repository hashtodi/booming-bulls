"use client";

import { useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { primaryCtaClassName } from "@/lib/cta";

export function JoinChannelButton() {
  // Synchronous guard — useState is async and would let a fast second click
  // through before the disabled re-render. A ref is set/read synchronously
  // so the second submit is rejected immediately.
  const submittedRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (submittedRef.current) {
      e.preventDefault();
      return;
    }
    submittedRef.current = true;
    setSubmitting(true);
  }

  return (
    <form
      action="/join"
      method="POST"
      onSubmit={handleSubmit}
      className="w-full"
    >
      <button
        type="submit"
        disabled={submitting}
        className={cn(
          "group/cta",
          primaryCtaClassName,
          "disabled:opacity-75 disabled:cursor-wait",
        )}
      >
        <PaperPlaneIcon />
        <span>
          {submitting ? "Opening Telegram…" : "Join Telegram Channel"}
        </span>
      </button>
    </form>
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
