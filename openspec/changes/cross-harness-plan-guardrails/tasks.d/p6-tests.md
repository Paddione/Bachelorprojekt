# P6 — Tests

Rolle: **tests**. Letztes Partial des Change `cross-harness-plan-guardrails` (T003267) —
trägt den STRUCT2-Failing-Test-Step des Gesamtplans. Vier neue BATS-Dateien unter
`tests/spec/dev-flow-plan/` (Verzeichnis-Konvention T002416: ein Verzeichnis pro
SSOT-Spec, eine Datei pro Vorgang; Runner erfasst sie via `bats -r tests/spec/`).
Prüfmodus je Datei im Header-Kommentar dokumentiert (T002448-M4): drei Dateien sind
Output-Verifikation (Skript ausführen, `$status`/`$output` prüfen), `guard-parity.bats`
ist dokumentierte Grep-Ausnahme (Prüfobjekt = Doku-Konvention). Alle Assertions
formatfrei (`grep -qF`-Substrings, Exit-Codes — Semantik statt Darstellung, T002716);
jeder Negativtest trägt einen Positiv-Anker im selben Test (T002356-M1).

BATS-Runner: `tests/unit/lib/bats-core/bin/bats` (vendored — NICHT `which bats`).
Syntax-Probe für neue Dateien: `tests/unit/lib/bats-core/bin/bats --count <datei>`
(`bash -n` taugt nicht für `.bats`, T002351-M2).

---

## File `tests/spec/dev-flow-plan/plan-preflight.bats` (net-new)

### Task P6.1 — Preflight-Verhalten gegen Temp-Git-Fixture

- [ ] Header: `# Prüfmodus: Output-Verifikation (run + $status/$output) [T002448-M4]`.
- [ ] `setup()`: Temp-Repo unter `$BATS_TEST_TMPDIR` (`git init -b main`, ein Commit,
      Feature-Branch `feature/px-T009999`), Lock-Verzeichnis via
      `export AGENT_LOCK_DIR="$BATS_TEST_TMPDIR/agent-locks"` — exakt der Override, den
      P1 dafür vorsieht; die echte Lock-Registry der Session bleibt unberührt.
      `SCRIPT="$REPO_ROOT/scripts/plan-preflight.sh"` über `git rev-parse
      --show-toplevel` des Aufruf-Repos auflösen (Test läuft im Temp-Repo-cwd).
- [ ] `@test`-Fälle (Namen wörtlich; alle via `run bash "$SCRIPT" …`):
      - `pre-commit auf main wird abgelehnt (rc=1)` — cwd auf `main`; Positiv-Anker im
        selben Test: nach `git checkout feature/px-T009999` + gültigem Lock-Fixture
        liefert derselbe Aufruf rc 0.
      - `pre-commit mit dirty tree wird abgelehnt (rc=1)` — Datei anlegen ohne Commit;
        Anker: nach `git add`+`commit` → rc 0.
      - `pre-commit ohne Lock wird abgelehnt (rc=1)` — leeres `AGENT_LOCK_DIR`; `$output`
        nennt per `grep -qF` sowohl `ticket__` als auch `branch__`.
      - `pre-commit akzeptiert ticket-scoped Lock mit Branch-Match (rc=0)` — Fixture
        `agent-locks/ticket__T009999.json` mit `{"branch":"feature/px-T009999"}`.
      - `pre-commit akzeptiert branch-scoped Fallback (rc=0) [T003102]` — nur
        `agent-locks/branch__feature-px-T009999.json`.
      - `pre-commit mit Branch-Mismatch im Lock wird abgelehnt (rc=1)` — Lock trägt
        anderen Branch; Anker: korrigiertes Lock-Fixture → rc 0.
      - `Usage-Fehler: fehlendes --ticket → rc=2`, `unbekanntes Subkommando → rc=2`.
