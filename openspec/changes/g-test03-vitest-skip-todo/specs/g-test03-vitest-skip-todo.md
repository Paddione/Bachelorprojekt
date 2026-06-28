# g-test03-vitest-skip-todo

## Purpose

Sicherstellen, dass alle Vitest-Testdateien im `website/src`-Verzeichnis ausschliesslich aktiv ausgeführte Tests enthalten. `it.todo` und `describe.skip`-Direktiven gelten als undefiniertes Verhalten: Sie deklarieren eine Erwartung, prüfen sie aber nie. Ziel dieser Capability ist ein Messwert von 0 — kein einziger Skip/Todo in der Codebasis.

## Requirements

- REQ-1: Der Measure-Command `grep -rnE "(describe|it|test)\.(skip|todo)\b" website/src --include="*.ts" --include="*.svelte" | grep -vE "^[^:]+:[0-9]+:[[:space:]]*//" | wc -l` ist reproduzierbar und liefert in der CI-Umgebung dieselben Ergebnisse wie lokal.
- REQ-2: Alle drei `it.todo`-Einträge in `website/src/lib/factory-floor.order.test.ts` sind durch echte Assertions gegen die SSOT-Konstanten `PIPELINE_LANES` und `PHASE_ORDER` ersetzt.
- REQ-3: Die neuen Assertions importieren `TABS` und `MOBILE_COL_INDEX` aus `MobileTabBar.svelte` und leiten die Erwartungswerte deterministisch aus denselben Quellen ab, die die Svelte-Komponente zur Laufzeit verwendet.
- REQ-4: Kein Produktionscode wird verändert; alle Änderungen beschränken sich auf die Testdatei.
- REQ-5: Die Testdatei bleibt im `components`-Vitest-Projekt (jsdom + Svelte-Plugin), weil sie Svelte-Module importiert.

## Acceptance Criteria

- THEN liefert der Measure-Command den Wert `0`.
- THEN bestehen alle 9 Tests in `website/src/lib/factory-floor.order.test.ts` ohne `skip` oder `todo`.
- THEN ergibt `bash scripts/health-goals-check.sh --only=G-TEST03` den Status grün.
- THEN laufen `task test:changed`, `task freshness:regenerate` und `task freshness:check` fehlerfrei durch.
