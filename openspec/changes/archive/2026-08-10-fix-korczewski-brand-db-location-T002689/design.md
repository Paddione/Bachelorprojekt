# Design: fix-korczewski-brand-db-location-T002689

## Goals

- `--brand korczewski` liefert über die gesamte SDLC-CLI Zeilen statt eines
  Pod-Lookup-Fehlers.
- Die Abbildung brand→Namespace verschwindet vom Datenpfad — an **allen** vier
  Stellen, nicht nur der zuerst gemeldeten.
- Ein Ausfall des Datenpfads ist von „keine Treffer" unterscheidbar (fail-closed).
- Die Fehlermeldung sagt dem Aufrufer, welchen Hebel er hat.

## Non-Goals

- Workload-Namespaces und Deploy-Pfade ändern.
- Den dormanten `workspace-korczewski`-Namespace beleben.
- Eine Registry für „bewusst inaktive" Brands einführen.
- Die vier Kopien der Pod-Selektion zu einer zusammenführen. Das ist eine eigene,
  größere Konsolidierung (siehe Offene Punkte) und würde diesen Fix aufblähen.

## Decisions

### D1 — `brand` wird Zeilenfilter, der Namespace wird brand-unabhängig

Der Namespace der SDLC-Datenbank hängt am **Kontext**, nicht an der Brand. Die
Auflösung wird deshalb auf `TICKET_CTX`/`FACTORY_CTX` reduziert; `BRAND` fließt
nur noch in `WHERE brand = :'brand'` ein — dort tut es das bereits (`list.sh:34`),
die SQL-Seite ist schon korrekt.

Der Wert von `BRAND` bleibt vollständig erhalten und wird weiterhin validiert
(`mentolder|korczewski`, sonst rc=2). Nur die Namespace-**Ableitung** daraus fällt
weg. Damit bleiben `--brand`, `BRAND` und `TICKET_NS` in ihrer bisherigen Priorität
bestehen, und `TICKET_NS`/`FACTORY_NS` werden endlich wirksam, statt bedingungslos
überschrieben zu werden.

**Trade-off:** Ein künftiger Aufbau mit wirklich getrennten Brand-Datenbanken
müsste die Trennung wieder einführen. Das ist akzeptabel: die Trennung wäre dann
eine Sache des **Kontexts** (zwei Cluster/zwei DBs), und `TICKET_CTX` ist bereits
der dafür vorgesehene Hebel. Die heutige Kopplung an die Brand wäre auch dann der
falsche Hebel gewesen.

### D2 — Eine Auflösungsquelle statt vier Kopien

Die vier Kopien sind über Monate auseinandergelaufen: `lib.sh` und `ticket.sh`
bekamen die k3d-Ausnahme aus T002626, `conflict-check.sh` nicht (deshalb ist es
für *beide* Brands kaputt), `readiness-audit.sh` hat eine dritte Variante. Vier
Kopien zu korrigieren, ohne die Ursache der Divergenz zu beseitigen, reproduziert
den Befund beim nächsten Mal.

Deshalb: **eine** Funktion in `scripts/factory/lib.sh` löst den SDLC-Namespace auf,
und die anderen Stellen rufen sie auf, statt eigene `case`-Blöcke zu führen.
`scripts/ticket.sh` kann `lib.sh` nicht sourcen (es braucht `NS` bereits vor dem
Sourcen von `_ticket-core.sh`), behält also seine Ableitung — aber ohne den
Brand-`case`, wodurch sie auf eine einzige Kontext-Regel schrumpft.

### D3 — `factory_resolve` wird nicht gespalten, sondern benannt

Die Vermutung, hier verlaufe die Naht zwischen Workload- und Datenkontext, wurde
geprüft und verworfen: **kein** Konsument von `FACTORY_NS`/`FACTORY_CTX` ist ein
Workload-Pfad, alle sind `kubectl exec … -c postgres -- psql`. Eine Aufspaltung
erzeugte einen Resolver ohne Aufrufer.

Stattdessen wird die vorhandene Funktion als das benannt, was sie ist, und ein
Kommentar hält fest, warum die Brand hier **nicht** in den Namespace eingeht —
damit die nächste Änderung die Abbildung nicht gutgemeint wieder einbaut. Die alte
Funktionsname bleibt als Alias erhalten, damit die rund ein Dutzend Aufrufer nicht
im selben Commit angefasst werden müssen.

### D4 — Fail-closed statt „0 Backlog"

