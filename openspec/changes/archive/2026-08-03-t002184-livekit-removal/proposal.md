# Proposal: t002184-livekit-removal

## Why

LiveKit wird produktiv nicht mehr genutzt. Der Stack läuft trotzdem in beiden Brands weiter und
kostet Ressourcen, Angriffsfläche und Wartungsaufwand — und er blockiert Flux: `livekit-egress`
steht in beiden Namespaces auf `0/1` (`CreateContainerConfigError`, `couldn't find key
LIVEKIT_API_KEY in Secret workspace/workspace-secrets`). Ein einzelner ungesunder Workload
friert die gesamte Flux-Kustomization ein (siehe T002207), d.h. ein toter Dienst hält den
GitOps-Reconciler für alle anderen Workloads an.

Entscheidung von Patrick (2026-07-26): Rückbau statt Reparatur. Dieses Change entfernt LiveKit
vollständig — Cluster-Workloads, Manifeste, Node-Affinity-Pins, Env-Variablen, UI-Routen,
Doku und Specs.

### Bestandsaufnahme (eigene Inventur im Worktree, 2026-07-26)

**Cluster (`kubectl --context fleet`, read-only), identisch in `workspace` und
`workspace-korczewski`:**

| Ressource | Manager | Zustand |
|---|---|---|
| `deploy/livekit-server` | `kubectl` (handverwaltet, **kein Manifest im Repo**) | 1/1, 40d |
| `deploy/livekit-redis` | `kubectl` (handverwaltet, **kein Manifest**) | 1/1, 40d |
| `deploy/livekit-ingress` | `kubectl` (handverwaltet, **kein Manifest**) | 1/1, 40d |
| `deploy/livekit-egress` | `kustomize-controller` (`k3d/livekit-egress.yaml`) | **0/1**, blockiert Flux |
| `svc/livekit-server` | ClusterIP 7880/7881 | |
| `svc/livekit-redis` | ClusterIP 6379 | |
| `svc/livekit-ingress-rtmp` | LoadBalancer 1935 | mentolder: 5 externe IPs · korczewski: `<pending>` |
| `pvc/livekit-recordings-pvc` | 20Gi (longhorn / local-path) | |
| `cm/livekit-server-config` | | |
| `ing/livekit-server-ingress` | `livekit.<brand-domain>` | |

Drei von vier Deployments sind **nicht** im Repo — eine reine Repo-Bereinigung entfernt sie
nicht. Sie müssen explizit im Cluster gelöscht werden (gleiches Muster wie der handverwaltete
`llm-gateway-embed`-Service aus T002174).

**Repo (`grep -ril livekit`, ohne `node_modules`/`.git`):**

