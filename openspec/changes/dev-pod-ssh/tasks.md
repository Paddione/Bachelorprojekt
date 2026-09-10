---
title: "dev-pod-ssh — Implementation Plan"
ticket_id: T900108
domains: [infra, tests]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# dev-pod-ssh — Implementation Plan

_Ticket: T900108 · Design: `openspec/changes/dev-pod-ssh/design.md` · Delta: `openspec/changes/dev-pod-ssh/specs/mcp-gateway.md`_

## File Structure

```
docker/dev-shell/Dockerfile                    NEU  Dev-Toolchain + openssh-server, zwei Login-Namen auf uid 1000
docker/dev-shell/sshd_config                   NEU  Loopback-only, key-only, AuthorizedKeysFile per %u
docker/dev-shell/entrypoint.sh                 NEU  Host-Key erzeugen, Keys kopieren, exec sshd
k3d/dev-pod/deployment.yaml                    AEND vierter Container dev-shell, sysctl, Volumes home + authorized-keys
k3d/dev-pod/home-pvc.yaml                      NEU  PVC dev-pod-home (longhorn, RWO, 20Gi)
k3d/dev-pod/authorized-keys.yaml               NEU  ConfigMap dev-pod-authorized-keys (patrick, gekko)
k3d/dev-pod/kustomization.yaml                 AEND home-pvc.yaml + authorized-keys.yaml in resources
.github/workflows/build-dev-pod.yml            AEND Matrix-Eintrag dev-shell + paths-Filter
tests/spec/mcp-gateway/dev-shell-ssh.bats      NEU  Guards fuer die ADDED Requirements
tests/spec/dev-pod-mcp-bundle/dev-pod.bats     AEND Container-Anzahl drei -> vier (MODIFIED Requirement)
components/website/src/data/test-inventory.json AEND regeneriert
```

**S1:** Keine der Dateien ist in `docs/code-quality/baseline.json` gebaselined. `.yaml`, `.yml`,
`.bats`, `Dockerfile` und `sshd_config` haben in `docs/code-quality/gates.yaml` → `s1.limits` kein
Extension-Limit; `entrypoint.sh` fällt unter das `.sh`-Limit und bleibt mit rund 25 Zeilen weit
darunter. Kein Split nötig.

**S3:** Keine Brand-Domain-Literale — die Manifeste referenzieren nur `ghcr.io` und Cluster-interne Namen.
**S4:** Neue Manifeste werden in Task 3 in `k3d/dev-pod/kustomization.yaml` eingetragen; `entrypoint.sh` wird vom Dockerfile referenziert.

## Partials

Ein Partial (Single-Plan): die Dateimenge ist klein und eng gekoppelt (Image, Manifest und Guard
müssen gemeinsam grün werden).

---

### Task 1: Guards schreiben (RED)

**Dateien:** `tests/spec/mcp-gateway/dev-shell-ssh.bats` (neu), `tests/spec/dev-pod-mcp-bundle/dev-pod.bats`

- [x] **1.1** In `tests/spec/dev-pod-mcp-bundle/dev-pod.bats` den Test
  `dev-pod carries exactly the three declared containers` umbenennen zu
  `dev-pod carries exactly the four declared containers` und die Erwartung auf
  `dev-shell,mcp-kubernetes,mcp-node,repo-sync` setzen. Der Test
  `playwright is absent from the bundle` behält seinen Anker `-ge 3`.

