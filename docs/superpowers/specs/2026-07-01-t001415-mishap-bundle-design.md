---
ticket_id: T001415
plan_ref: openspec/changes/t001415-mishap-bundle-status-lifecycle/tasks.md
date: 2026-07-01
status: approved
---

# T001415 — Mishap-Bundle: agent-lock dead-PID + dev-flow-execute CONFLICTING + tickets status-lifecycle auto-close

## Kontext

T001415 ist ein `mishap-tracker`-Aggregat-Ticket mit drei unabhängigen, aber thematisch
verwandten Findings aus **derselben Sitzung** (2026-07-01 ticket-ops-Lauf). Alle drei sitzen in
der dev-flow CI/Merge/Lock-Reliability-Kette und müssen zusammen in einem Plan / einer PR
gefixt werden, weil:

- Sie teilen sich Ticket-ID, Branch und Kontext (Mishap-Bundle-Ticket ist bereits so angelegt).
- **Mishap 3 ist der Headline-Fix** (systemisches Auto-Close-Defizit mit 3 unabhängigen
  beobachteten Vorfällen T001371/T001412/T001414 — alle drei in dieser Sitzung manuell
  nachgeschlossen).
- Mishaps 1 + 2 sind in derselben Code-Pfad-Kette (CI/Merge/Lock) und teilen sich
  Test-Frameworks und Commit-Range.

Scope: **ein Plan, drei Tasks** — je Finding ein in sich abgeschlossener Task mit eigenem
failing Test. Es gibt **kein** zusätzliches Lastenheft/PRD — die Mishaps sind klar dokumentiert
und der Root-Cause ist verifizierbar.

## Finding 1 — `scripts/agent-lock.sh`: Stale Lock nach totem Agent-Prozess

### Root-Cause (verifiziert)

`scripts/agent-lock.sh:126` schreibt `owner_pid: "$$"` in den Lock-JSON, aber
`scripts/agent-lock.sh:87-105` `_reapable()` **prüft das PID-Feld nie**. Die einzigen
Reap-Trigger sind:

1. `worktree fehlt` (Verzeichnis existiert nicht) — funktioniert.
2. `_sid_alive` über `pgrep -s "$sid"` (numerischer SID-Pfad) — funktioniert, **außer** der
   Owner nutzt `CLAUDE_SESSION_ID` (harness-provided, non-numeric), in welchem Fall
   `_sid_alive` in `_reapable:48` per `case "$1" in *[!0-9]*) return 0;;` **immer "alive"
   zurückgibt**.
3. `heartbeat_at` älter als `AGENT_LOCK_TTL=1800` — funktioniert, aber **30 min Verzögerung**.

Wenn ein Agent mit `CLAUDE_SESSION_ID` crasht, ohne dass der Heartbeat nochmal
geschrieben wird, bleibt der Lock bis zu 30 minuten aktiv, obwohl `ps -p $owner_pid` sofort
"not running" zurückgeben würde. Der konkrete Vorfall: T001382 (PR #2424 gemergt, Worktree
`agent-a67140173b9f80e8d`, Lock mit `pid 880037`) — `ps -p 880037` war tot, aber der Lock
blieb `live` (in der Live-Sitzung am 2026-07-01 reproduziert, dann manuell mit
`git worktree unlock` entsperrt).

### Fix-Ansatz

1. **PID-Aliveness-Check in `_reapable()`:** vor `worktree-missing` einen
   `owner_pid`-Check ergänzen. Ist die im Lock gespeicherte PID nicht mehr in `ps` (kill -0
   schlägt fehl) und das Lock ist älter als `AGENT_LOCK_GRACE` Sekunden (verhindert false
   positives, falls der Bash-Aufruf in einer neuen Subshell landet), als `pid-dead` reapen.
2. **Reihenfolge:** `pid-dead` > `worktree-missing` > `sid-dead` > `heartbeat-ttl`. Jeder
   Branch muss seinen eigenen `_reap_log` Reason schreiben (analog zum bestehenden
   `sid-dead`/`heartbeat-ttl`/`worktree-missing` Muster).
3. **Grace-Period-Schutz:** damit `pid-dead` nicht versehentlich einen frisch erstellten
   Claim reapt, dessen Subprozess bereits terminiert hat (Test-Subshell-Szenarien), die
   `AGENT_LOCK_GRACE=120s` Härtung wiederverwenden (existiert bereits in
   `scripts/agent-lock.sh:20`).
4. **BATS-Test:** simuliert einen Lock mit `owner_pid=99999` (garantiert tot), älter als
   `AGENT_LOCK_GRACE` → `reap` muss ihn droppen und in `.reap.log` muss `pid-dead` stehen.

### Betroffene Datei

`scripts/agent-lock.sh` (`_reapable()`, ggf. neuer Helper `_pid_alive()`).

### Edge Cases

- `$$` in einer Subshell ist eine andere PID als in der Parent-Shell — der Grace-Schutz
  fängt das ab.
- `owner_pid` könnte leer sein (alte Locks) → als "nicht reapable" behandeln (fail-open,
  Heartbeat-TTL greift dann als Fallback).
