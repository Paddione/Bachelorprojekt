# Proposal: batch-git-worktree-integrity

## Why

Sieben offene Fix-Tickets aus den Mishap-Läufen vom 2026-08-09/10 betreffen dieselbe
Fehlerfamilie: **Signale rund um Git-Worktrees und den gemeinsamen Objektspeicher werden
falsch gelesen oder falsch geschützt.** Jedes Ticket einzeln ist klein (severity minor),
zusammen decken sie aber genau die Lücken ab, die einen repo-hygiene-Lauf oder einen
Git-Lifecycle in diesem Repo still lahmlegen oder Datenverlust ermöglichen:

| Ticket | Symptom | Fehlerklasse |
|--------|---------|--------------|
| T002994 | 0-Byte-Loose-Objects in EINEM Worktree blockieren `git fetch` im GESAMTEN Repo | fehlender Integritäts-Vorcheck (§0) |
| T002995 | Erster `git status` nach Crash meldet Falsch-Positiv "dirty" | Messwert ohne zweite Messung (§1) |
| T002998 | Glob-Schleife über `.worktrees/*/` misst Waisenverzeichnisse still als Hauptrepo | Iteration über Dateisystem statt Registrierung (§1) |
| T003069 | Teilweiser `git stash pop` nach Rebase sieht aus wie erfolgreich | Abwesenheit eines Fehlers als Erfolgssignal (git-workflow §0) |
| T003070 | Stash-Stack ist worktree-übergreifend geteilt — als Sicherungsnetz unbrauchbar | falsche Lokalitäts-Annahme (refs/stash liegt im Common-Dir) |
| T003105 | Konfliktfreier Rebase verliert mitcommittete Freshness-Artefakte still | `merge=ours` löst ohne Konfliktmarker zugunsten einer Seite |
| T003131 | write-guard: SID-Modell unterscheidet Subagenten einer Session nicht | Session- vs. Akteur-Identität (dieselbe Annahme wie T003102) |

## What

Ein Change, der die gemeinsamen Werkzeuge und Runbooks um die fehlenden Positiv-Anker
ergänzt. Kein Fix darf auf ein leeres Signal oder die Abwesenheit eines Fehlers bauen —
das etablierte Prinzip aus repo-hygiene-ops §3 ("ein leeres Signal ist kein Urteil") wird
auf den Worktree-/Git-Bereich ausgeweitet.

### Teil 1 — Worktree-Health & Hygiene-Runbook (T002994, T002995, T002998)

- **Neues Skript `scripts/git-worktree-health.sh`** mit Subkommandos:
  - `objects` — 0-Byte-Loose-Objects (`find .git/objects -type f -size 0`) und
    `git fsck --no-reflogs --no-progress`; Exit-Code-Kontrakt wie `worktree-clean-check.sh`
    (0 sauber, 1 Befund, 2 nicht prüfbar); bei Befund wird die dokumentierte Rettungssequenz
    aus T002994 ausgegeben (HEAD aus `logs/HEAD` rekonstruieren, `git rebase --abort`,
    `find .git/objects -type f -size 0 -delete`, `git reflog expire --stale-fix --all`).
  - `orphans` — Differenz zwischen on-disk `.worktrees/*`-Verzeichnissen und
    `git worktree list --porcelain`; die Differenzmenge IST der Befund (Muell oder verlorene
    Arbeit — benennen, nicht still mitzählen).
- **`scripts/worktree-clean-check.sh`**: Dirty-Befund erst nach **zweiter Messung** melden —
  der erste `git status --porcelain`-Lauf nach einem Crash refresht nur den Stat-Cache
  (T002995). Nur was im zweiten Lauf persistent ist, ist ein Befund (Exit 1).
- **`.claude/skills/references/repo-hygiene-ops.md`**:
  - §0: Integritäts-Vorcheck `git-worktree-health.sh objects` vor dem Worktree-/Branch-Lauf;
    Rettungssequenz als dokumentierter Weg.
  - §1: `git worktree list --porcelain` als Iterationsquelle (nicht der Glob); Orphan-Hinweis
    (`git-worktree-health.sh orphans`); Zweitmessung-Regel für Dirty-Befunde.
  - §0 Stash-Inventar: explizit benennen, dass `refs/stash` im Common-Dir liegt und Einträge
    aus beliebigen Worktrees stammen können (T003070-Kontext).
