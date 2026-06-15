---
title: Grilling → Ticket: skill-weite Fähigkeit — Implementierungsplan
ticket_id: T000739
domains: [website, infra, db, ops, test]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Grilling → Ticket: skill-weite Fähigkeit — Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine wiederverwendbare „Grilling-Session an ein Ticket senden"-Fähigkeit für alle Skills bauen — neuer `ticket.sh grill` Subcommand, der per-Frage akkumulierend in die `grilling_answers` JSONB-Spalte auf `tickets.tickets` schreibt (forward-kompatibel mit dem T000737-Panel) und optional einen lesbaren Timeline-Kommentar erzeugt.

**Architecture:** Die gesamte `cmd_grill`-Logik lebt in einer neuen, eigenständigen Bash-Lib `scripts/lib/ticket-grill.sh` (Muster wie `scripts/lib/ticket-links.sh`), die `ticket.sh` per `source` einbindet. `ticket.sh` selbst ist auf 793 Zeilen gebaselined (Budget 0) → die einzigen Änderungen dort sind die `source`-Zeile, eine Dispatch-Case-Zeile und das Wort `grill` in der Hilfezeile; die +2 Netto-Zeilen werden durch Entfernen von 2 der 4 trailing Leerzeilen exakt ausgeglichen. Der Helper validiert deterministisch VOR jedem Cluster-Zugriff (Muster FA-SF-35/50), führt ein idempotentes `ADD COLUMN IF NOT EXISTS` aus und nutzt das Per-Frage-Merge-SQL aus der Spec.

**Tech Stack:** Bash (POSIX-ish, `set -euo pipefail`), PostgreSQL via `kubectl exec … psql` (`_pgpod`/`_exec_sql` aus `ticket.sh`), BATS (offline, kubectl gemockt), go-task.

---

## Quality-Gates — Vorab-Accounting (verbindlich)

Pro zu ändernder Datei: Ist-Zeilen (`wc -l`), wirksame Schwelle (Baseline oder Extension-Limit), Budget.

| Datei | Aktion | Ist | Wirksame Schwelle | Budget | Strategie |
|-------|--------|-----|-------------------|--------|-----------|
| `scripts/ticket.sh` | Modify | 793 | **Baseline 793** (`.sh` Limit 500, aber gebaselined) | **0** | **NET-ZERO**: +1 `source` +1 Dispatch-Case −2 trailing Leerzeilen. Hilfe-Wort `grill` inline (±0). |
| `scripts/lib/ticket-grill.sh` | Create | 0 | `.sh` Limit **500** (nicht-baselined) | ~380 frei | Ziel ~95–115 Zeilen → reichlich Reserve |
| `tests/unit/ticket-grill.bats` | Create | 0 | `.bats` Limit **300** (nicht-baselined) | ~230 frei | Ziel ~70 Zeilen |
| `.claude/skills/references/grilling-to-ticket.md` | Create | 0 | `.md` **nicht in S1-Limits** → kein S1-Gate | n/a | knapp halten |
| `.claude/skills/OVERVIEW.md` | Modify | 191 | `.md` kein S1-Gate | n/a | +~6 Zeilen |
| `.claude/skills/dev-flow-plan/SKILL.md` | Modify | 385 | `.md` kein S1-Gate | n/a | +~4 Zeilen |
| `.claude/skills/feature-intake/SKILL.md` | Modify | 867 | `.md` kein S1-Gate | n/a | +~4 Zeilen |
| `.claude/skills/dev-flow-execute/SKILL.md` | Modify | 630 | `.md` kein S1-Gate | n/a | +~4 Zeilen |
| `.claude/skills/operations-management/SKILL.md` | Modify | 225 | `.md` kein S1-Gate | n/a | +~4 Zeilen |
| `.claude/skills/dev-flow-batch/SKILL.md` | Modify | 248 | `.md` kein S1-Gate | n/a | +~4 Zeilen |
| `Taskfile.yml` | Modify | (gebaselined? siehe Task 7) | — | — | +2 Wiring-Zeilen für neue bats |
| `website/src/data/test-inventory.json` | Regenerate | — | generiert | — | via `task test:inventory` |

**S1-Hinweis (`.md` Dateien):** `.md` ist NICHT in `docs/code-quality/gates.yaml → s1.limits` aufgeführt → Markdown-Edits trippen kein Zeilenlimit. (Verifizierter Stand: limits enthalten nur `.astro/.ts/.svelte/.sh/.mjs/.mts/.py/.js/.jsx/.tsx/.cjs/.bash/.java/.php`.)

**S2 (Import-Zyklen):** `ticket-grill.sh` ist eine pure Lib — keine Rück-Imports, kein top-level Side-Effect außer der `cmd_grill`-Funktionsdefinition (exakt wie `ticket-links.sh`). Es nutzt `_pgpod`/`_exec_sql`, die zur Aufrufzeit (ticket.sh) im Scope sind.

