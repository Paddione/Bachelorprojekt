# p2 — Schema-Erweiterung + Exporter + Tests

Ziel: Schema-Sektionen `derivation` + `groups`, gruppierter Export-Modus
in `generate-bitwarden-export.py`, Unit-Tests, Ignore-Regel für Ausgaben.

## Task 1: Schema erweitern

- `derivation: {version: 1}` als Top-Level-Sektion ergänzen.
- `groups`: geordnete Präfix-/Suffix-Regeln + Fallback `misc`, passend zu
  den Key-Familien aus `get_secret_metadata` (DB, OIDC, API, Mail,
  Netzwerk, SSH, Sonstige).
- Pro-Key-Felder `derive_version`/`derived` dokumentieren (Kommentar am
  `POCKET_ID_KORCZEWSKI_DB_PASSWORD`-Eintrag als Beispiel); keine
  bestehenden Einträge umwerten.

## Task 2: Exporter erweitern

- `--format grouped` ergänzen (Default bleibt Bitwarden, unverändert).
- Gruppierter Modus: liest Schema + `.secrets` je Tenant, gruppiert via
  Schema-`groups`, schreibt `environments/.export/<brand>.json` mit
  `groups` (must-store mit Werten) und `derived` (Referenzen ohne Wert).
- Guard: `.gitignore`-Regel für `environments/.export/` und
  `bitwarden.json` prüfen, fehlende ergänzen.

## Task 3: Tests + RED/GRÜN

- RED zuerst: `uv run --with pytest pytest
  tests/py/unit/test_bitwarden_export.py -q` erwartet FAIL.
- Tests mit Fixture-Schema/`.secrets` in `tmp_path`: Gruppierung,
  Derived-Referenzen ohne Wert, Bitwarden-Default unverändert
  (Smoke: vorhandene Item-Anzahl je Tenant stabil), kein Schreiben
  außerhalb des Fixture-Verzeichnisses.
- Danach grün laufen lassen.
