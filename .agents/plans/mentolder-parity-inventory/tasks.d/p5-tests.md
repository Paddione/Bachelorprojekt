# p5 — Guards (tests-Rolle)

Ziel: `tests/spec/mentolder-parity-inventory.bats` prüft die Inventur.

## Target (neu, kein S1-Limit — `.bats` nicht in gates.yaml)

- `tests/spec/mentolder-parity-inventory.bats`: neu, Spec-Guards.

## Tasks

- [x] **1. Rotphase-Guards schreiben.** BATS-Tests, die Existenz aller vier
  Inventur-Dokumente unter `docs/parity/` prüfen. Gegen den leeren Stand
  laufen lassen, expected: FAIL. Befehl:
  `bats tests/spec/mentolder-parity-inventory.bats`.
  Erst danach p1–p4 ausführen.
- [x] **2. Sektions-Guards schreiben.** Pro Dokument die Pflichtsektionen
  prüfen (Kernpfade, Auth/Isolation, Rest-Flows, Matrix/Klassifikation/
  Mom-MVP/Baseline); fehlende Sektion lässt den Guard fehlschlagen.
- [x] **3. Evidenz-Link-Guards schreiben.** Jede referenzierte Quelldatei
  aus den Inventur-Dokumenten muss im Repo existieren; Guards prüfen die
  Pfad-Verweise auflösbar.
- [x] **4. Grünphase.** Nach p1–p4 alle Guards grün laufen lassen:
  `bats tests/spec/mentolder-parity-inventory.bats`. Danach
  `task test:inventory` nur falls das Inventar BATS erfasst — sonst
  entfallen lassen und im Commit begründen.
- [x] **5. Verify.** Guards rot→grün nachweisbar, keine übersprungenen
  Prüfungen ohne Begründung.
