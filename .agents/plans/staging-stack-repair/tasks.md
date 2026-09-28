# Plan: staging-stack-repair

Zweck: Restoriert den degradierten workspace-Staging-Stack in fleet (RC1 Secret-Drift, RC2 DB-Schema-Drift, RC3 db-restore-verify, RC4 pvc-backup/mounter) und behebt die stale selection-snapshot Red (P6). Ticket T900806.

Live-Stand (2026-09-28, kubectl -n workspace-staging, context fleet):
- Jobs: 18 = 13 Complete / 5 Failed. Failed: admin-actions-cleanup-29843520, admin-actions-cleanup-29843550 (recurrent, RC2: admin_actions fehlt), pocket-id-client-seed, pvc-backup-29839740/-29841180/-29842620 (RC4). Mounter-Job-Objekt pvc-backup-mounter-20260928-015032 inzwischen NotFound (TTL).
- backup-pvc (workspace-staging): **Pending**, kein Volume, storageclass local-path, ~101m alt. PV **backup-pvc-pkh8**: Available, 1Gi, RWO, local-path, ~115m alt. 8 weitere staging PVCs: Bound (local-path).
- nextcloud + vaultwarden Pods beide auf pk-hetzner-8 (podAffinity-Term erfüllbar).
- CronJobs: db-restore-verify, pvc-backup, admin-actions-cleanup, admin-actions-prune, sessions-purge, knowledge-ingest-{prs,markdown,bugs,reindex-all}.

## Partials

| Partial | min_tier | ctx_tokens | Write-Scope | Gate |
|---|---|---|---|---|
| p1 | 27b-local | 60000 | environments/.secrets/staging.yaml, environments/schema.yaml (nur bei Gate-Fehler), environments/sealed-secrets/staging.yaml | env-seal exit 0, workspace-secrets-Doc 97 keys |
| p2 | 27b-local | 60000 | (kein Repo-Write; live exec) | error_log + admin_actions existieren; tickets.tickets vorhanden |
| p3 | 4b-local | 32000 | (kein Repo-Write; live) | db-restore-verify job Complete, Logs clean |
| p4 | 27b-local | 60000 | k3d/pvc-backup-cronjob.yaml (nur falls nötig) + live PVC/PV-Fix | backup-pvc Bound, pvc-backup job Complete |
| p5 | 27b-local | 60000 | (kein Repo-Write; live) | keine stale Failed Jobs, alle Trigger Complete, flux-staging green |
| p6 | 4b-local | 32000 | tests/spec/selection-integrity/live-snapshot.txt | find-dead-selections.sh --snapshot exit 0 |

Abhängigkeiten: p5 läuft zuletzt (nach p1/p2/p4 merged + p3 verifiziert). p6 unabhängig (getrennte Red).

## Execution
- Worktree: .worktrees/staging-stack-repair, Branch fix/staging-stack-repair-T900806 (auf origin/main fast-forwarded)
- Dispatch-Reihenfolge: (p1 + p3) → (p2 + p6) → p4 → p5
- Budget: local 60k, 4b 32k; Queue-Summe ≤ 128k; local 2× Fehlschlag → exe-muse-Eskalation (kompakter Handoff: goal, done-so-far, stuck-point)
- CI-Gates nach Partials: `task test:changed` + `task freshness:check` + `task workspace:validate`
- PR manuell (pr-ready-Gate, kein Auto-Merge); Merge = Ticket-Closure (T001092)
- Phase-Events: implement entered/done/blocked via ticket-mcp `record_phase_event` (T900806, detail JSON {executor, subagent, partial, budget_tokens, duration_s, exit})
