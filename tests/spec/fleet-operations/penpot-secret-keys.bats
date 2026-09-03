#!/usr/bin/env bats
# ═══════════════════════════════════════════════════════════════════
# penpot-secret-keys.bats — Penpot-Secret-Keys vollständig gesealt
# ═══════════════════════════════════════════════════════════════════
# Prueft, dass alle vier Penpot-Keys sowohl im Plaintext-File als
# auch im SealedSecret vorhanden und nicht leer sind.
#
# expected: FAIL (vor dem Fix — Keys fehlen in den Plaintext-Files)
# expected: PASS (nach dem Fix — Keys sind generiert und gesealt)
#
# T900030 — Penpot Secret-Keys rotieren (Scope-Mismatch Fix)
# ═══════════════════════════════════════════════════════════════════

PROJECT_DIR="$(git rev-parse --show-toplevel)"
SECRETS_DIR="${PROJECT_DIR}/environments/.secrets"
SEALED_DIR="${PROJECT_DIR}/environments/sealed-secrets"

# Die vier Penpot-Keys, die im Schema als generate:true definiert sind
PENPOT_KEYS=(
  "PENPOT_DB_PASSWORD"
  "PENPOT_SECRET_KEY"
  "PENPOT_MINIO_SECRET_KEY"
  "POCKET_ID_PENPOT_SECRET"
)

# Plaintext-Files, die diese Keys enthalten muessen
PLAINTEXT_FILES=(
  "fleet-mentolder.yaml"
  "fleet-staging.yaml"
)

# SealedSecret-Files, die diese Keys enthalten muessen
SEALED_FILES=(
  "fleet-mentolder.yaml"
  "staging.yaml"
)

# ── Test: Penpot-Keys in Plaintext-Files ──────────────────────────

@test "alle Penpot-Keys existieren in allen Plaintext-Files (T900030)" {
  for secret_file in "${PLAINTEXT_FILES[@]}"; do
    local filepath="${SECRETS_DIR}/${secret_file}"
    [ -f "$filepath" ] || { echo "File fehlt: $filepath"; return 1; }

    for key in "${PENPOT_KEYS[@]}"; do
      # Key muss im YAML existieren
      run grep -q "^${key}:" "$filepath"
      [ "$status" -eq 0 ] || { echo "$key fehlt in $filepath"; return 1; }

      # Key-Wert darf nicht leer sein
      value=$(grep "^${key}:" "$filepath" | sed 's/^'"${key}"':[[:space:]]*["\x27]*//;s/["\x27]*$//')
      [ -n "$value" ] || { echo "$key in $filepath ist leer"; return 1; }
    done
  done
}

# ── Test: Penpot-Keys in SealedSecret-Files ───────────────────────

@test "alle Penpot-Keys existieren in allen SealedSecret-Files (T900030)" {
  for secret_file in "${SEALED_FILES[@]}"; do
    local filepath="${SEALED_DIR}/${secret_file}"
    [ -f "$filepath" ] || { echo "File fehlt: $filepath"; return 1; }

    for key in "${PENPOT_KEYS[@]}"; do
      # Key muss im YAML vorkommen (encryptedData-Block)
      run grep -q "${key}:" "$filepath"
      [ "$status" -eq 0 ] || { echo "$key fehlt in $filepath"; return 1; }
    done
  done
}

# ── Test: Plaintext und SealedSecret sind synchron ────────────────

@test "Penpot-Keys sind in Plaintext UND SealedSecret (keine Luecke) (T900030)" {
  # fuer jedes Plaintext-File muss das entsprechende SealedSecret existieren
  local mapping=(
    "fleet-mentolder.yaml:fleet-mentolder.yaml"
    "fleet-staging.yaml:staging.yaml"
  )

  for entry in "${mapping[@]}"; do
    local plaintext="${entry%%:*}"
    local sealed="${entry##*:}"

    local pf="${SECRETS_DIR}/${plaintext}"
    local sf="${SEALED_DIR}/${sealed}"

    [ -f "$pf" ] || { echo "Plaintext fehlt: $pf"; return 1; }
    [ -f "$sf" ] || { echo "SealedSecret fehlt: $sf"; return 1; }

    for key in "${PENPOT_KEYS[@]}"; do
      # Key muss in BEIDEN Dateien vorkommen
      grep -q "^${key}:" "$pf" || { echo "$key fehlt in Plaintext $pf"; return 1; }
      grep -q "${key}:" "$sf" || { echo "$key fehlt in SealedSecret $sf"; return 1; }
    done
  done
}