**S3 (Hardcodierte Hostnamen):** KEINE `*.mentolder.de`/`*.korczewski.de`-Literale. Brand kommt ausschließlich via `--brand`/`BRAND`-Env (genau wie `cmd_create`). `ticket-grill.sh` enthält keine Domain-Strings.

**S4 (Orphans):** `ticket-grill.sh` wird von `ticket.sh` ge`source`d (Task 2) → nicht verwaist. `ticket-grill.bats` wird in `Taskfile.yml` (`test:unit` + eigene internal task) verdrahtet (Task 7) → nicht verwaist.

---

## Task 1: `scripts/lib/ticket-grill.sh` — `cmd_grill` mit Validierung + Antwort-Quellen→JSON

**Files:**
- Create: `scripts/lib/ticket-grill.sh`

Dies ist eine pure, ge`source`te Lib (kein eigener Shebang-Run, aber Shebang-Kommentar zur Konsistenz). Sie deklariert nur `cmd_grill` und eine private `_grill_answers_json`-Helper. Sie nutzt `_pgpod`/`_exec_sql`/`$NS`/`$CTX`/`$USER`/`$DB`, die aus `ticket.sh` stammen — wie `ticket-links.sh`.

- [ ] **Step 1: Lib-Datei anlegen**

Erstelle `scripts/lib/ticket-grill.sh` mit exakt folgendem Inhalt:

```bash
#!/usr/bin/env bash
# scripts/lib/ticket-grill.sh
# Pure helper sourced by ticket.sh — declares cmd_grill only.
# No top-level side effects, no back-imports. Uses _pgpod/_exec_sql/$NS/$CTX/$USER/$DB from ticket.sh.
#
# Writes a grilling Q/A session into tickets.tickets.grilling_answers (JSONB), per-question
# accumulating merge, forward-compatible with the T000737 GrillingAnswersPanel
# (shape: { <questionnaire-id>: { <questionId>: <answer> } }). Optionally posts a readable
# timeline comment (author 'grilling') unless --no-comment.

# Build a compact JSON object {"qid":"text",...} from repeated --answer qid=text pairs.
# Each pair is shell-quoted into a jq arg; jq guarantees valid JSON escaping.
_grill_answers_json() {
  local json='{}' pair k v
  for pair in "$@"; do
    k="${pair%%=*}"; v="${pair#*=}"
    if [[ "$pair" != *=* || -z "$k" ]]; then
      echo "ERROR: --answer expects <qid>=<text> (got '$pair')." >&2
      return 2
    fi
    json=$(jq -c --arg k "$k" --arg v "$v" '. + {($k): $v}' <<<"$json")
  done
  printf '%s' "$json"
}

cmd_grill() {
  local id="" questionnaire="coaching-sessions-v1" json="" answers_file="" no_comment="false"
  local -a answers=()
  while [[ $# -gt 0 ]]; do case "$1" in
      --id)            id="$2"; shift 2 ;;
      --questionnaire) questionnaire="$2"; shift 2 ;;
      --json)          json="$2"; shift 2 ;;
      --answers-file)  answers_file="$2"; shift 2 ;;
      --answer)        answers+=("$2"); shift 2 ;;
      --no-comment)    no_comment="true"; shift ;;
      --brand)         shift 2 ;;  # consumed pre-source by ticket.sh BRAND handling; ignore here
      *)               echo "Unknown grill option: $1" >&2; exit 2 ;;
    esac; done

  # --- Validate BEFORE _pgpod so bad-arg errors are deterministic w/o a cluster (FA-SF-35/50). ---
  if [[ -z "$id" ]]; then echo "ERROR: --id is required." >&2; exit 2; fi
  if [[ -z "$questionnaire" ]]; then echo "ERROR: --questionnaire must not be empty." >&2; exit 2; fi
  local sources=0
  [[ -n "$json" ]] && sources=$((sources+1))
  [[ -n "$answers_file" ]] && sources=$((sources+1))
  [[ ${#answers[@]} -gt 0 ]] && sources=$((sources+1))
  if [[ "$sources" -eq 0 ]]; then
    echo "ERROR: one answer source is required (--json | --answers-file | --answer qid=text ...)." >&2
    exit 2
  fi
  if [[ "$sources" -gt 1 ]]; then
    echo "ERROR: use exactly one of --json | --answers-file | --answer." >&2
    exit 2
  fi

  # --- Resolve the answers JSON for this questionnaire (still cluster-free). ---
  local answers_json=""
  if [[ -n "$json" ]]; then
    answers_json="$json"
  elif [[ -n "$answers_file" ]]; then
    if [[ ! -s "$answers_file" ]]; then echo "ERROR: answers file missing or empty: $answers_file" >&2; exit 2; fi
    answers_json=$(cat "$answers_file")
  else
    answers_json=$(_grill_answers_json "${answers[@]}") || exit $?
  fi
  # Fail closed on malformed JSON before touching the cluster.
  if ! jq -e . >/dev/null 2>&1 <<<"$answers_json"; then
    echo "ERROR: answers are not valid JSON: $answers_json" >&2; exit 2
  fi

  local pod; pod=$(_pgpod)

  # Idempotent self-protection: works independent of T000737 merge timing, same column/shape.
  _exec_sql "$pod" <<'EOF' >/dev/null
ALTER TABLE tickets.tickets ADD COLUMN IF NOT EXISTS grilling_answers JSONB;
EOF

  # Per-question accumulating merge (existing answers kept; same questionId overwritten).
  local affected
  affected=$(_exec_sql "$pod" -v ext_id="$id" -v qid="$questionnaire" -v answers="$answers_json" <<'EOF'
UPDATE tickets.tickets
   SET grilling_answers =
       COALESCE(grilling_answers, '{}'::jsonb)
       || jsonb_build_object(
            :'qid',
            COALESCE(grilling_answers -> :'qid', '{}'::jsonb) || :'answers'::jsonb
          )
 WHERE external_id = :'ext_id'
RETURNING 1;
EOF
)
  if [[ -z "$affected" ]]; then
    echo "ERROR: Ticket $id not found." >&2
    exit 1
  fi

  # Universal visibility: a readable Q/A timeline comment unless suppressed.
  if [[ "$no_comment" != "true" ]]; then
    local summary
    summary=$(jq -r --arg q "$questionnaire" \
      '"Grilling-Session (\($q)):\n" + (to_entries | map("- \(.key): \(.value)") | join("\n"))' \
      <<<"$answers_json")
    _exec_sql "$pod" -v ext_id="$id" -v body="$summary" <<'EOF' >/dev/null
INSERT INTO tickets.ticket_comments (ticket_id, author_label, body, visibility)
SELECT id, 'grilling', :'body', 'internal'
FROM tickets.tickets WHERE external_id = :'ext_id';
EOF
  fi

  echo "Grilling session ($questionnaire) saved to ticket $id"
}
```