- **`.claude/skills/references/ticket-ops-procedures.md`**: Die Worktree-Schleife (Zeile ~417)
    iteriert über `git worktree list --porcelain` mit `[ -e "$wt/.git" ]`-Guard statt über den
    Glob `[ -d "$wt" ]`.

### Teil 2 — Git-Workflow-Skill-Konventionen: Stash + Rebase (T003069, T003070, T003105)

- **`.claude/skills/git-workflow/SKILL.md` und `.opencode/skills/opencode-git-workflow/SKILL.md`**:
  - Schritt 0: Nach `git stash pop` die **positive** Verifikation `git stash list` — der eigene
    Eintrag MUSS verschwunden sein. Ein verbliebener Eintrag IST der Teil-Pop-Befund (T003069);
    Wiederherstellungspfad dokumentieren (`git stash show --stat "stash@{0}"`,
    `git checkout "stash@{0}" -- <pfad>`).
  - Stash-Disziplin (T003070): Bei Parallelarbeit Wegwerf-Commit auf dem eigenen Branch
    (`git commit -m wip`, später `git reset --soft HEAD~1`) statt Stash; wo ein Stash nötig
    bleibt: `-m` mit Ticket-ID und Auflösung **über die Nachricht**, nie über den Index.
  - Schritt 1 / Rebase (T003105): Nach JEDEM Rebase vor dem Push `task freshness:check`
    erneut laufen lassen (bzw. `git show --stat HEAD -- <artefaktpfade>`); explizit benennen,
    dass `merge=ours` (`.gitattributes`) ohne Konfliktmarker zuschlägt — ein grüner Rebase
    belegt NICHT die Vollständigkeit der Artefakte.
- **Neues Skript `scripts/git-stash-net.sh`** (T003070): nachrichtenbasierte Stash-Operationen —
  `find --by-ticket <id>`, `pop --by-message <pattern>` (findet per Nachricht, droppt nur bei
  vollständiger Anwendung). Referenz für alle Skills.
- **`scripts/worktree-create.sh`**: `_wc_stash_pop_or_warn` poppt per Nachricht
  (`worktree-create-auto-stash`), nicht per `stash@{0}` — der Index ist im geteilten Stack
  nicht stabil (T003070).

### Teil 3 — write-guard-Besitzmodell (T003131)

- **`scripts/hooks/worktree-write-guard.sh`**:
  - `_my_sid` um `OPENCODE_SESSION_ID` ergänzen — `agent-lock.sh` kennt sie bereits
    (`_AGENT_LOCK_SID_ENVS`), der Guard nicht; in opencode-Sessions driftet die SID sonst auf
    den Unix-Session-Fallback und eigene Claims werden als fremd gelesen.
  - Meldezeile "Dieser Session gehoeren:" sagt, WOHER der Besitz stammt
    ("Claims mit dieser SID — eigene Session UND deren Subagenten"), damit sie nicht als
    Eigenbesitz des aufrufenden Akteurs gelesen wird.
  - Regel 2 (Subagent darf in Subagent-Worktree derselben SID schreiben) bleibt als bewusste
    Gegenentscheidung zu T002412 dokumentiert — aber mit präziser Meldung.
- **`scripts/agent-lock.sh`**: Kein Verhaltenswechsel nötig — SID-Felder bleiben SSOT;
    Regressionstests sichern die Feld-Konsistenz (owner_sid in allen Scope-Varianten).

### Teil 4 — Tests

- **`tests/spec/batch-git-worktree-integrity.bats`** (neu): RED-Tests je Teil —
  Ergebnis-basiert (T002448-M4: Assertions auf command output, kein Source-Grep):
  - T002994: Fixture-Repo mit 0-Byte-Object → `git-worktree-health.sh objects` exit=1 + Rettungshinweis
  - T002995: `worktree-clean-check.sh` meldet transienten Dirty nicht (zweiter Lauf sauber)
  - T002998: Orphan-Verzeichnis unter `.worktrees/` → `orphans` meldet es; Glob-Loop-Ersatz greift
  - T003069: Teil-Pop-Szenario → Stash-Liste kürzer um 0 → Befund statt Erfolg
  - T003070: `git-stash-net.sh pop --by-message` findet Eintrag trotz Index-Verschiebung
  - T003105: Rebase mit merge=ours verliert Artefakt → `task freshness:check` rot → Regen-Zyklus dokumentiert
  - T003131: Guard-Meldung nennt SID-Quelle; Dedup; `OPENCODE_SESSION_ID`-Parität

