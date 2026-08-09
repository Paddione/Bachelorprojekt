---
ticket_id: T003068
plan_ref: openspec/changes/rollup-container-selfheal-T003068/tasks.md
domains: [scripts, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Design — rollup-container-selfheal-T003068

## Root-Cause (Fakt, nicht Hypothese)

Symptom (beobachtet): `bash scripts/ticket.sh rollup-container --brand mentolder` bricht mit
Exit 1 und leerer Ausgabe ab, wenn kein offener Rollup-Container existiert.

Ursache (verifiziert mit Minimal-Reproducer, siehe proposal.md): `set -euo pipefail`
(scripts/ticket.sh:22) plus eine Suchzeile in `cmd_rollup_container`, deren letztes
Pipeline-Glied `grep -v '^$'` bei leerem Input mit Exit 1 zurückkehrt. Unter `pipefail`
propagiert dieser Exit-Code auf die gesamte Pipeline, `set -e` bricht die Funktion ab, bevor
Step 2 (Anlegen) erreicht wird.

## Fix-Ansatz

Minimal-invasiv: `|| true` an das Ende der Pipeline anhängen, damit ein leeres Suchergebnis die
Funktion nicht mehr abbricht. Das ist exakt der im Ticket vorgeschlagene und durch den
Guard-Test bereits grün verifizierte Fix (siehe RED/GREEN-Nachweis in tasks.md Task 2).

Alternative verworfen: `grep -v '^$'` durch eine pipefail-neutrale Form ersetzen (z.B.
`awk 'NF'` oder `sed '/^$/d'`) — funktional gleichwertig, aber ohne Mehrwert gegenüber `|| true`
und mit größerem Diff. `|| true` ist die kleinstmögliche, lokal begrenzte Korrektur und deckt
sich mit dem im Ticket dokumentierten Fix-Vorschlag.

## Betroffene Subsysteme

- `scripts/ticket.sh` (`cmd_rollup_container`) — einzige Codeänderung.
- Mishap-Meldeweg (`report_mishap` über `ticket-mcp`) — indirekt profitierend, keine eigene
  Codeänderung nötig, da der Go-Adapter `ticket.sh rollup-container` bereits als gemeinsame
  Auflösung nutzt (T002783).

## Edge Cases

- **Leere Trefferliste** (der eigentliche Bug): durch den neuen Guard-Test abgedeckt
  (`tests/spec/mishap-rollup/rollup-container-empty-list-selfheal.bats`), RED gegen den
  unveränderten Code bestätigt, GREEN gegen den vorgeschlagenen Fix bestätigt.
- **Ein offener Container existiert** (Regressionsfall): bereits durch bestehende Tests
  abgedeckt (`tests/spec/mishap-rollup/container-resolution-and-unattended-worktree.bats`,
  `tests/spec/mcp-skill-integration.bats`) — bleibt unverändert, da der Fix nur den
  Leerfall-Pfad berührt.
- **T003067 als aktuell einziger offener Container**: durch den Fix nicht betroffen — der
  Guard-Test läuft vollständig gegen einen gemockten `kubectl` (repo-Idiom, siehe
  `tests/spec/feature-product-linking.bats`) und schreibt/liest keine echte Ticket-Zeile,
  berührt also T003067 nicht.

## Test-Strategie (T002448-M4)

Command-Output-Verifikation statt Source-Grep: Der neue Guard-Test führt
`scripts/ticket.sh rollup-container --brand mentolder` gegen einen gemockten `kubectl` aus, der
die Suchzeile eine leere Trefferliste liefern lässt, und prüft `$status`/`$output` — insbesondere
dass die Stderr-Meldung "kein offener Container, lege neuen an" erscheint und die vom
Anlege-Pfad zurückgegebene `external_id` im Output steht. Ein reiner Source-Grep auf `|| true`
wäre laut Ticket ausdrücklich unzureichend.
