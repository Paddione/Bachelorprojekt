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

- [x] **1. Mishap-Rollup-Container-Vermehrung: 11 Collect-Mode-Container parallel (Dedupe-Guard-Verstoß)** (drift, mishap-tracker) — Disposition: **bereits gefixt** — T013304 (PR #4959, Commit 987c56b9a) machte die Rollup-Lane single-lane und brand-agnostisch; `cmd_rollup_container` auf main determiniert bei mehreren Collect-Mode-Kandidaten via `ORDER BY created_at ASC LIMIT 1` (ältester gewinnt), statt bei Mehrdeutigkeit neu anzulegen. Symptomseite: die 10 Hüllen wurden in der ticket-ops-Triage als obsolete geschlossen, T013328 blieb kanonischer Container.
- [x] **2. Commit-msg-Hook-Friction: drei Ablehnungen für Plan-only-Commit (Scope-Rätselraten)** (process, repo/git-hooks) — Disposition: **kein Repo-Fix** — Teil (b) ist behoben: der commit-vs-diff-Hinweis nennt den korrekten Scope bereits ("'openspec' wurde zu 'plans' konsolidiert", T002328 — im eigenen Zyklus mehrfach bestätigt). Teil (a) bleibt bewusst Verweis statt Inline-Liste: Single Source of Truth für Scopes ist commitlint.config.cjs, eine in die Fehlermeldung kopierte Liste würde driften. Die dreifache Ablehnung war einmalige Reibung mit dokumentierter Lehre; kein wiederkehrender Defekt.
- [x] **3. stage-plan-Hilfe verschweigt --no-hold, obwohl eine explizite Hold-Entscheidung Pflicht ist** (degraded, scripts/ticket.sh) — Disposition: **gefixt** — Hilfe in `scripts/lib/ticket-help.sh` zeigt jetzt `(--hold|--no-hold)` in der Usage-Zeile und dokumentiert beide Flags inkl. der T003267-Pflicht. RED-Test "T013328: stage-plan-Hilfe nennt --no-hold und die Hold-Pflicht" in tests/spec/ticket-system/subcommand-help.bats war vor dem Fix rot (`--no-hold` fehlte in der Ausgabe).
- [x] **4. SDLC-Skripte defaulten noch auf gemma26-throughput nach qwen38-Cutover** (drift, scripts/sdlc) — Disposition: **gefixt** — Beide Defaults (`scripts/sdlc/llm-up.sh`, `scripts/sdlc/health-gate.sh`) auf `qwen38-220k` gezogen. RED-Test `tests/spec/sdlc-isolation/sdlc-default-loadout.bats` (Positiv-Anker: Zuweisung existiert; Aussage: Default-Wert qwen38-220k; Negativ-Scan über scripts/sdlc/) war vor dem Fix rot gegen beide Dateien. Damit ist der SDLC-Teil von T013531 abgedeckt — der Tab-Agent-Teil kam bereits mit T013360.
- [x] **5. llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse)** (suspicious, llm-proxy/request-log) — Disposition: **gefixt** — Abgearbeitet im Folgezyklus `mishap-incident-rollup-2026-08-22-T013894`, wohin der Eintrag dreimal weitergereicht wurde (T013784, T013893, T013894). Von den beiden Fix-Richtungen des Eintrags war die erste ("Flush-Fehler mit Warn-Zeile ins Journal") bereits seit T003277 (af949ec91, 2026-08-11) im Code: `flush()` in scripts/llm-proxy/request-log.mjs loggt jeden verworfenen Stapel. Umgesetzt wurde die zweite: scripts/llm-proxy/switch-origin.mjs traegt requested_model, Client und Dispatch-Ticket in jede [switch]-Zeile, sodass die Attribution eines Loadout-Wechsels nicht mehr allein am Request-Mitschnitt haengt — genau der Weg, der bei Incident T013527 ausfiel. Test: tests/spec/local-llm-proxy/switch-origin-attribution.bats (vor dem Fix 5/5 rot). Das dispatchte Ticket T013540 ("[switch]-Events mit requested_model + Client-Info loggen") stand bis dahin unbearbeitet im backlog und ist mit PR #5038 und dem Nachzug fuer die Remote-Adresse [T013540] umgesetzt; ohne diese Disposition waere der Eintrag unbegrenzt weiter rotiert.
- [x] **6. gemma26-throughput-Primary weiterhin als Tab-Agent waehlbar** (drift, opencode-config) — Disposition: **bereits gefixt** — `.opencode/agent-models.jsonc` definiert gemma26-throughput-primary seit dem Cutover mit `"model": "llamacpp-local/qwen38-220k"` (T013360): der Name ist historisch, aber ein Klick lädt dasselbe Loadout wie qwen38 und evictet nichts mehr. Die vom Eintrag beschriebene Eviction-Kette über exclusiveGroup chat-gpu ist konstruktiv entschärft — genau die empfohlene Variante "auf qwen38 umziehen".
- [x] **7. Carry-over-Eskalations-Tickets haben kryptische Titel aus Task-Zeilen** (degraded, factory/mishap-rollup-carryover) — Disposition: **gefixt** (Schwester-Zyklus) — Derselbe Titel-Fallback-Defekt wie T013316 #10: `_line_title()` ließ Rohzeilen ohne (meta)-Suffix ungefiltert durch ("[Rollup] - [ ] **7. Final Verification.**"). Der Fix (`sed -nE … /p` verwirft Nicht-Matches) liegt in Commit 086c6fe1c auf chore/mishap-incident-rollup-2026-08-22-T013316 inkl. Test carryover-worktree-scan.bats und landet mit dem T013316-PR dieses Zyklus auf main. Eskalations-Titel stammen danach nur noch aus echten Eintragszeilen.
- [x] **8. Paralleler Akteur mutiert Hauptcheckout während Hygiene-Lauf — §0-Befund löst sich mid-run auf** (process, repo/hygiene) — Disposition: **kein Repo-Fix** — Einmaliges Ereignis mit sofortiger Selbstkorrektur (Ticket-Kommentar korrigiert), Schaden null. Der Koordinationsmechanismus existiert (agent-lock claim/release); ein Claim-Zwang für bewusst lockere Hygiene-Läufe wäre neuer Overhead ohne beobachtete Wiederholung. Kein Ablaufdatum nötig: rein prozessualer Einzelfall ohne dauerhaften Workaround, der überwacht werden müsste.
- [x] **9. OpenSpec-Archiv hinterlässt uncommitteten SSOT-Merge — main verliert Requirements aus archiviertem Change (T013528)** (degraded, openspec/archive) — Disposition: **bereits gefixt** — PR #5008 ("archive optimize-factory-shard-runtimes and land SSOT merge [T013528]") hat den Delta-Merge gelandet; beide Marker ('Factory Shard Setup Minimization', 'Spec Runtime Manifest Completeness') sind auf origin/main verifiziert (grep trifft je 1×). Der zwischenzeitlich entfernte Worktree ist damit ungefährlich; die Empfehlung "Nachziehen als Chore-PR" ist damit erledigt.
- [x] **10. gh run list findet Checks nicht beim Rollup-Namen — Job-Name ≠ Workflow-Name liefert leere Messung** (process, ci/gh-cli) — Disposition: **kein Repo-Fix** — GitHub-Semantik, kein Repo-Defekt: statusCheckRollup zeigt Job-Namen, `gh run list` listet Workflow-Namen. Ausweg ist die Gegenprobe (rohe Run-Liste ohne Namensfilter), die Lehre aus repo-hygiene-ops §3 (leere Antwort nie als Messung werten) deckt die Fehlerklasse bereits ab. Kein Ablaufdatum: einmaliger Diagnose-Irrweg ohne Workaround-Pflicht.

