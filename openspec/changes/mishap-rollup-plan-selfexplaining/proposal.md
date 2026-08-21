---
title: Proposal: mishap-rollup-plan-selfexplaining
ticket_id: T013043
domains: [factory]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Proposal: mishap-rollup-plan-selfexplaining

## Why

Der Rollup-Plan sagt einem Executor-Modell nicht, wie der Container abzuarbeiten ist. Er trägt
immer genau drei generische Checkboxen (RED / GREEN / Final Verification), gleich ob der Batch
3 oder 30 Einträge hat; die Einträge selbst stehen als Blockquote-Prosa darunter. Es gibt damit
keinen Zustand, in dem ein einzelner Eintrag "offen" sein kann — und folglich nichts, was ein
Merge unfertig lassen könnte.

Belegt an den letzten drei Zyklen (jeweils gegen die gemergten Commits geprüft):

| Zyklus | Einträge | In main gelandet | Container-Ende |
|---|---|---|---|
| 08-19 / T012445 (PR #4886, `d6a1cedeb`) | 10 | nur der Plan, 0 Code-Dateien | Factory gab nach 3 Watchdog-Runden auf |
| 08-20 / T012909 (PR #4884, `c0d881b7b`) | 10 | 3 Doku-/Config-Zeilen | `done · fixed`, tasks.md mit 0 abgehakten Boxen |
| 08-21 / T012445 (PR #4909, `d40349303`) | 10 | 4 Skripte + 2 Tests, 5 Einträge real gefixt | `done · fixed` |

Der 08-21-Lauf ist der einzige mit einer Dispositions-Tabelle — sie entstand von Hand, nicht aus
dem Generator. Genau diese Struktur soll der Generator künftig selbst liefern.

Zweite Ursache im selben Generator: die Kommentar-Auswahl filtert nur
`body NOT LIKE 'FACTORY-PLAN-REF%'`. Damit gelten Watchdog-Meldungen, `Unfactored`-Notizen und
Executor-Kommentare als Batch. Messung gegen die lebende Ticket-DB:

```bash
# Stand: 2026-08-22, Container T012445
psql -c "SELECT count(*) FROM tickets.ticket_comments c
         JOIN tickets.tickets t ON t.id = c.ticket_id
         WHERE t.external_id = 'T012445' AND c.body NOT LIKE 'FACTORY-PLAN-REF%';"
# -> 16 — real ist EIN Mishap-Kommentar mit 10 Einträgen, 15 sind Automatik-Rauschen
```

Folgen: ein Container ohne einen einzigen Mishap kann einen Leerzyklus auslösen, und das Rauschen
landet wörtlich im Plan — im 08-21-Plan stehen sechs `Watchdog: pipeline stale`-Zeilen mitten
zwischen den Mishap-Beschreibungen und lesen sich für den Executor wie Arbeitsanweisungen.

## What

Ein eigenständiger, per stdin testbarer Renderer `scripts/factory/rollup-plan-tasks.sh` — gebaut
nach dem Muster von `scripts/factory/mishap-rollup-artifacts.sh`, das Batch-Einträge bereits so
parst (`**N. Titel** (typ, komponente)`) und deshalb ohne DB testbar ist. Er liefert:

- eine Task pro Mishap-Eintrag, mit Titel und Pflicht-Disposition,
- eine Arbeitsanweisung im Kopf, die die drei zulässigen Dispositionen benennt,
- `--count` als einzige Wahrheit über die Zahl echter Batch-Einträge.

`scripts/factory/mishap-rollup.sh` verwendet ihn für beides: für die Batch-Zählung (No-op-Pfad)
und für die Tasks-Sektion des Plans. Die Filterlogik lebt damit an genau einer Stelle und ist
über stdout prüfbar, statt in zwei SQL-Statements verstreut zu sein.

**Nicht Teil dieses Changes:** Carry-over unerledigter Einträge in den Folge-Container und ein
hartes Merge-Gate auf abgehakte Eintrags-Tasks. Beides ändert die Mechanik des Lebenszyklus, nicht
die Verständlichkeit des Plans, und gehört in einen eigenen Change.

_Ticket: T013043_
