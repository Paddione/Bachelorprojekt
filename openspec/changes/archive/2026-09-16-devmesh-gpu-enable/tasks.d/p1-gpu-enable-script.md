<!-- Partial P1 — target_files: scripts/devmesh/gpu-enable.sh -->

## Partial P1: `scripts/devmesh/gpu-enable.sh`

**Ziel:** Ein idempotentes Skript aktiviert die GPU eines devmesh-Hosts: nvidia-container-toolkit
installieren, `nvidia-ctk runtime configure --runtime=containerd` ausfuehren, k3s neu starten und
k3s seine containerd-Templates neu schreiben lassen (design.md D3). Kein direkter Schreibzugriff auf
`/var/lib/rancher/k3s/agent/etc/containerd/config.toml` — die Datei wird beim Start ueberschrieben.

**Spec:** `openspec/changes/devmesh-gpu-enable/specs/local-dev-mesh.md` →
Requirement "GPU enablement on a host is scripted and repeatable" (drei Szenarien).

### File Structure (dieses Partial)

| Datei | Verantwortung | Ist | Budget |
|---|---|---|---|
| `scripts/devmesh/gpu-enable.sh` | Vorbedingungen lokal pruefen, Zielhost aus `devmesh/inventory.yaml` aufloesen, Host-Zustand sondieren, Toolkit installieren + containerd-Runtime registrieren + k3s neu starten | 0 (neu) | 800 |

**S1-Budget:** `scripts/devmesh/gpu-enable.sh` ist neu, also **nicht gebaselined** — wirksame
Schwelle ist das statische `.sh`-Limit aus `docs/code-quality/gates.yaml` (`s1.limits['.sh'] = 800`).
Zielgroesse **ca. 175 Zeilen**, d.h. rund 22 % der Schwelle; die Wachstumsreserve ist bewusst gross,
weil spaetere GPU-Hosts denselben Weg nehmen sollen. Gemessen mit:

```bash
# Stand, gegen den gemessen wurde
PRE=19eebe20e
grep -A4 '^  limits:' docs/code-quality/gates.yaml | grep '\.sh:'
jq -r '."S1:scripts/devmesh/gpu-enable.sh".metric // "nicht-baselined"' docs/code-quality/baseline.json
wc -l scripts/devmesh/gpu-enable.sh   # nach der Implementierung, erwartet < 200
```

**S4-Befund — Taskfile.yml wird NICHT angefasst.** Die S4-Skript-Globs in
`docs/code-quality/gates.yaml` lauten `scripts/*.sh` und `scripts/*.mjs`, also wurzelgebunden.
`scripts/devmesh/gpu-enable.sh` liegt eine Ebene tiefer und gehoert damit gar nicht zur
S4-Pruefmenge — genau wie die zwoelf bestehenden `scripts/devmesh/*.sh`, von denen keines eine
S4-Verletzung erzeugt. Die Nachbarskripte sind ausserdem ueber `taskfiles/Taskfile.devmesh.yml`
erreichbar, nicht ueber das Wurzel-`Taskfile.yml`; die Taskfile- und Runbook-Verdrahtung des neuen
Skripts liegt deshalb in den Partials, die diese Dateien besitzen. Messbefehl:

```bash
PRE=19eebe20e
grep -n -A6 '^s4:' docs/code-quality/gates.yaml           # script_globs: scripts/*.sh, scripts/*.mjs
node scripts/code-quality/check.mjs | tail -3             # erwartet: 0 blocking
grep -c 'scripts/devmesh/' taskfiles/Taskfile.devmesh.yml # Anker: > 0, Nachbarn sind verdrahtet
```

### Interfaces

- **Consumes:** `devmesh/inventory.yaml` (`peers[].name`, `peers[].lan_ip`) ueber `yq`, identisch zu
  `scripts/devmesh/k3s-install.sh`. Umgebungsvariablen `DEVMESH_INVENTORY`, `DEVMESH_SSH_USER`
  (Default `patrick`), `DEVMESH_SSH_KEY` (Default `~/.ssh/patrick_ed25519`), `DRY_RUN`.