- [ ] **Step 2: Zeilenzahl gegen das Budget prüfen**

Run: `wc -l scripts/lib/ticket-grill.sh`
Expected: ~110 Zeilen (deutlich unter dem `.sh`-Limit von 500 → kein S1-Risiko).

- [ ] **Step 3: Bash-Syntax verifizieren**

Run: `bash -n scripts/lib/ticket-grill.sh`
Expected: kein Output, Exit 0 (Datei ist syntaktisch valide, obwohl sie ge`source`t wird).

- [ ] **Step 4: Commit**

```bash
git add scripts/lib/ticket-grill.sh
git commit -m "feat(ticket): add ticket-grill lib with cmd_grill (validate-before-cluster, per-question merge) [T000739]"
```

---

## Task 2: `ticket.sh` net-zero verdrahten (source + dispatch + help)

**Files:**
- Modify: `scripts/ticket.sh` (Baseline 793, **Budget 0** → NET-ZERO Pflicht)

Drei additive Eingriffe (+2 Netto-Zeilen) werden durch das Entfernen von 2 der 4 trailing Leerzeilen (Z.791–794) exakt ausgeglichen. Zeilen-Accounting:

| Eingriff | Δ Zeilen |
|----------|----------|
| A: `source .../lib/ticket-grill.sh` nach der `ticket-links.sh`-Source-Zeile (Z.165) | **+1** |
| B: Dispatch-Case `grill) cmd_grill "$@" ;;` im `case` (~Z.788) | **+1** |
| C: Wort `grill` in der `Commands:`-Hilfezeile (Z.762) — **inline-Edit derselben Zeile** | **±0** |
| D: 2 der 4 trailing Leerzeilen am Dateiende entfernen (Z.792–794 → eine behalten) | **−2** |
| **Netto** | **0** → Datei bleibt bei 793, Baseline gehalten |

- [ ] **Step 1: Source-Zeile für die neue Lib hinzufügen (Eingriff A)**

Die bestehende `ticket-links.sh`-Source-Zeile (Z.165) ist das Muster. Direkt darunter die neue Source einfügen.

Vorher (Z.164–166):
```bash
}
source "$(dirname "${BASH_SOURCE[0]}")/lib/ticket-links.sh"
cmd_archive_plan() {
```

Nachher:
```bash
}
source "$(dirname "${BASH_SOURCE[0]}")/lib/ticket-links.sh"
source "$(dirname "${BASH_SOURCE[0]}")/lib/ticket-grill.sh"
cmd_archive_plan() {
```

(Δ **+1**)

- [ ] **Step 2: Dispatch-Case hinzufügen (Eingriff B)**

Vorher (im `case` bei `add-pr-link`, Z.770):
```bash
  add-pr-link)       cmd_add_pr_link "$@" ;;
  archive-plan)      cmd_archive_plan "$@" ;;
```

Nachher:
```bash
  add-pr-link)       cmd_add_pr_link "$@" ;;
  grill)             cmd_grill "$@" ;;
  archive-plan)      cmd_archive_plan "$@" ;;
```

