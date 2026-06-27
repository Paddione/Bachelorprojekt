# Plan-Quality-Gates

Jeder Implementierungsplan muss gegen diese CI-Gates geschrieben werden. Die Quelle der Wahrheit
ist `docs/code-quality/gates.yaml` (Limits/Scopes dort nachlesen, nicht hier raten — diese Datei
ist eine Karte, kein Ersatz).

### S1 — Zeilenlimits pro Datei (Ratchet gegen BASELINE, nicht gegen das Limit)

`node scripts/code-quality/check.mjs` (lokal: `task quality:check`, in `task freshness:check`
enthalten) ist ein **Ratchet** gegen die eingefrorenen Werte in `docs/code-quality/baseline.json`.
Es blockiert CI, wenn:
- eine **neue / nicht gebaselinete** Datei über ihrem Extension-Limit liegt, **oder**
- eine **bereits gebaselinete** Datei *wächst*, d.h. `metric > baseline[datei].metric` (worsened).

> **Die Schwelle, die euch in der Praxis trifft, ist NICHT das statische Limit, sondern der
> Baseline-Wert.** Eine schon gewachsene (gebaselinete) Datei liegt bereits *über* dem Limit und
> ist auf ihrem Ist-Wert eingefroren → das Zeilenbudget ist **0 oder negativ**: schon **+1 Zeile**
> macht CI rot (real passiert: `AdminLayout.astro` 444→445). Das statische Limit ist nur für
> *neue/kleine* Dateien die relevante Schwelle.

Statische Limits (Stand 2026-06, verbindlich ist `gates.yaml` → `s1.limits`):

| Extension | Limit | | Extension | Limit |
|-----------|-------|-|-----------|-------|
| `.ts` `.js` `.jsx` `.py` | 600 | | `.svelte` `.sh` `.mjs` `.mts` | 500 |
| `.astro` `.tsx` `.java` `.php` | 400 | | `.bash` | 300 |
| `.cjs` | 200 | | | |

**Pflicht beim Plan-Schreiben — pro zu ändernder Datei BEIDE Schwellen ermitteln:**
1. `wc -l <datei>` → Ist-Zeilen.
2. Baseline-Wert nachschlagen (die **wirksame** Schwelle):
   ```bash
   jq -r '."S1:<relativer/pfad>".metric // "nicht-baselined"' docs/code-quality/baseline.json
   ```
   - `nicht-baselined` → wirksame Schwelle = statisches Extension-Limit (Tabelle oben),
     Budget = Limit − Ist.
   - eine Zahl → Datei ist gebaselined (liegt über Limit, eingefroren). Wirksame Schwelle =
     **dieser Baseline-Wert**, Budget = Baseline − Ist (**oft 0**).
3. Budget im Plan notieren — gegen die wirksame Schwelle, z.B.
   „`CoachingSettings.svelte` Ist 600 · Baseline 600 → **Budget 0**: Änderung MUSS netto
   zeilenneutral sein ODER die Datei in dieser PR echt verkleinern."
4. Liegt die Datei nach der Änderung voraussichtlich über ~80 % ihrer **wirksamen Schwelle**,
   plane die Aufteilung in ein Modul gleich mit ein — **echter Split/Extraktion**, kein
   kosmetisches Zeilen-Zusammenziehen (das drückt nur die Metrik und trippt bei der nächsten
   Änderung erneut → genau die Firefight-Schleife, die dieser Schritt verhindern soll).
5. Neue Dateien mit Wachstumsreserve unter dem Limit schneiden.
6. **Niemals** eine Baseline-/Ignore-Ausnahme einplanen, um die Schwelle zu umgehen — die
   Baseline-Key-Count-Assertion in `freshness:check` (Phase 3) failt ohnehin bei Baseline-Wachstum.

### S2 — Import-Zyklen

Keine neuen Zyklen in den Graphen `website`, `e2e` (tsconfig-basiert).
Helper-Module als **pure Module** ohne Rück-Import auf DB-/API-Schichten planen.

### S3 — Hardcodierte Hostnamen

In `k3d/`, `prod*/`, `website/src/` sind String-Literale `*.mentolder.de` / `*.korczewski.de`
verboten (Kommentarzeilen ausgenommen). Im Plan immer Env-/Config-basierte Auflösung
vorsehen (`PROD_DOMAIN`, `configmap-domains.yaml`-ConfigMap, `{ns}`-Templates) — nie
Brand-Domains in Code-Snippets vorgeben.

### S4 — Orphan-Manifeste/-Skripte

Jedes neue `k3d/*.yaml` muss in einer `kustomization.yaml` referenziert sein, jedes neue
`scripts/*.sh`/`*.mjs` von Taskfile/CI/Doku/anderem Skript aus erreichbar — sonst Orphan-Violation.

### Weitere CI-Gates (Pflicht im finalen Verifikations-Task jedes Plans)

Der letzte Task jedes Plans MUSS diese Kommandos als Steps enthalten:

```bash
task test:changed          # Gezielte Tests für geänderte Domains (vitest --changed + BATS-Selection + quality)
task freshness:regenerate  # generierte Artefakte aktualisieren (test-inventory, repo-index, …)
task freshness:check       # CI-Äquivalent: Freshness + quality:check (S1–S4-Ratchet) + Baseline-Assertion
```

Dazu:
- **Test-Inventar:** nach jeder Test-Änderung `task test:inventory` regenerieren und
  `website/src/data/test-inventory.json` mitcommitten (CI failt sonst).
- **Baseline darf nicht wachsen:** CI vergleicht die Key-Anzahl von
  `docs/code-quality/baseline.json` gegen main — Pläne dürfen keine Baseline-Einträge hinzufügen.
- **Bestehende Tests erweitern statt neue Dateien anlegen** (Vitest/Playwright/BATS zuerst suchen).
- **Manifest-Änderungen:** `task workspace:validate` + relevante `./tests/runner.sh local <TEST-ID>`.
- **Image-Pins:** CI warnt bei `:latest` — Ausnahmen nur website/brett/docs (dokumentiert in CLAUDE.md).
