---
ticket_id: null
plan_ref: null
status: active
date: 2026-06-16
---

# Spec: VDA-Unify — Unified View-Decision-Action Interface

**Datum:** 2026-06-16
**Status:** design

## 1. Problem

Die Software Factory hat **11+ interaktive Skripte** mit inkonsistenten UX-Patterns, überlappenden Zuständigkeiten und unterschiedlichen Dependency-Profilen:

| Skript | Zeilen | Interaktiv | Dependencies |
|--------|--------|-----------|-------------|
| `task-oracle.sh` | 471 | fzf/select/LLM | fzf, python3, curl, task |
| `t.sh` | 59 | fzf+read | fzf, task |
| `feature-promote.sh` | 368 | select | docker, kubectl |
| `plan-frontmatter-hook.sh` | 184 | read | awk, sed |
| `backup-restore.sh` | 1037 | read confirm | kubectl, jq, openssl |
| `ticket.sh` | 795 | keine | kubectl, psql, jq |
| `dispatcher-prep.sh` | 115 | keine | jq |
| `factory-prep-runner.sh` | 97 | keine | jq |
| `prep-simple.sh` | 24 | keine | — |
| `wakeup.sh` | 130 | keine | flock, claude |
| `brainstorm-bridge.sh` | 281 | keine | node, tailscale |

### Probleme im Detail

1. **Kein einheitliches VDA-Pattern:** Jedes Skript implementiert View-Decision-Action anders — mal fzf, mal select, mal read, mal env-Vars.
2. **Überflüssige Dependencies:** fzf (in 2 Skripten) verhindert small-model-Kompatibilität und Offline-Betrieb.
3. **Duplikation:** 3 Prep-Varianten (dispatcher-prep.sh, factory-prep-runner.sh, prep-simple.sh) mit gleicher Logik.
4. **Monolith ticket.sh:** 795 Zeilen, 20+ Subcommands — CRUD + Pipeline + Feature-Flags + Factory-Control in einer Datei.
5. **Kein gemeinsames Output-Format:** Manche Skripte geben JSON, andere plaintext, dritte nur Exit-Codes.
6. **Kein shared prompt/choice layer:** Jedes Skript hat eigene `read`/`select`-Implementierung ohne konsistentes Styling.

## 2. Ziel

Ein **Single Entry-Point `vda.sh`** der alle interaktiven Interfaces als Subcommands bereitstellt.

### Architektur-Entscheidungen

| Dimension | Entscheidung |
|-----------|-------------|
| Entry-Point | `scripts/vda.sh` — ein Befehl, alle Interfaces |
| Subcommand-Pattern | `vda.sh <bereich> <aktion> [flags]` |
| Shared Library | `scripts/lib/vda-core.sh` — View-, Choice-, Confirm-, Input-Helfer |
| Output-Format | Einheitlich: JSON für IPC, Plaintext für Human-Readable |
| Abhängigkeiten | **Kein fzf, kein gum, kein dialog** — nur bash-builtins + task + kubectl |
| Modell-Kompatibilität | Jeder Subcommand < 150 Zeilen, deterministisch, fail-closed |

### Subcommand-Übersicht

```
vda.sh
├── oracle [goal]           # Task-Orakel (replaces task-oracle.sh + t.sh)
├── promote [service]       # Feature-Promotion (replaces feature-promote.sh)
├── frontmatter <file>      # Frontmatter-Hook (replaces plan-frontmatter-hook.sh)
├── backup                  # Backup/Recovery (replaces backup-restore.sh subcommands)
│   ├── list
│   ├── trigger
│   ├── restore <db> <ts>
│   └── unstage <ts>
├── ticket                  # Ticket-CRUD + Pipeline (replaces ticket.sh)
│   ├── create
│   ├── update-status
│   ├── add-comment
│   ├── grill
│   ├── enqueue
│   ├── stage-plan
│   └── ...
├── factory-prep            # Factory PREP (replaces 3 Prep-Varianten)
├── brainstorm              # Brainstorm-Bridge (replaces brainstorm-bridge.sh)
│   ├── start
│   ├── stop
│   ├── urls
│   └── service
├── help                    # Zeigt Hilfe an
└── version                 # Zeigt Version an
```

## 3. VDA-Core Library (`scripts/lib/vda-core.sh`)

Alle interaktiven Subcommands sourcen diese Library und nutzen ihre Funktionen.