- **Produces (Vertrag fuer den BATS-Guard `tests/spec/local-dev-mesh/gpu-enable.bats`, der einem
  anderen Partial gehoert):**
  - Aufruf: `bash scripts/devmesh/gpu-enable.sh [host]`, Default-Host `gpu-metal`.
  - Exit-Codes: `0` aktiviert oder unveraendert, `1` Befund (Host nicht im Inventar, Installation
    fehlgeschlagen), `2` Vorbedingung fehlt (lokales Werkzeug, Inventar, SSH/sudo, Treiber).
  - Erste Ausgabezeilen, an denen der Guard haengt (Output-Verifikation, nicht Quelltext):
    - `unveraendert: <host> hat nvidia-container-toolkit und die nvidia-Runtime in containerd`
    - `aktiviert: <host> nvidia-container-toolkit installiert, k3s neu gestartet`
    - `Vorbedingung fehlt: <werkzeug> nicht im PATH` (stderr)
    - `Vorbedingung fehlt: SSH/sudo ohne Passwort auf <user>@<ip> (Host <host>)` (stderr)
    - `host:` / `plan:` im `DRY_RUN=1`-Modus
  - Remote-Aufrufe laufen ueber `ssh`, der Installationsblock geht als ein einziges
    `sudo -n bash -s` ueber stdin — der Guard stubt `ssh` und protokolliert argv und stdin getrennt
    (Muster: `tests/spec/local-dev-mesh/k3s-install.bats`).

**Konventionen:** Shebang `#!/usr/bin/env bash`, `set -euo pipefail`, Kopfkommentar auf Deutsch in
reinem ASCII ohne Umlaute (`pruefen`, `Vorbedingung`, `unveraendert`), Ticket-Marke `[T900179]`,
Helfer `die()`/`need()` wie in `scripts/devmesh/k3s-install.sh`.

---

### Task P1.1: Rot — Guard gegen das fehlende Skript laufen lassen

**Files:**
- Test (fremdes Partial, nur ausfuehren): `tests/spec/local-dev-mesh/gpu-enable.bats`
- Create: `scripts/devmesh/gpu-enable.sh`

- [ ] **Schritt 1: Guard ausfuehren, solange das Skript fehlt**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/gpu-enable.bats
```

expected: FAIL — jeder Test bricht ab, weil `scripts/devmesh/gpu-enable.sh` nicht existiert
(`bash: scripts/devmesh/gpu-enable.sh: No such file or directory`, Status 127).

- [ ] **Schritt 2: Datei mit Kopfkommentar und Rahmen anlegen**

```bash
cat > scripts/devmesh/gpu-enable.sh << 'EOF'
#!/usr/bin/env bash
# scripts/devmesh/gpu-enable.sh — GPU eines devmesh-Hosts fuer k3s nutzbar machen [T900179]
#
# Usage: gpu-enable.sh [host]        host = Name aus devmesh/inventory.yaml, Default gpu-metal
#
# Installiert das nvidia-container-toolkit, registriert die nvidia-Runtime per
# "nvidia-ctk runtime configure --runtime=containerd" und startet k3s neu, damit k3s seine
# containerd-Templates mit der Runtime neu schreibt. /var/lib/rancher/k3s/agent/etc/containerd/
# config.toml wird bewusst NICHT direkt editiert — k3s ueberschreibt die Datei beim Start.
#
# Umgebung:
#   DRY_RUN=1          nur den geplanten Ablauf ausgeben, kein SSH
#   DEVMESH_INVENTORY  Inventar (Default: devmesh/inventory.yaml)
#   DEVMESH_SSH_USER   SSH-Benutzer (Default: patrick)
#   DEVMESH_SSH_KEY    Schluessel (Default: ~/.ssh/patrick_ed25519)
#
# Idempotent: sind Toolkit und nvidia-Runtime bereits vorhanden, endet das Skript ohne
# Aenderung und OHNE k3s-Neustart mit Exit 0.
# Exit 0 aktiviert/unveraendert, 1 Befund, 2 Vorbedingung fehlt.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
INVENTORY="${DEVMESH_INVENTORY:-$REPO_ROOT/devmesh/inventory.yaml}"
SSH_USER="${DEVMESH_SSH_USER:-patrick}"
SSH_KEY="${DEVMESH_SSH_KEY:-$HOME/.ssh/patrick_ed25519}"
DEFAULT_HOST=gpu-metal
CONTAINERD_CONF=/var/lib/rancher/k3s/agent/etc/containerd/config.toml

