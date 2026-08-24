---
title: "codebase-memory-single-flight — Implementation Plan"
ticket_id: T016447
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# codebase-memory-single-flight — Implementation Plan

_Ticket: T016447_

## File Structure

```
scripts/codebase-memory/index-single-flight.sh        # neu — Lease-Mutex (acquire/release/status)
.opencode/plugin/codebase-memory-singleflight.ts      # neu — tool.execute.before/after Hook
tests/spec/codebase-memory-single-flight/single-flight.bats  # neu — BATS fuer Skript + Plugin-Präsenz
AGENTS.md                                             # +1 Satz Code-Discovery-Hinweis
```

## Tasks

- [ ] **T1 — Lease-Mutex-Skript.** `scripts/codebase-memory/index-single-flight.sh`
      mit Subcommands `acquire|release|status`, Flags `--project <name>`
      (Default: basename $PWD), `--stale-minutes <n>` (Default 20), Lock-Dir
      `${CODEBASE_MEMORY_LOCK_DIR:-$HOME/.cache/codebase-memory-mcp}`.
      acquire: noclobber-Erzeugung `<project>.lease` (Inhalt:
      `pid|token|epoch|host`); EEXIST → Stale-Check (mtime älter als Threshold →
      takeover, sonst rc=1 inkl. Holder-Info). release: nur mit passendem Token.
      status: rc 0 frei / 1 frisch gehalten / 2 stale.
- [ ] **T2 — BATS RED.** `tests/spec/codebase-memory-single-flight/single-flight.bats`
      mit temporärem `CODEBASE_MEMORY_LOCK_DIR`: zweiter acquire failt fast,
      release gibt frei, Stale-Takeover (altes Datum), korrupte Lease crasht
      status nicht, Dir-Override greift, Plugin-Datei existiert und referenziert
      das Skript (grep-Stil wie tests/spec/llm-local-dev.bats).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/codebase-memory-single-flight/
# expected: FAIL (red — Skript existiert noch nicht)
```

- [ ] **T3 — GREEN: Skript implementieren**, bis T2 grün ist.
- [ ] **T4 — opencode-Plugin.**
      `.opencode/plugin/codebase-memory-singleflight.ts`: `tool.execute.before`
      fängt Tools mit Präfix `codebase-memory-mcp_index_repository` ab → Skript
      `acquire --project <args.project ?? basename(cwd)>`; rc≠0 → throw mit
      Holder-PID + Hinweis auf index_status/stale-graph reads.
      `tool.execute.after` → `release --token <gemerkt>` (best-effort, wirft
      nie). Spawn-Fehler → fail-open mit Warnung. Token-Merkung im Modul-Scope
      je Projekt. Vorbild-Hook-Signatur:
      `.opencode/skills/dev-flow/background-agents.ts:1859`.
- [ ] **T5 — AGENTS.md:** im Abschnitt „Code Discovery" einen Hinweis ergänzen,
      dass `index_repository` single-flighted ist und `index_status` vorab zu
      prüfen ist.
- [ ] **T6 — Final Verification.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/codebase-memory-single-flight/
task test:changed
task freshness:regenerate
task freshness:check
```

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED)** — T2 oben, läuft vor T3.
- [x] **Fix-Step (GREEN)** — T3/T4.
- [x] **Final Verification** — T6, alle drei CI-Gates plus BATS lokal.
