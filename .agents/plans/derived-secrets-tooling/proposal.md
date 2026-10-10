# Proposal: derived-secrets-tooling [T901698]

## Problem

Je Brand liegen ~110 Secret-Keys in `workspace-secrets`. Das Schema markiert
62 davon als `generate: true` (intern generierbar: DB-Passwörter,
OIDC-Secrets, Cookie-Secrets, Tokens), gespeichert werden sie trotzdem als
Zufallswerte (`scripts/env-generate.sh`). Fällt ein Wert weg oder wird stale,
gibt es keine zweite Quelle: neu würfeln + überall nachziehen.

## Prior-Art (T002829-Suche)

- `docs/adr/`: keine Entscheidung zu deterministischer Ableitung (0 Treffer
  für hkdf/derived secret). Neue Richtung, kein Konflikt.
- `scripts/generate-bitwarden-export.py`: erzeugt bereits importfähiges
  Bitwarden-JSON für beide Tenants aus Schema + `.secrets`, inkl.
  Kategorie-Metadaten und Reroll-Kommandos. Hat keine eigenen Tests.
- Rotation existiert punktuell: shared-db postStart syncet DB-Passwörter bei
  Neustart, `pocket-id-client-seed` ist ein idempotenter Upsert,
  `scripts/secret-rotate.sh` deckt Exposure-Rotation ab.

## Nutzer-Entscheidungen (Q&A, verbindlich)

1. JSON-DBs enthalten echte Werte nur für nicht-ableitbare Keys, ableitbare
   als Derived-Referenz. Generator statt statischer Dateien.
2. Extra-Liste der übrigen (must-store) Werte aus Repo/Cluster-Quellen, kein
   Vault-Zugriff.
3. Umsetzung als PR: Ableitungs-Tool + Schema-Erweiterung + Doku.

## Scope

In scope: `scripts/secret-derive.py` (HKDF-SHA256, Stdlib-only) + Unit-Tests,
Schema-Sektionen `derivation` + `groups`, Erweiterung von
`generate-bitwarden-export.py` (gruppierter Modus, Derived-Referenzen),
Runbook-Doku, lokale Seeds + generierte JSON-DBs (gitignored, kein Commit).

Explizit out of scope: Rotation der Live-Werte auf abgeleitete Werte
(Migration mit DB-Neustarts, OIDC-Reseed, Session-Invalidierung), Cluster-/
DB-Konvergenz, Vaultwarden-Import-Ausführung. Folgeticket nach diesem Plan.
