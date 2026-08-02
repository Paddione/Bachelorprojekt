---
title: "mcp-gateway-watchdog — Implementation Plan"
ticket_id: T002543
domains: [bachelorprojekt-ops, bachelorprojekt-infra]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mcp-gateway-watchdog — Implementation Plan

_Ticket: T002543_

## File Structure

```
scripts/mcp-gateway/probe.sh                          (neu, ~90 Zeilen; S1 .sh=800, Budget reichlich)
scripts/mcp-gateway/mcp-gateway-watchdog.service      (neu, ~20 Zeilen; keine S1-Grenze)
scripts/mcp-gateway/mcp-gateway-watchdog.timer        (neu, ~12 Zeilen; keine S1-Grenze)
tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats  (liegt bereits auf dem Branch, RED)
docs/superpowers/references/gotchas-footguns.md       (+~10 Zeilen; keine S1-Grenze)
Taskfile.yml                                          (+~8 Zeilen; keine S1-Grenze)
```

Kein Verkleinerungsschritt nötig: alle berührten Code-Dateien sind neu und
liegen weit unter der wirksamen S1-Schwelle (`.sh` = 800).

## Kontext: was der Defekt ist — und was er nicht ist

`kubectl port-forward` hat einen Versagensmodus, in dem der **Prozess weiterlebt**,
während die SPDY-Streams abgerissen sind. Es gibt keinen Exit-Code, also greift
`Restart=always` nie.

Gemessen am 2026-08-02: die Unit meldete 3h16m `active (running)`, alle vier
Ports liefen in den Timeout (`http=000`), der Ziel-Pod war durchgehend 4/4
Running. Nach `kill` + Neustart antworteten die Ports sofort.

Die Unit heute, bestätigt per `systemctl --user cat mcp-gateway.service`:

```
Type=simple
ExecStart=/usr/bin/kubectl --context fleet port-forward -n default \
          svc/claude-code-mcp-monolith 18080:8080 13000:3000 13001:3001 13002:3002
Restart=always
RestartSec=3
```

Kein `WatchdogSec`, kein `ExecStartPost` — sie überwacht Prozess-Liveness statt
Tunnel-Liveness.

**Offene Frage aus dem Ticket, hiermit beantwortet:** `mcp-gateway.service` ist
die einzige port-forward-Unit auf diesem Host (`grep -l port-forward
~/.config/systemd/user/*.service` → genau ein Treffer). Ein allgemeiner
Mechanismus für „alle port-forward-Units" wäre überdimensioniert.

**Nicht verwechseln:** Die später beobachtete Restart-Schleife (Counter 95) war
*nicht* dieser Defekt, sondern Folge eines von Hand gestarteten konkurrierenden
`port-forward`, der die Ports belegte. Aufgabe 4.1 dokumentiert das.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die BATS-Datei liegt bereits auf diesem
      Branch und ist rot: 6 von 6 Tests schlagen fehl, weil weder `probe.sh`
      noch die Unit-Dateien existieren.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/watchdog-tunnel-liveness.bats