- [ ] `pre-worktree`: ein Fall `nicht gemergtes Ticket → rc=0` (Temp-Repo mit
      `origin/main`-Remote-Fixture: zweites bare Repo als origin, gefetcht) und ein Fall
      `kaputte Umgebung (kein origin/main) → rc≠0, nicht 1` — die 1-Semantik („schon
      gemergt") wird nicht end-to-end erzwungen, weil sie `agent-lock.sh check-merged`
      gehört und dort bereits getestet ist; der Wrapper-Test misst nur das Durchreichen.

## File `tests/spec/dev-flow-plan/stage-plan-contract.bats` (net-new)

### Task P6.2 — Flag-Vertrag (nur die Pfade, die VOR jedem DB-Zugriff exiten)

- [ ] Header: Output-Verifikation; plus Begründungszeile: CI hat keine Ticket-DB — die
      Datei misst ausschließlich Parsing-/Vertragsfehler, die `stage-plan.sh` vor dem
      ersten `_pgpod`-Aufruf produziert (verifiziert am Ist-Stand: Pflicht-Flag-Checks
      und `git cat-file`-Existenz-Check liegen vor jedem SQL). End-to-end-Härtung
      (touched_files-UNION) bleibt bewusst ungetestet in CI — der Guard dafür ist der
      Exit-1-Pfad, der ohne DB reproduzierbar ist, solange die Ableitung VOR dem ersten
      Write liegt (P2.2-Invariante).
- [ ] Aufruf immer über `run bash scripts/ticket.sh stage-plan …` im Repo-Root
      (`cd "$REPO_ROOT"`), mit gültigem `--id T009999 --branch <existierender-branch>
      --plan <committete-Datei> --partials 1`, variiert um den jeweiligen Fehlerfall.
      Ein Temp-Git-Fixture wie in P6.1 dient als Repo (stage-plan braucht nur git, bis
      die Flags scheitern).
- [ ] `@test`-Fälle:
      - `ohne --hold/--no-hold → rc=1, Meldung nennt beide Flags` — `grep -qF -- '--hold'`
        UND `grep -qF -- '--no-hold'` auf `$output`.
      - `--partials 0 → rc=2` (Bestandsvertrag bleibt).
      - `unbekanntes Flag → rc=2, Usage nennt --no-hold` — Positiv-Anker: die
        Usage-Zeile enthält auch `--allow-empty-touched`.
      - `Plan nicht committed → rc=1` (Bestandsvertrag `git cat-file`, bleibt vor der DB).
      - Verfügbarkeits-Guard-Beispiel für spätere DB-Fälle dokumentieren
        (`command -v psql >/dev/null 2>&1 || skip "psql not installed"` — Muster
        `tests/spec/sealed-secret-cluster-drift.bats`), aktuell ohne DB-Fall aktiv.

## File `tests/spec/dev-flow-plan/plan-lint-rules.bats` (net-new)

### Task P6.3 — --rules-Modus

- [ ] Header: Output-Verifikation. `@test`-Fälle:
      - `--rules exitet 0 und liefert nicht-leeren Output` (Positiv-Anker der Suite).
      - `--rules nennt jede Hard-Rule-ID` — Schleife über
        `F1 F2 STRUCT1 STRUCT2 STRUCT3 STRUCT-PARTIAL D1 D2 I1 P1 B1a B1b T002453-C`,
        je `grep -qF` auf `$output` (KEINE Zeilenanker, kein Format-Regex — T002716).
      - `--rules verlangt keine Plan-Datei und keine baseline.json` — Aufruf aus
        `$BATS_TEST_TMPDIR` heraus mit absolutem Skript-Pfad, rc=0.

## File `tests/spec/dev-flow-plan/guard-parity.bats` (net-new)

### Task P6.4 — Parity-Guard über die Registry

- [ ] Header (wörtlich): `# Prüfmodus: Grep auf Quelltext — dokumentierte Ausnahme von
      T002448-M4: Prüfobjekt ist eine Doku-Konvention (Guard-Präsenz in Skill-Prosa),
      die sich ausschließlich im Quelltext manifestiert.`
- [ ] yq-Verfügbarkeit: `command -v yq >/dev/null 2>&1 || skip "yq not installed"`
      [T002820]. Beim Umsetzen prüfen und im Datei-Header festhalten, ob CI yq
      bereitstellt (`grep -rn 'yq' .github/workflows/ | head`) — falls nein, zusätzlich
      einen yq-freien Fallback-Parser für das flache Schema erwägen (awk über
      `id:`/`anchor:`/`- `-Zeilen) ODER die yq-Installation im CI-Workflow ergänzen;
      die Entscheidung fällt beim Umsetzen anhand des Befunds und wird im Header
      dokumentiert. Beide Richtungen verifizieren: mit yq läuft die Prüfung, mit
      `PATH=/usr/bin:/bin` (ohne yq) skippt sie sauber statt rot zu werden.
- [ ] `@test "jeder Guard-Anker kommt in jeder applies_to-Datei vor"`: iteriert
      `yq -r '.guards[] | [.id, .anchor, (.applies_to|join(","))] | @tsv'
      docs/agent-guide/registry/plan-guards.yaml`; je (anchor, datei):
      `grep -qF -- "$anchor" "$datei"` — Fehlermeldung nennt Guard-ID und Datei.
      Positiv-Anker: Registry hat > 0 Einträge UND > 0 geprüfte (anchor, datei)-Paare
      (leere Liste darf nicht vakuos bestehen).
- [ ] `@test "keine stalen Modell-Slugs in den Flow-Skills"`: Extraktionsmethode
      konkret — `grep -hoE 'gemma[0-9a-z-]*-factory|gemma[0-9]+-[a-z]+|gptoss-[a-z]+|devstral-[a-z]+|qwen[0-9a-z-]+' <beide SKILL.md>`,
      dedupliziert; jeder Treffer muss als Substring in `scripts/llm/loadouts.json`
      ODER `.opencode/agent-models.jsonc` vorkommen (`grep -qF`). Positiv-Anker: die
      Kandidatenliste ist nicht leer (mindestens `gemma26-factory` steht nach p5 in der
      opencode-Modelltabelle) — ohne Anker bestünde der Test vakuos [T002356-M1].

### Task P6.5 — Failing-Tests zuerst (RED) + Inventar

- [ ] Die vier Dateien werden VOR der Implementierung von p1–p5 geschrieben und
      eingecheckt. Roter Lauf:

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/dev-flow-plan/
# expected: FAIL — plan-preflight.bats: scripts/plan-preflight.sh existiert noch nicht;
# stage-plan-contract.bats: ohne Flags exitet stage-plan heute mit rc=0 statt rc=1;
# plan-lint-rules.bats: --rules ist heute ein Unknown-Argument;
# guard-parity.bats: plan-guards.yaml fehlt (bzw. nach p4: opencode-Anker fehlen bis p5).
```

- [ ] Nach GREEN (p1–p5 umgesetzt): derselbe Runner-Aufruf ist grün; zusätzlich
      `task test:inventory` regenerieren und `website/src/data/test-inventory.json`
      mitcommitten (CI-Inventar-Check failt sonst).
