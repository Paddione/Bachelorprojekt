## p3 — Tests

Target files: `tests/spec/local-dev-mesh/k3d-tooling-removed.bats` (neu), `tests/spec/workspace-deploy.bats`, `tests/unit/dev-cluster-autostart.bats`, `tests/unit/scripts/dev-reset.test.sh`, `tests/lib/k3d.sh`, `tests/runner.sh`, `tests/README.md`, `components/website/src/data/test-inventory.json`.

- [x] **RED — Guard-Datei anlegen.** Neue Datei `tests/spec/local-dev-mesh/k3d-tooling-removed.bats` mit exakt diesem Inhalt anlegen:

```bash
#!/usr/bin/env bats
# tests/spec/local-dev-mesh/k3d-tooling-removed.bats — T900310
# SSOT: openspec/changes/k3d-tooling-removal/specs/local-dev-mesh.md,
# Requirement "The repository ships no local k3d cluster tooling"
#
# Pruefmodus: Test 1 ist Command-Output-Verifikation (`task --list-all`,
# Exit-Code + Zeilen-Praesenz/-Abwesenheit). Test 2 und Test 3 sind
# Querschnittspruefungen gegen Dateisystem bzw. Quelltext (T002448-M4-Ausnahme:
# das Ergebnis "Datei existiert nicht" / "String kommt in Taskfile.yml nicht vor"
# manifestiert sich ausschliesslich im Dateisystem bzw. im Quelltext selbst,
# nicht in einem Laufzeitverhalten).

setup() {
  REPO_ROOT="$(cd "${BATS_TEST_DIRNAME}/../../.." && pwd)"
  cd "$REPO_ROOT"
}

@test "removed tasks are absent from task --list-all while workspace:deploy remains" {
  command -v task >/dev/null 2>&1 || skip "task binary not installed"
  run task --list-all
  [ "$status" -eq 0 ]

  # Positiv-Anker zuerst: der gueltige Fall muss durchlaufen.
  echo "$output" | grep -qE '^\* workspace:deploy:'

  # Negativ-Aussagen: exakter Task-Name am Zeilenanfang, damit z.B.
  # `dev:cluster:create_legacy` nicht auf `cluster:create` matcht.
  local removed=(
    'cluster:create' 'cluster:delete' 'cluster:start' 'cluster:stop' 'cluster:status'
    'workspace:up' 'dev:reset' 'website:build:import' 'einvoice-sidecar:import'
    'up' 'down'
  )
  local name
  for name in "${removed[@]}"; do
    if echo "$output" | grep -qE "^\\* ${name}:"; then
      echo "unerwartet vorhanden: ${name}"
      return 1
    fi
  done
}

@test "removed files are absent while the production kustomize base remains" {
  [ -f k3d/kustomization.yaml ]

  [ ! -e k3d-config.yaml ]
  [ ! -e k3d/create-cluster.sh ]
  [ ! -e k3d/teardown.sh ]
  [ ! -e scripts/dev-reset.sh ]
  [ ! -e scripts/dev-cluster-autostart.sh ]
}

@test "no task imports images into k3d" {
  grep -qE '^  brett:build:' Taskfile.yml

  run grep -n 'k3d image import' Taskfile.yml
  [ "$status" -eq 1 ]
}
```

- [x] **RED-Lauf, rot sehen.** Ausführen (erwartet: FAIL, weil `cluster:create` &
  Co. in `Taskfile.yml` noch existieren und `k3d-config.yaml` & Co. noch da sind — p1/p2
  sind noch nicht angewendet):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/k3d-tooling-removed.bats
