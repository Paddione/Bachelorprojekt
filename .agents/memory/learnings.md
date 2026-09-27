# Learnings — repo-lokale Lernschleife

**Lesen zu Sitzungsbeginn, appendieren nach Abschluss oder Fehlschlag einer Aufgabe.**
Komprimiert halten: 1–2 Zeilen pro Eintrag, nur Verifiziertes (mit Beleg), kein
Spekulieren. Tiefen-Referenz für Footguns:
[`docs/superpowers/references/gotchas-footguns.md`](../../docs/superpowers/references/gotchas-footguns.md).
Repo-übergreifendes Personal-Memory läuft separat (`brain-auto-memory` → Brain-Repo).

Format: `TT.MM.JJ [Ticket] Eintrag — Beleg: <Befehl/Test>`.

---

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