die()  { echo "ERROR: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || { echo "Vorbedingung fehlt: $1 nicht im PATH" >&2; exit 2; }; }
EOF
chmod +x scripts/devmesh/gpu-enable.sh
```

- [ ] **Schritt 3: Syntax und Lint**

```bash
bash -n scripts/devmesh/gpu-enable.sh
shellcheck scripts/devmesh/gpu-enable.sh
```

Erwartet: beide ohne Ausgabe, Exit 0. Fehlt `shellcheck` lokal, den Schritt ueberspringen und
in Task P1.5 nachholen.

- [ ] **Schritt 4: Commit**

```bash
git add scripts/devmesh/gpu-enable.sh
git commit -m "feat(devmesh): Rahmen fuer gpu-enable.sh [T900179]"
```

---

### Task P1.2: Lokale Vorbedingungen, Zielhost-Aufloesung und DRY_RUN

Deckt das Spec-Szenario **"A missing tool aborts before touching the host"** ab: die
Werkzeugpruefung liegt vor jedem `ssh`-Aufruf, der Guard belegt das ueber ein leeres
argv-Protokoll des ssh-Stubs.

**Files:**
- Modify: `scripts/devmesh/gpu-enable.sh`

- [ ] **Schritt 1: Argumentbehandlung, Werkzeuge, Inventar, DRY_RUN anhaengen**

```bash
cat >> scripts/devmesh/gpu-enable.sh << 'EOF'

case "${1:-}" in
  -h|--help) echo "Usage: gpu-enable.sh [host]   (Default: $DEFAULT_HOST)" >&2; exit 1 ;;
