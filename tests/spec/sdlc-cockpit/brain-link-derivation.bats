#!/usr/bin/env bats
# brain-link-derivation.bats — T002465 (K6): Slug-Ableitung Pipeline vs. TS-Kopie
#
# Pruefmodus (Test-Resultats-Konvention T002448-M4): OUTPUT-VERIFIKATION.
# Der Test ruft die Ableitung auf, statt sie zu greppen. Die Ableitung liegt in
# TypeScript (website/src/lib/sdlc/brain-links.ts) — dieser Test laesst die Bash-
# Quelle (scripts/brain-ingest-worklist.sh) laufen, zieht drei bekannte Zeilen
# heraus und vergleicht deren Slug mit dem, was die TypeScript-Regel fuer
# denselben Pfad liefert. Weicht eine der beiden Seiten ab, ist der Test rot —
# die TypeScript-Kopie der Regel darf nicht von der Bash-Quelle wegdriften.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../../.." && pwd)"
}

@test "T002465 Die drei belegten Slug-Paare stimmen zwischen Pipeline und TS-Kopie ueberein" {
  local ts_rule="$REPO/website/src/lib/sdlc/brain-links.ts"
  [ -f "$ts_rule" ] || {
    echo "fehlt: website/src/lib/sdlc/brain-links.ts (Task 4 noch offen)" >&2
    return 1
  }

  local pairs=(
    "openspec/specs/sdlc-cockpit.md|openspec-specs-sdlc-cockpit"
    "CLAUDE.md|claude"
    "docs/superpowers/references/gotchas-footguns.md|docs-superpowers-references-gotchas-footguns"
  )

  local rel expected_ts actual_pipe actual_ts
  for pair in "${pairs[@]}"; do
    rel="${pair%%|*}"
    expected_ts="${pair##*|}"

    # TS-Kopie: die Regel fuer denselben Pfad ausfuehren.
    actual_ts="$(
      cd "$REPO/website" && npx tsx -e "import {slugForSource} from './src/lib/sdlc/brain-links.ts'; process.stdout.write(slugForSource('$rel'))" 2>/dev/null
    )"

    # Bash-Quelle: die Pipeline selbst befragen.
    actual_pipe="$(
      bash "$REPO/scripts/brain-ingest-worklist.sh" --root "$REPO" --manifest "$REPO/scripts/brain/ingest-sources.yaml" 2>/dev/null \
        | awk -v rel="$rel" -F '\t' '$1==rel {print $2; exit}'
    )"

    [ "$actual_ts" = "$expected_ts" ] || {
      echo "TS-Kopie weicht ab: $rel → '$actual_ts' (erwartet '$expected_ts')" >&2
      return 1
    }
    [ "$actual_pipe" = "$expected_ts" ] || {
      echo "Pipeline weicht ab: $rel → '$actual_pipe' (erwartet '$expected_ts')" >&2
      return 1
    }
  done
}

@test "T002465 Ein weggeprunter Pfad unter website/ ist nicht ingestiert (Grenze)" {
  local ts_rule="$REPO/website/src/lib/sdlc/brain-links.ts"
  [ -f "$ts_rule" ] || {
    echo "fehlt: website/src/lib/sdlc/brain-links.ts (Task 4 noch offen)" >&2
    return 1
  }

  # Die vier weggeprunten Baeume sind explizit ausgeschlossen. Ein Pfad dort
  # darf keine Wiki-Seite zugeordnet bekommen — unabhaengig vom Manifest.
  # exit 0 = ingestiert (unerwuenscht fuer website/), exit 1 = nicht ingestiert.
  run bash -c "cd '$REPO/website' && npx tsx -e \"import {isIngestedSource} from './src/lib/brain-links.ts'; process.exit(isIngestedSource('website/src/pages/index.astro') ? 0 : 1)\""
  [ "$status" -eq 1 ]
}
