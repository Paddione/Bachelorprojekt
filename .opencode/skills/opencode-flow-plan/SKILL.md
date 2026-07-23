---
name: opencode-flow-plan
description: Use in opencode to choose the development path (feature/fix/chore), run brainstorming, and generate a design spec and implementation plan.
---

# opencode-flow-plan — Pfad-Wahl, Brainstorming & Plan

## Wann diese Skill greift

Bei jeder Anfrage in diesem Repo, die etwas verändern will. Nutze diesen Skill für Features und Fixes; für Chores stattdessen `opencode-flow-chore`.

## Position im Git-Kreislauf

```
[ main ]
    │
    ├─► [branch + spec + plan] ── DIESER SKILL ── AUSSTIEG ──►
    │         (feature / fix)         pushed
    │
    └─► [chore direkt] ── opencode-flow-chore ──────────────────
```

**EINSTIEG:** `main` — synchronisiert, sauberer Stand
**AUSSTIEG:** Feature/Fix-Branch mit committiertem Plan auf Remote gepusht, Ticket `plan_staged`
**Nächster Schritt:** `opencode-flow-execute`

## Schritt −2: Main sync (Pull-First)

```bash
git fetch origin main
if git diff --quiet HEAD; then git pull --rebase origin main; else git stash && git pull --rebase origin main && git stash pop; fi
```

## Schritt −1: Reaper & Audit

```bash
bash scripts/agent-lock.sh reap
bash scripts/agent-lock.sh list
bash scripts/agent-msg.sh read --unread
git worktree list
```

## Schritt 0: Pfad bestimmen

Wähle Feature, Fix oder Chore. Features/Fixes → dieser Skill. Chores → `opencode-flow-chore` und STOPP.

## Feature-Pfad

### Phase A: Auf main — Proposal-Phase
#### Schritt A.1: Asset-Sammlung + Codebase-Exploration

Frage den User aktiv nach Spec-Notizen, Mockups oder Screenshots. Lese Text- und Image-Dateien mit dem `Read`-Tool ein. Verwende einen read-only Subagenten (`delegate(prompt, agent)`) für Code-Exploration.

#### Schritt A.1.5: Intel-Gathering → Plan Intel Bundle

Befülle `intel.json` mit typisierter Typen-Wahrheit. Quellen:
- `symbols` / `signature` / `type_text` → codebase-memory MCP
- `call_graph` → codebase-memory `trace_path`
- `db_tables` → mcp-postgres (`information_schema.columns`)
- `api_contracts` → Read der API-Handler + Typen
- `impact_files` / `s1_*` → `wc -l` + `docs/code-quality/baseline.json`

Validiere lokal mit `jq`. Bei nicht erreichbaren Quellen: `risks[]`-Eintrag setzen.

#### Schritt A.2: Design-Bundle co-lokalisieren (nur UI-Tickets)

Wenn ein Design-Handoff existiert, lege Assets in `openspec/changes/<slug>/assets/` im main-Checkout an.

#### Schritt A.3: Lavish-Board starten ⚡ PFLICHT — vor Brainstorming

Erstelle `.lavish/<slug>-brainstorm.html` (Sections: Intent, Constraints, Trade-offs, Entscheidungen) und öffne es mit `npx -y lavish-axi .lavish/<slug>-brainstorm.html`. Dieses Board dient als visuelles Arbeitsblatt während des Brainstormings.

#### Schritt A.4: Brainstorming ⚡ IMMER

Starte strukturiertes Brainstorming mit dem User. Nutze das `lavish`-Board aus A.3 für visuelle Dokumentation und strukturiertes Feedback. Tracke Fortschritt mit einer Plain-Text-Checkliste. Verwende einen read-only Subagenten (`delegate(prompt, agent)`) für Code-Exploration (Architektur/Code-Pfade).

#### Schritt A.5: OpenSpec-Change anlegen — AUF MAIN

```bash
# upstream OpenSpec CLI (preferred):
/opsx:propose <slug>
# Fallback:
# bash scripts/openspec.sh propose "<slug>" --ticket "<TICKET_EXT_ID>"
```

Übertrage Brainstorming-Output nach `openspec/changes/<slug>/proposal.md`. Der Implementierungsplan kommt in `openspec/changes/<slug>/tasks.md`.

