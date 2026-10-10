# p3 — Runbook + finale Verifikation

Ziel: Nutzer-Doku und Nachweis, dass Tooling + Exporter zusammenpassen.

## Task 0: RED-Beleg prüfen

- Vor der Implementierung liefen beide neuen Suites rot: `uv run --with
  pytest pytest tests/py/unit/test_secret_derive.py -q` und `uv run
  --with pytest pytest tests/py/unit/test_bitwarden_export.py -q` wurden
  jeweils expected fail protokolliert (Datei fehlte).
- p3 wiederholt beide Befehle nach p1/p2 und erwartet PASS als
  Grün-Nachweis des RED-GREEN-Durchlaufs.

## Task 1: Runbook schreiben

- `docs/runbooks/derived-secrets.md`: Seed-Anlage + Backup-Ablage,
  Ableitung beider Enden, Rotation via Version, JSON-Generierung,
  Grenzen (Seed-Leak-Risiko, must-store bleibt gespeichert).
- Keine echten Werte, keine Domain-Literale in Snippets.

## Task 2: Finale Verifikation

- `task test:changed` — gezielte Tests für geänderte Domains
- `task freshness:regenerate` — generierte Artefakte aktualisieren
- `task freshness:check` — CI-Äquivalent
- Zusätzlich: Seeds lokal erzeugen (gitignored, 0600), JSON-DBs je Brand
  generieren, Extra-Liste (must-store Namen + Gruppen) gegen Schema
  gegenprüfen. Diese Artefakte werden nicht committet.
