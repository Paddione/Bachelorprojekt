# p2 — SDLC-Tasks und k3d-Cluster-Lebenszyklus (impl)

_Ticket: T900145_ · Rolle `impl` · keine Abhängigkeit

Ziel laut Delta `sdlc-isolation` („Single Entry Point", „sdlc:down"): `sdlc:up`/`sdlc:down`
arbeiten gegen devmesh und legen keinen Cluster an oder löschen ihn. `sdlc:deploy` entfällt:
`task devmesh:deploy` (SP-3) rollt `sdlc-console`, `shared-db` und `pocket-id` im Profil `core`
aus; ein zweiter Deploy-Pfad auf denselben Namespace würde deren Secrets und Domains mit den
Dev-Werten aus `k3d/secrets.yaml` überschreiben.

### Task 2.1 — `taskfiles/Taskfile.sdlc.yml` umbauen (≤90 min)

Schritt a — Kopf, Cluster-Tasks und `sdlc:deploy` entfernen. Den Bereich von der Zeile `tasks:`
(Zeile 3) bis einschließlich der Leerzeile nach
`        kubectl --context k3d-mentolder-dev rollout status deployment/bge-rerank -n workspace --timeout=300s`
(Zeile 138) ersetzen durch:

```yaml
vars:
  # [T900120] Die SDLC-Entwicklungsinstanz laeuft auf devmesh (ADR-008). Kein Task in
  # dieser Datei legt einen Cluster an oder loescht ihn; ausgerollt wird der Stack mit
  # `task devmesh:deploy`.
  SDLC_CTX: '{{.SDLC_CTX | default "devmesh"}}'

tasks:
```

Schritt b — restliche Context-Literale und Kommentare:

```bash
sed -i 's/kubectl --context k3d-mentolder-dev /kubectl --context {{.SDLC_CTX}} /g' taskfiles/Taskfile.sdlc.yml
sed -i 's/    # Nach jedem sdlc:deploy noetig: pocket-id-client-seed schreibt ein$/    # Nach jedem devmesh:deploy noetig: pocket-id-client-seed schreibt ein/; s/Nach jedem sdlc:sdlc:deploy erneut$/Nach jedem devmesh:deploy erneut/' taskfiles/Taskfile.sdlc.yml
sed -i 's/^        CTX="\${K3D_CTX:-k3d-mentolder-dev}"$/        CTX="{{.SDLC_CTX}}"/' taskfiles/Taskfile.sdlc.yml
```

Schritt c — den Block `sdlc:cert:check` (4 Zeilen ab `  sdlc:cert:check:` plus folgende
Leerzeile) löschen:

```bash
sed -i '/^  sdlc:cert:check:$/,/^$/d' taskfiles/Taskfile.sdlc.yml
```

Schritt d — `sdlc:up` ersetzen. Den Block von `  sdlc:up:` bis vor `  sdlc:down:` ersetzen durch:

```yaml
  sdlc:up:
    desc: "SDLC-Entwicklungsinstanz starten: Cluster-Check → Rollout-Check → llm-proxy → Loadout → Health-Gate"
    cmds:
      # Kein Cluster-Lebenszyklus (T900120): devmesh ist geteilt und persistent.
      - |
        if ! kubectl --context {{.SDLC_CTX}} get nodes --request-timeout=5s >/dev/null 2>&1; then
          echo "[sdlc:up] Cluster {{.SDLC_CTX}} nicht erreichbar — Zustand: task devmesh:status" >&2
          exit 1
        fi
      - |
        for d in shared-db pocket-id sdlc-console; do
          kubectl --context {{.SDLC_CTX}} -n workspace rollout status "deployment/$d" --timeout=120s
        done
      # Proxy nur starten, wenn er noch nicht antwortet — /livez, nicht /health
      # (ein 503-wegen-fehlendem-Backend sieht fuer /health aus wie "not running").
      - |
        PORT="${LLM_PROXY_PORT:-18235}"
        if curl -fsS --max-time 2 "http://127.0.0.1:$PORT/livez" >/dev/null 2>&1; then
          echo "[sdlc:up] llm-proxy laeuft bereits — ueberspringe proxy:start"
        else
          task llm:proxy:start
        fi
      # Chat-Loadout idempotent starten, bevor der Health-Gate es prueft (T002656).
      - scripts/sdlc/llm-up.sh
      - scripts/sdlc/health-gate.sh --context {{.SDLC_CTX}} --timeout 120

```

