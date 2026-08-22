---
title: "mishap-incident-rollup-2026-08-20-T012909 — Implementation Plan"
ticket_id: T012909
domains: [factory]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-20-T012909 — Implementation Plan

_Container-Ticket: T012909_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-20 01:28 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-20 01:26 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | process | ops | repo-hygiene: Auto-Mode-Klassifikator blockiert zwei Runbook-Standardschritte |
> | 2 | drift | skills/dev-flow-chore | dev-flow-chore Schritt 4 nennt Commit-Scope ohne Allowlist-Hinweis |
> | 3 | suspicious | skills/repo-hygiene | Worktree-Isolationsguard blockiert repo-hygiene vollstaendig, auch lesende git-Befehle |
> | 4 | degraded | scripts/branch-reaper.sh | branch-reaper loescht den Remote-Branch, bevor er den Worktree-Check macht |
> | 5 | drift | scripts/branch-reaper.sh | Nach-Merge-Commit auf Ticket-Branch kam nie nach main und wurde von keinem Guard gemeldet |
> | 6 | process | flux/clusters/fleet | Ungeticketer Flux-Patch lag unversioniert im Hauptcheckout |
> | 7 | suspicious | repo/worktrees | Ungeticketete Fremdarbeit lag uncommittet in thematisch fremdem Worktree |
> | 8 | drift | scripts/hooks/commit | Commit-Hooks melden Branchnamen- und Scope-Fehler nacheinander statt zusammen |
> | 9 | suspicious | scripts/worktree-clean-check.sh | worktree-clean-check rc=2 bei aktiver Fremdsession sieht wie ein Werkzeugfehler aus |
> | 10 | drift | scripts/hooks/scs-reindex | SCS-Reindex schlaegt beim Commit fehl, Commit geht trotzdem durch |
> 
> **1. repo-hygiene: Auto-Mode-Klassifikator blockiert zwei Runbook-Standardschritte** (process, ops)
> 
> Beim Hygiene-Lauf am 2026-08-19 wurden zwei im Runbook (.claude/skills/references/repo-hygiene-ops.md) vorgesehene Standardschritte vom Claude-Code-Auto-Mode-Klassifikator abgelehnt:
> 
> 1. `git stash drop 'stash@{1}'` — §0 Punkt 4/5: der Stash war nachweislich obsolet (Marker `build/iso` liegt als `build/iso/` in origin/main:.gitignore, geprueft per `git grep -F 'build/iso' origin/main -- .gitignore`, rc=0). Der Stash bleibt liegen.
> 2. `git fetch origin main:main` — Fast-Forward des nicht ausgecheckten lokalen main. Lokaler main bleibt [behind 9].
> 
> Folge: §0 und §2 lassen sich nicht vollstaendig abschliessen; obsolete Stashes akkumulieren ueber Laeufe hinweg. Beide Kommandos sind nicht-destruktiv im Sinne von Datenverlust (Stash-SHA war vor dem Versuch notiert, Fast-Forward ist per Definition verlustfrei).
> 
> Moegliche Abhilfe: Bash-Permission-Regeln fuer `git stash drop` und `git fetch origin main:main` in .claude/settings.json, oder Runbook-Hinweis, dass diese Schritte Operator-Bestaetigung brauchen.
> 
> MESSUNG (2026-08-19, Repo-Stand 00157dc66): 3 Stashes vorhanden, davon 1 belegbar obsolet.
> **2. dev-flow-chore Schritt 4 nennt Commit-Scope ohne Allowlist-Hinweis** (drift, skills/dev-flow-chore)
> 
> BEOBACHTUNG (dev-flow-chore-Lauf T012960, 2026-08-19):
> Schritt 4 der Skill gibt das Titelformat `chore(<scope>): <subject> [$TICKET_EXT_ID]` vor, erwähnt aber nirgends, dass `<scope>` aus einer Allowlist stammt. Der erste Commit mit dem naheliegenden Scope `gitignore` wurde vom commit-msg-Hook abgelehnt ("No commit was created — commit-msg hook rejected the message"). Korrektur auf den Ticket-Scope `chore(T012960):` ging durch. Kosten: ein Fehlversuch pro Chore, deren Thema keinem Allowlist-Scope entspricht.
> 
> VERIFIKATION (Commit 774b1e787):
  > grep -c 'validate-commit-msg\|Erlaubte Scopes' .claude/skills/dev-flow-chore/SKILL.md   -> 0
  > grep -n 'Titelformat' .claude/skills/dev-flow-chore/SKILL.md                            -> 159
  > bash scripts/validate-commit-msg.sh scopes
    > -> website infra db security ops test plans factory agents skills ci scripts docs mcp deps
       > (plus Ticket-Scopes T000123 und Health-Goal-Scopes G-SIZE02)
