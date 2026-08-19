#!/usr/bin/env bats
# tests/spec/software-factory/branch-naming-T012502.bats
# SSOT: openspec/specs/software-factory.md
# Ticket: T012502 — die Factory bildete den Arbeitsbranch als `feature/${safeSlug}`.
# Zwei Defekte in dieser einen Zeile:
#   1. Der Typ-Praefix war hartkodiert. Ein type=bug- oder chore-Ticket bekam
#      trotzdem feature/, obwohl scripts/worktree-create.sh vier Praefixe fuehrt
#      und der Typ in `ticket.sh get` als Feld `type` bereitsteht.
#   2. Der Fallback-Slug lautete `sf-${ticket_id.toLowerCase()}`. Der Guard
#      prueft /T[0-9]{6,}/ case-sensitiv — die Factory bildete also einen Namen,
#      den die eigene Konvention ablehnt.
#
# PRUEFMODUS: Output-Verifikation am LAUFENDEN Code. pipeline.mjs ist ein
# Workflow-Skript und laeuft ohne import/require; die Regel kann deshalb nicht in
# ein Modul, das dieser Test importiert. Stattdessen wird der markierte Block aus
# pipeline.mjs ausgeschnitten und ausgefuehrt. Damit gibt es keine zweite Kopie
# der Regel, die vom Original wegdriften koennte.
#
# Auch die Guard-Ausdruecke werden nicht nachgebaut, sondern aus
# scripts/worktree-create.sh extrahiert und ausgefuehrt — sonst pruefte dieser
# Test seine eigene Vorstellung des Guards statt den Guard.

setup() {
  REPO="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  export REPO
  PIPELINE="${REPO}/scripts/factory/pipeline.mjs"
  WTC="${REPO}/scripts/worktree-create.sh"

  HARNESS="${BATS_TEST_TMPDIR}/harness.cjs"
  cat > "$HARNESS" <<'JS'
// Schneidet den markierten Block aus pipeline.mjs und fuehrt ihn aus.
const fs = require('fs')
const [, , file, slug, ticketId, ticketType, reuse, reuseBranch] = process.argv
const src = fs.readFileSync(file, 'utf8')
const m = src.match(/\/\/ >>> T012502-BRANCH-REGEL[\s\S]*?\/\/ <<< T012502-BRANCH-REGEL[^\n]*/)
if (!m) { console.error('MARKER-BLOCK NICHT GEFUNDEN'); process.exit(2) }
const fn = new Function(
  'safeSlug', 'TICKET_TYPE', 'A', 'REUSE', 'REUSE_BRANCH',
  m[0] + '\n; return WORK_BRANCH'
)
process.stdout.write(String(fn(
  slug, ticketType, { ticket_id: ticketId }, reuse === 'true', reuseBranch || ''
)) + '\n')
JS

  # Die beiden Guard-Bedingungen AUS worktree-create.sh holen, statt sie zu raten.
  GUARD="${BATS_TEST_TMPDIR}/guard.sh"
  {
    echo 'bn="$1"; ht=0; hk=0'
    grep -F '_has_type=1' "$WTC" | head -1 | sed 's/_bn/bn/g; s/_has_type/ht/g'
    grep -F '_has_ticket=1' "$WTC" | head -1 | sed 's/_bn/bn/g; s/_has_ticket/hk/g'
    echo 'if [ "$ht" -eq 1 ] && [ "$hk" -eq 1 ]; then echo OK; else echo ABGELEHNT; fi'
  } > "$GUARD"
  export HARNESS GUARD PIPELINE
}

# branch <slug> <ticketId> <ticketType> [reuse] [reuseBranch]
branch() { node "$HARNESS" "$PIPELINE" "$1" "$2" "$3" "${4:-false}" "${5:-}"; }
guard()  { bash "$GUARD" "$1"; }

# ── Positiv-Anker zuerst [T002356-M1] ───────────────────────────────────────
# Ohne ihn saemen alle Aussagen unten vakuos: schluege das Ausschneiden des
# Blocks fehl, brauechen alle Faelle gleichermassen ab, und "ist nicht feature/"
# gaelte trivial.

