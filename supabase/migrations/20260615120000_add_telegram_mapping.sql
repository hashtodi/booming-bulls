-- Phase 1 of Telegram membership tracking: map a user who JOINED the channel
-- back to their entries row. The webhook (POST /api/telegram/webhook) writes
-- these on a real channel join, matching the chat_member update's invite_link
-- against entries.invite_url.
--
-- SAFE ON LIVE: additive + nullable, no defaults, no changes to existing
-- columns/constraints. The /callback → /welcome → /join funnel never reads or
-- writes these. Both columns stay NULL for every existing row, so this is a
-- metadata-only change (no table rewrite) and is safe to apply before or after
-- the code ships.
alter table public.entries
  add column telegram_user_id  bigint,   -- numeric Telegram user id (always present on join)
  add column telegram_username text;      -- @handle without '@'; NULL if the user has none

-- Speeds up the webhook lookup (UPDATE ... WHERE invite_url = $1).
-- NON-unique on purpose: claim_invite seeds invite_url = '' and placeholder-mode
-- rows all share TELEGRAM_PLACEHOLDER_URL, so invite_url is not unique.
create index entries_invite_url_idx on public.entries (invite_url);
