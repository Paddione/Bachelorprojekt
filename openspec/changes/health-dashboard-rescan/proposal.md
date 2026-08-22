# Proposal: health-dashboard-rescan

## Why

Das Repo Health Dashboard im SDLC-Leitstand
(`components/website/src/components/sdlc/GoalsDashboard.svelte`) zeigt heute ausschließlich den
Stand, den der nightly Workflow `health-goals.yml` zuletzt nach `.claude/lib/goals.md` geschrieben
hat. Wer an einem Ziel arbeitet, sieht das Ergebnis frühestens am nächsten Morgen — und hat keinen
Weg, aus einem verfehlten Ziel Arbeit zu machen, ohne das Ticket von Hand zu tippen.

Beide Lücken lassen sich schließen, ohne neue Messlogik zu schreiben:
`scripts/health-goals-check.sh` kann bereits `--only=<IDs>` und schreibt bei gesetztem
`HG_VALUES_FILE` maschinenlesbare Zeilen; `scripts/code-quality/loop.sh` zeigt, wie aus einem
verfehlten Zielwert ein deduplizierter Ticket-Eintrag wird.

## What

Das Dashboard bekommt drei Fähigkeiten:

1. **Markieren** — jede Ziel-Karte erhält eine Checkbox. Die Auswahl bleibt über den
   Kategorie-Filter hinweg stabil.
2. **Neu scannen** — ein Button misst die markierten Ziele live über
   `scripts/health-goals-check.sh --only=<IDs>` und zeigt die frischen Werte im Dashboard.
3. **Tickets erzeugen** — ein zweiter Button legt je markiertem Ziel ein Verbesserungs-Ticket an,
   dedupliziert gegen bereits offene Tickets zur selben Ziel-ID.

### Entscheidungen

**D1 — Transiente Overlay-Anzeige statt Rückschreiben.** Der Rescan schreibt **nicht** nach
`.claude/lib/goals.md` und regeneriert `goals-data.generated.json` nicht. Das Dashboard zeigt den
frisch gemessenen Wert **neben** dem dokumentierten, mit Drift-Kennzeichnung. Damit bleiben
`REQ-HEALTH-GOALS-001` (goals.md als alleinige Autoren-SSOT), `REQ-HEALTH-GOALS-003`
(Freshness-Gate) und `REQ-HEALTH-GOALS-009` (atomarer Commit von SSOT und Artefakt im nightly
Workflow) unangetastet. Ein Schreibpfad aus der UI würde mit genau diesem Workflow um dieselbe
Datei konkurrieren und das Freshness-Gate in fremden Pull Requests rot färben.

**D2 — Ein Ticket je Ziel.** Jedes markierte Ziel wird ein eigenes Ticket mit Ziel-ID, Ist- und
Zielwert, Richtung, Messbefehl und Quelle. Dedup über ein stabiles Titel-Präfix gegen Tickets, die
nicht `done`/`archived`/`wont-fix` sind — dasselbe Verfahren wie `has_open_ticket()` in
`scripts/code-quality/loop.sh`. Kein automatisches `enqueue`: der Operator entscheidet, was in die
Factory-Queue geht.

**D3 — Nicht messbare Ziele bleiben ankreuzbar.** Liefert die Messung den SKIP-Sentinel `-`,
schreibt `row()` keine Zeile in `HG_VALUES_FILE`. Das Dashboard zeigt für ein solches Ziel
ausdrücklich „nicht messbar" — nicht den alten Wert, nicht eine Leerstelle und keinen Erfolgswert.
Ein stiller Messausfall, der wie ein Ergebnis aussieht, ist die Fehlerklasse aus T002583/T002648
(`tests/spec/health-goals/measurement-integrity.bats`); sie darf über das Dashboard nicht neu
entstehen.

**D4 — Ziel-IDs werden gegen die bekannte Goal-Liste validiert, nicht nur gefiltert.** Die IDs aus
dem Request landen in der Kommandozeile von `health-goals-check.sh`. Eine reine Zeichen-Whitelist
lässt unbekannte, aber wohlgeformte IDs durch; die Prüfung erfolgt deshalb gegen die IDs aus
`goals-data.generated.json`, und die Argumente werden als Array an `spawn` übergeben, nie über eine
Shell.

### Abgrenzung

Kein Schreibzugriff auf `.claude/lib/goals.md`, keine zweite Wertquelle im Website-Bundle, keine
Änderung an `health-goals.yml` oder am Generator `gen-goals-data.mjs`.

_Ticket: T013306_
