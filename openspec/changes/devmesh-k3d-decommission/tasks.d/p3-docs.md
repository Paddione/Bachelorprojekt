# p3 — Doku, Agent, Registry (impl)

_Ticket: T900120_ · Rolle `impl` · keine Abhängigkeit

Zwei Contexts sind nach diesem Change aktiv: `fleet` (Prod, Ticket-DB of record) und `devmesh`
(Entwicklung). Bestehende Guards auf die geänderten Dateien:

- `tests/spec/software-factory/wsl-exit-nachzug.bats` Test 1: `CLAUDE.md` enthält `Cluster Topology`
  und kein `k3d-mentolder-dev`/`k3d-korczewski-dev` → Überschrift bleibt, kein Context-Literal.
- `tests/spec/agent-roster.bats` P4.4: `CLAUDE.md` nennt nur Registry-Agenten → keine neuen Agentennamen.
- `tests/spec/sdlc-isolation/e2-local-stack.bats` „Runbook … memory baseline": `docs/sdlc-stack/README.md`
  muss `(40.?GB|39.?GB|memory|WSL.Speicher)` treffen → Abschnitt „Speicher-Baseline (memory)".
- `tests/spec/sdlc-isolation/e3-tickets-lokal.bats`: `docs/sdlc-stack/e3-cutover.md` behält
  `Factory anhalten` und `T002722`.

### Task 3.1 — CLAUDE.md Topologie (≤20 min)

Datei: `CLAUDE.md`, Abschnitt `### Cluster Topology & Nodes`. Zwei exakte Ersetzungen (Edit-Tool):

alt (Ende der mentolder-Zeile):
```text
Local development via k3d on the WSL host has been **discontinued** — `k3d` is no longer used, and the former WSL dev cluster is decommissioned. `fleet` is the only kubeconfig context in active use.
```
neu:
```text
Local development runs on **`devmesh`**, a k3s cluster on four home-network hosts (ADR-008); the former k3d dev cluster on `ws-ubuntu-1` was removed with T900120. Two kubeconfig contexts are in active use: `fleet` (prod, ticket DB of record) and `devmesh` (development data only — ticket tooling refuses writes there).
```

alt (fleet-Zeile):
```text
Any context still listed by `kubectl config get-contexts` besides `fleet` and `hetzner` (`k3d-*`, `devc`, `gekko-hetzner-2-dev`, …) points at decommissioned hardware.
```
neu:
```text
Any context still listed by `kubectl config get-contexts` besides `fleet`, `devmesh` and `hetzner` (`k3d-*`, `devc`, `gekko-hetzner-2-dev`, …) points at decommissioned hardware.
```

```bash
grep -c 'Cluster Topology' CLAUDE.md                    # 1 (Anker des wsl-exit-nachzug-Guards)
grep -c 'k3d-mentolder-dev\|k3d-korczewski-dev' CLAUDE.md   # 0
grep -c '`devmesh`' CLAUDE.md                           # >= 2
```

### Task 3.2 — ops-Agent (≤15 min)

Datei: `.claude/agents/bachelorprojekt-ops.md`

alt:
```text
- The old `mentolder` and `korczewski` kubeconfig contexts are DEAD — use `fleet` for all kubectl commands. There is only one context: `fleet`. The dev stack runs on the same cluster in namespace `workspace-dev` (no separate k3d cluster, T002630).
```
neu:
```text
- The old `mentolder` and `korczewski` kubeconfig contexts are DEAD. Two contexts are live: `fleet` (production, ticket DB of record) and `devmesh` (local k3s development cluster, ADR-008; development data only). The dev stack of record runs on `fleet` in namespace `workspace-dev`. No k3d context exists any more (T900120).
```

```bash
grep -c 'There is only one context' .claude/agents/bachelorprojekt-ops.md   # 0
grep -c '`devmesh`' .claude/agents/bachelorprojekt-ops.md                  # >= 1
```

### Task 3.3 — Gotcha Kubelet-Zertifikat entfernen (≤15 min)

Datei: `docs/superpowers/references/gotchas-footguns.md`. Der Fall ist k3d-spezifisch (design.md D3).