#### Schritt A.6: Ticket anlegen — VOR Plan-Schreibung ⚡

Erstelle das Ticket **jetzt** (nach dem Propose, vor dem Plan-Schreiben), damit die
Ticket-ID für den Rest des Flows verfügbar ist und `stage_plan` sofort nach der
Plan-Erstellung ausgeführt werden kann (kein Fenster für Plan-Verlagerung):

```
ticket-mcp: create_ticket({ type: "task", brand: "mentolder", title: "<slug>", priority: "mittel", description: "Branch: feature/<slug>\nPlan: openspec/changes/<slug>/tasks.md\nSpec: openspec/changes/<slug>/design.md" })
```

Setze `TICKET_EXT_ID` (Feld 1) und `TICKET_UUID` (Feld 2) aus der Rückgabe.
Claims: `agent-lock.sh claim ticket` + `claim branch` mit Label `opencode-flow-plan`.

### Phase B: Worktree anlegen + Branch pushen (vor Plan-Schreibung)

🚨 **Pipeline-Prinzip:** Der Branch und Worktree werden JETZT angelegt und gepusht,
damit Partial-Pläne sofort in die Factory enqueued werden können, während der Planner
weiterarbeitet. Die Factory beginnt mit der Ausführung eines Partials, sobald es
enqueued ist — parallel zum Schreiben des nächsten Partials.

#### Schritt B.1: Worktree anlegen

```bash
bash scripts/worktree-create.sh feature/<slug> .worktrees/<slug>
bash scripts/agent-lock.sh claim branch "feature/<slug>" --worktree ".worktrees/<slug>" --label opencode-flow-plan
```

#### Schritt B.2: Proposal-Artefakte in den Worktree verschieben

```bash
WT=".worktrees/<slug>"
mkdir -p "${WT}/openspec/changes/"
mv "${REPO_ROOT}/openspec/changes/<slug>" "${WT}/openspec/changes/<slug>"
cd "${WT}"
```

#### Schritt B.3: Leeren Branch pushen (Grundlage für Factory-Dispatch)

```bash
git add openspec/changes/<slug>/
git commit -m "chore(plans): scaffold <slug> branch [$TICKET_EXT_ID]"
git push -u origin feature/<slug>
```

### Phase C: Im Worktree — Pipeline-Plan-Phase (Partial-Dispatch)

#### Schritt C.1: Decompose — Partial-Manifest erstellen

Erzeuge aus `intel.json` (`impact_files`) das **Partial-Manifest**:
1–N Partials mit disjunkten `target_files`-Listen; das **letzte Partial ist IMMER die
Tests-Rolle** (`tests`, trägt den STRUCT2-Failing-Test-Step). Faustregel: 1 Partial bei
< 5 `impact_files` / einem Subsystem, sonst Schnitt nach Subsystem, Tests separat. Keine
Datei in zwei Partials (D1 — `plan-lint.sh` erzwingt das im Partial-Modus).

#### Schritt C.2: Pipeline-Loop — Pro Partial: Plan → Stage → Enqueue → Factory

Führe für **jedes Partial** in Reihenfolge aus (außer das letzte Tests-Partial, das erst
nach allen anderen gestaged wird):