(Δ **+1**)

- [ ] **Step 3: `grill` in die Commands-Hilfezeile aufnehmen (Eingriff C, inline ±0)**

Vorher (Z.762, eine lange Zeile):
```bash
  echo "Commands: create, update-status, add-comment, add-pr-link, archive-plan, get-attachments, get, set-touched-files, set-pipeline-slot, release-slot, touch, enqueue, stage-plan, retry-count, factory-control, dryrun-mark, dryrun-check, feature-flag, phase, inject, get-injections, plan-meta" >&2
```

Nachher (selbe Zeile, `grill` nach `add-pr-link` eingefügt — KEINE neue Zeile):
```bash
  echo "Commands: create, update-status, add-comment, add-pr-link, grill, archive-plan, get-attachments, get, set-touched-files, set-pipeline-slot, release-slot, touch, enqueue, stage-plan, retry-count, factory-control, dryrun-mark, dryrun-check, feature-flag, phase, inject, get-injections, plan-meta" >&2
```

(Δ **±0**)

- [ ] **Step 4: 2 trailing Leerzeilen entfernen (Eingriff D, −2)**

Das Dateiende hat 4 Leerzeilen nach `esac` (Z.790 `esac`, Z.791–794 leer; `wc -l` zählt sie). Entferne 2 davon, sodass `esac` von genau 2 Leerzeilen gefolgt wird (eine trennende + eine final-newline).

Run (im Worktree-Root):
```bash
printf '%s\n' "$(sed -e :a -e '/^\n*$/{$d;N;ba}' scripts/ticket.sh)" > scripts/ticket.sh.tmp
# Garantiere genau EINE trailing Leerzeile nach esac:
printf '\n' >> scripts/ticket.sh.tmp
mv scripts/ticket.sh.tmp scripts/ticket.sh
```

Alternativ manuell: die letzten Zeilen so lassen, dass `esac` + 1 Leerzeile + Datei-Newline = `wc -l` Netto −2 gegenüber Ist.

- [ ] **Step 5: Net-zero verifizieren (HARTES GATE)**

Run: `wc -l scripts/ticket.sh`
Expected: **793** (unverändert → Baseline gehalten, Budget 0 eingehalten).

Falls ≠ 793: trailing Leerzeilen so anpassen, dass es exakt 793 ergibt (Eingriffe A/B sind +2 fix, also müssen am Ende genau 2 Leerzeilen weniger stehen als im Original).

- [ ] **Step 6: Bash-Syntax + Dispatch-Smoke (offline, Validierung greift vor Cluster)**

Run:
```bash
bash -n scripts/ticket.sh && bash scripts/ticket.sh grill 2>&1; echo "exit=$?"
```
Expected: `ERROR: --id is required.` und `exit=2` (deterministisch ohne Cluster — beweist source+dispatch+validation greifen).

- [ ] **Step 7: Commit**

```bash
git add scripts/ticket.sh
git commit -m "feat(ticket): wire grill subcommand into ticket.sh dispatch (net-zero) [T000739]"
```

---

## Task 3: BATS-Unit-Tests für `cmd_grill` (offline, kubectl gemockt)

**Files:**
- Create: `tests/unit/ticket-grill.bats`

Vorbild: `tests/unit/ticket-add-pr-link.bats` (kubectl-Mock schreibt empfangenes SQL nach `$CAP`, gibt fake-pod + fake-row zurück).

- [ ] **Step 1: Failing test schreiben**

Erstelle `tests/unit/ticket-grill.bats` mit exakt folgendem Inhalt:

```bash
#!/usr/bin/env bats
# Offline test: `ticket.sh grill` — arg validation (Exit 2 w/o cluster), JSON build
# from --answer pairs, and the per-question merge SQL shape (ADD COLUMN IF NOT EXISTS +
# COALESCE(...) || jsonb_build_object(...)). kubectl is mocked; no live cluster.

setup() {
  TICKET="$BATS_TEST_DIRNAME/../../scripts/ticket.sh"
  MOCKDIR="$(mktemp -d)"
  CAP="$MOCKDIR/captured.sql"
  cat > "$MOCKDIR/kubectl" <<EOF
#!/usr/bin/env bash
if [[ "\$*" == *"get pod"* ]]; then echo "pod/shared-db-0"; exit 0; fi
if [[ "\$*" == *"exec"* ]]; then cat >> "$CAP"; echo "1"; exit 0; fi
exit 0
EOF
  chmod +x "$MOCKDIR/kubectl"
  PATH="$MOCKDIR:$PATH"
  export PATH CAP
}

teardown() { rm -rf "$MOCKDIR"; }

@test "grill requires --id (deterministic exit 2 without a cluster)" {
  run bash "$TICKET" grill --answer q1=foo
  [ "$status" -eq 2 ]
  [[ "$output" == *"--id is required"* ]]
}

@test "grill requires an answer source" {
  run bash "$TICKET" grill --id T000123
  [ "$status" -eq 2 ]
  [[ "$output" == *"one answer source is required"* ]]
}

@test "grill rejects more than one answer source" {
  run bash "$TICKET" grill --id T000123 --json '{"q1":"a"}' --answer q2=b
  [ "$status" -eq 2 ]
  [[ "$output" == *"exactly one of"* ]]
}

@test "grill rejects a malformed --answer pair" {
  run bash "$TICKET" grill --id T000123 --answer noequalshere
  [ "$status" -eq 2 ]
  [[ "$output" == *"<qid>=<text>"* ]]
}

@test "grill builds {\"q1\":\"foo\",\"q2\":\"bar\"} from repeated --answer" {
  run bash "$TICKET" grill --id T000123 --answer q1=foo --answer q2=bar
  [ "$status" -eq 0 ]
  # The answers JSON is bound as a psql -v param echoed into the captured SQL invocation;
  # assert the merge target carries both pairs.
  grep -q '"q1":"foo"' "$CAP"
  grep -q '"q2":"bar"' "$CAP"
}

@test "grill emits idempotent ADD COLUMN + per-question merge SQL" {
  run bash "$TICKET" grill --id T000123 --answer q1=foo
  [ "$status" -eq 0 ]
  grep -q "ADD COLUMN IF NOT EXISTS grilling_answers JSONB" "$CAP"
  grep -q "UPDATE tickets.tickets" "$CAP"
  grep -q "jsonb_build_object" "$CAP"
  grep -q "COALESCE(grilling_answers" "$CAP"
}

@test "grill --no-comment skips the timeline comment insert" {
  run bash "$TICKET" grill --id T000123 --answer q1=foo --no-comment
  [ "$status" -eq 0 ]
  ! grep -q "INSERT INTO tickets.ticket_comments" "$CAP"
}

@test "grill (default) writes a grilling-authored timeline comment" {
  run bash "$TICKET" grill --id T000123 --answer q1=foo
  [ "$status" -eq 0 ]
  grep -q "INSERT INTO tickets.ticket_comments" "$CAP"
  grep -q "'grilling'" "$CAP"
}
```

- [ ] **Step 2: Test laufen lassen — muss zunächst grün sein (Implementierung existiert aus Task 1/2)**

> Hinweis: Da `cmd_grill` bereits in Task 1/2 implementiert+verdrahtet wurde, ist dies kein klassisches Red→Green. Um die Tests dennoch als echte Wächter zu validieren, prüfe in Step 3 die Failure-Sensitivität.

Run:
```bash
./tests/unit/lib/bats-core/bin/bats tests/unit/ticket-grill.bats
```
Expected: alle 8 Tests PASS.

- [ ] **Step 3: Failure-Sensitivität beweisen (Test ist kein No-Op)**

Run (temporär die Merge-SQL kaputtmachen und prüfen, dass der Test rot wird):
```bash
sed -i.bak 's/jsonb_build_object/XX_broken_XX/' scripts/lib/ticket-grill.sh
./tests/unit/lib/bats-core/bin/bats tests/unit/ticket-grill.bats || echo "EXPECTED-FAIL OK"
mv scripts/lib/ticket-grill.sh.bak scripts/lib/ticket-grill.sh
```
Expected: der `jsonb_build_object`-Test schlägt fehl → `EXPECTED-FAIL OK`. Danach Datei wiederhergestellt.

- [ ] **Step 4: Verifizieren, dass die Wiederherstellung sauber ist**

Run: `git diff --stat scripts/lib/ticket-grill.sh`
Expected: leer (keine Reste vom Sensitivitäts-Test).

- [ ] **Step 5: Commit**

```bash
git add tests/unit/ticket-grill.bats
git commit -m "test(ticket): offline BATS for cmd_grill (validation, JSON build, merge SQL) [T000739]"
```

---

## Task 4: BATS in `Taskfile.yml` verdrahten (S4 — kein Orphan)

**Files:**
- Modify: `Taskfile.yml`

- [ ] **Step 1: Prüfen, ob `Taskfile.yml` gebaselined ist (S1)**

Run:
```bash
jq -r '."S1:Taskfile.yml".metric // "nicht-baselined"' docs/code-quality/baseline.json
```
- `nicht-baselined` → `.yml` ist ohnehin nicht in den S1-Limits (nur Code-Extensions) → kein Budget-Problem, +2 Zeilen unkritisch.
- (Erwartung: kein S1-Eintrag; `.yml`/`.yaml` werden von S1 nicht erfasst.)

- [ ] **Step 2: Aufruf in die `test:unit`-Liste einhängen**

Vorher (Z.268, im `test:unit` cmds-Block):
```yaml
      - task: test:unit:ticket-add-pr-link
      - task: test:unit:worktree-create
```

Nachher:
```yaml
      - task: test:unit:ticket-add-pr-link
      - task: test:unit:ticket-grill
      - task: test:unit:worktree-create
```

- [ ] **Step 3: Die neue internal task definieren**

