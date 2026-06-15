import { describe, it, expect } from "vitest";
import { parseChatMemberUpdate } from "./telegram-webhook";

describe("parseChatMemberUpdate", () => {
  it("returns a join with userId, username, inviteUrl for a join-via-link", () => {
    const r = parseChatMemberUpdate({
      chat_member: {
        chat: { id: -1001234567890 },
        invite_link: { invite_link: "https://t.me/+abc123" },
        new_chat_member: { status: "member", user: { id: 42, username: "neo" } },
      },
    });
    expect(r).toEqual({
      kind: "join",
      userId: 42,
      username: "neo",
      inviteUrl: "https://t.me/+abc123",
    });
  });

  it("username is null when the user has no @handle", () => {
    const r = parseChatMemberUpdate({
      chat_member: {
        invite_link: { invite_link: "https://t.me/+abc" },
        new_chat_member: { status: "member", user: { id: 7 } },
      },
    });
    expect(r).toEqual({
      kind: "join",
      userId: 7,
      username: null,
      inviteUrl: "https://t.me/+abc",
    });
  });

  it("ignores a join with no invite_link (joined some other way)", () => {
    const r = parseChatMemberUpdate({
      chat_member: { new_chat_member: { status: "member", user: { id: 1 } } },
    });
    expect(r).toEqual({ kind: "ignore", reason: "no_invite_link" });
  });

  it("ignores a leave (status left)", () => {
    const r = parseChatMemberUpdate({
      chat_member: {
        invite_link: { invite_link: "https://t.me/+abc" },
        new_chat_member: { status: "left", user: { id: 1 } },
      },
    });
    expect(r).toEqual({ kind: "ignore", reason: "status_left" });
  });

  it("ignores a kick (status kicked)", () => {
    const r = parseChatMemberUpdate({
      chat_member: {
        invite_link: { invite_link: "https://t.me/+abc" },
        new_chat_member: { status: "kicked", user: { id: 1 } },
      },
    });
    expect(r).toEqual({ kind: "ignore", reason: "status_kicked" });
  });

  it("ignores a restricted member who is not actually in the chat", () => {
    const r = parseChatMemberUpdate({
      chat_member: {
        invite_link: { invite_link: "https://t.me/+abc" },
        new_chat_member: {
          status: "restricted",
          is_member: false,
          user: { id: 1 },
        },
      },
    });
    expect(r).toEqual({ kind: "ignore", reason: "status_restricted" });
  });

  it("ignores updates that aren't chat_member", () => {
    expect(parseChatMemberUpdate({})).toEqual({
      kind: "ignore",
      reason: "not_chat_member",
    });
  });
});
