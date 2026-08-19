---
title: "mishap-incident-rollup-2026-08-18-T011793 — Implementation Plan"
ticket_id: T011793
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-18-T011793 — Implementation Plan

_Container-Ticket: T011793_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-18 05:55 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-18 05:54 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | suspicious | repo/worktrees | Orphan-Worktree-Verzeichnis .worktrees/components auf Disk, kein git-worktree-Eintrag |
> | 2 | suspicious | repo/worktrees | .opencode/package*.json als non-allowlistete dirty Files in 2 Worktrees (T008757, T008345) |
> | 3 | suspicious | repo/worktrees | T009369-Worktree (done) hat non-allowlistete dirty Files: devflow-post-merge-finalize.sh + astro-syntax.bats |
> | 4 | process | devflow-plan | dev-flow-plan lieferte Change ohne specs/-Delta und .ticket (CI rot bei T008721) |
> | 5 | process | dev-flow-plan | dev-flow-plan-Changes ohne specs/-Delta und .ticket machen openspec-validate rot |
> | 6 | degraded | scripts/devflow-post-merge-finalize.sh | Zwei Finalizer-Läufe teilen sich den Haupt-Checkout — kein Mutex um die Archiv-Sektion |
> | 7 | degraded | scripts/devflow-post-merge-finalize.sh | Finalizer meldet Fehlschläge als [skip] und endet mit Exit 0 — Cleanup-Lücken bleiben unsichtbar |
> | 8 | suspicious | scripts/devflow-post-merge-finalize.sh | Finalizer Schritt 8: git ls-remote erkennt "Archiv-PR bereits gemergt" nicht, Wiederholungslauf endet Exit 1 |
> | 9 | degraded | scripts/devflow-post-merge-finalize.sh | Finalizer schreibt Plan-Status in den Hauptcheckout statt in den Worktree |
> | 10 | drift | factory/post-merge-closure | T012256 auf done geschlossen, obwohl zwei Deliverable-Commits nie einen PR hatten |
> 
> **1. Orphan-Worktree-Verzeichnis .worktrees/components auf Disk, kein git-worktree-Eintrag** (suspicious, repo/worktrees)
> 
> git-worktree-health.sh orphans meldete: ORPHAN-WORKTREE: /home/patrick/Bachelorprojekt/.worktrees/components — das Verzeichnis existiert physisch (enthält nur .worktrees/components/website/), ist aber nicht in 'git worktree list' registriert. Behebung: git worktree prune; rm -rf .worktrees/components falls danach noch vorhanden. Gefunden im repo-hygiene §1-Lauf 2026-08-18.
> **2. .opencode/package*.json als non-allowlistete dirty Files in 2 Worktrees (T008757, T008345)** (suspicious, repo/worktrees)
> 
> worktree-clean-check.sh meldet .opencode/package-lock.json und .opencode/package.json als non-allowlistete dirty Files in zwei Worktrees: fa-sf-25-scheduling-cap-T008757 (status=backlog) und status-ssot-consolidation-T008345 (status=plan_staged). Diese Dateien blockieren einen sauberen git worktree remove und werden weder von der Allowlist noch von den Generate-Pfaden abgedeckt. Unklar ob opencode sie dort hinterlassen hat oder ob sie Absicht sind. Workaround: git -C <wt> diff HEAD -- .opencode/ prüfen, dann ggf. zur Allowlist in scripts/branch-reaper.sh ergänzen. Gefunden im repo-hygiene §1-Lauf 2026-08-18.
> **3. T009369-Worktree (done) hat non-allowlistete dirty Files: devflow-post-merge-finalize.sh + astro-syntax.bats** (suspicious, repo/worktrees)
> 
> Worktree .worktrees/mishap-incident-rollup-2026-08-17-T009369-reuse hat Ticket T009369 mit status=done (resolution=fixed), aber worktree-clean-check.sh meldet nicht-allowlistete dirty Files: scripts/devflow-post-merge-finalize.sh und tests/spec/software-factory/astro-syntax.bats. Diese Dateien gehören nicht zu den Plan-Artefakten oder Generate-Pfaden der Allowlist. Es ist unklar ob der Inhalt bereits in main liegt oder ob es sich um verloren gegangene Arbeit handelt. Nächste Aktion: git -C .worktrees/mishap-incident-rollup-2026-08-17-T009369-reuse diff HEAD -- scripts/devflow-post-merge-finalize.sh tests/spec/software-factory/astro-syntax.bats prüfen; danach ggf. git worktree remove --force. Gefunden im repo-hygiene §1-Lauf 2026-08-18.
> **4. dev-flow-plan lieferte Change ohne specs/-Delta und .ticket (CI rot bei T008721)** (process, devflow-plan)
> 
> Der gestagte Plan openspec/changes/chore-e3-review-followups/ enthielt nur tasks.md — der CI-Guard "Factory OpenSpec + Guards (fast)" failte mit "missing specs/ delta dir" und "has no .ticket link" (T002836). Beides prä-existent aus dev-flow-plan, nicht aus der Implementierung. Fix im PR #4729: Delta-Spec auf Parent sdlc-cockpit + .ticket-Datei. Empfehlung: dev-flow-plan/Propose-Pfad prüfen, warum das Scaffold für diesen Change unvollständig war.
> **5. dev-flow-plan-Changes ohne specs/-Delta und .ticket machen openspec-validate rot** (process, dev-flow-plan)
> 
> dev-flow-plan erzeugte für T008345 einen Change (fix-status-ssot-consolidation) mit NUR tasks.md — ohne proposal.md, .ticket-Link und specs/-Delta. Der CI-relevante Validator-Test T001452 (tests/spec/openspec-workflow.bats, validateTree) wurde dadurch im PR-Vorlauf rot (test:spec:changed), obwohl die Implementierung selbst vollständig war. Nachträgliche Ergänzung von .ticket + specs/ticket-ops.md + openspec-status.json nötig (Commit b64650c3c/eb22850e0). Vergleiche: fix-mishap-subagent-ticket-mcp und fix-devflow-ciwatch-cwd-head tragen specs/-Delta und .ticket. Vermutlich erzeugt der Plan-Pfad Change-Skelette, die das openspec-validate-Gate (Pflicht specs/-Delta, .ticket-Link) nicht bestehen — T002836 verlangt .ticket; das specs/-Delta scheint im Plan-Pfad nicht erzeugt zu werden.
> **6. Zwei Finalizer-Läufe teilen sich den Haupt-Checkout — kein Mutex um die Archiv-Sektion** (degraded, scripts/devflow-post-merge-finalize.sh)
> 
> BEOBACHTET 2026-08-18, verifiziert per pgrep: zwei Instanzen von scripts/devflow-post-merge-finalize.sh liefen gleichzeitig für verschiedene Tickets (T012240 --pr 4738 und T012239 --pr 4737), beide im selben Arbeitsbaum /home/patrick/Bachelorprojekt.
> 
> Die Archiv-Sektion (Schritt 8) wechselt per `git checkout -B "$ARCHIVE_BRANCH" origin/main` den Branch des GETEILTEN Haupt-Checkouts. Zwei parallele Läufe wechseln denselben Arbeitsbaum gegeneinander. Beobachtete Folgen:
> - Die gestagte Archivierung des fremden Changes (fix-ci-failure-detection, T012239) lag auf MEINEM Archiv-Branch chore/plan-archive-finalizer-resolve-worktree-by-branch-T012240 im Index.
> - `git push -u origin <mein-archiv-branch>` scheiterte mit "cannot lock ref ... reference already exists" — der andere Lauf hatte den Ref bereits belegt.
> - Der ARCHIVE_PREV_BRANCH-Restore (T006791) griff zwar am Ende, aber zwischenzeitlich stand der Haupt-Checkout auf einem fremden Archiv-Branch.
> 
> Es ist gutgegangen (beide Archiv-PRs #4740 und der von T012239 wurden gemergt), aber das ist Glück, kein Design: der Index des Haupt-Checkouts ist eine geteilte, ungeschützte Ressource. Ein ungünstiges Timing kann fremde Änderungen in den falschen Archiv-Commit ziehen.
> 
> AGENT-LOCK deckt das nicht ab: die Locks sind branch- und ticket-scoped; ein main-checkout-Lock existiert zwar (auto: pre-commit self-claim), wird von der Archiv-Sektion aber nicht geprüft.
> 
> REPRODUKTION: zwei Finalize-Läufe für verschiedene Tickets gleichzeitig starten, während beide Archiv-Sektionen aktiv sind.
> 
> FIX-RICHTUNG: Die Archiv-Sektion serialisieren — entweder über einen main-checkout-scoped Lock (agent-lock.sh, Scope existiert bereits) oder über flock auf eine Datei im $GIT_COMMON_DIR. Alternative: die Archivierung in einem eigenen Wegwerf-Worktree statt im Haupt-Checkout ausführen; das nimmt die geteilte Ressource ganz aus dem Spiel.
> **7. Finalizer meldet Fehlschläge als [skip] und endet mit Exit 0 — Cleanup-Lücken bleiben unsichtbar** (degraded, scripts/devflow-post-merge-finalize.sh)
> 
> BEOBACHTET 2026-08-18 an T012240, verifiziert durch Vergleich zweier Läufe.
> 
> scripts/devflow-post-merge-finalize.sh unterscheidet in seiner Ausgabe nicht zwischen "Schritt war bereits erledigt" (legitimer Idempotenz-Skip) und "Schritt konnte seine Eingabe nicht auflösen" (Fehlschlag). Beide erscheinen als [skip], das Skript summiert sie als "uebersprungen" und endet mit Exit 0 plus der Meldung "abgeschlossen".
> 
> KONKRET beobachtet (vor dem T012243-Fix), Lauf ohne --branch:
  > [skip] Schritt 7: Plan-Pfad nicht (mehr) aufloesbar — Archiv vermutlich bereits persistiert
  > [skip] Schritt 8: Change-Ordner ... existiert nicht mehr (bereits archiviert?)
  > [skip] Schritt 10: Worktree bereits entfernt
  > [skip] Schritt 10: lokaler Branch bereits entfernt
  > --- Finalize T012240 abgeschlossen: 6 erledigt, 6 uebersprungen ---  EXIT=0
> Tatsächlich existierten Worktree UND Branch weiterhin; die Ursache war ein korrupter $BRANCH (T012243). Derselbe Lauf nach dem Fix: "12 erledigt, 0 uebersprungen", Schritt 10 entfernte beides.
> 
> Die Formulierungen verraten die Unsicherheit bereits selbst ("vermutlich", "bereits archiviert?") — sie wird aber nicht in den Exit-Code oder eine Warnung überführt. Ein Aufrufer (dev-flow-execute, Factory-Finalizer, Recovery-Session) kann Erfolg nicht von stillem Nichtstun unterscheiden. Genau deshalb blieb der T012243-Defekt unbemerkt, obwohl er jeden Lauf ohne --branch betraf.
> 
> FIX-RICHTUNG: Skip-Gründe trennen. "Zustand bereits erreicht" (verifiziert: Ticket ist done, Ordner ist im Archiv, Worktree-Pfad nicht in `git worktree list`) bleibt [skip] und Exit 0. "Eingabe nicht auflösbar" wird [warn] und erhöht einen Zähler, der am Ende zu Exit != 0 oder mindestens zu einer expliziten Schlusszeile führt ("N Schritte konnten ihre Eingabe nicht aufloesen"). Insbesondere Schritt 10 kann positiv verifizieren statt zu vermuten: existiert ein Worktree, der $BRANCH hält, obwohl der aufgelöste Pfad nicht existiert, ist das ein Widerspruch und kein Skip.
> 
> ABGRENZUNG: T012243 (PR #4741) hat die konkrete Ursache behoben. Dieser Befund betrifft die Diagnostik, die den Defekt verdeckt hat — er bleibt bestehen und würde den nächsten gleichartigen Fehler ebenso verdecken.
> **8. Finalizer Schritt 8: git ls-remote erkennt "Archiv-PR bereits gemergt" nicht, Wiederholungslauf endet Exit 1** (suspicious, scripts/devflow-post-merge-finalize.sh)
> 
> [UNVERIFIED — vom Review-/Finalizer-Subagenten berichtet, von mir nicht selbst reproduziert; meine eigenen Wiederholungsläufe trafen Schritt 8 nicht, weil dort der Change-Ordner bereits fehlte und der Schritt vorher übersprang.]
> 
> BERICHTET 2026-08-18 im Zuge von T012240: Die Idempotenz-Prüfung in Schritt 8 (OpenSpec-Archiv) nutzt `git ls-remote`, um zu erkennen, ob bereits ein Archiv-Branch existiert. Damit erkennt sie den Zustand "Archiv-PR noch offen", nicht aber den Zustand "Archiv-PR bereits gemergt UND Remote-Branch danach gelöscht". Im zweiten Fall hält sie den Schritt für unerledigt, versucht erneut zu archivieren und endet mit Exit 1. Der Trap rollte den Arbeitsbaum sauber auf den Ursprungsbranch zurück, es entstand kein Schaden — aber der Lauf meldet Fehlschlag für einen Vorgang, der vollständig erledigt ist.
> 
> WARUM RELEVANT: Der Finalizer ist als idempotente Einheit ausgelegt (openspec/specs/agent-skills.md: "Bereits erledigte Schritte SHALL erkannt und uebersprungen werden"). Genau der Wiederholungslauf nach einem abgebrochenen ersten Versuch ist sein Zweck — Recovery-Sessions und der Factory-Finalizer rufen ihn so auf. Ein Exit 1 in diesem Pfad bringt Aufrufer dazu, einen erfolgreichen Abschluss für gescheitert zu halten.
> 
> FIX-RICHTUNG: Statt nur den Remote-Branch zu prüfen, den Zielzustand prüfen — liegt der Change unter openspec/changes/archive/<datum>-<slug> auf origin/main? Das ist der Zustand, den Schritt 8 herstellen soll, und er bleibt auch nach dem Löschen des Archiv-Branches wahr. Ergänzend: `gh pr list --head <archiv-branch> --state merged` als zweites Signal.
> 
> VERIFIKATION VOR UMSETZUNG: Zustand herstellen (Archiv-PR mergen, Remote-Branch löschen, Change-Ordner lokal wiederherstellen) und den Finalizer erneut laufen lassen; Exit-Code und Schritt-8-Ausgabe protokollieren.
> **9. Finalizer schreibt Plan-Status in den Hauptcheckout statt in den Worktree** (degraded, scripts/devflow-post-merge-finalize.sh)
> 
> Beobachtet beim repo-hygiene-Lauf 2026-08-18. Im Hauptcheckout /home/patrick/Bachelorprojekt lag eine uncommittete Änderung an openspec/changes/finalizer-hardening/tasks.md: `status: active` -> `status: completed`. Zwei Widersprüche: (a) derselbe Plan führt 15 unabgehakte und 0 abgehakte Tasks, `completed` ist also inhaltlich falsch; (b) die massgebliche Kopie im zugehörigen Worktree .worktrees/finalizer-hardening-T012256 steht weiterhin auf `active` — der Schreibvorgang landete im falschen Baum. Zusätzlich existiert der nur lokale Branch chore/plan-archive-finalizer-hardening-T012256, der den Change bereits nach openspec/changes/archive/2026-08-18-finalizer-hardening verschiebt, ohne PR und ohne dass die Arbeit fertig ist. Der Flip wurde per `git checkout --` zurückgenommen; der Archiv-Branch wurde bewusst NICHT gelöscht und NICHT gepusht. Bemerkenswert: T012256 ist genau das Ticket "Finalizer-Härtung" — der Finalizer zeigt den Fehler, den er beheben soll.
> **10. T012256 auf done geschlossen, obwohl zwei Deliverable-Commits nie einen PR hatten** (drift, factory/post-merge-closure)
> 
> Beobachtet beim repo-hygiene-Lauf 2026-08-18. T012256 wurde beim Merge von PR #4744 auf `done` gesetzt. Der Branch fix/finalizer-hardening-T012256 trägt jedoch zwei spätere Commits (e7db5b60b, eea71c595), die seit ~2h auf origin liegen und zu keinem PR gehören. Blob-Vergleich gegen origin/main zeigt zwei abweichende Quelldateien ausserhalb der Generat-Allowlist: scripts/devflow-post-merge-finalize.sh (40 Zeilen +, 5 -) und tests/spec/agent-skills/finalize-hardening.bats (auf main gar nicht vorhanden). Verstoss gegen die Deliverable-Check-Konvention (CLAUDE.md M10, T002506). Behoben durch Öffnen von PR #4748 aus dem Hygiene-Lauf heraus. Dieser PR hat allerdings einen ECHTEN Inhaltskonflikt gegen main (nicht das merge=ours-Phantom): `git merge-tree --write-tree origin/main origin/fix/finalizer-hardening-T012256` meldet CONFLICT in scripts/devflow-post-merge-finalize.sh, weil T012242/T012243 dieselbe Datei geändert haben. Die Auflösung braucht eine inhaltliche Entscheidung und wurde bewusst nicht automatisch vorgenommen; der Befund ist als Kommentar an PR #4748 dokumentiert.

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
