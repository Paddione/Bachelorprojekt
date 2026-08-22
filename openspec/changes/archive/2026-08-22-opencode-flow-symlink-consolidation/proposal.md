# Proposal: opencode-flow-symlink-consolidation

## Why

Die drei `opencode-flow-*`-Skills sind historische Kopien der `dev-flow-*`-Skills und
seit T013482 (Lifecycle-Contract) um 565/605/203 Zeilen vom kanonischen Stand abgedriftet.
Jeder Lifecycle-Change muss doppelt gepflegt werden; die opencode-Seite ist bereits
veraltet. Der `openspec-*`-Skill-Satz zeigt seit langem das bessere Muster: eine Quelle
unter `.claude/skills/`, per Symlink unter beiden Harnesses geladen. Die Voraussetzung
dafür — harness-neutrale Quellen — fehlt nur noch an zwei Stellen: `dev-flow-execute`
nennt rohes Claude-Dispatch-Syntax (`subagent_type`) außerhalb einer klar gelabelten
Harness-Matrix, und `dev-flow-plan` verweist in Selbstbeschreibungen noch auf
`opencode-flow-plan` als eigenständige Datei.

## What

- `dev-flow-execute`: die zwei rohen `subagent_type:`-Vorkommen in neutrale
  Formulierungen überführen (die bestehende Gemini/Claude/opencode-Bullet-Matrix bleibt
  erhalten; Claude-spezifische Modell-Tiers bleiben im Claude-Bullet).
- `dev-flow-plan`: fehlende Guard-Anker ergänzen (`scripts/plan-intel.sh`,
  `agent-collision.sh check --branch` / T002444), die zwei stale Selbstreferenzen auf
  `opencode-flow-plan` korrigieren und die opencode-Delegation (`background-agents.ts`)
  explizit nennen.
- Die drei `.opencode/skills/opencode-flow-{plan,execute,chore}`-Verzeichnisse durch
  Directory-Symlinks auf die `dev-flow-*`-Quellen ersetzen (gleiche Technik wie
  `openspec-*`). `opencode-git-workflow` bleibt eine echte Datei (209 Zeilen eigene
  opencode-Glue-Prosa: worktree.ts-Limitierung, git-crypt-safe Wrapper).
- Spec-Delta auf `harness-workflow-split`: Requirement 1 von „vier native Skills“ auf
  „drei Symlinks + ein nativer Skill, alle Claude-tool-frei“ umschreiben; BATS-Guard
  HWS-1..5 entsprechend anpassen.
- `.opencode/opencode.jsonc`: die vier `dev-flow-*`-Denies entfernen, damit
  skill-interne Querverweise (`dev-flow-execute`, `git-workflow`) in opencode auflösen;
  Kommentar auf die Shared-Source-Arrangement umstellen.
- AGENTS.md-Routing-Text, `plan-guards.yaml` applies_to (auf kanonische Quelle),
  `tools.yaml`-Eintragstext und generierte Maps nachziehen.

_Ticket: T013724_
