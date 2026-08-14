# Proposal: blocker-gate-hardening

## Purpose (deutsch)

Das Post-Merge-Review von PR #4472 (T005306) fand zwei Härtungslücken im frisch gefixten
Blocker-Gate (`scripts/factory/schedule.sh` Z. 60-82): (1) **Silent-Wedge** — ein
`depends_on`-Eintrag auf ein hart gelöschtes Ticket (LEFT JOIN → NULL) oder auf einen
`archived`-Vorgänger blockt den Kandidaten für immer, ohne jedes Signal: die
Block-Bedingung ist `t.status IS DISTINCT FROM 'done'` (NULL und `archived` sind beide
„nicht done"), und die berechnete `blockers`-Liste wird verworfen (stilles `continue`).
(2) Test-Capacity-Sensitivität des Guards. Dazu drei Minor-Befunde (Spec-Szenario für den
false-blocking-Fix fehlt, SQL-Interpolation, ungetesteter fail-closed-Pfad).

Dieser Change löst den Wedge auf (archived erfüllt den Gate, dangling-Referenzen blocken
nicht + WARN), macht jeden Block sichtbar (WARN mit Blocker-Liste), schließt die
Spec-Lücke und härten den Guard-Test.

## Goals

- Gate-Semantik: Block nur bei Vorgängern mit `status NOT IN ('done','archived')` und
  existierender Zeile; dangling-Referenzen blocken nicht, erzeugen aber eine WARN.
- Jeder Block emittiert `schedule: WARN skipping <id> — open blockers: …` (die bereits
  berechnete blockers-Liste wird genutzt statt verworfen).
- Spec: das MODIFIED-Delta ergänzt die Szenarien „archived blocker satisfies the gate",
  „dangling predecessor does not wedge the candidate", „every block emits a WARN",
  „candidate without depends_on proceeds" (letzteres sichert den false-blocking-Fix aus
  T005306 im SSOT ab).
- Verhaltens-Guard `schedule-blocker-gate-hardening.bats`: archived→proceed,
  dangling→proceed+WARN, open→hold+WARN (RED heute: keine WARNs, archived/dangling
  werden geblockt).
- Minor 4 (SQL-Binding `-v ext_id=` statt Interpolation) und der Test-Capacity-Pre-Check
  (skip bei belegtem Slot-Pool) werden mit umgesetzt.

## Non-Goals

- Keine Änderung der Conflict-/Cap-Gates.
- Kein Auto-Resolution-Mechanismus für blockierte Tickets (die WARN macht sie sichtbar,
  die Auflösung bleibt Prozess).
- Minor 5 (fail-closed-Pfad-Test via factory_psql-Stub) wird als optionaler Zusatz
  geführt, wenn der Test-Aufwand klein bleibt — sonst Folge-Ticket.

## Symptom vs. Ursache (T002448-M5)

- **Symptom (Review #4472):** Blockierte Kandidaten verschwinden still; `archived`/
  gelöschte Vorgänger blockieren dauerhaft.
- **Ursache (am Code belegt):** `t.status IS DISTINCT FROM 'done'` (NULL und archived
  sind beide ≠ done) + `blockers`-Variable wird berechnet und verworfen
  (schedule.sh:75-78). Der LEFT JOIN macht die Zeilenabwesenheit zum Dauerblock —
  strukturell, kein Race.

## Design-Entscheidungen

1. **archived erfüllt den Gate:** archiviert = abgeschlossen (resolution gesetzt) — ein
   obsolete-Blocker ist kein Blocker.
2. **dangling blockt nicht, warnt:** Ein gelöschter Vorgänger kann nie `done` werden;
   Blocken wäre ein permanenter Wedge. Die WARN hält die Datenfehler-Sichtbarkeit
   aufrecht, ohne die Queue zu verstopfen.
3. **WARN statt still:** Die blockers-Liste existiert bereits in der Query — sie wird
   nur noch ausgegeben. Kein neuer Query-Roundtrip.
