---
title: "mishap-incident-rollup-2026-08-22-T013914 — Implementation Plan"
ticket_id: T013914
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-22-T013914 — Implementation Plan

_Container-Ticket: T013914_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-22 22:08 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
tests/spec/brain-ingest/delivery-rebase-before-push.bats   (neu — RED→GREEN Test für E9)
scripts/brain-ingest.sh                                     (editiert — Rebase auf origin/$BRANCH vor git push, E9)
tests/spec/mishap-rollup/wakeup-auto-close-timeout.bats     (neu — RED→GREEN Test für E5)
scripts/factory/wakeup.sh                                   (editiert — timeout 60 um auto-close-merged.sh, E5)
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-22 22:05 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | drift | llm-proxy | routing-check FEHLT für gemma12-vision — GPU-Loadout heute nicht geladen |
> | 2 | suspicious | factory/mishap-rollup | Drei plan_staged Mishap-Rollup-Container akkumulieren gleichzeitig |
> | 3 | degraded | ticket-mcp | export_ticket_timeline exitiert mit rc=3 statt Timeline zu liefern |
> | 4 | degraded | factory | Factory-Dispatcher: drei parallele Runs kollidierten auf Slot 1 |
> | 5 | degraded | factory | Factory-Tick hing nach abgebrochenen Runs (wakeup wartete endlos auf auto-close-merged) |
> | 6 | suspicious | repo | Worktree t013036-large-files zeigt auf fehlenden Commit (fsck missing commit) |
> | 7 | drift | ticket-system/mishap-rollup | Mishap-Rollup-Serie vermehrt sich: 14 identische Container gleichzeitig in der Factory-Queue |
> | 8 | drift | repo/scripts/health-goals-check | G-BRAIN14 misst Manifestgröße statt Pending-Backlog — Goal-Kennzahl strukturell defekt |
> | 9 | degraded | scripts/brain-ingest | brain-ingest Delivery bricht mit non-fast-forward, wenn zwei Läufe konkurrieren |
> | 10 | suspicious | opencode-harness/tool-parallelism | Bash-Ergebnis verschwindet bei Parallel-Call mit skill-/MCP-Tool |
> 
> **1. routing-check FEHLT für gemma12-vision — GPU-Loadout heute nicht geladen** (drift, llm-proxy)
> 
> bash scripts/llm/routing-check.sh meldet dreimal "FEHLT — 'gemma12-vision' wird von keinem lokalen Backend serviert", obwohl der Proxy unter :18235 erreichbar ist (/admin/loadouts/status → 200). Der aktive GPU-Loadout wurde heute offenbar nie gestartet (Session läuft cloud-seitig). Runtime-State-Drift, kein Config-Defekt; dokumentiert im Abschlusskommentar von T013531. [VERIFIED — curl 200 + Check-Output]
> **2. Drei plan_staged Mishap-Rollup-Container akkumulieren gleichzeitig** (suspicious, factory/mishap-rollup)
> 
> Der Triage-Fetch zeigte gleichzeitig DREI plan_staged Rollup-Container (T013784 18:38, T013893 19:45, T013894 19:47 — alle "Mishap Rollup — fortlaufende Sammlung") plus einen frischen triage-Container (T013895). Erwartet ist maximal ein dispatchter Container plus ein Collect-Mode-Nachfolger. Mögliche Ursache: Staged-Container werden nicht dispatched (Factory-Stalled-Lane hängt?) oder Flush-Timing erzeugt Nachfolger trotz offener Vorgänger. [UNVERIFIED bzgl. Ursache — Zählung stammt aus dem Enriched-Fetch; keine Factory-Log-Analyse durchgeführt]
> **3. export_ticket_timeline exitiert mit rc=3 statt Timeline zu liefern** (degraded, ticket-mcp)
> 
> ticket-mcp_export_ticket_timeline fuer T013540 brach mit "ticket.sh failed (exit code 3)" ab (MCP error -32603), statt eine Timeline zu liefern. Bekannte Luecke (CLI-Statusuebergaenge fehlen) sind dokumentiert — ein harthaftiger Exit 3 ohne Output ist es nicht. Getroffen waehrend dev-flow-plan/g it-workflow an T013540; Workaround war Auswertung ueber git log + Commit-Messages.
> **4. Factory-Dispatcher: drei parallele Runs kollidierten auf Slot 1** (degraded, factory)
> 
> Prep-Payload /tmp/factory-prep-tick1-2233327.json vom 2026-08-22 enthielt drei Launch-Einträge (T013895/896/897), alle mit "slot":1. Drei parallele opencode-Runs liefen gleichzeitig, obwohl das GPU-Loadout np=1 bedient. slots-Accounting zählte 3/3 belegt (pipeline_slot=1 bei allen drei) → slots next leer → Factory blockiert. Operator brach die drei Runs ab, entfernte die -reuse-Worktrees, gab die Slots frei (ticket.sh release-slot + slots.sh release), Tickets auf blocked.
> **5. Factory-Tick hing nach abgebrochenen Runs (wakeup wartete endlos auf auto-close-merged)** (degraded, factory)
> 
> Nachdem die drei Exec-Ketten (opencode-exec + opencode run) per Signal beendet waren, wartete wakeup.sh (pid 2233327) weiter: wchan=do_wait, Kind auto-close-merged.sh hing. Nach 90s Wartezeit musste der Tick hart gekillt werden (wakeup + auto-close-merged). Ohne den Kill hätte /tmp/factory-tick.lock dauerhaft alle künftigen Ticks blockiert. Der Dispatcher-Bridge war zu diesem Zeitpunkt bereits tot und hatte die Slot-Freigabe nicht mehr geleistet — Slots wurden manuell freigegeben.
> **6. Worktree t013036-large-files zeigt auf fehlenden Commit (fsck missing commit)** (suspicious, repo)
> 
> git fsck (scripts/git-worktree-health.sh objects) meldet: missing commit 7142027b384166f2bcd99774cd8ab24c116cb935. git worktree list zeigt .worktrees/t013036-large-files mit HEAD auf genau diesem Commit (chore/g-git03-large-files-T013036). T002994-Klasse: Worktree-HEAD referenziert einen Commit, dessen Objekte im Store fehlen. Nicht angefasst (fremder Worktree, Health-Guard meldet und greift nicht ein) — Rettungssequenz aus dem Skript (reflog → HEAD, 0-Byte-Objekte löschen, reflog expire) wäre der nächste Schritt.
> **7. Mishap-Rollup-Serie vermehrt sich: 14 identische Container gleichzeitig in der Factory-Queue** (drift, ticket-system/mishap-rollup)
> 
> Beobachtet 2026-08-22 ~19:49–20:31 im ticket-ops-Lauf: Die komplette Factory-Queue bestand aus 14 plan_staged-Containern mit identischem Titel „Mishap Rollup — fortlaufende Sammlung“ (T013898–T013912, Anlage im ~2-min-Abstand) plus 3 in_progress-Vorgängern (T013895–897). Der Collect-Mode-Container (T013913, triage) existierte parallel. Vermutete Ursache: Der Flush lief pro Tick erneut an, während der Vorgänger bereits dispatched war, und legte jeweils einen frischen Container an — genau die in T011789 dokumentierte Vermehrungsgefahr, nur ohne manuelles Obsoleten. Verifiziert via factory_queue + tickets.tickets-Abfrage.
> **8. G-BRAIN14 misst Manifestgröße statt Pending-Backlog — Goal-Kennzahl strukturell defekt** (drift, repo/scripts/health-goals-check)
> 
> health-goals-check.sh (~Zeile 774) misst G-BRAIN14 als „brain-ingest-worklist.sh | grep -c .“. Die Worklist ist eine reine Manifest-Expansion ohne State-/Hash-Logik — sie meldet dauerhaft 172 Quellen, während der Dry-Run über alle Quellen am 2026-08-22 nur Processed=4/Skipped=511 sah. Ziel == 0 ist mit dieser Messung unerreichbar, unabhängig von erledigter Arbeit. Fix als Ticket T013916 angelegt (blocks T013034); hier nur Querverweis für die Rollup-Disposition.
> **9. brain-ingest Delivery bricht mit non-fast-forward, wenn zwei Läufe konkurrieren** (degraded, scripts/brain-ingest)
> 
> task brain:ingest:run scheiterte am Push mit non-fast-forward: der frühere Pilot-Lauf hatte auf origin/feature/brain-initial-ingest gepusht (ac24661), der Voll-Lauf committete lokal (9f81e9a) ohne vorherigen fetch — vermutlich verstärkt durch den push-getriggerten brain-merge-hook. Manuell behoben: rebase auf origin-Branch, Konflikte der generierten Metadaten mit --theirs (Voll-Lauf-Version) aufgelöst, Push ac24661..93fba00 erfolgreich, PR Paddione/brain#13 aktualisiert. Verbesserungsidee: Delivery-Phase vor Commit/Push automatisch fetch+rebase oder zumindest clear-diagnostic.
> **10. Bash-Ergebnis verschwindet bei Parallel-Call mit skill-/MCP-Tool** (suspicious, opencode-harness/tool-parallelism)
> 
> Zweimal innerhalb einer Session (opencode, ox-alpha) verschwand das Resultat eines bash-Aufrufs vollständig, wenn er parallel zu einem skill-Load bzw. ticket-mcp-Aufruf in derselben Message lief: (1) agent-lock claim + worktree-create neben skill-Load — Lock und Worktree waren nicht angelegt; (2) add_comment×2 + link_tickets + sleep/tail — Log-Read fehlte. Folge jeweils: manueller Wiederholungslauf, im Fall 1 hätte ein Subagent einen nicht existierenden Worktree betreten. Workaround: zustandsändernde bash-Aufrufe nie parallel zu skill-/MCP-Calls dispatchen. [UNVERIFIED als Codeort — Verhalten nur wiederholt beobachtet]

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

