---
title: "cooperative-partial-claims — Implementation Plan"
ticket_id: T900024
domains: [tooling, agent-coordination, agent-harness]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# cooperative-partial-claims — Implementation Plan

_Ticket: T900024_

## File Structure

```
scripts/agent-lock.sh                          (geaendert — Dateiliste am Claim)
scripts/hooks/worktree-write-guard.sh          (geaendert — Entscheidung gegen Dateiliste)
.opencode/opencode.jsonc                       (Guard registrieren)
.agy/hooks.json                                (Guard registrieren)
.opencode/skills/opencode-git-workflow/        (Kopie durch Verweis ersetzen)
tests/spec/active-sessions-hub/partial-claims-T900024.bats            (neu)
tests/spec/agent-skills/harness-guard-registration-T900024.bats       (neu)
openspec/changes/cooperative-partial-claims/                          (Proposal + Delta-Spec)
```

## S1-Budget (gemessen, Stand 8e54c8695)

Ermittelt mit `PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh _ext_limit <datei>`
und `wc -l`:

| Datei | LOC | Budget |
|---|---|---|
| `scripts/agent-lock.sh` | 800 | 0 |
| `scripts/hooks/worktree-write-guard.sh` | 229 | 571 |

`scripts/agent-lock.sh` sitzt exakt auf dem S1-Limit von 800. Die Luft dafuer schafft
T900023 (Extraktion des Reap-Blocks nach `scripts/agent-lock-reap.sh`) — dieser Plan
setzt sie voraus und schafft sie nicht erneut. Steht T900023 beim Start dieses Plans
noch nicht auf `main`, ist Task 1 blockiert und der Plan wartet; ein zweiter
Extraktionsschritt hier wuerde mit dem aus T900023 kollidieren.

## Abhaengigkeit

Blockiert von **T900023**. Zwei Gruende, beide hart:
`_lock_dir()` findet unter Windows ohne den dortigen Fix sein Verzeichnis nicht — jede
Claim-Logik liefe ins Leere. Und das S1-Budget von `agent-lock.sh` ist ohne die dortige
Extraktion null.

## Tasks

- [ ] **1 — Failing-Test-Step (RED): zwei Sessions, disjunkte Partials.**
      Neuer Guard `tests/spec/active-sessions-hub/partial-claims-T900024.bats`.
      Er baut ein echtes Repo mit zwei Dateien, setzt fuer Session A einen Claim, der
      NUR Datei A deckt, und laesst Session B nach Datei B schreiben. Erwartet wird:
      B darf schreiben, B darf `p2` claimen, und ein Zugriff von B auf Datei A wird
      unter Nennung des Halters abgelehnt.
      Gepruefte Ebene ist der Exit-Code von `worktree-write-guard.sh` bei echter
      JSON-Eingabe auf stdin, nicht der Quelltext (Konvention T002448-M4).

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/active-sessions-hub/partial-claims-T900024.bats
# expected: FAIL (Claims sind heute worktree-weit; B wird abgelehnt)
```

- [ ] **1b — Vorbedingung hart pruefen: S1-Luft aus T900023 ist da.**
      Task 2 fuegt `scripts/agent-lock.sh` Zeilen hinzu, dessen Budget heute 0 ist. Die
      noetige Extraktion (Reap-Block nach `scripts/agent-lock-reap.sh`) gehoert zu T900023
      und wird hier NICHT wiederholt — ein zweiter Extraktionsschritt wuerde mit jenem
      kollidieren. Stattdessen wird die Vorbedingung gemessen und bricht laut ab, wenn
      sie fehlt:

```bash
git fetch origin main -q
git show origin/main:scripts/agent-lock-reap.sh >/dev/null 2>&1   || { echo "BLOCKIERT: T900023 (Extraktion) ist nicht auf main — Task 2 nicht beginnen"; exit 1; }
PLAN_LINT_SELFTEST=1 bash scripts/plan-lint.sh _ext_limit scripts/agent-lock.sh
wc -l scripts/agent-lock.sh
```

      Reicht die Luft danach immer noch nicht fuer die Aenderung aus Task 2, wird
      `agent-lock.sh` hier weiter aufgeteilt: ein zusaetzlicher Block wandert in ein
      eigenes Fragment, nach dem Muster der vorhandenen (`agent-lock-identity.sh`,
      `-guards.sh`, `-merged.sh`, `-activity.sh`). Verkleinern durch Zusammenziehen von
      Zeilen zaehlt nicht — das verschiebt das Problem nur.

- [ ] **2 — Dateiliste am Claim.** `cmd_claim` (scripts/agent-lock.sh:408) nimmt die
      `target_files` eines Partials entgegen und schreibt sie ins Lock-JSON. Ein neuer
      Scope-Name ist nicht noetig: Scopes sind freie Strings und werden nur ueber
      `_sanitize` zum Dateinamen (agent-lock.sh:130).
      Ein Lock OHNE Dateiliste behaelt exakt die heutige Bedeutung — das ist die
      Rueckfallebene fuer alles, was nicht aus einem Partial-Plan stammt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-lock-claim-persist.bats \
  tests/spec/active-sessions-hub/agent-lock-scope-regelwerk.bats
```

