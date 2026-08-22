# Proposal: pvc-backup-clone-stuck-T013044

## Why

Der pvc-backup CronJob (ns `workspace`, mentolder) schlägt seit 2026-06-23 jede Nacht fehl; der letzte erfolgreiche Lauf war 2026-06-09. Root Cause (live verifiziert 2026-08-22): Der Zombie-Pod `pvc-backup-mounter-20260610-093119-cns4z` (Succeeded, manueller Lauf vom 10.06., nie aufgeräumt) referenziert weiterhin die Clone-PVC `vaultwarden-data-backup-clone`. Dessen `pvc-protection`-Finalizer blockiert die Löschung seit `2026-06-23T01:03:09Z` — die PVC hängt seit 60 Tagen auf `Terminating`. Jeder Folgelauf (a) no-op-patcht den löschenden Clone (Phase bleibt `Bound`, der Bindungs-Check läuft durch), (b) startet einen Mounter, der das löschende Volume nicht attachen kann, und (c) fällt in den 3000s-Doppel-Timeout der beiden `kubectl wait` → Job Failed. [T013044]

## What

1. **Sofortmaßnahme** (Executor-Schritt 0, einmalig): Zombie-Pod und alte Mounter-Artefakte löschen, damit der Finalizer fällt; manuellen Lauf triggern und Erfolg verifizieren.
2. **Orchestrator-Härtung** in `k3d/pvc-backup-cronjob.yaml`:
   - Stale-Clone-Löschung mit `--wait --timeout` und lautem Fehler inkl. Ausgabe der blockierenden Pods, wenn ein Clone weiter `Terminating` bleibt.
   - Bindungs-Check prüft zusätzlich `metadata.deletionTimestamp` — ein löschender Clone zählt nicht als gebunden.
   - Vor dem Mounter-Start: alte beendete Mounter-Jobs löschen; `ttlSecondsAfterFinished` am Mounter-Job verhindert künftige Zombies.

_Ticket: T013044_