- [x] **1.2** `tests/spec/mcp-gateway/dev-shell-ssh.bats` anlegen. Header-Kommentar wie in
  `dev-pod.bats`: Prüfmodus ist der Parser-Output über Manifeste (node + `yaml`), für
  `sshd_config` und `Dockerfile` ist die Datei selbst das Resultat. Dieselbe `setup()`- und
  `y()`-Helferstruktur wie `dev-pod.bats` (inkl. `cygpath -m` unter MSYS). Tests, jeweils mit
  Positiv-Anker vor jeder Negativ-Aussage:

  1. `dev-shell container exists with the dev-shell image` —
     `d.spec.template.spec.containers.filter(c=>c.name==='dev-shell').map(c=>c.image).join(',')`
     beginnt mit `ghcr.io/paddione/dev-shell`.
  2. `dev-shell runs as uid 1000 and the pod stays runAsNonRoot` — Pod
     `securityContext.runAsNonRoot === true`, Container `securityContext.runAsUser === 1000`,
     `allowPrivilegeEscalation === false`.
  3. `pod declares ip_unprivileged_port_start=0` —
     `(d.spec.template.spec.securityContext.sysctls||[]).filter(s=>s.name==='net.ipv4.ip_unprivileged_port_start').map(s=>s.value).join(',')`
     ergibt `0`.
  4. `port 22 is neither a containerPort nor a service port` — Anker: `service.yaml` hat
     mindestens einen Port; dann `flatMap` aller `containerPort`s im Deployment und aller
     `port`/`targetPort` im Service enthält keine `22`.
  5. `sshd listens on loopback only and disables password and root login` — in
     `docker/dev-shell/sshd_config` (Anker: Datei existiert und enthält eine `Port 22`-Zeile) je
     genau eine Zeile `ListenAddress 127.0.0.1`, `PasswordAuthentication no`,
     `KbdInteractiveAuthentication no`, `PermitRootLogin no`, `AllowUsers patrick gekko`, und
     keine `ListenAddress`-Zeile mit einem anderen Wert (`grep -E '^ListenAddress' | grep -vc '127.0.0.1' || true` ergibt `0`).
  6. `authorized keys match the environment registry` — Werte `data.patrick` / `data.gekko`
     aus `k3d/dev-pod/authorized-keys.yaml` (getrimmt) sind nicht leer und gleich
     `setup_vars.PATRICK_SSH_PUBLIC_KEY` / `setup_vars.GEKKO_SSH_PUBLIC_KEY` aus
     `environments/mentolder.yaml` — Pfad des Keys im YAML vor dem Schreiben mit
     `grep -n -B30 'PATRICK_SSH_PUBLIC_KEY' environments/mentolder.yaml | grep -E '^[0-9]+-[a-z_]+:$'`
     ermitteln und im Node-Ausdruck exakt diesen Top-Level-Key verwenden.
  7. `dev-shell mounts dev-pod-home at /home/dev` — `k3d/dev-pod/home-pvc.yaml` ist
     `PersistentVolumeClaim/dev-pod-home`; das Deployment-Volume mit
     `claimName==='dev-pod-home'` wird von `dev-shell` unter `/home/dev` gemountet.
  8. `dev-shell mounts the checkout read-only` — `dev-shell` mountet das `dev-pod-repo`-Volume
     (Anker) und `readOnly === true`.
  9. `new manifests are part of the kustomization` — `resources` in
     `k3d/dev-pod/kustomization.yaml` enthält `home-pvc.yaml` und `authorized-keys.yaml`.
  10. `dev-shell image carries its toolchain at build time` — in `docker/dev-shell/Dockerfile`
      mindestens eine `^RUN`-Zeile bzw. `RUN`-Fortsetzung mit `openssh-server`, sowie Treffer für
      `kubectl`, `claude-code`, `gh`, `task`; die `CMD`/`ENTRYPOINT`-Zeilen enthalten keinen
      Paketmanager (`apt-get|apk|npm install` → `0`).
  11. `build workflow builds the dev-shell image` — `.github/workflows/build-dev-pod.yml`
      geparst: `jobs.build.strategy.matrix.include` enthält `{image:'dev-shell', context:'docker/dev-shell'}`
      und `on.push.paths` enthält `docker/dev-shell/**`.

- [x] **1.3** RED-Lauf. Die neuen Guards und der geänderte Container-Count-Test müssen scheitern:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/dev-shell-ssh.bats tests/spec/dev-pod-mcp-bundle/dev-pod.bats
# expected: FAIL (dev-shell, sshd_config, home-pvc.yaml, authorized-keys.yaml existieren noch nicht)
```

  Ein Test, der hier bereits grün ist, ist ein Befund am Test (tests/CLAUDE.md, Spielart 3) —
  korrigieren, bevor Task 2 beginnt. Fehlt `yaml` für node: `(cd tests && npm ls yaml)` prüfen und
  denselben Auflösungsweg wie `dev-pod.bats` verwenden.

- [x] **1.4** Commit: `test(infra): Guards fuer dev-shell-SSH (RED) [T900108]`

### Task 2: Image `dev-shell`

**Dateien:** `docker/dev-shell/Dockerfile`, `docker/dev-shell/sshd_config`, `docker/dev-shell/entrypoint.sh`

- [x] **2.1** `docker/dev-shell/sshd_config` exakt mit dem Block aus `design.md` §sshd-Konfiguration anlegen.

- [x] **2.2** `docker/dev-shell/entrypoint.sh` (POSIX sh, `set -eu`):

```sh
#!/bin/sh
# docker/dev-shell/entrypoint.sh — Startpfad des dev-shell-Containers [T900108]
# Kein Paketmanager, kein Netzzugriff: nur Host-Key, Keys, sshd.
set -eu
HOSTKEY_DIR=/home/dev/.ssh-host
KEY_SRC=/etc/dev-shell/keys
KEY_DST=/var/lib/dev-shell/authorized_keys

