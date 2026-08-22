---
title: "mishap-incident-rollup-2026-08-22-T013910 — Implementation Plan"
ticket_id: T013910
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-22-T013910 — Implementation Plan

_Container-Ticket: T013910_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-22 20:26 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-22 20:26 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | degraded | factory/executor | Factory-PR committet eigenes openspec-status.json nicht — BATS-Freshness-Gate rot (PR #5020, T013303) |
> | 2 | degraded | ci/github-workflows | merge=ours-Phantomkonflikt (DIRTY) unterdrückt auch synchronize-Re-Trigger — leerer Re-Trigger-Commit wirkungslos (PRs #5020/#5021) |
> | 3 | suspicious | scripts/index-repo.ts | SCS-Reindex-Warnungen für ~30 Dateien bei Commits — Embed-Dienst :8081 transient nicht erreichbar |
> | 4 | degraded | scripts/git-worktree-health.sh | git-worktree-health.sh objects: transienter fsck-Fehler bei Erstlauf, Zweitlauf sauber |
> | 5 | suspicious | skills/repo-hygiene §1 | Factory-Tick-Vorcheck (flock-Probe) und factory_status tick_running widersprechen sich |
> | 6 | process | skills/repo-hygiene §1 | Hygiene-Lauf: Clean-Check-Exitcodes zunächst via Pipe auf tail gemessen |
> | 7 | degraded | factory/post-merge-closure | Merge=Closure nicht ausgeloest: T013843 blieb nach gemergtem PR #5034 auf triage |
> | 8 | degraded | agents/dispatch | Subagent-Dispatch-Kette komplett ausgefallen (Cloud gecancelt, qwen38 locked) |
> | 9 | suspicious | tests/spec/agent-skills | BATS-Test finalize-hardening.bats nutzt fragilen awk-Wort-Anker ("branch-reaper") |
> | 10 | degraded | repo/hooks | SCS-Incremental-Reindex schlägt fehl (WARN beim Commit, embed :8081) |
> 
> **1. Factory-PR committet eigenes openspec-status.json nicht — BATS-Freshness-Gate rot (PR #5020, T013303)** (degraded, factory/executor)
> 
> Der Factory-Executor legte den OpenSpec-Change mishap-incident-rollup-2026-08-22-T013316 an, committete aber das regenerierte components/website/src/data/openspec-status.json nicht mit. CI (BATS Unit + Quality Gates) scheiterte an "Ensure freshness artifacts are up to date" mit "regenerated but not staged". Verifiziert: lokales freshness:regenerate im PR-Worktree reproduzierte exakt diesen einen Diff (fehlender T013303-Eintrag). Fix angewandt: regenerieren + commit + push → 18/18 grün. Der Generator/Executor sollte das Status-Artefakt des eigenen Changes automatisch in denselben Commit ziehen.
> **2. merge=ours-Phantomkonflikt (DIRTY) unterdrückt auch synchronize-Re-Trigger — leerer Re-Trigger-Commit wirkungslos (PRs #5020/#5021)** (degraded, ci/github-workflows)
> 
> Beide PRs standen wegen der generierten JSON-Artefakte (openspec-status.json, test-inventory.json, repo-index.json mit Custom-Merge-Driver) auf mergeStateStatus=DIRTY. Folge: GitHub startete KEINE pull_request-Workflows — bei #5021 überhaupt nicht (nur GitLab-Mirror), bei #5020 keinen Neustart nach Fix-Push. Ein leerer Re-Trigger-Commit auf #5021 blieb solange wirkungslos; erst der lokale Merge von origin/main + freshness:regenerate + Push räumte DIRTY weg, und sofort liefen 18 Checks. Erweiterung zum Runbook-Wissen T002822: Die CI-Unterdrückung gilt nicht nur beim PR-Open, sondern auch für synchronize-Re-Trigger. Diagnoseweg: gh pr view --json mergeStateStatus VOR der Trigger-Jagd lesen.
> **3. SCS-Reindex-Warnungen für ~30 Dateien bei Commits — Embed-Dienst :8081 transient nicht erreichbar** (suspicious, scripts/index-repo.ts)
> 
> Bei den Commit/Push-Läufen in drei Worktrees meldete der SCS-Hook wiederholt "[SCS] WARN: reindex failed" (scripts/index-repo.ts gegen embed=http://localhost:8081, model=bge-m3) für ~30 geänderte Dateien. Gegenprobe: curl auf :8081/health antwortet 200, Port von kubectl geforwardet — der Dienst ist erreichbar, die Fehler waren also transient (Verdacht: Überlastung beim Bulk-Reindex von 56 Dateien). Folge: der semantische Code-Such-Index kann für die betroffenen Dateien veraltet sein. Beobachtung nur, kein Repo-Fix abgeleitet.
> **4. git-worktree-health.sh objects: transienter fsck-Fehler bei Erstlauf, Zweitlauf sauber** (degraded, scripts/git-worktree-health.sh)
> 
> Beim repo-hygiene-Lauf 2026-08-22 meldete der erste Aufruf von `bash scripts/git-worktree-health.sh objects` rc=1 mit "BEFUND: git fsck meldet Fehler" inkl. "missing commit 0fd1976e4dc5390d9e6388aa537231e0d004dc3f" unter ~300 dangling-Zeilen. Unmittelbare Gegenprobe: direktes `git fsck --no-reflogs` endete rc=0 ohne harte Fehler, zweiter Skript-Aufruf ebenfalls rc=0 ("Objektspeicher intakt"). Vermutliche Ursache: zeitgleiche Git-Aktivität (Factory-Tick) während des fsck. Der Guard ist damit unter Last als flaky-Messung beobachtet — ein einmaliger rc=1 sollte vor Eingriffen immer per Zweitmessung bestätigt werden.
> **5. Factory-Tick-Vorcheck (flock-Probe) und factory_status tick_running widersprechen sich** (suspicious, skills/repo-hygiene §1)
> 
> Im repo-hygiene-Lauf 2026-08-22 antwortete der dokumentierte Factory-Tick-Vorcheck (flock-Probe auf /tmp/factory-tick.lock, identisch zu scripts/factory/mcp-server.mjs) mit "kein Tick aktiv". Wenige Minuten später meldete factory_status tick_running=true. Entweder startete der Tick in dem Fenster, oder die Lock-Probe und das MCP-Signal weichen ab — letzteres würde den §1-Vorcheck unwirksam machen (Worktree-Mutationen während eines Ticks). [UNVERIFIED — Divergenzursache nicht eingrenzbar, beide Messwerte liegen vor; keine Mutationen waren betroffen, da §1/§2 in diesem Lauf rein lesend blieben.]
> **6. Hygiene-Lauf: Clean-Check-Exitcodes zunächst via Pipe auf tail gemessen** (process, skills/repo-hygiene §1)
> 
> Beim Worktree-Clean-Check des repo-hygiene-Laufs 2026-08-22 wurde im ersten Schleifendurchlauf `bash scripts/worktree-clean-check.sh "$wt" | tail -5; echo rc=$?` verwendet — gemessen wurde damit der Exit-Code von tail, nicht des Skripts (exakt die Piping-Falle aus repo-hygiene-ops §1). Erkannt und korrigiert: zweite Messung mit Ausgabe in Variable und separatem rc=$? — alle 6 Worktrees rc=0. Kein Sachschaden; als Erinnerung protokolliert, dass die Korrekturmessung das Primärergebnis ist.
> **7. Merge=Closure nicht ausgeloest: T013843 blieb nach gemergtem PR #5034 auf triage** (degraded, factory/post-merge-closure)
> 
> PR #5034 (fix/rollup-escalation-dedupe-T013843) wurde am 2026-08-22T19:34:24Z nach main gemergt. Zwei Stunden spaeter, im repo-hygiene-Lauf um 21:40, stand T013843 unveraendert auf status=triage, updated_at=2026-08-22T19:06:48Z — also auf dem Anlagezeitpunkt, ohne jede Statusaenderung nach dem Merge. Die Konvention "Merge = Abschluss" (CLAUDE.md, T001092) verlangt done/resolution=fixed direkt bei gruenem Merge nach main.
> 
> Verifikation:
  > gh pr view 5034 --json state,mergedAt   # MERGED, 2026-08-22T19:34:24Z
  > bash scripts/ticket.sh get --id T013843 # status=triage, updated_at=19:06:48Z
> 
> Der Merge lief ueber Auto-Merge (Enable-Auto-Merge-Workflow), nicht ueber einen interaktiven dev-flow-execute-Lauf. Verdacht: der Closure-Pfad haengt an devflow-post-merge-finalize.sh, das bei Auto-Merge niemand aufruft — dann ist das die Automatisierungsluecke hinter den in T013315 beschriebenen Werkzeugfehlern, aber ein eigener Befund: dort scheitert das Skript, hier laeuft es gar nicht. Folge: ein gemergtes Ticket bleibt unsichtbar offen und taucht in Queue- und Triage-Sichten als unerledigt auf. Manuell geschlossen im Hygiene-Lauf.
> 
> Zusatzbefund derselben Klasse: der Worktree .worktrees/rollup-escalation-dedupe-T013843 und der Remote-Branch existierten nach dem Merge weiter und mussten von Hand ueber branch-reaper.sh abgeraeumt werden.
> **8. Subagent-Dispatch-Kette komplett ausgefallen (Cloud gecancelt, qwen38 locked)** (degraded, agents/dispatch)
> 
> ticket-ops Wave-1-Dispatch 2026-08-22: Der deepseek-flash-Batch (3 parallele Planungs-Dispatches) wurde gecancelt ("Task cancelled" ×3), und der lokale qwen38 war gesperrt (Loadout lt. Operator nicht ablösbar — exclusiveGroup chat-gpu). Die gesamte Welle fiel auf Orchestrator-Selbstausführung zurück. Konsequenz: Keine parallele Plan-Kapazität verfügbar; Ausführungsgeschwindigkeit begrenzt durch eine Session. [VERIFIED — Tool-Rückgaben + Operator-Aussage]
> **9. BATS-Test finalize-hardening.bats nutzt fragilen awk-Wort-Anker ("branch-reaper")** (suspicious, tests/spec/agent-skills)
> 
> finalize-hardening.bats extrahiert die Schritt-10-Sektion von devflow-post-merge-finalize.sh per awk bis zur ERSTEN Zeile, die "branch-reaper" enthält. Jeder Kommentar innerhalb des Abschnitts, der dieses Wort nennt, schneidet die Sektion vor den mark_warn-Zeilen ab und lässt den Test failen ("B2: Schritt 10 meldet einen Widerspruch..."). Reproduziert: Kommentar mit "branch-reaper"-Erwähnung eingefügt → Test rot; umformuliert → 36/36 grün. Vorschlag: Anker auf eine stabile Marker-Zeile (z.B. den mark_ok/mark_warn-Aufruf selbst oder einen dedizierten Sektionsmarker) statt eines freien Wortes im Kommentar-Text. [VERIFIED — reproduziert im T013315-Lauf]
> **10. SCS-Incremental-Reindex schlägt fehl (WARN beim Commit, embed :8081)** (degraded, repo/hooks)
> 
> Beim Commit von chore/post-merge-finalize-hardening-T013315 (b603b8a1d) meldete der Pre-Commit-Hook "[SCS] WARN: reindex failed for scripts/devflow-post-merge-finalize.sh" (embed=http://localhost:8081 model=bge-m3 pghost=localhost). Commit lief durch, aber der Code-Knowledge-Graph-Index für die geänderte Datei ist vermutlich stale. Ursache nicht weiter verfolgt (Embedding-Dienst nicht erreicht?). [VERIFIED — Hook-Output im Commit-Log]
> ### Mishap-Rollup — 1 Eintraege (Carry-over aus mishap-incident-rollup-2026-08-22-T013328)
> 
> Uebertrag aus dem abgeschlossenen Zyklus `mishap-incident-rollup-2026-08-22-T013328`: diese Eintraege blieben dort ohne
> Disposition. Sie werden hier weitergefuehrt, damit sie mit dem Container nicht
> stillschweigend verfallen.
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | suspicious | llm-proxy/request-log | llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse) |
> 
> **1. llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse)** (suspicious, llm-proxy/request-log)
> 
> Unerledigt aus `mishap-incident-rollup-2026-08-22-T013328` uebernommen. Die urspruengliche Beschreibung steht im
> Batch-Kommentar jenes Zyklus und im dortigen Plan.

## Aufgaben — ein Eintrag, eine Entscheidung

So wird dieser Container abgearbeitet: **jeder Eintrag unten bekommt eine Disposition**, und
zwar genau eine der vier folgenden. Erst dann wird seine Box abgehakt.

| Disposition | Wann | Was sie verlangt |
|---|---|---|
| **gefixt** | der Eintrag beschreibt ein Problem, das in diesem Zyklus behoben wird | Code- oder Konfigaenderung **plus** ein Test, der das Fehlverhalten vorher reproduziert |
| **bereits gefixt** | das Problem ist zwischenzeitlich anderswo behoben worden | den Beleg nennen (PR-Nummer oder Commit) und gegenpruefen, dass er auf `main` liegt |
| **kein Repo-Fix** | transientes Laufzeitereignis, Bedienfehler, oder bewusst so gewollt — und NICHT wiederholungsanfaellig | begruenden, warum keine Repo-Aenderung folgt UND warum kein Ablaufdatum noetig ist |
| **beobachten (bis Zyklus <JJJJ-MM-TT>)** | transient, aber wiederholungsanfaellig — der Workaround soll proaktiv im Blick bleiben | ein Ablaufdatum: der Generator fuehrt den Eintrag bis dahin in jedem Zyklus fort, danach wird er in ein eigenes Ticket eskaliert |

Ein Eintrag darf offen bleiben, wenn er den Rahmen dieses Zyklus sprengt — dann bleibt seine
Box leer und der Grund steht dahinter. Was nicht zulaessig ist: eine Box abhaken, ohne die
Disposition hinzuschreiben. Die Dispositionen zusammen sind der Nachweis, dass der Container
abgearbeitet wurde und nicht nur geschlossen.

- [ ] **1. Factory-PR committet eigenes openspec-status.json nicht — BATS-Freshness-Gate rot (PR #5020, T013303)** (degraded, factory/executor) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **2. merge=ours-Phantomkonflikt (DIRTY) unterdrückt auch synchronize-Re-Trigger — leerer Re-Trigger-Commit wirkungslos (PRs #5020/#5021)** (degraded, ci/github-workflows) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **3. SCS-Reindex-Warnungen für ~30 Dateien bei Commits — Embed-Dienst :8081 transient nicht erreichbar** (suspicious, scripts/index-repo.ts) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **4. git-worktree-health.sh objects: transienter fsck-Fehler bei Erstlauf, Zweitlauf sauber** (degraded, scripts/git-worktree-health.sh) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **5. Factory-Tick-Vorcheck (flock-Probe) und factory_status tick_running widersprechen sich** (suspicious, skills/repo-hygiene §1) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **6. Hygiene-Lauf: Clean-Check-Exitcodes zunächst via Pipe auf tail gemessen** (process, skills/repo-hygiene §1) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **7. Merge=Closure nicht ausgeloest: T013843 blieb nach gemergtem PR #5034 auf triage** (degraded, factory/post-merge-closure) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **8. Subagent-Dispatch-Kette komplett ausgefallen (Cloud gecancelt, qwen38 locked)** (degraded, agents/dispatch) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **9. BATS-Test finalize-hardening.bats nutzt fragilen awk-Wort-Anker ("branch-reaper")** (suspicious, tests/spec/agent-skills) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **10. SCS-Incremental-Reindex schlägt fehl (WARN beim Commit, embed :8081)** (degraded, repo/hooks) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **1. llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse)** (suspicious, llm-proxy/request-log) **×19** (Rezurrenz: T013328,T013784,T013893,T013894,T013895,T013896,T013897,T013898,T013899,T013900,T013901,T013902,T013903,T013904,T013905,T013906,T013907,T013908,T013910) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung

- [ ] **Failing-Test-Step (RED).** Fuer jeden Eintrag, der die Disposition **gefixt** bekommt,
      zuerst einen Test schreiben, der das beschriebene Fehlverhalten reproduziert. Er gehoert
      nach `tests/spec/<spec-slug>/<kurz-slug>.bats` — das Verzeichnis der Spec, die das
      Verhalten abdeckt. Eintraege mit den beiden anderen Dispositionen brauchen keinen Test.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/<spec-slug>/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
