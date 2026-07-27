# Proposal: plan-meta-readiness-merge

## Why

`scripts/ticket.sh plan-meta set --readiness <k=v>` ersetzt das `readiness`-JSONB-Objekt, statt den
übergebenen Key hineinzumergen (`scripts/ticket.sh:763`). Jeder Aufruf wirft alle nicht genannten
Keys weg — stumm und mit Erfolgsmeldung. Alle fünf anderen readiness-Writer im Repo verwenden das
korrekte Merge-Muster; `plan-meta set` ist der einzige Ausreißer und zugleich der einzige Writer
mit variablem Key-Set.

Das Ergebnis ist nicht nur ein verlorener DoR-Haken. Kollateral gelöscht werden die
readiness-Keys mit Steuerungsfunktion:

- `lastenheft_locked` — das Factory-Dispatch-Gate. `queue.sh` dispatcht `type='feature'` nur mit
  diesem Flag; ohne es verrottet ein Ticket unsichtbar im Backlog.
- `factory_excluded` — der unfactory-Terminalzustand aus T002361. Ein versehentliches Löschen gibt
  ein bewusst abgegebenes Ticket wieder für die Factory frei.
- `execution_released` — der `--hold`-Riegel aus dev-flow-plan.

Der einzige Aufrufer ist der `ticket-mcp`-Adapter, und beide betroffenen Tools setzen genau ein
Flag pro Aufruf: `set_readiness_flag` konstruktionsbedingt, `prepare_feature` in einer Schleife —
obwohl es laut eigener Beschreibung „alle Readiness-Flags in einem Call" setzt. Vier Aufrufe für
T002369 meldeten je „updated"; in der DB überlebte nur der letzte.

Kein Test deckt das ab.

## What

- **Fix:** `scripts/ticket.sh:763` auf JSONB-Merge umstellen —
  `readiness = COALESCE(readiness,'{}'::jsonb) || COALESCE($readiness_sql, '{}'::jsonb)`. Das
  innere `COALESCE` ist notwendig, weil `$readiness_sql` ohne `--readiness` das Literal `NULL` ist
  und `jsonb || NULL` die Spalte leeren würde. Zeilenneutral, keine neue CLI-Oberfläche.
- **Spec:** Neues Requirement in `openspec/specs/ticket-system.md`, das die Merge-Semantik für den
  Shell-Pfad festschreibt — `planning-office.md:44` fordert sie bereits für den TypeScript-Pfad,
  und genau diese Lücke ließ den Drift unbemerkt.
- **Report:** Neues read-only Sub-Kommando `scripts/vda/ticket/readiness-audit.sh`, das
  Verdachtsfälle unter den Bestandsdaten listet (genau ein readiness-Key trotz Status jenseits
  `triage`; nicht-leere `requirements_list` bei komplett fehlendem `lastenheft_locked`). Es
  schreibt nichts — verlorene Keys sind nicht rekonstruierbar, nur die Kandidatenliste ist es.
- **Test:** RED-Tests in `tests/spec/ticket-system.bats` als statische SQL-Assertion, dem
  T002230-Präzedenzfall in derselben Datei folgend (nie einen Cluster erreichen, T002224).

Ausdrücklich **nicht** enthalten: ein `--readiness-replace`-Flag (kein Aufrufer will es), eine
automatische Datenreparatur (würde das Dispatch-Gate bei false positives ungewollt öffnen) und das
Zusammenziehen von `prepare_feature` auf einen einzigen Aufruf (nach dem Fix korrekt, reine
Effizienzfrage).

Details und verworfene Alternativen: [`design.md`](design.md).

_Ticket: T002388_