## File Structure

```
scripts/lib/ticket-help.sh                                | geändert | stage-plan-Hilfe: (--hold|--no-hold) + Pflicht-Doku [T013328 #3]
scripts/sdlc/llm-up.sh                                    | geändert | Default-Loadout qwen38-220k [T013328 #4]
scripts/sdlc/health-gate.sh                               | geändert | Default-Loadout qwen38-220k [T013328 #4]
tests/spec/ticket-system/subcommand-help.bats             | geändert | RED/GREEN-Test zur stage-plan-Hilfe
tests/spec/sdlc-isolation/sdlc-default-loadout.bats       | neu      | RED/GREEN gegen SDLC-Defaults
openspec/changes/mishap-incident-rollup-2026-08-22-T013328/tasks.md | geändert | Dispositionen
```

- [x] **Failing-Test-Step (RED).** Eintrag 3 und 4 bekamen **gefixt**: Beide Tests waren vor dem Fix rot (Hilfe ohne --no-hold; Defaults auf gemma26-throughput) und sind nach dem Fix grün. Eintrag 7 wurde im Schwester-Zyklus T013316 gefixt (Commit 086c6fe1c, Test carryover-worktree-scan.bats). Eintrag 5 bleibt offen (T013540); die übrigen Dispositionen brauchen keinen Test.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-isolation/sdlc-default-loadout.bats tests/spec/ticket-system/subcommand-help.bats
# expected: 12 ok, 0 not ok
```

- [x] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
