---
title: "automerge-gate-workflow-distinction — Implementation Plan"
ticket_id: T015915
domains: [ci-cd]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# automerge-gate-workflow-distinction — Implementation Plan

_Ticket: T015915_

## File Structure

```
scripts/check-pr-automerge.sh                             (MODIFIED — Maschinen-Erkennung + Deaktivierungspfad, Exit-Codes)
tests/spec/agent-skills/automerge-workflow-disable.bats   (NEW — sechs Tests, gh-Stub-Muster aus automerge-preflight-check.bats)
.claude/skills/dev-flow-execute/SKILL.md                  (MODIFIED — Gate-Wording Schritt 3.8)
.claude/skills/references/dev-flow-execute-phases.md      (MODIFIED — Pre-Flight-Wording)
```

S1-Budget (Stand Plan-Erstellung): `scripts/check-pr-automerge.sh` Ist 102 ·
nicht gebaselined · wirksame Schwelle 800 (.sh-Limit aus gates.yaml) ·
Budget 698 — Wachstum um ~50 Zeilen unkritisch. Die neue Testdatei liegt unter
`tests/**/*.bats` und ist vom S1-Ratchet ignoriert (gates.yaml ignore).
Die beiden Skill-Doku-Dateien sind `.md` und nicht im S1-Limit erfasst.
Keine Website-/Vitest-Betroffenheit — kein Vitest-Task nötig.

## Tasks

- [ ] **p1 — Failing-Test (RED).** Neue Datei
      `tests/spec/agent-skills/automerge-workflow-disable.bats` nach dem
      Stub-Muster der bestehenden `tests/spec/agent-skills/automerge-preflight-check.bats`
      (kein Ambient-gh): Der gh-Stub behandelt zusätzlich `pr merge --disable-auto`
      (zählt Aufrufe in einer Datei) und liefert für `pr view` die Felder
      `number`, `createdAt`, `autoMergeRequest` samt `enabledBy.login`/`enabledAt`.
      Sechs Tests: (1) Auto-Merge aktiv, `enabledBy.login=Paddione`,
      `enabledAt` = `createdAt`+30s → rc=0, Ausgabe nennt PR-Nr und Deaktivierung,
      Stub verzeichnet genau einen `--disable-auto`-Aufruf; (2)
      `enabledBy.login=github-actions[bot]` → rc=0 + Deaktivierung; (3)
      `enabledBy.login=Paddione`, aber `enabledAt` = `createdAt`+3600s → rc=1,
      KEIN `--disable-auto`-Aufruf (Positiv-Anker dafür ist Test 1); (4) fremder
      menschlicher Login (`enabledBy.login=some-human`) → rc=1 ohne Deaktivierung;
      (5) `autoMergeRequest` ohne `enabledBy` → rc=1 ohne Deaktivierung
      (deckt auch den Bestandstest AM_ACTIVE aus der Preflight-Suite ab);
      (6) maschinell erkannt, aber `--disable-auto` scheitert (Stub exit 1) → rc=2.
      Tests laufen gegen die Defaults der Env-Vars (Allowlist `Paddione`,
      Fenster 300s), ohne dass das Testsetup sie setzen muss. Ausführen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/automerge-workflow-disable.bats
# expected: FAIL (red — Maschinen-Erkennung und Deaktivierungspfad existieren noch nicht)
```

- [ ] **p2 — Fix check-pr-automerge.sh (GREEN).** Das Skript erweitern:
      (a) `gh pr view --json number,autoMergeRequest,createdAt` statt nur
      `number,autoMergeRequest`; (b) bei aktivem Auto-Merge `enabledBy.login`
      sowie die Bot-Kennung extrahieren — je nach gh-Version liefert gh
      `enabledBy.__typename` oder `is_bot`; im Execute-Schritt einmalig an einem
      Live-Autorenfall verifizieren, welche Kennung das installierte gh ausgibt,
      und beide Varianten tolerant lesen (`__typename == "Bot"` oder
      `is_bot == true`) plus Login-Suffix `[bot]`; (c) Maschinen-Regeln:
      Bot-Regel ODER PAT-Regel (Login ∈ `CHECK_PR_AUTOMERGE_PAT_ACTORS`,
      Default `Paddione`, UND `enabledAt − createdAt ≤
      CHECK_PR_AUTOMERGE_WORKFLOW_WINDOW_SECS`, Default 300, Differenz per
      GNU-date in Sekunden); (d) bei Maschinen-Erkennung
      `gh pr merge --disable-auto` auf dem PR ausführen: Erfolg → Meldung
      `OK: workflow-gesetzter Auto-Merge auf PR #<N> deaktiviert`, Exit 0;
      Misserfolg → Exit 2; (e) sonst unverändert `BLOCK:` + PR-Nr, Exit 1 —
      auch wenn `enabledBy`/`enabledAt` fehlen oder nicht parsebar sind
      (fail-closed); (f) Header-Kommentar dokumentiert beide Env-Vars, die
      PAT-Realität (Workflow nutzt `secrets.GH_PAT` mit Identität `Paddione`,
      gemessen 2026-08-24 an den Freshness-Regen-Commits) und die
      bekannte Grenze: eine manuelle Aktivierung durch denselben Login IM
      Aktivierungsfenster ist vom Workflow-Fall nicht unterscheidbar und wird
      ebenfalls deaktiviert. Danach müssen beide Suiten grün sein:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/
```

- [ ] **p3 — Skill-Doku angleichen.** In `.claude/skills/dev-flow-execute/SKILL.md`
      (Schritt-3.8-Gate-Absatz) und
      `.claude/skills/references/dev-flow-execute-phases.md` (Pre-Flight-Absatz)
      das Wording von „bei aktivem Auto-Merge bricht das Gate ab, es wird nichts
      deaktiviert" auf das neue Verhalten ändern: maschinell gesetzter
      (Workflow-)Auto-Merge wird vom Check deaktiviert und der Ablauf läuft weiter,
      menschlich gesetzter oder nicht einordenbarer bricht fail-closed ab.
      Die bestehenden Integrations-Greps in `automerge-preflight-check.bats`
      (Zeilen 78–88) suchen nur den Skriptnamen und bleiben grün. Die
      opencode-Seite ist über die Directory-Symlinks (T014086) automatisch
      mitgedacht — keine zweite Bearbeitung.

- [ ] **p4 — Final Verification.** Gezielte Suiten plus die drei Pflicht-Gates:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/automerge-workflow-disable.bats
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/automerge-preflight-check.bats
task test:changed
task freshness:regenerate
task freshness:check
```
