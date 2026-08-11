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
In opencode ist `lavish` nicht verfügbar (`.opencode/opencode.jsonc` deny-Liste);
Brainstorming und Q/A laufen über strukturierte Frage-Listen im Chat. Falls durchgeführt,
erstelle das Grilling-Ticket via ticket-mcp (`create_ticket` mit type=task, title="Grilling: <kurzer-titel>").

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

Erzeuge `intel.json` deterministisch mit `scripts/plan-intel.sh`:

```bash
bash scripts/plan-intel.sh <slug> --target-files <datei1> <datei2> ...
```

Das Skript sammelt `impact_files` (wc -l, s1-Limits), `symbols` (Funktionen, Typen), `call_graph` und `risks` automatisch. `plan-lint.sh` prüft I1 auf Vollständigkeit und warnt/failt, wenn die Datei fehlt oder target_files nicht abdeckt. Quellen im Fehlerfall manuell: codebase-memory MCP (`search_graph`/`trace_path`) für `symbols`/`call_graph`, mcp-postgres für `db_tables`, `wc -l` + `baseline.json` für `s1`-Budgets.

#### Schritt A.2: Design-Bundle co-lokalisieren (nur UI-Tickets)

Wenn ein Design-Handoff existiert, lege Assets in `openspec/changes/<slug>/assets/` im main-Checkout an.

#### Schritt A.3: Lavish-Board starten ⚡ empfohlenes Werkzeug — vor Brainstorming

In opencode ist `lavish` nicht verfügbar (`.opencode/opencode.jsonc` deny-Liste).
Brainstorming läuft über strukturierte Frage-Listen im Chat — notiere Entscheidungen
direkt im `proposal.md`-Draft.

#### Schritt A.4: Brainstorming ⚡ IMMER

Starte strukturiertes Brainstorming mit dem User. Vor dem Brainstorming: **Prior-Art-Suche [T002829]** — prüfe `openspec/specs/` und `tests/spec/` auf bestehende Entscheidungen, die das aktuelle Problem bereits adressieren:

```bash
grep -rl '<Schlüsselwort>' openspec/specs/ tests/spec/ | head -10
```

Gefundene Entscheidungen im Change-Proposal zitieren; die Frage heißt dann „bestehende Entscheidung beibehalten oder bewusst ersetzen?", nicht „zum ersten Mal lösen". Nutze das `lavish`-Board aus A.3 für visuelle Dokumentation und strukturiertes Feedback. Tracke Fortschritt mit einer Plain-Text-Checkliste. Verwende einen read-only Subagenten (`delegate(prompt, agent)`) für Code-Exploration (Architektur/Code-Pfade).

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
# Preflight: wurde das Ticket bereits auf main gemergt? [T002279]
bash scripts/plan-preflight.sh pre-worktree --ticket "$TICKET_EXT_ID"
# rc=0 = fortfahren, rc=1 = bereits gemergt (Ticket done + abbrechen), rc=2 = Umgebung reparieren

bash scripts/worktree-create.sh feature/<slug>-T"$TICKET_EXT_ID" .worktrees/<slug>
bash scripts/agent-lock.sh claim branch "feature/<slug>-T$TICKET_EXT_ID" --worktree ".worktrees/<slug>" --label opencode-flow-plan
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
git push -u origin feature/<slug>-T"$TICKET_EXT_ID"
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
| gemma26-factory (26B) | 5 | 10 | ~161024 |
| deepseek-* (Cloud) | 10+ | 50 | 128K–1M |

#### Schritt C.2: Pipeline-Loop — Pro Partial: Plan → Stage → Enqueue → Factory

Führe für **jedes Partial** in Reihenfolge aus (außer das letzte Tests-Partial, das erst
nach allen anderen gestaged wird):

