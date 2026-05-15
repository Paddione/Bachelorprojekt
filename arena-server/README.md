# arena-server

Authoritative game server for the Arena last-man-standing match. See
`docs/superpowers/specs/2026-05-11-arena-design.md` for the design.

## Local development

```bash
cd arena-server
pnpm install
cp .env.example .env   # then fill in DB_URL + issuer URLs
pnpm dev
```

## Tests

```bash
pnpm test
```

## Deployment

See `task arena:deploy ENV=korczewski` in the repo root Taskfile. Arena runs on the korczewski cluster only (`arena-ws.korczewski.de`).