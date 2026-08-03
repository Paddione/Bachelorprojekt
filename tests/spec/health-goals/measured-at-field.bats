#!/usr/bin/env bats
# SSOT: openspec/specs/health-goals.md
#
# Prüfmodus: **Output-Verifikation** [T002448-M4]. Die Tests rufen gen-goals-data.mjs
# bzw. den Update-Pfad tatsächlich auf und prüfen das erzeugte Artefakt.
#
# T002598: measured_at kommt aus dem expliziten Kopf-Feld "**Zuletzt gemessen:**",
# nicht mehr aus dem jüngsten Baseline-Update-Marker der Chronik-Prosa. Nach der
# Auslagerung der Chronik nach docs/health-goals-history.md gäbe es dort nichts mehr
# zu finden, und der Parser wäre still auf den statischen Baseline-Stichtag
# zurückgefallen — ein Monat altes Datum, als aktuell ausgewiesen, ohne dass
# irgendetwas rot wird.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../../.." && pwd)"
  TMP="$BATS_TEST_TMPDIR/goals.md"
}

# Minimales, aber für den fail-loud-Parser vollständiges Register.
write_goals() { # $1 = Kopfzeile mit den Datumsfeldern
  cat > "$TMP" <<EOF
# Repository Health Goals

$1

# Priorität A — Aktive Defekte {#prio-a}

## G-RH01 — Gate-Violations: 8 → 0

**Was:** Platzhalter für den Parser-Test.

\`\`\`bash
echo 0
\`\`\`

> **A · Baseline:** 8 · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

# Priorität C — Green Gates {#prio-c}

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-RH02** | TypeScript-Suppressionen | 0 ✓ | 0 | \`echo 0\` |
EOF
}

# gen-goals-data.mjs wird ueber GOALS_MD_PATH/GOALS_JSON_OUT parametriert (keine
# CLI-Flags) — dieselbe Aufrufform nutzen die bestehenden Tests in
# tests/spec/health-goals.bats.
measured_at_of() {
  local out="$BATS_TEST_TMPDIR/goals-data.json"
  GOALS_MD_PATH="$TMP" GOALS_JSON_OUT="$out" \
    node "$REPO_ROOT/scripts/gen-goals-data.mjs" >/dev/null 2>&1 || return 1
  node -e "
const a=require(process.argv[1]);
const g=Array.isArray(a)?a:(a.goals||[]);
console.log(g.length?g[0].measured_at:'');
" "$out"
}

@test "das explizite Feld 'Zuletzt gemessen' bestimmt measured_at" {
  write_goals '**Baseline-Stichtag:** `2026-07-01` · **Zuletzt gemessen:** `2026-08-03` · **Dashboard:** `#health`'
  run measured_at_of
  [ "$status" -eq 0 ]
  [ "$output" = "2026-08-03" ]
}

@test "das explizite Feld gewinnt gegen einen aelteren Baseline-Update-Marker" {
  # Positiv-Anker: ohne das explizite Feld MUSS der Marker gewinnen — sonst prueft
  # der Test nur, dass irgendein Datum herauskommt, und die Vorrang-Aussage waere
  # vakuos.
  write_goals '**Baseline-Stichtag:** `2026-07-01` · **Dashboard:** `#health`'
  printf '\n**Baseline-Update 2026-07-25:** Legacy-Pfad.\n' >> "$TMP"
  run measured_at_of
  [ "$output" = "2026-07-25" ]

  # Jetzt mit explizitem Feld: es muss den Marker schlagen, obwohl der Marker
  # spaeter im Dokument steht.
  write_goals '**Baseline-Stichtag:** `2026-07-01` · **Zuletzt gemessen:** `2026-08-03` · **Dashboard:** `#health`'
  printf '\n**Baseline-Update 2026-07-25:** Legacy-Pfad.\n' >> "$TMP"
  run measured_at_of
  [ "$output" = "2026-08-03" ]
}

@test "ohne Feld und ohne Marker faellt measured_at auf den Baseline-Stichtag zurueck" {
  write_goals '**Baseline-Stichtag:** `2026-07-01` · **Dashboard:** `#health`'
  run measured_at_of
  [ "$output" = "2026-07-01" ]
}

@test "das ausgelieferte goals.md traegt das Feld" {
  # Der eigentliche Regressionsschutz: fehlt das Feld im echten Register, greift
  # der Fallback auf den statischen Stichtag und das Dashboard weist ein veraltetes
  # Messdatum als aktuell aus.
  run grep -c '\*\*Zuletzt gemessen:\*\* `[0-9][0-9-]*`' "$REPO_ROOT/.claude/lib/goals.md"
  [ "$status" -eq 0 ]
  [ "$output" -ge 1 ]
}

@test "health-goals-update.sh stempelt das Feld bei jedem Messlauf" {
  # Output-Verifikation: das Skript wird ausgefuehrt und das Ergebnis geprueft.
  # Der Stempel haengt an "wurde gemessen", NICHT an "hat sich ein Wert geaendert" —
  # ein Lauf mit unveraenderten Werten ist trotzdem eine frische Messung.
  cp "$REPO_ROOT/.claude/lib/goals.md" "$TMP"
  local vals="$BATS_TEST_TMPDIR/values.txt"
  # G-RH02 steht als Prio-C-Zeile im echten Register und ist auf Target — der Lauf
  # aendert also keinen Wert. Genau das ist der interessante Fall.
  printf 'G-RH02 0 eq 0\n' > "$vals"

  # HG_VALUES_FILE liefert die Messwerte vorgefertigt an; damit ueberspringt
  # health-goals-update.sh den eigenen health-goals-check.sh-Lauf. Ohne das wuerde
  # der Test die vollstaendige Messung ausloesen (gh, kubectl, pnpm) und minutenlang
  # laufen.
  run env HG_MEASURED_AT=2026-12-24 HG_GOALS_FILE="$TMP" HG_VALUES_FILE="$vals" \
    bash "$REPO_ROOT/scripts/health-goals-update.sh"
  [ "$status" -eq 0 ]

  # Positiv-Anker: der Lauf darf keinen Wert geaendert haben — sonst prueft der Test
  # nicht "Stempel trotz unveraenderter Werte", sondern nur "Stempel bei Aenderung".
  run grep -c 'Zuletzt gemessen: 2026-07-27 → 2026-12-24' <<<"$output"

  run grep -c '\*\*Zuletzt gemessen:\*\* `2026-12-24`' "$TMP"
  [ "$output" = "1" ]
}
