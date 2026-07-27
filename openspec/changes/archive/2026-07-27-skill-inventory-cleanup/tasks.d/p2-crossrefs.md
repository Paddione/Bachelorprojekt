# p2 — Querverweise auf die entfernten Skills umschreiben

Rolle: `impl`. `depends_on: p1`. Läuft unabhängig von p3.

`target_files`: `.claude/skills/OVERVIEW.md`, `.claude/skills/dev-flow-plan/SKILL.md`,
`.claude/skills/dev-flow-execute/SKILL.md`, `.claude/skills/infra-ops/SKILL.md`,
`.claude/agents/bachelorprojekt-ops.md`.

Leitregel: ein Verweis auf einen entfernten Stub wird **nicht gelöscht, sondern umgeschrieben**
auf das echte Ziel. Ersatzloses Streichen würde die Anweisung mit entfernen, die der Stub
transportierte.

## Aufgaben

- [ ] **P2.1 — `OVERVIEW.md`: Zähler korrigieren.** Zeile 3 behauptet aktuell
      „39 project-local skills". Nach p1 sind es 28 getrackte. G-AGENTIC06 misst den Betrag der
      Differenz zwischen dieser Behauptung und `git ls-files`; jede andere Zahl kippt das Gate:

```bash
git ls-files -- .claude/skills | grep -c '/SKILL\.md$'   # Soll-Wert für den Text
grep -n 'project-local skills' .claude/skills/OVERVIEW.md
```

- [ ] **P2.2 — `OVERVIEW.md`: Sektion der entfernten Skills bereinigen.** Die in T001804
      angelegte Registrierungs-Sektion für Drittanbieter- und ML-Skills listet `unsloth`,
      `gguf-quantization` und `speculative-decoding`. Diese drei Zeilen entfallen;
      `ui-ux-pro-max` bleibt stehen.

- [ ] **P2.3 — `OVERVIEW.md`: ungetrackte Skills erfassen.** Neue Notiz, die
      `haniakrim21-everything-claude-code-react-bits` (Name `react-bits`) und `whisper` als
      lokal installiert und ungetrackt ausweist, mit dem Hinweis, dass ihre Entfernung ein
      manueller Schritt auf dem Entwicklungsrechner ist. Ohne diese Notiz bleibt die Differenz
      zwischen dem, was eine Session listet, und dem, was das Repo kontrolliert, unsichtbar.

- [ ] **P2.4 — `dev-flow-plan/SKILL.md`.** Zwei Stellen verweisen auf Stubs: der
      „Verwandte Skills"-Block nennt `superpowers:brainstorming` mit dem Zusatz
      „Stub in `.claude/skills/superpowers-brainstorming/` für opencode-Kompatibilität", analog
      für `superpowers:writing-plans`. Der Skill-Name bleibt, der Stub-Hinweis entfällt und wird
      durch den tatsächlichen opencode-Pfad ersetzt (die Schritte sind in
      `opencode-flow-plan` inlined — das steht bereits im Fließtext des Skills):

```bash
grep -n 'superpowers-brainstorming\|superpowers-writing-plans' .claude/skills/dev-flow-plan/SKILL.md
```

- [ ] **P2.5 — `dev-flow-execute/SKILL.md`.** Verweist auf `test-driven-development`,
      `verification-before-completion`, `requesting-code-review` und
      `superpowers-executing-plans`. Für Claude Code werden die Plugin-Namen
      (`superpowers:test-driven-development`, `superpowers:verification-before-completion`,
      `superpowers:requesting-code-review`, `superpowers:executing-plans`) eingesetzt; der
      opencode-Pfad zeigt auf die inlinierten Schritte in diesem Skill selbst und in `vitest`:

```bash
grep -n 'test-driven-development\|verification-before-completion\|requesting-code-review\|superpowers-executing-plans' \
  .claude/skills/dev-flow-execute/SKILL.md
```

- [ ] **P2.6 — `infra-ops/SKILL.md` und `.claude/agents/bachelorprojekt-ops.md`.** Beide nennen
      `llm-ops` als eigenständigen Skill. Da `llm-ops` bereits ein Grabstein war, der auf
      `infra-ops` §5 zeigte, wird der Verweis durch die direkte Nennung von `infra-ops` §5
      ersetzt. In `infra-ops/SKILL.md` selbst ist die Erwähnung ein Rückverweis auf den
      archivierten Vorgänger und entfällt ersatzlos.

- [ ] **P2.7 — Verwaisungs-Kontrolle (G-AGENTIC07).** Nach dem Umschreiben prüfen, dass kein
      **verbleibender** Skill mit `description`-Feld seine letzte Referenz verloren hat. Das
      Gate zählt genau diesen Fall:

```bash
for f in $(git ls-files -- .claude/skills | grep '/SKILL\.md$'); do
  n=$(basename "$(dirname "$f")")
  grep -q '^description:' "$f" || continue
  hits=$(grep -rl -- "$n" CLAUDE.md AGENTS.md .claude/skills/OVERVIEW.md \
          $(git ls-files -- .claude/skills | grep '/SKILL\.md$' | grep -v "^$f$") 2>/dev/null | wc -l)
  [ "$hits" -eq 0 ] && echo "VERWAIST: $n"
done
# erwartet: keine Ausgabe
```

## Abnahmekriterien

- Kein Vorkommen der 11 entfernten Skill-Namen mehr in den fünf `target_files`.
- Der in `OVERVIEW.md` behauptete Zähler ist gleich der Ausgabe von
  `git ls-files -- .claude/skills | grep -c '/SKILL\.md$'`.
- Die Verwaisungs-Kontrolle aus P2.7 gibt nichts aus.
- Jeder umgeschriebene Verweis nennt ein existierendes Ziel — kein Verweis wurde ersatzlos
  gestrichen, der zuvor eine Handlungsanweisung trug.
