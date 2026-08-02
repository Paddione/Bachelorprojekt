---
ticket_id: T002107
plan_ref: openspec/changes/health-goals-scan-streamline/tasks.md
status: active
date: 2026-07-23
---

# Design: health-goals-scan-streamline

> Brainstorming-Session 2026-07-23 (autonomer Modus — User-Intent aus dem Request abgeleitet,
> Annahmen unten explizit dokumentiert). Ticket: T002107.

## Problem

`.claude/lib/goals.md` (SSOT, 81 Prio-C-Tabellenzeilen + ~15 Prio-A/B-Freitextziele) wird von
`scripts/health-goals-check.sh` (471 Zeilen) gemessen und von `scripts/health-goals-update.sh`
(215 Zeilen) fortgeschrieben — aber nur für Bare-Integer-Zellen der Prio-C-Tabelle. Drei
Lücken erzeugen wiederkehrende Handarbeit:

| Lücke | Evidenz |
|---|---|
| Zell-Formate `95 %`, `Exit 0`, `0/34`, `6 Tage`, `~3587 Tage`, `n/a` werden übersprungen (`skipped_format`) | `bare_int_re` in health-goals-update.sh:108; 6 manuelle Baseline-Update-Einträge 2026-07-17…22 |
| Prio-A/B-Metazeilen (`**A · Baseline:** 0 → 2 …`) werden manuell gegen frische Messungen abgeglichen | Update-Skript-Header: „bleiben menschlicher Redaktion vorbehalten" |
| Qualitative/eingeschränkt reproduzierbare Ziele (`Elite`, `Median 0.03h`, DORA, Audits) und SKIP-Fälle (`-`) veralten still | `row()`-SKIP-Pfad health-goals-check.sh:49; „Reproduzierbar: eingeschränkt" |

## Entscheidungen

### D1 — Formaterhaltende Zell-Parser-Erweiterung (health-goals-update.sh)

Der Python-Teil des Update-Skripts bekommt zusätzliche Whitelist-Zellformate; jedes Format
wird beim Rückschreiben **erhalten** (Suffix/Präfix bleibt, nur die Zahl wechselt):

| Format | Beispiel-Zelle | Rückschreib-Regel |
|---|---|---|
| Prozent | `95 % ✓` | `<actual> % <marker>` |
| Exit-Code | `Exit 0 ✓` | `Exit <actual> <marker>` |
| Einheiten-Suffix | `22 h`, `6 Tage`, `36 Tage`, `~3587 Tage` | `<actual> <unit> <marker>` (Tilde wird beim Neuschreiben verworfen) |
| Bruch | `0/34 ✓`, `3/34` | Zähler = `<actual>`, Nenner bleibt stehen (Messwert des Check-Skripts ist der Zähler) |
| n/a-Backfill | `n/a ✓` | wird durch `<actual> <marker>` ersetzt, sobald ein Messwert vorliegt |

Alles außerhalb der Whitelist bleibt fail-safe in `skipped_format` (z. B. `Elite`,
`Median 0.03h`, `0/50 adj.`) — dafür ist D3 zuständig. Vergleichslogik (`le/ge/eq`)
unverändert; der `✓/⚠`-Marker wird wie bisher aus dem Vergleich abgeleitet.

**Trade-off:** Bruch-Nenner können driften (34 Deployments heute, 36 morgen) — bewusst
akzeptiert, weil der Nenner beschreibender Kontext ist und Nenner-Drift weiterhin im
Drift-Report (D2) sichtbar wird.

### D2 — Drift-Report statt Auto-Edit für Prio A/B (`--drift`)

Neuer Modus in `health-goals-update.sh` (kein neues Skript — S1-Budget 285 Zeilen reicht):

1. Messlauf wie bisher → `HG_VALUES_FILE` (`<id> <actual> <cmp> <target>`).
2. `website/src/lib/goals-data.generated.json` liefert die dokumentierten `current`-Werte
   **aller** Ziele inkl. Prio A/B — Parser-SSOT bleibt `gen-goals-data.mjs`
   (REQ-HEALTH-GOALS-002); es entsteht kein zweiter goals.md-Parser.
3. Join über die Goal-ID; Ausgabe pro Ziel: `<id>: dokumentiert <current> · gemessen
   <actual> [DRIFT]`, gruppiert nach Priorität. Exit 0 immer (reiner Report; die
   Gate-Semantik lebt weiter in health-goals-check.sh).

