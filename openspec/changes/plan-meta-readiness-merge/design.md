# Design: plan-meta setzt readiness per JSONB-Merge statt Ersetzen

_Ticket: T002388 · Branch: `fix/plan-meta-readiness-merge-T002388`_

## Zweck

`scripts/ticket.sh plan-meta set --readiness <k=v>` ersetzt das gesamte
`readiness`-JSONB-Objekt, statt den übergebenen Key hineinzumergen. Jeder Aufruf wirft damit
alle nicht genannten Keys weg — stumm, mit Erfolgsmeldung. Betroffen sind auch die
Steuerungs-Flags `lastenheft_locked` (Factory-Dispatch-Gate) und `factory_excluded`
(unfactory-Terminalzustand aus T002361). Dieser Change stellt die Merge-Semantik her und liefert
einen Report, der die bereits entstandenen Datenschäden auffindbar macht.

## Root Cause

`scripts/ticket.sh:763` steht in einer `UPDATE`-Feldliste, deren übrige Einträge skalare Spalten
sind:

```sql
areas             = COALESCE($areas_sql, areas),
depends_on        = COALESCE($depends_sql, depends_on),
planning_rank     = COALESCE($rank_sql, planning_rank),
readiness         = COALESCE($readiness_sql, readiness),   -- ← Ersetzen statt Merge
requirements_list = COALESCE($requirements_sql, requirements_list),
```

Für skalare Spalten ist `COALESCE(neu, alt)` genau richtig: „setze neu, sonst behalte alt". Für
`readiness` als JSONB-**Map** deckt das nur den NULL-Fall korrekt ab; im Nicht-NULL-Fall muss
`alt || neu` stehen. Weil `_readiness_to_json` aus `--readiness k=v` ein Objekt **nur mit den
genannten Keys** baut, ist der Nicht-NULL-Fall der Normalfall — und damit der Datenverlust.

Die Zeile fügt sich optisch perfekt in die Feldliste ein. Genau deshalb ist sie durch Reviews
gekommen.

### Warum das nicht früher auffiel

Alle fünf anderen readiness-Writer im Repo verwenden bereits das Merge-Muster:

| Ort | Muster |
|---|---|
| `scripts/ticket.sh:318` (`execution_released`) | `COALESCE(readiness,'{}'::jsonb) \|\| '{…}'::jsonb` |
| `scripts/ticket.sh:483` (`factory_excluded`) | `COALESCE(readiness,'{}'::jsonb) \|\| '{…}'::jsonb` |
| `scripts/ticket.sh:821` (`lastenheft_locked=true`) | `COALESCE(readiness,'{}'::jsonb) \|\| '{…}'::jsonb` |
| `scripts/ticket.sh:830` (`lastenheft_locked=false`) | `COALESCE(readiness,'{}'::jsonb) \|\| '{…}'::jsonb` |
| `scripts/vda/ticket/stage-plan.sh:38` | `COALESCE(readiness,'{}'::jsonb) \|\| '{…}'::jsonb` |

`plan-meta set` ist der einzige Ausreißer — und zugleich der einzige Writer mit *variablem*
Key-Set. Die anderen schreiben je ein hartkodiertes Literal, weshalb ihnen die Merge-Frage beim
Schreiben unmittelbar präsent war.

Der Spec kannte die Regel bereits, aber nur für den anderen Pfad:
`openspec/specs/planning-office.md:44` fordert für `clarifyItem` (TypeScript) explizit einen
JSONB-Merge. Für den Shell-Pfad existiert kein solches Requirement — die Lücke, durch die der
Drift unbemerkt blieb.

### Verwandter Präzedenzfall: T002230

Dieselbe Fehlerklasse ein Verb weiter: `update-status.sh` schrieb
`resolution = NULLIF(:'res','')` unbedingt und löschte bei jedem Aufruf ohne `--resolution` die
bestehende Resolution. Es ist eine wiederkehrende Familie — `UPDATE`-Feldlisten, in denen „nicht
übergeben" versehentlich „auf leer setzen" bedeutet. Der Fix und die Testform dieses Changes
folgen dem dort etablierten Muster.

## Wirkung auf die Aufrufer

`plan-meta set --readiness` wird ausschließlich vom Go-Adapter `ticket-mcp` aufgerufen:

- `scripts/ticket-mcp/go/internal/tools/planning.go:105` — `set_readiness_flag`, ein Flag pro Call.
  Das Tool nimmt konstruktionsbedingt genau ein Flag; wer vier DoR-Flags setzt, ruft es viermal
  auf und behält garantiert nur das letzte. Genau so entstand der beobachtete Schaden an T002369
  (`{"spec_skizziert": true}` statt DoR 4/4).
