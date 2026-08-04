#!/usr/bin/env bats
# Querschnitts-Qualitaetstests ohne eigene SSOT-Spec.
#
# DIE G-CQ02-GATES STEHEN NICHT MEHR HIER, sondern in tests/spec/g-cq02-any-types.bats
# (SSOT: openspec/changes/cq02-any-types-200/proposal.md) [T002624-Nachlauf].
#
# Grund: Diese Datei trug das Batch-1-Gate (Schwelle 373) aus dem inzwischen archivierten
# openspec/specs/archive/g-cq02-any-types-batch1.md. Die Nachfolge-Etappe zog die Schwelle
# auf 200 und legte dieselben drei Tests erneut an — mit dem Ergebnis, dass
#   * 'monitoring.ts <= 2' WORTGLEICH doppelt existierte (ein Fix an einer Stelle liess die
#     andere rot — genau das kostete beim SDLC-Split eine CI-Runde),
#   * 'catch-blocks' hier die SCHWAECHERE Variante war (nur 'catch (err: any)', waehrend die
#     200er-Datei zusaetzlich 'catch (error: any)' faengt),
#   * das 373er-Gate seit der 200er-Stufe strukturell nicht mehr rot werden KANN: es ist in
#     der strengeren Schwelle logisch enthalten.
#
# Die archivierte REQ-7 verlangt die drei Tests in DIESER Datei. Diese Anforderung ist mit
# der 200er-Etappe sachlich abgeloest — die Tests existieren weiter, strenger, an einer
# Stelle. Der archivierte Spec bleibt als Historie unangetastet.

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
}

@test "T002273: verification-block.md enthält Hinweis zu untracked Dateien in freshness:regenerate" {
  ref="$REPO_ROOT/.claude/skills/references/verification-block.md"
  [ -f "$ref" ] || { echo "MISSING ref: $ref"; return 1; }
  grep -q 'git ls-files' "$ref" \
    || { echo "MISSING git-ls-files hint in verification-block.md"; return 1; }
  grep -q 'untracked' "$ref" \
    || { echo "MISSING untracked hint in verification-block.md"; return 1; }
}
