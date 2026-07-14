---
title: "smtp-password-sync — Implementation Plan"
ticket_id: T001802
domains: [infra, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# smtp-password-sync — Implementation Plan

_Ticket: T001802_

## File Structure

```
environments/sealed-secrets/mentolder.yaml        (regenerated via task env:seal)
environments/sealed-secrets/fleet-mentolder.yaml  (regenerated via task env:seal)
```

## Task 1: Re-Seal mentolder

Führe `task env:seal ENV=mentolder` aus, um alle SealedSecrets aus der
Plaintext-Quelle neu zu erzeugen. Dadurch erhalten `workspace-secrets` und
`alertmanager-smtp` den identischen `SMTP_PASSWORD`-Wert.

- [ ] **Re-Seal.** `task env:seal ENV=mentolder` ausführen.
- [ ] **Diff prüfen.** Prüfe, dass `environments/sealed-secrets/mentolder.yaml`
      den `SMTP_PASSWORD`-Eintrag in `workspace-secrets` (Zeile ~94) und
      `alertmanager-smtp` (Zeile ~301) enthält. Die verschlüsselten Werte
      unterscheiden sich (unterschiedliche Secrets), aber der zugrunde
      liegende Plaintext muss identisch sein.
- [ ] **Commit.** Änderungen committen.

## Task 2: Re-Seal fleet-mentolder

Führe `task env:seal ENV=fleet-mentolder` aus, um die Fleet-SealedSecrets
ebenfalls zu synchronisieren.

- [ ] **Re-Seal.** `task env:seal ENV=fleet-mentolder` ausführen.
- [ ] **Diff prüfen.** Prüfe, dass `environments/sealed-secrets/fleet-mentolder.yaml`
      den `SMTP_PASSWORD`-Eintrag in `workspace-secrets` (Zeile ~94) und
      `alertmanager-smtp` (Zeile ~301) enthält.
- [ ] **Commit.** Änderungen committen.

## Task 3: Verify

- [ ] **Paritäts-Check.** Vergleiche die `SMTP_PASSWORD`-Einträge in
      `workspace-secrets` und `alertmanager-smtp` innerhalb jeder
      SealedSecrets-Datei. Beide müssen vorhanden sein (kein Key fehlend).
- [ ] **CI-Gates.** Führe die Standard-Qualitätstests aus:

```bash
task test:changed
task freshness:check
```

## Verify (RED → GREEN)

- [ ] **Pre-condition (RED).** Vor dem Re-Seal fehlt der `SMTP_PASSWORD`-Key
      in `alertmanager-smtp` oder der Wert weicht von `workspace-secrets` ab.
      (Dies wird durch den Ticket-Report bestätigt.)
- [ ] **Post-condition (GREEN).** Nach dem Re-Seal enthalten beide Secrets
      den `SMTP_PASSWORD`-Key mit identischem Plaintext.
