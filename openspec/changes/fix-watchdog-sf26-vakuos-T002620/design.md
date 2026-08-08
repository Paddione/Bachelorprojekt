---
ticket_id: T002620
plan_ref: openspec/changes/fix-watchdog-sf26-vakuos-T002620/tasks.md
status: active
date: 2026-08-04
---

# Design: fix-watchdog-sf26-vakuos-T002620

Ergebnis der Analyse zu T002620. Das WARUM und WAS steht in
[`proposal.md`](proposal.md); hier steht das WIE.

## Symptom vs. Hypothese (Bug-Triage T002448-M5)

| | |
|---|---|
| **Symptom (Fakt)** | Die beiden FA-SF-26-Live-Tests in `scheduling.bats:160–199` praeparieren ein stale Ticket per `SET updated_at = now() - interval '40 minutes'`. Die Stale-Liste des Watchdogs bleibt leer, der Lauf ist wirkungslos. T002618 (Watchdog bricht bei jedem stale Ticket ab) wurde von genau diesem Test nicht gefunden. |
| **Hypothese des Tickets** | Der Trigger `fn_lifecycle_ts` ueberschreibt `updated_at` bei jedem Update — das Backdating verpufft. |
| **Verifikation** | `website/src/lib/tickets/tables/tickets.ts:338–356`: in der `ELSE`-Branch (jedes UPDATE) steht unbedingt `NEW.updated_at := now()` (Zeile 352). Am 2026-08-03 gegen eine Dev-DB mit prod-Schema gemessen: nach `UPDATE ... SET updated_at = now() - interval '30 minutes'` meldet `SELECT now() - updated_at` `00:00:16` statt `00:30:00`. Hypothese bestaetigt. |
| **Zusatzbefund** | `slots.sh claim` schreibt `pipeline_slot_meta` — die Spalte fehlt in prod (T002619, Claim scheitert dort mit Exit 3). Die Vorlage T002610 setzt den Test-Zustand deshalb per direktem UPDATE. Uebernommen. |

## Mechanismus (warum Schwellwert 0 funktioniert)

Der Watchdog fragt:

```sql
SELECT external_id, type FROM tickets.tickets
WHERE type IN ('feature','feat','task','chore')
  AND status='in_progress'
  AND updated_at < now() - make_interval(mins => $STALE_MIN);
```

Mit `FACTORY_STALE_MIN=0` wird daraus `updated_at < now()` — ein Ticket, das eine
Sekunde zuvor geschrieben wurde, ist bereits faellig. Der Test-Zustand
(`pipeline_slot=1`, `status='in_progress'`) wird frisch gesetzt; kein Zurueckdatieren
noetig, keine DB-Luege, die der Trigger reparieren muesste. Dasselbe Muster beweist
`orphan-slot-reap.bats` seit T002610 fuer `FACTORY_ORPHAN_SLOT_MIN=0`.

**Erster Watchdog-Lauf pro Ticket:** das frisch geseedete Ticket hat keine
Phase-Events → `has_phase=f` → INFRA-Klasse, Zaehler `factory_infra_attempt:<ext>`
wird auf 1 gesetzt, `max_allowed=3` → **kein** Escalate, sondern der normale
Reset-Pfad (`triage` ohne Plan-Ref, `backlog` mit Plan-Ref) plus Slot-Freigabe und
Comment. Der Test prueft genau diesen Reset-Pfad.

**Nebeneffekt-Betrachtung:** `FACTORY_STALE_MIN=0` macht auch jedes ANDERE
`in_progress`-Ticket der Dev-Brand faellig. Das ist die beabsichtigte, dokumentierte
Watchdog-Arbeit (prod laeuft alle 30 min genauso), und der Zaehler begrenzt die
Auswirkung auf eine Runde (Reset statt `unfactory`). Die Tests laufen ausschliesslich
gegen Dev-Cluster (`skip` ohne `FACTORY_CTX`, `seed_test_feature` verweigert `fleet`).

