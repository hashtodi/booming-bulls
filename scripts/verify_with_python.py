"""
Run Lemonn's exact Python signature routine and verify against our Node output.

Usage:
    python3 scripts/verify_with_python.py <request_token>

Reads LEMONN_API_KEY and LEMONN_SECRET_KEY from .env.local in the project root.
"""

import os
import sys
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ed25519


def parse_dotenv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in path.read_text().splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        out[k.strip()] = v.strip()
    return out


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3 scripts/verify_with_python.py <request_token>")
        sys.exit(1)

    request_token = sys.argv[1]
    env = parse_dotenv(Path(__file__).resolve().parent.parent / ".env.local")
    api_key = env["LEMONN_API_KEY"]
    private_key_hex = env["LEMONN_SECRET_KEY"]

    # --- Lemonn's Python sample, verbatim ---
    message = request_token + api_key
    private_key_bytes = bytes.fromhex(private_key_hex)
    private_key = ed25519.Ed25519PrivateKey.from_private_bytes(private_key_bytes)
    signature_bytes = private_key.sign(message.encode("utf-8"))
    python_sig = signature_bytes.hex()

    # Derive public key (== api_key per Lemonn docs)
    public_key = private_key.public_key()
    raw_pub = public_key.public_bytes_raw().hex()

    print("request_token        :", request_token)
    print("api_key              :", api_key)
    print("message (utf-8)      :", message)
    print("message length       :", len(message.encode("utf-8")), "bytes")
    print()
    print("Python signature     :", python_sig)
    print("Derived public key   :", raw_pub)
    print("api_key == pubkey    :", raw_pub == api_key)

    # If a Node signature is provided via env (or pass it as $NODE_SIG), compare.
    node_sig = os.environ.get("NODE_SIG", "").strip()
    if node_sig:
        print()
        print("Node signature       :", node_sig)
        print("Match (Python==Node) :", python_sig == node_sig)
        try:
            public_key.verify(bytes.fromhex(node_sig), message.encode("utf-8"))
            print("Python verify(Node)  : PASS")
        except Exception as e:
            print("Python verify(Node)  : FAIL -", e)


if __name__ == "__main__":
    main()
