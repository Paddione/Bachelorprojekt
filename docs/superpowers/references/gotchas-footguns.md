# Gotchas & Footguns Reference

Non-obvious repo behaviors that silently break things or hit the wrong cluster. This file is the canonical source, extracted from `CLAUDE.md` to keep that file within its token budget.

## Section Index

1. [security-guidance plugin rewake after commits](#security-guidance-plugin-rewake-after-commits) — never git-restore after a commit rewake
2. [Session-Koordination (parallele Agenten — Claude + Gemini)](#session-koordination-parallele-agenten--claude--gemini) — agent-lock.sh claim/release/reap protocol
3. [Environment targeting](#environment-targeting) — ENV= is always explicit; WORKSPACE_NAMESPACE
4. [Cluster node placement (fleet)](#cluster-node-placement-fleet) — wg-fleet flannel-iface
5. [Kustomize overlays](#kustomize-overlays) — prod-fleet/* only; never bare prod/; $patch:delete
6. [Scripts & env](#scripts--env) — env-resolve.sh must be sourced; envsubst lists
7. [Database queries](#database-queries) — never SELECT * on ticket_plans.content
8. [Cluster reset / fresh cluster bring-up order](#cluster-reset--fresh-cluster-bring-up-order) — sealed-secrets → fetch-cert → seal → cert → deploy
9. [Operational](#operational) — push-based; pull-first; CONFLICTING PR suppresses CI
10. [Staging environment (ENV=staging)](#staging-environment-envstaging) — workspace-staging ns
11. [Korczewski homepage uses the Kore design system](#korczewski-homepage-uses-the-kore-design-system-different-from-mentolder) — website/src/components/kore/
12. [Local-first LLM pipeline](#local-first-llm-pipeline) — GPU host; vector space isolation; LM Studio
13. [dev.mentolder.de stack](#devmentolderde-stack) — devc decommissioned; WSL bootstrap caveats
14. [Brett](#brett) — stub; reserved for future use
15. [Alt-Worktrees nach T002135 — Submodul-Gitdir-Reste](#alt-worktrees-nach-t002135--submodul-gitdir-reste) — cleanup orphaned submodule gitdirs in pre-merge worktrees
16. [merge=ours erzeugt GitHub-only Phantom-Konflikte](#mergeours-erzeugt-github-only-phantom-konflikte) — DIRTY auf GitHub bei lokal sauberem Merge; REST-`update-branch`-Fallback
17. [WireGuard unter Windows: `wg set` & `.dpapi`-Recovery](#wireguard-unter-windows-wg-set--dpapi-recovery-t002495-m9) — `wg set` setzt keine Windows-Routen; SYSTEM-ACL auf DPAPI
18. [git worktree add mit git-crypt-geschützten Pfaden: Smudge-Fehler erwartet](#git-worktree-add-mit-git-crypt-geschutzten-pfaden-smudge-fehler-erwartet-t002495-m5) — bei direktem `git worktree add` auf Locked-Repo
19. [skip-worktree: git status schweigt, pull scheitert](#skip-worktree-git-status-schweigt-pull-scheitert-t002712) — stille Blockade im Hauptcheckout
20. [Assertions dürfen nur an der geprüften Sache scheitern](#assertions-durfen-nur-an-der-gepruften-sache-scheitern-t002834t002850t002878) — Helper-Funktionen ohne `return 0`, mutierende Freshness-Checks, feste `sleep`-Wartezeiten
21. [Kubelet-Serving-Zertifikat nach Docker-IP-Tausch (T002999)](#kubelet-serving-zertifikat-nach-docker-ip-tausch-t002999) — "tls: failed to verify certificate" betrifft nicht die DB, sondern das Kubelet

---

### security-guidance plugin rewake after commits
- **Never run `git restore`, `git checkout --`, or `git reset` in response to a security-guidance asyncRewake after a `git commit`.** The `security-guidance` plugin fires an async background review after every `git commit` and rewakes Claude with a `rewakeMessage`. The correct response is to ACKNOWLEDGE findings or open a follow-up ticket — the commit has already happened and reverting it destroys work. If a finding is a false positive, note it; if it's real, fix it in a new commit. Running `git restore`/`git reset` after a commit to "fix" a security finding will silently discard committed work and require merge conflict resolution to recover.

### Session-Koordination (parallele Agenten — Claude + Gemini)

Mehrere Agenten-Sessions teilen ein `.git`/denselben Checkout. `scripts/agent-lock.sh` (dateibasierte Claims unter `.git/agent-locks/`, Identität via Unix-Session-ID) verhindert Doppelarbeit und main-Checkout-Races. Kontrakt:

- **Start jeder Session/Skill:** `bash scripts/agent-lock.sh reap` — räumt Zombie-Prozesse (cwd auf gelöschtem Worktree), stale Worktrees und tote Locks.
- **Vor Ticket-/Branch-Arbeit:** `bash scripts/agent-lock.sh claim ticket <ext-id> --branch <b> --worktree <wt> --label <skill>` (und `claim branch <b>`). Exit 1 = eine **lebende** Session arbeitet bereits daran → koordinieren oder anderes Ticket, NICHT duplizieren.
- **Am Ende / nach Merge:** `bash scripts/agent-lock.sh release ticket <ext-id>` (+ `release branch <b>`).
- **main-Checkout:** Commits im main-Checkout sind über `.githooks/pre-commit` **hart gesperrt**, wenn eine andere lebende Session den `main-checkout`-Lock hält (Gate nur im main-Checkout, in Worktrees übersprungen, fail-open). Override: `AGENT_LOCK_FORCE=1 git commit …`. Besser: in einem Worktree (`scripts/worktree-create.sh`) arbeiten. Setzt `core.hooksPath=.githooks` voraus (via `task secrets:install-hooks`).
- **Wer macht was:** `bash scripts/agent-lock.sh list`.
- **Nachrichten an parallele Sessions:** `bash scripts/agent-msg.sh read --unread` zu Skill-Start (offene Nachrichten anderer lebender Sessions sichten); vor dem Anfassen geteilter Registry-Dateien (`k3d/configmap-domains.yaml`, `environments/schema.yaml`) optional `bash scripts/agent-msg.sh post "berühre <datei> auf <branch>"` (broadcast) oder `--to <sid|label>` gerichtet. Kanal = append-only JSONL unter `.git/agent-msgs/` (nie committet).
- **Aktive Edit-Kollisionswarnung:** der `.githooks/pre-commit`-Hook ruft `scripts/agent-collision.sh check --staged` auf und warnt, wenn eine **andere lebende** Session dieselbe Datei in-flight hat. Advisory/fail-open — blockt nur mit `AGENT_COLLISION_STRICT=1`. Manuell: `bash scripts/agent-collision.sh check --all`.
- Live-Claims blocken auch die **Software Factory** (Dispatcher überspringt interaktiv geclaimte Tickets).
- Optionaler **SessionStart-Reaper:** `.claude/settings.json` ist gitignored (lokal/maschinengebunden) — wer den Reaper bei jedem Session-Start (nicht nur dev-flow) will, fügt lokal hinzu: `{"hooks":{"SessionStart":[{"hooks":[{"type":"command","command":"bash scripts/agent-lock.sh reap 2>/dev/null || true"}]}]}}`.

### Environment targeting
- **`ENV=` is always explicit.** Env-sensitive tasks (`workspace:deploy`, `workspace:office:deploy`, `workspace:post-setup`, `docs:deploy`, `workspace:talk-setup`, etc.) default to `ENV=dev` when unset. The kubectl context mismatch check only runs when `ENV != dev`, so a missing `ENV=` + wrong active context silently deploys to whatever cluster is current. Always pass `ENV=mentolder` (or `ENV=fleet-mentolder`) for the mentolder brand, `ENV=korczewski` (or `ENV=fleet-korczewski`) for korczewski — both resolve to the `fleet` context. Or use `feature:*` / `*:all-prods` umbrellas which fan out across both brands explicitly.
- **All workspace tasks now honour `WORKSPACE_NAMESPACE`.** Earlier the Taskfile and several `scripts/*.sh` hardcoded `-n workspace`, which silently wrote korczewski-targeted post-config (theming, OIDC redirects, talk signaling) into mentolder's `workspace` namespace. After 2026-05-05 every ENV-aware task sources `env-resolve.sh` and uses `${WORKSPACE_NAMESPACE:-workspace}` (mentolder=`workspace`, korczewski=`workspace-korczewski`); scripts default to `${NAMESPACE:-${WORKSPACE_NAMESPACE:-workspace}}` and the Taskfile call sites export the env var before invoking. If you add a new task that touches workspace resources, follow this pattern.
- **Both brands are now on the single `fleet` cluster.** `mentolder` was a separate standalone cluster until 2026-05-31 (Phase 3 decommission); gekko-hetzner-2/3/4 nodes left that cluster and joined fleet as workers. There is no longer a separate mentolder `shared-db`, cert-manager, or Keycloak — fleet owns everything. Cross-cutting changes (DB password rotation, OIDC client tweaks, schema migrations) still need to be applied to **both namespaces** (`workspace` and `workspace-korczewski`) explicitly, because those are separate per-brand deployments within the same cluster.

### Cluster node placement (fleet)
- **All fleet nodes use `wg-fleet` (10.20.0.x) for pod-to-pod traffic.** k3s agents join with `--flannel-iface=wg-fleet`. Adding a node without joining the wg-fleet mesh will silently break pod-to-pod traffic from that node. See `wireguard/wg-mesh-nodes.yaml` for the peer config.
- **LiveKit removed per T002184.** The stack (server, ingress, egress) is fully deleted from both namespaces and all repo references.

### Kustomize overlays
- **Apply `prod-fleet/mentolder/` or `prod-fleet/korczewski/`, never base `prod/` (or the bare `prod-mentolder/`/`prod-korczewski/`) alone.** `ENV_OVERLAY` resolves to the `prod-fleet/<brand>` wrapper, which reuses the brand overlay + `fleet-common`. The base `prod/` exists to be consumed by the env-specific overlays and contains a `$patch: delete` on the `workspace-secrets` Secret — applying it directly relies on the sealed secret existing and can leave the cluster without credentials.
- **Never remove the `$patch: delete` block in `prod/kustomization.yaml`.** Its job is to strip the dev placeholder from `k3d/secrets.yaml` so SealedSecrets-managed secrets survive each deploy. Removing it overwrites production secrets with dev values.
- **Collabora and CoTURN are NOT in the base kustomization.** `k3d/office-stack` and `k3d/coturn-stack` are deployed separately via `task workspace:office:deploy`. A full bring-up order is `workspace:deploy` → `workspace:office:deploy` → CoTURN apply.
- **Blast-Radius-Regel (T002207):** One-shot Jobs (bootstrap/seed) gehören nie in den App-Stack einer Marke. Sie werden in dedizierte `flux-<brand>-jobs` Kustomizations ausgelagert mit `dependsOn: [flux-<brand>]`, `force: true` und `wait: false`. Ein kaputter Job blockiert so nicht mehr den gesamten Brand-Deploy. Die Brand-Kustomizations selbst setzen `healthChecks` (kein nacktes `wait: true`) und nennen nur die tragenden Workloads (`shared-db`, `pocket-id`, `traefik`). Alles andere darf degradieren.
- **Website, Brett, Docs, Videovault, Mediaviewer-Widget, Mentolder-Web, Downloads, Brain, Studio, and Talk-Transcriber images use `:latest` intentionally** (`k3d/website.yaml`, `k3d/brett.yaml`, `k3d/docs.yaml`, `k3d/videovault.yaml`, `k3d/mediaviewer-widget.yaml`, `k3d/mentolder-web.yaml`, `k3d/downloads.yaml`, `k3d/brain.yaml`, `k3d/studio.yaml`). CI warns about `:latest` for these; do not "fix" these tags to a digest — each image is rebuilt and re-imported/pushed on every release (`task feature:brett`, `task docs:deploy`, `task feature:website`, `build-mentolder-web.yml`, `build-rustdesk-installer.yml`).

### Scripts & env
- **`scripts/env-resolve.sh` must be sourced, never executed.** It uses `return 1 2>/dev/null || exit 1`, so `bash scripts/env-resolve.sh` exits the parent shell and subsequent task commands never run. Always `source scripts/env-resolve.sh "$ENV"`.
- **`envsubst` variable lists are hardcoded per task in `Taskfile.yml` (not `Taskfile.yaml`).** If you add a new `${VAR}` reference to a manifest, also register it in `environments/schema.yaml` AND the `envsubst` list in every task that builds that manifest. See `docs/superpowers/references/envsubst-variable-management.md` for the complete checklist and common failure modes.
- **`env:generate ENV=<target>` must run before `env:seal` and before deploying prod.** `talk-hpb-setup.sh` aborts on placeholder `MANAGED_EXTERNALLY` values if signaling/turn secrets were never generated.

### Database queries
- **Never run `SELECT *` or query the `content` column on the entire `tickets.ticket_plans` table.** The `content` column stores large plan markdown files, and selecting it over a `kubectl exec` connection will transfer megabytes of data, causing connection timeouts. Always query metadata columns (such as `id`, `ticket_id`, `slug`, `branch`, `pr_number`, `archived_at`) or filter explicitly by a specific `ticket_id` or `slug`.

### Cluster reset / fresh cluster bring-up order
After any cluster reset (including replacing a Sealed Secrets controller keypair), the mandatory order is:

1. `task sealed-secrets:install ENV=<env>` — controller must exist before any SealedSecret is applied
2. `task env:fetch-cert ENV=<env>` — refreshes the sealing cert from the new controller
3. `task env:seal ENV=<env>` — re-encrypts plaintext secrets with the new cert
4. `task cert:install ENV=<env>` — installs cert-manager CRDs; must precede `workspace:deploy`
5. `task cert:secret -- <ipv64-key> ENV=<env>` — stores the ACME DNS-01 key; creates it in both `cert-manager` AND `$WORKSPACE_NAMESPACE`
6. `task workspace:deploy ENV=<env>` — applies SealedSecrets + kustomize overlay

**SealedSecrets keypair rotation is expected on every cluster reset.** Old sealed files won't decrypt. Always run steps 2–3 after a reset.

**`knowledge-secrets` conflict:** if the overlay contains a `secretGenerator`-managed Secret with the same name as a SealedSecret, the controller refuses to adopt it. Delete the plain Secret first (`kubectl delete secret knowledge-secrets -n $WORKSPACE_NS`) then re-apply.

### Operational
- **No GitOps reconciler — prod is push-based.** Merging to `main` does **not** auto-apply to fleet (there is no Flux/Argo controller; `flux-system` does not exist on the cluster). After a merge, deploy explicitly: `task workspace:deploy ENV=mentolder` **and** `ENV=korczewski` (or a `task feature:*` umbrella that fans out across both brands). Website changes auto-roll-out via the `build-website*.yml` Actions (which push with `FLEET_KUBECONFIG`); everything else needs an explicit deploy.
- **Pull-first.** Always `git pull --rebase origin main` before any work. With dirty tree: `git stash && git pull --rebase && git stash pop`. The `dev-flow-plan`/`dev-flow-execute`/`using-git-worktrees` skills enforce this automatically.
- **CONFLICTING PR status suppresses CI runs entirely.** When a PR is in `CONFLICTING` state, GitHub does not build a merge ref → no `pull_request` workflow runs are created. What looks like "CI hasn't started yet" or "push without any CI run" is actually a conflict blocker. Diagnose via `gh pr view <N> --json mergeStateStatus` — if it shows `CONFLICTING`, resolve the conflict locally (`git fetch origin main && git rebase origin/main`), then push. CI will start after the conflict is cleared.
- **Generated artifacts are conflict magnets — resolve with `git checkout --ours`.** `docs/generated/**`, `docs/code-quality/repo-index.json`, and `k3d/docs-content-built/**` are auto-regenerated by `freshness-regen.yml` after every main push. Any PR that also committed a freshness regen will conflict. Resolution: `git checkout --ours <file>` for each of these files during rebase, then `git add` them. The `.gitattributes` `merge=ours` driver automates this when `task secrets:install-hooks` has been run (registers `git config merge.ours.driver true`).
- **Docs source is `k3d/docs-content-built/` (pre-built HTML), not a Markdown source tree.** The `docs/` directory holds the Markdown source; `node scripts/build-docs.mjs` compiles it to HTML in `k3d/docs-content-built/`. Deploy via `task docs:deploy` (build + Docker image push + rollout on fleet for both brands). **`docs:sync` does NOT work** — `kubectl cp` fails with "Read-only file system" because the static-web-server container runs with a read-only rootfs. `docs:configmap:apply` is kept only for kustomize validation — it has no visible effect on running pods.
- **No yamllint/shellcheck/kubeconform in CI.** Earlier docs claimed these ran on PRs; the current `ci.yml` only runs `task test:all`. Run `yamllint`/`shellcheck` locally if you want lint feedback before pushing.
- **LiveKit (removed per T002184).** Previously required node-pinning + DNS-pinning + ufw rules. All related infra and code deleted.
- **`gh pr checks` kennt kein `--json`-Flag.** Wer CI-Check-Status maschinenlesbar braucht, nutzt `gh pr view <N> --json statusCheckRollup` (so macht es `scripts/devflow-ci-watch.sh`). Ein Skript mit `gh pr checks --json` schlägt mit "unknown flag" fehl.
- **Grafana-Dashboards werden per `target="_blank"` verlinkt, nicht als iframe eingebettet.** Der Observability-Tab im Platform Control Center öffnet die 4 Grafana-Dashboards bewusst in neuen Tabs: Die oauth2-proxy-Header vor Grafana erschweren same-origin-iframe-Einbettung. Nicht "verbessern", indem man ein iframe-Embedding baut — das scheitert am Auth-Proxy.
- **E2E PR ist kein required check — Auto-Merge wird nicht blockiert.** `E2E PR` wurde mit T000722 aus den Branch-Protection required checks entfernt. Der E2E-Workflow (`e2e-pr.yml`) läuft weiterhin bei jedem PR und zeigt sein Ergebnis informativ an (gelb wenn rot, kein Merge-Block). Auto-Merge wartet nur auf: `Offline Tests (Manifests, Configs, Unit)`, `Security Scan`, `Brett TypeScript`, `Vitest (website)`, `Conventional Commits`. Emergency-Wiederherstellung: `task gh:branch-protection:emergency-add-e2e` oder GitHub Settings UI unter `Settings → Branches → main`. Skript-Status anzeigen: `task gh:branch-protection:status`.
- **Auf diesem Host darf kein `kubectl port-forward` von Hand gestartet werden.** Es gibt eine Unit dafür (`mcp-gateway.service`); ein manueller Start belegt die Ports und sperrt sie stumm aus. Am 2026-08-02 löste das eine Restart-Schleife mit Counter 95 aus — der Fehler sah zunächst aus wie der eigentliche Defekt, war aber ein Bedienfehler. **`mcp-gateway.service`-Gesundheit nicht über `systemctl status` beurteilen.** `active (running)` sagt nur, dass der kubectl-Prozess lebt — nicht, dass der Tunnel funktioniert. Wer den Zustand wissen will, ruft `scripts/mcp-gateway/probe.sh` (T002543).
- **Suspendierte Flux-Kustomization meldet weiter `ready: True` — Cluster driften stumm ab [T002729].** Eine `suspend: true`-Kustomization hört nur auf zu reconciliieren; der `Ready`-Status friert auf dem letzten Zustand ein und bleibt grün, während der Cluster beliebig weit vom Repo abdriftet. Ohne Reconciliation läuft auch kein Prune. Prüfbefehl: `kubectl -n flux-system get kustomization <name> -o jsonpath='{.spec.suspend}'`. Belegter Fall: `llm-gateway-rerank`/`-embed` (und die `-batch`-Zwillinge) in `workspace-korczewski` überlebten die Repo-Entfernung durch T002551 (`20e123b7f`) um Monate und zeigten weiter auf `192.168.100.10`. Zweiter Teil des Befunds: ein Service **ohne Selector** mit handgesetzten Endpoints wird von Kubernetes nie auf Erreichbarkeit geprüft — der Endpoint bleibt grün, auch wenn dahinter nichts lauscht. Aufräumen: `kubectl -n <ns> delete svc <name> && kubectl -n <ns> delete endpoints <name> --ignore-not-found`.

### Staging environment (ENV=staging)
- **`ENV=staging`** deploys to the fleet cluster namespace `workspace-staging` — fully isolated from prod brands (`workspace`, `workspace-korczewski`).
- Own shared-db (namespace-local `shared-db` Service resolves to staging pod automatically), own `*.staging.<domain>` wildcard TLS, own SealedSecrets (`environments/sealed-secrets/staging.yaml`).
- **LiveKit removed per T002184** — previously disabled (replicas 0); hostNetwork slot freed. LLM is disabled (`LLM_ENABLED=false`).
- Push-deploy via existing tasks: `task workspace:deploy ENV=staging` → `task workspace:post-setup ENV=staging`.
- Deploy order (fresh ns): `env:fetch-cert ENV=staging` → `env:seal ENV=staging` → `cert:secret -- <ipv64-key> ENV=staging` → `workspace:deploy ENV=staging`.
- Overlay: `prod-fleet/staging/` (wraps `../../prod` + `fleet-common` component). Env file: `environments/staging.yaml`. SealedSecrets ref: `sealed-secrets/staging.yaml`.

### Korczewski homepage uses the Kore design system (different from mentolder)

`web.korczewski.de` and `web.mentolder.de` no longer share a layout. `website/src/pages/index.astro` branches on `process.env.BRAND_ID ?? process.env.BRAND` and renders the components under `website/src/components/kore/` for the `korczewski` brand. Mentolder still uses the existing Hero/WhyMe/ServiceRow/... Svelte components.

The Kore homepage has a timeline section (`BrandConfig.homepage.timeline === true`) that reads from `v_timeline`. The tracking pipeline was fully removed: `tracking-import` CronJob in PR #788, `track-pr.yml` in PR #993; the timeline shows historical data only (last entry: PR #787). New PRs are no longer tracked automatically.

The env var is `BRAND` in the Kubernetes ConfigMap (`k3d/website.yaml`) and `BRAND_ID` in local dev — `index.astro` reads both with `process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder'`.

### Local-first LLM pipeline

- **The GPU host is a single, user-provided box on `wg-mesh`** (RTX 5070 Ti, 16 GB). Both prod environments share it via three Services (`llm-gateway-lmstudio:1234`, `llm-gateway-tei-embed:8081`, `llm-gateway-tei-rerank:8083`) that point at the same `${LLM_HOST_IP}`. Losing the host stalls embedding indexing on `bge-m3` collections and makes chat-class requests return 503 (no cloud fallback). Voyage-tagged collections are unaffected.
- **Embeddings/rerank NEVER fall back across vector spaces.** A `bge-m3` collection always queries with bge-m3 and **fails closed** if TEI is down. A `voyage-multilingual-2` collection always queries with Voyage. The `MixedEmbeddingModelError` rejects multi-collection queries that span both. Don't "fix" this by adding silent fallback — vectors from different spaces in the same `<=>` query mean garbage retrieval.
- **`llm-gpu.yaml` is now in `k3d/` base (PR #1576); `llm-router.yaml` remains `prod/` overlay only.** Dev k3d reaches the GPU host via `LLM_HOST_IP: 172.17.0.1` (set in `environments/dev.yaml`). If no GPU is reachable, `embeddings.ts` falls through to direct Voyage when `LLM_ENABLED=false`. Don't add `llm-router.yaml` to `k3d/kustomization.yaml`.
- **`LLM_HOST_IP` is required when `LLM_ENABLED=true`.** Set it in `environments/<env>.yaml` to the GPU host's wg-mesh IP. The `llm:deploy` task aborts if unset.
- **Model swap costs ~3-6s on first call after idle.** LM Studio keeps models in VRAM until evicted; first call after a long idle pays the load cost. Router's chat-class timeout is 30s — beyond that, it falls back to Anthropic. Don't set the timeout below ~10s without testing all four models cold.
- **Coaching-Session-Provider für LM Studio wird per Seed-Skript angelegt.** `node scripts/seed-lmstudio-ki-config.mjs` schreibt idempotent die `coaching.ki_config`-Zeile (`provider: custom_lmstudio`); der API-Token kommt per Argument/Env und wird NIE committet. Endpoint/Modellname sind Laufzeit-DB-Config und driften — nicht aus alten Docs abschreiben, sondern in der DB nachsehen.
- **Opencode / OpenClaw on the WSL host** (`openclaw/`, `Taskfile.openclaw.yml`) talks directly to LM Studio on `localhost:1234/v1` or `10.10.0.3:1234/v1`, **not** through `llm-router`. Bootstrap: `task openclaw:install && task openclaw:configure`. Operational: `task openclaw:start` (restart daemon), `task openclaw:status` (health probe), `task openclaw:logs` (journalctl tail), `task openclaw:backup` / `task openclaw:restore` (snapshot ~/.openclaw), `task openclaw:wipe CONFIRM=yes` (destructive reset).
- **Cross-brand shared-infrastructure security analysis:** Full analysis in `docs/superpowers/references/shared-infrastructure-security.md` — covers LLM GPU host brand isolation, backup encryption pipeline (AES-256-CBC encrypt-then-upload), Filen/SMTP shared-account risk assessment, and WireGuard mesh peer trust model. Key finding: no data leaks; collections are DB-level isolated per brand; all backups are encrypted before upload.

### dev.mentolder.de stack

**Architecture & Status (2026-06):** The previous 3-node `devc` k3s HA cluster and the legacy `k3s-1` VM have been permanently **DECOMMISSIONED**. A new Proxmox cluster is active at IPs `10.0.0.9`, `10.0.0.11`, and `10.0.0.25`. Local development is performed via local k3d.

- **Storage & Services:** Historical reference: longhorn, shared-db-dev, and sish tunnels are offline. Local dev utilizes standard k3d namespaces.
- **WSL Bootstrapping & Workstation Setup**

- **`task` command collision:** On Ubuntu 24.04 (and newer), `apt install task` installs `taskwarrior` instead of `go-task`. Use `snap install task --classic` or install via the official go-task script.
- **Docker Desktop integration:** WSL integration is not auto-enabled for new distros, which blocks all build/k3d/docker work. Enable it manually under Docker Desktop Settings > Resources > WSL Integration.
- **SSH Key Permissions:** Private keys copied from Windows mount points often arrive with `644` permissions, which SSH will refuse. Run `chmod 600 ~/.ssh/id_ed25519` to fix.
- **Node.js Version requirements:** Enforced via `.nvmrc` and `engines` in `package.json` (requires Node.js >= 22.13.0 for pnpm 11 compatibility).
- See [WSL-BOOTSTRAP.md](file:///home/patrick/Bachelorprojekt/docs/WSL-BOOTSTRAP.md) for more details.

### Brett

(stub — reserved for future use)

### Alt-Worktrees nach T002135 — Submodul-Gitdir-Reste

Seit T002135 / PR #3167 sind die bats-Support-Libs vendort statt als Git-Submodule eingebunden. Worktrees, die **vor** dem 2026-07-23-Merge angelegt wurden, enthalten noch verwaiste per-Worktree-Submodul-Gitdirs unter `.git/worktrees/<name>/modules/`. Diese verhindern `git worktree remove` mit der Meldung „working trees containing submodules cannot be moved or removed" — obwohl der aktuelle Index keine Submodule mehr referenziert.

Zum sauberen Entfernen (ohne `--force`):

```bash
rm -rf .git/worktrees/<name>/modules   # verwaiste Submodul-Gitdirs
git worktree remove .worktrees/<name>  # geht dann ohne --force
```

Das Problem erledigt sich mit der Zeit, sobald alle VOR-T002135-Worktrees abgeräumt sind.

### merge=ours erzeugt GitHub-only Phantom-Konflikte

**Symptom.** `gh pr view <n> --json mergeStateStatus` meldet `DIRTY` oder `CONFLICTING`,
obwohl `git merge origin/main` lokal ohne einen einzigen Konflikt durchläuft und
`git diff` sauber ist. Die betroffenen Dateien sind ausnahmslos generierte Artefakte —
`docs/generated/**`, `website/src/data/openspec-status.json`, `website/src/data/test-inventory.json`
und rund 18 weitere.

**Ursache.** `.gitattributes` markiert 21 Pfade mit `merge=ours`. Lokal ist dafür der
Merge-Treiber `merge.ours.driver=true` konfiguriert: git ruft `true` auf, das Ergebnis
ist „unsere Version gewinnt", und der Konflikt verschwindet geräuschlos. **GitHub führt
serverseitig keine Custom-Merge-Driver aus** — dort bleibt es ein gewöhnlicher
Inhaltskonflikt. Das ist kein Bug in `.gitattributes`, sondern eine Asymmetrie zwischen
lokalem git und der GitHub-Merge-Maschine, und sie tritt zuverlässig auf, sobald zwei
Branches dieselben Artefakte regeneriert haben.

**Nicht auf die naheliegende Diagnose hereinfallen:** ein lokal sauberer Merge-Tree
*widerlegt* den GitHub-Konflikt nicht. Wer lokal prüft und „passt doch" schließt, sucht
den Fehler an der falschen Stelle.

**Auflösung.** Den PR-Branch serverseitig auf `main` nachziehen und die Artefakte danach
lokal neu erzeugen:

```bash
git fetch origin main && git merge origin/main   # lokal konfliktfrei dank merge=ours
task freshness:regenerate                        # Artefakte gegen den neuen Stand neu bauen
git add <die regenerierten Pfade> && git commit && git push
```

Reicht das nicht, hilft `update-branch` — siehe den REST-Fallback in
[`repo-hygiene-ops.md` §3](../../../.claude/skills/references/repo-hygiene-ops.md), denn
`gh pr update-branch` existiert erst in neueren `gh`-Versionen (2.45.0 kennt es **nicht**).

**Langfristig** gehören diese Artefakte nicht in den PR-Diff: entweder in CI regeneriert
statt committet, oder über `diff=generated` aus dem Diff gehalten. Solange sie committet
sind, bleibt der Phantom-Konflikt ein wiederkehrender Kostenposten. [T002347]

### WireGuard unter Windows: `wg set` & `.dpapi`-Recovery [T002495-M9]

Bei der Wartung von WireGuard-Tunnels auf Windows-Hosts (z. B. GPU-Host `scripts/llm/*.ps1`):
1. **`wg set <iface> peer ...` setzt KEINE Windows-Routen.** Es aktualisiert nur den Treiber-Kryptozustand. Der Handshake gelingt, aber IP-Pakete finden keine Route. Unter Windows richtet ausschließlich der Dienststart aus der `.conf` die Windows-Routingtabelle ein. Nach Änderungen Tunnel-Dienst neustarten und mit `Get-NetRoute` prüfen.
2. **`.dpapi`-Konfigurationen sind SYSTEM-geschützt.** `Data\Configurations\<name>.conf.dpapi` ist per ACL auf SYSTEM beschränkt (auch Admin-Builds bekommen Access Denied beim Lesen). Bei Tunnel-Recovery `.dpapi` nicht umkopieren, sondern `wireguard.exe /installtunnelservice <pfad-zur-.dpapi>` direkt aufrufen — der Dienst liest sie unter SYSTEM und stellt den Tunnel wieder her.

### git worktree add mit git-crypt-geschützten Pfaden: Smudge-Fehler erwartet [T002495-M5]

**Symptom.** Direkter Aufruf von `git worktree add --detach <pfad> origin/main -q` (also NICHT über `scripts/worktree-create.sh`) gibt aus:
```
error: external filter '/usr/bin/git-crypt smudge' failed 1
error: external filter '/usr/bin/git-crypt smudge' failed
```
Der Worktree wird trotzdem angelegt, HEAD steht korrekt, und BATS-Suites, die die Secrets nicht berühren, laufen fehlerfrei.

**Ursache.** Der neue Worktree erbt den git-crypt-Filter, aber nicht den entsperrten Schlüsselzustand. Die verschlüsselten Dateien unter `environments/.secrets/` können nicht ge-smudged werden.

**Risiken:**
- Ein Skript mit `set -e` oder Stderr-Check bricht hier fälschlich ab.
- In diesem Worktree befinden sich die `.secrets`-Dateien als roher Ciphertext — ohne weitere Warnung. Wer dort mit Secrets arbeiten will, findet UNBRAUCHBARE Inhalte.
- Die Fehlermeldung kommt nur einmal (beim Anlegen), nicht bei späterer Nutzung.

**Lösung.** Immer `scripts/worktree-create.sh <branch> <path>` verwenden. Das Skript legt den Worktree ohne Checkout an und konfiguriert dann entweder den Schlüssel (unlocked) oder neutralisiert den Filter auf `cat` (locked), bevor es checked out — ohne Smudge-Fehler in beiden Fällen.

### skip-worktree: git status schweigt, pull scheitert [T002712]

**Symptom.** `git pull --rebase` im Hauptcheckout scheitert mit:
```
error: Your local changes to the following files would be overwritten by merge:
        Taskfile.dev-stack.yml
```
Zugleich melden `git status --porcelain` NICHTS und `git diff HEAD` ist leer — die beiden Signale, mit denen man einen blockierten Pull normalerweise diagnostiziert, sind beide stumm.

**Ursache.** `git update-index --skip-worktree` blendet eine Datei aus `status` und `diff` aus, verhindert aber NICHT, dass `checkout`/`merge`/`rebase` sie schützen. Eine echte lokale Änderung — versteckt hinter dem Bit — blockiert jeden Pull unsichtbar.

**Diagnose.** Der einzige Befehl, der das sofort zeigt:
```bash
git ls-files -v | grep "^[a-z]"    # nicht-S = skip-worktree aktiv
# Ausgabe: S Taskfile.dev-stack.yml
```
Das `S` in der ersten Spalte zeigt: diese Datei hat skip-worktree gesetzt. Normale Dateien erscheinen mit `H` (cached) und werden von `grep "^[a-z]"` NICHT gefunden — nur Dateien mit gesetztem Bit leuchten auf.

**Behebung.** Sicherung der lokalen Änderung, dann Bit löschen:
```bash
cp Taskfile.dev-stack.yml /tmp/Taskfile.dev-stack.yml.local
git update-index --no-skip-worktree Taskfile.dev-stack.yml
git checkout -- Taskfile.dev-stack.yml
git pull --rebase origin main
# lokale Änderung bei Bedarf am neuen Pfad neu anwenden
```

**Fußnote: skip-worktree überlebt Datei-Verschiebungen nicht.** Ein per skip-worktree versteckter lokaler Override auf einer Datei, die später im Repo verschoben wird (z. B. `Taskfile.dev-stack.yml` → `taskfiles/Taskfile.dev-stack.yml`), geht still verloren — das Bit haftet am alten Pfad, der nach dem Rebase nicht mehr existiert. Nach dem Umzug muss der Override am neuen Pfad neu gesetzt werden.

### Assertions dürfen nur an der geprüften Sache scheitern [T002834/T002850/T002878]

Die Positiv-Anker-Pflicht (T002356-M1) verlangt, dass eine Assertion ausschließlich über die
geprüfte Sache entscheidet. Drei unabhängig gefundene Fälle zeigen, wie ein Test aus dem
FALSCHEN Grund kippt (oder fälschlich grün bleibt) — jeweils, weil die Testmechanik selbst zur
Fehlerquelle wurde, nicht der geprüfte Sachverhalt:

- **T002878 — Helper-Funktion ohne explizites `return 0`.** Eine Bash-Helper-Funktion, die in
  einer Schleife `grep` aufruft und Treffer sammelt (z. B. `_workflows_with_paths()` in
  `tests/spec/ci-cd/workflow-self-trigger.bats`), gibt ohne expliziten `return`-Statement den
  Exit-Code des ZULETZT ausgeführten `grep` nach außen — nicht "die Funktion ist fertig
  gelaufen". Hat die alphabetisch letzte Kandidatendatei keinen Treffer, kippt der
  Positiv-Anker, obwohl die Funktion korrekt lief und valide (leere oder nicht-leere)
  Ergebnisse sammelte. Fix: die Funktion schließt explizit mit `return 0` — mit Kommentar,
  der erklärt, warum (siehe Datei, Zeile `return 0` nach der Sammel-Schleife).
- **T002834 — Freshness-Check mutiert den Arbeitsbaum, den er prüft.** Ein Test, der
  `task agent-guide:maps` direkt aufruft und danach `git diff --exit-code` auf die getrackten
  Karten unter `docs/agent-guide/maps/` prüft, schreibt dabei selbst in genau die Dateien, über
  die er urteilt — ein RÄUMLICHER Nebeneffekt. Der Test bleibt zwar über die Aussage
  (Freshness) korrekt, hinterlässt aber mtime-Änderungen auf getrackten Dateien, die
  nachgelagerte Guards (`spec-tracked-file-guard`) als Verstoß gegen "Testläufe verändern den
  Arbeitsbaum nicht" melden. Fix: den Emitter in ein Tempdir schreiben lassen
  (`AGENT_GUIDE_MAPS_OUT_DIR`-Override in `scripts/agent-guide/emit-maps.mjs`) und dort per
  `diff -u` gegen die getrackte Datei vergleichen — die Freshness-Aussage bleibt unverändert
  wahr, nur der Seiteneffekt auf den Arbeitsbaum entfällt.
- **T002850 — fester `sleep` statt Bereitschaftsprüfung.** Ein Test, der einen Hintergrund-Server
  startet und danach mit einem festen `sleep 1` wartet, bevor er die Erreichbarkeit prüft, ist
  ein ZEITLICHER Nebeneffekt: unter CPU-Kontention (parallele `bats -j`-Shards) reicht die
  Sekunde nicht immer bis zum `bind()` des Servers — der Positiv-Anker kippt dann aus einem
  Scheduling-Grund, nicht weil der Server ungesund wäre. Fix: aktives Polling auf den Port
  (`/dev/tcp/127.0.0.1/$port`) mit kurzer Schrittweite und klarer Obergrenze statt eines festen
  `sleep`; wird die Obergrenze erreicht, meldet der Test einen expliziten Timeout statt einer
  irreführenden Positiv-Anker-Meldung.

**Gemeinsames Muster:** räumlich (mutierter Arbeitsbaum) und zeitlich (fester Sleep) sind zwei
Ausprägungen derselben verletzten Erwartung — die Assertion soll ausschließlich über die Sache
entscheiden, die sie behauptet zu prüfen. Bei jedem neuen Guard-/Freshness-/Warte-Test prüfen:
lässt der Testlauf einen beobachtbaren Nebeneffekt zurück (Datei-Mutation, feste Wartezeit,
globaler Zustand), der die Assertion aus einem anderen Grund kippen lassen könnte als dem
  geprüften? Wenn ja, den Nebeneffekt isolieren (Tempdir, Polling, Mock) statt ihn hinzunehmen.

### Kubelet-Serving-Zertifikat nach Docker-IP-Tausch (T002999)

**Symptom:** Alle Ticket-Operationen brechen plötzlich mit `tls: failed to verify certificate: x509: certificate is valid for 127.0.0.1, 172.23.0.3, not 172.23.0.4` ab. Die Meldung nennt `psql` und die Ticket-Tabelle — sie zeigt damit auf das falsche Subsystem. Der Fehler liegt im Kubelet-Serving-Zertifikat, nicht in der Datenbank.

**Ursache:** Bei einem Container-Neustart (oder Restart des Docker-Daemons) können die Docker-IPs zwischen k3d-Nodes tauschen. Das Node-Objekt und `docker inspect` stimmen dann auf die neuen IPs — nur das Kubelet-Serving-Zertifikat auf dem Server-Node ist noch auf die alte IP ausgestellt. k3s schreibt die Datei zwar neu (erkennbar an der aktuellen mtime), stellt sie aber nicht neu aus.

**Warum das so gefährlich ist:** Der Ausfall trifft alle drei Ticket-Werkzeuge gleichzeitig (`ticket.sh`, `ticket-mcp`, `factory-mcp`), weil alle drei denselben `kubectl exec`-Pfad teilen — also genau die Werkzeuge, mit denen man einen Ausfall dokumentieren würde. `kubectl rollout status` und `kubectl get pods` bleiben grün (die laufen über den API-Server), während jedes `kubectl exec` scheitert.

**Reparatur:** Ein bloßer Container-Neustart reicht **nicht** — die mtime ändert sich, der SAN nicht. Vor dem Neustart müssen die Zertifikatsdateien gelöscht werden, damit k3s sie beim nächsten Start neu ausstellt:

```bash
docker exec k3d-mentolder-dev-server-0 sh -c \
  'rm -f /var/lib/rancher/k3s/agent/serving-kubelet.crt \
         /var/lib/rancher/k3s/agent/serving-kubelet.key'
docker restart k3d-mentolder-dev-server-0
```

Beide Schritte automatisiert: `task sdlc:cert:check -- --repair` oder direkt `bash scripts/sdlc/kubelet-cert-check.sh --repair`. Der Health-Gate prüft den Zustand automatisch mit.

### Test-Guard misst Darstellung statt Semantik — vier Spielarten (T003104, T003108, T003548, T003230)

Die Konvention T002716 (CLAUDE.md) deckt den Formatfall ab: ein Guard, der das
Ausgabeformat eines Werkzeugs festschreibt, bricht bei der nächsten Version. Die
gleiche Fehlerklasse hat vier weitere Spielarten, die je einen eigenen Fehlermodus
haben. Im Folgenden die belegten Vorgänge — lokal unsichtbar, sichtbar gemacht
jeweils erst durch CI, Diagnose-Commit oder den vorgeschriebenen RED-Lauf.

**T003548 — Konfiguration statt Laufzeit:** Der Autor hatte die Grenze zwischen
"aktiviert" und "geladen" im Dateikopf des Tests **selbst notiert** und trotzdem
auf der Konfigurationsaussage aufgebaut: Der Test prüfte, dass eine Konfiguration
gesetzt ist, und hakte ab — obwohl der Defekt in der Laufzeit saß und die
Konfiguration nie geladen wurde. Das Aufschreiben der Abgrenzung ersetzt die
Prüfung nicht; lokal grün war es, weil niemand den Laufzeitpfad ausführte. Sichtbar
wurde es allein durch den vorgeschriebenen RED-Lauf. Geholfen hat am Ende nicht ein
besserer Offline-Test, sondern den vorhandenen Laufzeit-Guard
(`scripts/llm/routing-check.sh`) überhaupt aufzurufen — er lag ungenutzt im Repo.
Lehre: Vor dem Abhaken klären, ob die Zusicherung die Größe misst, in der der
Defekt sitzt. Ein RED-Lauf, der grün ist, ist ein Befund am Test, kein "schon
erfüllt".

**T003230 — Prozesslisten-Format:** Ein Guard auf `ps -eo pid=` (Prozessliste) war
lokal grün und rot im CI. Alle vier Vorab-Hypothesen waren falsch; jede Sonde
meldete den erwarteten Wert. Gefunden wurde die Ursache erst per Diagnose-Commit im
CI: `ps` polstert rechtsbündig auf die Breite von `pid_max` auf. Eine lang laufende
WSL-Instanz vergibt bereits 7-stellige PIDs — exakt Feldbreite, also keine
Polsterung, und der Test bestand. Auf einem frischen Runner (kleine PIDs) wird
aufgefüllt, der Formatvergleich schlug fehl. Der Test fand das Format vor, statt es
zu erzwingen. Fix: Format erzwingen (`tr -d '[:blank:]'`, blankes `read -r` ohne
`IFS=`), statt das vorfinden zu müssen.

**T003108 — Options-Parsing:** `grep -qF '--flag'` schützt nicht vor
Options-Parsing: `-F` macht das Muster literal, aber das Argument `--flag` wird
trotzdem als Option geparst. GNU grep endet mit Exit 2 (Werkzeugfehler), nicht 1
(nicht gefunden) — in einer `if`-Bedingung sind beide ununterscheidbar, der Guard
kippt also still. Erschwerend: Die Fehlermeldung stammte von `ugrep`, nicht von GNU
grep — auf dem Entwicklungshost ist `grep` ein ugrep-Alias. Der Meldungstext
unterscheidet sich damit zwischen lokaler Shell und CI-Runner, was einen Guard auf
den Meldungstext seinerseits unzuverlässig macht. Fix: nur Exit-Codes prüfen, nie
den Wortlaut; `-e` oder `--` verwenden, um das Muster zu markieren. Betrifft jeden
Guard, der ein CLI-Flag im Text sucht.

**T003104 — Dokumentposition:** `grep -n … | head -1` misst die Position des
ersten Zufallstreffers im ganzen Dokument statt der gemeinten Stelle. Eine
unverwandte Einfügung oberhalb der gemeinten Regel färbt den Guard rot, ohne dass
sich das Geprüfte geändert hat — der Test wird zum Drift-Melder für fremde
Einfügungen. Fix: die Suche auf den Abschnitt eingrenzen (awk-Bereichsmuster,
sed-Range), statt die dokumentweite Suche mit `head -1` zu beschneiden.
