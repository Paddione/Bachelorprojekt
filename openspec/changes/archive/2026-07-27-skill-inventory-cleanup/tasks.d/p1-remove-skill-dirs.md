# p1 — Skill-Verzeichnisse entfernen

Rolle: `impl`. Keine Abhängigkeit. Muss vor p2, p3 und p4 laufen.

`target_files`: die 11 Skill-Verzeichnisse unter `.claude/skills/` plus `skills-lock.json`.

## Aufgaben

- [ ] **P1.1 — Vorzustand festhalten.** Der Ist-Wert wird in p2 und p3 als Soll-Zähler gebraucht:

```bash
git ls-files -- .claude/skills | grep -c '/SKILL\.md$'   # erwartet vorher: 39
```

- [ ] **P1.2 — Die 11 getrackten Verzeichnisse entfernen.** `git rm -r`, nicht `rm` — sonst
      bleibt der Index stehen:

```bash
git rm -r -q \
  .claude/skills/test-driven-development \
  .claude/skills/verification-before-completion \
  .claude/skills/requesting-code-review \
  .claude/skills/superpowers-brainstorming \
  .claude/skills/superpowers-writing-plans \
  .claude/skills/superpowers-executing-plans \
  .claude/skills/llm-ops \
  .claude/skills/gguf-quantization \
  .claude/skills/llama-cpp \
  .claude/skills/speculative-decoding \
  .claude/skills/unsloth
```

- [ ] **P1.3 — Nachzustand verifizieren.** Muss exakt 28 sein; jede Abweichung bedeutet, dass
      ein Verzeichnis mehrere `SKILL.md` enthielt oder eines nicht getrackt war:

```bash
git ls-files -- .claude/skills | grep -c '/SKILL\.md$'   # erwartet: 28
```

- [ ] **P1.4 — `skills-lock.json` bereinigen.** Die Datei hält Herkunft und Hash extern bezogener
      Skills. Der Eintrag `llama-cpp` (`firecrawl/ai-research-skills`) verweist nach P1.2 auf ein
      nicht mehr existierendes Verzeichnis. `lavish` und `vitest` bleiben unangetastet:

```bash
jq 'del(.skills["llama-cpp"])' skills-lock.json > /tmp/skills-lock.json \
  && mv /tmp/skills-lock.json skills-lock.json
jq -r '.skills | keys[]' skills-lock.json   # erwartet: lavish, vitest
```

- [ ] **P1.5 — Ungetrackte Skills dokumentieren, nicht löschen.**
      `.claude/skills/haniakrim21-everything-claude-code-react-bits/` (Frontmatter-Name
      `react-bits`) und `.claude/skills/whisper/` sind **nicht** von git getrackt — lokal per
      market-cli installiert. Ein Commit kann sie nicht entfernen. Hier nur den Ist-Zustand
      erheben; die Dokumentation erfolgt in p2 (OVERVIEW.md):

```bash
for d in haniakrim21-everything-claude-code-react-bits whisper; do
  git ls-files --error-unmatch ".claude/skills/$d/SKILL.md" >/dev/null 2>&1 \
    && echo "getrackt: $d" || echo "ungetrackt (manueller Schritt): $d"
done
```

## Abnahmekriterien

- Getrackte `SKILL.md` unter `.claude/skills/`: exakt 28.
- `skills-lock.json` enthält genau die Schlüssel `lavish` und `vitest`.
- Kein `rm` ohne `git rm` — `git status --porcelain` zeigt keine ungetrackten Reste der 11
  entfernten Verzeichnisse.
