---
ticket_id: T011580
plan_ref: openspec/changes/fix-alibaba-token-key-guard-tmpdir/tasks.md
status: active
date: 2026-08-17
---

# Design: fix-alibaba-token-key-guard-tmpdir (T011580)

## Root-Cause (verifiziert — T002448-M5)

**Symptom:** `tests/spec/security/alibaba-token-key-guard.bats` Test 1 ist lokal dauerhaft rot. Er kopiert die Fixture nach `$BATS_TEST_TMPDIR` und erwartet von gitleaks einen Fund (Exit 1); er bekommt "no leaks found" (Exit 0).

**Ursache (REPRO, 2026-08-17, gitleaks 8.18.2):**

```bash
cp tests/spec/security/fixtures/alibaba-token-key-leak.txt /tmp/alk.txt && \
  gitleaks detect --config .gitleaks.toml --no-git --source /tmp/alk.txt; echo EXIT=$?
# -> EXIT=0, erwartet 1
```

Seit T002554 steht `.*tmp.*` in der gitleaks-Allowlist (`.gitleaks.toml:52`). `$BATS_TEST_TMPDIR` liegt unter `/tmp` und matcht das Muster — der Fund wird allowlisted. Der Testkommentar ("dort wirkt die Allowlist nicht") war zum Entstehungszeitpunkt (T004808) richtig und ist seit T002554 falsch. In CI fällt das nicht auf: Der BATS-Test skippt ohne gitleaks-Binary, und der `security-scan`-Job (fail-closed) deckt den eigentlichen Scan ab.

## Fix-Ansatz (Nutzer-Entscheid 2026-08-17)

Der Test kopiert die Fixture künftig in ein Verzeichnis **ohne** `tmp`-Segment: `mktemp -d /dev/shm/alk.XXXXXX`. `/dev/shm` matcht kein Allowlist-Muster; als tmpfs außerhalb des Repos sieht ihn der lokale Pre-Commit-Hook (`--no-git` über den Arbeitsbaum) nie.

**Verworfene Alternative:** Allowlist-Muster präzisieren (`^tmp/` statt `.*tmp.*`). Das kehrt die dokumentierte T002554-Entscheidung um: die 85 lokalen Fehlalarme aus `node_modules`/`tmp/`/Scratch-Pfaden kämen zurück, der lokale Hook wäre wieder strenger als das CI-Gate. Prior-Art: `.gitleaks.toml`-Kommentar (T002554-Block) und `openspec/specs/secrets-deploy-automation.md` (Requirement "gitleaks-Gegenscan").

## Betroffene Subsysteme

- `tests/spec/security/alibaba-token-key-guard.bats` — einzige produktive Änderung
- `.gitleaks.toml` — unverändert (Referenz-Kontext)
- `openspec/specs/secrets-deploy-automation` — MODIFIED-Delta (neues Scenario für Positivtest-Scanpfade)

## Edge-Cases

- `/dev/shm` fehlt (z. B. macOS): Guard `[ -d /dev/shm ] || skip …` — der Test skippt sauber statt zu brechen (Muster T002820).
- tmpfs-Aufräumen: `trap 'rm -rf "$SCAN_DIR"' EXIT` — kein Müll in `/dev/shm`.
- gitleaks fehlt: bestehender Guard (`command -v gitleaks || skip`) bleibt.
- Die Fixture bleibt im Repo-Pfad allowlisted (`(?i)tests/.*fixtures/.*`) — der CI-Repo-Scan sieht sie weiterhin nicht; keine CI-Auswirkung.

## Was explizit NICHT im Scope ist

- Keine Änderung der `.gitleaks.toml`-Allowlist.
- Keine Änderung am CI-Security-Scan (der war nie betroffen).
- Keine neue Test-Datei — die bestehende Datei wird geändert (T002416: Bestandsdateien bleiben liegen, werden nur nicht mehr erweitert; dieser Fix ändert einen bestehenden Test, hängt nichts an).
