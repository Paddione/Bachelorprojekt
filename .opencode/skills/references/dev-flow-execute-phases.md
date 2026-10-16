# dev-flow-execute — Phasen im Detail

Referenz zu [`dev-flow-execute`](../dev-flow-execute/SKILL.md) und dem gemeinsamen [Lifecycle-Vertrag](.agents/skills/references/dev-flow-lifecycle.md). Der Skill-Body führt den Ablauf,
die Delegation an den Implementer und **alle Gates**; hier stehen die ausformulierten
Befehlsfolgen der mechanischen Schritte.

---

## Plan-Branch ermitteln

`dev-flow-execute` arbeitet auf dem Branch, den `dev-flow-plan` (devflow-mcp `plan_stage`) angelegt
und gepusht hat: `feature/<slug>` oder `fix/<slug>`. Ist der Branch nicht aus dem Kontext bekannt,
offene Plan-Branches auflisten und bei mehreren den User via `AskUserQuestion` (Claude Code) oder
`question` (opencode/agy) fragen:
```bash
git fetch origin --prune
git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/feature/*' 'refs/remotes/origin/fix/*'
```


---

## Schritt −1 bis 0.5 — Pre-Flight, Sync, Worktree-Konsistenz, Rebase

Vor jeder Git-Operation MUSS der Branch geclaimed werden (verhindert, dass zwei Sessions
denselben Plan bearbeiten — Claim VOR der ersten Git-Operation, [T002038]).

**Bereits gemergt?** Hat der Branch schon einen gemergten PR, ist nichts mehr zu tun:
```bash
gh pr list --head "$BRANCH" --state merged --json number -q '.[].number'   # nicht leer → Abbruch
```

**Branch atomic claimen — [T003102] branch-scoped:** der Claim schützt den Worktree, den diese
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

Der Plan-Pfad folgt aus dem Branch (`<type>/<slug>` → `.agents/plans/<slug>/tasks.md`), wie
devflow-mcp `plan_stage` ihn anlegt. **Niemals** per Glob raten.
```bash
BRANCH=$(git branch --show-current)
case "$BRANCH" in
  feature/*|fix/*) ;;
  *) echo "🛑 Kein Plan-Branch: '$BRANCH' — in den Worktree des Plan-Branches wechseln." >&2; exit 1 ;;
esac
SLUG=${BRANCH#*/}
PLAN_FILE=".agents/plans/$SLUG/tasks.md"

# Plan muss im Git-Tree liegen (nicht nur im Dateisystem)
if ! git cat-file -e "HEAD:$PLAN_FILE" 2>/dev/null; then
  echo "🛑 Plan-Datei '$PLAN_FILE' existiert nicht im Git-Tree (Branch: $BRANCH)." >&2
  echo "   → dev-flow-plan erneut ausführen oder den Worktree prüfen: git worktree list" >&2
  exit 1
fi
echo "✅ Plan geladen: $PLAN_FILE (Branch: $BRANCH)"
```


---

## Schritt 1.4 — Doppelarbeit-Guard

Der Branch-Claim wurde in Schritt −1 atomisch platziert. Hier wird nur verifiziert, dass er noch
dieser Session gehört (z.B. nicht durch einen Reaper zwischenzeitlich gelöscht):

```bash
bash scripts/agent-lock.sh check branch "$BRANCH" | head -1 | grep -q '^mine$' \
  || { echo "🛑 Branch $BRANCH nicht mehr von dieser Session geclaimed — Abbruch." >&2; exit 1; }
```

Prüfe zusätzlich den Registry-Overlap für geteilte Hochfrequenz-Dateien (SSOT:
[session-coordination](.agents/skills/references/session-coordination.md)).


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

## Schritt 1.5 — Phasen-Events, touched_files, Assets

Phasen-Events schreibt `scripts/devflow-phase.sh` lokal nach `.agents/plans/<slug>/phase-events.log`;
das Merge-Gate (`devflow-phase.sh check`) verlangt `plan:done`, `implement:entered` und `verify:done`:
```bash
bash scripts/devflow-phase.sh plan entered --detail "Plan: $SLUG"
bash scripts/devflow-phase.sh plan done --detail "Plan geladen"
```

Die berührten Dateien stehen im `## File Structure`-Block des Plans (plan-lint Hard Rule STRUCT1).
Sie sind die Grundlage für den Registry-Overlap-Check und den Scope-Preflight vor dem PR. Berührt
die Umsetzung Dateien, die im Plan **nicht** standen, den Block im Plan ergänzen.

**⚠️ Pflicht für UI-Arbeiten:** Liegen Mockups oder Screenshots im Plan-Ordner
(`.agents/plans/<slug>/`), lies sie mit dem `Read` Tool ein, um ein pixelgenaues Verständnis des
UI-Designs zu erlangen. Verlasse dich nicht auf Prose allein.


