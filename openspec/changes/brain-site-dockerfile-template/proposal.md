# Proposal: brain-site-dockerfile-template

## Why

Sprint-1-Defekt (PR #2554): `templates/brain/site.Dockerfile` ist unbaubar — `npm ci` gegen nicht existierende `package*.json`, ungepinnter Quartz-v5-main-Build und ein nicht existierendes Basis-Image (`ghcr.io/paddione/workspace-static-server:latest`). Da `scripts/brain-bootstrap.sh` den Template-Baum 1:1 kopiert, erbt jedes künftige Bootstrap-Seed die kaputte Datei. Die funktionierende Version lebt bisher nur im externen Repo `Paddione/brain` (live verifiziert, Image `ghcr.io/paddione/brain-site:latest`).

## What

- `templates/brain/site.Dockerfile` durch die bewährte Version ersetzen: Quartz-v4.5.2-Clone-Build (`node:22-slim`, `git clone --depth 1 --branch v4.5.2`, `npm ci` im Clone, `COPY content /q/content`) + Runtime-Stage `ghcr.io/static-web-server/static-web-server:2-alpine`. Kein `EXPOSE`/`CMD` — `k3d/brain.yaml` setzt `SERVER_PORT=8787` per Env.
- `templates/brain/.github/workflows/build-site.yml` neu ins Template aufnehmen (Content-Staging `index.md log.md SCHEMA.md wiki raw` → Build → Push `ghcr.io/paddione/brain-site:latest`).
- Failing Tests (bereits rot committed) in `tests/spec/brain-foundation.bats` grün machen; `scripts/brain-bootstrap.sh` bleibt unverändert.

Design-Spec: `docs/superpowers/specs/2026-07-03-brain-site-dockerfile-template-design.md`

_Ticket: T001578_
