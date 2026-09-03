---
title: superpowers in beiden Harnesses verfügbar machen und den Doctor-Befund behebbar machen
ticket_id: T900056
domains: [agents, skills, tooling]
status: plan_staged
---

# superpowers-namespace — Implementation Plan

## File Structure

```
.opencode/opencode.jsonc                                    M   plugin-Array + skill-Kuration
scripts/plugin-doctor.sh                                    M   Behebungszeile pro Befund
taskfiles/Taskfile.agents.yml                               M   plugins:sync neben plugins:check
.claude/skills/superpowers/using-git-worktrees/SKILL.md     D   Namenskollision
.claude/skills/references/dev-flow-gotchas.md               M   gerettetes Erfahrungswissen
.claude/skills/dev-flow-plan/SKILL.md                       M   Provider statt "built-in"
.claude/skills/dev-flow-execute/SKILL.md                    M   Provider statt "built-in"
.claude/skills/references/dev-flow-plan-phases.md           M   Provider statt "built-in"
.claude/skills/OVERVIEW.md                                  M   Schicht-Kontrakt + Symlink-Namen
CLAUDE.md                                                   M   dritte Variante angleichen
tests/spec/agent-skills/superpowers-harness-parity.bats     A   Guard (liegt bereits vor, rot)
```

**Zeilenbudgets** (wirksame Schwelle ermittelt; keine der Dateien ist in
`docs/code-quality/baseline.json` gebaselined, also gilt das statische Limit):

| Datei | Ist | Wirksame Schwelle | Budget |
|---|---|---|---|
| `scripts/plugin-doctor.sh` | 120 | 800 (S1 `.sh`) | 680 |
| `taskfiles/Taskfile.agents.yml` | 349 | kein S1-Limit für `.yml` | — |
| `.claude/skills/dev-flow-execute/SKILL.md` | 392 | **400 (G-AGENTIC09)** | **8** |
| `.claude/skills/dev-flow-plan/SKILL.md` | 305 | 400 (G-AGENTIC09) | 95 |
| `.claude/skills/OVERVIEW.md` | 251 | kein Gate (nicht `<dir>/SKILL.md`) | — |
| `.claude/skills/references/dev-flow-gotchas.md` | 147 | kein Gate (keine SKILL.md) | — |

> **`dev-flow-execute/SKILL.md` hat 8 Zeilen Budget.** Die Ersetzung der
> „built-in"-Formulierung dort MUSS netto zeilenneutral sein — Formulierung tauschen, nicht
> ergänzen. G-AGENTIC09 zählt SKILL.md-Dateien über 400 Zeilen und ist auf `eq 0` gesetzt.

---

## M1 — Rotphase belegen

- [x] **T1.1** Guard ausführen und Rot dokumentieren.
      `tests/spec/agent-skills/superpowers-harness-parity.bats` liegt bereits vor und deckt alle
      sechs Zielzustände ab.

      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/superpowers-harness-parity.bats
      ```

      expected: FAIL — sechs Tests, jeder mit eigener Diagnose: `NOT_DECLARED` (opencode),
      kein `plugins:sync`-Target, Doctor-Befund ohne Behebung, `CURATION` (writing-plans/
      executing-plans nicht deny, references deny), `BUILTIN_CLAIM` (5 Fundstellen),
      `COLLISION` (using-git-worktrees).

## M2 — opencode: Deklaration und Skill-Kuration

- [x] **T2.1** In `.opencode/opencode.jsonc` das `plugin`-Array um
      `"superpowers@git+https://github.com/obra/superpowers.git"` ergänzen, mit Kommentar auf
      `.opencode/INSTALL.md` des Upstream und dem Hinweis, dass opencode den Plugin-Satz von
      Claude Code nicht erbt.
- [x] **T2.2** Im `skill`-Block `"writing-plans": "deny"` und `"executing-plans": "deny"`
      ergänzen. Begründung als Kommentar: beide werden von `dev-flow-plan`/`-execute` als
      Unterschritt gerufen; als Einstieg würden sie Ticket, Worktree, plan-lint und stage-plan
      überspringen.
- [x] **T2.3** `"references": "deny"` entfernen. Die Sperre nimmt opencode den Zugang zu
      `dev-flow-plan-phases.md`, `plan-quality-gates.md` und `plan-intel-bundle.md` — dem
      normativen Kern der geteilten dev-flow-Skills.
- [x] **T2.4** Prüfen, ob `.opencode/package.json` einen Eintrag braucht. Die bisherigen
      `plugin`-Einträge sind npm-Namen mit Gegenstück in `dependencies`; ein `git+https`-Eintrag
      wird von opencode aufgelöst und ggf. in einer Lockfile gepinnt. Ergebnis im Commit
      festhalten — kein stilles Weglassen.

      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/superpowers-harness-parity.bats \
        -f "beiden Harnesses deklariert"
      tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/superpowers-harness-parity.bats \
        -f "Disziplin-Skills"
      ```

## M3 — Vom Befund zur ausführbaren Behebung

