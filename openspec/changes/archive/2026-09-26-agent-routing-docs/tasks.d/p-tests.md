---
title: "p-tests — Routing-Guard"
ticket_id: T900453
domains: [docs, tests]
status: active
---

# p-tests — Implementation Plan

_Ticket T900453 · Change `agent-routing-docs` · Epic T900447._ Dieses Partial erstellt genau eine Datei, den Guard gegen die Routing-Seite und den Sweep, und belegt rot→grün um die p1/p2-Umsetzung. Es trägt STRUCT2 (Failing-Test-Step in Task 1) und STRUCT3 (Verify in Task 3). Plan-Intel: `scripts/plan-intel-filter.sh` meldet `intel.json not found` — alle Werte unten stammen aus direkten Quell-Reads (grep fallback), je Wert mit Datei:Zeile belegt.

## File Structure

| Pfad | Ist | S1 |
|---|---|---|
| `tests/spec/routing-docs-guard.bats` (NEU) | — (geplante Abwesenheit, `ls`-verifiziert) | `.bats` ungated, nicht-baselined → n/a; Soll ≤100 Zeilen |

S1-Legende: `docs/code-quality/gates.yaml → s1.limits` kennt nur `.astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash/.java/.php` — `.bats` ist nicht gelistet (verifiziert per grep auf `limits:`), also ungated. `jq`-Lookup (`S1:tests/spec/routing-docs-guard.bats`) meldet `nicht-baselined`. Wirksame Schwelle und Budget: n/a (keine Zahlenschwelle, keine Baseline). Keine Baseline-Einträge, keine S4-Artefakte (kein Manifest, kein Skript).

## Scope-Grenze

Nicht in p-tests (disjunkt, anderswo owned): alle p1-Dateien (Routing-Seite, `AGENTS.md`, `capabilities.yaml`, `mcp-tool-guide.md`, 3 Prompts, p1-Regens), alle p2-Dateien (Runbook-Löschung, `skills.yaml`, `system-audit/SKILL.md`, `deploy-routing.md`, k2/k5/gesamtbild/k1-vector-db-Docs, `CLAUDE.md`), `docs/brain/k3-code-graph.md` (nur verlinkt — der Guard prüft bloß dessen Existenz), 5/6-owned Zeilen (`CLAUDE.md:128,147` — deren Unversehrtheit wird hier NICHT assertiert, das Ordnungsgate in p1 deckt sie), `openspec/archive/`, Historie. Die Sweep-Abwesenheit wird bewusst je Datei geprüft, nie repo-weit; die Historie bleibt unangetastet. Kein E7-Gate hier (reine Guard-Erstellung, keine Doku-Edits; der Grün-Lauf in Task 2 passiert erst nach dem p1-Task-1-Gate).

## Task 1 — Guard schreiben, Rot-Lauf (STRUCT2), Inventar, No-Coupling-Verdict

1.1 Guard-Datei mit genau diesem Inhalt anlegen (Header mit SSOT + Ticket, 4 Blöcke, Soll ≤100 Zeilen):

```bash
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
```

Anker-Herkunft je Block (gegen die p1/p2-Spec geprüft, nicht geraten): Block (a) nutzt die wörtlichen Sektions- und Wert-Strings aus p1-Task-2 (Baum-Äste, `K1→K3→K4`, Frische-Werte K1/K3/K4, Ownership-Zeile) und deckt die 4 Spec-Szenarien (`specs/agent-skills.md:14-37`) ab: Ast 1 → Szenario 1 (K3), Ast 2 → Szenario 2 (K1), Ast 3 → Szenario 3 (K4), Frische-Tabelle → Szenario 4. Block (b) prüft die 5 p1-Oberflächen aus p1-Task-3 (je `grep -c ≥1`). Block (c) prüft die p2-Sweep-Ziele aus p2-Task-1/2/3 (je Datei 0 plus 3 Retired-Marker mit den exakten p2-Ersatzstrings). Block (d) prüft den p1/p2-Keeper-Konsens (k3-Linkziel, Regen-Frische via `-nt`-oder-gleich).

1.2 Zeilen-Assert: `n=$(wc -l < tests/spec/routing-docs-guard.bats | tr -d ' '); [ "$n" -le 100 ] && echo "lines: $n"`.

