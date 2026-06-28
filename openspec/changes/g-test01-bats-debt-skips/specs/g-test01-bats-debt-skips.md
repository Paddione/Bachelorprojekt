# g-test01-bats-debt-skips

## Purpose

Diese Capability stellt sicher, dass keine unkonditionalen `skip`-Aufrufe mit Gap-Analysis- oder Feature-Pending-Markern in der BATS-Testsuite verbleiben. Jeder solche Skip ist ein Tests, der als Spezifikation geschrieben wurde, aber keinerlei Verifikation liefert. Das Ziel ist eine Testsuite, in der jeder geschriebene Test tatsächlich ausgeführt wird und einen Pass/Fail-Status erzeugt.

## Requirements

- REQ-1: Der Measure-Command `grep -rniE "skip [\"']" tests --include=*.bats | grep -ciE "pending|todo|gap-analysis|WP-|not implemented|disabled|stub"` ist im Repository reproduzierbar ausführbar und liefert einen numerischen Wert.
- REQ-2: Der Measure-Command liefert den Wert `0` — kein einziger `skip`-Aufruf mit Gap-Analysis- oder Feature-Pending-Marker existiert in einer `.bats`-Datei unter `tests/`.
- REQ-3: Alle 9 zuvor geskippten Tests in `tests/unit/admin-nav.bats` sind durch echte Assertions ersetzt und laufen im BATS-Runner ohne Skip-Status durch.
- REQ-4: Die 7 WP-28-Tests (Nicht-Vorhandensein von Nav-Items) bestätigen, dass `AdminLayout.astro` die Routen `/admin/meetings`, `/admin/kalender`, `/admin/zeiterfassung`, `/admin/steuer`, `/admin/software-history` nicht als direkte `href`-Werte in den `navGroups` enthält und dass `/admin/coaching/projekte` sowie `/admin/coaching/settings` nicht als direkte Nav-Items gelistet sind.
- REQ-5: Die 2 WP-29-Tests (Vorhandensein von Tabs) bestätigen, dass `clients.astro` einen Link auf `/admin/meetings` und `rechnungen.astro` einen Link auf `/admin/zeiterfassung` enthält.
- REQ-6: `task test:all` läuft grün durch — kein bestehender Test wird durch die Änderungen gebrochen.

## Acceptance Criteria

- THEN liefert `grep -rniE "skip [\"']" tests --include=*.bats | grep -ciE "pending|todo|gap-analysis|WP-|not implemented|disabled|stub"` den Wert `0`.
- THEN liefert `./tests/unit/lib/bats-core/bin/bats tests/unit/admin-nav.bats` ausschließlich `ok`-Zeilen für alle 18 Tests in der Datei (kein `skip`).
- THEN liefert `bash scripts/health-goals-check.sh --only=G-TEST01` grün mit dem gemessenen Wert 0 ≤ Zielwert 0.
- THEN ist `task test:all` grün.
- THEN enthält `website/src/layouts/AdminLayout.astro` keine der Zeilen `href: '/admin/meetings'`, `href: '/admin/kalender'`, `href: '/admin/zeiterfassung'`, `href: '/admin/steuer'`, `href: '/admin/software-history'` als eigenständige Nav-Item-Definitionen.
