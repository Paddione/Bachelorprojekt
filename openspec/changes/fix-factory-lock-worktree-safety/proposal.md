# Proposal: fix-factory-lock-worktree-safety

## Why

**T003664 (Root-Cause-Analyse):** Ein Factory-Merge revertierte einen fremden Fix unter irrefuehrendem Titel. Die Commit-Sequenz im betroffenen Worktree `.worktrees/bats-missing-file-exit0`:

1. `108cea6f6` — Arbeit der parallelen Session (T003003-Fix in `.opencode/skills/opencode-flow-execute/SKILL.md`)
2. `9c670fe64` — `Merge origin/main` (Factory-Aktor, titelneutral)
3. `3a3b3af1c` — `chore(plans): ergaenze fehlende .ticket-Datei ... [T002929]` — **43 Deletionen** in der fremden SKILL.md, betitelt wie eine harmlose Meta-Ergaenzung
4. `e65bc3ab8` — Folge-Commit auf Basis der Regression

**Zwei kausale Mechanismen:**

1. **Kein Lock im Factory-Write-Pfad:** Die Factory rief weder `agent-lock.sh claim` vor dem Schreiben noch `check` vor dem Betreten auf — beide beteiligten Akteure arbeiteten ~40 Minuten locklos. Damit griffen beide bestehenden Schutzschichten nicht: der Dispatch-Gate (`factory-prep.sh`, `check-branch-live`) und die T002896-Guards in `worktree-create.sh`/`cleanup.sh` sehen nur *existierende* Claims.
2. **`git add -A`-Sweep im geteilten Worktree:** Der Factory-Commit uebernahm alle Arbeitsbaum-Aenderungen — auch die der parallelen Session — unter einem Factory-eigenen Titel (`chore(plans): ...`), was die Regression als harmlosen Meta-Commit tarnte. Zusaetzlich kann `worktree-create.sh`'s idempotente Stale-Entfernung einen lebenden Session-Worktree ohne Lock entfernen.

Der agent-lock-Mechanismus war vorhanden und korrekt — er wurde nur im Factory-Write-Pfad nie beansprucht.

## What

Die Factory bekommt eine Lock-Pflicht fuer jeden Worktree-Schreibzugriff, durchgesetzt als deterministische Host-side-Kommandos (das Workflow-Sandbox-Skript kann keine Node-APIs nutzen):

- **`lock-check` / `lock-claim` / `lock-release`** in `scripts/factory/pipeline-runner.js` — wrappen `agent-lock.sh check|claim|release branch` und antworten als JSON (`{state}`, `{ok, detail}`, `{released, detail}`); Exit 3 (`held`) wird korrekt auf den `held`-State gemappt.
- **P2-Pre-Check in `setupWorktree`** (pipeline.mjs): vor `worktree-create.sh` prueft `lock-check`; `held`/`error` → Defer mit `reason: 'branch-locked'`. Schliesst die Luecke, dass ein Lock *ohne* Worktree an `worktree-create.sh`'s "branch in use"-Erkennung vorbeilaeuft.
- **P1-Claim nach Worktree-Erstellung:** `lock-claim` (Label `factory-pipeline`) direkt nach `ready on` — bewusst NACH dem Create, weil ein Vorab-Claim `worktree-create.sh`'s T002896-Guard (Live-Lock auf Ziel-Branch → Exit 4) selbst blockieren wuerde. Scheitert der Claim (Rennen), Defer statt Rennen.
- **Heartbeat-Refresh** vor dem Implementierungs-Loop und vor der Deploy-Phase (TTL 1800s; Verify kann laenger dauern). Fehlgeschlagener Refresh = fremder Claim = fail-closed Defer.
- **Freigabe im `finally` VOR `cleanup.sh`:** cleanup.sh ueberspringt Worktree-/Branch-Removal bei lebendem Claim (T002896) — erst die Freigabe macht die Aufraeumung wirksam. No-op ohne Claim; Fremd-Claims bleiben unberuehrt (SID-Check in agent-lock.sh).
- **`agent-lock.sh` unveraendert** — claim/check/release liefern Own-Refresh, Held-Erkennung und SID-gepruefte Freigabe bereits; die Aenderung liegt in der Nutzung.

**Guard-Test:** `tests/spec/software-factory/factory-claims-lock-before-write.bats` — drei Tests: (1) Claim existiert vor dem git-Commit und wird nach Release entfernt (Positiv-Anker), (2) fremder Live-Lock → `ok=false`, fremder Claim unveraendert, `lock-check` meldet `held` (Positiv-Anker zur Negativ-Aussage), (3) Querschnittstest der Verdrahtung (dokumentierte T002448-Ausnahme).

_Ticket: T003677_
