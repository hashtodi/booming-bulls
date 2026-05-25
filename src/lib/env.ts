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
  LEMONN_SESSION_TOKEN_URL: z.url(),
  // TBD — Lemonn will provide this. While empty, eligibility defaults to true with a server warning.
  LEMONN_ELIGIBILITY_URL: z.union([z.url(), z.literal("")]).optional(),

  // Telegram (placeholder until bot is admin on the channel).
  // Allow empty string so .env.local can be templated with TELEGRAM_BOT_TOKEN= etc.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHANNEL_ID: z.string().optional(),
  TELEGRAM_PLACEHOLDER_URL: z.url(),

  // App-internal secret used to sign the invite-token cookie. Generated once
  // per deployment with `openssl rand -hex 32`. Kept separate from Lemonn's
  // secret so rotating one doesn't invalidate the other.
  INVITE_TOKEN_SECRET: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "Must be a 64-char hex string (32 bytes). Generate with `openssl rand -hex 32`."),
});

const parsed = serverEnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid server environment variables:");
  console.error(z.flattenError(parsed.error).fieldErrors);
  throw new Error("Invalid server environment. See logs above.");
}

export const env = parsed.data;
