# p1 — ClickHouse-Speicher und Collector-Environment

Target files: `dev-local/components/langfuse/clickhouse.yaml`, `dev-local/components/langfuse/otel-redact.yaml`.
Design: `design.md` D1, D2. Keine anderen Dateien ändern.

### Task 1: ClickHouse-Limit anheben (D1)

In `dev-local/components/langfuse/clickhouse.yaml` den `resources`-Block des Containers `clickhouse`
ersetzen. Ist:

```yaml
          resources:
            requests: {cpu: 500m, memory: 2Gi}
            limits: {memory: 4Gi}
```

Soll:

```yaml
          resources:
            # 8Gi = offizielles Langfuse-Minimum; bei 4Gi verwarf ClickHouse Inserts als
            # "memory limit exceeded" (non-retryable) [T900750]
            requests: {cpu: 500m, memory: 2Gi}
            limits: {memory: 8Gi}
```

### Task 2: Environment im Collector setzen (D2)

In `dev-local/components/langfuse/otel-redact.yaml`, im Block `transform/redact` → `trace_statements`,
im Eintrag `- context: resource` unter `statements:` als **erste** Zeile einfügen (gleiche
Einrückung wie die folgenden `replace_all_patterns`-Zeilen, 14 Leerzeichen):

```yaml
              - set(resource.attributes["langfuse.environment"], "development") where resource.attributes["langfuse.environment"] == nil
```

Nichts sonst an der Datei ändern.

### Prüfung

```bash
bash scripts/devmesh/render-stack.sh core > /tmp/p1-render.yaml
yq ea -r 'select(.kind=="StatefulSet" and .metadata.name=="langfuse-clickhouse") | .spec.template.spec.containers[0].resources.limits.memory' /tmp/p1-render.yaml
# erwartet: 8Gi
yq ea -r 'select(.kind=="ConfigMap" and .metadata.name=="langfuse-otel-redact-config") | .data."config.yaml"' /tmp/p1-render.yaml | grep -c 'langfuse.environment'
# erwartet: 1 (eine Zeile mit set(...) und where-Bedingung)
task workspace:validate
```
