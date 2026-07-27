---
title: "skill-inventory-cleanup — Design"
ticket_id: "T002302"
plan_ref: openspec/changes/skill-inventory-cleanup/tasks.md
domains:
  - "agent-config"
  - "skills"
status: active
date: 2026-07-27
---

# skill-inventory-cleanup — Design

Kind K3 von Epic **T002299**. Dekompositions-Spec:
`docs/superpowers/specs/2026-07-27-agent-resources-rework-design.md`.

## Ausgangslage

39 getrackte `SKILL.md` unter `.claude/skills/`, dazu zwei ungetrackte lokal installierte.
Belegt durch `git ls-files -- .claude/skills | grep -c '/SKILL\.md$'` → 39.

## Entscheidungen

### D1 — Was fällt, was bleibt

| Gruppe | Skills | Entscheidung | Begründung |
|---|---|---|---|
| STUBs ohne Spec | `test-driven-development`, `verification-before-completion`, `requesting-code-review`, `superpowers-brainstorming` | fällt | 27 Zeilen reiner Redirect; Claude Code hat die echten Skills als Plugin, opencode denyt sie ohnehin |
| STUBs mit Spec + BATS | `superpowers-writing-plans`, `superpowers-executing-plans` | fällt, Tests umgebaut | siehe D2 |
| Grabstein | `llm-ops` | fällt | `archived: true`, Inhalt in `infra-ops` §5 |
| Vendor, fachfremd | `gguf-quantization`, `llama-cpp`, `speculative-decoding`, `unsloth` | fällt | ML-Training/Quantisierung; das Repo betreibt Inferenz, das ist `infra-ops` §5 |
| Vendor, ungetrackt | `haniakrim21-…-react-bits`, `whisper` | manueller Schritt | git kennt sie nicht — ein PR kann sie nicht löschen |
| Vendor, projektrelevant | `gitops-*`, `vitest`, `lavish`, `update-dependencies`, `ui-ux-pro-max` | bleibt | echter Bezug (Flux, website-Tests, Plan-Review-UI) |

### D2 — Die zwei spec'd Stubs

`superpowers-writing-plans` und `superpowers-executing-plans` haben je einen SSOT-Spec und eine
BATS-Datei. Die BATS-Dateien sind zweigeteilt:

- Tests 1–5 prüfen den Stub selbst (existiert, `[STUB]`-Marker, Framework-Mapping-Tabelle,
  Redirect-Ziel). Diese verschwinden mit dem Stub.
- Tests 6–9 prüfen `dev-flow-plan` bzw. `dev-flow-execute` direkt: dass der Plan-Skill die
  plan-lint-Regeln nennt, Schritt 3.7 referenziert und die Frontmatter-Keys aufführt; dass der
  Execute-Skill den Worktree-Isolations-Check, den Branch-Guard und `gh pr merge --squash`
  enthält. Das ist echte Regressionsabsicherung und bleibt erhalten.

**Entscheidung:** Tests 6–9 wandern nach `tests/spec/dev-flow-plan.bats` (existiert bereits) und
`tests/spec/dev-flow-execute.bats` (neu anzulegen, per BATS-Konvention ein File je SSOT-Spec —
`openspec/specs/dev-flow-plan.md` existiert, das Execute-Pendant bekommt seine Datei). Die beiden
alten BATS-Dateien und ihre SSOT-Specs werden entfernt; die entfallende Anforderung wird im
Delta unter `agent-skills` als REMOVED dokumentiert.

**Verworfen:** die zwei Stubs stehen lassen. Das hätte die Namenskollision bei zwei von drei
Fällen konserviert.
**Verworfen:** alles ersatzlos löschen. Das hätte acht Tests verloren, die nichts mit dem Stub
zu tun haben.

### D3 — Reihenfolge der Partials

Vier Partials mit disjunkten Dateimengen. Der Schnitt folgt der Kopplungsrichtung: erst die
Verzeichnisse weg (p1), dann die Verweise darauf (p2), dann die Harness- und Goal-Konfiguration,
die Zählwerte behauptet (p3), zuletzt Tests und generierte Artefakte (p4).

p3 muss nach p1 laufen, weil G-AGENTIC06 gegen den Ist-Zustand von `git ls-files` misst — eine
korrigierte Zahl in `OVERVIEW.md` vor der Löschung wäre genauso falsch wie die alte.

### D4 — Generierte Artefakte

`k3d/docs-content-built/` enthält vorgebautes HTML mit ~24 Seiten je gelöschtem Skill. Es wird
von `node scripts/build-docs.mjs` erzeugt und über `task docs:deploy` als Image ausgerollt —
`docs:sync` funktioniert nicht (read-only rootfs). Der Rebuild gehört in p4, das Ausrollen ist
ein Post-Merge-Schritt außerhalb dieses Changes.

`website/src/lib/goals-data.generated.json` wird von `scripts/gen-goals-data.mjs` aus
`.claude/lib/goals.md` erzeugt und läuft über `task freshness:regenerate` mit.

## Risiken

| Risiko | Abfederung |
|---|---|
| G-AGENTIC06 kippt, weil `OVERVIEW.md` die alte Zahl behauptet | p3 setzt den Zähler auf den nach p1 gemessenen Ist-Wert; p4 verifiziert per `task freshness:check` |
| Ein verbleibender Skill verliert seine letzte Referenz und wird von G-AGENTIC07 als verwaist gezählt | p2 prüft nach dem Entfernen der Querverweise, dass jeder verbleibende Skill mit `description` noch mindestens einmal referenziert ist |
| `openspec:validate` schlägt fehl, weil zwei SSOT-Specs verschwinden | Delta dokumentiert sie als REMOVED; p4 führt `task openspec:validate` aus |
| Ein aktiver Change (`openspec/changes/unified-llm-gateway/`) referenziert `llama-cpp` | nur Prosa-Erwähnungen in einem fremden, laufenden Change — nicht anfassen; der Skill-Wegfall macht die dortigen Aussagen nicht falsch |
