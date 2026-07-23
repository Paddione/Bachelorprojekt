---
ticket_id: T002097
plan_ref: openspec/changes/ops-pods-not-ready/tasks.md
---

# ops-pods-not-ready — Design Spec

## Root-Cause-Analyse (Live-Re-Messung 2026-07-23)

Die dokumentierte Baseline (2026-07-22, 3→2) ist inzwischen überholt. Live-Re-Messung
gegen `fleet` zeigt ein anderes Bild:

1. **`workspace/test-pod` (Failed/Debris)** — bereits weg. Kein Handlungsbedarf.

2. **`workspace/livekit-egress-6c7759c9bb-fc2hp`** — seit 2026-07-19 (4 Tage) in
   `ContainerCreating` hängen geblieben. `kubectl get deploy livekit-egress -n workspace`
   zeigt `status.conditions[Progressing] = False, reason: ProgressDeadlineExceeded,
   message: "ReplicaSet livekit-egress-6c7759c9bb has timed out progressing"`
   (seit `2026-07-19T10:47:37Z`).
   - **Root Cause:** Die `RollingUpdate`-Strategie (`maxSurge: 25%`, `maxUnavailable: 25%`,
     bei `replicas: 1` effektiv "1 neuer Pod hoch, bevor der alte runter") versucht beim
     Rollout auf `livekit/egress:v1.13.0` einen zweiten Pod auf einem ANDEREN Node
     (`gekko-hetzner-3`) zu starten, während der alte Pod (Image `v1.9.0`,
     ReplicaSet `livekit-egress-6b766fbf79`) weiter auf `pk-hetzner-6` läuft und die
     PersistentVolumeClaim `livekit-recordings-pvc` (ReadWriteOnce) hält. Der neue Pod
     kann das Volume nicht auf einem zweiten Node mounten → endloses `ContainerCreating`.
   - **Zusatzbefund (Infra-Drift):** Das Deployment `livekit-egress` in `workspace` ist
     in KEINER Datei im Repo als YAML-Manifest getrackt (exhaustive `grep -rl` über
     `k3d/`, `prod*/`, `prod-fleet/`; nur Erwähnungen in Kommentaren/Docs, keine
     `kind: Deployment`-Quelle). `kubectl.kubernetes.io/last-applied-configuration`
     bestätigt reinen `kubectl apply` (revision 14, generation 16) — die aktuelle
     Live-Konfiguration ist damit die einzige Quelle der Wahrheit. Der Fix adoptiert
     das Deployment als `k3d/livekit-egress.yaml` (neue Datei, Kustomize-Base) MIT
     `strategy.type: Recreate` (statt `RollingUpdate`), damit künftige Image-Updates
     den alten Pod erst terminieren, bevor der neue die RWO-PVC beansprucht.

3. **`workspace-korczewski/oauth2-proxy-terminal-6f7cf8c584-mj2vx`** —
   `CreateContainerConfigError`: `couldn't find key POCKET_ID_TERMINAL_SECRET in Secret
   workspace-korczewski/workspace-secrets`.
   - **Root Cause:** `k3d/oauth2-proxy-terminal.yaml` (brand-übergreifende Basis)
     referenziert `POCKET_ID_TERMINAL_SECRET` per `secretKeyRef` gegen `workspace-secrets`.
     Der Key existiert in `environments/.secrets/mentolder.yaml` UND
     `environments/.secrets/fleet-mentolder.yaml`, fehlt aber komplett in
     `environments/.secrets/korczewski.yaml` UND `environments/.secrets/fleet-korczewski.yaml`
     (verifiziert per `grep`). Dadurch fehlt der Key konsequent auch in den daraus
     gesiegelten `environments/sealed-secrets/korczewski.yaml` /
     `environments/sealed-secrets/fleet-korczewski.yaml`. Der alte Pod (14 Tage alt,
     `Running`) bedient weiter Traffic, weil er vor der letzten Secret-Rotation
     erstellt wurde — aber jeder neue Rollout (z. B. der reguläre ~108m-Redeploy-Zyklus)
     scheitert reproduzierbar mit `CreateContainerConfigError`.
   - Bug-Klasse identisch zu G-CD01 (T001358-artige Secret-Drift zwischen
     Deployment-Anforderung und Brand-Secrets-Datei), aber `sealed-secret-cluster-drift.bats`
     deckt bisher nur `website-secrets` ab, nicht `workspace-secrets`.

