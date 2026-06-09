-- Consumed seats now RE-SERVE their original invite link instead of dead-ending
-- on /already-member. The only change vs the previous claim_invite: the
-- 'consumed' branch returns the stored invite_url (was null) so /callback can
-- re-show the same link. We still never re-mint a consumed seat — even once the
-- link has expired (by design) — so a user keeps their one link and we never
-- grant a second seat. A user who clicked Join but didn't finish can get their
-- original link back by logging in again.
--
-- CREATE OR REPLACE preserves the existing grants, but we re-state them so the
-- migration is correct even if run against a fresh function.
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
    -- Already-consumed seat: re-serve the SAME stored link (never re-minted,
    -- even if expired). The caller re-shows it instead of dead-ending.
    action := 'consumed'; invite_url := v_url;
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
