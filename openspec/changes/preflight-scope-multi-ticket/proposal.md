# Proposal: preflight-scope-multi-ticket

## Why

`scripts/preflight-pr-scope.sh:46` liest per `head -n 1` genau **eine** Ticket-ID aus dem
PR-Titel — die erste, die wie eine ID aussieht:

```bash
TICKET_ID="$(echo "$TITLE" | grep -oP '\[T\d{6}\]|T\d{6}' | tr -d '[]' | head -n 1 || true)"
```

Der Guard soll sicherstellen, dass PR-Titel und Branch dasselbe Ticket bezeichnen. Gemessen wird
aber „die erste ID-artige Zeichenkette im Titel steht im Branchnamen". Nennt der Titel ein
zweites Ticket **vor** dem eigenen, schlägt der Guard fehl, obwohl Titel und Branch zusammenpassen.
Verifiziert am 2026-08-10 in einem Worktree auf `fix/preflight-scope-multi-ticket-T003103`:

```
$ bash scripts/preflight-pr-scope.sh "fix(scripts): loest T003180 mit [T003103]"
preflight-pr-scope: FATAL: PR title ticket ID 'T003180' does not match current branch name
  'fix/preflight-scope-multi-ticket-T003103'
    git branch -m 'fix/…-T003103' 'fix/…-T003103-t003180'
```

Zwei Schäden: der Guard weist einen korrekten PR ab, und seine Fix-Empfehlung benennt den Branch
auf das **nur erwähnte** Ticket um. Wer der Meldung folgt, verschlimmert die Lage.

Der Fall tritt in der laufenden Arbeit auf: am 2026-08-10 entstand ein PR-Titel, der T003180 und
T003074 gemeinsam löst. Der bekannte Ausweg (Zweitticket in den PR-Body statt in den Titel) ist
unsichtbar, solange man den Guard nicht liest.

## What

`scripts/preflight-pr-scope.sh` sammelt **alle** Ticket-IDs des Titels ein und besteht, wenn
**mindestens eine** davon im Branchnamen steht. Passt keine, bleibt es beim FATAL — die Meldung
listet dann alle gefundenen IDs auf, statt eine willkürliche als „die" ID auszugeben.

**Warum „irgendeine passt" und nicht „alle müssen passen":** Ein Branch trägt genau eine
Ticket-ID. „Alle müssen passen" wäre bei zwei IDs im Titel strukturell unerfüllbar und verböte
Mehrfach-Tickets im Titel vollständig — eine Verschärfung, die dieser Change nicht beabsichtigt
und die der Guard auch nie abzusichern vorgab. Abgesichert wird: *der PR gehört zu diesem Branch*.
Dieser Nachweis ist erbracht, sobald **eine** Titel-ID dem Branch entspricht; die weiteren IDs
sind Querverweise auf mitgelöste oder referenzierte Tickets und ändern nichts an der Zugehörigkeit.
Die Gegenrichtung bleibt scharf: ein Titel, der **ausschließlich** fremde Tickets nennt, fällt
weiterhin durch.

_Nicht Teil dieses Changes:_ T003104 („Reihenfolge-Guards mit `grep -n … | head -1`", inzwischen
23 Dateien) teilt dasselbe Muster „erster Treffer ≠ gemeinter Treffer", betrifft aber
**Testdateien**, nicht dieses Skript. Getrennt gehalten, weil Blast-Radius und Verifikation
unterschiedlich sind: hier ein Skript mit BATS-Abdeckung, dort eine Sammelmigration über 23
Dateien. Dieser Change fasst `tests/` nicht an außer für den eigenen Guard.

_Ticket: T003103_
