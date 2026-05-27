export const branding = {
  name: process.env.NEXT_PUBLIC_INFLUENCER_NAME ?? "Influencer",
  tagline:
    process.env.NEXT_PUBLIC_INFLUENCER_TAGLINE ??
    "Join the premium Telegram channel",
  logoUrl: process.env.NEXT_PUBLIC_INFLUENCER_LOGO_URL ?? "",
} as const;

export type Branding = typeof branding;
