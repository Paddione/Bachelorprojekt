#!/usr/bin/env bats
# tests/spec/routing-docs-guard.bats
# SSOT: openspec/changes/agent-routing-docs/specs/agent-skills.md
# Ticket: T900453 — Change agent-routing-docs (6/6): Routing-Seite plus Sweep.
# Block (a): Seite plus Szenario-Anker; (b): Oberflaechen-Referenzen;
# Block (c): Sweep-Abwesenheit je Datei plus Retired-Marker; (d): Keeper.

setup() {
  REPO="$(cd "$BATS_TEST_DIRNAME/../.." && pwd)"
  PAGE="$REPO/docs/brain/recall-routing.md"
}

@test "(a) routing page exists" {
  [ -f "$PAGE" ]
}

@test "(a) decision tree: header plus three query-type branches" {
  grep -q '## Entscheidung nach Fragetyp' "$PAGE"
  grep -q 'bekanntes Symbol' "$PAGE"
  grep -q 'semantische Was-Frage' "$PAGE"
  grep -q 'Doktrin/Prozess' "$PAGE"
}

@test "(a) fallback order, freshness table, ownership" {
  grep -q '## Fallback-Reihenfolge' "$PAGE"
  grep -q 'K1→K3→K4' "$PAGE"
  grep -q '## Frische' "$PAGE"
  grep -q 'merge-gekoppelt, keine Zeit-SLA' "$PAGE"
  grep -q 'Bound Intervall+Dauer ≤ ~1h' "$PAGE"
  grep -q 'Authoring-Zeitpunkt' "$PAGE"
  grep -q '## Ownership' "$PAGE"
  grep -q 'Epic-owned (T900447)' "$PAGE"
}

@test "(b) all five surfaces reference the routing page" {
  for f in AGENTS.md .opencode/skills/references/mcp-tool-guide.md .opencode/prompts/orchestrator.md .opencode/prompts/primary-agent.md .opencode/prompts/glimmer-primary.md; do
    [ "$(grep -c 'recall-routing' "$REPO/$f")" -ge 1 ] || { echo "REF FEHLT: $f"; return 1; }
  done
}

@test "(c) swept refs are absent, scoped per file" {
  [ "$(grep -c 'brain-ingest' "$REPO/docs/agent-guide/registry/skills.yaml")" = "0" ]
  [ "$(grep -c 'brain-ingest\|brain-wiki\|brain:ingest' "$REPO/.opencode/skills/system-audit/SKILL.md")" = "0" ]
  [ "$(grep -c 'build-docs' "$REPO/.opencode/skills/references/deploy-routing.md")" = "0" ]
  [ "$(grep -c 'brain-mcp-node' "$REPO/CLAUDE.md")" = "0" ]
  [ ! -f "$REPO/docs/runbooks/brain-ingest.md" ]
}

@test "(c) retired markers are present" {
  grep -q 'stillgelegt, K4-Retire' "$REPO/docs/brain/k5-openspec.md"
  grep -q '(entfernt)' "$REPO/docs/brain/k2-bge-paare.md"
  grep -q 'Mirror stillgelegt' "$REPO/docs/diagrams/brain-architektur-gesamtbild.md"
}

@test "(d) keepers: k3 target exists, generated files not older than registry" {
  [ -f "$REPO/docs/brain/k3-code-graph.md" ]
  REG="$REPO/docs/agent-guide/registry/capabilities.yaml"
  for g in docs/agent-guide/maps/toolset-map.md components/website/src/lib/agent-guide.generated.json; do
    [ -f "$REPO/$g" ] || { echo "KEEPER FEHLT: $g"; return 1; }
    [ "$REPO/$g" -nt "$REG" ] || [ "$(stat -c %Y "$REPO/$g")" = "$(stat -c %Y "$REG")" ] || { echo "REGEN FEHLT: $g ist aelter als capabilities.yaml"; return 1; }
  done
}
