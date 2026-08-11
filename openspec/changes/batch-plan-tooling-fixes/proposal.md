# Proposal: batch-plan-tooling-fixes

## Why

Vier Mishap-Tickets dokumentieren Defekte in den Plan-Verifikations-Skripten
(`scripts/plan-*.sh`), die lokale Gate-Läufe und den Welle-1-Dispatch erschweren:

- **T003619** — `plan-touched-files.sh` mischt den Branch-Diff gegen den Merge-Base in
  die Kandidatenliste. Der T002446-Test „leere File-Structure meldet auf stderr und
  blockiert nicht" ist dadurch auf Feature-Branches rot (Diff nicht leer → stdout
  gefüllt), auf `main` grün (Diff leer). Der Test ist damit kein verlässlicher
  Indikator für lokale Gate-Läufe.
- **T003621** — `plan-qa-check.sh` hängt im Auto-Fix-Loop eine
  `## QA-Ergänzungen (Iteration 1/2)`-Sektion an die `tasks.md` an. Endet Iteration 2
  mit PASS, bleibt die Sektion im Artefakt zurück und muss manuell entfernt werden —
  plan-lint/plan-qa werten sie sonst als offene Anweisung. Ein advisorisches Werkzeug
  darf keine Boilerplate in das Artefakt schreiben, das es prüft.
- **T003623** — `plan-intel.sh --target-files` akzeptiert nur einen einzelnen Pfad
  (`Unknown option: b`). Die Erwartung aus `opencode-flow-plan` Step A.1.5 ist
  mehrere, leerzeichen-getrennte Pfade.
- **T003381** — `plan-qa-check.sh` Kriterium 5 („Der letzte Task enthält
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`") urteilt
  falsch-positiv, wenn die drei Kommandos als Checkbox-Task im Index stehen —
  plan-lint STRUCT3 prüft dieselbe Eingabe per grep als konform. Ein falsch-positives
  Kriterium kann über den Auto-Fix-Loop einen bereits konformen Plan verändern.

Gemeinsame Dateimenge: `scripts/plan-*.sh` + zugehörige `tests/spec/`. Keine
Dateikonflikte untereinander; die vier Fixes sind in einem Batch-Plan abbildbar.

## What

Ein OpenSpec-Change `batch-plan-tooling-fixes` (Ticket T003641), vier Partials:

- **p1 (T003619):** `plan-touched-files.sh` — der [T002765]-Diff-Ergänzungsblock wird
  HINTER die Kandidaten-Filterung verschoben und nur ausgeführt, wenn die
  plan-abgeleitete Kandidatenliste nicht leer ist. Leere/ableitungs-lose
  File-Structure → WARN auf stderr + leeres stdout + exit 0, unabhängig vom
  Branch-Diff. Die T002765-Ergänzung (real geänderte Dateien sichtbar machen) bleibt
  für Pläne mit Pfaden erhalten.
- **p2 (T003621 + T003381):** `plan-qa-check.sh` —
  - T003621: Im PASS-Pfad wird das Backup vor dem Verlassen zurückgespielt → das
    Artefakt bleibt bei grünem Ergebnis byte-identisch zum Eingang.
  - T003381: Kriterium 5 wird deterministisch per grep vorgeprüft (exakt die
    plan-lint STRUCT3-Semantik: `task test:changed`, `task freshness:regenerate`,
    `task freshness:check`). Fehlt eines → sofortiges deterministisches FAIL ohne
    LLM-Aufruf. Erfüllt → Kriterium 5 fliegt aus der LLM-Beurteilung (Prompt nennt
    es als deterministisch geprüft). Widerspruch zu plan-lint wird strukturell
    unmöglich.
- **p3 (T003623):** `plan-intel.sh` — `--target-files` konsumiert alle folgenden,
    nicht-`--`-präfixten Argumente (leerzeichen-getrennt, intern komma-vereinigt).
    Komma-Form bleibt abwärtskompatibel; leere Liste → bestehender Fallback auf die
    tasks.md-Partials-Auflösung.
- **p4 (Tests-Rolle):** Delta-Specs (`dev-flow-plan.md`, `quickwins-script-fixes.md`)
  + Verifikation. Die BATS-Tests je Fix liegen bei den Implementierungs-Partials
  (Muster aus dem Quick-Win-Batch T003276).

## Offene Punkte

Keine — die vier Kinder sind vollständig spezifiziert (Mishap-Beschreibungen mit
Root-Cause und Reproduktionsweg). Design-Entscheidungen:

1. **Diff-Ergänzung nicht entfernen, sondern gaten** (T003619): T002765 wurde
   bewusst eingeführt (Kollisionserkennung für unerwähnte, real geänderte Dateien).
   Der Defekt ist die Interaktion mit der leeren File-Structure — das Gate erhält
   den Nutzen und repariert den Vertrag.
2. **Backup-Restore im PASS-Pfad** (T003621): das Skript hält bereits in allen
   FAIL-Pfaden ein Backup (`cp "$BACKUP_FILE" "$PLAN_FILE"`); der PASS-Pfad nach
   Auto-Fix-Append war die einzige Leerstelle.
3. **Deterministische STRUCT3-Prüfung** (T003381): die 1:1-Übernahme der
   plan-lint-Grep-Semantik in `plan-qa-check.sh` eliminiert die Modell-Mehrdeutigkeit,
   statt sie per Prompt-Umformulierung nur zu entschärfen.
4. **Variadic `--target-files`** (T003623): Join mit Komma, weil der
   Datei-Split im Skript bereits auf Komma läuft (`IFS=',' read -ra FILES`).

_Ticket: T003641 (Batch) — Kinder: T003619, T003621, T003623, T003381_