### Funktionen

```bash
# View: Strukturierte Ausgabe
vda_header "<titel>"           # ─── <titel> ──────────────────────
vda_section "<label>" "<wert>" # • <label>: <wert>
vda_list "<titel>" <arr>       # Nummerierte Liste
vda_error "<meldung>"          # ✗ <meldung> (stderr)
vda_success "<meldung>"        # ✓ <meldung>
vda_warn "<meldung>"           # ⚠ <meldung>

# Decision: Konsistente Eingabe (built-in bash only)
vda_choose "<prompt>" <opt1> <opt2> ...  # select-basiert, gibt Index zurück
vda_confirm "<prompt>"                    # read -p, gibt 0/1 zurück
vda_input "<prompt>" [default]            # read -p, gibt String zurück

# Action: Standardisierte Ausführung
vda_exec "<cmd>"                          # Führt aus, logged, handled errors
vda_dry_run "<cmd>"                       # echo statt exec (bei DRY_RUN=1)

# Output: JSON für IPC
vda_json <key>=<val> ...                  # Baut JSON-String (optional, nur wenn jq da)
vda_result <key>=<val> ...                # Gibt strukturiertes Ergebnis aus
```

### Design-Prinzipien

- **No fzf:** `vda_choose` nutzt bash `select` (POSIX-kompatibel). Bei > 10 Optionen: Paginierung via `select` + `more`.
- **Deterministisch:** Bei `VDA_NONINTERACTIVE=1` (CI/Facory/Agent) überspringen alle Eingabe-Funktionen und nutzen Defaults oder Fail.
- **TTY-Erkennung:** `vda_choose`/`vda_confirm`/`vda_input` checken `-t 0` und `VDA_NONINTERACTIVE` — in CI/Automation kein Prompt.
- **Kein jq required:** `vda_json` funktioniert ohne jq via printf/sed-Escaping. Mit jq: pretty-printed.
- **Strict mode:** Alle Funktionen setzen `set -euo pipefail` nicht selbst (das macht der Subcommand), aber checken Parameter.

## 4. Subcommand-Details

### 4.1 `vda.sh oracle [--goal <text>]`

**Ersetzt:** `task-oracle.sh` (471 Z) + `t.sh` (59 Z)
**Ziel:** < 150 Zeilen
**Modus:** 3-Phase VDA

```
Phase 1 — View: task --list-all parsen → Namespace-Gruppen anzeigen
Phase 2 — Decision: vda_choose "Namespace?" namespace1 namespace2 ...
Phase 3 — View: Tasks in Namespace anzeigen (task --summary <ns>:*)
Phase 4 — Decision: vda_choose "Task?" task1 task2 ...
Phase 5 — View: ENV-Auswahl (wenn task ENV= benötigt)
Phase 6 — Decision: vda_choose "ENV?" dev mentolder korczewski none
Phase 7 — Action: task <auswahl> ENV=<env>
```

**Fast-Path:** Wenn `--goal <text>` übergeben wird:
- LLM-freier Modus: Regex-Matching gegen `task --list-all` (bestehende Logik aus task-oracle.sh)
- Python3 nur für LLM-Fallback (optional, bei `VDA_LLM=1`)

**Non-Interactive Mode:** `VDA_NONINTERACTIVE=1 vda.sh oracle "deploy website"` → automatischer Fast-Path

### 4.2 `vda.sh promote [service] [--target mentolder|korczewski|both]`

**Ersetzt:** `feature-promote.sh` (368 Z)
**Ziel:** < 200 Zeilen
**Modus:** 2-Phase VDA (service + target) + 4-Phasen-Action

```
Phase 1 — View: Service-Liste (website brett arena docs)
Phase 2 — Decision: vda_choose/vda_input für SERVICE (env-var oder prompt)
Phase 3 — View: Target-Liste (mentolder korczewski both)
Phase 4 — Decision: vda_choose/vda_input für TARGET
Phase 5 — Action: build → push → dev-deploy → smoke → prod-deploy → observe
```

**Auslagerung:** Die 4 Phasen (build, push, deploy, smoke) bleiben als `scripts/lib/promote-phases.sh` (nicht interaktiv) — `vda.sh promote` orchestriert nur.

### 4.3 `vda.sh frontmatter <file> [--activate] [--spec]`

