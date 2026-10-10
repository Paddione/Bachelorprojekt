# Design: derived-secrets-tooling [T901698]

## Ableitung (beide Enden identisch)

- KDF: HKDF-SHA256 nach RFC 5869, Stdlib-only (`hmac`, `hashlib`).
- IKM: 32 Byte Zufall pro Brand in
  `environments/.secrets/.seed-<brand>` (gitignored, Modus 0600).
  Backup: Vaultwarden + 1 Offline-Kopie (Nutzer-Aktion).
- Salt: fixer Domain-Separator `derived-secrets-v1` (Determinismus).
- Info: `v<version>:<brand>:<KEY_NAME>`, Version aus Schema.
- Encodings: `hex` (Default, URL- und expansions-sicher), `base64url`,
  `alnum`. Länge aus Schema-`length` (Default 32).
- Rotation: Version erhöhen (global oder pro Key) → beide Enden leiten neu
  ab, kein gespeicherter Wert nötig. Stale heilt durch Neu-Ableitung.

## Schema-Erweiterung (`environments/schema.yaml`)

- Neue Top-Level-Sektion `derivation`: `version` (int, Default 1).
- Pro Secret-Eintrag optional `derive_version` (Override) und
  `derived: false` (Opt-out für Sonderfälle; Default folgt `generate`).
- Neue Top-Level-Sektion `groups`: geordnete Liste `{name, match}` mit
  Präfix-/Suffix-Regeln, erste passende Regel gewinnt, Fallback `misc`.
  Selbe Gruppierung für JSON-Export und Extra-Liste.

## Exporter-Erweiterung (`scripts/generate-bitwarden-export.py`)

- Bestehendes Bitwarden-Format bleibt Default und byte-kompatibel im
  Verhalten (kein Breaking Change für Importeure).
- Neuer Modus `--format grouped`: ein JSON je Tenant mit `groups`
  (must-store Keys mit Werten, Gruppe aus Schema) und `derived`
  (ableitbare Keys als Referenz `{derived: true, version}` ohne Wert).
- Ausgabe nach `environments/.export/<brand>.json` (gitignored; Guard legt
  die Ignore-Regel an, falls fehlend). Quelldaten nur aus `.secrets` +
  Schema, keine Cluster-Reads.

## CLI (`scripts/secret-derive.py`)

- `secret-derive.py --brand <brand> --key <KEY>`: ein Wert nach stdout.
- `secret-derive.py --brand <brand> --all`: alle ableitbaren Keys als
  `.secrets`-kompatibles Mapping (für Re-Seal-Flows).
- `--seed-file` überschreibt den Default-Pfad; Fehler gehen nach stderr
  mit Exit != 0 (kein stiller Leerwert).

## Sicherheits-Annahmen

- Seed-Leak kompromittiert alle abgeleiteten Werte: Seed nie ins Repo,
  nie ins Cluster, nie in Logs. Der Exporter schreibt abgeleitete Werte
  grundsätzlich nicht aus.
- Must-store bleibt must-store (fremdvergeben, identitätsgebunden oder
  rotations-sensibel, z. B. Verschlüsselungs-Key mit ruhenden Daten).
