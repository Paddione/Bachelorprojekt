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
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
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

- [ ] **1. routing-check FEHLT für gemma12-vision — GPU-Loadout heute nicht geladen** (drift, llm-proxy) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **2. Drei plan_staged Mishap-Rollup-Container akkumulieren gleichzeitig** (suspicious, factory/mishap-rollup) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **3. export_ticket_timeline exitiert mit rc=3 statt Timeline zu liefern** (degraded, ticket-mcp) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **4. Factory-Dispatcher: drei parallele Runs kollidierten auf Slot 1** (degraded, factory) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **5. Factory-Tick hing nach abgebrochenen Runs (wakeup wartete endlos auf auto-close-merged)** (degraded, factory) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **6. Worktree t013036-large-files zeigt auf fehlenden Commit (fsck missing commit)** (suspicious, repo) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **7. Mishap-Rollup-Serie vermehrt sich: 14 identische Container gleichzeitig in der Factory-Queue** (drift, ticket-system/mishap-rollup) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **8. G-BRAIN14 misst Manifestgröße statt Pending-Backlog — Goal-Kennzahl strukturell defekt** (drift, repo/scripts/health-goals-check) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **9. brain-ingest Delivery bricht mit non-fast-forward, wenn zwei Läufe konkurrieren** (degraded, scripts/brain-ingest) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **10. Bash-Ergebnis verschwindet bei Parallel-Call mit skill-/MCP-Tool** (suspicious, opencode-harness/tool-parallelism) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung

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