> 
> VORSCHLAG:
> In dev-flow-chore Schritt 4 (Zeile 159) den Ticket-Scope als Default nennen: `chore(<TICKET_EXT_ID>): <subject>`. Er umgeht die Allowlist ohnehin ("ticket-number scope bypasses allowlist", bestätigt von preflight-pr-scope.sh) und passt zum PR-Titel-Branch-Matching, das dieselbe Skill in Schritt 1 bereits verlangt. Alternativ ein Verweis auf `bash scripts/validate-commit-msg.sh scopes`.
> **3. Worktree-Isolationsguard blockiert repo-hygiene vollstaendig, auch lesende git-Befehle** (suspicious, skills/repo-hygiene)
> 
> Startet eine Session worktree-isoliert (hier: .claude/worktrees/feature+pxe-autoinstall-T012906), lehnt der Isolationsguard jede git-Operation ab, die auf den Hauptcheckout oder einen fremden Worktree zielt — auch rein lesende. Abgelehnt wurden u.a.:
> 
  > git -C /home/patrick/Bachelorprojekt/.worktrees/dsh-demo-T012962 status --porcelain
    > -> "redirects git to the shared checkout via -C. Refusing to run it"
  > cd /home/patrick/Bachelorprojekt && git worktree list
    > -> "changes directory to the shared checkout before running git"
  > (flock -n 9 && echo frei || echo gehalten) 9>/tmp/factory-tick.lock
    > -> "too complex to verify that it stays inside the worktree"
> 
> Der letzte Fall ist der unangenehmste: der Befehl fasst git gar nicht an, wird aber wegen seiner Shell-Struktur (Subshell + fd-Redirect) pauschal abgelehnt. Der Factory-Tick-Vorcheck aus repo-hygiene-ops.md §1 ist damit in seiner dokumentierten Form nicht ausfuehrbar.
> 
> repo-hygiene operiert per Definition auf dem Hauptcheckout und auf fremden Worktrees. In einer isolierten Session ist das Skill deshalb blockiert, bis ExitWorktree gerufen wird — was in keiner der beiden Dokumentationen (Skill oder repo-hygiene-ops.md) als Vorbedingung steht. Der Guard unterscheidet nicht zwischen lesenden und schreibenden Operationen; fuer Statusabfragen waere die Ablehnung nicht noetig.
> 
> Zwei moegliche Auswege: (a) repo-hygiene dokumentiert ExitWorktree als ersten Schritt, (b) der Guard laesst lesende git-Unterkommandos (status, log, worktree list, for-each-ref, rev-parse) auf fremde Pfade zu.
> 
> Beobachtet 2026-08-20.
> **4. branch-reaper loescht den Remote-Branch, bevor er den Worktree-Check macht** (degraded, scripts/branch-reaper.sh)
> 
> Reihenfolge-Problem in scripts/branch-reaper.sh. Real beobachtet am 2026-08-20 im Sweep:
> 
  > DELETED fix/dsh-web-start-T012965 (archiviert als refs/tags/reaped/fix/dsh-web-start-T012965)
  > KEEP local fix/dsh-web-start-T012965 — lokaler Ref nicht entfernbar (z.B. in einem Worktree ausgecheckt)
