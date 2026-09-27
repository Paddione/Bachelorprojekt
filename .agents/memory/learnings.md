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
