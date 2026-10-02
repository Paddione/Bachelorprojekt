# Learnings — repo-lokale Lernschleife

**Lesen zu Sitzungsbeginn, appendieren nach Abschluss oder Fehlschlag einer Aufgabe.**
Komprimiert halten: 1–2 Zeilen pro Eintrag, nur Verifiziertes (mit Beleg), kein
Spekulieren. Tiefen-Referenz für Footguns:
[`docs/superpowers/references/gotchas-footguns.md`](../../docs/superpowers/references/gotchas-footguns.md).
Repo-übergreifendes Personal-Memory läuft separat (`brain-auto-memory` → Brain-Repo).

Format: `TT.MM.JJ [Ticket] Eintrag — Beleg: <Befehl/Test>`.

---

- 27.09.26 [T900609] Repo-Skills sind bereits per `.agents/skills` und `.claude/skills` geteilt; `task agy:sync` erzeugt den ignorierten Antigravity-Spiegel. Ignorierte neue Dateien in getrackten Vendor-Skill-Verzeichnissen koennen sonst unbemerkt bleiben. — Beleg: `node scripts/agent-skills/project.mjs --check`, `task agy:sync`, `.gitignore`
- 27.09.26 [T900609] `task agy:sync` kopiert ein dokumentiertes Beispiel-Key in `.gemini/skills/gitops-knowledge/references/`; gitleaks `--no-git` scannt auch diesen ignorierten Spiegel. Nur den konkreten Fixture-Pfad allowlisten. — Beleg: `gitleaks detect --config .gitleaks.toml --no-git --redact`
- 27.09.26 [T900560] Freshness-Artefakte müssen COMMITTET sein, bevor `check` läuft —
  gestagt reicht nicht („staged but not committed"). — Beleg: `task freshness:check`, C3
- 27.09.26 [T900560] `test:changed` ist lokal strenger als CI (CI fährt spec-Suite);
  rote E2E ohne Secrets/Stack (CRON_SECRET, DEPLOY_DRIFT) sind keine Blocker. — Beleg: C3, Verify-Block (b)/(c)
- 27.09.26 [T900560] Entry-Docs sind guard-gepinnt (6 Registry-Rollen exakt,
  Mess-Konvention in CLAUDE.md, Interaction Contract in AGENTS.md) — vor jedem
  Edit die Guard-Suite laufen lassen. — Beleg: 10 BATS-Suiten, C1
- 27.09.26 [T900560] Moves immer per `git mv`, ein Move = ein Commit, danach
  Grep-Verifikation alter Pfade (muss leer sein). — Beleg: C2/C3
- 27.09.26 [T900560] Subsystem-Globs in `docs/code-quality/subsystems.yaml` müssen
  nach Moves mitziehen (`quality:index` ist fail-closed). — Beleg: C2
- 27.09.26 [T900560] `.env`-Inhalte nie lesen/drucken; `gitleaks` entscheidet
  (nur Pass/Fail berichten). — Beleg: C2
- 27.09.26 [T900560] Rebase in non-interaktiver Shell braucht `GIT_EDITOR=true`,
  sonst bleibt der Rebase stehen. — Beleg: C1-Rebase auf #6020
- 27.09.26 [T900560] Worktrees nur via `scripts/worktree-create.sh` (git-crypt-safe),
  nie `git add -A` (Secret-in-index-Guard). — Beleg: git-workflow T001210
- 27.09.26 [T900560] `components/website/` ist strikt `pnpm`, Root + `components/brett/`
  sind `npm` — nie mischen. — Beleg: AGENTS.md Footguns
- 27.09.26 [T900560] PR-Titel ↔ Branch müssen dieselbe Ticket-ID tragen
  (`preflight-pr-scope.sh`), sonst PR-Fehlschlag. — Beleg: T001913
- 27.09.26 [T900560] go-task `flatten: true`-Includes laden Split-Taskfiles ohne
  Namespace-Präfix — öffentliche Task-Namen bleiben byte-identisch (Diff von
  `task --list-all` vorher/nachher muss leer sein). — Beleg: C4, task 3.52.0
- 27.09.26 [T900560] Nach Datei-Moves immer die VOLLEN Suiten fahren, nicht nur
  `test:changed` — die Diff-Selektion übersieht latente Pfad-Greps; Negations-Checks
  werden sonst still vakuos. — Beleg: C4 (43 Spec-Fails erst im Voll-Lauf)
- 27.09.26 [T900560] `grep -c` über mehrere Dateien bricht Zähl-Semantik (pro-Datei-
  Ausgabe) — für Suite-Totals `grep -rh … | wc -l | tr -d ' '` verwenden. — Beleg: C4
- 27.09.26 [T900560] Verschachteltes `bash -c`/`awk`-Quoting in BATS nicht per
  Edit erweitern, sondern flach neu schreiben (`run awk '…' file…`). — Beleg: C4 T001411
- 27.09.26 [T900560] Volle Test-Suiten können generierte Dateien dirty machen
  (openspec-status.json wurde trunkiert) — nach Suiten immer `git status` +
  Diff-Stat prüfen, nie blanket-stagen. — Beleg: C4
- 27.09.26 [T900560] `build-test-inventory.sh` discovert per `git ls-files` —
  nach Moves erst stagen, dann regenerieren, sonst reproduziert der Builder
  stale Pfade. — Beleg: C5
- 27.09.26 [T900610] `task --list-all` wird unter `FORCE_COLOR=1` (GitHub
  Actions setzt das) bunt — Goldens/Test-Aufrufe brauchen `--color=false`;
  CI-Env lokal per `FORCE_COLOR=1 task …` nachstellen. — Beleg: #6034 CI-Fail
- 27.09.26 [T900560] AGENTS.md ist 10-fach guard-gepinnt (Contract, Rollen,
  Runtime-Tabelle, Dispatch, OpenSpec, Advisory ≤160, Recall-Routing, Stale-Refs)
  + 4 Health-Gates lesen sie — vor Diät alle Pins + Gate-Baseline messen. —
  Beleg: C1b (3 Gates waren schon rot: G-AGENTIC02/04/07)
- 27.09.26 [T900560] Volle Spec-Suite nie gegen eine fremde Suite fahren
  (CPU/gpg-Konkurrenz hängt) — bei gehaltener Suite: Change-Surface per
  Konsumenten-Sweep abdecken, Rest der CI-Matrix überlassen. — Beleg: C1b
- 27.09.26 [T900560] `pkill -f` matcht immer die eigene Cmdline —
  nur mit Bracket-Trick (`pkill -f '[b]ats-exec'`) killen; `ps` nur mit
  `comm`-Spalte oder Zählung, JSON nur keys/counts (volle Args/Arrays
  fluten MBs). — Beleg: C1b/C5b
- 27.09.26 [T900560] `/usr/bin/sg` ist set-group, NICHT ast-grep; npm-Paket
  `@ast-grep/cli` hat zwei Bins — nur `npx -p <pkg> ast-grep` geht
  (`sg`-Bin ist deprecated). — Beleg: C9
- 27.09.26 [T900560] ast-grep-Regeln kind-basiert bauen (`kind:` + `regex`),
  nicht Patterns pro Syntax-Kontext aufzählen (brichig: 2/5 vs 5/5). —
  Beleg: C9 no-explicit-any
- 27.09.26 [T900560] Golden-Eval fing echten Drift (#6040: 5 pi-Tasks ohne
  Regen) — non-required Job heißt: Fund verhallt; Drift-Evidenz gehört in
  den nächsten PR-Body. — Beleg: C9
- 27.09.26 [T900560] Human-only-Evals-Policy auf Owner-Dekret entfernt (C5b):
  Hook-Block + CI-Token-Check raus, Job-ID `test-evals` behalten (GitLab-
  Mapping keyed by ID), Golden-Descs nachziehen. — Beleg: C5b
- 27.09.26 [T900560] C8-Konsolidierung: nur `docs/audits/` → `archive/` war
  frei; `legacy-html/` ist test-gepinnt (autodocs-guard f),
  `drift-reports/` + `generated/` haben lebende Schreiber. — Beleg: C8

- 27.09.26 [T900561] Vor Archiv-Branch immer `git fetch` + `git ls-tree -r origin/main`
  auf Change-Pfad prüfen — Archiv (#6033) war bereits gemergt, eigener Worktree
  überflüssig. — Beleg: T900561-Abschluss
- 27.09.26 [T900561] `git worktree remove` an worktree-create-Worktrees scheitert
  (lock reason „managed agent worktree") — erst `unlock`, dann `remove`
  (repo-hygiene §1), danach Branch `-D`. — Beleg: T900561-Cleanup
- 27.09.26 [T900601] E2E-Onset-Pinning via `gh run list --json
  databaseId,conclusion,createdAt -q 'sort_by(.createdAt)…'` — letzter grüner Lauf
  25.09. 23:01 UTC, erster roter 26.09. 03:20 UTC. — Beleg: T900601-Messung
- 27.09.26 [T900601] `ticket.sh triage --suggest` braucht im non-interactive mode
  mind. ein Feld; `component` ist Freitext ohne Enum-Validierung. — Beleg: T900601-Triage

- 27.09.26 [T900601] `ticket.sh get` blendet Triage-Felder aus (kein
  component/attention_mode/areas) — Verifikation via `list --attention-mode …`.
  Severity-Aenderung nur via `triage --severity … --apply`, nicht update-fields.
  — Beleg: T900601-Dispatch
- 27.09.26 [T900601] GH-Step-Conclusions decisiv via API: `gh api
  …/actions/runs/<id>/jobs -q '.jobs[].steps[]'` — Log-Grep fand Skip nicht.
  Beleg: Install-Playwright=skipped. — Beleg: T900601-Diagnose
- 27.09.26 [T900601] Playwright-Cache-Falle: Browser-Cache-Hit + `if:
  cache-hit` ueberspringt `--with-deps` auf ephemeren Runnern → webkit stirbt
  an fehlender System-Lib (libwoff2dec). Fix: install-deps immer fahren.
  — Beleg: Run 36315202214, e2e.yml:120

- 27.09.26 [T900601] Playwright-`force`-Click auf `hidden`-Element scheitert trotzdem
  („no box") — Panel-Mode immer UNMITTELBAR vor dem Klick etablieren, nie vor
  Wartebloecken. — Beleg: Run 36319267720, Fix #6039
- 27.09.26 [T900601] Brett-Neuraeume werden async per WS mit Brand-Template geseedet
  (ws-connection.ts join) — E2E muss Seed abwarten (`length > 0` + Settle), sonst
  0→5-Flake. — Beleg: Run 36319267720, Fix #6039
- 27.09.26 [T900601] `gh run watch <id> --exit-status` wartet fremde Laeufe zuverlaessig
  ab; Proof-Run nach Merge ist der einzige tragende Gruen-Beleg fuer E2E-Fixes.
  — Beleg: Run 36320215585 success
- 27.09.26 [T900601] `${VAR:0:9}` ist bash-only — unter /bin/sh (dash) `Bad
  substitution`; in Task-Shells `git rev-parse --short` verwenden. — Beleg: #6039-Commit
