-- channel_invites: one row per (telegram channel, lemonn client_id).
--
-- Enforces "one VIP seat per eligible Lemonn user, per channel": the /callback
-- handler looks a user up here before issuing, so re-logging into Lemonn can't
-- mint a fresh invite link every time. The composite primary key scopes the
-- guarantee to a single Telegram channel, so the same template deployed for a
-- different influencer (different TELEGRAM_CHANNEL_ID) never collides.
--
-- This table is server-only. It is never read from the browser: RLS is enabled
-- with no policies, and the auto-granted privileges are revoked from the public
-- API roles. The Next.js server reaches it with the service-role/secret key,
-- which bypasses RLS.

create extension if not exists moddatetime schema extensions;

create table if not exists public.channel_invites (
  channel_id   text        not null,                 -- TELEGRAM_CHANNEL_ID (tenant scope)
  client_id    text        not null,                 -- Lemonn client_id (the eligible user)
  invite_url   text        not null,                 -- the Telegram invite link we issued
  status       text        not null default 'issued'
                 check (status in ('issued', 'consumed')),
  expires_at   timestamptz not null,                 -- when invite_url stops working (Telegram TTL)
  consumed_at  timestamptz,                          -- set when the user clicks Join (best-effort)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (channel_id, client_id)
);

-- Lock it down: RLS on + no policies = closed to anon/authenticated. Revoking
-- the auto-granted table privileges is defense in depth at the grant layer too.
alter table public.channel_invites enable row level security;
revoke all on table public.channel_invites from anon, authenticated;

-- Server access: supabase-js uses the service-role/secret key, which respects
-- table GRANTs (BYPASSRLS skips policies, not privileges). Grant it explicitly
-- so the store works regardless of the project's "auto-expose new tables"
-- setting. anon/authenticated stay revoked above, so the table is still private.
grant select, insert, update, delete on table public.channel_invites to service_role;

-- Keep updated_at fresh on every UPDATE.
create trigger handle_channel_invites_updated_at
  before update on public.channel_invites
  for each row
  execute procedure extensions.moddatetime (updated_at);
