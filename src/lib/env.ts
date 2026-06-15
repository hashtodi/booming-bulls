import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  // Lemonn-issued credentials (offline onboarding).
  LEMONN_API_KEY: z.string().min(1),
  LEMONN_SECRET_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "Must be a 64-char hex string (32-byte Ed25519 seed)"),

  // Lemonn endpoints.
  LEMONN_LOGIN_URL: z.url(),
  // Single endpoint that takes the request_token + signature and returns user
  // details directly. Replaces the old two-step (generate_session_token →
  // eligibility) flow.
  LEMONN_USER_DETAILS_URL: z.url(),

  // Lemonn account-creation / affiliate onboarding link for users who don't
  // have an account yet. Drives the "Create an account" CTA on the landing
  // page. Optional — leave empty/unset to hide that button.
  LEMONN_SIGNUP_URL: z.url().or(z.literal("")).optional(),

  // Lemonn appears to allowlist x-request-id values per partner. The value
  // `canary-app-123` from their sample is currently the only one that gets
  // past auth on our account — any other value (UUID, plain alphanumeric, or
  // missing) returns a misleading "Invalid access token format" 401.
  // Ask Lemonn for the official value(s) for production and update this env.
  LEMONN_REQUEST_ID: z.string().min(1),

  // Telegram (placeholder until bot is admin on the channel).
  // Allow empty string so .env.local can be templated with TELEGRAM_BOT_TOKEN= etc.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHANNEL_ID: z.string().optional(),
  TELEGRAM_PLACEHOLDER_URL: z.url(),

  // Shared secret echoed by Telegram in the X-Telegram-Bot-Api-Secret-Token
  // header on every webhook call (set via setWebhook's secret_token). The
  // /api/telegram/webhook route rejects requests whose header doesn't match.
  // Optional so the app still boots before the webhook is configured; while
  // unset the webhook route returns 403 (feature dormant).
  // Generate with `openssl rand -hex 32`.
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  // App-internal secret used to sign the invite-token cookie. Generated once
  // per deployment with `openssl rand -hex 32`. Kept separate from Lemonn's
  // secret so rotating one doesn't invalidate the other.
  INVITE_TOKEN_SECRET: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "Must be a 64-char hex string (32 bytes). Generate with `openssl rand -hex 32`."),

  // Tenant slug identifying this influencer's deployment in the shared
  // `entries` table (lib/invites-store.ts). One Supabase project is shared by
  // every influencer; each row is scoped by this value. Distinct from
  // TELEGRAM_CHANNEL_ID (the Telegram target) and NEXT_PUBLIC_INFLUENCER_NAME
  // (the display name) — this is the DB tenant key. Lowercase slug.
  INFLUENCER_SLUG: z
    .string()
    .regex(
      /^[a-z0-9_]+$/,
      "Must be a lowercase slug of a-z, 0-9, underscore (e.g. booming_bulls)",
    ),

  // Supabase — backs the invite store that enforces one seat per Lemonn
  // client_id (see lib/invites-store.ts). Optional so the app still boots in
  // placeholder mode (Telegram unconfigured); the store throws a clear error
  // if used while these are unset. SECRET_KEY is the server-only service-role
  // / secret key (sb_secret_...) — never expose it with a NEXT_PUBLIC_ prefix.
  SUPABASE_URL: z.url().or(z.literal("")).optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid server environment variables:");
  console.error(z.flattenError(parsed.error).fieldErrors);
  throw new Error("Invalid server environment. See logs above.");
}

export const env = parsed.data;
