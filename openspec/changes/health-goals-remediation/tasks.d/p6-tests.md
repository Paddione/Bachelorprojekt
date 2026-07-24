---
title: "health-goals-remediation (p6-tests) — Implementation Plan"
ticket_id: T002148
domains: [ops, db, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# health-goals-remediation — Implementation Plan (p6-tests)

_Ticket: T002148 · Partial: p6-tests (Rolle: tests, STRUCT2-Träger) · depends_on: p1, p2, p3, p4, p5_

Dieses Partial schreibt **nur Tests** (rot→grün) für die Health-Goals-Remediation. Es verifiziert
alle vier Requirements aus `openspec/changes/health-goals-remediation/specs/health-goals.md`
(REQ-HEALTH-GOALS-010 bis 013) über einen einzigen, neuen BATS-Block. Die Implementierung selbst
(`scripts/health-goals-check.sh`, `.claude/skills/OVERVIEW.md`,
`.claude/skills/gitops-repo-audit/SKILL.md`, `.claude/skills/dev-flow-plan/SKILL.md`,
`.github/workflows/e2e.yml`) kommt aus p1–p5. Die hier hinzugefügten `@test`-Blöcke werden **zuerst**
committet und **scheitern** auf dem noch nicht implementierten Stand (`expected: FAIL`), bevor
p1–p5 sie grün ziehen.

`G-E2E01` ist bewusst **ausgeschlossen** aus der `--only`-Liste: sein Fix korrigiert nur die
Zählmethodik (nur `event=schedule`-Runs statt auch `workflow_dispatch`), nicht einen im Repo
fixierbaren Ist-Zustand — der Live-Wert hängt von der externen GH-Actions-Run-Historie ab, die
außerhalb der Kontrolle dieses Repos liegt. REQ-HEALTH-GOALS-010 deckt die G-E2E01-Änderung über
den bestehenden Scenario-Text ab; ein eigener BATS-Gate hier würde nichtdeterministisch flackern.

## File Structure

```
tests/spec/health-goals-remediation.bats               (new)
website/src/data/test-inventory.json                   (regen via `task test:inventory`)
```

`tests/spec/health-goals-remediation.bats` ist `.bats` — kein S1-Extension-Limit, kein Budget zu
prüfen (B1a entfällt für ungegatete Extensions).

---

### Task 1: RED — neue Test-Datei `tests/spec/health-goals-remediation.bats` anlegen

Neue Datei mit vier `@test`-Blöcken, die zusammen alle vier Requirements der Delta-Spec prüfen:

```bash
#!/usr/bin/env bats
# tests/spec/health-goals-remediation.bats
# SSOT: openspec/specs/health-goals.md (Delta: openspec/changes/health-goals-remediation/)
#
# T002148: verifiziert REQ-HEALTH-GOALS-010..013 — sieben Health-Goal-Verletzungen
# (G-AGENTIC02, G-AGENTIC06..09, G-DB09, G-E2E02) werden durch das health-goals-remediation-
# Changeset behoben. G-E2E01 ist absichtlich ausgeschlossen (siehe proposal.md — reiner
# Zählmethodik-Fix, Live-Wert hängt von externer GH-Actions-Run-Historie ab, nicht deterministisch
# gegen den Repo-Zustand testbar).

setup() {
  REPO_ROOT="$(cd "$(dirname "$BATS_TEST_FILENAME")/../.." && pwd)"
  SCRIPT="$REPO_ROOT/scripts/health-goals-check.sh"
  DEV_FLOW_PLAN_SKILL="$REPO_ROOT/.claude/skills/dev-flow-plan/SKILL.md"
  GITOPS_AUDIT_SKILL="$REPO_ROOT/.claude/skills/gitops-repo-audit/SKILL.md"
}

# REQ-HEALTH-GOALS-010 + 011 + 012 (die vier direkt messbaren Goal-IDs von 010, alle IDs von
# 011/012): der Health-Goals-Check muss mit --strict für exakt diese sieben IDs exit 0 liefern.
# G-DB09 und G-E2E02 sind DB-abhaengig (db_scalar) und melden "-"/SKIP ohne erreichbaren Cluster —
# das zaehlt laut health-goals-check.sh nicht als Verstoss, daher ist dieser Test auch offline
# (CI ohne Cluster) aussagekraeftig fuer G-AGENTIC02/06/07/08/09.
@test "T002148: health-goals-check --strict passes for the seven remediated goal IDs" {
  run bash "$SCRIPT" --strict --only=G-AGENTIC02,G-AGENTIC06,G-AGENTIC07,G-AGENTIC08,G-AGENTIC09,G-DB09,G-E2E02
  [ "$status" -eq 0 ]
}

# REQ-HEALTH-GOALS-012 direkt (Redundanz zu G-AGENTIC09 oben, aber als eigenstaendige
# Struktur-Assertion — unabhaengig vom Health-Goals-Skript selbst nachvollziehbar).
@test "T002148: dev-flow-plan/SKILL.md stays within the 500-line budget" {
  [ -f "$DEV_FLOW_PLAN_SKILL" ]
  [ "$(wc -l < "$DEV_FLOW_PLAN_SKILL")" -le 500 ]
}

# REQ-HEALTH-GOALS-011, Scenario "No dead script paths in gitops-repo-audit": die drei
# Invocation-Beispiele muessen den vollen Pfad ab Repo-Root referenzieren, nicht den
# bisherigen toten Pfad ohne `.claude/skills/gitops-repo-audit/`-Praefix.
@test "T002148: gitops-repo-audit/SKILL.md references the full repo-root-relative script paths" {
  [ -f "$GITOPS_AUDIT_SKILL" ]
  grep -qF '.claude/skills/gitops-repo-audit/scripts/discover.sh' "$GITOPS_AUDIT_SKILL"
  grep -qF '.claude/skills/gitops-repo-audit/scripts/validate.sh' "$GITOPS_AUDIT_SKILL"
  grep -qF '.claude/skills/gitops-repo-audit/scripts/check-deprecated.sh' "$GITOPS_AUDIT_SKILL"
}

# Ergaenzende Existenz-Assertion: die drei Skripte selbst muessen an dem Pfad liegen, den die
# korrigierten Invocation-Beispiele referenzieren (die Skripte existieren bereits heute — der
# Bug ist ausschliesslich der fehlende Pfad-Praefix in der Doku, siehe proposal.md).
@test "T002148: the three gitops-repo-audit scripts exist at the referenced path" {
  [ -f "$REPO_ROOT/.claude/skills/gitops-repo-audit/scripts/discover.sh" ]
  [ -f "$REPO_ROOT/.claude/skills/gitops-repo-audit/scripts/validate.sh" ]
  [ -f "$REPO_ROOT/.claude/skills/gitops-repo-audit/scripts/check-deprecated.sh" ]
}
```

**RED-Nachweis (Pflicht, STRUCT2):** vor der p1–p5-Implementierung ausführen —

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals-remediation.bats
# expected: FAIL (rot — G-AGENTIC02/06/07/08 sind aktuell echte Gate-Verstöße, G-AGENTIC09
# meldet 523 statt <=500 Zeilen unter --strict als offenes Target, und
# gitops-repo-audit/SKILL.md referenziert noch die unpräfixierten Pfade)
```

**Acceptance:**
- Alle vier `@test`-Blöcke sind in der neuen Datei vorhanden.
- Auf dem aktuellen Branch (ohne p1–p5) schlägt mindestens der erste und der zweite Test fehl
  (`G-AGENTIC02/06/07/08` Gate-Verstöße + `dev-flow-plan/SKILL.md` bei 523 Zeilen); der dritte Test
  schlägt fehl, weil die unpräfixierten Pfade noch stehen; der vierte Test ist bereits grün (die
  Skripte existieren schon — nur die Doku-Referenzen fehlen, siehe proposal.md).
- Keine Brand-Domain-Literale, keine hartcodierten Cluster-Secrets in der neuen Datei.

---

### Task 2: GREEN — nach p1–p5 grün stellen

Voraussetzung: p1 (`scripts/health-goals-check.sh` robuster), p2 (`OVERVIEW.md` Skill-Registry),
p3 (`gitops-repo-audit/SKILL.md` Pfad-Präfixe), p4 (`dev-flow-plan/SKILL.md` <=500 Zeilen), p5
(`e2e.yml` Purge-Fehlerbehandlung) sind implementiert.

**GREEN-Nachweis** — derselbe BATS-Lauf wie in Task 1 muss jetzt vollständig durchlaufen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/health-goals-remediation.bats
# expected: PASS (grün — alle vier Tests bestehen; G-DB09/G-E2E02 zaehlen als SKIP, sofern kein
# Cluster erreichbar ist, was health-goals-check.sh nicht als Verstoss wertet)
```

**Acceptance:**
- Alle vier `@test`-Blöcke sind grün.
- Kein Test wurde entfernt oder abgeschwächt (z. B. keine `skip`-Direktive nachträglich
  eingefügt), um GREEN künstlich zu erzwingen.

---

### Task 3: Test-Inventar regenerieren & committen

Nach dem Anlegen der neuen `@test`-Blöcke in Task 1 muss das generierte Test-Inventar neu erzeugt
und mitcommittet werden — sonst schlägt der CI-Inventar-Check fehl (`task test:inventory` re-run
vs. committed `website/src/data/test-inventory.json`).

```bash
task test:inventory
git add website/src/data/test-inventory.json tests/spec/health-goals-remediation.bats
```

**Acceptance:**
- `website/src/data/test-inventory.json` enthält die vier neuen `T002148`-`@test`-IDs.
- Ein erneuter `task test:inventory`-Lauf erzeugt **keine** Diff mehr (idempotent).
- Datei ist im gleichen Commit wie die Test-Datei.

---

### Task 4: Finale Verifikation (Pflicht-Gates)

```bash
task test:changed          # gezielte Tests der geänderten Domains (BATS-Selection + quality)
task freshness:regenerate  # generierte Artefakte aktualisieren (test-inventory, repo-index, …)
task freshness:check       # CI-Äquivalent: Freshness + quality:check (S1–S4) + Baseline-Assertion
```

**Acceptance:**
- `tests/spec/health-goals-remediation.bats` läuft grün.
- `task freshness:check` ist grün (kein Baseline-Wachstum; `.bats`/`.json` ungated).
- `test-inventory.json` ist idempotent regeneriert und committet.

---

## Offene Risiken (p6-tests)

1. **Cluster-Erreichbarkeit während RED/GREEN-Nachweis:** Task 1 (`T002148: health-goals-check
   --strict passes...`) prüft die vier offline-messbaren Goal-IDs (G-AGENTIC02/06/07/08/09)
   verlässlich in jeder Umgebung; G-DB09/G-E2E02 tragen zum RED-Nachweis nur bei, wenn der
   `fleet`-Kontext zum Zeitpunkt des Laufs erreichbar ist (sonst SKIP, kein Fehlschlag). Das
   GREEN-Ergebnis bleibt in beiden Fällen korrekt, da SKIP niemals als Verstoß zählt.
2. **Reihenfolge-Kopplung an p1–p5:** Läuft dieses Partial isoliert (ohne p1–p5), bleibt Task 1
   dauerhaft rot — das ist beabsichtigt (STRUCT2-Träger) und kein Implementierungsfehler dieses
   Partials.
3. **Pfad-Präfix-Assertion (Task 1, dritter Test) ist wortwörtlich:** Weicht p3 von der exakten
   Zeichenkette `.claude/skills/gitops-repo-audit/scripts/<name>.sh` ab (z. B. relative
   `../scripts/…`-Syntax), muss die Assertion synchron nachgezogen werden.
