---
ticket_id: T001383
plan_ref: openspec/changes/factory-branch-switch-guard/tasks.md
status: active
date: 2026-07-01
---

# Design: Factory-Prozess Branch-Wechsel im geteilten main-Checkout verhindern

**Ticket:** T001383
**Branch:** fix/t001383-factory-branch-switch-guard
**Datum:** 2026-07-01

---

## 1. Problem

Der Ticket-Titel ("Factory-Prozess Branch-Wechsel im geteilten main-Checkout verhindern")
kam ohne Beschreibung in `triage`. Root-Cause-Recherche (Audit von `scripts/factory/*`)
ergab: **kein Live-Bug** — `scripts/factory/pipeline.js` isoliert jede Ticket-Implementierung
korrekt in einem dedizierten Worktree (`scripts/worktree-create.sh`) und rührt `main`s HEAD
nie an. Die übrigen Factory-Skripte (`dispatcher-prep.sh`, `factory-prep-bridge.sh`,
`factory-prep-runner.sh`, `watchdog.sh`, `cleanup.sh`, `guards.sh`, `readiness-check.sh`,
`schedule.sh`) laufen zwar im geteilten main-Checkout (`cd $REPO`), aber nur mit
Lese-/Verwaltungsoperationen (`git ls-remote`, `git show origin/<branch>:<path>`,
`git worktree list/remove/prune`, `git branch -D <branch>`, `git diff origin/main...<ref>`)
— keine `git checkout`/`git switch`.

Das Ticket ist damit **präventiv/hardening**: es soll strukturell garantiert werden, dass
diese Bug-Klasse nie eingeführt wird (weder durch künftigen Factory-Code noch durch eine
Session, die während eines Factory-Laufs manuell im main-Checkout die Branch wechselt).

### Bestehende Session-Koordination (T000510) — Ausgangslage

- `.githooks/pre-commit` → `agent-lock.sh guard-precommit`: **harter Block** (Exit 1) für
  Commits im main-Checkout, wenn eine andere lebende Session den `main-checkout`-Lock hält.
- `.githooks/post-checkout` → `agent-lock.sh guard-postcheckout`: **nur Warnung** (nie
  Exit ≠ 0) bei Branch-Switch im main-Checkout während eine Fremd-Session den Lock hält.
  Bewusst so entschieden (docs/superpowers/specs/2026-06-08-agent-session-coordination-design.md,
  Abschnitt "G-B").
- Der `main-checkout`-Lock wird in der Praxis **fast nie aktiv geclaimt** — nur
  `.claude/skills/dev-flow-chore/SKILL.md` erwähnt `claim main-checkout` als Empfehlung,
  kein Skript ruft es automatisch auf. Das Lock-Feld `branch` (welche Branch die Lock-haltende
  Session als "richtig" für main betrachtet) ist damit i.d.R. leer.

### Kritische Git-Einschränkung

Git hat **keinen blockierenden `pre-checkout`-Hook**. `post-checkout` feuert erst, NACHDEM
HEAD und Working Tree bereits umgeschaltet sind. Ein "harter Block" kann technisch nur als
**Revert danach** (`git checkout <ziel-branch>` zurück) umgesetzt werden — nie als echte
Prävention des Switches selbst. Zusätzlich übergibt Git an `post-checkout` **Commit-SHAs**
(`$1`=vorherige Ref, `$2`=neue Ref), **keine Branch-Namen** — ein naiver Revert auf `$1`
würde in einen detached HEAD springen, nicht auf die vorherige Branch zurück.

---

## 2. Ziel

Zwei unabhängige, komplementäre Maßnahmen — eine für den *Factory-Code-Pfad* (statisch,
CI-gated, echte Prävention), eine für den *interaktiven/Fremd-Session-Pfad* (Laufzeit-Guard,
bestmögliche nachträgliche Korrektur):

1. **Statischer Guard (Factory-Prozess-Hälfte des Titels):** ein Test stellt sicher, dass
   kein Skript unter `scripts/factory/` einen `git checkout`/`git switch` gegen den
   main-Checkout ausführt (nur `-C "$WORK_WT"`/`cd`-in-Worktree-Aufrufe sind erlaubt). Das ist
   die einzige Stelle, an der "verhindern" im Wortsinn (vor dem Merge, CI-gated) technisch
   möglich ist.
2. **Laufzeit-Guard-Verbesserung (main-checkout-Hälfte):** `guard-postcheckout` wird von
   reinem Log-Warning zu einem **best-effort Revert** ausgebaut — aber nur, wenn ein
   verlässliches Rücksprungziel existiert (die im Lock hinterlegte `branch`), nie ein Rate-Sprung
   auf eine SHA. Damit das Lock-`branch`-Feld verlässlich gefüllt ist, claimt
   `guard-precommit` den `main-checkout`-Lock **automatisch** (self-claim/refresh) bei jedem
   erfolgreichen Commit im main-Checkout — das schließt die Lücke, dass der Lock bisher kaum
   genutzt wird.

---

## 3. Design

### 3.1 Statischer Factory-Guard-Test

Neue BATS-Datei `tests/spec/session-coordination.bats` (falls noch nicht vorhanden — prüfen,
ob eine passende Spec-Datei existiert, sonst nach dem Muster von
`tests/spec/software-factory.bats` anlegen). Test-Case:

```bash
@test "factory scripts never checkout/switch branches in the shared main checkout" {
  run bash -c "grep -rnE 'git[[:space:]]+(checkout|switch)\b' scripts/factory/*.sh scripts/factory/*.js scripts/factory/*.mjs scripts/factory/*.cjs 2>/dev/null | grep -v -- '-C \"\\?\\\$WORK_WT\"\\?' | grep -v 'worktree-create.sh'"
  [ "$status" -ne 0 ]  # grep found nothing → guard passes
}
```

(Exakte Regex/Ausschlussliste wird im Plan verfeinert — Ziel: false positives für legitime
`-C "$WORK_WT"`-Aufrufe und Doku-/Kommentar-Treffer vermeiden, z. B. via `grep -v '^\s*#'`.)
Dieser Test läuft in `task test:changed`/CI und **bricht den Build**, sobald künftiger
Factory-Code einen rohen Checkout im main-Checkout einführt — echte Prävention statt
Nacharbeit.

### 3.2 `guard-postcheckout` → best-effort Revert

**Neues Verhalten in `scripts/agent-lock.sh::cmd_guard_postcheckout`:**

1. Unverändert: `AGENT_LOCK_FORCE` respektieren, kein/eigener/toter Lock → sofort `return 0`.
2. **Neu — Rebase/Merge/Cherry-Pick-Exemption:** wenn eines von
   `$(git rev-parse --git-path rebase-merge)`, `rebase-apply`, `MERGE_HEAD`,
   `CHERRY_PICK_HEAD` existiert → `return 0` (kein Log, kein Revert). Grund: Git feuert
   `post-checkout` auch bei internen Ref-Bewegungen während `git pull --rebase origin main`
   (Standard-Sync in `dev-flow-plan` Schritt −2, von jeder Session regelmäßig ausgeführt) —
   ein Revert mitten in einem laufenden Rebase einer *anderen, komplett legitimen* Session
   würde deren Arbeit zerstören. Diese Exemption ist der wichtigste Sicherheits-Fix in diesem
   Design.
3. Fremd-Lock lebendig (bestehende Logik unverändert) → Warnung ausgeben (bestehendes
   Verhalten bleibt bestehen — nie stillschweigend).
4. **Neu — Revert-Versuch, nur mit verlässlichem Ziel:** wenn das Lock-JSON ein
   nicht-leeres `branch`-Feld hat UND dieser Branch-Name lokal existiert
   (`git show-ref --verify --quiet refs/heads/<branch>`) UND er sich vom aktuellen HEAD
   unterscheidet: `git checkout "<branch>" >/dev/null 2>&1`. Erfolg/Fehlschlag wird geloggt,
   **nie non-zero exit** (fail-open, wie `guard-precommit`). Fehlt das `branch`-Feld (Lock nie
   mit `--branch` geclaimt) → nur die bestehende Warnung, **kein** Revert-Versuch (kein
   Rate-Sprung auf eine SHA).
