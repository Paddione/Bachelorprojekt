---
ticket_id: T002610
plan_ref: openspec/changes/factory-orphan-slot-reap/tasks.md
status: active
date: 2026-08-03
---

# Design: factory-orphan-slot-reap

Ergebnis des Brainstormings zu T002610 (+ T002618). Das WARUM und WAS steht in
[`proposal.md`](proposal.md); hier steht das WIE.

## Symptom vs. Hypothese (Bug-Triage T002448-M5)

| | |
|---|---|
| **Symptom (Fakt)** | T002482 stand in der Dispatcher-Queue und wurde bei jedem Tick übersprungen, ohne Signal. |
| **Hypothese des Tickets** | Der `pipeline_slot` aus einem abgebrochenen Lauf verhindert den Claim. |
| **Verifikation** | Am Code belegt: `slots.sh:40` (`WHERE … pipeline_slot IS NULL`), `slots.sh:24` (`count` filtert `status='in_progress'`), `schedule.sh:106` (`>/dev/null 2>&1`). Hypothese bestätigt. |
| **Zusatzbefund** | `slots.sh count`/`next` halten den Waisen-Slot für frei → mögliche Doppelvergabe. Bewusst außerhalb des Scopes (siehe proposal.md). |
| **Zweitbefund** | `watchdog.sh:160` bricht das Skript bei jedem stale Ticket ab. Eigenes Ticket T002618, hier mitbehoben, weil der Waisen-Sweep sonst wirkungslos wäre. |

## Komponenten

### 1. Waisen-Sweep in `watchdog.sh`

Neuer Block **am Ende** des Skripts, unmittelbar vor `echo "$escalated"`. Strukturell dem
`awaiting_deploy`-Sweep (Zeile 187-197) nachgebildet — dieselbe Form aus eigenem Schwellwert,
`mapfile`-Abfrage, Schleife und Eintrag ins `escalated`-Array.

```
FACTORY_ORPHAN_SLOT_MIN (Default 10)
  ↓
SELECT external_id FROM tickets.tickets
WHERE pipeline_slot IS NOT NULL
  AND status <> 'in_progress'
  AND updated_at < now() - make_interval(mins => <schwelle>)
  ↓
für jede Zeile:  ticket.sh add-comment   (Audit)
                 ticket.sh release-slot  (Freigabe)
                 escalated += ext_id
```

Der Status wird **nicht** angefasst — bei einem Waisen ist er bereits korrekt; nur der Slot
ist falsch. Das unterscheidet den Sweep vom Stale-Sweep, der beides zurücksetzt.

**Abgrenzung zweier gleichnamiger Dinge:** Die Freigabe läuft über `scripts/ticket.sh
release-slot` (intern `slots.sh release`), wie in `watchdog.sh:149` und `:180`. Das Skript
`scripts/factory/release-slot.sh` ist trotz des identischen Namens **nicht** zuständig — es
dekrementiert `active_agents` in `tickets.provider_health`, also LLM-Provider-Kapazität.

### 2. Meldung in `schedule.sh`

Der Claim in Zeile 106 behält Fail-open-Verhalten, verliert aber die Stille. Der Aufruf hält
stderr fest und gibt bei Fehlschlag eine `WARN`-Zeile mit `ext_id` aus — dieselbe Form wie
die vorhandenen Meldungen für T002386 (Zeile 34) und T002418 (Zeile 87). Die Schleife läuft
mit `continue` weiter; das JSON auf stdout bleibt unberührt, weil die Meldung auf stderr geht.

### 3. `local`-Korrektur in `watchdog.sh`

`local tier_name="flash"` (Zeile 160) → `tier_name="flash"`. Eine Zeile. Die Variable wird
ohnehin nur innerhalb desselben Schleifendurchlaufs gelesen und im nächsten Durchlauf neu
gesetzt, deshalb ändert der Wegfall der Funktions-Lokalität nichts an der Semantik.

## Testkonzept

Datei: `tests/spec/software-factory/orphan-slot-reap.bats` — Verzeichnis-Konvention T002416
(ein Verzeichnis je SSOT-Spec, eine Datei je Vorgang). Prüfmodus: **command output
verification** (T002448-M4); der Header der Testdatei hält das fest.

Die Live-Tests folgen dem Muster aus `tests/spec/software-factory/scheduling.bats`: ohne
erreichbaren Dev-Cluster (`FACTORY_CTX` ungesetzt) `skip`, sonst Seed → backdaten → Skript
ausführen → DB-Zustand prüfen.

| Test | Art | Prüft |
|---|---|---|
| Waise wird geräumt | live | `pipeline_slot` ist danach `NULL` |
| Waise behält Status | live | Status ist danach unverändert `backlog` (nicht `triage`) |
| **Positiv-Anker:** laufendes Ticket | live | `status='in_progress'` mit Slot bleibt unangetastet |
| Frischer Waise | live | unterhalb der Karenzzeit unverändert |
| Watchdog überlebt stale Ticket | live | Exit 0, kein `can only be used in a function` auf stderr (T002618) |
| Claim-Fehlschlag meldet | live | stderr enthält `WARN` mit der `ext_id`; stdout bleibt gültiges JSON |
| dry-resolve | offline | `FACTORY_DRY_RESOLVE=1` bleibt Exit 0 (CI-tauglich ohne Cluster) |

Der **Positiv-Anker** ist Pflicht (T002356-M1): ohne ihn bestünde „der Waise ist weg" auch
dann, wenn der Sweep wahllos jeden Slot räumt.

Assertions auf stderr werden auf die relevante Zeile eingegrenzt statt gegen das gesamte
`$output` zu matchen — der Worktree-Verzeichnisname leitet sich vom Change-Slug ab und kann
sonst einen Treffer vortäuschen (dokumentierte Falle in CLAUDE.md).

## Risiken

| Risiko | Behandlung |
|---|---|
| Sweep räumt unter einem startenden Claim weg | Karenzzeit `FACTORY_ORPHAN_SLOT_MIN` (10 min); der Claim in `slots.sh:40` setzt Slot und Status ohnehin in einem einzigen atomaren UPDATE |
| Neuer Sweep bricht den Watchdog-Lauf ab | Fehler pro Ticket toleriert (`|| true`), wie beim Zombie-Worktree-Cleanup; der Sweep steht am Ende und gefährdet keine vorhergehende Arbeit |
| CI ohne Cluster deckt nichts ab | Bewusst akzeptiert — dasselbe gilt für alle bestehenden FA-SF-Live-Tests. Der Offline-Anteil deckt Syntax und dry-resolve ab |
