# Proposal: pocket-id-seed-pagination

## Why

`find_client_id()` in `k3d/pocket-id-client-seed.yaml` queries Pocket-ID's
`GET /api/oidc/clients` without any pagination parameter. Pocket-ID v2.9.0
hard-caps `itemsPerPage` at 20 server-side (verified live: requesting
`pagination[itemsPerPage]=100` is silently ignored, the server always returns
20 items per page). Once a brand's `oidc_clients` table grows past 20 rows —
which happens whenever the seed job fails auth and retries (T001992) — the
lookup only ever sees page 1 and can no longer find clients whose row has
been pushed onto page 2+. The job then creates a brand-new duplicate client
row instead of reusing the existing one, generating a fresh secret that
doesn't match what oauth2-proxy/the app actually has configured, and leaving
another zombie row behind for the next run.

Live-observed on `workspace-korczewski`: 131 `oidc_clients` rows (expected
~19), 45 confirmed zombies from this exact failure mode (T001992 follow-up).

## What

`find_client_id()` iterates `pagination[page]=1..totalPages` (read from the
response) until the client name is found or all pages are exhausted, instead
of relying on a single unpaginated GET. No change to `itemsPerPage` (the
server ignores any override), no schema/API changes, no new dependencies.

_Ticket: T001996_
