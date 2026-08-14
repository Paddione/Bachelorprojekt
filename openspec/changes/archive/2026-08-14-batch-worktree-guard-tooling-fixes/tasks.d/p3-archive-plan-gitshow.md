## P3 — cmd_archive_plan: git-show-Fallback für Branch-only-Pläne (T004269)

Rolle: **impl**. Fix für T004269: `scripts/ticket.sh` `cmd_archive_plan()` prüft in
Z. 209, ob die Plandatei im Dateisystem (`-s`) ODER als Blob im Branch existiert
(`git cat-file -e "${branch}:${plan_file}"`, Drei-Stufen-Fallback T002263, Kommentar
Z. 205–208). Existiert nur der Blob, besteht der Check — das Lesen in Z. 237 läuft aber
per `cat "$plan_file"` gegen den Aufrufer-cwd (Go-Adapter-Konstellation: Plan wurde im
Worktree-Branch committet, die Datei liegt im Adapter-cwd nicht vor) → „No such file or
directory", Exit ≠ 0, kein Insert. `git show` wird nirgends verwendet. CLI- und
MCP-Pfad teilen die Funktion (Design D4) — beide geheilt. Der Failing-Test entsteht im
Tests-Partial p6; Task P3.1 referenziert ihn.

### S1-Budget

| `path` | Ist | Budget |
|---|---|---|
| `scripts/ticket.sh` | 1110 | – |

Begründung: `.sh`-Limit 800, **nicht baselined**, aber in `docs/code-quality/gates.yaml`
→ `s1.ignore` als sanktionierte Einzeldatei-Ausnahme (G-RH01 Batch 1; Kommentar in
gates.yaml, Referenz auch in ticket.sh Z. ~1079) → `residual_budget` liefert leer, der
S1-Ratchet misst die Datei nicht. Ein Zahlen-Claim wäre plan-lint-W4-widersinnig, daher
`–` (kein Claim → B1a nicht anwendbar). Trotzdem nahezu zeilenneutral geplant: der
Leseausdruck wandert in eine Variable, `cat` bleibt der Normalpfad, netto ~+7 Zeilen
(nur der Branch-only-Fallback). Kein Split/Schrumpf nötig (ignore; kein Budget ≤ 0).
Die Testdatei `tests/spec/batch-worktree-guard-tooling-fixes/archive-plan-gitshow-fallback.bats`
ist target_file des Tests-Partials p6 (D1) — hier nur referenziert, nicht angelegt.

## File `scripts/ticket.sh` (edit)

### Task P3.1 — RED-Test aus p6 referenzieren und Rot nachweisen — 0.5h

- [ ] p6 hat angelegt:
      `tests/spec/batch-worktree-guard-tooling-fixes/archive-plan-gitshow-fallback.bats`
      (Header: `# SSOT: openspec/changes/batch-worktree-guard-tooling-fixes/specs/
      batch-worktree-guard-tooling-fixes.md` — Requirement „archive_plan liest
      Branch-only-Plandateien per git show"; Prüfmodus-Kommentar:
      `# Prüfmodus: Output-Verifikation (run + $status/$output) [T002448-M4]`).
- [ ] Vor der Implementierung laufen lassen — expected: FAIL (RED, ohne Fix bricht
      `cat "$plan_file"` in Z. 237 an der fehlenden Datei ab → Exit ≠ 0, kein Insert):
      ```
      tests/unit/lib/bats-core/bin/bats tests/spec/batch-worktree-guard-tooling-fixes/archive-plan-gitshow-fallback.bats
      ```
      (vendored Runner, NICHT `which bats`; `bats --count <datei>` als Syntax-Probe, da
      `bash -n` für `.bats` untauglich ist [T002351-M2]).
