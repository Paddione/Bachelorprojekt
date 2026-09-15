# Partial p1-sessions-schema: SESSIONS_DOMAIN in schema.yaml and mentolder.yaml

## Focus
SESSIONS_DOMAIN deklarieren in environments/schema.yaml und environments/mentolder.yaml.

## Touched Files
- environments/schema.yaml
- environments/mentolder.yaml

## Steps
1. environments/schema.yaml um SESSIONS_DOMAIN (required: false, default_dev: "") ergaenzen.
2. environments/mentolder.yaml um SESSIONS_DOMAIN: sessions.mentolder.de ergaenzen.
3. Testen via source scripts/env-resolve.sh fleet-mentolder && echo "$SESSIONS_DOMAIN".
