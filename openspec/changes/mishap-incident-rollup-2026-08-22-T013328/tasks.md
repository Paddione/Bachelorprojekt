---
title: "mishap-incident-rollup-2026-08-22-T013328 — Implementation Plan"
ticket_id: T013328
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-22-T013328 — Implementation Plan

_Container-Ticket: T013328_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-22 15:27 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-22 14:32 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | drift | mishap-tracker | Mishap-Rollup-Container-Vermehrung: 11 Collect-Mode-Container parallel (Dedupe-Guard-Verstoß) |
> | 2 | process | repo/git-hooks | Commit-msg-Hook-Friction: drei Ablehnungen für Plan-only-Commit (Scope-Rätselraten) |
> | 3 | degraded | scripts/ticket.sh | stage-plan-Hilfe verschweigt --no-hold, obwohl eine explizite Hold-Entscheidung Pflicht ist |
> | 4 | drift | scripts/sdlc | SDLC-Skripte defaulten noch auf gemma26-throughput nach qwen38-Cutover |
> | 5 | suspicious | llm-proxy/request-log | llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse) |
> | 6 | drift | opencode-config | gemma26-throughput-Primary weiterhin als Tab-Agent waehlbar |
> | 7 | degraded | factory/mishap-rollup-carryover | Carry-over-Eskalations-Tickets haben kryptische Titel aus Task-Zeilen |
> | 8 | process | repo/hygiene | Paralleler Akteur mutiert Hauptcheckout während Hygiene-Lauf — §0-Befund löst sich mid-run auf |
> | 9 | degraded | openspec/archive | OpenSpec-Archiv hinterlässt uncommitteten SSOT-Merge — main verliert Requirements aus archiviertem Change (T013528) |
> | 10 | process | ci/gh-cli | gh run list findet Checks nicht beim Rollup-Namen — Job-Name ≠ Workflow-Name liefert leere Messung |
> 
> **1. Mishap-Rollup-Container-Vermehrung: 11 Collect-Mode-Container parallel (Dedupe-Guard-Verstoß)** (drift, mishap-tracker)
> 
> Am 2026-08-22 04:53–05:18 entstanden 11 gleichnamige 'Mishap Rollup — fortlaufende Sammlung'-Tickets im Collect Mode (triage, ohne FACTORY-PLAN-REF, 0 Kommentare, 28-Zeichen-Generikbeschreibung) neben dem vollständigen Container T013328. Design ist genau EIN Collect-Mode-Container; der Dedupe-Guard (Titel-Match im Collect Mode → wiederverwenden statt neu anlegen) griff wiederholt nicht. Verdacht: Flush-Lookup findet bei mehreren Kandidaten keinen eindeutigen Container und legt neu an → selbstverstärkende Schleife. Behandelt in ticket-ops-Triage 2026-08-22: 10 Hüllen als obsolete geschlossen, T013328 als kanonischer Container belassen; T013303 (blocked) und T013316 (plan_staged) waren bereits dispatched und blieben unangetastet.
> **2. Commit-msg-Hook-Friction: drei Ablehnungen für Plan-only-Commit (Scope-Rätselraten)** (process, repo/git-hooks)
> 
> Beim Planungs-Commit für T013044 im Worktree dreimal abgewiesen: (1) 'docs(openspec)' — Scope 'openspec' existiert nicht (gültig laut 'bash scripts/validate-commit-msg.sh scopes': website infra db security ops test plans factory agents skills ci scripts docs mcp deps). (2) 'fix(infra):' am Plan-only-Commit vom commit-vs-diff-Check abgelehnt mit Hinweis auf 'chore(plan):'. (3) 'chore(plan):' erneut abgelehnt — gültiger Scope heißt 'plans'. Kosten: drei Commit-Versuche für einen trivialen Plan-Commit. Verbesserungsidee: die Fehlermeldung des conventional-commit-Checks könnte bei unbekanntem Scope direkt die gültige Liste nennen statt generisch 'format check'; der commit-vs-diff-Hinweis sollte den korrekten Scope 'plans' zeigen.
> **3. stage-plan-Hilfe verschweigt --no-hold, obwohl eine explizite Hold-Entscheidung Pflicht ist** (degraded, scripts/ticket.sh)
> 
> 'bash scripts/ticket.sh stage-plan --help' zeigt als einzige Flag '[--hold]' und beschreibt sie als optional. Der Aufruf ohne Hold-Flag scheitert jedoch mit 'ERROR: stage-plan verlangt eine explizite Hold-Entscheidung ... --hold = Operator gibt spaeter frei, --no-hold = Factory greift sofort zu.' — --no-hold taucht in der Hilfe gar nicht auf. Verifiziert 2026-08-22 beim Stagen von T013044/T013041. Fix-Richtung: Usage-Zeile um '[--hold|--no-hold]' ergänzen und Pflicht-Charakter dokumentieren.
> **4. SDLC-Skripte defaulten noch auf gemma26-throughput nach qwen38-Cutover** (drift, scripts/sdlc)
> 
> scripts/sdlc/llm-up.sh:25 und health-gate.sh:22 defaulten weiter auf SDLC_LLM_LOADOUT=gemma26-throughput, obwohl T013434 (Migration 2026-08-22-factory-model-qwen38.sql) provider_config + agent-models auf qwen38-220k geschwenkt hat. Jeder Aufruf von llm-up/start ueber diese Defaults belegt erneut die exclusiveGroup chat-gpu mit dem falschen Loadout (Ausloeser-Klasse von Incident T013527, drittes Vorkommen dieser Klasse). Fix: Default auf qwen38-220k ziehen oder SDLC_LLM_LOADOUT aus der Factory-Registry ableiten.
> **5. llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse)** (suspicious, llm-proxy/request-log)
> 
> Der erfolgreiche Dispatch vom 22.08. 14:40:44 (gemma26-throughput, 70 Prompt- -> 49 Output-Token, slot 2/task 0, durch Proxy geroutet) fehlt in tickets.llm_proxy_request_log — letzter echter Eintrag dort ist 14:19:07 (qwen38). capture() ist bewusst rueckwirkungsfrei (Fehler werden geschluckt), aber hier ging eine ERFOLGREICHE Zeile verloren; damit war die Client-Attribution fuer Incident T013527 nur indirekt moeglich. Verifiziert per MCP-Query am 22.08. Fix-Richtung: Flush-Fehler zumindest mit Warn-Zeile ins Journal; optional requested_model + Client bei [switch]-Events loggen.
> **6. gemma26-throughput-Primary weiterhin als Tab-Agent waehlbar** (drift, opencode-config)
> 
> ~/.config/opencode/opencode.jsonc exponiert weiterhin das Modell gemma26-throughput (Zeile ~162) und den Tab-Agenten gemma26-throughput-primary (Zeile ~414), obwohl alle lokalen Familien-Subagenten seit T013360 auf qwen38-220k liegen. Ein Klick auf diesen Tab-Agenten reicht aus, um per exclusiveGroup chat-gpu das qwen38-220k-Loadout zu evicten (Ausloeser-Klasse von T013527). Verifiziert via grep am 22.08. Fix: Agent entfernen, auf qwen38 umziehen oder mit Warn-Hinweis versehen; Sync via scripts/opencode-sync-agents.sh und agents.yaml-Abgleich beachten (test/spec/agent-roster.bats prueft nur Repo-Seite).
> **7. Carry-over-Eskalations-Tickets haben kryptische Titel aus Task-Zeilen** (degraded, factory/mishap-rollup-carryover)
> 
> Beobachtet beim repo-hygiene-Lauf am 2026-08-22: Sechs Tickets (T013425–T013427, T013431–T013433) mit attention_mode=needs_human tragen Titel der Form "[Rollup] - [ ] **7. Final Verification.**". Verifikation (get_ticket T013425) zeigt: Es sind korrekte Carry-over-Eskalationen aus der Mishap-Rollup-Loop [T013305] — Einträge, die in den Zyklen 2026-08-10-archive-deliverable-guard / 2026-08-11-secrets-schema-drift offen blieben. Der Mechanismus funktioniert also; aber der Titel wird wörtlich aus der Plan-Task-Zeile ("- [ ] **N. …**") abgeleitet. Ein Mensch in der Klärungsrunde kann aus dem Titel nicht erkennen, WELCHER Befund eskaliert wurde und was von ihm verlangt wird — das schwächt den needs_human-Kanal (6 von 18 offenen Tickets sind davon betroffen). Verbesserungsvorschlag: Eskalations-Titel aus der ursprünglichen Mishap-Beschreibung ableiten (z.B. erster Satz oder Komponente + Kurztitel), Task-Zeilen-Nummer höchstens als Präfix-Suffix führen.
> **8. Paralleler Akteur mutiert Hauptcheckout während Hygiene-Lauf — §0-Befund löst sich mid-run auf** (process, repo/hygiene)
> 
> Beim repo-hygiene-Lauf am 2026-08-22 wurde der in §0 dokumentierte uncommittete Patch an scripts/factory/opencode-exec.sh (T013594) wenige Minuten nach der Ticket-Dokumentation von einem parallelen Akteur als PR #5005 committet, gemergt und lokal gezogen — der Hauptcheckout wechselte unter dem Lauf von dirty auf clean, der erste Ticket-Kommentar war sofort veraltet und brauchte eine Korrektur. Kein Schaden diesmal, aber Hygiene-Läufe gehen von einem ruhenden Hauptcheckout aus; es gibt keine Koordination (Lock/Claim), die parallele Mutation des Hauptcheckouts während eines Laufs verhindert oder sichtbar macht.
> **9. OpenSpec-Archiv hinterlässt uncommitteten SSOT-Merge — main verliert Requirements aus archiviertem Change (T013528)** (degraded, openspec/archive)
> 
> Verifiziert am 2026-08-22 (repo-hygiene §1): Der Worktree .worktrees/optimize-factory-shards-T013528 trägt eine uncommittete Änderung an openspec/specs/ci-cd.md — der Delta-Spec-Merge aus dem OpenSpec-Archiv des done-Tickets T013528 (Marker 'merged from change delta ci-cd.md (214d53b59a78)', Requirements 'Factory Shard Setup Minimization' + 'Spec Runtime Manifest Completeness'). Beide Marker und der Requirement-Text fehlen in origin/main (git grep rc=1 gegen beide). Die SSOT auf main verliert damit Requirements eines archivierten Changes; der Archiv-/Finalize-Schritt hat den SSOT-Merge nicht committet. Dokumentiert auf T013528; Nachziehen als Chore-PR empfohlen, Worktree bleibt bis zur Sicherung bestehen.
> **10. gh run list findet Checks nicht beim Rollup-Namen — Job-Name ≠ Workflow-Name liefert leere Messung** (process, ci/gh-cli)
> 
> Bei der PR-#5002-Diagnose (2026-08-22) lieferte 'gh run list --branch <b>' gefiltert nach dem Rollup-Anzeigenamen 'BATS Unit + Quality Gates' eine leere Menge, obwohl der Check im PR-Rollup unter genau diesem Namen als FAILURE erschien. Ursache: statusCheckRollup zeigt den Job-Namen, gh run list listet Workflow-Namen — der Failure steckte im Workflow 'CI' (Run 32576664937). Erste Messung war leer und ohne Gegenprobe (rohe Run-Liste) nicht auswertbar; neue Instanz der leere-Antwort-Falle (§3), diesmal auf der Namens-Diskrepanz Job vs. Workflow.

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

