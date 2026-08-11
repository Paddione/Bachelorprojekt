# P2 — Cluster-BATS in CI (T002922)

Rolle: **impl**. Fix für T002922: cluster-abhängige `tests/spec/*.bats` werden in CI nie
ausgeführt (kein Cluster → stiller Skip; diff-scoped Selektion → gar nicht selektiert).
Neuer dedizierter CI-Job mit echtem k3d-Cluster plus Auswahl-/Report-Skript.

## File `scripts/ci-cluster-bats.mjs` (net-new)

### Task P2.1 — Detection und Registry

- [ ] Modus `list`: scannt `tests/spec/**/*.bats` nach Cluster-Markern
      (`cluster_running()`, `kubectl`, `--context`, `k3d-`) und gibt die deduplizierte
      Dateiliste zeilenweise aus. Ausschluss: Dateien, die den Marker nur im Kommentar
      tragen (Kommentarzeilen `#`/`:`-Bats-Kommentar) — beim Umsetzen am Ist-Stand
      verifizieren und im Kopf dokumentieren.
- [ ] Modus `run <bats-binary>`: führt die Liste mit `bats -j <nproc>` aus und gibt am Ende
      einen sichtbaren Report aus: `N Cluster-Tests ausgeführt, M übersprungen, K fehlgeschlagen`.
- [ ] Modus `--check-registry`: vergleicht die Detection mit der committeten Registry
      (siehe P7.2) und exitet ungleich 0 bei Abweichung — das ist die Naht für den
      Registry-Paritäts-Test.
- [ ] Kopf-Kommentar mit T002922-Bezug, CI-Verwendung und Verweis auf
      `tests/spec/ci-cd/cluster-bats-registry.bats`. Node-Only (keine externen Deps —
      `node:fs`/`node:child_process` reichen); `node --check` grün.

## File `.github/workflows/ci.yml` (geändert)

### Task P2.2 — Neuer Job `cluster-spec-shard`

- [ ] Neuer Job nach dem Muster `test-factory-shard` (env `IS_PR`/`IS_PUSH`), aber OHNE
      Matrix: `runs-on: ubuntu-latest`, `timeout-minutes: 25`.
- [ ] Setup-Steps übernehmen: checkout (fetch-depth 1), `git fetch origin +main`, setup-node,
      setup-task, `npm ci`, `bash scripts/ci-dummy-secrets.sh`, `task cockpit:daemon`
      (nur falls eine Registry-Datei den Cockpit-Daemon braucht — beim Umsetzen prüfen).
- [ ] k3d-Setup-Step: k3d installieren (offizielles Install-Skript), Cluster mit Kontext
      `k3d-mentolder-dev` erstellen (minimaler Stack: Namespace `workspace` mit
      shared-db-Postgres-Deployment; Nodes-Check reicht für die Isolation-Fälle — der
      volle SDLC-Stack inkl. LLM-GPU ist NICHT Teil des Jobs).
- [ ] Selektionslogik: bei PRs `FIND_CHANGED_TESTS_FILES`-Naht ODER direkter Vergleich der
      geänderten Pfade gegen `scripts/ci-cluster-bats.mjs list` — Job läuft nur, wenn eine
      Registry-Datei, `scripts/ci-cluster-bats.mjs` oder `.github/workflows/ci.yml`
      geändert wurde; bei `push`/`schedule` (nightly) läuft er immer.
- [ ] Ausführungs-Step: `bash scripts/ci-cluster-bats.mjs run ./tests/unit/lib/bats-core/bin/bats`
      mit `COCKPIT_DAEMON_REQUIRED`-artiger Fail-Closed-Semantik: Cluster-Setup ohne
      `kubectl get nodes`-Erfolg → Job rot (kein `|| true`, kein stiller Skip).
- [ ] Kontext-Gültigkeit: Tests, die `kubectl --context k3d-mentolder-dev` verwenden
      (backfill-id-sequence), laufen gegen den Job-Cluster; `e2-local-stack.bats`
      (aktueller Kontext) ebenso — beim Umsetzen die Kontext-/Namespace-Erwartungen der
      Registry-Dateien gegen den minimalen Stack abgleichen und Abweichungen im Job
      dokumentieren.

### Task P2.3 — Verifikation (konkrete Test-Schritte)

S1-Budget: `.github/workflows/ci.yml` ist nicht S1-gemessen (unbaselined) — kein
Zahlen-Claim; `scripts/ci-cluster-bats.mjs` ist net-new.

- [ ] Test-Schritt A: `node --check scripts/ci-cluster-bats.mjs` — rc 0.
- [ ] Test-Schritt B: `bash scripts/ci-cluster-bats.mjs list` — liefert die 11 erwarteten
      Dateien (Stand design.md); `--check-registry` rc 0.
- [ ] Test-Schritt C: `bash scripts/lint-workflows.sh` (actionlint über die geänderte
      ci.yml) — rc 0.
- [ ] Test-Schritt D: lokal ohne Cluster — `bash scripts/ci-cluster-bats.mjs run` meldet
      den Ausfall laut (rc != 0) statt still zu skippen.