@test "T012502: Positiv-Anker — der Block laesst sich ausfuehren und der Regelfall bleibt feature/" {
  run branch "gitlab-registry-mirror-T012415" "T012415" "feature"
  [ "$status" -eq 0 ] || { echo "Harness kaputt (Marker-Block nicht ausfuehrbar): $output"; false; }
  [ "$output" = "feature/gitlab-registry-mirror-T012415" ] \
    || { echo "Regelfall verletzt, erhalten: $output"; false; }

  run guard "feature/gitlab-registry-mirror-T012415"
  [ "$output" = "OK" ] || { echo "Guard-Extraktion kaputt — akzeptiert nicht einmal den Regelfall: $output"; false; }
}

@test "T012502: Positiv-Anker — der extrahierte Guard lehnt einen unkonventionellen Namen ab" {
  # Belegt, dass `guard` ueberhaupt ablehnen KANN. Ohne diese Probe koennte die
  # Extraktion stillschweigend immer OK liefern und jede Zusicherung unten waere
  # wertlos.
  run guard "wip/irgendwas-ohne-ticket"
  [ "$output" = "ABGELEHNT" ] || { echo "Guard lehnt nichts ab — Extraktion kaputt: $output"; false; }
}

# ── Defekt 1: Typ-Praefix ───────────────────────────────────────────────────

@test "T012502: type=bug ergibt fix/ statt feature/" {
  run branch "babysit-conflict-guard-T012500" "T012500" "bug"
  [ "${output%%/*}" = "fix" ] || { echo "erwartet fix/, erhalten: $output"; false; }
}

@test "T012502: type=chore ergibt chore/, type=docs ergibt docs/" {
  run branch "deps-bump-T001500" "T001500" "chore"
  [ "${output%%/*}" = "chore" ] || { echo "erwartet chore/, erhalten: $output"; false; }

  run branch "readme-update-T001501" "T001501" "docs"
  [ "${output%%/*}" = "docs" ] || { echo "erwartet docs/, erhalten: $output"; false; }
}

@test "T012502: unbekannter oder fehlender Typ faellt auf feature/ zurueck (kein Abbruch)" {
  # Faellt ticket-get aus, ist TICKET_TYPE leer. Das darf die Pipeline nicht
  # anhalten — es soll sich wie vorher verhalten.
  run branch "spike-etwas-T001502" "T001502" ""
  [ "${output%%/*}" = "feature" ] || { echo "leerer Typ: erwartet feature/, erhalten: $output"; false; }

  run branch "spike-etwas-T001502" "T001502" "spike"
  [ "${output%%/*}" = "feature" ] || { echo "unbekannter Typ: erwartet feature/, erhalten: $output"; false; }
}

# ── Defekt 2: Ticket-ID in GROSSschreibung ──────────────────────────────────

@test "T012502: der Fallback-Slug sf-<klein> wird vom Guard akzeptiert" {
  # Der reale Selbstblock: pipeline.mjs bildete `sf-t012415`, worktree-create.sh
  # verlangt T[0-9]{6,} GROSS.
  run branch "sf-t012415" "T012415" "bug"
  [ "$output" = "fix/sf-T012415" ] || { echo "erwartet fix/sf-T012415, erhalten: $output"; false; }

  run guard "fix/sf-T012415"
  [ "$output" = "OK" ] || { echo "❌ Bug reproduziert: der Guard lehnt den erzeugten Namen ab"; false; }
}

@test "T012502: ein Slug ganz ohne Ticket-ID bekommt sie angehaengt" {
  run branch "irgendein-slug" "T012415" "feature"
  [ "$output" = "feature/irgendein-slug-T012415" ] || { echo "erhalten: $output"; false; }

  run guard "feature/irgendein-slug-T012415"
  [ "$output" = "OK" ] || { echo "Guard lehnt ab: $output"; false; }
}

@test "T012502: eine bereits GROSS geschriebene ID wird nicht verdoppelt" {
  run branch "slug-T099999" "T012415" "feature"
  [ "$output" = "feature/slug-T099999" ] || { echo "ID verdoppelt oder veraendert: $output"; false; }
}

