# Proposal: test-guard-semantics

## Why

Sechs offene Tickets beschreiben denselben Defekt in verschiedener Gestalt: **ein Guard misst die
Darstellung statt der Semantik, die er zusichern will.** Er wird rot, ohne dass sich das Geprueefte
geaendert hat — oder er bleibt gruen, obwohl die Funktion nie ausgefuehrt wurde. Beides kostet
Diagnosezeit an der falschen Stelle, und der zweite Fall ist schlimmer als kein Test, weil er
Schutz suggeriert.

CLAUDE.md kennt die Regel bereits als T002716 ("Semantik statt Darstellung"), aber nur fuer einen
Fall: das **Ausgabeformat eines Werkzeugs**. Die belegten Vorfaelle zeigen drei weitere Spielarten,
die der Wortlaut nicht abdeckt.

**Wie verlaesslich die Klasse ist, zeigt der Bestand:** von den urspruenglich neun Tickets dieser
Gruppe waren zwei bereits behoben (T003667, T003230) — beide von PRs, deren Titel sie nicht
nannten, weshalb der Merge-Abgleich sie uebersah. Die Klasse wird also laufend produziert und
laufend beilaeufig repariert, ohne dass die Regel nachzieht.

### Die vier Spielarten

| Nr. | Gemessen wird | Statt | Beleg |
|---|---|---|---|
| 1 | Position des ersten Zufallstreffers im Dokument | die gemeinte Stelle | T003104 |
| 2 | ein Muster, das die Shell als Option parst | das Vorkommen im Text | T003108 |
| 3 | eine Zeichenkette im Quelltext | das Laufzeitverhalten | T003291, T003615 |
| 4 | eine Konfigurationsaussage | die Laufzeitaussage, in der der Defekt sitzt | T003548 |

Zu Nr. 1: `grep -n … | head -1` sucht dokumentweit und vergleicht die Zeilennummer des ersten
Treffers. Eine unverwandte Einfuegung oberhalb der gemeinten Stelle faerbt den Guard rot.
MESSUNG gegen `origin/main` am 2026-08-11 — das Muster **waechst** (T003104 nannte 19):

```bash
git grep -lE 'grep -n[^|]*\| *head -1' origin/main -- tests/spec/ | wc -l
# -> 23
```

Zu Nr. 2: `-F` macht das Muster zur festen Zeichenkette, verhindert aber **nicht**, dass das
Argument zuvor als Option geparst wird. `grep -qF '--draft'` endet mit **Exit 2** (Werkzeugfehler),
nicht 1 (nicht gefunden) — in einer `if`-Bedingung sind beide ununterscheidbar falsch. Der Guard
meldet dann "das Flag fehlt im Dokument", obwohl es dasteht. Nur `-e` oder `--` markiert das Muster.

Zu Nr. 4: Der belegte Fall ist lehrreich, weil das Wissen vorhanden war und trotzdem nicht griff.
Der Autor hatte die Grenze zwischen "aktiviert" (Konfiguration) und "geladen" (Laufzeit) im
Dateikopf des Tests **selbst notiert** und darauf aufgebaut. Sichtbar wurde der Fehler allein durch
den vorgeschriebenen RED-Lauf: der Test war rot-Lauf **gruen**, obwohl der Defekt vorlag.

### Warum kein Blindsweep

23 Dateien tragen das Positions-Muster, aber nicht jede trifft eine Positionsaussage — bei manchen
ist `head -1` schlicht "nimm irgendeinen Treffer" und harmlos. Ein pauschales Umschreiben erzeugte
einen grossen Diff mit hohem Konfliktrisiko gegen parallele PRs, ohne Erkenntnisgewinn. Der Plan
prueft deshalb alle 23 und repariert gezielt (Nutzerentscheidung 2026-08-11).

### Nicht in diesem Vorgang

`T003285` (Test auf `main` rot, CI-Status unbekannt) ist Diagnose, kein Fix. Ein Schritt mit
offenem Ergebnis haette den Merge der uebrigen sechs blockiert; das Ticket laeuft eigenstaendig.
Seine Messung ist inzwischen ueberhaupt erst moeglich, weil T002922 (cluster-abhaengige Specs
liefen nie in CI) seit PR #4245 behoben ist.

## What

1. **Extend the T002716 convention in `CLAUDE.md`** from "output format" to all four variants
   above, each with its concrete failure mode and the shape that holds instead. The reference
   file `docs/superpowers/references/gotchas-footguns.md` gets the long-form cases.

2. **Fix three guards that measure the wrong thing:**
   - `tests/spec/openspec-workflow/ticket-file-required.bats` iterates the entire change
     inventory, so one missing `.ticket` on `main` reddens *every* concurrently open PR. Scope it
     to the change directories touched by the PR diff, keeping the full-inventory check as a
     merge gate on `main` itself.
   - `tests/spec/sdlc-cockpit/redesign-struktur.bats` matches the bare component name and hits
     comments that merely mention it historically. Match import statements instead.
   - `tests/spec/local-llm-proxy.bats` asserts a response header by grepping `server.mjs`. Issue a
     real request against a fake backend and assert the header. The test infrastructure this needs
     shipped with T003277.

3. **Audit the 23 files carrying the positional pattern** and repair only those whose assertion is
   actually positional; record the ones deliberately left alone and why.

Out of scope: T003285 (diagnosis), and rewriting files whose `head -1` is not load-bearing.

_Ticket: T003796_