Vorbild ist `test:unit:ticket-add-pr-link` (Z.428).

Vorher (Z.428–431):
```yaml
  test:unit:ticket-add-pr-link:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/ticket-add-pr-link.bats
```

Nachher (neue Task direkt darunter ergänzen):
```yaml
  test:unit:ticket-add-pr-link:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/ticket-add-pr-link.bats

  test:unit:ticket-grill:
    internal: true
    cmds:
      - ./tests/unit/lib/bats-core/bin/bats tests/unit/ticket-grill.bats
```

- [ ] **Step 4: Verifizieren, dass die Task auflösbar ist und läuft**

Run:
```bash
task test:unit:ticket-grill
```
Expected: 8 Tests PASS.

- [ ] **Step 5: Commit**

```bash
git add Taskfile.yml
git commit -m "test(ticket): wire ticket-grill.bats into task test:unit [T000739]"
```

---

## Task 5: Geteilte Referenz `grilling-to-ticket.md`

**Files:**
- Create: `.claude/skills/references/grilling-to-ticket.md`

- [ ] **Step 1: Referenzdatei anlegen**

Erstelle `.claude/skills/references/grilling-to-ticket.md` mit exakt folgendem Inhalt:

````markdown
# Grilling → Ticket — geteilte Fähigkeit

Eine *Grilling-Session* (strukturiertes Q/A-Interview — Coaching-Fragebogen, Deep-Grilling
vor dem Planen, Klärungsrunde, Incident-Befragung) **an ein bestehendes Ticket senden**.
Das Wissen landet in der `grilling_answers` JSONB-Spalte auf `tickets.tickets` und (sofern
nicht unterdrückt) zusätzlich als lesbarer Timeline-Kommentar.

## Wann grillen

- **Klärung statt Raten:** Wenn eine offene Frage nur der Mensch beantworten kann (Scope,
  Akzeptanzkriterien, Design-Präferenz), grillen statt annehmen.
- **Persistenz statt flüchtig:** Antworten gehören ans Ticket, nicht nur in den Chat —
  so sind sie für Factory/dev-flow-execute/Panel wieder abrufbar.

## Aufruf

```bash
scripts/ticket.sh grill --id <external_id> \
  [--questionnaire <qid>] \          # default: coaching-sessions-v1
  ( --json '{"q1":"...","q2":"..."}' \
  | --answers-file <pfad.json> \
  | --answer q1=text --answer q2=text ... ) \
  [--no-comment] \
  [--brand <mentolder|korczewski>]
```

**Semantik:**
- **Per-Frage-Merge** (akkumulierend, wie das Panel-Auto-Save): bestehende Antworten bleiben,
  gleiche `questionId` wird überschrieben.
- **Idempotent:** legt die Spalte bei Bedarf selbst an (`ADD COLUMN IF NOT EXISTS`) → funktioniert
  unabhängig vom Merge-Zeitpunkt des T000737-Panels, bleibt aber form-identisch.
- **Validierung vor Cluster-Zugriff:** fehlende `--id` oder Antwort-Quelle → Exit 2 ohne kubectl.
  Ticket nicht gefunden → Exit 1.
- **Brand:** via `--brand` oder `BRAND`-Env (mentolder=`workspace`, korczewski=`workspace-korczewski`).

## Strukturiert vs. ad-hoc

- **Strukturiert** (`--questionnaire coaching-sessions-v1`, registriert in
  `website/src/lib/tickets/grilling.ts`): rendert nach dem T000737-Merge direkt im
  `GrillingAnswersPanel`.
- **Ad-hoc** (eigener Fragebogen-Slug, nicht registriert): wird gespeichert, aber vom Panel
  (das nur bekannte `QUESTIONNAIRES` rendert) **nicht** angezeigt → hier ist der
  Timeline-Kommentar die universelle Sichtbarkeit. Ein generischer Panel-Renderer für
  unbekannte Fragebögen ist ein Folge-Ticket (kein Blocker).

## Beispiele

Ad-hoc-Klärung an ein Planungsbüro-Ticket:
```bash
scripts/ticket.sh grill --id T000812 \
  --answer scope="nur mentolder, korczewski später" \
  --answer deadline="kein Hard-Date"
```

Strukturierter Coaching-Fragebogen aus Datei (forward-kompatibel mit dem Panel):
```bash
scripts/ticket.sh grill --id T000812 --questionnaire coaching-sessions-v1 \
  --answers-file /tmp/coaching-answers.json
```
````

- [ ] **Step 2: Commit**

```bash
git add .claude/skills/references/grilling-to-ticket.md
git commit -m "docs(skills): add shared grilling-to-ticket reference [T000739]"
```

---

## Task 6: Pointer im Schicht-Kontrakt + gezielte Skill-Verdrahtung

**Files:**
- Modify: `.claude/skills/OVERVIEW.md`
- Modify: `.claude/skills/dev-flow-plan/SKILL.md`
- Modify: `.claude/skills/feature-intake/SKILL.md`
- Modify: `.claude/skills/dev-flow-execute/SKILL.md`
- Modify: `.claude/skills/operations-management/SKILL.md`
- Modify: `.claude/skills/dev-flow-batch/SKILL.md`

