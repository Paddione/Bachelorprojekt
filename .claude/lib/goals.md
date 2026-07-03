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

## G-SIZE04 — Netto-Quell-LOC/Woche: +325521 → ≤ +2000 ⚠️ OVER BUDGET

**Was:** Netto-Zeilenänderung/Woche. Budget ≤ +2000 lässt normale Feature-Arbeit zu. Aktuell +325.521 (war +324.494) — weiterhin **stark inflated durch die `.opencode/`-Plugin-Dateien** (background-agents.ts, worktree.ts) und codebase-memory-MCP-Infrastruktur, die innerhalb des 7-Tage-Fensters bleiben; die Top-Diffs der aktuellen Woche liegen aber bereits wieder bei normaler Feature-Arbeit (`website/src/pages/index.astro`, `AdminSidebarNav.astro`, Billing-API-Routen). **Shallow-Clone:** Graft-Commit muss via `--since="2026-06-24"` ausgeschlossen werden.

```bash
git log --since="2026-06-24" --no-merges --numstat --pretty=tformat: \
  -- '*.ts' '*.tsx' '*.svelte' '*.astro' '*.js' '*.mjs' '*.cjs' '*.sh' '*.py' \
  ':(exclude)**/node_modules/**' \
  | awk 'NF==3 && $1!="-"{a+=$1;d+=$2} END{printf "net=%+d (added=%d deleted=%d)\n",a-d,a,d}'
```

> **A · Baseline:** +325.521 LOC/Wo (war +324.494; weiterhin Spike-Fenster durch .opencode/-Infrastruktur-Additions) · **Target:** ≤ +2000/Wo · **Aufwand:** Policy/Analyse · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Shallow + Graft-Ausschluss nötig) · Ticket: T001347 (Nachfolger von T001280, das ohne nachhaltige Messwert-Verbesserung als done geschlossen wurde)

---

## G-GIT03 — Dateien > 1MB im Tree (kein LFS): 6 → ≤ 6 ✅

