---
title: "mishap-dedupe-konversion — Design"
ticket_id: T003120
domains: [bachelorprojekt-test, bachelorprojekt-db]
status: active
plan_ref: openspec/changes/mishap-dedupe-konversion/tasks.md
---

# mishap-dedupe-konversion — Design

Deckt **T003120** (führend) und **T003117** ab. Beide Tickets beschreiben denselben
Defekt an zwei Stellen; sie werden gemeinsam geplant, aber in **zwei getrennten Teilen**
umgesetzt, die sich nicht gegenseitig bedingen.

## Symptom vs. Hypothese (T002448-M5)

Bug-Beschreibungen mischen Beobachtung und Ursachenannahme. Trennung vor dem Lösungsdesign:

| Aussage | Klasse | Status |
|---|---|---|
| Ein Buffer-Append erzeugte 10 Tickets, 4 davon Dubletten (T003108–T003117) | **Symptom**, gemessen | belegt |
| Der ticket-ops-Guard fand 1 von 6 Dubletten | **Symptom**, gemessen | belegt |
| `findOpenTicketByTitle` vergleicht nur Titel | **Fakt** (Code, `mishap.go:129-145`) | belegt |
| „Die Konversion existiert, damit der Dispatcher das Ticket ohne Rollup-Umweg aufnimmt (lastenheft_locked)" | **Hypothese** aus dem Code-Kommentar (`mishap.go:318`) | **widerlegt**, s.u. |
| „Die Einzelticket-Konversion ist der einzige Weg, auf dem Mishaps weiterlaufen" | **Hypothese** aus T003120 | **präzisiert**, s.u. |

## Befund 1 — die Konversion erreicht ihren dokumentierten Zweck nicht

Der Code-Kommentar in `mishap.go:316-319` begründet die Schleife damit, dass der Dispatcher
das Ticket „ohne den Rollup-Umweg" aufnehme, und nennt in Klammern `lastenheft_locked`.
Gegen `scripts/factory/queue.sh` geprüft — der Dispatcher hat genau zwei Spuren:

```
Spur 1: type IN ('feature','feat') AND status='backlog'
        AND readiness->>'lastenheft_locked' = true
Spur 2: type NOT IN ('project','incident') AND status='plan_staged'
        AND readiness->>'execution_released' <> false
```

`buildFactoryFixTicketArgs` (`mishap.go:168-177`) erzeugt `--type fix --status triage`.
Das Wort `lastenheft` kommt in `mishap.go` **ausschließlich im Kommentar Zeile 318** vor,
an keiner Stelle im Code.

* **Spur 1** scheidet aus: falscher Typ, falscher Status, Flag wird nie gesetzt.
* **Spur 2** scheidet zum Anlegezeitpunkt aus: `status=triage`, nicht `plan_staged`.
  Ein konvertiertes Ticket kann `plan_staged` nur über einen regulären `dev-flow-plan`-Lauf
  erreichen — also über **genau den Weg, den die Konversion zu umgehen behauptet**.

Gemessen über alle Mishap-erzeugten Tickets der letzten 14 Tage (n=150, Merkmal:
`description LIKE '### Mishap-Fix%'`):

| Merkmal | Wert |
|---|---:|
| `type='feat'` | **0** |
| Status `triage` (nie weiterbewegt) | 52 |
| Status `plan_staged` | 6 |
| Status `backlog` | 14 |
| Status `done`/`archived` | 78 |

Die 6 `plan_staged`-Tickets kamen dorthin durch manuelle Planung, nicht durch die Konversion.
**Die Schleife erzeugt Tickets für einen Kanal, der sie zum Anlegezeitpunkt per Konstruktion
ablehnt.** Der Nutzen ist null, die Kosten sind der gemessene Bestandsaufbau.

### Zusatzbefund: drei Konversionsstellen, davon eine bereits abweichend

Das Ticket nennt eine Stelle. Es sind drei Pfade, und sie sind untereinander inkonsistent:

