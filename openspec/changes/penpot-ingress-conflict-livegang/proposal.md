# Proposal: penpot-ingress-conflict-livegang

## Why

**Symptom (beobachtet, reproduzierbar am 2026-08-30).** `flux-mentolder` steht auf
`READY=False` und deployt damit die **gesamte** mentolder-Brand nicht mehr — nicht nur
Penpot. `flux-mentolder-jobs` hängt als `dependsOn` mit drin.

```bash
kubectl --context fleet get kustomization -n flux-system
# flux-mentolder       False  kustomize build failed: accumulating resources:
#   may not add resource with an already registered id:
#   Ingress.v1.networking.k8s.io/workspace-ingress-penpot.workspace
# flux-mentolder-jobs  False  dependency 'flux-system/flux-mentolder' is not ready
# flux-staging         False  Service/workspace-staging/penminio dry-run failed (Invalid):
#   [spec.ports[0].name: Required value, spec.ports[1].name: Required value]
```

**Ursache (verifiziert, nicht angenommen).** Zwei Manifeste definieren dasselbe Ingress
`workspace-ingress-penpot`:

| Datei | Host | Namespace |
|---|---|---|
| `k3d/penpot-ingress.yaml` (Base) | `design.localhost` | *(keiner)* |
| `prod-fleet/<brand>/penpot-ingress-route.yaml` | `design.${PROD_DOMAIN}` | `${WORKSPACE_NAMESPACE}` |

Die Overlay-Datei steht unter `resources:` statt als Patch. Entscheidend für die
Diagnose: **lokal kollidieren die beiden nicht.** `kubectl kustomize prod-fleet/mentolder`
läuft durch, weil `${WORKSPACE_NAMESPACE}` als Literal stehenbleibt und die Ressourcen-IDs
dadurch verschieden sind. Erst Flux' `envsubst` macht aus beiden
`workspace/workspace-ingress-penpot`. Deshalb ist der Fehler durch keinen lokalen
Kustomize-Build aufgefallen.

**Reichweite.** `flux-korczewski` meldet `READY=True`, hängt aber auf der älteren Revision
`c3aa8f70`. Da `prod-fleet/korczewski/penpot-ingress-route.yaml` identisch existiert,
bricht die zweite Brand beim nächsten Sync auf dieselbe Weise. Der Fix gehört deshalb ins
gemeinsame `prod/`-Overlay, unabhängig davon, dass nur mentolder live geht.

**Zweiter, unabhängiger Defekt.** Der Service `penminio` in `k3d/penpot.yaml` hat zwei
Ports (9000, 9001) ohne `name`. Kubernetes verlangt Namen, sobald ein Service mehr als
einen Port führt — das blockiert `flux-staging` und würde Penpot auch in der Brand
scheitern lassen.

**Warum jetzt zusammen mit dem Livegang.** `add-penpot-service` (T016593) ist mit 12/12
Tasks abgeschlossen, die OIDC-Verdrahtung steht vollständig, aber der Dienst läuft nicht:
`design.mentolder.de` antwortet mit Traefik-404, es existiert kein Penpot-Pod. Die Fixes
oben sind exakt das, was zwischen dem fertigen Manifest-Stand und einem laufenden Dienst
steht. Sie getrennt zu behandeln hieße, denselben Deploy zweimal zu verifizieren.

## What Changes

1. **Ingress-ID-Konflikt auflösen** nach dem im Repo etablierten Muster: `prod/kustomization.yaml`
   löscht den Base-Ingress `workspace-ingress-penpot` per `$patch: delete` — genau wie es das
   bereits für `workspace-ingress` und `workspace-ingress-internal` tut (Z. 105–122). Die
   brandspezifischen `penpot-ingress-route.yaml` bleiben unverändert als eigene Ressourcen.

2. **`penminio`-Service reparieren**: beide Ports in `k3d/penpot.yaml` benennen
   (`api` für 9000, `console` für 9001).

3. **Doppelten `patches:`-Schlüssel bereinigen**: `prod-fleet/mentolder/kustomization.yaml`
   enthält zwei `patches:`-Blöcke; der zweite überschreibt den ersten, wodurch
   `bge-hosts-patch.yaml` still ignoriert wird. Zu einem Block zusammenführen und die
   tatsächliche Wirkung des bislang ignorierten Patches prüfen.

4. **Penpot-Secrets für mentolder**: `PENPOT_DB_PASSWORD`, `PENPOT_SECRET_KEY`,
   `PENPOT_MINIO_SECRET_KEY` in `environments/.secrets/mentolder.yaml` ergänzen, per
   `task env:seal ENV=mentolder` versiegeln und das SealedSecret committen.

5. **Livegang und Verifikation**: Flux-Reconcile abwarten, Penpot-Pods prüfen, TLS und DNS
   für `design.mentolder.de` bestätigen, und den OIDC-Login über Pocket ID
   **end-to-end** durchspielen (Seed-Client, Redirect `/api/external-auth`).

6. **Runbook-Nachtrag** zum OpenDesign-Flow: FreeToken kann über HTTP grundsätzlich kein
   Vision (belegt in `freetoken/server/generation.py:240`), der funktionierende Weg ist
   LM Studio; inklusive der Messreihe und der Erkenntnis, dass GPU-Offload unterhalb einer
   VRAM-Reserveschwelle langsamer statt schneller wird.

## Scope

**Enthalten:** mentolder geht live. Der Flux-Fix (Punkte 1–3) wirkt systembedingt für beide
Brands, weil er im gemeinsamen `prod/`-Overlay sitzt.

**Nicht enthalten:** Penpot für korczewski produktiv zu schalten (Operator-Entscheidung
2026-08-30). `prod-fleet/korczewski/penpot-ingress-route.yaml` bleibt bestehen und wird
durch Punkt 1 lauffähig, ohne dass korczewski Penpot-Secrets erhält — der Dienst startet
dort also nicht. Das ist beabsichtigt und wird im Runbook vermerkt.

**Ebenfalls nicht enthalten:** `environments/.secrets/.ssh/config` lässt sich mit dem
vorhandenen git-crypt-Key nicht entschlüsseln (`encrypted file has been tampered with`).
Das ist ein eigenständiger Befund ohne Bezug zu Penpot und gehört in ein separates Ticket.

## Risks

- **Der Ingress-Fix ist nur unter `envsubst` prüfbar.** Ein lokaler `kubectl kustomize`
  beweist nichts, weil er den Fehler gar nicht erst erzeugt. Die Verifikation muss den
  gerenderten Zustand mit ersetzten Variablen prüfen.
- **Penpot bringt eigene Infrastruktur mit** (Backend, Frontend, Exporter, Redis, MinIO mit
  PVC) und nutzt die geteilte `shared-db`. Ressourcen und Node-Affinity auf dem fleet-Cluster
  sind vor dem Rollout zu prüfen.
- **Der Livegang macht einen Dienst öffentlich erreichbar.** Ohne funktionierenden
  OIDC-Gate wäre `design.mentolder.de` offen; die OIDC-Verifikation ist deshalb Teil der
  Abnahme, nicht optionaler Nachtrag.