esac
[[ $# -le 1 ]] || die "hoechstens ein Argument erwartet: [host] (siehe Kopfkommentar)"
HOST="${1:-$DEFAULT_HOST}"

# Reihenfolge ist Vertrag: erst lokale Werkzeuge, dann Inventar, dann erst SSH. Ein fehlendes
# Werkzeug darf kein Kommando gegen den Host absetzen (Spec-Szenario "missing tool").
need yq
need ssh
[[ -f "$INVENTORY" ]] || { echo "Vorbedingung fehlt: Inventar $INVENTORY" >&2; exit 2; }

LAN_IP="$(HOST="$HOST" yq -r '.peers[] | select(.name == strenv(HOST)) | .lan_ip // ""' "$INVENTORY")"
[[ -n "$LAN_IP" ]] || die "Host '$HOST' nicht im Inventar oder ohne lan_ip"

if [[ "${DRY_RUN:-0}" == 1 ]]; then
  echo "host:    $HOST ($LAN_IP)"
  echo "plan:    nvidia-container-toolkit installieren, nvidia-ctk runtime configure --runtime=containerd, k3s neu starten"
  echo "hinweis: $CONTAINERD_CONF wird von k3s selbst neu geschrieben"
  exit 0
fi
EOF
```

- [ ] **Schritt 2: Verhalten von Hand nachstellen**

```bash
# fehlendes Werkzeug -> Exit 2, kein SSH
PATH=/usr/bin:/bin DEVMESH_INVENTORY=tests/spec/local-dev-mesh/fixtures/inventory.yaml \
  env -u YQ bash -c 'PATH=$(dirname $(command -v bash)) bash scripts/devmesh/gpu-enable.sh'; echo "exit=$?"
# unbekannter Host -> Exit 1
DEVMESH_INVENTORY=tests/spec/local-dev-mesh/fixtures/inventory.yaml \
  bash scripts/devmesh/gpu-enable.sh nicht-im-inventar; echo "exit=$?"
# DRY_RUN -> Exit 0 mit host:/plan:
DRY_RUN=1 DEVMESH_INVENTORY=tests/spec/local-dev-mesh/fixtures/inventory.yaml \
  bash scripts/devmesh/gpu-enable.sh; echo "exit=$?"
```

Erwartet: `exit=2` mit `Vorbedingung fehlt: ... nicht im PATH`, `exit=1` mit
`Host 'nicht-im-inventar' nicht im Inventar oder ohne lan_ip`, `exit=0` mit `host: gpu-metal (10.1.0.101)`.

- [ ] **Schritt 3: Guard erneut laufen lassen**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/gpu-enable.bats
```

Erwartet: die Tests zu fehlendem Werkzeug und DRY_RUN sind gruen, die Tests zu Erreichbarkeit,
Idempotenz und Installation weiterhin rot.

- [ ] **Schritt 4: Commit**

```bash
git add scripts/devmesh/gpu-enable.sh
git commit -m "feat(devmesh): gpu-enable.sh prueft Werkzeuge und loest den Zielhost auf [T900179]"
```

---

### Task P1.3: Erreichbarkeit und Host-Zustandssonde

Deckt das Spec-Szenario **"An unreachable host aborts the run"** ab und liefert die Sonde, auf der
der Idempotenz-Zweig in Task P1.4 aufsetzt. Die Sonde ist ein einziger Lesebefehl, sie aendert
nichts auf dem Host — ein Abbruch danach hinterlaesst also keinen halb konfigurierten Host.

**Files:**
- Modify: `scripts/devmesh/gpu-enable.sh`

- [ ] **Schritt 1: `remote()`, Erreichbarkeitspruefung und Sonde anhaengen**

```bash
cat >> scripts/devmesh/gpu-enable.sh << 'EOF'

remote() {
  ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new \
    "${SSH_USER}@${LAN_IP}" "$@"
}

remote "sudo -n true" \
  || { echo "Vorbedingung fehlt: SSH/sudo ohne Passwort auf ${SSH_USER}@${LAN_IP} (Host $HOST)" >&2; exit 2; }

# Eine Leseabfrage, drei Zeilen: Treiber, Toolkit, Runtime-Eintrag in der containerd-Konfiguration.
# Nur lesen, nichts aendern — bis hierhin ist jeder Abbruch folgenlos.
STATE="$(remote "sudo -n sh -c '
  command -v nvidia-smi >/dev/null 2>&1 && echo driver=ja || echo driver=nein
  command -v nvidia-ctk >/dev/null 2>&1 && echo toolkit=ja || echo toolkit=nein
  grep -q nvidia $CONTAINERD_CONF 2>/dev/null && echo runtime=ja || echo runtime=nein
'")"
DRIVER="$(printf '%s\n' "$STATE" | sed -n 's/^driver=//p')"
TOOLKIT="$(printf '%s\n' "$STATE" | sed -n 's/^toolkit=//p')"
RUNTIME="$(printf '%s\n' "$STATE" | sed -n 's/^runtime=//p')"

[[ "$DRIVER" == ja ]] \
  || { echo "Vorbedingung fehlt: kein NVIDIA-Treiber auf $HOST (nvidia-smi nicht im PATH)" >&2; exit 2; }
EOF
```

- [ ] **Schritt 2: Gegen einen ssh-Stub pruefen**

```bash
tmp=$(mktemp -d); mkdir -p "$tmp/bin"
cat > "$tmp/bin/ssh" << 'STUB'
#!/usr/bin/env bash
exit 255
STUB
chmod +x "$tmp/bin/ssh"
PATH="$tmp/bin:$PATH" DEVMESH_INVENTORY=tests/spec/local-dev-mesh/fixtures/inventory.yaml \
  bash scripts/devmesh/gpu-enable.sh; echo "exit=$?"
```

Erwartet: `exit=2`, Meldung enthaelt woertlich `(Host gpu-metal)` — das Szenario verlangt, dass
der Host genannt wird.

- [ ] **Schritt 3: Guard erneut laufen lassen**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/gpu-enable.bats
```

Erwartet: der Erreichbarkeitstest ist gruen, Idempotenz und Installation weiterhin rot.

- [ ] **Schritt 4: Commit**

```bash
git add scripts/devmesh/gpu-enable.sh
git commit -m "feat(devmesh): gpu-enable.sh sondiert Erreichbarkeit und Host-Zustand [T900179]"
```

---

### Task P1.4: Idempotenz-Zweig und Installationszweig mit k3s-Neustart

Deckt das Spec-Szenario **"Second run is a no-op"** ab (Exit 0, meldet vorhandenes Toolkit,
**kein** k3s-Neustart) und setzt design.md D3 um.

**Files:**
- Modify: `scripts/devmesh/gpu-enable.sh`

- [ ] **Schritt 1: Beide Zweige anhaengen**

```bash
cat >> scripts/devmesh/gpu-enable.sh << 'EOF'

if [[ "$TOOLKIT" == ja && "$RUNTIME" == ja ]]; then
  echo "unveraendert: $HOST hat nvidia-container-toolkit und die nvidia-Runtime in containerd"
  exit 0
fi

# Der ganze Aenderungsblock geht als EIN Skript ueber stdin. "set -euo pipefail" darin sorgt
# dafuer, dass ein Fehlschlag vor dem k3s-Neustart abbricht, statt den Host mit installiertem
# Toolkit und unkonfigurierter Runtime zurueckzulassen.
remote_body() {
  cat << 'REMOTE'
set -euo pipefail
export DEBIAN_FRONTEND=noninteractive
if ! command -v nvidia-ctk >/dev/null 2>&1; then
  curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey \
    | gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
  curl -fsSL https://nvidia.github.io/libnvidia-container/stable/deb/nvidia-container-toolkit.list \
    | sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#' \
    > /etc/apt/sources.list.d/nvidia-container-toolkit.list
  apt-get update
  apt-get install -y nvidia-container-toolkit
fi
command -v nvidia-ctk >/dev/null 2>&1 || { echo "nvidia-ctk fehlt nach der Installation" >&2; exit 1; }
nvidia-ctk runtime configure --runtime=containerd
# k3s schreibt config.toml aus seinem Template neu und erkennt die Runtime dabei selbst.
systemctl restart k3s
for _ in $(seq 1 36); do k3s kubectl get node "$(hostname)" >/dev/null 2>&1 && break; sleep 5; done
k3s kubectl wait --for=condition=Ready "node/$(hostname)" --timeout=180s
grep -q nvidia /var/lib/rancher/k3s/agent/etc/containerd/config.toml
REMOTE
}

rc=0
remote_body | remote "sudo -n bash -s" || rc=$?
(( rc == 0 )) || die "GPU-Aktivierung auf $HOST fehlgeschlagen (Exit $rc)"
echo "aktiviert: $HOST nvidia-container-toolkit installiert, k3s neu gestartet"
EOF
```

- [ ] **Schritt 2: Zweiten Lauf gegen einen aktivierten Host nachstellen**

```bash
tmp=$(mktemp -d); mkdir -p "$tmp/bin"
cat > "$tmp/bin/ssh" << 'STUB'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$SSH_ARGV_LOG"
cmd="${!#}"
case "$cmd" in
  "sudo -n true") exit 0 ;;
  *nvidia-smi*) printf 'driver=ja\ntoolkit=ja\nruntime=ja\n' ;;
  "sudo -n bash -s") cat > /dev/null; echo "unerwartete Aenderung" >&2; exit 99 ;;