```bash
# Abschnitt von der Ueberschrift bis vor die naechste H3 loeschen
sed -i '/^### Kubelet-Serving-Zertifikat nach Docker-IP-Tausch (T002999)$/,/^### Test-Guard misst Darstellung statt Semantik/{/^### Test-Guard misst Darstellung statt Semantik/!d}' docs/superpowers/references/gotchas-footguns.md
# Inhaltsverzeichnis: Eintrag 21 loeschen, 22 und 23 nachruecken
sed -i '/^21\. \[Kubelet-Serving-Zertifikat nach Docker-IP-Tausch (T002999)\]/d; s/^22\. \[Taskfile deps & Includes (T005899)\]/21. [Taskfile deps \& Includes (T005899)]/; s/^23\. \[gitleaks: lokal installieren/22. [gitleaks: lokal installieren/' docs/superpowers/references/gotchas-footguns.md
grep -c 'kubelet-cert\|k3d-mentolder-dev\|sdlc:cert:check' docs/superpowers/references/gotchas-footguns.md   # 0
grep -c '^### Test-Guard misst Darstellung statt Semantik' docs/superpowers/references/gotchas-footguns.md  # 1 (Anker)
grep -c '^22\. \[gitleaks' docs/superpowers/references/gotchas-footguns.md   # 1
```

### Task 3.4 — `docs/sdlc-stack/README.md` (≤60 min)

Ersetzung A: Zeilen 1 bis einschließlich der Zeile `DB-Passwörter stammen aus \`k3d/secrets.yaml\` (dev-Plaintext).`
(Kopf, Voraussetzungen, WSL-Baseline, Cluster anlegen, Deployen) durch:

```markdown
# SDLC-Stack — Entwicklungsinstanz auf devmesh

Die SDLC-Console, die Entwicklungs-PostgreSQL, bge-Embedding/Reranking und Pocket ID laufen als
Entwicklungsinstanz auf dem k3s-Cluster `devmesh` (Kontext `devmesh`, ADR-008). Die führende
SDLC-Oberfläche und die Ticket-DB of record liegen auf `fleet`. Der frühere k3d-Cluster
`mentolder-dev` ist mit T900120 abgebaut.

## Voraussetzungen

- Kubeconfig-Kontext `devmesh` (`task devmesh:kubeconfig`)
- kubectl (mind. 1.30)
- Tailnet-Zugang, wenn außerhalb des Heimnetzes

## Speicher-Baseline (memory)

devmesh hat 48 GB RAM auf drei Servern, nach dem Beitritt von `ws-ubuntu-1` 64 GB. Das Profil
`core` trägt Console, DB, Pocket ID und das bge-Paar; `full` kommt nach dem Beitritt.

```bash
kubectl --context devmesh describe nodes | grep -A6 'Allocated resources'
```

## Ausrollen

```bash
task devmesh:deploy
task sdlc:sdlc:up
```

`devmesh:deploy` rendert das Profil aus der Arbeitskopie. `sdlc:up` prüft Erreichbarkeit und
Rollout, startet llm-proxy und Chat-Loadout und läuft dann den Health-Gate. Es legt keinen
Cluster an und löscht keinen.
```

Ersetzung B: Abschnitt `## DoD-Checks` bis einschließlich Abschnitt `## Architektur` (bis vor
`## Datenhoheit: Fleet ist DB of record`) durch:

```markdown
## DoD-Checks

```bash
kubectl --context devmesh exec -n workspace deploy/sdlc-console -- sh -c 'echo BUILD_TARGET=$BUILD_TARGET'
# → BUILD_TARGET=sdlc
kubectl --context devmesh port-forward -n workspace svc/llm-gateway-embed 8081:8081 &
curl http://127.0.0.1:8081/health
# → 200 (analog llm-gateway-rerank)
bash scripts/sdlc/health-gate.sh --context devmesh --timeout 60
```

## Status

```bash
task sdlc:status
task devmesh:status
```

## Architektur

- **k3d/sdlc-stack/kustomization.yaml** — Overlay, referenziert Base-Manifeste per `../`
- **k3d/sdlc-stack/sdlc-console.yaml** — Console-Deployment (website-sdlc-Image)
- **website/src/lib/auth/provider.ts** — fail-closed Provider-Auswahl
- **tests/spec/sdlc-isolation/e2-local-stack.bats** — Struktur- + DoD-Guard
```

