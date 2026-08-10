---
title: "Mess-Konvention: Zahlen als Entscheidungsgrundlage tragen ihren Befehl"
ticket_id: T002717
domains: [agent-behavior, docs, tests]
status: plan_staged
---

# ticket-messung-mit-befehl — Implementation Plan

## File Structure

| Datei | Art | Anmerkung zum Zeilenbudget |
|---|---|---|
| `CLAUDE.md` | geändert | Markdown — `docs/code-quality/gates.yaml` → `s1.limits` führt keinen `.md`-Eintrag, S1 greift für diese Datei nicht. Nicht in `docs/code-quality/baseline.json` (`S1:CLAUDE.md` → nicht-baselined). Kein Budget zu wahren. |
| `tests/spec/agent-skills/messung-mit-befehl.bats` | neu, bereits im Stage-Commit | Der RED-Test. Wird in der Implementierung **nicht** verändert — er ist die Abnahme. |
| `website/src/data/test-inventory.json` | generiert | Muss nach `task test:inventory` mitcommittet werden, sonst failt der CI-Inventory-Check. |
| `openspec/changes/ticket-messung-mit-befehl/**` | Plan-Artefakte | proposal, Delta-Spec, tasks — bereits im Stage-Commit. |

## Partials

| # | Rolle | Ziel-Dateien |
|---|---|---|
| p1 | docs + verify | `CLAUDE.md`, `website/src/data/test-inventory.json` |

Ein einziges Partial: der gesamte Eingriff ist ein Abschnitt in einer Datei. Der Testanteil liegt
bereits als RED-Test im Stage-Commit vor und wird von der Implementierung nur noch grün gemacht.

## Task 1 — RED bestätigen, bevor irgendetwas geschrieben wird

Der Test existiert bereits aus dem Stage-Commit. Vor der Implementierung wird sein Rot-Zustand
reproduziert, damit die spätere Grünfärbung eine Aussage hat.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/messung-mit-befehl.bats
# expected: FAIL — alle 5 Tests scheitern an `grep -q "^### Mess-Konvention" CLAUDE.md`
```

**Abnahme dieses Tasks:** Die Fehlermeldung jedes der fünf Tests zeigt die `grep`-Zeile auf
`$HEADING`, **nicht** die vorangehenden Anker `[ -f "$CLAUDE_MD" ]` / `[ -s "$CLAUDE_MD" ]`.
Scheiterte ein Test schon am Anker, misst der Guard die Ausstattung des Checkouts statt den Zustand
der Dokumentation, und der Rotlauf wäre wertlos.

## Task 2 — Den Konventions-Abschnitt an das Ende von `CLAUDE.md` schreiben

Einfügeort: **hinter dem letzten Abschnitt der Datei**, `### Bug-Triage-Konvention (CFR-Gate
G-DORA03)`. Der Abschnitt wird angehängt, nichts Bestehendes wird umgestellt.

> Kollisionsschutz gegenüber T002813: Jener Change berührt `CLAUDE.md` im Abschnitt
> `### Domain conventions: Merge = Abschluss (T001092)` (die M10-Zeile). Dieser Task fasst
> ausschließlich den Bereich hinter dem Dateiende-Abschnitt an. Vor dem Schreiben verifizieren, dass
> `### Bug-Triage-Konvention` weiterhin der letzte H3 der Datei ist:
> ```bash
> grep -n '^### ' CLAUDE.md | tail -3
> ```
> Ist inzwischen ein anderer Abschnitt ans Ende gerückt, wird dahinter angehängt — die Regel lautet
> „ans Ende", nicht „an eine Zeilennummer".

Der Abschnitt MUSS die fünf Elemente tragen, die der Guard prüft, und sie müssen inhaltlich stimmen,
nicht nur als Stichwort vorkommen:

1. Überschrift, die exakt mit `### Mess-Konvention` beginnt.
2. Das Wort `Befehl` in der Verpflichtung: Wer eine Messung als Entscheidungsgrundlage in ein Ticket
   schreibt, notiert den **ausführbaren Befehl** mit, der sie erzeugt hat.
3. Das Wort `Suchmuster` in der Erläuterung, warum Teilangaben nicht genügen: Datum, Match-Modus und
   Ausschlussverzeichnisse waren in T002700 vorhanden; gefehlt hat das Suchmuster, und genau daran
   hing das Ergebnis.