| Pfad | Ort | Container-Append | Einzelticket-Konversion |
|---|---|---|---|
| `report_mishap` bei Schwelle | `mishap.go:311-330` | ja | **ja** (10 Tickets) |
| `FlushStaleBuffer` (Watchdog) | `mishap.go:382-400` | ja | **ja** |
| `flush_mishap_buffer` (MCP-Tool) | `mishap.go:356-364` | ja | **nein** |

Der manuelle Flush verhält sich also **bereits heute so, wie der Skill es beschreibt**.
Die Entfernung der Schleife an den beiden anderen Stellen stellt Konsistenz her, statt sie
zu brechen.

## Befund 2 — der T003120-Vorbehalt bleibt gültig, mit anderer Begründung

T003120 warnt, die Konversion sei „der einzige Weg, auf dem Mishaps überhaupt weiterlaufen".
Nach Befund 1 ist das zu präzisieren: die Einzeltickets laufen **nicht** weiter, 52 von 150
liegen unverändert in `triage`. Der reale Abflusskanal ist der manuelle Triage-Lauf.

Der Vorbehalt trägt trotzdem — aus dem anderen Grund: Solange
`scripts/factory/mishap-rollup.sh` keinen Plan aus dem Container extrahiert (**T002931**),
wäre der Container nach Entfernen der Schleife ein schwarzes Loch. Dann gäbe es gar keinen
Ausgang mehr statt eines schlechten.

> **Harte Reihenfolge, im Plan verankert:** T002931 zuerst auf `main`, danach Teil 1.
> Task 0 dieses Plans ist ein ausführbares Gate, das den Lauf abbricht, wenn T002931 nicht
> gemergt ist. Es wird **nicht** angenommen, dass beides gleichzeitig merged.

## Befund 3 — die Go-Tests des ticket-mcp laufen nirgends

`scripts/ticket-mcp/go/internal/tools/mishap_test.go` existiert und ist umfangreich.
`make -C scripts/ticket-mcp/go test` wird aber weder von `.github/workflows/ci.yml`, noch
von einem Taskfile-Ziel, noch von `tests/runner.sh` aufgerufen — nur `build` (Taskfile.yml:5217).

Das ist genau die Lage aus dem CLAUDE.md-Hinweis zu T002657: ein Test, den kein Runner
kennt, ist kein Gate. Jeder Go-Test, den dieser Plan hinzufügt, wäre ohne Registrierung
wirkungslos. **Die Registrierung ist deshalb Partial 1 und Vorbedingung der übrigen Tests**,
nicht Beiwerk.

## Entscheidung Teil 1 — Konversion entfernen

Die Schleife entfällt an beiden konvertierenden Stellen (`report_mishap`-Schwelle,
`FlushStaleBuffer`). `createFactoryFixTicket` und `buildFactoryFixTicketArgs` werden damit
unbenutzt und entfallen mit.

`findOpenTicketByTitle` **bleibt** — es wird weiterhin von `createIncidentTicket`
(`mishap.go:97-119`) verwendet. Incidents (`incident`/`broken`/`security`) gehen am Buffer
vorbei und legen weiterhin je ein Ticket an; das ist unverändert gewollt.

Verworfene Alternative: *Konversion behalten und die Skill-Beschreibung korrigieren.*
Sie wurde von Befund 1 erledigt — man würde eine Beschreibung an ein Verhalten anpassen,
das seinen Zweck nachweislich verfehlt.

## Entscheidung Teil 2 — billige Heuristik, keine Embeddings im Schreibpfad

Gewählt: **Gleichheit der `component`/`areas` plus Überlappung der in der Beschreibung
genannten Dateipfade.** Gründe, in dieser Reihenfolge:

1. **Gemessene Trefferquote reicht.** Alle 9 verifizierten Dublettenpaare (5 aus T003117,
   4 aus T003120) teilen `component` **und** mindestens einen Dateipfad. Die Heuristik
   hätte 9/9 gefunden — ohne Modell.
2. **Der teure Weg kauft keine Automatik.** Die Messreihe im T003117-Kommentar (bge-m3,
   Kosinus): Dubletten 0.791–0.982, Nicht-Dubletten 0.541–0.722, Lücke 0.069. Bei der
   empfohlenen Warnschwelle 0.74 waren von 12 Treffern über 90 offene Tickets **null**
   echte Dubletten. Auch mit Embeddings muss ein Kandidat also *vorgelegt* statt angewandt
   werden — dasselbe Ergebnis erreicht die billige Variante deterministisch.
