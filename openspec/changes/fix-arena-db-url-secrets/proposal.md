## Why

Der `arena-server` wurde am 2026-06-27 in PR #2093 (Commit `4c1d107f4`) bewusst vollständig
dekommissioniert: Source Code, K8s-Manifeste, DB-Schema, Secrets und CI/CD-Referenzen wurden
aus diesem Repository entfernt. Trotzdem existieren im `fleet`-Cluster im Namespace
`workspace-korczewski` noch drei verwaiste Live-Ressourcen aus der Zeit vor dem Decommission,
die nie gelöscht wurden: `deployment/arena-server`, `service/arena-server`,
`ingressroute.traefik.io/arena-server` (alle 45 Tage alt). Weil die K8s-Manifeste nicht mehr
im Repo sind, greift kein `kubectl apply -k` mehr auf diese Objekte zu — sie sind reines
Cluster-Drift.

Der `arena-server`-Pod referenziert per `secretKeyRef` den Key `arena_db_url` im
`workspace-secrets` Secret. Dieser Key wurde im selben Decommission-Commit korrekt aus
`environments/schema.yaml` und den SealedSecrets entfernt — der Pod kann den Key seither
nicht mehr finden und schlägt mit `CreateContainerConfigError` fehl.

**Root Cause:** Nicht ein fehlender Secret-Key, sondern ein unvollständiger Decommission —
die Live-Cluster-Objekte wurden beim Entfernen der Manifeste aus dem Repo nicht mit
`kubectl delete` entfernt.

## What Changes

- Lösche die drei verwaisten `arena-server`-Ressourcen aus dem `fleet`-Cluster,
  Namespace `workspace-korczewski`: `deployment/arena-server`, `service/arena-server`,
  `ingressroute.traefik.io/arena-server`.
- **Keine** Wiederherstellung von `arena_db_url`/`ARENA_DB_URL` in Schema, Secrets oder
  SealedSecrets — das würde den bewussten Decommission-Beschluss aus PR #2093 rückgängig
  machen.
- Ergänze einen Regressions-Test, der sicherstellt, dass keine `arena-server`-Ressourcen
  mehr im `workspace-korczewski`-Namespace existieren (live-cluster-Check, offline-skip).

## Capabilities

### New Capabilities

_(keine neuen Capabilities)_

### Modified Capabilities

_(keine — `arena-server` ist bereits vollständig dekommissioniert; dieser Change räumt nur
noch verwaistes Cluster-Drift auf)_

## Impact

- **Cluster**: `workspace-korczewski` verliert drei verwaiste Ressourcen (kein aktiver
  Traffic betroffen, da der Pod ohnehin seit 3+ Tagen crash-loopt und `0/1` ready ist).
- **Repo**: Kein Manifest-Change nötig (die Ressourcen sind bereits nicht mehr im Repo
  definiert) — nur ein neuer Regressionstest.
- **Risiko**: Sehr gering — reine Aufräumaktion für bereits dekommissionierten,
  nicht-funktionsfähigen Service. Kein Rollback-Bedarf, da der Pod ohnehin nicht lief.
