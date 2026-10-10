---
title: derived-secrets-tooling
ticket_id: T901698
domains: [secrets, infra]
status: propose
---
# derived-secrets-tooling — Implementation Plan

Deterministische Secret-Ableitung (HKDF-SHA256) aus einem Master-Seed je
Brand: 62 generierbare Keys werden an beiden Enden (Repo-Tooling,
JSON-Generator) identisch abgeleitet, Rotation via Version, stale heilt
durch Neu-Ableitung. Must-store Rests landen gruppiert in JSON-DBs je
Brand. Details: `proposal.md`, `design.md`, Partials in `tasks.d/`.

## File Structure

| path | status | purpose |
|------|--------|---------|
| `scripts/secret-derive.py` | neu | HKDF-CLI + Lib, Stdlib-only |
| `tests/py/unit/test_secret_derive.py` | neu | RFC-Vektor, Determinismus, Version, Brand-Separation |
| `environments/schema.yaml` | erweitert | Sektionen `derivation` + `groups` |
| `scripts/generate-bitwarden-export.py` | erweitert | Modus `--format grouped`, Derived-Referenzen |
| `tests/py/unit/test_bitwarden_export.py` | neu | Gruppierung, Referenzen, Bitwarden-Smoke |
| `docs/runbooks/derived-secrets.md` | neu | Seed-Ablage, Ableitung, Rotation, Grenzen |
| `.gitignore` | erweitert falls nötig | Ignore für `.export/` + Exporter-Ausgaben |

Neue Dateien bleiben klein und unter Limit; `schema.yaml` und
`generate-bitwarden-export.py` wachsen nur um additive Blöcke. Keine
numerischen Budget-Claims (Verzicht nach B1a).

## Partials

| id | file | role | target_files | depends_on |
|----|------|------|--------------|------------|
| p1 | tasks.d/p1-derive-tool.md | impl | `scripts/secret-derive.py`, `tests/py/unit/test_secret_derive.py` |  |
| p2 | tasks.d/p2-schema-export.md | impl | `environments/schema.yaml`, `scripts/generate-bitwarden-export.py`, `tests/py/unit/test_bitwarden_export.py`, `.gitignore` | p1 |
| p3 | tasks.d/p3-docs-verify.md | tests | `docs/runbooks/derived-secrets.md` | p1, p2 |

## Task 1: RED-Nachweis (failing test)

- `uv run --with pytest pytest tests/py/unit/test_secret_derive.py -q` — expected: FAIL
- Der Befehl läuft rot, bevor p1 die Testdatei anlegt (p1, Task 1); grün
  folgt nach der Implementierung (p1, Task 2). Gleiches Muster für p2
  mit `tests/py/unit/test_bitwarden_export.py`.

## Task 2: Finale Verifikation

- `task test:changed` — gezielte Tests für geänderte Domains
- `task freshness:regenerate` — generierte Artefakte aktualisieren
- `task freshness:check` — CI-Äquivalent
- Verbatim für das Gate: task test:changed; task freshness:regenerate; task freshness:check;
