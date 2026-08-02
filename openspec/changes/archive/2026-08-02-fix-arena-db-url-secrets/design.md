## Context

Der `arena-server` war ein WebSocket-basierter Mehrspieler-Spielserver, der im Juni 2026 im
Commit `4c1d107f4` (PR #2093) vollständig aus dem Codebase dekommissioniert wurde: Source
Code, K8s-Manifeste, DB-Schema-Referenzen, Secrets (`arena_db_url`, `arena_db_password`),
CI/CD-Jobs und Website-Frontend wurden entfernt. Der PR beschreibt eine bewusste, vollständige
Entfernung des Stacks.

Das Problem: Der `fleet`-Cluster (korczewski Namespace `workspace-korczewski`) hat noch drei
Live-Ressourcen aus der Zeit vor dem Decommission, die nie gelöscht wurden —
`deployment/arena-server`, `service/arena-server`, `ingressroute.traefik.io/arena-server`
(alle 45 Tage alt). Da die Manifeste nicht mehr im Repo sind, wendet kein `kubectl apply -k`
mehr etwas auf diese Objekte an — sie sind reines Cluster-Drift, das der Decommission-PR
liegen gelassen hat. Der Pod referenziert per `secretKeyRef` den (korrekterweise entfernten)
Key `arena_db_url` und schlägt seit 3+ Tagen mit `CreateContainerConfigError` fehl.

**Stakeholder:** Infra-Team (Deploy-Verantwortung), Ops (Cluster-Zustand).

## Goals / Non-Goals

**Goals:**
- Die drei verwaisten `arena-server`-Ressourcen aus `workspace-korczewski` entfernen.
- Sicherstellen, dass zukünftige Decommissions dieses Drift-Muster nicht wiederholen
  (Regressionstest, der auf verwaiste Ressourcen prüft).
- Keine Reaktivierung des Secrets/Schema-Eintrags — der Decommission-Beschluss bleibt gültig.

**Non-Goals:**
- Keine Wiederherstellung von `arena_db_url`/`ARENA_DB_URL` in Schema, Secrets oder
  SealedSecrets.
- Keine Re-Aktivierung des arena-server Stacks (Source Code, CI/CD, Website-Frontend).
- Keine generische Drift-Detection-Infrastruktur für alle Services (Scope-Grenze: nur
  arena-server-spezifisches Aufräumen + gezielter Regressionstest für diesen Fall).

## Decisions

### D1: Verwaiste Cluster-Ressourcen löschen statt Secrets wiederherstellen

**Entscheidung:** `deployment/arena-server`, `service/arena-server` und
`ingressroute.traefik.io/arena-server` werden per `kubectl delete` aus
`workspace-korczewski` entfernt. Es werden **keine** Secret-Keys wiederhergestellt.

**Begründung:** PR #2093 hat den arena-server bewusst und vollständig dekommissioniert —
Code, Manifeste, DB-Schema und Secrets wurden konsistent entfernt. Die drei Live-Objekte
sind der einzige Rest, der beim Decommission übersehen wurde. Eine Wiederherstellung der
Secrets würde den Decommission-Beschluss stillschweigend rückgängig machen, ohne dass dafür
ein neuer Produktentscheid vorliegt. Löschen ist die konsequente Fortsetzung der bereits
getroffenen Entscheidung und risikoärmer (der Pod läuft ohnehin nicht, `0/1` seit 3+ Tagen).

**Alternative (verworfen, ursprünglicher Plan-Entwurf):** `arena_db_url` im Secret
wiederherstellen, `ARENA_DB_URL` erneut in `environments/schema.yaml` registrieren, SealedSecret
neu versiegeln. Verworfen, weil das den expliziten Decommission-Beschluss (PR #2093)
rückgängig macht, ohne dass ein neuer Beschluss dafür vorliegt — reine Symptombekämpfung
statt Root-Cause-Fix.

### D2: Nur korczewski — mentolder unverändert

**Entscheidung:** Nur `workspace-korczewski` wird bereinigt.

**Begründung:** `arena-server` war korczewski-only (kein Eintrag in `k3d/kustomization.yaml`
base); nur dort existieren die verwaisten Cluster-Objekte.

### D3: Regressionstest statt Cluster-Fix allein

**Entscheidung:** Ein BATS-Test in `tests/spec/` prüft, dass `workspace-korczewski` keine
`arena-server`-Ressourcen mehr enthält (live-cluster-Check via `kubectl get`, offline-skip
wenn kein Cluster erreichbar).

**Begründung:** Ohne automatisierten Check bleibt das Drift-Problem unsichtbar, falls die
Ressourcen versehentlich erneut angelegt werden (z. B. durch einen Rollback oder eine
fehlerhafte Wiederherstellung).

## Risks / Trade-offs

- **[R1] Ressourcen doch noch gebraucht?** → Sehr unwahrscheinlich: PR #2093 ist ein
  bewusster, vollständiger Decommission-Commit; der Pod lief seit mindestens 3 Tagen nicht.
  **Mitigation:** Nur reine Cluster-Objekte werden gelöscht, keine Daten (kein PVC für
  arena-server vorhanden); jederzeit über `kubectl apply` aus einem alten Manifest-Stand
  reproduzierbar, falls doch benötigt.
- **[R2] Weitere verwaiste Ressourcen aus PR #2093** → Der Scope dieses Tickets beschränkt
  sich auf die drei bekannten Objekte in `workspace-korczewski`. **Mitigation:** Der
  Regressionstest (D3) deckt zumindest das Wiederauftreten dieses konkreten Falls ab; eine
  umfassende Drift-Suche über alle 2026-06-27-Decommission-Reste ist Non-Goal.