Ersetzung C (Tabelle `provider_config`):

```bash
sed -i 's/^| lokal (`k3d-mentolder-dev`) | LLM-Provider-Wahl der Factory |$/| Entwicklungsinstanz (`devmesh`) | LLM-Provider-Wahl der Factory in der Entwicklung |/' docs/sdlc-stack/README.md
sed -i 's/^> (`k3d-mentolder-dev`) und die fleet-Kopie als eingefroren beschrieben — `SELECT` ja,$/> (lokaler k3d-Context) und die fleet-Kopie als eingefroren beschrieben — `SELECT` ja,/; s/^> Ticket-Skripten zeigten allerdings noch auf `k3d-mentolder-dev`; nachgezogen mit T900013\.$/> Ticket-Skripten zeigten allerdings noch auf den lokalen k3d-Context; nachgezogen mit T900013./' docs/sdlc-stack/README.md
grep -c 'k3d-mentolder-dev\|sdlc:cluster:\|k3d-config' docs/sdlc-stack/README.md   # 0
grep -qE '(40.?GB|39.?GB|memory|WSL.Speicher)' docs/sdlc-stack/README.md && echo anchor-ok
```

### Task 3.5 — Weitere Runbooks und Doku (≤40 min)

Dateien: `docs/sdlc-stack/e3-cutover.md`, `docs/sdlc-stack/prod-auth.md`,
`docs/bereitstellungsdetails.md`, `docs/fleet-2026-05-31-what-changed.md`,
`scripts/dev-host-units/README.md`

```bash
sed -i 's/^| Lokaler Cluster steht | `task sdlc:sdlc:cluster:status` |$/| Lokaler Cluster steht | `task devmesh:status` (k3d-Cluster seit T900120 abgebaut) |/; s/^Der Default-Kontext ist im Branch bereits auf `k3d-mentolder-dev` gestellt\. \*\*Der Cutover wird$/Der Default-Kontext war im Branch bereits auf den lokalen k3d-Context gestellt. **Der Cutover wird/' docs/sdlc-stack/e3-cutover.md
sed -i 's/task sdlc:sdlc:deploy/task devmesh:deploy/g; s/`sdlc:deploy`/`devmesh:deploy`/g' docs/sdlc-stack/prod-auth.md
sed -i 's/außer `fleet` und `k3d-mentolder-dev` sind tot\./außer `fleet` und dem damaligen lokalen k3d-Dev-Context sind tot./' docs/fleet-2026-05-31-what-changed.md
sed -i 's/Die lokale Entwicklung findet auf einem k3d-Cluster (lokales Test-Kubernetes in Docker) auf dem WSL-Host \/ Proxmox-VM `dev-vm` statt\. Kontext: `k3d-mentolder-dev`\./Die lokale Entwicklung läuft seit ADR-008 auf dem k3s-Cluster `devmesh` (vier Hosts im Heimnetz); der frühere k3d-Cluster ist mit T900120 abgebaut. Kontext: `devmesh`./' docs/bereitstellungsdetails.md
```

`prod-auth.md`: den Satz, der mit `Alternativ beim Deploy direkt:` beginnt, bis zu seinem Punkt
löschen (`devmesh:deploy` kennt `SDLC_AUTH` nicht). Den Block aus `k3d image import` und den zwei
`kubectl --context …`-Aufrufen (Zeilen `k3d image import ghcr.io/paddione/website-sdlc:prodauth-local -c mentolder-dev`
bis `  -p '{"spec":{"template":…IfNotPresent"}]}}}}'`) ersetzen durch:

```bash
docker push ghcr.io/paddione/website-sdlc:prodauth-local
kubectl --context devmesh -n workspace set image \
  deploy/sdlc-console sdlc-console=ghcr.io/paddione/website-sdlc:prodauth-local
```

`scripts/dev-host-units/README.md` vollständig ersetzen durch:

