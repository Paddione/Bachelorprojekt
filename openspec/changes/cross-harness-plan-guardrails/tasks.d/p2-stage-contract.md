# P2 — stage-plan Explizit-Vertrag

Rolle: **impl**. Disjunkter Partial des Change `cross-harness-plan-guardrails` (T003267),
Komponente 2 aus `design.md`: `scripts/vda/ticket/stage-plan.sh` erzwingt eine **explizite
Hold-Entscheidung** (`--hold` XOR `--no-hold`, sonst Exit 1) und macht eine **leere
`touched_files`-Ableitung zum harten Fehler** (T002673-Klasse) mit Override
`--allow-empty-touched`. Alle vier bekannten Skript-Call-Sites (erhoben 2026-08-10 via
`grep -rn 'stage-plan' scripts/ | grep -v '\.md:'`) werden im selben Partial auf explizite
Flags umgestellt: `mishap-rollup.sh`, `auto-chore-plan.sh`, `batch-workflow-gen.sh`
(generiertes Snippet) und der Go-MCP-Wrapper `workflow.go`. Die Skill-Prosa-Call-Sites
(`dev-flow-plan`, `opencode-flow-plan`) trägt Partial p5; Failing-Tests
(`stage-plan-contract.bats`) und Verify trägt p6 bzw. der `tasks.md`-Index — hier stehen
bewusst KEINE Failing-Test- oder Verify-Tasks.

Invarianten (design.md → Fehlerbehandlung): die Idempotenz der `touched_files`-Vereinigung
(SQL-UNION, Z.104–112) bleibt unverändert; `--no-hold` verhält sich exakt wie der heutige
Default (Force-Tick-Flag + `factory.service`-Start); `plan-touched-files.sh` bleibt
fail-soft — das Gate ist `stage-plan`, nicht der Parser.

---

## File `scripts/vda/ticket/stage-plan.sh` (edit)

- Sprache: bash · S1-Limit 800 · Ist-LOC 170 · Baseline: keine · **Budget 630** (der Diff
  fügt ~35 Zeilen hinzu — weit unter der wirksamen Schwelle).
- Argument-Parsing lebt in `main()` Z.40–64, die `touched_files`-Ableitung Z.91–116, der
  Hold-Zweig Z.117–122. `hold` ist heute `0`-initialisiert — der neue Vertrag braucht einen
  Tri-State (leer = keine Entscheidung getroffen).

### Task P2.1 — `--no-hold` als Pflicht-Gegenstück zu `--hold`

- [ ] `main()` Z.40: Initialisierung von `hold=0` auf `hold=""` ändern (Tri-State: leer =
      Aufrufer hat nicht entschieden). Neue Variable `allow_empty=0` im selben `local`.
- [ ] Parser Z.52: `--no-hold` und `--allow-empty-touched` ergänzen:

```bash
      --hold)                 hold=1; shift ;;
      --no-hold)              hold=0; shift ;;
      --allow-empty-touched)  allow_empty=1; shift ;;
```

- [ ] Unknown-Option-Hilfetext Z.56–58 aktualisieren (er ist der einzige Ort, an den ein
      Aufrufer im Fehlerfall schaut, T002375-p3): `[--hold]` wird zu
      `--hold|--no-hold [--allow-empty-touched]`, und die Zeile „Ohne --hold ist das
      Ticket sofort factory-greifbar …" wird ersetzt durch den neuen Vertragssatz (siehe
      nächster Punkt).
- [ ] Nach den bestehenden Pflicht-Checks (Z.61–64, die mit Exit 2 enden) den neuen
      Hold-Pflicht-Check einfügen — Exit **1** gemäß Vorentscheidung 3:

```bash
  if [[ -z "$hold" ]]; then
    echo "ERROR: stage-plan verlangt eine explizite Hold-Entscheidung." >&2
    echo "  Ohne Flag kein Stage: --hold = Operator gibt später frei, --no-hold = Factory greift sofort zu." >&2
    exit 1
  fi
```

- [ ] Alle nachgelagerten `[[ "$hold" == "1" ]]` / `[[ "$hold" != "1" ]]`-Zweige
      (Z.117, 147, 158, 163) bleiben unverändert — nach dem Pflicht-Check ist `hold`
      garantiert `0` oder `1`, die String-Vergleiche funktionieren identisch.