- PIDs können recycled werden — daher kombinieren wir PID-Check mit `created_at`-Alter.

## Finding 2 — `dev-flow-execute`: CONFLICTING PR hängt ohne klare "rebase needed" Diagnose

### Root-Cause (verifiziert)

`scripts/devflow-ci-watch.sh:17-37` (T001408-Fix) prüft nur `DIRTY` (Branch hinter main,
kein Konflikt) und rebased automatisch. `CONFLICTING` (echte Merge-Konflikte) ist **nicht
abgedeckt** — der Implementer-Agent pollt weiter, sieht leeren `statusCheckRollup`, und
das Skript hängt entweder in der `MAX_CI_ATTEMPTS`-Schleife oder der Agent interpretiert
"kein CI läuft" als "alles gut" und versucht Auto-Merge (was GitHub wegen
`mergeable=CONFLICTING` ablehnt).

Konkret betroffen: PR #2433 (T001371), `mergeStateStatus=DIRTY` initial, später
`mergeable=CONFLICTING` — der Agent bemerkte es nicht.

### Fix-Ansatz

1. **Preflight-Erweiterung in `scripts/devflow-ci-watch.sh`:** nach dem
   `mergeStateStatus`-Check zusätzlich `gh pr view --json mergeable` abfragen. Bei
   `CONFLICTING`: sofort Exit 4 mit klarer Meldung "PR has merge conflicts — rebase
   manually or via worktree"; **kein** Auto-Force (Sicherheit: ein Auto-Resolve könnte
   semantisch falsche Zusammenführungen erzeugen).
2. **Rebase-Retry-Hook in `dev-flow-execute/SKILL.md`:** der Schritt-5.5-Prosa
   dokumentiert den Exit-4 als "manuell rebasen + force-push, dann `devflow-ci-watch.sh`
   erneut aufrufen". Der Implementer-Subagent kann das selbst ausführen (gleicher Worktree,
   gleicher Branch).
3. **BATS-Test:** ein Stub-`gh`-Skript simuliert `mergeable=CONFLICTING` und
   `mergeStateStatus=UNKNOWN` → `devflow-ci-watch.sh` muss Exit 4 zurückgeben und die
   Meldung muss "conflict" enthalten.

### Betroffene Dateien

- `scripts/devflow-ci-watch.sh` (neuer Preflight-Zweig)
- `.claude/skills/dev-flow-execute/SKILL.md` (Doku der manuellen Rebase-Recovery)

### Edge Cases

- `mergeable=UNKNOWN` (GitHub hat noch nicht evaluiert) → **nicht** als CONFLICTING
  behandeln, einfach normal in die Poll-Schleife eintreten.
- Bereits gemergte PRs (`state=MERGED`) → sofort Exit 0 (CI ist irrelevant, Auto-Merge ist
  schon passiert).

## Finding 3 — HEADLINE: `tickets/status-lifecycle` Auto-Close greift nicht

### Root-Cause (verifiziert)

`scripts/factory/pipeline.js:646-651` (Deploy-Phase) ist der **einzige** Auto-Close-Pfad.
Er feuert nur, wenn der Factory-Pipeline-Agent Schritt 4 (`gh pr merge --auto --squash
--delete-branch`) **und** Schritt 5 (`ticket.sh update-status --status done --resolution
shipped`) beide vollständig durchläuft. In dieser Sitzung sind **drei** PRs
zwar gemergt worden, aber `update-status` lief nicht:

