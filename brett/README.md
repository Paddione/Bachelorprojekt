# Systemisches Brett

3D systemic-constellation board served from a single Node.js pod. Static HTML + WebSocket sync + REST snapshots, all on port 3000.

For the full design rationale and API contract see [`docs/superpowers/specs/2026-04-25-systemisches-brett-design.md`](../docs/superpowers/specs/2026-04-25-systemisches-brett-design.md).

## Local dev

Build and run the container locally against your dev database:

```bash
docker build -t workspace-brett .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL="postgres://user:pass@host.docker.internal:5432/workspace" \
  workspace-brett
```