3. **`mishap.go` ist ein Go-Binary im Schreibpfad.** Ein Embedding-Aufruf dort macht das
   Melden eines Mishaps von der Erreichbarkeit von `bge-embed` abhängig. Ein Meldeweg, der
   ausfällt, weil ein Modelldienst nicht Ready ist, ist schlechter als ein grober Guard.
4. **Testbar ohne Netz und ohne DB.** Deterministische Funktion → Fixture-Korpus statt
   Modellabhängigkeit.

**Der Embedding-Weg wird dokumentiert, nicht gebaut.** Er bleibt als optionale zweite Stufe
für die *interaktive* ticket-ops-Spur beschrieben (dort sitzt ein Mensch, der einen Kandidaten
beurteilen kann), mit der gemessenen Warnschwelle 0.74. Nicht Teil dieses Changes.

### Eine Implementierung, zwei Aufrufer

Der Vergleich wird **einmal** implementiert, als `scripts/vda/ticket/find-similar.sh`,
dispatcht über `ticket.sh find-similar` (Muster der bestehenden Subkommandos;
`scripts/ticket.sh` steht ohnehin in der S1-`ignore`-Liste und wächst nur um eine Dispatch-Zeile).

* **Aufrufer (a) — ticket-ops-Skill:** ersetzt die Skill-Body-Invariante
  „`GROUP BY lower(regexp_replace(title,…)) HAVING count(*)>1`" durch einen zweistufigen
  Aufruf. Stufe 1 (exakter Titel) bleibt erhalten — sie hat 0 % Fehlalarm und ist der
  Positiv-Anker; Stufe 2 ist die Heuristik.
* **Aufrufer (b) — `createIncidentTicket` in `mishap.go`:** ruft dasselbe Skript über
  `runner.RunTicket` auf. Kein neues Aufrufmuster, keine Netzabhängigkeit — `mishap.go`
  shellt für jede Ticketoperation ohnehin nach `ticket.sh`.

### Semantik: nie blockieren, immer vorlegen

| Fall | Verhalten |
|---|---|
| Exakter Titeltreffer (offen) | wie heute: bestehende `external_id` wiederverwenden, Kommentar anhängen, **kein** neues Ticket |
| Heuristik-Treffer | Ticket wird **regulär angelegt**; zusätzlich `relates_to`-Kante + Kommentar mit dem Kandidaten |
| kein Treffer | Ticket wird regulär angelegt |

Das ist die „konservativ, Vorlage statt Automatik"-Vorgabe aus dem T003120-Kommentar,
angewandt auf die einzige unbeaufsichtigte Stelle, die nach Teil 1 übrig bleibt. Ein
automatisches „existiert schon, kein neues Ticket" auf Ähnlichkeitsbasis wird ausdrücklich
**nicht** gebaut — es hätte im gemessenen Lauf 12 gültige Befunde verschluckt.

## Testbarkeit — der Widerspruch und seine Auflösung

T003120 schlägt vor: `report_mishap` zweimal mit gleichem Sachverhalt und verschiedenen
Titeln, dann prüfen, dass **ein** Ticket entstand; Positiv-Anker: zwei verschiedene Mishaps
erzeugen zwei Tickets.