---

## Schritt 6.4 bis 7.5 — Merge-Wait, Plan-Abschluss, Cleanup

> **Finalizer-Zuständigkeit (T006284):** Diese Schritte laufen NICHT im Orchestrator — sie
> sind an einen frischen Finalizer-Subagenten delegiert (SKILL.md Schritt 3.9). Der Finalizer
> führt sie als eine idempotente Skript-Einheit aus:
>
> ```bash
> bash scripts/devflow-post-merge-finalize.sh --branch "$BRANCH" --plan "$PLAN_FILE" --pr "$PR_NUM"
> ```
>
> Das Skript ist deterministisch und idempotent: Jeder Schritt überspringt bereits erledigte
> Arbeit (Plan schon `completed`, Lock schon frei, Worktree schon entfernt); ein zweiter Lauf
> setzt an der ersten offenen Stelle fort. Die Einzelschritte unten bleiben als Referenz der
> Skript-Mechanik erhalten — der Finalizer rekonstruiert sie NICHT frei, sondern ruft das Skript
> (Exit 0 = erledigt/übersprungen, Exit 1 = Fehler).

Vor dem Skript-Aufruf steht der Merge-Wait-Loop — erst warten, bis der PR tatsächlich durch ist
(vermeidet Abschluss bei PR=OPEN+CONFLICTING, Mishap T001149-M1). Voller Poll-Loop mit
Timeout/State-Handling (`MERGED`/`CLOSED`/Timeout-Exit-Codes):
[ci-fix-loop](.agents/skills/references/ci-fix-loop.md) §"PR-Merge-Wait-Loop" — der Finalizer MUSS
die Datei lesen und den Loop von dort ausführen (nicht aus dem Gedächtnis rekonstruieren). Bei
Timeout nichts abschließen, strukturiert berichten; die offenen Schritte sind über das Skript
nachholbar.

Merge = Abschluss (T001092); der Prod-Deploy (Schritt 8) ist entkoppelt.

## Schritt 7: Plan abschließen

`devflow-post-merge-finalize.sh` markiert den Plan vor dem Branch-Cleanup als `completed`. Details:
[plan-archive-steps](plan-archive-steps.md).

## Schritt 7.5: Worktree & Branch bereinigen

> Läuft über `devflow-post-merge-finalize.sh` (Schritt 10 der Skript-Kette). Referenz:

> **Reihenfolge (T004612):** Dieser Schritt läuft NACH Schritt 7 (Plan-Abschluss) — der Fix-PR-Merge
> (Schritt 5) löscht den Branch bewusst NICHT mehr (`--delete-branch` entfernt,
> `delete_branch_on_merge=false`), damit der Plan-Abschluss ihn noch vorfindet.

Lösche den lokalen Worktree und Branch (im Haupt-Repo ausführen):
Claims freigeben VOR dem Worktree-Remove ([session-coordination](.agents/skills/references/session-coordination.md)), dann:
```bash
git worktree unlock "$MAIN_REPO/.worktrees/<slug>" 2>/dev/null || true   # worktree-create.sh sperrt jeden Worktree (T900046) — sonst Exit 128 (T900340)
git worktree remove "$MAIN_REPO/.worktrees/<slug>" --force
git branch -D "<branch>"
git push origin --delete "<branch>"   # remote: der Merge löscht nicht mehr (T004612)
```


---

## Tests — ein pytest-Modul pro Vorgang

  Neue Tests sind pytest-Funktionen in `tests/py/spec/<bereich>/test_<kurz_slug>.py` (Bereich aus dem Feature-Namen). BATS ist seit T901392 deinstalliert.
  Reihenfolge:
  1. **Bereich ermitteln:** Welcher Bereich beschreibt das zu testende Verhalten? (Feature-Name.)
  2. **Modul prüfen/anlegen:** Existiert ein passendes Modul unter `tests/py/spec/`? Falls ja → Testfunktion ergänzen. Falls nein → neues Modul anlegen (Vorlage: `tests/py/spec/native_ported/spec/test_mcp_tooling.py`, Konventionen: `tests/CLAUDE.md`).
  3. **Fallback:** Für übergreifende Tests ohne Bereichszuordnung → passendes Modul in `tests/py/unit/` erweitern.
  ```bash
  # Bestehende Module finden und gezielt ausfuehren:
  ls tests/py/spec/native_ported/spec/
  bash scripts/pytest-run.sh tests/py/spec/<pfad>/test_<slug>.py
  ```
  Live-Tests mit Clusterbedarf gehören nach `tests/py/local/test_<id>.py` (nur mit `PYTEST_LOCAL=1` gesammelt, gestartet über `tests/runner.sh local <ID>`). Ticket-nummerierte Dateinamen nicht neu anlegen.
