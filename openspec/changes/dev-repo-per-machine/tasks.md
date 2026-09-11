---
title: "dev-repo-per-machine — Implementation Plan"
ticket_id: T900119
domains: [infra, testing, security]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# dev-repo-per-machine — Implementation Plan

_Ticket: T900119 · Programm T900115 (ADR-008, Nachtrag 2026-09-11) · unabhängig von SP-1..SP-3_

Ziel: Jede Dev-Maschine (PK-Desktop, PK-L-1, PK-Tablet, je WSL) wird mit einem Skriptlauf
arbeitsfähig und ist ohne Änderung prüfbar. Der git-crypt-Key hat Transport, Ablage und Register.
`work-vm-shared-dev` wird zurückgebaut.

## File Structure

```
NEW:
  scripts/devmesh/onboard-machine.sh
  tests/spec/dev-machine-onboarding/install-dev-tools-user.bats
  tests/spec/dev-machine-onboarding/onboard-machine.bats
  tests/spec/dev-machine-onboarding/key-register.bats
  devmesh/key-holders.yaml
  docs/runbooks/git-crypt-key-distribution.md
CHANGED:
  scripts/install-dev-tools.sh
  prod/cloud-init.yaml
  docs/code-quality/gates.yaml
  docs/runbooks/ssh-zugang-fleet.md
  environments/.secrets/.ssh/config          (git-crypt, nur Kommentare)
  wireguard/wg-mesh-nodes.yaml               (nur Kommentar)
  components/website/src/data/test-inventory.json   (generiert)
DELETED:
  scripts/provision-dev-vm.sh
  prod/cloud-init-dev-vm.yaml
  scripts/setup-shared-dev-repo.sh
  tests/spec/work-vm-shared-dev/work-vm-guards.bats
```

## Kontext und Messungen (Stand `adb9d25b5ad7d129aed1024e58f7a27ef4acf3bf`, 2026-09-11)

```bash
# WSL-Netzwerkmodus: wslinfo meldet den LAUFENDEN Modus (Quelle der Pruefung im Skript).
# .wslconfig kann geaendert, aber noch nicht per `wsl --shutdown` aktiv sein, und der
# Windows-Benutzerpfad variiert (/mnt/c/Users/PatrickKorczewski/.wslconfig) -> verworfen.
wslinfo --networking-mode          # mirrored   (wslinfo --version: 2.7.11.0)

# PK-Desktop klont per HTTPS, SSH zu GitHub scheitert (Host key verification failed).
git -C /home/patrick/Bachelorprojekt remote get-url origin   # https://github.com/Paddione/Bachelorprojekt.git
git ls-remote https://github.com/Paddione/Bachelorprojekt.git HEAD   # rc=0
# -> Skript prueft Repo-Lesezugriff mit `git ls-remote` gegen die tatsaechliche URL,
#    Default-URL fuer neue Clones ist HTTPS (Abweichung von "ssh-Zugang" im Proposal, bewusst).

# Kanonische Keydatei existiert auf PK-Desktop noch nicht.
ls ~/.config/git-crypt/            # No such file or directory
ls -la /home/patrick/Bachelorprojekt/.git/git-crypt/keys/default   # -rw------- 148 Bytes

# Loeschkriterium aus dem Proposal:
git grep -l -e provision-dev-vm -e cloud-init-dev-vm -- . ':!openspec/changes/archive' ':!docs/superpowers/plans'
# docs/code-quality/gates.yaml             (S3-Allowlist + S4-Allowlist + Kommentar)
# docs/code-quality/repo-index.json        (generiert, quality:index)
# docs/runbooks/ssh-zugang-fleet.md        (Zeile 30)
# environments/.secrets/.ssh/config        (Kommentare Zeilen 125, 140)
# openspec/changes/dev-repo-per-machine/design.md, proposal.md
# openspec/specs/work-vm-shared-dev.md     (verschwindet beim Archivieren, REMOVED)
# prod/cloud-init-dev-vm.yaml, scripts/provision-dev-vm.sh   (zu loeschen)
# tests/spec/work-vm-shared-dev/work-vm-guards.bats          (zu loeschender Guard)
# wireguard/wg-mesh-nodes.yaml             (Kommentar Zeile 113)
# -> Kriterium heute NICHT erfuellt: vier Nicht-Guard-Dateien verweisen noch. Task 5 bereinigt
#    sie zuerst und macht die Loeschung vom erneuten Lauf abhaengig.

# Folgewaise: setup-shared-dev-repo.sh wird nur von den zu loeschenden Dateien referenziert.
git grep -l setup-shared-dev-repo -- . ':!openspec/changes/archive' ':!docs/superpowers/plans'
# docs/code-quality/repo-index.json, prod/cloud-init-dev-vm.yaml, scripts/provision-dev-vm.sh,
# scripts/setup-shared-dev-repo.sh, tests/spec/work-vm-shared-dev/work-vm-guards.bats
# -> nach der Loeschung waere es ein S4-Orphan, also wird es mitgeloescht.

# Weitere Aufrufer von install-dev-tools.sh
git grep -n install-dev-tools -- prod scripts
# prod/cloud-init.yaml:170 (gekko-hetzner-2-Pfad, laeuft als root ohne SUDO_USER)
# prod/cloud-init-dev-vm.yaml:129 (entfaellt)
```

Entscheidungen aus der Prior-Art-Prüfung:

1. `scripts/setup-dev-env.sh` richtet Commit-Signatur ein und erzeugt dafür einen Test-Commit mit
   `reset --hard`. Das verletzt „wiederholter Lauf ändert nichts". Das Onboarding ruft es nicht
   auf, das Runbook nennt es als Folgeschritt. Die Identität setzt das Onboarding selbst (zwei
   `git config`-Aufrufe).
2. Hooks und `merge.ours`-Treiber installiert der bestehende Task `task secrets:install-hooks`.
   Das Onboarding ruft ihn auf und prüft danach mit `scripts/check-hooks-path.sh` und
   `git config --get merge.ours.driver`.
3. Der gekko-hetzner-2-k3d-Pfad in `install-dev-tools.sh` bleibt (Default `TARGET_HOST`, k3d/Go).
   Den k3d-Abbau verantwortet SP-5 (`devmesh-k3d-decommission`). `prod/cloud-init.yaml` behält
   sein Verhalten durch `DEV_USER=gekko`.
4. Die Key-Entsperrung prüft das Ergebnis mit `scripts/git-crypt-guard.sh is-encrypted` (D4). Die
   Keydatei-Mechanik von `scripts/worktree-create.sh` (kopiert `keys/default` in Worktree-Gitdirs)
   bleibt unverändert und wird im Runbook beim Widerruf berücksichtigt.
5. `--with-devmesh` ruft `task devmesh:kubeconfig` aus SP-2 (T900117). Fehlt der Task, meldet das
   Skript die Prüfung `devmesh-context` als fehlgeschlagen. Ohne Flag entsteht keine Abhängigkeit.

### S1-Budget (`yq '.s1.limits' docs/code-quality/gates.yaml`: `.sh` 800)

| Datei | Ist | Budget |
|---|---|---|
| `scripts/install-dev-tools.sh` | 196 | 604 |

- `scripts/install-dev-tools.sh`: `jq -r '."S1:scripts/install-dev-tools.sh".metric // "nicht-baselined"' docs/code-quality/baseline.json` → `nicht-baselined`, wirksame Schwelle 800. Nach der Änderung etwa 202 Zeilen.
- `scripts/devmesh/onboard-machine.sh`: neu, etwa 206 Zeilen, Schwelle 800. `script_globs` von S4 erfasst nur `scripts/*.sh`, erreichbar ist es trotzdem über das Runbook.
- `.bats`, `.yaml`, `.md` haben kein S1-Limit (Endung nicht in `s1.limits`).

---

### Task 1: `install-dev-tools.sh` zielt auf den aufrufenden Benutzer (≈45 min)

**Files:** `tests/spec/dev-machine-onboarding/install-dev-tools-user.bats` (neu), `scripts/install-dev-tools.sh`, `prod/cloud-init.yaml`

- [ ] **Step 1 — RED.** `tests/spec/dev-machine-onboarding/install-dev-tools-user.bats` anlegen:

```bash
#!/usr/bin/env bats
# tests/spec/dev-machine-onboarding/install-dev-tools-user.bats [T900119]
# SSOT: openspec/changes/dev-repo-per-machine/specs/dev-machine-onboarding.md
# Pruefmodus: Laufzeit-Output von `install-dev-tools.sh --print-dev-user` (kein root,
# keine Installation); geprueft wird der aufgeloeste Ziel-Benutzer und der Exit-Code.

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/install-dev-tools.sh"
}

@test "install-dev-tools: unter sudo ist der aufrufende Benutzer das Ziel" {
  run env -u DEV_USER -u DEV_USERS SUDO_USER=alice bash "$SCRIPT" --print-dev-user
  [ "$status" -eq 0 ]
  [ "$output" = "alice" ]
}

@test "install-dev-tools: ohne sudo ist der ausfuehrende Benutzer das Ziel" {
  run env -u DEV_USER -u DEV_USERS -u SUDO_USER bash "$SCRIPT" --print-dev-user
  [ "$status" -eq 0 ]
  [ "$output" = "$(id -un)" ]
}

@test "install-dev-tools: DEV_USER ueberschreibt den aufrufenden Benutzer (cloud-init-Pfad)" {
  run env -u DEV_USERS SUDO_USER=alice DEV_USER=gekko bash "$SCRIPT" --print-dev-user
  [ "$status" -eq 0 ]
  [ "$output" = "gekko" ]
}

@test "install-dev-tools: der DEV_USERS-Mehrbenutzerpfad endet mit Exit 2" {
  # Positiv-Anker: der Einbenutzer-Aufruf loest auf
  run env -u DEV_USER -u DEV_USERS SUDO_USER=alice bash "$SCRIPT" --print-dev-user
  [ "$status" -eq 0 ]
  [ "$output" = "alice" ]
  run env -u DEV_USER DEV_USERS="patrick gekko" bash "$SCRIPT" --print-dev-user
  [ "$status" -eq 2 ]
}
```

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-machine-onboarding/install-dev-tools-user.bats
# expected: FAIL (4/4 not ok — das heutige Skript ignoriert --print-dev-user, der Hostname-Guard
# endet mit Exit 0 und "skipping"; in der Planungs-Probe gemessen)
```

- [ ] **Step 2 — GREEN.** `scripts/install-dev-tools.sh` ändern (Budget 604, netto etwa +6 Zeilen):

  a) Kopfkommentar Zeilen 2–23 ersetzen durch:

```bash
# install-dev-tools.sh — Provision a dev toolchain for the invoking user.
#
# Two target profiles:
#   * gekko-hetzner-2 (default TARGET_HOST): k3d-friendly toolchain (k3d + Go
#     included); prod/cloud-init.yaml ruft es als root mit DEV_USER=gekko.
#   * WSL-Dev-Maschine (FORCE=1 SKIP_K3D_GO=1, aufgerufen von
#     scripts/devmesh/onboard-machine.sh): Docker + kubectl + task + node/pnpm +
#     gh + git-crypt, ohne k3d/Go (T900119).
#
# Idempotent: safe to re-run; only installs what is missing.
# Hostname-guarded: no-op on every node except TARGET_HOST unless FORCE=1.
#
# Run as root via sudo — docker group and pnpm go to SUDO_USER:
#     sudo bash scripts/install-dev-tools.sh
#     bash scripts/install-dev-tools.sh --print-dev-user   # nur Ziel-Benutzer ausgeben
#
# Tools installed: build-essential, Docker CE, k3d (nur SKIP_K3D_GO=0),
# kubectl, task, Go (nur SKIP_K3D_GO=0), gh (gepinntes Release-Binary),
# git-crypt (apt), pnpm (via corepack fuer DEV_USER), Node.js 22 (NodeSource,
# falls aelter oder fehlend). openspec-Tooling laeuft ueber den Repo-Wrapper
# scripts/openspec.sh — es wird KEIN separates openspec-Binary installiert.
```

  b) Variablen (alt):

```bash
DEV_USER="${DEV_USER:-gekko}"            # legacy single-user override
DEV_USERS="${DEV_USERS:-$DEV_USER}"      # space-separated list (default: legacy DEV_USER)
SKIP_K3D_GO="${SKIP_K3D_GO:-0}"          # 1 = k3d/Go ueberspringen (work VM)
```

  neu:

```bash
# Ziel fuer docker-Gruppe und pnpm: der aufrufende Benutzer (unter sudo SUDO_USER,
# sonst der ausfuehrende Benutzer). DEV_USER ueberschreibt; prod/cloud-init.yaml
# laeuft als root ohne SUDO_USER und setzt DEV_USER=gekko.
DEV_USER="${DEV_USER:-${SUDO_USER:-$(id -un)}}"
SKIP_K3D_GO="${SKIP_K3D_GO:-0}"          # 1 = k3d/Go ueberspringen (WSL-Dev-Maschine)
```

  c) Direkt nach der Zeile `log() { printf '[install-dev-tools] %s\n' "$*"; }` einfügen (vor dem Hostname-Guard):

```bash

if [[ -n "${DEV_USERS:-}" ]]; then
  log "DEV_USERS wird nicht mehr unterstuetzt (T900119): ein Clone pro Maschine, Ziel ist der aufrufende Benutzer"
  exit 2
fi

if [[ "${1:-}" == "--print-dev-user" ]]; then
  printf '%s\n' "$DEV_USER"
  exit 0
fi
```

  d) Benutzerprüfung (alt):

```bash
for u in $DEV_USERS; do
  if ! id "$u" >/dev/null 2>&1; then
    log "user '$u' does not exist — aborting"
    exit 1
  fi
done

log "host=$HOST dev_users=$DEV_USERS go=$GO_VERSION k3d=$K3D_VERSION skip_k3d_go=$SKIP_K3D_GO"
```

  neu:

```bash
if ! id "$DEV_USER" >/dev/null 2>&1; then
  log "user '$DEV_USER' does not exist — aborting"
  exit 1
fi

log "host=$HOST dev_user=$DEV_USER go=$GO_VERSION k3d=$K3D_VERSION skip_k3d_go=$SKIP_K3D_GO"
```

  e) docker-Gruppe (alt):

```bash
for u in $DEV_USERS; do
  if ! id -nG "$u" | grep -qw docker; then
    usermod -aG docker "$u"
    log "  added $u to docker group (re-login required to take effect)"
  fi
done
```

  neu:

```bash
if ! id -nG "$DEV_USER" | grep -qw docker; then
  usermod -aG docker "$DEV_USER"
  log "  added $DEV_USER to docker group (re-login required to take effect)"
fi
```

  f) corepack (alt):

```bash
  for u in $DEV_USERS; do
    su - "$u" -c 'corepack prepare pnpm@latest --activate' || true
  done
```

  neu:

```bash
  su - "$DEV_USER" -c 'corepack prepare pnpm@latest --activate' || true
```

  g) Restliche Wortlaute: `# The gekko nodes are Ubuntu; the dev VM is Debian — both must resolve.` →
  `# The gekko nodes and most WSL distros are Ubuntu; Debian distros must resolve too.`;
  beide `(work VM)` → `(WSL-Dev-Maschine)`; Schlusszeile
  `log "done — users ($DEV_USERS) must log out and back in for the docker group to apply"` →
  `log "done — user $DEV_USER must log out and back in for the docker group to apply"`.

  Kontrolle: `grep -n 'DEV_USERS' scripts/install-dev-tools.sh` zeigt nur noch die zwei Zeilen des Exit-2-Blocks.

- [ ] **Step 3.** `prod/cloud-init.yaml` Zeile 170 `  - /usr/local/sbin/install-dev-tools.sh || true` →
  `  - DEV_USER=gekko /usr/local/sbin/install-dev-tools.sh || true` (hält den gekko-hetzner-2-Pfad
  bei gekko, obwohl der neue Default `root` wäre).

- [ ] **Step 4 — Verify.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-machine-onboarding/install-dev-tools-user.bats   # 4/4 ok
bash -n scripts/install-dev-tools.sh
yq '.runcmd' prod/cloud-init.yaml >/dev/null      # YAML parst weiter
```

- [ ] **Step 5.** Commit `feat(infra): install-dev-tools zielt auf den aufrufenden Benutzer [T900119]`.

---

### Task 2: `onboard-machine.sh` — Vorbedingungen und Keydatei (≈60 min)

**Files:** `tests/spec/dev-machine-onboarding/onboard-machine.bats` (neu), `scripts/devmesh/onboard-machine.sh` (neu)

- [ ] **Step 1 — RED.** `tests/spec/dev-machine-onboarding/onboard-machine.bats` anlegen:

```bash
#!/usr/bin/env bats
# tests/spec/dev-machine-onboarding/onboard-machine.bats [T900119]
# SSOT: openspec/changes/dev-repo-per-machine/specs/dev-machine-onboarding.md
# Pruefmodus: Laufzeit. Das Skript laeuft gegen ein lokales Origin-Repo mit gestubbten
# wslinfo, gh, git-crypt, sudo, task, node, pnpm und kubectl; geprueft werden Exit-Code,
# Dateimodus und Modification-Times, nicht der Quelltext.

stub() { printf '#!/usr/bin/env bash\n%s\n' "$2" > "$STUBS/$1"; chmod +x "$STUBS/$1"; }
snapshot() { find "$CLONE" "$HOME/.config/git-crypt" -printf '%p %T@\n' | sort; }

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  SCRIPT="${REPO_ROOT}/scripts/devmesh/onboard-machine.sh"
  export HOME="${BATS_TEST_TMPDIR}/home"
  export GIT_CONFIG_NOSYSTEM=1
  mkdir -p "$HOME/.config/git-crypt"
  KEY="$HOME/.config/git-crypt/bachelorprojekt.key"
  CLONE="$HOME/Bachelorprojekt"
  printf 'k' > "$KEY"
  chmod 600 "$KEY"

  ORIGIN="${BATS_TEST_TMPDIR}/origin"
  mkdir -p "$ORIGIN/scripts" "$ORIGIN/environments/.secrets" "$ORIGIN/.githooks"
  cp "$REPO_ROOT/scripts/git-crypt-guard.sh" "$REPO_ROOT/scripts/check-hooks-path.sh" "$ORIGIN/scripts/"
  printf '#!/bin/sh\nexit 0\n' > "$ORIGIN/.githooks/pre-commit"
  printf '\000GITCRYPT\000ciphertext' > "$ORIGIN/environments/.secrets/dev.yaml"
  git -C "$ORIGIN" init -q -b main
  git -C "$ORIGIN" add -A
  git -C "$ORIGIN" -c user.name=t -c user.email=t@example.invalid commit -q -m init

  STUBS="${BATS_TEST_TMPDIR}/stubs"
  mkdir -p "$STUBS"
  stub wslinfo 'echo mirrored'
  stub gh 'exit 0'
  stub git-crypt 'exit 0'
  stub sudo 'echo "sudo $*" >> "$HOME/sudo.log"; exit 0'
  stub task 'if [ "$1" = "-d" ]; then cd "$2" || exit 1; shift 2; fi
case "$1" in secrets:install-hooks) git config core.hooksPath .githooks && git config merge.ours.driver true ;; esac'
  for t in node pnpm kubectl; do stub "$t" 'exit 0'; done
  export PATH="$STUBS:$PATH"
}

@test "onboard: fehlende Keydatei endet mit Exit 2 und nennt die Datei" {
  run bash "$SCRIPT" --repo-url "$ORIGIN" --key-file "$HOME/fehlt.key"
  [ "$status" -eq 2 ]
  printf '%s\n' "$output" | grep -qF -e "$HOME/fehlt.key"
}

@test "onboard: Keydatei mit Modus 644 wird auf 600 gesetzt und die Korrektur gemeldet" {
  chmod 644 "$KEY"
  run bash "$SCRIPT" --repo-url "$ORIGIN" --name t --email t@example.invalid
  [ "$(stat -c '%a' "$KEY")" = "600" ]
  printf '%s\n' "$output" | grep -F -e 'key-mode' | grep -qF -e '644'
}

@test "onboard: Keydatei eines fremden Benutzers endet mit Exit 1 ohne Aenderung" {
  chmod 644 "$KEY"
  stub id "[ \"\$1\" = \"-u\" ] && { echo 4242; exit 0; }
exec $(command -v id) \"\$@\""
  run bash "$SCRIPT" --repo-url "$ORIGIN"
  [ "$status" -eq 1 ]
  printf '%s\n' "$output" | grep -qF -e 'key-owner'
  [ "$(stat -c '%a' "$KEY")" = "644" ]
}
```

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-machine-onboarding/onboard-machine.bats
# expected: FAIL (3/3 not ok — scripts/devmesh/onboard-machine.sh existiert nicht, bash endet mit 127)
```

- [ ] **Step 2 — GREEN.** `scripts/devmesh/onboard-machine.sh` anlegen (`chmod +x`):

```bash
#!/usr/bin/env bash
# scripts/devmesh/onboard-machine.sh — Dev-Maschine (WSL) arbeitsfaehig machen und pruefen [T900119]
#
# Laeuft in der WSL-Distro als normaler Benutzer; sudo nur fuer install-dev-tools.sh.
# Ablauf, Key-Transport und Register: docs/runbooks/git-crypt-key-distribution.md
#
# Usage:
#   onboard-machine.sh [--verify] [--dir DIR] [--repo-url URL] [--key-file PATH]
#                      [--name NAME] [--email EMAIL] [--with-devmesh]
#
#   --verify        nur pruefen, nichts aendern
#   --dir           Clone-Verzeichnis             (Default: $HOME/Bachelorprojekt)
#   --repo-url      Quelle fuer einen neuen Clone (Default: HTTPS-URL von GitHub)
#   --key-file      symmetrischer git-crypt-Key   (Default: $HOME/.config/git-crypt/bachelorprojekt.key)
#   --name/--email  git-Identitaet des Clones
#   --with-devmesh  zusaetzlich Kubeconfig-Context devmesh holen bzw. pruefen
#
# Exit: 0 arbeitsfaehig, 1 mindestens eine Pruefung fehlgeschlagen (Name im Output),
#       2 Vorbedingung fehlt (keine WSL, kein git, Keydatei fehlt/unlesbar, Repo unerreichbar)
set -euo pipefail

MODE=setup
DIR="$HOME/Bachelorprojekt"
REPO_URL="https://github.com/Paddione/Bachelorprojekt.git"
KEY_FILE="$HOME/.config/git-crypt/bachelorprojekt.key"
GIT_NAME=""
GIT_EMAIL=""
WITH_DEVMESH=0
FAILED=()

say()  { printf '[onboard] %s\n' "$*"; }
ok()   { printf '[onboard] OK    %s\n' "$*"; }
fail() { printf '[onboard] FAIL  %s: %s\n' "$1" "$2" >&2; FAILED+=("$1"); }
die()  { printf '[onboard] PRECONDITION: %s\n' "$*" >&2; exit 2; }
need() { [ "$2" -ge 2 ] || die "$1 braucht einen Wert"; }

while [ $# -gt 0 ]; do
  case "$1" in
    --verify)       MODE=verify ;;
    --dir)          need "$1" $#; DIR="$2"; shift ;;
    --repo-url)     need "$1" $#; REPO_URL="$2"; shift ;;
    --key-file)     need "$1" $#; KEY_FILE="$2"; shift ;;
    --name)         need "$1" $#; GIT_NAME="$2"; shift ;;
    --email)        need "$1" $#; GIT_EMAIL="$2"; shift ;;
    --with-devmesh) WITH_DEVMESH=1 ;;
    -h|--help)      sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *)              die "unbekannte Option: $1" ;;
  esac
  shift
done

# Exit 2: ohne diese Punkte ist keine Pruefung aussagekraeftig.
preflight() {
  local url="$REPO_URL"
  command -v wslinfo >/dev/null 2>&1 || die "keine WSL-Distro (wslinfo fehlt)"
  command -v git >/dev/null 2>&1 || die "git fehlt"
  [ -e "$KEY_FILE" ] || die "Keydatei fehlt: $KEY_FILE"
  if [ -d "$DIR/.git" ]; then url="$(git -C "$DIR" remote get-url origin)"; fi
  git ls-remote "$url" HEAD >/dev/null 2>&1 || die "Repo nicht erreichbar: $url"
}

# D6: fremder Eigentuemer bricht ab, bevor irgendetwas geaendert wird.
check_key_file() {
  local owner mode
  owner="$(stat -c '%u' "$KEY_FILE")"
  if [ "$owner" != "$(id -u)" ]; then
    printf '[onboard] FAIL  key-owner: %s gehoert uid %s, nicht %s (Datei unveraendert)\n' \
      "$KEY_FILE" "$owner" "$(id -u)" >&2
    exit 1
  fi
  [ -r "$KEY_FILE" ] || die "Keydatei nicht lesbar: $KEY_FILE"
  mode="$(stat -c '%a' "$KEY_FILE")"
  if [ "$mode" = "600" ]; then ok "key-mode 600"; return 0; fi
  if [ "$MODE" = verify ]; then fail key-mode "Modus $mode statt 600"; return 0; fi
  chmod 600 "$KEY_FILE"
  say "key-mode korrigiert: $mode -> 600 ($KEY_FILE)"
}

# wslinfo meldet den laufenden Modus; .wslconfig kann geaendert, aber noch nicht aktiv sein.
check_wsl_networking() {
  local m
  m="$(wslinfo --networking-mode 2>/dev/null | tr -d '[:space:]' || true)"
  if [ "$m" = "mirrored" ]; then
    ok "wsl-networking mirrored"
  else
    fail wsl-networking "Modus '${m:-unbekannt}', erwartet mirrored (.wslconfig, danach wsl --shutdown)"
  fi
}

finish() {
  if [ "${#FAILED[@]}" -gt 0 ]; then
    printf '[onboard] %s Pruefung(en) fehlgeschlagen: %s\n' "${#FAILED[@]}" "${FAILED[*]}" >&2
    exit 1
  fi
  say "Maschine arbeitsfaehig ($MODE)"
  exit 0
}

# --- main ---
preflight
check_key_file
check_wsl_networking
finish
```

- [ ] **Step 3 — Verify.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-machine-onboarding/onboard-machine.bats   # 3/3 ok
bash -n scripts/devmesh/onboard-machine.sh
```

- [ ] **Step 4.** Commit `feat(infra): onboard-machine.sh mit Vorbedingungen und Keydatei-Rechten [T900119]`.

---

### Task 3: `onboard-machine.sh` — Clone, Toolchain, Hooks, Identität, gh, Entschlüsselung (≈75 min)

**Files:** `tests/spec/dev-machine-onboarding/onboard-machine.bats`, `scripts/devmesh/onboard-machine.sh`

- [ ] **Step 1 — RED.** An `tests/spec/dev-machine-onboarding/onboard-machine.bats` anhängen. Die
  Anker `[ -d "$CLONE/.git" ]` sorgen dafür, dass die Tests gegen den Stand aus Task 2 rot sind
  (ohne sie wären die mtime-Vergleiche leer und vakuös grün):

```bash

@test "onboard: unlock ohne Wirkung endet mit Exit 1 und nennt nur die Pruefung decryption" {
  run bash "$SCRIPT" --repo-url "$ORIGIN" --name t --email t@example.invalid
  [ "$status" -eq 1 ]
  [ -d "$CLONE/.git" ]
  fails="$(printf '%s\n' "$output" | grep -F -e 'FAIL ' || true)"
  [ "$(printf '%s\n' "$fails" | grep -c .)" -eq 1 ]
  printf '%s\n' "$fails" | grep -qF -e 'decryption'
}

@test "onboard: --verify auf onboardeter Maschine endet mit 0 und aendert keine mtime" {
  stub git-crypt 'printf "plain: true\n" > environments/.secrets/dev.yaml'
  run bash "$SCRIPT" --repo-url "$ORIGIN" --name t --email t@example.invalid
  [ "$status" -eq 0 ]
  [ -d "$CLONE/.git" ]
  before="$(snapshot)"
  sleep 1
  run bash "$SCRIPT" --verify --repo-url "$ORIGIN" --name t --email t@example.invalid
  [ "$status" -eq 0 ]
  [ "$(snapshot)" = "$before" ]
}

@test "onboard: wiederholter Lauf auf onboardeter Maschine aendert nichts" {
  stub git-crypt 'printf "plain: true\n" > environments/.secrets/dev.yaml'
  run bash "$SCRIPT" --repo-url "$ORIGIN" --name t --email t@example.invalid
  [ "$status" -eq 0 ]
  [ -d "$CLONE/.git" ]
  before="$(snapshot)"
  sleep 1
  run bash "$SCRIPT" --repo-url "$ORIGIN" --name t --email t@example.invalid
  [ "$status" -eq 0 ]
  [ "$(snapshot)" = "$before" ]
  [ ! -e "$HOME/sudo.log" ]
}
```

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-machine-onboarding/onboard-machine.bats
# expected: FAIL (Tests 4-6 not ok, Tests 1-3 ok — in der Planungs-Probe gegen den Task-2-Stand gemessen)
```

- [ ] **Step 2 — GREEN.** In `scripts/devmesh/onboard-machine.sh` den Schlussblock

```bash
# --- main ---
preflight
check_key_file
check_wsl_networking
finish
```

  ersetzen durch:

```bash
# --- machine checks ---
TOOLS=(git-crypt gh task node pnpm kubectl)

missing_tools() {
  local t
  for t in "${TOOLS[@]}"; do command -v "$t" >/dev/null 2>&1 || printf '%s ' "$t"; done
}

step_clone() {
  if [ -d "$DIR/.git" ]; then ok "clone $DIR"; return 0; fi
  if [ "$MODE" = verify ]; then fail clone "kein Clone unter $DIR"; return 1; fi
  if ! git clone -q "$REPO_URL" "$DIR"; then fail clone "git clone $REPO_URL fehlgeschlagen"; return 1; fi
  ok "clone $DIR (neu)"
}

step_toolchain() {
  local missing
  missing="$(missing_tools)"
  if [ -z "$missing" ]; then ok "toolchain"; return 0; fi
  if [ "$MODE" = verify ]; then fail toolchain "fehlt: $missing"; return 0; fi
  say "toolchain fehlt ($missing), install-dev-tools.sh fuer $(id -un)"
  if ! sudo env FORCE=1 SKIP_K3D_GO=1 bash "$DIR/scripts/install-dev-tools.sh"; then
    fail toolchain "install-dev-tools.sh fehlgeschlagen"; return 0
  fi
  missing="$(missing_tools)"
  if [ -z "$missing" ]; then ok "toolchain (installiert)"; else fail toolchain "nach Installation fehlt: $missing (neu anmelden?)"; fi
}

hooks_ok() {
  (cd "$DIR" && bash scripts/check-hooks-path.sh >/dev/null 2>&1) \
    && [ "$(git -C "$DIR" config --get merge.ours.driver 2>/dev/null || true)" = "true" ]
}

step_hooks() {
  if hooks_ok; then ok "hooks + merge.ours"; return 0; fi
  if [ "$MODE" = verify ]; then fail hooks "core.hooksPath oder merge.ours.driver fehlt"; return 0; fi
  task -d "$DIR" secrets:install-hooks >/dev/null || true
  if hooks_ok; then ok "hooks + merge.ours (installiert)"; else fail hooks "task secrets:install-hooks hat nicht gewirkt"; fi
}

step_identity() {
  local name email
  name="$(git -C "$DIR" config --get user.name 2>/dev/null || true)"
  email="$(git -C "$DIR" config --get user.email 2>/dev/null || true)"
  if [ "$MODE" = setup ] && [ -n "$GIT_NAME" ] && [ "$GIT_NAME" != "$name" ]; then
    git -C "$DIR" config --local user.name "$GIT_NAME"; name="$GIT_NAME"
  fi
  if [ "$MODE" = setup ] && [ -n "$GIT_EMAIL" ] && [ "$GIT_EMAIL" != "$email" ]; then
    git -C "$DIR" config --local user.email "$GIT_EMAIL"; email="$GIT_EMAIL"
  fi
  if [ -z "$name" ] || [ -z "$email" ]; then fail git-identity "user.name/user.email leer, --name und --email angeben"; return 0; fi
  if [ -n "$GIT_NAME" ] && [ "$GIT_NAME" != "$name" ]; then fail git-identity "user.name ist '$name', erwartet '$GIT_NAME'"; return 0; fi
  if [ -n "$GIT_EMAIL" ] && [ "$GIT_EMAIL" != "$email" ]; then fail git-identity "user.email ist '$email', erwartet '$GIT_EMAIL'"; return 0; fi
  ok "git-identity $name <$email>"
}

step_gh() {
  if gh auth status >/dev/null 2>&1; then ok "gh-auth"; else fail gh-auth "keine gh-Anmeldung (gh auth login)"; fi
}

# D4: Ergebnis pruefen statt dem Exit-Code von git-crypt unlock zu vertrauen.
secret_probe() {
  local f
  while IFS= read -r f; do
    if bash "$DIR/scripts/git-crypt-guard.sh" is-managed "$f"; then printf '%s\n' "$f"; return 0; fi
  done < <(git -C "$DIR" ls-files -- 'environments/.secrets/')
  return 1
}

step_decrypt() {
  local probe
  if ! probe="$(secret_probe)" || [ ! -f "$DIR/$probe" ]; then
    fail decryption "keine getrackte Datei unter environments/.secrets/"; return 0
  fi
  if ! bash "$DIR/scripts/git-crypt-guard.sh" is-encrypted "$DIR/$probe"; then ok "decryption ($probe)"; return 0; fi
  if [ "$MODE" = verify ]; then fail decryption "$probe ist verschluesselt"; return 0; fi
  if ! (cd "$DIR" && git-crypt unlock "$KEY_FILE"); then fail decryption "git-crypt unlock fehlgeschlagen"; return 0; fi
  if bash "$DIR/scripts/git-crypt-guard.sh" is-encrypted "$DIR/$probe"; then
    fail decryption "unlock endete ohne Fehler, $probe bleibt verschluesselt (falscher Key?)"
  else
    ok "decryption ($probe, entsperrt)"
  fi
}

step_devmesh() {
  [ "$WITH_DEVMESH" = 1 ] || return 0
  if kubectl config get-contexts devmesh >/dev/null 2>&1; then ok "devmesh-context"; return 0; fi
  if [ "$MODE" = verify ]; then fail devmesh-context "Kubeconfig-Context devmesh fehlt"; return 0; fi
  if task -d "$DIR" devmesh:kubeconfig && kubectl config get-contexts devmesh >/dev/null 2>&1; then
    ok "devmesh-context (geholt)"
  else
    fail devmesh-context "task devmesh:kubeconfig fehlgeschlagen oder noch nicht vorhanden (SP-2, T900117)"
  fi
}

# --- main ---
preflight
check_key_file
check_wsl_networking
if step_clone; then
  step_toolchain
  step_hooks
  step_identity
  step_gh
  step_decrypt
  step_devmesh
fi
finish
```

  Hinweis zu `step_clone`: Es läuft als `if`-Bedingung, dort greift `set -e` nicht. Deshalb prüft
  es jeden Fehler explizit. Der `--verify`-Pfad nutzt nur lesende git-Befehle
  (`config --get`, `ls-files`, `remote get-url`, `ls-remote`), keinen `git status`, weil der den
  Index schreibt.

- [ ] **Step 3 — Verify.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-machine-onboarding/onboard-machine.bats   # 6/6 ok
bash -n scripts/devmesh/onboard-machine.sh
wc -l scripts/devmesh/onboard-machine.sh                                                   # etwa 206, Schwelle 800
```

- [ ] **Step 4.** Commit `feat(infra): onboard-machine.sh prueft und richtet Clone, Toolchain, Hooks und git-crypt ein [T900119]`.

---

### Task 4: Key-Register und Runbook zur Key-Verteilung (≈45 min)

**Files:** `tests/spec/dev-machine-onboarding/key-register.bats` (neu), `devmesh/key-holders.yaml` (neu), `docs/runbooks/git-crypt-key-distribution.md` (neu)

- [ ] **Step 1 — RED.** `tests/spec/dev-machine-onboarding/key-register.bats` anlegen:

```bash
#!/usr/bin/env bats
# tests/spec/dev-machine-onboarding/key-register.bats [T900119]
# SSOT: openspec/changes/dev-repo-per-machine/specs/dev-machine-onboarding.md
# Pruefmodus: Register per yq geparst (Ergebnis). Runbook per Abschnitts-grep, weil sich
# diese Zusicherung ausschliesslich im Dokumenttext manifestiert.

section() { awk -v h="$1" '$0 ~ "^## " h {f=1; next} f && /^## /{exit} f' "$RUNBOOK"; }

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  REGISTER="${REPO_ROOT}/devmesh/key-holders.yaml"
  RUNBOOK="${REPO_ROOT}/docs/runbooks/git-crypt-key-distribution.md"
}

@test "key-holders: jeder Eintrag hat nicht-leere machine, person und since" {
  run yq -r '.holders | length' "$REGISTER"
  [ "$status" -eq 0 ]
  [ "$output" -gt 0 ]
  run yq -r '[.holders[] | select(((.machine // "") == "") or ((.person // "") == "") or ((.since // "") == ""))] | length' "$REGISTER"
  [ "$status" -eq 0 ]
  [ "$output" = "0" ]
}

@test "runbook: Widerruf nennt neuen Key, Re-Encryption und Rotation als Pflichtschritte" {
  [ -f "$RUNBOOK" ]
  body="$(section 'Widerruf')"
  [ -n "$body" ]
  printf '%s\n' "$body" | grep -qF -e 'git-crypt init'
  printf '%s\n' "$body" | grep -qF -e 'git rm -r --cached'
  printf '%s\n' "$body" | grep -qF -e 'Rotation aller Secrets'
}

@test "runbook: Transport per Vaultwarden Send mit Ablauf und Einmal-Abruf" {
  [ -f "$RUNBOOK" ]
  body="$(section 'Transport')"
  [ -n "$body" ]
  printf '%s\n' "$body" | grep -qF -e 'Vaultwarden Send'
  printf '%s\n' "$body" | grep -qF -e 'Maximale Zugriffsanzahl: 1'
  printf '%s\n' "$body" | grep -qF -e '24 Stunden'
}
```

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-machine-onboarding/key-register.bats
# expected: FAIL (3/3 not ok — Register und Runbook existieren nicht)
```

- [ ] **Step 2 — GREEN.** `devmesh/key-holders.yaml` anlegen. Heute hält nur PK-Desktop den Key.
  PK-L-1 und PK-Tablet trägt Task 6 nach der tatsächlichen Key-Ablage ein:

```yaml
# devmesh/key-holders.yaml — Halter des symmetrischen git-crypt-Keys [T900119]
#
# Jede Maschine, auf der der Key liegt (Keydatei oder entsperrter Clone), steht hier.
# Ein Widerruf betrifft alle Eintraege: neuer Key, Re-Encryption, Rotation aller
# Secrets unter environments/.secrets/ (docs/runbooks/git-crypt-key-distribution.md).
holders:
  - machine: PK-Desktop
    person: patrick
    # erster Commit unter environments/.secrets/:
    # git log --reverse --format=%as -- environments/.secrets | head -1
    since: "2026-04-10"
```

- [ ] **Step 3 — GREEN.** `docs/runbooks/git-crypt-key-distribution.md` anlegen. Der Inhalt steht
  zwischen den `~~~~`-Zeilen, die Zeilen selbst gehören nicht dazu:

~~~~markdown
# git-crypt-Key: Verteilung, Onboarding, Widerruf

_Ticket: T900119 · ADR-008 · Register: `devmesh/key-holders.yaml`_

Das Repo verschlüsselt `environments/.secrets/**` mit **einem symmetrischen git-crypt-Key**.
Jede Person mit dem Key liest alle Secrets, auch Prod. Deshalb gilt:

- Der Key liegt nur auf Maschinen, die im Register stehen.
- Voraussetzung auf jeder Maschine: Laufwerksverschlüsselung (BitLocker) ist aktiv.
- Ablage: `~/.config/git-crypt/bachelorprojekt.key`, Modus `600`, Eigentümer ist der
  Benutzer in der WSL-Distro.

## Transport (Vaultwarden Send)

Ausschließlich per Vaultwarden Send. Messenger-Anhänge und E-Mail sind ausgeschlossen.

1. Auf einer entsperrten Maschine den Key exportieren:
   ```bash
   cd ~/Bachelorprojekt
   git-crypt export-key /tmp/bachelorprojekt.key
   ```
2. In der Vaultwarden-Weboberfläche **Send → Neu → Datei** anlegen, `/tmp/bachelorprojekt.key`
   hochladen und setzen:
   - Löschdatum und Ablaufdatum: **24 Stunden**
   - Maximale Zugriffsanzahl: 1
   - Passwort gesetzt; das Passwort geht über einen zweiten Kanal (Signal) an die Person.
3. Exportkopie entfernen: `shred -u /tmp/bachelorprojekt.key`
4. Send-Link an die Person schicken.

Auf der Zielmaschine in der WSL-Distro (Download liegt im Windows-Downloads-Ordner):

```bash
mkdir -p ~/.config/git-crypt && chmod 700 ~/.config/git-crypt
install -m 600 "/mnt/c/Users/<Windows-Benutzer>/Downloads/bachelorprojekt.key" \
  ~/.config/git-crypt/bachelorprojekt.key
rm "/mnt/c/Users/<Windows-Benutzer>/Downloads/bachelorprojekt.key"
```

`rm` auf NTFS löscht nicht sicher. Deshalb ist BitLocker Voraussetzung. Den Windows-Papierkorb
leeren, falls die Datei über den Explorer bewegt wurde.

## Onboarding einer Maschine

Voraussetzungen: WSL-Distro (Ubuntu), `networkingMode = mirrored` in
`C:\Users\<Windows-Benutzer>\.wslconfig` (danach `wsl --shutdown`), `git` und `curl` installiert,
Key abgelegt wie oben.

```bash
curl -fsSL https://raw.githubusercontent.com/Paddione/Bachelorprojekt/main/scripts/devmesh/onboard-machine.sh \
  -o /tmp/onboard-machine.sh
bash /tmp/onboard-machine.sh --name "<Name>" --email "<GitHub-Mail>"
```

Der erste Lauf klont nach `~/Bachelorprojekt`, installiert die Toolchain über
`scripts/install-dev-tools.sh` (sudo), setzt Hooks und `merge.ours`-Treiber, setzt die
git-Identität und entsperrt git-crypt. Ohne gh-Anmeldung endet er mit Exit 1 und der Prüfung
`gh-auth`. Dann:

```bash
gh auth login
gh auth setup-git
bash ~/Bachelorprojekt/scripts/devmesh/onboard-machine.sh --verify   # erwartet: Exit 0
```

Exit-Codes: `0` arbeitsfähig, `1` Prüfung fehlgeschlagen (Name steht im Output), `2`
Vorbedingung fehlt. Commit-Signatur richtet `bash scripts/setup-dev-env.sh` ein.

Danach die Maschine in `devmesh/key-holders.yaml` eintragen (`machine`, `person`, `since` =
Datum der Key-Ablage) und per PR mergen.

## Widerruf

Ein symmetrischer Key lässt sich nicht für eine Person sperren. Wer den Key hatte, kann jeden
bisher gepushten Stand entschlüsseln. Widerruf eines Eintrags bedeutet deshalb immer alle drei
Pflichtschritte:

1. **Neuer Key.** Auf PK-Desktop im entsperrten Haupt-Clone mit sauberem Arbeitsbaum:
   ```bash
   mv .git/git-crypt ".git/git-crypt.old-$(date +%F)"
   git-crypt init
   ```
2. **Re-Encryption.** Alle verwalteten Dateien mit dem neuen Key neu einchecken:
   ```bash
   git rm -r --cached -q environments/.secrets
   git add environments/.secrets
   bash scripts/git-crypt-guard.sh check-staged
   git commit -m "chore(security): git-crypt-Key erneuert [T<ticket>]"
   ```
   Bestehende Worktrees tragen eine Kopie des alten Keys unter
   `.git/worktrees/<name>/git-crypt/keys/default` und werden entfernt oder neu angelegt.
3. **Rotation aller Secrets.** Jeder Wert unter `environments/.secrets/` (Passwörter, Tokens,
   SSH-Keys) wird ersetzt, danach `task env:seal ENV=<env>` pro Umgebung und Deploy. Ohne
   Rotation bleibt der widerrufene Halter über die Git-Historie lesefähig.

Anschließend den neuen Key per Transport an alle verbleibenden Halter verteilen,
`.git/git-crypt.old-*` mit `shred -u` löschen und den widerrufenen Eintrag aus
`devmesh/key-holders.yaml` entfernen.
~~~~

- [ ] **Step 4 — Verify.**

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/dev-machine-onboarding/key-register.bats   # 3/3 ok
grep -nE '(mentolder|korczewski)\.de' docs/runbooks/git-crypt-key-distribution.md || echo "keine Brand-Hosts"
```

- [ ] **Step 5.** Commit `docs(security): git-crypt-Key-Verteilung und Register der Key-Halter [T900119]`.

---

### Task 5: Rückbau `work-vm-shared-dev` mit Löschkriterium (≈45 min)

**Files:** `docs/runbooks/ssh-zugang-fleet.md`, `environments/.secrets/.ssh/config`, `wireguard/wg-mesh-nodes.yaml`, danach `docs/code-quality/gates.yaml` und die Löschungen `scripts/provision-dev-vm.sh`, `prod/cloud-init-dev-vm.yaml`, `scripts/setup-shared-dev-repo.sh`, `tests/spec/work-vm-shared-dev/work-vm-guards.bats`

- [ ] **Step 1 — Verweise außerhalb der Guards bereinigen.**

  a) `docs/runbooks/ssh-zugang-fleet.md` Zeilen 30–31 (alt):

```
`scripts/provision-dev-vm.sh` nutzt sie ueber `ssh -F "$SSH_CONFIG"` (Default
`$REPO_ROOT/environments/.secrets/.ssh/config`) — dort sind bereits `dev` und
```

  neu:

```
Aufrufe nutzen sie ueber `ssh -F environments/.secrets/.ssh/config <alias>` — dort sind bereits `dev` und
```

  b) `environments/.secrets/.ssh/config` (git-crypt-verwaltet, nur im entsperrten Worktree editieren),
  Zeilen 124–125 (alt):

```
# k3s-1 VM as the host of the dev k3d cluster (dev.mentolder.de). Provisioned by
# scripts/provision-dev-vm.sh (cloud-init: prod/cloud-init-dev-vm.yaml).
```

  neu:

```
# k3s-1 VM as the host of the dev k3d cluster (dev.mentolder.de). Provisioning-Skript
# und cloud-init wurden mit T900119 entfernt (ADR-008).
```

  Zeile 140 (alt) `# clone /srv/bachelorprojekt (T900104). Provisioned by scripts/provision-dev-vm.sh.` →
  (neu) `# clone /srv/bachelorprojekt (T900104). Provisioning-Skript mit T900119 entfernt.`
  Die `Host`-Einträge bleiben unverändert.

  c) `wireguard/wg-mesh-nodes.yaml` Zeile 113 (alt)
  `    # 2026-05-31 by scripts/provision-dev-vm.sh (VMID 9002, LAN 10.0.0.26).` →
  (neu) `    # 2026-05-31 (VMID 9002, LAN 10.0.0.26); das Provisioning-Skript wurde mit T900119 entfernt.`

- [ ] **Step 2 — Löschkriterium prüfen (Freigabe-Gate).** Die Löschung in Step 3 erfolgt nur, wenn
  dieser Befehl keine Ausgabe liefert. Liefert er Pfade, wird nicht gelöscht: Verweis bereinigen
  oder den Befund im Ticket kommentieren und hier stoppen.

