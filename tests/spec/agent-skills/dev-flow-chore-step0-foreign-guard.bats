#!/usr/bin/env bats
# tests/spec/agent-skills/dev-flow-chore-step0-foreign-guard.bats [T003078]
#
# PRUEFMODUS: Source-Grep (Ausnahme, wie in CLAUDE.md T002448-M4 vorgesehen). Der
# geprueften Sache (`.claude/skills/dev-flow-chore/SKILL.md` Schritt 0) fehlt jedes
# Laufzeitverhalten — es ist Prosa/Dokumentation, kein ausfuehrbares Skript, und ihr
# Ergebnis manifestiert sich ausschliesslich im Text selbst. Die dahinterliegende
# Bibliotheksfunktion `mc_foreign_activity_detected` hat ihre eigene
# Output-Verifikation in tests/spec/divergence-guard/main-checkout-foreign-guard.bats.
#
# HINTERGRUND: siehe main-checkout-foreign-guard.bats im selben Change (T003078/T003097).

setup() {
  REPO_ROOT="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
  SKILL_FILE="$REPO_ROOT/.claude/skills/dev-flow-chore/SKILL.md"
}

@test "dev-flow-chore SKILL.md Schritt 0: unbedingtes 'git stash &&' ist NICHT mehr im unqualifizierten Pfad (Positiv-Anker: Schritt 0 existiert weiterhin)" {
  [ -f "$SKILL_FILE" ]
  grep -q "^## Schritt 0: Reaper" "$SKILL_FILE"
}

@test "dev-flow-chore SKILL.md Schritt 0: referenziert die geteilte Fremdaktivitaets-Guard-Funktion" {
  [ -f "$SKILL_FILE" ]
  awk '/^## Schritt 0: Reaper/,/^## Schritt 0\.5:/' "$SKILL_FILE" \
    | grep -q "mc_foreign_activity_detected"
}

@test "dev-flow-chore SKILL.md Schritt 0: das unqualifizierte 'git stash &&' aus der alten Fassung ist ersetzt" {
  [ -f "$SKILL_FILE" ]
  # Alte Fassung (vor T003078): `git stash && git pull --rebase origin main && git stash pop`
  # als EINE unbedingte Zeile ohne Fremdaktivitaets-Check. Nach dem Fix darf diese exakte
  # Kette in Schritt 0 nicht mehr unqualifiziert vorkommen.
  ! awk '/^## Schritt 0: Reaper/,/^## Schritt 0\.5:/' "$SKILL_FILE" \
    | grep -qF 'git stash && git pull --rebase origin main && git stash pop'
}
