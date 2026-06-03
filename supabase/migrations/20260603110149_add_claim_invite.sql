-- Atomic claim for the invite store — fixes the concurrency double-mint race.
--
-- Without this, two /callback requests for the same client_id can both read
-- "no row", both mint a Telegram link, and hand out two seats. claim_invite()
-- resolves the decision in a single atomic statement (the unique PK serializes
-- concurrent callers), so at most ONE caller is told to mint; the rest serve
-- the existing link or wait briefly for the winner to fill it.

-- Allow a short-lived 'pending' state, set while the winning caller mints.
alter table public.channel_invites
  drop constraint if exists channel_invites_status_check;
alter table public.channel_invites
  add constraint channel_invites_status_check
  check (status in ('pending', 'issued', 'consumed'));

create or replace function public.claim_invite(
  p_channel_id text,
  p_client_id text,
  p_claim_ttl_seconds int default 30
)
returns table (action text, invite_url text)
language plpgsql
as $$
declare
  v_now      timestamptz := now();
  v_claimed  int;
  v_status   text;
  v_url      text;
  v_expires  timestamptz;
begin
  -- Win the claim if there is no row yet, OR the existing row is an expired
  -- link, OR a stale (timed-out) pending claim. The ON CONFLICT row lock makes
  -- this atomic: only one concurrent caller's statement affects a row.
  insert into public.channel_invites as ci
    (channel_id, client_id, invite_url, status, expires_at)
  values
    (p_channel_id, p_client_id, '', 'pending',
     v_now + make_interval(secs => p_claim_ttl_seconds))
  on conflict (channel_id, client_id) do update
    set status      = 'pending',
        invite_url  = '',
        expires_at  = v_now + make_interval(secs => p_claim_ttl_seconds)
    where ci.status in ('issued', 'pending')
      and ci.expires_at <= v_now;
  get diagnostics v_claimed = row_count;

  if v_claimed > 0 then
    action := 'mint'; invite_url := null; return next; return;
  end if;

  -- Didn't win — read the current row to decide what to serve.
  select status, channel_invites.invite_url, expires_at
    into v_status, v_url, v_expires
    from public.channel_invites
    where channel_id = p_channel_id and client_id = p_client_id;

  if v_status = 'consumed' then
    action := 'consumed'; invite_url := null;
  elsif v_status = 'issued' and v_expires > v_now then
    action := 'serve'; invite_url := v_url;
  else
    -- a non-expired 'pending' row: another request is minting right now
    action := 'wait'; invite_url := null;
  end if;
  return next;
end;
$$;

-- Server-only: the secret/service-role key calls this. Deny the API roles.
revoke all on function public.claim_invite(text, text, int) from public, anon, authenticated;
grant execute on function public.claim_invite(text, text, int) to service_role;