# ── REUSE bleibt unberuehrt ─────────────────────────────────────────────────

@test "T012502: bei REUSE bleibt der uebergebene Branch unveraendert" {
  # Ein von dev-flow-plan gestagter Branch darf nicht umbenannt werden — sonst
  # zeigt FACTORY-PLAN-REF ins Leere.
  run branch "egal" "T012415" "bug" "true" "feature/vom-menschen-gestaged-T012415"
  [ "$output" = "feature/vom-menschen-gestaged-T012415" ] \
    || { echo "REUSE-Branch wurde veraendert: $output"; false; }
}

# ── Alle erzeugten Praefixe muessen den Downstream-Guard passieren ──────────

@test "T012502: jeder erzeugbare Praefix passiert den Guard in pipeline-partials.cjs" {
  # pipeline-partials.cjs blockt den Deploy-Schritt, wenn WORK_BRANCH nicht
  # matcht. Vor T012502 kannte er docs/ nicht — die Pipeline haette sich beim
  # ersten docs-Ticket selbst gestoppt.
  local partials="${REPO}/scripts/factory/pipeline-partials.cjs"
  local pattern
  pattern="$(grep -o "grep -Eq '\^([a-z|]*)/'" "$partials" | head -1 | sed "s/grep -Eq '//; s/'$//")"
  [ -n "$pattern" ] || { echo "Guard-Muster in pipeline-partials.cjs nicht gefunden"; false; }

  local p
  for p in feature fix chore docs; do
    echo "${p}/x-T012415" | grep -Eq "$pattern" \
      || { echo "❌ pipeline-partials.cjs blockt Praefix '${p}/' (Muster: $pattern)"; false; }
  done
}

# -- Watchdog-Gegenstelle ----------------------------------------------------
# Der Zombie-Worktree-Cleanup suchte exakt feature/sf-<klein> bzw.
# chore/sf-<klein>. Beide Teile widersprachen sich damit: die Form, die der
# Watchdog erwartete, lehnte worktree-create.sh ab. Nach T012502 muss er die
# neue Form finden UND die alte weiter erkennen (Bestands-Worktrees).
#
# Extrahiert wird nur der Musterstring (pat="..."), nicht ueber Zeilennummern
# oder Einrueckung, die sich beim naechsten Edit verschieben.

_wd_match() {
  printf '%s\n' "worktree $1" "branch $2" \
    | awk -v pat="$3" -v id="t012415" '/^worktree /{w=$2} /^branch /{b=tolower($0); if (b ~ (pat id "$")) print w}'
}

@test "T012502: das Watchdog-Muster deckt alle vier Praefixe ab und ist case-tolerant" {
  local wd="${REPO}/scripts/factory/watchdog.sh"
  local pat
  pat="$(grep -o 'pat="[^"]*"' "$wd" | head -1 | sed 's/^pat="//; s/"$//')"
  [ -n "$pat" ] || { echo "Musterstring in watchdog.sh nicht gefunden"; false; }

  # Positiv-Anker: das Muster trifft ueberhaupt etwas.
  run _wd_match "/w/neu" "refs/heads/fix/sf-T012415" "$pat"
  [ "$output" = "/w/neu" ] || { echo "Positiv-Anker verletzt - neue Form nicht getroffen: $output"; false; }

  # Bestands-Worktrees der alten, klein geschriebenen Form.
  run _wd_match "/w/alt" "refs/heads/feature/sf-t012415" "$pat"
  [ "$output" = "/w/alt" ] || { echo "alte Form nicht mehr erkannt - Zombie-Worktrees blieben liegen: $output"; false; }

  # Ein fremdes Ticket darf NICHT geraeumt werden.
  run _wd_match "/w/fremd" "refs/heads/fix/sf-T099999" "$pat"
  [ -z "$output" ] || { echo "fremdes Ticket T099999 wuerde geraeumt: $output"; false; }

  # Und die neuen Praefixe muessen im Muster stehen.
  local p
  for p in feature fix chore docs; do
    printf '%s' "$pat" | grep -q "$p" || { echo "Praefix $p fehlt im Watchdog-Muster: $pat"; false; }
  done
}
