# Proposal: pocket-id-seed-early-abort

## Why

When `POCKET_ID_API_KEY` is invalid (e.g. drift between the Sealed-Secret and
Pocket-ID's `api_keys` table), every `curl` call in `pocket-id-client-seed`
fails with 401. `find_client_id()` swallows that failure (`|| true`) and
returns an empty id, which `upsert()` interprets as "client does not exist"
and attempts a POST (create) instead — which also fails with 401, but only
`set -e` finally kills the script, and only after having already tried to
create a new client for the current row. With `restartPolicy: OnFailure`,
Kubernetes restarts the container from the top of the script on every
retry (`backoffLimit: 2`), so an invalid key can produce several rounds of
attempted client creation across restarts before the job gives up.

This is the mechanism behind the zombie `oidc_clients` rows found in
T001992 (up to 22 duplicates per app on `workspace-korczewski` before the
pagination bug, T001996, made it worse by hiding existing rows too).

## What

Add a single up-front auth check right after `AUTH`/`CT` are set (before
`ROWS` is processed): `GET /api/oidc/clients` capturing the HTTP status. On
401 or 403, abort immediately with a clear error message — before any
`upsert()` call runs for any client.

_Ticket: T001995_