esac
STUB
chmod +x "$tmp/bin/ssh"
export SSH_ARGV_LOG="$tmp/argv.log"; : > "$SSH_ARGV_LOG"
PATH="$tmp/bin:$PATH" DEVMESH_INVENTORY=tests/spec/local-dev-mesh/fixtures/inventory.yaml \
  bash scripts/devmesh/gpu-enable.sh; echo "exit=$?"
echo "Anker: argv-Zeilen=$(grep -c . "$SSH_ARGV_LOG") restart-Treffer=$(grep -c 'bash -s' "$SSH_ARGV_LOG")"
```

Erwartet: `exit=0`, Ausgabe beginnt mit `unveraendert: gpu-metal hat nvidia-container-toolkit`.
Der Anker muss `argv-Zeilen=2 restart-Treffer=0` melden — beide Zahlen belegen, dass der Stub
ueberhaupt lief und dass kein Aenderungsblock abgesetzt wurde.

- [ ] **Schritt 3: Guard vollstaendig gruen**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/gpu-enable.bats
```

Erwartet: PASS, alle Tests.

- [ ] **Schritt 4: Commit**

```bash
git add scripts/devmesh/gpu-enable.sh
git commit -m "feat(devmesh): gpu-enable.sh installiert Toolkit idempotent und startet k3s neu [T900179]"
```

---

### Task P1.5: Verifikation dieses Partials

**Files:**
- Verify: `scripts/devmesh/gpu-enable.sh`

- [ ] **Schritt 1: Lint und S1-Budget messen**

```bash
bash -n scripts/devmesh/gpu-enable.sh
shellcheck scripts/devmesh/gpu-enable.sh
wc -l scripts/devmesh/gpu-enable.sh
jq -r '."S1:scripts/devmesh/gpu-enable.sh".metric // "nicht-baselined"' docs/code-quality/baseline.json
```

Erwartet: `shellcheck` ohne Befund, Zeilenzahl deutlich unter 800, Baseline-Abfrage meldet
`nicht-baselined` (ein Baseline-Eintrag waere ein Fehler — die Baseline darf nicht wachsen).

- [ ] **Schritt 2: Die drei Pflicht-Kommandos**

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Erwartet: alle drei Exit 0. `task freshness:check` enthaelt den S1–S4-Ratchet; es muss
`0 blocking` melden.

- [ ] **Schritt 3: Commit der regenerierten Artefakte**

```bash
git add -A
git commit -m "chore(devmesh): Freshness-Artefakte nach gpu-enable.sh [T900179]"
```
