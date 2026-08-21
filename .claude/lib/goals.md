# Repository Health Goals

Quantifizierbare Ziele für die strukturelle Gesundheit des Repos.
Ein Ziel ohne reproduzierbaren Mess-Befehl ist kein Ziel, sondern ein Wunsch.

**Baseline-Stichtag:** `2026-07-01` · **Zuletzt gemessen:** `2026-08-21` · **Dashboard:** Homepage-Section `#health`

> **`Zuletzt gemessen` ist das Messdatum des Dashboards** und wird von
> `scripts/health-goals-update.sh` bei jedem Lauf gestempelt. Vor T002598 leitete
> `scripts/gen-goals-data.mjs` dieses Datum aus dem jüngsten `Baseline-Update`-Marker der
> Chronik-Prosa ab. Seit die Chronik in [`docs/health-goals-history.md`](../../docs/health-goals-history.md)
> liegt, gäbe es dort nichts mehr zu finden — der Parser wäre still auf den statischen
> `Baseline-Stichtag` zurückgefallen und hätte ein Monat altes Datum als frisch ausgewiesen,
> ohne dass irgendetwas rot wird. Dieses Feld von Hand zu ändern ist sinnlos: der nächste
> Messlauf überschreibt es.

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

## G-E2E01 — Nightly-E2E-Erfolgsrate (e2e.yml, letzte 14 Läufe): 0 % → ≥ 90 %

**Was:** Anteil erfolgreicher Läufe des nächtlichen Playwright-E2E-Workflows (`e2e.yml`,
beide Brands auf fleet) über die letzten 14 Läufe. G-CI01–03 messen ausschließlich `ci.yml` —
die E2E-Suite lief zum Aufnahme-Zeitpunkt **14/14 rot** (Auth-Token/CRON_SECRET-Drift, Fix
in Arbeit auf `fix/e2e-auth-token-and-cron-secret`), ohne dass irgendein Goal es sichtbar
machte. Genau diese Lücke schließt das Ziel.

```bash
gh run list --workflow e2e.yml --limit 14 --json conclusion \
  | python3 -c "import json,sys; r=[x['conclusion'] for x in json.load(sys.stdin) if x.get('conclusion')]; print(round(100*sum(1 for c in r if c=='success')/len(r)) if r else 'n/a')"
```

> **A · Baseline:** 0 (0/14 grün, 2026-07-22) · **Target:** ≥ 90 · **Aufwand:** mittel · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T002063 (Aufnahme; Suite-Fix läuft separat über `fix/e2e-auth-token-and-cron-secret`) — **Root-Cause 2026-07-25:** DNS-Auflösung `EAI_AGAIN web.korczewski.de` in CI-Runnern (globalSetup/globalTeardown `fetch` schlägt fehl); zweitens 401 auf Ingest-Endpoint (`INGEST_TOKEN`-Secret prüfen) — **Fix 2026-07-25:** PR #3207 gefixt (global-db-cleanup.ts fängt Network-Errors ab; ingest-e2e.ts akzeptiert E2E_INGEST_TOKEN)

## G-DB09 — Slow Queries in pg_stat_statements (COPY+DDL-bereinigt): 0

**Was:** Zählt Abfragen in `pg_stat_statements` mit `mean_exec_time > 1s`. T001926 hatte
Backup-COPY aus dem Mess-Scope ausgeschlossen. T002095 (2026-07-23) fand die seitdem
aufgetauchte neue Slow Query: eine einmalige `CREATE INDEX chunks_embedding_hnsw ON
knowledge.chunks USING hnsw (...)`-DDL (calls=1, mean_exec_time=13123ms) — ein legitimer
Vektorindex-Build, keine wiederholte Applikations-Query. Fix: `NOT ILIKE 'CREATE INDEX%`
zusätzlich zu `NOT ILIKE 'COPY %'` im Mess-Query ausgeschlossen (bewusst eng auf
`CREATE INDEX` begrenzt statt breiter DDL-Blockliste).

```bash
db_scalar "SELECT count(*) FROM pg_stat_statements WHERE mean_exec_time > 1000 AND query NOT ILIKE 'COPY %' AND query NOT ILIKE 'CREATE INDEX%'"
```

> **A · Baseline:** 0 (2026-08-21, verifiziert 0 slow queries in pg_stat_statements) · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T013030 · **Messquery-Korrektur:** `NOT ILIKE 'CREATE INDEX%'` Ergänzung (2026-07-25, T002095) — Messung schließt jetzt einmalige DDL-Builds aus


---

# Priorität B — Offene Ziele {#prio-b}

Im nächsten Sprint einplanen.

## G-OPS01 — Pods nicht Running/Ready (fleet, beide Brand-Namespaces): 3 → 0

**Was:** Zählt Pods in `workspace` + `workspace-korczewski`, deren Phase nicht
Running/Succeeded ist oder deren Container nicht ready sind. Alle G-K8S-Goals prüfen nur
Manifeste (YAML) — dieses Ziel schaut erstmals auf den Live-Zustand des Clusters.
Baseline 2026-07-22: `workspace/[livekit-egress — removed T002184]` (Pending), `workspace/test-pod`
(Failed — Debris), `workspace-korczewski/oauth2-proxy-terminal-…` (Pending).

```bash
python3 -c "
import json,subprocess
n=0
for ns in ('workspace','workspace-korczewski'):
    d=json.loads(subprocess.check_output(['kubectl','get','pods','-n',ns,'--context','fleet','-o','json']))
    for p in d['items']:
        ph=p['status'].get('phase')
        if ph=='Succeeded': continue
        cs=p['status'].get('containerStatuses',[])
        if ph!='Running' or any(not c.get('ready') for c in cs): n+=1
print(n)"
```

> **B · Baseline:** 3 → 2 → 59 (2026-08-19, signifikanter Anstieg) · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T002063

## G-DB01 — FK-Spalten ohne Index: 0

**Was:** Zählt FK-Spalten mit Single-Column-FK, die keinen passenden Index haben.

```bash
WITH fk AS (
  SELECT c.conrelid AS relid, c.conkey[1] AS col FROM pg_constraint c
  JOIN pg_class t ON t.oid=c.conrelid JOIN pg_namespace n ON n.oid=t.relnamespace
  WHERE c.contype='f' AND n.nspname NOT IN ('pg_catalog','information_schema') AND array_length(c.conkey,1)=1),
idx AS (SELECT i.indrelid AS relid, i.indkey[0] AS col FROM pg_index i)
SELECT count(*) FROM (SELECT relid,col FROM fk EXCEPT SELECT relid,col FROM idx) x;
```

> **B · Baseline:** 0 (2026-08-21, alle Single-Column-FKs indiziert via T013031) · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T013031

## G-DB03 — brand-Spalten ohne CHECK-Constraint: 0

**Was:** Zählt Basistabellen (VIEWs ausgeschlossen) mit einer `brand`-Spalte, die keinen CHECK-Constraint
auf `'mentolder'` haben.

```sql
SELECT
    (SELECT count(DISTINCT c.table_schema||'.'||c.table_name) FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name
       WHERE c.column_name='brand' AND c.table_schema NOT IN ('pg_catalog','information_schema') AND t.table_type='BASE TABLE')
  - (SELECT count(DISTINCT conrelid) FROM pg_constraint
       WHERE contype='c' AND pg_get_constraintdef(oid) ILIKE '%brand%' AND pg_get_constraintdef(oid) ILIKE '%mentolder%');
```

> **B · Baseline:** 0 (2026-08-21, alle Basistabellen mit brand haben CHECK-Constraint via T013031) · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T013031


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
(`components/website/src/db/migrations/20260717_drop_redundant_customers_email_index.sql`).
Die verbleibenden 92 sind NICHT zweifelsfrei: 8 davon sind partielle UNIQUE-Indizes ohne
formalen `pg_constraint`-Eintrag (Business-Invarianten wie "ein aktiver ki_config pro Brand",
"ein offener Poll") — die Messquery selbst müsste um `NOT indisunique` erweitert werden,
sonst zählt sie unlöschbare Indizes mit (Messmethoden-Korrektur analog G-DB03/G-DB09). Der Rest
(~83, plus 2 HNSW-Vektorindizes mit seltener aber legitimer Nutzung) braucht Einzelfallprüfung
pro Tabelle vor einem Drop. Volle Klassifikation → Nachfolgeticket T001928.