```markdown
# dev-host-units — Host-seitige systemd-Units der Entwicklungsanbindung

Die lokale Entwicklung läuft seit ADR-008 auf dem k3s-Cluster `devmesh`. Der k3d-Dev-Cluster auf
`ws-ubuntu-1` (10.0.33.1) ist mit T900120 abgebaut; seine letzte Datensicherung liegt unter
`~/backups/` des Operators (30 Tage).

| Unit | Ebene | Zweck |
|------|-------|-------|
| `../llm-proxy/llm-proxy-lan.service` | User | socat `:18236 → 127.0.0.1:18235`, damit Cluster-Pods den loopback-only llm-proxy erreichen |
| `../mcp-gateway/k3d-postgres-forward.service` | User | Port-Forward `devmesh` shared-db → `localhost:15432` |

## Installieren / Entfernen

```bash
bash scripts/dev-host-units/install.sh
bash scripts/dev-host-units/uninstall.sh
```

## Bekannte Fallstricke

- **Context-Drift:** Vor DB-Schreibarbeit die Server-URL des Contexts prüfen:
  `kubectl config view --minify --context <ctx> -o jsonpath='{.clusters[0].cluster.server}'`.
  Der Loopback-Guard `scripts/vda/ticket/_ctx-guard.sh` bricht bei `127.0.0.1` ab (T015008).
- **Port-Halter vor Unit-Start** (T002281-Klasse): belegt ein Fremd-Prozess den Port,
  landet die Unit in einer EADDRINUSE-Restart-Schleife statt sauber zu failen.
```

```bash
grep -c 'k3d-mentolder-dev\|sdlc:cluster:\|sdlc:sdlc:deploy' docs/sdlc-stack/e3-cutover.md docs/sdlc-stack/prod-auth.md docs/bereitstellungsdetails.md docs/fleet-2026-05-31-what-changed.md scripts/dev-host-units/README.md   # je 0
grep -c 'Factory anhalten' docs/sdlc-stack/e3-cutover.md   # >= 1
grep -c 'T002722' docs/sdlc-stack/e3-cutover.md            # >= 1
```

### Task 3.6 — Historische Design-Docs archivieren, Netz-Registry (≤30 min)

Dateien: `docs/superpowers/specs/2026-05-30-dev-mcp-public-route-design.md`,
`docs/superpowers/specs/2026-06-11-staging-on-demand-design.md`,
`docs/superpowers/specs/2026-07-01-t001341-traefik-hostport-clientip-design.md` (verschoben nach
`docs/superpowers/specs/archive/`), `docs/agent-guide/registry/networks.yaml`,
`docs/agent-guide/maps/networks-map.md`

```bash
for f in 2026-05-30-dev-mcp-public-route-design.md 2026-06-11-staging-on-demand-design.md 2026-07-01-t001341-traefik-hostport-clientip-design.md; do
  git mv "docs/superpowers/specs/$f" "docs/superpowers/specs/archive/$f"
done
git grep -n -e '2026-05-30-dev-mcp-public-route-design' -e '2026-07-01-t001341-traefik-hostport-clientip-design' -- . ':!docs/superpowers/specs/archive' ':!openspec/changes'   # leer
```

`networks.yaml` — den Eintrag ersetzen:

alt:
```yaml
  - id: docker-k3d-mentolder-dev
    cidr: 172.23.0.0/16
    owner: Docker (Entwicklungsrechner)
    purpose: Netz des k3d-Clusters k3d-mentolder-dev (abgebaut)
    status: retired
    source: Docker-Daemon (k3d)
    notes: >-
      Der Cluster wurde mit PR #5316 endgültig entfernt; der Bereich bleibt
      als retired stehen, damit eine Neuvergabe als Kollision auffällt.
```
neu:
```yaml
  - id: docker-k3d-sdlc-dev
    cidr: 172.23.0.0/16
    owner: Docker (Entwicklungsrechner)
    purpose: Netz des lokalen k3d-SDLC-Clusters mentolder-dev (abgebaut)
    status: retired
    source: Docker-Daemon (k3d)
    notes: >-
      Der Cluster wurde mit T900120 abgebaut (Nachfolger devmesh, ADR-008); der
      Bereich bleibt als retired stehen, damit eine Neuvergabe als Kollision auffällt.
```

```bash
task networks:map
grep -c 'k3d-mentolder-dev' docs/agent-guide/registry/networks.yaml docs/agent-guide/maps/networks-map.md   # je 0
grep -c 'docker-k3d-sdlc-dev' docs/agent-guide/maps/networks-map.md   # >= 1
tests/unit/lib/bats-core/bin/bats tests/spec/network-address-plan/networks-registry.bats
```
