# Proposal: mishap-t002240

## Why

Drei Mishaps aus dem ticket-ops-Lauf vom 2026-07-26, die alle die Commit-/Push-Leitplanken
und die Teststabilität betreffen:

- **M1** — `git commit` und `git push` standen auf getrennten Zeilen desselben Shell-Blocks.
  Ein pre-commit/commit-msg-Gate lehnte den Commit ab (`✗ unknown scope 'agents'`), der Push
  lief trotzdem und legte einen **leeren Branch** auf origin an. Zwei Sichtungen am selben
  Tag; beide nur durch ein anschliessendes `git log --oneline -1` aufgefallen. Ein PR aus
  einem solchen Branch ist ein No-op mit gruener CI. Zusaetzlich kostet die Scope-Ablehnung
  eine unnoetige Runde, weil sie bei 94 registrierten Scopes nur auf
  `validate-commit-msg.sh scopes` verweist statt den naechsten Treffer zu nennen.
- **M2** — `FA-SF-72: eval.mjs --replay --dry-run …` in `tests/spec/software-factory.bats`
  war zustandsabhaengig flaky und wurde auf `main` (T002182) mit `skip` stillgelegt. Da
  T002182 alle 132 `tests/spec/*.bats` hinter einen Required Check stellt, wird aus einem
  seltenen Aerger ein zufaellig zuschlagender Merge-Blocker — bzw. ein Anreiz, rote Builds
  wegzudruecken statt zu lesen.
- **M3** — `.githooks/pre-commit` verlangt eine **case-sensitive** Ticket-ID im Branch-Namen
  (`[[ "$_bn" =~ T[0-9]{6,} ]]`), waehrend `mishap-tracker` Step 3.5 einen komplett
  lowercase Slug vorschreibt und diesen auch als Branch-Namen verwendet. `chore/mishap-t002239`
  wird damit abgelehnt — Step 3.5 kann so nie durchlaufen. Live reproduziert beim Stagen von
  T002239; der abgelehnte Commit fuehrte per M1 direkt zum leeren Branch auf origin.

## What

- `.githooks/pre-push`: Empty-Branch-Guard. Ein **neu anzulegender** Remote-Branch ohne
  Commits vor `origin/main` wird abgelehnt (`SKIP_EMPTY_BRANCH_CHECK=1` als Bypass); ein
  bereits existierender Branch ohne neue Commits bekommt nur eine Warnung. Neue Branches
  **mit** Commits und Branch-Loeschungen sind unberuehrt.
- `scripts/validate-commit-msg.sh`: „did you mean"-Vorschlag fuer unbekannte Scopes ueber
  Praefix-, Common-Prefix- und Substring-Matching gegen die Scope-Liste. Ohne plausiblen
  Treffer wird bewusst **kein** Vorschlag ausgegeben.
- `scripts/factory/eval-replay.mjs`: Der `--dry-run`-Pfad legt keinen echten Worktree mehr an,
  sondern prueft den `base_commit` lokal. Das entfernt die einzige geteilte, veraenderliche
  Zustandsquelle des Tests (`worktree-create.sh` synchronisiert das **gesamte** Repository)
  und damit die Ursache des Flakes — der `skip` in `software-factory.bats` faellt weg.
- `.claude/skills/mishap-tracker/SKILL.md`: Slug (lowercase, fuer `openspec/changes/<slug>`)
  und Branch (`chore/mishap-<ext-id>`, Ticket-ID unveraendert) sind jetzt zwei getrennte,
  explizit dokumentierte Werte inkl. Warnung vor der Case-Sensitivity-Falle und der
  `&&`-Verkettungspflicht.
- Regressionstests in `tests/spec/t001356-git02-conventional-commit.bats` (M1, M3) und
  `tests/spec/software-factory.bats` (M2).

_Ticket: T002240_