Schritt e — in `sdlc:down` die Beschreibung und die letzten vier Zeilen ändern:

```bash
sed -i 's/^    desc: "SDLC-Stack herunterfahren: Loadout → llm-proxy → Cluster"$/    desc: "SDLC-Stack herunterfahren: Loadout → llm-proxy (devmesh bleibt laufen)"/' taskfiles/Taskfile.sdlc.yml
sed -i '/^      # sdlc:cluster:delete is idempotent — k3d cluster delete does not fail$/,/^      - task sdlc:sdlc:cluster:delete || echo /d' taskfiles/Taskfile.sdlc.yml
```

Prüfung:

```bash
grep -c 'k3d-mentolder-dev\|sdlc:cluster:\|sdlc:cert:check\|kubelet-cert\|k3d cluster' taskfiles/Taskfile.sdlc.yml   # 0
grep -c '^  sdlc:deploy:' taskfiles/Taskfile.sdlc.yml       # 0
grep -c 'SDLC_CTX' taskfiles/Taskfile.sdlc.yml              # >= 6
task --list-all | grep -F 'sdlc:sdlc:up'                   # Positiv-Anker: Taskfile parst
task --dry sdlc:sdlc:up | grep -F 'rollout status'
task --dry sdlc:sdlc:down | grep -F 'llm:proxy:stop'
```

### Task 2.2 — Health-Gate ohne Kubelet-Prüfung, Default devmesh (≤30 min)

Datei: `scripts/sdlc/health-gate.sh`

```bash
sed -i 's/^CTX="\${CTX:-k3d-mentolder-dev}"$/CTX="${CTX:-devmesh}"/' scripts/sdlc/health-gate.sh
# Block von "# ── kubelet-cert check (T002999)" bis vor "# ── deployments (namespace: workspace)" loeschen
sed -i '/^# ── kubelet-cert check (T002999) /,/^# ── deployments (namespace: workspace) /{/^# ── deployments (namespace: workspace) /!d}' scripts/sdlc/health-gate.sh
grep -c 'kubelet\|k3d-mentolder-dev' scripts/sdlc/health-gate.sh   # 0
grep -n '^# ── deployments (namespace: workspace)' scripts/sdlc/health-gate.sh   # Positiv-Anker: 1
bash -n scripts/sdlc/health-gate.sh
bash scripts/sdlc/health-gate.sh --context no-such-cluster --timeout 2; echo "rc=$?"   # rc != 0, nennt cluster
```

### Task 2.3 — Kubelet-Hinweis aus dem Ticket-Kern, Dateien löschen (≤30 min)

Dateien: `scripts/vda/ticket/_ticket-core.sh`, gelöscht: `scripts/lib/kubelet-cert-hint.sh`,
`scripts/sdlc/kubelet-cert-check.sh`, `k3d/sdlc-stack/k3d-config.yaml`,
`taskfiles/Taskfile.devcluster.yml`

In `_ticket-core.sh` die Funktion `_exec_sql` vollständig ersetzen (vom Kopf `_exec_sql() {` bis
zur schließenden `}`) durch:

```bash
_exec_sql() {
  local pod="$1"; shift
  kubectl exec -i "$pod" -n "$NS" --context "$CTX" -c postgres -- \
    psql -U "${USER:-website}" -d "${DB:-website}" -qtA -v ON_ERROR_STOP=1 "$@"
}
```

```bash
git rm scripts/lib/kubelet-cert-hint.sh scripts/sdlc/kubelet-cert-check.sh k3d/sdlc-stack/k3d-config.yaml taskfiles/Taskfile.devcluster.yml
grep -c 'kubelet' scripts/vda/ticket/_ticket-core.sh   # 0
bash -n scripts/vda/ticket/_ticket-core.sh
kubectl kustomize --load-restrictor=LoadRestrictionsNone k3d/sdlc-stack >/dev/null   # Overlay baut ohne k3d-config.yaml
```