- `scripts/ticket-mcp/go/internal/tools/planning.go:210` — `prepare_feature`, das laut eigener
  Beschreibung „alle Readiness-Flags in einem Call" setzt, intern aber dieselbe Schleife über
  Einzelaufrufe fährt. Es liefert damit mit Garantie ein Flag statt vier.

Beide werden durch den Fix in `ticket.sh` geheilt; am Go-Adapter ist keine Änderung nötig.

## Entscheidungen

### E1 — Merge-Semantik als Default, kein Replace-Weg

```sql
readiness = COALESCE(readiness,'{}'::jsonb) || COALESCE($readiness_sql, '{}'::jsonb),
```

Das innere `COALESCE` hält den Fall „`--readiness` nicht übergeben" ab: `$readiness_sql` ist dann
das Literal `NULL`, und `jsonb || NULL` ergäbe `NULL` — der Merge würde die Spalte leeren statt
sie unangetastet zu lassen. Mit `COALESCE(…, '{}'::jsonb)` wird daraus ein Merge mit dem leeren
Objekt, also ein No-op.

**Kein `--readiness-replace`-Flag.** Kein heutiger Aufrufer will Replace-Semantik; ein
ungenutzter Replace-Pfad wäre toter Code mit genau der Fußangel, die diesen Bug ausgelöst hat.
Wird er je gebraucht, ist er nachrüstbar.

### E2 — Detektion statt Reparatur

Der Code-Fix heilt künftige Writes; bereits verlorene Keys sind **nicht rekonstruierbar** — die
Information, dass ein Ticket einmal `lastenheft_locked=true` trug, existiert nirgends mehr.
Rekonstruierbar ist nur die *Kandidatenliste*.

Eine automatische Reparatur (etwa `lastenheft_locked=true` für alle Tickets mit nicht-leerer
`requirements_list`) wurde **verworfen**: Sie würde das Factory-Dispatch-Gate auch bei Tickets
öffnen, die bewusst nie gelockt waren. Ein false positive gibt ein Ticket ungewollt für die
Factory frei — der Schaden wäre schlimmer als der bestehende.

Stattdessen ein **read-only Report** mit zwei Heuristiken:

1. **Verdächtig schmal** — `readiness` hat genau einen Key, obwohl das Ticket weiter als `triage`
   ist. Die typische Signatur mehrerer `set_readiness_flag`-Aufrufe.
2. **Lock-Verdacht** — `requirements_list` ist nicht leer, aber `lastenheft_locked` fehlt ganz
   (nicht: steht auf `false`). Ein Ticket mit Anforderungen, das nie gelockt *wurde*, sieht anders
   aus als eines, dessen Lock-Key verschwunden ist.

Der Report schreibt nichts und entscheidet nichts; er liefert die Liste, die ein Mensch abarbeitet.

### E3 — Der Report kommt nicht in `ticket.sh`

`scripts/ticket.sh` steht auf der S1-ignore-Liste (`docs/code-quality/gates.yaml`) — 990 Zeilen
bei einem `.sh`-Limit von 500. Die Ausnahme ist eine anerkannte Schuldenposition, kein Freibrief.
Der Report wird deshalb ein eigenes Modul im etablierten Muster von
`scripts/vda/ticket/stage-plan.sh` und wird über den bestehenden Dispatcher
`scripts/vda/ticket.sh` erreichbar. Der Fix selbst ist zeilenneutral (eine Zeile umgeschrieben).

### E4 — Statische SQL-Assertion als Test

Der Test prüft die **SQL-Form** per `grep`, nicht das DB-Ergebnis. `tests/spec/ticket-system.bats`
etabliert diese Form bereits für T002230 mit dem ausdrücklichen Vermerk, dass diese Tests nie
einen Cluster erreichen dürfen (T002224). Zwei Assertions: die Merge-Form ist da **und** die alte
Ersetzen-Form ist weg — nicht bloß von einer neuen Zeile überschattet.

## Nicht in diesem Change

- **`prepare_feature` auf einen einzigen `plan-meta`-Aufruf zusammenziehen.** Nach dem Fix
  arbeiten die vier sequenziellen Aufrufe korrekt; das Zusammenziehen wäre reine
  Effizienz/Atomarität ohne Verhaltensgewinn und würde den Diff auf den Go-Adapter samt
  `ticket-mcp`-Rebuild ausweiten. Bei Bedarf separates Chore-Ticket.
- **Reparatur der Bestandsdaten.** Siehe E2 — der Report liefert die Kandidaten, die Entscheidung
  bleibt beim Menschen.
- **Repo-weiter Scan nach weiteren `COALESCE`-auf-JSONB-Stellen.** `readiness` ist die einzige
  JSONB-Spalte in dieser Feldliste; ein systematischer Scan der Bug-Familie aus T002230/T002388
  wäre ein eigenes Vorhaben.