## Prior-Art (T002829)

Bestehende Entscheidungen, die dieser Change zitiert statt neu zu lösen:

- **`openspec/specs/divergence-guard.md`** — Requirement "Divergence-Guard skips the
  auto-stash when a foreign process holds the main checkout dirty" (Zeile 245) und
  "Interrupted git operations in worktrees are surfaced as a finding" regeln bereits Teile von
  T003070/T002994; dieser Change ADDET die nachrichtenbasierte Pop-Variante und den
  Integritäts-Vorcheck, ersetzt nichts.
- **`openspec/specs/agent-skills.md`** — Requirements "repo-hygiene covers the local working
  tree and stashes" (644), "Path-filtered stash inspection uses a two-revision diff" (660),
  "Stash relevance is decided against today's main" (675), "The interrupted-operation check
  precedes the allowlist-filtered cleanliness check" (808): die Stash- und Vorcheck-Regeln
  existieren; dieser Change ergänzt die fehlenden Positiv-Anker (Teil-Pop-Verifikation,
  geteilter Stack, Freshness-nach-Rebase).
- **`scripts/worktree-git-op-guard.sh`** (T002766) — iteriert bereits über
  `git worktree list --porcelain`; das ist das Muster, das T002998 für Runbook-Schleifen
  verlangt. `worktree-create.sh` (T003078/T003097, Commit 665f1926e) hat das
  `git stash pop 2>/dev/null || true`-Verschlucken bereits behoben — offen ist nur die
  Index-Auflösung (T003070).
- **Archiviert `2026-08-10-zielfamilie-worktree-hygiene`** (T002443) — etablierte die
  Positiv-Anker-Regel (n/a statt 0) und `scripts/lib/wt-hygiene-measure.sh` mit
  Porcelain-Iteration. Der G-WT02-Messblock iterierte früher über `.worktrees/*/` und ist
  bereits auf Porcelain umgestellt — `scripts/branch-reaper.sh` und
  `scripts/lib/wt-hygiene-measure.sh` werden in diesem Change **bewusst nicht** angefasst
  (keine Berührung mit den 7 Symptomen; geprüft, keine Änderung nötig).

## Scope-Entscheidungen

1. **Ein Change für alle 7 Kinder** (Batch-Parent T003539): Die Fixes teilen Dateien
   (repo-hygiene-ops.md, beide git-workflow-Skills) — separate Changes würden an denselben
   Dateien kollidieren. Partials decken die Kinder disjunkt ab (D1).
2. **`scripts/git-workflow`-Referenzen**: T003069/T003070/T003105 wirken auf BEIDE
   Skill-Varianten (`.claude/skills/git-workflow/SKILL.md` und
   `.opencode/skills/opencode-git-workflow/SKILL.md`) — opencode ist der aktive Harness,
   Claude Code bleibt SSOT-Zwilling.
3. **Kein `.gitattributes`-Eingriff**: `merge=ours` ist für den Merge-Fall gewollt
   (sonst konfligierte jeder PR); der Fix für T003105 liegt in der Workflow-Regel
   (Freshness-Nachprüfung), nicht im Treiber.
4. **Kein Eingriff in `branch-reaper.sh`**: Analyse ergab keinen Berührungspunkt mit den 7
   Symptomen (kein stash-/worktree-/status-Handling). In der File Structure als geprüft
   dokumentiert, nicht als geändert.
5. **`scripts/git-worktree-health.sh` als Bash, nicht `.mjs`** (Abweichung von der
   touched_files-Skizze T003539): alle Guard-/Vorcheck-Skripte dieses Bereichs sind Bash mit
   Exit-Code-Kontrakt; ein `.mjs`-Einzelschiff wäre eine zweite Konvention.
6. **Stage mit `--hold`**: Der Batch-Plan wird gestaged, aber nicht automatisch dispatched
   (`execution_released=false`). Die Factory soll die Partials erst ausführen, wenn
   `opencode-flow-execute` (oder der Operator) den Plan freigibt — die 7 Kinder sind
   Backlog-Tickets, deren Implementierung als ein PR gebündelt wird.

_Ticket: T003539 (Parent), Kinder: T002994, T002995, T002998, T003069, T003070, T003105, T003131_