> 
> Der Remote-Branch ist zu diesem Zeitpunkt bereits weg. Ein Worktree, in dem noch aktiv gearbeitet wird (hier lief `task dsh:dsh:web` auf Port 3083 aus genau diesem Worktree), verliert damit unangekuendigt sein Push-Ziel. Folgenlos war es nur, weil der zugehoerige PR #4869 bereits gemergt war.
> 
> Ein Patch dagegen liegt uncommitted im Worktree .worktrees/mishap-incident-rollup-2026-08-19-T012445-reuse: eine Vorabpruefung via `git worktree list --porcelain` mit `KEEP <branch> — in einem Worktree ausgecheckt` vor allen anderen Pruefungen. Erfasst als T012966 — dieser Mishap dokumentiert das zugrundeliegende Verhalten, damit es nicht mit dem Worktree verschwindet.
> 
> Ueberschneidet sich thematisch mit T012967 (derselbe Reaper, andere Fehlerklasse).
> **5. Nach-Merge-Commit auf Ticket-Branch kam nie nach main und wurde von keinem Guard gemeldet** (drift, scripts/branch-reaper.sh)
> 
> Commit 628a27a0e auf fix/pxe-partitioning-wipe-T012910 entstand am 2026-08-19 um 13:24 UTC, drei Minuten nach dem Merge von PR #4846 (mergedAt 13:20:51 UTC). Er kam nie nach main. Weder branch-reaper (--sweep --dry-run meldete nur KEEP wegen Allowlist-Abweichung, ohne die Richtung zu unterscheiden) noch der Post-Merge-Pfad wiesen darauf hin. Gefunden erst per Blob-Vergleich im repo-hygiene-Lauf am 2026-08-20.
> 
> MESSUNG (2026-08-20, gegen origin/main = bb4491b2be413860575bf06a0dcf99aca70ac916):
> git log origin/main..origin/fix/pxe-partitioning-wipe-T012910 --format='%cI %h %s'
> git grep -c -F 'curtin bricht in' origin/main -- docs/runbooks/workstation-cluster-pxe.md   # kein Treffer
> 
> Der Reaper-KEEP-Grund ("abweichende Datei ausserhalb der Allowlist") ist inhaltlich richtig, unterscheidet aber nicht zwischen "Branch ist aelter als main" (folgenlos, Fall T012906) und "Branch traegt Inhalt, den main nicht hat" (Datenverlustrisiko, dieser Fall). Beide sehen in der Ausgabe gleich aus.
> 
> Gerettet als PR #4874, Ticket T012969.
> **6. Ungeticketer Flux-Patch lag unversioniert im Hauptcheckout** (process, flux/clusters/fleet)
> 
> Am 2026-08-20 lagen im Hauptcheckout /home/patrick/Bachelorprojekt fuenf uncommittete Aenderungen: force: true ergaenzt in flux/clusters/fleet/ks-{dev,korczewski,mentolder,website-korczewski,website-mentolder}.yaml, mtime 2026-08-20 01:02. Kein Branch, kein PR, kein Ticket trug die Aenderung.
> 
> MESSUNG (2026-08-20, gegen origin/main = bb4491b2be413860575bf06a0dcf99aca70ac916):
> git diff origin/main --stat -- flux/                                  # 5 Dateien, je +1 Zeile
> git log --all --oneline -S 'force: true' -- flux/clusters/fleet/ks-dev.yaml   # leer
> git grep -F -n 'force: true' origin/main -- flux/clusters/fleet/      # nur ks-jobs-*
> 
> Ein Eingriff an der GitOps-Konfiguration der Produktions-Kustomizations lebte damit ausschliesslich im lokalen Arbeitsbaum eines Rechners. Erfasst als T012968 (needs_human); der Patch bleibt im Arbeitsbaum liegen, bis entschieden ist.
> **7. Ungeticketete Fremdarbeit lag uncommittet in thematisch fremdem Worktree** (suspicious, repo/worktrees)
> 
> Beobachtet im repo-hygiene-Lauf 2026-08-20. In .worktrees/mishap-incident-rollup-2026-08-19-T012445-reuse (Branch chore/mishap-incident-rollup-2026-08-19-T012445) lagen drei uncommittete Aenderungen ohne jeden Bezug zum Branch-Thema: ein Worktree-KEEP-Guard in scripts/branch-reaper.sh, ein Multi-Status-Split in scripts/ticket-mcp/go/internal/tools/list.go und ein Wegwerf-Testharness test_reaper_logic.sh im Repo-Root.
> 
> Verifikation (Step 0): `git grep -F WORKTREE_BRANCHES origin/main -- scripts/branch-reaper.sh` und `git grep -F 'strings.Split(status' origin/main -- scripts/ticket-mcp/go/internal/tools/list.go` lieferten beide keinen Treffer, `git cat-file -e origin/main:test_reaper_logic.sh` schlug fehl. Die Arbeit stand also nachweislich nicht auf main und waere beim Worktree-Remove verloren gewesen.
> 
> Gerettet nach Ticket T012972, Branch chore/rescued-wip-reaper-worktree-guard-T012972 (Commit 271f8f7a2, auf origin gepusht); die drei Dateien wurden per sha256 byte-genau gegen den alten Worktree verifiziert.
> 
> Warum es zaehlt: Der §0-Vorcheck des Runbooks hat hier reale Arbeit vor dem Loeschen bewahrt. Ein Worktree, dessen Branch-Thema nicht zum Arbeitsbaum-Inhalt passt, ist ein wiederkehrendes Muster (Worktree-Reuse) und macht jeden Remove zum Datenverlust-Risiko.
> **8. Commit-Hooks melden Branchnamen- und Scope-Fehler nacheinander statt zusammen** (drift, scripts/hooks/commit)
> 
> Beobachtet im repo-hygiene-Lauf 2026-08-20 beim Sichern der WIP nach T012972.
> 
> Runde 1: pre-commit lehnte den Branchnamen ab ("keine Ticket-ID gefunden ... Required: type/<slug>-T000XXX"). Runde 2 nach Branch-Umbenennung: commit-msg lehnte den Scope ab ("unknown scope 'rescue'"). Erst Runde 3 mit chore(T012972) ging durch.
> 
> Beide Hooks nennen den Fix praezise, pruefen aber sequenziell: jeder Fehlschlag ist eine eigene Commit-Runde inklusive der vorgelagerten Hook-Laeufe (openspec-half-archive-check, SCS-Reindex). Bei einem Commit, der nur Arbeit sichern soll, kostet das drei volle Durchlaeufe.
> 
> Moegliche Abhilfe: Branchnamens-Pruefung und Commit-Message-Pruefung im selben pre-commit-Durchlauf melden, oder die gueltigen Scopes im Ablehnungstext direkt auflisten statt auf `scripts/validate-commit-msg.sh scopes` zu verweisen.
> **9. worktree-clean-check rc=2 bei aktiver Fremdsession sieht wie ein Werkzeugfehler aus** (suspicious, scripts/worktree-clean-check.sh)
> 
> Beobachtet im repo-hygiene-Lauf 2026-08-20 an .claude/worktrees/a3-lsp.
> 
> `bash scripts/worktree-clean-check.sh .claude/worktrees/a3-lsp` meldete rc=2 mit "Stat-Cache drift: erster und zweiter Lauf liefern unterschiedliche Residuen — kein verlaesslicher Befund". Ursache war eine parallel laufende Session: `readlink /proc/<pid>/cwd` wies PID 2925998 mit cwd im Worktree nach, und der HEAD des Worktrees bewegte sich waehrend des Laufs (092398b30 -> eec1dac50).
> 
> Das fail-closed-Verhalten ist korrekt — der Guard verweigert ein Urteil, statt eines zu erfinden. Die Meldung nennt aber nur das Symptom (Stat-Cache), nicht die haeufigste Ursache. Der Aufrufer muss selbst auf die Idee kommen, per Prozess-cwd nach einer Fremdsession zu suchen, sonst liest sich rc=2 wie ein kaputtes Skript und verleitet zum --force.
> 
> Moegliche Abhilfe: bei erkanntem Stat-Cache-Drift zusaetzlich pruefen, ob ein Prozess seinen cwd im Worktree hat, und das in der Meldung nennen.
> **10. SCS-Reindex schlaegt beim Commit fehl, Commit geht trotzdem durch** (drift, scripts/hooks/scs-reindex)
> 
> Beobachtet im repo-hygiene-Lauf 2026-08-20 beim Commit 271f8f7a2 (Branch chore/rescued-wip-reaper-worktree-guard-T012972).
> 
> Hook-Ausgabe:
  > [SCS] Reindexing 2 changed file(s)...
  > [SCS] Incremental reindex complete.
  > [SCS] WARN: reindex failed for scripts/branch-reaper.sh
  > [SCS] embed=http://localhost:8081 model=bge-m3 pghost=localhost
> 
> Der Commit wurde erstellt, aber der Codebase-Memory-Index bleibt fuer scripts/branch-reaper.sh auf dem alten Stand. Die Meldung "Incremental reindex complete" steht dabei VOR der WARN-Zeile, was den Fehlschlag optisch verdeckt.
> 
> Folge: graph-basierte Suchen auf branch-reaper.sh liefern veraltete Symbole, ohne dass das irgendwo sichtbar waere. Fehlerursache wurde nicht ermittelt (Embed-Endpoint localhost:8081 war zum Zeitpunkt des Laufs nicht gegengeprueft) — [UNVERIFIED: Grund des Reindex-Fehlschlags nicht nachgeprueft, nur die WARN-Ausgabe selbst ist belegt].

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