5. Env-Opt-out: `AGENT_LOCK_POSTCHECKOUT_REVERT=0` deaktiviert Schritt 4 komplett (nur
   Warnung) — Fluchtventil, falls der Revert in der Praxis stört.

**Neues Verhalten in `cmd_guard_precommit` (Selbst-Claim):** nach erfolgreichem
Guard-Durchlauf (kein Fremd-Lock aktiv) claimt/refresht die committende Session
automatisch den `main-checkout`-Lock mit `--branch "$(git rev-parse --abbrev-ref HEAD)"`
(analog zu `cmd_claim`, aber non-blocking — Best-effort, `|| true`). Das füllt das
`branch`-Feld organisch bei jedem Commit im main-Checkout, ohne dass Skills manuell
`claim main-checkout` aufrufen müssen (die dokumentierte, aber ungenutzte Konvention in
`dev-flow-chore` bleibt als expliziter Pfad zusätzlich bestehen).

**`.githooks/post-checkout`:** keine Änderung am Aufrufmuster nötig — ruft weiterhin
`agent-lock.sh guard-postcheckout` ohne Argumente auf (die neue Logik liest den main-checkout
Lock selbst, braucht `$1`/`$2` von Git nicht, weil sie NICHT auf die SHA-Args reverted,
sondern auf den im Lock hinterlegten Branch-Namen).

### 3.3 Edge Cases

| Fall | Verhalten |
|------|-----------|
| Initial-Clone, kein main-checkout-Lock existiert | `guard_postcheckout` returns 0 sofort (Schritt 1) |
| Detached-HEAD-Checkout (z. B. CI-Checkout eines Tags) | Kein Branch-Name im Lock nötig, aber: wenn Fremd-Lock aktiv UND Lock hat `branch`-Feld, wird trotzdem auf den Lock-Branch zurückgewechselt (detached HEAD galt nicht als "meine" Session) — dokumentiertes, akzeptiertes Verhalten |
| Rebase/Merge/Cherry-Pick in Arbeit | Exemption greift (3.2 Schritt 2) — kein Revert, keine Warnung während des Vorgangs |
| CI ohne TTY | Hooks laufen nicht in CI (kein `core.hooksPath` in Runner-Checkouts) — kein Effekt; der statische Guard-Test (3.1) läuft stattdessen explizit über `task test:changed` |
| Lock-Holder selbst wechselt Branch im main-Checkout | `owner_sid` stimmt überein → `return 0` in Schritt 1, kein Revert (Lock-Holder darf frei arbeiten) |
| Internes `git checkout` durch `git worktree add` (im main-Checkout, nicht im Worktree) | Betrifft nicht `main`s HEAD, kein `post-checkout` im main-Checkout-Kontext (Hook feuert im jeweiligen Arbeitsbaum) |

---

## 4. Betroffene Dateien

- `scripts/agent-lock.sh` — `cmd_guard_postcheckout` (Rebase-Exemption + Revert-Logik),
  `cmd_guard_precommit` (Selbst-Claim-Ergänzung).
- `tests/spec/session-coordination.bats` (neu, falls nicht vorhanden) — statischer
  Factory-Guard-Test (3.1) + Regressionstests für die neue `guard-postcheckout`-Logik
  (Rebase-Exemption, Revert-mit-Branch-Feld, kein-Revert-ohne-Branch-Feld) unter Nutzung der
  bestehenden Test-Overrides `AGENT_LOCK_DIR`, `AGENT_LOCK_SID`, `AGENT_LOCK_FAKE_ALIVE`.
- Keine Änderung an `.githooks/post-checkout` / `.githooks/pre-commit` Aufrufsignaturen nötig.

## 5. Nicht im Scope

- Kein echter Pre-Checkout-Block (git bietet den Hook-Punkt nicht — dokumentierte
  Einschränkung, kein offener TODO).
- Keine Migration bestehender main-checkout-Locks; das `branch`-Feld füllt sich organisch ab
  dem ersten Commit nach diesem Fix.
- Keine Änderung am Verhalten von `guard-precommit` gegenüber Fremd-Sessions (bleibt harter
  Block, unverändert).
