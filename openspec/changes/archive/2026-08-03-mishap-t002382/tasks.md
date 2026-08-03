---
title: "mishap-t002382 — Implementation Plan"
ticket_id: T002382
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002382 — Implementation Plan

_Ticket: T002382_

Mishap-Bundle: tickets/status-machine (1 Einträge)

Automatisch erzeugt von `scripts/factory/auto-chore-plan.sh` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

```
scripts/factory/reconcile-ticket-status.sh
tests/spec/ticket-system.bats
```

## Mishap-Eintraege

### Mishap 1: Ticket-Status-Race: automatisierter Schreiber setzt done zurueck auf awaiting_deploy und leert resolution
**Typ:** suspicious | **Komponente:** tickets/status-machine

Ablauf am 2026-07-27/28 fuer T002333:

1. Nach dem Merge von PR #3418 setzte dev-flow-execute das Ticket per 'vda.sh ticket update-status --status done --resolution fixed'. Verifiziert per SQL: T002333|done|fixed.
2. Wenige Minuten spaeter lehnte 'openspec.sh archive queue-dispatch-bug-type' ab mit: "archive refused: ticket status is 'awaiting_deploy', expected 'done'".
3. Eine erneute SQL-Abfrage zeigte dann T002333|done| — Status wieder done, resolution aber LEER.

Ein automatisierter Schreiber (Kandidaten: scripts/factory/auto-close-merged.sh, deploy-transition.cjs, der Post-Merge-Deploy-Pfad) hat also nach dem Abschluss durch dev-flow-execute ueber den Status gefahren, ihn kurzzeitig auf awaiting_deploy gesetzt und dabei die resolution verworfen.

Das widerspricht der dokumentierten Konvention in CLAUDE.md ("Merge = Abschluss", T001092): awaiting_deploy ist aus dem Happy-Path entfernt und der Prod-Deploy soll den Ticket-Status NICHT aendern.

Zwei Schaeden: (a) Der Archivierungsschritt schlaegt fehl, wenn er genau in dieses Fenster faellt — der Fehler ist nicht reproduzierbar und sieht nach einem Bedienfehler aus. (b) Die resolution geht still verloren; ein Ticket steht danach auf done ohne resolution, was die DORA-Auswertung verfaelscht.

Ich habe die resolution manuell auf fixed nachgesetzt; danach lief archive durch.

Vorschlag: Den automatischen Schreiber identifizieren und den Uebergang done -> awaiting_deploy verbieten (Statusmaschine soll aus done nur noch nach archived), und update-status so haerten, dass eine gesetzte resolution nie ohne expliziten Wert ueberschrieben wird.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten. Jeder nennt Komponente und
      vorgeschlagene Behebung. Eintraege, die sich bei der Recon als nicht zutreffend
      erweisen, werden im PR-Text begruendet verworfen statt stillschweigend uebergangen.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
