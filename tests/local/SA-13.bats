#!/usr/bin/env bats

load ../unit/lib/bats-assert.bash

setup() {
  : "${ARENA_WS_URL:?need ARENA_WS_URL}"
}

@test "SA-13: JWT signed by untrusted issuer is rejected with 401" {
  # Generate an RSA keypair + sign a token claiming aud=arena from a bogus issuer.
  # Use python (available in the test runner image) for portability.
  TOKEN=$(python3 - <<'PY'
import jwt, time
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives import serialization
k = rsa.generate_private_key(public_exponent=65537, key_size=2048)
pem = k.private_bytes(serialization.Encoding.PEM,
                      serialization.PrivateFormat.PKCS8,
                      serialization.NoEncryption())
print(jwt.encode({
  "iss": "https://evil.example.com/realms/x",
  "aud": "arena",
  "sub": "attacker",
  "exp": int(time.time()) + 60,
}, pem, algorithm="RS256"), end="")
PY
)
  STATUS=$(curl -s -o /tmp/sa-13.body -w '%{http_code}' \
    "$ARENA_WS_URL/lobby/active" -H "authorization: Bearer $TOKEN")
  assert_equal "$STATUS" "401"
}