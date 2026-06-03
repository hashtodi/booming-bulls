import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

// Lazily-built, cached service-role client for the invite store. The secret
// key bypasses RLS, so this MUST stay server-only (it's never imported into a
// client component, and is guarded by "server-only" above).
//
// Supabase env is optional in env.ts so the app still boots in placeholder mode
// (Telegram unconfigured). If the store is actually used without it configured,
// we throw a clear error here rather than failing with a cryptic client error.
let cached: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (cached) return cached;

  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase is not configured: set SUPABASE_URL and SUPABASE_SECRET_KEY to use the invite store.",
    );
  }

  cached = createClient(url, key, {
    // Stateless server client: nothing to persist or refresh, never a browser.
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return cached;
}
