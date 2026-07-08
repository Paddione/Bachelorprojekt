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

#### Schritt A.3: Brainstorming

Starte strukturiertes Brainstorming mit dem User. Stelle Fragen als Plain-Text-Fragen im Chat (keine Tool-Fragen). Tracke Fortschritt mit einer Plain-Text-Checkliste im Reply. Verwende `lavish` (via `bash scripts/lavish-axi.sh`) für visuelle Boards.

#### Schritt A.4: OpenSpec-Change anlegen — AUF MAIN

```bash
# upstream OpenSpec CLI (preferred):
/opsx:propose <slug>
# Fallback:
# bash scripts/openspec.sh propose "<slug>" --ticket "<TICKET_EXT_ID>"
```

Übertrage Brainstorming-Output nach `openspec/changes/<slug>/proposal.md`. Der Implementierungsplan kommt in `openspec/changes/<slug>/tasks.md`.

### Phase B: Worktree anlegen + Artefakte übertragen
#### Schritt B.1: Worktree anlegen

Da `worktree.ts`'s `worktree_create` keine git-crypt-Filter-Neutralisierung hat (bekannte Limitation — siehe opencode-git-workflow), immer das Wrapper-Skript verwenden:

```bash
bash scripts/worktree-create.sh feature/<slug> /tmp/wt-<slug>
bash scripts/agent-lock.sh claim branch "feature/<slug>" --worktree "/tmp/wt-<slug>" --label opencode-flow-plan
```

#### Schritt B.2: Proposal-Artefakte in den Worktree verschieben

```bash
WT="/tmp/wt-<slug>"
mkdir -p "${WT}/openspec/changes/"
mv "${REPO_ROOT}/openspec/changes/<slug>" "${WT}/openspec/changes/<slug>"
cd "${WT}"
```

### Phase C: Im Worktree — Plan-Phase
#### Schritt 3.7: Plan-Erstellung an Subagenten delegieren

Delegiere das Plan-Schreiben an einen read-only Subagenten via `background-agents.ts`:

```
delegate(prompt: "<plan-writing task mit Spec + intel.json>", agent: "explore")
```

Ergebnis mit `delegation_read(id)` abrufen. Falls `background-agents.ts` nicht verfügbar (opencode oder agy ohne Plugin), schreibe den Plan inline.

Der Subagent MUSS die Spec + `openspec/changes/<slug>/intel.json` als Kontext erhalten und die Plan-Qualitäts-Gates einhalten: S1-Budget pro Datei, `plan-lint.sh`-Konformität (F1/F2/STRUCT1-3/P1), drei verify-Commands im letzten Task.

#### Schritt 3.8: Plan-Qualitäts-Gate

```bash
bash scripts/plan-lint.sh openspec/changes/<slug>/tasks.md
bash scripts/openspec.sh validate
```

#### Schritt 4: Plan prüfen & Ticket anlegen/verwenden

Ticket anlegen (via ticket-mcp `create_ticket`), dann stagen:
```
ticket-mcp: stage_plan({ id: "$TICKET_EXT_ID", branch: "feature/<slug>", plan: "openspec/changes/<slug>/tasks.md" })
ticket-mcp: transition_status({ id: "$TICKET_EXT_ID", status: "plan_staged" })
```

#### Schritt 5: Commit & Push — dann STOPP

Pre-Commit Guard: nicht auf main, sauberer Status, Branch-Lock-Check.

```bash
git add openspec/changes/<slug>/
git commit -m "chore(plans): stage <slug> for execution [$TICKET_EXT_ID]"
git push -u origin $(git branch --show-current)
```

**STOPP.** Branch, Spec und Plan sind committed und gepusht. Nächster Schritt: `opencode-flow-execute`.

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