### Task 2.4 — `Taskfile.yml`-Includes und Kommentare (≤20 min)

Datei: `Taskfile.yml`

| alt | neu |
|---|---|
| `  # dev.mentolder.de — persistent staging stack via k3d on WSL host (context: k3d-mentolder-dev).` | `  # dev.mentolder.de — persistent staging stack on fleet (namespace workspace-dev).` |
| `  # See Taskfile.staging.yml + docs/superpowers/specs/2026-06-11-staging-on-demand-design.md.` | `  # See Taskfile.staging.yml + docs/superpowers/specs/archive/2026-06-11-staging-on-demand-design.md.` |

Den Include `devcluster` mit seinen zwei Kommentarzeilen löschen:

```bash
sed -i 's|^  # dev.mentolder.de — persistent staging stack via k3d on WSL host (context: k3d-mentolder-dev)\.$|  # dev.mentolder.de — persistent staging stack on fleet (namespace workspace-dev).|' Taskfile.yml
sed -i 's|docs/superpowers/specs/2026-06-11-staging-on-demand-design\.md|docs/superpowers/specs/archive/2026-06-11-staging-on-demand-design.md|' Taskfile.yml
sed -i '/^  # dev.mentolder.de — DECOMMISSIONED devc HA k3s taskfile kept for reference (dead context)\.$/,/^    dir: \.$/d' Taskfile.yml
grep -c 'devcluster\|k3d-mentolder-dev' Taskfile.yml   # 0
task --list-all >/dev/null; echo "rc=$?"               # rc=0 (kein toter includes:-Pfad, Exit 100 waere der Fehler)
```

### Task 2.5 — Übrige Taskfiles (≤40 min)

Dateien: `taskfiles/Taskfile.dev-stack.yml`, `taskfiles/Taskfile.brainstorm.yml`,
`taskfiles/Taskfile.llm.yml`, `taskfiles/Taskfile.staging.yml`

```bash
# dev-stack: dev.mentolder.de laeuft auf fleet/workspace-dev (environments/dev-cluster.yaml)
sed -i "s/^  CTX_DEV: '{{.CTX_DEV | default \"k3d-mentolder-dev\"}}'$/  CTX_DEV: '{{.CTX_DEV | default \"fleet\"}}'/" taskfiles/Taskfile.dev-stack.yml
sed -i 's/^        echo "   The dev.mentolder.de stack runs on local k3d (context: k3d-mentolder-dev)." >&2$/        echo "   The dev.mentolder.de stack runs on fleet (namespace workspace-dev, Flux-rendered)." >\&2/' taskfiles/Taskfile.dev-stack.yml
# brainstorm: sish lebt im Dev-Stack auf fleet/workspace-dev
sed -i 's/^# The broker lives in the k3d dev stack (context: k3d-mentolder-dev), reached via the k3d loadbalancer$/# The broker lives in the dev stack (context: fleet, namespace workspace-dev), reached via the loadbalancer/; s/^  CTX_DEV: k3d-mentolder-dev$/  CTX_DEV: fleet/' taskfiles/Taskfile.brainstorm.yml
# llm: ohne k3d-Docker-Netz kein Default-Netzname
sed -i 's/\${LLM_PROXY_K3D_NETWORK:-k3d-mentolder-dev}/${LLM_PROXY_K3D_NETWORK:-}/' taskfiles/Taskfile.llm.yml
# staging: Context-Default und Kopfzeile
sed -i 's/^# On-demand per-branch staging in the k3d-mentolder-dev cluster\.$/# On-demand per-branch staging — needed the local k3d cluster, removed with T900120./; s/^  CTX: k3d-mentolder-dev$/  CTX: devmesh/' taskfiles/Taskfile.staging.yml
```

