# p1 — Collector

Target files: `dev-local/components/langfuse/otel-redact.yaml`.

### Task 1: batch behält den Auth-Kontext

`processors.batch` von `{}` auf `metadata_keys: [authorization]` ändern, damit `headers_setter/langfuse`
den Client-Header `authorization` an langfuse-web weiterreicht (sonst 401).
