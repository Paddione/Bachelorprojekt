# P7 — Tests (STRUCT2-Rolle, letztes Partial)

```yaml
title: "P7 tests"
ticket_id: T016422
domains: [test]
status: active
target_files:
  - tests/spec/software-factory/wsl-exit-fleet-factory.bats
```

Ziel: Manifest-Guards, die das WSL-Exit-Design gegen Regression sichern. Konventionen
aus `tests/spec/software-factory/_sf_common.bash` übernehmen (Datei-Variablen-Muster,
Repo-Root über `$BATS_TEST_DIRNAME/../../..`).

## Tasks

- [ ] **T7.1** `tests/spec/software-factory/wsl-exit-fleet-factory.bats` anlegen mit:

  - `@test "brett-dev declares writable tmp emptyDir"` — grep auf
    `k3d/dev-stack/brett-dev.yaml`: `name: tmp`, `emptyDir: {}`,
    `mountPath: /tmp` alle drei vorhanden.
  - `@test "factory-runner is single-replica by design"` — Datei
    `k3d/dev-stack/factory-runner.yaml` existiert; im Deployment-Block steht genau
    ein `replicas: 1`; Kommentar/Flock-Hinweis vorhanden.
  - `@test "factory tick cronjob invokes wakeup.sh"` — grep:
    `scripts/factory/wakeup.sh` kommt im CronJob-Command vor; Image ist
    digest-gepinnt (`@sha256:`).
  - `@test "no WSL bridge endpoint remains in dev-stack"` —
    `! grep -R '172.23.0.1' k3d/dev-stack/`.
  - `@test "sdlc-console has no llm-proxy-host dependency"` —
    `! grep -R 'llm-proxy-host' k3d/dev-stack/sdlc-console.yaml`.
  - `@test "gitattributes enforces LF for shell scripts"` — grep
    `\*\.sh.*eol=lf` in `.gitattributes`.

- [ ] **T7.2** Testlauf lokal:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/software-factory/wsl-exit-fleet-factory.bats
# expected: FAIL (red — solange P1–P5 nicht gemerged sind)
```

Nach Umsetzung der Partials muss derselbe Lauf grün sein.

## Verify

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