**Ersetzt:** `plan-frontmatter-hook.sh` (184 Z)
**Ziel:** < 100 Zeilen
**Modus:** 1-Phase VDA

```
Phase 1 — View: Derivate Domains anzeigen (wie bisher)
Phase 2 — Decision: vda_choose "Override?" (oder Enter für accept)
Phase 3 — Action: Frontmatter prependen/reparieren (wie bisher, awk/sed)
```

Nicht-interaktiv mit `--activate`: überspringt Prompt, schreibt direkt.

### 4.4 `vda.sh backup <subcommand> [args]`

**Ersetzt:** `backup-restore.sh` Subcommands (listen, trigger, restore, unstage, etc.)
**Ziel:** < 80 Zeilen pro Subcommand
**Modus:** Subcommand-Pattern

Jeder Subcommand folgt VDA:
```
vda.sh backup list
  → View: Backup-Timestamps anzeigen
  → Action: kubectl exec (keine Decision nötig)

vda.sh backup unstage <ts>
  → View: "Lösche *_recovery DBs und /recovery/<TS>"
  → Decision: vda_confirm "Type 'yes' to confirm"
  → Action: kubectl create job + wait
```

### 4.5 `vda.sh ticket <subcommand> [args]`

**Ersetzt:** `ticket.sh` (795 Z) — Aufteilung in Subcommand-Dateien
**Ziel:** < 100 Zeilen pro Subcommand-Datei (10-12 Dateien)
**Modus:** Subcommand-Dispatch + Sub-Skripte

```
vda.sh ticket/
├── _ticket-core.sh        # shared: _pgpod, _exec_sql (aus ticket.sh)
├── create.sh              # ticket.sh cmd_create
├── update-status.sh       # ticket.sh cmd_update_status
├── add-comment.sh         # ticket.sh cmd_add_comment
├── grill.sh               # ticket.sh cmd_grill (delegiert an ticket-grill.sh)
├── enqueue.sh             # ticket.sh cmd_enqueue
├── stage-plan.sh          # ticket.sh cmd_stage_plan
├── get.sh                 # ticket.sh cmd_get
├── archive-plan.sh        # ticket.sh cmd_archive_plan
├── factory-control.sh     # ticket.sh cmd_factory_control + cmd_feature_flag
├── inject.sh              # ticket.sh cmd_inject + cmd_get_injections
└── set-touched-files.sh   # ticket.sh cmd_set_touched_files
```

Der Subcommand-Dispatch in `vda.sh`:
```bash
case "${1:-}" in
  ticket)
    SUB="${2:-help}"
    shift 2
    if [[ -f "scripts/vda/ticket/${SUB}.sh" ]]; then
      source "scripts/vda/ticket/${SUB}.sh"
      main "$@"
    else
      vda_error "Unbekannter ticket subcommand: $SUB"
      exit 2
    fi
    ;;
```

### 4.6 `vda.sh factory-prep [--brand mentolder|korczewski] [--dry-run]`

**Ersetzt:** `dispatcher-prep.sh` (115 Z) + `factory-prep-runner.sh` (97 Z) + `prep-simple.sh` (24 Z)
**Ziel:** < 80 Zeilen
**Modus:** Non-interaktiv, deterministisch

```
vda.sh factory-prep
  → View: (nur logs)
  → Decision: (keine — pure gates)
  → Action: guard_killswitch → guard_daily_cap → watchdog → schedule → launch JSON
```

Kein Prompt — die 3 Varianten entfallen. `vda.sh factory-prep --dry-run` ersetzt `prep-simple.sh`.

### 4.7 `vda.sh brainstorm <subcommand> [args]`

**Ersetzt:** `brainstorm-bridge.sh` (281 Z) — reduziert auf Kern-Subcommands
**Ziel:** < 50 Zeilen (Rest bleibt in `scripts/lib/brainstorm-lib.sh`)
**Modus:** Subcommand-Dispatch

```
vda.sh brainstorm start     → start companion + tailscale serve
vda.sh brainstorm stop      → stop companion + remove serve
vda.sh brainstorm urls      → print URL menu
vda.sh brainstorm service install|remove|status → systemd management
```

## 5. Datenfluss

