---
title: "p5-tests — BATS-Nachweis fuer Umstellung, Poller und Backup"
ticket_id: T002626
domains: [test]
status: active
---

# p5-tests — BATS-Nachweis fuer Umstellung, Poller und Backup

Belegt die DoD dieser Etappe mit ausfuehrbaren Tests. Setzt p1–p4 voraus.

## File Structure

| Datei | Rolle | S1-Budget |
|---|---|---|
| `tests/spec/sdlc-isolation/e3-tickets-lokal.bats` | neu — Umstellungspunkte, Cutover | n/a |
| `tests/spec/sdlc-isolation/e3-poller.bats` | neu — Cursor-Semantik, Idempotenz | n/a |
| `tests/spec/sdlc-isolation/e3-backup.bats` | neu — Restore-Nachweis | n/a |

Ein Verzeichnis pro SSOT-Spec, eine Datei pro Vorgang (T002416). Nicht an die Sammeldatei
`tests/spec/sdlc-isolation.bats` anhaengen — genau das erzeugt die Append-Konflikte, gegen die
die Konvention eingefuehrt wurde.

## Aufgaben

### 1. Failing-Test zuerst schreiben

Bevor eine Zeile Implementierung entsteht, wird der Nachweis rot gefahren:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-isolation/
```

expected: FAIL — die drei Dateien pruefen Verhalten, das es noch nicht gibt (lokaler
Default-Kontext, Poller-Cursor, Restore-Gleichheit).

### 2. `e3-tickets-lokal.bats` — Umstellung

Prueft **Kommandoausgaben, nicht Quelltext** (T002448-M4): der Test ruft
`scripts/ticket.sh --resolve-ns-only` auf und liest das Ergebnis, statt im Skript nach einem
Kontextnamen zu greppen. Ein Grep belegte nur, dass Text existiert — nicht, dass die
Aufloesung stimmt.

Faelle:
- ohne `TICKET_CTX` loest der Namespace auf den lokalen Stack auf
- mit `TICKET_CTX=fleet` weiterhin auf den fleet-Namespace (der Override ueberlebt)
- die Namespace-Ableitung liefert fuer den SDLC-Kontext `workspace`, nicht `workspace-dev`

### 3. `e3-poller.bats` — Cursor und Idempotenz

- ein zweites Mal verarbeitetes Ereignis erzeugt keine zweite Zeile
- ein Fehler beim Schreiben laesst den Cursor stehen (das Ereignis wird beim naechsten Lauf
  erneut angeboten)
- ein Lauf ohne neue Ereignisse veraendert nichts

**Positiv-Anker-Pflicht (T002356-M1):** Der Nachweis, dass `post-merge.yml` keine
`TICKET_CTX=fleet`-Bloecke mehr traegt, ist ein Negativtest. Ohne Anker bestuende er vakuos —
eine geloeschte Datei erfuellt „enthaelt nichts" ebenso. Im selben Test wird deshalb zuerst
geprueft, dass die Datei existiert und ihre uebrigen Schritte (Deploy-Ausloesung) noch
vorhanden sind, und erst danach die Abwesenheit der Ticket-Bloecke.

### 4. `e3-backup.bats` — Restore

Nachweis ueber das Ergebnis: Dump erzeugen, in eine Wegwerf-Datenbank einspielen,
Zeilenzahlen je Tabelle vergleichen. Ein Test, der nur prueft, dass eine Dump-Datei entstanden
ist, belegt nicht, dass sie wiederherstellbar ist.

### 5. Beide Testformen lokal erfassen (T002696)

Weil Sammeldatei und Verzeichnis nebeneinander gueltig sind, findet eine Suche nach
`tests/spec/sdlc-isolation.bats` nur die Haelfte. Vor dem Push immer beides:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-isolation*
```

### 6. Test-Inventar regenerieren

`task test:inventory` und `website/src/data/test-inventory.json` mitcommitten — CI vergleicht
und wird sonst rot.

## Verifikation dieses Partials

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-isolation*
task test:inventory
```

Erwartet: alle Faelle gruen, das Inventar unveraendert gegenueber dem committeten Stand.
