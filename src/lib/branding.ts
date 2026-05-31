export const branding = {
  name: process.env.NEXT_PUBLIC_INFLUENCER_NAME ?? "Influencer",
  generic_name: process.env.NEXT_PUBLIC_GENERIC_NAME ?? "Partner",
  tagline:
    process.env.NEXT_PUBLIC_INFLUENCER_TAGLINE ??
    "Unlock VIP Access",
} as const;

export type Branding = typeof branding;