4. Die wörtliche Formel `Redaktioneller Hinweis, kein automatisierter Guard` — dieselbe Formulierung,
   die die M10-Regel trägt, damit die Kategorie im Dokument einheitlich benannt ist.
5. Die Ticket-Referenz `T002717` in der Überschrift.

Inhaltlich gehört zusätzlich hinein — ohne dass der Guard es prüft, weil es Prosa ist:

- Der konkrete Beleg: T002700 nannte „rund 23 lebende Dateien"; die Nachmessung ergab 149 Vorkommen
  in 63 Dateien. Rekonstruktionen gegen den Stand vor dem Move (`6a6d4c302`) liefern je nach
  Suchmuster 66 oder 216 Dateien — keine davon trifft die Ticket-Zahl. Die Messung war nicht falsch
  gerundet, sie war nicht rekonstruierbar.
- Die Begründung, warum kein Guard trägt: „Ist diese Zahl reproduzierbar?" verlangt den Repo-Stand
  des Messzeitpunkts und ist beim Lesen nicht mehr entscheidbar. Eine Schlüsselwort-Heuristik
  („enthält `MESSUNG` ⇒ braucht Code-Fence") hätte T002700 durchgelassen, weil dessen Text bereits
  Methoden-Metadaten trug.
- Der praktische Hinweis, dass bei einer Messung gegen einen Stand, der sich ändern wird, der
  Commit-SHA mit in den Befehl gehört — sonst verfällt der Befehl mit dem nächsten Merge.

**Verbotene Formulierung:** Kein `TBD`, kein Platzhalter, keine Ankündigung eines späteren
Nachtrags. Der Abschnitt ist mit diesem Commit vollständig oder er wird nicht geschrieben.

## Task 3 — Grün prüfen und die Aussagekraft des Guards gegenprüfen

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/messung-mit-befehl.bats
# erwartet: 5/5 ok
```

Zusätzlich beide Formen der Spec-Tests laufen lassen (Sammeldatei **und** Verzeichnis, CLAUDE.md
T002696), damit keine Regression in `tests/spec/agent-skills.bats` untergeht:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/agent-skills*
```

**Negativ-Gegenprobe (Pflicht):** Der Guard muss rot werden, wenn die Konvention verschwindet.
Gegen eine Kopie prüfen, nicht gegen das Arbeitsexemplar:

```bash
tmp="$(mktemp -d)"; cp -r . "$tmp/repo" 2>/dev/null || true
# im Kopie-Repo den Abschnitt entfernen und den Guard erneut laufen lassen — er MUSS scheitern
```

Alternativ und einfacher: die Überschrift im Arbeitsbaum kurzzeitig verstümmeln, Test laufen lassen
(muss rot sein), Änderung mit `git checkout -- CLAUDE.md` zurücknehmen. Bestätigt der Guard auch
ohne die Konvention grün, ist er vakuos und muss verschärft werden, bevor die PR aufgeht.

**`awk`-Abschnittsextraktion prüfen:** Die Hilfsfunktion `_section` schneidet von
`^### Mess-Konvention` bis zur nächsten H2/H3. Verifizieren, dass sie den vollständigen Abschnitt
liefert und nicht bei der ersten Zeile abbricht — steht der Abschnitt am Dateiende, existiert keine
Folge-Überschrift, und das `awk`-Muster muss trotzdem bis EOF ausgeben:

```bash
awk '/^### Mess-Konvention/{f=1} f&&/^#{2,3} /&&!/^### Mess-Konvention/{if(n++)exit} f' CLAUDE.md | wc -l
```

Die Zeilenzahl muss der tatsächlichen Abschnittslänge entsprechen. Liefert sie 1, greift der
Extraktor nicht, und die Tests 2–5 prüften nur die Überschrift.

## Task 4 — Freshness, Inventar und finale Verifikation

Der neue Test macht eine Regeneration des Test-Inventars nötig, sonst failt der CI-Inventory-Check.

```bash
task test:inventory
git diff --stat website/src/data/test-inventory.json
```

Anschließend die Pflicht-Verifikation:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Erst wenn alle drei grün sind, ist der Change fertig. `task openspec:validate` läuft ohnehin als
fail-closed CI-Gate; lokal vorab ausführen, um einen roten PR zu vermeiden.
