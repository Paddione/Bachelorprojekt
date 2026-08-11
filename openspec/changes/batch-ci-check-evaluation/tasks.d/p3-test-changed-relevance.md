# P3 — test:changed E2E-Relevanz (T003138)

Rolle: **impl**. Fix für T003138: `task test:changed` startet bei reiner `openspec/`-Änderung
die Live-E2E gegen korczewski (Pfad-Substring-Grep `(korczewski)` auf der Diff-Liste, kein
`openspec/`-Ausschluss; T003129: Exit 201 am Auth-Setup). Relevanz-Entscheidung und
Erreichbarkeits-Guard werden in einen testbaren Helfer extrahiert; Taskfile nutzt ihn.

## File `scripts/test-changed.sh` (net-new)

### Task P3.1 — Relevanz- und Erreichbarkeitsfunktionen

- [ ] SOURCE-Skript (kein Executable-Main; `set -euo pipefail` erst nach den
      Funktionsdefinitionen, damit `source` unter `set -e` nicht bricht).
- [ ] Funktion `test_changed_relevant <pfadliste> <domaene>`: liefert 0, wenn eine
      E2E-Gruppe für die Domäne relevant ist. Kernregeln:
      - `^openspec/`-Pfade sind NIE relevant (Spec-Datei ist kein Website-Code);
      - generierte Artefakte (via `bash scripts/filter-generated.sh` — gleiche Naht wie
        Taskfile) sind NIE relevant;
      - Domäne `korczewski`: relevant, wenn ein übriger Pfad `korczewski` enthält;
      - Domänen `website`/`brett`/`services`: Pfad-Präfix-Matching wie bisher
        (`^website/(src|pages|components|layouts|lib)/` usw. — Logik unverändert
        übernehmen, nur durch den `openspec/`-Ausschluss ergänzt).
- [ ] Funktion `test_changed_reachable <host> <port>`: TCP-Probe (`/dev/tcp`-Pattern wie der
      k3d-Guard T002375-p4, Timeout via `timeout 2`); Exit 0 = erreichbar. Host/Port der
      korczewski-Ziel-Site aus der Playwright-Konfiguration ableiten (beim Umsetzen prüfen:
      `brett/playwright.config.*` bzw. `tests/e2e/`-Setup) und im Kopf dokumentieren.
- [ ] Kopf-Kommentar mit T003138-/T002255-Bezug, Verweis auf
      `tests/spec/ci-cd/test-changed-relevance.bats`; `bash -n` grün.

## File `Taskfile.yml` (geändert)

### Task P3.2 — Taskfile nutzt den Helfer

- [ ] `test:changed`: die Zeile `echo "$CHANGED" | grep -qE "(korczewski)" && RUN_E2E_KORCZEWSKI=true`
      ersetzen durch Aufruf des Helfers:
      `if bash -c 'source scripts/test-changed.sh; test_changed_relevant "$1" korczewski' _ "$CHANGED"; then RUN_E2E_KORCZEWSKI=true; fi`
      (Analog für die anderen E2E-Domänen, falls dort dieselbe Lücke besteht — beim
      Umsetzen prüfen; `^website/`-Trigger war bereits präfix-korrekt).
- [ ] Vor `task test:e2e:korczewski` den Erreichbarkeits-Guard einbauen (Muster k3d-Gruppe):
      bei nicht erreichbarer Ziel-Site sichtbare Skip-Meldung
      `→ e2e korczewski uebersprungen: <host>:<port> antwortet nicht. Kein PR-Blocker — CI fuehrt diese Gruppe fuer PRs ohnehin nicht aus.`
      statt des Live-Laufs; der bestehende Kommentar-Block (T002255/T002375-p4) bleibt
      als Begründung stehen.
- [ ] Taskfile-Syntax: `task test:changed --dry` läuft durch (kein YAML-Bruch).

### Task P3.3 — Verifikation (konkrete Test-Schritte)

S1-Budget: `Taskfile.yml` ist nicht S1-gemessen (unbaselined) — kein Zahlen-Claim;
`scripts/test-changed.sh` ist net-new.

- [ ] Test-Schritt A: Pfadliste `openspec/specs/website-core.md` +
      `openspec/changes/foo/specs/korczewski-core.md` — `test_changed_relevant "$list"
      korczewski` rc != 0 (nicht relevant).
- [ ] Test-Schritt B: Pfadliste `brett/x-korczewski-file.ts` — rc 0 (Positiv-Anker,
      Bestandsverhalten).
- [ ] Test-Schritt C: `test_changed_reachable 127.0.0.1 1` rc != 0; gegen den in P7.3
      gestarteten lokalen HTTP-Port rc 0.