## Explizit außer Scope

**`oauth2-proxy-brett` CrashLoopBackOff (beide Brands, `workspace` 8 Restarts,
`workspace-korczewski` 25 Restarts).** Live-Logs zeigen `unknown flag:
--skip-auth-routes` — `oauth2-proxy` v7.9.0 kennt nur `--skip-auth-route` (Singular);
`--skip-auth-routes` (Plural) existiert nicht und lässt den Container mit
Usage-Dump + Exit 2 abbrechen. Der committete `k3d/oauth2-proxy-brett.yaml` auf `main`
enthält den fehlerhaften Plural-Flag. Auf dem Ausgangs-Checkout dieses Tickets
(`chore/cleanup-stale-agent-refs-T002093`) liegt dafür bereits ein UNCOMMITTED
Fix einer anderen Session vor (Plural → Singular). Um keinen Merge-Konflikt und
keinen Doppel-Fix zu erzeugen, wird dieser Pod-Fehler hier NICHT angefasst — sobald
die andere Session ihren Fix committed/merged, sinkt die Live-Pod-Zahl unabhängig
von diesem Ticket weiter.

## Fix-Ansatz

1. `environments/.secrets/korczewski.yaml` + `environments/.secrets/fleet-korczewski.yaml`:
   `POCKET_ID_TERMINAL_SECRET` ergänzen (neuer, zufälliger Wert — kein Wert-Reuse
   über Brands hinweg, Security-Konvention).
2. `task env:seal ENV=korczewski` + `task env:seal ENV=fleet-korczewski` neu
   generieren → `environments/sealed-secrets/korczewski.yaml` +
   `environments/sealed-secrets/fleet-korczewski.yaml` aktualisieren.
3. `k3d/livekit-egress.yaml` neu anlegen (Deployment + Service, aus der Live-
   `last-applied-configuration` rekonstruiert) mit `strategy.type: Recreate`;
   als Resource in `k3d/kustomization.yaml` eintragen.
4. Nach Merge (Post-Merge-Deploy, außerhalb dieses Plans — `task workspace:deploy`
   ist push-based und läuft automatisch bei Merge nach main): Live-Verifikation via
   `python3`-Zählskript aus `.claude/lib/goals.md` (G-OPS01).

## Failing Tests (rot vor Fix)

Zwei NEUE, CI-lauffähige (kein Live-Cluster nötig) `@test`-Blöcke in
`tests/spec/health-goals.bats`:

- **G-OPS01a** — statischer Key-Paritäts-Check: jeder `secretKeyRef.key` mit
  `name: workspace-secrets` aus `k3d/oauth2-proxy-terminal.yaml` muss in
  `environments/.secrets/korczewski.yaml` vorhanden sein. Schlägt aktuell fehl
  (`POCKET_ID_TERMINAL_SECRET` fehlt).
- **G-OPS01b** — statischer Manifest-Existenz-Check: `k3d/livekit-egress.yaml`
  muss existieren, ein `kind: Deployment` mit `name: livekit-egress` enthalten
  UND `strategy.type: Recreate` setzen. Schlägt aktuell fehl (Datei existiert
  nicht).

**Bewusste CI-Grenze:** Der eigentliche Live-Pod-Zustand (ContainerCreating,
CreateContainerConfigError) kann in CI nicht reproduziert werden — CI hat keinen
Zugriff auf den `fleet`-Cluster. Die G-OPS01-Zählmessung aus `.claude/lib/goals.md`
bleibt manuelle Pre-/Post-Verifikation (vor und nach Deploy live gegen `fleet`
ausführen), nicht Teil des automatisierten Testlaufs.
