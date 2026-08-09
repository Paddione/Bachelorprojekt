---
title: "fix-korczewski-brand-db-location-T002689 — Implementation Plan"
ticket_id: T002689
domains: [infra, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# fix-korczewski-brand-db-location-T002689 — Implementation Plan

_Ticket: T002689_

`brand` ist eine Spalte in `tickets.tickets`, kein Ort. Die Abbildung
brand→Namespace fällt auf dem SDLC-**Datenpfad** weg; Workload-Pfade bleiben
unberührt. Details und Begründung: `design.md`, Belege: `proposal.md`.

## File Structure

```
tests/spec/software-factory/brand-is-row-filter-not-namespace.bats  (neu, bereits im RED-Commit)
scripts/factory/lib.sh                        (geändert — Auflösung, Backlog-Zähler, Fehlermeldung)
scripts/ticket.sh                             (geändert — Brand-case entfernt)
scripts/factory/conflict-check.sh             (geändert — eigene Kopie entfernt)
scripts/vda/ticket/readiness-audit.sh         (geändert — eigene Kopie entfernt)
scripts/vda/ticket/_ticket-core.sh            (geändert — Fehlermeldung)
scripts/factory/wakeup.sh                     (geändert — Backlog fail-closed)
tests/spec/ticket-system.bats                 (geändert — T002280-Erwartung nachgezogen)
openspec/specs/software-factory.md            (Delta wird beim Archivieren gemerged)
```

## Verify (RED → GREEN)

- [ ] **Task 1 — Failing-Test-Step (RED).** Der Test liegt bereits auf dem Branch
      und ist rot; er wird hier als Ausgangspunkt bestätigt, nicht neu geschrieben.
      Alle sechs Fälle prüfen **Kommando-Output** (`--resolve-ns-only`,
      `FACTORY_DRY_RESOLVE=1`, Fehlermeldungen, rc), kein Quelltext-Grep. Jeder
      Fall trägt seinen Positiv-Anker über den mentolder-Pfad.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/brand-is-row-filter-not-namespace.bats
# expected: FAIL — alle 6 Fälle rot (Stand: 6/6 not ok), da die Abbildung noch besteht
```

- [ ] **Task 2 — Auflösung in `scripts/factory/lib.sh` brand-unabhängig machen.**
      Den `case "${BRAND:-}"`-Block (Zeilen 11–17) entfernen, sodass `FACTORY_NS`
      nur noch aus der `FACTORY_NS`-Env bzw. dem Default stammt; die Kontext-Regel
      (Zeilen 26–34) wird alleinige NS-Quelle. Die Validierung unbekannter
      `BRAND`-Werte (rc=2) bleibt erhalten — sie schützt den Zeilenfilter.
      Kommentar ergänzen, warum die Brand hier **nicht** in den Namespace eingeht
      (Verweis T002689). Funktion als Daten-Resolver benennen, `factory_resolve`
      als Alias behalten, damit die rund ein Dutzend Aufrufer unverändert bleiben.

```bash
BRAND=korczewski FACTORY_DRY_RESOLVE=1 bash scripts/factory/schedule.sh
BRAND=mentolder  FACTORY_DRY_RESOLVE=1 bash scripts/factory/schedule.sh
# beide: ns=workspace
```

- [ ] **Task 3 — Brand-`case` aus `scripts/ticket.sh` entfernen und den
      T002280-Bestandstest nachziehen.** Block Zeilen 76–79 entfernen; `BRAND`
      weiterhin auflösen, exportieren und validieren (unbekannter Wert → rc=2),
      nur die `NS`-Zuweisung daraus entfällt — damit wird ein explizit gesetztes
      `TICKET_NS` wirksam statt überschrieben. Die Kontext-Regel (Zeilen 95–104)
      bleibt alleinige NS-Quelle, ihr `workspace-korczewski`-Zweig entfällt mit.
      In `tests/spec/ticket-system.bats` fixiert Zeile 84 heute
      `NS=workspace-korczewski`. Die Absicht des Tests (Freitext beeinflusst die
      Auflösung nicht, explizites `--brand` gewinnt) bleibt erhalten und wird auf
      den Zeilenfilter umgestellt. Den Test nicht löschen — sonst entfällt der
      T002280-Schutz.

```bash
bash scripts/ticket.sh --resolve-ns-only get --id T000001 --brand korczewski   # NS=workspace
bash scripts/ticket.sh --resolve-ns-only get --id T000001 --brand acme         # rc=2
tests/unit/lib/bats-core/bin/bats tests/spec/ticket-system.bats
```

- [ ] **Task 4 — Die beiden verbliebenen Kopien auf die gemeinsame Auflösung
      umstellen.** In `scripts/factory/conflict-check.sh` den eigenen Brand-`case`
      (Zeilen 22–27) und die eigene Suffix-Regel (Zeilen 40–47) entfernen und
      `lib.sh` sourcen; damit erbt das Skript die k3d-Ausnahme aus T002626, die ihm
      bisher fehlte und die es auch für den Default-Brand unwirksam machte. Die
      `WARN`-Meldung bei fehlendem `BRAND` bleibt. In
      `scripts/vda/ticket/readiness-audit.sh` den Brand-`case` (Zeilen 36–40)
      entfernen; `brand` bleibt als Variable für WHERE-Klausel und Report-Kopf.

```bash
BRAND=mentolder  FACTORY_DRY_RESOLVE=1 bash scripts/factory/conflict-check.sh
BRAND=korczewski FACTORY_DRY_RESOLVE=1 bash scripts/factory/conflict-check.sh
# beide: ns=workspace  (vorher: workspace-dev bzw. workspace-korczewski-dev)
TICKET_CTX=t002689-no-cluster bash scripts/vda.sh ticket readiness-audit --brand korczewski
```

- [ ] **Task 5 — Backlog-Zählung fail-closed machen.** In `scripts/factory/lib.sh`
      eine Funktion `factory_backlog_count <brand>` ergänzen: auf Erfolg eine Zahl
      auf stdout und rc=0, auf Fehler rc≠0 **ohne** Zahl. In
      `scripts/factory/wakeup.sh` die Zeilen 292–293 darauf umstellen und den
      Ausfall im Wakeup-Bericht sichtbar melden, statt ihn als leeren Backlog zu
      verrechnen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/brand-is-row-filter-not-namespace.bats \
  --filter 'Backlog-Zaehlung'
```

- [ ] **Task 6 — Pod-Fehlermeldung um den Override ergänzen.** In
      `scripts/vda/ticket/_ticket-core.sh` (`_pgpod`, beide Zweige) den Hinweis auf
      `TICKET_CTX` ergänzen, in `scripts/factory/lib.sh` (`factory_pgpod`, beide
      Zweige) den auf `FACTORY_CTX`. Namespace und Kontext werden bereits genannt
      und bleiben erhalten; die factory-seitige Meldung bleibt gültiges JSON.

```bash
bash scripts/ticket.sh list --brand korczewski 2>&1 | grep -c 'TICKET_CTX'
```

- [ ] **Task 7 — Final Verification.** Zuerst der Ende-zu-Ende-Nachweis am
      lebenden Datenpfad: der ursprünglich gemeldete Aufruf muss Zeilen liefern
      statt eines Pod-Fehlers (erwartet werden die 36 korczewski-Tickets, die
      bereits in der lokalen SDLC-Datenbank liegen). Dann beide Testformen
      erfassen (T002696) und die Factory-Regression laufen lassen, weil vier der
      geänderten Skripte von ihr abgedeckt sind. Zuletzt die drei verbindlichen
      CI-Gates.

```bash
bash scripts/ticket.sh factory-control get --key killswitch --brand korczewski
bash scripts/ticket.sh list --brand korczewski --limit 5
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory*
task test:factory
task quality:pod-phase-filter
task openspec:validate
task test:changed
task freshness:regenerate
task freshness:check
```
