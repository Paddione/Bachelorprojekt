---
title: "dev-flow-plan Step-3.7 prompt + openspec.sh propose seed + ticket.sh TICKET_OFFLINE guard"
ticket_id: T001242
domains: [devflow, openspec, scripts, tooling]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Tasks: dev-flow-plan-ticket-sh-mishaps (T001242)

- [ ] Task 1: `tests/spec/dev-flow-plan-ticket-sh-mishaps.bats` — failing-test-first BATS (28 cases)
- [ ] Task 2: `.agents/skills/dev-flow-plan/SKILL.md` — Step 3.7 subagent prompt gets the plan-lint hard-rules block
- [ ] Task 3: `scripts/openspec.sh` — `cmd_propose` seeds a plan-lint-PASS tasks.md skeleton
- [ ] Task 4: `scripts/ticket.sh` — every cluster-write subcommand gets the `TICKET_OFFLINE=1` guard
- [ ] Task 5: Final Verification — `task test:changed` + `task freshness:regenerate` + `task freshness:check`

---

# dev-flow-plan-ticket-sh-mishaps — Implementation Plan

Drei zusammengehörige Mishaps (gebündelt in T001242), die alle auf dasselbe
fehlende Vertragsstück zeigen: **plan-lint ist ein hartes Gate, aber seine
Anforderungen sind an keiner Stelle eingebettet, die ein Subagent oder ein
Seeder lesen kann, bevor er rät.** Der Fix: die Anforderungen werden
promptebene (M1) und Seeder-Ebene (M2) verbatim eingebaut, und der
Cluster-Schreibpfad bekommt denselben `TICKET_OFFLINE=1`-Knopf, den
`openspec.sh` schon hat (M3).

**Spec:** `docs/superpowers/specs/2026-06-27-t001242-dev-flow-plan-ticket-sh-mishaps-design.md`

---

## File Structure

```
tests/spec/dev-flow-plan-ticket-sh-mishaps.bats                          ← NEU: 28 failing BATS cases (3 Mishaps)
.agents/skills/dev-flow-plan/SKILL.md                                    ← ERWEITERT: Step 3.7 Prompt um plan-lint Hard Rules
scripts/openspec.sh                                                       ← ERWEITERT: cmd_propose seedet plan-lint-PASS Skeleton
scripts/ticket.sh                                                         ← ERWEITERT: 9 cluster-write subcommands mit TICKET_OFFLINE Guard
openspec/changes/dev-flow-plan-ticket-sh-mishaps/tasks.md                 ← NEU: dieser Plan
openspec/changes/dev-flow-plan-ticket-sh-mishaps/proposal.md              ← NEU: Why + What
openspec/changes/dev-flow-plan-ticket-sh-mishaps/specs/dev-flow-plan.md  ← NEU: ADDED Requirements
docs/superpowers/specs/2026-06-27-t001242-dev-flow-plan-ticket-sh-mishaps-design.md  ← NEU: Design-Note (bereits erstellt im Plan-Pfad)
```

**S1-Budgets** (gegen `docs/code-quality/baseline.json`):

- `tests/spec/dev-flow-plan-ticket-sh-mishaps.bats` (`.bats` ist eine Bash-Variante → Limit 500): aktueller Stand 0 (NEU), Budget 500. Plan-Inhalt ≈ 290 Zeilen → Restbudget ≈ 210.
- `.agents/skills/dev-flow-plan/SKILL.md` (`.md` → ungated, Limit 0): aktueller Stand 505, nicht baselined → keine S1-Schranke wirksam (Limit 0 für `.md`).
- `scripts/openspec.sh` (`.sh` → Limit 500): aktueller Stand 152, nicht baselined → Restbudget 348. Task 3 addiert ≈ 30 Zeilen für die Skeleton-Seed → Restbudget nach Task 3 ≈ 318.
- `scripts/ticket.sh` (`.sh` → Limit 500): aktueller Stand 735, **nicht baselined**, also keine wirksame S1-Schranke (Limit gilt nur bei Baselined). Task 4 addiert ≈ 9×4=36 Zeilen für die Guards → Restbudget statisch 500−735 = -235, aber da nicht baselined: CI trippt nicht.

