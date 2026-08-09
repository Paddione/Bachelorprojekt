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

## Schritt −3: Deep Grilling (optional)

Wenn das Feature komplex oder unklar ist, frage den User nach einer Grilling-Session.
Nutze `lavish` für die Q/A-Session: Erstelle `.lavish/<slug>-grilling.html` mit den Fragen als
interaktivem Formular (Input-Playbook), öffne es mit `npx -y lavish-axi .lavish/<slug>-grilling.html`
und poll auf Antworten. Falls durchgeführt, erstelle das Grilling-Ticket via ticket-mcp
(`create_ticket` mit type=task, title="Grilling: <kurzer-titel>").

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

## Schritt −0.5: Kollisions-Check vor der Planung ⚡ [T002444]

Bevor du mit der Planung beginnst, prüfe, ob **andere Sessions bereits auf deinem Ziel-Branch**
oder an denselben Dateien arbeiten. Der `--branch`-Modus von `agent-collision.sh` erkennt
Kollisionen mit parallelen Sessions AUCH DANN, wenn dein Working Tree sauber ist:

```bash
# Prüft ob andere Sessions Daten derselben Dateien bearbeiten
bash scripts/agent-collision.sh check --branch || echo "⚠ Kollision erkannt — mit anderen Sessions koordinieren!"
```

Anders als `--staged` (braucht `git add`) und `--all` (braucht uncommittete Änderungen) findet
`--branch` ALLES was dein Branch jemals angefasst hat — egal ob committed, staged oder unstaged.
Bei Kollisionswarnung: mit den betroffenen Sessions abstimmen, bevor der Plan geschrieben wird.

## Schritt 0: Pfad bestimmen

Wähle Feature, Fix oder Chore. Features/Fixes → dieser Skill. Chores → `opencode-flow-chore` und STOPP.

### Artefakt-Ebene: braucht der Request ein PRD davor?

Die feature/fix/chore-Wahl oben ist die *Pfad*-Wahl durch diese Skill; davor steht die
*Artefakt*-Wahl (PRD vs. ADR vs. Change-Proposal vs. Chore-Ticket). Entscheidungstabelle:
- **Neues Feature ohne klares Zielbild** → PRD erstellen (Anforderungsdokument)
- **Technische Änderung mit Architektur-Impact** → ADR erstellen
- **Klar umrissene Feature-Änderung** → Change-Proposal (OpenSpec)
- **Reine Wartung** → Chore-Ticket, kein Spec

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

#### Schritt A.3: Lavish-Board starten ⚡ empfohlenes Werkzeug — vor Brainstorming

Erstelle `.lavish/<slug>-brainstorm.html` (Sections: Intent, Constraints, Trade-offs, Entscheidungen) und öffne es mit `npx -y lavish-axi .lavish/<slug>-brainstorm.html`. Dieses Board dient als visuelles Arbeitsblatt während des Brainstormings. Lavish ist ein empfohlenes, aber kein verpflichtendes Werkzeug — nur aktivieren, wenn im Scope und User-Consent vorhanden (`opencode.jsonc` → `lavish.enabled`).

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

> **`cd` wirkt nur auf Bash (T002357):** Ab Phase B tragen alle Datei-Tool-Pfade (Read/Write/Edit)
> zwingend den Worktree-Präfix — `cd` ändert nur das Bash-cwd, nicht den Bezugspunkt der
> Datei-Tools. Begründung und Prüfbefehl: siehe Claude-Referenz `dev-flow-plan-phases.md`.

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
Tests-Rolle** (`tests`, trägt den STRUCT2-Failing-Test-Step). Keine
Datei in zwei Partials (D1 — `plan-lint.sh` erzwingt das im Partial-Modus).

**Faustregel pro Agent-Modell:**

| Agent-Modell | Max files/partial | Max steps | Kontext-Fenster |
|---|---|---|---|
| gemma26-factory (26B) | 5 | 10 | ~99840 |
| gemma9-factory (9B) | 2–3 | 5 | ~8192 |
| deepseek-* (Cloud) | 10+ | 50 | 128K–1M |

**Gemma9-spezifische Partial-Sizing-Regeln:**
- Jedes Partial umfasst **höchstens 2–3 Dateien** und **höchstens 5 Implementierungsschritte**
- Ein Partial muss **in sich abgeschlossen** sein — der Agent darf keinen externen Kontext
  aus anderen Partials benötigen
- **Explizite Verifikation**: Jedes Partial listet eine konkrete Verifikation (z.B.
  `task test:changed`, `python -c "import ..."`, `curl ...`)
- **Keine indirekten Abhängigkeiten**: Wenn Partial p3 Datei X ändert, die p1 eingeführt hat,
  muss p3 die vollständige X-Definition im Prompt enthalten (der 9B-Kontext reicht nicht
  für werkzeugbasierte Exploration)
- **Iterativer Fix-Loop**: Wenn ein Partial fehlschlägt → Fehler analysieren → Partial
  korrigieren → direkt erneut enqueuen. Der Planner beobachtet den Factory-Output und
  passt die folgenden Partials an

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
  │     **Gemma9-Partials**: Jedes Partial braucht ein **Scaffolding-Preamble** am Anfang
  │     der tasks.d/pX-Datei, das dem Agenten sagt, was er NICHT tun soll (keine
  │     Exploration, keine Annahmen, nur den Plan ausführen). Format:
  │     ```
  │     # pX: <title>
  │     > **Agent:** gemma9-{1,2} | **Files:** f1.ts, f2.ts | **Steps:** 3-5
  │     > **Context budget:** 6000 tokens nach System-Prompt
  │     > **Verify:** `<command>`
  │     ```
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
  ├─► Schritt C.3: Plan-Qualitäts-Gate (deterministischer Linter + advisory LLM-QA)
  │     bash scripts/plan-lint.sh openspec/changes/<slug>/tasks.md || exit 1
  │     bash scripts/plan-qa-check.sh openspec/changes/<slug>/tasks.md || true   # advisory
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

