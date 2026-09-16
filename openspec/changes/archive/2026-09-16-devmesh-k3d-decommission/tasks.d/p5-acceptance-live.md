# p5 — Abnahme-Gate, Abbau, Beitritt ws-ubuntu-1 (impl + Live)

_Ticket: T900145_ · Rolle `impl` · depends_on `p1, p2, p3, p4`

Teil A läuft im PR (Repo-Code). Teil B sind **Live-Tasks nach dem Merge**. Jeder hat ein Gate,
das vor dem ersten verändernden Befehl geprüft wird. Scheitert ein Gate, bricht der Task ab, und
der Zustand bleibt, wie er ist. `taskfiles/Taskfile.devmesh.yml`, `scripts/devmesh/k3s-install.sh`,
`scripts/devmesh/preflight.sh`, `scripts/devmesh/migrate-from-k3d.sh`, `devmesh/inventory.yaml`
und `environments/dev.yaml` (context `devmesh`) liefern SP-2/SP-3. Dieser Plan setzt beide als
gemergt voraus.

## Teil A — Repo

### Task 5.1 — `scripts/devmesh/acceptance.sh` (≤45 min)

Neue Datei, S1: neu, Limit 800, geschnitten auf rund 40 Zeilen. Der k3d-Context wird aus dem
Clusternamen gebildet, damit der Guard `no-k3d-context.bats` kein Literal findet. Die Datei ist
nach dem Abbau funktionslos und wird mit dem Folge-Cleanup entfernt.

```bash
#!/usr/bin/env bash
# scripts/devmesh/acceptance.sh — Abnahme-Gate vor dem k3d-Abbau [T900120]
#
# Exit 0 nur, wenn (1) der devmesh-Health-Gate gruen ist, (2) der Migrationsvergleich
# aus SP-3 besteht und (3) ein frischer, nicht-leerer Dump beider k3d-Datenbanken
# ausserhalb des Clusters liegt. Danach markiert ACCEPTANCE_OK das Backup-Verzeichnis.
#
# Overrides: K3D_CLUSTER, K3D_NS, DEVMESH_BACKUP_ROOT, DEVMESH_BACKUP_DATE,
#            DEVMESH_HEALTH_CMD, DEVMESH_COMPARE_CMD, DEVMESH_DUMP_DBS
set -euo pipefail

CLUSTER="${K3D_CLUSTER:-mentolder-dev}"
SRC_CTX="k3d-${CLUSTER}"
NS="${K3D_NS:-workspace}"
BACKUP_ROOT="${DEVMESH_BACKUP_ROOT:-$HOME/backups}"
STAMP="${DEVMESH_BACKUP_DATE:-$(date +%F)}"
BACKUP_DIR="${BACKUP_ROOT}/${SRC_CTX}-${STAMP}"
HEALTH_CMD="${DEVMESH_HEALTH_CMD:-task devmesh:status}"
COMPARE_CMD="${DEVMESH_COMPARE_CMD:-bash scripts/devmesh/migrate-from-k3d.sh compare}"
DBS="${DEVMESH_DUMP_DBS:-pocket_id website}"

fail() { echo "devmesh:acceptance FAIL: $*" >&2; exit 1; }

echo "[1/3] Health-Gate: ${HEALTH_CMD}"
bash -c "$HEALTH_CMD" || fail "Health-Gate von devmesh nicht gruen"

echo "[2/3] Migrationsvergleich: ${COMPARE_CMD}"
bash -c "$COMPARE_CMD" || fail "Migrationsvergleich (SP-3) nicht bestanden"

echo "[3/3] Dump nach ${BACKUP_DIR} (30 Tage aufbewahren)"
mkdir -p "$BACKUP_DIR"
for db in $DBS; do
  out="${BACKUP_DIR}/${db}.dump"
  kubectl --context "$SRC_CTX" -n "$NS" exec deploy/shared-db -- \
    pg_dump -U postgres -Fc "$db" > "$out" || fail "pg_dump ${db} fehlgeschlagen"
  [ -s "$out" ] || fail "Dump ${out} ist leer"
done
date -u +%FT%TZ > "${BACKUP_DIR}/ACCEPTANCE_OK"
echo "devmesh:acceptance OK — ${BACKUP_DIR}"
```

Vor dem Commit prüfen, wie SP-3 den reinen Zeilenzahl-Vergleich aufruft:
`grep -nE '^\s*(compare|verify)\)' scripts/devmesh/migrate-from-k3d.sh`. Heißt der Unterbefehl
nicht `compare`, den Default von `COMPARE_CMD` auf genau diesen Namen setzen.

```bash
chmod +x scripts/devmesh/acceptance.sh && bash -n scripts/devmesh/acceptance.sh
```

### Task 5.2 — `scripts/devmesh/k3d-teardown.sh` (≤30 min)

Neue Datei, S1: neu, Limit 800, rund 25 Zeilen.

```bash
#!/usr/bin/env bash
# scripts/devmesh/k3d-teardown.sh — baut den k3d-Dev-Cluster ab, nur nach bestandenem Gate [T900120]
set -euo pipefail

CLUSTER="${K3D_CLUSTER:-mentolder-dev}"
HOST="${K3D_HOST:-patrick@10.0.33.1}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

if ! bash "${REPO}/scripts/devmesh/acceptance.sh"; then
  echo "k3d-teardown: Abnahme-Gate nicht bestanden — Cluster ${CLUSTER} bleibt stehen" >&2
  exit 1
fi

ssh -o BatchMode=yes "$HOST" "k3d cluster delete ${CLUSTER}"
kubectl config delete-context "k3d-${CLUSTER}" >/dev/null 2>&1 || true

if ssh -o BatchMode=yes "$HOST" "k3d cluster list" | grep -qw "${CLUSTER}"; then
  echo "k3d-teardown: ${CLUSTER} existiert nach dem Abbau noch" >&2
  exit 1
fi
echo "k3d-teardown: ${CLUSTER} abgebaut"
```

```bash
chmod +x scripts/devmesh/k3d-teardown.sh && bash -n scripts/devmesh/k3d-teardown.sh
```

### Task 5.3 — Tasks in `taskfiles/Taskfile.devmesh.yml` (≤20 min)

Namensform von SP-2 übernehmen: `task --list-all | grep -F 'devmesh:status'` zeigt, ob die Datei
Tasks als `status` oder als `devmesh:status` definiert. Die zwei neuen Tasks folgen derselben Form
und sind danach als `task devmesh:acceptance` und `task devmesh:k3d:teardown` erreichbar. Form
für Tasknamen ohne Präfix:

```yaml
  acceptance:
    desc: "Abnahme-Gate vor dem k3d-Abbau: Health-Gate, Migrationsvergleich, frischer Dump (T900120)"
    cmds:
      - bash scripts/devmesh/acceptance.sh

  k3d:teardown:
    desc: "k3d-Dev-Cluster auf ws-ubuntu-1 abbauen — verweigert ohne bestandenes Gate (T900120)"
    cmds:
      - bash scripts/devmesh/k3d-teardown.sh
```

```bash
task --list-all | grep -F 'devmesh:acceptance'
task --list-all | grep -F 'devmesh:k3d:teardown'
```

### Task 5.4 — Kopfkommentar `environments/dev.yaml` (≤10 min)

SP-3 stellt `context:` um. Die Kopfzeile nennt den alten Context weiter:

```bash
grep -n '^context: devmesh$' environments/dev.yaml     # Vorbedingung aus SP-3: 1 Treffer
sed -i 's/^# Diese Datei beschreibt NUR die lokale k3d-Umgebung (context: k3d-mentolder-dev,$/# Diese Datei beschreibt NUR die lokale Entwicklungsumgebung (context: devmesh,/' environments/dev.yaml
grep -c 'k3d-mentolder-dev' environments/dev.yaml      # 0
bash scripts/env-resolve.sh dev >/dev/null && echo resolve-ok
```

## Teil B — Live-Tasks nach dem Merge

### Task 5.5 — Vorbedingung: `wsl-exit-nachzug` archiviert (≤15 min)

Gate für die Archivierung **dieses** Changes, nicht für den Merge. Nur Prüfung und Archiv-Aufruf,
keine inhaltliche Änderung an `wsl-exit-nachzug`.

```bash
ls -d openspec/changes/archive/*-wsl-exit-nachzug 2>/dev/null && echo archiviert
test -d openspec/changes/wsl-exit-nachzug && echo "offen -> archivieren"
```

Ist er offen: auf einem eigenen `chore/`-Branch `bash scripts/openspec.sh archive wsl-exit-nachzug`
ausführen und über `dev-flow-chore` mergen. Danach gilt dieselbe Prüfung für `devmesh-dev-stack`
(SP-3): beide Deltas ändern `sdlc-isolation`, die RENAMED-Quellnamen hier setzen deren Stand voraus.

### Task 5.6 — Live: Abnahme-Gate ausführen (≤45 min)

Gate: SP-3 abgenommen; `kubectl --context devmesh get nodes` meldet drei `Ready`;
`kubectl --context k3d-mentolder-dev get deploy -n workspace shared-db` antwortet.

```bash
task devmesh:acceptance
ls -l ~/backups/k3d-mentolder-dev-$(date +%F)/    # pocket_id.dump, website.dump (>0 Byte), ACCEPTANCE_OK
```

Exit ≠ 0: kein weiterer Live-Task. Ursache aus der `FAIL:`-Zeile beheben und wiederholen.

### Task 5.7 — Live: k3d-Cluster abbauen (≤30 min)

Gate: Task 5.6 grün am selben Tag; SSH als `patrick` auf `ws-ubuntu-1` eingerichtet:

```bash
ssh -o BatchMode=yes patrick@10.0.33.1 true && echo ssh-ok   # rc=0, sonst Abbruch (Operator: "spaeter")
```

```bash
task devmesh:k3d:teardown
kubectl config get-contexts -o name        # fleet, devmesh, hetzner — kein k3d-*
unset FACTORY_CTX                          # laufende Shells, design.md R2
```

Auf den übrigen Dev-Clients (PK-L-1, PK-Tablet) `kubectl config delete-context k3d-mentolder-dev`
ausführen und `kubectl config get-contexts -o name` gegenprüfen.

### Task 5.8 — Live: `ws-ubuntu-1` tritt devmesh als Agent bei (≤90 min, zuletzt, klar abgetrennt)

Gate: Task 5.7 abgeschlossen; SSH als `patrick` (Task 5.7); Tailnet aus SP-1 aktiv.

```bash
scp scripts/devmesh/preflight.sh scripts/devmesh/k3s-install.sh devmesh/inventory.yaml patrick@10.0.33.1:/tmp/
ssh patrick@10.0.33.1 'bash /tmp/preflight.sh'                       # Exit 0, sonst Abbruch
ssh patrick@10.0.33.1 'sudo tailscale up --advertise-tags=tag:devmesh'
ssh patrick@10.0.33.1 'sudo bash /tmp/k3s-install.sh agent'
kubectl --context devmesh get node ws-ubuntu-1                        # Positiv-Anker: Knoten existiert, Ready
kubectl --context devmesh get nodes --no-headers | grep -c ' Ready '  # 4
kubectl --context devmesh get node ws-ubuntu-1 -o jsonpath='{.metadata.labels.node-role\.kubernetes\.io/control-plane}'   # leer
```

Danach als eigener kleiner PR (Repo-Änderung): in `devmesh/inventory.yaml` für `ws-ubuntu-1`
`k3s_role: agent` setzen, falls SP-2 den Eintrag ohne Rolle angelegt hat, und in
`environments/dev.yaml` den Wert `DEVMESH_PROFILE` von `core` auf `full` stellen
(`grep -n 'DEVMESH_PROFILE' environments/dev.yaml` zeigt die Zeile). Anschließend
`task devmesh:deploy` und `task devmesh:status` (vier Knoten).