```
FOR each partial pX (p1, p2, ...):
  │
  ├─► Schritt C.2a: Partial-Plan schreiben
  │     Fan-out Subagent via `delegate(prompt, agent="explore")` — Kontext: proposal.md,
  │     intel.json-Subset, Quality-Gates. Der Prompt injiziert VERBINDLICH:
  │     (1) die Referenz `plan-quality-gates.md`, (2) die Ausgabe von
  │     `bash scripts/plan-lint.sh --rules` als führende Instruktion („gleiche Karten"
  │     wie Factory und Claude). Schreibt `tasks.d/pX-<name>.md`.
  │
  ├─► Schritt C.2b: tasks.md-Index aktualisieren
  │     Der Orchestrator updated `tasks.md` mit dem neuen Partial-Eintrag im Manifest
  │     und der aktualisierten File Structure.
  │
  ├─► Schritt C.2c: Commit + Push (Partial ist im Branch sichtbar)
  │     git add openspec/changes/<slug>/
  │     git commit -m "chore(plans): add partial pX-<name> for <slug> [$TICKET_EXT_ID]"
  │     git push origin feature/<slug>-T"$TICKET_EXT_ID"
  │
  ├─► Schritt C.2d: Plan stagen (plan_staged + slot_count setzen)
  │     # --no-hold: Pipeline-Dispatch — das Partial soll SOFORT von der Factory
  │     # verarbeitet werden, waehrend der Planner das naechste Partial schreibt.
  │     # stage-plan verlangt seit T003267 eine explizite Hold-Entscheidung.
  │     bash scripts/ticket.sh stage-plan \
  │       --id "$TICKET_EXT_ID" \
  │       --branch "feature/<slug>-T$TICKET_EXT_ID" \
  │       --plan "openspec/changes/<slug>/tasks.md" \
  │       --partials N --no-hold
  │
  ├─► Schritt C.2e: Readiness-Flags setzen (damit auto-enqueue greift)
  │     ticket-mcp: set_readiness_flag({ id: "$TICKET_EXT_ID", flag: "spec_skizziert", value: true })
  │     ticket-mcp: set_readiness_flag({ id: "$TICKET_EXT_ID", flag: "abhaengigkeiten_klar", value: true })
  │     ticket-mcp: set_readiness_flag({ id: "$TICKET_EXT_ID", flag: "offene_fragen_geklaert", value: true })
  │     ticket-mcp: set_readiness_flag({ id: "$TICKET_EXT_ID", flag: "aufwand_geschaetzt", value: true })
  │
  ├─► Schritt C.2e5: Read-After-Write-Verifikation [T002929]
  │     Die gesetzten Flags muessen per DB-Abfrage BESTAETIGT werden — nicht einfach die
  │     beabsichtigten Werte behaupten.
  │
  │     # Alle 4 DoR-Flags + lastenheft_locked aus der DB lesen:
  │     DB_READINESS=$(mcp__mcp-postgres__query({
  │       sql: "SELECT readiness FROM tickets.tickets WHERE external_id = '$TICKET_EXT_ID'"
  │     }))
  │     # Erwartete Werte pruefen:
  │     for flag in spec_skizziert abhaengigkeiten_klar offene_fragen_geklaert aufwand_geschaetzt; do
  │       val=$(echo "$DB_READINESS" | jq -r ".[0].result | fromjson | .readiness.$flag // false")
  │       [ "$val" != "true" ] && echo "FEHLER: Readiness-Flag $flag wurde NICHT in die DB geschrieben (Wert: $val)" >&2 && exit 1
  │     done
  │     # Status verifizieren:
  │     DB_STATUS=$(mcp__mcp-postgres__query({
  │       sql: "SELECT status FROM tickets.tickets WHERE external_id = '$TICKET_EXT_ID'"
  │     }))
  │     ACTUAL_STATUS=$(echo "$DB_STATUS" | jq -r ".[0].result | fromjson | .status")
  │     [ "$ACTUAL_STATUS" != "plan_staged" ] && echo "FEHLER: Ticket-Status wurde NICHT auf plan_staged gesetzt (IST: $ACTUAL_STATUS)" >&2 && exit 1
  │
  │     Bei Diskrepanz: process.exit(1) — die Rückmeldung DARF NICHT einfach
  │     die beabsichtigten Werte durchreichen, sie muss die DB-Wahrheit abbilden.
  │     [T002929] Fix: Plan-Agenten melden Readiness-Flags falsch (behaupten
  │     Werte, die sie zu setzen GEDACHT haben, statt die tatsaechlichen DB-Werte).
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
        git push origin feature/<slug>-T"$TICKET_EXT_ID"
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
- **Rotphasen-Binary-Guard [T002820]:** Verfügbarkeits-`skip` gehört in die Rotphase.
  `grep -rn '<binary>' .github/workflows/` — 0 Treffer heißt: das Binary ist in CI nicht
  vorhanden, der Test muss dafür skippen (`skip "binary not in CI"`) und lokal mit dem
  vorhandenen Binary laufen.
- **Symptom-vs-Hypothese [T002448-M5]:** Im Fix-Pfad die Bug-Ursache mit minimalem
  Reproducer oder Log-Evidenz belegen, BEVOR die Lösung entworfen wird.
- **Stage-Commits heißen `chore(plans):` [T001434]:** Plan-Commits tragen NIEMALS
  `fix()`- oder `feat()`-Präfixe — Implementierungs-Präfixe wären eine Lüge;
  `scripts/check-commit-vs-diff.sh` + `.githooks/commit-msg` blockieren sie.
- **Kein fertig aussehender PR aus dem Plan-Stand [T002816]:** Am Ende von `opencode-flow-plan`
  ist der Branch gepusht, der Plan committed, das Ticket `plan_staged`, der Lock aktiv —
  aber es gibt KEINEN PR. Wenn früh ein PR gebraucht wird (z.B. für CI-Feedback):
  Draft + Titel-Präfix `[plan-only]`.

### Fix-Pfad

## Fix-Pfad

Ein Fix braucht **zwingend einen failing Test**, bevor der Plan geschrieben wird — Rot-Grün ist
hier harte Voraussetzung, nicht Stilfrage. Der Test gehört nach `tests/spec/<spec-slug>.bats`
(die Spec aus `openspec/specs/`), nicht in eine neue ticket-nummerierte Datei.

- Lege Bug-Ticket an (via ticket-mcp `create_ticket`), schreibe failing Test, erstelle Plan, committe, pushe, DANN stage — und zwar IMMER nach dem Commit, weil `stage-plan` den Plan per `git cat-file -p "${branch}:${plan}"` aus dem Branch-Commit liest (T002673): vor dem Commit steht dort das propose-Skeleton, `touched_files` bliebe leer — seit T003267 bricht `stage-plan` dann hart ab.
- Hinweis: Erstelle zusätzlich zu `design.md` auch `openspec/changes/<slug>/specs/<parent-ssot-slug>.md` nach der T001304-Delta-Konvention. **Pflicht-Format:** Die Delta-Spec MUSS exakt einen der vier Abschnitts-Header verwenden: `## ADDED Requirements`, `## MODIFIED Requirements`, `## REMOVED Requirements` oder `## RENAMED Requirements`. Jede Anforderung beginnt mit `### Requirement: <Titel>` und enthält **mindestens einen** `#### Scenario:`-Block im GIVEN/WHEN/THEN-Format. `## ADDED:` / `## MODIFIED:` (ohne "Requirements") und Szenario-lose Requirements werden von `scripts/openspec-validate.test.ts` → `validateTree` abgelehnt und blockieren den CI-Merge.
- `--hold`-Pflicht für interaktive Stage-Calls: Der Aufruf von `stage-plan` im Fix-Pfad MUSS `--hold` setzen. Dadurch wird das Ticket vom Factory-Dispatch zurückgehalten, bis `opencode-flow-execute` es explizit freigibt. Seit T003267 bricht `stage-plan` ohne eines der beiden Flags (`--hold`/`--no-hold`) mit Exit 1 ab.

### Pre-Commit Guard (PFLICHT vor Commit) [T001268]

Bevor der plan-stage Commit läuft, MUSS der Operator `plan-preflight.sh` aufrufen. Das Skript bündelt alle drei Checks (nicht-main, clean tree, Lock-Match) und den branch-scoped Fallback [T003102] — ein Einzeiler statt drei Inline-Snippets:

```bash
bash scripts/plan-preflight.sh pre-commit --ticket "$TICKET_EXT_ID"
# rc=0 = alle Checks grün · rc=1 = Guard verletzt · rc=2 = Umgebungsfehler
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