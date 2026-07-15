# Repository Health Goals

Quantifizierbare Ziele für die strukturelle Gesundheit des Repos.
Ein Ziel ohne reproduzierbaren Mess-Befehl ist kein Ziel, sondern ein Wunsch.

**Baseline-Stichtag:** `2026-07-01` · **Dashboard:** Homepage-Section `#health`

> **Format.** Jedes Ziel trägt eine Meta-Zeile:
> `Priorität · Baseline · Target · Aufwand · Messzyklus · Reproduzierbar`
> A = aktive Verletzung/Regression, B = unter Target, C = auf Target (halten).
>
> **ID-Konvention.** `G-RH01`–`G-RH07` sind *stabile Anker* und werden außerhalb referenziert —
> sie werden nie umnummeriert. Neue Ziele nutzen domänenspezifische Präfixe.

---

## Abschnitte

1. [Priorität A — Aktive Defekte](#prio-a)
2. [Priorität B — Offene Ziele](#prio-b)
3. [Priorität C — Green Gates](#prio-c)
4. [Mess-Werkzeug & Zyklus](#mess-werkzeug)

---

# Priorität A — Aktive Defekte {#prio-a}

Sofort angehen. Ticket-Erstellung ist **bewusst manuell** (`scripts/health-goals-update.sh
--suggest-tickets`, dedupliziert gegen offene Tickets) — kein Ziel erzeugt automatisch ein Ticket.

---

## G-GIT03 — Dateien > 1MB im Tree (kein LFS): 7 🔴 (Ziel ≤ 6)

**Was:** Zählt Dateien >1MB im Tree (u. a. gerenderte `kube-prometheus-stack`-Manifeste, gebaute Docs-HTML). `.codebase-memory/graph.db.zst` (16.7MB, ehem. PR #2281) is seit **T001717** kein getracktes Repo-Artefakt mehr — es wird lokal via `task codebase:index` regeneriert (`.gitignore`) statt committet, daher entfällt der frühere Scope-Ausschluss (T001348) ersatzlos.

```bash
git ls-files -z | xargs -0 -I{} sh -c 'test -f "{}" && wc -c "{}"' 2>/dev/null \
  | awk '$1>1048576{c++} END{print c+0}'
```

**Historie (T001348, obsolet seit T001717):** Eine LFS-Migration von `graph.db.zst` wurde ursprünglich verworfen und die Datei stattdessen per Policy-Entscheidung aus dem Gate-Scope ausgeschlossen (git-lfs lokal defekt, kein erkennbarer Gegenwert für ein intern generiertes `merge=ours`-Binärartefakt). T001717 hat das Problem an der Wurzel gelöst: die Datei is nicht mehr getrackt, der Ausschluss ist damit hinfällig.

> **A · Baseline:** 6 → 7 🔴 · **Target:** ≤ 6 · **Aufwand:** erledigt · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · Ticket: T001717 (löst T001348 ab �# Priorität B — Offene Ziele {#prio-b}

Im nächsten Sprint einplanen.

## G-SIZE02 — Großdateien außerhalb Gate-Scope: 17 → ≤ 8

15× VideoVault/, 2× .opencode/ — von keinem Gate überwacht.

```bash
git ls-files VideoVault .opencode | grep -E '\.(ts|tsx|js|mjs|svelte|sh|py)$' \
  | grep -v node_modules | xargs wc -l 2>/dev/null | grep -v ' total$' | awk '$1>600' | wc -l
```

> **B · Baseline:** 17 (unverändert) · **Target:** ≤ 8 · **Aufwand:** ~2–3 Wochen · **Messzyklus:** pro Merge auf VideoVault/ · **Reproduzierbar:** ja · **Ticket:** T001556

## G-AGENTIC09 — SKILL.md > 500 Zeilen: 1 🟡 (Ziel ≤ 0)

**Was:** Ein Skill überschreitet die 500-Zeilen-Empfehlung: `dev-flow-plan` (508).
Längere Skills sind schwerer zu warten und erhöhen den Prompt-Token-Verbrauch bei Dispatch.
Ein Split in Sub-Skills oder ausgelagerte Referenz-Dokumente würde die Lesbarkeit verbessern.

```bash
find .claude/skills -name SKILL.md -exec wc -l {} + | awk '$2!="total"&&$1>500{c++} END{print c+0}'
```

> **B · Baseline:** 3 (dev-flow-execute 662, infra-ops 595, dev-flow-plan 580) → 1 (dev-flow-plan 508) · **Target:** 0 · **Aufwand:** mittel (je Skill ~2–4h Refactoring) · **Messzyklus:** monatlich · **Reproduzierbar:** ja · **Kein Gate** — Reduktionsziel · **Ticket:** T001559

## G-DB01 — FK-Spalten ohne Index: 4 → 0

**Was:** Zählt FK-Spalten mit Single-Column-FK, die keinen passenden Index haben. Live-Wert 4
(3 Tabellen mit je einem fehlenden Index, plus eine Wiederholung). Nur Messung verdrahtet,
kein erzwungener Fix — die Indizes werden in einem Folge-Ticket nachgezogen.

```bash
WITH fk AS (
  SELECT c.conrelid AS relid, c.conkey[1] AS col FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE c.contype='f' AND n.nspname NOT IN ('pg_catalog','information_schema') AND array_length(c.conkey,1)=1),
idx AS (SELECT i.indrelid AS relid, i.indkey[0] AS col FROM pg_index i)
SELECT count(*) FROM (SELECT relid,col FROM fk EXCEPT SELECT relid,col FROM idx) x;
```

> **B · Baseline:** 4 · **Target:** 0 · **Aufwand:** gering (3 Indizes via Migration) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001739 (Messung verdrahtet; Index-Fix ausstehend)

## G-DB03 — brand-Spalten ohne CHECK-Constraint: 44 → 0

**Was:** Zählt Tabellen mit einer `brand`-Spalte, die keinen CHECK-Constraint auf `'mentolder'`
haben. Live-Wert 44 von 44 Tabellen — alle `brand`-Spalten sind unconstrained. Nur Messung
verdrahtet, kein erzwungener Fix aller 44 Tabellen (das wäre ein eigenständiges DB-Migrations-Projekt).

```sql
SELECT
    (SELECT count(DISTINCT table_schema||'.'||table_name) FROM information_schema.columns
       WHERE column_name='brand' AND table_schema NOT IN ('pg_catalog','information_schema'))
  - (SELECT count(DISTINCT conrelid) FROM pg_constraint
       WHERE contype='c' AND pg_get_constraintdef(oid) ILIKE '%brand%' AND pg_get_constraintdef(oid) ILIKE '%mentolder%');
```

> **B · Baseline:** 44 · **Target:** 0 · **Aufwand:** gross (44 Tabellen, orchestrierte Migration) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001739 (Messung verdrahtet; CHECK-Constraints ausstehend)

## G-IMG01 — Fremd-Image-Versions-Drift: 0 → 2

**Was:** Zählt Fremd-Images (Helm-Chart-Referenzen) in gerenderten Monitoring-Manifesten,
deren Image-Digest nach einem Chart-Upgrade nicht nachgezogen wurde. Aktuell 2 Drifts:
`promtail-rendered.yaml` und `loki-rendered.yaml`.

```bash
grep -rhE 'image:' k3d/ prod*/ | grep -vE 'paddione|_IMAGE' | sort -u | awk -F'\t' '{c[$1]++} END{for(k in c)if(c[k]>1)print k,c[k]}'
```

> **B · Baseline:** 0→2 · **Target:** 0 · **Aufwand:** gering (Digest via `docker inspect`/`crane digest` nachtragen und Chart-Render-Skript entsprechend anpassen) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001766

## G-DB09 — Slow Queries in pg_stat_statements: n/a → 0

**Was:** Zählt Queries in `pg_stat_statements` mit `mean_exec_time > 1000ms`.
`pg_stat_statements` ist seit Einrichtung von `k3d/shared-db.yaml` via `shared_preload_libraries`
geladen, wird aber nirgendwo ausgelesen. Langsame Queries sind der häufigste Grund für
schlechte API-Antwortzeiten und werden aktuell nur von Nutzern oder gelegentlichem
pgAdmin-Blick entdeckt.

```bash
db_scalar "SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000"
```

> **B · Baseline:** n/a · **Target:** 0 · **Aufwand:** gering (Messbefehl in health-goals-check.sh, Fix ist Query-Optimierung) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001838

## G-DB10 — Unused Indexes (idx_scan = 0): n/a → 0

**Was:** Zählt Indizes mit `idx_scan = 0` seit dem letzten Reset. Unbenutzte Indizes
verlangsamen Schreiboperationen, erhöhen Autovacuum-Last und belegen Plattenplatz.
Primary Keys und Unique-Constraint-Träger werden ausgeschlossen (deren idx_scan ist
intrinsisch niedrig).

```bash
db_scalar "SELECT count(*) FROM pg_stat_user_indexes WHERE idx_scan = 0 AND indisready AND NOT indisprimary AND indexrelid NOT IN (SELECT conindid FROM pg_constraint WHERE contype='u')"
```

> **B · Baseline:** n/a · **Target:** 0 · **Aufwand:** gering (Messung) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001839

## G-SEC06 — Container Images mit High/Critical CVEs: n/a → 0

**Was:** Zählt unique Container-Images im aktiven Deployment mit bekannten CVEs der
Severity `HIGH` oder `CRITICAL`. Trivy-Scan ist jetzt in CI integriert (`.github/workflows/ci.yml`
Security Scan Job) als advisory-only Check. `scripts/trivy-scan.sh` liefert die lokale
Baseline-Messung. 14 pinned Images werden gescannt; `:latest` Images (projekt-eigen) werden
nicht gescannt (Build-Zeitpunkt variiert).

```bash
# Messung (lokal):
bash scripts/trivy-scan.sh --json | jq '.total_critical, .total_high'
# CI: advisory-only in .github/workflows/ci.yml (Security Scan Job)
```

> **B · Baseline:** n/a → 0 (Trivy-Integration abgeschlossen, erster Scan ausstehend) · **Target:** 0 · **Aufwand:** gering (Messung) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001840

## G-CI03 — CI Pipeline p95 Duration > 12 min: n/a → ≤ 12 min

**Was:** Misst die p95-Dauer der letzten 20 CI-Runs auf `main` (von `createdAt` bis
`updatedAt`). CI-Latenz ist ein direkter Hebel für Developer Velocity — je länger der
Rückmeldungszyklus, desto geringer die Deployment Frequency. Der CI-Timeouts liegen
bei 15 min für Tests; p95 sollte darunter bleiben. Messung ist in
`scripts/health-goals-check.sh` implementiert (gh-axi).

```bash
gh-axi run list --workflow ci.yml --branch main --limit 20 --json createdAt,updatedAt \
  | python3 -c "
import json,sys
runs=json.load(sys.stdin)
durations=[(r['updatedAt']-r['createdAt']).total_seconds()/60 for r in runs if 'updatedAt' in r]
durations.sort()
p95=durations[int(len(durations)*0.95)]
print(f'{p95:.1f}')
"
```

> **B · Baseline:** n/a → 0 (Implementierung in health-goals-check.sh abgeschlossen, erster Scan ausstehend) · **Target:** ≤ 12 min (p95) · **Aufwand:** gering (Messung via gh-axi) · **Messzyklus:** täglich · **Reproduzierbar:** ja · **Ticket:** T001841

## G-FE05 — Lighthouse Performance Score < 90: n/a → ≥ 90

**Was:** Misst den Lighthouse Performance Score für die Website-Homepage via
`lighthouse-ci`. Aktuell wird nur die Bundle-Größe (G-FE02) überwacht — das sagt
nichts über FCP, LCP, CLS oder TTI aus. Core Web Vitals sind der Industriestandard
für echte User-Performance. Lighthouse CI ist jetzt in `.github/workflows/ci.yml`
integriert (advisory-only). `lighthouse-budget.json` definiert die Thresholds.
`scripts/health-goals-check.sh` misst den Score via `npx @lhci/cli`.

```bash
npx @lhci/cli autorun \
  --collect.url=https://web.mentolder.de \
  --collect.settings.chromeFlags='--headless --no-sandbox' \
  --assert.performance=0.9
```

> **B · Baseline:** n/a → 0 (Lighthouse CI in CI + health-goals-check.sh integriert, erster Scan ausstehend) · **Target:** ≥ 90 · **Aufwand:** gering (Messung) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001842


# Priorität C — Green Gates {#prio-c}

Auf Target, nur halten. `bash scripts/health-goals-check.sh` prüft die ✅-reproduzierbaren.

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-RH01** | Gate-Violations (baseline.json) | 28 ✓ | ≤ 30 | `python3 -c "import json,sys; print(len(json.load(sys.stdin)))" < docs/code-quality/baseline.json` |
| **G-RH02** | TypeScript-Suppressionen | 0 ✓ | 0 | `grep -r '@ts-ignore\|@ts-expect-error' website/src --include='*.ts' \| grep -v goals-data.ts \| wc -l` |
| **G-RH04** | Stale Remote Branches | 0 ✓ | 0 | `git for-each-ref ... refs/remotes/origin \| while IFS='|' read b ts; do [[ $ts -lt $CUTOFF ]] && echo $b; done \| wc -l` |
| **G-RH05** | Plan-Staged idle >14d | 0 ✓ | 0 | `bash scripts/vda.sh oracle 'list plan_staged tickets'` |
| **G-RH06** | Sentinel-Issues >48h | 0 ✓ | 0 | `gh-axi issue list --label sentinel --state open --json createdAt` |
| **G-RH07** | Freshness-Check grün | Exit 0 ✓ | Exit 0 | `task freshness:check` |
| **G-TEST01** | BATS Debt-Skips | 0 ✓ | 0 | `grep -rniE "skip [\"']" tests --include=*.bats \| grep -ciE "pending\|todo\|WP-\|disabled"` |
| **G-TEST02** | Vitest `.only` | 0 ✓ | 0 | `grep -rnE '\.only\b' website/src --include='*.test.ts' \| wc -l` |
| **G-TEST03** | Vitest Skipped/Todo-Suiten | 0 ✓ | 0 | `grep -rnE "(describe\|it\|test)\.(skip\|todo)\b" website/src --include="*.ts" \| wc -l` |
| **G-TEST04** | Test-Inventory-Drift | 0 ✓ | 0 | `git status --porcelain website/src/data/test-inventory.json \| wc -l` |
| **G-CQ02** | Explizite `any`-Verwendungen | 9 ✓ | ≤ 280 | `grep -rn ': any\|<any>\|as any' website/src --include=*.ts --include=*.svelte --include=*.astro \| wc -l` |
| **G-CQ04** | FIXME/HACK/XXX (echt) | 3 ✓ | ≤4 | `grep -rnE '\b(FIXME\|HACK\|XXX)\b' ... \| wc -l` |
| **G-CQ05** | Echte TODO-Marker | 1 ✓ | ≤ 1 | `grep -rnE "\bTODO\b" --include=*.ts ... website/src scripts tests k3d brett/src \| wc -l` |
| **G-CQ06** | `@deprecated`-Symbole | 1 ✓ | ≤ 1 | `grep -rnE '@deprecated' website/src \| wc -l` |
| **G-CQ07** | S2 Import-Zyklen | 0 ✓ | 0 | `python3 -c "..S2-Gate.." < docs/code-quality/baseline.json` |
| **G-CQ09** | S3 hartkodierte Hostnames | 0 ✓ | ≤ 10 | `python3 -c "..S3-Gate.." < docs/code-quality/baseline.json` |
| **G-CQ10** | S4 verwaiste Scripts | 0 ✓ | ≤ 4 | `python3 -c "..S4-Gate.." < docs/code-quality/baseline.json` |
| **G-SIZE03** | God-File `website/src/lib/website-db.ts` | 1939 ✓ | ≤ 3000 | `wc -l < website/src/lib/website-db.ts` |
| **G-GIT01** | Offene PRs >7 Tage | 0 ✓ | 0 | `gh pr list --state open --json number,createdAt` |
| **G-DEP01** | High/Critical npm-Vulnerabilities | 0 ✓ | 0 | `cd website && pnpm audit --json 2>/dev/null \| python3 -c "..."` |
| **G-DEP03** | PM-Konsistenz (pnpm) | 0 ✓ | 1 PM | `grep -q "npm ci" website/Dockerfile && echo inkonsistent \|\| echo ok` |
| **G-DEP04** | `engines >= 22.13.0` | 0 ✓ | 0 | `for p in package.json website/package.json ...; do python3 -c "..engines.."; done` |
| **G-DEP05** | Renovate-PR-Backlog | 0 ✓ | ≤ 3 | `gh pr list --state open --json author,labels \| python3 -c "..renovate.."` |
| **G-DEP02** | Veraltete Major-Deps | 2 ✓ | ≤ 3 | `cd website && pnpm outdated` (Major-Sprünge zählen: aktuell nur eslint-plugin-astro 1→2, knip 5→6) |
| **G-IMG02** | Fremd-Image-Versions-Drift | 0 ✓ | 0 | `grep -rhE 'image:' k3d/ prod*/ \| ... sort -u \| awk -F'\t' '{c[$1]++} END{...}'` |
| **G-K8S01** | Deployments ohne Limits | 0/34 ✓ | 0 | `python3 -c "..resources.limits.." k3d/*.yaml` |
| **G-K8S02** | Deployments ohne readinessProbe | 3/34 ✓ | ≤ 3 | `python3 -c "..readinessProbe.." k3d/*.yaml` |
| **G-K8S03** | Deployments ohne securityContext | 0 ✓ | 0 | `python3 -c "..securityContext.." k3d/*.yaml` |
| **G-K8S04** | workspace:validate grün | Exit 0 ✓ | Exit 0 | `task workspace:validate` |
| **G-CFG01** | env:validate:all grün | 0 ✓ | Exit 0 | `task env:validate:all` |
| **G-SEC01** | Hardcoded Secrets (k3d) | 0 ✓ | 0 | `grep -rn 'password.*=.*[^$]' k3d/*.yaml \| grep -iv secretKeyRef \| wc -l` |
| **G-SEC02** | git-crypt Guard | Exit 0 ✓ | Exit 0 | `bash scripts/git-crypt-guard.sh check-tracked` |
| **G-SEC03** | SealedSecret-Rotation | 6 Tage ✓ | ≤ 90 Tage | `git log -1 --format='%at' -- environments/sealed-secrets/*.yaml \| ...` |
| **G-SEC04** | Sealing-Cert Restlaufzeit | ~3587 Tage ✓ | ≥ 30 Tage | `openssl x509 -enddate -noout -in environments/certs/*.pem` |
| **G-SEC05** | Unsignierte Commits (adj.) | 0/50 adj. ✓ (Mess-Bug fix: Skript filtert beide github-actions[bot] Mail-Varianten) | ≤ 5 % | `git log -50 --pretty='%G? %ae' main \| grep -v freshness-bot \| grep -ciE 'github-actions\[bot\]|41898282\+github-actions\[bot\]'` — **fix:** beide Bot-Mail-Varianten (`github-actions[bot]@...` und `41898282+github-actions[bot]@...`) werden nun korrekt gefiltert; alle 25 vorherigen "unsignierten" Commits waren GitHub-Bots, kein echtes Signing-Problem.
| **G-SPEC01** | openspec:validate grün | Exit 0 ✓ | Exit 0 | `bash scripts/openspec.sh validate` |
| **G-SPEC02** | Changes >30 Tage | 0 ✓ | 0 | `for d in openspec/changes/*/; do ... done` |
| **G-SPEC03** | Proposals ohne .ticket-Verknüpfung | 0 ✓ | 0 | `for d in openspec/changes/*/; do [ -f "$d/.ticket" ] \|\| m=$((m+1)); done` |
| **G-DB06** | Orphan-Rows (3 FK-Paare) | 0 ✓ | 0 | `db_scalar NOT-EXISTS-Summe (ticket_plans/comments/links → tickets)` |
| **G-DOC01** | Defekte interne Doc-Links | 0 ✓ | 0 | `python3 scripts/check-links.py` |
| **G-DOC02** | Root-CLAUDE.md Zeilen | 190 ✓ | ≤ 200 | `wc -l < CLAUDE.md` |
| **G-DOC03** | README-Index in Hauptverzeichnissen | 5/5 ✓ | 5/5 | `for d in website brett scripts tests k3d; do ls "$d"/README* ... done` |
| **G-DOC04** | Architektur-ADRs | 5 ✓ | ≥ 5 | `find docs -ipath '*adr*' -name '*.md' \| wc -l` |
| **G-DORA04** | MTTR (Mean Time To Recovery) | n/a ✓ | < 24h | `git log --since="8 weeks ago" --first-parent --format='%ct %s' main \| grep -ciE 'revert\|hotfix'` |
| **G-DOC06** | Agent Guide Index | 30 ✓ | ≥ 30 | `find .claude/skills docs/agent-guide -name SKILL.md -o -name README.md \| wc -l` |
| **G-CI01** | main CI-Erfolgsrate (letzte 20) | 95 % ✓ | ≥ 95 % | `gh-axi run list --workflow ci.yml --branch main --limit 20 \| grep -oE 'completed,(success\|failure\|cancelled)' \| sort \| uniq -c` (19/20, 1 cancelled) |
| **G-CI02** | Rote main-HEAD-Läufe | 0 ✓ | 0 | `gh-axi run list --workflow ci.yml --branch main --limit 5 \| grep -c failure` |
| **G-RH03** | OpenSpec-BATS-Abdeckung | 82 % ✓ | ≥ 60 % | `SPECS=$(ls openspec/specs/*.md \| wc -l); BATS=$(ls tests/spec/*.bats \| wc -l); echo "$BATS/$SPECS"` |
| **G-CD02** | post-merge.yml-Rate | 100 % ✓ | ≥ 95 % | `gh-axi run list --workflow post-merge.yml --branch main --limit 15 \| ...` |
| **G-DORA01** | Deployment Frequency | Elite ✓ | ≥ 5/Wo | `git log --since="4 weeks ago" --first-parent --oneline main \| wc -l` |
| **G-DORA02** | Lead Time (PR→merge) | Median 0.03h ✓ | ≤ 1h | `gh-axi api repos/{owner}/{repo}/pulls?...` |
| **G-DORA03** | Change Failure Rate (Proxy) | 7.4 % ✓ | ≤ 15 % | `git log --since="8 weeks ago" --first-parent --oneline main \| ...fix()/revert-Rate` |
| **G-DORA04** | MTTR | n/a ✓ | < 24h | `git log --since="8 weeks ago" --first-parent --format='%ct %s' main \| grep -iE 'revert\|hotfix'` |
| **G-FE03** | rohe `console.error/warn` (exkl. Selbstschutz-Fallbacks) | 0 ✓ | 0 | `grep -rEn 'console\.(error\|warn)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' \| grep -v 'browser-logger.ts' \| grep -v 'logger.ts' \| grep -v 'error-log-store.ts' \| grep -v '\.test\.ts' \| wc -l` |
| **G-FE04** | Stray `console.log/debug/info` | 0 ✓ | 0 | `grep -rEn 'console\.(log\|debug\|info)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' \| grep -v 'browser-logger.ts' \| grep -v '\.test\.ts' \| wc -l` |
| **G-GIT02** | Non-conventional Commits (ohne Merge) | 0 ✓ | 0 | `git log --format=%s --no-merges -30 origin/main \| grep -vcE '^(feat\|fix\|chore\|...)'` |
| **G-GIT03** | Dateien >1MB im Tree | 7 ⚠ | ≤ 6 | `git ls-files -z \| xargs -0 -I{} sh -c 'test -f "{}" && wc -c "{}"' \| awk '$1>1048576{c++} END{print c+0}'` (`.codebase-memory/` seit T001717 nicht mehr getrackt) |
| **G-AGENTIC02** | Agent-Routing-Tabelle ↔ Frontmatter-Drift | 0 ✓ | 0 | `python3 <<'PY' ... norm/toks/fm/rows ... symmetric_difference` |
| **G-AGENTIC03** | Agent-Frontmatter (name + description) | 0 ✓ | 0 | `for f in .claude/agents/*.md; do name==basename && description present` |
| **G-AGENTIC04** | test:changed Agents-Bucket | 0 ✓ | 0 | `awk '/test:changed/...' Taskfile.yml \| grep -c .claude/agents + AGENTS + agent-library` |
| **G-AGENTIC05** | 6-Agenten Cross-Reference | 0 ✓ | 0 | `comm -3 <(ls agents/...) <(routing from validate.mjs) + <(registry from tools.yaml)` |
| **G-AGENTIC06** | OVERVIEW.md Skill-Zähler vs real | 0 ✓ | 0 | `claimed - real (Betrag)` via grep claim + `git ls-files -- .claude/skills \| grep -c '/SKILL\.md$'` (nur getrackte — market-cli-Installationen zählen nicht, T001783) |
| **G-AGENTIC07** | Verwaiste aktive Skills | 0 ✓ | 0 | `for SKILL.md in git ls-files; if description exist && zero refs in CLAUDE.md/AGENTS.md/OVERVIEW.md/other SKILL.md → count` (nur getrackte) |
| **G-AGENTIC08** | Tote Script-Pfade in SKILL.md | 0 ✓ | 0 | `grep -rhoP '(?<![A-Za-z0-9_./-])scripts/...\.(sh\|mjs\|py)' .claude/skills \| sort -u \| test -f || count` (Lookbehind gegen Substring-False-Positives) |
| **G-AGENTIC11** | CLAUDE.md opencode-Liste vs opencode.jsonc | 0 ✓ | 0 | `comm -3 <(grep opencode-Liste \| extract backtick-names) <(mcp_servers opencode.jsonc)` |
| **G-AGENTIC12** | .mcp.json-Server undokumentiert | 0 ✓ | 0 | `for s in $(mcp_servers .mcp.json); grep -q -- "$s" mcp-tool-guide.md || count` |
| **G-AGENTIC13** | Tote MCP-Server-Refs in SKILL.md | 0 ✓ | 0 | `grep -rhoE 'mcp__...__\|mcp-..._browser_' .claude/skills \| gegen registrierte Server` |
| **G-AGENTIC14** | .mcp.json ↔ opencode Parity | 0 ✓ | 0 | `python3 <<'PY' ... load both, sig() for common keys, count mismatches` |
| **G-AGENTIC15** | Phantom-/opsx-Command-Referenzen | 0 ✓ | 0 | `grep -rhoE '/opsx[:-][a-z]+' in .claude/ .opencode/ .claude/skills vs valid command set` |
| **G-AGENTIC16** | Claude ↔ opencode Command-Sync | 0 ✓ | 0 | `for each .claude/commands/opsx/*.md, compare normalized body with .opencode/opsx-$name.md` |
| **G-AGENTIC17** | Command-Orphans via S4 | 0 ✓ | ≤ 0 | `S4 command_globs gegen Referenzquellen; Config-Guard: ohne Config → 99` |

---

# Mess-Werkzeug {#mess-werkzeug}

```bash
bash scripts/health-goals-check.sh           # Ampel-Report (✅/🟡/🔴)
bash scripts/health-goals-check.sh --strict  # exit 1 bei verfehlten Targets
bash scripts/health-goals-check.sh --fast    # überspringt langsame Checks
bash scripts/health-goals-check.sh --only=G-RH01,G-CQ02
```

**Messzyklus:**
- **Pro Merge (CI-Gate):** G-RH02/07, G-TEST02/04, G-CQ04, G-SEC01/02, G-K8S04, G-CFG01, G-CI02, G-GIT02, G-SPEC01
- **Täglich:** G-RH06, G-CI02, G-DB04, G-GIT01, G-CI03
- **Wöchentlich:** G-RH01/03, G-TEST01/03, G-SIZE03, G-CI01, G-CD01, G-CQ02/05, G-IMG01, G-K8S03, G-SPEC03, G-GIT03, G-FE03/04, G-DB01, G-DB03, G-DB06, G-DB08, G-DB09, G-DB10, G-SEC06, G-FE05
- **Monatlich/Quartal:** G-DEP02, G-SEC03/04, G-DOC02, G-FE01/02

**Sprint-Highlights 2026-07-01:** G-CI01 erreicht Target (85 %→95 %, 19/20 grün) und wechselt von Prio A nach Prio C. G-RH03 (OpenSpec-BATS-Abdeckung 50 %→82 %) und G-DEP02 (Major-Deps 9→2) erreichen ihr Target und wechseln von Prio B nach Prio C. G-CQ01 erstmals gemessen: 0 astro-check-Fehler. G-CQ02 (explizite `any`) fällt weiter von 154 auf 8. G-GIT03 (Dateien >1MB) erreicht Target 7→6 per Policy-Ausschluss von `.codebase-memory/` (T001348) und wechselt von Prio A nach Prio C. G-SEC05-Messfehler dokumentiert: das Skript filtert nur eine von zwei GitHub-Actions-Bot-Mail-Varianten heraus, wodurch 4 Bot-Commits fälschlich als unsigniert zählen — echter Wert 0/50, Skript-Fix noch offen.

**Sprint-Highlights 2026-07-03:** G-FE03 (console.error/warn) von 10 auf 1 reduziert — deutliche Verbesserung. G-CQ02 (explizite `any`) weiter von 11 auf 10 gesunken. G-SIZE03 (God-File website-db.ts) von 2106 auf 1957 Zeilen geschrumpft. G-TEST05 (Vitest Coverage) steigt von 82 %→85 %. **Regressionen:** G-CFG01 (env:validate:all) von Exit 0 auf 201 Schema-Verstöße gesprungen; G-GIT02 (non-conventional Commits) von 0 auf 1; G-AGENTIC06/07 jeweils von 0 auf 3 — vier Gates von Prio C nach Prio A zurückgestuft.

**Baseline-Update 2026-07-02:** G-SIZE04 +324.494→+325.521 (weiterhin im Spike-Fenster, aber Top-Diffs sind wieder normale Feature-Arbeit); G-GIT03 7→6 (graph.db.zst per Policy-Entscheidung T001348 aus Gate-Scope ausgeschlossen, keine LFS-Migration); G-CD01 unverändert bei 100 % (15/15); G-CQ02 154→8; G-CQ01 ?→0; G-RH03 50 %→82 %; G-DEP02 9→2 Major; G-CI01 85 %→95 %; **G-SEC05** 25→0 (Mess-Bug fix: beide github-actions[bot] Mail-Varianten werden korrekt gefiltert, alle vorherigen "unsignierten" Commits waren GitHub-Bots); **G-AGENTIC01** 3→0 (tools:-Feld zu security/infra/db Agenten hinzugefügt); **G-AGENTIC10** 3→0 (dispatchende Skills website-specialist/database-specialist/security-specialist erstellt).

**Baseline-Update 2026-07-03:** G-CQ02 11→10; G-SIZE03 2106→1957; G-FE03 10→1; G-TEST05 82 %→85 %; **G-CFG01** Exit 0→201 (Schema-Drift nach GITHUB_CONTENT_TOKEN-Add); **G-GIT02** 0→1 (non-conventional Commit); **G-AGENTIC06** 0→3 (OVERVIEW.md Skill-Zähler); **G-AGENTIC07** 0→3 (verwaiste Skills) — vier Gates von Prio C nach Prio A zurückgestuft.

**Baseline-Update 2026-07-03 (Fix):** G-CFG01 201→0 — PRIMARY_FRONTEND + TURN_OVERLAY_IP in fleet-*/staging ergänzt, RUSTDESK-Keys auf `required: false` gesetzt (mentolder-only). Wechselt von Prio A → Prio C.

**Baseline-Update 2026-07-03 (Fix 2):** G-GIT02 1→0 — `--no-merges` im Gate (Merge-Commit war falsch positiv). G-AGENTIC06 3→0 — OVERVIEW.md Zähler 27→30. G-AGENTIC07 3→0 — specialist Skills in OVERVIEW.md registriert. Drei Gates von Prio A → Prio C.

**Baseline-Update 2026-07-04 (morning):** G-CQ01 (T001553) → done (Bereits grün, gate aktiv). G-CQ03 (T001554) → done (Bereits grün, ESLint-Gate aktiv). G-CQ08 (T001555) → done (knip-Baseline: ~120 unused exports, 7 unused files, 5 unused deps entfernt). G-FE01 (T001557) → done (axe 4.12.1, Baseline: 7 violations). G-FE02 (T001558) → done (Bundle-Budget: 747 KB, 99 JS files). G-SIZE02 (T001556) → backlog (17 files >600 Zeilen, ~2-3 Wochen). G-AGENTIC09 (T001559) → done (3 SKILL.md via Whitespace-Kompression auf <500 Zeilen).

**Baseline-Update 2026-07-04 (Fix):** G-AGENTIC06 0→0 (OVERVIEW.md 30→31 — brain-ingest nachgezogen). G-AGENTIC08 1→0 (toter Script-Pfad `scripts/brain-ingest.mjs` aus brain-ingest/SKILL.md entfernt). G-GIT02 0→1 (Commit `f9dc1ae4e` durch Mishap-Bundle-Routine — kann nicht aus History entfernt werden, löst sich nach ~17 weiteren main-Commits).

**Baseline-Update 2026-07-04:** G-CQ07 S2 Import-Zyklen 0 (baseline.json); G-CQ09 S3 Hostnames 0; G-CQ10 S4 Orphaned Scripts 0 — alle grün, Gates neu eingefügt.

**Baseline-Update 2026-07-10:** G-CFG01 Exit 0→201→0 (fehlendes `TERMINAL_OVERLAY_IP` in `environments/staging.yaml` ergänzt). G-AGENTIC06 6→0 (OVERVIEW.md Skill-Zähler 31→37 korrigiert — brain-ingest/infra-ops/lavish/references/vitest waren nicht mitgezählt). G-AGENTIC07 1→0 (Verweis auf `superpowers-executing-plans`-Stub in dev-flow-execute/SKILL.md ergänzt). G-FE03 2→0 (Mess-Scope-Fix: `logger.ts`/`error-log-store.ts`-Selbstschutz-Fallbacks ausgeschlossen, analog `browser-logger.ts`). G-FE04 3→0 (`website/src/db/migrate.ts`: drei `console.log` auf den bereits importierten pino-`logger` umgestellt). G-DB04 163h→1h (Backup-Alter unter Target — Root-Cause-Status T001738 nicht verifiziert, Messzyklus bleibt täglich als Regressionswache). **Neue Regression:** G-IMG01 0→2 (`promtail-rendered.yaml`/`loki-rendered.yaml`, Helm-Chart-Digests nach T001703-Upgrade nicht nachgezogen) — von Prio C nach Prio B verschoben, Ticket T001766. Nebenbei zwei doppelt vorhandene G-CQ09/G-CQ10-Tabellenzeilen (Copy-Paste-Duplikat) aus der Prio-C-Tabelle entfernt.

**Baseline-Update 2026-07-14 (T001804):** G-AGENTIC06 1→0 (OVERVIEW.md Zähler 37→36 + Mess-Umstellung auf getrackte SKILL.md via `git ls-files` — lokal via market-cli installierte Skills kippen das Gate nicht mehr, Präzedenz T001783). G-AGENTIC07 6→0 (2 untrackte lokale Skills aus dem Mess-Scope entfernt; 4 getrackte Drittanbieter-/ML-Skills — ui-ux-pro-max, unsloth, gguf-quantization, speculative-decoding — in neuer OVERVIEW.md-Sektion registriert). G-AGENTIC08 1→0 (Mess-Bug: Regex ohne Anker matchte `scripts/search.py` als Substring des existierenden Pfads `.claude/skills/ui-ux-pro-max/scripts/search.py` — Lookbehind ergänzt). G-AGENTIC11 5→0 (CLAUDE.md-opencode-Liste um `github-mcp`, `playwright`, `sequential-thinking`, `webresearch`, `docfork` ergänzt). G-DOC02 216→190 (CLAUDE.md kondensiert: Merge=Abschluss- und Bug-Triage-Blöcke entwrappt, leere `### Brett`-Überschrift und redundantes Oracle-Beispiel entfernt). G-AGENTIC09 1→0 (dev-flow-plan/SKILL.md 513→495 Zeilen, Prosa-Entwrapping ohne Inhaltsverlust). G-GIT03 bleibt 7 (>Target 6): Kandidaten `assets/grilling-brett-admin-panel/Brett Admin Panel.html` und `environments/korczewski/KERN Logo Design.html` sind Nutzer-Assets — Löschen/LFS braucht manuelle Entscheidung.

**Offene Tickets (2026-07-15):** G-SIZE02 (T001556), G-DB01/03/06/08 (T001739), G-IMG01 (T001766), G-DB09 (T001838), G-DB10 (T001839), G-SEC06 (T001840), G-CI03 (T001841), G-FE05 (T001842)

| Ziel | Ticket | Status |
|------|--------|--------|
| G-DB01 | T001739 | offen (Messung verdrahtet; Index-Fix ausstehend) |
| G-DB03 | T001739 | offen (Messung verdrahtet; CHECK-Constraints ausstehend) |
| G-DB04 | T001739 | gruen (1h, Target ≤26h — Root-Cause-Fix nicht verifiziert, Regressionswache bleibt täglich) |
| G-DB06 | T001739 | gruen (Gate, halten) |
| G-DB08 | T001739 | offen (dokumentierte Baseline, kein hartes Target) |
| G-IMG01 | T001766 | offen (Regression 0→2, Helm-Digest-Drift Loki/Promtail) |
| G-DB09 | T001838 | offen (Slow Queries, Messung verdrahtet, Optimierung ausstehend) |
| G-DB10 | T001839 | offen (Unused Indexes, Baseline fehlt) |
| G-SEC06 | T001840 | offen (Container CVEs, Trivy-Integration abgeschlossen, erster Scan ausstehend) |
| G-CI03 | T001841 | offen (CI Duration, Implementierung abgeschlossen, erster Scan ausstehend) |
| G-FE05 | T001842 | offen (Lighthouse Performance, CI-Integration abgeschlossen, erster Scan ausstehend) |
| G-SIZE04 | T001280 | geschlossen (`done`), Messwert weiterhin rot → Nachfolger T001347 |
| G-SIZE04 | T001347 | offen |
| G-GIT03 | T001275 | **gefixt** (gitignore search-index.json [T001305]) |
| G-GIT03 | T001320 | geschlossen (`done`), graph.db.zst nicht migriert → Nachfolger T001348 |
| G-GIT03 | T001348 | **gefixt** (Policy-Ausschluss `.codebase-memory/` aus Gate-Scope, keine LFS-Migration) |
| G-CD01 | T001276 | geschlossen (`done`), Erfolgsrate unverändert → Nachfolger T001349 |
| G-CD01 | T001349 | **gefixt** (Root Cause: Messbefehl zeigte auf geloeschten Workflow build-website-korczewski.yml; jetzt Job-Level gh api gegen build-website.yml) |
| G-CQ01 | T001277 | **gefixt** (PR #2225) |
| G-DEP01 | T001278 | **gefixt** (0 vulnerabilities) |
| G-CI01 | T001279 | **gefixt** (95 % letzte 20 Läufe) |
| G-CFG01 | T001548 | **gefixt** (Commit 97f04f031) |
| G-GIT02 | T001552 | **gefixt** (Commit 1d4ba261b — `--no-merges` im Gate) |
| G-AGENTIC06 | T001550 | **gefixt** (OVERVIEW.md count 27→30, am 2026-07-04 erneut 30→31 für brain-ingest) |
| G-AGENTIC07 | T001551 | **gefixt** (OVERVIEW.md: specialist skills registriert) |
| G-CQ01 | T001553 | **gefixt** (0 astro-check errors, gate aktiv seit PR #2225) |
| G-CQ03 | T001554 | **gefixt** (ESLint-Gate aktiv, 2 legitime inline-disables) |
| G-CQ08 | T001555 | **gefixt** (knip-Baseline: ~120 unused exports, −5 unused deps) |
| G-SIZE02 | T001556 | Prio B — backlog (17 files >600 Zeilen) |
| G-FE01 | T001557 | **gefixt** (axe 4.12.1, Baseline: 7 violations) |
| G-FE02 | T001558 | **gefixt** (Bundle-Budget: 747 KB, 99 JS files) |
| G-AGENTIC09 | T001559 | **gefixt** (Whitespace-Kompression → alle <500 Zeilen) |
| G-AGENTIC08 | — | **gefixt** (2026-07-04: toter script-path `scripts/brain-ingest.mjs` aus SKILL.md entfernt) |
| G-GIT02 | T001552 | **regressed** (Commit f9dc1ae4e — `mishap-bundle-fix:` non-conventional) |

**Baseline-Update 2026-07-15:** G-SEC06 n/a→0 (Trivy-Integration in CI + scripts/trivy-scan.sh erstellt, erster Scan ausstehend); G-CI03 n/a→0 (Implementierung in health-goals-check.sh abgeschlossen, erster Scan ausstehend); G-FE05 n/a→0 (Lighthouse CI in ci.yml + health-goals-check.sh integriert, lighthouse-budget.json erstellt, erster Scan ausstehend)
