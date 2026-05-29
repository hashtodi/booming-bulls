export const branding = {
  name: process.env.NEXT_PUBLIC_INFLUENCER_NAME ?? "Influencer",
  tagline:
    process.env.NEXT_PUBLIC_INFLUENCER_TAGLINE ??
    "Join the premium Telegram channel",
} as const;

export type Branding = typeof branding;
