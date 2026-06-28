# Repository Health Goals

Quantifizierbare Ziele für die strukturelle Gesundheit des Repos.
Ein Ziel ohne reproduzierbaren Mess-Befehl ist kein Ziel, sondern ein Wunsch.

**Baseline-Stichtag:** `2026-06-28` · **Dashboard:** Homepage-Section `#health`

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

Sofort angehen, Ticket anlegen.

## G-SIZE04 — Netto-Quell-LOC/Woche: +3684 → ≤ +2000 ⚠️ OVER BUDGET

**Was:** Netto-Zeilenänderung/Woche. Budget ≤ +2000 lässt normale Feature-Arbeit zu. Aktuell +3684 (war +2887). **Shallow-Clone:** Graft-Commit muss via `--since="2026-06-21"` ausgeschlossen werden.

```bash
git log --since="2026-06-21" --no-merges --numstat --pretty=tformat: \
  -- '*.ts' '*.tsx' '*.svelte' '*.astro' '*.js' '*.mjs' '*.cjs' '*.sh' '*.py' \
  ':(exclude)**/node_modules/**' \
  | awk 'NF==3 && $1!="-"{a+=$1;d+=$2} END{printf "net=%+d (added=%d deleted=%d)\n",a-d,a,d}'
```

> **A · Baseline:** +3684 LOC/Wo (war +2887) · **Target:** ≤ +2000/Wo · **Aufwand:** Policy/Analyse · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Shallow + Graft-Ausschluss nötig) · Ticket: T001280

---

## G-DEP01 — High/Critical npm-Vulnerabilities: 6 → 0

**Was:** 6 high (undici 3×, ws DoS, vite `server.fs.deny`-Bypass, nodemailer Header-Bypass). 5/6 transitiv, über `pnpm.overrides`/`pnpm update` lösbar; nodemailer ist direkt mit verfügbarem Fix.

```bash
cd website && timeout 90 pnpm audit --json 2>/dev/null | python3 -c \
"import sys,json; v=json.load(sys.stdin).get('metadata',{}).get('vulnerabilities',{}); print('high+critical:', v.get('high',0)+v.get('critical',0))"
```

> **A · Baseline:** 6 high · **Target:** 0 · **Aufwand:** ~1–2 h · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Advisory-DB driftet) · Ticket: T001278

---

## G-CI01 — main CI-Erfolgsrate (letzte 20): 85 % → ≥ 95 % ⚠️

**Was:** 17/20 grün (2 Cancelled; 85 %). PRs werden nur mit grünem Gate squash-gemergt → ≥ 95 % ist reine Erhaltung.

```bash
timeout 60 gh-axi run list --workflow ci.yml --branch main --limit 20 \
  | grep -oE 'completed,(success|failure|cancelled)' | sort | uniq -c
```

> **A · Baseline:** 85 % (17/20) · **Target:** ≥ 95 % · **Aufwand:** untersuchen · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (gleitendes Fenster) · Ticket: T001279

---

## G-CD01 — korczewski Website-Deploy-Rate: 53 % → ≥ 90 % ⚠️

**Was:** 8/15 grün (7 Failures). `build-website.yml` (mentolder) steht bei 100 % mit identischer Mechanik → Konfig-/Credential-Problem der korczewski-Lane.

```bash
timeout 60 gh-axi run list --workflow build-website-korczewski.yml --branch main --limit 15 \
  | grep -oE 'completed,(success|failure)' | sort | uniq -c
```

> **A · Baseline:** 53 % (8/15) · **Target:** ≥ 90 % · **Aufwand:** ~1 Debug-Session · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt · Ticket: T001276

---

## G-GIT03 — Dateien > 1MB im Tree (kein LFS): 7 → ≤ 6 ⚠️

**Was:** 7 git-getrackte Dateien >1MB (war 6). Neu: `docs-content-built/search-index.json` (~2.6MB). Fix: gitignore oder LFS-tracken.

```bash
git ls-files -z | xargs -0 -I{} sh -c 'test -f "{}" && wc -c "{}"' 2>/dev/null \
  | awk '$1>1048576{c++} END{print c+0}'
```

> **A · Baseline:** 7 (war 6) · **Target:** ≤ 6 · **Aufwand:** ~15 Min · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · Ticket: T001275

---

# Priorität B — Offene Ziele {#prio-b}

Im nächsten Sprint einplanen.

## G-RH03 — OpenSpec-BATS-Abdeckung: 46 % → ≥ 60 %

```bash
SPECS=$(ls openspec/specs/*.md 2>/dev/null | wc -l); BATS=$(ls tests/spec/*.bats 2>/dev/null | wc -l)
echo "Specs: $SPECS | BATS: $BATS | Coverage: $(python3 -c "print(f'{$BATS/$SPECS*100:.0f}%')")"
```

> **B · Baseline:** 46 % (32/69) · **Target:** ≥ 60 % (42/69) · **Aufwand:** ~2 Wochen · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-TEST01 — BATS Debt-Skips: 9 → 0

Unkonditionale `skip`-Aufrufe in `tests/unit/admin-nav.bats` (WP-28/29). Reaktivieren durch Entfernen der `skip`-Zeile.

```bash
grep -rniE "skip [\"']" tests --include=*.bats | grep -ciE "pending|todo|gap-analysis|WP-|not implemented|disabled|stub"
```

> **B · Baseline:** 9 · **Target:** 0 · **Aufwand:** ~1–2 Wo (feature-gekoppelt) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-TEST03 — Vitest Skipped/Todo-Suiten: 3 → 0

3× `it.todo` + 2× `describe.skip` in 3 Dateien.

```bash
grep -rnE "(describe|it|test)\.(skip|todo)\b" website/src --include="*.ts" --include="*.svelte" \
  | grep -vE "^[^:]+:[0-9]+:[[:space:]]*//" | wc -l
```

> **B · Baseline:** 3 (war 5) · **Target:** 0 · **Aufwand:** ~1 Woche · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-TEST05 — Vitest Line-Coverage (website/src/lib): → ≥ 60 %

Noch kein Coverage-Tool installiert (`@vitest/coverage-v8` fehlt).

```bash
pnpm --dir website add -D @vitest/coverage-v8 >/dev/null 2>&1
pnpm --dir website exec vitest run --coverage --coverage.provider=v8 --coverage.reporter=text-summary 2>/dev/null | grep -iE 'lines|statements'
```

> **B · Baseline:** unbekannt · **Target:** ≥ 60 % Lines (lib/) · **Aufwand:** ~0.5 Tag Setup · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Tool-Setup)

## G-CQ01 — astro-check-Fehler: ? → ≤ 20 ✅ T001277 gefixt

CI-Gate aktiv (PR #2225). Re-Messung nach `pnpm install` ausstehend.

```bash
cd website && pnpm astro check 2>&1 | grep -E '^- [0-9]+ errors'
```

> **B · Baseline:** ? (T001277 fix gemergt, CI-Gate aktiv) · **Target:** ≤ 20 · **Aufwand:** halten (CI-Gate) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja (nach install)

## G-CQ02 — Explizite `any`-Verwendungen: 463 → ≤ 280 ⚠️ REGRESSION

+39 vs. letztem Stand. Viele `as any` in Tests + API-Routes + DB-Layer.

```bash
grep -rn ': any\|<any>\|as any' website/src --include=*.ts --include=*.svelte --include=*.astro | wc -l
```

> **B · Baseline:** 463 (war 424; +39 Regression) · **Target:** ≤ 280 · **Aufwand:** ~3–4 Wochen · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-CQ03 — ESLint einrichten + Warnings → 0

Kein ESLint in `website/`. 9 tote `eslint-disable`-Direktiven. Minimal-Setup ~1 Tag.

```bash
ls website/eslint.config.* 2>/dev/null; grep -rn 'eslint-disable' website/src | wc -l
```

> **B · Baseline:** kein ESLint; 9 tote Direktiven · **Target:** Gate + Warnings 0 · **Aufwand:** ~1 Tag + Abbau · **Messzyklus:** pro Merge (nach Setup) · **Reproduzierbar:** eingeschränkt

## G-CQ05 — Echte TODO-Marker: 6 → ≤ 1 ⚠️ REGRESSION

+5 neue TODOs. Quelle per grep identifizieren, aufräumen oder Tickets verlinken.

```bash
grep -rnE "\bTODO\b" --include=*.ts --include=*.svelte --include=*.astro --include=*.sh \
  --include=*.js --include=*.mjs website/src scripts tests k3d brett/src 2>/dev/null \
  | grep -vE "node_modules|/dist/|plan-lint.sh|plan-qa-check.sh|openspec.sh"
```

> **B · Baseline:** 6 (war 1; +5 Regression) · **Target:** ≤ 1 · **Aufwand:** ~0.5 Tag · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-CQ08 — Dead-Code / ungenutzte Exports: messen → −50 %

`knip` braucht eine Minimal-Config, dann ist die Menge reproduzierbar.

```bash
npx --yes knip@latest --directory website --reporter symbols 2>/dev/null | grep -iE 'unused|exports' | head
```

> **B · Baseline:** unbekannt · **Target:** −50 % · **Aufwand:** mittel · **Messzyklus:** monatlich · **Reproduzierbar:** eingeschränkt (Tool-Setup)

## G-SIZE01 — Freeze-Frühwarn-Band (80–100 % S1): 39 → ≤ 15

Dateien nahe S1-Limit — die nächsten Freeze-Kandidaten. `templates.test.mjs`, `theme.mjs` bei 100 %.

```bash
bash scripts/health-goals-check.sh --only=G-SIZE01 2>/dev/null | head -5
```

> **B · Baseline:** 39 (war 38) · **Target:** ≤ 15 · **Aufwand:** ~3–4 Wochen präventiv · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-SIZE02 — Großdateien außerhalb Gate-Scope: 18 → ≤ 8

15× VideoVault/, 3× .opencode/ — von keinem Gate überwacht.

```bash
git ls-files VideoVault .opencode | grep -E '\.(ts|tsx|js|mjs|svelte|sh|py)$' \
  | grep -v node_modules | xargs wc -l 2>/dev/null | grep -v ' total$' | awk '$1>600' | wc -l
```

> **B · Baseline:** 18 · **Target:** ≤ 8 · **Aufwand:** ~2–3 Wochen · **Messzyklus:** pro Merge auf VideoVault/ · **Reproduzierbar:** ja

## G-SIZE03 — God-File `website/src/lib/website-db.ts`: 4435 → ≤ 3000

Größte Nicht-Vendored-Datei; in `s1.ignore`. Split-Pattern erprobt (`tickets-db.ts`).

```bash
wc -l < website/src/lib/website-db.ts
```

> **B · Baseline:** 4435 (war 4485) · **Target:** ≤ 3000 · **Aufwand:** ~2 Wochen · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-IMG01 — Ungepinnte Fremd-Images (kein @sha256): 39 → 0

39 Fremd-Images ohne Digest. Renovate `pinDigests` hält Digests frisch.

```bash
grep -rhE '^[[:space:]]*-?[[:space:]]*image:[[:space:]]+["'"'"'"]?[A-Za-z0-9$]' k3d/ prod*/ 2>/dev/null \
  | grep -v '@sha256' | grep -vE 'website|brett|docs|videovault|mentolder-web|_IMAGE' \
  | sed -E 's/.*image:[[:space:]]*//' | sort -u | wc -l
```

> **B · Baseline:** 39 (war 43) · **Target:** 0 · **Aufwand:** 2–3 Sessions + Renovate pinDigests · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-DEP02 — Veraltete Major-Deps: 9 → ≤ 3

9 Major-Sprünge (astro 6→7, @astrojs/*, nodemailer 8→9, pino 9→10, rrweb-player 1→2).

```bash
cd website && timeout 90 pnpm outdated 2>/dev/null | head -20
```

> **B · Baseline:** 9 Major · **Target:** ≤ 3 · **Aufwand:** ~1–2 Tage · **Messzyklus:** monatlich / Renovate · **Reproduzierbar:** eingeschränkt

## G-K8S03 — Deployments ohne securityContext: 3 → 0

livekit-egress, sealed-secrets-controller, sessions-server. Minimaler Context (~6 Zeilen YAML je Deployment).

```bash
python3 -c "import yaml,glob; D=[s for f in glob.glob('k3d/*.yaml') for s in yaml.safe_load_all(open(f)) if isinstance(s,dict) and s.get('kind')=='Deployment']; print([x['metadata']['name'] for x in D if not x['spec']['template']['spec'].get('securityContext') and not all(c.get('securityContext') for c in x['spec']['template']['spec']['containers'])])"
```

> **B · Baseline:** 3/34 · **Target:** 0 · **Aufwand:** ~0.5 Tag · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja

## G-SPEC03 — Proposals ohne .ticket-Verknüpfung: 12 → 0

12/28 Changes ohne `.ticket`-Datei. Fix: `echo Txxxxxx > openspec/changes/<slug>/.ticket` oder Skelette entfernen.

```bash
m=0; for d in openspec/changes/*/; do b=$(basename "$d"); [ "$b" = archive ] && continue
  [ -f "$d/.ticket" ] || m=$((m+1)); done; echo "no-ticket=$m"
```

> **B · Baseline:** 12/28 (war 10/18) · **Target:** 0 · **Aufwand:** ~0.5–1 Tag · **Messzyklus:** pro neuem Proposal · **Reproduzierbar:** ja

## G-DOC02 — Root-CLAUDE.md Zeilen: 273 → ≤ 200

„Gotchas & Footguns" = 109 Zeilen (40 %). Footgun-Block in referenzierte Doku auslagern.

```bash
wc -l < CLAUDE.md
```

> **B · Baseline:** 273 · **Target:** ≤ 200 · **Aufwand:** ~1 Session · **Messzyklus:** bei CLAUDE.md-Edit · **Reproduzierbar:** ja

## G-DOC03 — README-Index in Hauptverzeichnissen: 1/5 → 5/5

`brett/` hat README; `website/`, `scripts/`, `tests/`, `k3d/` fehlen.

```bash
c=0; for d in website brett scripts tests k3d; do ls "$d"/README* >/dev/null 2>&1 && c=$((c+1)); done; echo "$c/5"
```

> **B · Baseline:** 1/5 · **Target:** 5/5 · **Aufwand:** ~2–3 h · **Messzyklus:** pro neuem Top-Level-Verzeichnis · **Reproduzierbar:** ja

## G-DOC04 — Architektur-ADRs: 0 → ≥ 5

Keine ADR-Dateien. Mehrere große, schwer umkehrbare Entscheidungen nur in CLAUDE.md verteilt (Fleet-Konsolidierung, push-basiertes Deploy, Brand-Namespace-Split, Merge=Abschluss-Ticketmodell).

```bash
adr=$(find docs -ipath '*adr*' -name '*.md' 2>/dev/null | wc -l); echo "ADR .md: $adr"
```

> **B · Baseline:** 0 · **Target:** ≥ 5 in docs/adr/ · **Aufwand:** ~5×30–45 min · **Messzyklus:** bei neuer Architekturentscheidung · **Reproduzierbar:** ja

## G-FE01 — Accessibility: 0 critical/serious axe-Violations

Kein a11y-Tooling vorhanden. `@axe-core/cli` gegen Preview-Server ist abgegrenztes Setup.

```bash
npx --yes @axe-core/cli http://localhost:4321 http://localhost:4321/ueber-mich --exit
```

> **B · Baseline:** unbekannt · **Target:** 0 critical/serious (Kern-Routen) · **Aufwand:** mittel (Setup + Fixes) · **Messzyklus:** pro Release · **Reproduzierbar:** eingeschränkt (Build + Tool nötig)

## G-FE02 — Client-JS-Bundle-Budget: messen → kein Netto-Zuwachs/Release

Keine Bundle-Size-Messung. Nach Astro-Build trivial messbar.

```bash
pnpm --dir website build >/dev/null 2>&1 && find website/dist -name '*.js' -path '*_astro*' -printf '%s\n' 2>/dev/null \
  | awk '{s+=$1} END{printf "client JS total: %.0f KiB\n", s/1024}'
```

> **B · Baseline:** unbekannt (Voll-Build nötig) · **Target:** kein Netto-Zuwachs/Release · **Aufwand:** gering + Policy · **Messzyklus:** pro Release · **Reproduzierbar:** eingeschränkt

## G-FE03 — Stray `console.*` + strukturiertes Logging

0 stray `log/debug/info` (erreicht); 141 `console.error/warn` ohne strukturierten Logger.

```bash
echo -n "log/debug/info: "; grep -rEn 'console\.(log|debug|info)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l
echo -n "error/warn: ";     grep -rEn 'console\.(error|warn)'      website/src --include='*.ts' --include='*.svelte' --include='*.astro' | wc -l
```

> **B · Baseline:** 0 stray (war 3; +141 error/warn) · **Target:** 0 stray + strukturierter Logger · **Aufwand:** mittel (Logger) · **Messzyklus:** pro Merge · **Reproduzierbar:** ja

## G-DORA03 — Change Failure Rate (Proxy): 15.9 % → ≤ 15 %

Anteil Merges mit Revert/Hotfix. Strikte Revert-Rate 0 %; breiter Proxy 15.9 % (knapp über Elite ≤15%).

```bash
T=$(git log --since="8 weeks ago" --first-parent --oneline main | wc -l)
R=$(git log --since="8 weeks ago" --first-parent --oneline main | grep -ciE 'revert|hotfix')
F=$(git log --since="8 weeks ago" --first-parent --oneline main | grep -ciE '^[0-9a-f]+ fix\(')
python3 -c "print(f'merges={$T} reverts={$R} ({$R/$T*100:.1f}% strikt) +fix()={$F} -> {($R+$F)/$T*100:.1f}% breit')"
```

> **B · Baseline:** 15.9 % breit / 0 % strikt · **Target:** ≤ 15 % · **Aufwand:** ~1 Woche + laufend · **Messzyklus:** wöchentlich · **Reproduzierbar:** eingeschränkt (Shallow/Proxy)

---

# Priorität C — Green Gates {#prio-c}

Auf Target, nur halten. `bash scripts/health-goals-check.sh` prüft die ✅-reproduzierbaren.

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-RH01** | Gate-Violations (baseline.json) | 28 ✓ | ≤ 30 | `python3 -c "import json,sys; print(len(json.load(sys.stdin)))" < docs/code-quality/baseline.json` |
| **G-RH02** | TypeScript-Suppressionen | 0 ✓ | 0 | `grep -r '@ts-ignore\|@ts-expect-error' website/src --include='*.ts' \| wc -l` |
| **G-RH04** | Stale Remote Branches | 0 ✓ | 0 | `git for-each-ref ... refs/remotes/origin \| while IFS='|' read b ts; do [[ $ts -lt $CUTOFF ]] && echo $b; done \| wc -l` |
| **G-RH05** | Plan-Staged idle >14d | 0 ✓ | 0 | `bash scripts/vda.sh oracle 'list plan_staged tickets'` |
| **G-RH06** | Sentinel-Issues >48h | 0 ✓ | 0 | `gh-axi issue list --label sentinel --state open --json createdAt` |
| **G-RH07** | Freshness-Check grün | Exit 0 ✓ | Exit 0 | `task freshness:check` |
| **G-TEST02** | Vitest `.only` | 0 ✓ | 0 | `grep -rnE '\.only\b' website/src --include='*.test.ts' \| wc -l` |
| **G-TEST04** | Test-Inventory-Drift | 0 ✓ | 0 | `git status --porcelain website/src/data/test-inventory.json \| wc -l` |
| **G-CQ04** | FIXME/HACK/XXX (echt) | 0 ✓ | 0 | `grep -rnE '\b(FIXME\|HACK\|XXX)\b' ... \| wc -l` |
| **G-CQ06** | `@deprecated`-Symbole | 1 ✓ | ≤ 1 | `grep -rnE '@deprecated' website/src \| wc -l` |
| **G-CQ07** | S2 Import-Zyklen | 0 ✓ | 0 | `python3 -c "..S2-Gate.." < docs/code-quality/baseline.json` |
| **G-CQ09** | S3 hartkodierte Hostnames | 0 ✓ | ≤ 10 | `python3 -c "..S3-Gate.." < docs/code-quality/baseline.json` |
| **G-CQ10** | S4 verwaiste Scripts | 0 ✓ | ≤ 4 | `python3 -c "..S4-Gate.." < docs/code-quality/baseline.json` |
| **G-DEP03** | PM-Konsistenz (pnpm) | 0 ✓ | 1 PM | `grep -q "npm ci" website/Dockerfile && echo inkonsistent \|\| echo ok` |
| **G-DEP04** | `engines >= 22.13.0` | 0 ✓ | 0 | `for p in package.json website/package.json ...; do python3 -c "..engines.."; done` |
| **G-DEP05** | Renovate-PR-Backlog | 0 ✓ | ≤ 3 | `gh pr list --state open --json author,labels \| python3 -c "..renovate.."` |
| **G-IMG02** | Fremd-Image-Versions-Drift | 0 ✓ | 0 | `grep -rhE 'image:' k3d/ prod*/ \| ... sort -u \| awk -F'\t' '{c[$1]++} END{...}'` |
| **G-SEC01** | Hardcoded Secrets (k3d) | 0 ✓ | 0 | `grep -rn 'password.*=.*[^$]' k3d/*.yaml \| grep -iv secretKeyRef \| wc -l` |
| **G-SEC02** | git-crypt Guard | Exit 0 ✓ | Exit 0 | `bash scripts/git-crypt-guard.sh check-tracked` |
| **G-SEC03** | SealedSecret-Rotation | 6 Tage ✓ | ≤ 90 Tage | `git log -1 --format='%at' -- environments/sealed-secrets/*.yaml \| ...` |
| **G-SEC04** | Sealing-Cert Restlaufzeit | 3622 Tage ✓ | ≥ 30 Tage | `openssl x509 -enddate -noout -in environments/certs/*.pem` |
| **G-SEC05** | Unsignierte Commits (adj.) | 0/50 adj. ✓ | ≤ 5 % | `git log -50 --pretty='%G? %ae' main \| grep -v freshness-bot \| grep -c N` |
| **G-K8S01** | Deployments ohne Limits | 0/34 ✓ | 0 | `python3 -c "..resources.limits.." k3d/*.yaml` |
| **G-K8S02** | Deployments ohne readinessProbe | 3/34 ✓ | ≤ 3 | `python3 -c "..readinessProbe.." k3d/*.yaml` |
| **G-K8S04** | workspace:validate grün | Exit 0 ✓ | Exit 0 | `task workspace:validate` |
| **G-CFG01** | env:validate:all grün | Exit 0 ✓ | Exit 0 | `task env:validate:all` |
| **G-DATA01** | DB-Backup-Freshness | ~5h ✓ | < 26h | `kubectl --context fleet -n workspace get cronjob db-backup -o jsonpath='{.status.lastSuccessfulTime}'` |
| **G-CI02** | Rote main-HEAD-Läufe | 0 ✓ | 0 | `gh-axi run list --workflow ci.yml --branch main --limit 5 \| grep -c failure` |
| **G-CD02** | post-merge.yml-Rate | 100 % ✓ | ≥ 95 % | `gh-axi run list --workflow post-merge.yml --branch main --limit 15 \| ...` |
| **G-DORA01** | Deployment Frequency | Elite ✓ | ≥ 5/Wo | `git log --since="4 weeks ago" --first-parent --oneline main \| wc -l` |
| **G-DORA02** | Lead Time (PR→merge) | Median 0.03h ✓ | ≤ 1h | `gh-axi api repos/{owner}/{repo}/pulls?...` |
| **G-DORA04** | MTTR | n/a ✓ | < 24h | `git log --since="8 weeks ago" --first-parent --format='%ct %s' main \| grep -iE 'revert\|hotfix'` |
| **G-GIT01** | Offene PRs >7 Tage | 0 ✓ | 0 | `gh pr list --state open --json number,createdAt` |
| **G-GIT02** | Non-conventional Commits | 0/30 ✓ | 0 | `git log --format=%s -30 origin/main \| grep -vcE '^(feat\|fix\|chore\|...)'` |
| **G-SPEC01** | openspec:validate grün | Exit 0 ✓ | Exit 0 | `bash scripts/openspec.sh validate` |
| **G-SPEC02** | Changes >30 Tage | 0 ✓ | 0 | `for d in openspec/changes/*/; do ... done` |
| **G-DOC01** | Defekte interne Doc-Links | 0 ✓ | 0 | `python3 scripts/check-links.py` |

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
- **Wöchentlich:** G-RH01/03, G-TEST01/03, G-SIZE01/03/04, G-CI01, G-CD01, G-CQ02/05, G-IMG01, G-K8S03, G-SPEC03, G-GIT03
- **Monatlich/Quartal:** G-DEP02, G-SEC03/04, G-DOC02, G-FE01/02

**Aktuell A-Ziele (2026-06-28):** G-SIZE04, G-DEP01, G-CI01, G-CD01, G-GIT03

**Offene Tickets:**

| Ziel | Ticket | Status |
|------|--------|--------|
| G-GIT03 | T001275 | offen |
| G-CD01 | T001276 | offen |
| G-CQ01 | T001277 | **gefixt** (PR #2225) |
| G-DEP01 | T001278 | offen |
| G-CI01 | T001279 | offen |
| G-SIZE04 | T001280 | offen |