- [ ] **1. Mishap-Rollup-Container-Vermehrung: 11 Collect-Mode-Container parallel (Dedupe-Guard-Verstoß)** (drift, mishap-tracker) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **2. Commit-msg-Hook-Friction: drei Ablehnungen für Plan-only-Commit (Scope-Rätselraten)** (process, repo/git-hooks) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **3. stage-plan-Hilfe verschweigt --no-hold, obwohl eine explizite Hold-Entscheidung Pflicht ist** (degraded, scripts/ticket.sh) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **4. SDLC-Skripte defaulten noch auf gemma26-throughput nach qwen38-Cutover** (drift, scripts/sdlc) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **5. llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse)** (suspicious, llm-proxy/request-log) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **6. gemma26-throughput-Primary weiterhin als Tab-Agent waehlbar** (drift, opencode-config) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **7. Carry-over-Eskalations-Tickets haben kryptische Titel aus Task-Zeilen** (degraded, factory/mishap-rollup-carryover) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **8. Paralleler Akteur mutiert Hauptcheckout während Hygiene-Lauf — §0-Befund löst sich mid-run auf** (process, repo/hygiene) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **9. OpenSpec-Archiv hinterlässt uncommitteten SSOT-Merge — main verliert Requirements aus archiviertem Change (T013528)** (degraded, openspec/archive) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung
- [ ] **10. gh run list findet Checks nicht beim Rollup-Namen — Job-Name ≠ Workflow-Name liefert leere Messung** (process, ci/gh-cli) — Disposition: _<gefixt | bereits gefixt | kein Repo-Fix | beobachten (bis Zyklus <JJJJ-MM-TT>)>_ + Begruendung

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
