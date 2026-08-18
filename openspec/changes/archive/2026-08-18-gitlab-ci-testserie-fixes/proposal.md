# Proposal: gitlab-ci-testserie-fixes

## Why

Die GitLab-CI-Pipeline (T011790, PR #4724) fährt die **volle** Testmenge statt der
diff-skopierten Auswahl von GitHub Actions. Dabei sind 8 vorbestehende Fehlschläge in
`tests/unit/*.bats` aufgefallen. Alle 8 sind **veraltete Testerwartungen** — die Tests
prüfen gegen einen Produktstand, der sich seit ihrer Erstellung geändert hat
(LiveKit-Removal, Hold-Pflicht, Repo-Reorg, Pocket-ID-Migration, SSOT-Konsolidierung,
Helper-Refactor). Keiner der Fehlschläge ist ein Produktdefekt; `scripts/` und
`components/website/` verhalten sich korrekt.

GitHub Actions sieht diese Fehlschläge nie: `task test:changed` /
`scripts/find-changed-tests.sh` führen Tests nur bei berührtem Diff aus, und keine der
8 Dateien wurde seit der jeweiligen Produktänderung angefasst.

Ein Batch-Plan (Parent T011907) deckt alle 8 Kind-Tickets ab; die Dateien sind
disjunkt (8 verschiedene Testdateien), es gibt kein depends_on zwischen ihnen.

## What

Ein OpenSpec-Change `gitlab-ci-testserie-fixes` (Ticket T011907), acht Partials
(p1..p8, jeweils ein Kind-Ticket):

- **p1 (T011899):** `tests/unit/fleet-dns-cutover.bats` — die beiden
  `A|stream|…`-Assertions (Zeile 26 und 53) entfernen. `SERVICE_PREFIXES` enthält
  seit dem LiveKit-Removal (T002184, Commit 575bab057) nur noch `turn`; der
  Skript-Kommentar sagt explizit "touches ONLY @, *, turn". Die `A|turn|…`-Assertions
  bleiben als Positiv-Anker.
- **p2 (T011900):** `tests/unit/scripts/stage-plan.bats` — die beiden Aufrufe ohne
  Hold-Entscheidung (Zeile 12 und 88) um `--no-hold` ergänzen. `stage-plan.sh`
  bricht seit T003267 (Commit a28e9f958, PR #4129) ohne `--hold`/`--no-hold` sofort
  mit Exit 1 ab, bevor die Pfadprüfung erreicht wird — beide Tests prüfen aber auf
  die nie erreichte "does not exist"-Meldung. Der Hold-Pflicht-Guard existiert
  bereits (`tests/spec/dev-flow-plan/stage-plan-contract.bats:31`, "ohne
  --hold/--no-hold → rc=1") — kein neuer Guard nötig, im Partial als Nachweis
  dokumentieren.
- **p3 (T011901):** `tests/unit/coaching-json-ingest.bats` — zwei unabhängige Fehler:
  (1) `cd "${PROJECT_DIR}/website"` → `cd "${PROJECT_DIR}/components/website"`
  (Repo-Reorg T006999, PR #4659), Skriptpfad entsprechend auf
  `../../scripts/coaching/ingest-json.mts`; (2) erwartete Meldung `content fehlt`
  → `"content" fehlt oder ist leer` (realer String aus
  `components/website/src/lib/ingest-json-core.ts:20`, `Eintrag ${i}: "content"
  fehlt oder ist leer`). Beides zusammen, sonst bleibt der Test rot.
- **p4 (T011902):** `tests/unit/recovery-browser-manifest.bats` — Assertion von
  `--allowed-groups=/recovery-access` (Keycloak-Syntax) auf
  `--authenticated-emails-file=/etc/oauth2/allowed-emails` umstellen (Pocket-ID-
  Migration T001068, Commit 1fe5859de, PR #2042). Die SICHERHEITSEIGENSCHAFT
  ("oauth2-proxy ist gegated") muss erhalten bleiben: zusätzlich zum Flag wird der
  ConfigMap-Mount (`oauth2-proxy-recovery-allowed-emails` → `/etc/oauth2/
  allowed-emails`) geprüft, und der Testname wird auf die Emails-Datei-Gating-
  Semantik umgestellt. Testdatei ist der älteste Fall der Serie (seit PR #1271 nie
  angepasst).
- **p5 (T011903):** `tests/unit/test_art_library_manifest.bats` — einziger Fall der
  Serie ohne veraltete Erwartung: der direkte bats-Aufruf überspringt den
  `npm install --silent`-Schritt, den nur `task test:art-library` ausführt
  (Taskfile.yml:664), und bricht mit ERR_MODULE_NOT_FOUND ab (eigenes package.json
  mit ajv/ajv-formats/cheerio in `assets/art-library/_tooling/`). Weg (a): der Test
  macht sich selbst lauffähig — `setup_file()` führt `npm install --silent` aus;
  schlägt das fehl (offline), sauberer `skip` mit Begründung (Muster:
  `tests/spec/sealed-secret-cluster-drift.bats`).
- **p6 (T011904):** `tests/unit/tickets-transition.bats` — Grep-Muster
  `export type TicketStatus` an die Re-Export-Form `export type { TicketStatus };`
  angleichen (T007955, Commit 3fb3cbe93, PR #4672; transition.ts:15 re-exportiert
  aus `./status.ts`). **Entscheidung:** beim Grep bleiben, Muster angleichen —
  Type-Exports sind reine Compile-Zeit-Konstrukte und im Laufzeit-Import
  (tsx `import { ... }`) nicht prüfbar; ein echter "Import-Test" wäre hier keine
  belastbarere Zusicherung. Die Datei hat bereits echte Runtime-Tests, die
  transitionTicket importieren und aufrufen (die das Modul als ganzes verifizieren).
- **p7 (T011905):** `tests/unit/newsletter-scheduled-publish.bats` — Assertion auf
  `status: 401` (Literal) auf den errorResponse-Helper-Aufruf umstellen:
  `errorResponse('Unauthorized', locals.requestId, 401)` (scheduled-publish.ts:16,
  Helper aus `pages/api/_errors.ts`, Commit a8ce2d8e9, PR #2078). **Entscheidung:**
  beim Grep bleiben, Muster auf den Helper-Aufruf umstellen — ein echter
  Request-Test bräuchte einen laufenden Server mit DB und wäre im manifests-Job
  (kubectl im setup_file) deplatziert; die Zusicherung "401 bei fehlendem Bearer"
  ist über das Helper-Aufruf-Muster plus die bestehende `Bearer ${CRON_SECRET}`-
  Assertion abgedeckt.
- **p8 (T011906):** `tests/unit/backup-restore-recovery.bats` — der kubectl-Stub
  kennt kein `create`: `cmd_recovery_verify` (backup-restore-lib.sh:48) hat seit
  T002063 (PR #3086) einen zweiten `$KC create configmap … --dry-run=client -o yaml
  | $KC apply …`-Aufruf (Erfolgs-Stempel für G-DB11). Der leere Stream des
  Default-Cases überschreibt das zuvor aufgenommene Job-Manifest in $CAPTURE. Fix
  im TEST-STUB (scripts/ verhält sich korrekt), kombiniert: (1) expliziter
  `create configmap`-Case, der gültiges YAML liefert (Realismus); (2) apply-Case
  capturet nur den ERSTEN apply (`[[ ! -s "$CAPTURE" ]]`-Guard), damit das
  Job-Manifest nicht vom ConfigMap-Stream überschrieben wird; (3) Default-Case
  bricht bei unbekanntem Subkommando LAUT ab (Meldung + Exit 1) — die Lehre aus
  diesem Fall: ein stiller Default-Case verschluckt jeden künftigen Aufruf.

## Non-Goals

- Kein Produktcode ändern (`scripts/`, `components/website/`, `k3d/` bleiben
  unangetastet) — alle 8 Fixes sind reine Testanpassungen.
- Keine Änderung an der GitLab-Pipeline-Konfiguration selbst.
- Keine neuen Guards in `tests/spec/` für die Serie (bis auf die Prüfung der
  Hold-Pflicht, die bereits existiert).

## Verification

- Die 8 betroffenen Testdateien laufen einzeln grün:
  `tests/unit/lib/bats-core/bin/bats tests/unit/<datei>.bats`
- `task test:unit` und `task test:manifests` (bzw. der GitLab-Job-Kontext von p7)
  grün.
- Kein Produktcode-Diff: `git diff --stat` zeigt ausschließlich `tests/` und
  `openspec/changes/gitlab-ci-testserie-fixes/`.