- [ ] **3 — Guard entscheidet gegen die Dateiliste (GREEN).**
      In `worktree-write-guard.sh` Entscheidungsschritt 3 ("Fremder LEBENDER Claim deckt
      den Pfad", Zeilen 5-24 dokumentieren das Warum) so aendern, dass er bei einem Lock
      mit Dateiliste nur deren Eintraege deckt. Ohne Dateiliste bleibt der Worktree-Pfad
      massgeblich. Die Ablehnung nennt weiterhin den Halter — eine stumme Ablehnung
      waere schlimmer als keine.
      Der Notausgang `WORKTREE_GUARD_BYPASS=1` bleibt unveraendert bestehen.

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/active-sessions-hub/partial-claims-T900024.bats \
  tests/spec/agent-skills/worktree-write-guard-phase-a-allowlist.bats
```

- [ ] **4 — Claim-Ableitung aus dem Partial-Manifest.**
      Die `target_files` stammen aus dem `## Partials`-Manifest von `tasks.md`; plan-lint
      parst es bereits (plan-lint.sh:245-287) und garantiert ueber Regel D1, dass keine
      Datei in zwei Partials liegt. Diese Ableitung wiederverwenden statt ein zweites
      Parsing zu bauen — zwei Parser fuer dasselbe Format driften auseinander.
      Belegen, dass beide Wege dieselbe Liste liefern:

```bash
bash scripts/plan-lint.sh openspec/changes/cooperative-partial-claims/tasks.md
```

- [ ] **5 — Guard in allen Harnesses registrieren.**
      Gemessener Stand: registriert in `.claude/settings.json:73` und `.codex/hooks.json`;
      NICHT in opencode und NICHT in `.agy/hooks.json` (dort steht `agent-lock`, nicht der
      Guard). Beide nachziehen. Neuer Guard
      `tests/spec/agent-skills/harness-guard-registration-T900024.bats`, der die
      Registrierung in allen vier Harness-Konfigurationen prueft — sonst faellt die
      naechste hinzukommende Harness wieder still durch.

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/agent-skills/harness-guard-registration-T900024.bats
```

- [ ] **6 — Git-Workflow-SSOT entdoppeln.**
      `.claude/skills/git-workflow/SKILL.md` (321 Zeilen) und
      `.opencode/skills/opencode-git-workflow/SKILL.md` (319 Zeilen) sind unabhaengige
      Kopien mit inhaltlicher Drift; die Claude-Code-Kopie zitiert `T069/T070`, wo die
      opencode-Kopie `T003069/T003070` nennt.
      Vorgehen: die beiden Fassungen zusammenfuehren, dabei jede Abweichung einzeln
      entscheiden statt eine Seite pauschal zu uebernehmen — die Drift laeuft in beide
      Richtungen. Danach die opencode-Fassung durch einen Directory-Symlink auf die
      Shared Source ersetzen; Vorbild ist die bereits bestehende Loesung der
      `dev-flow-*`-Skills (T014086).
      Vorsicht Windows: `core.symlinks=false` laesst Mode 120000 im Tree stehen, waehrend
      die Arbeitskopie eine normale Datei zeigt. Nach dem Umbau gegen den Git-Tree
      pruefen, nicht gegen das Dateisystem:

```bash
git ls-files -s .opencode/skills/opencode-git-workflow | head
bash tests/spec/../runner.sh local SYMLINK-GUARD 2>/dev/null || \
  tests/unit/lib/bats-core/bin/bats tests/spec/hygiene/
```

- [ ] **7 — Reihenfolge-Audit je Harness.**
      Fuer Claude Code, Codex, opencode und agy die tatsaechliche Schrittfolge gegen die
      SSOT pruefen: pull-first, Commit-Konventionen, freshness-Guard,
      Commit-Verifikation, PR-Scope-Preflight, CI-Fix-Loop, Auto-Merge,
      Worktree-Cleanup. Jede Abweichung wird entweder behoben oder als bewusste
      Harness-Eigenheit im Skill begruendet — unbegruendete Abweichungen bleiben nicht
      stehen. Der Befund gehoert als Tabelle (Harness x Schritt) ins Ticket, damit das
      Audit nicht bei jeder Wiederholung neu erhoben werden muss.

- [ ] **8 — Final Verification.** Die drei verbindlichen CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
