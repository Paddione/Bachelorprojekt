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

### CQ02 — Explizite `any`-Typen in `website/src` (Health-Goal)

**Aktuelles Limit:** ≤ 200 explizite `any`-Verwendungen global (Gate: `tests/spec/g-cq02-any-types.bats`).

Beim Plan-Schreiben für alle Dateien in `website/src/**`:

```bash
# Ist-Zählung vor der Änderung (Baseline für den Plan)
grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l
```

**Pflicht:** Kein Plan darf die `any`-Anzahl erhöhen. Jede neue exportierte Funktion / jeder neue API-Handler muss typisiert sein — kein `as any`, kein `catch (e: any)`. Pläne, die `any`-Typen einführen müssen (z.B. Drittanbieter-Interop), MÜSSEN einen eigenen Task „CQ02: any-Typen eliminieren" enthalten.

**Prüfbefehl für den Verify-Task:**
```bash
bash -c "count=\$(grep -rn ': any\|<any>\|as any' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l | tr -d ' '); echo \"any count: \$count (limit: 200)\"; [ \$count -le 200 ]"
```

### Vitest-Abdeckung (Health-Goal)

Jeder Plan, der in `website/src/lib/**` oder `website/src/pages/api/**` neue Dateien anlegt oder bestehende wesentlich ändert, MUSS mindestens einen Vitest-Test-Task enthalten:

- **Neue Lib-Datei** (`website/src/lib/<name>.ts`) → zugehöriger Test in `website/src/lib/__tests__/<name>.test.ts` (oder in der nächstgelegenen bestehenden Test-Datei erweitern, bevorzugt).
- **Neuer API-Endpunkt** (`website/src/pages/api/**`) → Vitest-Test im zugehörigen Test-Bundle (`website/src/**/__tests__/`).
- **Keine Test-Datei anlegen** ohne den `task test:inventory`-Schritt im Plan (CI-Inventar-Check flägt neue Tests).

**Abweichung explizit begründen:** Wenn ein Plan `.ts`/`.svelte`-Dateien ändert aber bewusst KEINEN neuen Vitest-Test braucht (rein konfigurativ, Refactor ohne Logikänderung), muss der Plan einen Kommentar enthalten: `<!-- vitest: kein neuer Test nötig, weil … -->`.

### plan-lint Hard Rules (fail-closed Gate — `scripts/plan-lint.sh`)

Jede `tasks.md` muss diese Hard-Pflichten erfüllen (SSOT hier + im Skript; Plan-Subagenten
lesen diese Datei statt einer Kopie im Skill-Prompt):

- **F1 Frontmatter:** YAML-Frontmatter am Anfang mit den vier Pflicht-Keys
  `title`, `ticket_id`, `domains`, `status` (alle nicht-leer).
- **F2 domains:** `domains:` ist eine non-empty YAML-Liste (`[a, b, …]`), kein leerer String,
  kein `[]`.
- **STRUCT1 Plan-Shape:** Nach dem Frontmatter beginnt die Datei mit
  `# <slug> — Implementation Plan` als H1, gefolgt von einer H2-Sektion `## File Structure`
  mit den geänderten/neuen Dateien.
- **STRUCT2 Failing-Test-Step:** Mindestens ein Task enthält einen rot→grün-Failing-Test-Step
  mit der wortwörtlichen Phrase `expected: FAIL` (regex tolerant: `expected:? *fail`) —
  UND einen echten Testrunner-Aufruf (`bats`, `vitest`, `pytest`, `jest`, `mocha`, `go test`
  oder `playwright test`). Die Phrase allein reicht NICHT: sie ist billig zu faken und wird
  bereits vom `openspec propose`-Skeleton vorgeseedet. Der finale `task test:*`-Verify-Task
  (STRUCT3) zählt NICHT als dieser Failing-Test-Step — es muss ein eigener, expliziter
  Testrunner-Befehl im selben oder einem anderen Task stehen (T001791 #2).
- **STRUCT3 Verify-Task:** Der letzte Task listet die drei mandatory Verify-Commands:
  `task test:changed`, `task freshness:regenerate`, `task freshness:check`
  (regex `task[[:space:]]+<cmd>`).
- **P1 Placeholder-Verbot:** In Prosa (außerhalb von ```-Fences und `inline code`) dürfen
  `TBD`, `TODO`, `FIXME`, `???`, `<ausfüllen>` und `similar to Task <N>` NICHT vorkommen.
- **B1a Budget-Integrität:** Für jede im Plan referenzierte Datei (`` `path` `` als 3-Spalten-
  Tabellenzeile `| \`path\` | <ist> | <budget> |` oder als Prosa `` `path` … (Budget|Restbudget|
  budget) <N> ``), die bereits im Repo existiert, muss der behauptete Budget-Wert exakt dem
  vom Linter berechneten effektiven Budget (Baseline vs. Limit, siehe oben) entsprechen —
  sonst Hard-Fail. Nicht als Zahl behauptete Budgets werden nicht geprüft.
- **B1b Split/Shrink bei Budget ≤ 0 (Warn, nicht Hard-Fail):** Ist das berechnete effektive
  Budget einer referenzierten Datei ≤ 0 und der Plan enthält keinen Split-/Shrink-Schritt
  (Stichwörter: `split`, `extract`, `verkleiner`, `shrink`, `aufteil`), gibt der Linter eine
  Warnung aus — kosmetisches Zusammenziehen reicht bei Budget≈0 nicht (siehe Schritt 3.7/4
  im Skill).

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
- **Shell-Snippet Sanity:** CLI-Befehle im Plan auf Argument-Fallen prüfen (z.B. `jq --args` wandelt alle Folgearags in Strings um -> Input-Dateien via Stdin `< file` umleiten).

