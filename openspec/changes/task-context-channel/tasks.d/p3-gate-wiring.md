---
title: "p3 — Vollständigkeits-Gate und Verdrahtung beider Konsumenten"
ticket_id: T002420
domains: [factory, infra, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# p3 — Vollständigkeits-Gate und Verdrahtung

**Zieldateien:**

| Datei | Ist | Budget |
|---|---|---|
| `scripts/plan-lint.sh` | 411 | 89 |
| `scripts/factory/pipeline.mjs` | 663 | n/a (auf `s1.ignore`) |
| `.claude/skills/dev-flow-execute/SKILL.md` | 250 | n/a (S1-ungated) |
| `.claude/skills/references/dev-flow-plan-phases.md` | 327 | n/a (S1-ungated) |

## Task 1: plan-lint-Regel I1 — Vollständigkeit statt Existenz

In `scripts/plan-lint.sh`, im bestehenden Partial-Modus-Block (ab Zeile 140, dort wo das
`## Partials`-Manifest bereits geparst wird und D1 die Disjunktheit prüft). Die Regel meldet über
die vorhandene `hard`-Funktion, damit sie in `emit_verdict` einfließt.

Geprüft wird für einen Plan mit `tasks.d/`:

1. `openspec/changes/<slug>/intel.json` existiert und ist valides JSON.
2. `meta`, `impact_files` und `symbols` sind nicht leer.
3. Die Menge der `impact_files[].path` deckt die Union aller `target_files` aus dem Manifest ab.
   Nicht abgedeckte Dateien werden **namentlich** in der Fehlermeldung genannt — eine Meldung wie
   „Bundle unvollständig" ohne Dateinamen zwingt den Leser zur Nachforschung.

Fehlt `tasks.d/`, greift I1 nicht (Einzelplan-Modus bleibt unverändert).

**Budget-Hinweis:** 89 Zeilen Spielraum bei einem 500er-Limit. Die Regel ist als eigene Funktion
neben `residual_budget` zu schreiben und knapp zu halten. Reicht der Platz nicht, ist die
Bundle-Prüfung in ein eigenes Skript zu **extrahieren**, das `plan-lint.sh` aufruft — kein
kosmetisches Zeilen-Zusammenziehen, das bei der nächsten Änderung erneut trippt.

## Task 2: Factory-Verdrahtung

Der Implementer-Prompt entsteht in `scripts/factory/pipeline.mjs` in der Schleife um Zeile 43-46
(Label `impl:${t.id}:${i}`). Dort wird die Ausgabe von `scripts/task-context.sh` vor den
bestehenden Prompt gehängt.

**Vor dem Verdrahten den lebenden Dispatch-Pfad bestätigen.** Neben `pipeline.mjs` bauen auch
`pipeline-runner.js` und `run-pipeline.mjs` Prompts. Welche Datei den Implementer tatsächlich
startet, ist zu verifizieren, statt es aus dem Dateinamen zu schließen — andernfalls wird eine tote
Stelle verdrahtet und die Wirkung bleibt aus, ohne dass ein Test das bemerkt.

`scripts/factory/task-source.cjs` bleibt **unverändert**. `tasks.md` bleibt die Plan-Quelle; der
Kontextblock kommt zusätzlich, nicht stattdessen.

Bricht `task-context.sh` mit Exit 1 ab (fehlender Kern), wird das Ticket nicht stumm mit
Minimalkontext dispatcht, sondern der Dispatch schlägt sichtbar fehl — die Diagnose landet im
Ticket-Kommentar.

## Task 3: dev-flow-execute-Verdrahtung — mit Netto-Verkleinerung

In `.claude/skills/dev-flow-execute/SKILL.md` ersetzt ein einzeiliger Skript-Aufruf die vierzeilige
Prosa-Anweisung zum Plan Intel Bundle (aktuell Zeilen 69-72).

**Harter Constraint:** Health-Goal G-AGENTIC09 zählt projekteigene `SKILL.md` mit über 250 Zeilen,
Ziel 0. Die Datei steht bei exakt 250 und das Ziel ist derzeit grün. Die Änderung muss die Datei
**verkleinern**, mindestens aber zeilenneutral bleiben. Prüfbefehl:

```bash
wc -l .claude/skills/dev-flow-execute/SKILL.md          # muss <= 250 bleiben
bash scripts/health-goals-check.sh 2>&1 | grep G-AGENTIC09
```

## Task 4: dev-flow-plan-Verdrahtung

In `.claude/skills/references/dev-flow-plan-phases.md` ersetzt Phase A.1.5 die Anweisung, sechs
Quellen von Hand abzufragen, durch den Aufruf von `scripts/plan-intel.sh`.

Der fail-softe Verschiebeschritt in Zeile 114 (`2>/dev/null || true`) wird durch einen
fehlschlagenden Schritt ersetzt. Er ist die mechanische Ursache dafür, dass ein fehlendes Bundle
bisher unbemerkt blieb: ein still fehlschlagender Pflichtschritt ist ein optionaler Schritt.

## Task 5: Konsistenz der beiden Konsumenten

Beide Pfade müssen denselben Assembler mit denselben Argumenten aufrufen. Ein Plan-Slug, für den
`task-context.sh` läuft, muss in Factory und `dev-flow-execute` denselben Kern liefern; nur die
frischen Signale dürfen sich unterscheiden, weil sie zu verschiedenen Zeitpunkten erhoben werden.
p4 prüft das.
