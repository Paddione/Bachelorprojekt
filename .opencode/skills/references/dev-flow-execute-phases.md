# dev-flow-execute — Phasen im Detail

Referenz zu [`dev-flow-execute`](../dev-flow-execute/SKILL.md) und dem gemeinsamen [Lifecycle-Vertrag](.agents/skills/references/dev-flow-lifecycle.md). Der Skill-Body führt den Ablauf,
die Delegation an den Implementer und **alle Gates**; hier stehen die ausformulierten
Befehlsfolgen der mechanischen Schritte.

---

## Schritt −1 bis 0.5 — Pre-Flight, Sync, Worktree-Konsistenz, Rebase

Vor jeder Git-Operation MUSS der Branch geclaimed werden (verhindert, dass zwei Sessions
denselben Branch bearbeiten — Claim VOR der ersten Git-Operation, [T002038]).

**Branch atomic claimen — [T003102] branch-scoped:** Der Claim schützt den Worktree, den diese
Session betritt.
```bash
CURRENT_BRANCH=$(git branch --show-current 2>/dev/null || echo "")
bash scripts/agent-lock.sh claim branch "$CURRENT_BRANCH" --worktree "$(pwd)" --label dev-flow-execute
RET=$?
case $RET in
  0) echo "✅ Branch $CURRENT_BRANCH erfolgreich geclaimed." ;;
  1) echo "🛑 Branch $CURRENT_BRANCH wird bereits von einer anderen Session bearbeitet." >&2
     echo "   → Mit paralleler Session koordinieren:" >&2
     echo "     bash scripts/agent-msg.sh read --mine --unread" >&2
     exit 1 ;;
  2) echo "🛑 Branch $CURRENT_BRANCH bereits geclaimed — Status-Check verweigert." >&2
     exit 1 ;;
esac
```

**Ankündigung broadcasten:**
```bash
bash scripts/agent-msg.sh post "dev-flow-execute startet Arbeit an Branch $CURRENT_BRANCH" --to all
```


## Schritt 0: Main-Branch im Haupt-Repo synchronisieren (Pull-First)

Synchronisiere `main` im Haupt-Repo:
```bash
bash scripts/agent-lock.sh reap           # Reaper — siehe session-coordination (SSOT)
bash scripts/agent-msg.sh read --unread   # Nachrichten paralleler Sessions [T000882]
MAIN_REPO=$(git worktree list --porcelain | awk '/^worktree/{print $2; exit}')
if [[ -n "$MAIN_REPO" && -d "$MAIN_REPO" ]]; then
  (cd "$MAIN_REPO" && git fetch origin main && git pull --rebase origin main)
else
  git fetch origin main && git pull --rebase origin main
fi
```
Lock-Lebenszyklus (claim/release, Registry-Overlap): [session-coordination](.agents/skills/references/session-coordination.md).

## Schritt 0: Worktree-Konsistenz prüfen

