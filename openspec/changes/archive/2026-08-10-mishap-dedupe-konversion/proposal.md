# Proposal: mishap-dedupe-konversion

## Why

Zwei Tickets, eine Ursache an zwei Stellen — gemeinsam geplant, getrennt umgesetzt.

**T003120 (führend, major):** `.claude/skills/mishap-tracker/SKILL.md` verspricht „batches
all execution mishaps into **one aggregate ticket** rather than creating N individual
tickets". `scripts/ticket-mcp/go/internal/tools/mishap.go:311-330` tut bei Erreichen der
Schwelle beides: es hängt die 10 gepufferten Mishaps als *einen* Kommentar an den
Rollup-Container **und** legt danach für jeden zusätzlich ein eigenes Ticket an. Der Buffer
aggregiert nicht, er verzögert nur. Ein einziger Append erzeugte 10 Tickets (T003108–T003117),
4 davon Dubletten zu Tickets aus demselben Lauf; der Bestand stieg trotz Bereinigung von 89
auf 91.

Die Begründung im Code-Kommentar („damit der Dispatcher ihn ohne den Rollup-Umweg aufnimmt
(lastenheft_locked)") wurde gegen `scripts/factory/queue.sh` geprüft und **trägt nicht**:
die erzeugten Tickets sind `--type fix --status triage` ohne `lastenheft_locked`, während
`queue.sh` nur `type IN ('feature','feat') AND status='backlog' AND lastenheft_locked=true`
oder `status='plan_staged'` dispatcht. Gemessen über 14 Tage: **0 von 150** Mishap-Tickets
sind `type=feat`, 52 liegen unverändert in `triage`. Die Konversion erzeugt Tickets für einen
Kanal, der sie zum Anlegezeitpunkt per Konstruktion ablehnt.

**T003117 (minor):** Der ticket-ops-Dedupe-Guard vergleicht Titel exakt
(`GROUP BY lower(regexp_replace(title,…)) HAVING count(*)>1`) und fand in einem Lauf über
88 offene Tickets **1 von 6** Dubletten. Dieselbe Schwäche steckt in `findOpenTicketByTitle`
(`mishap.go:129-145`). Mishap-Titel werden pro Report frei formuliert; dieselbe Beobachtung
bekommt nie denselben Titel. Ein Titelvergleich kann die dominante Dublettenklasse dieses
Repos per Konstruktion nicht fassen.

Herleitung, Messreihen und die verworfenen Alternativen stehen vollständig in
[`design.md`](design.md).

## What

**Teil 1 — Einzelticket-Konversion entfernen.** Die Konversionsschleife entfällt an beiden
konvertierenden Stellen (`report_mishap` bei Schwelle, `FlushStaleBuffer`); der interaktive
`flush_mishap_buffer` konvertiert bereits heute nicht und wird damit zur einheitlichen
Semantik. `createFactoryFixTicket` und `buildFactoryFixTicketArgs` entfallen als dann
unbenutzt. `findOpenTicketByTitle` bleibt — es bedient weiterhin `createIncidentTicket`.

> **Harte Vorbedingung: T002931.** Solange `scripts/factory/mishap-rollup.sh` keinen Plan
> aus dem Container extrahiert, wäre der Container nach Entfernen der Schleife ein schwarzes
> Loch. Task 0 dieses Plans ist ein ausführbares Gate, das den Lauf abbricht, wenn T002931
> nicht auf `main` gemergt ist. Es wird nicht angenommen, dass beides gleichzeitig merged.

**Teil 2 — Ähnlichkeitsvergleich statt Titelgleichheit, eine Implementierung für beide
Stellen.** Neues Subkommando `ticket.sh find-similar`
(`scripts/vda/ticket/find-similar.sh`): Gleichheit von `component`/`areas` plus Überlappung
der in der Beschreibung genannten Dateipfade. Alle 9 verifizierten Dublettenpaare teilen
beides — die Heuristik hätte 9/9 gefunden, ohne Modell. Aufrufer sind der ticket-ops-Guard
(Skill-Body) und `createIncidentTicket`. Der Vergleich **blockiert nie**: exakter Titel
verhält sich wie heute, ein Heuristik-Treffer legt das Ticket regulär an und ergänzt nur eine
`relates_to`-Kante samt Kommentar.

Embeddings (`bge-mcp`, gemessene Warnschwelle 0.74) werden **dokumentiert, nicht gebaut**:
sie kaufen keine Automatik (12 von 12 Treffern waren Fehlalarme) und würden im Go-Schreibpfad
eine Netzabhängigkeit für das bloße *Melden* eines Mishaps erzeugen.

**Teil 0 — Testbarkeit herstellen.** `make -C scripts/ticket-mcp/go test` läuft derzeit
nirgends: weder in `.github/workflows/ci.yml`, noch in einem Taskfile-Ziel, noch in
`tests/runner.sh`. Ein hier ergänzter Go-Test wäre ohne Registrierung wirkungslos (die Lage
aus T002657). Die Registrierung ist deshalb das erste Partial, nicht Beiwerk.

**Der in T003120 vorgeschlagene Test wird durch Teil 1 sinnlos** und ist bewusst ersetzt:
nach Entfernen der Konversion legt `report_mishap` gar keine Fix-Tickets mehr an, „genau ein
Ticket" wäre mit *null* trivial erfüllt. Die Auflösung — drei Tests mit je eigenem
Positiv-Anker, Stub-`ticket.sh` und Fixture-Korpus statt Produktiv-DB — steht in
[`design.md`](design.md) § Testbarkeit.

_Ticket: T003120_
_Mitbehandelt: T003117_
