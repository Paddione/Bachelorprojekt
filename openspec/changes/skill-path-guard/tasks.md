---
title: "skill-path-guard — Implementation Plan"
ticket_id: T002613
domains: [test, tooling, devflow]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# skill-path-guard — Implementation Plan

_Ticket: T002613_

## File Structure

```
NEU     tests/spec/agent-skills/skill-path-references.bats
ÄNDERN  .claude/skills/dev-flow-e2e/SKILL.md                    (2× Pfad, + Vision-Rückfall)
ÄNDERN  .claude/skills/references/mishap-classification.md      (1× Pfad)
ÄNDERN  .claude/skills/references/ticket-ops-procedures.md      (1× Zitat)
```

**S1-Budget.** Keine der Dateien ist S1-erfasst: `docs/code-quality/gates.yaml → s1.limits`
führt weder ein `.md`- noch ein `.bats`-Limit. Für diesen Vorgang gilt daher kein Zeilenbudget.
Gegengeprüft am 2026-08-03 in `docs/code-quality/baseline.json` — alle drei geänderten Dateien
sind `nicht-baselined` (Ist 252 / 39 / 359).

## Verify (RED → GREEN)

- [ ] **Task 1 — Failing-Test-Step (RED).** `tests/spec/agent-skills/skill-path-references.bats`
      anlegen. Der Test extrahiert aus jeder Skill-Datei außerhalb der Ausnahmeliste alle
      repo-relativen Pfadverweise mit Dateiendung unter `openspec/`, `scripts/`, `tests/`,
      `docs/`, `website/`, `k3d/`, `environments/`, `flux/` und prüft jeden mit `[ -e ]`.

      Ausnahmeliste im Test selbst, mit Begründung: `gitops-repo-audit`, `gitops-knowledge`,
      `gitops-cluster-debug`, `vitest` — deren Verweise zeigen auf Upstream-Doku (fluxcd.io)
      beziehungsweise auf Beispielpfade fremder Projekte. Ohne die Ausnahme stehen 23
      Falschpositive gegen 3 echte Funde, und ein Guard in diesem Verhältnis wird abgeschaltet
      statt gepflegt.

      Positiv-Anker im selben Test nach T002356-M1: die Zahl der geprüften Verweise muss `> 0`
      sein. Ohne ihn bestünde der Test vakuos, falls die Extraktion nicht greift.

      Header-Kommentar hält den Prüfmodus fest (T002448-M4): geprüft wird das Ergebnis der
      Dateisystem-Auflösung, nicht ein Quelltextmuster.

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/skill-path-guard
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/skill-path-references.bats
# expected: FAIL (rot — die drei toten Verweise stehen noch)
```

- [ ] **Task 2 — Pfadkorrektur `dev-flow-e2e` (GREEN, Teil 1).** In
      `.claude/skills/dev-flow-e2e/SKILL.md` beide Vorkommen von
      `openspec/specs/k8-headed-tests/spec.md` durch `openspec/specs/e2e-test-infrastructure.md`
      ersetzen. Beim zweiten Vorkommen („Details/Architektur:") zusätzlich die
      Requirement-Kennungen `REQ-k8-01…04` nennen, damit die Fundstelle im mehrere hundert
      Zeilen langen Spec auffindbar bleibt.

- [ ] **Task 3 — Pfadkorrektur `mishap-classification` (GREEN, Teil 2).** In
      `.claude/skills/references/mishap-classification.md` Zeile 38 den Verweis
      `openspec/changes/mishap-rollup/tasks.md` auf den SSOT-Spec
      `openspec/specs/mishap-rollup.md` umstellen. Der Change ist abgeräumt; der Plan-Pfad
      existiert nicht mehr, der Spec schon.

- [ ] **Task 4 — Zitat-Korrektur `ticket-ops-procedures` (GREEN, Teil 3).** In
      `.claude/skills/references/ticket-ops-procedures.md` Zeile 82 verweist ein wörtliches
      Zitat auf `tests/e2e/specs/fa-26-bug-report-form.spec.ts:45`. Die Datei ist gelöscht.
      Das Zitat behalten, aber als historisch kennzeichnen und den Dateipfad entfernen —
      der zitierte Text bleibt als Beispiel gültig, der Pfad ist es nicht.

- [ ] **Task 5 — Vision-Rückfall dokumentieren.** In `dev-flow-e2e` Schritt 8.5, Punkt 3, den
      Prüfbefehl und den Rückfall ergänzen. `8094` bleibt der bevorzugte dedizierte Endpunkt,
      `8091` ist der Rückfall (Loadout `gemma26-factory` führt `mmprojPath`). REQ-k8-04 im
      SSOT-Spec bleibt unverändert — hier wird die Bedienung ergänzt, nicht die Anforderung.

```bash
# Prüfbefehl, der in den Skill aufgenommen wird
curl -s -m 3 http://localhost:8094/v1/models >/dev/null && echo "8094 (dediziert)" \
  || { curl -s -m 3 http://localhost:8091/v1/models >/dev/null && echo "8091 (Rueckfall)" \
       || echo "kein Vision-Endpunkt — Punkt 3 ueberspringen"; }
```

- [ ] **Task 6 — Guard grün.** Der Test aus Task 1 muss nach den Tasks 2–4 bestehen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/skill-path-references.bats
# erwartet: gruen — beide @test-Bloecke bestehen
```

- [ ] **Task 7 — Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