Die Prio-A/B-Policy („menschliche Redaktion") bleibt unangetastet — der Report ersetzt nur
das *Auffinden* der Drift, nicht das Einpflegen.

**Voraussetzung:** generierte JSON ist per Freshness-Gate (REQ-HEALTH-GOALS-003) aktuell —
bei stale JSON warnt der Report (mtime-Vergleich goals.md vs. JSON) statt still falsch zu joinen.

### D3 — LLM-Fill via Unified-LLM-Gateway (neues Skript)

`scripts/health-goals-llm-fill.sh` (neu, eigenes 500-Zeilen-S1-Budget):

- **Kandidaten-Ermittlung:** IDs aus `goals-data.generated.json`, die im `HG_VALUES_FILE`
  des Messlaufs fehlen oder als SKIP (`-`) endeten — d. h. genau die deterministisch
  nicht abgedeckten Ziele. `--only=ID,ID` schränkt ein.
- **Dispatch:** pro Ziel ein `curl`-Call gegen `${HG_LLM_URL:-http://localhost:18235/v1}/chat/completions`
  (T002102-Gateway; serialisiert Bonsai-Requests selbst, keine Parallel-Steuerung nötig),
  Modell `${HG_LLM_MODEL:-bonsai}`. Prompt-Kontext: die Goal-Sektion aus goals.md (Titel,
  Was-Absatz, Basis-Messung) + optional das Ergebnis des dokumentierten Messbefehls, wenn
  dieser mit Timeout read-only ausführbar ist.
- **Antwort-Contract (striktes JSON):** `{"id","value","unit","confidence","evidence",
  "reproducible_cmd_suggestion"}` — Parse-Fehler ⇒ Ziel wird als `unfillable` gelistet,
  kein Retry-Loop (Gateway-Queue nicht fluten).
- **Output:** Report nach stdout + `tmp/claude-scratch/health-goals-llm-fill-<date>.md`.
  Default **report-only**. `--apply` schreibt ausschließlich Prio-C-„Aktuell"-Zellen und
  markiert den Wert mit `(LLM)`-Provenance; Prio-A/B-Text wird **nie** geschrieben.
  `confidence < 0.7` ⇒ immer report-only, auch mit `--apply`.
- **Leitplanke (Doku-Maxime „ohne reproduzierbaren Messbefehl kein Ziel"):** das primäre
  Deliverable des LLM ist der `reproducible_cmd_suggestion` — der Weg zurück in die
  deterministische Abdeckung. Der LLM-Wert ist Übergangs-Befund, kein Ersatz für Messung.

**Warum Gateway statt Subagent-Framework:** Claude-Code-`Agent`-Subagenten laufen nur auf
Claude-Modellen; opencode-Bonsai-Subagenten existieren nur in opencode. Ein `curl` gegen den
OpenAI-kompatiblen Gateway ist framework-agnostisch (Claude Code, opencode, Factory, Cron).

### D4 — Wiring

- Taskfile: `health:goals:drift`, `health:goals:llm-fill` (analog `health:goals:update`,
  `{{.CLI_ARGS}}`-Durchreichung).
- `goals.md` Mess-Werkzeug-Sektion: beide Kommandos dokumentieren.
- Tests: `tests/spec/health-goals.bats` (existiert) — Fixture-Zellen aller neuen Formate via
  `HG_GOALS_FILE`/`HG_VALUES_FILE`-Seams; Mock-Gateway für llm-fill via `HG_LLM_URL` auf
  lokalen Fixture-HTTP-Server (python3 `http.server`-Oneshot) — kein echter LLM in CI.

## Verworfene Alternativen

1. **Auto-Edit der Prio-A/B-Metazeilen** — bricht die dokumentierte Kontext-Policy,
   Regex-fragil gegen Freitexte wie `0 → 2 (2026-07-22, Regressions-Check)`.
2. **Erweiterung von `health-goals-check.sh`** — S1-Budget nur 29 Zeilen (471/500,
   nicht gebaselined); jede substanzielle Erweiterung erzwänge einen Datei-Split.
   Deshalb fließt alles Neue in update.sh bzw. ein neues Skript.
3. **Claude-Code-`Agent`-Dispatch für Bonsai** — Agent-Tool kann keine lokalen Modelle;
   nicht reproduzierbar außerhalb einer Claude-Code-Session.
4. **Direkter Bonsai-Port (:8093/:18236)** — der T002102-Gateway ist genau dafür da
   (Serialisierung, Kontext-Budget-Deckelung, Backend-Failover); Direktzugriff umginge das.
5. **LLM-Werte direkt als SSOT-Werte ohne Marker** — verletzt die Reproduzierbarkeits-Maxime
   des Dokuments; Provenance-Marker + report-only-Default sind der Kompromiss.

## Annahmen (autonome Defaults — bei Review korrigierbar)

- Provenance-Marker: `(LLM)` hinter dem Wert in der Aktuell-Zelle.
- Confidence-Schwelle für `--apply`: 0.7.
- Modell-Alias `bonsai` am Gateway (Fallback: erstes verfügbares Modell aus `/v1/models`).
- Gateway nicht erreichbar ⇒ Skript exit 0 mit Warnung (Cron-freundlich), `--strict` für exit 1.

## Scope-Grenzen

- Keine Änderung an `gen-goals-data.mjs` oder dem Freshness-Gate.
- Keine neuen Goals — nur Prozess-Tooling.
- `health-goals-check.sh` wird nicht angefasst (S1).
