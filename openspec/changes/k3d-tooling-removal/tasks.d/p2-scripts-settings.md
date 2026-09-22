## p2 — Skripte und Settings

Target files: `k3d-config.yaml`, `k3d/create-cluster.sh`, `k3d/teardown.sh`, `scripts/dev-reset.sh`, `scripts/dev-cluster-autostart.sh`, `scripts/pre-deploy-checks-lib.sh`, `.claude/settings.json`, `dotfiles/agy/settings.json`.

- [ ] **Caller-Check vor dem Löschen.** Vor jeder Datei-Löschung unten prüfen, dass keine unbekannte Stelle noch referenziert (bekannte, bereits durch p1/p3 behandelte Referenzen: `Taskfile.yml`, `taskfiles/Taskfile.dev-stack.yml`, `tests/unit/dev-cluster-autostart.bats`, `tests/unit/scripts/dev-reset.test.sh`, `tests/spec/workspace-deploy.bats`):

  ```bash
  git grep -lF "k3d-config.yaml" -- . ':!openspec/changes' ':!docs' ':!k3d/docs-content-built' ':!Taskfile.yml' ':!taskfiles/Taskfile.dev-stack.yml' ':!tests'
  git grep -lF "create-cluster.sh" -- . ':!openspec/changes' ':!docs' ':!k3d/docs-content-built' ':!Taskfile.yml' ':!taskfiles/Taskfile.dev-stack.yml' ':!tests'
  git grep -lF "teardown.sh" -- . ':!openspec/changes' ':!docs' ':!k3d/docs-content-built' ':!Taskfile.yml' ':!taskfiles/Taskfile.dev-stack.yml' ':!tests'
  git grep -lF "dev-reset.sh" -- . ':!openspec/changes' ':!docs' ':!k3d/docs-content-built' ':!Taskfile.yml' ':!taskfiles/Taskfile.dev-stack.yml' ':!tests'
  git grep -lF "dev-cluster-autostart" -- . ':!openspec/changes' ':!docs' ':!k3d/docs-content-built' ':!Taskfile.yml' ':!taskfiles/Taskfile.dev-stack.yml' ':!tests'
  ```

  Zusätzlich gezielt `.github/workflows/` und `scripts/dev-host-units/` prüfen (beide Verzeichnisse sind von obigen Mustern nicht ausgeschlossen, aber leicht zu übersehen):

  ```bash
  grep -rl "k3d-config.yaml\|create-cluster.sh\|teardown.sh\|dev-reset.sh\|dev-cluster-autostart" .github/workflows scripts/dev-host-units 2>/dev/null
  ```

  Meldet einer dieser Befehle eine Datei außerhalb der oben genannten bekannten Stellen, NICHT löschen — stattdessen die gefundene Datei im Abschlussbericht dieses Partials nennen, statt den Scope dieses Partials stillschweigend zu erweitern.

- [ ] `git rm k3d-config.yaml` (68 Zeilen, Root-Level k3d-Cluster-Konfiguration, wird von keinem verbleibenden Task mehr gelesen nach p1).

- [ ] `git rm k3d/create-cluster.sh` (68 Zeilen, Cluster-Erstellungsskript für lokalen k3d).

- [ ] `git rm k3d/teardown.sh` (22 Zeilen, Cluster-Abbau-Skript für lokalen k3d — nicht zu verwechseln mit `scripts/devmesh/k3d-teardown.sh`, das unangetastet bleibt).

- [ ] `git rm scripts/dev-reset.sh` (118 Zeilen).

- [ ] `git rm scripts/dev-cluster-autostart.sh` (46 Zeilen, systemd-Autostart-Skript für den lokalen Cluster).

- [ ] `scripts/pre-deploy-checks-lib.sh` Zeile 268, Funktion `check_connectivity` (Sektion "5. Cluster connectivity & namespaces", `IS_DEV == true`-Zweig): Hinweistext umschreiben, der noch `k3d` und `task cluster:create` nennt. `ENV_FILE` ist für den Dev-Zweig `environments/dev.yaml`, dessen `context`-Feld auf `devmesh` zeigt (ADR-008) — der aktive Check ruft dort bewusst `kubectl cluster-info` ohne `--context`-Flag auf (aktiver kubectl-Context muss vorher per `kubectl config use-context devmesh` gesetzt sein). Die neue Meldung benennt diesen Context statt des toten k3d-Befehls:

  Vorher (Zeile 268):
  ```bash
      fail "kubectl cluster-info failed — is k3d running? Run: task cluster:create"
  ```

  Nachher:
  ```bash
      fail "kubectl cluster-info failed — is the 'devmesh' kube context reachable? Run: kubectl config use-context devmesh"
  ```

  Die Manifest-Pfade `k3d/secrets.yaml` (Zeile 121), `OVERLAY_DIR="k3d"` (Zeile 195), `k3d/realm-workspace-dev.json` (Zeile 219) und `k3d/nextcloud-oidc-dev.php` (Zeile 240) bleiben unverändert — sie referenzieren das produktive Kustomize-Basisverzeichnis `k3d/`, nicht die entfernte Cluster-Werkzeugkette.

- [ ] `.claude/settings.json` Zeile 35: Permission-Eintrag `"Bash(k3d cluster *)",` entfernen. Vorher/Nachher als Kontextblock (Einrückung exakt beibehalten, Komma der Vorzeile bleibt, keine hängende Komma-Lücke):

  Vorher:
  ```json
      "Bash(k3d cluster *)",
  ```

  Nachher: Zeile ersatzlos streichen (die vorangehende Zeile behält ihr eigenes Komma, die nachfolgende Zeile bleibt unverändert — kein Trailing-Comma-Fehler).

  Danach Gültigkeit prüfen:
  ```bash
  jq empty .claude/settings.json
  ```

- [ ] `dotfiles/agy/settings.json` Zeile 31: identischer Eintrag `"Bash(k3d cluster *)",` entfernen, gleiche Vorgehensweise wie oben.

  Danach Gültigkeit prüfen:
  ```bash
  jq empty dotfiles/agy/settings.json
  ```

- [ ] Verifikation dieses Partials:

  ```bash
  test ! -e k3d-config.yaml
  test ! -e k3d/create-cluster.sh
  test ! -e k3d/teardown.sh
  test ! -e scripts/dev-reset.sh
  test ! -e scripts/dev-cluster-autostart.sh
  jq empty .claude/settings.json
  jq empty dotfiles/agy/settings.json
  bash -n scripts/pre-deploy-checks-lib.sh
  ```
