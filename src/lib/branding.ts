export const branding = {
  name: process.env.NEXT_PUBLIC_INFLUENCER_NAME ?? "Influencer",
  tagline:
    process.env.NEXT_PUBLIC_INFLUENCER_TAGLINE ??
    "Join the premium Telegram channel",
  logoUrl: process.env.NEXT_PUBLIC_INFLUENCER_LOGO_URL ?? "",
  primaryColor: process.env.NEXT_PUBLIC_BRAND_PRIMARY_COLOR ?? "#111111",
} as const;

export type Branding = typeof branding;
