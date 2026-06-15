// Pure parsing of Telegram `chat_member` updates — NO I/O, NO env imports, so
// it stays trivially unit-testable and reusable by the webhook route.
//
// We only care about ONE event: a user JOINING our channel via an invite link.
// The `invite_link` field is populated by Telegram only for join-by-invite-link
// events, so its presence (plus a membership status) is the gate. Everything
// else — leaves, kicks, admin-rights changes, joins without a link — is ignored.

// Minimal shapes of the payload we read; extra keys are tolerated and ignored.
type TgUser = { id?: number; username?: string };
type TgChatMember = { status?: string; is_member?: boolean; user?: TgUser };
type TgInviteLink = { invite_link?: string };
type TgChatMemberUpdated = {
  chat?: { id?: number | string };
  new_chat_member?: TgChatMember;
  invite_link?: TgInviteLink;
};
export type TgUpdate = { chat_member?: TgChatMemberUpdated };

export type ParseResult =
  | { kind: "join"; userId: number; username: string | null; inviteUrl: string }
  | { kind: "ignore"; reason: string };

// Statuses that mean "is currently in the chat". `restricted` only counts when
// is_member === true (a restricted user can be restricted-but-not-in-the-chat).
const MEMBER_STATUSES = new Set([
  "member",
  "administrator",
  "creator",
  "restricted",
]);

export function parseChatMemberUpdate(update: TgUpdate): ParseResult {
  const cm = update.chat_member;
  if (!cm) return { kind: "ignore", reason: "not_chat_member" };

  const inviteUrl = cm.invite_link?.invite_link;
  if (!inviteUrl) return { kind: "ignore", reason: "no_invite_link" };

  const member = cm.new_chat_member;
  const status = member?.status;
  if (!status) return { kind: "ignore", reason: "no_status" };

  const isMember =
    MEMBER_STATUSES.has(status) &&
    (status !== "restricted" || member?.is_member === true);
  if (!isMember) return { kind: "ignore", reason: `status_${status}` };

  const userId = member?.user?.id;
  if (typeof userId !== "number") {
    return { kind: "ignore", reason: "no_user_id" };
  }

  return {
    kind: "join",
    userId,
    username: member?.user?.username ?? null,
    inviteUrl,
  };
}
