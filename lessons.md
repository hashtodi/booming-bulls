# Lessons — booming-bulls

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