- T001371 (PR #2433, merged 18:45:55Z) — ticket-ops hat manuell gemergt, kein
  Factory-Pipeline-Lauf
- T001412 (PR #2434, merged 18:50:43Z) — gleiches Muster
- T001414 (PR #2435, merged 18:53:39Z) — gleiches Muster

Alle drei standen auf `triage` oder `awaiting_deploy` und mussten manuell via
`mcp__ticket-mcp__transition_status` auf `done` gesetzt werden.

Es gibt **keine** andere Stelle im Codebase, die `update-status --status done` für
gemergte PRs aufruft. `scripts/factory/auto-enqueue.sh:47-56` macht nur
`plan_staged → backlog` (kein Merge-Bezug). `wakeup.sh` triggert nur den
Dispatcher-Tick. **Es gibt keinen Poll/Worker/Webhook, der `gh pr list --state merged` mit
`[T000XXX]`-Tags scannt und die Tickets transitioned.**

### Fix-Optionen (drei evaluiert)

| Option | Aufwand | Risiko | Eignung |
|---|---|---|---|
| (a) **Post-merge Webhook** (GitHub Action `pull_request closed`) | Mittel (neuer GH-Workflow + Endpoint) | Hoch (Endpoint-Security, Replay-Schutz) | Over-engineered für ein 3-Vorfälle-pro-Sitzung-Defizit |
| (b) **Factory Poll** (`wakeup.sh` ruft neuen `auto-close-merged.sh` der `gh pr list --state merged --limit 30` scannt, `[T\d{6}]` extrahiert, Tickets transitioned) | Niedrig (neues Skript, ein Hook in `wakeup.sh`) | Niedrig (readonly API-Call, idempotent) | **EMPFOHLEN** — passt zum bestehenden Factory-Rhythmus, kein neuer Infra-Stack |
| (c) **Postgres-Trigger** auf `tickets.tickets` (status=in_progress, pr_number set, but external merge state unknown) | Hoch (muss Merge-State außerhalb der DB kennen) | Hoch (Trigger kann nicht wissen, ob PR gemergt ist ohne GitHub-Call) | Verworfen — nicht self-contained |

### Gewählter Fix-Ansatz: Option (b) — Factory Poll

1. **Neues Skript `scripts/factory/auto-close-merged.sh`:**
   - `gh pr list --state merged --limit 30 --json number,title,mergedAt,labels` (kostet ~30
     GitHub API-Calls/Monat, vernachlässigbar).
   - Pro PR: PR-Title via `sed -nE 's/.*\[(T[0-9]+)\].*/\1/p'` parsen. Wenn ein `T-NNNNNN`
     matcht, im Ticket nachschlagen (`./scripts/ticket.sh get --id "$TICKET"`).
   - Wenn Status `triage`, `in_progress`, `in_review`, `awaiting_deploy` oder `blocked`:
     `ticket.sh update-status --id $TICKET --status done --resolution shipped` (bzw.
     `--resolution fixed` für `type=bug`).
   - Idempotent: überspringt Tickets, die schon `done` oder `archived` sind.
   - Nutzt `gh-axi` (bevorzugt) oder `gh` als Fallback.

2. **Hook in `scripts/factory/wakeup.sh`:** vor dem Dispatcher-Tick (analog zu
   `auto-enqueue.sh:103-106` und `auto-triage.sh:109-112`) für beide Brands
   `auto-close-merged.sh` aufrufen. Idempotent, nicht fatal (Fehler werden geloggt und
   ignoriert).

3. **BATS-Test:** simuliert eine gemergte PR mit `[T001415-mock]`-Tag (über Stub-`gh`),
   prüft dass `auto-close-merged.sh` den `ticket.sh update-status`-Aufruf generiert.
   Zweiter Lauf auf bereits `done` Ticket: muss idempotent sein (kein zweiter Aufruf).

4. **SSOT-Spec-Update:** `openspec/specs/ticket-system.md` bekommt einen neuen
   Requirement-Abschnitt "Auto-Close nach Merge via Factory Poll" mit WHEN-THEN-Scenarios
   für die drei Fälle (gemergt PR + non-terminal status → close, gemergt PR + done status
   → no-op, no PR match → no-op).

5. **Optional — factory-mcp Tool-Surface:** ein neuer `factory-mcp`-Tool
   `auto_close_merged` (single-brand) ist Nice-to-Have, aber nicht im Headline-Scope. Das
   Skript allein reicht für die drei dokumentierten Fälle.

### Betroffene Dateien

- `scripts/factory/auto-close-merged.sh` (neu)
- `scripts/factory/wakeup.sh` (zwei neue Zeilen analog `auto-enqueue.sh:103-106`)
- `tests/spec/t001415-mishap-bundle.bats` (neu, BATS-Tests für alle drei Mishaps)
- `openspec/specs/ticket-system.md` (Delta: neues Requirement "Auto-Close nach Merge")

### Edge Cases

- **Falsche PR-Tags:** `[Release v1.2.3]` ohne `T-NNNNNN` → kein Match → Skip.
- **Mehrere Tags im Title:** nur der erste `T\d{6}` zählt (defensiv).
- **Triage-Tickets, die PRs bekommen:** `triage` ist ein legitimer Status für ein Feature
  vor Spec — ein gemergter PR mit `triage` ist verdächtig (sollte normalerweise
  `in_progress` durchlaufen). Default: **trotzdem closen** (PR merged = work ist draußen,
  der Status-Pfad ist das Problem, nicht das Close-Ergebnis). Patrick-Triage behält sich
  vor, im Edge-Case manuell zu reverten.
- **Already-done Tickets:** idempotent, kein Effekt.

## Verifikations-Plan

- BATS-Tests in `tests/spec/t001415-mishap-bundle.bats` decken alle drei Mishaps ab
  (analog `tests/spec/t001408-mishap-bundle.bats`).
- `task test:changed` (smart selection gegen `git diff origin/main`).
- `task freshness:regenerate && task freshness:check` (CI-Äquivalent).
- `task workspace:validate` (Kustomize dry-run — kein Infra-Change, sollte trivial sein).

## Out-of-Scope (für später)

- Webhook-basierter Post-Merge-Hook (Option a) — overkill.
- Postgres-Trigger (Option c) — nicht self-contained.
- `factory-mcp` Tool-Surface für `auto-close-merged` — kann nachgerüstet werden, wenn
  andere Trigger-Quellen dazukommen.
- Watchdog-Safety-Net für `awaiting_deploy > 24h` (existiert bereits als Cockpit-Lane,
  ist hier nicht betroffen).
