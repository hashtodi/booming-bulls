// Usage: node scripts/derive-public-key.mjs
//
// Reads LEMONN_API_KEY and LEMONN_SECRET_KEY from .env.local, derives the
// Ed25519 public key from the secret, and prints both side-by-side so you can
// send the public key to Lemonn for verification.
//
// If Lemonn confirms the public key does NOT match what they have on file for
// your LEMONN_API_KEY, you have the wrong secret.

import { readFileSync } from "node:fs";
import { createPrivateKey, createPublicKey } from "node:crypto";

function parseDotEnv(path) {
  const out = {};
  const lines = readFileSync(path, "utf-8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    // Strip inline comments (#) only if preceded by whitespace in the raw line.
    const hashIdx = line.indexOf(" #");
    if (hashIdx !== -1) value = line.slice(line.indexOf("=") + 1, hashIdx).trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

const env = parseDotEnv(new URL("../.env.local", import.meta.url));
const apiKey = env.LEMONN_API_KEY ?? "";
const secretHex = env.LEMONN_SECRET_KEY ?? "";

const ED25519_PKCS8_PREFIX = Buffer.from(
  "302e020100300506032b657004220420",
  "hex",
);

if (!/^[0-9a-fA-F]{64}$/.test(secretHex)) {
  console.error("LEMONN_SECRET_KEY missing or not 64 hex chars (32-byte seed).");
  process.exit(1);
}

const seed = Buffer.from(secretHex, "hex");
const privateKey = createPrivateKey({
  key: Buffer.concat([ED25519_PKCS8_PREFIX, seed]),
  format: "der",
  type: "pkcs8",
});
const publicKey = createPublicKey(privateKey);

// Export raw 32-byte public key by stripping the SPKI DER header.
const spkiDer = publicKey.export({ format: "der", type: "spki" });
const rawPublicKey = spkiDer.subarray(spkiDer.length - 32);

console.log("LEMONN_API_KEY              :", apiKey);
console.log("LEMONN_API_KEY length       :", apiKey.length);
console.log("LEMONN_API_KEY hex bytes    :", Buffer.from(apiKey, "utf-8").toString("hex"));
console.log();
console.log("LEMONN_SECRET_KEY (you have):", secretHex);
console.log("Derived PUBLIC KEY (hex)    :", rawPublicKey.toString("hex"));
console.log();
console.log("Send the derived PUBLIC KEY to Lemonn and ask:");
console.log("  > Does this match the public key registered for our LEMONN_API_KEY?");
console.log("If it doesn't match, the secret you have is for a different key pair.");