### Guards des Feature-Pfads

- **Brainstorming ist nicht optional** — weder im Feature- noch im Fix-Pfad. Es entscheidet, was
  überhaupt gebaut wird; ein Plan ohne vorherige Klärung plant die falsche Sache sorgfältig.
- **Ticket vor Branch** (T001917, T002050): Steht die `TICKET_EXT_ID` fest, trägt der Branch sie
  als Suffix (`feature/<slug>-T002050`). Existiert noch kein Ticket, wird es **vor** der
  Worktree-Anlage erstellt. Sonst schlägt `preflight-pr-scope.sh` beim PR fehl.
- **Disjunkte Partials (D1):** Keine Datei darf in zwei Partials liegen — `scripts/plan-lint.sh`
  erzwingt das. Das letzte Partial ist **immer** die Tests-Rolle. Obergrenze 9.
- **Plan-Mutation:** Sobald ein Partial enqueued ist, darf der Planner es nicht mehr ändern.
- **Qualitäts-Gate vor Design-Assets:** Jedes synchronisierte SVG vor dem Ablegen prüfen —
  `currentColor` statt `<img>`-Einbettung, keine Stray-Hex-Werte, kein Root-`width/height`,
  Export-Vollständigkeit. Unpassende Assets werden **verworfen**, nicht mitkopiert (T000756).

### Fix-Pfad

## Fix-Pfad

Ein Fix braucht **zwingend einen failing Test**, bevor der Plan geschrieben wird — Rot-Grün ist
hier harte Voraussetzung, nicht Stilfrage. Der Test gehört nach `tests/spec/<spec-slug>.bats`
(die Spec aus `openspec/specs/`), nicht in eine neue ticket-nummerierte Datei.

- Lege Bug-Ticket an (via ticket-mcp `create_ticket`), schreibe failing Test, erstelle Plan, stage, commit und push.
- Hinweis: Erstelle zusätzlich zu `design.md` auch `openspec/changes/<slug>/specs/<parent-ssot-slug>.md` nach der T001304-Delta-Konvention. **Pflicht-Format:** Die Delta-Spec MUSS exakt einen der vier Abschnitts-Header verwenden: `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` oder `## RENAMED Requirements`. Jede Anforderung beginnt mit `### Requirement: <Titel>` und enthält **mindestens einen** `#### Scenario:`-Block im GIVEN/WHEN/THEN-Format. `## ADDED:` / `## MODIFIED:` (ohne "Requirements") und Szenario-lose Requirements werden von `scripts/openspec-validate.test.ts` → `validateTree` abgelehnt und blockieren den CI-Merge.
- `--hold`-Pflicht für interaktive Stage-Calls: Der Aufruf von `stage-plan` in diesem Schritt
  MUSS `--hold` setzen. Dadurch wird das Ticket vom Factory-Dispatch zurückgehalten, bis
  `opencode-flow-execute` es explizit freigibt.

### Pre-Commit Guard (PFLICHT vor Commit) [T001268]

Bevor der plan-stage Commit läuft, MUSS der Operator verifizieren:

1. **Nicht auf main committen:**
   ```bash
   CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
   [ "$CURRENT_BRANCH" != "main" ] || { echo "FATAL: plan-stage commit auf main ist verboten" >&2; exit 1; }
   ```
2. **Sauberer Status ist Pflicht:**
   ```bash
   [ -z "$(git status --porcelain)" ] || { echo "FATAL: working tree ist nicht sauber" >&2; exit 1; }
   ```
3. **Branch stimmt mit agent-lock claim überein:**
   ```bash
   LOCK_FILE="$(git rev-parse --git-common-dir)/agent-locks/ticket__${TICKET_EXT_ID}.json"
   [ -f "$LOCK_FILE" ] || { echo "FATAL: kein ticket-scoped agent-lock-Claim für $TICKET_EXT_ID" >&2; exit 1; }
   CLAIMED_BRANCH="$(jq -r '.branch' "$LOCK_FILE" 2>/dev/null)"
   [ "$CLAIMED_BRANCH" = "$CURRENT_BRANCH" ] || { echo "FATAL: branch mismatch" >&2; exit 1; }
   ```

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `opencode-git-workflow` | Commit/Push/PR-Schritte |
| `opencode-flow-execute` | **Nachfolger** — implementiert den Plan |
| `opencode-flow-chore` | Geschwister — Chores statt Features/Fixes (direkter Kurzschluss) |
| `mishap-tracker` | Abschluss — protokolliert Frictions |
| `background-agents.ts` | Read-only Subagent für Plan-Schreiben |
| `using-git-worktrees` | Hintergrund — ersetzt durch `scripts/worktree-create.sh` (git-crypt-safe) |
| `worktree.ts` / `scripts/worktree-create.sh` | Worktree-Erstellung (Wrapper nötig wg. git-crypt) |

## Nachbereitung & Mishap Report

Melde alle aufgetretenen Fehler oder Prozess-Frictionen am Ende über `mishap-tracker`
(aufrufbar via `bash scripts/hooks/mishap-tracker.sh`).

## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — native skill for opencode. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |