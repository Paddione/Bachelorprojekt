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
> `G-BRAIN01`–`G-BRAIN11` sind wiki-interne Ziele des brain-Repos
> (`templates/brain/wiki/quality-goals.md`) — Haupt-Repo-Ziele zur Brain-Doku setzen die
> Nummerierung ab `G-BRAIN12` fort, um ID-Kollisionen zu vermeiden.

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

# Priorität B — Offene Ziele {#prio-b}

Im nächsten Sprint einplanen.

## G-SIZE02 — Großdateien außerhalb Gate-Scope: 17 → ≤ 8

3× .opencode/ (bereits sanktionierte S1-Gate-Ignore-Einträge, Plugin-Architektur-Zwang — siehe
`docs/code-quality/gates.yaml` s1.ignore), 14× VideoVault/ (echter, aktiv genutzter Produktionscode) —
von keinem Größen-Gate überwacht, da `VideoVault/` nicht in `scan.code_roots` liegt.

```bash
# T001903-Fix: symlinks ausschließen (.opencode/plugins/*.ts sind Symlinks auf bereits
# gezählte .opencode/skills/dev-flow/*.ts-Dateien; die naive Variante ohne `[ -L ]`-Filter
# zählt dieselben Zeilen doppelt, z.B. 19 statt 17 bei zwei aktiven Plugin-Symlinks).
git ls-files VideoVault .opencode | grep -E '\.(ts|tsx|js|mjs|svelte|sh|py)$' \
  | grep -v node_modules \
  | while read -r f; do [ -L "$f" ] || echo "$f"; done \
  | xargs wc -l 2>/dev/null | grep -v ' total$' | awk '$1>600' | wc -l
```

> **B · Baseline:** 17 (verifiziert, unverändert — Symlink-Doppelzählungs-Bug in der Messung
> gefixt, echter Bestand bleibt 17) · **Target:** ≤ 8 · **Aufwand:** ~2–3 Wochen · **Messzyklus:**
> pro Merge auf VideoVault/ · **Reproduzierbar:** ja · **Ticket:** T001903 (Nachfolger von T001556,
> archiviert ohne Messwert-Fix — dessen Plan referenzierte nicht-existente Pfade wie
> `VideoVault/src/lib/upload.ts`, daher blieben alle Tasks wirkungslos) → Nachfolger T001920
> (echtes VideoVault-Refactoring mit den 14 realen Dateipfaden, über `dev-flow-plan` statt Chore,
> da ~9+ Datei-Splits kein "no behavior change"-Chore sind; **done ohne Messwert-Fix**) →
> Nachfolger **T001945**

## G-DB01 — FK-Spalten ohne Index: 4 → 0

**Was:** Zählt FK-Spalten mit Single-Column-FK, die keinen passenden Index haben. Live-Wert 4
(3 Tabellen mit je einem fehlenden Index, plus eine Wiederholung): `public.onboarding_state.brand`,
`sessions.templates.created_from_template_id`, `studio.sessions.client_id`,
`studio.sessions.template_of`. Fix als Migration `website/src/db/migrations/20260717_add_missing_fk_indexes.sql`
erstellt (T001905); wird beim nächsten `task workspace:deploy` (push-based) automatisch über
`pnpm --dir website db:migrate` angewendet — Live-Wert aktualisiert sich erst nach Deploy.

```bash
WITH fk AS (
  SELECT c.conrelid AS relid, c.conkey[1] AS col FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE c.contype='f' AND n.nspname NOT IN ('pg_catalog','information_schema') AND array_length(c.conkey,1)=1),
idx AS (SELECT i.indrelid AS relid, i.indkey[0] AS col FROM pg_index i)
SELECT count(*) FROM (SELECT relid,col FROM fk EXCEPT SELECT relid,col FROM idx) x;
```

> **B · Baseline:** 4 · **Target:** 0 · **Aufwand:** gering (4 Indizes via Migration) · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001905 (**done ohne Messwert-Fix** — Migration erstellt, Anwendung erfolgt beim nächsten Deploy; Nachfolger von T001739) → Nachfolger **T001946**

## G-DB03 — brand-Spalten ohne CHECK-Constraint: 41 → 16

**Was:** Zählt Basistabellen (VIEWs ausgeschlossen) mit einer `brand`-Spalte, die keinen CHECK-Constraint
auf `'mentolder'` haben. Messfix T001906 (2026-07-17): die alte Query zählte 44 Spalten inkl. 3 VIEWs
(`bachelorprojekt.v_timeline`, `public.eur_bookkeeping`, `public.v_billing_invoices_with_state`) — VIEWs
können keine CHECK-Constraints tragen, echter Bestand = 41 Basistabellen. Klassifikation: 37 Tabellen mit
einheitlichem Wertebereich (`mentolder`/`korczewski` oder leer), 3 Tabellen mit NULL-brand
(`knowledge.collections`, `tickets.factory_control`, `tickets.tags` — Constraint muss NULL erlauben), 1
Tabelle mit inkompatiblem Wildcard-Wert `'*'` (`tickets.provider_config`, 16 Zeilen — würde an striktem
`IN('mentolder','korczewski')` brechen). Kein einheitlicher Pauschal-CHECK möglich → Nachfolgeticket
T001925 mit voller Klassifikation, statt riskanter Vollumsetzung.

```sql
SELECT
    (SELECT count(DISTINCT c.table_schema||'.'||c.table_name) FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
       WHERE c.column_name='brand' AND c.table_schema NOT IN ('pg_catalog','information_schema') AND t.table_type='BASE TABLE')
  - (SELECT count(DISTINCT conrelid) FROM pg_constraint
       WHERE contype='c' AND pg_get_constraintdef(oid) ILIKE '%brand%' AND pg_get_constraintdef(oid) ILIKE '%mentolder%');
```

> **B · Baseline:** 41 → 16 (25 CHECK-Constraints via T001925/PR #2907; 16 verbleibende: 2 Views, 14 Tabellen mit gemischten/NULL-Werten) · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001925 (**gefixt** — PR #2907, verbleibende 16 nicht Teil des Scopes) → Nachfolger **T001947**

## G-DB10 — Unused Indexes (idx_scan = 0): 93 → 8

**Was:** Zählt Indizes mit `idx_scan = 0` seit dem letzten Reset. Unbenutzte Indizes
verlangsamen Schreiboperationen, erhöhen Autovacuum-Last und belegen Plattenplatz.
Primary Keys und Unique-Constraint-Träger werden ausgeschlossen (deren idx_scan ist
intrinsisch niedrig).

```bash
db_scalar "SELECT count(*) FROM pg_stat_user_indexes s JOIN pg_index i ON i.indexrelid = s.indexrelid WHERE s.idx_scan = 0 AND i.indisready AND NOT i.indisprimary AND s.indexrelid NOT IN (SELECT conindid FROM pg_constraint WHERE contype='u')"
```

Erster Scan (2026-07-17): **93 Treffer** über 14 Schemas. Von diesen ist genau 1 zweifelsfrei
sicher: `public.idx_customers_email` ist ein exaktes Duplikat von `customers_email_key`
(UNIQUE-Constraint, idx_scan=700, aktiv genutzt) — via Migration gedropt
(`website/src/db/migrations/20260717_drop_redundant_customers_email_index.sql`).
Die verbleibenden 92 sind NICHT zweifelsfrei: 8 davon sind partielle UNIQUE-Indizes ohne
formalen `pg_constraint`-Eintrag (Business-Invarianten wie "ein aktiver ki_config pro Brand",
"ein offener Poll") — die Messquery selbst müsste um `NOT indisunique` erweitert werden,
sonst zählt sie unlöschbare Indizes mit (Messmethoden-Korrektur analog G-DB03/G-DB09). Der Rest
(~83, plus 2 HNSW-Vektorindizes mit seltener aber legitimer Nutzung) braucht Einzelfallprüfung
pro Tabelle vor einem Drop. Volle Klassifikation → Nachfolgeticket T001928.

> **B · Baseline:** 93 → 8 (89 Indizes gedroppt via T001928; 8 verbleibende sind UNIQUE Business-Invariants) · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001928 (**gefixt** — PR #2908, verbleibende 8 nicht Teil des Scopes) → Nachfolger **T001948**

## G-SEC06 — Container Images mit High/Critical CVEs: 8 🟡 (Ziel 0)

**Was:** Zählt unique Container-Images im aktiven Deployment mit bekannten CVEs der
Severity `HIGH` oder `CRITICAL`. Trivy-Scan ist jetzt in CI integriert (`.github/workflows/ci.yml`
Security Scan Job) als advisory-only Check. `scripts/trivy-scan.sh` liefert die lokale
Baseline-Messung. 14 pinned Images werden gescannt; `:latest` Images (projekt-eigen) werden
nicht gescannt (Build-Zeitpunkt variiert).

Erster Scan (2026-07-17): **39 CRITICAL / 706 HIGH** über alle 14 Images — Details und CVE-Triage
in [`docs/audits/2026-07-17-trivy-cve-baseline.md`](../../docs/audits/2026-07-17-trivy-cve-baseline.md).

**Image-Pin-Refresh (2026-07-19, T001949): 39 → 8 CRITICAL (−79 %).** Vier Images gebumpt:
`alpine/k8s:1.34.0 → 1.36.2` (23→4 CRITICAL — der Baseline-Report ging fälschlich von
`registry.gitlab.com/alpine/k8s` aus; das Manifest referenziert tatsächlich das **Docker-Hub**-Image
`alpine/k8s`, das aktiv gepflegt wird und Tags bis `1.36.x` führt), `pgvector/pgvector:0.8.0-pg16 →
0.8.5-pg16` (8→1), `nats:2.10-alpine → 2.12-alpine` (3→0), `livekit/egress:v1.9.0 → v1.13.0` (2→0).
Alle vier Digest-Bumps mit `trivy image --severity CRITICAL` einzeln verifiziert vor dem Merge.

**Verbleibende 8 CRITICAL sind aktuell nicht per Tag-Bump behebbar** (jeweils bereits neuester
verfügbarer Tag geprüft):
- `postgres:16-alpine` (1): `CVE-2025-68121` in vendored `usr/local/bin/gosu`-Binary (alte
  Go-Toolchain) — Digest von `16-alpine`/`16-alpine3.24` ist bereits identisch mit dem gepinnten Stand.
- `pgvector/pgvector:0.8.5-pg16` (1): dieselbe `gosu`-Ursache wie postgres — Upstream-Image nutzt
  denselben Base-Layer.
- `alpine/k8s:1.36.2` (4): `CVE-2026-33186` (vendored `grpc-go` in `kustomize`) + `CVE-2025-68121`
  (Go stdlib) — bereits neuester Tag.
- `livekit/ingress:v1.5.0` (2): `CVE-2026-33186` (`grpc-go`) — `v1.5.0` ist der neueste verfügbare
  Tag auf Docker Hub (livekit/egress hat seither v1.13.0 erreicht, ingress stagniert bei v1.5.x).

Alle vier Restfälle brauchen ein Upstream-Release (gosu-Rebuild bzw. grpc-go-Bump), kein
Repo-seitiger Fix. Follow-up bei nächstem Upstream-Release erneut prüfen.

```bash
# Messung (lokal):
bash scripts/trivy-scan.sh --json | jq '.total_critical, .total_high'
# CI: advisory-only in .github/workflows/ci.yml (Security Scan Job)
```

> **B · Baseline:** 39 → 8 (Image-Pin-Refresh für 4 von 6 im Audit-Report benannten Images; die
> übrigen 2 [postgres, livekit/ingress] hatten keinen fixenden Tag verfügbar) · **Target:** 0 ·
> **Aufwand:** mittel · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001949
> (**gefixt, Target nicht erreicht** — 8 CRITICAL sind Upstream-blockiert, kein Folgeticket bis
> neue Upstream-Releases vorliegen — Nachfolger von T001909)

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

> **B · Baseline:** 60 → 74 (Messung 2026-07-17 nach T001922-Deploy, 3× `npx @lhci/cli autorun` gegen `https://web.mentolder.de`, Score konstant 74/100; FCP 3.9s, LCP 4.2s, TBT 0ms, CLS 0. T001922/PR #2899+#2902+#2903 lieferte: Traefik-Kompression + immutable `/_astro/`-Cache beide Brands, LCP-Bild → 17-KB-WebP eager/fetchpriority, Font-Doppel-Ladung entfernt, CookieConsent/PortalSidekick → client:idle. Verbleibende Hebel: Google-Fonts-Self-Hosting — 248 KB Third-Party + 806 ms render-blockend —, `sidekick-panels.css` aus dem Critical Path — 423 ms —, ~80 KB unused JS. WSL-Gotcha: `CHROME_PATH=/usr/bin/google-chrome` setzen, sonst startet LHCI den Windows-Chrome via Interop und scheitert am Port-Bind) · **Target:** ≥ 90 · **Aufwand:** mittel · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001911 (Nachfolger von T001842) · T001930 (Stufe 2, **done ohne Messwert-Fix** — Font-Self-Hosting + Critical-CSS noch offen) → Nachfolger **T001950**

## G-BRAIN14 — Brain-Ingest-Backlog: 17 → 0

**Was:** Zählt Worklist-Seiten (`scripts/brain-ingest-worklist.sh`, aktuell 86 Quellen), die im
lokalen Ingest-State (`~/.brain-ingest-state.json`) fehlen oder deren Quell-Hash sich seit dem
letzten LLM-Transform geändert hat. Das Brain (`Paddione/brain`) ist die kuratierte SSOT-Kompilierung
des Repo-Wissens (Prinzip „compile, do not move", `openspec/specs/brain-foundation.md`) — ein
wachsender Backlog bedeutet, dass das Wiki hinter dem Repo-Stand zurückfällt. Voller kuratierter
Ingest ist Follow-up zu PR #2851 (nur `.github`-Pilot live).

```bash
bash scripts/brain-ingest-worklist.sh 2>/dev/null | python3 -c "
import sys, json, hashlib
state=json.load(open('$HOME/.brain-ingest-state.json'))
todo=0
for line in sys.stdin:
    path=line.split('\t')[0].strip()
    if not path: continue
    st=state.get(path)
    if not st or hashlib.sha256(open(path,'rb').read()).hexdigest()!=st['hash']: todo+=1
print(todo)"
```

> **B · Baseline:** 17 · **Target:** 0 · **Aufwand:** gering (manueller Ingest-Lauf via `scripts/brain-ingest.sh`, GPU-Host-gebunden) · **Messzyklus:** monatlich · **Reproduzierbar:** eingeschränkt (lokales State-File + GPU-Host) · **Ticket:** T001912 (**done ohne Messwert-Fix**) → Nachfolger **T001951**


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
| **G-CQ02** | Explizite `any`-Verwendungen | 8 ✓ | ≤ 280 | `grep -rn ': any\|<any>\|as any' website/src --include=*.ts --include=*.svelte --include=*.astro \| wc -l` |
| **G-CQ04** | FIXME/HACK/XXX (echt) | 3 ✓ | ≤4 | `grep -rnE '\b(FIXME\|HACK\|XXX)\b' ... \| wc -l` |
| **G-CQ05** | Echte TODO-Marker | 0 ✓ | ≤ 1 | `grep -rnE "\bTODO\b" --include=*.ts ... website/src scripts tests k3d brett/src \| wc -l` |
| **G-CQ06** | `@deprecated`-Symbole | 1 ✓ | ≤ 1 | `grep -rnE '@deprecated' website/src \| wc -l` |
| **G-CQ07** | S2 Import-Zyklen | 0 ✓ | 0 | `python3 -c "..S2-Gate.." < docs/code-quality/baseline.json` |
| **G-CQ09** | S3 hartkodierte Hostnames | 0 ✓ | ≤ 10 | `python3 -c "..S3-Gate.." < docs/code-quality/baseline.json` |
| **G-CQ10** | S4 verwaiste Scripts | 0 ✓ | ≤ 4 | `python3 -c "..S4-Gate.." < docs/code-quality/baseline.json` |
| **G-SIZE03** | God-File `website/src/lib/website-db.ts` | 1939 ✓ | ≤ 3000 | `wc -l < website/src/lib/website-db.ts` |
| **G-GIT01** | Offene PRs >7 Tage | 0 ✓ | 0 | `gh pr list --state open --json number,createdAt` |
| **G-GIT03** | Dateien >1MB im Tree (kein LFS) | 6 ✓ | ≤ 6 | `git ls-files -z \| xargs -0 -I{} sh -c 'test -f "{}" && wc -c "{}"' 2>/dev/null \| awk '$1>1048576{c++} END{print c+0}'` — T001902: `.claude/skills/unsloth/references/llms-full.md` entfernt (redundanter, von der Skill selbst nicht referenzierter GitBook-Volldump, überlappend mit `llms-txt.md`/`llms.md`). **Manuelle Entscheidung zu den 2 Nutzer-Assets** (`assets/grilling-brett-admin-panel/Brett Admin Panel.html`, `environments/korczewski/KERN Logo Design.html`): bleiben unangetastet — Löschen ist ohne Nutzerfreigabe riskant, LFS ist repo-weit als defekt dokumentiert (T001348), und beide Dateien machen nur 2 von 6 verbleibenden >1MB-Treffern aus (Target bereits ohne sie erreicht). Keine Gate-Scope-Ausnahme nötig; siehe T001902-Ticketkommentar. |
| **G-DEP01** | High/Critical npm-Vulnerabilities | 0 ✓ | 0 | `cd website && pnpm audit --json 2>/dev/null \| python3 -c "..."` |
| **G-DEP03** | PM-Konsistenz (pnpm) | 0 ✓ | 1 PM | `grep -q "npm ci" website/Dockerfile && echo inkonsistent \|\| echo ok` |
| **G-DEP04** | `engines >= 22.13.0` | 0 ✓ | 0 | `for p in package.json website/package.json ...; do python3 -c "..engines.."; done` |
| **G-DEP05** | Renovate-PR-Backlog | 0 ✓ | ≤ 3 | `gh pr list --state open --json author,labels \| python3 -c "..renovate.."` |
| **G-DEP02** | Veraltete Major-Deps | 2 ✓ | ≤ 3 | `cd website && pnpm outdated` (Major-Sprünge zählen: aktuell nur eslint-plugin-astro 1→2, knip 5→6) |
| **G-IMG01** | Fremd-Image-Versions-Drift | 0 ✓ | 0 | `grep -rhE 'image:' k3d/ prod*/ \| ... sort -u \| awk -F'\t' '{c[$1]++} END{...}'` (T001766 gefixt: Loki/Promtail-Digests nachgezogen; war Prio B) |
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
| **G-DB09** | Slow Queries in pg_stat_statements (COPY-bereinigt) | 0 ✓ | 0 | `db_scalar "SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000 AND query NOT ILIKE 'COPY %'"` — T001926: Backup-COPY (pg_dump-intern) aus dem Mess-Scope ausgeschlossen |
| **G-DOC01** | Defekte interne Doc-Links | 0 ✓ | 0 | `python3 scripts/check-links.py` |
| **G-DOC02** | Root-CLAUDE.md Zeilen | 190 ✓ | ≤ 200 | `wc -l < CLAUDE.md` |
| **G-DOC03** | README-Index in Hauptverzeichnissen | 5/5 ✓ | 5/5 | `for d in website brett scripts tests k3d; do ls "$d"/README* ... done` |
| **G-DOC04** | Architektur-ADRs | 5 ✓ | ≥ 5 | `find docs -ipath '*adr*' -name '*.md' \| wc -l` |
| **G-DOC06** | Agent Guide Index | 30 ✓ | ≥ 30 | `find .claude/skills docs/agent-guide -name SKILL.md -o -name README.md \| wc -l` |
| **G-CI01** | main CI-Erfolgsrate (letzte 20) | 95 % ✓ | ≥ 95 % | `gh-axi run list --workflow ci.yml --branch main --limit 20 \| grep -oE 'completed,(success\|failure\|cancelled)' \| sort \| uniq -c` (19/20, 1 cancelled) |
| **G-CI02** | Rote main-HEAD-Läufe | 0 ✓ | 0 | `gh-axi run list --workflow ci.yml --branch main --limit 5 \| grep -c failure` |
| **G-CI03** | CI Pipeline p95 Duration (min) | 7 ✓ | ≤ 12 | `gh run list --workflow ci.yml --branch main --limit 20 --json createdAt,updatedAt \| python3 -c "..p95.."` (T001910: Messscript-Bug in `gh-axi run list --json` behoben, jetzt `gh` direkt) |
| **G-RH03** | OpenSpec-BATS-Abdeckung | 82 % ✓ | ≥ 60 % | `SPECS=$(ls openspec/specs/*.md \| wc -l); BATS=$(ls tests/spec/*.bats \| wc -l); echo "$BATS/$SPECS"` |
| **G-CD02** | post-merge.yml-Rate | 100 % ✓ | ≥ 95 % | `gh-axi run list --workflow post-merge.yml --branch main --limit 15 \| ...` |
| **G-DORA01** | Deployment Frequency | Elite ✓ | ≥ 5/Wo | `git log --since="4 weeks ago" --first-parent --oneline main \| wc -l` |
| **G-DORA02** | Lead Time (PR→merge) | Median 0.03h ✓ | ≤ 1h | `gh-axi api repos/{owner}/{repo}/pulls?...` |
| **G-DORA03** | Change Failure Rate (Proxy) | 7.4 % ✓ | ≤ 15 % | `git log --since="8 weeks ago" --first-parent --oneline main \| ...fix()/revert-Rate` |
| **G-DORA04** | MTTR | n/a ✓ | < 24h | `git log --since="8 weeks ago" --first-parent --format='%ct %s' main \| grep -iE 'revert\|hotfix'` |
| **G-FE03** | rohe `console.error/warn` (exkl. Selbstschutz-Fallbacks) | 0 ✓ | 0 | `grep -rEn 'console\.(error\|warn)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' \| grep -v 'browser-logger.ts' \| grep -v 'logger.ts' \| grep -v 'error-log-store.ts' \| grep -v '\.test\.ts' \| wc -l` |
| **G-FE04** | Stray `console.log/debug/info` | 0 ✓ | 0 | `grep -rEn 'console\.(log\|debug\|info)' website/src --include='*.ts' --include='*.svelte' --include='*.astro' \| grep -v 'browser-logger.ts' \| grep -v '\.test\.ts' \| wc -l` |
| **G-GIT02** | Non-conventional Commits (ohne Merge) | 0 ✓ | 0 | `git log --format=%s --no-merges -30 origin/main \| grep -vcE '^(feat\|fix\|chore\|...)'` |
| **G-AGENTIC02** | Agent-Routing-Tabelle ↔ Frontmatter-Drift | 0 ✓ | 0 | `python3 <<'PY' ... norm/toks/fm/rows ... symmetric_difference` |
| **G-AGENTIC03** | Agent-Frontmatter (name + description) | 0 ✓ | 0 | `for f in .claude/agents/*.md; do name==basename && description present` |
| **G-AGENTIC04** | test:changed Agents-Bucket | 0 ✓ | 0 | `awk '/test:changed/...' Taskfile.yml \| grep -c .claude/agents + AGENTS + agent-library` |
| **G-AGENTIC05** | 6-Agenten Cross-Reference | 0 ✓ | 0 | `comm -3 <(ls agents/...) <(routing from validate.mjs) + <(registry from tools.yaml)` |
| **G-AGENTIC06** | OVERVIEW.md Skill-Zähler vs real | 0 ✓ | 0 | `claimed - real (Betrag)` via grep claim + `git ls-files -- .claude/skills \| grep -c '/SKILL\.md$'` (nur getrackte — market-cli-Installationen zählen nicht, T001783) |
| **G-AGENTIC07** | Verwaiste aktive Skills | 0 ✓ | 0 | `for SKILL.md in git ls-files; if description exist && zero refs in CLAUDE.md/AGENTS.md/OVERVIEW.md/other SKILL.md → count` (nur getrackte) |
| **G-AGENTIC08** | Tote Script-Pfade in SKILL.md | 0 ✓ | 0 | `grep -rhoP '(?<![A-Za-z0-9_./-])scripts/...\.(sh\|mjs\|py)' .claude/skills \| sort -u \| test -f || count` (Lookbehind gegen Substring-False-Positives) |
| **G-AGENTIC09** | SKILL.md > 500 Zeilen | 0 ✓ | 0 | `find .claude/skills -name SKILL.md -exec wc -l {} + \| awk '$2!="total"&&$1>500{c++} END{print c+0}'` — T001904: `dev-flow-plan` 508→479 Zeilen |
| **G-AGENTIC11** | CLAUDE.md opencode-Liste vs opencode.jsonc | 0 ✓ | 0 | `comm -3 <(grep opencode-Liste \| extract backtick-names) <(mcp_servers opencode.jsonc)` |
| **G-AGENTIC12** | .mcp.json-Server undokumentiert | 0 ✓ | 0 | `for s in $(mcp_servers .mcp.json); grep -q -- "$s" mcp-tool-guide.md || count` |
| **G-AGENTIC13** | Tote MCP-Server-Refs in SKILL.md | 0 ✓ | 0 | `grep -rhoE 'mcp__...__\|mcp-..._browser_' .claude/skills \| gegen registrierte Server` |
| **G-AGENTIC14** | .mcp.json ↔ opencode Parity | 0 ✓ | 0 | `python3 <<'PY' ... load both, sig() for common keys, count mismatches` |
| **G-AGENTIC15** | Phantom-/opsx-Command-Referenzen | 0 ✓ | 0 | `grep -rhoE '/opsx[:-][a-z]+' in .claude/ .opencode/ .claude/skills vs valid command set` |
| **G-AGENTIC16** | Claude ↔ opencode Command-Sync | 0 ✓ | 0 | `for each .claude/commands/opsx/*.md, compare normalized body with .opencode/opsx-$name.md` |
| **G-AGENTIC17** | Command-Orphans via S4 | 0 ✓ | ≤ 0 | `S4 command_globs gegen Referenzquellen; Config-Guard: ohne Config → 99` |
| **G-AGENTIC01** | Ungescopte Agenten (security/infra/db ohne `tools:`) | 0 ✓ | ≤ 0 | `awk-Frontmatter-Check über .claude/agents/bachelorprojekt-{security,infra,db}.md` |
| **G-AGENTIC10** | Agenten ohne dispatchende Skill | 0 ✓ | ≤ 0 | `grep -rlE '^agent: <name>' .claude/skills --include=SKILL.md je Agent` |
| **G-DB04** | Backup-Alter (h) seit letztem db-backup-Job | 8 ✓ | ≤ 26h | `db_scalar Backup-Alter (health-goals-check.sh); Regressionswache T001738` |
| **G-DB08** | Tabellen >10k Rows mit Seq-Scan-Anteil >5 % | n/a | ≤ 3 | `db_scalar pg_stat_user_tables seq_scan-Quote (health-goals-check.sh)` |
| **G-TEST05** | Vitest Line-Coverage `website/src/lib` | 85 % ✓ | ≥ 60 % | `cd website && pnpm vitest run --coverage` (in health-goals-check.sh, ohne --fast) |
| **G-BRAIN12** | Brain-Manifest-Gruppen ohne Treffer (Ingest-Drift) | 0 ✓ | 0 | `bash scripts/brain-ingest-worklist.sh >/dev/null 2>&1 \| stderr-Warnungen 'hat 0 Treffer' zählen` |
| **G-BRAIN13** | Brain-Merge-Hook-Pfad-Parität (Trigger ↔ Handler) | 0 ✓ | 0 | `paths:-Globs in .github/workflows/brain-merge-hook.yml gegen brain-merge-hook.sh-SRC-Argumente (sym. Diff)` |
| **G-BRAIN15** | Brain-Seed-Template-Lint grün | Exit 0 ✓ | Exit 0 | `bash templates/brain/scripts/lint-frontmatter.sh templates/brain && bash templates/brain/scripts/lint-wikilinks.sh templates/brain` |

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
- **Wöchentlich:** G-RH01/03, G-TEST01/03, G-SIZE03, G-CI01, G-CD01, G-CQ02/05, G-IMG01, G-K8S03, G-SPEC03, G-GIT03, G-FE03/04, G-DB01, G-DB03, G-DB06, G-DB08, G-DB09, G-DB10, G-SEC06, G-FE05, G-BRAIN12, G-BRAIN13, G-BRAIN15
- **Monatlich/Quartal:** G-DEP02, G-SEC03/04, G-DOC02, G-FE01/02, G-BRAIN14, G-AGENTIC09

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

**Baseline-Update 2026-07-17 (T001902):** G-GIT03 7→6 — Target erreicht, wechselt von Prio A nach Prio C. Entfernt: `.claude/skills/unsloth/references/llms-full.md` (1.03 MB, redundanter GitBook-Volldump, von der Skill selbst nicht referenziert — SKILL.md listet nur `llms-txt.md`). Die 2 verbleibenden Nutzer-Assets (`assets/grilling-brett-admin-panel/Brett Admin Panel.html`, `environments/korczewski/KERN Logo Design.html`) bleiben bewusst unangetastet: Löschen ohne Nutzerfreigabe riskant, LFS repo-weit als defekt dokumentiert (T001348); da das Target auch ohne sie erreicht ist, ist keine Gate-Scope-Ausnahme nötig.

**Baseline-Update 2026-07-17 (T001903):** G-SIZE02 Messmethode gefixt — die naive `wc -l`-Zählung folgte den Symlinks `.opencode/plugins/background-agents.ts` und `.opencode/plugins/worktree.ts` (git-tracked Symlinks auf `.opencode/skills/dev-flow/*.ts`) und zählte deren Zeilen doppelt (19 statt 17). Messkommando um `[ -L "$f" ]`-Filter ergänzt. Echter, verifizierter Bestand bleibt bei 17 (3× .opencode/, bereits sanktioniert via S1-Gate-Ignore; 14× VideoVault/, echter Produktionscode, keine Duplikate/generierte Artefakte). T001556 hatte den Wert nie wirklich gefixt — der archivierte Plan referenzierte nicht-existente Pfade (`VideoVault/src/lib/upload.ts` statt der realen `VideoVault/client/src/...` / `VideoVault/server/...`-Struktur), daher blieben alle abgehakten Tasks wirkungslos. Zielwert ≤8 erfordert echtes, getestetes Code-Splitting über ~9 Dateien (~2-3 Wochen) — kein Chore-Scope (kein `node_modules` installiert, kein Testlauf als Regressionsnetz in dieser Session verfügbar) → Nachfolger-Ticket T001920 mit konkreten Split-Vorschlägen je realer Datei, zur Umsetzung über `dev-flow-plan`.

**Offene Tickets (2026-07-17):** G-AGENTIC09 (T001904), G-DB01 (T001905), G-SEC06 (T001909), G-FE05 (T001911), G-BRAIN14 (T001912), G-SIZE02 (T001920, Nachfolger von T001903 — echtes VideoVault-Refactoring), G-DB03 (T001925, Nachfolger von T001906 — echte 41-Tabellen-Migration in 3 Gruppen), G-DB09 (T001926, Nachfolger von T001907 — Messmethoden-Korrektur Backup-COPY-Ausschluss), G-DB10 (T001928, Nachfolger von T001908 — 92 restliche Unused-Index-Kandidaten klassifizieren)

| Ziel | Ticket | Status |
|------|--------|--------|
| G-GIT03 | T001902 | done (7→6, Target erreicht — `llms-full.md` entfernt, 2 Nutzer-Assets bewusst unangetastet) |
| G-SIZE02 | T001903 | **gefixt** (Messmethode korrigiert — Symlink-Doppelzählung behoben; echter Bestand 17 verifiziert, davon 3 bereits sanktioniert. Zielwert ≤8 nicht erreichbar ohne echtes Code-Splitting → Nachfolger T001920) |
| G-AGENTIC09 | T001904 | **gefixt** (dev-flow-plan/SKILL.md 508→479 Zeilen, Whitespace-Kompression ohne Inhaltsverlust — Nachfolger von T001559) |
| G-DB01 | T001905 | Migration erstellt, Anwendung ausstehend (nächster Deploy) — Nachfolger von T001739 |
| G-DB03 | T001906 | **gefixt** (Messmethode korrigiert — 3 VIEWs ausgeschlossen, echter Bestand 41 Basistabellen; kein einheitlicher Wertebereich [Wildcard `'*'` + NULL-Ausnahmen] → Nachfolger T001925) |
| G-DB09 | T001907 | offen (Slow Queries, erster Scan + Optimierung — Nachfolger von T001838) |
| G-DB10 | T001908 | **gefixt** (Baseline 93 gemessen, 1 zweifelsfreier Drop [`idx_customers_email`] via Migration umgesetzt — Nachfolger T001928 für die restlichen 92 Kandidaten, Nachfolger von T001839) |
| G-SEC06 | T001909 | **gefixt** (Image-Pin-Refresh 39→8 CRITICAL, Rest Upstream-blockiert [gosu/grpc-go] — Nachfolger von T001840) → Nachfolger **T001949** |
| G-CI03 | T001910 | **gefixt** (CI p95 = 7 min ✅ ≤12, Messscript-Bug behoben — Nachfolger von T001841) |
| G-FE05 | T001911 | **gemessen** (Baseline 60/100, Target 90 — Optimierung als Follow-up-Ticket ausgelagert) |
| G-BRAIN14 | T001912 | offen (Ingest-Backlog 17/86; voller kuratierter Ingest = Follow-up zu PR #2851) |
| G-DB04 | T001739 | gruen (1h, Target ≤26h — Root-Cause-Fix nicht verifiziert, Regressionswache bleibt täglich) |
| G-DB06 | T001739 | gruen (Gate, halten) |
| G-IMG01 | T001766 | **gefixt** (Regression 0→2→0, Helm-Digest-Drift Loki/Promtail behoben — zurück nach Prio C) |
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

**Baseline-Update 2026-07-17 (T001904):** G-AGENTIC09 1→0 — `dev-flow-plan/SKILL.md` 508→479 Zeilen. Whitespace-Kompression analog T001559/T001804 (redundante Leerzeilen vor Headern/Listen/Codefences entfernt, Codefence-interne Leerzeilen unangetastet gelassen) — reine Deletion-Diffs, kein Inhaltsverlust.

**Baseline-Update 2026-07-17 (T001901 — Struktur-Refresh + Brain-Ziele):** Strukturbereinigung:
G-IMG01 2→0 (Helm-Digest-Drift behoben, T001766 gefixt) — von Prio B zurück nach Prio C; die
Duplikat-Zeile G-IMG02 (identisches Ziel/Messung) und die doppelte G-DORA04-Zeile aus der
Prio-C-Tabelle entfernt; G-GIT03-Duplikatzeile aus Prio C entfernt (lebt nur noch in Prio A).
Fünf gemessene, aber undokumentierte Ziele als Prio-C-Zeilen nachgetragen: G-AGENTIC01, G-AGENTIC10,
G-DB04, G-DB08, G-TEST05. **Neu: Brain-Dokumentations-Ziele** (Namespace ab G-BRAIN12; G-BRAIN01–11
leben im brain-Repo): G-BRAIN12 Manifest-Drift 0 (Gate), G-BRAIN13 Merge-Hook-Pfad-Parität 0 (Gate),
G-BRAIN15 Seed-Template-Lint Exit 0 (Gate) — alle drei in health-goals-check.sh verdrahtet;
G-BRAIN14 Ingest-Backlog 17→0 (Prio B, T001912). Messwerte: G-CQ02 9→8, G-CQ05 1→0.

**Baseline-Update 2026-07-17 (T001909 — G-SEC06 erster Trivy-Scan):** G-SEC06 n/a→39 (CRITICAL;
706 HIGH). Vollständige CVE-Triage in [`docs/audits/2026-07-17-trivy-cve-baseline.md`](../../docs/audits/2026-07-17-trivy-cve-baseline.md).
Alle CRITICAL-Funde fixable, keine False-Positives; Konzentration auf `alpine/k8s:1.34.0`
(23/39). Bugfix im gleichen Zug: `scripts/trivy-scan.sh` fehlte der `ghcr.io/`-Prefix beim
pocket-id-Image (Scan schlug für dieses Image still fehl statt zu warnen). Fix der CRITICAL-CVEs
(Image-Pin-Refresh, 6 betroffene Images) ist bewusst nicht Teil dieses Baseline-Chores —
Folgeticket empfohlen.
Alle Alt-Tickets der offenen Ziele waren done/archived ohne Messwert-Fix — elf Nachfolge-Tickets
T001902–T001912 angelegt und in den Meta-Zeilen referenziert.

**Baseline-Update 2026-07-17 (T001911 — erster Lighthouse-Lauf):** G-FE05 n/a→60 (3× `npx @lhci/cli
autorun` gegen `https://web.mentolder.de`, Performance-Score konstant 60/100; FCP 6.0s, LCP 7.5s,
TTI 7.5s, TBT 0ms, CLS 0 — größte Opportunity: fehlende Text-Compression, ~622 KiB Einsparpotenzial,
gefolgt von unused-javascript ~278 KiB und responsive Images ~146 KiB). Score liegt deutlich unter
Target 90 — echte Optimierung ist bewusst nicht Teil dieses Chores; Follow-up-Ticket T001922 angelegt.

**Baseline-Update 2026-07-17 (T001910 — G-CI03 erster Messlauf):** G-CI03 n/a→7 min p95 ✅ (Ziel ≤12 min; Messscript-Bug behoben — `gh-axi run list` unterstützt kein `--json` (nur `--fields`), Python-Auswertung parste ISO-Timestamps nicht als datetime — beide Stellen auf `gh` direkt + `datetime.fromisoformat` korrigiert).

**Baseline-Update 2026-07-19 (T001952 — Prio-B Ticket-Backfill):** Alle Tracking-Tickets der 10 Prio-B-Ziele waren via Merge=Abschluss-Konvention bereits `done`, ohne dass die zugrundeliegenden Health-Goals ihr Target erreicht hätten (T001280→T001347-Stil-Churn). Für die 7 Ziele mit weiterhin verfehltem Target wurden neue Nachfolge-Tickets angelegt: G-SIZE02 → T001945, G-DB01 → T001946, G-DB03 → T001947, G-DB10 → T001948, G-SEC06 → T001949, G-FE05 → T001950, G-BRAIN14 → T001951. Die 3 Ziele, deren Wert bereits am oder über dem Target liegt (G-AGENTIC09 0≤0, G-DB09 0=0, G-CI03 7≤12), wurden redaktionell von Prio B in die Prio-C Green-Gates-Tabelle verschoben — kein neues Ticket, da kein offener Arbeitsbedarf besteht.

**Baseline-Update 2026-07-19 (T001949 — G-SEC06 Image-Pin-Refresh):** G-SEC06 39→8 CRITICAL (−79%). alpine/k8s 1.34.0→1.36.2, pgvector 0.8.0-pg16→0.8.5-pg16, nats 2.10-alpine→2.12-alpine, livekit/egress v1.9.0→v1.13.0 — je mit `trivy image --severity CRITICAL` vor Merge verifiziert. Wichtiger Messfehler in der Baseline korrigiert: `alpine/k8s` im Manifest ist ein Docker-Hub-Image (nicht `registry.gitlab.com/alpine/k8s`, das für anonyme Pulls gesperrt ist) — Docker Hub führt aktiv gepflegte Tags bis 1.36.x. Verbleibende 8 CRITICAL (postgres, pgvector, alpine/k8s, livekit/ingress) sind Upstream-blockiert (vendored gosu/grpc-go in bereits neuesten Tags) — kein Folgeticket bis neue Upstream-Releases erscheinen.
