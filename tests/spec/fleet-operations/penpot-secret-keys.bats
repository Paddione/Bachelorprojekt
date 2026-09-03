#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# penpot-secret-keys.bats — Penpot-Secret-Keys vollständig entfernt
# ═══════════════════════════════════════════════════════════════════
# Prueft, dass keine Penpot-Secret-Keys mehr in Plaintext- oder
# SealedSecret-Files vorhanden sind. Penpot wurde entfernt (T900030).
#
# expected: PASS (nach dem Fix — keine Penpot-Keys mehr vorhanden)
#
# T900030 — Penpot Secret-Keys entfernen (Penpot-decommission)
# ═══════════════════════════════════════════════════════════════════

PROJECT_DIR="$(git rev-parse --show-toplevel)"
SECRETS_DIR="${PROJECT_DIR}/environments/.secrets"
SEALED_DIR="${PROJECT_DIR}/environments/sealed-secrets"

# Die vier Penpot-Keys, die NICHT mehr vorkommen duerfen
PENPOT_KEYS=(
  "PENPOT_DB_PASSWORD"
  "PENPOT_SECRET_KEY"
  "PENPOT_MINIO_SECRET_KEY"
  "POCKET_ID_PENPOT_SECRET"
)

# Plaintext-Files, die KEINE Penpot-Keys enthalten duerfen
PLAINTEXT_FILES=(
  "fleet-mentolder.yaml"
  "fleet-staging.yaml"
)

# SealedSecret-Files, die KEINE Penpot-Keys enthalten duerfen
SEALED_FILES=(
  "fleet-mentolder.yaml"
  "staging.yaml"
  "mentolder.yaml"
)

# ── Test: Keine Penpot-Keys in Plaintext-Files ────────────────────

@test "keine Penpot-Keys in Plaintext-Files (T900030)" {
  for secret_file in "${PLAINTEXT_FILES[@]}"; do
    local filepath="${SECRETS_DIR}/${secret_file}"
    [ -f "$filepath" ] || { echo "File fehlt: $filepath"; return 0; }

    for key in "${PENPOT_KEYS[@]}"; do
      run grep -q "^${key}:" "$filepath"
      [ "$status" -ne 0 ] || { echo "$key darf nicht in $filepath vorkommen"; return 1; }
    done
  done
}

# ── Test: Keine Penpot-Keys in SealedSecret-Files ─────────────────

@test "keine Penpot-Keys in SealedSecret-Files (T900030)" {
  for secret_file in "${SEALED_FILES[@]}"; do
    local filepath="${SEALED_DIR}/${secret_file}"
    [ -f "$filepath" ] || { echo "File fehlt: $filepath"; return 0; }

    for key in "${PENPOT_KEYS[@]}"; do
      # Key darf in encryptedData-Block NICHT vorkommen
      run grep -q "${key}:" "$filepath"
      [ "$status" -ne 0 ] || { echo "$key darf nicht in $filepath vorkommen"; return 1; }
    done
  done
}

# ── Test: Keine Penpot-Refenzen in .secrets ──────────────────────

@test "keine Penpot-Refenzen in .secrets/ (T900030)" {
  for secret_file in "${PLAINTEXT_FILES[@]}"; do
    local filepath="${SECRETS_DIR}/${secret_file}"
    [ -f "$filepath" ] || continue

    for key in "${PENPOT_KEYS[@]}"; do
      run grep -qi "${key}" "$filepath"
      [ "$status" -ne 0 ] || { echo "Penpot-Referenz '$key' gefunden in $filepath"; return 1; }
    done
  done
}
