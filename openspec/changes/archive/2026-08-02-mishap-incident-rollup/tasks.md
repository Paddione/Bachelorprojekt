---
title: "mishap-incident-rollup-T002541 — Implementation Plan"
ticket_id: T002541
domains: [factory]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-T002541 — Implementation Plan

_Container-Ticket: T002541_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-02 05:43 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

### Mishap-Rollup — 10 Eintraege (2026-08-02 05:08 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | drift | openspec-embed | openspec-embed completeness gate meldet weiterhin Lücke (104 indexierte Docs vs. 132 aktive Pläne) |
| 2 | degraded | scripts/ticket.sh | Gültige resolution-Werte nur in einem archivierten Design-Dokument; Fehlermeldung ist ein roher Constraint-Dump |
| 3 | degraded | tools/question | question-Tool scheitert an JSON-Parse bei Sonderzeichen (en-dash, deutsche Anführungszeichen) |
| 4 | suspicious | skills/ticket-ops | Verwaistes in_progress-Ticket: Worktree + Anchor-Commit ohne Lock, PR oder Plan |
| 5 | degraded | scripts/ticket.sh | stage-plan uebernimmt nur referenzierte Dateien als touched_files |
| 6 | degraded | infra/mcp-postgres | mcp-postgres (:13001) dauerhaft nicht erreichbar — jede Ticket-Triage laeuft ueber den kubectl-Fallback |
| 7 | drift | tooling/ticket.sh | ticket.sh: reiner Statuswechsel heisst update-status, nicht transition — in keinem Skill-Referenzdokument genannt |
| 8 | drift | repo/ticket-qualitaet | CI-Belege in Tickets ohne Attempt-Nummer sind irrefuehrend, wenn der Run als Ganzes gruen ist |
| 9 | degraded | scripts/agent-lock.sh | agent-lock: drei Tickets mit Worktree und gepushtem Branch hatten ueberhaupt keinen Claim |
| 10 | degraded | repo/pr | Fertige Arbeit auf vier Branches ohne PR — darunter der Fix fuer den laufenden korczewski-Ausfall |

**1. openspec-embed completeness gate meldet weiterhin Lücke (104 indexierte Docs vs. 132 aktive Pläne)** (drift, openspec-embed)

BEOBACHTUNG
Beim Plan-Stage-Commit für T002520 gab der post-commit-Hook aus:
  [openspec-embed] WARN: completeness gate — collection has 104 docs but 132 local active plans (status=planning|plan_staged|active)
Der Embed-Lauf für den eigenen Slug lief danach erfolgreich (10 Chunks, model=bge-m3).

WARUM DAS ZÄHLT
Rund 28 aktive Pläne sind nicht in der Vektorsammlung. Semantische Suchen über Pläne (openspec_find_similar, Duplikat-Erkennung vor neuen Proposals) sehen diese Pläne nicht und können deshalb Doppelarbeit nicht verhindern — der Ausfall ist still, weil die Suche Treffer liefert, nur eben unvollständig.

EINORDNUNG
Kein neuer Vorgang, sondern ein weiterer datierter Beleg für die bereits bekannte Embedding-Lücke. Hier festgehalten, damit der Abstand (104/132 am 2026-08-01) mit früheren Messungen vergleichbar ist und sichtbar wird, ob er wächst.
**2. Gültige resolution-Werte nur in einem archivierten Design-Dokument; Fehlermeldung ist ein roher Constraint-Dump** (degraded, scripts/ticket.sh)

