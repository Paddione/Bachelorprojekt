# Proposal: superpowers-namespace

## Why

Die SDLC-Pipeline ruft 11 `superpowers:*`-Skills an 61 Stellen auf. `dev-flow-execute/SKILL.md:99`
macht den Aufruf von `superpowers:executing-plans` zur wörtlichen PFLICHT und hängt die
Ein-Ebenen-Regel gegen verschachtelte Delegation daran auf — eine unerfüllbare Pflicht an genau
der Stelle, die Kontext-Explosion verhindern soll. `dev-flow-plan/SKILL.md:290` sagt „IMMER
aufgerufen".

Die Ursache ist **kein** Konfigurationsfehler. `.claude/settings.json` aktiviert
`superpowers@claude-plugins-official`, und das ist korrekt: jenes Marketplace führt in seinem
Manifest 291 Plugins, `superpowers` darunter. Die Aktivierung war immer richtig — das Plugin war
auf der Maschine schlicht nicht installiert. In opencode konnte es nie auflösen, weil opencode
den Plugin-Satz von Claude Code nicht erbt und `.opencode/opencode.jsonc` superpowers nicht
deklariert.

`scripts/plugin-doctor.sh` (T002651) meldet genau diesen Zustand seit Monaten zutreffend bei jedem
Session-Start. Er blieb folgenlos, weil es **keinen Weg vom Befund zum Zustand** gibt:
`claude plugin install <plugin>@<marketplace>` existiert und wird nirgends im Repo aufgerufen. Der
Befund nennt keine Behebung, also wird er weggeklickt. Zum Zeitpunkt dieses Proposals meldet der
Doctor 15 weitere Einträge derselben zwei Klassen — der Ausfall ist eine Instanz, kein Einzelfall.

Verstärkt wurde die Unsichtbarkeit durch die Dokumentation: die dev-flow-Skills beschreiben
`superpowers:*` durchgängig als „Claude Code — built-in". Ein Builtin kann nicht fehlen, also hat
niemand die Installation geprüft.

## What

1. **opencode nachziehen** — `superpowers@git+https://github.com/obra/superpowers.git` ins
   `plugin`-Array von `.opencode/opencode.jsonc`. Upstream liefert dafür ein eigenes
   `.opencode/INSTALL.md` und verlangt eine je Harness getrennte Installation. Die Datei ist
   getrackt, die Deklaration erreicht damit jeden Clone.
2. **Befund ausführbar machen** — ein `plugins:sync`-Target stellt den maschinenlokalen Zustand
   aus der eingecheckten `enabledPlugins`-Liste her; `plugin-doctor.sh` nennt es bei jedem Befund
   als Behebung. Das schließt die Lücke, an der T002651 stehen geblieben ist.
3. **Trigger-Kollision kuratieren** — die 14 nun geladenen Plugin-Skills konkurrieren per
   Auto-Trigger mit den `dev-flow-*`-Orchestratoren, obwohl diese sie nur als Unterschritt rufen.
4. **`references`-Sperre in opencode lösen** — sie sperrt den normativen Kern von `dev-flow-plan`.
5. **Namenskollision `using-git-worktrees` auflösen** — nach der bestehenden Entscheidung in
   `openspec/specs/agent-skills.md`. Der operative Inhalt des Overrides steht bereits in
   `scripts/worktree-create.sh`; erhaltenswert ist allein das Erfahrungswissen (Detached-HEAD-Falle
   bei Remote-Refs, exit 128 ohne den Helper), das nach `dev-flow-gotchas.md` gehört.
6. **Doku-Umkehr** — „Claude Code — built-in" ist falsch und war die tragende Fehlannahme.
   `OVERVIEW.md:73` behauptet zudem, die Disziplin-Schritte seien inlined und hätten „keine eigenen
   Skill-Verzeichnisse mehr"; `CLAUDE.md:49` behauptet eine dritte Variante. `OVERVIEW.md` nennt
   die opencode-Symlinks außerdem noch `opencode-flow-*` (T013724) statt `dev-flow-*` (T014086).

## Non-Goals

- **Kein Rückbau von `.opencode/skills/dev-flow/`** — enthält mit `worktree.ts` aktiv genutzten
  Plugin-Code (`opencode.jsonc:22-24`: „The repo's own plugin is kept"). Eigenes Ticket.
- **Keine Nachinstallation der übrigen 15 Doctor-Befunde** — `plugins:sync` macht sie behebbar;
  welche davon gewollt sind, ist eine Kurationsentscheidung und nicht Teil dieses Fixes.
- **Keine Marketplace-Zugehörigkeitsprüfung** — sie war die Antwort auf eine vermutete Ursache
  (falscher Namespace), die sich nicht bestätigt hat.
- Nicht enthalten: die zwei toten `infra-ops`-Verweise, die fehlende `sdlc-autopilot`-Registrierung
  und die `web-audit`-Zeile in der AGENTS.md-Map.

_Ticket: T900056_