mkdir -p "$HOSTKEY_DIR"
chmod 700 "$HOSTKEY_DIR"
if [ ! -s "$HOSTKEY_DIR/ssh_host_ed25519_key" ]; then
  ssh-keygen -q -t ed25519 -N '' -f "$HOSTKEY_DIR/ssh_host_ed25519_key"
fi
chmod 600 "$HOSTKEY_DIR/ssh_host_ed25519_key"

for u in patrick gekko; do
  [ -s "$KEY_SRC/$u" ] || { echo "dev-shell: kein Key fuer $u unter $KEY_SRC" >&2; exit 1; }
  cp "$KEY_SRC/$u" "$KEY_DST/$u"
  chmod 600 "$KEY_DST/$u"
done

exec /usr/sbin/sshd -D -e -f /etc/ssh/sshd_config
```

- [x] **2.3** `docker/dev-shell/Dockerfile`:

```dockerfile
# docker/dev-shell/Dockerfile — SSH-erreichbarer Dev-Container des dev-pod [T900108]
# Alles zur Bauzeit (Requirement "Container images carry their dependencies").
FROM node:22-bookworm-slim

ARG KUBECTL_VERSION=v1.36.1
ARG CLAUDE_CODE_VERSION=2.1.267

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      openssh-server git git-crypt bash curl ca-certificates jq less vim-tiny tmux \
      netcat-openbsd postgresql-client gnupg \
 && curl -fsSL -o /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/amd64/kubectl" \
 && chmod +x /usr/local/bin/kubectl \
 && sh -c "$(curl -fsSL https://taskfile.dev/install.sh)" -- -d -b /usr/local/bin \
 && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg -o /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list \
 && apt-get update && apt-get install -y --no-install-recommends gh \
 && npm install -g --no-audit --no-fund pnpm "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}" \
 && rm -rf /var/lib/apt/lists/*

# Zwei Login-Namen auf uid 1000: sshd ohne root prueft getuid()==pw_uid, nicht den Namen.
# Shadow '*' statt '!': '!' wertet sshd als gesperrtes Konto.
RUN groupmod -n dev node \
 && usermod -l patrick -d /home/dev -m -s /bin/bash node \
 && usermod -p '*' patrick \
 && echo 'gekko:x:1000:1000:gekko:/home/dev:/bin/bash' >> /etc/passwd \
 && echo 'gekko:*:19000:0:99999:7:::' >> /etc/shadow \
 && install -d -o 1000 -g 1000 -m 0700 /var/lib/dev-shell/authorized_keys \
 && install -d -o 1000 -g 1000 -m 0755 /run/sshd \
 && rm -f /etc/ssh/ssh_host_*

COPY sshd_config /etc/ssh/sshd_config
COPY entrypoint.sh /opt/dev-shell/entrypoint.sh
RUN chmod 0644 /etc/ssh/sshd_config && chmod 0755 /opt/dev-shell/entrypoint.sh

USER 1000
WORKDIR /home/dev
CMD ["/bin/sh", "/opt/dev-shell/entrypoint.sh"]
```

  Vor dem Schreiben verifizieren, dass `taskfile.dev/install.sh` die Flags `-d -b` weiterhin
  unterstützt (`curl -fsSL https://taskfile.dev/install.sh | head -40`); sonst die gepinnte
  Release-Tarball-URL aus github.com/go-task/task verwenden.

- [ ] **2.4** Lokaler Smoke-Test des Zwei-Namen-Modells (zentrales Risiko aus `design.md`).
  Mit einem Wegwerf-Keypair; `sshd_config` wird für den Test nur per `-o` überschrieben:

```bash
docker build -t dev-shell:smoke docker/dev-shell
TMPK="$(mktemp -d)"; ssh-keygen -q -t ed25519 -N '' -f "$TMPK/k"
mkdir -p "$TMPK/keys"; cp "$TMPK/k.pub" "$TMPK/keys/patrick"; cp "$TMPK/k.pub" "$TMPK/keys/gekko"
docker run -d --name dev-shell-smoke -p 127.0.0.1:2222:2222 -v "$TMPK/keys:/etc/dev-shell/keys:ro" \
  --sysctl net.ipv4.ip_unprivileged_port_start=0 --entrypoint /bin/sh dev-shell:smoke \
  -c 'sed -i "s/^ListenAddress .*/ListenAddress 0.0.0.0/; s/^Port 22/Port 2222/" /etc/ssh/sshd_config && exec /bin/sh /opt/dev-shell/entrypoint.sh'
ssh -i "$TMPK/k" -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null patrick@127.0.0.1 'id -u; whoami; task --version; kubectl version --client; claude --version'
ssh -i "$TMPK/k" -p 2222 -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null gekko@127.0.0.1 'id -u; whoami'
docker rm -f dev-shell-smoke
```

  Erwartung: beide Logins liefern `1000`. Scheitert ein Login mit "not running as root" oder
  "account is locked": **STOPP und Rückfrage an den User** (Rückfallebene aus `design.md`:
  ein Login-Name `dev`). Ist lokal kein Docker verfügbar, den Smoke-Test als ersten Punkt von
  Task 6 nach dem Branch-Build im Cluster ausführen und dies im PR-Body vermerken.

- [ ] **2.5** Commit: `feat(infra): dev-shell-Image mit sshd und Dev-Toolchain [T900108]`

### Task 3: Manifeste

**Dateien:** `k3d/dev-pod/deployment.yaml`, `k3d/dev-pod/home-pvc.yaml`, `k3d/dev-pod/authorized-keys.yaml`, `k3d/dev-pod/kustomization.yaml`

- [x] **3.1** `k3d/dev-pod/home-pvc.yaml`: `PersistentVolumeClaim` `dev-pod-home`, Label
  `app: dev-pod`, `accessModes: [ReadWriteOnce]`, `storageClassName: longhorn`, `storage: 20Gi`.
  Kommentar-Header nach dem Muster von `pvc.yaml`.

- [x] **3.2** `k3d/dev-pod/authorized-keys.yaml`: `ConfigMap` `dev-pod-authorized-keys` mit
  `data.patrick` und `data.gekko`. Werte exakt aus `environments/mentolder.yaml`
  (`PATRICK_SSH_PUBLIC_KEY`, `GEKKO_SSH_PUBLIC_KEY`) übernehmen, jeweils mit abschließendem
  Zeilenumbruch. Header-Kommentar: öffentliche Schlüssel, Drift-Guard in
  `tests/spec/mcp-gateway/dev-shell-ssh.bats`.

- [x] **3.3** `k3d/dev-pod/kustomization.yaml`: `home-pvc.yaml` und `authorized-keys.yaml`
  in `resources` aufnehmen.

- [x] **3.4** `k3d/dev-pod/deployment.yaml`:
  - Kopfkommentar: "Drei Container" → "Vier Container", `dev-shell` mit einer Zeile beschreiben.
  - Pod-`securityContext`: `sysctls: [{name: net.ipv4.ip_unprivileged_port_start, value: "0"}]`
    mit Kommentar (non-root sshd bindet :22, safe sysctl, pro Pod-Netz-Namespace).
  - Neuer Container nach `repo-sync`:

```yaml
        # ── dev-shell ───────────────────────────────────────────────
        # SSH-Zugang ausschliesslich ueber kubectl exec + nc 127.0.0.1 22 [T900108].
        # Kein containerPort: sshd bindet nur Loopback.
        - name: dev-shell
          image: ghcr.io/paddione/dev-shell:latest
          imagePullPolicy: Always
          readinessProbe:
            exec:
              command: ["sh", "-c", "nc -z 127.0.0.1 22"]
            initialDelaySeconds: 5
            periodSeconds: 20
          resources:
            requests:
              cpu: 100m
              memory: 256Mi
            limits:
              cpu: "2"
              memory: 3Gi
          securityContext:
            runAsNonRoot: true
            runAsUser: 1000
            allowPrivilegeEscalation: false
          volumeMounts:
            - name: home
              mountPath: /home/dev
            - name: authorized-keys
              mountPath: /etc/dev-shell/keys
              readOnly: true
            - name: repo
              mountPath: /workspace/repo
              readOnly: true
```

  - Volumes ergänzen: `home` → `persistentVolumeClaim.claimName: dev-pod-home`;
    `authorized-keys` → `configMap.name: dev-pod-authorized-keys`.
  - Die bestehende Readiness-Probe von `mcp-node` bleibt unverändert (sie gatet die MCP-Ports).

- [x] **3.5** Validieren:

```bash
kubectl kustomize prod-fleet/dev-pod > /dev/null
task workspace:validate
```

- [ ] **3.6** Commit: `feat(infra): dev-pod bekommt dev-shell-Container mit Home-PVC [T900108]`

### Task 4: Build-Workflow

**Datei:** `.github/workflows/build-dev-pod.yml`

- [ ] **4.1** Kopfkommentar um `docker/dev-shell -> ghcr.io/paddione/dev-shell` ergänzen,
  "die beiden Images" → "die drei Images".
- [ ] **4.2** `on.push.paths` um `'docker/dev-shell/**'` ergänzen.
- [ ] **4.3** Matrix um `- image: dev-shell` / `context: docker/dev-shell` ergänzen. Der
  vorhandene Step "Shell syntax check" prüft `entrypoint.sh` mit `sh -n` automatisch.
- [ ] **4.4** GREEN-Lauf:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/mcp-gateway/dev-shell-ssh.bats tests/spec/dev-pod-mcp-bundle/dev-pod.bats
```

- [ ] **4.5** Commit: `ci(infra): build-dev-pod baut dev-shell mit [T900108]`

### Task 5: Image vor dem Merge bereitstellen

`strategy: Recreate` → ein fehlendes Image würde beim Flux-Rollout alle In-Cluster-MCP-Server
stoppen (`design.md` §Rollout-Risiko).

- [ ] **5.1** Branch pushen, dann den Workflow auf dem Branch auslösen und abwarten:

```bash
gh workflow run build-dev-pod.yml --ref "$(git branch --show-current)"
gh run list --workflow build-dev-pod.yml --limit 1 --json databaseId -q '.[0].databaseId' | xargs gh run watch --exit-status
docker manifest inspect ghcr.io/paddione/dev-shell:latest > /dev/null && echo "dev-shell image present"
```

- [ ] **5.2** Erst wenn `dev-shell image present` ausgegeben wird, darf der PR mergen. Diese
  Bedingung in den PR-Body schreiben.

### Task 6: Live-Verifikation nach Flux-Rollout

- [ ] **6.1** Rollout abwarten:

```bash
kubectl --context fleet -n workspace-dev rollout status deploy/dev-pod --timeout=10m
kubectl --context fleet -n workspace-dev get pod -l app=dev-pod -o jsonpath='{.items[0].status.containerStatuses[*].ready}'
```

  Erwartung: vier `true`.

- [ ] **6.2** SSH über den unveränderten ProxyCommand:

```bash
ssh dev-pod 'id -u; whoami; git --version; task --version; kubectl version --client; gh --version | head -1; claude --version'
ssh dev-pod/gekko 'id -u; whoami'
```

  Erwartung: `1000` / `patrick` bzw. `1000` / `gekko`, alle Werkzeuge antworten.

- [ ] **6.3** Negativprobe: Pod-IP antwortet nicht auf :22 (aus einem anderen Container des Pods):

```bash
POD_IP="$(kubectl --context fleet -n workspace-dev get pod -l app=dev-pod -o jsonpath='{.items[0].status.podIP}')"
kubectl --context fleet -n workspace-dev exec deploy/dev-pod -c mcp-node -- sh -c "nc -z -w 3 $POD_IP 22 && echo OPEN || echo CLOSED"
```

  Erwartung: `CLOSED`.

- [ ] **6.4** Host-Key-Persistenz: Fingerprint notieren, Pod löschen, nach Neustart vergleichen:

```bash
kubectl --context fleet -n workspace-dev exec deploy/dev-pod -c dev-shell -- ssh-keygen -lf /home/dev/.ssh-host/ssh_host_ed25519_key.pub
kubectl --context fleet -n workspace-dev delete pod -l app=dev-pod
kubectl --context fleet -n workspace-dev rollout status deploy/dev-pod --timeout=10m
kubectl --context fleet -n workspace-dev exec deploy/dev-pod -c dev-shell -- ssh-keygen -lf /home/dev/.ssh-host/ssh_host_ed25519_key.pub
```

  Erwartung: identischer Fingerprint.

### Task 7: Final Verification

- [ ] **7.1** Test-Inventar regenerieren und committen:

```bash
task test:inventory
```

- [ ] **7.2** Die drei Pflicht-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
