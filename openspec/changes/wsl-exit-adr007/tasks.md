---
title: "wsl-exit-adr007 — Implementation Plan"
ticket_id: T016436
domains: [plan-authoring]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# wsl-exit-adr007 — Implementation Plan

_Ticket: T016436_

## File Structure

```
docs/adr/ADR-007-wsl-exit-fleet-native-factory.md   # NEU: Supersession-ADR (Konvention ADR-001..006)
docs/adr/ADR-006-sdlc-isolation-dev-host.md          # Header: Status → Superseded by ADR-007
.gitattributes                                        # eol=lf-Guard *.sh/*.yaml/*.yml/*.bats/*.mjs
docs/windows-dev-setup.md                             # NEU: Setup + 3 P0-Spike-Checklisten
docs/WSL-BOOTSTRAP.md                                 # Shutdown-Checkliste ergänzen
```

## Tasks

- [ ] **ADR-007 schreiben.** Aufbau nach `docs/adr/ADR-006-sdlc-isolation-dev-host.md`:
      Kontext (WSL 10 GB / MemFree 122 MB, FreeToken braucht 64 GB RAM + VRAM),
      Entscheidung A+C, verworfene Alternativen (Proxmox dev-vm, Dev-in-Pod,
      llm-proxy-Migration, WSL registry-cache Behaltung), E17-Write-Authority-
      Bedenken (sdlc-cockpit-design) dokumentieren, Etappen auf die Kinder-
      Tickets T016424–T016438 mappen.
- [ ] **ADR-006 supersedieren.** Nur der Status-Header (+ Verweis/Datum), kein
      inhaltlicher Umbau — Historie bleibt lesbar.
- [ ] **.gitattributes eol=lf.** Guard ergänzen; prüfen ob bestehende Dateien
      CRLF tragen (`file`/`grep -rl $'\r'`) und ggf. Einmal-Normalisierung im
      selben PR.
- [ ] **windows-dev-setup.md.** Setup-Schritte + drei P0-Spike-Checklisten mit
      erwarteten Messnotizen (Zielort: `scripts/llm/measurements/`).
- [ ] **WSL-Shutdown-Checkliste.** In WSL-BOOTSTRAP.md: registry-cache-Container
      entfernen (T016428), Dienste-Drain, `wsl --shutdown` final.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** BATS-Test anlegen, der verifiziert: (a)
      ADR-007 existiert und enthält „Superseded"-Verweis-Kette in BEIDE
      Richtungen, (b) `.gitattributes` erzwingt lf für die fünf Suffixe.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/wsl-exit-docs.bats
# expected: FAIL (red — ADR-007 and .gitattributes guard do not exist yet)
```

- [ ] **Fix-Step (GREEN).** Artefakte gemäß Tasks anlegen; Test läuft grün.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/wsl-exit-docs.bats
```

- [ ] **Final Verification.** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