# expected: FAIL (red — p1/p2 not yet applied)
```

- [x] **`tests/unit/dev-cluster-autostart.bats` löschen.**

```bash
git rm tests/unit/dev-cluster-autostart.bats
```

- [x] **`tests/unit/scripts/dev-reset.test.sh` löschen.**

```bash
git rm tests/unit/scripts/dev-reset.test.sh
```

- [x] **Taskfile-Verdrahtung von `dev-reset.test.sh` prüfen.** p1 entfernt `test:unit:dev-reset`
  und den `TEST_FILES`-Eintrag. Check nach p1: `grep -n 'dev-reset' Taskfile.yml` gibt nichts aus.

- [x] **`tests/spec/workspace-deploy.bats`: T001853-hostPort-Test entfernen.** Den Block

```bash
@test "T001853: k3d-config.yaml pins kubeAPI.hostPort against restart port drift" {
  run bash -c "sed -n '/^kubeAPI:/,/^[a-z]/p' \"$PROJECT_DIR/k3d-config.yaml\" | grep -E '^[[:space:]]+hostPort:'"
  [ "$status" -eq 0 ]
}
```

  vollständig löschen (Ist-Lage vor p1/p2: Zeilen 275–278 in `tests/spec/workspace-deploy.bats`).
  Kein anderer `@test`-Block in dieser Datei wird angefasst.

- [x] **`tests/lib/k3d.sh`: Hinweistext in `k3d_wait` umschreiben, Verhalten unverändert.**
  Datei und Funktionsname bleiben (Design D5). Im Block (Ist-Lage: `k3d_wait` beginnt bei
  Zeile 92, der Fehlertext bei Zeile ~101):

  Alt:
  ```bash
  echo "  Prüfe ob k3d-Cluster erreichbar ist..."
  if ! kubectl cluster-info &>/dev/null; then
    echo "  FEHLER: Kein k3d-Cluster erreichbar. Starte mit: task cluster:create && task workspace:deploy"
    return 1
  fi
  ```

  Neu:
  ```bash
  echo "  Prüfe ob der kube-Context erreichbar ist..."
  if ! kubectl cluster-info &>/dev/null; then
    echo "  FEHLER: Kein kube-Context erreichbar (lokal: devmesh, ADR-008). Starte mit: kubectl config use-context devmesh && task workspace:deploy"
    return 1
  fi
  ```

  Nur diese zwei `echo`-Zeilen ändern sich, die Logik (Rückgabewert, Kontrollfluss) bleibt
  identisch.

- [x] **`tests/runner.sh`: Header-Kommentare umschreiben.** In den Zeilen 3, 6 und 13
  (Ist-Lage vor diesem Schritt):
  - Zeile 3: `# runner.sh — Workspace MVP Test Runner (k3d)` → `# runner.sh — Workspace MVP Test Runner`
  - Zeile 6: `#   ./tests/runner.sh local              # full local tier (k3d)` →
    `#   ./tests/runner.sh local              # full local tier (devmesh)`
  - Zeile 13: `#   - k3d cluster running (task cluster:create)` →
    `#   - devmesh kube context reachable (ADR-008, kubectl config use-context devmesh)`
  `source lib/k3d.sh` (weiter unten im Skript) bleibt unverändert stehen — die Datei
  `tests/lib/k3d.sh` wird laut D5 nicht umbenannt.

- [x] **`tests/README.md`: Zeile 22 umschreiben.** Ist-Lage: `# Full local tier (requires k3d
  cluster running)`. Neu: `# Full local tier (requires devmesh kube context reachable)`.

- [x] **Test-Inventar regenerieren.**

```bash
task test:inventory
git add components/website/src/data/test-inventory.json
```

- [x] **GREEN — Guard und betroffene Dateien grün, nach Anwendung von p1 und p2.**
  (erwartet: PASS, sobald p1 `Taskfile.yml`/`taskfiles/Taskfile.dev-stack.yml` und p2 die
  Dateien aus `k3d-config.yaml` & Co. entfernt haben):

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-dev-mesh/k3d-tooling-removed.bats tests/spec/workspace-deploy.bats
bash -n tests/lib/k3d.sh tests/runner.sh
```