```bash
hits="$(git grep -l -e provision-dev-vm -e cloud-init-dev-vm -- . ':!openspec/changes/archive' ':!docs/superpowers/plans')"
echo "Anker: hits=$(printf '%s\n' "$hits" | grep -c .)"   # erwartet > 0 (die Skripte selbst)
printf '%s\n' "$hits" \
  | grep -v -x -F -e prod/cloud-init-dev-vm.yaml -e scripts/provision-dev-vm.sh \
      -e tests/spec/work-vm-shared-dev/work-vm-guards.bats -e docs/code-quality/gates.yaml \
      -e docs/code-quality/repo-index.json -e openspec/specs/work-vm-shared-dev.md \
  | grep -v '^openspec/changes/dev-repo-per-machine/' || true
# erwartet: keine Ausgabe
# erlaubt sind nur: die zu loeschenden Dateien und ihr Guard, die Allowlist-Eintraege in gates.yaml
# (fallen in Step 3 mit), das generierte repo-index.json, die SSOT-Spec (REMOVED beim Archivieren)
# und die Dateien dieses Changes.
```

- [ ] **Step 3 — Löschen und Allowlists nachziehen** (nur nach leerem Step 2).

```bash
git rm -q scripts/provision-dev-vm.sh prod/cloud-init-dev-vm.yaml scripts/setup-shared-dev-repo.sh
git rm -q -r tests/spec/work-vm-shared-dev
```

  `docs/code-quality/gates.yaml`:
  - S3-Kommentar (alt):

```
  # cross-brand hardcode. prod/coredns-signaling-override.yaml + prod/cloud-init-dev-vm.yaml
  # are special-purpose configs (CoreDNS rewrite / Proxmox cloud-init) where the host is
  # the resource's own identity. components/website/src/lib/*.generated.json are emitted from the
```

  neu:

```
  # cross-brand hardcode. prod/coredns-signaling-override.yaml is a special-purpose
  # config (CoreDNS rewrite) where the host is
  # the resource's own identity. components/website/src/lib/*.generated.json are emitted from the
```

  - S3 `allowlist_files`: Zeile `    - prod/cloud-init-dev-vm.yaml` entfernen.
  - S4 `allowlist_globs`: Zeile `    - "scripts/provision-dev-vm.sh"` entfernen.

- [ ] **Step 4 — Verify.**

```bash
# Kriterium nach der Loeschung: nur noch SSOT-Spec, Change-Dateien und ggf. repo-index.json
git grep -l -e provision-dev-vm -e cloud-init-dev-vm -e setup-shared-dev-repo -- . ':!openspec/changes/archive' ':!docs/superpowers/plans'
# erwartet: docs/code-quality/repo-index.json (bis freshness:regenerate),
#           openspec/changes/dev-repo-per-machine/{design,proposal,tasks}.md, openspec/specs/work-vm-shared-dev.md
git grep -n -e DEV_USERS -e SKIP_K3D_GO -- scripts prod tests    # nur install-dev-tools.sh
task quality:check                                                # S3/S4 ohne neue Verstoesse
bash scripts/git-crypt-guard.sh check-staged                      # environments/.secrets/.ssh/config bleibt verschluesselt
tests/unit/lib/bats-core/bin/bats -r tests/spec/dev-machine-onboarding   # 13/13 ok
```

- [ ] **Step 5.** Commit `chore(infra): work-vm-shared-dev zurueckgebaut [T900119]`.

---

### Task 6: Operator-Schritte nach dem Merge (nicht Teil des Agentenlaufs)

Diese Schritte brauchen die gemergte Fassung auf `main` (Bootstrap per `curl`) und physischen
Zugriff auf die Maschinen. dev-flow-execute führt vor dem PR direkt Task 7 aus. Der Operator
arbeitet Task 6 nach dem Merge ab.

- [ ] **6.1 PK-Desktop, nur `--verify`.** Die kanonische Keydatei fehlt dort heute:

```bash
cd ~/Bachelorprojekt
mkdir -p ~/.config/git-crypt && chmod 700 ~/.config/git-crypt
git-crypt export-key ~/.config/git-crypt/bachelorprojekt.key && chmod 600 ~/.config/git-crypt/bachelorprojekt.key
bash scripts/devmesh/onboard-machine.sh --verify; echo "rc=$?"      # erwartet: rc=0
```

- [ ] **6.2 Weitere Key-Halter erfassen.** Prüfen, ob die Work-VM aus T900104 oder die ältere
  Dev-VM einen Key tragen:

```bash
for h in work-vm dev-vm; do
  echo "== $h"
  ssh -F environments/.secrets/.ssh/config -o ConnectTimeout=5 "$h" \
    'sudo find / -xdev \( -path "*/.git/git-crypt/keys/default" -o -name "bp-secrets.key" -o -name "*.key" -path "*git-crypt*" \) 2>/dev/null' \
    || echo "$h nicht erreichbar"
done
```

  Treffer: Key dort löschen (`sudo shred -u <pfad>`) oder die Maschine ins Register eintragen.
  Die Entscheidung und den Befehl als Kommentar ins Ticket T900119.

- [ ] **6.3 Key-Send an gekko** nach `docs/runbooks/git-crypt-key-distribution.md`, Abschnitt
  „Transport". Das Send-Passwort geht über Signal.

- [ ] **6.4 PK-L-1 (gekko, GitHub `gekko32`, Rolle `write`).** WSL-Distro, `.wslconfig` mit
  `networkingMode = mirrored`, BitLocker aktiv, Key abgelegt. Dann nach Runbook-Abschnitt „Onboarding
  einer Maschine" mit `--name`/`--email` von gekko ausführen. Abnahme:
  `bash ~/Bachelorprojekt/scripts/devmesh/onboard-machine.sh --verify; echo "rc=$?"` → `rc=0`.

- [ ] **6.5 PK-Tablet (patrick).** Gleicher Ablauf und gleiche Abnahme.

- [ ] **6.6 Register-Nachtrag.** Auf einem Branch `chore/key-holders-T900119` die Einträge
  `PK-L-1 / gekko / <Datum 6.4>` und `PK-Tablet / patrick / <Datum 6.5>` in `devmesh/key-holders.yaml`
  ergänzen, dazu Treffer aus 6.2. Danach die Gates aus Task 7 ausführen und per PR mergen.

---

### Task 7: Final Verification

- [ ] **Step 1 — Tests des Changes.**

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/dev-machine-onboarding   # 13/13 ok
test ! -e tests/spec/work-vm-shared-dev && echo "Guard-Verzeichnis entfernt"
bash scripts/openspec.sh validate
```

- [ ] **Step 2 — Pflicht-Gates.** `task test:changed` braucht GNU `parallel` (`tests/CLAUDE.md`,
  T900093). Die Zeile `Executed 0 instead of expected N` ist kein Testergebnis.

```bash
task test:changed
task freshness:regenerate
task freshness:check
task test:inventory
git status --short components/website/src/data/test-inventory.json docs/   # generierte Artefakte mitcommitten
```

- [ ] **Step 3 — Secret-Integrität.**

```bash
bash scripts/git-crypt-guard.sh check-tracked   # exit 0: alle verwalteten Dateien verschluesselt im HEAD
```

- [ ] **Step 4.** Commit der regenerierten Artefakte `chore(infra): Freshness-Artefakte nach Onboarding-Change [T900119]`, dann PR.