1.3 Rot-Lauf — STRUCT2 Failing-Test-Step (Guard läuft VOR der p1/p2-Umsetzung, expected: FAIL):

```bash
bats tests/spec/routing-docs-guard.bats; echo "exit=$?"
# erwartet: exit=1 — expected: FAIL (Seite fehlt → Block a rot; gefegte Refs stehen noch → Block c rot).
```

Weiter nur bei exit=1 mit rot in (a) und (c). Ein grüner Lauf hier wäre der Befund (Guard misst nichts), kein Fortschritt.

1.4 Test-Inventar regenerieren (neue Test-Datei erfordert es, sonst failt der CI-Inventar-Check):

```bash
task test:inventory
grep -q 'routing-docs-guard' components/website/src/data/test-inventory.json && echo "inventar ok"
```

Die JSON-Änderung ist generiertes Artefakt (Regen, nie Hand-Edit) und wird mitcommittet.

1.5 No-Coupling-Verdict (read-only, gleiche Greps erneut — kein existierender Guard koppelt an alte Routing-Inhalte):

```bash
grep -rn 'Wiki-Suche\|Brain-Wiki' tests/spec/ --include='*.bats' | wc -l  # erwartet 0
grep -rn 'Erste Anlaufstelle\|Nicht-Code-Dateien\|bge-Stack\|Audit über alle Systeme' tests/spec/ --include='*.bats' | wc -l  # erwartet 0 (kein altes use_when-Literal)
grep -rn 'runbooks/brain-ingest\|brain:ingest' tests/spec/ --include='*.bats' | wc -l  # erwartet 0
grep -rln 'prompts/orchestrator\|prompts/primary-agent\|prompts/glimmer-primary' tests/spec/ --include='*.bats' | wc -l  # erwartet 0
grep -rn 'Code Discovery' tests/spec/ --include='*.bats' | wc -l  # erwartet 0
grep -c 'brain-ingest' tests/spec/agent-skills/portable-inventory.bats tests/spec/agent-skills/skill-path-references.bats  # erwartet je 0
grep -n 'build-docs' tests/spec/devflow-selection-archive-hardening.bats  # post-5/6: 0 Treffer erwartet (5/6 entfernt Pfad + Guard-Regex); falls 1, muss er auf scripts/devflow-post-merge-deploy.sh zielen, nie auf deploy-routing.md
```

Verdict-Ergänzung (Quell-Reads, verifiziert): `tests/spec/brain-foundation/k1-vector-db-doc.bats:23-30` prüft nur 4 Tabellennamen per `grep -q` (append-sicher gegen das p2-Addendum, keine Zeilenzahl); `tests/spec/unsloth-training-env/agent-discovery.bats:70` zählt nur `state: canonical` (p1 ändert keine Curation-States); alle `use_when`-Treffer in `tests/spec/toolset-registry/*.bats` sind Fixture-Texte, keine Registry-Literale; `tests/spec/k4-surgery-guard.bats:28-29` assertiert `brain-mcp-node`-Abwesenheit in anderen Dateien (additiv, kein Konflikt).

## Task 2 — Grün-Lauf nach p1/p2 (rot→grün-Beleg)

Voraussetzung: p1 (Routing-Seite + Oberflächen + Regens) und p2 (Sweep) sind im selben Worktree umgesetzt. Dann derselbe Guard-Lauf wie in Task 1.3:

```bash
bats tests/spec/routing-docs-guard.bats; echo "exit=$?"
# erwartet: exit=0 — alle 7 @test-Blöcke grün.
```

Beleg-Paar für den Review: Task-1.3-Log (exit=1, rot in (a) und (c)) plus dieses Log (exit=0). Schlägt der Grün-Lauf fehl, ist die p1/p2-Umsetzung unvollständig (fehlender Anker-String, vergessener Regen, übersehener Sweep-Rest) — kein Guard-Edit zum Grünbiegen.

## Task 3 — Verify (STRUCT3)

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Danach `git status --porcelain`: nur die Guard-Datei (neu), das regenerierte Test-Inventar und die p1/p2-Dateien sichtbar; Fremdeinträge sind Befund, kein stilles Mitcommitten. Baseline-Key-Count bleibt unverändert (keine Baseline-Einträge in p-tests).