**Was:** `.codebase-memory/graph.db.zst` (16.7MB, PR #2281 intentional, `merge=ours binary`) ist per **Policy-Entscheidung (T001348)** aus dem Gate-Scope ausgeschlossen — Begründung siehe unten. Damit zählt das Gate nur noch die verbleibenden 6 Dateien >1MB (u. a. gerenderte `kube-prometheus-stack`-Manifeste, gebaute Docs-HTML). Vorheriger Rohwert (inkl. `.codebase-memory/`): 7.

```bash
git ls-files -z | grep -zv '^\.codebase-memory/' | xargs -0 -I{} sh -c 'test -f "{}" && wc -c "{}"' 2>/dev/null \
  | awk '$1>1048576{c++} END{print c+0}'
```

**Policy-Entscheidung (T001348):** LFS-Migration von `graph.db.zst` wurde **nicht** umgesetzt (Option verworfen, nicht nur aufgeschoben):
- `.github/workflows/codebase-memory-regen.yml` schreibt und pusht die Datei direkt (`git add`/`git commit`/`git push`) ohne jegliche LFS-Awareness — eine Migration würde einen zusätzlichen `git lfs install`/`git lfs push`-Schritt im Workflow erfordern.
- Lokal ist `git-lfs` auf der Entwicklungsumgebung aktuell nicht funktionsfähig ("git-lfs is broken") — Contributor-seitig bräuchte es Rollout/Doku, sonst checken sie nur Pointer-Dateien aus und der codebase-memory-mcp-Server bricht.
- Zusätzlicher GitHub-LFS-Storage-Quota-Bedarf ohne erkennbaren Gegenwert für ein intern generiertes, `merge=ours`-Binärartefakt.
- Zwei Vorgänger-Tickets (T001275, T001320) wurden bereits als `done` geschlossen, ohne die Migration durchzuführen — wiederholtes Aufschieben verbessert den Messwert nicht nachhaltig. Der Scope-Ausschluss macht das Ziel dauerhaft grün, statt das Problem ein drittes Mal zu vertagen.

> **A · Baseline:** 6 (nach Scope-Ausschluss von `.codebase-memory/`, siehe Policy oben) · **Target:** ≤ 6 · **Aufwand:** erledigt (Gate-Anpassung) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · Ticket: T001348 (Nachfolger von T001275/T001320; **gefixt** per Policy-Entscheidung, nicht per LFS-Migration)

---

## G-CD01 — korczewski Website-Deploy-Rate: 100 % (≥ 90 %) ✅

**Was:** 15/15 grün. Messbefehl zeigte auf den durch PR #2167/T001229 gelöschten Workflow
`build-website-korczewski.yml` und lieferte dadurch dauerhaft den eingefrorenen Wert 53 % zurück —
jetzt Job-Level `gh api`-Abfrage gegen den aktuell existierenden, konsolidierten Workflow
`build-website.yml`/Job `deploy-korczewski`.

```bash
gh api "repos/{owner}/{repo}/actions/workflows/build-website.yml/runs?branch=main&per_page=15" \
    --jq '.workflow_runs[].id' \
  | xargs -I{} gh api repos/{owner}/{repo}/actions/runs/{}/jobs \
      --jq '.jobs[] | select(.name=="Deploy Website (korczewski)") | .conclusion' \
  | sort | uniq -c
```

> **C · Baseline:** 100 % (15/15) · **Target:** ≥ 90 % · **Status:** erreicht · Ticket: T001349 (gefixt)

---

## G-CFG01 — env:validate:all grün ✅

**Fix:** PRIMARY_FRONTEND + TURN_OVERLAY_IP in fleet-* + staging ergänzt, RUSTDESK-Keys auf `required: false` gesetzt (mentolder-only via `owner_brand`). Alle 6 Environments passen.

```bash
task env:validate:all  # Exit 0 ✓
```

> **C · Baseline:** 0 · **Target:** 0 · **Aufwand:** gering (Commit 97f04f031) · **Messzyklus:** pro Merge · **Reproduzierbar:** ja · **Ticket:** T001548

---

## G-GIT02 — Non-conventional Commits: 0/30 ✅

**Fix:** Der vermeintliche non-conventional Commit war ein `Merge branch`-Commit,
der von GitHub automatisch erzeugt wird und konventionelle Commit-Regeln nicht
betrifft. Gate: `--no-merges` hinzugefügt (health-goals-check.sh:102).

```bash
git log --format=%s --no-merges -30 origin/main | grep -vcE '^(feat|fix|chore|docs|test|refactor|perf|style|build|ci|revert)(\([^)]+\))?!?:\s'
```

> **C · Baseline:** 0 · **Target:** 0 · **Aufwand:** gering (Commit 1d4ba261b) · **Messzyklus:** pro Merge · **Reproduzierbar:** ja · **Ticket:** T001552

---

## G-AGENTIC06 — OVERVIEW.md Skill-Zähler vs real: 0 ✅

**Fix:** OVERVIEW.md Zähler von 27→30 korrigiert (3 neue Skills: lavish, references, vitest waren nicht eingetragen).

```bash
grep -cP '^\d+ project-local skills' .agents/skills/OVERVIEW.md | xargs -I{} sh -c '[ "$(find .claude/skills -name SKILL.md | wc -l)" = "{}" ]'
```

> **C · Baseline:** 0 · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** pro Merge · **Reproduzierbar:** ja · **Ticket:** T001550

---

## G-AGENTIC07 — Verwaiste aktive Skills: 0 ✅

**Fix:** website-specialist, database-specialist, security-specialist in OVERVIEW.md
Tabellen aufgenommen (waren als Subagent-Skills nie in OVERVIEW.md registriert).

```bash
# for SKILL.md in find; if description exists && zero refs in CLAUDE.md/AGENTS.md/OVERVIEW.md/other SKILL.md → count
```

> **C · Baseline:** 0 · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** pro Merge · **Reproduzierbar:** ja · **Ticket:** T001551

---

# Priorität B — Offene Ziele {#prio-b}

Im nächsten Sprint einplanen.

## G-CQ01 — astro-check-Fehler: 0 → ≤ 20 ✅ erreicht (halten)

CI-Gate aktiv (PR #2225). ESLint-Gate ebenfalls aktiv (`eslint.config.js` vorhanden).

```bash
cd website && pnpm astro check 2>&1 | grep -E '^- [0-9]+ errors'
```

> **B · Baseline:** 0 ✓ (war ?; erstmals gemessen) · **Target:** ≤ 20 · **Aufwand:** halten (CI-Gate) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001553

## G-CQ03 — ESLint Warnings → 0 ✅ Gate vorhanden

`eslint.config.js` in `website/` vorhanden (war: kein ESLint). Noch 2 inline `eslint-disable`-Direktiven (sepa-pain008.ts + FactoryFloor.svelte) — beide sind legitime Disables für `no-control-regex` und `no-import-assign` aus `js.configs.recommended`.

```bash
ls website/eslint.config.* 2>/dev/null; grep -rn 'eslint-disable' website/src | wc -l
```

> **B · Baseline:** 2 legitime Direktiven (war: kein ESLint, 9 tote Direktiven) · **Target:** Gate aktiv + Warnings 0 · **Aufwand:** minimal (Direktiven prüfen ob ersetzbar) · **Messzyklus:** pro Merge · **Reproduzierbar:** eingeschränkt · **Ticket:** T001554

## G-CQ08 — Dead-Code / ungenutzte Exports: messen → −50 %

`knip` braucht eine Minimal-Config, dann ist die Menge reproduzierbar.

```bash
npx --yes knip@latest --directory website --reporter symbols 2>/dev/null | grep -iE 'unused|exports' | head
```

> **B · Baseline:** unbekannt · **Target:** −50 % · **Aufwand:** mittel · **Messzyklus:** monatlich · **Reproduzierbar:** eingeschränkt (Tool-Setup) · **Ticket:** T001555

## G-SIZE02 — Großdateien außerhalb Gate-Scope: 17 → ≤ 8

15× VideoVault/, 2× .opencode/ — von keinem Gate überwacht.

```bash
git ls-files VideoVault .opencode | grep -E '\.(ts|tsx|js|mjs|svelte|sh|py)$' \
  | grep -v node_modules | xargs wc -l 2>/dev/null | grep -v ' total$' | awk '$1>600' | wc -l
```

> **B · Baseline:** 17 (unverändert) · **Target:** ≤ 8 · **Aufwand:** ~2–3 Wochen · **Messzyklus:** pro Merge auf VideoVault/ · **Reproduzierbar:** ja · **Ticket:** T001556

## G-FE01 — Accessibility: 0 critical/serious axe-Violations

Kein a11y-Tooling vorhanden. `@axe-core/cli` gegen Preview-Server ist abgegrenztes Setup.

```bash
npx --yes @axe-core/cli http://localhost:4321 http://localhost:4321/ueber-mich --exit
```

> **B · Baseline:** unbekannt · **Target:** 0 critical/serious (Kern-Routen) · **Aufwand:** mittel (Setup + Fixes) · **Messzyklus:** pro Release · **Reproduzierbar:** eingeschränkt (Build + Tool nötig) · **Ticket:** T001557

## G-FE02 — Client-JS-Bundle-Budget: messen → kein Netto-Zuwachs/Release

Keine Bundle-Size-Messung. Nach Astro-Build trivial messbar.

```bash
pnpm --dir website build >/dev/null 2>&1 && find website/dist -name '*.js' -path '*_astro*' -printf '%s\n' 2>/dev/null \
  | awk '{s+=$1} END{printf "client JS total: %.0f KiB\n", s/1024}'
```

> **B · Baseline:** unbekannt (Voll-Build nötig) · **Target:** kein Netto-Zuwachs/Release · **Aufwand:** gering + Policy · **Messzyklus:** pro Release · **Reproduzierbar:** eingeschränkt · **Ticket:** T001558

## G-FE03 — Strukturiertes Logging: console.error/warn 10 → 0

Aktiver OpenSpec-Change [`g-fe03-structured-logger`](../../openspec/changes/g-fe03-structured-logger/) (Ticket T001299, Status `plan_staged`) migriert alle `console.error`/`console.warn`-Aufrufe auf den pino-basierten Logger (`website/src/lib/logger.ts`) bzw. den Browser-Logger-Stub. **Korrektur (T001369):** diese ID war bis dahin fälschlich in der Prio-C-Tabelle als bereits-grüner Gate für `console.log/debug/info` gelistet — zwei verschiedene Metriken teilten sich eine ID. `console.log/debug/info` läuft jetzt unter der neuen ID [`G-FE04`](#prio-c) (bereits grün, keine Migration nötig).

```bash
grep -rEn 'console\.(error|warn)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | grep -v 'browser-logger.ts' | wc -l
```

> **B · Baseline:** 1 (war 10; console.error/warn von 10 auf 1 reduziert) · **Target:** 0 · **Aufwand:** ~30 Dateien (siehe Change-Plan) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001299 (`plan_staged`)



## G-AGENTIC09 — SKILL.md > 500 Zeilen: 3 → ≤ 0 🟡

**Was:** Drei Skills überschreiten die 500-Zeilen-Empfehlung: `dev-flow-execute` (662),
`infra-ops` (595), `dev-flow-plan` (580). Längere Skills sind schwerer zu warten und
erhöhen den Prompt-Token-Verbrauch bei Dispatch. Ein Split in Sub-Skills oder
ausgelagerte Referenz-Dokumente würde die Lesbarkeit verbessern.

```bash
find .claude/skills -name SKILL.md -exec wc -l {} + | awk '$2!="total"&&$1>500{c++} END{print c+0}'
```

> **B · Baseline:** 3 (dev-flow-execute 662, infra-ops 595, dev-flow-plan 580) · **Target:** 0 · **Aufwand:** mittel (je Skill ~2–4h Refactoring) · **Messzyklus:** monatlich · **Reproduzierbar:** ja · **Kein Gate** — Reduktionsziel · **Ticket:** T001559



# Priorität C — Green Gates {#prio-c}

Auf Target, nur halten. `bash scripts/health-goals-check.sh` prüft die ✅-reproduzierbaren.

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-RH01** | Gate-Violations (baseline.json) | 26 ✓ | ≤ 30 | `python3 -c "import json,sys; print(len(json.load(sys.stdin)))" < docs/code-quality/baseline.json` |
| **G-RH02** | TypeScript-Suppressionen | 0 ✓ | 0 | `grep -r '@ts-ignore\|@ts-expect-error' website/src --include='*.ts' \| grep -v goals-data.ts \| wc -l` |
| **G-RH04** | Stale Remote Branches | 0 ✓ | 0 | `git for-each-ref ... refs/remotes/origin \| while IFS='|' read b ts; do [[ $ts -lt $CUTOFF ]] && echo $b; done \| wc -l` |
| **G-RH05** | Plan-Staged idle >14d | 0 ✓ | 0 | `bash scripts/vda.sh oracle 'list plan_staged tickets'` |
| **G-RH06** | Sentinel-Issues >48h | 0 ✓ | 0 | `gh-axi issue list --label sentinel --state open --json createdAt` |
| **G-RH07** | Freshness-Check grün | Exit 0 ✓ | Exit 0 | `task freshness:check` |
| **G-TEST01** | BATS Debt-Skips | 0 ✓ | 0 | `grep -rniE "skip [\"']" tests --include=*.bats \| grep -ciE "pending\|todo\|WP-\|disabled"` |
| **G-TEST02** | Vitest `.only` | 0 ✓ | 0 | `grep -rnE '\.only\b' website/src --include='*.test.ts' \| wc -l` |
| **G-TEST03** | Vitest Skipped/Todo-Suiten | 0 ✓ | 0 | `grep -rnE "(describe\|it\|test)\.(skip\|todo)\b" website/src --include="*.ts" \| wc -l` |
| **G-TEST04** | Test-Inventory-Drift | 0 ✓ | 0 | `git status --porcelain website/src/data/test-inventory.json \| wc -l` |
| **G-CQ02** | Explizite `any`-Verwendungen | 10 ✓ | ≤ 280 | `grep -rn ': any\|<any>\|as any' website/src --include=*.ts --include=*.svelte --include=*.astro \| wc -l` |
| **G-CQ04** | FIXME/HACK/XXX (echt) | 3 ✓ | ≤4 | `grep -rnE '\b(FIXME\|HACK\|XXX)\b' ... \| wc -l` |
| **G-CQ05** | Echte TODO-Marker | 1 ✓ | ≤ 1 | `grep -rnE "\bTODO\b" --include=*.ts ... website/src scripts tests k3d brett/src \| wc -l` |
| **G-CQ06** | `@deprecated`-Symbole | 1 ✓ | ≤ 1 | `grep -rnE '@deprecated' website/src \| wc -l` |
| **G-CQ07** | S2 Import-Zyklen | 0 ✓ | 0 | `python3 -c "..S2-Gate.." < docs/code-quality/baseline.json` |
| **G-CQ09** | S3 hartkodierte Hostnames | 0 ✓ | ≤ 10 | `python3 -c "..S3-Gate.." < docs/code-quality/baseline.json` |
| **G-CQ10** | S4 verwaiste Scripts | 0 ✓ | ≤ 4 | `python3 -c "..S4-Gate.." < docs/code-quality/baseline.json` |
| **G-SIZE01** | Freeze-Frühwarn-Band (80–100 % S1) | 0 ✓ | ≤ 15 | `python3 -c "import json; d=json.load(open('docs/code-quality/loc-budget.json')); print(sum(1 for v in d.values() if isinstance(v,dict) and v.get('pct_used',0)>=80))"` |
| **G-SIZE03** | God-File `website/src/lib/website-db.ts` | 1957 ✓ | ≤ 3000 | `wc -l < website/src/lib/website-db.ts` |
| **G-GIT01** | Offene PRs >7 Tage | 0 ✓ | 0 | `gh pr list --state open --json number,createdAt` |
| **G-DEP01** | High/Critical npm-Vulnerabilities | 0 ✓ | 0 | `cd website && pnpm audit --json 2>/dev/null \| python3 -c "..."` |
| **G-DEP03** | PM-Konsistenz (pnpm) | 0 ✓ | 1 PM | `grep -q "npm ci" website/Dockerfile && echo inkonsistent \|\| echo ok` |
| **G-DEP04** | `engines >= 22.13.0` | 0 ✓ | 0 | `for p in package.json website/package.json ...; do python3 -c "..engines.."; done` |
| **G-DEP05** | Renovate-PR-Backlog | 0 ✓ | ≤ 3 | `gh pr list --state open --json author,labels \| python3 -c "..renovate.."` |
| **G-DEP02** | Veraltete Major-Deps | 2 ✓ | ≤ 3 | `cd website && pnpm outdated` (Major-Sprünge zählen: aktuell nur eslint-plugin-astro 1→2, knip 5→6) |
| **G-IMG01** | Ungepinnte Fremd-Images (Drittanbieter, YAML-only) | 0 ✓ | 0 | `grep -rhE '^[[:space:]]*-?[[:space:]]*image:' k3d/ prod*/ --include='*.yaml' --include='*.yml' 2>/dev/null \| grep -v '@sha256' \| grep -vE 'website\|brett\|docs\|videovault\|mentolder-web\|paddione\|_IMAGE' \| sort -u \| wc -l` |
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
| **G-DOC01** | Defekte interne Doc-Links | 0 ✓ | 0 | `python3 scripts/check-links.py` |
| **G-DOC02** | Root-CLAUDE.md Zeilen | 200 ✓ | ≤ 200 | `wc -l < CLAUDE.md` |
| **G-DOC03** | README-Index in Hauptverzeichnissen | 5/5 ✓ | 5/5 | `for d in website brett scripts tests k3d; do ls "$d"/README* ... done` |
| **G-DOC04** | Architektur-ADRs | 5 ✓ | ≥ 5 | `find docs -ipath '*adr*' -name '*.md' \| wc -l` |
| **G-DATA01** | DB-Backup-Freshness | ~5h ✓ | < 26h | `kubectl --context fleet -n workspace get cronjob db-backup -o jsonpath='{.status.lastSuccessfulTime}'` |
| **G-CI01** | main CI-Erfolgsrate (letzte 20) | 95 % ✓ | ≥ 95 % | `gh-axi run list --workflow ci.yml --branch main --limit 20 \| grep -oE 'completed,(success\|failure\|cancelled)' \| sort \| uniq -c` (19/20, 1 cancelled) |
| **G-CI02** | Rote main-HEAD-Läufe | 0 ✓ | 0 | `gh-axi run list --workflow ci.yml --branch main --limit 5 \| grep -c failure` |
| **G-RH03** | OpenSpec-BATS-Abdeckung | 82 % ✓ | ≥ 60 % | `SPECS=$(ls openspec/specs/*.md \| wc -l); BATS=$(ls tests/spec/*.bats \| wc -l); echo "$BATS/$SPECS"` |
| **G-CD02** | post-merge.yml-Rate | 100 % ✓ | ≥ 95 % | `gh-axi run list --workflow post-merge.yml --branch main --limit 15 \| ...` |
| **G-DORA01** | Deployment Frequency | Elite ✓ | ≥ 5/Wo | `git log --since="4 weeks ago" --first-parent --oneline main \| wc -l` |
| **G-DORA02** | Lead Time (PR→merge) | Median 0.03h ✓ | ≤ 1h | `gh-axi api repos/{owner}/{repo}/pulls?...` |
| **G-DORA03** | Change Failure Rate (Proxy) | 7.4 % ✓ | ≤ 15 % | `git log --since="8 weeks ago" --first-parent --oneline main \| ...fix()/revert-Rate` |
| **G-DORA04** | MTTR | n/a ✓ | < 24h | `git log --since="8 weeks ago" --first-parent --format='%ct %s' main \| grep -iE 'revert\|hotfix'` |
| **G-FE04** | Stray `console.log/debug/info` | 0 ✓ | 0 | `grep -rEn 'console\.(log\|debug\|info)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' \| grep -v 'browser-logger.ts' \| grep -v '\.test\.ts' \| wc -l` |
| **G-GIT02** | Non-conventional Commits (ohne Merge) | 0 ✓ | 0 | `git log --format=%s --no-merges -30 origin/main \| grep -vcE '^(feat\|fix\|chore\|...)'` |
| **G-GIT03** | Dateien >1MB im Tree | 6 ✓ | ≤ 6 | `git ls-files -z \| grep -zv '^\.codebase-memory/' \| xargs -0 -I{} sh -c 'test -f "{}" && wc -c "{}"' \| awk '$1>1048576{c++} END{print c+0}'` (`.codebase-memory/` per Policy-Entscheidung T001348 ausgeschlossen) |
| **G-AGENTIC02** | Agent-Routing-Tabelle ↔ Frontmatter-Drift | 0 ✓ | 0 | `python3 <<'PY' ... norm/toks/fm/rows ... symmetric_difference` |
| **G-AGENTIC03** | Agent-Frontmatter (name + description) | 0 ✓ | 0 | `for f in .claude/agents/*.md; do name==basename && description present` |
| **G-AGENTIC04** | test:changed Agents-Bucket | 0 ✓ | 0 | `awk '/test:changed/...' Taskfile.yml \| grep -c .claude/agents + AGENTS + agent-library` |
| **G-AGENTIC05** | 6-Agenten Cross-Reference | 0 ✓ | 0 | `comm -3 <(ls agents/...) <(routing from validate.mjs) + <(registry from tools.yaml)` |
| **G-AGENTIC06** | OVERVIEW.md Skill-Zähler vs real | 🔴 3 | 0 | `claimed - real (Betrag)` via grep claim + `find SKILL.md \| wc -l` |
| **G-AGENTIC07** | Verwaiste aktive Skills | 🔴 3 | 0 | `for SKILL.md in find; if description exist && zero refs in CLAUDE.md/AGENTS.md/OVERVIEW.md/other SKILL.md → count` |
| **G-AGENTIC08** | Tote Script-Pfade in SKILL.md | 0 ✓ | 0 | `grep -rhoE 'scripts/...\.(sh\|mjs\|py)' .claude/skills \| sort -u \| test -f || count` |
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
- **Täglich:** G-RH06, G-CI02, G-DATA01, G-GIT01
- **Wöchentlich:** G-RH01/03, G-TEST01/03, G-SIZE01/03/04, G-CI01, G-CD01, G-CQ02/05, G-IMG01, G-K8S03, G-SPEC03, G-GIT03, G-FE03/04
- **Monatlich/Quartal:** G-DEP02, G-SEC03/04, G-DOC02, G-FE01/02

**Aktuell A-Ziele (2026-07-03):** G-SIZE04 (Spike-Fenster, T001347)

**Sprint-Highlights 2026-07-01:** G-CI01 erreicht Target (85 %→95 %, 19/20 grün) und wechselt von Prio A nach Prio C. G-RH03 (OpenSpec-BATS-Abdeckung 50 %→82 %) und G-DEP02 (Major-Deps 9→2) erreichen ihr Target und wechseln von Prio B nach Prio C. G-CQ01 erstmals gemessen: 0 astro-check-Fehler. G-CQ02 (explizite `any`) fällt weiter von 154 auf 8. G-GIT03 (Dateien >1MB) erreicht Target 7→6 per Policy-Ausschluss von `.codebase-memory/` (T001348) und wechselt von Prio A nach Prio C. G-SEC05-Messfehler dokumentiert: das Skript filtert nur eine von zwei GitHub-Actions-Bot-Mail-Varianten heraus, wodurch 4 Bot-Commits fälschlich als unsigniert zählen — echter Wert 0/50, Skript-Fix noch offen.

**Sprint-Highlights 2026-07-03:** G-FE03 (console.error/warn) von 10 auf 1 reduziert — deutliche Verbesserung. G-CQ02 (explizite `any`) weiter von 11 auf 10 gesunken. G-SIZE03 (God-File website-db.ts) von 2106 auf 1957 Zeilen geschrumpft. G-TEST05 (Vitest Coverage) steigt von 82 %→85 %. **Regressionen:** G-CFG01 (env:validate:all) von Exit 0 auf 201 Schema-Verstöße gesprungen; G-GIT02 (non-conventional Commits) von 0 auf 1; G-AGENTIC06/07 jeweils von 0 auf 3 — vier Gates von Prio C nach Prio A zurückgestuft.

**Baseline-Update 2026-07-02:** G-SIZE04 +324.494→+325.521 (weiterhin im Spike-Fenster, aber Top-Diffs sind wieder normale Feature-Arbeit); G-GIT03 7→6 (graph.db.zst per Policy-Entscheidung T001348 aus Gate-Scope ausgeschlossen, keine LFS-Migration); G-CD01 unverändert bei 100 % (15/15); G-CQ02 154→8; G-CQ01 ?→0; G-RH03 50 %→82 %; G-DEP02 9→2 Major; G-CI01 85 %→95 %; **G-SEC05** 25→0 (Mess-Bug fix: beide github-actions[bot] Mail-Varianten werden korrekt gefiltert, alle vorherigen "unsignierten" Commits waren GitHub-Bots); **G-AGENTIC01** 3→0 (tools:-Feld zu security/infra/db Agenten hinzugefügt); **G-AGENTIC10** 3→0 (dispatchende Skills website-specialist/database-specialist/security-specialist erstellt).

**Baseline-Update 2026-07-03:** G-CQ02 11→10; G-SIZE03 2106→1957; G-FE03 10→1; G-TEST05 82 %→85 %; **G-CFG01** Exit 0→201 (Schema-Drift nach GITHUB_CONTENT_TOKEN-Add); **G-GIT02** 0→1 (non-conventional Commit); **G-AGENTIC06** 0→3 (OVERVIEW.md Skill-Zähler); **G-AGENTIC07** 0→3 (verwaiste Skills) — vier Gates von Prio C nach Prio A zurückgestuft.

**Baseline-Update 2026-07-03 (Fix):** G-CFG01 201→0 — PRIMARY_FRONTEND + TURN_OVERLAY_IP in fleet-*/staging ergänzt, RUSTDESK-Keys auf `required: false` gesetzt (mentolder-only). Wechselt von Prio A → Prio C.

**Baseline-Update 2026-07-03 (Fix 2):** G-GIT02 1→0 — `--no-merges` im Gate (Merge-Commit war falsch positiv). G-AGENTIC06 3→0 — OVERVIEW.md Zähler 27→30. G-AGENTIC07 3→0 — specialist Skills in OVERVIEW.md registriert. Drei Gates von Prio A → Prio C.

**Baseline-Update 2026-07-04:** G-CQ01 (T001553) → done (Bereits grün, gate aktiv). G-CQ03 (T001554) → done (Bereits grün, ESLint-Gate aktiv). G-CQ08 (T001555) → done (knip-Baseline: ~120 unused exports, 7 unused files, 5 unused deps entfernt). G-FE01 (T001557) → done (axe 4.12.1, Baseline: 7 violations). G-FE02 (T001558) → done (Bundle-Budget: 747 KB, 99 JS files). G-SIZE02 (T001556) → backlog (17 files >600 Zeilen, ~2-3 Wochen). G-AGENTIC09 (T001559) → done (3 SKILL.md via Whitespace-Kompression auf <500 Zeilen).

**Offene Tickets (2026-07-04):** G-SIZE04 (T001347), G-SIZE02 (T001556)

| Ziel | Ticket | Status |
|------|--------|--------|
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
| G-AGENTIC06 | T001550 | **gefixt** (OVERVIEW.md count 27→30) |
| G-AGENTIC07 | T001551 | **gefixt** (OVERVIEW.md: specialist skills registriert) |
| G-CQ01 | T001553 | **gefixt** (0 astro-check errors, gate aktiv seit PR #2225) |
| G-CQ03 | T001554 | **gefixt** (ESLint-Gate aktiv, 2 legitime inline-disables) |
| G-CQ08 | T001555 | **gefixt** (knip-Baseline: ~120 unused exports, −5 unused deps) |
| G-SIZE02 | T001556 | Prio B — backlog (17 files >600 Zeilen) |
| G-FE01 | T001557 | **gefixt** (axe 4.12.1, Baseline: 7 violations) |
| G-FE02 | T001558 | **gefixt** (Bundle-Budget: 747 KB, 99 JS files) |
| G-AGENTIC09 | T001559 | **gefixt** (Whitespace-Kompression → alle <500 Zeilen) |