Alle Edits sind knapp und nur additive Pointer auf die Referenz aus Task 5. `.md` ist nicht S1-relevant.

- [ ] **Step 1: OVERVIEW.md — Cross-Cutting-Abschnitt**

Lies zuerst das Dateiende, um eine saubere Einfügestelle nach dem letzten Abschnitt zu finden:
```bash
tail -n 20 .claude/skills/OVERVIEW.md
```

Hänge am Dateiende folgenden Abschnitt an:
```markdown

## Cross-Cutting: Grilling → Ticket

Jede Grilling-Session (Q/A-Interview: Coaching, Deep-Grilling, Klärung, Incident-Befragung)
lässt sich mit **einem** geteilten Helper an ein Ticket senden:
`scripts/ticket.sh grill --id <ext-id> (--json | --answers-file | --answer qid=text ...)`.
Schreibt akkumulierend in `tickets.tickets.grilling_answers` (forward-kompatibel mit dem
T000737-Panel) + optionalem Timeline-Kommentar. Vollständige How-to:
`.claude/skills/references/grilling-to-ticket.md`. Skill-Autoren: NICHT pro SKILL.md
neu erfinden — die Referenz verlinken.
```

- [ ] **Step 2: dev-flow-plan/SKILL.md — Schritt −3 Hinweis**

Finde den Deep-Grilling-/Ticket-Erstellungs-Kontext:
```bash
grep -n "Grilling\|grilling\|Deep-Grilling\|description" .claude/skills/dev-flow-plan/SKILL.md | head
```

Füge in der Nähe der Grilling-Ticket-Erstellung (Schritt −3) einen knappen Hinweis ein:
```markdown

> **Strukturierte Q/A persistieren:** Nach dem Deep-Grilling die Antworten zusätzlich
> ans Ticket senden — `scripts/ticket.sh grill --id <ext-id> --answer <qid>=<text> …`
> (akkumulierend, erscheint später im T000737-Panel). Siehe
> `.claude/skills/references/grilling-to-ticket.md`.
```

- [ ] **Step 3: feature-intake/SKILL.md — GekkoMode/Klärung**

```bash
grep -n "Kommentar\|comment\|GekkoMode\|Klärung\|grill" .claude/skills/feature-intake/SKILL.md | head
```

Füge dort, wo Grilling-Antworten heute als Kommentar abgelegt werden, hinzu:
```markdown

> **Zusätzlich strukturiert ablegen:** Neben dem Klärungs-Kommentar die Antworten mit
> `scripts/ticket.sh grill --id <ext-id> …` ans Ticket senden (akkumulierend, panel-fähig).
> Siehe `.claude/skills/references/grilling-to-ticket.md`.
```

- [ ] **Step 4: dev-flow-execute/SKILL.md — Blockade/Ambiguität**

```bash
grep -n "Blockade\|blocked\|Ambigu\|Frage\|grill" .claude/skills/dev-flow-execute/SKILL.md | head
```

Füge im Blockade-/Ambiguitäts-Kontext hinzu:
```markdown

> **Mitten in der Umsetzung blockiert?** Nutzer grillen und die Antworten ans Ticket
> hängen: `scripts/ticket.sh grill --id <ext-id> --answer <qid>=<text> …`. Siehe
> `.claude/skills/references/grilling-to-ticket.md`.
```

- [ ] **Step 5: operations-management/SKILL.md — Triage/Incident**

```bash
grep -n "Triage\|Incident\|Befragung\|grill\|Kommentar" .claude/skills/operations-management/SKILL.md | head
```

Füge im Triage-/Incident-Kontext hinzu:
```markdown

> **Incident-Befragung ans Ticket:** Antworten aus der Triage/Befragung mit
> `scripts/ticket.sh grill --id <ext-id> …` persistieren. Siehe
> `.claude/skills/references/grilling-to-ticket.md`.
```

- [ ] **Step 6: dev-flow-batch/SKILL.md — Batch-Klärung**

```bash
grep -n "Batch\|mehrere Tickets\|Klärung\|grill" .claude/skills/dev-flow-batch/SKILL.md | head
```

Füge im Batch-Kontext hinzu:
```markdown

> **Batch-Klärung:** Pro Ticket die geklärten Q/A mit `scripts/ticket.sh grill --id <ext-id> …`
> ablegen, bevor die Specs/Pläne generiert werden. Siehe
> `.claude/skills/references/grilling-to-ticket.md`.
```

- [ ] **Step 7: Sanity — alle Pointer verweisen auf die existierende Referenz**

Run:
```bash
grep -rl "references/grilling-to-ticket.md" .claude/skills/ | sort
test -f .claude/skills/references/grilling-to-ticket.md && echo "REF OK"
```
Expected: alle 6 modifizierten Dateien + `REF OK`.

