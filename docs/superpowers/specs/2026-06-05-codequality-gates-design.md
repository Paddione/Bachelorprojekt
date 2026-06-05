# SP1 — Code-Quality-Gate-Backbone (Checker + Registry + Factory-Loop)

**Datum:** 2026-06-05
**Branch:** `feature/codequality-gates`
**Programm-Kontext:** Erstes Sub-Projekt eines mehrteiligen Code-Quality-Programms. Ziel des Gesamtprogramms: indexierbares, drift-freies Repo (50k-Token-Overview L1, 100% Registry L2, Coverage C1–C4, Struktur-Gates S1–S4) mit einem Loop, der einen informierten Agenten so lange anstößt, bis alle Gates grün sind.

## Scope dieses Sub-Projekts (SP1)

SP1 baut den **Backbone**, in den alle späteren Gates nur noch eingesteckt werden:

- **L2** — generierte `repo-index.json` + CI-Drift-Wächter (Muster: `agent-guide` / `test-inventory`).
- **C4** — Owner-Zuordnung (genau ein Agent pro Modul, keine Waisen/Doppel), erzwungen durch Scan-Cross-Check im Generator.
- **S1–S4** — Struktur-Linter, die heute schon über Bestandscode laufen.
- **Checker** — `task quality:check`, aggregiert alle Gates, Ratchet gegen `baseline.json`.
- **Loop** — `task quality:loop`, enqueued pro rotem (Gate × Subsystem) ein Factory-Ticket, gedrosselt + dedupliziert; nächtlicher Cron.

**Nicht in SP1** (eigene Folge-Spezifikationen): C1 (CONTEXT.md-Fan-out) + L1-Token-Budget-Gate → SP2; C2 (API-Manifest) → SP3; C3 (requirement→test) → SP4. Der Gate-Kontrakt (s.u.) ist so entworfen, dass diese später ohne Änderung an `check.mjs` andocken.

## Designentscheidungen (im Brainstorming festgenagelt)

