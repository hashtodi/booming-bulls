import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CircleCheck } from "lucide-react";
import { branding } from "@/lib/branding";
import { JoinChannelButton } from "@/components/join-channel-button";
import {
  INVITE_COOKIE_NAME,
  verifyInviteToken,
} from "@/lib/invite-token";

export default async function WelcomePage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(INVITE_COOKIE_NAME)?.value;

  if (!token) {
    redirect("/");
  }

  const result = verifyInviteToken(token);
  if (!result.ok) {
    console.warn("[welcome] invalid invite token:", result.reason);
    redirect("/");
  }

  return (
    <main className="flex flex-1 items-center justify-center px-5 py-10 pb-[max(env(safe-area-inset-bottom),2.5rem)] sm:py-16">
      <div className="flex w-full max-w-md flex-col items-center gap-7 sm:gap-8">
        <span className="eyebrow text-[11px] font-medium uppercase tracking-[0.18em] text-[oklch(0.72_0.18_152)]">
          Access Granted
        </span>

        <div className="inline-flex items-center gap-2 rounded-full border border-[oklch(0.72_0.18_152_/_0.3)] bg-[oklch(0.72_0.18_152_/_0.08)] px-3 py-1.5 text-xs font-medium text-[oklch(0.85_0.15_152)]">
          <CircleCheck className="size-3.5" aria-hidden />
          Verified Member
        </div>

        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-balance text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            You&rsquo;re in.
          </h1>
          <p className="max-w-sm text-pretty text-sm leading-relaxed text-muted-foreground sm:text-base">
            Welcome to {branding.name}. Your private invite is ready!
          </p>
        </div>

        <div className="flex w-full">
          <JoinChannelButton />
        </div>
      </div>
    </main>
  );
}
