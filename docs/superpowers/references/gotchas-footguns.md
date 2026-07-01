# Gotchas & Footguns Reference

Non-obvious repo behaviors that silently break things or hit the wrong cluster. This file is the canonical source, extracted from `CLAUDE.md` to keep that file within its token budget.

## Section Index

1. [security-guidance plugin rewake after commits](#security-guidance-plugin-rewake-after-commits) — never git-restore after a commit rewake
2. [Session-Koordination (parallele Agenten — Claude + Gemini)](#session-koordination-parallele-agenten--claude--gemini) — agent-lock.sh claim/release/reap protocol
3. [Environment targeting](#environment-targeting) — ENV= is always explicit; WORKSPACE_NAMESPACE
4. [Cluster node placement (fleet)](#cluster-node-placement-fleet) — wg-fleet flannel-iface; LiveKit node-pin
5. [Kustomize overlays](#kustomize-overlays) — prod-fleet/* only; never bare prod/; $patch:delete
6. [Scripts & env](#scripts--env) — env-resolve.sh must be sourced; envsubst lists
7. [Database queries](#database-queries) — never SELECT * on ticket_plans.content
8. [Cluster reset / fresh cluster bring-up order](#cluster-reset--fresh-cluster-bring-up-order) — sealed-secrets → fetch-cert → seal → cert → deploy
9. [Operational](#operational) — push-based; pull-first; CONFLICTING PR suppresses CI
10. [Staging environment (ENV=staging)](#staging-environment-envstaging) — workspace-staging ns; LiveKit disabled
11. [Korczewski homepage uses the Kore design system](#korczewski-homepage-uses-the-kore-design-system-different-from-mentolder) — website/src/components/kore/
12. [Local-first LLM pipeline](#local-first-llm-pipeline) — GPU host; vector space isolation; LM Studio
13. [dev.mentolder.de stack](#devmentolderde-stack) — devc decommissioned; WSL bootstrap caveats
14. [Brett](#brett) — stub; reserved for future use

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
- **LiveKit is pinned to `pk-hetzner-4` via `nodeAffinity`.** It runs with `hostNetwork: true` and needs a stable IP for DNS pinning. The fleet overlay (`prod-fleet/mentolder/kustomization.yaml`) sets this pin. `livekit.<domain>` and `stream.<domain>` should DNS-pin to `204.168.244.104` (pk-hetzner-4) via `task livekit:dns-pin`.

### Kustomize overlays
- **Apply `prod-fleet/mentolder/` or `prod-fleet/korczewski/`, never base `prod/` (or the bare `prod-mentolder/`/`prod-korczewski/`) alone.** `ENV_OVERLAY` resolves to the `prod-fleet/<brand>` wrapper, which reuses the brand overlay + `fleet-common`. The base `prod/` exists to be consumed by the env-specific overlays and contains a `$patch: delete` on the `workspace-secrets` Secret — applying it directly relies on the sealed secret existing and can leave the cluster without credentials.
- **Never remove the `$patch: delete` block in `prod/kustomization.yaml`.** Its job is to strip the dev placeholder from `k3d/secrets.yaml` so SealedSecrets-managed secrets survive each deploy. Removing it overwrites production secrets with dev values.
- **Collabora and CoTURN are NOT in the base kustomization.** `k3d/office-stack` and `k3d/coturn-stack` are deployed separately via `task workspace:office:deploy`. A full bring-up order is `workspace:deploy` → `workspace:office:deploy` → CoTURN apply.
- **Website, Brett, Docs, Videovault, Mediaviewer-Widget, Mentolder-Web, and Downloads images use `:latest` intentionally** (`k3d/website.yaml`, `k3d/brett.yaml`, `k3d/docs.yaml`, `k3d/videovault.yaml`, `k3d/mediaviewer-widget.yaml`, `k3d/mentolder-web.yaml`, `k3d/downloads.yaml`). CI warns about `:latest` for these; do not "fix" these tags to a digest — each image is rebuilt and re-imported/pushed on every release (`task feature:brett`, `task docs:deploy`, `task feature:website`, `build-mentolder-web.yml`, `build-rustdesk-installer.yml`).

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
- **LiveKit needs node-pinning + DNS-pinning + ufw rules.** `livekit-server` runs with `hostNetwork: true` (workspace ns is `pod-security: privileged` for this) and is pinned via `nodeAffinity` to `pk-hetzner-4` (fleet). The Hetzner host firewall blocks all inter-node traffic except 80/443 — `prod/cloud-init.yaml` opens 7880/tcp + 7881/tcp + 50000-60000/udp + 30000-40000/udp on every node. `livekit.<domain>` and `stream.<domain>` should DNS-pin to `204.168.244.104` (pk-hetzner-4) via `task livekit:dns-pin` (browsers otherwise hit a non-LiveKit node ~66% of the time and ICE silently fails). `Room.connect()` must run from a user gesture — Chrome blocks the AudioContext otherwise.
- **E2E PR ist kein required check — Auto-Merge wird nicht blockiert.** `E2E PR` wurde mit T000722 aus den Branch-Protection required checks entfernt. Der E2E-Workflow (`e2e-pr.yml`) läuft weiterhin bei jedem PR und zeigt sein Ergebnis informativ an (gelb wenn rot, kein Merge-Block). Auto-Merge wartet nur auf: `Offline Tests (Manifests, Configs, Unit)`, `Security Scan`, `Brett TypeScript`, `Vitest (website)`, `Conventional Commits`. Emergency-Wiederherstellung: `task gh:branch-protection:emergency-add-e2e` oder GitHub Settings UI unter `Settings → Branches → main`. Skript-Status anzeigen: `task gh:branch-protection:status`.

### Staging environment (ENV=staging)
- **`ENV=staging`** deploys to the fleet cluster namespace `workspace-staging` — fully isolated from prod brands (`workspace`, `workspace-korczewski`).
- Own shared-db (namespace-local `shared-db` Service resolves to staging pod automatically), own `*.staging.<domain>` wildcard TLS, own SealedSecrets (`environments/sealed-secrets/staging.yaml`).
- **LiveKit is disabled** (replicas 0) — hostNetwork slot on pk-hetzner-4 is occupied by prod. LLM is disabled (`LLM_ENABLED=false`).
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
