// One-time setup: point the bot's webhook at our route and subscribe ONLY to
// chat_member updates. Safe to re-run. Run AFTER the code is deployed:
//
//   TELEGRAM_BOT_TOKEN=xxx \
//   TELEGRAM_WEBHOOK_SECRET=yyy \
//   WEBHOOK_URL=https://<prod-domain>/api/telegram/webhook \
//   node scripts/set-telegram-webhook.mjs
//
// It first calls getWebhookInfo. If a DIFFERENT webhook is already set, it
// ABORTS unless you re-run with FORCE=1 — so it can't silently clobber another
// integration's webhook on this bot.

const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const url = process.env.WEBHOOK_URL;

if (!token || !secret || !url) {
  console.error(
    "Required env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET, WEBHOOK_URL",
  );
  process.exit(1);
}

const api = (method) => `https://api.telegram.org/bot${token}/${method}`;

async function main() {
  const info = await (await fetch(api("getWebhookInfo"))).json();
  console.log("Current webhook info:", JSON.stringify(info.result, null, 2));

  const existing = info.result?.url;
  if (existing && existing !== url && process.env.FORCE !== "1") {
    console.error(
      `\nA different webhook is already set:\n  ${existing}\n` +
        "Re-run with FORCE=1 to overwrite it. Aborting.",
    );
    process.exit(1);
  }

  const set = await (
    await fetch(api("setWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        secret_token: secret,
        allowed_updates: ["chat_member"],
      }),
    })
  ).json();

  console.log("setWebhook result:", JSON.stringify(set, null, 2));
  if (!set.ok) process.exit(1);
  console.log("\n✅ Webhook set. Verify with getWebhookInfo after a test join.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