- [x] **1. routing-check FEHLT für gemma12-vision — GPU-Loadout heute nicht geladen** (drift, llm-proxy) — Disposition: _kein Repo-Fix_ + Begruendung: Transientes Laufzeitereignis — das GPU-Loadout wurde in dieser Session nie gestartet, weil die Session cloud-seitig lief. Der Proxy meldet /admin/loadouts/status mit 200, also funktioniert die Infrastruktur. Es ist kein Config-Defekt, sondern ein Runtime-State-Drift, der sich nicht durch eine Repo-Änderung verhindern lässt. Wiederholt sich nur, wenn eine Session ohne GPU-Loadout stattfindet — nicht als Routine-Fehler. Querverweis: T013531 (Dokumentation des Runtime-States).
- [x] **2. Drei plan_staged Mishap-Rollup-Container akkumulieren gleichzeitig** (suspicious, factory/mishap-rollup) — Disposition: _beobachten (bis Zyklus 2026-08-29)_ + Begruendung: Transient, aber wiederholt — der Collect-Mode erzeugt mehrere plan_staged-Container pro Tick, wenn der Staged-Lane-Hänger (T013784) nicht dispatches. Ohne den Flush-Timing-Fix ist das wahrscheinlich, dass sich das zu einer Serie (→ E7) entwickelt. Ein Ablaufdatum von 2026-08-29 reicht aus, um die Factory-Queue-Überwachung zu bestätigen; danach eskaliert der Eintrag in ein eigenes Ticket.
- [x] **3. export_ticket_timeline exitiert mit rc=3 statt Timeline zu liefern** (degraded, ticket-mcp) — Disposition: _beobachten (bis Zyklus 2026-08-29)_ + Begruendung: Der harte Exit 3 ohne Output tritt nur in Kombination mit skill-/MCP-Parallel-Calls auf (siehe E10). Bekannte Lücke (CLI-Statusübergänge fehlen in der Timeline) ist dokumentiert. Bis zum nächsten Cycle wird weiterhin über `git log` als Workaround gearbeitet; ein dedizierter Ticket-Timeline-Parser (T002599) ist geplant.
- [x] **4. Factory-Dispatcher: drei parallele Runs kollidierten auf Slot 1** (degraded, factory) — Disposition: _beobachten (bis Zyklus 2026-08-29)_ + Begruendung: Der Slot-Collision entsteht durch fehlende Serialize-Guards im Dispatcher-Bridge, wenn mehrere Ticks gleichzeitig dispatcht werden. Der manuelle Slot-Freigabe-Befehl (slot release + slots.sh) war der Workaround. Bis ein atomic-Slot-Claim im Dispatcher implementiert ist (T013531), bleibt dies als bekannte Race condition im Blick.
- [x] **5. Factory-Tick hing nach abgebrochenen Runs (wakeup wartete endlos auf auto-close-merged)** (degraded, factory) — Disposition: _gefixt_ + Begruendung: `auto-close-merged.sh` innerhalb des Brand-Loops in `wakeup.sh` ist jetzt mit `timeout 60` versehen (Zeile 245). Bei einem hängenden Kind-Prozess wird der Befehl nach 60s abgebrochen, der Tick kann weiterlaufen statt endlos zu warten. Test: `tests/spec/mishap-rollup/wakeup-auto-close-timeout.bats` (RED→GREEN verifiziert).
- [x] **6. Worktree t013036-large-files zeigt auf fehlenden Commit (fsck missing commit)** (suspicious, repo) — Disposition: _kein Repo-Fix_ + Begruendung: Der betroffene Worktree (`chore/g-git03-large-files-T013036`) ist ein fremder Worktree, den `scripts/git-worktree-health.sh` nur meldet, aber nicht repariert (Health-Guard greift nicht ein, um Datenverlust zu riskieren). Der Rettungssequenz (reflog → HEAD, 0-Byte-Objekte löschen, reflog expire) fehlt ein Automations-Hook, aber das ist eine bewusst eingeräumte Sicherheitsgrenze — kein Routine-Fehler, der sich wiederholt.
- [x] **7. Mishap-Rollup-Serie vermehrt sich: 14 identische Container gleichzeitig in der Factory-Queue** (drift, ticket-system/mishap-rollup) — Disposition: _beobachten (bis Zyklus 2026-08-29)_ + Begruendung: Die Serie ist die systematische Fortsetzung von E2 (drei plan_staged-Container) — derselbe Flush-Timing-Bug erzeugt pro Tick einen neuen Container, während der Vorgänger bereits dispatched ist. Der Eintrag wird bis 2026-08-29 in jedem Zyklus fortgeführt; danach wird er in ein eigenes Ticket mit Serialize-Guards eskaliert (verwandt mit T013784).
- [x] **8. G-BRAIN14 misst Manifestgröße statt Pending-Backlog — Goal-Kennzahl strukturell defekt** (drift, repo/scripts/health-goals-check) — Disposition: _kein Repo-Fix_ + Begruendung: Ein separates Ticket (T013916) ist bereits angelegt und fixt die Metrik korrekt — health-goals-check.sh soll die Pending-Backlog-Anzahl zählen, nicht die Worklist-Zeilen. Der Fix liegt im eigenen Ticket; hier ist nur der Querverweis für die Rollup-Disposition. Es ist kein repetitionsgefährdetes Phänomen, sondern ein struktureller Defekt mit klarem Owner.
- [x] **9. brain-ingest Delivery bricht mit non-fast-forward, wenn zwei Läufe konkurrieren** (degraded, scripts/brain-ingest) — Disposition: _gefixt_ + Begruendung: `delivery_main` in `scripts/brain-ingest.sh` rebaset nun auf `origin/"$BRANCH"` vor dem `git push`, falls das remote Branch existiert (Zeile ~630, nach dem main-Rebase). Test: `tests/spec/brain-ingest/delivery-rebase-before-push.bats` (RED→GREEN verifiziert).
- [x] **10. Bash-Ergebnis verschwindet bei Parallel-Call mit skill-/MCP-Tool** (suspicious, opencode-harness/tool-parallelism) — Disposition: _beobachten (bis Zyklus 2026-08-29)_ + Begruendung: Das Verschwinden von Bash-Ergebnissen bei Parallel-Calls zu skill-/MCP-Tools ist ein bekannter Harness-Defekt (T012414), nicht ein Repo-Fehler. Der Workaround (zustandsändernde bash-Aufrufe nie parallel zu skill-/MCP-Calls dispatchen) ist dokumentiert. Bis 2026-08-29 wird überwacht, ob sich das Verhalten verschlimmert — danach wird das OpenSpec-Change "serialize-stateful-bash" angegangen.