- [x] **T3.1** In `taskfiles/Taskfile.agents.yml` das Target `plugins:sync` **direkt neben dem
      bestehenden `plugins:check`** (Zeile 336, T002651) anlegen — voller Name
      `agents:plugins:sync`. Es liest die `enabledPlugins`-Map aus `.claude/settings.json`,
      ermittelt über `~/.claude/plugins/installed_plugins.json` die fehlenden Einträge und ruft
      für jeden `claude plugin install <plugin>@<marketplace>` auf. Ohne Claude-Home beendet es
      sich mit Hinweis und Exit 0 — dieselbe Semantik wie `plugin-doctor.sh`, damit CI nicht rot
      wird.

      > Kein neues Taskfile und kein `includes:`-Eintrag: `plugins:check` wohnt bereits in
      > `Taskfile.agents.yml`, und Prüfung und Behebung derselben Sache gehören nebeneinander.

- [x] **T3.2** `claude plugin install` ist nicht auf jeder Maschine vorhanden. Das Target prüft
      `command -v claude` und bricht mit verständlicher Meldung ab, statt in einen
      Shell-Fehler zu laufen.
- [x] **T3.3** `scripts/plugin-doctor.sh` so erweitern, dass jeder gemeldete Befund
      `task agents:plugins:sync` als Behebung nennt. Der Exit-Code-Vertrag (0 sauber/nicht anwendbar, 1 Befund,
      2 unlesbares JSON) bleibt unverändert, ebenso das `--json`-Schema — es kommt ein Feld hinzu,
      keins fällt weg.
- [x] **T3.4** `tests/spec/agent-skills/plugin-activation.bats` gegenlesen: die bestehenden
      Fixture-Tests dürfen durch die zusätzliche Ausgabezeile nicht brechen.

      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/plugin-activation.bats
      tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/superpowers-harness-parity.bats \
        -f "ausfuehrbaren Weg"
      ```

## M4 — Namenskollision auflösen

- [ ] **T4.1** Das Erfahrungswissen aus `.claude/skills/superpowers/using-git-worktrees/SKILL.md`
      nach `.claude/skills/references/dev-flow-gotchas.md` übernehmen: die Detached-HEAD-Falle bei
      `git worktree add <remote-ref>` (T001974 Mishap 1) und der Grund, warum ein bare
      `git worktree add` seit git-crypt mit exit 128 stirbt. **Nicht** übernehmen, was
      `scripts/worktree-create.sh` bereits tut — Pull-First steckt dort in Zeile 246, die
      git-crypt-Behandlung im ganzen Skript.
- [ ] **T4.2** Verzeichnis `.claude/skills/superpowers/` entfernen. Nach
      `openspec/specs/agent-skills.md` darf genau ein Skill auf einen Namen antworten; das Plugin
      liefert `using-git-worktrees` selbst.
- [ ] **T4.3** Verweise auf den Pfad nachziehen — `OVERVIEW.md` verlinkt ihn, `git-workflow/SKILL.md`
      nennt ihn in seiner Tabelle. Nach der Löschung würde `skill-path-references.bats` sonst rot.

      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/skill-path-references.bats
      tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/superpowers-harness-parity.bats \
        -f "Namenskollision"
      ```

## M5 — Doku-Umkehr

- [ ] **T5.1** Die fünf „built-in"-Fundstellen auf den tatsächlichen Provider umstellen:
      `dev-flow-execute/SKILL.md:106`, `dev-flow-plan/SKILL.md:290` und `:291`,
      `references/dev-flow-plan-phases.md:70` und `:363`. Formulierung: das superpowers-Plugin
      liefert den Skill; fehlt es, meldet `plugin-doctor.sh` das und `task plugins:sync` behebt es.
      **In `dev-flow-execute/SKILL.md` zeilenneutral** (Budget 8, siehe oben).
- [ ] **T5.2** `OVERVIEW.md` Schicht-Kontrakt (Zeile 73) korrigieren: die Disziplin-Schritte sind
      **nicht** inlined, sie kommen aus dem Plugin. Im selben Zug die opencode-Symlinks von
      `opencode-flow-*` (T013724) auf `dev-flow-*` (T014086) richtigstellen — `AGENTS.md:170`
      führt den Endzustand bereits.
- [ ] **T5.3** `CLAUDE.md:49` an dieselbe Aussage angleichen; dort steht derzeit eine dritte
      Variante.
- [ ] **T5.4** `git-workflow/SKILL.md` Tabelle: `superpowers:using-git-worktrees` und
      `superpowers:finishing-a-development-branch` als Plugin-Skills kennzeichnen.

      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/superpowers-harness-parity.bats \
        -f "Harness-Builtin"
      bash scripts/health-goals-check.sh 2>&1 | grep -E 'G-AGENTIC0[69]'
      ```

## M6 — Verifikation

- [ ] **T6.1** Vollständigen Guard grün fahren.

      ```bash
      tests/unit/lib/bats-core/bin/bats tests/spec/agent-skills/superpowers-harness-parity.bats
      ```

- [ ] **T6.2** Symlink-Integrität prüfen. Dieses Repo wird unter `core.symlinks=false`
      ausgecheckt; `.opencode/skills/dev-flow-*` sind getrackte Directory-Symlinks (Mode 120000)
      und liegen lokal als Textdateien vor. Der Commit darf keinen davon in eine reguläre Datei
      verwandeln.

      ```bash
      git ls-files -s .opencode/skills | awk '$1 != "120000" && $2 != "" {print "KEIN SYMLINK MEHR: " $4}'
      git diff --cached --name-only | grep -F '.opencode/skills/dev-flow' || echo "keine Symlink-Datei gestaged"
      ```

- [ ] **T6.3** Abschluss-Verifikation.

      ```bash
      task test:changed
      task freshness:regenerate
      task freshness:check
      ```
