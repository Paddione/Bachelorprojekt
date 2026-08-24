# Proposal: identity-guard-sidepaths

## Why

Der Identity-Guard (T015168-Fix) deckt nur die ticket.sh-Familie über
`scripts/vda/ticket/_ticket-core.sh` (`_pgpod` :87, `_assert_db_identity` :64) ab. Eigene
Pod-Selektionen mit derselben Ghost-Klasse behalten den Bug (T002386-Kommentar): vier Skripte
wählen weiterhin blind per `head -1` und fragen die DB ohne Marker-Probe — eine Ghost-Instanz
hinter gleichem Context antwortet dort unbemerkt.

## What

Zwei-Schichten-Verteidigung (Pod-Singleton-Assertion + DB-Marker-Probe gegen
`tickets.db_identity`) in allen vier Nebenpfaden nachziehen, Referenz:
`_assert_db_identity`/`_pgpod` aus dem T015168-Fix:

| Datei | Selektion | Besonderheit |
|---|---|---|
| `scripts/factory/lib.sh` | `factory_pgpod()` :82 | Fehlerpfad bleibt gültiges JSON (jq-Contract) |
| `scripts/factory/conflict-check.sh` | `_pgpod()` :50 | Plain-Text-Error bleibt |
| `scripts/mishap-categorize.sh` | eigene kubectl-Aufrufe :19/:40 | Plain-Text-Error bleibt |
| `scripts/batch-gap-analysis.sh` | eigene Selektion :15 | Plain-Text-Error bleibt |

Umsetzung als geteilter Helper `scripts/lib/db-ghost-guard.sh`
(`assert_single_db_pod <ns> <ctx>`, `probe_db_identity <ns> <ctx> <exec-cmd...>`), der die
Vier Stellen source-n; Sentinel-Skip-Muster exakt wie im Referenz-Fix (`BATS_TEST_NAME`/
`BATS_VERSION` plus Opt-in-Variable, Ausnahme-Modus `TICKET_ALLOW_UNVERIFIED_DB=1` bleibt
wirksam). Die Marker-Tabelle existiert bereits (Migration aus T015168).

Kein Verhaltenschange für den Happy Path mit gesunder DB: eine Assertion mehr, gleiche
Ergebnisse.

## Root Cause (Symptom/Ursache getrennt)

- **Beobachtet (Fakt):** Ghost-Instanz antwortete auf fleet-Exec-Pfad; nur ticket.sh-Pfade
  sind seither geschützt.
- **Ursache:** vier Skripte kopieren die Pod-Selektion statt den geschützten Kern zu sourcen;
  der Fix wurde am Kopierort `_ticket-core.sh` verankert und erreichte die Kopien nicht.

_Ticket: T015669_
