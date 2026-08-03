---
title: "web-audit — Implementation Plan"
ticket_id: T002612
domains: [website, test, llm]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# web-audit — Implementation Plan

_Ticket: T002612_

## File Structure

```
NEU  scripts/web-audit.mjs                            (Orchestrierung der drei Stufen)
NEU  .claude/skills/web-audit/SKILL.md                (Skill-Body)
NEU  tests/spec/website-core/web-audit.bats           (Verhaltensprüfung)
NEU  tests/fixtures/web-audit/route-sample.html       (HTML-Fixture für den Extrakt)
NEU  tests/fixtures/web-audit/axe-sample.json         (axe-Ausgabe, eingefroren)
ÄNDERN  Taskfile.yml                                  (Task `web:audit`, S4-Erreichbarkeit)
```

**S1-Budget.** `scripts/web-audit.mjs` ist neu, `.mjs`-Limit laut
`docs/code-quality/gates.yaml → s1.limits` = **800**. Zielgröße ≤ 400 Zeilen. Der
Semantik-Extraktor ist der wahrscheinlichste Wachstumstreiber; überschreitet die Datei 500
Zeilen, wird er nach `scripts/web-audit/extract.mjs` ausgelagert — echter Split, kein
Zeilen-Zusammenziehen. `.md`, `.bats` und `.html` sind nicht S1-erfasst. Für `Taskfile.yml`
gilt derselbe Vorbehalt wie in T002611: Baseline vor dem Commit prüfen
(`jq -r '."S1:Taskfile.yml".metric' docs/code-quality/baseline.json` gegen `wc -l Taskfile.yml`).

**S3-Hinweis.** Keine Brand-Domain-Literale im Code. Die Ziel-URL wird über `ENV=<brand>`
aufgelöst, wie es `task a11y:axe` bereits tut — der Skill reicht `ENV` durch und liest die
Basis-URL aus der bestehenden Auflösung, statt sie selbst zu bilden.

## Verify (RED → GREEN)

- [ ] **Task 1 — Failing-Test-Step (RED).** `tests/spec/website-core/web-audit.bats` anlegen,
      zusammen mit den beiden Fixtures. Geprüft wird Kommando-Ausgabe (T002448-M4). Szenarien
      aus dem Delta:

      1. Der Semantik-Extrakt aus `route-sample.html` enthält jeden `alt`-Text mit Bild-URL,
         jeden `<meta>`-Tag, die Überschriften-Hierarchie und jedes Link-Label mit Ziel — und
         **kein** Markup. Deterministisch, ohne Netz und ohne Modell.
      2. Der an das Modell gehende Prompt bleibt bei drei Routen unter 32 000 Token.
      3. Jede Chat-Completion-Anfrage trägt `chat_template_kwargs {"enable_thinking": false}`.
      4. Ist `:18235` nicht erreichbar, liefert der Lauf Stufe 1 und 2 vollständig, nennt Stufe 3
         als ausgefallen und beendet mit Exit 0.
      5. Beendet `task a11y:axe` mit Exit ≠ 0, meldet der Lauf den Exit-Code, überspringt die
         Triage der axe-Befunde und führt die semantische Prüfung dennoch aus.

      Positiv-Anker nach T002356-M1 für Szenario 1 („kein Markup im Extrakt"): im selben Test
      zuerst belegen, dass der Extrakt die erwarteten `alt`-Texte **enthält**. Ohne ihn bestünde
      die Negativ-Aussage auch bei einem leeren Extrakt.

```bash
cd /home/patrick/Bachelorprojekt/.worktrees/web-audit
tests/unit/lib/bats-core/bin/bats tests/spec/website-core/web-audit.bats
# expected: FAIL (rot — scripts/web-audit.mjs existiert noch nicht)
```

- [ ] **Task 2 — Stufe 1 und 2 (Delegation).** `task a11y:axe ENV=<brand>` aufrufen und dessen
      JSON einlesen; Lighthouse über die bestehende `lighthouserc.json` fahren. Keine eigenen
      a11y- oder Performance-Regeln definieren. Beide Stufen einzeln ausfallbar, jeder Ausfall
      wird namentlich gemeldet und im Bericht gekennzeichnet.

- [ ] **Task 3 — Semantik-Extraktor.** Die Routen per Playwright rendern und daraus den
      strukturierten Extrakt bilden: `alt`-Texte mit Bild-URL, `<meta>`-Tags,
      Überschriften-Hierarchie, Link-Labels mit Ziel-URL. Rohes oder gekürztes HTML wird **nicht**
      übergeben — eine gerenderte Seite umfasst 50 000 bis 200 000 Token Markup, das Loadout
      fährt rund 99 000 Token Kontext.

      Überschreitet `scripts/web-audit.mjs` dabei 500 Zeilen, wird der Extraktor hier nach
      `scripts/web-audit/extract.mjs` ausgelagert (siehe S1-Budget oben) — echter Split, kein
      Zeilen-Zusammenziehen.

- [ ] **Task 4 — Stufe 3 und Bericht.** Zuerst die Modell-ID aus `GET /v1/models` des llm-proxy
      (`:18235`) beziehen — keine hartkodierte ID; antwortet der Proxy nicht innerhalb des
      Timeouts, wird Stufe 3 als ausgefallen markiert und der Lauf fortgesetzt.
      Dann den Extrakt zusammen mit den Roh-Befunden aus Stufe 1/2
      an das Modell geben. Zwei Ausgaben: die semantischen Befunde (beschreibt der `alt`-Text den
      Bildinhalt, hat die Meta-Description Marken- und Leistungsbezug, sind Link-Labels außerhalb
      ihres Kontexts verständlich) und die begründete Rangliste über die Roh-Befunde.
      Bericht nach `tmp/claude-scratch/web-audit-<brand>-<datum>.md`, Kurzfassung auf stdout.
      Ausgefallene Stufen im Bericht ausdrücklich kennzeichnen.

- [ ] **Task 5 — Skill-Body und Erreichbarkeit.** `.claude/skills/web-audit/SKILL.md` mit
      `description:`-Frontmatter und Taskfile-Eintrag, damit `scripts/web-audit.mjs` nicht als
      S4-Orphan gilt. Der Skill hält fest, dass er **kein** Merge-Gate ist und manuell läuft.

- [ ] **Task 6 — Tests grün.** Der Test aus Task 1 muss nach den Tasks 2–5 bestehen.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/website-core/web-audit.bats
# erwartet: gruen — alle Szenarien inklusive Positiv-Anker
```

- [ ] **Task 7 — Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