BEOBACHTUNG (verifiziert)
`bash scripts/ticket.sh update-status --id T002524 --status done --resolution invalid` scheitert mit:

  ERROR:  new row for relation "tickets" violates check constraint "tickets_resolution_check"
  DETAIL:  Failing row contains (367e0e5c-..., T002524, bug, mentolder, Root-Dependencies hono/... , SYMPTOM (reproduzierbar, gegen origin/main verifiziert)
  Der Test..., null, done, invalid, hoch, major, null, f, auto, 0, 2026-08-01 ... [rund 50 weitere Spalten]
  command terminated with exit code 3

Zwei Probleme:

1. DIE GUELTIGEN WERTE STEHEN NIRGENDS, WO MAN SIE SUCHT.
   Erhoben per Constraint-Abfrage: fixed | shipped | wontfix | duplicate | cant_reproduce | obsolete.
   Ein repo-weiter grep über .claude/, docs/superpowers/, AGENTS.md und CLAUDE.md findet die
   Liste ausschliesslich in docs/superpowers/specs/archive/2026-05-08-unified-ticketing-design.md —
   einem ARCHIVIERTEN Dokument. Der Skriptkopf von ticket.sh nennt nur
   `[--resolution <resolution>]` ohne Wertebereich. Wer den richtigen Wert sucht, muss entweder
   das Archiv durchsuchen oder die Postgres-Constraint abfragen.

2. DIE FEHLERMELDUNG IST UNBRAUCHBAR UND SCHUETTET DEN TICKETINHALT AUS.
   Der DETAIL-Teil gibt die komplette Zeile aus, inklusive Titel und vollstaendiger Beschreibung
   des Tickets. Bei einem Ticket mit sensiblen Angaben landet dieser Inhalt so in Logs und
   CI-Ausgaben. Gleichzeitig nennt die Meldung den einen relevanten Punkt NICHT: welche Werte
   erlaubt waeren.

VORSCHLAG
- In `cmd_update_status` die erlaubten Werte vor dem Schreiben pruefen und bei Abweichung eine
  eigene Meldung ausgeben, die sie auflistet — statt den Constraint-Fehler durchzureichen.
- Die Liste zusaetzlich in den Usage-Block am Skriptkopf aufnehmen. Sie gehoert dorthin, nicht
  in ein Archivdokument von Mai.

FUNDUMSTAND
Am 2026-08-01 beim Schliessen von T002524. `invalid` ist ein naheliegender, aber ungueltiger Wert;
gemeint war `cant_reproduce`.
**3. question-Tool scheitert an JSON-Parse bei Sonderzeichen (en-dash, deutsche Anführungszeichen)** (degraded, tools/question)

In ticket-ops Phase 2/3 schlug der opencode `question`-Tool-Aufruf mit "JSON Parse error: Expected '}'" fehl, sobald die options/descriptions Umlaute-unabhängige Sonderzeichen wie en-dash (–) oder deutsche Anführungszeichen („…") enthielten. Der Retry mit reiner ASCII-Transliteration funktionierte. Kosten: ein fehlgeschlagener Tool-Call pro betroffenem Prompt. Der Skill-Body selbst enthält solche Zeichen („triagiere alles"), aber im question-Payload brechen sie. Nicht das erste Mal in der Session — identisches Muster trat in einer zweiten Frage (Masterplan-Freigabe) nicht auf, weil dort bewusst ASCII genutzt wurde.
**4. Verwaistes in_progress-Ticket: Worktree + Anchor-Commit ohne Lock, PR oder Plan** (suspicious, skills/ticket-ops)

Beobachtet am 2026-08-02 bei der Triage von T002515. Das Ticket stand seit 2026-08-02 00:55 auf status=in_progress. Verifiziert: agent-lock.sh check ticket → free, check branch fix/plan-intel-dedup-T002515 → free, agent-lock.sh list ohne Treffer, kein PR (offen oder geschlossen), kein Eintrag in openspec/changes/. Der Worktree .worktrees/plan-intel-dedup-T002515 existierte mit sauberem git status und trug genau einen Commit: "chore: anchor branch … [skip ci]". Es lag also keinerlei Arbeit vor.

Warum das zaehlt: in_progress ist der einzige Status, den die ticket-ops-Invariante "Laufende Arbeit nicht anfassen" schuetzt. Ein verwaistes in_progress ist damit doppelt teuer — es blockiert die Triage (das Ticket sieht belegt aus) und es ist von aussen nicht von echter Arbeit unterscheidbar, ausser man prueft manuell vier Signale (beide Lock-Scopes, PR, Commits vs. main). Eine abgebrochene Session hinterlaesst diesen Zustand offenbar ohne jeden Guard oder Reaper-Pfad: agent-lock.sh reap raeumt tote Locks und Worktrees, setzt aber keinen Ticket-Status zurueck.

Moegliche Richtung (nicht Teil dieses Vorgangs): ein Watchdog analog zum bestehenden "awaiting_deploy > 24h" — in_progress ohne lebenden Lock und ohne Commits jenseits des Anchor-Commits nach N Stunden auf den Vorstatus zuruecksetzen oder als needs_human markieren.
**5. stage-plan uebernimmt nur referenzierte Dateien als touched_files** (degraded, scripts/ticket.sh)

Beobachtet am 2026-08-02 beim Stagen von T002515. scripts/ticket.sh stage-plan meldete "touched_files: 6 Pfad(e) aus dem Plan uebernommen". Verifiziert per DB-Abfrage: die Liste enthaelt docs/code-quality/gates.yaml, obwohl der Plan diese Datei nicht aendert. Sie kommt im Plan ausschliesslich in der Prosa des S1-Budget-Abschnitts vor, als Beleg fuer die Herkunft der wirksamen Schwelle ("das statische .sh-Limit 800 aus docs/code-quality/gates.yaml").

Der Extraktor unterscheidet also nicht zwischen "Datei wird geaendert" und "Datei wird referenziert". Praktische Folge: touched_files ueberzeichnet den Aenderungsumfang. Weil dieselbe Liste laut T002446 kuenftig aus dem Abschnitt "## File Structure" abgeleitet werden soll, faellt das hier auf — im aktuellen Verhalten reicht eine Erwaehnung in normaler Prosa. Wer touched_files zur Kollisionserkennung zwischen parallelen Tickets nutzt (Soft-Conflict-Kanten in ticket-ops Phase 3), bekommt dadurch falsch-positive Konflikte auf haeufig zitierten Dateien wie gates.yaml oder baseline.json — genau die Dateien, die Plaene aus Konventionsgruenden staendig zitieren muessen.

Kein Schaden in diesem Vorgang: T002515 laeuft allein, es gab keine Parallelitaet. Beruehrt T002446 (stage-plan touched_files aus ## File Structure ableiten), das bereits plan_staged ist.
**6. mcp-postgres (:13001) dauerhaft nicht erreichbar — jede Ticket-Triage laeuft ueber den kubectl-Fallback** (degraded, infra/mcp-postgres)

Verifiziert 2026-08-02, zweimal im selben Lauf: `curl -s -o /dev/null -w '%{http_code}' localhost:13001/health` liefert 000 (kein Listener). Der gesamte ticket-ops-Durchlauf ueber 27 offene Tickets lief deshalb ueber den kubectl-exec-psql-Fallback gegen shared-db auf fleet.

Der Fallback funktioniert, ist aber deutlich langsamer (jeder Aufruf baut eine WireGuard-Verbindung auf und ab) und erfordert bei Writes zusaetzliche Sorgfalt (Exit-Code 143 bedeutet nicht Fehlschlag, T002261).

Bereits als T002469-M2 dokumentiert — dort als Einzelfall mit Probe-Empfehlung. Der erneute Befund zeigt, dass es kein Einzelfall ist: der Server laeuft nicht. Entweder ihn dauerhaft starten oder die Skill-Dokumentation von "MCP-first, Fallback kubectl" auf den tatsaechlichen Zustand umstellen, damit nicht jede Session dieselbe Probe wiederholt.
**7. ticket.sh: reiner Statuswechsel heisst update-status, nicht transition — in keinem Skill-Referenzdokument genannt** (drift, tooling/ticket.sh)

Verifiziert: `bash scripts/ticket.sh transition --id T002537 --status planning` → "Unknown command: transition". Der korrekte Subcommand ist `update-status`.

Weder ticket-ops-procedures.md (Phase 1 Step 1.4 "Classify", das explizit done/obsolete setzen laesst) noch dev-flow-plan-phases.md nennen einen Subcommand fuer einen reinen Statuswechsel. Beide zeigen nur `create`, `stage-plan`, `add-comment`. Die vollstaendige Kommandoliste ist ausschliesslich ueber einen argumentlosen `bash scripts/ticket.sh` sichtbar.

Kosten hier gering (ein Fehlversuch), aber der Fehlgriff ist strukturell wahrscheinlich: "transition" ist der Name, den das MCP-Tool traegt (mcp__ticket-mcp__transition_status), also genau der Begriff, den man aus dem MCP-first-Pfad mitbringt, wenn man auf den CLI-Fallback wechselt — und dieser Wechsel ist wegen des nicht erreichbaren mcp-postgres der Normalfall.

Vorschlag: in ticket-ops-procedures.md §Phase 1 Step 1.4 und in der ticket-mcp-Sektion des MCP-Tool-Guides die CLI-Entsprechung `update-status` neben `transition_status` nennen — analog zu der bereits vorhandenen Warnung, dass `add-comment` und nicht `comment` der richtige Name ist.
**8. CI-Belege in Tickets ohne Attempt-Nummer sind irrefuehrend, wenn der Run als Ganzes gruen ist** (drift, repo/ticket-qualitaet)

Beobachtet an T002537. Das Ticket nennt als Beleg "Run 30730373962, Shard 3". Nachgeschlagen liefert `gh run view 30730373962` einen vollstaendig GRUENEN Run — Shard 3 bestanden — und `gh run view 30730373962 --log-failed` gibt gar nichts aus.

Der Fehlschlag existiert, liegt aber ausschliesslich in **Attempt 1**: `gh run view 30730373962 --attempt 1 --log-failed` zeigt `not ok 563 … line 133 … [ "$seen_running" -eq 1 ]' failed`. Attempt 2 (der Re-Run) war gruen und ueberschreibt in der Standardansicht den Befund.

Kosten: eine volle Recherche-Schleife. Zwischenzeitlich sah es so aus, als sei das Ticket gegenstandslos; erst ein lokal gebauter Reproducer und die Attempt-1-Abfrage haben die Lage geklaert. Der Reproducer war nachtraeglich wertvoll (er hat eine konkurrierende Hypothese widerlegt), aber er wurde aus dem falschen Grund gebaut.

Zusatzbefund: Genau bei einem Flaky-Ticket ist der Re-Run der Normalfall — die Belegstelle wird also systematisch von einem gruenen Attempt ueberdeckt. Das trifft jedes kuenftige Flaky-Ticket gleichermassen.

Vorschlag: Konvention, dass CI-Belege in Ticketbeschreibungen die Attempt-Nummer tragen, sobald der Run als Ganzes gruen ist — also "Run <id> Attempt <n>" statt nur "Run <id>". Betrifft vor allem Tickets vom Typ flaky/fix.
**9. agent-lock: drei Tickets mit Worktree und gepushtem Branch hatten ueberhaupt keinen Claim** (degraded, scripts/agent-lock.sh)

Verifiziert 2026-08-02 waehrend des ticket-ops Phase-3-Pre-Checks. `bash scripts/agent-lock.sh list` zeigte Eintraege fuer T002492, T002535 und T002539 — aber KEINEN fuer T002517, T002529 und T002531, obwohl fuer alle drei ein Worktree existierte (.worktrees/ci-shard1-parallel-T002517, .worktrees/commit-scope-T002529, .worktrees/pipeline-slot-T002531) UND der zugehoerige Branch mit 2-3 Commits nach origin gepusht war.

Das ist NICHT der bereits dokumentierte Fall T002498-M6 (dort haelt die Session einen branch-scoped statt ticket-scoped Lock, `check ticket` meldet deshalb frei). Hier existierte in KEINEM Scope ein Lock — weder ticket noch branch. Die Arbeit lief ohne Claim.

Folge fuer ticket-ops §Step 3.3: Der Pre-Check haette diese drei Tickets als frei eingestuft und dispatched. Nur der zusaetzliche Scan auf Worktree-Verzeichnisse mit der Ticket-ID im Namen hat sie abgefangen — also ausgerechnet der Teil des Pre-Checks, der als Ergaenzung nachgetragen wurde und nicht der Lock-Mechanismus selbst.

Nachtrag im selben Lauf: T002531 erhielt spaeter einen ticket-scoped Lock (dev-flow-execute, sid 760222), der inzwischen als `stale` gefuehrt wird — der Claim kam also nach Beginn der Arbeit und ueberdauerte die Session.

Schlussfolgerung: Worktree-Existenz ist derzeit ein verlaesslicherer Belegtheitsnachweis als der Lock-Bestand. Solange das gilt, darf der Worktree-/Branch-Scan in §Step 3.3 nicht als Ergaenzung, sondern muss als gleichrangige Primaerquelle beschrieben werden.
**10. Fertige Arbeit auf vier Branches ohne PR — darunter der Fix fuer den laufenden korczewski-Ausfall** (degraded, repo/pr)

Verifiziert 2026-08-02: `gh-axi pr list` meldet `count: 0` — kein einziger offener PR. Gleichzeitig tragen vier gepushte Branches fertige Commits:

- fix/korczewski-503-T002539 (+2) — Ticket T002539, severity=critical
- fix/ci-shard1-parallel-T002517 (+2)
- fix/commit-scope-T002529 (+2)
- feature/sdlc-cockpit-k10-pipeline-slot-T002531 (+3)

Besonders gravierend beim ersten: `kubectl --context fleet -n workspace-korczewski get deploy` zeigt ALLE 33 Deployments auf 0/0 Replicas — korczewski.de ist live ausgefallen, der Fix liegt fertig und gepusht, aber ohne PR. Der zugehoerige agent-lock (dev-flow-execute) war zu Beginn dieses Laufs noch `live` und ist am Ende verschwunden; die Session endete also, ohne den PR zu oeffnen.

Der Ausfall selbst ist bereits als T002539 (plan_staged) erfasst — hier wird bewusst KEIN zweites Ticket dafuer angelegt (Dedupe-Guard). Gemeldet wird das Prozessmuster: dev-flow-execute-Sessions enden zwischen Push und PR-Erstellung, und danach zeigt nichts mehr auf die liegengebliebene Arbeit. Die Konvention "gh pr merge --auto sofort nach pr create" greift erst ab dem PR — vor dem PR gibt es keinen Auffangmechanismus.

Zusatzbefund gleicher Kategorie: zwei Branches mit divergenter Historie, chore/brain-k2-visualisieren-T002432 und chore/mishap-t002408. Beide melden >6000 Nicht-Merge-Commits gegen origin/main bei LEEREM Drei-Punkt-Diff (`git diff origin/main...<branch>`) — die Signatur umgeschriebener Historie. Der im Klaerungskommentar zu T002430 erwaehnte "K2-Branch mit 23 Commits" ist damit als Arbeitsgrundlage unbrauchbar; K2 ist frisch von main zu starten.
### Mishap-Rollup — 3 Eintraege (2026-08-02 05:38 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | suspicious | tests/bats-konvention | BATS: kill vor return 1 ohne ||true verdeckt die eigentliche Fehlerdiagnose |
| 2 | drift | repo/chore/gh-cleanup | Remote branch fix/ingest-llm-ps-race-T002537 verwaist nach PR-Merge #3627 |
| 3 | suspicious | repo/chore/branches | 3 lokale [gone]-Branches ohne PR mit ungemergten non-allowlist-Inhalten |

**1. BATS: kill vor return 1 ohne ||true verdeckt die eigentliche Fehlerdiagnose** (suspicious, tests/bats-konvention)

Beobachtet und behoben beim Umbau von tests/spec/brain-foundation/ingest-llm-endpoint.bats (T002537).

Muster: ein Abbruchpfad raeumt einen Hintergrundjob auf, bevor er scheitert:

    echo "Aussagekraeftige Diagnose" >&2
    kill "$job" 2>/dev/null
    return 1

Ist der Job zu diesem Zeitpunkt bereits beendet, gibt `kill` 1 zurueck. BATS meldet dann DIESE Zeile als Fehlerursache:

    # (in test file …, line 148)
    #   `kill "$job" 2>/dev/null' failed

Die vorangehende echo-Diagnose steht zwar weiterhin in der Ausgabe, aber der Zeigefinger des Runners deutet auf die Aufraeumzeile. Wer nur die "line N" liest — und das ist bei CI-Logs die Regel — sucht den Fehler an der falschen Stelle.

Fix: `kill "$job" 2>/dev/null || true`. Danach meldet BATS korrekt `return 1` als Ursache, direkt unter der Diagnose.

Verallgemeinerung: In BATS ist jedes Kommando auf einem Abbruchpfad, das legitim einen Nicht-Null-Status liefern darf (kill, rm, pkill, wait auf einen bereits geernteten Job), mit `|| true` abzusichern — sonst kapert es die Fehlermeldung des Tests. Betrifft potenziell jeden Test mit Hintergrundprozessen; im Repo nicht systematisch geprueft.
**2. Remote branch fix/ingest-llm-ps-race-T002537 verwaist nach PR-Merge #3627** (drift, repo/chore/gh-cleanup)

PR #3627 (T002537, fix/ingest-llm-ps-race-T002537) wurde am 2026-08-02 um 05:18 UTC via squash-merge geschlossen, Ticket ist done. Der Remote-Branch existierte aber weiterhin auf origin — gh pr merge --delete-branch hat nicht gegriffen. Während dieses repo-hygiene-Laufs manuell gelöscht. Mögliche Ursache: race condition zwischen merge und delete-branch, oder die Option war beim Merge nicht gesetzt.
**3. 3 lokale [gone]-Branches ohne PR mit ungemergten non-allowlist-Inhalten** (suspicious, repo/chore/branches)

Drei lokale Branches haben [gone] upstream (Remote wurde gelöscht), das zugehörige Ticket ist done, aber es existiert kein gemergter PR ([UNVERIFIED — gh pr list --head --state merged liefert nichts]) UND die Branches enthalten non-allowlist-Änderungen (scripts, workflows, testdateien, website-daten), die nicht in main sind:

1. fix/ci-shard1-parallel-T002517 (T002517, done/fixed): .github/workflows/ci.yml, tests/spec/ci-cd.bats
2. fix/commit-scope-T002529 (T002529, done/fixed): scripts/check-commit-vs-diff.sh, tests/spec/ci-cd.bats
3. fix/korczewski-503-T002539 (T002539, done/fixed): ~12 files inkl. tests, scripts, website-data

Branch-Reaper würde diese korrekt skippen (non-allowlist). Menschliche Entscheidung nötig: Content salvagen und in neuem PR mergen, oder Branches verwerfen.

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
