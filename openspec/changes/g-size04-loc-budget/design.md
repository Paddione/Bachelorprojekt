## Context

Das Repo hat bereits die Gates S1–S5 im Node-ESM-Framework (`scripts/code-quality/check.mjs` +
`scripts/code-quality/gates/s*.mjs`). Daneben existiert der Bundle-Budget-Gate (g-fe02) als
eigenständiges Skript (`scripts/check-bundle-size.mjs`) mit committed Baseline
(`website/bundle-baseline.json`). G-SIZE04 folgt dem g-fe02-Muster: eigenständiges Skript,
committed JSON-Baseline, Taskfile-Integration.

Aktueller Ist-Stand der Codebasis (2026-06-28, S1-Scan-Universum):
- **252.878 Zeilen** in 2.405 Quellcode-Dateien
- Dateitypen: `.ts`, `.tsx`, `.astro`, `.svelte`, `.mjs`, `.mts`, `.sh`, `.py`, `.js`, `.jsx`, `.cjs`, `.bash`, `.java`, `.php`
- Selbe `code_roots` + `ignore_globs` wie in `docs/code-quality/gates.yaml` definiert

## Goals / Non-Goals

**Goals:**
- Unkontrolliertes Wachstum der Gesamtcodebasis per PR sichtbar machen und erzwingen
- Schwellenwerte konfigurierbar ohne Code-Änderung (in `loc-budget.json`)
- Zero-Maintenance-Baseline: auto-update post-merge via `task freshness:regenerate`
- Konsistenz mit bestehendem Scan-Universum (kein zweites Glob-System)
- S4-Orphan-Gate-konform: Skript über Taskfile + CI referenziert

**Non-Goals:**
- Per-Subsystem-Budgets (website vs scripts vs brett)
- cloc/tokei — kein externer Tool-Dependency
- YAML/JSON/Markdown mitzählen
- VideoVault mitzählen (nicht in `code_roots`)
- S6 als required Branch-Protection-Check (informational first)

## Decisions

### 1. Standalone-Skript statt S6 im check.mjs-Framework

Das S1–S5-Framework ist für per-Datei-Violations (key = `S1:<pfad>`) ausgelegt. Ein
aggregierter LOC-Wert hat keinen Datei-key — er passt nicht ins Ratchet-Modell von
`baseline.json`. Das g-fe02-Standalone-Pattern ist einfacher und proven.

### 2. Scan-Universum aus scan.mjs importieren

Das Skript importiert `scanUniverse` aus `scripts/code-quality/scan.mjs` direkt — kein
zweites Glob-System. Damit ist der Scope exakt identisch mit S1.

### 3. Schwellenwerte in loc-budget.json, nicht hardcoded

```json
{
  "total_lines": 252878,
  "file_count": 2405,
  "commit": "<git-sha>",
  "measured_at": "<iso-timestamp>",
  "thresholds": {
    "warn_pct": 5,
    "fail_pct": 15,
    "absolute_cap": 350000
  }
}
```

- `warn_pct=5` → PR fügt >12.644 Zeilen hinzu → WARNING (exit 0)
- `fail_pct=15` → PR fügt >37.932 Zeilen hinzu → FAIL (exit 1)
- `absolute_cap=350000` → Gesamtbasis >350k → FAIL immer (Sicherheitsnetz)

Schwellenwert-Änderung = committed JSON-Edit, kein Code-Change.

### 4. Baseline-Update per task freshness:regenerate

`task loc:update-baseline` wird in `task freshness:regenerate` eingebunden. Die
`freshness-regen.yml` Action führt `task freshness:regenerate` nach jedem merge to main aus —
damit ist `loc-budget.json` immer auf dem aktuellen main-Stand. CIs auf PRs vergleichen
gegen diesen Stand.

### 5. Gate-Logik

```
delta_pct = (current - baseline.total_lines) / baseline.total_lines * 100

LOC sank  → PASS (immer)
> absolute_cap → FAIL
delta_pct > fail_pct → FAIL  
delta_pct > warn_pct → WARN (exit 0, keine CI-Blockierung)
sonst → PASS
```

### 6. Integration in task test:code-quality

`task test:code-quality` führt bereits immer die S1–S5-Gates aus. `task loc:check` wird
als letzter Step ergänzt — kein neues CI-YAML-Job nötig.

## Risks / Trade-offs

| Risiko | Mitigation |
|--------|-----------|
| `warn_pct=5%` ist zu eng und triggert bei normalen Features | Schwellenwert in JSON anpassen (kein Code-Change), 5% entspricht ~12.600 Zeilen — entspricht einem großen Feature |
| Baseline wird nicht regeneriert → stale LOC | freshness:check überwacht `loc-budget.json`; stale = CI-Fail im freshness-Step |
| scan.mjs importieren aus Skript → implizite Kopplung | Akzeptiert — `scan.mjs` ist stabile interne API, kein fremdes Modul |
| absolute_cap=350k veraltet mit der Zeit | Periodisch über threshold-Datei anheben (documentierte Geste, nicht eilig) |