`wakeup.sh` maskiert den Ausfall einer Brand mit `2>/dev/null | jq … || echo 0`.
Der Ausdruck ist doppelt defekt: `queue.sh` endet rc=2, `jq` bekommt leeren Input
und liefert rc=0 mit leerer Ausgabe — der `|| echo 0`-Zweig greift nicht einmal,
die Variable wird schlicht leer.

Die Zählung zieht in eine Funktion `factory_backlog_count <brand>` in `lib.sh`, die
auf Erfolg eine Zahl auf stdout schreibt und rc=0 liefert, und auf Fehler rc≠0
**ohne** Zahl. `wakeup.sh` meldet den Ausfall dann sichtbar, statt ihn als leeren
Backlog zu verrechnen.

### D5 — Fehlermeldung nennt den Hebel

`_pgpod` und `factory_pgpod` nennen bereits Namespace und Kontext. Ergänzt wird der
Override, mit dem der Aufrufer korrigieren kann (`TICKET_CTX` bzw. `FACTORY_CTX`).
Das ist der Unterschied zwischen einer Meldung, die einen Zustand beschreibt, und
einer, die eine Handlung ermöglicht.

## Betroffene Stellen

| Datei | Änderung |
|---|---|
| `scripts/factory/lib.sh` | Brand-`case` raus; Auflösung als benannte Funktion; `factory_backlog_count`; Fehlermeldung um Override ergänzt |
| `scripts/ticket.sh` | Brand-`case` raus (`BRAND` bleibt für den Zeilenfilter); Kontext-Regel bleibt einzige NS-Quelle |
| `scripts/factory/conflict-check.sh` | eigene Kopie + veraltete Suffix-Regel raus, ruft die gemeinsame Auflösung |
| `scripts/vda/ticket/readiness-audit.sh` | eigene Kopie raus |
| `scripts/vda/ticket/_ticket-core.sh` | Fehlermeldung um Override ergänzt |
| `scripts/factory/wakeup.sh` | Backlog-Zählung fail-closed |
| `tests/spec/ticket-system.bats` | T002280-Erwartung `NS=workspace-korczewski` nachziehen |

## Bestandstests, die bewusst geändert werden

`tests/spec/ticket-system.bats:84` fixiert heute genau die Fehlabbildung:

```
@test "T002280: explizites --brand gewinnt gegen widerspruechlichen Freitext" {
  ...  [[ "$output" == *"NS=workspace-korczewski"* ]]
}
```

Die **Absicht** des Tests (T002280: Freitext darf die Auflösung nicht beeinflussen,
explizites `--brand` gewinnt) bleibt gültig und wird beibehalten. Nur der
beobachtete Wert ändert sich: der Nachweis, dass `--brand` gewonnen hat, läuft
künftig über `BRAND` im Zeilenfilter statt über den Namespace. Der Test wird
entsprechend umgestellt, nicht gelöscht — sonst ginge der T002280-Schutz verloren.

## Risiken

- **`--resolve-ns-only` ist ein öffentlicher Diagnose-Hook.** Sein Ausgabewert
  ändert sich für korczewski. Aufrufer außerhalb der Tests: keine gefunden
  (`grep -rn 'resolve-ns-only'` trifft nur `scripts/ticket.sh` und zwei Testdateien).
- **`conflict-check.sh` wird zum ersten Mal wirksam.** Es lief auf dem Default-Brand
  ins Leere; nach dem Fix findet es tatsächlich Konflikte. Das ist der Zweck, kann
  aber Konflikte melden, die bisher unsichtbar durchliefen. Bewusst in Kauf
  genommen — ein Gate, das nie greift, ist kein Gate.
- **Doppelte Default-Konstante.** Der Kontext-Default steht weiterhin an drei
  Stellen (`ticket.sh`, `_ticket-core.sh`, `lib.sh`), weil `ticket.sh` ihn vor dem
  Sourcen braucht. Die vorhandenen Querverweis-Kommentare bleiben und werden auf
  den neuen Stand gebracht.

## Offene Punkte (bewusst nicht in diesem Change)

Es existieren weiterhin **vier** eigenständige Implementierungen der
`shared-db`-Pod-Selektion (`_ticket-core.sh`, `factory/lib.sh`, `conflict-check.sh`,
`reconcile-ticket-status.sh`, dazu `lib/ticket-links.sh`, `lib/ticket-grill.sh`).
T002307 und T002386 mussten denselben Phasenfilter deshalb zweimal nachziehen.
Die Konsolidierung ist ein eigener Vorgang mit eigenem Ticket; dieser Change
reduziert die Divergenz nur dort, wo sie den Bug verursacht.