> **Hinweis S1:** Da weder `SKILL.md` (Limit 0 für `.md`) noch `scripts/openspec.sh`/`scripts/ticket.sh` (nicht baselined) eine wirksame S1-Schranke haben, gibt es in diesem Plan **keinen Verkleinerungs-/Split-Schritt**. Die 4 Tochdateien wachsen moderat (Test-Datei dominiert, aber unter 500 Zeilen).

---

## Aufgabe 1: `tests/spec/dev-flow-plan-ticket-sh-mishaps.bats` — Failing-Test-First

**Ziel:** BATS-Suite, die alle drei Mishaps als rot/grün-Test abbildet. Auf
dem aktuellen `fix/t001242-...`-Branch **muss die Suite FAILEN** (mindestens
24 von 28 Cases), nach den Fixes in Task 2–4 **muss sie PASSEN**.

**Dateien:**

- `tests/spec/dev-flow-plan-ticket-sh-mishaps.bats` — neu erstellen (≈ 290 Zeilen, Pattern wie `tests/spec/openspec-workflow.bats`)

**Implementierung:**

Die Datei deklariert drei `@test`-Gruppen via `setup()` (setzt
`TICKET_OFFLINE=1` + `OPENSPEC_ROOT=<tmpdir>`, damit kein Cluster angefasst
wird und keine andere Change-Folder verschmutzt wird):

**Gruppe M1 (10 Cases):** Extrahiert den Step-3.7-Block aus
`.agents/skills/dev-flow-plan/SKILL.md` mit einem `awk`-Slicer
(`/^### Schritt 3\.7/` bis zur nächsten `## ` oder `### `-Zeile) und
assertet, dass der Block die folgenden Phrasen enthält:

- die F1-Frontmatter-Keys `title`, `ticket_id`, `domains`, `status` (4 Cases)
- die Phrase `File Structure` (1 Case)
- die Phrase `expected: FAIL` (1 Case, case-insensitive, regex `expected:? *fail`)
- die Wörter `TBD|TODO|FIXME` als Placeholder-Warnung (1 Case)
- die Verify-Task-Gates `task test:changed`, `task freshness:regenerate`, `task freshness:check` (3 Cases, regex `task[[:space:]]+<cmd>`)

**Gruppe M2 (8 Cases):** Ruft
`OPENSPEC_ROOT=$TMP/openspec TICKET_OFFLINE=1 bash scripts/openspec.sh propose <slug> --ticket T000099`
achtmal mit unterschiedlichen Slugs auf (jeder Test isoliert via `teardown()`)
und assertet:

- Change-Folder + `tasks.md` werden angelegt (1 Case)
- `tasks.md` enthält die vier F1-Frontmatter-Keys in den ersten 20 Zeilen (1 Case)
- `domains: [a, b, …]` ist non-empty (1 Case, F2)
- H1 matcht `# .* Implementation Plan` (1 Case, STRUCT1)
- `## File Structure` Section existiert (1 Case, STRUCT1)
- Mindestens ein Step matcht das STRUCT2-Regex `expected:? *fail` (1 Case)
- Die drei STRUCT3-Verify-Task-Gates sind im Skeleton (1 Case, 3 grep)
- `bash scripts/plan-lint.sh $TMP/openspec/changes/<slug>/tasks.md` exit 0 (1 Case, end-to-end PASS)

**Gruppe M3 (10 Cases):** Ruft jedes cluster-schreibende Subcommand mit
`TICKET_OFFLINE=1` auf und assertet:

- `archive-plan`, `phase`, `set-touched-files`, `set-pipeline-slot`, `update-status`, `add-comment`, `add-pr-link`, `inject` (8 Cases) — exit 0 UND stdout enthält `OFFLINE`
- `set-scout-drift` (1 Case) — exit 0 UND stdout enthält `OFFLINE`
- `get` (1 Case, Negativtest) — entweder exit ≠ 0 ODER exit 0 mit `OFFLINE`-Marker (Reads dürfen den Cluster nicht stillschweigend überspringen)

> **Anmerkung zu `set-scout-drift`:** dieses Subcommand hat aktuell einen
> separaten Schema-Bug (`column "scout_drift" of relation "tickets" does not
> exist`). Der ist NICHT Teil von T001242 — der Test in dieser Datei
> schreibt das `OFFLINE`-Marker-Verhalten fest, der separate Schema-Bug
> bleibt im Cluster-Pfad sichtbar (außerhalb des OFFLINE-Modus). Diese
> Einschränkung wird in einem Kommentar im Test dokumentiert.

**Akzeptanzkriterium:**

- `tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan-ticket-sh-mishaps.bats` exit ≠ 0 auf dem Branch **vor** den Fixes (mind. 24 von 28 Cases rot)
- Gleicher Aufruf exit 0 nach Task 2 + 3 + 4
- `task test:changed` (Smart-Selection) erkennt die neue BATS-Datei und führt sie aus

---

## Aufgabe 2: `.agents/skills/dev-flow-plan/SKILL.md` — Step 3.7 subagent prompt gets the plan-lint hard-rules block

**Ziel:** Der Plan-Subagent-Prompt in Schritt 3.7 zählt die plan-lint
Hard Rules explizit auf, sodass der Subagent sie nicht erraten muss und der
erste Plan-Entwurf bereits `bash scripts/plan-lint.sh` PASS liefert.

**Dateien:**

- `.agents/skills/dev-flow-plan/SKILL.md` — erweitern (eine Hinzufügung in Schritt 3.7)

**Implementierung:**

In Schritt 3.7 nach dem `**Kontext-Injektion**`-Bullet-Block (vor dem
`**Auftrag:**`-Absatz) einen neuen Bullet einfügen:

```markdown
- **plan-lint Hard Rules (PFLICHT — vom Subagenten verbatim zu befolgen):**
  Lies vor dem Schreiben `scripts/plan-lint.sh` und stelle sicher, dass die
  tasks.md alle Hard-Pflichten erfüllt. Die folgenden Regeln sind die
  einzige Quelle der Wahrheit (Stand jetzt):
  - **F1 Frontmatter:** YAML-Frontmatter am Anfang mit den vier Pflicht-Keys
    `title`, `ticket_id`, `domains`, `status` (alle nicht-leer).
  - **F2 domains:** `domains:` ist eine non-empty YAML-Liste
    (`[a, b, …]`), kein leerer String und kein `[]`.
  - **STRUCT1 Plan-Shape:** Die Datei beginnt (nach Frontmatter) mit
    `# <slug> — Implementation Plan` als H1, gefolgt von einer H2-Sektion
    `## File Structure`, die die geänderten/neuen Dateien auflistet.
  - **STRUCT2 Failing-Test-Step:** Mindestens ein Task enthält einen
    rot→grün-Failing-Test-Step mit der wortwörtlichen Phrase
    `expected: FAIL` (regex tolerant: `expected:? *fail`).
  - **STRUCT3 Verify-Task:** Der letzte Task listet die drei mandatory
    Verify-Commands: `task test:changed`, `task freshness:regenerate`,
    `task freshness:check` (regex `task[[:space:]]+<cmd>`).
  - **P1 Placeholder-Verbot:** In Prosa (außerhalb von ```-Fences und
    `inline code`) dürfen die Tokens `TBD`, `TODO`, `FIXME`, `???`,
    `<ausfüllen>` und `similar to Task <N>` NICHT vorkommen.
```

**Akzeptanzkriterium:**

- `bash scripts/plan-lint.sh <some-tasks.md>` bleibt für bereits
  plan-lint-konforme Pläne PASS (kein Regress in bestehenden Plänen)
- `tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan-ticket-sh-mishaps.bats`
  Gruppe M1: 10 von 10 Cases PASS

---

## Aufgabe 3: `scripts/openspec.sh` — `cmd_propose` seeds a plan-lint-PASS tasks.md skeleton

**Ziel:** Der `openspec.sh propose`-Seeder schreibt eine `tasks.md`, die
**bereits** `bash scripts/plan-lint.sh` PASS liefert. Damit muss der
Plan-Autor (Task 3.7-Subagent) nicht mehr erraten, was plan-lint will — er
füllt nur noch den Body aus.

**Dateien:**

- `scripts/openspec.sh` — erweitern (eine Änderung in `cmd_propose`)

**Implementierung:**

In `cmd_propose` (Z. 27–50) den `printf` für `tasks.md` (Z. 40) durch ein
Here-Doc ersetzen, das das vollständige Skeleton schreibt. Der Default für
`domains` ist `[plan-authoring]` (eine nicht-leere Liste, die F2 erfüllt;
der Plan-Autor kann sie im Body anpassen). Skeleton-Inhalt:

```markdown
---
title: "<slug> — Implementation Plan"
ticket_id: <ticket>
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# <slug> — Implementation Plan

_Ticket: <ticket>_

## File Structure

```
<author fills this in — list of new/changed files>
```

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Add the BATS test that reproduces the
      bug. The test must FAIL on the current branch. Use the phrase
      `expected: FAIL` in the step body so plan-lint STRUCT2 picks it up.

```bash
# Example: run the BATS test the author will add in their first task
tests/unit/lib/bats-core/bin/bats tests/spec/<slug>.bats
# expected: FAIL (red — the fix is not yet implemented)
```

- [ ] **Fix-Step (GREEN).** Implement the fix. The BATS test from the
      previous step must now pass.

- [ ] **Final Verification.** Run the three mandatory CI gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
```

Der `cmd_propose`-Block ruft diesen Skeleton-Write auf (mit `cat <<EOF`),
bevor der `update-status planning` und `openspec-status-map` ausgeführt
werden.

> **Wichtig — keine Tab/Indent-Konflikte:** Das Skeleton wird mit
> `cat <<OUTER_EOF > "$dir/tasks.md"` geschrieben, damit keine Shell-
> Expansion in den Code-Fences passiert. Der bestehende `printf`-Pfad
> wird vollständig ersetzt.

**Akzeptanzkriterium:**

- `OPENSPEC_ROOT=$tmp TICKET_OFFLINE=1 bash scripts/openspec.sh propose demo --ticket T000001` schreibt eine `tasks.md`, die `bash scripts/plan-lint.sh` PASS liefert
- `tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan-ticket-sh-mishaps.bats` Gruppe M2: 8 von 8 Cases PASS
- Bestehende `openspec.sh apply` / `archive` / `validate`-Pfade bleiben unverändert (nur `propose` ändert sich)
- `bash scripts/openspec.sh validate` exit 0 (kein Regress auf anderen Changes)

---

## Aufgabe 4: `scripts/ticket.sh` — every cluster-write subcommand gets the `TICKET_OFFLINE=1` guard

**Ziel:** `scripts/ticket.sh` verhält sich konsistent zu `scripts/openspec.sh`:
in `TICKET_OFFLINE=1` überspringt es Cluster-Schreib-Operationen mit
`OFFLINE: skipped <op> for <id>` auf stdout und exit 0. Reads (`get`,
`get-attachments`, `list`, `get-injections`) bleiben im OFFLINE-Modus
laut — sie müssen den Cluster erreichen, sonst scheitert die Flow-Validation.

**Dateien:**

- `scripts/ticket.sh` — erweitern (Guard am Anfang jedes Cluster-Write-Subcommands)

**Betroffene Subcommands** (alle mit Cluster-Write über `_pgpod`/`_exec_sql`):

1. `cmd_archive_plan` (Z. 86) — schreibt in `tickets.ticket_plans`
2. `cmd_phase` (Z. 452) — schreibt in `tickets.factory_phase_events`
3. `cmd_set_touched_files` (Z. 241) — schreibt in `tickets.tickets.touched_files`
4. `cmd_set_scout_drift` (Z. 256) — schreibt in `tickets.tickets.scout_drift`
5. `cmd_set_pipeline_slot` (Z. 271) — schreibt in `tickets.tickets.pipeline_slot`
6. `cmd_release_slot` (Z. 286, falls vorhanden) — schreibt in `tickets.tickets.pipeline_slot`
7. `cmd_update_status` (in `scripts/vda/ticket/update-status.sh`) — schreibt in `tickets.tickets.status`
8. `cmd_add_comment` (in `scripts/vda/ticket/`, falls vorhanden) — schreibt in `tickets.ticket_comments`
9. `cmd_add_pr_link` — schreibt in `tickets.ticket_links`
10. `cmd_inject` (Z. 478) — schreibt in `tickets.ticket_injections`

**Implementierung:**

Eine kleine Hilfsfunktion oben in `scripts/ticket.sh` definieren (analog
zum `TICKET_OFFLINE`-Check in `scripts/openspec.sh`):

```bash
_ticket_offline_skip() {
  # Usage: _ticket_offline_skip <op> [args...]
  # Echoes the OFFLINE marker and returns 0 (skip the cluster call).
  if [[ "${TICKET_OFFLINE:-0}" == "1" ]]; then
    echo "OFFLINE: skipped $*"
    return 0
  fi
  return 1
}
```

In jedem Cluster-Write-Subcommand direkt **nach** der Argument-Validation
und **vor** dem ersten `_pgpod`-Aufruf einfügen:

```bash
if _ticket_offline_skip "<op-name>" "--id" "$id" …; then
  exit 0
fi
```

Reads (`cmd_get`, `cmd_get_attachments`, `cmd_list`, `cmd_get_injections`,
`cmd_retry_count`) bekommen **keinen** OFFLINE-Guard — sie sollen weiter
laut scheitern, wenn der Cluster nicht erreichbar ist, damit der
dev-flow-execute Read-Fallback (`|| true`) greift.

**Reihenfolge-Caveat:** Der Guard muss nach der `case "$1"`-Argument-
Validation stehen, damit `ticket.sh archive-plan --id …` ohne Plan-File
im OFFLINE-Modus nicht an der leeren-Plan-File-Prüfung (Z. 102–105)
scheitert, sondern am OFFLINE-Skip. Der bestehende Test
`ticket.sh archive-plan respects TICKET_OFFLINE=1` in der BATS-Datei
fordert exit 0 mit OFFLINE-Marker — die leere-Plan-File-Prüfung würde
sonst vorher mit exit 1 abbrechen. Daher: Argument-Parsing und
`-help`-/`-h`-Pfade bleiben wie gehabt, der `_ticket_offline_skip`-
Aufruf kommt **nach** `case … esac`, **vor** dem `_pgpod`-Call.

**Akzeptanzkriterium:**

- `TICKET_OFFLINE=1 scripts/ticket.sh archive-plan --id T000001 --slug foo --branch bar --plan-file /tmp/empty` exit 0 mit `OFFLINE: skipped archive-plan …` auf stdout
- `TICKET_OFFLINE=1 scripts/ticket.sh phase T000001 scout entered --driver devflow` exit 0 mit `OFFLINE: skipped phase …` auf stdout
- `TICKET_OFFLINE=1 scripts/ticket.sh set-touched-files --id T000001 --files a,b` exit 0 mit `OFFLINE: skipped …`
- `TICKET_OFFLINE=1 scripts/ticket.sh set-pipeline-slot --id T000001 --slot 1` exit 0 mit `OFFLINE: skipped …`
- `TICKET_OFFLINE=1 scripts/ticket.sh set-scout-drift --id T000001 --drift 0.5` exit 0 mit `OFFLINE: skipped …`
- `TICKET_OFFLINE=1 scripts/ticket.sh update-status --id T000001 --status in_progress` exit 0 mit `OFFLINE: skipped …`
- `TICKET_OFFLINE=1 scripts/ticket.sh add-comment --id T000001 --body 'x'` exit 0 mit `OFFLINE: skipped …`
- `TICKET_OFFLINE=1 scripts/ticket.sh add-pr-link --id T000001 --pr 1234` exit 0 mit `OFFLINE: skipped …`
- `TICKET_OFFLINE=1 scripts/ticket.sh inject --id T000001 --kind note --content 'x'` exit 0 mit `OFFLINE: skipped …`
- `TICKET_OFFLINE=1 scripts/ticket.sh get --id T000001` exit ≠ 0 ODER exit 0 mit `OFFLINE` (Reads bleiben Cluster-pflichtig)
- `tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan-ticket-sh-mishaps.bats` Gruppe M3: 10 von 10 Cases PASS
- `task test:changed` mit aktiviertem Cluster (Default-Modus, `TICKET_OFFLINE=0` oder unset) muss weiter funktionieren — keine Regression im Normalbetrieb

---

## Aufgabe 5: Final Verification

**Dateien:** keine neuen.

**Implementierung:**

```bash
# 1. Reproduce the failing tests in isolation (RED on this branch, GREEN after fix).
tests/unit/lib/bats-core/bin/bats tests/spec/dev-flow-plan-ticket-sh-mishaps.bats
# expected: FAIL on the branch pre-fix (24/28 red), PASS after Tasks 2–4

# 2. Sanity: the other BATS files touched by the change (openspec-workflow,
#    openspec-embedding) still pass — guards in ticket.sh do not regress the
#    existing cluster path.
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-workflow.bats
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding.bats

# 3. Static lint of the skill (the Step 3.7 prompt must still be parseable).
bash -n .agents/skills/dev-flow-plan/SKILL.md  # bash -n parses but exits 1 on
                                                # unclosed here-docs; SKILL.md
                                                # has none, so exit 0.
shellcheck -S warning scripts/ticket.sh scripts/openspec.sh || true

# 4. plan-lint smoke on a fresh open-spec change produced by the seeded
#    tasks.md (re-confirms Task 3 end-to-end).
OPENSPEC_ROOT="$(mktemp -d)" TICKET_OFFLINE=1 \
  bash scripts/openspec.sh propose smoke-t001242 --ticket T000000
bash scripts/plan-lint.sh "$OPENSPEC_ROOT/changes/smoke-t001242/tasks.md"
# expected: PASS (0 hard)

# 5. Smart-selection Test-Gate.
task test:changed

# 6. Freshness.
task freshness:regenerate
task freshness:check
```

**Akzeptanzkriterium:**

- Alle 28 Cases in der neuen BATS-Datei PASS
- `tests/spec/openspec-workflow.bats` + `tests/spec/openspec-embedding.bats` PASS (keine Regression)
- plan-lint Smoke-PASS für den frisch erzeugten `smoke-t001242`-Change
- `task test:changed` grün
- `task freshness:check` grün
- Git-Diff gegen `main` zeigt nur die erwarteten Dateien (kein Drift in `k3d/`, `docs-content-built/`, etc.)

---

## Implementierungsreihenfolge

1. Aufgabe 1 (BATS-Datei) — bereits im Plan-Pfad committed, FAIL auf diesem Branch
2. Aufgabe 2 (Skill-Prompt) — Documentation-only, eine Hinzufügung
3. Aufgabe 3 (`openspec.sh` Propose-Seed) — eine Funktion umschreiben
4. Aufgabe 4 (`ticket.sh` OFFLINE-Guards) — Guard in 9 Subcommands
5. Aufgabe 5 (Verifikation) — abschließend