### Task P2.2 — Leere `touched_files`-Ableitung wird harter Fehler (vor dem ersten DB-Write)

Kernpunkt der Reihenfolge: heute läuft das `status='plan_staged'`-UPDATE (Z.76–79) **vor**
der Ableitung (Z.91–116). Ein Exit 1 an der bisherigen Stelle ließe das Ticket halb
gestaged zurück — genau die Sorte Teilzustand, die design.md → Fehlerbehandlung
ausschließt. Deshalb wandert die Ableitung **vor** den ersten SQL-Write.

- [ ] Den Ableitungs-Block Z.91–101 (mktemp, `git cat-file -p`, `plan-touched-files.sh`,
      `rm -f`) unverändert nach oben ziehen: direkt hinter den Plan-Existenz-Check
      (Z.68–74) und vor `local pod; pod=$(_pgpod)` (Z.75). Der Block nutzt dieselben
      `git cat-file`-Quellen wie der Existenz-Check — keine neue Logik, nur Hoisting.
- [ ] Direkt nach dem gehoisteten Block das neue Gate (die T002673-Meldung ist
      Guard-Anker für den Parity-Katalog aus p4 — Wortlaut stabil halten):

```bash
  if [[ -z "${derived//[[:space:]]/}" && "$allow_empty" != "1" ]]; then
    echo "ERROR: keine touched_files aus '${plan}' ableitbar (T002673)." >&2
    echo "  Plan im Branch-Commit ist noch das propose-Skeleton? Erst committen, dann stagen." >&2
    echo "  Bewusster Sonderfall ohne File-Structure-Pfade: --allow-empty-touched setzen." >&2
    exit 1
  fi
```

- [ ] Der bisherige `else`-Zweig Z.114–116 („Spalte unverändert") bleibt als Meldung für
      den `--allow-empty-touched`-Fall bestehen; das SQL-UNION-UPDATE (Z.102–113) bleibt
      byte-identisch — Idempotenz unangetastet.
- [ ] Selbst-Check (P2-lokal, kein STRUCT-Step): `bash -n scripts/vda/ticket/stage-plan.sh`
      und ein Trockendurchlauf ohne Flags muss die neue Fehlermeldung mit rc 1 liefern
      (die BATS-Abdeckung `stage-plan-contract.bats` liefert p6).

---

## File `scripts/factory/mishap-rollup.sh` (edit)

- Sprache: bash · S1-Limit 800 · Ist-LOC 265 · Baseline: keine · **Budget 535**.
- Headless Factory-Pfad: staged den Rollup-Container und released ihn unmittelbar danach
  selbst per `release-hold` (Z.262–263). Design-Regel „Factory-seitig `--no-hold`" trifft
  wörtlich zu — der Abschnittskommentar Z.249 sagt heute schon „ohne --hold, damit das
  Ticket released ist"; das Flag macht die dokumentierte Absicht maschinenlesbar.

### Task P2.3 — Call-Site auf `--no-hold` umstellen

- [ ] Z.249–255: Abschnittskommentar und Aufruf anpassen:

```bash
# ── stage-plan (--no-hold, damit das Ticket released ist) ───────────────────
echo "mishap-rollup: stage-plan ..."
bash "$WT/scripts/ticket.sh" stage-plan \
  --id "$CONTAINER_ID" \
  --branch "$BRANCH" \
  --plan "$PLAN_PATH" \
  --partials 1 --no-hold >/dev/null
```

---

## File `scripts/factory/auto-chore-plan.sh` (edit)

- Sprache: bash · S1-Limit 800 · Ist-LOC 215 · Baseline: keine · **Budget 585**.
- Headless Factory-Pfad (generiert lint-gegatete Chore-Pläne und staged sie unbeaufsichtigt,
  Z.195–213). Gleiche Design-Regel: `--no-hold`.

### Task P2.4 — Call-Site auf `--no-hold` umstellen

- [ ] Z.213 erweitern:

```bash
bash "$WT/scripts/ticket.sh" stage-plan --id "$EXT_ID" --branch "$branch" --plan "$plan_path" --no-hold >/dev/null
```

---

## File `scripts/batch-workflow-gen.sh` (edit)

- Sprache: bash · S1-Limit 800 · Ist-LOC 162 · Baseline: keine · **Budget 638**.
- **Entscheidung: `--no-hold`, mit dreifacher Begründung.** (a) Der Kontext des Snippets
  (gelesen Z.10–160): das Skript generiert einen headless Batch-Workflow
  (`batch-spec-plan-creation`), dessen Stage-Phase per `agent(...)`-Prompt
  `scripts/ticket.sh stage-plan` ohne Operator im Loop ausführt — das ist die
  Factory-Seite der Design-Regel „Factory-seitig `--no-hold`, interaktiv `--hold`".
  (b) Verhaltenserhalt: der heutige Aufruf ohne Flag entspricht dem
  No-Hold-Verhalten; dieser Change macht Defaults explizit, er ändert keine
  Dispatch-Semantik. (c) Die Pläne dieses Pfads sind bereits hart gegatet — Schritt 6b
  des Isolated-Prompts erzwingt grünes `plan-lint.sh` vor Commit und Stage; das Hold-Gate
  ist für Operator-Review interaktiver Pläne gedacht, nicht als zweites Lint-Netz.

### Task P2.5 — Generiertes Stage-Snippet auf `--no-hold` umstellen

- [ ] Im Heredoc Z.146–152 (Phase 3 „Stage") das generierte Kommando erweitern:

```bash
bash scripts/ticket.sh stage-plan \\
  --id ${r.ticket_id} \\
  --branch ${r.branch} \\
  --plan ${r.plan_path} \\
  --no-hold
```

- [ ] Eine Kommentarzeile im Agent-Prompt direkt darüber ergänzen („--no-hold: headless
      Batch-Pfad, Plan ist bereits lint-gegatet — stage-plan verlangt seit T003267 eine
      explizite Hold-Entscheidung"), damit der ausführende Agent das Flag nicht als
      optional wegkürzt.

---

## File `scripts/ticket-mcp/go/internal/tools/workflow.go` (edit)

- Sprache: Go · kein S1-Limit für `.go` (Intel: `s1_limit 0`) · Ist-LOC 258.
- Das `stage_plan`-Tool (Z.92–114) hängt `--hold` heute nur bei `hold=true` an; bei
  `false`/weggelassen ginge der Aufruf nach der Härtung mit rc 1 kaputt. Der Wrapper muss
  IMMER genau eines der beiden Flags übergeben.

### Task P2.6 — MCP-Wrapper übergibt immer genau ein Hold-Flag + Build/Vet

- [ ] Handler Z.108–111 umbauen:

```go
args := []string{"stage-plan", "--id", id, "--branch", branch, "--plan", plan}
// stage-plan verlangt seit T003267 eine explizite Hold-Entscheidung —
// der Wrapper übersetzt den bool-Parameter immer in genau eines der Flags.
if hold, _ := a["hold"].(bool); hold {
    args = append(args, "--hold")
} else {
    args = append(args, "--no-hold")
}
```

- [ ] Parameter-Beschreibung Z.99 aktualisieren:
      `mcp.WithBoolean("hold", mcp.Description("true → --hold (execution_released=false, Operator gibt später frei); false/weggelassen → --no-hold (Factory greift sofort zu). stage-plan verlangt genau eines der Flags (T003267)."))`
      — ebenso den Kommentar Z.92 auf `[--hold|--no-hold]` anpassen.
- [ ] Go-Tests geprüft (2026-08-10, `grep -rn 'stage' scripts/ticket-mcp/go/internal/tools/*_test.go`):
      `workflow_test.go` enthält nur den Registrierungs-No-Panic-Test
      (`TestRegisterWorkflowToolsNoPanic`), keine stage_plan-Argument-Assertions —
      **keine Testanpassung nötig**; die Registrierung bleibt von der Flag-Logik unberührt.
- [ ] Build + Vet + bestehende Tests lokal fahren:

```bash
cd scripts/ticket-mcp/go && go build ./... && go vet ./... && go test ./internal/tools/
```

---

## Scope-Grenzen (nicht in P2)

- Keine Skill-Prosa-Umstellung (`dev-flow-plan`, `opencode-flow-plan` Snippets auf
  `--hold`) — Partial p5 (Prosa-Sync).
- Kein Eintrag in `plan-guards.yaml` für den neuen T002673-Anker — Partial p4.
- Keine Failing-Tests (`tests/spec/dev-flow-plan/stage-plan-contract.bats`) und keine
  Verify-Kommandos — Partial p6 bzw. `tasks.md`-Index.