# expected: FAIL — 6 not ok, solange scripts/mcp-gateway/probe.sh fehlt
```

> **Warnung an den Ausführenden — ein Test war vakuos und wurde korrigiert.**
> Geprüft wurde auf `*"1"*` im `$output`. Fehlt das Skript, meldet bash
> `line 1: … No such file or directory`; die „1" darin erfüllte die Assertion,
> und der Test war **grün ohne jede Implementierung**. Er prüft jetzt zuerst die
> Existenz, schließt `status 127` aus und matcht auf `45872`. Lies die
> Rot-Bilanz Zeile für Zeile, statt nur „ist rot" festzustellen.

## 1. Probe-Skript

- [ ] **1.1** `scripts/mcp-gateway/probe.sh` anlegen und ausführbar machen.
      Aufruf: `probe.sh [--port N] [--timeout SEK] [--help]`. Ohne `--port`
      werden alle vier Ports der Unit geprüft (18080, 13000, 13001, 13002).

- [ ] **1.2** Der Probe führt einen **echten MCP-`initialize`** per HTTP-POST,
      kein TCP-Connect und kein blosses `/health`.

      Das ist der Kern, kein Implementierungsdetail: im beschriebenen
      Versagensmodus bleibt der Listener des `port-forward` offen, `accept()`
      gelingt, und erst die Nutzlast läuft in den Timeout. Ein Probe auf
      TCP-Ebene meldete hier Erfolg — der Watchdog wäre genauso blind wie die
      Unit, die er absichern soll. Der Test „ein TCP-Listener ohne MCP-Antwort
      gilt als tot" deckt genau diesen Fall ab.

- [ ] **1.3** Exit-Code ungleich 0 bei Timeout oder ungültiger Antwort, und der
      geprüfte Port steht **in der Ausgabe**. Ohne Portangabe ist im Journal
      nicht erkennbar, welcher der vier gefallen ist.

- [ ] **1.4** `--help` liefert Exit 0 und die Aufrufsyntax. Dient im Test als
      Positiv-Anker gegen ein Skript, das bei jedem Aufruf scheitert.

## 2. Watchdog-Units

- [ ] **2.1** `scripts/mcp-gateway/mcp-gateway-watchdog.service` — `Type=oneshot`,
      ruft `probe.sh` und startet bei Fehlschlag `mcp-gateway.service` neu.

- [ ] **2.2** `scripts/mcp-gateway/mcp-gateway-watchdog.timer` — wiederkehrend
      per `OnUnitActiveSec` (Vorschlag 60s). **Nicht** nur `OnBootSec`: der
      Defekt tritt nach Stunden Laufzeit auf, ein einmaliger Schuss beim Boot
      sähe ihn nie.

- [ ] **2.3** Beide Unit-Dateien liegen **im Repo**, nicht nur unter
      `~/.config/systemd/user/`. Sonst ist der Guard nach einer Neuinstallation
      des Hosts verschwunden.

- [ ] **2.4** Ein idempotentes Taskfile-Ziel installiert und aktiviert die
      Units. Namen über `bash scripts/vda.sh oracle 'install mcp gateway
      watchdog units'` bestimmen statt zu raten.

## 3. Restart-Sturm verhindern

- [ ] **3.1** Ist der Ziel-Pod selbst tot, hilft kein Tunnel-Neustart. Vor dem
      Restart prüfen, ob `claude-code-mcp-monolith` erreichbar ist; wenn nicht,
      **protokollieren und nichts tun**.

- [ ] **3.2** Aufeinanderfolgende Restarts begrenzen (Vorschlag: höchstens einer
      je 5 Minuten, Marker unter `${XDG_RUNTIME_DIR}`). Belegt nötig — die im
      Ticket erwähnte Schleife erreichte Counter 95.

## 4. Dokumentation

- [ ] **4.1** In `docs/superpowers/references/gotchas-footguns.md` unter
      „Ops & Infra": **Auf diesem Host darf kein `kubectl port-forward` von Hand
      gestartet werden.** Es gibt eine Unit dafür; ein manueller Start belegt die
      Ports und sperrt sie stumm aus. Das war die Ursache der Restart-Schleife,
      die zunächst für den eigentlichen Defekt gehalten wurde.

- [ ] **4.2** Im selben Eintrag: `systemctl status` ist für diese Unit **kein
      Gesundheitsbeleg**. `active (running)` sagt nur, dass der Prozess lebt.
      Wer den Zustand wissen will, ruft `probe.sh`.

## 5. Verifikation

- [ ] **5.1** `tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/` — alle
      grün, insbesondere die sechs Tests aus `watchdog-tunnel-liveness.bats`.

- [ ] **5.2** **Am lebenden System gegenprüfen, nicht nur am Test.** Den
      `kubectl`-Prozess mit `SIGSTOP` anhalten statt ihn zu killen — das bildet
      den Versagensmodus „Prozess lebt, Streams tot" am nächsten ab. Dann
      belegen, dass der Watchdog innerhalb eines Timer-Intervalls neu startet
      und die Ports wieder antworten. Ergebnis mit Zeitstempel ins Ticket.

- [ ] **5.3** Gegenprobe, dass der Watchdog **nicht** grundlos neu startet: über
      mindestens zwei Timer-Intervalle bei gesundem Tunnel beobachten,
      `systemctl --user show mcp-gateway.service -p NRestarts` bleibt konstant.

- [ ] **5.4** Abschluss:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