| Bereich | Dateien | Treffer | Anmerkung |
|---|---|---|---|
| `docs/` | 40 | 533 | inkl. `docs/generated/*` (regenerierbar) |
| `openspec/` | 43 | 139 | davon 36 in `changes/archive/` → **unangetastet** (Historie); 4 live SSOT-Specs |
| `k3d/` | 27 | 302 | nur **4** Quelldateien; 23 sind generiertes `k3d/docs-content-built/*.html` |
| `website/` | 17 | 68 | inkl. 3 generierte JSON + `all_files.txt` + `CHANGELOG.md` |
| `scripts/` | 12 | 26 | |
| `.claude/` | 8 | 31 | Agent-Routing + Skills |
| `tests/` | 4 | 15 | `health-goals.bats`, `fleet-dns-cutover.bats`, `ci-cd.bats`, `workspace-deploy.bats` |
| `environments/` | 3 | 6 | `staging.yaml` (`LIVEKIT_DOMAIN`, `LIVEKIT_PIN_IP`), 2× nur Kommentar |
| `prod-korczewski/` | 2 | 5 | `kustomization.yaml`, `ddns-updater.yaml` |
| `assets/` | 2 | 4 | Topology-SVGs |
| `prod-fleet/` | 1 | 1 | `components/fleet-common/kustomization.yaml` (Node-Affinity-Kommentar) |
| Root | 6 | — | `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `README.md`, `Taskfile.yml`, `renovate.json5`, `commitlint.config.cjs` |
| `.github/` | 1 | 2 | `build-website.yml` — `LIVEKIT_DOMAIN` in der fail-closed envsubst-Allowlist |
| `flux/` | 0 | 0 | keine LiveKit-Referenz |
| `prod/`, `prod-mentolder/` | 0 | 0 | |

**Zusatzbefunde der Inventur:**

1. **Der aktuelle Flux-Blocker ist nicht (mehr) LiveKit.** `flux-mentolder` und `flux-korczewski`
   sind `Ready=False` mit `Job/…/pocket-id-client-seed dry-run failed (Invalid)` — ein
   Immutable-Job-Problem, unabhängig von diesem Change. LiveKit ist der *zweite* Blocker, der
   nach dem Job-Fix greifen würde. Der Rückbau nimmt ihn präventiv weg; er macht Flux allein
   aber **nicht** grün. Das ist ein Nicht-Ziel dieses Changes.
2. **`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` existieren in keinem der beiden
   `workspace-secrets`** (verifiziert) — es gibt also keinen Secret-Key zu entfernen, nur die
   `secretKeyRef`-Referenz im Manifest. Der Rückbau erledigt G-OPS01-STATIC-001 für `LIVEKIT_*`.
3. **`LIVEKIT_DOMAIN`/`LIVEKIT_PIN_IP` sind in `environments/schema.yaml` gar nicht
   registriert** (0 Treffer) — eigenständiger Schema-Drift. `STREAM_DOMAIN` dagegen ist
   registriert (Zeile 310) und in allen 5 Env-Dateien gesetzt; es gehört zum selben
   Streaming-Feature und wird mitentfernt.
4. **`prod-korczewski/kustomization.yaml` verweist auf ein `patch-livekit.yaml`, das nicht
   existiert** — toter Kommentar/Verweis.
5. **coturn / Janus / Talk-HPB werden NICHT mitentfernt.** Sie haben 33/21/19 Treffer und hängen
   an Nextcloud Talk, nicht an LiveKit. Der Plan enthält einen reinen Prüf-Task, der die
   Kopplung dokumentiert; eine Entfernung wäre ein eigenes Ticket.

## What

Vollständiger Rückbau in einer **sicherheitsgetriebenen Reihenfolge**: erst Cluster (damit der
Health-Gate-Blocker weg ist, bevor Manifeste sich ändern), dann Manifeste, dann Env/Secrets/
Workflow-Allowlist, dann UI, dann Doku/Specs/Tests, dann Verifikation.

### In Scope

- **P1 Cluster-Rückbau (beide Brands, schreibendes kubectl):** 8 Deployments, 6 Services (inkl.
  LoadBalancer-IP-Freigabe), 2 PVCs, 2 ConfigMaps, 2 Ingresses. Vorher Flux-Kustomization
  suspendieren, danach resume und Health-Gate beobachten.
- **P2 Manifeste:** `k3d/livekit-egress.yaml` löschen, Eintrag in `k3d/kustomization.yaml:24`
  entfernen, LiveKit-Kommentar in `k3d/namespace.yaml` (hostNetwork-Begründung) korrigieren,
  Node-Affinity-Pins in `prod-fleet/components/fleet-common/kustomization.yaml` und die
  `patch-livekit.yaml`-Referenz in `prod-korczewski/kustomization.yaml` entfernen,
  `prod-korczewski/ddns-updater.yaml` von `livekit.<domain>`-Records befreien.
- **P3 Environments, Secrets, CI-Allowlist:** `LIVEKIT_DOMAIN`/`LIVEKIT_PIN_IP`/`STREAM_DOMAIN`
  aus `environments/*.yaml` und `environments/schema.yaml`, `.github/workflows/build-website.yml`
  (beide envsubst-Zeilen), alle `envsubst`-Listen in `Taskfile.yml`, `environments/.secrets/*`
  auf verwaiste `LIVEKIT_*`-Keys prüfen und bei Bedarf `task env:seal` neu ausführen.
- **P4 Website:** Routen `/portal/stream` und `/admin/live`, Komponenten unter
  `src/components/live/` und `src/components/LiveStream/`, DNS-Pin-Feature
  (`api/admin/ops/dns/pin.ts` und `DnsZertTab.svelte`), `helpContent.ts`,
  `system-test-seed-data.ts`, Admin-Navigation, route-manifest regenerieren.
- **P5 Doku, Specs, Tests:** 4 live SSOT-Specs via OpenSpec-Delta (nicht per Handedit),
  `CLAUDE.md`/`AGENTS.md`/`GEMINI.md`/`README.md`, `.claude/`-Agenten und Skills,
  `renovate.json5`-Gruppe, `commitlint.config.cjs`-Scope, `tests/spec/health-goals.bats`
  (G-OPS01b muss weg, sonst dauerhaft rot), `tests/unit/fleet-dns-cutover.bats`,
  `docs/`-Quelldateien; generierte Artefakte (`docs/generated/*`, `k3d/docs-content-built/*`,
  `website/src/lib/*.generated.json`) per Regenerator, nicht per Handedit.
- **P6 Verifikation:** Cluster leer, Repo-Grep leer, `task test:all`, `task freshness:check`.

### Non-Goals

- **Flux grün machen.** Der `pocket-id-client-seed`-Immutable-Job-Fehler ist ein eigenes Problem
  und gehört in ein eigenes Ticket.
- **coturn / Janus / Talk-HPB entfernen.** Nur prüfen und dokumentieren.
- **`openspec/changes/archive/**` und `openspec/specs/archive/**` ändern.** Historie bleibt.
- **`website/CHANGELOG.md` und Git-Historie umschreiben.**

_Ticket: T002184_