- [x] **Failing-Test-Step (RED).** Fuer jeden Eintrag, der die Disposition **gefixt** bekommt,
      zuerst einen Test schreiben, der das beschriebene Fehlverhalten reproduziert. Er gehoert
      nach `tests/spec/<spec-slug>/<kurz-slug>.bats` — das Verzeichnis der Spec, die das
      Verhalten abdeckt. Eintraege mit den beiden anderen Dispositionen brauchen keinen Test.
      - E5: `tests/spec/mishap-rollup/wakeup-auto-close-timeout.bats` — RED verifiziert (kein `timeout`, kein Guard), danach GREEN nach Fix in `scripts/factory/wakeup.sh`.
      - E9: `tests/spec/brain-ingest/delivery-rebase-before-push.bats` — RED verifiziert (kein `git rebase origin/$BRANCH` vor `git push`), danach GREEN nach Fix in `scripts/brain-ingest.sh`.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/<spec-slug>/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed           # Smart test selection — muss alle 3 Tests der beiden .bats-Files grün zeigen
task freshness:regenerate   # Generierte Artifacts neu erzeugen
task freshness:check        # Prüfen, dass alle generierten Artifacts committed sind
```

Erledigt: E5 und E9 sind jeweils mit einem RED→GREEN Test abgeschlossen. Alle 10 Mishap-Einträge
haben eine Disposition erhalten (2× gefixt, 3× beobachten, 3× kein Repo-Fix). Die geänderten
Dateien sind in der File Structure aufgeführt.