- [ ] Testanordnung — exakt so setzt p6 sie um (kein `--dry-run`-Flag existiert für
      archive-plan; der kubectl-Stub ist der einzige Offline-Weg):
      - Temp-Repo `$BATS_TEST_TMPDIR/git-repo`: `git init -q -b main`, user config
        (`t@example.invalid`), Base-Commit; Branch `test/branch-only-plan` mit
        `openspec/changes/demo-slug/tasks.md` (Inhalt enthält Marker
        `MARKER: plan-content-from-branch`), Commit; zurück auf `main` → Datei ist im
        Arbeitsbaum nicht vorhanden, Blob existiert im Branch.
      - kubectl-Stub `$STUB_BIN/kubectl` vor den PATH (`export PATH="$STUB_BIN:$PATH"`,
        Muster `tests/spec/software-factory/retry-limit.bats`): `get` → antwortet
        `pod/shared-db-0` (für `_pgpod`); `exec` → stdin lesen: enthält `INSERT INTO` →
        stdin nach `$TICKET_TEST_CAPTURE` schreiben, rc 0 (Insert-Capture);
        sonst enthält stdin `ticket_plans` → `echo 1` (Verifikations-SELECT);
        sonst → UUID `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee` (erster SELECT). Damit
        laufen `_pgpod`, beide `_exec_sql` und das Insert vollständig offline — kein
        DB-Kontakt, kein DB-Schaden (TICKET_OFFLINE bleibt ungesetzt, sonst skippt
        Z. 203 den Test).
      - Aufruf aus anderem cwd (Adapter-Konstellation: der Aufrufer-cwd ist nicht der
        Worktree, in dem der Plan authorisiert wurde):
        `run bash -c 'cd "$TMPREPO" && bash "$REPO_ROOT/scripts/ticket.sh" archive-plan
        --id T999999 --slug demo-slug --branch test/branch-only-plan --plan-file
        openspec/changes/demo-slug/tasks.md'` — `$TMPREPO` = Temp-Repo, `$REPO_ROOT`
        über `cd "$(dirname "$BATS_TEST_FILENAME")/../../.."`.
      - RED-Assertions: `[ "$status" -ne 0 ]`; Positiv-Anker im selben Test
        (T002356-M1): `git -C "$TMPREPO" cat-file -e
        "test/branch-only-plan:openspec/changes/demo-slug/tasks.md"` → rc 0 — der Blob
        existiert, die Fixture ist korrekt, der Fehler liegt am fehlenden Lese-Fallback.

### Task P3.2 — Leseausdruck in Variable mit git-show-Fallback — 1h

Datei: `scripts/ticket.sh`, `cmd_archive_plan()` Z. 232–239.

- [ ] `local tmpfile` → `local tmpfile plan_content` (Z. 232) und vor
      `tmpfile=$(mktemp)` (Z. 233) den Lese-Schritt einfügen:
      ```bash
      if [[ -s "$plan_file" ]]; then
        plan_content=$(cat "$plan_file")
      else
        # Branch-only-Plan (T004269): Datei fehlt im Aufrufer-cwd, Blob existiert im Branch.
        plan_content=$(git show "${branch}:${plan_file}") || {
          echo "ERROR: plan file not readable on filesystem or branch: $plan_file" >&2
          exit 1
        }
      fi
      ```
- [ ] Im tmpfile-Block `cat "$plan_file"` (Z. 237) durch `printf '%s' "$plan_content"`
      ersetzen — das `\$plan\$`-Dollar-Quote (Z. 235/238) und der Rest des Inserts
      bleiben unverändert; Trailing-Newline-Verlust durch die Command-Substitution ist
      für den Markdown-Inhalt im Dollar-Quote semantisch irrelevant.
- [ ] Kommentar Z. 205–208 (Drei-Stufen-Fallback, T002263) um den Branch-only-Lesefall
      ergänzen: „liegt die Datei nur im Branch, liest Z. ~237 per
      `git show "${branch}:${plan_file}"` (T004269)".
- [ ] `bash -n scripts/ticket.sh` — keine Syntaxfehler.
- [ ] GREEN: denselben BATS-Lauf wie P3.1 erneut — expected: PASS — rc 0, Output
      enthält `Plan successfully archived`, `$TICKET_TEST_CAPTURE` enthält
      `MARKER: plan-content-from-branch` (der Planinhalt stammt nachweislich aus dem
      Branch-Blob), und die Datei liegt weiterhin nicht im Arbeitsbaum
      (`[ ! -f "$TMPREPO/openspec/changes/demo-slug/tasks.md" ]`).

### Task P3.3 — Regression: Normalpfad und Fehlerpfad unverändert — 0.5h

Datei: `scripts/ticket.sh` + `tests/spec/batch-worktree-guard-tooling-fixes/archive-plan-gitshow-fallback.bats`.

- [ ] Normalpfad (Datei existiert im cwd — `cat`-Zweig): im selben Temp-Repo auf
      `test/branch-only-plan` zurückwechseln und denselben archive-plan-Aufruf fahren →
      rc 0, gleiche Captures wie in P3.2.
- [ ] Fehlerpfad unverändert: `--plan-file` mit weder Datei noch Blob → weiterhin
      exit 1 mit „plan file does not exist or is empty" (Z. 209–212 bleibt
      unangetastet) — als eigener `@test` im p6-File oder manuell verifiziert.
- [ ] Umgebende Testfläche grün lassen:
      ```
      tests/unit/lib/bats-core/bin/bats -r tests/spec/archive.bats tests/spec/ticket-mcp tests/spec/ticket-system.bats
      ```
- [ ] Abschluss-Hinweis: `website/src/data/test-inventory.json` regeneriert p6
      (Test-Inventar-Pflicht nach Test-Änderungen); die finale Verify-Kette
      (`task test:changed`, `task freshness:regenerate`, `task freshness:check`)
      trägt der Index (Task 7) — hier nicht duplizieren.