- [ ] **Step 8: Commit**

```bash
git add .claude/skills/OVERVIEW.md \
        .claude/skills/dev-flow-plan/SKILL.md \
        .claude/skills/feature-intake/SKILL.md \
        .claude/skills/dev-flow-execute/SKILL.md \
        .claude/skills/operations-management/SKILL.md \
        .claude/skills/dev-flow-batch/SKILL.md
git commit -m "docs(skills): wire grilling-to-ticket pointers into OVERVIEW + 5 skills [T000739]"
```

---

## Task 7: Finale Verifikation (CI-Äquivalent + generierte Artefakte)

**Files:**
- Regenerate/Commit: `website/src/data/test-inventory.json`, ggf. weitere freshness-Artefakte.

- [ ] **Step 1: Test-Inventar nach Test-Änderung regenerieren**

Run:
```bash
task test:inventory
```
Expected: aktualisiert `website/src/data/test-inventory.json` (neue `ticket-grill.bats` enthalten).

- [ ] **Step 2: Offline-Gesamtsuite**

Run:
```bash
task test:all
```
Expected: grün; insbesondere die neue `test:unit:ticket-grill` läuft mit (8 PASS) und `test:code-quality`/S1-Ratchet meckert nicht über `ticket.sh` (793 unverändert).

- [ ] **Step 3: Generierte Artefakte aktualisieren**

Run:
```bash
task freshness:regenerate
```
Expected: regeneriert test-inventory/repo-index/etc. — bei Folge-Diffs unter `docs/generated/**` mit `git checkout --ours` umgehen, falls Konflikte beim späteren Rebase (siehe CLAUDE.md „Generated artifacts are conflict magnets").

- [ ] **Step 4: CI-Äquivalent (Freshness + quality:check S1–S4 + Baseline-Assertion)**

Run:
```bash
task freshness:check
```
Expected: grün. Besonders: kein Baseline-Wachstum (`ticket.sh` exakt 793), keine neue/gewachsene gebaselinete Datei, keine Orphan-/Zyklus-/Hostname-Violation.

- [ ] **Step 5: Falls freshness Artefakte geändert hat — committen**

Run:
```bash
git add -A website/src/data/test-inventory.json docs/generated 2>/dev/null || true
git status --short
```
Dann nur die tatsächlich geänderten generierten Artefakte committen:
```bash
git add website/src/data/test-inventory.json
# plus weitere von freshness:regenerate geänderte Dateien laut git status
git commit -m "chore: regenerate test-inventory + freshness artifacts for grill subcommand [T000739]"
```

- [ ] **Step 6: Endkontrolle — net-zero + Suite final grün**

Run:
```bash
wc -l scripts/ticket.sh && task test:all && task freshness:check && echo "ALL GREEN"
```
Expected: `793`, beide Tasks grün, `ALL GREEN`.

---

## Self-Review (vom Plan-Autor durchgeführt)

**1. Spec coverage:**
- `ticket.sh grill`-Schnittstelle (alle Flags) → Task 1 ✅
- Validierung vor `_pgpod` (Exit 2 ohne Cluster) → Task 1 Step 1 + Task 3 Tests ✅
- Idempotentes `ADD COLUMN IF NOT EXISTS` zuerst → Task 1 (genau das SQL der Spec) ✅
- Per-Frage-Merge-UPDATE (Spec-SQL wörtlich) → Task 1 ✅
- Optionaler Timeline-Kommentar (author `grilling`), außer `--no-comment` → Task 1 + Task 3 Tests ✅
- Exit 1 wenn Ticket nicht gefunden → Task 1 (`RETURNING 1` + Empty-Check) ✅
- net-zero `ticket.sh` (source + dispatch + help, 2 Collapses) → Task 2 mit Zeilen-Accounting ✅
- `ticket-grill.sh` unter Limit → Task 1 Step 2 (~110 < 500) ✅
- S2/S3/S4 → Quality-Gates-Block + Task 4 (Wiring) ✅
- BATS offline-sicher (Validierung, JSON-Aufbau, Merge-SQL-Form) → Task 3 ✅
- Geteilte Referenz + OVERVIEW-Pointer + 5 Skill-Edits → Task 5 + Task 6 ✅
- Finaler Verifikations-Task (`test:all`, `freshness:regenerate`, `freshness:check`, `test:inventory`) → Task 7 ✅
- Out-of-Scope (T000737-Panel/-API, generischer Renderer, Brand-Fan-out der Migration) → nicht berührt ✅

**2. Placeholder scan:** Keine TBD/TODO/„handle edge cases"; jeder Code-Step enthält vollständigen Code; jeder Edit hat Vorher/Nachher. ✅

**3. Type consistency:** `cmd_grill`/`_grill_answers_json` durchgängig gleich benannt; SQL-Spalten/-Tabellen (`grilling_answers`, `tickets.ticket_comments`, author `grilling`) konsistent zwischen Task 1 und Task 3. ✅
