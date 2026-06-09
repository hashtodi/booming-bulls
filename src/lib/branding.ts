export const branding = {
  name: process.env.NEXT_PUBLIC_INFLUENCER_NAME ?? "Influencer",
  generic_name: process.env.NEXT_PUBLIC_GENERIC_NAME ?? "Partner",
  tagline:
    process.env.NEXT_PUBLIC_INFLUENCER_TAGLINE ??
    "Unlock VIP Access",
  // Support WhatsApp surfaced on the error page. Digits only,
  // country code included, no "+", so it drops straight into a wa.me link.
  // Override per deployment via NEXT_PUBLIC_SUPPORT_WHATSAPP.
  support_whatsapp:
    process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "917828599621",
} as const;

export type Branding = typeof branding;

// Derived once so the wa.me deep link stays in lockstep with
// branding.support_whatsapp.
export const supportWhatsAppUrl = `https://wa.me/${branding.support_whatsapp}`;
