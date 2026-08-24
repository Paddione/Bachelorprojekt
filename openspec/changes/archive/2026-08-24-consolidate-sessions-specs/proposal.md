# Proposal: consolidate-sessions-specs

## Why

Zwei SSOT-Specs beanspruchen dieselbe Session-Registry — und sind bereits gedriftet:

- `openspec/specs/sessions-server.md` definiert Registration/Listing/Deregistration/Reaping/Idempotent Re-Registration.
- `openspec/specs/active-sessions-hub.md` definiert dieselben Sachverhalte ein zweites Mal ("Session-Registry als Single Source of Truth") mit abweichender Erzählung: Der Purpose beschreibt noch **sish-SSH-Tunnel hinter `session-*.${DEV_DOMAIN}` mit Pocket-ID-Gate**, während die Realität ein Upload via `kubectl cp` auf den fleet-nginx mit öffentlicher Wildcard-Cert-URL ohne Gate ist (`scripts/session-hub.sh`, `prod-fleet/mentolder/sessions-server.yaml`).
- Die Feldliste beider Specs enthält `tunnel_pid`; die Implementation schreibt immer `tunnel_pid:0` (`scripts/session-hub.sh:100`) und `cmd_reap` ignoriert das Feld.
- Der Reap-Wortlaut sagt "tunnel_pid AND server_pid geprüft", die Implementation prüft nur `server_pid`.
- `sessions-server.md` referenziert zweimal `<!-- bats: session-hub.bats -->` — diese Datei existiert nicht. `tests/spec/sessions-server.bats` deckt nur Manifest-Assertions ab; die gesamte CLI-Logik (register/list/deregister/reap/start-form/regen) hat null Test-Coverage.

Jede künftige Änderung an der Registry muss heute zwei Specs synchron halten — das ist dreimal schiefgegangen.

## What

1. **Konsolidierung:** `sessions-server.md` wird alleinige Heimat der Registry-Lifecycle-Requirements. Die duplizierte Requirement-Blockgruppe in `active-sessions-hub.md` wird zu einem schlanken Verweis-Requirement zurückgebaut (Registry-Pfad + Exklusivität über `scripts/session-hub.sh` bleiben dort; Feldliste, Szenarien und Semantik wandern nach `sessions-server.md` bzw. entfallen).
2. **Purpose-Reparatur:** Der Purpose von `active-sessions-hub.md` wird auf die reale Architektur umgeschrieben (lokale Dev-Registry + Mirror in Dev-Website-Pod; öffentliche Auslieferung über sessions-server auf fleet). `tunnel_pid` wird aus der Feldliste entfernt (deprecated, Implementation schreibt konstant 0).
3. **Test-Annotationen:** Die beiden `<!-- bats: session-hub.bats -->`-Marker zeigen auf die neuen Dateien unter `tests/spec/sessions-server/`.
4. **Test-Coverage:** Neue BATS-Suite(n) unter `tests/spec/sessions-server/` (Konvention T002416: ein Verzeichnis pro SSOT-Spec, eine Datei pro Vorgang) decken Output-Verifikation für `register`, `list`, `deregister`, `reap`, `start-form`, `regen` ab — gegen die tatsächliche Registry-JSON-Ausgabe, nicht gegen Quelltext-Greps.

**Kein Verhaltenschange:** Die Software tut danach exakt dasselbe. Reap-Semantik (ungetrackte PIDs) bewusst NICHT hier — das ist Ticket T016251 / Change `session-hub-reap-purge-fixes`, um Konflikte an derselben Spec-Datei zu vermeiden.

_Ticket: T016250_