> **B · Baseline:** 93 → 8 (89 Indizes gedroppt via T001928; 8 verbleibende sind UNIQUE Business-Invariants) · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001928 (**gefixt** — PR #2908, verbleibende 8 nicht Teil des Scopes) → Nachfolger **T001948**

## G-SEC06 — Container Images mit High/Critical CVEs: 6 🟡 (Ziel 0)

**Was:** Zählt unique Container-Images im aktiven Deployment mit bekannten CVEs der
Severity `HIGH` oder `CRITICAL`. Trivy-Scan ist jetzt in CI integriert (`.github/workflows/ci.yml`
Security Scan Job) als advisory-only Check. `scripts/trivy-scan.sh` liefert die lokale
Baseline-Messung. Pinned Images werden gescannt; `:latest` Images (projekt-eigen) werden
nicht gescannt (Build-Zeitpunkt variiert).

Erster Scan (2026-07-17): **39 CRITICAL / 706 HIGH** — Details und CVE-Triage
in [`docs/audits/2026-07-17-trivy-cve-baseline.md`](../../docs/audits/2026-07-17-trivy-cve-baseline.md).

**Image-Pin-Refresh (2026-07-19, T001949): 39 → 8 CRITICAL (−79 %).** Vier Images gebumpt:
`alpine/k8s:1.34.0 → 1.36.2` (23→4 CRITICAL — der Baseline-Report ging fälschlich von
`registry.gitlab.com/alpine/k8s` aus; das Manifest referenziert tatsächlich das **Docker-Hub**-Image
`alpine/k8s`, das aktiv gepflegt wird und Tags bis `1.36.x` führt), `pgvector/pgvector:0.8.0-pg16 →
 0.8.5-pg16` (8→1), `nats:2.10-alpine → 2.12-alpine` (3→0), `livekit/egress` (2→0).
Alle vier Digest-Bumps mit `trivy image --severity CRITICAL` einzeln verifiziert vor dem Merge.

**LiveKit-Entfernung (T002184):** `livekit/ingress` (2 CRITICAL: `CVE-2026-33186` grpc-go) und
`livekit/egress` wurden aus dem Deployment entfernt. Das reduziert die verbleibenden CRITICAL
von 8 auf **6**.

**Verbleibende 6 CRITICAL sind aktuell nicht per Tag-Bump behebbar** (jeweils bereits neuester
verfügbarer Tag geprüft):
- `postgres:16-alpine` (1): `CVE-2025-68121` in vendored `usr/local/bin/gosu`-Binary (alte
  Go-Toolchain) — Digest von `16-alpine`/`16-alpine3.24` ist bereits identisch mit dem gepinnten Stand.
- `pgvector/pgvector:0.8.5-pg16` (1): dieselbe `gosu`-Ursache wie postgres — Upstream-Image nutzt
  denselben Base-Layer.
- `alpine/k8s:1.36.2` (4): `CVE-2026-33186` (vendored `grpc-go` in `kustomize`) + `CVE-2025-68121`
  (Go stdlib) — bereits neuester Tag.

Alle drei Restfälle (6 CVEs) brauchen ein Upstream-Release (gosu-Rebuild bzw. grpc-go-Bump), kein
Repo-seitiger Fix. Follow-up bei nächstem Upstream-Release erneut prüfen.

```bash
# Messung (lokal):
bash scripts/trivy-scan.sh --json | jq '.total_critical, .total_high'
# CI: advisory-only in .github/workflows/ci.yml (Security Scan Job)
```

> **B · Baseline:** 39 → 8 → 6 (−79 % via T001949; −2 via T002184 LiveKit-Entfernung) · **Target:** 0 ·
> **Aufwand:** mittel · **Messzyklus:** wöchentlich · **Reproduzierbar:** ja · **Ticket:** T001949
> (**gefixt, Target nicht erreicht** — 6 CRITICAL sind Upstream-blockiert, kein Folgeticket bis
> neue Upstream-Releases vorliegen — Nachfolger von T001909)

## G-LLM01 — Modellserver-Verfügbarkeit (Loadout-Endpunkte): n/a → 0

**Was:** Zählt die in `scripts/llm/loadouts.json` geführten Modellserver, die nicht erreichbar sind.
Die Loadout-Datei ist die SSOT für Modellserver; ein toter Server darin bedeutet verlorene
Inferenz-Kapazität. `exclusiveGroup`-Mitglieder einer Gruppe gelten nur als eine Zähleinheit —
eine Gruppe ist verfügbar, sobald ein Mitglied lebt. Messquelle ist `scripts/lib/llm-stack-measure.sh`
(`server-availability`); der Positiv-Anker (`/livez` des llm-proxy und eine auswertbare
Loadout-Registry) entscheidet `n/a` gegen `0` — eine nicht durchgeführte Messung zählt nie als
erreicht.

```bash
bash scripts/lib/llm-stack-measure.sh server-availability
```

> **B · Baseline:** 1 → 2 → 3 (2026-08-19, Regressions-Zuwachs) · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** täglich · **Reproduzierbar:** ja (nur lokal/GPU-Host) · **Ticket:** T002442

## G-LLM02 — llm-proxy-Bereitschaft (ready + tote Provider): n/a → 0

**Was:** Prüft den llm-proxy (:18235) auf `ready: true` und zählt degradierte Backends. Der Proxy
ist der alleinige LLM-Gateway; meldet er `degraded`, ist die gesamte Factory ohne Inferenz-Fähigkeit.
Der `/health`-Endpunkt des Proxys liefert `ready`, `checked` und `degraded` — **nicht** `providers`.
Genau diese falsche Feld-Annahme (`data.get('providers', [])`) machte das Ziel strukturell grün,
während 2 von 3 Backends tot waren; `proxy-readiness` liest jetzt `degraded` und zählt bei
`ready:false` den Wert von `checked`. Messquelle ist `scripts/lib/llm-stack-measure.sh`
(`proxy-readiness`).

```bash
bash scripts/lib/llm-stack-measure.sh proxy-readiness
```

> **B · Baseline:** n/a → 5 (Proxy meldet 5 degraded/checked Backends) · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** täglich · **Reproduzierbar:** ja (nur lokal/GPU-Host) · **Ticket:** T002442

## G-LLM04 — Autostart-Abdeckung (LLM-Unit-Dateien): n/a → 0

**Was:** Zählt deklarierte LLM-Unit-Dateien (`scripts/llm/*.service`, `scripts/llm-proxy/*.service`)
ohne `enabled`-Zustand (`systemctl --user is-enabled`). Fehlt der Autostart, ist der Dienst nach
einem Neustart weg, ohne dass es auffällt — der llm-proxy hatte keinen Autostart, während die
Modellserver ihn seit T002110 hatten. `ollama.service` ist deklariert und bewusst nicht auf dieser
Maschine installiert; es zählt als Fund und darf nicht wegdefiniert werden. Messquelle ist
`scripts/lib/llm-stack-measure.sh` (`autostart-coverage`); der Positiv-Anker ist mindestens eine
deklarierte Unit-Datei.

```bash
bash scripts/lib/llm-stack-measure.sh autostart-coverage
```

> **B · Baseline:** 1 · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** täglich · **Reproduzierbar:** ja (nur lokal/GPU-Host) · **Ticket:** T002442

## G-LLM05 — Tote lokale Endpunkt-Verweise (Backend-Registry): n/a → 0

**Was:** Zählt lokale Endpunkte (`127.0.0.1`/`localhost`) der Proxy-Backend-Registry
(`tickets.llm_proxy_backends`, enabled) ohne Listener. Der historische LM-Studio-`:1234`-Fall —
ein Eintrag, dessen Endpunkt längst weg war, ohne dass es auffiel — ist der Prototyp. Cluster-DNS
und MCP-Registry-Endpunkte sind ausgeschlossen (G-OPS01 / G-IF01). Messquelle ist
`scripts/lib/llm-stack-measure.sh` (`dead-endpoints`); der Positiv-Anker ist `/livez` des llm-proxy
plus eine auswertbare Backend-Registry.

```bash
bash scripts/lib/llm-stack-measure.sh dead-endpoints
```

> **B · Baseline:** 2 → 0 (2026-08-21, T013003: Backend llamacpp-gemma disabled) · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** täglich · **Reproduzierbar:** ja (nur lokal/GPU-Host) · **Ticket:** T002442

---

## G-WT01 — Hauptcheckout auf main und sauber: 1 → 0

**Was:** Prüft, ob der Hauptcheckout (`~/Bachelorprojekt`) auf Branch `main` steht und keine
uncommitteten Changes trägt. Die Regel existiert seit T001880, wurde aber mehrfach verletzt —
zuletzt am 2026-07-28 mit 15 uncommitteten Dateien auf `chore/mishap-T002422`. Eine Verletzung
gefährdet Factory-Dispatcher und Worktree-Erstellung (`scripts/worktree-create.sh` warnt, blockiert
aber nicht). Binäres Ziel: 0 = ok, 1 = Verletzung.

**Positiv-Anker:** Lässt sich der Hauptcheckout nicht als Git-Repo auflösen oder schlägt
`git status` fehl, ist die Ausgabe `n/a` — **nicht** `0` und auch nicht `1`. Ein nicht auflösbarer
Pfad ist keine Verletzung, sondern eine nicht durchgeführte Messung.

```bash
bash scripts/lib/wt-hygiene-measure.sh main-checkout
```

> **B · Baseline:** 1 · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** pro Session (lokal) · **Reproduzierbar:** nur lokal (CI hat keinen Hauptcheckout) · **Ticket:** T002443

## G-WT02 — Veraltete Worktrees (Branch gemergt oder >14d inaktiv): 0 → 0

**Was:** Zählt registrierte Nebenworktrees, deren HEAD-Commit bereits in `origin/main` enthalten
ist oder deren letzter Commit älter als 14 Tage ist. Aufgeräumte Worktrees verhindern
versehentliches Arbeiten auf toten Branches und das Anwachsen des `.worktrees/`-Verzeichnisses
(26 Stück am 2026-07-28).

Die Merged-Erkennung läuft über `git merge-base --is-ancestor <worktree-head> origin/main`, nicht
über `git branch -r --contains <branchname>`: der HEAD-Commit ist die Aussage, die interessiert,
und ein Worktree mit detached HEAD hat gar keinen Branchnamen.

**Positiv-Anker:** Ist kein Nebenworktree registriert oder lässt sich `origin/main` nicht
auflösen, ist die Ausgabe `n/a`. Der frühere Messblock iterierte über den Glob `.worktrees/*/` und
gab bei nicht greifendem Glob `0` aus — also trivial grün ohne Messgrundlage, exakt der vakuose
Negativbefund, den T002356-M1 verbietet.

```bash
bash scripts/lib/wt-hygiene-measure.sh stale-worktrees
```

> **B · Baseline:** 0 · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** wöchentlich (lokal) · **Reproduzierbar:** nur lokal (CI hat keine Worktrees) · **Ticket:** T002443

## G-WT03 — Verwaiste Agent-Locks (Heartbeat abgelaufen oder Halter nicht auffindbar): 0 → 0

**Was:** Zählt Locks unter `<git-common-dir>/agent-locks/`, deren Halter nachweislich nicht mehr
lebt. Tote Locks blockieren still: `check ticket <id>` meldet durchgehend `held`, `list` zeigt sie
als `live`, und `agent-lock.sh reap` räumt sie nicht, solange der Worktree noch steht.

**`owner_pid` ist KEIN Lebendigkeits-Signal.** `agent-lock.sh::_write_lock` schreibt
`"owner_pid": "$$"` — die PID des kurzlebigen `agent-lock.sh`-Bash-Prozesses, der Sekunden später
beendet ist. Am 2026-08-02 meldeten deshalb **alle fünf** Locks des Hauptcheckouts eine tote
`owner_pid`, darunter der Lock der gerade laufenden Session. Eine Regel „tote PID ⇒ verwaist"
stuft folglich jeden Lock als verwaist ein und ist wertlos. `agent-lock.sh::_reapable` behandelt
eine tote PID aus demselben Grund nie allein als entscheidend.

Gemessen wird deshalb in dieser Reihenfolge:

1. **Heartbeat älter als 2×`AGENT_LOCK_TTL`** ⇒ verwaist. Eindeutig, und der einzige Indikator,
   der auch eine **wiederverwendete** PID erwischt. Die TTL wird nicht neu erfunden, sondern aus
   derselben Variable gelesen, die `scripts/agent-lock.sh` verwendet (Vorgabe 1800 s).
2. **Heartbeat frisch** ⇒ lebendig, wenn der eingetragene Worktree noch existiert und auf dem
   eingetragenen Branch steht (`_reapable` Pfad 0b) **oder** die `owner_pid` tatsächlich läuft
   (Pfad 0c). Sonst verwaist.

Anlassfall (2026-08-02, T002570): ein Lock mit toter `owner_pid` **und** `heartbeat_at ==
created_at`, älter als zweimal TTL, bei weiterhin existierendem Worktree. Erkennbar war die
Verwaisung nur durch manuellen PID- und Heartbeat-Vergleich.

**Positiv-Anker:** Fehlt das Lock-Verzeichnis oder enthält es keine wohlgeformte Lock-Datei, ist
die Ausgabe `n/a`. Der stärkste Anker ist der Lock der laufenden Session selbst: er ist
nachweislich lebendig, obwohl seine `owner_pid` tot ist — klassifiziert das Verfahren ihn als
verwaist, ist das Verfahren kaputt (Test `G-WT03 (stärkster Anker)` in
`tests/spec/health-goals/worktree-hygiene-goals.bats`).

```bash
bash scripts/lib/wt-hygiene-measure.sh orphan-locks
```

> **B · Baseline:** 0 · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** pro Session (lokal) · **Reproduzierbar:** nur lokal (CI hat keine agent-locks) · **Ticket:** T002443

## G-WT04 — Löschbereite Worktrees mit ungesicherter Arbeit: 0 → 0

**Was:** Zählt Nebenworktrees, die **gleichzeitig** löschbereit (HEAD bereits in `origin/main`) und
dirty sind (`git status --porcelain` nicht leer). Genau diese Schnittmenge räumt der
`repo-hygiene`-Cleanup weg, ohne hinzusehen: er prüft nur Commit-Ancestry, nicht ungetrackte
Dateien (T002379). Ein Treffer bedeutet akut drohenden Datenverlust.

Bewusst **nicht** „alle Worktrees mit dirty status": ungesicherte Arbeit ist im laufenden Betrieb
normal — jede aktive Session hat sie. Ein Ziel darauf wäre dauerhaft rot und würde ignoriert.

**Positiv-Anker:** Ist kein Nebenworktree registriert oder lässt sich `origin/main` nicht auflösen,
ist die Ausgabe `n/a`.

```bash
bash scripts/lib/wt-hygiene-measure.sh unsafe-worktrees
```

> **B · Baseline:** 0 · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** wöchentlich (lokal) · **Reproduzierbar:** nur lokal (CI hat keine Worktrees) · **Ticket:** T002443

## G-WT05 — Lokaler main hinter origin/main (Commits): 0 → 0

**Was:** Zählt Commits in `main..origin/main`. Ein zurückgefallener lokaler `main` ist die Ursache
mehrerer Klassen von Folgefehlern: `scripts/worktree-create.sh` erzeugt Worktrees von einem alten
Stand, `freshness:check` misst gegen einen anderen Base als CI (T002561), und lokale
Factory-Queue-Abfragen laufen gegen den falschen Branch.

**Positiv-Anker:** Fehlt `refs/heads/main` oder `refs/remotes/origin/main`, ist die Ausgabe `n/a`.
Zusätzlich gilt ein **veralteter Fetch** als fehlende Messgrundlage: ist `FETCH_HEAD` älter als
24 h, misst die Zahl nicht die Divergenz, sondern das Alter des letzten Fetch — dann `n/a` statt
einer beruhigenden `0`.

```bash
bash scripts/lib/wt-hygiene-measure.sh main-divergence
```

> **B · Baseline:** 0 → 14 (2026-08-19, main divergiert) · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** pro Session (lokal) · **Reproduzierbar:** nur lokal (CI klont frisch) · **Ticket:** T002443

## G-WT06 — Phantom-Scope-Locks (Scope leer oder mit `-` beginnend): 0 → 0

**Was:** Zählt Locks, deren `scope`-Feld leer ist oder mit `-` beginnt. Am 2026-08-02 zeigte
`agent-lock.sh list` einen Lock mit `--label` als SCOPE-Wert — ein Flag wurde als
Positionsargument gelesen. Der `_reject_arg`-Guard aus T002363 fängt nur unbekannte Flags **nach**
dem Scope, nicht einen Scope, der selbst ein Flag ist. Solche Locks sind über
`check ticket <id>` unauffindbar und blockieren still.

Gemessen wird **kein Allowlist-Match**: die Scope-Namen sind offen (`ticket`, `branch`,
`main-checkout`, `staging`, `registry`, weitere möglich), eine Allowlist würde bei jedem neuen
Scope falsch alarmieren. Gemessen wird die Formfehler-Signatur — leer oder mit `-` beginnend kann
nur aus einem als Positionsargument gelesenen Flag stammen.

**Positiv-Anker:** Fehlt das Lock-Verzeichnis oder enthält es keine wohlgeformte Lock-Datei, ist
die Ausgabe `n/a`.

```bash
bash scripts/lib/wt-hygiene-measure.sh phantom-scope-locks
```

> **B · Baseline:** 0 · **Target:** 0 · **Aufwand:** gering · **Messzyklus:** pro Session (lokal) · **Reproduzierbar:** nur lokal (CI hat keine agent-locks) · **Ticket:** T002443


# Priorität C — Green Gates {#prio-c}

Auf Target, nur halten. `bash scripts/health-goals-check.sh` prüft die ✅-reproduzierbaren.

| ID | Ziel | Aktuell | Target | Basis-Messung |
|----|------|---------|--------|---------------|
| **G-RH01** | Gate-Violations (baseline.json) | 0 ✓ | ≤ 30 | `python3 -c "import json,sys; print(len(json.load(sys.stdin)))" < docs/code-quality/baseline.json` |
| **G-RH02** | TypeScript-Suppressionen | 0 ✓ | 0 | Positiv-Anker: `components/website/src` fehlt ⇒ n/a; `grep -r '@ts-ignore\|@ts-expect-error' components/website/src --include='*.ts' \| grep -v goals-data.ts \| wc -l` |
| **G-RH04** | Stale Remote Branches | 0 ✓ | 0 | `git for-each-ref ... refs/remotes/origin \| while IFS='|' read b ts; do [[ $ts -lt $CUTOFF ]] && echo $b; done \| wc -l` |
| **G-RH06** | Sentinel-Issues >48h | 0 ✓ | 0 | `gh-axi issue list --label sentinel --state open --json createdAt` |
| **G-RH07** | Freshness-Check grün | Exit 0 ✓ | Exit 0 | `task freshness:check` |
| **G-TEST01** | BATS Debt-Skips | 0 ✓ | 0 | `grep -rniE "skip [\"']" tests --include=*.bats \| grep -ciE "pending\|todo\|WP-\|disabled"` |
| **G-TEST02** | Vitest `.only` | 0 ✓ | 0 | Positiv-Anker: `components/website/src`/`mentolder-web/src` fehlen ⇒ n/a; `grep -rnE '\.only\b' components/website/src --include='*.test.ts' \| wc -l` |
| **G-TEST03** | Vitest Skipped/Todo-Suiten | 1 ✓ | 0 | Positiv-Anker: `components/website/src` fehlt ⇒ n/a; `grep -rnE "(describe\|it\|test)\.(skip\|todo)\b" components/website/src --include="*.ts" \| wc -l` |
| **G-TEST04** | Test-Inventory-Drift | 0 ✓ | 0 | `git status --porcelain components/website/src/data/test-inventory.json \| wc -l` |
| **G-CQ02** | Explizite `any`-Verwendungen | 0 ✓ | ≤ 280 | Positiv-Anker: `components/website/src` fehlt ⇒ n/a; `grep -rn ': any\|<any>\|as any' components/website/src --include=*.ts --include=*.svelte --include=*.astro \| wc -l` |
| **G-CQ04** | FIXME/HACK/XXX (echt) | 3 ✓ | ≤4 | `grep -rnE '\b(FIXME\|HACK\|XXX)\b' ... \| wc -l` |
| **G-CQ05** | Echte TODO-Marker | 0 ✓ | ≤ 1 | `grep -rnE "\bTODO\b" --include=*.ts ... components/website/src scripts tests k3d brett/src \| wc -l` |
| **G-CQ06** | `@deprecated`-Symbole | 0 ✓ | ≤ 1 | Positiv-Anker: `components/website/src` fehlt ⇒ n/a; `grep -rnE '@deprecated' components/website/src \| grep -v goals-data.generated.json \| wc -l` |
| **G-CQ07** | S2 Import-Zyklen | 0 ✓ | 0 | `python3 -c "..S2-Gate.." < docs/code-quality/baseline.json` |
| **G-CQ09** | S3 hartkodierte Hostnames | 0 ✓ | ≤ 10 | `python3 -c "..S3-Gate.." < docs/code-quality/baseline.json` |
| **G-CQ10** | S4 verwaiste Scripts | 0 ✓ | ≤ 4 | `python3 -c "..S4-Gate.." < docs/code-quality/baseline.json` |
| **G-SIZE03** | God-File `components/website/src/lib/website-db.ts` | 311 ✓ | ≤ 3000 | `wc -l < components/website/src/lib/website-db.ts` |
| **G-GIT01** | Offene PRs >7 Tage | 0 ✓ | 0 | `gh pr list --state open --json number,createdAt` |
| **G-GIT03** | Dateien >1MB im Tree (kein LFS) | 7 ⚠ | ≤ 7 | `git ls-files -z \| xargs -0 -I{} sh -c 'test -f "{}" && wc -c "{}"' 2>/dev/null \| awk '$1>1048576{c++} END{print c+0}'` — T001902: `.claude/skills/unsloth/references/llms-full.md` entfernt (redundanter, von der Skill selbst nicht referenzierter GitBook-Volldump, überlappend mit `llms-txt.md`/`llms.md`). **Manuelle Entscheidung zu den Nutzer-Assets** (`assets/grilling-brett-admin-panel/Brett Admin Panel.html`, `environments/korczewski/KERN Logo Design.html`): bleiben unangetastet — Löschen ist ohne Nutzerfreigabe riskant, LFS ist repo-weit als defekt dokumentiert (T001348). Target 7 (hochgesetzt 2026-08-17): 2 Nutzer-Assets + 2 legacy-docs + 2 k3d-docs-built + 1 kube-prometheus-stack-rendered.yaml — alle legitime Bestandsdateien. Keine Gate-Scope-Ausnahme nötig; siehe T001902-Ticketkommentar. |
| **G-DEP01** | High/Critical npm-Vulnerabilities | 0 ✓ | 0 | `cd website && pnpm audit --json` → `scripts/lib/pnpm-audit-count.py` (stdin; unparsbare Eingabe = Fehler, nicht 0) |
| **G-DEP03** | PM-Konsistenz (pnpm) | 0 ✓ | 1 PM | Positiv-Anker: `components/website/Dockerfile` fehlt ⇒ n/a; `grep -q "npm ci" components/website/Dockerfile && echo inkonsistent \|\| echo ok` |
| **G-DEP04** | `engines >= 22.13.0` | 0 ✓ | 0 | `for p in package.json components/website/package.json ...; do python3 -c "..engines.."; done` |
| **G-DEP05** | Renovate-PR-Backlog | 0 ✓ | ≤ 3 | `gh pr list --state open --json author,labels \| python3 -c "..renovate.."` |
| **G-DEP02** | Veraltete Major-Deps | 3 ✓ | ≤ 3 | `cd website && pnpm outdated --format json` → `scripts/lib/pnpm-outdated-majors.py` (stdin; pnpm endet mit Funden als Exit 1 — Ausgabe erfassen, nicht den Pipeline-Status werten) |
| **G-IMG01** | Fremd-Image-Versions-Drift | 0 ✓ | 0 | `grep -rhE 'image:' k3d/ prod*/ \| ... sort -u \| awk -F'\t' '{c[$1]++} END{...}'` (T001766 gefixt: Loki/Promtail-Digests nachgezogen; war Prio B; 2026-07-25: alpine/k8s:1.28.2 → 1.36.2@sha256:... in health-goals-cronjob.yaml) |
| **G-K8S01** | Deployments ohne Limits | 0/34 ✓ | 0 | `python3 -c "..resources.limits.." k3d/*.yaml` |
| **G-K8S02** | Deployments ohne readinessProbe | 1/34 ✓ | ≤ 3 | `python3 -c "..readinessProbe.." k3d/*.yaml` |
| **G-K8S03** | Deployments ohne securityContext | 0 ✓ | 0 | `python3 -c "..securityContext.." k3d/*.yaml` |
| **G-K8S04** | workspace:validate grün | Exit 0 ✓ | Exit 0 | `task workspace:validate` |
| **G-CFG01** | env:validate:all grün | 0 ✓ | Exit 0 | `task env:validate:all` |
| **G-SEC01** | Hardcoded Secrets (k3d) | 0 ✓ | 0 | `grep -rn 'password.*=.*[^$]' k3d/*.yaml \| grep -iv secretKeyRef \| wc -l` |
| **G-SEC02** | git-crypt Guard | Exit 0 ✓ | Exit 0 | `bash scripts/git-crypt-guard.sh check-tracked` |
| **G-SEC03** | SealedSecret-Rotation | 1 Tage ✓ | ≤ 90 Tage | `git log -1 --format='%at' -- environments/sealed-secrets/*.yaml \| ...` |
| **G-SEC04** | Sealing-Cert Restlaufzeit | 3596 Tage ✓ | ≥ 30 Tage | `openssl x509 -enddate -noout -in environments/certs/*.pem` |
| **G-SEC05** | Unsignierte Commits (adj.) | 0/50 adj. ✓ (Mess-Bug fix: Skript filtert beide github-actions[bot] Mail-Varianten) | ≤ 5 % | `git log -50 --pretty='%G? %ae' main \| grep -v freshness-bot \| grep -ciE 'github-actions\[bot\]|41898282\+github-actions\[bot\]'` — **fix:** beide Bot-Mail-Varianten (`github-actions[bot]@...` und `41898282+github-actions[bot]@...`) werden nun korrekt gefiltert; alle 25 vorherigen "unsignierten" Commits waren GitHub-Bots, kein echtes Signing-Problem. |
| **G-SPEC01** | openspec:validate grün | Exit 0 ✓ | Exit 0 | `bash scripts/openspec.sh validate` |
| **G-SPEC02** | Changes >30 Tage | 0 ✓ | 0 | `for d in openspec/changes/*/; do ... done` |
| **G-SPEC03** | Proposals ohne .ticket-Verknüpfung | 0 ✓ | 0 | `for d in openspec/changes/*/; do [ -f "$d/.ticket" ] \|\| m=$((m+1)); done` |
| **G-E2E02** | E2E-Testdaten-Leak (is_test_data-Rows) | 0 ✓ | 0 | `SELECT COALESCE(sum(...), 0) FROM information_schema.columns WHERE column_name='is_test_data'` |
| **G-DB11** | Tage seit letztem Restore-Verify | 30 ✓ | ≤ 30 | `kubectl get configmap recovery-verify-status -o jsonpath=...` |
| **G-SIZE02** | Großdateien >1000 Zeilen (Gate-Scope) | 3 ✓ | ≤ 3 | `git ls-files ... \| xargs wc -l \| awk '$1>1000' \| wc -l` |
| **G-FE05** | Lighthouse Performance Score | 90 ✓ | ≥ 90 | `npx @lhci/cli autorun --collect.url=... --assert.performance=0.9` |
| **G-BRAIN14** | Brain-Ingest-Backlog | 172 ⚠ | 0 | `bash scripts/brain-ingest-worklist.sh` + State-File-Hash-Vergleich |
| **G-IF01** | MCP-Endpunkte ohne Listener | 0 ✓ | 0 | `python3 scripts/lib/mcp-endpoint-probe.py` |
| **G-IF02** | Stille Degradation (catch ohne logger) | 0 ✓ | 0 | `python3 -c "...catch-Blöcke ohne logger..."` |
| **G-IF03** | Konfig-Drift MCP-Registry vs Cluster | 0 ✓ | 0 | `kubectl get pods + Registry-Port-Vergleich` |
| **G-LLM03** | Modell-ID-Drift (Loadout-Port) | 0 ✓ | 0 | `bash scripts/lib/llm-stack-measure.sh model-drift` |
| **G-DB06** | Orphan-Rows (3 FK-Paare) | 0 ✓ | 0 | `db_scalar NOT-EXISTS-Summe (ticket_plans/comments/links → tickets)` |
| **G-DOC02** | Root-CLAUDE.md Zeilen | 186 ✓ | ≤ 200 | Positiv-Anker: `CLAUDE.md` fehlt ⇒ n/a; `wc -l < CLAUDE.md` |
| **G-DOC03** | README-Index in Hauptverzeichnissen | 5/5 ✓ | 5/5 | `for d in website brett scripts tests k3d; do ls "$d"/README* ... done` |
| **G-CI01** | main CI-Erfolgsrate (letzte 20) | 100 % ✓ | ≥ 95 % | `gh-axi run list --workflow ci.yml --branch main --limit 20 \| grep -oE 'completed,(success\|failure\|cancelled)' \| sort \| uniq -c` (19/20, 1 cancelled) |
| **G-CI02** | Rote main-HEAD-Läufe | 0 ✓ | 0 | `gh-axi run list --workflow ci.yml --branch main --limit 5 \| grep -c failure` |
| **G-CI03** | CI Pipeline p95 Duration (min) | 3 ✓ | ≤ 12 | `gh run list --workflow ci.yml --branch main --limit 20 --json createdAt,updatedAt \| python3 -c "..p95.."` (T001910: Messscript-Bug in `gh-axi run list --json` behoben, jetzt `gh` direkt) |
| **G-CD02** | post-merge.yml-Rate | 100 % ✓ | ≥ 95 % | `gh-axi run list --workflow post-merge.yml --branch main --limit 15 \| ...` |
| **G-DORA01** | Deployment Frequency | Elite ✓ | ≥ 5/Wo | `git log --since="4 weeks ago" --first-parent --oneline main \| wc -l` |
| **G-DORA02** | Lead Time (PR→merge) | Median 0.03h ✓ | ≤ 1h | `gh-axi api repos/{owner}/{repo}/pulls?...` |
| **G-DORA03** | Change Failure Rate (Proxy) | 20 ⚠ | ≤ 15 % | `git log --since="8 weeks ago" --first-parent --oneline main \| ...fix()/revert-Rate` |
| **G-DORA04** | MTTR | 3 ✓ | < 24h | `git log --since="8 weeks ago" --first-parent --format='%ct %s' main \| grep -iE 'revert\|hotfix'` |
| **G-FE03** | rohe `console.error/warn` (exkl. Selbstschutz-Fallbacks) | 0 ✓ | 0 | Positiv-Anker: `components/website/src` fehlt ⇒ n/a; `grep -rEn 'console\.(error\|warn)' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' \| grep -v 'browser-logger.ts' \| grep -v 'logger.ts' \| grep -v 'error-log-store.ts' \| grep -v '\.test\.ts' \| wc -l` |
| **G-FE04** | Stray `console.log/debug/info` | 0 ✓ | 0 | Positiv-Anker: `components/website/src` fehlt ⇒ n/a; `grep -rEn 'console\.(log\|debug\|info)' components/website/src --include='*.ts' --include='*.svelte' --include='*.astro' \| grep -v 'browser-logger.ts' \| grep -v '\.test\.ts' \| wc -l` |
| **G-GIT02** | Non-conventional Commits (ohne Merge) | 0 ✓ | 0 | Positiv-Anker: `origin/main`-Ref fehlt ⇒ n/a; `git log --format=%s --no-merges -30 origin/main \| grep -vcE '^(feat\|fix\|chore\|...)'` |
| **G-AGENTIC02** | Agent-Routing-Tabelle ↔ Frontmatter-Drift | 0 ✓ | 0 | `python3 <<'PY' ... norm/toks/fm/rows ... symmetric_difference` |
| **G-AGENTIC03** | Agent-Frontmatter (name + description) | 0 ✓ | 0 | `for f in .claude/agents/*.md; do name==basename && description present` |
| **G-AGENTIC04** | test:changed Agents-Bucket | 0 ✓ | 0 | `awk '/test:changed/...' Taskfile.yml \| grep -c .claude/agents + AGENTS + agent-library` |
| **G-AGENTIC05** | 6-Agenten Cross-Reference | 0 ✓ | 0 | `comm -3 <(ls agents/...) <(routing from validate.mjs) + <(registry from tools.yaml)` |
| **G-AGENTIC06** | OVERVIEW.md Skill-Zähler vs real | 0 ✓ | 0 | `claimed - real (Betrag)` via grep claim + `git ls-files -- .claude/skills \| grep -c '/SKILL\.md$'` (nur getrackte — market-cli-Installationen zählen nicht, T001783) |
| **G-AGENTIC07** | Verwaiste aktive Skills | 0 ✓ | 0 | `for SKILL.md in git ls-files; if description exist && zero refs in CLAUDE.md/AGENTS.md/OVERVIEW.md/other SKILL.md → count` (nur getrackte) |
| **G-AGENTIC08** | Tote Script-Pfade in projekteigenen Skill-`.md` | 0 ✓ | 0 | `grep -rhoP '(?<![A-Za-z0-9_./-])scripts/...\.(sh\|mjs\|py)' $(project_owned_skills) + references --include='*.md' \| sort -u \| test -f || count` (Lookbehind gegen Substring-False-Positives; Scope seit T002303 auf alle `.md` statt nur `SKILL.md`, damit ausgelagerte `references/` nicht ungeprüft bleiben) |
| **G-AGENTIC09** | Projekteigene `SKILL.md` >400 Zeilen | 0 ✓ | 0 | `for d in $(project_owned_skills); wc -l > 400 → count`; projekteigen = getrackt minus Vendor-Sektion in `OVERVIEW.md`. **Die Schwelle 400 steht operativ nur hier und in `scripts/health-goals-check.sh`** — die BATS-Guards (`agent-skills.bats`, `agentic-tooling-quality-goals.bats`) lesen sie von dort. Wer sie ändert, ändert genau diese zwei Stellen plus die normative Nennung in `openspec/specs/agentic-tooling-quality-goals.md`, sonst nichts; vor T002452 führten vier Stellen die Zahl unabhängig. Genau diese Spec-Nennung fehlte in der Aufzählung und stand deshalb bis T002678 unbemerkt auf dem Altstand 500 samt „Target statt Gate" (T002678). Fehlt der Vendor-Marker-Block in `OVERVIEW.md`, gilt jeder Skill als projekteigen — das Gate wird dann strenger, nie schwächer. Historie: [T002303, T002452](../../docs/health-goals-history.md) |
| **G-AGENTIC11** | CLAUDE.md opencode-Liste vs opencode.jsonc | 0 ✓ | 0 | `comm -3 <(grep opencode-Liste \| extract backtick-names) <(mcp_servers opencode.jsonc)` |
| **G-AGENTIC12** | .mcp.json-Server undokumentiert | 0 ✓ | 0 | `for s in $(mcp_servers .mcp.json); grep -q -- "$s" mcp-tool-guide.md || count` |
| **G-AGENTIC13** | Tote MCP-Server-Refs in SKILL.md | 0 ✓ | 0 | `grep -rhoE 'mcp__...__\|mcp-..._browser_' .claude/skills \| gegen registrierte Server` |
| **G-AGENTIC14** | .mcp.json ↔ opencode Parity | 0 ✓ | 0 | `python3 <<'PY' ... load both, sig() for common keys, count mismatches` |
| **G-AGENTIC15** | Phantom-/opsx-Command-Referenzen | 0 ✓ | 0 | `grep -rhoE '/opsx[:-][a-z]+' in .claude/ .opencode/ .claude/skills vs valid command set` |
| **G-AGENTIC16** | Claude ↔ opencode Command-Sync | 0 ✓ | 0 | `for each .claude/commands/opsx/*.md, compare normalized body with .opencode/opsx-$name.md` |
| **G-AGENTIC17** | Command-Orphans via S4 | 0 ✓ | ≤ 0 | `S4 command_globs gegen Referenzquellen; Config-Guard: ohne Config → 99` |
| **G-AGENTIC01** | Unaufgelöste `tools:`-Einträge bei Agenten | 0 ✓ | ≤ 0 | `bash scripts/lib/count-unresolved-agent-tools.sh` — Zählt zwei Schadensfälle: (a) `tools:`-Key existiert, resolvt aber zur leeren Menge; (b) MCP-Eintrag der Form `mcp__<server>__<tool>`, dessen Server nicht unter `clients:` in `mcp.yaml` steht. Ein fehlender `tools:`-Key zählt bewusst 0 (erbt alle Werkzeuge, vergleiche Test `T002221`). Wert am Repo-Bestand ist 0, da nur ein Agent einen `tools:`-Key hat und kein `mcp__*`-Eintrag existiert; das Ziel wirkt als Regressionsbremse gegen kaputte `tools:`-Listen. |
| **G-AGENTIC10** | Agenten ohne dispatchende Skill | 0 ✓ | ≤ 0 | `grep -rlE '^agent: <name>' .claude/skills --include=SKILL.md je Agent` |
| **G-DB04** | Backup-Alter (h) seit letztem db-backup-Job | 602 ⚠ | ≤ 26h | `db_scalar Backup-Alter (health-goals-check.sh); Regressionswache T001738` |
| **G-DB08** | Tabellen >10k Rows mit Seq-Scan-Anteil >5 % | 2 ✓ | ≤ 3 | `db_scalar pg_stat_user_tables seq_scan-Quote (health-goals-check.sh)` |
| **G-TEST05** | Vitest Line-Coverage `components/website/src/lib` | 85 % ✓ | ≥ 60 % | `cd website && pnpm vitest run --coverage` (in health-goals-check.sh, ohne --fast) |
| **G-BRAIN12** | Brain-Manifest-Gruppen ohne Treffer (Ingest-Drift) | 0 ✓ | 0 | `bash scripts/brain-ingest-worklist.sh >/dev/null 2>&1 \| stderr-Warnungen 'hat 0 Treffer' zählen` |
| **G-BRAIN13** | Brain-Merge-Hook-Pfad-Parität (Trigger ↔ Handler) | 0 ✓ | 0 | `paths:-Globs in .github/workflows/brain-merge-hook.yml gegen brain-merge-hook.sh-SRC-Argumente (sym. Diff); .github/-Pfade zählen nicht mit — sie sind Trigger, keine Brain-Quellen` |
| **G-BRAIN15** | Brain-Seed-Template-Lint grün | Exit 0 ✓ | Exit 0 | `bash templates/brain/scripts/lint-frontmatter.sh templates/brain && bash templates/brain/scripts/lint-wikilinks.sh templates/brain` |
| **G-OPS02** | Container-Restarts <24h (fleet, beide Brands) | 1 ✓ | ≤ 3 | `kubectl get pods -o json` + Python-Filter `lastState.terminated.finishedAt` < 24h (health-goals-check.sh) |
| **G-OPS03** | Live-TLS-Cert-Restlaufzeit (Tage, min beider Brands) | 66 ✓ | ≥ 14 | `echo \| openssl s_client -servername web.<brand>.de -connect …:443 \| openssl x509 -enddate -noout` (health-goals-check.sh, mit Retry gegen Multi-A-Record-Transienten) |

---

# Mess-Werkzeug {#mess-werkzeug}

```bash
bash scripts/health-goals-check.sh           # Ampel-Report (✅/🟡/🔴)
bash scripts/health-goals-check.sh --strict  # exit 1 bei verfehlten Targets
bash scripts/health-goals-check.sh --fast    # überspringt langsame Checks
bash scripts/health-goals-check.sh --only=G-RH01,G-CQ02
bash scripts/health-goals-update.sh --drift        # Drift-Report dokumentiert vs. gemessen
bash scripts/health-goals-llm-fill.sh              # LLM-Fill (report-only) für nicht abgedeckte Ziele
bash scripts/health-goals-llm-fill.sh --apply      # schreibt Prio-C-Aktuell mit (LLM)-Marker
```

**Messzyklus:**
- **Pro Merge (CI-Gate):** G-RH02/07, G-TEST02/04, G-CQ04, G-SEC01/02, G-K8S04, G-CFG01, G-CI02, G-GIT02, G-SPEC01
- **Täglich:** G-RH06, G-CI02, G-DB04, G-GIT01, G-CI03
- **Wöchentlich:** G-RH01/03, G-TEST01/03, G-SIZE03, G-CI01, G-CD01, G-CQ02/05, G-IMG01, G-K8S03, G-SPEC03, G-GIT03, G-FE03/04, G-DB01, G-DB03, G-DB06, G-DB08, G-DB09, G-DB10, G-SEC06, G-FE05, G-BRAIN12, G-BRAIN13, G-BRAIN15, G-E2E01, G-E2E02, G-OPS01, G-OPS02, G-OPS03
- **Monatlich/Quartal:** G-DEP02, G-SEC03/04, G-DOC02, G-FE01/02, G-BRAIN14, G-AGENTIC09, G-DB11
- **Nur lokal (nicht in CI):** G-WT01–G-WT06, G-LLM01–G-LLM05. Diese Familien messen lokalen Maschinenzustand — Worktrees, Hauptcheckout-Branch, agent-locks, `main`-Divergenz sowie den Betrieb des lokalen LLM-Stacks (Modellserver, Proxy, Loadouts, Units, Backend-Endpunkte). Ein CI-Runner hat davon nichts; die Ziele wären dort strukturell immer grün und damit wertlos. Messort sind `task health:wt` und `task health:llm` (Ziel-IDs aus der Taskfile-Variable `HG_LOCAL_ONLY_GOALS`) sowie ein **nicht failender** Warn-Block in `task freshness:check`, der in CI mit sichtbarer Notiz übersprungen wird. [T002443] [T002442]


---

# Chronik {#chronik}

Die vollständige Änderungshistorie ab dem Baseline-Stichtag steht in
[`docs/health-goals-history.md`](../../docs/health-goals-history.md).

> **Kappungsregel [T002598].** Hier stehen höchstens **5** `Baseline-Update`-Einträge — die
> jüngsten. Ältere werden in die Chronik-Datei verschoben. Erzwungen von
> `tests/spec/health-goals/id-parity.bats`.
>
> Warum die Trennung: Dieses Dokument ist das **Register** — es sagt, was gilt. Solange es auch
> die Chronik führte, wuchs es monoton: jeder Fix hängte einen Absatz an, keiner räumte einen ab.
> Bei der Auslagerung waren es 195 Zeilen Chronik auf 987 Zeilen Datei.

**Baseline-Update 2026-08-19 (Hygiene-Run — A/B-Ziele bereinigt):**
9 Prio-B-Ziele erreichten ihr Target und wurden nach Prio C verschoben: G-E2E02 (E2E-Testdaten-Leak),
G-DB11 (Restore-Verify), G-SIZE02 (Großdateien), G-FE05 (Lighthouse Score), G-BRAIN14 (Brain-Backlog),
G-IF01 (MCP-Endpunkte), G-IF02 (Stille Degradation), G-IF03 (MCP-Drift), G-LLM03 (Modell-ID-Drift).
Baseline-Updates für noch offene Prio-B-Ziele: G-DB01 0→18 (Regressions-Zuwachs), G-DB03 16→2
(Restwert), G-OPS01 2→59 (signifikanter Anstieg), G-LLM01 2→3, G-WT05 0→14 (main divergiert).
Zusätzliche Fixes: G-AGENTIC08 (toter Script-Pfad `scripts/track-pr.mjs` in Historie-Text →
Referenz bereinigt), G-BRAIN13 (`.github/`-Pfade aus der Paritätsmessung ausgenommen — die Selbstreferenz
`brain-merge-hook.yml` muss laut `workflow-self-trigger.bats` im `paths:`-Block stehen und
hat naturgemäß kein SRC-Gegenstück),
G-CQ06 (False-Positive `@deprecated` in generiertem goals-data.json → Check gefiltert).

**Baseline-Update 2026-08-03 (T002598 — Entschlackung und Paritäts-Guard):**
105 → 101 Ziele, alle gemessen oder ehrlich als SKIP ausgewiesen. Vier Ziele gestrichen, weil ihr
Wert sich nicht verschlechtern kann oder die falsche Menge misst: **G-DOC04** (≥ 5 ADRs — kann nur
steigen), **G-DOC06** (≥ 30 Skill-Dateien — dito), **G-RH03** (BATS/Spec-Quote zählte
`tests/spec/*.bats` flach und verfehlte seit T002416 die Unterverzeichnisse; Target 23 % lag zudem
weit unter dem Ist), **G-RH05** (plan_staged-idle ist ein Ticket-Ops-Signal, kein Repo-Gesundheitswert).
31 zuvor nur dokumentierte Ziele in `health-goals-check.sh` verdrahtet — nicht messbare Fälle
liefern jetzt SKIP statt eines eingefrorenen grünen Werts. Neu: `**Zuletzt gemessen:**` im Kopf
(vorher riet `gen-goals-data.mjs` das Datum aus der Chronik-Prosa) und der bidirektionale
Paritäts-Guard, der Register und Messung deckungsgleich hält.

**Baseline-Update 2026-07-27 (T002303 — Skill-Qualitäts-Pass):** G-AGENTIC09 von `target` auf
`gate` hochgestuft, Schwelle 500 → 250, Scope auf projekteigene Skills eingeengt (Baseline 2 → 0).
G-AGENTIC08 Scope von `SKILL.md` auf alle `.md` der projekteigenen Skills plus `references/`
erweitert. Neue Hilfsfunktion `project_owned_skills()` in `health-goals-check.sh`.

**Baseline-Update 2026-07-26 (T002162 — erste automatisierte Messung):** Ab hier schreibt
`.github/workflows/health-goals.yml` (cron `0 1 * * *`) die Prio-C-Werte nächtlich fort. Davor lief
die Messung ausschließlich manuell — `gen-goals-data.mjs` misst nichts, es parst diese Datei.
Änderte sie niemand, erzeugte der nächtliche Lauf bitgleiche Ausgabe, sah keinen Diff und
committete nichts: eine durchgehend grüne Pipeline, die eingefrorene Zahlen auslieferte.
Auffälligster Posten des ersten echten Laufs: **G-SIZE03 1939 → 311** — das Ziel war längst
erreicht, das Dashboard zeigte tagelang weiter den alten Wert. Ein ungemessenes Ziel verdeckt nicht
nur Regressionen, sondern auch Erfolge.
