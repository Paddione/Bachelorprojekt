# Test Impact Analysis (TIA) mit dem K3-Codegraphen

Verwende diese Referenz, um mithilfe von `codebase-memory-mcp` gezielt betroffene Vitest- und Playwright-Tests für Code-Änderungen zu identifizieren und die Testabdeckung im Wissensgraphen zu validieren.

---

## 1. Übersicht der Test-Kanten im K3-Graphen

Der K3-Graph erfasst Beziehungen zwischen Code und Tests über spezifische Kanten:

| Kantentyp | Beschreibung | Typischer Knoten |
|---|---|---|
| `TESTS_FILE` | Eine Testdatei testet eine Quellcodedatei | `(:File)-[:TESTS_FILE]->(:File)` |
| `TESTS` | Ein Testfall/eine Testmethode testet ein Symbol | `(:Function|:Method)-[:TESTS]->(:Function|:Class)` |
| `IMPORTS` | Testdatei importiert Produktionscode/Helpers | `(:File)-[:IMPORTS]->(:Symbol)` |
| `CALLS` | Test ruft Funktion/Methode auf (`--include-tests true`) | `(:Function)-[:CALLS]->(:Function)` |

---

## 2. Vitest Test Impact Analysis

### A. Geänderte Datei auf zugehörige Unit-Tests mappen

Wenn eine Datei (z. B. unter `components/website/src/lib/`) geändert wurde, finde die direkt zuständigen Testdateien:

```cypher
MATCH (t:File)-[:TESTS_FILE]->(f:File)
WHERE f.file_path = 'components/website/src/lib/auth.ts'
RETURN t.file_path AS test_file
```

### B. Geändertes Symbol auf aufrufende Tests tracen

Wenn eine Funktion oder Methode geändert wurde, trace eingehende Aufrufe inklusive Tests:

```bash
codebase-memory-mcp cli trace_path \
  --project home-patrick-Bachelorprojekt \
  --function-name 'home-patrick-Bachelorprojekt.components.website.src.lib.auth.getSession' \
  --direction inbound \
  --mode calls \
  --depth 2 \
  --include-tests true
```

*Wichtig:* Tests sind bei `trace_path` standardmäßig **ausgeschlossen**. Das Flag `--include-tests true` ist zwingend erforderlich, um Test-Aufrufer anzuzeigen.

### C. Gezielte Ausführung der ermittelten Vitest-Tests

```bash
cd components/website
npx vitest run src/lib/auth.test.ts
```

---

## 3. Playwright E2E Test Impact Analysis

### A. Geänderte API- oder Astro-Routen identifizieren

Playwright E2E-Tests validieren Routen und Endpunkte. Ermittle bei Änderungen an Endpunkten die `Route`-Knoten:

```cypher
MATCH (r:Route)
WHERE r.file_path CONTAINS 'src/pages/api' OR r.file_path CONTAINS 'src/pages'
RETURN r.name AS route_path, r.method AS method, r.file_path AS source_file
```

### B. E2E-Helper und geteilte Fixtures tracen

Änderungen in `tests/e2e/helpers/` (z. B. `billing.ts`, `auth.ts`) wirken sich auf mehrere Specs aus:

```bash
codebase-memory-mcp cli trace_path \
  --project home-patrick-Bachelorprojekt \
  --function-name 'home-patrick-Bachelorprojekt.tests.e2e.helpers.billing' \
  --direction inbound \
  --mode calls \
  --depth 2 \
  --include-tests true
```

### C. Gezielte Playwright-Ausführung nach Impact

```bash
cd tests/e2e
SKIP_DB_PURGE=1 ./node_modules/.bin/playwright test specs/fa-16-booking.spec.ts --project website
```

---

## 4. Graph-Validierung nach dem Schreiben neuer Tests

Nach dem Hinzufügen oder Modifizieren von Tests prüfen:

1. **Drift- & Änderungsprüfung:**
   ```bash
   codebase-memory-mcp cli detect_changes --project home-patrick-Bachelorprojekt
   ```
2. **Kanten-Check:**
   Sicherstellen, dass Testimporte sauber geparst wurden und nicht isoliert (`max_degree=0`) im Graphen liegen.
