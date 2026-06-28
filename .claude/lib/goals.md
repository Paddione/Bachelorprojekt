# Repository Health Goals

Quantifizierbare Ziele für die strukturelle Gesundheit des Repos.
Jedes Ziel hat einen **messbaren Befehl**, einen **real gemessenen Baseline-Wert** und ein **erreichbares Target**.
Ein Ziel ohne reproduzierbaren Mess-Befehl ist kein Ziel, sondern ein Wunsch.

**Baseline-Stichtag aller Werte:** `2026-06-27` (sofern nicht anders vermerkt). Zuletzt refreshed: `2026-06-28` (alle ✅-reproduzierbaren + gh/cluster-Ziele neu gemessen).

---

## Wie dieses Dokument zu lesen ist

**ID-Konvention.** Die ursprünglichen Kern-Ziele **`G-RH01`–`G-RH07`** sind *stabile Anker*: sie werden außerhalb
dieser Datei referenziert (`docs/code-quality/gates.yaml`, `docs/superpowers/plans/*`, `openspec/changes/*`).
Sie werden **nie umnummeriert**. Neue Ziele nutzen domänenspezifische Präfixe (`G-TEST`, `G-DEP`, `G-CI`, …),
gruppiert in thematische Abschnitte. Jeder Abschnitt ist eine Dimension von Repo-Gesundheit.

**Pro-Ziel-Format.** Statt einer 3-Zeilen-Tabelle (wie früher) trägt jedes Ziel eine kompakte Metazeile:
> **Baseline:** … · **Target:** … · **Aufwand:** … · **Messzyklus:** … · **Reproduzierbar:** ja/eingeschränkt

**Mess-Disziplin (Caveats, die jeden Wert oben relativieren).** Vier Klassen von Zielen sind **nicht
voll reproduzierbar** — ihr Baseline ist eine Momentaufnahme, kein stabiler Vertrag. Sie sind unten je mit
`Reproduzierbar: eingeschränkt` markiert:

| Klasse | Warum driftend | Betroffen |
|---|---|---|
| **Shallow-Clone** | `git rev-parse --is-shallow-repository` = `true`; nur ~6 Tage Historie sichtbar. `--since="4 weeks ago"` kollabiert auf dieses Fenster. | G-DORA01–04, G-SIZE04 |
| **Netz-/Datums-abhängig** | Advisory-DB / Registry ändern sich täglich. | G-DEP01, G-DEP02 |
| **Gleitendes Fenster** | `gh run list --limit N` verschiebt sich mit jedem neuen Lauf → nicht deterministisch. Für stabile Messung fixes `--created`-Fenster nutzen. | G-CI01, G-CI02, G-CD01, G-CD02 |
| **Tool-Setup / Voll-Build nötig** | Werkzeug noch nicht installiert bzw. Astro-Build erforderlich → Erst-Messung einmalig. | G-TEST05, G-CQ08, G-FE01, G-FE02, G-DATA01 |

Autoritative Quelle für DORA-Metriken ist das **`/admin/dora`-Dashboard + die DB-View `v_timeline`**
(`openspec/changes/dora-delivery-pipeline`), nicht die git-Proxys hier — letztere dienen nur der schnellen Orientierung.

**Abschnitts-Übersicht:**

1. [Kern-Ziele (Bestand)](#1-kern-ziele-bestand) — G-RH01–G-RH07
2. [Test-Health](#2-test-health) — G-TEST01–05
3. [Code-Qualität & statische Analyse](#3-code-qualität--statische-analyse) — G-CQ01–10
4. [Code-Größe & Wachstum](#4-code-größe--wachstum) — G-SIZE01–04
5. [Dependencies & Supply-Chain](#5-dependencies--supply-chain) — G-DEP01–05, G-IMG01–02
6. [Sicherheit, Secrets & Provenienz](#6-sicherheit-secrets--provenienz) — G-SEC01–05
7. [Infrastruktur (K8s, Config, Daten)](#7-infrastruktur-k8s-config-daten) — G-K8S01–04, G-CFG01, G-DATA01
8. [CI/CD & Delivery (DORA)](#8-cicd--delivery-dora) — G-CI01–02, G-CD01–02, G-DORA01–04
9. [Prozess & Repo-Hygiene](#9-prozess--repo-hygiene) — G-GIT01–03, G-SPEC01–03
10. [Dokumentation](#10-dokumentation) — G-DOC01–04
11. [Frontend-Qualität (Perf / A11y / Observability)](#11-frontend-qualität-perf--a11y--observability) — G-FE01–03

[Zusammenfassung & Messzyklus](#zusammenfassung) am Dateiende.

---

# 1. Kern-Ziele (Bestand)

Die sieben ursprünglichen Ziele, mit auf `2026-06-28` aktualisierten Baselines.

## G-RH01 — Baselined Gate-Violations (baseline.json gesamt): 28 → ≤ 30 (Target erreicht)

**Was:** Einträge in `docs/code-quality/baseline.json` — eingefrorene Gate-Verstöße über **alle vier** Code-Quality-Gates
(`docs/code-quality/gates.yaml`), nicht nur Dateigröße. Aufschlüsselung: **S1 Dateigröße 28 · S2 Import-Zyklen 0 · S3 hartkodierte Hostnames 0 · S4 verwaiste Scripts/Manifeste 0** — nur noch S1 verbleibt; S2/S3/S4 sind vollständig aufgelöst. Jeder Eintrag ist Schuld: die Datei darf nicht schlimmer werden, muss aber refactored werden. Die Drill-down-Ziele dafür sind G-CQ07/09/10 (S2/S3/S4, alle 0) und die G-SIZE-Reihe (S1-Wachstum).

**Warum erreichbar:** Trend stimmt (98 → 74 → 70 → 28). S2/S3/S4 sind komplett abgebaut (Import-Zyklen, hartkodierte Hostnames, verwaiste Scripts alle 0); es verbleiben ausschließlich 28 S1-Dateigrößen-Einträge. Target ≤30 ist damit **erreicht** — verbleibende Arbeit ist reines S1-Refactoring (siehe G-SIZE-Reihe), nicht mehr Gate-übergreifend.

```bash
# Zielmetrik (G-RH01, exakt wie historisch):
python3 -c "import json,sys; print(len(json.load(sys.stdin)))" < docs/code-quality/baseline.json
# Aufschlüsselung nach Gate:
python3 -c "import json,sys,collections as c; d=json.load(sys.stdin); [print(f'{g}: {n}') for g,n in sorted(c.Counter(v['gate'] for v in d.values()).items())]" < docs/code-quality/baseline.json
# Stale-Check (current < baselined ⇒ Refresh fällig):
task quality:check
```

> **Priorität:** C · **Baseline:** 28 (S1:28 S2:0 S3:0 S4:0) · **Target:** ≤ 30 (erreicht) · **Aufwand:** halten + S1-Refactoring · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-RH02 — TypeScript-Suppressionen: 0 → 0 (erreicht, halten)

**Was:** `@ts-ignore` / `@ts-expect-error` in `website/src/` — jede unterdrückt einen Compilerfehler (stiller Fehlerpunkt).

**Warum erreichbar:** Target bereits erreicht (9 → 0). Nur noch halten: neue Suppression im Review blocken.

```bash
grep -r "@ts-ignore\|@ts-expect-error" website/src \
  --include="*.ts" --include="*.svelte" --include="*.astro" --exclude-dir=node_modules | wc -l
```

> **Priorität:** C · **Baseline:** 0 (vorher 9) · **Target:** 0 · **Aufwand:** erreicht — Review-Gate · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-RH03 — OpenSpec-BATS-Abdeckung: 45 % → ≥ 60 %

**Was:** Von 60 OpenSpec-Specs (`openspec/specs/*.md`) haben 27 eine BATS-Datei in `tests/spec/`. Jede unabgedeckte Spec ist nur manuell oder gar nicht verifiziertes Verhalten.

**Warum erreichbar:** ≥ 60 % = 42 Specs ⇒ 10 neue BATS-Dateien, ~1 h/Datei, ~2 Wochen. Trend belegt (17 % → 28 % → 35 % → 46 %).

```bash
SPECS=$(ls openspec/specs/*.md 2>/dev/null | wc -l); BATS=$(ls tests/spec/*.bats 2>/dev/null | wc -l)
echo "Specs: $SPECS | BATS: $BATS | Coverage: $(python3 -c "print(f'{$BATS/$SPECS*100:.0f}%')")"
comm -23 <(ls openspec/specs/*.md | xargs -n1 basename | sed 's/.md$//' | sort) \
         <(ls tests/spec/*.bats | xargs -n1 basename | sed 's/.bats$//' | sort)
```

> **Priorität:** B · **Baseline:** 46 % (32/69) · **Target:** ≥ 60 % (42/69) · **Aufwand:** ~2 Wochen · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-RH04 — Stale Remote Branches (>14 Tage, kein offener PR): 0

**Was:** Remote-Branches >14 Tage ohne offenen PR — vergessene Worktrees oder gemergte Branches ohne `git push --delete`.

**Warum erreichbar:** Aktuell 0 stale (3 aktive, alle frisch). Dauerhaft halten: jeder Merge triggert `git push origin --delete <branch>`.

```bash
CUTOFF=$(date -d "14 days ago" +%s)
git for-each-ref --format='%(refname:short)|%(committerdate:unix)' refs/remotes/origin \
  | grep -v "HEAD\|main" | while IFS='|' read b ts; do [[ "$ts" -lt "$CUTOFF" ]] && echo "$b"; done | wc -l
```

> **Priorität:** C · **Baseline:** 0 stale (3 aktiv) · **Target:** dauerhaft 0 · **Aufwand:** Policy · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-RH05 — Plan-Staged-Tickets ohne Aktivität >14 Tage: 0

**Was:** Tickets im Status `plan_staged` ohne Commit/PR/Kommentar seit >14 Tagen — verursachen Kontextverlust, blockieren die Software Factory.

**Warum erreichbar:** Aktuell 0 (vorher 4). Halten: jedes neue `plan_staged`-Ticket via `dev-flow-execute` abarbeiten oder auf `backlog` zurücksetzen.

```bash
# via ticket-mcp list_tickets status=plan_staged (beide Brands)
bash scripts/vda.sh oracle --dry-run 'list plan_staged tickets'
```

> **Priorität:** C · **Baseline:** 0 (vorher 4) · **Target:** 0 idle >14 Tage · **Aufwand:** laufend · **Messzyklus:** wöchentlich · **Reproduzierbar:** mit ticket-mcp

## G-RH06 — Sentinel-Issues unbehandelt >48h: 0

**Was:** Der tägliche Sentinel-Bot öffnet Issues mit Findings. Jede sollte binnen 48h zu Ticket überführt, kommentiert (false positive) oder geschlossen werden.

**Warum erreichbar:** Policy-Ziel. Aktuell 0 offen. Konsequentes tägliches Triage hält es.

```bash
gh-axi issue list --label "sentinel" --state open --json number,title,createdAt | python3 -c "
import sys,json; from datetime import datetime,timezone,timedelta
i=json.load(sys.stdin); cut=datetime.now(timezone.utc)-timedelta(hours=48)
print('>48h:', sum(1 for x in i if datetime.fromisoformat(x['createdAt'].replace('Z','+00:00'))<cut))"
```

> **Priorität:** C · **Baseline:** 0 offen · **Target:** 0 älter als 48h · **Aufwand:** Policy · **Messzyklus:** täglich · **Reproduzierbar:** mit gh

## G-RH07 — Freshness-Check: grün (Exit 0) auf `main`

**Was:** `task freshness:check` validiert, dass generierte Artefakte (repo-index, architecture-HTML, route-manifest) mit dem committeten Stand übereinstimmen.

**Warum erreichbar:** CI-Gate vorhanden, aktuell grün. Halten: kein Direkt-Push ohne vorheriges `task freshness:regenerate`.

```bash
task freshness:check; echo "Exit: $?"
```

> **Priorität:** C · **Baseline:** Exit 0 (grün) · **Target:** Exit 0 auf main, immer · **Aufwand:** Policy · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

---

# 2. Test-Health

## G-TEST01 — BATS Debt-Skips (Feature-Gaps): 9 → 0

**Was:** Unkonditionale `skip`-Aufrufe in BATS, die auf nicht implementierte Features zeigen (nicht Tool-Guards). Alle 9 in `tests/unit/admin-nav.bats`, gekoppelt an WP-28/WP-29 (fehlende Admin-Nav-Tabs). Geschriebene, aber dauerhaft deaktivierte Tests = Spezifikation ohne Verifikation. Abgegrenzt von 83 legitimen Tool-Guard-Skips (php/kubectl/task offline).

**Warum erreichbar:** Tests reaktivieren sich durch Entfernen der `skip`-Zeile, sobald WP-28/29 implementiert sind — kein Neuschrieb.

```bash
grep -rniE "skip [\"']" tests --include=*.bats | grep -ciE "pending|todo|gap-analysis|WP-|not implemented|disabled|stub"
```

> **Priorität:** B · **Baseline:** 9 (alle in admin-nav.bats) · **Target:** 0 · **Aufwand:** ~1–2 Wochen (feature-gekoppelt) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-TEST02 — Vitest `.only`-Vorkommen: dauerhaft 0 (Policy-Gate)

**Was:** `it.only`/`describe.only`/`test.only` deaktiviert **still alle anderen Tests derselben Datei** — ein versehentlich gemergtes `.only` kann ganze Suiten lautlos abschalten, während CI grün meldet. Das kritischste Test-Health-Signal.

**Warum erreichbar:** Baseline bereits 0. Mit einem grep-Gate in `task test:all`/pre-commit fail-closed absicherbar (~1h).

```bash
grep -rnE "\.only\b" website/src mentolder-web/src \
  --include="*.test.ts" --include="*.test.tsx" --include="*.test.svelte" | wc -l
```

> **Priorität:** C · **Baseline:** 0 · **Target:** dauerhaft 0 · **Aufwand:** Policy (~1h Gate) · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-TEST03 — Vitest Skipped/Todo-Suiten: 3 → 0

**Was:** 3× `it.todo` (`factory-floor.order.test.ts`, SP4-Order-Asserts) + 2× `describe.skip` (`assistant/dismissals`, `assistant/conversations`, brauchen DB). Definiertes, aber nie ausgeführtes Verhalten — zählt nicht als Fehlschlag, prüft nichts.

**Warum erreichbar:** Nur 5 Direktiven in 3 Dateien. Die 3 `it.todo` sind Asserts gegen vorhandene SSOT-Konstanten (~je 30 min); die 2 `describe.skip` brauchen einen kleinen Integrations-Harness (pg-mem/Test-DB).

```bash
grep -rnE "(describe|it|test)\.(skip|todo)\b" website/src --include="*.ts" --include="*.svelte" \
  | grep -vE "^[^:]+:[0-9]+:[[:space:]]*//" | wc -l
```

> **Priorität:** B · **Baseline:** 3 (war 5) · **Target:** 0 · **Aufwand:** ~1 Woche · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-TEST04 — Test-Inventory-Drift: 0 (CI-Gate)

**Was:** `website/src/data/test-inventory.json` (276 Einträge, Requirement→Test-Mapping) wird von `task test:inventory` generiert; CI schlägt fehl, wenn das committete Artefakt abweicht. Drift = Traceability-Tabelle der Thesis stimmt nicht mehr mit dem Test-Bestand überein.

**Warum erreichbar:** CI-Gate vorhanden, aktuell driftfrei. Halten: `task test:inventory` bei jeder Test-Änderung mitlaufen lassen und committen.

```bash
# Read-only-Proxy (committed == HEAD):
git status --porcelain website/src/data/test-inventory.json | wc -l
# Voll-Check (CI-äquivalent, schreibt die Datei — danach ggf. git restore):
# task test:inventory && git diff --exit-code website/src/data/test-inventory.json
```

> **Priorität:** C · **Baseline:** 0 Drift · **Target:** dauerhaft 0 · **Aufwand:** Policy · **Messzyklus:** pro Merge / bei Test-Änderungen · **Reproduzierbar:** ja

## G-TEST05 — Vitest Line-Coverage (website/src/lib): messen → ≥ 60 %

**Was:** 233 `*.test.ts`-Dateien existieren, aber **keine Coverage-Messung** (`@vitest/coverage-v8` nicht installiert, `test:unit` = `vitest run` ohne `--coverage`). Es ist unbekannt, welcher Anteil der Logik überhaupt von Tests erreicht wird — die fehlende zentrale Test-Health-Kennzahl.

**Warum erreichbar:** Einmalige devDep-Installation + `--coverage`-Flag aktiviert die Messung. ≥ 60 % Line-Coverage im `lib/`-Kern ist bei 233 Testdateien ein realistischer Startwert.

```bash
pnpm --dir website add -D @vitest/coverage-v8 >/dev/null 2>&1
pnpm --dir website exec vitest run --coverage --coverage.provider=v8 \
  --coverage.reporter=text-summary 2>/dev/null | grep -iE 'lines|statements'
```

> **Priorität:** B · **Baseline:** unbekannt (Provider nicht installiert) · **Target:** ≥ 60 % Lines (lib/) · **Aufwand:** ~0.5 Tag Setup + laufend · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Tool-Setup)

---

# 3. Code-Qualität & statische Analyse

## G-CQ01 — astro-check-Fehler: ? → ≤ 20  ✅ T001277 gefixt

**Was:** `npx astro check` (Typprüfer via `@astrojs/check`) über `website/src` + `tests/`. T001277 wurde mit PR #2225 implementiert ("fix(website): resolve astro check type errors and add CI gate") — ein CI-Gate für astro-check ist jetzt aktiv. Re-Messung ausstehend (lokale node_modules unvollständig; `astro`-Binary nicht lauffähig).

**Status:** T001277 gefixt (PR #2225 gemergt 2026-06-27). `astro check` läuft jetzt als CI-Gate (exit 1 bei Fehlern). Re-Measurement beim nächsten Refresh nach `pnpm install`.

```bash
cd website && pnpm astro check 2>&1 | grep -E '^- [0-9]+ errors'
```

> **Priorität:** B · **Baseline:** ? (war 249; T001277 fix gemergt, CI-Gate aktiv) · **Target:** ≤ 20 · **Aufwand:** halten (CI-Gate) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja (nach install)

## G-CQ02 — Explizite `any`-Verwendungen: 424 → ≤ 280

**Was:** 463 explizite `any` in `website/src` (war 424; +39 Regression) über die `.ts`/`.svelte`/`.astro`-Quellen. Jedes `any` deaktiviert lokal die Typprüfung; die `as any` umgehen bewusst die Zuweisbarkeitsprüfung. **Achtung:** T001277-Fix (astro-check CI-Gate) kann kurzfristig weitere `any` freilegen oder einführen — Ziele nach dem nächsten Refresh neu kalibrieren.

**Warum erreichbar:** Viele `as any` stecken in Tests + wenigen Hotspots (API-Routes, DB-Layer); durch generische Typen/Interfaces ersetzbar. Halbierung über ~4–5 Wochen kontinuierlich; 0 bei 1357 Dateien unrealistisch.

```bash
grep -rn ': any\|<any>\|as any' website/src --include=*.ts --include=*.svelte --include=*.astro | wc -l
```

> **Priorität:** B · **Baseline:** 463 (war 424; +39 Regression ⚠️) · **Target:** ≤ 280 · **Aufwand:** mittel (~3–4 Wochen) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-CQ03 — ESLint einrichten + Warnings → 0 (Setup-Ziel)

**Was:** In `website/` ist **kein ESLint** installiert (keine `eslint.config.*`, keine Binary, kein `lint`-Script). Dennoch 9 tote `eslint-disable`-Direktiven in `src/` — Annotationen, die auf einen nie laufenden Linter verweisen. Es gibt keine durchsetzbare Stil-/Code-Smell-Schicht; `astro check` deckt nur Typen ab.

**Warum erreichbar:** Minimale Flat-Config (`typescript-eslint` + `eslint-plugin-svelte`) + `lint`-Script + CI-Gate ist ein abgegrenzter Setup-Schritt (~1 Tag). Die 9 Direktiven belegen latente Nachfrage. Danach iterativer Abbau auf 0.

```bash
ls website/eslint.config.* 2>/dev/null; ls website/node_modules/.bin/eslint 2>/dev/null
grep -c '"lint"' website/package.json; grep -rn 'eslint-disable' website/src | wc -l
```

> **Priorität:** B · **Baseline:** kein ESLint; 9 tote disable-Direktiven · **Target:** Flat-Config + CI-Gate aktiv, Warnings 0 · **Aufwand:** mittel (~1 Tag + Abbau) · **Messzyklus:** pro Merge (nach Setup) · **Reproduzierbar:** eingeschränkt (erst nach Setup messbar)

## G-CQ04 — FIXME/HACK/XXX (echte Code-Schuld): 0 → dauerhaft 0

**Was:** Schuld-Marker FIXME/HACK/XXX (Wort-Grenze) über `website/src`, `scripts`, `tests`, `k3d`, `brett/src`. 3 Wort-Treffer, davon **0 echte Code-Schuld** (2× in `scripts/health-goals-check.sh` = Kommentare des neuen Health-Check-Skripts, das diese Marker selbst *detektiert*; 1× `XXX-XXX`-Session-Code-Kommentar in `brett/src/client/ui/menu.ts`). Naiver Substring-Grep liefert deutlich mehr (False Positives in Testdaten). *(Das `health-goals-check.sh`-GATE nutzt Schwelle ≤4, deckt diese bekannten Tooling-Treffer ab.)*

**Warum erreichbar:** Nichts abzubauen — präventiv halten (Netto-Rate 0) per Wort-Grenzen-Grep als Pre-Merge-Wächter.

```bash
grep -rnE "\b(FIXME|HACK|XXX)\b" --include=*.ts --include=*.svelte --include=*.astro \
  --include=*.sh --include=*.js --include=*.mjs website/src scripts tests k3d brett/src 2>/dev/null \
  | grep -vE "node_modules|/dist/|plan-lint.sh|plan-qa-check.sh" | wc -l
```

> **Priorität:** C · **Baseline:** 0 echte Schuld (3 Wort-Treffer, alle Tooling/Format) · **Target:** dauerhaft 0 echte · **Aufwand:** Policy · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-CQ05 — Echte TODO-Marker: 6 → ≤ 1  ⚠️ REGRESSION

**Was:** 6 TODOs (war 1; +5 Regression). Neu hinzugekommene TODOs unklar — Quelle bitte per grep diagnostizieren.

**Warum erreichbar:** 5 neue TODOs müssen identifiziert und entweder implementiert oder auf Tickets verlinkt werden.

```bash
grep -rnE "\bTODO\b" --include=*.ts --include=*.svelte --include=*.astro --include=*.sh \
  --include=*.js --include=*.mjs website/src scripts tests k3d brett/src 2>/dev/null \
  | grep -vE "node_modules|/dist/|plan-lint.sh|plan-qa-check.sh|openspec.sh"
```

> **Priorität:** B · **Baseline:** 6 (war 1; +5 Regression ⚠️) · **Target:** ≤ 1 · **Aufwand:** ~0.5 Tag (Diagnose + Cleanup) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-CQ06 — `@deprecated`-Symbole: 1 → ≤ 1 (Target erreicht)

**Was:** 1 `@deprecated` in `website/src`: `ServiceRow.svelte:19` (entfernte Direct-Buy-Buttons, als Kompatibilität gehalten). Die 2 `website-db.ts`-Fallbacks (legacy headline price, detail tiers read-fallback) sind entfernt.

**Warum erreichbar:** Bereits auf Target. Der ServiceRow-Marker darf als Kompatibilität bleiben.

```bash
grep -rnE "@deprecated" --include=*.ts --include=*.svelte --include=*.astro website/src 2>/dev/null \
  | grep -v node_modules | wc -l
```

> **Priorität:** C · **Baseline:** 1 (war 3) · **Target:** ≤ 1 (erreicht) · **Aufwand:** halten · **Messzyklus:** monatlich · **Reproduzierbar:** ja

## G-CQ07 — S2 Import-Zyklen (circular deps): 0 → 0 (erreicht, halten)

**Was:** Eingefrorene S2-Verstöße (Gate `s2-cycles`) = Import-Zyklen im Modulgraph. **0** — die zuvor 4 Zyklen (`tickets-db.ts ↔ website-db.ts`; `website-db.ts → tickets/transition.ts → reporter-link.ts`; `invoice-pdf.ts ↔ native-billing.ts`) sind aufgelöst. Zyklen erschweren Tree-Shaking, verursachen Init-Reihenfolge-Bugs und blockieren Refactoring. (Drill-down von G-RH01.)

**Warum erreichbar:** Bereits 0. Halten: neuer Zyklus blockt im S2-Gate (`task quality:check`).

```bash
# Eingefrorene S2-Zyklen:
python3 -c "import json,sys; print(sum(1 for v in json.load(sys.stdin).values() if v['gate']=='S2'))" < docs/code-quality/baseline.json
# Unabhängige Gegenprobe:
npx --yes madge --circular --extensions ts,tsx website/src
```

> **Priorität:** C · **Baseline:** 0 (war 4) · **Target:** 0 (erreicht) · **Aufwand:** Gate halten · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-CQ08 — Dead-Code / ungenutzte Exports (website/src): messen → −50 %

**Was:** Toter Code bläht Bundle, Review-Last und Verständlichkeit auf und täuscht S1-Frozen-Schuld vor (z.B. in `website-db.ts`). Bislang ungemessen; `ts-prune` liefert hier unzuverlässig 0 (Resolver/tsconfig-Pfad), daher `knip` als belastbareres Werkzeug.

**Warum erreichbar:** `knip` braucht eine einmalige Minimal-Config, dann ist die Menge ungenutzter Exports reproduzierbar; ≥ 50 % Abbau ist über mehrere Sessions machbar.

```bash
npx --yes knip@latest --directory website --reporter symbols 2>/dev/null | grep -iE 'unused|exports' | head
```

> **Priorität:** B · **Baseline:** unbekannt (knip-Config nötig) · **Target:** ungenutzte Exports −50 % · **Aufwand:** mittel (Setup + Abbau) · **Messzyklus:** monatlich · **Reproduzierbar:** eingeschränkt (Tool-Setup)

## G-CQ09 — S3 hartkodierte Hostnames (Gate): 0 → ≤ 10 (erreicht)

**Was:** Eingefrorene S3-Verstöße (Gate `s3-hostnames`) = hartkodierte Hostnames/Domains in `k3d/`, `prod*/`, `website/src/` außerhalb der Allowlist (`configmap-domains.yaml`, `sitemap.xml.ts`). **0** — der zuvor größte Einzel-Bucket von G-RH01 (24) ist vollständig auf die ConfigMap-SSOT bzw. Brand-Env-Vars umgestellt.

**Warum erreichbar:** Bereits 0. Halten: neuer hartkodierter Host blockt im S3-Gate.

```bash
python3 -c "import json,sys; print(sum(1 for v in json.load(sys.stdin).values() if v['gate']=='S3'))" < docs/code-quality/baseline.json
```

> **Priorität:** C · **Baseline:** 0 (war 24) · **Target:** ≤ 10 (erreicht) · **Aufwand:** Gate halten · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-CQ10 — S4 verwaiste Scripts/Manifeste (Gate): 0 → ≤ 4 (erreicht)

**Was:** Eingefrorene S4-Verstöße (Gate `s4-orphans`) = Scripts/Manifeste unter `scripts/`, `k3d/`, auf die keine `Taskfile`/`kustomization`/Doku/Workflow/Skill mehr verweist. **0** — die zuvor 12 verwaisten Einträge sind gelöscht bzw. mit `reference_sources` in `gates.yaml` verknüpft.

**Warum erreichbar:** Bereits 0. Halten: neuer verwaister Eintrag blockt im S4-Gate.

```bash
python3 -c "import json,sys; print(sum(1 for v in json.load(sys.stdin).values() if v['gate']=='S4'))" < docs/code-quality/baseline.json
```

> **Priorität:** C · **Baseline:** 0 (war 12) · **Target:** ≤ 4 (erreicht) · **Aufwand:** Gate halten · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

---

# 4. Code-Größe & Wachstum

Ergänzt G-RH01/S1 um **Wachstum** statt Bestand (überlappt nicht mit der `baseline.json`).

## G-SIZE01 — Freeze-Frühwarn-Band (80–100 % S1-Limit): 39 → ≤ 15

**Was:** In-Scope-Quelldateien (`gates.yaml scan.code_roots`) bei 80–100 % ihres per-Extension S1-Limits, noch nicht eingefroren. Die nächsten Freeze-Kandidaten — die nächste Funktion kippt sie über das Limit und sie landen als neue G-RH01-Schuld. Mehrere stehen exakt bei 100 % (`templates.test.mjs` 500/500, `theme.mjs` 498/500).

**Warum erreichbar:** Reine Prävention: die ~10 Dateien ≥ 95 % sind kleine, gezielte Splits (1 Helper herausziehen), bevor sie wachsen. Jede entschärfte Datei verhindert direkt einen künftigen G-RH01-Eintrag.

```bash
python3 - <<'PY'
import json,subprocess,os
L={'.astro':400,'.ts':600,'.svelte':500,'.sh':500,'.mjs':500,'.mts':500,'.py':600,'.js':600,'.jsx':600,'.tsx':400,'.cjs':200,'.bash':300}
roots=('website/','tests/','scripts/','brett/','assets/','art-library/','k3d/','prod/','prod-fleet/','environments/','deploy/','claude-code/','openclaw/')
ig={'website/src/lib/system-test-seed-data.ts','scripts/factory/pipeline.js','website/src/lib/website-db.ts','brett/public/lib/GLTFLoader.js','scripts/ticket.sh'}
fz={v['path'] for v in json.load(open('docs/code-quality/baseline.json')).values() if v.get('path')}
n=0
for f in subprocess.check_output(['git','ls-files']).decode().split():
    e=os.path.splitext(f)[1]
    if e not in L or not f.startswith(roots) or f in ig or f in fz or f.startswith('scripts/code-quality/fixtures/'): continue
    if 0.8*L[e] <= sum(1 for _ in open(f,'rb')) <= L[e]: n+=1
print('Warn-Band 80-100%:', n)
PY
```

> **Priorität:** B · **Baseline:** 39 (war 38) · **Target:** ≤ 15 · **Aufwand:** mittel (~3–4 Wochen präventiv) · **Messzyklus:** wöchentlich + Pre-PR auf geänderte Dateien · **Reproduzierbar:** ja

## G-SIZE02 — Großdateien außerhalb Gate-Scope (VideoVault/.opencode): 18 → ≤ 8

**Was:** Quelldateien >600 Zeilen **komplett außerhalb** `gates.yaml scan.code_roots` (15× `VideoVault/`, 3× `.opencode/`) — von keinem Gate überwacht. Während der In-Scope-Bereich sauber ist, wächst hier 65k+ LOC unbeobachtet (bis 1983 Zeilen). Echte Blind-Spot-Schuld, disjunkt von `baseline.json`.

**Warum erreichbar:** `.opencode/` (3 Dateien) mit einem Eintrag in `scan.code_roots` unter Gate-Aufsicht stellen. Für `VideoVault/` die 4–5 größten Splitten — oder den Service laut Routing nach `~/projects/` ausgliedern statt mitwachsen lassen.

```bash
git ls-files VideoVault .opencode | grep -E '\.(ts|tsx|js|mjs|cjs|svelte|astro|sh|py)$' \
  | grep -v node_modules | xargs wc -l 2>/dev/null | grep -v ' total$' | awk '$1>600' | wc -l
```

> **Priorität:** B · **Baseline:** 18 · **Target:** ≤ 8 · **Aufwand:** mittel (~2–3 Wochen) · **Messzyklus:** pro Merge auf VideoVault//.opencode/ · **Reproduzierbar:** ja

## G-SIZE03 — God-File `website/src/lib/website-db.ts`: 4435 → ≤ 3000 Zeilen

**Was:** Größte Nicht-Vendored-Quelldatei (4435 Zeilen, zentrale DB-Zugriffsschicht). Steht in `gates.yaml s1.ignore` und **nicht** in `baseline.json` — weder Freeze noch G-RH01 überwachen sie, sie wächst unbegrenzt. Permanenter Review-/Merge-Konflikt-Hotspot.

**Warum erreichbar:** Split-Pattern im Repo erprobt: `tickets-db.ts` (1096 Zeilen) wurde bereits ausgelagert. Weitere Domänen (Termine, Newsletter, Coaching) analog extrahieren, Pool zentral importiert lassen. Danach aus `s1.ignore` entfernen.

```bash
wc -l < website/src/lib/website-db.ts
```

> **Priorität:** B · **Baseline:** 4435 (war 4485) · **Target:** ≤ 3000 (danach aus `s1.ignore`) · **Aufwand:** mittel-hoch (~2 Wochen) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-SIZE04 — Netto-Quell-LOC/Woche: +3684 → ≤ +2000  ⚠️ OVER BUDGET

**Was:** Netto-Zeilenänderung (added − deleted) der Quellsprachen/Woche, ohne node_modules/Vendored. Ein Budget macht Bulk-Importe als Ausreißer sofort sichtbar, statt unbemerkt G-RH01/S1 zu füllen.

**Warum erreichbar:** ≤ +2000/Woche lässt normale Feature-Arbeit zu. Aktuell +3684 netto (added=35678, deleted=31994) — weiter über Budget. **Achtung Shallow-Clone:** der Graft-Commit (Initial-Import 2026-06-20) muss ausgeschlossen werden (`--since="2026-06-21"`).

```bash
git log --since="2026-06-21" --no-merges --numstat --pretty=tformat: \
  -- '*.ts' '*.tsx' '*.svelte' '*.astro' '*.js' '*.mjs' '*.cjs' '*.sh' '*.py' ':(exclude)**/node_modules/**' \
  | awk 'NF==3 && $1!="-"{a+=$1;d+=$2} END{printf "net=%+d (added=%d deleted=%d)\n",a-d,a,d}'
```

> **Priorität:** A · **Baseline:** +3684 LOC/Woche (ÜBER Budget; war +2887) · **Target:** ≤ +2000/Woche · **Aufwand:** Policy/Analyse · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Graft-Ausschluss nötig)

---

# 5. Dependencies & Supply-Chain

## G-DEP01 — High/Critical npm-Vulnerabilities (website): 6 → 0

**Was:** `pnpm audit` in `website/`: 15 Findings (3 low, 6 moderate, 6 high, 0 critical). Die 6 high: undici (3×, transitiv über jsdom/vitest), ws (DoS), vite (`server.fs.deny`-Bypass), nodemailer (direkt, Header-Bypass). Bekannte, gepatchte Vektoren ungefixt im Build.

**Warum erreichbar:** 5/6 transitiv, über `pnpm.overrides`/`pnpm update` lösbar; nodemailer ist direkt mit verfügbarem Fix. Kein Major-Refactor.

```bash
cd website && timeout 90 pnpm audit --json 2>/dev/null | python3 -c \
"import sys,json; v=json.load(sys.stdin).get('metadata',{}).get('vulnerabilities',{}); print('high+critical:', v.get('high',0)+v.get('critical',0))"
```

> **Priorität:** A · **Baseline:** 6 · **Target:** 0 · **Aufwand:** ~1–2 h · **Messzyklus:** pro Merge / wöchentlich · **Reproduzierbar:** eingeschränkt (Advisory-DB driftet)

## G-DEP02 — Veraltete Major-Deps (website): 9 → ≤ 3

**Was:** `pnpm outdated`: 27 veraltet, 9 Major-Sprünge: astro 6→7, @astrojs/{node,react,svelte}, @sveltejs/vite-plugin-svelte 6→7, nodemailer 8→9, pino 9→10, signature_pad 4→5, rrweb-player 1→2. Major-Drift häuft Breaking-Changes- und Sicherheits-Backlog an.

**Warum erreichbar:** Die 4 Astro-Ökosystem-Bumps wandern koordiniert als ein PR; die übrigen 5 isoliert bumpbar. Realistisch ≤ 3 mit echter API-Migration.

```bash
cd website && timeout 90 pnpm outdated 2>/dev/null   # Major-Sprünge: erste vs. letzte Spalte, andere Major-Zahl
```

> **Priorität:** B · **Baseline:** 9 Major · **Target:** ≤ 3 · **Aufwand:** moderat (~1–2 Tage) · **Messzyklus:** monatlich / Renovate · **Reproduzierbar:** eingeschränkt (Registry driftet)

## G-DEP03 — Package-Manager-Konsistenz website: vereinheitlicht (TARGET ERREICHT ✅)

**Was:** `website/` nutzte zuvor **zwei** Package-Manager parallel (npm-Build + pnpm-Test). Die Inkonsistenz ist jetzt behoben — Dockerfile verwendet pnpm, PM konsistent über Build + Test. `brett/` ist konsistent npm-primär.

**Lehre (historisch):** `website/package-lock.json` zu löschen vor Dockerfile-Umbau brach beide Brands (PR #2101 → Hotfix nötig). Beim Vereinheitlichen immer Build- UND Test-Lane prüfen.

```bash
# Inkonsistenz erkennen: npm im Docker-Build, pnpm im CI-Test
grep -q "npm ci" website/Dockerfile && grep -q "pnpm" .github/workflows/ci.yml   && echo "1 (inkonsistent: npm-Build + pnpm-Test)" || echo "0 (vereinheitlicht)"
```

> **Priorität:** C · **Baseline:** 0 (vereinheitlicht; war inkonsistent) · **Target:** ein PM (pnpm) — erreicht · **Aufwand:** halten · **Messzyklus:** bei Dockerfile-Änderungen · **Reproduzierbar:** ja

## G-DEP04 — Deploybare package.json ohne `engines >= 22.13.0`: 0 → 0 (erreicht, halten)

**Was:** Alle 7 deploybaren `package.json` (root, website, brett, mentolder-web, mediaviewer-widget, VideoVault, studio-server) pinnen jetzt korrekt `engines.node >= 22.13.0`. Zuvor wichen 6/7 ab → stille Node-Version-Drift; jetzt fail-fast konsistent (pnpm 11 braucht ≥ 22.13).

**Warum erreichbar:** Bereits 0. Halten: CI-Guard / neue Pakete mit `engines`-Feld anlegen.

```bash
c=0; for p in package.json website/package.json brett/package.json mentolder-web/package.json \
  mediaviewer-widget/package.json VideoVault/package.json studio-server/package.json; do \
  v=$(python3 -c "import json;print((json.load(open('$p')).get('engines') or {}).get('node','MISSING'))"); \
  [ "$v" != ">=22.13.0" ] && c=$((c+1)); done; echo "abweichend: $c"
```

> **Priorität:** C · **Baseline:** 0 (war 6) · **Target:** 0 (erreicht) · **Aufwand:** CI-Guard halten · **Messzyklus:** einmalig + CI-Guard · **Reproduzierbar:** ja

## G-DEP05 — Renovate/Dependency-PR-Backlog: ≤ 3 (Policy)

**Was:** Offene Dependency-/Renovate-PRs. Der self-hosted Renovate (wöchentlich, T000898) öffnet Update-PRs; ein wachsender Stau bedeutet ungemergte Sicherheits-/Versions-Updates.

**Warum erreichbar:** Aktuell 0 (keine offenen Renovate-PRs). Halten durch zeitnahes Mergen der wöchentlichen Batch. (Hinweis: `gh-axi --json` liefert ein eigenes Textformat — für maschinelles Zählen `gh pr list --json author,labels` nutzen.)

```bash
gh pr list --state open --json author,labels \
  | python3 -c "import sys,json; p=json.load(sys.stdin); print(sum(1 for x in p if x['author'].get('login','').startswith('app/renovate') or any(l['name']=='dependencies' for l in x['labels'])))"
```

> **Priorität:** C · **Baseline:** 0 · **Target:** ≤ 3 · **Aufwand:** Policy · **Messzyklus:** wöchentlich · **Reproduzierbar:** mit gh

## G-IMG01 — Ungepinnte Fremd-Images (kein @sha256): 39 → 0

**Was:** 39 eindeutige Fremd-Images in `k3d/`/`prod*/`, die nur per veränderlichem Tag statt @sha256-Digest referenziert werden (busybox, oauth2-proxy, pgvector, nextcloud:33-apache, livekit/*, grafana/*, prometheus/*, …). Ein Tag kann unter dem Pod neu gepusht werden → stille, nicht reviewte Bytes (Supply-Chain-Risiko). Bewusst auf `:latest` gepinnte **eigene** Images (website, brett, docs, videovault, mediaviewer-widget, mentolder-web) sind ausgeschlossen.

**Warum erreichbar:** Präzedenz: 6 Refs sind bereits digest-gepinnt. Renovate `pinDigests` hält Digests nach dem einmaligen Pinnen automatisch frisch. 43 ist eine endliche Menge (2–3 Sessions).

```bash
grep -rhE '^[[:space:]]*-?[[:space:]]*image:[[:space:]]+["'"'"']?[A-Za-z0-9$]' k3d/ prod*/ 2>/dev/null \
  | grep -v '@sha256' | grep -vE '^[[:space:]]*#' \
  | grep -vE 'website|brett|docs|videovault|mediaviewer-widget|mentolder-web|WEBSITE_IMAGE|STUDIO_IMAGE|STAGING_IMAGE' \
  | sed -E 's/.*image:[[:space:]]*//; s/["'"'"']//g; s/[[:space:]]*#.*//' | sort -u | wc -l
```

> **Priorität:** B · **Baseline:** 39 unique (war 43) · **Target:** 0 · **Aufwand:** 2–3 Sessions + Renovate pinDigests · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-IMG02 — Fremd-Image-Versions-Drift (gleiches Image, ≠ Tags): 0 → 0 (erreicht, halten)

**Was:** Keine Image-Familie mehr in mehreren Versionen gleichzeitig. Zuvor 3 Drifts (busybox 1.36/1.37/1.38.0, kiwigrid/k8s-sidecar 2.5.0/2.7.3, curlimages/curl 8.7.1/8.11.0) — alle auf je eine kanonische Version vereinheitlicht. Reduziert Angriffsfläche/Cache, erleichtert CVE-Triage.

**Warum erreichbar:** Bereits 0. Halten: neue Image-Refs gegen die bestehende kanonische Version prüfen.

```bash
grep -rhE '^[[:space:]]*-?[[:space:]]*image:[[:space:]]+["'"'"']?[A-Za-z0-9$]' k3d/ prod*/ 2>/dev/null \
  | grep -vE '^[[:space:]]*#' | sed -E 's/.*image:[[:space:]]*//; s/["'"'"']//g; s/[[:space:]]*#.*//; s/@sha256.*//' \
  | grep -vE 'website|brett|docs|videovault|mediaviewer-widget|mentolder-web|_IMAGE' \
  | awk -F: '{n=$1; sub(/^docker\.io\//,"",n); sub(/^.*\//,"",n); print n"\t"$0}' | sort -u \
  | awk -F'\t' '{c[$1]++} END{n=0; for(k in c) if(c[k]>1) n++; print n}'
```

> **Priorität:** C · **Baseline:** 0 (war 3) · **Target:** 0 (erreicht) · **Aufwand:** halten · **Messzyklus:** pro Merge an Manifesten · **Reproduzierbar:** ja

---

# 6. Sicherheit, Secrets & Provenienz

## G-SEC01 — Hardcoded Secrets in k3d/*.yaml: 0 (CI-Gate halten)

**Was:** Treffer der CI-Heuristik „Check for secrets in code" (`.github/workflows/ci.yml`): `password.*=.*[^$]` in `k3d/*.yaml` abzüglich erlaubter Referenz-Formen (secretKeyRef, valueFrom, `${..._PASSWORD}`, getenv). Jeder Treffer = hartkodiertes Klartext-Credential in einem öffentlichen Repo.

**Warum erreichbar:** Blockierendes CI-Gate, aktuell 0. Halten: neue Werte über secretKeyRef/SealedSecret statt inline.

```bash
grep -rn 'password.*=.*[^$]' k3d/*.yaml \
  | grep -iv 'secretKeyRef\|configMapKeyRef\|valueFrom\|KEYCLOAK_ADMIN_PASSWORD\|_PASSWORD}\|getenv(' \
  | grep -iv '^\s*#' | wc -l
```

> **Priorität:** C · **Baseline:** 0 · **Target:** 0 dauerhaft · **Aufwand:** Policy (CI-erzwungen) · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-SEC02 — Getrackte Klartext-Secrets im Git-Tree: 0 (git-crypt-Guard grün)

**Was:** `scripts/git-crypt-guard.sh check-tracked` (CI-Schritt „Verify secrets are git-crypt-encrypted"). Prüft, dass jede via `.gitattributes` als Secret markierte, getrackte Datei at-rest git-crypt-verschlüsselt ist. Ein unverschlüsselt committetes Secret = sofortiger Klartext-Leak. *(Doku-Hinweis: `environments/.secrets/**` ist **getrackt + git-crypt-verschlüsselt**, nicht gitignored — die Verschlüsselung, nicht .gitignore, ist die wirksame Kontrolle; CLAUDE.md-Formulierung korrigieren.)*

**Warum erreichbar:** Blockierendes CI-Gate, aktuell Exit 0 (21 getrackte Secrets verschlüsselt). Halten: neue Secrets vor dem Commit unter die git-crypt-Pfade legen.

```bash
bash scripts/git-crypt-guard.sh check-tracked >/dev/null 2>&1; echo "exit=$? (0 = alle verschlüsselt)"
```

> **Priorität:** C · **Baseline:** Exit 0 · **Target:** Exit 0 dauerhaft · **Aufwand:** Policy · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-SEC03 — Älteste SealedSecret-Rotation: 6 Tage → ≤ 90 Tage

**Was:** Alter (Commit-Datum, **nicht** mtime) der am längsten nicht reseal-committeten Datei unter `environments/sealed-secrets/*.yaml`. Lange nicht versiegelte Dateien transportieren potenziell rotationsbedürftige Credentials und vergrößern das Schadenfenster.

**Warum erreichbar:** Alle 5 Overlays sehr frisch (älteste `staging.yaml` ~5 Tage). Garantierte Rotation ≤ 90 Tage = eine `task env:seal`-Session/Quartal.

```bash
oldest=$(for f in environments/sealed-secrets/*.yaml; do git log -1 --format='%at' -- "$f"; done | sort -n | head -1)
echo "$(( ($(date +%s)-oldest)/86400 )) Tage (älteste sealed-secrets-Datei)"
```

> **Priorität:** C · **Baseline:** 6 Tage · **Target:** ≤ 90 Tage · **Aufwand:** ~1 Reseal/Quartal · **Messzyklus:** monatlich · **Reproduzierbar:** ja (git-Commit-Datum)

## G-SEC04 — Sealing-Cert Restlaufzeit: ≥ 30 Tage (passiver Monitor)

**Was:** Geringste Restlaufzeit aller committeten Sealing-Zertifikate (`environments/certs/*.pem`). Läuft eines ab, schlägt künftiges Versiegeln fehl und ein Cluster-Reset kann alte Sealed-Files nicht mehr neu erzeugen.

**Warum erreichbar:** Aktuell ~3621 Tage (gültig bis 2036) — bis dahin trivial erfüllt. Reiner Frühwarn-Monitor (< 30 Tage); `task env:fetch-cert` frischt bei Cluster-Reset ohnehin auf. **Niedrige Priorität** (auf Thesis-Horizont nie ausgelöst).

```bash
for f in environments/certs/*.pem; do \
  d=$(( ($(date -d "$(openssl x509 -enddate -noout -in "$f" | cut -d= -f2)" +%s)-$(date +%s))/86400 )); \
  echo "$d $(basename "$f")"; done | sort -n | head -1
```

> **Priorität:** C · **Baseline:** 3621 Tage · **Target:** ≥ 30 Tage Warnschwelle · **Aufwand:** Monitor · **Messzyklus:** monatlich · **Reproduzierbar:** ja

## G-SEC05 — Unsignierte Commits auf main (letzte 50): 66 % → ≤ 5 %  ⚠️ REGRESSION

**Was:** Anteil der letzten 50 main-Commits ohne gültige Signatur (`%G?` = `N`). **33/50 unsigned (66 %) — massive Regression** gegenüber 0/50 vom letzten Refresh. Ursache: `auto-regenerate freshness artifacts`-Commits (bot-generiert, kein GPG-Signing) dominieren die letzten 50. Signierte PR-Squash-Merges (`E`) werden von bot-Commits überlagert.

**Warum erreichbar:** Lösung: `freshness-regen.yml` Workflow mit `git -c commit.gpgsign=false` vs. signierter Bot-Identität konfigurieren, oder Bot-Commits in der Zählung ausschließen (Filterung nach Autor). Alternativ: `git log -50 --pretty='%G? %ae' main | grep -v 'auto-generate'` als adjusted metric.

```bash
git log -50 --pretty='%G?' main | grep -c N
# Adjusted (ohne freshness-Bot):
git log -50 --pretty='%G? %s' main | grep -v 'auto-regenerate' | awk '{print $1}' | grep -c N
```

> **Priorität:** A · **Baseline:** 33/50 (66 % unsigned; war 0 %; Ursache: freshness-regen-Bot) · **Target:** ≤ 5 % · **Aufwand:** ~0.5 Tag (Bot-Signing oder adjusted Metric) · **Messzyklus:** monatlich · **Reproduzierbar:** ja (driftet mit neuen Commits)

---

# 7. Infrastruktur (K8s, Config, Daten)

## G-K8S01 — Deployments ohne Resource-Limits/Requests: 0/34 (halten)

**Was:** Alle 34 Deployments in `k3d/*.yaml` setzen auf jedem Container `resources.limits` UND `.requests`. Ohne Limits = Noisy-Neighbor/OOM auf dem geteilten fleet-Cluster. Aktuell schuldfreie 100 %-Abdeckung.

**Warum erreichbar:** Baseline 0 fehlend. Halten: kein neues Deployment ohne `resources` mergen (kustomize-build-Lint je PR).

```bash
python3 -c "import yaml,glob; D=[s for f in glob.glob('k3d/*.yaml') for s in yaml.safe_load_all(open(f)) if isinstance(s,dict) and s.get('kind')=='Deployment']; print(sum(1 for x in D if not all(c.get('resources',{}).get('limits') and c.get('resources',{}).get('requests') for c in x['spec']['template']['spec']['containers'])),'of',len(D))"
```

> **Priorität:** C · **Baseline:** 0/34 · **Target:** dauerhaft 0 · **Aufwand:** Policy · **Messzyklus:** pro neuem Deployment · **Reproduzierbar:** ja

## G-K8S02 — Deployments ohne readinessProbe: 3 → ≤ 3 (Target erreicht)

**Was:** 3/34 Deployments ohne readinessProbe (war 10/34). Die verbleibenden 3 dürfen begründet probe-los bleiben (livekit-egress/-ingress headless/hostNetwork, recovery-browser ephemer). Ohne readinessProbe leitet Traefik Traffic an nicht-bereite Pods → 502/503 bei Rollouts.

**Warum erreichbar:** Bereits auf Target. Halten: neue HTTP/TCP-exponierende Deployments mit Probe (~5 Zeilen YAML) anlegen.

```bash
python3 -c "import yaml,glob; D=[s for f in glob.glob('k3d/*.yaml') for s in yaml.safe_load_all(open(f)) if isinstance(s,dict) and s.get('kind')=='Deployment']; print(sum(1 for x in D if not all(c.get('readinessProbe') for c in x['spec']['template']['spec']['containers'])),'of',len(D))"
```

> **Priorität:** C · **Baseline:** 3/34 (war 10/34) · **Target:** ≤ 3 (erreicht) · **Aufwand:** halten · **Messzyklus:** pro Manifest-Änderung · **Reproduzierbar:** ja

## G-K8S03 — Deployments ohne securityContext: 3 → 0

**Was:** 3/34 ohne pod- oder container-level securityContext: livekit-egress, sealed-secrets-controller, sessions-server. Default = potenziell root, allowPrivilegeEscalation, alle Capabilities → vermeidbare Angriffsfläche.

**Warum erreichbar:** Minimaler Context (`runAsNonRoot`, `allowPrivilegeEscalation:false`, `capabilities.drop:[ALL]`) ~6 Zeilen; der upstream-vendored sealed-secrets-controller per Overlay patchbar. 3 Einträge (~0.5 Tag).

```bash
python3 -c "import yaml,glob; D=[s for f in glob.glob('k3d/*.yaml') for s in yaml.safe_load_all(open(f)) if isinstance(s,dict) and s.get('kind')=='Deployment']; print([x['metadata']['name'] for x in D if not x['spec']['template']['spec'].get('securityContext') and not all(c.get('securityContext') for c in x['spec']['template']['spec']['containers'])])"
```

> **Priorität:** B · **Baseline:** 3/34 · **Target:** 0 · **Aufwand:** ~0.5 Tag · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-K8S04 — `workspace:validate` grün: Exit 0 (halten)

**Was:** `task workspace:validate` baut/validiert die k3d-Kustomize-Base (kubectl dry-run, 162 Ressourcen). Ein roter Exit blockiert jeden Prod-Deploy (push-based wendet genau diese Base an).

**Warum erreichbar:** Aktuell Exit 0, Teil von `task test:all` (CI-Gate vor jedem Merge). Halten: kein roter Stand auf main.

```bash
timeout 150 task workspace:validate >/dev/null 2>&1; echo "Exit: $?"
```

> **Priorität:** C · **Baseline:** Exit 0 (162 Ressourcen) · **Target:** Exit 0, immer · **Aufwand:** Policy · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-CFG01 — `env:validate:all` grün: Exit 0 (behoben, halten)

**Was:** `task env:validate:all` prüft jedes `environments/<env>.yaml` gegen `environments/schema.yaml` (autoritative Var-Liste). **Jetzt grün (Exit 0):** der zuvor fehlende `POCKET_ID_DOMAIN` (4 Umgebungen) wurde ergänzt — alle envs schema-konform. Drift gegen das Schema schlägt sonst erst spät beim Prod-Deploy (`envsubst`/Setup) fehl. CLAUDE.md nennt envsubst/schema-Sync explizit als Footgun.

**Warum erreichbar:** Bereits behoben. Halten: neue `${VAR}`-Referenz immer in `environments/schema.yaml` + envsubst-Listen registrieren (siehe envsubst-Footgun).

```bash
task env:validate:all; echo "exit=$?"
```

> **Priorität:** C · **Baseline:** Exit 0 (war FAIL Exit 5; POCKET_ID_DOMAIN ergänzt) · **Target:** Exit 0 (erreicht) · **Aufwand:** Policy · **Messzyklus:** pro Merge (CI-tauglich) · **Reproduzierbar:** ja

## G-DATA01 — DB-Backup-Freshness: jüngster Erfolg < 26h + 0 Failed/7d

**Was:** Der `db-backup`-CronJob (`schedule '0 2 * * *'`) sichert die geteilte PostgreSQL. DSGVO-/Thesis-kritisch (alles on-premise, kein Cloud-Fallback). Ein lautlos hängender Backup-Job = Datenverlust-Risiko — bislang kein Health-Gate dafür.

**Warum erreichbar:** Aktuell gesund (jüngster Complete-Job ~5 h alt, `lastSuccessfulTime` 2026-06-27T00:01:42Z; **0 Failed-Jobs im 7-Tage-Fenster** — die 2 Failures sind 8 bzw. 12 Tage alt, außerhalb des Fensters). Ein 26h-Frische-Check + „0 Failed-Jobs/7d" formalisiert nur die Überwachung. Cluster-abhängig (`fleet`-Kontext).

```bash
kubectl --context fleet -n workspace get cronjob db-backup -o jsonpath='{.status.lastSuccessfulTime}'; echo
kubectl --context fleet -n workspace get jobs -l app=db-backup --sort-by=.metadata.creationTimestamp | tail -3
```

> **Priorität:** C · **Baseline:** gesund (~5h, 0 Failed/7d) · **Target:** jüngster Erfolg < 26h UND 0 Failed/7d · **Aufwand:** Monitor (+ optional Alert) · **Messzyklus:** täglich · **Reproduzierbar:** eingeschränkt (Cluster nötig)

---

# 8. CI/CD & Delivery (DORA)

> **Hinweis zu Erfolgsraten (G-CI/G-CD):** `gh run list --limit N` ist ein **gleitendes Fenster** — der Wert verschiebt sich mit jedem neuen Lauf. Für stabile, reproduzierbare Messung ein fixes `--created`-Zeitfenster verwenden.

## G-CI01 — main `ci.yml`-Erfolgsrate (letzte 20): 85 % → ≥ 95 %  ⚠️ UNTER TARGET

**Was:** Anteil erfolgreicher `ci.yml`-Push-Läufe auf main (bündelt die required Jobs Offline Tests, Security Scan, Brett TS, Vitest). Sinkende Rate = fehlerhafte Commits landen trotz grünem PR auf main (Merge-Skew, flaky Gates).

**Warum erreichbar:** Aktuell 17/20 grün (2 Cancelled; 85 %, weiter unter Target ≥95 %). Da PRs nur mit grünem Gate squash-gemergt werden, ist ≥ 95 % reine Erhaltung (kein Direct-/Force-Push, flaky Tests fixen statt rerun).

```bash
timeout 60 gh-axi run list --workflow ci.yml --branch main --limit 20 \
  | grep -oE 'completed,(success|failure|cancelled)' | sort | uniq -c
```

> **Priorität:** A · **Baseline:** 85 % (17/20, 2 cancelled; war 90 %) · **Target:** ≥ 95 % · **Aufwand:** untersuchen · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (gleitendes Fenster)

## G-CI02 — Rote required-Läufe auf main-HEAD: 0

**Was:** failure-Konklusionen unter den letzten 5 `ci.yml`-Läufen auf main. Ein rotes Gate auf main-HEAD = der aktuelle Stand würde das eigene Merge-Gate nicht bestehen; Folgemerges bauen auf rotem Fundament.

**Warum erreichbar:** Aktuell 0 rote, neuester Lauf grün. Branch-Protection erzwingt 5 required checks → ein roter main-HEAD ist Sofort-Eskalation, kein Dauerzustand.

```bash
timeout 60 gh-axi run list --workflow ci.yml --branch main --limit 5 | grep -c 'completed,failure'
```

> **Priorität:** C · **Baseline:** 0 rote · **Target:** dauerhaft 0 · **Aufwand:** Policy · **Messzyklus:** täglich · **Reproduzierbar:** eingeschränkt (gleitendes Fenster)

## G-CD01 — korczewski Website-Deploy-Erfolgsrate: 53 % → ≥ 90 %  ⚠️ ECHTE SCHULD

**Was:** Erfolgsrate von `build-website-korczewski.yml` (letzte 15 main-Läufe): **8/15 grün** (7 Failures; verbessert von 27 %, aber noch weit unter Target). web.korczewski.de wird bei den meisten Pushes **nicht** neu deployt → driftet still gegen main, während mentolder live geht. Der stärkste konkrete CD-Defekt.

**Warum erreichbar:** Der Schwester-Workflow `build-website.yml` (mentolder) steht bei 15/15 (100 %) mit identischer Mechanik. Differenz ist Konfig-/Credential-Problem (vermutlich Kubeconfig/Secret/Context der korczewski-Lane) — per `gh-axi run view <id> --log-failed` in ~1 Session behebbar. (Wert unverändert seit letztem Refresh.)

```bash
timeout 60 gh-axi run list --workflow build-website-korczewski.yml --branch main --limit 15 \
  | grep -oE 'completed,(success|failure)' | sort | uniq -c
```

> **Priorität:** A · **Baseline:** 53 % (8/15; T001276 offen) · **Target:** ≥ 90 % · **Aufwand:** ~1 Debug-Session · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (gleitendes Fenster)

## G-CD02 — `post-merge.yml`-Erfolgsrate: 100 % → ≥ 95 % (TARGET ERREICHT ✅)

**Was:** Erfolgsrate des post-merge-Workflows (letzte 15: 15/15 = 100 %; war 93%). Ein roter Lauf = nachgelagerte Schritte (Freshness-Regen/Deploy-Trigger) schlagen nach Merge fehl, ohne den Merge zu blocken → stille Drift main ↔ generierte Artefakte/Cluster.

**Warum erreichbar:** Bereits auf Target (verbessert von 93 %). Halten.

```bash
timeout 60 gh-axi run list --workflow post-merge.yml --branch main --limit 15 \
  | grep -oE 'completed,(success|failure)' | sort | uniq -c
```

> **Priorität:** C · **Baseline:** 100 % (15/15; war 93 %) · **Target:** ≥ 95 % (erreicht) · **Aufwand:** halten · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (gleitendes Fenster)

---

### DORA-Metriken (G-DORA01–04)

> **Autoritative Quelle:** `/admin/dora`-Dashboard + DB-View `v_timeline` (`openspec/changes/dora-delivery-pipeline`). Die git-Befehle unten sind **Shallow-Clone-Orientierung**, kein reproduzierbarer Durchsatz — auf einem Voll-Clone bzw. via DB liefern dieselben Definitionen echte 4-/8-Wochen-Mittel. Alle vier Metriken liegen aktuell im **Elite-Band**; die Ziele sind daher *Sustain/Tracking*-Ziele.

## G-DORA01 — Deployment Frequency: Elite halten (≥ 1 Merge/Werktag)

**Was:** Merges nach main/Woche (first-parent-Commits, squash-and-merge). Spiegelt „Deployment Frequency" aus `dora-dashboard.md` (ehrlich als „Merges nach main" gelabelt, da Prod-Deploy push-basiert entkoppelt). Sinkende Frequenz = größere, seltenere Batches → mehr Konflikte/Risiko.

**Warum erreichbar:** Real ~31 Merges/Tag (157 in 5d; weit im Elite-Band). Ziel: Niveau halten + auf `/admin/dora` sichtbar tracken, damit ein Einbruch (Factory-Stillstand) sofort auffällt.

```bash
git log --since="4 weeks ago" --first-parent --oneline main | wc -l   # /4 = Merges/Woche (NUR auf Voll-Clone aussagekräftig)
```

> **Priorität:** C · **Baseline:** ~220/Woche (~26/Tag; Shallow-Artefakt) · **Target:** ≥ 5/Woche, Trend auf /admin/dora · **Aufwand:** Policy/Tracking · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Shallow → DB)

## G-DORA02 — Lead Time (PR-open → merge): Elite-Median ≤ 1h halten

**Was:** Zeit PR-Eröffnung → Merge über zuletzt gemergte PRs. Approximiert die DORA-Lead-Time aus `dora-dashboard.md`. *Caveat:* Der PR-open→merge-Median (0.03h) misst de facto **Auto-Merge-Bot-Latenz**, nicht die volle Lead Time (erster Commit → Prod) — letztere nur über `v_timeline` (ticket.created_at → merged_at).

**Warum erreichbar:** Pipeline-Latenz bereits Elite (Median 0.03h, Mean 0.29h). Ziel: nicht verfallen lassen (CI grün, Auto-Merge sauber); volle Lead Time als v_timeline-Drilldown.

```bash
gh-axi api 'repos/{owner}/{repo}/pulls?state=closed&base=main&per_page=80&sort=updated&direction=desc' \
  | grep -E '^\s+(created_at|merged_at):'   # Differenzen via DB/v_timeline für spec-exakte Lead Time
```

> **Priorität:** C · **Baseline:** Median 0.03h (PR→merge-Proxy) · **Target:** Median ≤ 1h; Max-Ausreißer < 24h · **Aufwand:** Policy · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Proxy ≠ Spec; DB für exakt)

## G-DORA03 — Change Failure Rate (Proxy): ≤ 15 % halten

**Was:** Anteil Merges mit späterem Rollback/Fix. Spiegelt `dora-dashboard.md` (CFR = (Reverts + Bug-Tickets)/Merges, explizit Proxy). git-strikt = revert/hotfix-Commits (0 %); git-breit zählt `fix()`-Commits als Bug-Näherung (15.9 %). *Caveat:* `fix()` ≠ Prod-Ausfall — spec-exakte CFR braucht Bug-Tickets aus der DB.

**Warum erreichbar:** Strikte Revert-Rate 0 %; breiter Proxy 15.9 % knapp über Elite (0–15 %). Rückgang ≤ 15 % über konsequente Bug-Triage + CI-Gates.

```bash
T=$(git log --since="8 weeks ago" --first-parent --oneline main | wc -l)
R=$(git log --since="8 weeks ago" --first-parent --oneline main | grep -ciE 'revert|hotfix')
F=$(git log --since="8 weeks ago" --first-parent --oneline main | grep -ciE '^[0-9a-f]+ fix\(')
python3 -c "print(f'merges={$T} reverts={$R} ({$R/$T*100:.1f}% strikt) +fix()={$F} -> {($R+$F)/$T*100:.1f}% breit')"
```

> **Priorität:** B · **Baseline:** 15.9 % breit / 0 % strikt · **Target:** ≤ 15 % (Elite), strikt 0 % · **Aufwand:** ~1 Woche + laufend · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Shallow/Proxy; DB für exakt)

## G-DORA04 — MTTR: Median < 24h halten

**Was:** Zeit fehlerhafter Merge → Fix/Revert. Spiegelt `dora-dashboard.md` (MTTR = Median `merged_at(Fix-PR) − created_at` über `type='bug'`). git-Proxy: Zeitspanne Revert/Hotfix → zurückgerollter Commit. *Caveat:* aktuell 0 Recovery-Fälle im sichtbaren Fenster → MTTR = n/a (kein realer Messwert, Platzhalter).

**Warum erreichbar:** Squash + Auto-Merge erlauben schnelle Folge-PRs; `incident-response`-Skill existiert. < 24h (Elite < 1h) bei künftigen Störungen gut erreichbar. Volle MTTR über Bug-Tickets via `v_timeline`.

```bash
git log --since="8 weeks ago" --first-parent --format='%ct %s' main | grep -iE 'revert|hotfix' | wc -l   # 0 = kein Recovery-Fall
```

> **Priorität:** C · **Baseline:** n/a (0 Recovery-Fälle) · **Target:** Median < 24h bei Störungen · **Aufwand:** Policy (Revert-Bereitschaft) · **Messzyklus:** pro Incident · **Reproduzierbar:** eingeschränkt (DB für exakt)

---

# 9. Prozess & Repo-Hygiene

## G-GIT01 — Offene PRs älter als 7 Tage: 0

**Was:** Offene PRs >7 Tage = Review-Stau: divergieren von main, sammeln Konflikte (CONFLICTING blockt sogar CI), binden Kontext. Ergänzt G-RH04 (stale Branches) um die PR-Flow-Seite.

**Warum erreichbar:** Aktuell 0 (0 offene PRs). Reine Disziplin: `gh pr merge --squash --auto` direkt nach PR-Erstellung hält die Liste leer.

```bash
gh pr list --state open --json number,createdAt | python3 -c "
import sys,json; from datetime import datetime,timezone
p=json.load(sys.stdin); n=datetime.now(timezone.utc)
a=[(n-datetime.fromisoformat(x['createdAt'].replace('Z','+00:00'))).days for x in p]
print('open:',len(p),'| >7d:',sum(x>7 for x in a),'| oldest:',max(a) if a else 0,'d')"
```

> **Priorität:** C · **Baseline:** 0 >7d (0 offen) · **Target:** dauerhaft 0 · **Aufwand:** Policy · **Messzyklus:** täglich · **Reproduzierbar:** mit gh

## G-GIT02 — Non-conventional Commit-Subjects (letzte 30 auf main): 0

**Was:** Letzte 30 main-Subjects ohne Conventional-Commits-Typ (feat|fix|chore|docs|refactor|test|ci|build|perf|style). Nicht-konforme Subjects brechen die LLM-Release-Notes (`scripts/vda.sh release-notes`) und das Changelog (parst Typ-Prefixes).

**Warum erreichbar:** Aktuell 0/30. Der required Check „Conventional Commits" erzwingt PR-Titel beim Squash-Merge. Stay-Green: Gate nicht aufweichen, keine Direkt-Pushes.

```bash
git log --format=%s -30 origin/main | grep -vcE '^(feat|fix|chore|docs|refactor|test|ci|build|perf|style)(\(|!|:)'
```

> **Priorität:** C · **Baseline:** 0/30 · **Target:** dauerhaft 0 · **Aufwand:** Policy (CI-Gate) · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-GIT03 — Dateien > 1MB im Tree (kein LFS): 7 → ≤ 6  ⚠️ REGRESSION

**Was:** 7 git-getrackte Dateien >1MB (war 6), git-lfs inaktiv. Neu: `docs-content-built/search-index.json` (~2.6MB). Verbleibend: `kube-prometheus-stack-rendered.yaml` (~4.8MB), 2× datamodel-workflow.html + db-schema.html (generierte docs-HTML, je ~2MB), `assets/grilling-brett-admin-panel/Brett` (~2MB), `environments/korczewski/KERN` (~1MB). Die überdimensionierten OG-PNGs sind optimiert. Große Blobs blähen jeden Clone auf.

**Warum erreichbar:** Regression: `search-index.json` in `docs-content-built/` ist neu >1MB. Fix: gitignore oder LFS-tracken. Prometheus-YAML bleibt kandidat für weiteren Abbau.

```bash
git ls-files -z | xargs -0 -I{} sh -c 'test -f "{}" && wc -c "{}"' 2>/dev/null \
  | awk '$1>1048576{c++} END{print c+0}'
```

> **Priorität:** A · **Baseline:** 7 (war 6; Regression: search-index.json) · **Target:** ≤ 6 · **Aufwand:** halten + optional Prometheus-YAML gitignoren · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-SPEC01 — `openspec:validate` grün: Exit 0 (TARGET ERREICHT ✅)

**Was:** Fail-closed CI-Gate `task openspec:validate` (`scripts/openspec.sh`) prüft jeden nicht-archivierten change auf gültige `specs/`-Delta-Struktur + `.ticket`-Verknüpfung. **Aktuell Exit 0** — war Exit 1 (8 FAIL, 2 WARN). Halten: kein neuer Skeleton-Change ohne `specs/`-Delta.

```bash
timeout 120 bash scripts/openspec.sh validate >/dev/null 2>&1; echo "exit=$?"
```

> **Priorität:** C · **Baseline:** Exit 0 (war Exit 1; FIXED ✅) · **Target:** Exit 0 · **Aufwand:** halten · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-SPEC02 — Nicht-archivierte changes älter als 30 Tage: 0

**Was:** Nicht-archivierte Proposals unter `openspec/changes/`, deren erster Commit >30 Tage alt ist — vergessene Skelette oder umgesetzte, aber nicht via `openspec:archive` zurückgeführte changes. Bläht den changes-Baum auf (analog G-RH05, aber auf Verzeichnis- statt Ticket-Ebene).

**Warum erreichbar:** Aktuell 0 (älteste 6 Tage). Keep-at-0: beim Merge archivieren, verwaiste Skelette löschen.

```bash
NOW=$(date +%s); n=0
for d in openspec/changes/*/; do b=$(basename "$d"); [ "$b" = archive ] && continue
  ts=$(git log --diff-filter=A --format='%ct' -- "$d" | tail -1); [ -z "$ts" ] && continue
  [ $(((NOW-ts)/86400)) -gt 30 ] && n=$((n+1)); done; echo "older30=$n"
```

> **Priorität:** C · **Baseline:** 0 (18 nicht-archiviert, alle ≤30d) · **Target:** dauerhaft 0 · **Aufwand:** Policy · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-SPEC03 — Proposals ohne Ticket-Verknüpfung (.ticket): 12 → 0

**Was:** 12/28 nicht-archivierte changes ohne `.ticket`-Datei (externe Ticket-ID; war 10/18, 10 neue Changes hinzugekommen). Ohne sie kann `openspec.sh` den Status nicht auf `plan_staged` ziehen; Rückverfolgbarkeit Proposal→Ticket→Merge geht verloren.

**Warum erreichbar:** Für echte Proposals nur `echo Txxxxxx > openspec/changes/<slug>/.ticket`. Skelette entfernen oder archivieren. ~0.5–1 Tag.

```bash
m=0; for d in openspec/changes/*/; do b=$(basename "$d"); [ "$b" = archive ] && continue
  [ -f "$d/.ticket" ] || m=$((m+1)); done; echo "no-ticket=$m"
```

> **Priorität:** B · **Baseline:** 12/28 (war 10/18) · **Target:** 0 · **Aufwand:** ~0.5–1 Tag · **Messzyklus:** pro neuem Proposal · **Reproduzierbar:** ja

---

# 10. Dokumentation

## G-DOC01 — Defekte interne Doc-Links: 0 → 0 (erreicht, halten)

**Was:** Relative `.md`-Links in Root-MDs + `docs/`, die auf nicht existierende Ziele zeigen: **0/27** (war 9/29). Die zuvor defekten Links (db-audit-Cross-Reference, Prosa-`file.md`, fehlende `behaviors/*.md` + `prompts/*.md`) sind behoben (PR #2125). Tote Doku → Leser und Agenten (plan-context-Auflösung) laufen ins Leere.

**Warum erreichbar:** Bereits 0. Halten: read-only-Check ist CI-tauglich, kein neuer toter Link mergen.

```bash
python3 - <<'PY'
import os,re,glob
fs=glob.glob("*.md")+glob.glob("docs/**/*.md",recursive=True)
rx=re.compile(r"\]\(([^)\s]+)\)"); bad=0; tot=0
for f in fs:
    b=os.path.dirname(f)
    for m in rx.finditer(open(f,encoding="utf-8",errors="ignore").read()):
        u=m.group(1).strip("<>"); p=u.split("#")[0]
        if u.lower().startswith(("http","mailto:","#","tel:","data:")) or not p.endswith(".md"): continue
        tot+=1; r=p[7:] if p.startswith("file://") else p
        r=os.path.normpath(r if r.startswith("/") else os.path.join(b,r))
        if not os.path.exists(r): bad+=1
print(f"checked={tot} broken={bad}")
PY
```

> **Priorität:** C · **Baseline:** 0 (von 27; war 9/29) · **Target:** 0 (erreicht) · **Aufwand:** Policy · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-DOC02 — Root-CLAUDE.md Zeilen: 273 → ≤ 200

**Was:** Zeilenzahl der bei jedem Request geladenen Orchestrator-Instruktion. 273 Zeilen; allein „Gotchas & Footguns" = 109 Zeilen (40 %). Je länger, desto eher gehen Routing-/Workflow-Regeln im Footgun-Wust unter und Tokens/Turn werden verschwendet.

**Warum erreichbar:** Footgun-Block fast 1:1 in eine referenzierte Doku auslagerbar (REFERENCE-GOTCHAS.md existiert im Auto-Memory-Schema); in CLAUDE.md bleibt ein Pointer. Reines Verschieben, kein Informationsverlust.

```bash
wc -l < CLAUDE.md
```

> **Priorität:** B · **Baseline:** 273 · **Target:** ≤ 200 · **Aufwand:** mittel (~1 Session) · **Messzyklus:** bei jedem CLAUDE.md-Edit · **Reproduzierbar:** ja

## G-DOC03 — README-Index in Hauptverzeichnissen: 1/5 → 5/5

**Was:** README-Präsenz in `website/`, `brett/`, `scripts/`, `tests/`, `k3d/`. Nur `brett/` hat eines; scripts/tests/k3d ohne Einstiegspunkt → Onboarding und Thesis-Reproduzierbarkeit leiden.

**Warum erreichbar:** 4 kurze README/Index-Dateien (~20–40 Zeilen: Zweck, wichtigste Dateien/Tasks). `website/` darf auf CLAUDE.md + WEBSITE-STANDARDS.md verweisen. Einmalig, niedrig.

```bash
c=0; for d in website brett scripts tests k3d; do ls "$d"/README* >/dev/null 2>&1 && c=$((c+1)); done; echo "$c/5"
```

> **Priorität:** B · **Baseline:** 1/5 · **Target:** 5/5 · **Aufwand:** ~2–3 h · **Messzyklus:** pro neuem Top-Level-Verzeichnis · **Reproduzierbar:** ja

## G-DOC04 — Architektur-ADRs: 0 → ≥ 5

**Was:** Kein `docs/adr/` und keine ADR-Datei. Mehrere große, schwer umkehrbare Entscheidungen (Fleet-Konsolidierung, push-basiertes Deploy ohne GitOps, Brand-Namespace-Split, LLM fail-closed ohne Cross-Space-Fallback, Merge=Abschluss-Ticketmodell) sind nur verstreut in CLAUDE.md erwähnt — für eine Bachelorarbeit ein Verteidigungsrisiko.

**Warum erreichbar:** Entscheidungen sind getroffen und bekannt; nur im ADR-Format niederschreiben (Kontext, Entscheidung, Alternativen, Konsequenzen). ~30–45 min/ADR; 5 decken die wichtigsten irreversiblen Weichen.

```bash
adr=$(find docs -ipath '*adr*' -name '*.md' 2>/dev/null | wc -l); echo "ADR .md: $adr | dir: $([ -d docs/adr ] && echo yes || echo no)"
```

> **Priorität:** B · **Baseline:** 0 · **Target:** ≥ 5 in docs/adr/ · **Aufwand:** mittel (~5×30–45 min) · **Messzyklus:** bei neuer Architekturentscheidung · **Reproduzierbar:** ja

---

# 11. Frontend-Qualität (Perf / A11y / Observability)

## G-FE01 — Accessibility: 0 critical/serious axe-Violations (Kern-Routen beider Marken)

**Was:** Kein a11y-Tooling vorhanden (nur Playwright, kein axe/pa11y/lighthouse), keine `toHaveNoViolations`-Assertion. Die Website bedient zwei öffentliche Marken (mentolder.de, korczewski.de) — Barrierefreiheit ist rechtlich relevant (BFSG/EAA) und ein komplett fehlender Qualitätsaspekt.

**Warum erreichbar:** `@axe-core/cli` gegen die gebaute Preview ist ein abgegrenztes Setup; 0 critical/serious auf Startseite + Kern-Routen ist ein realistischer Erst-Standard. Später als Playwright-Assertion ins E2E.

```bash
pnpm --dir website build >/dev/null 2>&1 && (pnpm --dir website exec astro preview --port 4321 &) ; sleep 6
npx --yes @axe-core/cli http://localhost:4321 http://localhost:4321/ueber-mich --exit
```

> **Priorität:** B · **Baseline:** unbekannt (kein a11y-Tool) · **Target:** 0 critical/serious (Kern-Routen) · **Aufwand:** mittel (Setup + Fixes) · **Messzyklus:** pro Release · **Reproduzierbar:** eingeschränkt (Build + Tool nötig)

## G-FE02 — Client-JS-Bundle-Budget: messen → kein Netto-Zuwachs/Release

**Was:** Astro liefert idealerweise minimal Client-JS; Svelte-Islands + Wachstum können das unbemerkt aufblähen (LCP/TTI). Kein Bundle-Size-Budget, keine Messung — fehlender Performance-Health-Aspekt für ein Nutzerprodukt.

**Warum erreichbar:** Nach einem Astro-Build ist die Client-JS-Summe trivial messbar; ein Budget (kein Netto-Zuwachs ggü. aktuellem Wert pro Release) ist reine Policy. Optional als CI-Check nach Build.

```bash
pnpm --dir website build >/dev/null 2>&1 && find website/dist -name '*.js' -path '*_astro*' -printf '%s\n' 2>/dev/null \
  | awk '{s+=$1} END{printf "client JS total: %.0f KiB\n", s/1024}'
```

> **Priorität:** B · **Baseline:** unbekannt (Voll-Build nötig) · **Target:** Budget setzen, kein Netto-Zuwachs/Release · **Aufwand:** gering (Messung) + Policy · **Messzyklus:** pro Release · **Reproduzierbar:** eingeschränkt (Build nötig)

## G-FE03 — Stray `console.log/debug/info` + strukturiertes Logging: 0 stray → 0 + Logger

**Was:** `website/src` hat **0** stray `console.log/debug/info` (war 3 — Dev-Reste entfernt), nutzt aber weiter 141 rohe `console.error/warn` (war 109, Regression +32) und keinen strukturierten Logger (kein pino/winston). Unstrukturiertes Log-Rauschen ohne Level/Korrelation in Prod-Pods erschwert Incident-Triage.

**Warum erreichbar:** Stray-Teil bereits erledigt. Verbleibend: ein schmaler Logger-Wrapper (error/warn über strukturierten Logger) als abgegrenzter Schritt — error/warn lassen sich migrieren statt umschreiben.

```bash
echo -n "log/debug/info: "; grep -rEn 'console\.(log|debug|info)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l
echo -n "error/warn: ";     grep -rEn 'console\.(error|warn)'      website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l
```

> **Priorität:** B · **Baseline:** 0 stray (war 3; +141 error/warn) · **Target:** 0 stray + strukturierter Logger · **Aufwand:** mittel (Logger) · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

---

# Zusammenfassung

**Legende Reproduzierbar:** ✅ = stabil/deterministisch · ⚠️ = eingeschränkt (siehe Mess-Disziplin oben).

| ID | Ziel | Baseline | Target | Aufwand | Repro |
|----|------|----------|--------|---------|:---:|
| **G-RH01** | Baselined Gate-Violations (gesamt) | 28 ✓ | ≤ 30 | halten | ✅ |
| **G-RH02** | TypeScript-Suppressionen | 0 | 0 | erreicht | ✅ |
| **G-RH03** | OpenSpec-BATS-Abdeckung | 46 % | ≥ 60 % | ~2 Wo | ✅ |
| **G-RH04** | Stale Remote Branches | 0 | 0 | Policy | ✅ |
| **G-RH05** | Plan-Staged idle >14d | 0 | 0 | laufend | ✅ |
| **G-RH06** | Sentinel-Issues >48h | 0 | 0 | Policy | ✅ |
| **G-RH07** | Freshness-Check grün | Exit 0 | Exit 0 | Policy | ✅ |
| **G-TEST01** | BATS Debt-Skips | 9 | 0 | ~1–2 Wo | ✅ |
| **G-TEST02** | Vitest `.only` | 0 | 0 | Policy | ✅ |
| **G-TEST03** | Vitest skip/todo-Suiten | 3 | 0 | ~1 Wo | ✅ |
| **G-TEST04** | Test-Inventory-Drift | 0 | 0 | Policy | ✅ |
| **G-TEST05** | Vitest Line-Coverage | — | ≥ 60 % | ~0.5 Tag+ | ⚠️ |
| **G-CQ01** | astro-check-Fehler | ? (T001277 fix) | ≤ 20 | halten (CI-Gate) | ✅ |
| **G-CQ02** ⚠️ | Explizite `any` | 463 ↑ | ≤ 280 | ~3–4 Wo | ✅ |
| **G-CQ03** | ESLint einrichten | kein ESLint | Gate + 0 | ~1 Tag | ⚠️ |
| **G-CQ04** | FIXME/HACK/XXX (echt) | 0 | 0 | Policy | ✅ |
| **G-CQ05** ⚠️ | Echte TODOs | 6 ↑ | ≤ 1 | ~0.5 Tag | ✅ |
| **G-CQ06** | `@deprecated` | 1 ✓ | ≤ 1 | halten | ✅ |
| **G-CQ07** | S2 Import-Zyklen | 0 ✓ | 0 | halten | ✅ |
| **G-CQ08** | Dead-Code/unused exports | — | −50 % | mittel | ⚠️ |
| **G-CQ09** | S3 hartkodierte Hostnames | 0 ✓ | ≤ 10 | halten | ✅ |
| **G-CQ10** | S4 verwaiste Scripts/Manifeste | 0 ✓ | ≤ 4 | halten | ✅ |
| **G-SIZE01** | Freeze-Frühwarn-Band | 38 | ≤ 15 | ~3–4 Wo | ✅ |
| **G-SIZE02** | Großdateien außerhalb Gate | 18 | ≤ 8 | ~2–3 Wo | ✅ |
| **G-SIZE03** | God-File website-db.ts | 4435 | ≤ 3000 | ~2 Wo | ✅ |
| **G-SIZE04** ⚠️ | Netto-LOC/Woche | **+3684** ↑ | ≤ +2000 | Policy/Analyse | ⚠️ |
| **G-DEP01** | High/Critical npm-Vulns | 6 | 0 | ~1–2 h | ⚠️ |
| **G-DEP02** | Veraltete Major-Deps | 9 | ≤ 3 | ~1–2 Tage | ⚠️ |
| **G-DEP03** | PM-Konsistenz website | 0 ✓ (vereinheitlicht) | 1 PM (pnpm) | erreicht | ✅ |
| **G-DEP04** | package.json ohne engines | 0 ✓ | 0 | halten | ✅ |
| **G-DEP05** | Renovate-PR-Backlog | 0 | ≤ 3 | Policy | ✅ |
| **G-IMG01** | Ungepinnte Fremd-Images | 39 | 0 | 2–3 Sess | ✅ |
| **G-IMG02** | Fremd-Image-Versions-Drift | 0 ✓ | 0 | halten | ✅ |
| **G-SEC01** | Hardcoded Secrets (k3d) | 0 | 0 | Policy | ✅ |
| **G-SEC02** | git-crypt Klartext-Leaks | Exit 0 | Exit 0 | Policy | ✅ |
| **G-SEC03** | SealedSecret-Rotation | 5 Tage | ≤ 90 Tage | 1/Quartal | ✅ |
| **G-SEC04** | Sealing-Cert Restlaufzeit | 3622 Tage | ≥ 30 Tage | Monitor | ✅ |
| **G-SEC05** ⚠️ | Unsignierte Commits (main) | **66 %** ↑ (freshness-bot) | ≤ 5 % | ~0.5 Tag | ✅ |
| **G-K8S01** | Deployments ohne Limits | 0/34 | 0 | Policy | ✅ |
| **G-K8S02** | Deployments ohne readinessProbe | 3/34 ✓ | ≤ 3 | halten | ✅ |
| **G-K8S03** | Deployments ohne securityContext | 3/34 | 0 | ~0.5 Tag | ✅ |
| **G-K8S04** | workspace:validate grün | Exit 0 | Exit 0 | Policy | ✅ |
| **G-CFG01** | env:validate:all grün | Exit 0 ✓ | Exit 0 | Policy | ✅ |
| **G-DATA01** | DB-Backup-Freshness | ~5h ✓ | < 26h, 0 fail/7d | Monitor | ⚠️ |
| **G-CI01** ⚠️ | main ci.yml-Erfolgsrate | **85 %** ↓ | ≥ 95 % | untersuchen | ⚠️ |
| **G-CI02** | rote main-HEAD-Läufe | 0 | 0 | Policy | ⚠️ |
| **G-CD01** ⚠️ | korczewski-Deploy-Rate | **53 %** | ≥ 90 % | ~1 Sess | ⚠️ |
| **G-CD02** | post-merge.yml-Rate | 100 % ✓ | ≥ 95 % | halten | ⚠️ |
| **G-DORA01** | Deployment Frequency | Elite | ≥ 5/Wo | Policy | ⚠️ |
| **G-DORA02** | Lead Time | Median 0.03h | ≤ 1h | Policy | ⚠️ |
| **G-DORA03** | Change Failure Rate | 15.8 % | ≤ 15 % | ~1 Wo | ⚠️ |
| **G-DORA04** | MTTR | n/a | < 24h | Policy | ⚠️ |
| **G-GIT01** | Offene PRs >7 Tage | 0 | 0 | Policy | ✅ |
| **G-GIT02** | Non-conventional Commits | 0/30 | 0 | Policy | ✅ |
| **G-GIT03** | Dateien >1MB (kein LFS) | 6 ✓ | ≤ 6 | halten | ✅ |
| **G-SPEC01** | openspec:validate grün | Exit 0 ✓ | Exit 0 | halten | ✅ |
| **G-SPEC02** | Changes >30 Tage | 0 | 0 | Policy | ✅ |
| **G-SPEC03** | Proposals ohne .ticket | 12/28 | 0 | ~0.5–1 Tag | ✅ |
| **G-DOC01** | Defekte interne Doc-Links | 0 ✓ | 0 | Policy | ✅ |
| **G-DOC02** | CLAUDE.md Zeilen | 273 | ≤ 200 | ~1 Sess | ✅ |
| **G-DOC03** | README-Index | 1/5 | 5/5 | ~2–3 h | ✅ |
| **G-DOC04** | Architektur-ADRs | 0 | ≥ 5 | ~5×45 min | ✅ |
| **G-FE01** | a11y axe-Violations | — | 0 crit/serious | mittel | ⚠️ |
| **G-FE02** | Client-JS-Bundle-Budget | — | kein Zuwachs | gering+ | ⚠️ |
| **G-FE03** | Stray console.* + Logger | 0 stray | 0 + Logger | mittel (Logger) | ✅ |

## Sofort-Quick-Wins (hoher Wert, ≤ ~1 Tag)

**Seit dem letzten Stand erledigt (2026-06-27→28):** G-DEP03 (Dockerfile auf pnpm, PM vereinheitlicht) · G-SPEC01 (openspec:validate Exit 0; alle Skelette aufgeräumt) · G-CD02 (post-merge.yml 100 %) · G-CQ01 T001277 gefixt (PR #2225, astro-check CI-Gate aktiv).

**Neue Regressionen (2026-06-28):** G-SEC05 (33/50 unsigned Commits = 66 %; Ursache: freshness-bot) · G-CQ02 (463, +39) · G-CQ05 (6 TODOs, war 1) · G-CI01 (85%, 2 cancelled).

**Noch offen — echte, sofort behebbare Defekte oder Ein-Sitzung-Aufräumarbeiten:**

1. **G-SEC05** ⚠️ — freshness-regen-Bot GPG-Signing aktivieren (66%→≤5% unsigned, ~1 Session, neu A-Prio)
2. **G-CD01** (T001276) ⚠️ — korczewski-Deploy debuggen (53%→90%, ~1 Session)
3. **G-CQ05** — 6 TODOs: Quelle per grep identifizieren, 5 neue aufräumen (~0.5 Tag)
4. **G-DEP01** (T001278) — 6 high npm-Vulns neu fixen (~1–2 h)
5. **G-SPEC03** — 12/28 Proposals ohne `.ticket`-Datei verknüpfen (~0.5–1 Tag)
6. **G-GIT03** (T001275) — search-index.json gitignoren (7→≤6 Dateien >1MB, ~15 Min)
7. **G-CI01** (T001279) — CI-Erfolgsrate 85%→≥95% untersuchen (~1 Session)
8. **G-SIZE04** (T001280) — LOC-Wachstum +3684/Woche weiter eindämmen (~1–2h)
9. **G-CQ01** — astro-check re-messen nach `pnpm install` (Baseline verifizieren)

## Messzyklus

- **Pro Merge (CI-Gate):** G-RH02, G-RH07, G-TEST02/04, G-CQ04, G-SEC01/02, G-K8S04, G-CFG01, G-CI02, G-GIT02, G-SPEC01, G-FE03
- **Täglich:** G-RH06, G-CI02, G-DATA01, G-GIT01
- **Wöchentlich:** G-RH01/03, G-TEST01/03/05, G-CQ01/02/05/07/09/10, G-SIZE*, G-CI01, G-CD01/02, G-DORA*, G-GIT03, G-SPEC02/03, G-SEC05
- **Monatlich / Quartal:** G-CQ06/08, G-DEP02, G-SEC03/04, G-DOC02, G-FE01/02 (pro Release)
- **Bei Bedarf:** G-RH04/05, G-DEP01/05, G-IMG*, G-K8S02/03, G-DOC03/04, G-CQ03

**Mess-Werkzeug:** Das Sammel-Skript `scripts/health-goals-check.sh` **existiert** und prüft die ✅-reproduzierbaren Ziele in einem Lauf gegen ihre Targets (Ampel-Report). Trennung GATE (Policy/Halten, Verstoß ⇒ exit 1) vs. TARGET (Reduktion in Arbeit). Aufrufe: `bash scripts/health-goals-check.sh` (Report), `--strict` (verfehlte TARGETs ⇒ exit 1), `--fast` (überspringt langsame Checks), `--only=G-RH01,G-CQ02`. Die `eingeschränkt`-Ziele (Shallow-DORA, Netz-Audits, gleitende CI-Fenster, Tool-Setup/Cluster) deckt es bewusst **nicht** ab — die hier oben manuell.

---

## Prioritätssystem & Ticket-Erstellung

### Prioritäten (A/B/C)

Jedes Ziel trägt jetzt `**Priorität:**` in seiner Meta-Zeile:

| Stufe | Bedeutung | Handlungsbedarf |
|-------|-----------|-----------------|
| **A** | Aktive Verletzung, Regression oder Sicherheitslücke | Ticket anlegen, sofort angehen |
| **B** | Unter Target, Mehrfach-Sessions-Aufwand | Im nächsten Sprint einplanen |
| **C** | Auf/über Target oder reine Policy | Halten, kein Handlungsbedarf |

Aktuell A-Ziele (2026-06-28 Refresh): **G-SEC05, G-SIZE04, G-DEP01, G-CI01, G-CD01, G-GIT03**
*(G-CQ01 → B, T001277 gefixt; G-SEC05 → A neu, freshness-bot-Regression)*

### Ticket aus einem A-Ziel anlegen

```bash
# Voraussetzung: kubectl context fleet, shared-db erreichbar
PGPOD=$(kubectl get pod -n workspace --context fleet -l app=shared-db -o name | head -1)

# Nächste freie External-ID ermitteln
NEXT_ID=$(kubectl exec "$PGPOD" -n workspace --context fleet -c postgres -- \
  psql -U website -d website -tAc \
  "SELECT 'T' || LPAD((CAST(SUBSTRING(MAX(external_id) FROM 2) AS int)+1)::text, 6, '0') FROM tickets.tickets;")

echo "Neue Ticket-ID: $NEXT_ID"

# Template-INSERT (Werte anpassen):
kubectl exec "$PGPOD" -n workspace --context fleet -c postgres -- psql -U website -d website -c "
INSERT INTO tickets.tickets
  (external_id, title, type, status, priority, severity, component, areas, description, attention_mode, brand)
VALUES
  ('\$NEXT_ID',
   'G-XYZNN: <Kurztitel>',
   'chore',          -- oder 'bug'/'feature'
   'backlog',
   'hoch',           -- A = hoch
   NULL,
   '<component>',    -- z.B. 'website', 'infra', 'ci'
   ARRAY['<area>'],  -- z.B. 'website', 'infra'
   '<Beschreibung mit konkretem Fix-Hinweis>',
   'ai_ready',
   'mentolder');"
```

### Angelegte A-Tickets

| Ziel | Ticket | Titel | Status |
|------|--------|-------|--------|
| G-GIT03 | T001275 | search-index.json gitignoren | offen |
| G-CD01 | T001276 | korczewski-Deploy debuggen | offen |
| G-CQ01 | T001277 | astro-check Regression (249 Fehler) | **gefixt** (PR #2225, CI-Gate aktiv) |
| G-DEP01 | T001278 | 6 high npm-Vulns neu fixen | offen |
| G-CI01 | T001279 | CI-Erfolgsrate < 95 % untersuchen | offen |
| G-SIZE04 | T001280 | LOC-Wachstum über Budget eingedämmen | offen |
| G-SEC05 | — | freshness-bot GPG-Signing (neu A, 2026-06-28) | Ticket ausstehend |