```bash
# Branch-Guard [T000321]
CURRENT_BRANCH=$(git branch --show-current)
# Automatisch aus dem aktuellen Branch ableiten
EXPECTED_BRANCH="$CURRENT_BRANCH"
if [[ -z "$CURRENT_BRANCH" || "$CURRENT_BRANCH" == "HEAD" ]]; then
  echo "🛑 HALT: Kein gültiger Branch ausgecheckt (detached HEAD)." >&2
  exit 1
fi
```
`dev-flow-execute` erwartet normalerweise, dass `dev-flow-plan` bereits einen isolierten Worktree unter
`.worktrees/*` übergeben hat. Das wird hier nie explizit geprüft — läuft die Execute-Phase versehentlich im
Haupt-Checkout (z.B. nach einem Session-Neustart), schreibt der Implementer-Subagent direkt ins
Haupt-Repo statt in eine isolierte Kopie [T001363]:
```bash
# Worktree-Isolation-Check [T001363]
# Wir sind entweder schon in einem .worktrees/*-Worktree ODER müssen einen anlegen.
if [[ "$PWD" != *".worktrees/"* ]]; then
  echo "⚠️  Kein isolierter Worktree unter .worktrees/* erkannt (PWD=$PWD)."
  SLUG=$(echo "$CURRENT_BRANCH" | sed 's#^[a-z]*/##')
  WORKTREE_PATH=".worktrees/${SLUG}"
  echo "→ Lege isolierten Worktree an: scripts/worktree-create.sh $CURRENT_BRANCH $WORKTREE_PATH"
  bash scripts/worktree-create.sh "$CURRENT_BRANCH" "$WORKTREE_PATH"
  if [[ -d "$WORKTREE_PATH" ]]; then
    echo "✅ Worktree bereit unter $WORKTREE_PATH — setze dort fort."
    # In den Worktree wechseln und die Implementierung delegieren.
    # Der Orchestrator muss die Session im neuen Worktree neu starten.
    echo "   Bitte Session im Worktree-Pfad fortsetzen: cd $(pwd)/$WORKTREE_PATH"
  else
    echo "❌ Worktree-Erstellung fehlgeschlagen." >&2
    exit 1
  fi
  exit 1
fi
```

## Schritt 0.5: Sync mit main & Rebase

```bash
git fetch origin main
git rebase origin/main
# Falls push fehlschlägt, wende --force-with-lease an
```


---

## Schritt 1 — Plan-Pfad aus dem Branch-Namen ableiten

Der Plan liegt per Konvention auf dem Branch selbst: `feature/<slug>` bzw. `fix/<slug>` →
`.agents/plans/<slug>/tasks.md`. **Niemals** per Glob raten — ein falscher Treffer führt den
falschen Plan aus.

```bash
BRANCH=$(git branch --show-current)
case "$BRANCH" in
  feature/*|fix/*) ;;
  *) echo "🛑 Kein Plan-Branch: '$BRANCH' — in den Worktree des Plan-Branches wechseln." >&2; exit 1 ;;
esac
SLUG=${BRANCH#*/}
PLAN_FILE=".agents/plans/$SLUG/tasks.md"
PLAN_DIR=".agents/plans/$SLUG"

# Plan muss im Git-Tree liegen, nicht nur auf der Platte
git cat-file -e "HEAD:$PLAN_FILE" \
  || { echo "🛑 Plan fehlt in HEAD: $PLAN_FILE — dev-flow-plan für diesen Branch ausführen." >&2; exit 1; }
echo "✅ Plan: $PLAN_FILE"
```

## Schritt 1.4 / 1.4.5 / 1.4.6 — Doppelarbeit-Guard und Pipeline-Modus

Der Branch-Claim wurde bereits in Schritt −1 atomisch platziert. Hier wird
nur verifiziert, dass der Claim noch dieser Session gehört (z.B. nicht durch
einen Reaper zwischenzeitlich gelöscht):

```bash
bash scripts/agent-lock.sh check branch "$BRANCH" | head -1 | grep -q '^mine$' \
  || { echo "🛑 Branch $BRANCH nicht mehr von dieser Session geclaimed — Abbruch." >&2; exit 1; }
```

Prüfe zusätzlich den Registry-Overlap für geteilte Hochfrequenz-Dateien (SSOT:
[session-coordination](.agents/skills/references/session-coordination.md)):

## Schritt 1.4.5: Pipeline-Modus erkennen (T002110)

Die Zahl der Partials steht im `## Partials`-Manifest des Plans:

```bash
PARTIALS=$(awk '/^## Partials/{f=1;next} /^## /{f=0} f && /^\| *p[0-9]/' "$PLAN_FILE" | wc -l)
echo "ℹ️  $PLAN_FILE: $PARTIALS Partial(s)"
```

- **> 1:** Multi-Partial-Plan — Partials in Manifest-Reihenfolge abarbeiten (siehe Schritt 2.1).
- **≤ 1:** Single-Shot — normale sequentielle Ausführung.


### Schritt 1.4.7: Auto-Merge-Zustand prüfen

Prüfe, ob für den Branch bereits ein PR mit aktivem Auto-Merge existiert (parallele Session
oder User-Aktion; Regression T006282):

```bash
bash scripts/check-pr-automerge.sh --branch "$BRANCH"
```

- `rc=1`: Abbruch als Doppel-Execution-Situation (parallele Session oder der User hat bereits
  einen PR mit Auto-Merge auf dem Branch → koordinieren, nicht duplizieren).
- `rc=2`: Abbruch als Umgebungsfehler.


---

## Schritt 1.5 — touched_files

Die betroffenen Dateien stehen im Abschnitt `## File Structure` des Plans. Sie sind die Grundlage
für den Registry-Overlap-Check ([session-coordination](.agents/skills/references/session-coordination.md))
und den Scope-Preflight vor dem PR.

## Schritt 6 — Merge-Wait und Cleanup

> **Finalizer-Zuständigkeit (T006284):** Diese Schritte laufen NICHT im Orchestrator — sie
> sind an einen frischen Finalizer-Subagenten delegiert (SKILL.md Schritt 3.9).

Erst warten, bis der PR tatsächlich gemergt ist (Mishap T001149-M1). Voller Poll-Loop mit
Timeout/State-Handling (`MERGED`/`CLOSED`/Timeout-Exit-Codes):
[ci-fix-loop](.agents/skills/references/ci-fix-loop.md) §"PR-Merge-Wait-Loop" — der Finalizer
MUSS die Datei lesen und den Loop von dort ausführen. Bei Timeout nichts aufräumen, strukturiert
berichten.

Der Plan-Ordner wurde bereits im PR entfernt (SKILL.md Schritt 5); ein Archiv-Schritt entfällt.

Danach Worktree und Branch bereinigen (im Haupt-Repo ausführen). Claims freigeben VOR dem
Worktree-Remove ([session-coordination](.agents/skills/references/session-coordination.md)):
```bash
bash scripts/agent-lock.sh release branch "$BRANCH"
git worktree unlock "$WT" 2>/dev/null || true   # worktree-create.sh sperrt jeden Worktree (T900046) — sonst Exit 128 (T900340)
git worktree remove "$WT" --force
git branch -D "$BRANCH"
git push origin --delete "$BRANCH" 2>/dev/null || true   # entfällt, wenn der Merge den Branch schon gelöscht hat
```


---

## Tests — ein pytest-Modul pro Vorgang

  Neue Tests sind pytest-Funktionen in `tests/py/spec/<bereich>/test_<kurz_slug>.py` (Bereich aus dem Feature-Namen). BATS ist seit T901392 deinstalliert.
  Reihenfolge:
  1. **Bereich ermitteln:** Welcher Bereich beschreibt das zu testende Verhalten? (Feature-Name.)
  2. **Modul prüfen/anlegen:** Existiert ein passendes Modul unter `tests/py/spec/`? Falls ja → Testfunktion ergänzen. Falls nein → neues Modul anlegen (Vorlage: `tests/py/spec/native_ported/spec/test_ticket_system.py`, Konventionen: `tests/CLAUDE.md`).
  3. **Fallback:** Für übergreifende Tests ohne Bereichszuordnung → passendes Modul in `tests/py/unit/` erweitern.
  ```bash
  # Bestehende Module finden und gezielt ausfuehren:
  ls tests/py/spec/native_ported/spec/
  bash scripts/pytest-run.sh tests/py/spec/<pfad>/test_<slug>.py
  ```
  Live-Tests mit Clusterbedarf gehören nach `tests/py/local/test_<id>.py` (nur mit `PYTEST_LOCAL=1` gesammelt, gestartet über `tests/runner.sh local <ID>`). Ticket-nummerierte Dateinamen nicht neu anlegen.
