# Proposal: pocket-id-client-seed-auth-header

## Why

Der `pocket-id-client-seed` Job (T001087) sendet `Authorization: Bearer $POCKET_ID_API_KEY`
gegen Pocket-IDs Admin-API. Pocket-ID (v2.9.0) erwartet für diese Endpunkte jedoch den
`X-API-KEY: <key>`-Header (https://pocket-id.org/docs/api). Der Job scheitert dadurch **immer**
mit `401 "You are not signed in"` — unabhängig davon, ob der konfigurierte API-Key gültig,
abgelaufen oder frisch erzeugt ist. Live verifiziert am 2026-07-01 (T001355): derselbe Key liefert
mit `Authorization: Bearer` 401, mit `X-API-KEY` 200 OK.

Dadurch werden die OIDC-Client-Configs (Callback-URLs, Secrets) in Pocket-ID nie reconciled.
Sobald der in `website-secrets`/`workspace-secrets` hinterlegte Client-Secret aus irgendeinem
Grund vom in Pocket-IDs DB gespeicherten Hash abweicht (z. B. durch eine frühere manuelle
Änderung), bleibt dieser Drift dauerhaft bestehen — der Seed-Job kann ihn nie beheben. Das war
die Ursache eines Live-Incidents: Login für die korczewski-Website schlug nach erfolgreichem
Passkey-Auth-Schritt mit `invalid client secret` beim Token-Austausch fehl.

Der bisherige Manifest-Kommentar ("API key authentication is not allowed for this endpoint")
war eine Fehldiagnose des ursprünglichen Entwicklers (T001087) — mit dem korrekten Header
funktioniert Key-Auth einwandfrei. Ein früherer Fix-Versuch (T001327) ging von einem
Init-Container-Timeout-Race als Root Cause aus und erhöhte den Health-Check-Timeout — das war
bereits umgesetzt, hat den Bug aber nicht behoben, weil die eigentliche Ursache eine andere war.

## What

- `k3d/pocket-id-client-seed.yaml`: `AUTH="Authorization: Bearer ${POCKET_ID_API_KEY}"` →
  `AUTH="X-API-KEY: ${POCKET_ID_API_KEY}"`.
- Manifest-Kommentar korrigiert (verweist jetzt auf die verifizierte Ursache statt der
  ursprünglichen Fehldiagnose).
- Neuer BATS-Test, der den korrekten Header-Namen erzwingt.

_Ticket: T001355_
