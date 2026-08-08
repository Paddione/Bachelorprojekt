---
ticket_id: T002708
plan_ref: openspec/changes/cockpit-daemon-port-reserved/tasks.md
status: active
date: 2026-08-08
---

# Design: Cockpit-Daemon-Port außerhalb der Hyper-V-Reservierung

_Ticket: T002708 · Ziel-Spec: `openspec/specs/sdlc-cockpit.md`_

## Symptom (Fakt, reproduzierbar)

Auf unverändertem `main` schlägt `tests/spec/sdlc-cockpit/daemon-runtime-contract.bats` Test 3
(„Daemon startet aus dem Checkout und antwortet auf /health") fehl. Das `daemon.log` zeigt ein
widersprüchliches Bild: derselbe Prozess meldet erst erfolgreiches Listening auf 49199 und stürzt
danach mit `EADDRINUSE` auf genau diesem Port ab. Zum Messzeitpunkt lauschte niemand auf 49199
(`ss -ltnp`) und es lief kein Cockpit-Daemon (`pgrep`).

## Hypothese des Tickets (widerlegt)

Das Ticket vermutete einen doppelten `listen()`-Aufruf im Daemon-Startpfad — Modul-Top-Level plus
expliziter Start, oder ein doppelter Import.

Widerlegt durch drei unabhängige Messungen:

1. `grep -rn "serve(\|listen(\|createServer" .lavish/kit/daemon/` findet **einen** `serve()`-Aufruf
   (`server.ts:122`) und keinen weiteren Bind-Pfad.
2. `@hono/node-server/dist/index.mjs:1160` ruft in `serve()` genau ein `server.listen()` auf.
3. Ein Minimal-Reproducer aus sechs Zeilen — ein `Hono`, ein `serve()`, kein Repo-Code — erzeugt
   denselben `EADDRINUSE`. Das Modul wurde dabei nachweislich nur einmal ausgewertet (eine einzige
   `EVAL pid`-Zeile).

## Verifizierte Ursache

Der Port liegt in einem Bereich, den Windows/Hyper-V auf WSL2-Hosts blockweise **reserviert**.
`netsh interface ipv4 show excludedportrange protocol=tcp` weist unter anderem **49152–49251** als
ausgeschlossen aus. Ein `bind()` dort liefert `EADDRINUSE`, obwohl kein Prozess lauscht.

Messung mit identischem Code, nur der Port variiert:

| Port  | Lage                        | Ergebnis        |
|-------|-----------------------------|-----------------|
| 49152 | Hyper-V-Ausschluss          | `EADDRINUSE`    |
| 49197 | Hyper-V-Ausschluss          | `EADDRINUSE`    |
| 49199 | Hyper-V-Ausschluss          | `EADDRINUSE`    |
| 39197 | frei                        | `{"ok":true}`   |
| 8891  | frei                        | `{"ok":true}`   |

Der Portwert war eine bewusste Entscheidung: das K2-Proposal
(`openspec/changes/archive/2026-08-03-sdlc-cockpit-k2-daemon/proposal.md:75`) begründet 49152 mit
„IANA-dynamic range". Genau dieser Bereich ist unter Windows der dynamische Portbereich, den
Hyper-V für sich reserviert — die Begründung trug den Fehler bereits in sich.

**Reichweite:** Betroffen ist nicht nur der Test. Der Default-Port des Daemons (49152) und die
Basis-URL des Browser-Adapters liegen im selben Block. Der Cockpit-Daemon ist damit auf jedem
WSL2-Rechner unstartbar — und das Cockpit ist Development-only, WSL2 also die Zielumgebung, nicht
ein Randfall.

**Warum CI das nie sah:** Auf einem Linux-Runner ist 49152 frei. Der Bug ist plattformgebunden und
konnte in der bisherigen Testanlage grundsätzlich nicht auffallen.

## Zweiter Befund: der Log lügt

`server.ts:118` gibt `listening on http://127.0.0.1:${PORT}` aus — **vor** dem `serve()`-Aufruf in
Zeile 122. Der Daemon meldet Erfolg, bevor er bindet. Genau dieses Bild („erst listening, dann
Portkonflikt") liest sich wie ein doppelter Bind und hat die Fehlersuche in die falsche Richtung
geschickt. Der Fehlerfall selbst erscheint als nackter Unhandled-`error`-Stacktrace ohne Hinweis
darauf, was zu tun wäre.

## Dritter Befund: eine wirkungslose Assertion

`daemon-runtime-contract.bats:132` prüft `! echo "$output" | grep -q "# skip"`. POSIX schaltet
`set -e` ab, sobald ein Rückgabewert mit `!` invertiert wird — diese Zeile kann einen bats-Test
nie rot machen und prüft seit T002508 nichts. Die erste Fassung des neuen Tests zu T002708 ist an
derselben Konstruktion vakuos grün geworden, bevor sie auf `run grep -c` umgestellt wurde. Das ist
dieselbe Klasse von Vakuosität wie die Positiv-Anker-Pflicht in CLAUDE.md, nur über einen anderen
Mechanismus.

## Entscheidung

**Fester Port außerhalb aller Sperrbereiche: 39152** (Test-Ports 39199/39198).

Geprüft: 39152 liegt weder im Hyper-V-Ausschluss (ab 49152) noch im lokalen Ephemeral-Range
(`/proc/sys/net/ipv4/ip_local_port_range` = 44620–48715) und ist im Repo nirgends belegt.

Verworfene Alternativen:

- **Ephemerer Port + Discovery-Datei** (`listen(0)`, Port nach `/tmp/cockpit-daemon.port`): immun
  gegen jede Reservierung, aber `adapter.js` läuft im Browser unter `file://` und kann keine
  lokale Datei lesen. Der Browser-Pfad bräuchte einen zusätzlichen Mechanismus — mehr bewegliche
  Teile als das Problem rechtfertigt.
- **Port behalten, nur Fehlermeldung verbessern**: macht die Diagnose billiger, lässt den Daemon
  auf WSL2 aber unstartbar. Behandelt das Symptom, nicht die Ursache.

Zusätzlich zum Portwechsel — weil der Portwechsel allein die nächste Fehldiagnose nicht verhindert:

- Die `listening`-Meldung wandert in den `serve()`-Callback und wird erst bei tatsächlichem Bind
  ausgegeben.
- Ein `error`-Handler fängt `EADDRINUSE` ab und meldet Port, Ursache und Abhilfe im Klartext,
  statt einen Stacktrace zu werfen. Der Prozess endet mit Exit-Code ≠ 0.

## Nicht Teil dieser Änderung

- Die Coturn-/RustDesk-Portbereiche (`49152:49252/udp` in `prod/cloud-init*.yaml`,
  `k3d/coturn-stack/coturn.yaml`) bleiben unberührt: sie gelten auf Linux-Hetzner-Knoten, nicht auf
  einem WSL2-Host, und sind vom Hyper-V-Ausschluss nicht betroffen.
- Eine allgemeine Auswertung aller `netsh`-Ausschlussblöcke zur Laufzeit. Der Test prüft den
  konkreten Block 49152–49251, in dem beide alten Werte lagen.