## Komponenten

### 1. `scheduling.bats` — Test 1 (Zeilen 160–177): zurueck zu triage

- `slots.sh claim "$ext" 1` → ersetzt durch direktes UPDATE
  `SET pipeline_slot=1, status='in_progress'` (T002619).
- Backdating-Block (Pod-Aufloesung + `SET updated_at ...`) → entfaellt.
- `FACTORY_STALE_MIN=30` → `FACTORY_STALE_MIN=0 FACTORY_ORPHAN_SLOT_MIN=999`.
- Bestehender Positiv-Anker (`jq any(...)`) bleibt.
- Neue Assertion: `pipeline_slot` ist NULL (Slot-Freigabe geprueft, nicht nur Status).

### 2. `scheduling.bats` — Test 2 (Zeilen 179–199): Plan-Ref → backlog

Gleiche Umbauten wie Test 1; der `FACTORY-PLAN-REF`-Comment bleibt, die
Status-Erwartung `backlog` bleibt. `plan_ref` wird vom Watchdog aus
`ticket.sh get` gelesen (T001850-Pfad).

### 3. Keine Produktaenderung

`watchdog.sh` wird nicht angefasst — der Eskalationspfad ist intakt (T002618 ist seit
T002610 behoben). Geaendert wird ausschliesslich die Testdatei.

## Testkonzept

Pruefmodus: **command output verification** (T002448-M4) — das Skript wird
AUSGEFUEHRT und sein Verhalten an Ausgabe + DB-Zustand gemessen, kein Source-Grep.

| Schritt | Art | Befehl | Erwartung |
|---|---|---|---|
| Diagnose: Backdating wirkungslos | live, SQL-Probe | `UPDATE ... SET updated_at = now() - interval '40 minutes' ...; SELECT now() - updated_at ...` | `00:00:0X` statt `00:40:00` — der Trigger hat ueberschrieben |
| Diagnose: Bestandstest | live | `bats tests/spec/software-factory/scheduling.bats -f "FA-SF-26: a stale in_progress feature"` | FAIL — Stale-Liste leer, Status bleibt `in_progress` |
| Fix | live | Tests wie in den Komponenten 1+2 umschreiben | — |
| GREEN | live | derselbe `bats`-Filter | PASS, JSON-Array enthaelt die ext_id |
| Offline-Gate | CI | `task test:changed` + `task freshness:check` | gruen (Live-Tests skippen ohne Cluster) |

Dev-Cluster-Kontext: das Rezept aus T002610 Task 4 (kubeconfig-Alias ohne `k3d-`/
`-dev`-Namensmerkmale, `FACTORY_NS` auf den shared-db-Namespace, `TICKET_TEST_DB_OK=1`,
`TEST_BRAND=mentolder`). Nie gegen `fleet`; `seed_test_feature` verweigert das mit
Exit 3.

## Risiken

| Risiko | Behandlung |
|---|---|
| `STALE_MIN=0` raeumt fremde `in_progress`-Tickets der Dev-Brand | Bewusst akzeptiert (Watchdog-Designarbeit); Zaehler begrenzt auf Reset statt `unfactory`; Dev ist Scratch-Space |
| Parallel gefahrene Factory-Live-Dateien stoeren sich (fremdes in_progress-Fixture wird zurueckgesetzt) | Dateien gegen Dev-Cluster **sequenziell** laufen lassen, nie `--jobs` ueber Dateien hinweg — dokumentiert (wie T002610: nicht parallel zur Playwright-Suite) |
| `ORPHAN_MIN=999` blendet den Waisen-Sweep aus → der Test deckt nur den Stale-Pfad | Beabsichtigt: Isolation (Spiegel der Vorlage); der Waisen-Pfad hat eigene Tests in `orphan-slot-reap.bats` |
| CI ohne Cluster deckt die Live-Tests nicht ab | Bewusst akzeptiert — identisch zu allen bestehenden FA-SF-Live-Tests |
