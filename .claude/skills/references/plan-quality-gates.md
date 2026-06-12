# Plan-Quality-Gates — CI-Checkliste für Plan-Autoren

Jeder Implementierungsplan muss gegen diese CI-Gates geschrieben werden. Die Quelle der Wahrheit
ist `docs/code-quality/gates.yaml` (Limits/Scopes dort nachlesen, nicht hier raten — diese Datei
ist eine Karte, kein Ersatz).

## S1 — Zeilenlimits pro Datei (Ratchet)

`node scripts/code-quality/check.mjs` schlägt fehl, wenn eine Datei über ihrem
Extension-Limit liegt **und** nicht in `docs/code-quality/baseline.json` gebaselined ist.
Aktuelle Limits (Stand 2026-06, verbindlich ist `gates.yaml` → `s1.limits`):

| Extension | Limit | | Extension | Limit |
|-----------|-------|-|-----------|-------|
| `.ts` `.js` `.jsx` `.py` | 600 | | `.svelte` `.sh` `.mjs` `.mts` | 500 |
| `.astro` `.tsx` `.java` `.php` | 400 | | `.bash` | 300 |
| `.cjs` | 200 | | | |

**Pflicht beim Plan-Schreiben:**
1. `wc -l` auf JEDE zu ändernde Datei ausführen und das Budget im Plan notieren
   (z.B. „`health.ts` 75/600 — +80 Zeilen geplant, unkritisch").
2. Liegt eine Datei nach der geplanten Änderung voraussichtlich **über ~80 % ihres Limits**,
   plane die Aufteilung in ein neues Modul gleich mit ein (kein „später refactoren").
3. Neue Dateien so schneiden, dass sie mit Wachstumsreserve unter dem Limit bleiben.
4. **Niemals** eine Baseline-/Ignore-Ausnahme einplanen, um das Limit zu umgehen.

## S2 — Import-Zyklen

Keine neuen Zyklen in den Graphen `website`, `arena-server`, `e2e` (tsconfig-basiert).
Helper-Module als **pure Module** ohne Rück-Import auf DB-/API-Schichten planen.

## S3 — Hardcodierte Hostnamen

In `k3d/`, `prod*/`, `website/src/` sind String-Literale `*.mentolder.de` / `*.korczewski.de`
verboten (Kommentarzeilen ausgenommen). Im Plan immer Env-/Config-basierte Auflösung
vorsehen (`PROD_DOMAIN`, `configmap-domains.yaml`-ConfigMap, `{ns}`-Templates) — nie
Brand-Domains in Code-Snippets vorgeben.

## S4 — Orphan-Manifeste/-Skripte

Jedes neue `k3d/*.yaml` muss in einer `kustomization.yaml` referenziert sein, jedes neue
`scripts/*.sh`/`*.mjs` von Taskfile/CI/Doku/anderem Skript aus erreichbar — sonst Orphan-Violation.

## Weitere CI-Gates (Pflicht im finalen Verifikations-Task jedes Plans)

Der letzte Task jedes Plans MUSS diese Kommandos als Steps enthalten:

```bash
task test:all              # Offline-Gesamtsuite (inkl. test:code-quality Unit-Tests)
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
