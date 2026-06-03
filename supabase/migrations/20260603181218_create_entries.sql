-- Refactor: replace `channel_invites` with a single shared, multi-tenant
-- `entries` table. One Supabase project serves every influencer; rows are
-- isolated by the `influencer` tenant slug (= env INFLUENCER_SLUG). We log
-- EVERY login (name + outcome + association + the raw Lemonn user-details
-- payload) and fold the invite/seat lifecycle into the same row.
--
-- IST GOTCHA: the timestamp columns are naive `timestamp` holding IST
-- wall-clock (so they read as IST in the Supabase editor). Every "now" in this
-- file is `now() at time zone 'Asia/Kolkata'` (naive IST) for consistency, and
-- `updated_at` uses a custom trigger — NOT moddatetime, which writes UTC now().

-- ── Drop the old design (throwaway test data) ──────────────────────────────
drop table if exists public.channel_invites cascade;
drop function if exists public.claim_invite(text, text, int);

-- ── entries: one shared table, all influencers ─────────────────────────────
create table public.entries (
  influencer    text not null,              -- tenant slug (= env INFLUENCER_SLUG)
  client_id     text not null,              -- Lemonn client_id
  name          text,                       -- details.name (nullable)
  outcome       text not null               -- latest login result, for EVERY user
                  check (outcome in ('eligible', 'not_associated', 'kyc_pending',
                                     'not_trade_ready', 'no_fno_trade')),
  associated    boolean not null,           -- is_dra_matched === true; true for every stage past association
  user_detail   jsonb,                      -- raw Lemonn fetch-user-details payload (body.data); nullable
  invite_url    text,                       -- nullable; eligible + minted only
  invite_state  text                        -- nullable; seat lifecycle (eligible only)
                  check (invite_state in ('pending', 'issued', 'consumed')),
  expires_at    timestamp,                  -- IST (naive); invite link TTL
  consumed_at   timestamp,                  -- IST (naive); set when the user clicks Join
  created_at    timestamp not null default (now() at time zone 'Asia/Kolkata'),
  updated_at    timestamp not null default (now() at time zone 'Asia/Kolkata'),
  primary key (influencer, client_id)       -- one row per (tenant, user)
);

-- ── RLS: closed to anon/authenticated; service-role (secret key) only ───────
-- No policies → no anon/authenticated row access. The revoke also strips table
-- privileges so the Data API returns "permission denied". The server uses the
-- secret/service_role key, which bypasses RLS.
alter table public.entries enable row level security;
revoke all on table public.entries from anon, authenticated;
grant select, insert, update, delete on table public.entries to service_role;

-- ── IST updated_at trigger (NOT moddatetime, which would write UTC now()) ───
create or replace function public.set_updated_at_ist()
returns trigger language plpgsql as $$
begin
  new.updated_at := now() at time zone 'Asia/Kolkata';
  return new;
end;
$$;

create trigger entries_set_updated_at
  before update on public.entries
  for each row execute function public.set_updated_at_ist();

-- ── claim_invite: atomic seat resolution, keyed on (influencer, client_id) ──
-- recordLogin writes the row first for an eligible user, but it is best-effort
-- and never blocks the funnel — so claim must stand on its own if that write
-- didn't land. INSERT … ON CONFLICT makes exactly one concurrent caller win
-- 'mint'; the rest get 'serve' / 'consumed' / 'wait'. A fresh insert here is
-- always an eligible user (claim only runs in the eligible branch), hence
-- outcome='eligible', associated=true. The ON CONFLICT update fires when the
-- seat is free to (re)mint: never claimed (invite_state is null, e.g. a
-- recordLogin-only row) or an expired issued/pending link.
create or replace function public.claim_invite(
  p_influencer text,
  p_client_id text,
  p_claim_ttl_seconds int default 30
)
returns table (action text, invite_url text)
language plpgsql
as $$
declare
  v_now   timestamp := now() at time zone 'Asia/Kolkata';
  v_rows  int;
  v_state text;
  v_url   text;
  v_exp   timestamp;
begin
  insert into public.entries as e
    (influencer, client_id, outcome, associated,
     invite_url, invite_state, expires_at)
  values
    (p_influencer, p_client_id, 'eligible', true,
     '', 'pending', v_now + make_interval(secs => p_claim_ttl_seconds))
  on conflict (influencer, client_id) do update
    set invite_state = 'pending',
        invite_url   = '',
        expires_at   = v_now + make_interval(secs => p_claim_ttl_seconds)
    where e.invite_state is null
       or (e.invite_state in ('issued', 'pending') and e.expires_at <= v_now);
  get diagnostics v_rows = row_count;

  if v_rows > 0 then
    -- We won the claim → caller mints a fresh link and calls saveIssued.
    action := 'mint'; invite_url := null; return next; return;
  end if;

  -- Didn't win — read the current row to decide what to serve.
  select e.invite_state, e.invite_url, e.expires_at
    into v_state, v_url, v_exp
    from public.entries e
   where e.influencer = p_influencer and e.client_id = p_client_id;

  if v_state = 'consumed' then
    action := 'consumed'; invite_url := null;
  elsif v_state = 'issued' and v_exp > v_now then
    action := 'serve'; invite_url := v_url;
  else
    action := 'wait'; invite_url := null;   -- non-expired pending = someone else is mid-mint
  end if;
  return next;
end;
$$;

revoke all on function public.claim_invite(text, text, int) from public, anon, authenticated;
grant execute on function public.claim_invite(text, text, int) to service_role;
