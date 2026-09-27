# p5 — Tests

Target files: `tests/spec/langfuse-agent-tracing.bats`.

Tests prüfen Befehlsausgaben, nicht Quelltext (T002448-M4). Kein Cluster-Zugriff in CI:
`render-stack.sh` braucht nur `kubectl kustomize`, `yq`, `envsubst`.

### Task 1: Failing Test zuerst

`tests/spec/langfuse-agent-tracing.bats` mit `load` der üblichen Helper (Muster: `ls tests/spec/*.bats | head`,
einen devmesh-Test als Vorlage suchen: `grep -rl render-stack tests/spec`). Fälle:

1. `render-stack.sh core` rendert `Deployment/langfuse-web`, `Deployment/langfuse-worker`,
   `StatefulSet/langfuse-clickhouse`, `Deployment/langfuse-valkey`, `StatefulSet/langfuse-minio`,
   `Job/langfuse-db-init`, `Deployment/langfuse-otel-redact`.
2. Ingress-Rule für `langfuse.<DEVMESH_DOMAIN>` routet `/api/public/otel` auf `langfuse-otel-redact`
   und `/` auf `langfuse-web` (per `yq` aus der gerenderten Ausgabe).
3. Die gerenderte Collector-Config enthält je Maskierungstyp aus `design.md` einen
   `[REDACTED:<typ>]`-Ersatz (langfuse, anthropic-openai, github, gitlab, aws, private-key, bearer, kv-secret).
4. Kein gerendertes Objekt enthält ein Literal `pk-lf-` oder `sk-lf-` (Keys nur über `secretKeyRef`).
5. Images von `langfuse-web`/`langfuse-worker` sind auf `:4.46.0` gepinnt, kein `:latest`.
6. `setup-harnesses.sh --dry-run` mit leerem `HOME` (`HOME=$BATS_TEST_TMPDIR`) und einem `PATH`, der
   Stub-Binaries `claude`, `opencode`, `pi`, `codex` enthält, gibt je Harness eine Zeile
   `<harness>: ` aus und legt keine Datei unter `$BATS_TEST_TMPDIR` an.
7. Derselbe Lauf ohne Stubs meldet `skip <harness>: not installed` für alle vier.
8. `client-env.sh` ohne Context `devmesh` (`KUBECONFIG=/dev/null`) endet mit Exit 2.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/langfuse-agent-tracing.bats
# expected: FAIL — dev-local/components/langfuse und scripts/langfuse/ existieren noch nicht
```

### Task 2: Grün nach p1–p4

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/langfuse-agent-tracing.bats
task test:inventory
```

Alle acht Fälle grün, `components/website/src/data/test-inventory.json` mitcommitten.