**Dieser Test wird durch Teil 1 sinnlos.** Nach Entfernen der Konversion legt `report_mishap`
überhaupt keine Fix-Tickets mehr an — „genau ein Ticket" wäre dann mit *null* trivial erfüllt,
und der Positiv-Anker („zwei verschiedene → zwei Tickets") ginge dauerhaft rot, ohne dass ein
Defekt vorliegt. Der vorgeschlagene Test misst eine Eigenschaft, die es nach dem Fix nicht
mehr gibt.

Auflösung — die Frage wird aufgeteilt, jeder Teil bekommt sein eigenes Messobjekt:

| Test | Gegenstand | Zusicherung | Positiv-Anker im selben Test |
|---|---|---|---|
| **T-A** (Go, `mishap_test.go`) | Schwellen-Pfad mit **Stub-`ticket.sh`** | Aufruflog enthält **0** `create --type fix` | Log enthält **genau einen** Container-Append mit allen 10 Einträgen — schlägt der ganze Pfad fehl, wird das rot |
| **T-B** (BATS) | `ticket.sh find-similar --corpus <fixture>` | die 3 verifizierten Nicht-Dubletten werden **nicht** gemeldet | die 9 verifizierten Dublettenpaare werden **alle** gemeldet |
| **T-C** (BATS) | CI-Registrierung | — | `make -C scripts/ticket-mcp/go test` ist in CI **und** Taskfile erreichbar (ohne diesen Anker liefe T-A nie) |

Randbedingungen, die das erfüllt:

* **Keine echten Tickets in der produktiven DB.** T-A nutzt `TICKET_MCP_REPO_ROOT` +
  `TICKET_SH` (beide von `runner.findRepoRoot`/`ticketShPath` ausgewertet) und zeigt auf ein
  Temp-Verzeichnis mit einem Stub, der Aufrufe nur protokolliert. T-B liest einen
  Fixture-Korpus über `--corpus` und öffnet keine DB-Verbindung.
* **Semantik statt Darstellung (T002716).** Zugesichert werden Anzahl von Aufrufen, Exit-Code
  und Vorhandensein einer ID (`grep -qF`, keine Zeilenanker, kein festgeschriebenes
  Ausgabeformat).
* **Output- statt Source-Verifikation (T002448-M4).** Kein `grep` auf `mishap.go`; jeder Test
  führt aus und misst das Ergebnis. Ausnahme mit Begründung: T-C prüft eine
  CI-Konfigurationskonvention, deren Ergebnis sich nur im Quelltext manifestiert — genau der
  im CLAUDE.md benannte zulässige Fall. Der Test verwendet dafür formatfreie Proben.
* **Abhängigkeits-Guard in der Rotphase (T002820).** T-A und T-C brauchen die Go-Toolchain:
  `command -v go >/dev/null 2>&1 || skip "go toolchain not installed"`. CI stellt sie über
  `actions/setup-go@v5` (ci.yml:277-279) bereit, lokal ggf. nicht.
* **Eigene Datei je Vorgang (T002416).** `tests/spec/mishap-tracking/<kurz-slug>.bats`,
  keine Sammeldatei.

## Fixture-Korpus

Die neun Dublettenpaare und drei Nicht-Dublettenpaare sind alle geschlossen
(`done`/`obsolete`), ihre Titel, `component` und Beschreibungen stehen aber weiter in der DB.
Sie werden **einmalig** in eine versionierte Fixture-Datei extrahiert
(`tests/fixtures/mishap-dedupe-korpus.tsv`) — der Test darf zur Laufzeit nicht auf die DB
zugreifen, sonst misst er den Datenbankzustand statt den Code.

| Klasse | Paare |
|---|---|
| Dublette | T003096/T003078 · T003101/T003077 · T002911/T002765 · T002910/T002877 · T003115/T003077 · T003113/T002765 · T003111/T003116 · T003006/T003001 · T003114/T003116 |
| Nicht-Dublette | T002994/T002998 · T002909/T003112 · T002811/T003097 |

## Offen für den Menschen

Eine Frage bleibt bewusst unentschieden und gehört **nicht** in diesen Change:
`drift` macht 34 % der Mishap-Tickets aus (52 von 153) und ist fast nie ein Arbeitsauftrag.
Ob `drift` künftig überhaupt ticketfähig sein soll, ist eine Zweckfrage des Mishap-Systems,
keine Dedupe-Frage — sie würde diesen Change überladen.

## Abgrenzung

* Kein Umbau von `mishap-rollup.sh` — das ist T002931.
* Kein Embedding-Aufruf, weder in Go noch im Skript.
* Keine Änderung an Incident-Tickets außer der zusätzlichen `relates_to`-Vorlage.
* Kein automatisches Schließen oder Unterdrücken von Tickets auf Ähnlichkeitsbasis.
