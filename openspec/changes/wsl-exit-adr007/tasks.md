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

- [x] **ADR-007 schreiben.** Aufbau nach `docs/adr/ADR-006-sdlc-isolation-dev-host.md`:
      Kontext (WSL 10 GB / MemFree 122 MB, FreeToken braucht 64 GB RAM + VRAM),
      Entscheidung A+C, verworfene Alternativen (Proxmox dev-vm, Dev-in-Pod,
      llm-proxy-Migration, WSL registry-cache Behaltung), E17-Write-Authority-
      Bedenken (sdlc-cockpit-design) dokumentieren, Etappen auf die Kinder-
      Tickets T016424–T016438 mappen.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `docs/adr/ADR-007-wsl-exit-fleet-native.md` (PR #5248). Der Dateiname weicht von der
      File-Structure oben ab (`…-fleet-native-factory.md`) — Inhalt und Verweiskette stimmen.
- [x] **ADR-006 supersedieren.** Nur der Status-Header (+ Verweis/Datum), kein
      inhaltlicher Umbau — Historie bleibt lesbar.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Header-Zeile `> **SUPERSEDED by ADR-007 (2026-08-24)**` steht auf `main`.
- [x] **.gitattributes eol=lf.** Guard ergänzen; prüfen ob bestehende Dateien
      CRLF tragen (`file`/`grep -rl $'\r'`) und ggf. Einmal-Normalisierung im
      selben PR.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `.gitattributes` liegt auf `main` (PR #5451, Commit 25edd2415).
- [x] **windows-dev-setup.md.** Setup-Schritte + drei P0-Spike-Checklisten mit
      erwarteten Messnotizen (Zielort: `scripts/llm/measurements/`).
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `docs/windows-dev-setup.md` liegt auf `main` (PR #5248).
- [ ] **WSL-Shutdown-Checkliste.** In WSL-BOOTSTRAP.md: registry-cache-Container
      entfernen (T016428), Dienste-Drain, `wsl --shutdown` final.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):** **OFFEN, Nachweis nicht führbar.**
      `docs/WSL-BOOTSTRAP.md` existiert auf `main` nicht mehr — die Datei wurde in 848e6ccee
      ("complete WSL-to-fleet cutover", T016422) entfernt. Der zugehörige BATS-Fall in
      `tests/spec/wsl-exit-docs.bats` überspringt sich deshalb per `skip`. Entweder ist der Task
      gegenstandslos (Checkliste ist mit der Datei entfallen) oder die Checkliste fehlt ersatzlos;
      beides ist nicht aus dem Repo entscheidbar und braucht eine Operator-Aussage.

## Verify (RED → GREEN)

- [x] **Failing-Test-Step (RED).** BATS-Test anlegen, der verifiziert: (a)
      ADR-007 existiert und enthält „Superseded"-Verweis-Kette in BEIDE
      Richtungen, (b) `.gitattributes` erzwingt lf für die fünf Suffixe.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      `tests/spec/wsl-exit-docs.bats` liegt auf `main` (PR #5248).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/wsl-exit-docs.bats
# expected: FAIL (red — ADR-007 and .gitattributes guard do not exist yet)
```

- [x] **Fix-Step (GREEN).** Artefakte gemäß Tasks anlegen; Test läuft grün.
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Test läuft grün (4 Fälle, davon Fall 4 `skip` — siehe offenen Task oben).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/wsl-exit-docs.bats
```

- [x] **Final Verification.** Die drei Pflicht-Gates:
      **Nachgezogen T900054 (2026-09-04, Deliverable-Check gegen `origin/main`):**
      Über die gemergten PRs #5248 und #5451 belegt (Repo-Regel 4: CI grün vor Merge).

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