1. **Index-SSOT:** kuratierte YAML-Registry + Scan-Enforcement (nicht auto-abgeleitet). Löst die mixed-owner-Mehrdeutigkeit (`scripts/`, `brett/`, `mcp-browser/`) explizit.
2. **Baseline-Politik:** Baseline + Ratchet („no new sins"). Ist-Stand wird eingefroren; CI failt nur bei NEUEN Verletzungen. Loop arbeitet die baseline monoton auf 0 ab.
3. **Loop-Granularität:** ein Ticket pro (Gate × Subsystem), gedrosselt (`MAX_NEW=2`/Lauf), dedup via Titel-Marker `CQ-GATE:`, self-planning (Factory scoutet+plant selbst).
4. **Index-Ausgabeort:** `docs/code-quality/repo-index.json` (Repo-Infra, kein Website-Datum).
5. **Cron:** nächtlicher geplanter Lauf von `task quality:loop` ab SP1.

## Architektur

```
docs/code-quality/
  subsystems.yaml        SSOT (handgepflegt): je Subsystem {id, name, paths[], owner_agent, test_location, purpose}
  gates.yaml             Gate-Konfig: S1-Limits pro Datei-Endung, code_roots + ignore_globs (Scan-Universum), S3-Scope+Allowlist, S4-Referenzquellen
  baseline.json          eingefrorene bekannte Verletzungen (ratchet schrumpft auf 0)
  repo-index.json        GENERIERT, kompakt, grepbar

scripts/code-quality/
  load.mjs               YAML laden (Wrapper, wie scripts/agent-guide/load.mjs)
  validate.mjs           fail-closed: owner ∈ {6 Routing-Agenten}, keine doppelten Pfade, paths existieren, gates.yaml valide
  emit-index.mjs         scannt das Scan-Universum (git ls-files ∩ code_roots − ignore_globs), cross-check auf Datei-Ebene: jede getrackte Code-Datei ∈ genau EINEM Subsystem → sonst throw (C4 + L2-Quelle)
  check.mjs              lädt baseline, läuft alle Gates, NEW = current − baseline → exit≠0 nur bei NEUEN (ratchet)
  baseline-refresh.mjs   dampft FIXED-Einträge explizit aus baseline.json ein (vom Fix-PR mitcommittet)
  loop.sh                gruppiert baseline nach (Gate × Subsystem), dedup gegen offene 'CQ-GATE:'-Tickets, enqueued ≤MAX_NEW
  gates/
    s1-filesize.mjs      getrackte Dateien > endungs-spezifischem Limit (gates.yaml)
    s2-cycles.mjs        madge --circular je TS-Graph (website, arena-server, e2e) → Zyklen, Key pro Graph
    s3-hostnames.mjs     hartkodierte Hostnames außerhalb configmap-domains.yaml
    s4-orphans.mjs       Manifeste/Scripts ohne Referenz in Taskfile/kustomize/docs
```

### Gate-Kontrakt (Plug-in-Fähigkeit)

Jedes Gate-Skript unter `gates/` gibt auf stdout JSON aus. Jede Verletzung trägt einen **stabilen `key`** (Identität fürs baseline-Diffing) und ein **maschinenvergleichbares numerisches `metric`** (Schweregrad fürs Worsening-Diffing):

```json
{ "gate": "S1", "status": "pass|fail", "violations": [ { "key": "S1:website/src/pages/foo.astro", "path": "website/src/pages/foo.astro", "metric": 612, "detail": "612 Zeilen > 400" } ] }
```

`metric` ist das einzige Feld, das `check.mjs` für „verschlimmert" vergleicht; `detail` bleibt rein menschenlesbar. `check.mjs` ruft alle `gates/*` auf und aggregiert nur — neue Gates (C1/C2/C3 in SP2–SP4) werden durch Ablegen eines neuen `gates/*`-Skripts ergänzt, ohne `check.mjs` zu ändern.

#### Per-Gate-Key- und -Metric-Ableitung (verbindlich)

| Gate | `key` | `metric` (höher = schlimmer) |
|------|-------|------------------------------|
| S1 | `S1:<pfad>` | Zeilenzahl |
| S2 | `S2:<graph>:<canon>` — `canon` = lexikografisch kleinste Rotation des **sortierten** Zyklus-Member-Sets; `graph` = TS-Projekt (`website`/`arena-server`/`e2e`), damit Zyklen verschiedener Apps nicht kollidieren | Anzahl Zyklus-Member |
| S3 | `S3:<pfad>:<host>` | 1 (binär; Worsening n/a) |
| S4 | `S4:<pfad>` | 1 (binär; Worsening n/a) |

Beispiele:
```json
{ "gate": "S2", "status": "fail", "violations": [ { "key": "S2:website:a.ts|b.ts|c.ts", "metric": 3, "detail": "Zyklus a→b→c→a" } ] }
{ "gate": "S4", "status": "fail", "violations": [ { "key": "S4:k3d/foo.yaml", "metric": 1, "detail": "kein Referenz-Treffer in Taskfile/kustomize/docs" } ] }
```

Der `key` ist rotations- und reihenfolge-invariant (S2 sortiert + kanonisiert), damit ein wachsender Zyklus nicht als FIXED+NEW zerfällt, sondern als dieselbe Verletzung mit gestiegenem `metric`.

### Scan-Universum (verbindlich für C4, S1–S4, emit)

Alle Gates und der emit-Cross-Check operieren auf **einem** Universum, nie auf einem rohen `os.walk`:

```
scan_set = git ls-files                      # nur getrackte Dateien → schließt node_modules/, dist/, .astro/ etc. via .gitignore aus
           ∩ unter einem gates.yaml `code_roots`-Präfix
           − gates.yaml `ignore_globs`        # z.B. **/*.lock, generierte/seed-Dateien, top-level Konfig-Einzeldateien
```

- **Granularität: Datei-Ebene.** Die C4-Zuordnung gilt pro getrackter Datei (nicht pro Verzeichnis), damit ein geteiltes Verzeichnis wie `scripts/` per Glob auf mehrere Subsysteme aufgeteilt werden kann (`scripts/migrations/**` → scripts-db, Rest → scripts-infra). Subsystem-`paths[]` sind Globs; jede Datei muss von **genau einem** Subsystem-Glob getroffen werden. Das löst den früheren dir-vs-file-Widerspruch auf.
- **`node_modules` & Vendored:** durch „nur git ls-files" automatisch ausgeschlossen — kein Sonderfall, kein Baseline-Rauschen durch Fremdcode.
- **`code_roots`** ist die Allowlist scanbarer Top-Level-Präfixe; alles außerhalb (z.B. `.github/`, reine Prosa unter `docs/`) ist per Definition out-of-scope und löst keinen C4-Throw aus. Ein Test (`emit-index.test.mjs`) fixiert: emit über echtes HEAD wirft nicht.

### C4 & L2 sind keine eigenen Gate-Skripte

Beide fallen aus `emit-index.mjs` + CI-Drift heraus:
- **L2-Drift:** `task quality:index` regeneriert `repo-index.json` (byte-deterministisch, **ohne** Timestamp — sonst spurious Drift); CI prüft `git diff --exit-code`.
- **C4:** `emit-index.mjs` scannt das Scan-Universum (s.o.) und wirft, sobald eine getrackte Code-Datei in keinem oder mehr als einem Subsystem auftaucht. Coverage = 100%, keine Waisen, keine Doppelzuordnung — by construction.

## Datenfluss

```
subsystems.yaml + gates.yaml ──load.mjs──> validate.mjs (fail-closed)
                                                 │
                          FS-Scan ───────────────┤
                                                 ▼
                                          emit-index.mjs ──> repo-index.json
                                                                  │
gates/* ──JSON──> check.mjs <── baseline.json                     │
                     │                                             │
              NEW vs baseline                                      │
                     ▼                                             ▼
              CI exit 0/≠0                                  CI git diff --exit-code
                                                            (L2-Drift)

baseline.json ──> loop.sh ──(gruppieren Gate×Subsystem, dedup, drosseln)──> ticket.sh create+enqueue ──> Factory-Dispatcher
```

## Baseline-Ratchet-Mechanik

- `baseline.json` = Map `key → { gate, path, metric, detail-Snapshot, frozen_at }` für jede bekannte Verletzung.
- `check.mjs` berechnet die CI-blockierende Menge als **Vereinigung zweier Regeln**:
  - **Neu:** `key ∈ current \ baseline` (Verletzung, die es zuvor nicht gab).
  - **Verschlimmert:** `key ∈ (current ∩ baseline)` mit `current.metric > baseline.metric` (z.B. Datei wächst 612 → 650 Zeilen, Zyklus 3 → 4 Member). Ein reiner Key-Set-Diff erkennt das **nicht** — dafür ist der `metric`-Vergleich da. Gates mit binärem `metric` (S3/S4) können sich nicht „verschlimmern".
  - CI failt, sobald diese Vereinigung nicht leer ist.
- `FIXED = baseline_keys \ current_keys` → **nicht** automatisch entfernt. `task quality:baseline:refresh` entfernt sie explizit (und schreibt gesunkene `metric`-Werte fort); der Factory-Fix-PR committet das mit. So zieht der Ratchet monoton auf 0.

## Loop-Betrieb

- `task quality:loop` ist **idempotenter Top-up**, kein Block-Loop.
- Ablauf: baseline lesen → nach (Gate × Subsystem) gruppieren → offene Tickets mit Marker `CQ-GATE:<gate>:<subsystem>` ermitteln → nur fehlende, gedrosselt auf `MAX_NEW=2`, enqueuen.
- Pro Ticket: `ext_id=$(ticket.sh create --type feature --brand mentolder --title "CQ-GATE:S1:website — N Dateien kürzen" --description "<gerenderte Violation-Key-Liste>" --priority mittel | cut -d'|' -f1)` + `ticket.sh enqueue --id "$ext_id"` (self-planning, kein Plan-Reuse). `--description` ist Pflicht (sonst exit 2 → null Tickets); `create` gibt `external_id|id` auf stdout aus.
- Brand: `mentolder` (geteilter Repo-Code, ein Brand genügt).
- „Loop bis grün" = periodisches Nachfeuern bis baseline leer → enqueued dann nichts mehr.

### Cron

Nächtlicher geplanter Lauf via GitHub-Actions-Workflow `.github/workflows/quality-loop.yml`: `schedule:`-Trigger wie `dev-smoke.yml`, KUBECONFIG-Setup (base64-`FLEET_KUBECONFIG` → `~/.kube/config`) wie `build-website.yml`; der eigentliche DB-Schreibzugriff wird an `ticket.sh` delegiert (`kubectl exec -c postgres -- psql`, nicht im Workflow selbst). Der Factory-Dispatcher (separater `/loop`) greift die Tickets ab — siehe Drain-Kopplung unter „Offene Punkte".

## CI-Verdrahtung

Neue Steps im bestehenden `offline-tests`-Job (`.github/workflows/ci.yml`):
1. `task quality:index` + `git diff --exit-code docs/code-quality/repo-index.json` (L2-Drift; analog test-inventory).
2. `task quality:check` (Ratchet: failt nur bei NEUEN Verletzungen).
3. `validate.mjs` läuft implizit in (1) (emit ruft validate fail-closed auf).

## SP1-Phasierung (Slice A / Slice B)

SP1 wird in **zwei sequentiellen PRs** gelandet (squash-merge, je grünes CI), nicht als ein Block — das de-riskt die Bootstrap-Ordnung (Loop-Fix-PRs müssen das frisch eingeführte Gate selbst passieren) und macht den riskanten Loop-Teil separat reviewbar:

- **Slice A — Gates & Ratchet (read-only, kein Enqueue):** `subsystems.yaml` + `gates.yaml` + `load.mjs` + `validate.mjs` + `emit-index.mjs` (+ L2-Drift-CI) + die 4 Gate-Skripte S1–S4 + `check.mjs` + `quality:baseline:freeze` + der CI-Ratchet-Step. Muss beweisbar grün sein (emit wirft nicht über echtes HEAD, check failt nicht gegen frische baseline), **bevor** irgendetwas Tickets erzeugt.
- **Slice B — Loop & Cron:** `loop.sh` + `quality:baseline:refresh` + der `quality-loop.yml`-Cron. Wird erst gelandet, wenn die Gates aus Slice A auf einem echten Freeze stabil sind. `baseline:refresh` ist verpflichtender Output jeder Factory-Fix-PR; CI assertet, dass ein `CQ-GATE:`-PR die baseline **verkleinert**, nie vergrößert.

## Taskfile-Targets

| Task | Zweck |
|------|-------|
| `quality:index` | regeneriert `repo-index.json` (ruft validate + emit) |
| `quality:check` | läuft alle Gates, Ratchet gegen baseline |
| `quality:baseline:freeze` | initiales Einfrieren des Ist-Stands (einmalig bei Einführung) |
| `quality:baseline:refresh` | entfernt FIXED-Einträge aus baseline |
| `quality:loop` | enqueued gedrosselt Factory-Tickets pro rotem Gate×Subsystem |

## Testing

BATS + node (nach Repo-Konvention, `tests/` + `scripts/code-quality/*.test.mjs`):
- `validate.mjs`: fail-closed bei unbekanntem owner, doppeltem Pfad, fehlendem Pfad, invalider gates.yaml.
- `emit-index.mjs`: Determinismus (2× identisch, byte-stabil **ohne** Timestamp); wirft bei verwaister/doppelt zugeordneter Datei (C4); **wirft nicht** über echtes Repo-HEAD (Coverage = 100%).
- Jedes Gate (`s1`–`s4`): Erkennung auf Fixtures (ein verletzendes + ein sauberes Sample); JSON-Kontrakt-Form inkl. stabilem `key` + numerischem `metric` (S2-Key rotations-/reihenfolge-invariant).
- `check.mjs`: Ratchet — NEW failt, bekannte baseline failt nicht, verschlimmerte bekannte (gestiegenes `metric`) failt.
- `loop.sh`: Dedup (kein Doppel-Ticket bei offenem CQ-GATE-Marker), Drosselung (≤MAX_NEW). Factory-Enqueue gemockt/dry-run.

## Subsystem-Universum (Startpunkt für subsystems.yaml)

Aus der Exploration; Owner-Spalte verbindlich für C4 (mixed-Fälle explizit aufgelöst):

| Subsystem | Pfade (Globs, Datei-Ebene) | Owner-Agent |
|-----------|----------------------------|-------------|
| website | `website/**` (außer `website/test/**`, `website/tests/**` → tests, per Glob-Priorität) | `bachelorprojekt-website` |
| infra-manifests | `k3d/**`, `prod/**`, `prod-fleet/**`, `prod-mentolder/**`, `prod-korczewski/**`, `environments/**`, `k3s/**`, `deploy/**`, `wireguard/**`, `docker/**`, `mcp-browser/**`, `claude-code/**` | `bachelorprojekt-infra` |
| tests | `tests/**`, `website/test/**`, `website/tests/**` | `bachelorprojekt-test` |
| scripts-infra | `scripts/**` (Rest nach den scripts-db-Globs) | `bachelorprojekt-infra` |
| scripts-db | `scripts/migrations/**`, `scripts/datamodel/**` + handgeprüfte DB-Dateien (exakte Globs bei Erstbefüllung, per emit-Cross-Check verifiziert) | `bachelorprojekt-db` |
| brett | `brett/**` | `bachelorprojekt-website` |
| arena-server | `arena-server/**` | `bachelorprojekt-infra` |
| openclaw | `openclaw/**` | `bachelorprojekt-infra` |
| assets | `assets/**`, `art-library/**` | `bachelorprojekt-website` |
| pentest | `pentest-dashboard/**` | `bachelorprojekt-security` |

> Hinweis: `scripts/` ist real cross-cutting und wird auf **Datei-Ebene** per Glob aufgeteilt (siehe Scan-Universum). **Namens-Globs sind fragil** — `scripts/migrate-docs-style.mjs` (Docs, nicht DB) und `scripts/db-schema-diagram.py` (Mermaid-Diagramm, nicht DB) würden ein naives `*migrat*`/`*db*` fehlrouten. Beim Erstbefüllen daher pro Datei prüfen (lieber Subdir-/Pfad-Globs als Namens-Globs) und durch den emit-Cross-Check verifizieren. Die einzigen **6 gültigen Owner** sind die Routing-Agenten `bachelorprojekt-{website,infra,test,db,ops,security}` (`validate.mjs` failt fail-closed bei jedem anderen Wert — `claude-code/` läuft daher unter `bachelorprojekt-infra`, nicht unter einem Pseudo-Owner).

## Offene Punkte für die Plan-Phase (Muss-Liste aus dem Spec-Review)

> Stand: B1–B3 (Scan-Universum, Gate-Kontrakt-`metric`, per-Gate-Key) sind oben im Spec gelöst. Die folgenden Punkte sind im Plan verbindlich zu schließen.

**Registry & Scan:**
- Vollständige `subsystems.yaml` so befüllen, dass `emit-index.mjs` über echtes HEAD **nicht** wirft (Test als Akzeptanzkriterium). Exakte `scripts/`-Globs (Datei-Ebene, Subdir-/Pfad-Globs statt fragiler Namens-Globs), `code_roots` + `ignore_globs` festnageln. Generierte/seed-Dateien (z.B. `website/src/lib/system-test-seed-data.ts`) und top-level Einzeldateien (`task.sh`) explizit zuordnen oder ignorieren.

**Gates:**
- **S1:** Pro-Endung-Limits in `gates.yaml` festlegen (.astro / .ts / .svelte / .sh / .mjs …). Optionale S1-Ignore-Liste für genuin unteilbare/generierte Dateien, damit der Loop keine un-actionable Tickets erzeugt.
- **S2:** `madge` als **root**-devDependency ergänzen (CI `npm ci`t root); per-Graph-Invocation für `website` (mit `website/tsconfig.json`), `arena-server`, `tests/e2e`; ohne Netz lauffähig. (`brett` ist CommonJS-JS, kein TS-Graph.)
- **S3:** Scope auf `k3d/`, `prod*/`, `website/src/` begrenzen (NICHT `docs/`, `tests/`, `*-content-built/`, `*.md`); „hardcoded" definieren (String-Literal, kein Kommentar); `gates.yaml`-Allowlist-Format + Seed. Beachten: echte prod-Domains leben in `environments/*.yaml` + prod-Overlays — `configmap-domains.yaml` hält nur `*.localhost`.
- **S4:** Referenzquellen-Auflösung inkl. **transitiver** `source`/`bash`-Aufrufe innerhalb `scripts/` (sonst lesen dynamisch via `$VAR` gesourcte Helfer wie `keycloak-helpers.sh` als Waisen); `gates.yaml`-Allowlist für bewusst-separat-deployte Manifeste (office/coturn). Alternativ S4-Scope verkleinern oder in eine spätere SP verschieben.

**Loop & Tickets:**
- Dedup-Read: `ticket.sh` hat **kein** `list`-Kommando → entweder `ticket.sh list` ergänzen oder `loop.sh` macht ein eigenes `kubectl exec psql`-SELECT (wie `scripts/factory/queue.sh`). Match per `title LIKE 'CQ-GATE:<gate>:<subsystem>%'` (Präfix, variables `N` ignorieren); „offen" = `status NOT IN ('done','archived')`.
- Conflict-Check: gleich-Subsystem-Tickets (S1:website + S3:website) fassen dieselben Dateien an → entweder grobes `touched_files` (Subsystem-Pfad) bei create/enqueue setzen, damit der Dispatcher serialisiert, oder Rebase akzeptieren — explizit entscheiden.

**Cron & Betrieb:**
- Cron-Workflow: schedule-Trigger aus `dev-smoke.yml`, KUBECONFIG-Setup aus `build-website.yml` (base64 `FLEET_KUBECONFIG`), DB-Write delegiert an `ticket.sh` (`kubectl exec -c postgres -- psql`, **nicht** in `build-website.yml`). `TICKET_CTX=fleet` muss zum dekodierten Kontext passen (Guard `kubectl config current-context`).
- Drain-Kopplung: Der Dispatcher ist **kein** Daemon — Tickets werden nur abgearbeitet, wenn ein user-seitiges `/loop` läuft. Erwarteten Drain-Horizont (MAX_NEW=2/Nacht → ~5–10 Nächte nur fürs initiale Enqueue, Abbau über Wochen bei 3 globalen Slots) im Plan dokumentieren; ggf. Backlog-Cap/Alert erwägen. CI-erzeugte `CQ-GATE:`-Tickets sind echte prod-Tickets (`is_test_data=false`, sonst 6h-Purge) und erscheinen in `/admin/tickets` + Factory-Metriken — der `CQ-GATE:`-Marker diskriminiert sie.