```
User / Agent / Factory
  │
  └─ vda.sh oracle "deploy website to mentolder"
       │
       ├─[Fast-Path]─→ Regex-Match gegen task --list-all
       │                 └─ vda_exec "task website:deploy ENV=mentolder"
       │
       └─[Interactive]─→ vda_choose "Namespace?" → vda_choose "Task?" → vda_choose "ENV?"
                           └─ vda_exec "task <ns>:<task> ENV=<env>"
                           └─ Bei CI/Agent: VDA_NONINTERACTIVE=1 → Fast-Path
```

```
Factory Dispatcher → vda.sh factory-prep
  └─ guard_killswitch → guard_daily_cap → watchdog → schedule
  └─ vda_json launch=[...] skipped=[...]
  └─ stdout → dispatcher.js liest JSON
```

## 6. Migration

### Phase 1: Core Library + Subcommand-Skeletons (1 PR)

1. `scripts/lib/vda-core.sh` — VDA-Helper-Funktionen
2. `scripts/vda.sh` — Entry-Point + Dispatch-Logik
3. `scripts/vda/ticket/_ticket-core.sh` — Extraktion aus ticket.sh
4. `scripts/lib/promote-phases.sh` — Extraktion aus feature-promote.sh
5. `scripts/lib/brainstorm-lib.sh` — Extraktion aus brainstorm-bridge.sh

**Tests:** `tests/unit/vda-core.bats` — testet alle vda_*-Funktionen in CI und non-interactive Mode.

### Phase 2: Subcommand für Subcommand (N PRs, parallel)

Jeder Subcommand wird in einem separaten PR umgestellt:
1. `vda.sh oracle` → replaces task-oracle.sh + t.sh
2. `vda.sh promote` → replaces feature-promote.sh
3. `vda.sh frontmatter` → replaces plan-frontmatter-hook.sh
4. `vda.sh backup` → wraps backup-restore.sh subcommands
5. `vda.sh ticket create|update-status|...` → replaces ticket.sh subcommands
6. `vda.sh factory-prep` → replaces dispatcher-prep.sh + factory-prep-runner.sh + prep-simple.sh
7. `vda.sh brainstorm` → replaces brainstorm-bridge.sh

### Phase 3: Alias/Deprecation (1 PR)

Alte Skripte werden zu Wrappern:
```bash
# scripts/task-oracle.sh — DEPRECATED
echo "⚠ task-oracle.sh is deprecated. Use: vda.sh oracle ..." >&2
exec bash "$(dirname "$0")/vda.sh" oracle "$@"
```

Nach 2 Monaten: Alte Skripte löschen.

## 7. Quality Gates

| Gate | Check |
|------|-------|
| S1 (File Size) | Jeder Subcommand < 150 Zeilen. vda-core.sh < 300 Zeilen. |
| S2 (Import Cycles) | `scripts/lib/vda-core.sh` hat keine Imports. Subcommands sourcen nur vda-core. |
| S3 (No Brand Literals) | Keine hardcodierten Domains — alle über env-resolve.sh |
| S4 (No Orphans) | Jeder Subcommand ist in `vda.sh help` gelistet und getestet. |
| Small-Model | Kein fzf, gum, dialog, python3, curl, jq in vda-core.sh (optional in Subcommands). |

## 8. Erfolgskriterien

- `vda.sh oracle --goal "deploy website"` → führt `task website:deploy` aus (ohne fzf, ohne LLM)
- `vda.sh promote website --target mentolder` → fördert website auf mentolder (ohne select-Prompt)
- `vda.sh ticket create --title "..." --description "..."` → created ticket (gleiche API wie ticket.sh)
- `vda.sh factory-prep` → produziert gleiches JSON wie dispatcher-prep.sh
- `VDA_NONINTERACTIVE=1 vda.sh oracle` → kein Prompt, Fast-Path
- `scripts/task-oracle.sh` gibt Deprecation-Warning und delegiert an `vda.sh oracle`
- Alle bestehenden Tests (FA-SF, ticket.sh Tests) bleiben grün

## 9. Out of Scope

- `task` CLI selbst (Taskfile) bleibt unverändert
- `scripts/factory/pipeline.js`, `dispatcher.js` bleiben unverändert (sie rufen Bash-Skripte auf, die durch vda.sh ersetzt werden)
- `scripts/factory/guards.sh` bleibt erhalten (wird von vda.sh factory-prep gesourct)
- `scripts/worktree-create.sh`, `scripts/agent-lock.sh` bleiben eigenständig (kein VDA-Interface)
- Keine UI-Änderungen an Web-Interfaces (Cockpit, Factory-Floor)
