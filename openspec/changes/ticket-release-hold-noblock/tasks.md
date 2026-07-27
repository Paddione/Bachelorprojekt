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
scripts/ticket.sh                  (geändert — cmd_release_hold, Zeilen 317–329)
tests/spec/software-factory.bats   (geändert — RED-Test am Dateiende, bereits im Stage-Commit)
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
- `grep -n systemctl scripts/ticket.sh` liefert genau einen Treffer (Zeile 327). Die
  übrigen readiness-schreibenden Subkommandos sind nicht betroffen.

Der DB-Write läuft vor dem Hang durch; `execution_released` wird gesetzt. Der Fehler kostet
Operator-Zeit, verliert aber keinen Zustand.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Der Verhaltenstest liegt bereits am Ende von
      `tests/spec/software-factory.bats` und ist Teil des Stage-Commits. Er stubbt `kubectl`
      (liefert einen Pod-Namen, schluckt `exec`) und `systemctl` (blockiert 30 s ohne
      `--no-block`, kehrt mit `--no-block` sofort zurück) und ruft `release-hold` unter
      `timeout 5` auf. `TICKET_OFFLINE` bleibt bewusst `0` — mit `1` kehrte `release-hold`
      über `_ticket_offline_skip` vor dem systemctl-Aufruf zurück und der Test wäre auch
      ohne den Fix grün. Vor der Implementierung ausführen und den roten Lauf bestätigen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory.bats --filter "T002366"
# expected: FAIL (rot — release-hold blockiert noch auf dem Oneshot-Job; Exit 124)
```

- [ ] **Fix-Step (GREEN).** In `scripts/ticket.sh`, `cmd_release_hold`: den systemctl-Aufruf
      um `--no-block` ergänzen und die Bestätigungszeile davor ziehen, damit die
      Zustandsänderung auch bei klemmendem systemd gemeldet wird. Kein weiterer Umbau — der
      DB-Kontrollschlüssel `force-tick-requested` trägt die Semantik bereits, der
      systemctl-Aufruf ist nur ein Beschleuniger.

```bash
# Zielzustand der letzten beiden Zeilen von cmd_release_hold:
#   echo "execution_released set to true for ticket $id"
#   systemctl --user start --no-block factory.service 2>/dev/null || true
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
