# p1 — Derivations-Tool + Tests

Ziel: `scripts/secret-derive.py` (HKDF-SHA256, Stdlib-only) mit CLI und
Unit-Tests. Reine Funktion `derive(seed, brand, key, version, length,
encoding)` plus `main()` (Argumente `--brand`, `--key`/`--all`,
`--seed-file`, `--format`).

## Task 1: RED-Nachweis

- `uv run --with pytest pytest tests/py/unit/test_secret_derive.py -q`
  erwartet FAIL (Datei existiert noch nicht).
- Danach Testdatei schreiben: RFC-5869-Vektor (Case 1), Determinismus
  (zweimal ableiten identisch), Versions-Sensitivität (v1 != v2),
  Brand-Separation (Brand A != Brand B), Encoding-Alphabet + Länge,
  Fehlerpfad (fehlende Seed-Datei → Exit != 0).

## Task 2: Implementierung grün

- `derive()` + `main()` schreiben, bis Task-1-Befehl grün ist.
- Stil: Typ-Hints, Docstrings, keine neuen Dependencies.

## Task 3: Eigen-Verifikation

- `uv run --with pytest pytest tests/py/unit/test_secret_derive.py -q`
- Manuelle CLI-Probe mit ephemerem Seed in `/tmp` (danach löschen).
