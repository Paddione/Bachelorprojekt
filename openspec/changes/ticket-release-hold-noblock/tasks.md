---
title: "ticket-release-hold-noblock — Implementation Plan"
ticket_id: T002366
domains: [factory, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# ticket-release-hold-noblock — Implementation Plan

_Ticket: T002366_

## File Structure

```
scripts/ticket.sh                    (geändert — cmd_release_hold, Zeile 327)
scripts/vda/ticket/stage-plan.sh     (geändert — Auto-Tick-Wake, Zeile 85)
tests/spec/software-factory.bats     (geändert — 2 RED-Tests am Dateiende, im Stage-Commit)
```

## Kontext

`cmd_release_hold` endet auf `systemctl --user start factory.service 2>/dev/null || true`.
`factory.service` ist `Type=oneshot` (`RuntimeMaxSec=3600`, `TimeoutStartSec=3660`) — ein
blockierendes `systemctl start` hängt sich an einen laufenden Job an und wartet auf dessen
Ende. Läuft ein Tick, blockiert das Kommando bis zu 61 Minuten ohne jede Ausgabe.

Die Diagnose ist abgeschlossen und belegt:

- `timeout 8 systemctl --user start factory.service` → Exit 124, während der Dienst
  `activating (start)` war.
- Ein Stub-Lauf mit sofort zurückkehrendem `systemctl` liefert Exit 0 und die
  Bestätigungszeile — der Rest des Kommandos ist intakt.
- `grep -rn 'systemctl --user start' scripts/` liefert einen zweiten Treffer derselben
  Klasse: `scripts/vda/ticket/stage-plan.sh:85` weckt `factory.service` im
  Nicht-`--hold`-Zweig auf exakt demselben Weg. Das ist die Ursache des bisher separat
  geführten Befunds „`stage-plan` hängt >120 s ohne Ausgabe, der Write geht trotzdem
  durch" — gleiches Symptom, gleiche Wurzel. Der Kommentar dort (Zeile 69–70) bezeichnet
  den Weck-Aufruf ausdrücklich als best-effort und non-fatal; ein blockierendes
  `systemctl start` widerspricht dieser Absicht.
- Die übrigen readiness-schreibenden Subkommandos (`lastenheft lock`,
  `set-readiness-flag`) rufen kein `systemctl` auf und sind nicht betroffen.
- `scripts/terminal-sidekick-host.sh:101` ist ebenfalls nicht betroffen: das dortige
  ttyd-Unit ist kein `oneshot`, und bei `Type=simple` kehrt `systemctl start` nach dem
  Fork sofort zurück. Blockieren ist eine Eigenschaft der Unit, nicht des Kommandos.

Der DB-Write läuft vor dem Hang durch; `execution_released` wird gesetzt. Der Fehler kostet
Operator-Zeit, verliert aber keinen Zustand.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Verhaltenstest liegt bereits am Ende von
      `tests/spec/software-factory.bats` und ist Teil des Stage-Commits. Er stubbt `kubectl`
      (liefert einen Pod-Namen, schluckt `exec`) und `systemctl` (blockiert 30 s ohne
      `--no-block`, kehrt mit `--no-block` sofort zurück) und ruft `release-hold` unter
      `timeout 5` auf. `TICKET_OFFLINE` bleibt bewusst `0` — mit `1` kehrte `release-hold`
      über `_ticket_offline_skip` vor dem systemctl-Aufruf zurück und der Test wäre auch
      ohne den Fix grün. Ein zweiter Test wirkt als Klassen-Guard über `scripts/ticket.sh`
      und `scripts/vda/ticket/` und fängt `stage-plan.sh` mit ab. Vor der Implementierung
      ausführen und den roten Lauf beider Tests bestätigen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter "T002366"
# expected: FAIL (rot, 2 Tests — release-hold blockiert noch auf dem Oneshot-Job, Exit 124)
```

- [ ] **Fix-Step (GREEN).** An beiden Fundstellen den systemctl-Aufruf um `--no-block`
      ergänzen und die jeweilige Bestätigungszeile davor ziehen, damit die Zustandsänderung
      auch bei klemmendem systemd gemeldet wird. Kein weiterer Umbau — der
      DB-Kontrollschlüssel `force-tick-requested` trägt die Semantik bereits, der
      systemctl-Aufruf ist nur ein Beschleuniger.

```bash
# scripts/ticket.sh, cmd_release_hold — Zielzustand der letzten beiden Zeilen:
#   echo "execution_released set to true for ticket $id"
#   systemctl --user start --no-block factory.service 2>/dev/null || true
#
# scripts/vda/ticket/stage-plan.sh, Zeile 85 — im Nicht---hold-Zweig:
#   systemctl --user start --no-block factory.service 2>/dev/null || true
# und die "Ticket … staged in Kommissionierung"-Meldung (Zeile 87-91) vor den
# if-Block mit dem systemctl-Aufruf ziehen.
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter "T002366"
# expected: PASS
```

- [ ] **Regression der Nachbartests.** Die Datei enthält bestehende
      `execution_released`-Tests; sicherstellen, dass der angehängte Block sie nicht bricht:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats
```

- [ ] **Live-Gegenprobe.** Gegen die echte Umgebung prüfen, dass das Kommando auch bei
      laufendem Tick zurückkehrt:

```bash
systemctl --user is-active factory.service
time timeout 20 bash scripts/ticket.sh release-hold --id T002366
# erwartet: Exit 0 in unter 20 s, inklusive Bestätigungszeile
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