In `Taskfile.staging.yml` die Vorbedingung von `_cluster-guard` ersetzen (Image-Import über
`k3d image import` hat auf devmesh kein Ziel; `staging:up` bricht deshalb klar ab):

alt:
```yaml
      - sh: k3d cluster list 2>/dev/null | grep -q "^{{.CLUSTER_NAME}}"
        msg: |
          k3d cluster '{{.CLUSTER_NAME}}' not found.
          Start it first: task dev:cluster:create_legacy
          Or check: k3d cluster list
```
neu:
```yaml
      - sh: k3d cluster list 2>/dev/null | grep -q "^{{.CLUSTER_NAME}}"
        msg: |
          k3d cluster '{{.CLUSTER_NAME}}' not found — der lokale k3d-Cluster ist seit T900120 abgebaut.
          On-demand-Staging importiert Images per `k3d image import` und laeuft auf devmesh noch nicht.
```

Folgeticket anlegen und die ID im PR nennen:

```bash
bash scripts/ticket.sh create --type feature --brand mentolder \
  --title "On-demand-Staging (staging:up) auf devmesh portieren" \
  --description "staging:up importiert Images per k3d image import in den mit T900120 abgebauten k3d-Cluster. Portierung: Image-Push in eine Registry, Namespace auf devmesh."
grep -c 'k3d-mentolder-dev' taskfiles/Taskfile.dev-stack.yml taskfiles/Taskfile.brainstorm.yml taskfiles/Taskfile.llm.yml taskfiles/Taskfile.staging.yml   # je 0
task --list-all | grep -F 'staging:up'   # Positiv-Anker
```

### Task 2.6 — SDLC-Skripte: Defaults und Hinweise (≤40 min)

Dateien: `scripts/sdlc/migrate-tickets.sh`, `scripts/sdlc/backup-tickets.sh`,
`scripts/sdlc-auth-mode.sh`, `scripts/sdlc-sync-oidc-secret.sh`

```bash
sed -i 's/^DST_CTX="\${SDLC_DST_CTX:-k3d-mentolder-dev}"$/DST_CTX="${SDLC_DST_CTX:-devmesh}"/' scripts/sdlc/migrate-tickets.sh
sed -i "s/Der lokale Stack wird mit 'task sdlc:cluster:create' angelegt\./Der Entwicklungs-Stack wird mit 'task devmesh:deploy' ausgerollt./; s/Laeuft Docker? Ist der Stack deployt ('task sdlc:deploy')?/Ist devmesh erreichbar und der Stack ausgerollt ('task devmesh:deploy')?/" scripts/sdlc/migrate-tickets.sh
sed -i 's/^SRC_CTX="\${SDLC_DST_CTX:-k3d-mentolder-dev}"   # Quelle des Backups = lokaler Stack$/SRC_CTX="${SDLC_DST_CTX:-devmesh}"   # Quelle des Backups = Entwicklungsinstanz auf devmesh/' scripts/sdlc/backup-tickets.sh
sed -i 's/^CONTEXT="k3d-mentolder-dev"$/CONTEXT="devmesh"/; s/task sdlc:sdlc:deploy/task devmesh:deploy/g' scripts/sdlc-auth-mode.sh
sed -i 's/^CONTEXT="k3d-mentolder-dev"$/CONTEXT="devmesh"/; s/\[--context k3d-mentolder-dev\]/[--context devmesh]/' scripts/sdlc-sync-oidc-secret.sh
grep -c 'k3d-mentolder-dev\|sdlc:cluster:\|sdlc:deploy' scripts/sdlc/migrate-tickets.sh scripts/sdlc/backup-tickets.sh scripts/sdlc-auth-mode.sh scripts/sdlc-sync-oidc-secret.sh   # je 0
for f in scripts/sdlc/migrate-tickets.sh scripts/sdlc/backup-tickets.sh scripts/sdlc-auth-mode.sh scripts/sdlc-sync-oidc-secret.sh; do bash -n "$f"; done
bash scripts/sdlc/backup-tickets.sh run --dry-run | grep -F 'devmesh'   # Quelle devmesh, Ziel fleet
```
