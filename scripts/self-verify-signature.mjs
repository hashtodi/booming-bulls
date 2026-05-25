// Usage: node scripts/self-verify-signature.mjs <request_token>
//
// Signs `request_token + LEMONN_API_KEY` with LEMONN_SECRET_KEY (same as our
// production code) and then verifies the signature locally using the PUBLIC
// key derived from the same secret. This proves the math is correct
// independent of Lemonn. If this passes but Lemonn still says "Invalid
// signature", the issue is on Lemonn's side or in how they reconstruct the
// signed message.
//
// Also runs RFC 8032 test vector #1 as a sanity check on Node's Ed25519.

import { readFileSync } from "node:fs";
import {
  createPrivateKey,
  createPublicKey,
  sign as nodeSign,
  verify as nodeVerify,
} from "node:crypto";

function parseDotEnv(path) {
  const out = {};
  const text = readFileSync(path, "utf-8");
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return out;
}

const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function makePrivateKeyFromSeed(seedHex) {
  return createPrivateKey({
    key: Buffer.concat([ED25519_PKCS8_PREFIX, Buffer.from(seedHex, "hex")]),
    format: "der",
    type: "pkcs8",
  });
}

function makePublicKeyFromRaw(rawHex) {
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(rawHex, "hex")]),
    format: "der",
    type: "spki",
  });
}

// ── RFC 8032 test vector #1 (empty message) ────────────────────────────────
{
  const sk = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
  const pk = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
  const expected =
    "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b";
  const sig = nodeSign(null, Buffer.alloc(0), makePrivateKeyFromSeed(sk));
  const ok = sig.toString("hex") === expected;
  console.log("RFC 8032 vector #1 self-test :", ok ? "PASS" : "FAIL");
  if (!ok) {
    console.log("  got     :", sig.toString("hex"));
    console.log("  expected:", expected);
  }
  // Also verify with derived pubkey:
  const verified = nodeVerify(null, Buffer.alloc(0), makePublicKeyFromRaw(pk), sig);
  console.log("RFC 8032 verify with pubkey  :", verified ? "PASS" : "FAIL");
}

// ── Our actual credentials and request_token ────────────────────────────────
const env = parseDotEnv(new URL("../.env.local", import.meta.url));
const apiKey = env.LEMONN_API_KEY ?? "";
const secretHex = env.LEMONN_SECRET_KEY ?? "";
const requestToken = process.argv[2];

if (!requestToken) {
  console.log();
  console.log("Pass a request_token as argv to self-test signing:");
  console.log("  node scripts/self-verify-signature.mjs <request_token>");
  process.exit(0);
}

const message = requestToken + apiKey;
const messageBuf = Buffer.from(message, "utf-8");

const privKey = makePrivateKeyFromSeed(secretHex);
const sig = nodeSign(null, messageBuf, privKey);

// Derive public key from secret and verify.
const pubKey = createPublicKey(privKey);
const verified = nodeVerify(null, messageBuf, pubKey, sig);

console.log();
console.log("api_key (also the public key) :", apiKey);
console.log("request_token                 :", requestToken);
console.log("message (utf-8) length        :", messageBuf.length, "bytes");
console.log("message (hex)                 :", messageBuf.toString("hex"));
console.log();
console.log("signature (hex)               :", sig.toString("hex"));
console.log("signature length              :", sig.length, "bytes");
console.log("local verify (pubkey from sec):", verified ? "PASS" : "FAIL");
console.log();
console.log("If 'local verify' is PASS but Lemonn says 'Invalid signature',");
console.log("our crypto is correct. Either Lemonn's stored pubkey differs from");
console.log("the one your secret derives, or they construct the message differently.");
console.log();
console.log("To send Lemonn for diagnosis:");
console.log("  api_key       :", apiKey);
console.log("  request_token :", requestToken);
console.log("  signed_message:", message);
console.log("  signature     :", sig.toString("hex"));
console.log("  derived_pubkey:", apiKey, "(== api_key, should match Lemonn's record)");