```
FOR each partial pX (p1, p2, ...):
  │
  ├─► Schritt C.2a: Partial-Plan schreiben
  │     Fan-out Subagent via `delegate(prompt, agent="explore")` — Kontext: proposal.md,
  │     intel.json-Subset, Quality-Gates. Schreibt `tasks.d/pX-<name>.md`.
  │
  ├─► Schritt C.2b: tasks.md-Index aktualisieren
  │     Der Orchestrator updated `tasks.md` mit dem neuen Partial-Eintrag im Manifest
  │     und der aktualisierten File Structure.
  │
  ├─► Schritt C.2c: Commit + Push (Partial ist im Branch sichtbar)
  │     git add openspec/changes/<slug>/
  │     git commit -m "chore(plans): add partial pX-<name> for <slug> [$TICKET_EXT_ID]"
  │     git push origin feature/<slug>
  │
  ├─► Schritt C.2d: Plan stagen (plan_staged + slot_count setzen)
  │     bash scripts/ticket.sh stage-plan \
  │       --id "$TICKET_EXT_ID" \
  │       --branch "feature/<slug>" \
  │       --plan "openspec/changes/<slug>/tasks.md" \
  │       --partials N
  │
  ├─► Schritt C.2e: Readiness-Flags setzen (damit auto-enqueue greift)
  │     ticket-mcp: set_readiness_flag({ id: "$TICKET_EXT_ID", flag: "spec_skizziert", value: true })
  │     ticket-mcp: set_readiness_flag({ id: "$TICKET_EXT_ID", flag: "abhaengigkeiten_klar", value: true })
  │     ticket-mcp: set_readiness_flag({ id: "$TICKET_EXT_ID", flag: "offene_fragen_geklaert", value: true })
  │     ticket-mcp: set_readiness_flag({ id: "$TICKET_EXT_ID", flag: "aufwand_geschaetzt", value: true })
  │
  ├─► Schritt C.2f: In Factory enqueuen ⚡
  │     ticket-mcp: enqueue_ticket({ id: "$TICKET_EXT_ID" })
  │     # Factory dispatcher startet jetzt WORK an diesem Partial!
  │     # Der Planner fährt parallel mit dem nächsten Partial fort.
  │
  └─► Nächstes Partial (oder STOPP wenn alle geschrieben)

NACH dem letzten Partial (Tests):
  ├─► Schritt C.3: Plan-Qualitäts-Gate
  │     bash scripts/plan-lint.sh openspec/changes/<slug>/tasks.md
  │     bash scripts/openspec.sh validate
  │
  ├─► Schritt C.4: Pgvector-Index aktualisieren
  │     bash scripts/openspec-embed-local.sh <slug> "$(pwd)"
  │
  └─► Schritt C.5: Finaler Commit + Push
        git add openspec/changes/<slug>/
        git commit -m "chore(plans): finalize <slug> plan [$TICKET_EXT_ID]"
        git push origin feature/<slug>
```

### Pipeline-Fluss (visuell)

```
Zeit │
     │ Planner:      [p1 schreiben] → [p2 schreiben] → [p3(Tests) schreiben] → fertig
     │ Factory:       ╰─► p1 ausführen ╰─► p2 ausführen ╰─► p3(Tests) ausführen
     │                (parallel zum Planner!)       (parallel zum Planner!)
     ▼
```

### Wichtig — Race-Condition-Schutz

- **Slot-Gating:** `stage-plan --partials N` setzt `slot_count` in der DB. Der Factory-Dispatcher reserviert slots nur bis zu dieser Grenze und erzeugt keinen Leerlauf durch Überdispatch.
- **Plan-Staleness:** Wenn die Factory ein Partial schneller abarbeitet als der Planner das nächste schreibt, pausiert der Dispatcher (kein Ticket in `plan_staged`/`backlog`). Sobald das nächste Partial enqueued ist, läuft der Tick weiter.
- **Ticket-Status:** Während der Pipeline bleibt das Ticket `plan_staged` → `backlog` → `in_progress`. Der Planner muss vor jedem Enqueue prüfen, ob die Factory das Ticket bereits bearbeitet (`in_progress`) — dann kurz pausieren und warten.
- **Plan-Mutation:** Sobald ein Partial enqueued ist, darf der Planner den Plan für dieses Partial NICHT mehr ändern (Factory hat bereits begonnen). Neue Erkenntnisse fließen via `design.md`-Updates in spätere Partials.

### Fix-Pfad

## Fix-Pfad

- Lege Bug-Ticket an (via ticket-mcp `create_ticket`), schreibe failing Test, erstelle Plan, stage, commit und push.

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `opencode-git-workflow` | Commit/Push/PR-Schritte |
| `opencode-flow-execute` | **Nachfolger** — implementiert den Plan |
| `opencode-flow-chore` | Geschwister — Chores statt Features/Fixes |
| `background-agents.ts` | Read-only Subagent für Plan-Schreiben |
| `worktree.ts` / `scripts/worktree-create.sh` | Worktree-Erstellung (Wrapper nötig wg. git-crypt) |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Not available directly. Equivalent: native Claude Code `dev-flow-plan` / `dev-flow-execute` / `dev-flow-chore` skills |
| **opencode** | Full — native skill for opencode |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |