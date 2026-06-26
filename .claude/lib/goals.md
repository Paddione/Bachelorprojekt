# Repository Health Goals

Quantifizierbare Ziele für die strukturelle Gesundheit des Repos.
Jedes Ziel hat einen **messbaren Befehl**, einen **real gemessenen Baseline-Wert** und ein **erreichbares Target**.
Ein Ziel ohne reproduzierbaren Mess-Befehl ist kein Ziel, sondern ein Wunsch.

**Baseline-Stichtag aller Werte:** `2026-06-27` (sofern nicht anders vermerkt).

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

Die sieben ursprünglichen Ziele, mit auf `2026-06-27` aktualisierten Baselines.

## G-RH01 — Baselined Gate-Violations (baseline.json gesamt): 70 → ≤ 30

**Was:** Einträge in `docs/code-quality/baseline.json` — eingefrorene Gate-Verstöße über **alle vier** Code-Quality-Gates
(`docs/code-quality/gates.yaml`), nicht nur Dateigröße. Aufschlüsselung: **S1 Dateigröße 30 · S2 Import-Zyklen 4 · S3 hartkodierte Hostnames 24 · S4 verwaiste Scripts/Manifeste 12**. Jeder Eintrag ist Schuld: die Datei darf nicht schlimmer werden, muss aber refactored werden. Die Drill-down-Ziele dafür sind G-CQ07/09/10 (S2/S3/S4) und die G-SIZE-Reihe (S1-Wachstum).

**Warum erreichbar:** Trend stimmt (98 → 74 → 70). Der `task quality:baseline:refresh` (in diesem Commit ausgeführt) hat 4 bereits gelöste S3-Einträge aus dem Ledger entfernt. Rest 70→30 = ~2 Refactoring-Sessions/Woche für ~3–4 Wochen, schwerpunktmäßig S1 (30) + S3 (24).

```bash
# Zielmetrik (G-RH01, exakt wie historisch):
python3 -c "import json,sys; print(len(json.load(sys.stdin)))" < docs/code-quality/baseline.json
# Aufschlüsselung nach Gate:
python3 -c "import json,sys,collections as c; d=json.load(sys.stdin); [print(f'{g}: {n}') for g,n in sorted(c.Counter(v['gate'] for v in d.values()).items())]" < docs/code-quality/baseline.json
# Stale-Check (current < baselined ⇒ Refresh fällig):
task quality:check
```

> **Baseline:** 70 (S1:30 S2:4 S3:24 S4:12) · **Target:** ≤ 30 · **Aufwand:** ~3–4 Wochen · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-RH02 — TypeScript-Suppressionen: 0 → 0 (erreicht, halten)

**Was:** `@ts-ignore` / `@ts-expect-error` in `website/src/` — jede unterdrückt einen Compilerfehler (stiller Fehlerpunkt).

**Warum erreichbar:** Target bereits erreicht (9 → 0). Nur noch halten: neue Suppression im Review blocken.

```bash
grep -r "@ts-ignore\|@ts-expect-error" website/src \
  --include="*.ts" --include="*.svelte" --include="*.astro" --exclude-dir=node_modules | wc -l
```

> **Baseline:** 0 (vorher 9) · **Target:** 0 · **Aufwand:** erreicht — Review-Gate · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-RH03 — OpenSpec-BATS-Abdeckung: 28 % → ≥ 60 %

**Was:** Von 53 OpenSpec-Specs (`openspec/specs/*.md`) haben 15 eine BATS-Datei in `tests/spec/`. Jede unabgedeckte Spec ist nur manuell oder gar nicht verifiziertes Verhalten.

**Warum erreichbar:** ≥ 60 % = 32 Specs ⇒ 17 neue BATS-Dateien, ~1 h/Datei, ~3–4 Wochen. Trend belegt (17 % → 28 %).

```bash
SPECS=$(ls openspec/specs/*.md 2>/dev/null | wc -l); BATS=$(ls tests/spec/*.bats 2>/dev/null | wc -l)
echo "Specs: $SPECS | BATS: $BATS | Coverage: $(python3 -c "print(f'{$BATS/$SPECS*100:.0f}%')")"
comm -23 <(ls openspec/specs/*.md | xargs -n1 basename | sed 's/.md$//' | sort) \
         <(ls tests/spec/*.bats | xargs -n1 basename | sed 's/.bats$//' | sort)
```

> **Baseline:** 28 % (15/53) · **Target:** ≥ 60 % (32/53) · **Aufwand:** ~3–4 Wochen · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-RH04 — Stale Remote Branches (>14 Tage, kein offener PR): 0

**Was:** Remote-Branches >14 Tage ohne offenen PR — vergessene Worktrees oder gemergte Branches ohne `git push --delete`.

**Warum erreichbar:** Aktuell 0 stale (3 aktive, alle frisch). Dauerhaft halten: jeder Merge triggert `git push origin --delete <branch>`.

```bash
CUTOFF=$(date -d "14 days ago" +%s)
git for-each-ref --format='%(refname:short)|%(committerdate:unix)' refs/remotes/origin \
  | grep -v "HEAD\|main" | while IFS='|' read b ts; do [[ "$ts" -lt "$CUTOFF" ]] && echo "$b"; done | wc -l
```

> **Baseline:** 0 stale (3 aktiv) · **Target:** dauerhaft 0 · **Aufwand:** Policy · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-RH05 — Plan-Staged-Tickets ohne Aktivität >14 Tage: 0

**Was:** Tickets im Status `plan_staged` ohne Commit/PR/Kommentar seit >14 Tagen — verursachen Kontextverlust, blockieren die Software Factory.

**Warum erreichbar:** Aktuell 0 (vorher 4). Halten: jedes neue `plan_staged`-Ticket via `dev-flow-execute` abarbeiten oder auf `backlog` zurücksetzen.

```bash
# via ticket-mcp list_tickets status=plan_staged (beide Brands)
bash scripts/vda.sh oracle --dry-run 'list plan_staged tickets'
```

> **Baseline:** 0 (vorher 4) · **Target:** 0 idle >14 Tage · **Aufwand:** laufend · **Messzyklus:** wöchentlich · **Reproduzierbar:** mit ticket-mcp

## G-RH06 — Sentinel-Issues unbehandelt >48h: 0

**Was:** Der tägliche Sentinel-Bot öffnet Issues mit Findings. Jede sollte binnen 48h zu Ticket überführt, kommentiert (false positive) oder geschlossen werden.

**Warum erreichbar:** Policy-Ziel. Aktuell 0 offen. Konsequentes tägliches Triage hält es.

```bash
gh-axi issue list --label "sentinel" --state open --json number,title,createdAt | python3 -c "
import sys,json; from datetime import datetime,timezone,timedelta
i=json.load(sys.stdin); cut=datetime.now(timezone.utc)-timedelta(hours=48)
print('>48h:', sum(1 for x in i if datetime.fromisoformat(x['createdAt'].replace('Z','+00:00'))<cut))"
```

> **Baseline:** 0 offen · **Target:** 0 älter als 48h · **Aufwand:** Policy · **Messzyklus:** täglich · **Reproduzierbar:** mit gh

## G-RH07 — Freshness-Check: grün (Exit 0) auf `main`

**Was:** `task freshness:check` validiert, dass generierte Artefakte (repo-index, architecture-HTML, route-manifest) mit dem committeten Stand übereinstimmen.

**Warum erreichbar:** CI-Gate vorhanden, aktuell grün. Halten: kein Direkt-Push ohne vorheriges `task freshness:regenerate`.

```bash
task freshness:check; echo "Exit: $?"
```

> **Baseline:** Exit 0 (grün) · **Target:** Exit 0 auf main, immer · **Aufwand:** Policy · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

---

# 2. Test-Health

## G-TEST01 — BATS Debt-Skips (Feature-Gaps): 9 → 0

**Was:** Unkonditionale `skip`-Aufrufe in BATS, die auf nicht implementierte Features zeigen (nicht Tool-Guards). Alle 9 in `tests/unit/admin-nav.bats`, gekoppelt an WP-28/WP-29 (fehlende Admin-Nav-Tabs). Geschriebene, aber dauerhaft deaktivierte Tests = Spezifikation ohne Verifikation. Abgegrenzt von 83 legitimen Tool-Guard-Skips (php/kubectl/task offline).

**Warum erreichbar:** Tests reaktivieren sich durch Entfernen der `skip`-Zeile, sobald WP-28/29 implementiert sind — kein Neuschrieb.

```bash
grep -rniE "skip [\"']" tests --include=*.bats | grep -ciE "pending|todo|gap-analysis|WP-|not implemented|disabled|stub"
```

> **Baseline:** 9 (alle in admin-nav.bats) · **Target:** 0 · **Aufwand:** ~1–2 Wochen (feature-gekoppelt) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-TEST02 — Vitest `.only`-Vorkommen: dauerhaft 0 (Policy-Gate)

**Was:** `it.only`/`describe.only`/`test.only` deaktiviert **still alle anderen Tests derselben Datei** — ein versehentlich gemergtes `.only` kann ganze Suiten lautlos abschalten, während CI grün meldet. Das kritischste Test-Health-Signal.

**Warum erreichbar:** Baseline bereits 0. Mit einem grep-Gate in `task test:all`/pre-commit fail-closed absicherbar (~1h).

```bash
grep -rnE "\.only\b" website/src mentolder-web/src \
  --include="*.test.ts" --include="*.test.tsx" --include="*.test.svelte" | wc -l
```

> **Baseline:** 0 · **Target:** dauerhaft 0 · **Aufwand:** Policy (~1h Gate) · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-TEST03 — Vitest Skipped/Todo-Suiten: 5 → 0

**Was:** 3× `it.todo` (`factory-floor.order.test.ts`, SP4-Order-Asserts) + 2× `describe.skip` (`assistant/dismissals`, `assistant/conversations`, brauchen DB). Definiertes, aber nie ausgeführtes Verhalten — zählt nicht als Fehlschlag, prüft nichts.

**Warum erreichbar:** Nur 5 Direktiven in 3 Dateien. Die 3 `it.todo` sind Asserts gegen vorhandene SSOT-Konstanten (~je 30 min); die 2 `describe.skip` brauchen einen kleinen Integrations-Harness (pg-mem/Test-DB).

```bash
grep -rnE "(describe|it|test)\.(skip|todo)\b" website/src --include="*.ts" --include="*.svelte" \
  | grep -vE "^[^:]+:[0-9]+:[[:space:]]*//" | wc -l
```

> **Baseline:** 5 · **Target:** 0 · **Aufwand:** ~1 Woche · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-TEST04 — Test-Inventory-Drift: 0 (CI-Gate)

**Was:** `website/src/data/test-inventory.json` (276 Einträge, Requirement→Test-Mapping) wird von `task test:inventory` generiert; CI schlägt fehl, wenn das committete Artefakt abweicht. Drift = Traceability-Tabelle der Thesis stimmt nicht mehr mit dem Test-Bestand überein.

**Warum erreichbar:** CI-Gate vorhanden, aktuell driftfrei. Halten: `task test:inventory` bei jeder Test-Änderung mitlaufen lassen und committen.

```bash
# Read-only-Proxy (committed == HEAD):
git status --porcelain website/src/data/test-inventory.json | wc -l
# Voll-Check (CI-äquivalent, schreibt die Datei — danach ggf. git restore):
# task test:inventory && git diff --exit-code website/src/data/test-inventory.json
```

> **Baseline:** 0 Drift · **Target:** dauerhaft 0 · **Aufwand:** Policy · **Messzyklus:** pro Merge / bei Test-Änderungen · **Reproduzierbar:** ja

## G-TEST05 — Vitest Line-Coverage (website/src/lib): messen → ≥ 60 %

**Was:** 233 `*.test.ts`-Dateien existieren, aber **keine Coverage-Messung** (`@vitest/coverage-v8` nicht installiert, `test:unit` = `vitest run` ohne `--coverage`). Es ist unbekannt, welcher Anteil der Logik überhaupt von Tests erreicht wird — die fehlende zentrale Test-Health-Kennzahl.

**Warum erreichbar:** Einmalige devDep-Installation + `--coverage`-Flag aktiviert die Messung. ≥ 60 % Line-Coverage im `lib/`-Kern ist bei 233 Testdateien ein realistischer Startwert.

```bash
pnpm --dir website add -D @vitest/coverage-v8 >/dev/null 2>&1
pnpm --dir website exec vitest run --coverage --coverage.provider=v8 \
  --coverage.reporter=text-summary 2>/dev/null | grep -iE 'lines|statements'
```

> **Baseline:** unbekannt (Provider nicht installiert) · **Target:** ≥ 60 % Lines (lib/) · **Aufwand:** ~0.5 Tag Setup + laufend · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Tool-Setup)

---

# 3. Code-Qualität & statische Analyse

## G-CQ01 — astro-check-Fehler: 177 → ≤ 20

**Was:** `npx astro check` (Typprüfer via `@astrojs/check`) meldet 177 Typfehler über `website/src` + `tests/`. 153 davon sind `ts(2345)` gebündelt in `.test.ts` (testing-library/svelte `render`). `astro check` ist die **einzige derzeit aktive** statische Analyse der Website.

**Warum erreichbar:** 153/177 sind ein Cluster mit gemeinsamer Ursache (Test-Render-Helper/Props-Typ); eine zentrale Korrektur eliminiert den Großteil, ~24 Rest sind Einzelfixes.

```bash
cd website && timeout 240 npx astro check 2>&1 | grep -E '^- [0-9]+ errors'
```

> **Baseline:** 177 Fehler · **Target:** ≤ 20 · **Aufwand:** hoch (~2–3 Sessions) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-CQ02 — Explizite `any`-Verwendungen: 564 → ≤ 280

**Was:** 564 explizite `any` in `website/src` (208× `: any`, 345× `as any`, 11× `<any>`) über 1357 Dateien. Jedes `any` deaktiviert lokal die Typprüfung; die 345 `as any` umgehen bewusst die Zuweisbarkeitsprüfung und untergraben den astro-check-Wert (G-CQ01).

**Warum erreichbar:** Viele `as any` stecken in Tests + wenigen Hotspots (API-Routes, DB-Layer); durch generische Typen/Interfaces ersetzbar. Halbierung über ~4–5 Wochen kontinuierlich; 0 bei 1357 Dateien unrealistisch.

```bash
grep -rn ': any\|<any>\|as any' website/src --include=*.ts --include=*.svelte --include=*.astro | wc -l
```

> **Baseline:** 564 · **Target:** ≤ 280 · **Aufwand:** hoch (~4–5 Wochen) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-CQ03 — ESLint einrichten + Warnings → 0 (Setup-Ziel)

**Was:** In `website/` ist **kein ESLint** installiert (keine `eslint.config.*`, keine Binary, kein `lint`-Script). Dennoch 9 tote `eslint-disable`-Direktiven in `src/` — Annotationen, die auf einen nie laufenden Linter verweisen. Es gibt keine durchsetzbare Stil-/Code-Smell-Schicht; `astro check` deckt nur Typen ab.

**Warum erreichbar:** Minimale Flat-Config (`typescript-eslint` + `eslint-plugin-svelte`) + `lint`-Script + CI-Gate ist ein abgegrenzter Setup-Schritt (~1 Tag). Die 9 Direktiven belegen latente Nachfrage. Danach iterativer Abbau auf 0.

```bash
ls website/eslint.config.* 2>/dev/null; ls website/node_modules/.bin/eslint 2>/dev/null
grep -c '"lint"' website/package.json; grep -rn 'eslint-disable' website/src | wc -l
```

> **Baseline:** kein ESLint; 9 tote disable-Direktiven · **Target:** Flat-Config + CI-Gate aktiv, Warnings 0 · **Aufwand:** mittel (~1 Tag + Abbau) · **Messzyklus:** pro Merge (nach Setup) · **Reproduzierbar:** eingeschränkt (erst nach Setup messbar)

## G-CQ04 — FIXME/HACK/XXX (echte Code-Schuld): 0 → dauerhaft 0

**Was:** Schuld-Marker FIXME/HACK/XXX (Wort-Grenze) über `website/src`, `scripts`, `tests`, `k3d`, `brett/src`. 4 Wort-Treffer, davon **0 echte Code-Schuld** (2× in `plan-lint.sh`/`plan-qa-check.sh` = Linter, die diese Marker *detektieren*; 1× Template-String; 1× `XXX-XXX`-Session-Code in `brett`). Naiver Substring-Grep liefert 22 (False Positives in Testdaten).

**Warum erreichbar:** Nichts abzubauen — präventiv halten (Netto-Rate 0) per Wort-Grenzen-Grep als Pre-Merge-Wächter.

```bash
grep -rnE "\b(FIXME|HACK|XXX)\b" --include=*.ts --include=*.svelte --include=*.astro \
  --include=*.sh --include=*.js --include=*.mjs website/src scripts tests k3d brett/src 2>/dev/null \
  | grep -vE "node_modules|/dist/|plan-lint.sh|plan-qa-check.sh" | wc -l
```

> **Baseline:** 0 echte Schuld (4 Wort-Treffer, alle Tooling) · **Target:** dauerhaft 0 echte · **Aufwand:** Policy · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-CQ05 — Echte TODO-Marker: 3 → ≤ 1

**Was:** 3 echte TODOs: `sendInvoice.ts:4` (E2E-Invoice-Send-Stub), `GraphCanvas.svelte:155` (TODO T000667, Kantenlabels), `fa-10-website.spec.ts:34` (TODO T000603, Prod-Netzwerkpfad). Unfertiges Verhalten bzw. ausgelassene Abdeckung.

**Warum erreichbar:** 2 sind ticket-gebunden (T000667/T000603) — abarbeiten oder Ticket schließen. Target ≤1 lässt den größeren `sendInvoice`-Stub bewusst offen, falls außerhalb Thesis-Scope.

```bash
grep -rnE "\bTODO\b" --include=*.ts --include=*.svelte --include=*.astro --include=*.sh \
  --include=*.js --include=*.mjs website/src scripts tests k3d brett/src 2>/dev/null \
  | grep -vE "node_modules|/dist/|plan-lint.sh|plan-qa-check.sh|openspec.sh" | wc -l
```

> **Baseline:** 3 · **Target:** ≤ 1 · **Aufwand:** ~2 kleine Sessions · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-CQ06 — `@deprecated`-Symbole: 3 → ≤ 1

**Was:** 3 `@deprecated` in `website/src`: `website-db.ts:875` (legacy headline price), `website-db.ts:892` (detail tiers read-fallback), `ServiceRow.svelte:19` (entfernte Direct-Buy-Buttons). Tote Pfade post-Katalog-Migration, Risiko versehentlicher Weiterverwendung.

**Warum erreichbar:** Die 2 `website-db.ts`-Fallbacks hängen an derselben Migration; nach Daten-Verifikation entfernbar. Der ServiceRow-Marker darf als Kompatibilität bleiben.

```bash
grep -rnE "@deprecated" --include=*.ts --include=*.svelte --include=*.astro website/src 2>/dev/null \
  | grep -v node_modules | wc -l
```

> **Baseline:** 3 · **Target:** ≤ 1 · **Aufwand:** ~1 Session + Daten-Verifikation · **Messzyklus:** monatlich · **Reproduzierbar:** ja

## G-CQ07 — S2 Import-Zyklen (circular deps): 4 → 0

**Was:** Eingefrorene S2-Verstöße (Gate `s2-cycles`) = Import-Zyklen im Modulgraph. 4 Zyklen: `tickets-db.ts ↔ website-db.ts`; `website-db.ts → tickets/transition.ts → reporter-link.ts`; `invoice-pdf.ts ↔ native-billing.ts`. Zyklen erschweren Tree-Shaking, verursachen Init-Reihenfolge-Bugs (undefined exports) und blockieren Refactoring. (Drill-down von G-RH01.)

**Warum erreichbar:** 4 lokalisierte Zyklen, je durch Extraktion eines geteilten Moduls/Interface auflösbar. Reduziert zugleich G-RH01 und entsperrt den `website-db.ts`-Split (G-SIZE03).

```bash
# Eingefrorene S2-Zyklen:
python3 -c "import json,sys; print(sum(1 for v in json.load(sys.stdin).values() if v['gate']=='S2'))" < docs/code-quality/baseline.json
# Unabhängige Gegenprobe:
npx --yes madge --circular --extensions ts,tsx website/src
```

> **Baseline:** 4 · **Target:** 0 · **Aufwand:** mittel (~2–3 Module entkoppeln) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-CQ08 — Dead-Code / ungenutzte Exports (website/src): messen → −50 %

**Was:** Toter Code bläht Bundle, Review-Last und Verständlichkeit auf und täuscht S1-Frozen-Schuld vor (z.B. in `website-db.ts`). Bislang ungemessen; `ts-prune` liefert hier unzuverlässig 0 (Resolver/tsconfig-Pfad), daher `knip` als belastbareres Werkzeug.

**Warum erreichbar:** `knip` braucht eine einmalige Minimal-Config, dann ist die Menge ungenutzter Exports reproduzierbar; ≥ 50 % Abbau ist über mehrere Sessions machbar.

```bash
npx --yes knip@latest --directory website --reporter symbols 2>/dev/null | grep -iE 'unused|exports' | head
```

> **Baseline:** unbekannt (knip-Config nötig) · **Target:** ungenutzte Exports −50 % · **Aufwand:** mittel (Setup + Abbau) · **Messzyklus:** monatlich · **Reproduzierbar:** eingeschränkt (Tool-Setup)

## G-CQ09 — S3 hartkodierte Hostnames (Gate): 24 → ≤ 10

**Was:** Eingefrorene S3-Verstöße (Gate `s3-hostnames`) = hartkodierte Hostnames/Domains in `k3d/`, `prod*/`, `website/src/` außerhalb der Allowlist (`configmap-domains.yaml`, `sitemap.xml.ts`). Hartkodierte Hosts brechen die zentrale Domain-Konfiguration und Multi-Brand-Fähigkeit. Größter Einzel-Bucket von G-RH01 (24/70).

**Warum erreichbar:** Jeder Treffer ist auf die ConfigMap-SSOT (`k3d/configmap-domains.yaml`) bzw. Brand-Env-Var umzustellen. Mechanisch, gut batchbar.

```bash
python3 -c "import json,sys; print(sum(1 for v in json.load(sys.stdin).values() if v['gate']=='S3'))" < docs/code-quality/baseline.json
```

> **Baseline:** 24 · **Target:** ≤ 10 · **Aufwand:** ~2 Sessions · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-CQ10 — S4 verwaiste Scripts/Manifeste (Gate): 12 → ≤ 4

**Was:** Eingefrorene S4-Verstöße (Gate `s4-orphans`) = Scripts/Manifeste unter `scripts/`, `k3d/`, auf die keine `Taskfile`/`kustomization`/Doku/Workflow/Skill mehr verweist. Toter Infrastruktur-Code: erschwert Verständnis, Sicherheits-Triage und täuscht Wartungsbedarf vor.

**Warum erreichbar:** Pro Eintrag entweder löschen (echt verwaist) oder Referenz nachtragen (`reference_sources` in `gates.yaml`). 12 endliche Fälle.

```bash
python3 -c "import json,sys; print(sum(1 for v in json.load(sys.stdin).values() if v['gate']=='S4'))" < docs/code-quality/baseline.json
```

> **Baseline:** 12 · **Target:** ≤ 4 · **Aufwand:** ~1 Session · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

---

# 4. Code-Größe & Wachstum

Ergänzt G-RH01/S1 um **Wachstum** statt Bestand (überlappt nicht mit der `baseline.json`).

## G-SIZE01 — Freeze-Frühwarn-Band (80–100 % S1-Limit): 35 → ≤ 15

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

> **Baseline:** 35 · **Target:** ≤ 15 · **Aufwand:** mittel (~3–4 Wochen präventiv) · **Messzyklus:** wöchentlich + Pre-PR auf geänderte Dateien · **Reproduzierbar:** ja

## G-SIZE02 — Großdateien außerhalb Gate-Scope (VideoVault/.opencode): 18 → ≤ 8

**Was:** Quelldateien >600 Zeilen **komplett außerhalb** `gates.yaml scan.code_roots` (15× `VideoVault/`, 3× `.opencode/`) — von keinem Gate überwacht. Während der In-Scope-Bereich sauber ist, wächst hier 65k+ LOC unbeobachtet (bis 1983 Zeilen). Echte Blind-Spot-Schuld, disjunkt von `baseline.json`.

**Warum erreichbar:** `.opencode/` (3 Dateien) mit einem Eintrag in `scan.code_roots` unter Gate-Aufsicht stellen. Für `VideoVault/` die 4–5 größten Splitten — oder den Service laut Routing nach `~/projects/` ausgliedern statt mitwachsen lassen.

```bash
git ls-files VideoVault .opencode | grep -E '\.(ts|tsx|js|mjs|cjs|svelte|astro|sh|py)$' \
  | grep -v node_modules | xargs wc -l 2>/dev/null | grep -v ' total$' | awk '$1>600' | wc -l
```

> **Baseline:** 18 · **Target:** ≤ 8 · **Aufwand:** mittel (~2–3 Wochen) · **Messzyklus:** pro Merge auf VideoVault//.opencode/ · **Reproduzierbar:** ja

## G-SIZE03 — God-File `website/src/lib/website-db.ts`: 4485 → ≤ 3000 Zeilen

**Was:** Größte Nicht-Vendored-Quelldatei (4485 Zeilen, zentrale DB-Zugriffsschicht). Steht in `gates.yaml s1.ignore` und **nicht** in `baseline.json` — weder Freeze noch G-RH01 überwachen sie, sie wächst unbegrenzt. Permanenter Review-/Merge-Konflikt-Hotspot.

**Warum erreichbar:** Split-Pattern im Repo erprobt: `tickets-db.ts` (1096 Zeilen) wurde bereits ausgelagert. Weitere Domänen (Termine, Newsletter, Coaching) analog extrahieren, Pool zentral importiert lassen. Danach aus `s1.ignore` entfernen.

```bash
wc -l < website/src/lib/website-db.ts
```

> **Baseline:** 4485 · **Target:** ≤ 3000 (danach aus `s1.ignore`) · **Aufwand:** mittel-hoch (~2 Wochen) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-SIZE04 — Netto-Quell-LOC/Woche: Budget ≤ +2000 (Policy)

**Was:** Netto-Zeilenänderung (added − deleted) der Quellsprachen/Woche, ohne node_modules/Vendored. Ein Budget macht Bulk-Importe als Ausreißer sofort sichtbar, statt unbemerkt G-RH01/S1 zu füllen.

**Warum erreichbar:** Repo ist aktuell netto negativ (~−1500 LOC/Woche, Refactoring überwiegt). ≤ +2000/Woche lässt normale Feature-Arbeit zu. **Achtung Shallow-Clone:** der Graft-Commit (Initial-Import 2026-06-20) muss ausgeschlossen werden, sonst meldet der naive 7-Tage-Lauf falsche +317743.

```bash
git log --since="2026-06-21" --no-merges --numstat --pretty=tformat: \
  -- '*.ts' '*.tsx' '*.svelte' '*.astro' '*.js' '*.mjs' '*.cjs' '*.sh' '*.py' ':(exclude)**/node_modules/**' \
  | awk 'NF==3 && $1!="-"{a+=$1;d+=$2} END{printf "net=%+d (added=%d deleted=%d)\n",a-d,a,d}'
```

> **Baseline:** ~ −1500 LOC/Woche (graft-bereinigt) · **Target:** ≤ +2000/Woche · **Aufwand:** Policy · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Graft-Ausschluss nötig)

---

# 5. Dependencies & Supply-Chain

## G-DEP01 — High/Critical npm-Vulnerabilities (website): 6 → 0

**Was:** `pnpm audit` in `website/`: 15 Findings (3 low, 6 moderate, 6 high, 0 critical). Die 6 high: undici (3×, transitiv über jsdom/vitest), ws (DoS), vite (`server.fs.deny`-Bypass), nodemailer (direkt, Header-Bypass). Bekannte, gepatchte Vektoren ungefixt im Build.

**Warum erreichbar:** 5/6 transitiv, über `pnpm.overrides`/`pnpm update` lösbar; nodemailer ist direkt mit verfügbarem Fix. Kein Major-Refactor.

```bash
cd website && timeout 90 pnpm audit --json 2>/dev/null | python3 -c \
"import sys,json; v=json.load(sys.stdin).get('metadata',{}).get('vulnerabilities',{}); print('high+critical:', v.get('high',0)+v.get('critical',0))"
```

> **Baseline:** 6 · **Target:** 0 · **Aufwand:** ~1–2 h · **Messzyklus:** pro Merge / wöchentlich · **Reproduzierbar:** eingeschränkt (Advisory-DB driftet)

## G-DEP02 — Veraltete Major-Deps (website): 9 → ≤ 3

**Was:** `pnpm outdated`: 27 veraltet, 9 Major-Sprünge: astro 6→7, @astrojs/{node,react,svelte}, @sveltejs/vite-plugin-svelte 6→7, nodemailer 8→9, pino 9→10, signature_pad 4→5, rrweb-player 1→2. Major-Drift häuft Breaking-Changes- und Sicherheits-Backlog an.

**Warum erreichbar:** Die 4 Astro-Ökosystem-Bumps wandern koordiniert als ein PR; die übrigen 5 isoliert bumpbar. Realistisch ≤ 3 mit echter API-Migration.

```bash
cd website && timeout 90 pnpm outdated 2>/dev/null   # Major-Sprünge: erste vs. letzte Spalte, andere Major-Zahl
```

> **Baseline:** 9 Major · **Target:** ≤ 3 · **Aufwand:** moderat (~1–2 Tage) · **Messzyklus:** monatlich / Renovate · **Reproduzierbar:** eingeschränkt (Registry driftet)

## G-DEP03 — Verwaiste npm-Lockfile in pnpm-Paketen: 1 → 0

**Was:** `website/` wird im CI mit **pnpm** gebaut (`pnpm/action-setup`, Cache `website/pnpm-lock.yaml`), trägt aber zusätzlich ein verwaistes `package-lock.json` — ein versehentliches `npm install` zöge abweichende Auflösungen → divergente Builds. **Nicht betroffen:** `brett/` ist npm-primär; sein `package-lock.json` ist CI-aktiv (`npm ci --prefix brett`), dort wäre umgekehrt die `pnpm-lock.yaml` das verwaiste Artefakt (separat zu klären, hier ausgeklammert).

**Warum erreichbar:** Reines Aufräumen — das verwaiste `website/package-lock.json` löschen; `pnpm-lock.yaml` bleibt alleinige Wahrheit. Optional CI-Guard.

```bash
# pnpm-primäre Pakete mit verwaister npm-Lockfile (website baut im CI via pnpm):
c=0; for d in website; do [ -f "$d/pnpm-lock.yaml" ] && [ -f "$d/package-lock.json" ] && c=$((c+1)); done; echo "$c"
```

> **Baseline:** 1 (nur website; brett ist npm-primär) · **Target:** 0 · **Aufwand:** ~10 min · **Messzyklus:** pro Merge (Guard) · **Reproduzierbar:** ja

## G-DEP04 — Deploybare package.json ohne `engines >= 22.13.0`: 6 → 0

**Was:** Root pinnt korrekt `>=22.13.0`, aber website, brett, mediaviewer-widget, VideoVault, studio-server haben **kein** `engines`-Feld, mentolder-web pinnt veraltetes `>=20`. 6/7 weichen ab → stille Node-Version-Drift, kein fail-fast (pnpm 11 braucht ≥ 22.13).

**Warum erreichbar:** 6 Ein-Zeilen-Edits, Vorlage in `.nvmrc` + Root-package.json. Kein Build-Impact.

```bash
c=0; for p in package.json website/package.json brett/package.json mentolder-web/package.json \
  mediaviewer-widget/package.json VideoVault/package.json studio-server/package.json; do \
  v=$(python3 -c "import json;print((json.load(open('$p')).get('engines') or {}).get('node','MISSING'))"); \
  [ "$v" != ">=22.13.0" ] && c=$((c+1)); done; echo "abweichend: $c"
```

> **Baseline:** 6 · **Target:** 0 · **Aufwand:** ~30 min · **Messzyklus:** einmalig + CI-Guard · **Reproduzierbar:** ja

## G-DEP05 — Renovate/Dependency-PR-Backlog: ≤ 3 (Policy)

**Was:** Offene Dependency-/Renovate-PRs. Der self-hosted Renovate (wöchentlich, T000898) öffnet Update-PRs; ein wachsender Stau bedeutet ungemergte Sicherheits-/Versions-Updates.

**Warum erreichbar:** Aktuell 0 (keine offenen Renovate-PRs). Halten durch zeitnahes Mergen der wöchentlichen Batch. (Hinweis: `gh-axi --json` liefert ein eigenes Textformat — für maschinelles Zählen `gh pr list --json author,labels` nutzen.)

```bash
gh pr list --state open --json author,labels \
  | python3 -c "import sys,json; p=json.load(sys.stdin); print(sum(1 for x in p if x['author'].get('login','').startswith('app/renovate') or any(l['name']=='dependencies' for l in x['labels'])))"
```

> **Baseline:** 0 · **Target:** ≤ 3 · **Aufwand:** Policy · **Messzyklus:** wöchentlich · **Reproduzierbar:** mit gh

## G-IMG01 — Ungepinnte Fremd-Images (kein @sha256): 43 → 0

**Was:** 43 eindeutige Fremd-Images in `k3d/`/`prod*/`, die nur per veränderlichem Tag statt @sha256-Digest referenziert werden (busybox, oauth2-proxy, pgvector, nextcloud:33-apache, livekit/*, grafana/*, prometheus/*, …). Ein Tag kann unter dem Pod neu gepusht werden → stille, nicht reviewte Bytes (Supply-Chain-Risiko). Bewusst auf `:latest` gepinnte **eigene** Images (website, brett, docs, videovault, mediaviewer-widget, mentolder-web) sind ausgeschlossen.

**Warum erreichbar:** Präzedenz: 6 Refs sind bereits digest-gepinnt. Renovate `pinDigests` hält Digests nach dem einmaligen Pinnen automatisch frisch. 43 ist eine endliche Menge (2–3 Sessions).

```bash
grep -rhE '^[[:space:]]*-?[[:space:]]*image:[[:space:]]+["'"'"']?[A-Za-z0-9$]' k3d/ prod*/ 2>/dev/null \
  | grep -v '@sha256' | grep -vE '^[[:space:]]*#' \
  | grep -vE 'website|brett|docs|videovault|mediaviewer-widget|mentolder-web|WEBSITE_IMAGE|STUDIO_IMAGE|STAGING_IMAGE' \
  | sed -E 's/.*image:[[:space:]]*//; s/["'"'"']//g; s/[[:space:]]*#.*//' | sort -u | wc -l
```

> **Baseline:** 43 unique · **Target:** 0 · **Aufwand:** 2–3 Sessions + Renovate pinDigests · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-IMG02 — Fremd-Image-Versions-Drift (gleiches Image, ≠ Tags): 3 → 0

**Was:** 3 Image-Familien in mehreren Versionen gleichzeitig: busybox (1.36/1.37/1.38.0), kiwigrid/k8s-sidecar (2.5.0 docker.io / 2.7.3 quay.io), curlimages/curl (8.7.1/8.11.0). Vergrößert unnötig Angriffsfläche/Cache, erschwert CVE-Triage.

**Warum erreichbar:** 3 Familien auf je eine kanonische Version (+ einheitliche Registry) vereinheitlichen. Utility-Images ohne Funktionsrisiko (~1 h).

```bash
grep -rhE '^[[:space:]]*-?[[:space:]]*image:[[:space:]]+["'"'"']?[A-Za-z0-9$]' k3d/ prod*/ 2>/dev/null \
  | grep -vE '^[[:space:]]*#' | sed -E 's/.*image:[[:space:]]*//; s/["'"'"']//g; s/[[:space:]]*#.*//; s/@sha256.*//' \
  | grep -vE 'website|brett|docs|videovault|mediaviewer-widget|mentolder-web|_IMAGE' \
  | awk -F: '{n=$1; sub(/^docker\.io\//,"",n); sub(/^.*\//,"",n); print n"\t"$0}' | sort -u \
  | awk -F'\t' '{c[$1]++} END{n=0; for(k in c) if(c[k]>1) n++; print n}'
```

> **Baseline:** 3 · **Target:** 0 · **Aufwand:** ~1 h · **Messzyklus:** pro Merge an Manifesten · **Reproduzierbar:** ja

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

> **Baseline:** 0 · **Target:** 0 dauerhaft · **Aufwand:** Policy (CI-erzwungen) · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-SEC02 — Getrackte Klartext-Secrets im Git-Tree: 0 (git-crypt-Guard grün)

**Was:** `scripts/git-crypt-guard.sh check-tracked` (CI-Schritt „Verify secrets are git-crypt-encrypted"). Prüft, dass jede via `.gitattributes` als Secret markierte, getrackte Datei at-rest git-crypt-verschlüsselt ist. Ein unverschlüsselt committetes Secret = sofortiger Klartext-Leak. *(Doku-Hinweis: `environments/.secrets/**` ist **getrackt + git-crypt-verschlüsselt**, nicht gitignored — die Verschlüsselung, nicht .gitignore, ist die wirksame Kontrolle; CLAUDE.md-Formulierung korrigieren.)*

**Warum erreichbar:** Blockierendes CI-Gate, aktuell Exit 0 (21 getrackte Secrets verschlüsselt). Halten: neue Secrets vor dem Commit unter die git-crypt-Pfade legen.

```bash
bash scripts/git-crypt-guard.sh check-tracked >/dev/null 2>&1; echo "exit=$? (0 = alle verschlüsselt)"
```

> **Baseline:** Exit 0 · **Target:** Exit 0 dauerhaft · **Aufwand:** Policy · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-SEC03 — Älteste SealedSecret-Rotation: 5 Tage → ≤ 90 Tage

**Was:** Alter (Commit-Datum, **nicht** mtime) der am längsten nicht reseal-committeten Datei unter `environments/sealed-secrets/*.yaml`. Lange nicht versiegelte Dateien transportieren potenziell rotationsbedürftige Credentials und vergrößern das Schadenfenster.

**Warum erreichbar:** Alle 5 Overlays sehr frisch (älteste `staging.yaml` ~5 Tage). Garantierte Rotation ≤ 90 Tage = eine `task env:seal`-Session/Quartal.

```bash
oldest=$(for f in environments/sealed-secrets/*.yaml; do git log -1 --format='%at' -- "$f"; done | sort -n | head -1)
echo "$(( ($(date +%s)-oldest)/86400 )) Tage (älteste sealed-secrets-Datei)"
```

> **Baseline:** 5 Tage · **Target:** ≤ 90 Tage · **Aufwand:** ~1 Reseal/Quartal · **Messzyklus:** monatlich · **Reproduzierbar:** ja (git-Commit-Datum)

## G-SEC04 — Sealing-Cert Restlaufzeit: ≥ 30 Tage (passiver Monitor)

**Was:** Geringste Restlaufzeit aller committeten Sealing-Zertifikate (`environments/certs/*.pem`). Läuft eines ab, schlägt künftiges Versiegeln fehl und ein Cluster-Reset kann alte Sealed-Files nicht mehr neu erzeugen.

**Warum erreichbar:** Aktuell ~3622 Tage (gültig bis 2036) — bis dahin trivial erfüllt. Reiner Frühwarn-Monitor (< 30 Tage); `task env:fetch-cert` frischt bei Cluster-Reset ohnehin auf. **Niedrige Priorität** (auf Thesis-Horizont nie ausgelöst).

```bash
for f in environments/certs/*.pem; do \
  d=$(( ($(date -d "$(openssl x509 -enddate -noout -in "$f" | cut -d= -f2)" +%s)-$(date +%s))/86400 )); \
  echo "$d $(basename "$f")"; done | sort -n | head -1
```

> **Baseline:** 3622 Tage · **Target:** ≥ 30 Tage Warnschwelle · **Aufwand:** Monitor · **Messzyklus:** monatlich · **Reproduzierbar:** ja

## G-SEC05 — Unsignierte Commits auf main (letzte 50): ~26 % → ≤ 5 %

**Was:** Anteil der letzten 50 main-Commits ohne gültige Signatur (`%G?` = `N`). Signierte Commits sichern Provenienz/Supply-Chain-Integrität — wichtig bei mehreren Agenten + Factory, die auf main pushen.

**Warum erreichbar:** 13/50 unsigniert. Commit-Signing für Factory-Bot + lokale Sessions konfigurieren (gpg/ssh-signing). Der `N`-Anteil ist maschinenunabhängig reproduzierbar (anders als `G`/`E`, die vom lokalen Keyring abhängen).

```bash
git log -50 --pretty='%G?' main | grep -c N
```

> **Baseline:** 13/50 (~26 %) · **Target:** ≤ 5 % · **Aufwand:** ~0.5 Tag (Signing-Setup) · **Messzyklus:** monatlich · **Reproduzierbar:** ja (driftet mit neuen Commits)

---

# 7. Infrastruktur (K8s, Config, Daten)

## G-K8S01 — Deployments ohne Resource-Limits/Requests: 0/34 (halten)

**Was:** Alle 34 Deployments in `k3d/*.yaml` setzen auf jedem Container `resources.limits` UND `.requests`. Ohne Limits = Noisy-Neighbor/OOM auf dem geteilten fleet-Cluster. Aktuell schuldfreie 100 %-Abdeckung.

**Warum erreichbar:** Baseline 0 fehlend. Halten: kein neues Deployment ohne `resources` mergen (kustomize-build-Lint je PR).

```bash
python3 -c "import yaml,glob; D=[s for f in glob.glob('k3d/*.yaml') for s in yaml.safe_load_all(open(f)) if isinstance(s,dict) and s.get('kind')=='Deployment']; print(sum(1 for x in D if not all(c.get('resources',{}).get('limits') and c.get('resources',{}).get('requests') for c in x['spec']['template']['spec']['containers'])),'of',len(D))"
```

> **Baseline:** 0/34 · **Target:** dauerhaft 0 · **Aufwand:** Policy · **Messzyklus:** pro neuem Deployment · **Reproduzierbar:** ja

## G-K8S02 — Deployments ohne readinessProbe: 10 → ≤ 3

**Was:** 10/34 Deployments ohne readinessProbe (9 davon ganz ohne Probe): livekit-{redis,server,ingress,egress}, mailpit, nextcloud, ntfy, recovery-browser, sessions-server, nats. Ohne readinessProbe leitet Traefik Traffic an nicht-bereite Pods → 502/503 bei Rollouts.

**Warum erreichbar:** Die meisten exponieren einen HTTP/TCP-Port; eine Probe ist ~5 Zeilen YAML. 3 dürfen begründet probe-los bleiben (livekit-egress/-ingress headless/hostNetwork, recovery-browser ephemer).

```bash
python3 -c "import yaml,glob; D=[s for f in glob.glob('k3d/*.yaml') for s in yaml.safe_load_all(open(f)) if isinstance(s,dict) and s.get('kind')=='Deployment']; print(sum(1 for x in D if not all(c.get('readinessProbe') for c in x['spec']['template']['spec']['containers'])),'of',len(D))"
```

> **Baseline:** 10/34 · **Target:** ≤ 3 · **Aufwand:** ~1 Tag (~7 Probes) · **Messzyklus:** pro Manifest-Änderung · **Reproduzierbar:** ja

## G-K8S03 — Deployments ohne securityContext: 3 → 0

**Was:** 3/34 ohne pod- oder container-level securityContext: livekit-egress, sealed-secrets-controller, sessions-server. Default = potenziell root, allowPrivilegeEscalation, alle Capabilities → vermeidbare Angriffsfläche.

**Warum erreichbar:** Minimaler Context (`runAsNonRoot`, `allowPrivilegeEscalation:false`, `capabilities.drop:[ALL]`) ~6 Zeilen; der upstream-vendored sealed-secrets-controller per Overlay patchbar. 3 Einträge (~0.5 Tag).

```bash
python3 -c "import yaml,glob; D=[s for f in glob.glob('k3d/*.yaml') for s in yaml.safe_load_all(open(f)) if isinstance(s,dict) and s.get('kind')=='Deployment']; print([x['metadata']['name'] for x in D if not x['spec']['template']['spec'].get('securityContext') and not all(c.get('securityContext') for c in x['spec']['template']['spec']['containers'])])"
```

> **Baseline:** 3/34 · **Target:** 0 · **Aufwand:** ~0.5 Tag · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-K8S04 — `workspace:validate` grün: Exit 0 (halten)

**Was:** `task workspace:validate` baut/validiert die k3d-Kustomize-Base (kubectl dry-run, 162 Ressourcen). Ein roter Exit blockiert jeden Prod-Deploy (push-based wendet genau diese Base an).

**Warum erreichbar:** Aktuell Exit 0, Teil von `task test:all` (CI-Gate vor jedem Merge). Halten: kein roter Stand auf main.

```bash
timeout 150 task workspace:validate >/dev/null 2>&1; echo "Exit: $?"
```

> **Baseline:** Exit 0 (162 Ressourcen) · **Target:** Exit 0, immer · **Aufwand:** Policy · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-CFG01 — `env:validate:all` grün: FAIL (Exit 5) → Exit 0  ⚠️ AKTIVER DEFEKT

**Was:** `task env:validate:all` prüft jedes `environments/<env>.yaml` gegen `environments/schema.yaml` (autoritative Var-Liste). **Aktuell ROT (Exit 5):** required `env_var` **`POCKET_ID_DOMAIN` fehlt in fleet-mentolder, korczewski, mentolder, staging** (4 Umgebungen). Drift gegen das Schema schlägt sonst erst spät beim Prod-Deploy (`envsubst`/Setup) fehl. CLAUDE.md nennt envsubst/schema-Sync explizit als Footgun.

**Warum erreichbar:** Konkreter, sofort behebbarer Defekt: `POCKET_ID_DOMAIN` in den 4 env-Dateien ergänzen (oder im Schema als optional markieren, falls bewusst entfernt). ~30 min.

```bash
task env:validate:all; echo "exit=$?"
```

> **Baseline:** FAIL Exit 5 (POCKET_ID_DOMAIN ×4) · **Target:** Exit 0 (alle envs schema-konform) · **Aufwand:** ~30 min · **Messzyklus:** pro Merge (CI-tauglich) · **Reproduzierbar:** ja

## G-DATA01 — DB-Backup-Freshness: jüngster Erfolg < 26h + 0 Failed/7d

**Was:** Der `db-backup`-CronJob (`schedule '0 2 * * *'`) sichert die geteilte PostgreSQL. DSGVO-/Thesis-kritisch (alles on-premise, kein Cloud-Fallback). Ein lautlos hängender Backup-Job = Datenverlust-Risiko — bislang kein Health-Gate dafür.

**Warum erreichbar:** Aktuell gesund (jüngster Complete-Job ~23h, `lastSuccessfulTime` 2026-06-26). Ein 26h-Frische-Check + „0 Failed-Jobs/7d" formalisiert nur die Überwachung. Cluster-abhängig (`fleet`-Kontext).

```bash
kubectl --context fleet -n workspace get cronjob db-backup -o jsonpath='{.status.lastSuccessfulTime}'; echo
kubectl --context fleet -n workspace get jobs -l app=db-backup --sort-by=.metadata.creationTimestamp | tail -3
```

> **Baseline:** gesund (~23h, 1 Failed-Job vor 8d) · **Target:** jüngster Erfolg < 26h UND 0 Failed/7d · **Aufwand:** Monitor (+ optional Alert) · **Messzyklus:** täglich · **Reproduzierbar:** eingeschränkt (Cluster nötig)

---

# 8. CI/CD & Delivery (DORA)

> **Hinweis zu Erfolgsraten (G-CI/G-CD):** `gh run list --limit N` ist ein **gleitendes Fenster** — der Wert verschiebt sich mit jedem neuen Lauf. Für stabile, reproduzierbare Messung ein fixes `--created`-Zeitfenster verwenden.

## G-CI01 — main `ci.yml`-Erfolgsrate (letzte 20): 100 % → ≥ 95 % halten

**Was:** Anteil erfolgreicher `ci.yml`-Push-Läufe auf main (bündelt die required Jobs Offline Tests, Security Scan, Brett TS, Vitest). Sinkende Rate = fehlerhafte Commits landen trotz grünem PR auf main (Merge-Skew, flaky Gates).

**Warum erreichbar:** Aktuell 20/20 grün. Da PRs nur mit grünem Gate squash-gemergt werden, ist ≥ 95 % reine Erhaltung (kein Direct-/Force-Push, flaky Tests fixen statt rerun).

```bash
timeout 60 gh-axi run list --workflow ci.yml --branch main --limit 20 \
  | grep -oE 'completed,(success|failure|cancelled)' | sort | uniq -c
```

> **Baseline:** 100 % (20/20) · **Target:** ≥ 95 % · **Aufwand:** Policy · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (gleitendes Fenster)

## G-CI02 — Rote required-Läufe auf main-HEAD: 0

**Was:** failure-Konklusionen unter den letzten 5 `ci.yml`-Läufen auf main. Ein rotes Gate auf main-HEAD = der aktuelle Stand würde das eigene Merge-Gate nicht bestehen; Folgemerges bauen auf rotem Fundament.

**Warum erreichbar:** Aktuell 0 rote, neuester Lauf grün. Branch-Protection erzwingt 5 required checks → ein roter main-HEAD ist Sofort-Eskalation, kein Dauerzustand.

```bash
timeout 60 gh-axi run list --workflow ci.yml --branch main --limit 5 | grep -c 'completed,failure'
```

> **Baseline:** 0 rote · **Target:** dauerhaft 0 · **Aufwand:** Policy · **Messzyklus:** täglich · **Reproduzierbar:** eingeschränkt (gleitendes Fenster)

## G-CD01 — korczewski Website-Deploy-Erfolgsrate: 27 % → ≥ 90 %  ⚠️ ECHTE SCHULD

**Was:** Erfolgsrate von `build-website-korczewski.yml` (letzte 15 main-Läufe): **4/15 grün** (11 Failures, neueste 3 alle rot). web.korczewski.de wird bei den meisten Pushes **nicht** neu deployt → driftet still gegen main, während mentolder live geht. Der stärkste konkrete CD-Defekt.

**Warum erreichbar:** Der Schwester-Workflow `build-website.yml` (mentolder) steht bei 15/15 (100 %) mit identischer Mechanik. Differenz ist Konfig-/Credential-Problem (vermutlich Kubeconfig/Secret/Context der korczewski-Lane) — per `gh-axi run view <id> --log-failed` in ~1 Session behebbar.

```bash
timeout 60 gh-axi run list --workflow build-website-korczewski.yml --branch main --limit 15 \
  | grep -oE 'completed,(success|failure)' | sort | uniq -c
```

> **Baseline:** 27 % (4/15) · **Target:** ≥ 90 % · **Aufwand:** ~1 Debug-Session · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (gleitendes Fenster)

## G-CD02 — `post-merge.yml`-Erfolgsrate: 87 % → ≥ 95 %

**Was:** Erfolgsrate des post-merge-Workflows (letzte 15: 13/15 = 87 %). Ein roter Lauf = nachgelagerte Schritte (Freshness-Regen/Deploy-Trigger) schlagen nach Merge fehl, ohne den Merge zu blocken → stille Drift main ↔ generierte Artefakte/Cluster.

**Warum erreichbar:** Nur 2 Failures/15, überwiegend grün. Typisch transiente Git-/Push-Races bei der Freshness-Auto-Regen — gezielter Retry-/Rebase-Guard härtet auf ≥ 95 %.

```bash
timeout 60 gh-axi run list --workflow post-merge.yml --branch main --limit 15 \
  | grep -oE 'completed,(success|failure)' | sort | uniq -c
```

> **Baseline:** 87 % (13/15) · **Target:** ≥ 95 % · **Aufwand:** klein (Race-Guard) · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (gleitendes Fenster)

---

### DORA-Metriken (G-DORA01–04)

> **Autoritative Quelle:** `/admin/dora`-Dashboard + DB-View `v_timeline` (`openspec/changes/dora-delivery-pipeline`). Die git-Befehle unten sind **Shallow-Clone-Orientierung**, kein reproduzierbarer Durchsatz — auf einem Voll-Clone bzw. via DB liefern dieselben Definitionen echte 4-/8-Wochen-Mittel. Alle vier Metriken liegen aktuell im **Elite-Band**; die Ziele sind daher *Sustain/Tracking*-Ziele.

## G-DORA01 — Deployment Frequency: Elite halten (≥ 1 Merge/Werktag)

**Was:** Merges nach main/Woche (first-parent-Commits, squash-and-merge). Spiegelt „Deployment Frequency" aus `dora-dashboard.md` (ehrlich als „Merges nach main" gelabelt, da Prod-Deploy push-basiert entkoppelt). Sinkende Frequenz = größere, seltenere Batches → mehr Konflikte/Risiko.

**Warum erreichbar:** Real ~24 Merges/Tag (weit im Elite-Band). Ziel: Niveau halten + auf `/admin/dora` sichtbar tracken, damit ein Einbruch (Factory-Stillstand) sofort auffällt.

```bash
git log --since="4 weeks ago" --first-parent --oneline main | wc -l   # /4 = Merges/Woche (NUR auf Voll-Clone aussagekräftig)
```

> **Baseline:** ~166/Woche (~24/Tag; Shallow-Artefakt) · **Target:** ≥ 5/Woche, Trend auf /admin/dora · **Aufwand:** Policy/Tracking · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Shallow → DB)

## G-DORA02 — Lead Time (PR-open → merge): Elite-Median ≤ 1h halten

**Was:** Zeit PR-Eröffnung → Merge über zuletzt gemergte PRs. Approximiert die DORA-Lead-Time aus `dora-dashboard.md`. *Caveat:* Der PR-open→merge-Median (0.03h) misst de facto **Auto-Merge-Bot-Latenz**, nicht die volle Lead Time (erster Commit → Prod) — letztere nur über `v_timeline` (ticket.created_at → merged_at).

**Warum erreichbar:** Pipeline-Latenz bereits Elite (Median 0.03h, Mean 0.29h). Ziel: nicht verfallen lassen (CI grün, Auto-Merge sauber); volle Lead Time als v_timeline-Drilldown.

```bash
gh-axi api 'repos/{owner}/{repo}/pulls?state=closed&base=main&per_page=80&sort=updated&direction=desc' \
  | grep -E '^\s+(created_at|merged_at):'   # Differenzen via DB/v_timeline für spec-exakte Lead Time
```

> **Baseline:** Median 0.03h (PR→merge-Proxy) · **Target:** Median ≤ 1h; Max-Ausreißer < 24h · **Aufwand:** Policy · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Proxy ≠ Spec; DB für exakt)

## G-DORA03 — Change Failure Rate (Proxy): ≤ 15 % halten

**Was:** Anteil Merges mit späterem Rollback/Fix. Spiegelt `dora-dashboard.md` (CFR = (Reverts + Bug-Tickets)/Merges, explizit Proxy). git-strikt = revert/hotfix-Commits (0 %); git-breit zählt `fix()`-Commits als Bug-Näherung (16.7 %). *Caveat:* `fix()` ≠ Prod-Ausfall — spec-exakte CFR braucht Bug-Tickets aus der DB.

**Warum erreichbar:** Strikte Revert-Rate 0 %; breiter Proxy 16.7 % knapp über Elite (0–15 %). Rückgang ≤ 15 % über konsequente Bug-Triage + CI-Gates.

```bash
T=$(git log --since="8 weeks ago" --first-parent --oneline main | wc -l)
R=$(git log --since="8 weeks ago" --first-parent --oneline main | grep -ciE 'revert|hotfix')
F=$(git log --since="8 weeks ago" --first-parent --oneline main | grep -ciE '^[0-9a-f]+ fix\(')
python3 -c "print(f'merges={$T} reverts={$R} ({$R/$T*100:.1f}% strikt) +fix()={$F} -> {($R+$F)/$T*100:.1f}% breit')"
```

> **Baseline:** 16.7 % breit / 0 % strikt · **Target:** ≤ 15 % (Elite), strikt 0 % · **Aufwand:** ~1 Woche + laufend · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Shallow/Proxy; DB für exakt)

## G-DORA04 — MTTR: Median < 24h halten

**Was:** Zeit fehlerhafter Merge → Fix/Revert. Spiegelt `dora-dashboard.md` (MTTR = Median `merged_at(Fix-PR) − created_at` über `type='bug'`). git-Proxy: Zeitspanne Revert/Hotfix → zurückgerollter Commit. *Caveat:* aktuell 0 Recovery-Fälle im sichtbaren Fenster → MTTR = n/a (kein realer Messwert, Platzhalter).

**Warum erreichbar:** Squash + Auto-Merge erlauben schnelle Folge-PRs; `incident-response`-Skill existiert. < 24h (Elite < 1h) bei künftigen Störungen gut erreichbar. Volle MTTR über Bug-Tickets via `v_timeline`.

```bash
git log --since="8 weeks ago" --first-parent --format='%ct %s' main | grep -iE 'revert|hotfix' | wc -l   # 0 = kein Recovery-Fall
```

> **Baseline:** n/a (0 Recovery-Fälle) · **Target:** Median < 24h bei Störungen · **Aufwand:** Policy (Revert-Bereitschaft) · **Messzyklus:** pro Incident · **Reproduzierbar:** eingeschränkt (DB für exakt)

---

# 9. Prozess & Repo-Hygiene

## G-GIT01 — Offene PRs älter als 7 Tage: 0

**Was:** Offene PRs >7 Tage = Review-Stau: divergieren von main, sammeln Konflikte (CONFLICTING blockt sogar CI), binden Kontext. Ergänzt G-RH04 (stale Branches) um die PR-Flow-Seite.

**Warum erreichbar:** Aktuell 0 (2 offen, beide 0d). Reine Disziplin: `gh pr merge --squash --auto` direkt nach PR-Erstellung hält die Liste leer.

```bash
gh pr list --state open --json number,createdAt | python3 -c "
import sys,json; from datetime import datetime,timezone
p=json.load(sys.stdin); n=datetime.now(timezone.utc)
a=[(n-datetime.fromisoformat(x['createdAt'].replace('Z','+00:00'))).days for x in p]
print('open:',len(p),'| >7d:',sum(x>7 for x in a),'| oldest:',max(a) if a else 0,'d')"
```

> **Baseline:** 0 >7d (2 offen) · **Target:** dauerhaft 0 · **Aufwand:** Policy · **Messzyklus:** täglich · **Reproduzierbar:** mit gh

## G-GIT02 — Non-conventional Commit-Subjects (letzte 30 auf main): 0

**Was:** Letzte 30 main-Subjects ohne Conventional-Commits-Typ (feat|fix|chore|docs|refactor|test|ci|build|perf|style). Nicht-konforme Subjects brechen die LLM-Release-Notes (`scripts/vda.sh release-notes`) und das Changelog (parst Typ-Prefixes).

**Warum erreichbar:** Aktuell 0/30. Der required Check „Conventional Commits" erzwingt PR-Titel beim Squash-Merge. Stay-Green: Gate nicht aufweichen, keine Direkt-Pushes.

```bash
git log --format=%s -30 origin/main | grep -vcE '^(feat|fix|chore|docs|refactor|test|ci|build|perf|style)(\(|!|:)'
```

> **Baseline:** 0/30 · **Target:** dauerhaft 0 · **Aufwand:** Policy (CI-Gate) · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-GIT03 — Dateien > 1MB im Tree (kein LFS): 11 → ≤ 6

**Was:** 11 git-getrackte Dateien >1MB, git-lfs inaktiv (0 LFS-Dateien). Größte: `kube-prometheus-stack-rendered.yaml` (4.98MB, gerendert), 2× `og-image-square.png` (je 1.8MB, massiv überdimensioniert), 3× generierte docs-HTML (~2.3MB). Große Blobs blähen jeden Clone auf.

**Warum erreichbar:** ~5 sofort reduzierbar: gerendertes Prometheus-YAML regenerieren/gitignoren; OG-PNGs verlustfrei auf <1MB (echte OG-Bilder ~150KB). Generierte docs-HTML + User-Uploads bleiben legitim >1MB → Target ≤6 statt 0. Net-Zero (keine neuen >1MB) sofort.

```bash
git ls-files -z | xargs -0 -I{} sh -c 'test -f "{}" && wc -c "{}"' 2>/dev/null \
  | awk '$1>1048576{c++} END{print c+0}'
```

> **Baseline:** 11 (LFS aus) · **Target:** ≤ 6 · **Aufwand:** ~0.5 Tag (Asset-Optimierung) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-SPEC01 — `openspec:validate` grün: Exit 1 (8 FAIL · 2 WARN) → Exit 0

**Was:** Fail-closed CI-Gate `task openspec:validate` (`scripts/openspec.sh`) prüft jeden nicht-archivierten change auf gültige `specs/`-Delta-Struktur + `.ticket`-Verknüpfung. **Aktuell Exit 1:** 8 changes ohne `specs/`-Delta-Dir (reine Skelette: bats-coverage-batch1, cockpit-bulk-status, cockpit-filter-presets, cockpit-mobile-view, mentolder-react-rebuild, s1-violations-batch1, test-slug, ticket-mcp-go), 2 ohne `.ticket`.

**Warum erreichbar:** Reines Aufräumen vorhandener Artefakte: pro Skelett `specs/`-Delta nachreichen oder via `openspec:archive`/Löschung entfernen (z.B. `test-slug`). 8 Fälle, je ~15–30 min.

```bash
timeout 120 bash scripts/openspec.sh validate >/dev/null 2>&1; echo "exit=$?"
```

> **Baseline:** Exit 1 (8 FAIL, 2 WARN) · **Target:** Exit 0 · **Aufwand:** ~1 Tag · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-SPEC02 — Nicht-archivierte changes älter als 30 Tage: 0

**Was:** Nicht-archivierte Proposals unter `openspec/changes/`, deren erster Commit >30 Tage alt ist — vergessene Skelette oder umgesetzte, aber nicht via `openspec:archive` zurückgeführte changes. Bläht den changes-Baum auf (analog G-RH05, aber auf Verzeichnis- statt Ticket-Ebene).

**Warum erreichbar:** Aktuell 0 (älteste 6 Tage). Keep-at-0: beim Merge archivieren, verwaiste Skelette löschen.

```bash
NOW=$(date +%s); n=0
for d in openspec/changes/*/; do b=$(basename "$d"); [ "$b" = archive ] && continue
  ts=$(git log --diff-filter=A --format='%ct' -- "$d" | tail -1); [ -z "$ts" ] && continue
  [ $(((NOW-ts)/86400)) -gt 30 ] && n=$((n+1)); done; echo "older30=$n"
```

> **Baseline:** 0 (16 nicht-archiviert, älteste 6d) · **Target:** dauerhaft 0 · **Aufwand:** Policy · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-SPEC03 — Proposals ohne Ticket-Verknüpfung (.ticket): 10 → 0

**Was:** 10/16 nicht-archivierte changes ohne `.ticket`-Datei (externe Ticket-ID). Ohne sie kann `openspec.sh` den Status nicht auf `plan_staged` ziehen; Rückverfolgbarkeit Proposal→Ticket→Merge geht verloren. `validate` meldet das nur als WARN und nur für changes, die die specs-Prüfung überstehen → echte Schuld größer als die validate-Ausgabe (G-SPEC01) suggeriert.

**Warum erreichbar:** Mehrere sind Skelette, die in G-SPEC01 ohnehin aufgeräumt werden. Für echte Proposals nur `echo Txxxxxx > openspec/changes/<slug>/.ticket`. ~0.5 Tag inkl. Cleanup.

```bash
m=0; for d in openspec/changes/*/; do b=$(basename "$d"); [ "$b" = archive ] && continue
  [ -f "$d/.ticket" ] || m=$((m+1)); done; echo "no-ticket=$m"
```

> **Baseline:** 10/16 · **Target:** 0 · **Aufwand:** ~0.5 Tag · **Messzyklus:** pro neuem Proposal · **Reproduzierbar:** ja

---

# 10. Dokumentation

## G-DOC01 — Defekte interne Doc-Links: 9 → 0

**Was:** Relative `.md`-Links in Root-MDs + `docs/`, die auf nicht existierende Ziele zeigen (9/29 geprüfte interne Links kaputt): 1× falsche db-audit-Cross-Reference, 1× Prosa-Beispiel `file.md`, 7× noch nicht angelegte `behaviors/*.md` + `prompts/*.md` aus dem Agent-Library-Plan. Tote Doku → Leser und Agenten (plan-context-Auflösung) laufen ins Leere.

**Warum erreichbar:** 9 lokalisierte Treffer: db-audit-Pfad korrigieren, referenzierte Dateien anlegen/Referenzen entfernen, Prosa-`file.md` als Code escapen. Read-only, CI-tauglich.

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

> **Baseline:** 9 (von 29) · **Target:** 0 · **Aufwand:** ~1–2 h · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-DOC02 — Root-CLAUDE.md Zeilen: 277 → ≤ 200

**Was:** Zeilenzahl der bei jedem Request geladenen Orchestrator-Instruktion. 277 Zeilen / 4463 Wörter; allein „Gotchas & Footguns" = 109 Zeilen (40 %). Je länger, desto eher gehen Routing-/Workflow-Regeln im Footgun-Wust unter und Tokens/Turn werden verschwendet.

**Warum erreichbar:** Footgun-Block fast 1:1 in eine referenzierte Doku auslagerbar (REFERENCE-GOTCHAS.md existiert im Auto-Memory-Schema); in CLAUDE.md bleibt ein Pointer. Reines Verschieben, kein Informationsverlust.

```bash
wc -l < CLAUDE.md
```

> **Baseline:** 277 · **Target:** ≤ 200 · **Aufwand:** mittel (~1 Session) · **Messzyklus:** bei jedem CLAUDE.md-Edit · **Reproduzierbar:** ja

## G-DOC03 — README-Index in Hauptverzeichnissen: 1/5 → 5/5

**Was:** README-Präsenz in `website/`, `brett/`, `scripts/`, `tests/`, `k3d/`. Nur `brett/` hat eines; scripts/tests/k3d ohne Einstiegspunkt → Onboarding und Thesis-Reproduzierbarkeit leiden.

**Warum erreichbar:** 4 kurze README/Index-Dateien (~20–40 Zeilen: Zweck, wichtigste Dateien/Tasks). `website/` darf auf CLAUDE.md + WEBSITE-STANDARDS.md verweisen. Einmalig, niedrig.

```bash
c=0; for d in website brett scripts tests k3d; do ls "$d"/README* >/dev/null 2>&1 && c=$((c+1)); done; echo "$c/5"
```

> **Baseline:** 1/5 · **Target:** 5/5 · **Aufwand:** ~2–3 h · **Messzyklus:** pro neuem Top-Level-Verzeichnis · **Reproduzierbar:** ja

## G-DOC04 — Architektur-ADRs: 0 → ≥ 5

**Was:** Kein `docs/adr/` und keine ADR-Datei. Mehrere große, schwer umkehrbare Entscheidungen (Fleet-Konsolidierung, push-basiertes Deploy ohne GitOps, Brand-Namespace-Split, LLM fail-closed ohne Cross-Space-Fallback, Merge=Abschluss-Ticketmodell) sind nur verstreut in CLAUDE.md erwähnt — für eine Bachelorarbeit ein Verteidigungsrisiko.

**Warum erreichbar:** Entscheidungen sind getroffen und bekannt; nur im ADR-Format niederschreiben (Kontext, Entscheidung, Alternativen, Konsequenzen). ~30–45 min/ADR; 5 decken die wichtigsten irreversiblen Weichen.

```bash
adr=$(find docs -ipath '*adr*' -name '*.md' 2>/dev/null | wc -l); echo "ADR .md: $adr | dir: $([ -d docs/adr ] && echo yes || echo no)"
```

> **Baseline:** 0 · **Target:** ≥ 5 in docs/adr/ · **Aufwand:** mittel (~5×30–45 min) · **Messzyklus:** bei neuer Architekturentscheidung · **Reproduzierbar:** ja

---

# 11. Frontend-Qualität (Perf / A11y / Observability)

## G-FE01 — Accessibility: 0 critical/serious axe-Violations (Kern-Routen beider Marken)

**Was:** Kein a11y-Tooling vorhanden (nur Playwright, kein axe/pa11y/lighthouse), keine `toHaveNoViolations`-Assertion. Die Website bedient zwei öffentliche Marken (mentolder.de, korczewski.de) — Barrierefreiheit ist rechtlich relevant (BFSG/EAA) und ein komplett fehlender Qualitätsaspekt.

**Warum erreichbar:** `@axe-core/cli` gegen die gebaute Preview ist ein abgegrenztes Setup; 0 critical/serious auf Startseite + Kern-Routen ist ein realistischer Erst-Standard. Später als Playwright-Assertion ins E2E.

```bash
pnpm --dir website build >/dev/null 2>&1 && (pnpm --dir website exec astro preview --port 4321 &) ; sleep 6
npx --yes @axe-core/cli http://localhost:4321 http://localhost:4321/ueber-mich --exit
```

> **Baseline:** unbekannt (kein a11y-Tool) · **Target:** 0 critical/serious (Kern-Routen) · **Aufwand:** mittel (Setup + Fixes) · **Messzyklus:** pro Release · **Reproduzierbar:** eingeschränkt (Build + Tool nötig)

## G-FE02 — Client-JS-Bundle-Budget: messen → kein Netto-Zuwachs/Release

**Was:** Astro liefert idealerweise minimal Client-JS; Svelte-Islands + Wachstum können das unbemerkt aufblähen (LCP/TTI). Kein Bundle-Size-Budget, keine Messung — fehlender Performance-Health-Aspekt für ein Nutzerprodukt.

**Warum erreichbar:** Nach einem Astro-Build ist die Client-JS-Summe trivial messbar; ein Budget (kein Netto-Zuwachs ggü. aktuellem Wert pro Release) ist reine Policy. Optional als CI-Check nach Build.

```bash
pnpm --dir website build >/dev/null 2>&1 && find website/dist -name '*.js' -path '*_astro*' -printf '%s\n' 2>/dev/null \
  | awk '{s+=$1} END{printf "client JS total: %.0f KiB\n", s/1024}'
```

> **Baseline:** unbekannt (Voll-Build nötig) · **Target:** Budget setzen, kein Netto-Zuwachs/Release · **Aufwand:** gering (Messung) + Policy · **Messzyklus:** pro Release · **Reproduzierbar:** eingeschränkt (Build nötig)

## G-FE03 — Stray `console.log/debug/info` + strukturiertes Logging: 3 → 0

**Was:** `website/src` nutzt 112 rohe `console.*` (91 error, 18 warn, 3 log/debug/info) und keinen strukturierten Logger (kein pino/winston). Unstrukturiertes Log-Rauschen ohne Level/Korrelation in Prod-Pods erschwert Incident-Triage; die 3 `console.log/debug/info` sind reine Dev-Reste.

**Warum erreichbar:** Die 3 Dev-Reste sofort entfernbar. Ein schmaler Logger-Wrapper (error/warn über strukturierten Logger) ist ein abgegrenzter Schritt — error/warn lassen sich migrieren statt umschreiben.

```bash
echo -n "log/debug/info: "; grep -rEn 'console\.(log|debug|info)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l
echo -n "error/warn: ";     grep -rEn 'console\.(error|warn)'      website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l
```

> **Baseline:** 3 stray (+109 error/warn) · **Target:** 0 stray + strukturierter Logger · **Aufwand:** klein (stray) + mittel (Logger) · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

---

# Zusammenfassung

**Legende Reproduzierbar:** ✅ = stabil/deterministisch · ⚠️ = eingeschränkt (siehe Mess-Disziplin oben).

| ID | Ziel | Baseline | Target | Aufwand | Repro |
|----|------|----------|--------|---------|:---:|
| **G-RH01** | Baselined Gate-Violations (gesamt) | 70 | ≤ 30 | ~3–4 Wo | ✅ |
| **G-RH02** | TypeScript-Suppressionen | 0 | 0 | erreicht | ✅ |
| **G-RH03** | OpenSpec-BATS-Abdeckung | 28 % | ≥ 60 % | ~3–4 Wo | ✅ |
| **G-RH04** | Stale Remote Branches | 0 | 0 | Policy | ✅ |
| **G-RH05** | Plan-Staged idle >14d | 0 | 0 | laufend | ✅ |
| **G-RH06** | Sentinel-Issues >48h | 0 | 0 | Policy | ✅ |
| **G-RH07** | Freshness-Check grün | Exit 0 | Exit 0 | Policy | ✅ |
| **G-TEST01** | BATS Debt-Skips | 9 | 0 | ~1–2 Wo | ✅ |
| **G-TEST02** | Vitest `.only` | 0 | 0 | Policy | ✅ |
| **G-TEST03** | Vitest skip/todo-Suiten | 5 | 0 | ~1 Wo | ✅ |
| **G-TEST04** | Test-Inventory-Drift | 0 | 0 | Policy | ✅ |
| **G-TEST05** | Vitest Line-Coverage | — | ≥ 60 % | ~0.5 Tag+ | ⚠️ |
| **G-CQ01** | astro-check-Fehler | 177 | ≤ 20 | ~2–3 Sess | ✅ |
| **G-CQ02** | Explizite `any` | 564 | ≤ 280 | ~4–5 Wo | ✅ |
| **G-CQ03** | ESLint einrichten | kein ESLint | Gate + 0 | ~1 Tag | ⚠️ |
| **G-CQ04** | FIXME/HACK/XXX (echt) | 0 | 0 | Policy | ✅ |
| **G-CQ05** | Echte TODOs | 3 | ≤ 1 | ~2 Sess | ✅ |
| **G-CQ06** | `@deprecated` | 3 | ≤ 1 | ~1 Sess | ✅ |
| **G-CQ07** | S2 Import-Zyklen | 4 | 0 | mittel | ✅ |
| **G-CQ08** | Dead-Code/unused exports | — | −50 % | mittel | ⚠️ |
| **G-CQ09** | S3 hartkodierte Hostnames | 24 | ≤ 10 | ~2 Sess | ✅ |
| **G-CQ10** | S4 verwaiste Scripts/Manifeste | 12 | ≤ 4 | ~1 Sess | ✅ |
| **G-SIZE01** | Freeze-Frühwarn-Band | 35 | ≤ 15 | ~3–4 Wo | ✅ |
| **G-SIZE02** | Großdateien außerhalb Gate | 18 | ≤ 8 | ~2–3 Wo | ✅ |
| **G-SIZE03** | God-File website-db.ts | 4485 | ≤ 3000 | ~2 Wo | ✅ |
| **G-SIZE04** | Netto-LOC/Woche | ~ −1500 | ≤ +2000 | Policy | ⚠️ |
| **G-DEP01** | High/Critical npm-Vulns | 6 | 0 | ~1–2 h | ⚠️ |
| **G-DEP02** | Veraltete Major-Deps | 9 | ≤ 3 | ~1–2 Tage | ⚠️ |
| **G-DEP03** | Verwaiste npm-Lockfile (website) | 1 | 0 | ~10 min | ✅ |
| **G-DEP04** | package.json ohne engines | 6 | 0 | ~30 min | ✅ |
| **G-DEP05** | Renovate-PR-Backlog | 0 | ≤ 3 | Policy | ✅ |
| **G-IMG01** | Ungepinnte Fremd-Images | 43 | 0 | 2–3 Sess | ✅ |
| **G-IMG02** | Fremd-Image-Versions-Drift | 3 | 0 | ~1 h | ✅ |
| **G-SEC01** | Hardcoded Secrets (k3d) | 0 | 0 | Policy | ✅ |
| **G-SEC02** | git-crypt Klartext-Leaks | Exit 0 | Exit 0 | Policy | ✅ |
| **G-SEC03** | SealedSecret-Rotation | 5 Tage | ≤ 90 Tage | 1/Quartal | ✅ |
| **G-SEC04** | Sealing-Cert Restlaufzeit | 3622 Tage | ≥ 30 Tage | Monitor | ✅ |
| **G-SEC05** | Unsignierte Commits (main) | ~26 % | ≤ 5 % | ~0.5 Tag | ✅ |
| **G-K8S01** | Deployments ohne Limits | 0/34 | 0 | Policy | ✅ |
| **G-K8S02** | Deployments ohne readinessProbe | 10/34 | ≤ 3 | ~1 Tag | ✅ |
| **G-K8S03** | Deployments ohne securityContext | 3/34 | 0 | ~0.5 Tag | ✅ |
| **G-K8S04** | workspace:validate grün | Exit 0 | Exit 0 | Policy | ✅ |
| **G-CFG01** ⚠️ | env:validate:all grün | **FAIL (5)** | Exit 0 | ~30 min | ✅ |
| **G-DATA01** | DB-Backup-Freshness | ~23h | < 26h, 0 fail/7d | Monitor | ⚠️ |
| **G-CI01** | main ci.yml-Erfolgsrate | 100 % | ≥ 95 % | Policy | ⚠️ |
| **G-CI02** | rote main-HEAD-Läufe | 0 | 0 | Policy | ⚠️ |
| **G-CD01** ⚠️ | korczewski-Deploy-Rate | **27 %** | ≥ 90 % | ~1 Sess | ⚠️ |
| **G-CD02** | post-merge.yml-Rate | 87 % | ≥ 95 % | klein | ⚠️ |
| **G-DORA01** | Deployment Frequency | Elite | ≥ 5/Wo | Policy | ⚠️ |
| **G-DORA02** | Lead Time | Median 0.03h | ≤ 1h | Policy | ⚠️ |
| **G-DORA03** | Change Failure Rate | 16.7 % | ≤ 15 % | ~1 Wo | ⚠️ |
| **G-DORA04** | MTTR | n/a | < 24h | Policy | ⚠️ |
| **G-GIT01** | Offene PRs >7 Tage | 0 | 0 | Policy | ✅ |
| **G-GIT02** | Non-conventional Commits | 0/30 | 0 | Policy | ✅ |
| **G-GIT03** | Dateien >1MB (kein LFS) | 11 | ≤ 6 | ~0.5 Tag | ✅ |
| **G-SPEC01** ⚠️ | openspec:validate grün | **Exit 1** | Exit 0 | ~1 Tag | ✅ |
| **G-SPEC02** | Changes >30 Tage | 0 | 0 | Policy | ✅ |
| **G-SPEC03** | Proposals ohne .ticket | 10 | 0 | ~0.5 Tag | ✅ |
| **G-DOC01** | Defekte interne Doc-Links | 9 | 0 | ~1–2 h | ✅ |
| **G-DOC02** | CLAUDE.md Zeilen | 277 | ≤ 200 | ~1 Sess | ✅ |
| **G-DOC03** | README-Index | 1/5 | 5/5 | ~2–3 h | ✅ |
| **G-DOC04** | Architektur-ADRs | 0 | ≥ 5 | ~5×45 min | ✅ |
| **G-FE01** | a11y axe-Violations | — | 0 crit/serious | mittel | ⚠️ |
| **G-FE02** | Client-JS-Bundle-Budget | — | kein Zuwachs | gering+ | ⚠️ |
| **G-FE03** | Stray console.* + Logger | 3 | 0 + Logger | klein+ | ✅ |

## Sofort-Quick-Wins (hoher Wert, ≤ ~1 Tag)

Diese Ziele sind echte, sofort behebbare Defekte oder Ein-Sitzung-Aufräumarbeiten:

1. **G-CFG01** — `POCKET_ID_DOMAIN` in 4 env-Dateien ergänzen → `env:validate:all` grün *(aktiver Defekt, ~30 min)*
2. **G-DEP03** — verwaiste `website/package-lock.json` löschen (brett bleibt npm-primär) *(~10 min)*
3. **G-DEP04** — `engines.node` in 6 package.json *(~30 min)*
4. **G-RH01** — ✓ `task quality:baseline:refresh` ausgeführt: 4 stale S3-Einträge entfernt (74→70) *(erledigt)*
5. **G-CD01** — korczewski-Deploy-Lane debuggen *(~1 Session, behebt 73 % Fehlschläge)*
6. **G-DOC01** — 9 defekte Doc-Links *(~1–2 h)*
7. **G-DEP01** — 6 high npm-Vulns via overrides + nodemailer-Bump *(~1–2 h)*

## Messzyklus

- **Pro Merge (CI-Gate):** G-RH02, G-RH07, G-TEST02/04, G-CQ04, G-SEC01/02, G-K8S04, G-CFG01, G-CI02, G-GIT02, G-SPEC01, G-FE03
- **Täglich:** G-RH06, G-CI02, G-DATA01, G-GIT01
- **Wöchentlich:** G-RH01/03, G-TEST01/03/05, G-CQ01/02/05/07/09/10, G-SIZE*, G-CI01, G-CD01/02, G-DORA*, G-GIT03, G-SPEC02/03, G-SEC05
- **Monatlich / Quartal:** G-CQ06/08, G-DEP02, G-SEC03/04, G-DOC02, G-FE01/02 (pro Release)
- **Bei Bedarf:** G-RH04/05, G-DEP01/05, G-IMG*, G-K8S02/03, G-DOC03/04, G-CQ03

**Mess-Werkzeug:** Ein Sammel-Skript (`scripts/health-goals-check.sh`) könnte alle ✅-reproduzierbaren Ziele in einem Lauf gegen ihre Targets prüfen und einen Ampel-Report ausgeben — siehe Quick-Win-Kandidat für die Automatisierung dieses Katalogs.
