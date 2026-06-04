# Lessons

Patterns learned while working in this repo. Review at session start.

## Lemonn `/callback` flow

- **"Duplicate `/callback`" is token rotation, not a re-fired single-use token.**
  Prod evidence (2026-06-03): one login produced multiple `/callback` hits ~1.3s
  apart, each with a **different** `request_token`. Lemonn mints a fresh token per
  redirect and invalidates the older one, so the stale token returned **400** from
  `fetch-user-details` while the newer returned **200**. They can be sequential,
  not just concurrent.
  - **Don't** design idempotency keyed on `request_token` — it changes per hit.
    The stable identity is **`client_id`**, which Lemonn now also passes as a
    `/callback` query param (`?client_id=…`).
  - **Security:** that query-param `client_id` is **unauthenticated** — never use
    it to grant access or serve a seat. Only exchanging the `request_token` with
    Lemonn (`fetch-user-details`) proves identity. "Rescuing" a failed-token
    request via the URL's `client_id` would be an auth bypass.
  - The `entries` table already gives `client_id`-level dedup: two tokens for one
    `client_id` resolve to one row, `claim_invite` prevents double-mint, and a
    failed-token (`transient_error`) request writes nothing.

## Telegram invite links (testing gotcha)

- **`t.me/+<hash>`'s "JOIN CHANNEL" button is a `tg://join?invite=…` deep link.**
  On **desktop** it only works if Telegram Desktop is installed (registered as the
  `tg://` handler) or you're logged into `web.telegram.org`; otherwise the click
  silently does nothing. This is Telegram's own landing page, **not our code** —
  our `/join` correctly 303-redirects to the unchanged `https://t.me/+hash`. Test
  joins on **mobile** (the funnel's real audience) or desktop-with-app.
- Links are `member_limit: 1` (single-use) and 24h TTL — a reused/expired link, or
  an account already in the channel, also makes the JOIN button a no-op.
