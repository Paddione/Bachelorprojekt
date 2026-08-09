---
title: "mishap-incident-rollup — Implementation Plan"
ticket_id: T002784
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup — Implementation Plan

_Container-Ticket: T002784_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-09 10:31 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

_Uebernommen von T002601 (status=done, fuer den Rollup-Treiber unsichtbar) — Defekt T002783._

### Mishap-Rollup — 9 Eintraege (2026-08-09 01:55 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | degraded |  | ticket.sh --attempts-Validierung scheitert bei regulaerer Nutzung |
| 2 | degraded |  | Agent-Lock schuetzt nicht: zweiter Akteur arbeitete ohne Lock im selben Worktree |
| 3 | degraded |  | Abgebrochener CI-Lauf ist in der Aggregation nicht von echtem Fehlschlag unterscheidbar |
| 4 | drift | mcp/mcp-postgres · docs | mcp-postgres liest eingefrorene fleet-Kopie statt lokaler SSOT — Triage las 3 bereits-done Tickets als offen |
| 5 | drift | factory · tickets/lifecycle | 7 Tickets plan_staged ohne Plan-Artefakte (T002768–T002774) — dev-flow-execute kann sie nicht verarbeiten |
| 6 | drift | repo | Main-Checkout dirty — Post-T002753-Docs, stale Fixture, untracked Hook |
| 7 | drift | factory | T002762 (SF-TEST-*, is_test_data=true) im Factory-Backlog |
| 8 | suspicious | skills/repo-hygiene | Hauptcheckout wurde mitten im repo-hygiene-Lauf von fremder Hand gestasht — §0-Befund veraltete unbemerkt |
| 9 | drift | scripts/agent-lock.sh | Branch-Lock überlebt Reap trotz totem PID und fehlendem Worktree — plus Korrektur zum vorigen Mishap |

**1. ticket.sh --attempts-Validierung scheitert bei regulaerer Nutzung** (degraded, )

Gefunden am 2026-08-09 bei der Umsetzung von T002620 (Reparatur der FA-SF-26-Watchdog-Tests).

Beim Versuch, den vollstaendigen watchdog.sh-Pfad live zu verifizieren, lief der Agent in einen vorbestehenden Fehler in der --attempts-Validierung von scripts/ticket.sh. Der Fehler ist unabhaengig von T002620 und war der Grund, warum stattdessen auf einen read-only RED->GREEN-Nachweis ausgewichen wurde.

WARUM DAS ZAEHLT: Der Watchdog-Eskalationspfad fuehrt einen Attempt-Counter (Status-Reset, Slot-Freigabe, Comment, Worktree-Cleanup, Attempt-Counter — siehe T002620-Beschreibung). Wenn dessen CLI-Einstiegspunkt bei regulaerer Nutzung scheitert, ist der Zaehler-Teil des Eskalationspfads praktisch nicht bedienbar und auch nicht live pruefbar. Das ist dieselbe Struktur wie der Befund von T002620 selbst: ein Pfad, der als getestet gilt, ist es nicht.

ZUSATZBEFUND aus demselben Lauf, bereits mitbehoben: seed_test_feature war in der setup() von tests/spec/software-factory/scheduling.bats nicht gesourced — ein latenter Defekt unabhaengig vom updated_at-Backdating.

NAECHSTER SCHRITT: Die genaue Fehlermeldung reproduzieren (bash scripts/ticket.sh … --attempts <n>) und die Validierung gegen die tatsaechlich vorgesehenen Aufrufformen pruefen. Test nach Repo-Konvention mit Output-Verifikation, eigene Datei unter tests/spec/software-factory/.</description>
<parameter name="component">scripts/ticket.sh
**2. Agent-Lock schuetzt nicht: zweiter Akteur arbeitete ohne Lock im selben Worktree** (degraded, )

Beobachtet am 2026-08-09 bei der Ausfuehrung von T002679.

HERGANG: ticket-ops hielt einen gueltigen Lock (scope=ticket, id=T002679, state=live, label=ticket-ops-execute) und dispatchte einen Agenten in .worktrees/brain-ingest-chunking-T002679. Parallel arbeitete ein opencode-Lauf (drei Prozesse plus scripts/factory/wakeup.sh) IM SELBEN WORKTREE: er editierte Dateien, committete den Stand des ersten Agenten, pushte und oeffnete PR #3892. Zwischenzeitlich setzte er brain-ingest-transform.sh auf die head -c-Fassung zurueck und den lokalen Branch auf einen frischen Scaffold-Commit — aus Sicht des ersten Agenten war die Implementierung damit lokal verschwunden.

Der zweite Akteur hielt KEINEN Lock. Der Lock-Mechanismus ist kooperativ: er meldet Besitz, verhindert aber keinen Zugriff. Wer ihn nicht abfragt, ist von ihm nicht betroffen.

AUSGANG (verifiziert, kein Schaden): Der erste Agent brach ab statt einen Push-Wettlauf zu fuehren und sicherte seinen Stand als origin/backup/T002679-infra-agent-a2ee6146f. Der Diff Sicherung -> origin/feature/brain-ingest-chunking-T002679 enthaelt ausschliesslich HINZUGEKOMMENE Dateien (die gemergten T002659/T002709-Aenderungen plus Release-Artefakte); alle vier neuen Skripte sind vorhanden und der fail-closed MAX_SOURCE_CHARS-Guard steht. Der aktuelle Stand ist eine Obermenge.

WARUM DAS TROTZDEM ZAEHLT: Der Ausgang war Glueck plus die Umsicht des ersten Agenten, nicht Wirkung eines Schutzmechanismus. Zwei nicht koordinierte Schreiber in einem Worktree koennen einander Arbeit vernichten; ein Backup-Branch entsteht nur, wenn ein Agent auf die Idee kommt.

VORSCHLAG: Beim Betreten eines Worktrees pruefen, ob ein fremder Lock auf dem zugehoerigen Ticket oder Branch liegt, und bei Treffer abbrechen — auf BEIDEN Wegen (Claude-Code-Agenten und opencode/factory-Laeufe). Alternativ eine Lockdatei IM Worktree, die jeder Schreiber sieht, statt nur einer zentralen Liste, die abgefragt werden muss.

VERWANDT: T002498-M6 (Lock-Scope-Vollstaendigkeit), T002422 (Pre-Check vor claim).</description>
<parameter name="component">scripts/agent-lock.sh · Worktree-Koordination
**3. Abgebrochener CI-Lauf ist in der Aggregation nicht von echtem Fehlschlag unterscheidbar** (degraded, )

Beobachtet am 2026-08-09 an PR #3892 (T002679).

BEFUND: Der CI-Lauf 31286855491 auf Head a2ad33bc2 wurde als Ganzes abgebrochen (cancelled). In der PR-Aggregation erschien das als "10 failed" — zehn FAILURE/CANCELLED-Eintraege. Der eine echte failure-Eintrag, "Factory + OpenSpec + Guards", war ein 5-Sekunden-Job, dessen Log woertlich SHARDS_RESULT: cancelled als Ursache nennt. Ein abgebrochener Lauf sieht in der Aggregation also aus wie ein Fehlschlag.

KOSTEN: Die Verwechslung hat zwei Agenten Zeit gekostet. Der erste erklaerte die roten Eintraege als Supersede-Artefakt und schloss daraus faelschlich auf "im Grunde gruen" — der Lauf war aber kein Nachweis, sondern gar KEIN Ergebnis. Nach einem Neustart lagen darunter zwei echte Fehlschlaege (Freshness-Drift in openspec-status.json/repo-index.json sowie die Race aus T002779). Beide Fehlurteile — "rot, also kaputt" und "abgebrochen, also harmlos" — folgen aus derselben nicht unterscheidbaren Anzeige.

UNGEKLAERT UND EIGENSTAENDIG VERDAECHTIG: Was den Lauf abgebrochen hat, liess sich nicht feststellen. Es gab KEINEN neueren Lauf fuer dieselbe SHA (die Concurrency-Gruppe ci-CI-refs/pull/3892/merge hatte nichts zu verdraengen), arbitration.yml cancelt nichts, und ein aelterer Lauf auf 173ec2869 lief zu dem Zeitpunkt noch weiter. Das deutet auf ein externes gh run cancel. Wenn das haeufiger vorkommt, bricht jemand oder etwas fremde CI-Laeufe ab.

VORSCHLAG: (1) In der CI-Fix-Schleife (.claude/skills/references/) festhalten, dass ein cancelled-Lauf KEIN Ergebnis ist und neu gestartet werden muss, statt interpretiert zu werden — weder als gruen noch als rot. (2) Den Aggregat-Job so gestalten, dass er cancelled sichtbar von failure trennt, statt SHARDS_RESULT: cancelled als failure zu melden. (3) Bei Wiederholung die Herkunft der Cancel-Ereignisse untersuchen.

VERWANDT: T002779 (Race auf docs/agent-guide/registry/mcp.yaml unter bats -j).</description>
<parameter name="component">.github/workflows/ci.yml · CI-Fix-Schleife
**4. mcp-postgres liest eingefrorene fleet-Kopie statt lokaler SSOT — Triage las 3 bereits-done Tickets als offen** (drift, mcp/mcp-postgres · docs)

mcp__mcp-postgres__query (127.0.0.1:13001) wird per kubectl --context fleet port-forward auf svc/claude-code-mcp-monolith (default ns) bedient — also die per ADR-006 E3 EINGEFRORENE fleet-Kopie des tickets-Schemas (SELECT ja, INSERT/UPDATE/DELETE nein). Die lokale SSOT liegt auf k3d-mentolder-dev/workspace/shared-db (Default von scripts/ticket.sh). Verifiziert: ss zeigt Port 13001 an kubectl --context fleet; ticket.sh-Header dokumentiert die Freeze-Situation nur dort, nicht im MCP-Tool-Guide §mcp-postgres. Folge: der erste Triage-Lauf las T002714 als plan_staged (lokal: in_progress), T002722/T002679/T002709 als offen (lokal: bereits done) und loeste redundante Closure-Writes aus. Empfehlung: MCP-Tool-Guide §mcp-postgres um den Freeze-Hinweis ergaenzen oder 13001 auf die lokale shared-db umziehen.
**5. 7 Tickets plan_staged ohne Plan-Artefakte (T002768–T002774) — dev-flow-execute kann sie nicht verarbeiten** (drift, factory · tickets/lifecycle)

T002768, T002769, T002770, T002771, T002772, T002773, T002774 haben lokal status=plan_staged, aber KEINEN gestagten Plan: keine FACTORY-PLAN-REF-Kommentarzeile, keine ticket_plans-Zeile, kein Branch (lokal/remote), kein openspec/changes/-Dir, kein Commit. Verifiziert: ticket_plans-Join leer, git log --all leer, Change-Dir-Suche leer. Die plan_staged-Statuszahl (9) speist die Factory-Kommissionierung — dispatcher-bridge wuerde dev-flow-execute auf Plan-lose Tickets loslassen und scheitern. Ursache vermutlich die parallele ticket-ops-Welle (Sid fa33ecd9), die Mishap-Fix-Tickets anlegte und Status setzte ohne Staging-Ceremonie. Empfehlung: entweder stage-plan fuer die 7 nachziehen oder Status auf triage zuruecksetzen; solange ungeklaert, sind sie KEIN Execution-Wave-Kandidat.
**6. Main-Checkout dirty — Post-T002753-Docs, stale Fixture, untracked Hook** (drift, repo)

git status --porcelain zeigt: M .opencode/agent-models.jsonc (Quants-Doku-Update), M AGENTS.md (gemma26-factory statt alter Loadouts), D openspec/changes/tcc-fixture-3511572/* (stale Test-Fixture, 1092 Zeilen), ?? .githooks/post-rewrite (neuer Hook, ungetrackt). Alle Änderungen sind Maintenance-Reste ohne funktionalen Patch — kein laufendes Ticket, in dessen Worktree sie gezogen werden könnten. Aufgefallen während repo-hygiene §0.
**7. T002762 (SF-TEST-*, is_test_data=true) im Factory-Backlog** (drift, factory)

factory_queue zeigt T002762 im Backlog. Das ist ein E2E-Testdaten-Ticket mit is_test_data=true. T002781 (ticket.sh list filtert is_test_data nicht) adressiert den Root-Cause, ist aber noch in triage. Der Backlog-Slot ist faktisch blockiert, bis T002781 implementiert ist. Aufgefallen während repo-hygiene §5.
**8. Hauptcheckout wurde mitten im repo-hygiene-Lauf von fremder Hand gestasht — §0-Befund veraltete unbemerkt** (suspicious, skills/repo-hygiene)

BEOBACHTUNG (verifiziert, repo-hygiene-Lauf 2026-08-09)

Zu Beginn des Laufs (§0 Arbeitsbaum und Stashes), eigene Messung:
    git status --porcelain  ->  M .opencode/agent-models.jsonc
                                M AGENTS.md
                                ?? .githooks/post-rewrite
    git stash list          ->  LEER
    git worktree list       ->  main + 3 Worktrees

Am Ende desselben Laufs, dieselben Befehle:
    git status --porcelain  ->  nur noch ?? .githooks/post-rewrite
    git stash list          ->  stash@{0}: On main: repo-hygiene: pre-T002769-plan
                                dirty main checkout
    git worktree list       ->  zusaetzlich .worktrees/plan-staged-guard-T002769

Zeitstempel (git log -g refs/stash bzw. stat): Stash 2026-08-09T03:36:03+02:00, Worktree
03:37:21 — beide innerhalb dieses Laufs.

URHEBER IST NICHT BELEGT [UNVERIFIED]

Die naheliegende Erklaerung waere der Factory-Tick — mcp__factory-mcp__factory_status
meldete tick_running=true, und T002769 stand als plan_staged in der Queue. Diese
Zuschreibung haelt der Pruefung aber NICHT stand: eine repo-weite Suche nach der
Stash-Nachricht ("dirty main checkout") findet keinen Treffer, und der einzige
git-stash-push im Repo steht in scripts/worktree-create.sh:154 mit der abweichenden
Nachricht "worktree-create-auto-stash". Die Nachricht "repo-hygiene: pre-T002769-plan
dirty main checkout" ist von Hand formuliert — also von einer nebenlaeufigen
Agenten-Session, nicht von versioniertem Code. ListAgents meldete 53 Peer-Sessions.
Welche es war, ist offen.

Kein Verzeichnis .agent-locks/ vorhanden — zum Zeitpunkt der Kollision hielt niemand
einen Lock auf den Hauptcheckout, auch ich nicht.

FOLGE

Kein Datenverlust: der Stash-Inhalt wurde per git diff "stash@{0}^" "stash@{0}"
verifiziert und ist mit dem urspruenglich gefundenen Diff identisch; er ist in Ticket
T002782 samt Wiederauffind-Anleitung ueber die Stash-Nachricht dokumentiert
(stash@{0} ist relativ und verschiebt sich bei weiteren Stashes).

Der Schaden ist ein anderer: der §0-Befund, auf dem eine Nutzerentscheidung beruhte
(Routing der drei ungeticketen Aenderungen in ein chore-Ticket), war zum Zeitpunkt des
Berichts nicht mehr der Ist-Zustand. Aufgefallen ist es nur, weil am Ende zufaellig noch
einmal git status lief. Ohne diese Wiederholung haette der Bericht einen Arbeitsbaum
beschrieben, den es nicht mehr gab — und der Nutzer haette die Aenderungen an der
genannten Stelle nicht gefunden.

STRUKTURELLER KERN

repo-hygiene §0 liest den Hauptcheckout und leitet daraus Entscheidungen ab, haelt aber
keinen Lock dagegen und prueft nicht, ob nebenlaeufige Schreiber aktiv sind. Der
Factory-Status wird erst in §5 abgefragt, also NACH der Auswertung — obwohl ein laufender
Tick eine Vorbedingung fuer §0 ist, nicht eine Randnotiz am Schluss.

DENKBARE ABHILFE (nicht entschieden)
- §0 fragt Factory-Status und aktive Sessions VOR der Arbeitsbaum-Inspektion ab und
  meldet einen laufenden Schreiber als ausdruecklichen Vorbehalt am Befund.
- Oder: §0 wiederholt die Inspektion am Ende und vergleicht; eine Abweichung wird
  gemeldet statt stillschweigend ueberschrieben.
- Oder: repo-hygiene nimmt fuer die Dauer des Laufs einen agent-lock auf den
  Hauptcheckout (scripts/agent-lock.sh).
Welche davon traegt, ist eine eigene Untersuchung — insbesondere weil der Urheber hier
gerade NICHT der Factory-Tick war und ein Lock gegen fremde Agenten-Sessions nur wirkt,
wenn diese ihn auch lesen.
**9. Branch-Lock überlebt Reap trotz totem PID und fehlendem Worktree — plus Korrektur zum vorigen Mishap** (drift, scripts/agent-lock.sh)

KORREKTUR ZUM VORHERGEHENDEN EINTRAG (gleiche Session, 2026-08-09)

Der Mishap "Hauptcheckout wurde mitten im repo-hygiene-Lauf von fremder Hand gestasht"
enthaelt eine falsche Behauptung: "Kein Verzeichnis .agent-locks/ vorhanden — zum
Zeitpunkt der Kollision hielt niemand einen Lock". Das ist falsch. Ich hatte im
Repo-Wurzelverzeichnis nachgesehen; der Lock-Store liegt aber laut _lock_dir() in
scripts/agent-lock.sh unter "$(git rev-parse --git-common-dir)/agent-locks", also
.git/agent-locks/. Dort lagen sechs lebende Claims.

Damit klaert sich auch der offene Punkt "Urheber ist nicht belegt": ticket/T002769 war
mit Label "opencode-flow-plan" (sid 289461) geclaimt. Die Stash-Nachricht
"repo-hygiene: pre-T002769-plan dirty main checkout" passt dazu. Der Urheber war eine
opencode-Planungssession — nicht der Factory-Tick, wie zuerst vermutet, und nicht
"niemand mit Lock", wie danach behauptet. Wer den vorigen Eintrag liest, muss diesen
mitlesen.

EIGENSTAENDIGER BEFUND: Branch-Lock ueberlebt zwei Reap-Laeufe

    $ cat .git/agent-locks/branch__fix-ticket-read-path-T002781.json
    { "scope": "branch", "id": "fix/ticket-read-path-T002781",
      "owner_sid": "fa33ecd9-...", "owner_pid": "127574",
      "worktree": "/home/patrick/Bachelorprojekt/.worktrees/ticket-read-path-T002781",
      "created_at": "1786238180", "heartbeat_at": "1786238180" }

Zustand zum Pruefzeitpunkt:
  - PID 127574: ps -p 127574 -> nicht vorhanden (tot)
  - worktree-Pfad: von mir entfernt, existiert nicht mehr
  - owner_sid: fremde Session, nicht meine (ffe41dfa-...)
  - heartbeat_at == created_at, rund 28 Minuten alt

Trotzdem meldet agent-lock.sh list den Eintrag nach ZWEI aufeinanderfolgenden reap-Laeufen
weiterhin als STATE=live. Im selben Lauf wurden andere Locks sehr wohl geerntet
(.reap.log: ticket/T002767 heartbeat-ttl, ticket/T002781 heartbeat-ttl), und der Reaper
kennt worktree-missing nachweislich als Grund — er hat ticket/T002645 genau damit geerntet
(1786239054 ticket/T002645 worktree-missing).

VERMUTUNG (nicht verifiziert): worktree-missing und/oder pid-dead werden fuer scope=ticket
ausgewertet, fuer scope=branch aber nicht — oder der Branch-Scope hat eine deutlich
laengere Heartbeat-TTL. Welche der beiden zutrifft, ist ohne Lesen der Reap-Bedingungen in
scripts/agent-lock.sh nicht entschieden.

FOLGE: Ein Claim auf branch "fix/ticket-read-path-T002781" wird blockiert, obwohl der
Halter tot und sein Worktree weg ist. T002781 ist ein offenes Ticket in triage — die
naechste Session, die daran arbeiten will, laeuft in den toten Lock.

TEST (Output-Verifikation, T002448-M4): Einen Branch-Lock mit totem PID und fehlendem
Worktree anlegen, reap AUSFUEHREN und pruefen, dass der Lock danach WEG ist (bzw. list ihn
nicht mehr als live fuehrt) — nicht die Reap-Bedingungen im Quelltext greppen. Positiv-Anker
(T002356-M1): im selben Test zeigen, dass ein Branch-Lock mit LEBENDEM Halter den Reap
ueberlebt, sonst besteht der Test auch bei einem Reaper, der wahllos alles loescht.
### Mishap-Rollup — kuratierte Uebernahme aus 14 gestrandeten Batches (2026-08-09)

Nachgezogen aus den Containern T002557/T002575/T002597/T002601 (alle `done`, fuer den Rollup-Treiber unsichtbar — Defekt T002783). Quelle: 14 unverarbeitete Batch-Kommentare vom 2026-08-02 bis 2026-08-09 mit 128 Eintragszeilen, davon 109 eindeutig.

**Auswahl:** 44 Eintraege hatten bereits ein eigenes Ticket (Titelabgleich gegen 2079 Tickets), 24 waren einmalige Zustandsbeobachtungen, 9 sind anderweitig dokumentiert oder abgedeckt. Es bleiben die folgenden strukturellen Befunde ohne eigenes Ticket. Die Klassifikation erfolgte auf Titelebene mit Stichproben-Verifikation, nicht als Einzelaudit jedes Eintrags.

| # | Typ | Befund |
|---|---|---|
| 1 | degraded | KORREKTUR zum vorigen Eintrag: task pr:refresh verweigert Branches, die in einem Worktree ausgecheckt sind |
| 2 | degraded | Offener PR wird durch parallelen OpenSpec-Archive-Merge rot, ohne automatisches Nachziehen |
| 3 | degraded | Ticket-Auto-Close bei Mehr-PR-Vorgaengen: done bei 1/7 Fortschritt |
| 4 | degraded | Vitest-Dateien liegen zwischen node:test-Suiten und machen Sammellaeufe strukturell rot |
| 5 | degraded | branch-reaper.sh: fehlende Merge-Base wird als "keine Abweichung" gewertet |
| 6 | degraded | dev-flow-execute-Subagenten beenden sich beim Warten auf Hintergrundlaeufe — Arbeit bleibt halbfertig liegen |
| 7 | degraded | devflow-ci-watch.sh meldet nach Force-Push (Rebase) stale Check-Ergebnisse der alten SHA statt der neuen |
| 8 | degraded | freshness:check misst lokal gegen den Branch, CI gegen den Merge-Commit |
| 9 | degraded | llm-proxy haelt loadouts.mjs im Speicher — kennt nach einem Merge neue Felder nicht |
| 10 | degraded | openspec-status.json ist per Konstruktion blind fuer plan_staged-Tickets |
| 11 | degraded | plan-context.sh --with-openspec liefert 170+ Proposals, Direktive nicht befolgbar |
| 12 | degraded | post-commit openspec-embed-Hook meldet "fetch failed" — Changes bleiben unindiziert |
| 13 | degraded | repo-hygiene-ops §2 setzt volle Historie voraus — Hauptcheckout war shallow |
| 14 | degraded | repo-hygiene-ops.md §3 umgeht vier vorhandene PR-Werkzeuge zugunsten handgeschriebener gh/git-Kommandos |
| 15 | degraded | worktree-create.sh prueft die erste Ticket-ID im Branchnamen, nicht die eigene |
| 16 | degraded | worktree-create.sh: lokale Aenderungen an Dateien im FF-Bereich gehen beim main-Sync still verloren |
| 17 | degraded | worktree-write-guard erfasst keine Bash-Schreibzugriffe |
| 18 | drift | Doku-Drift: ticket_links traegt 340+ PR-Selbstkanten, Skill-Referenz schliesst das aus |
| 19 | drift | G-AGENTIC07 auf main rot: ein verwaister aktiver Skill ohne Referenzquelle |
| 20 | drift | dev-flow-plan Fix-Pfad: stage-plan (Schritt 4.5) steht vor Commit (Schritt 5), ist so aber nicht ausfuehrbar |
| 21 | process | "behind N" gegen den eigenen Feature-Remote ist kein Beleg fuer fehlende Arbeit |
| 22 | process | Subagent-Abbruch: letzte Ausgabezeile suggerierte Fortschritt, Dateien waren leer |
| 23 | process | dev-flow-e2e empfiehlt test/*-Branch, pre-commit verlangt feature/fix/chore/docs + T###### |
| 24 | process | mishap-tracker erzeugt Duplikat-Incident zu einem bereits gestagten Plan |
| 25 | suspicious | agent-lock list zeigt Lock mit "--label" als Scope-Wert (Argument-Parsing) |
| 26 | suspicious | branch-reaper.sh erzwingt --ticket auch im reinen --dry-run-Inventarlauf |
| 27 | suspicious | browser.newContext() im storageState-Projekt lieferte authentifizierten Kontext |
| 28 | suspicious | devflow-ci-watch meldet "Keine CI-Checks gefunden", nachdem es zehn gruene Checks gelistet hat |
| 29 | suspicious | mcp-sync-Guard meldet auf veralteter Branch-Basis roten Drift, der lokal nicht existiert |
| 30 | suspicious | test:spec:changed uebersieht staged-aber-uncommittete Tests und meldet "No matching spec tests" |
| 31 | suspicious | ticket.sh list --status <unbekannt> liefert still [] statt eines Fehlers |

Volltext der Einzeleintraege: Batch-Kommentare 9913, 10114, 10273, 10413, 10672, 10718, 10839, 10840, 11241, 11242, 13115, 13249, 13429, 13727 in `tickets.ticket_comments`.
### Volltexte der 31 uebernommenen Befunde (Archiv vor Loeschung der Altcontainer)

Gesichert am 2026-08-09, bevor T002541/T002557/T002575/T002597/T002601 entfernt wurden. Die Zeiger auf die urspruenglichen Kommentar-IDs im vorigen Kommentar verfallen mit der Loeschung — dies hier ist der Ersatz.

---

#### 1. KORREKTUR zum vorigen Eintrag: task pr:refresh verweigert Branches, die in einem Worktree ausgecheckt sind

_(degraded, skills/references/repo-hygiene-ops)_

Korrigiert den unmittelbar vorhergehenden Buffer-Eintrag "repo-hygiene-ops.md §3 umgeht vier vorhandene PR-Werkzeuge". Dessen Fix-Richtung ("Heilpfad auf `task pr:refresh -- <pr>` als Primaerweg umstellen, manuelle Prozedur zum Fallback degradieren") ist in dieser Form FALSCH und darf nicht so umgesetzt werden.

BEOBACHTUNG:
    $ task pr:refresh -- --dry-run 3856
    pr-refresh: PR 3856: Branch feature/e3-sdlc-tickets-lokal-T002626 ist ausgecheckt in
                /home/patrick/Bachelorprojekt/.worktrees/e3-sdlc-tickets-lokal — abgebrochen.
    pr-refresh: Bilanz — 0 geheilt, 0 uebersprungen, 1 abgelehnt.
    exit status 1

scripts/pr-refresh.sh lehnt einen PR ab, sobald dessen Branch in einem Worktree ausgecheckt ist. Das ist plausibel als Schutz (das Skript will den Branch selbst auschecken/rebasen und wuerde sonst mit dem Worktree kollidieren), aber es trifft den Regelfall von repo-hygiene: die offenen PRs dieses Repos haben typischerweise genau einen zugehoerigen Worktree unter .worktrees/. In diesem Lauf galt das fuer beide offenen PRs.

FOLGE FUER DIE FIX-RICHTUNG:
Die manuelle Prozedur in §3 (git merge origin/main → task freshness:regenerate → task test:inventory → commit → push) ist NICHT obsolet — sie ist der korrekte Weg fuer worktree-ausgecheckte Branches, und PR #3856 wurde in diesem Lauf zweimal so geheilt. Der eigentliche Mangel ist enger als zuerst formuliert: §3 nennt weder das Werkzeug noch seine Vorbedingung. Richtige Ergaenzung waere eine Fallunterscheidung:
  - Branch NICHT in einem Worktree ausgecheckt → `task pr:refresh -- <pr>`
  - Branch in einem Worktree ausgecheckt (Regelfall) → manuelle Prozedur, im Worktree ausgefuehrt
Zusaetzlich waere zu pruefen, ob pr-refresh.sh den Worktree-Fall selbst bedienen koennte (im vorhandenen Worktree mergen statt den Branch andernorts auszuchecken) — dann entfiele die Fallunterscheidung.

Der Teilbefund zu scripts/ci-pr-health.sh aus dem vorigen Eintrag bleibt unveraendert gueltig: es erkennt "CI nie gestartet" via Exit 2 und hat keine Worktree-Vorbedingung, ist also uneingeschraenkt als Triage-Schritt in §3 aufnehmbar.

ZUSATZBEOBACHTUNG (belegt die Wiederkehr): Nach dem Merge von PR #3867 nach main fiel PR #3856 sofort wieder auf mergeStateStatus=DIRTY zurueck, weil beide PRs dieselben generierten Artefakte (test-inventory.json, repo-index.json) beruehren. Die Heilung musste im selben Lauf zweimal ausgefuehrt werden. Das ist die in T002347 beschriebene Ursache, hier mit Messpunkt.

---

#### 2. Offener PR wird durch parallelen OpenSpec-Archive-Merge rot, ohne automatisches Nachziehen

_(degraded, ci/openspec-validate)_

PR #3669 war 5 Commits hinter main und CI rot (Factory OpenSpec + Guards, Factory spec shard 3), weil der Branch noch das inzwischen von PR #3671 archivierte OpenSpec-Change-Verzeichnis openspec/changes/fix-plan-intel-merge unarchiviert trug. Kollateralschaden: jeder offene PR mit eigenem OpenSpec-Change kann durch einen fremden Archive-Merge auf main rot werden, ohne dass etwas am PR selbst falsch ist. Kein automatischer Rebase-Trigger dafür vorhanden. Manuell per REST-Update behoben.

---

#### 3. Ticket-Auto-Close bei Mehr-PR-Vorgaengen: done bei 1/7 Fortschritt

_(degraded, scripts/factory/pipeline.js)_

T002569 (OpenSpec-Rueckstau, 7 geplante Chargen) wurde nach dem Merge von PR #3694 ("archive OpenSpec-Charge 1 [T002569]") automatisch auf done gesetzt. Zu dem Zeitpunkt standen 166 von urspruenglich 181 Changes noch unarchiviert — der Vorgang war zu etwa 1/7 erledigt.

Ursache: der Merge-Automatismus schliesst jede im PR-Titel referenzierte Ticket-ID, unabhaengig vom tatsaechlichen Fortschritt. Bei einem Vorgang, der per Plan bewusst ueber mehrere PRs laeuft, ist das strukturell falsch.

VERSCHAERFEND: Der Rueckweg ist per Wrapper versperrt. `mcp__ticket-mcp__transition_status` lehnt ab mit "Cannot transition from 'done' to 'in_progress' — terminal tickets can only transition to 'archived'". Die Korrektur ging nur per direktem psql-UPDATE am Guard vorbei. Wer den Fehlzustand bemerkt, muss also eine Schutzregel umgehen, um ihn zu beheben.

VERIFIZIERT 2026-08-02: PR #3693 und #3694 gemergt, `git ls-tree -d origin/main openspec/changes/` zaehlt 166 unarchivierte Verzeichnisse, Ticket stand auf done/resolution=NULL. Zurueckgesetzt auf in_progress per psql.

VORSCHLAG: Entweder der Auto-Close prueft eine Fortschritts-Bedingung (z.B. Plan-Tasks alle abgehakt), oder mehrteilige Vorgaenge markieren sich als solche und sind vom Auto-Close ausgenommen. Alternativ ein dokumentierter, nicht-SQL Rueckweg fuer genau diesen Fall.

---

#### 4. Vitest-Dateien liegen zwischen node:test-Suiten und machen Sammellaeufe strukturell rot

_(degraded, scripts/llm-proxy)_

scripts/llm-proxy/mcp-bridge.test.mjs und scripts/llm/ui-config-seed.test.mjs importieren aus 'vitest', liegen aber im selben Verzeichnis wie echte node:test-Suiten (loadouts/runner/server/models.test.mjs).

Unter `node --test` geben sie irrefuehrende Fehler, die nach Produktionsfehlern aussehen statt nach falschem Runner:
  mcp-bridge:      "Vitest mocker was not initialized in this environment. vi.queueMock() is forbidden."
  ui-config-seed:  "TypeError: Cannot read properties of undefined (reading 'config')"

Folge: `node --test scripts/llm-proxy/` ist per Konstruktion rot, obwohl alle vier echten Suiten gruen sind. Beide Dateien verhalten sich auf main genauso — vorbestehend, nicht durch einen aktuellen PR verursacht. Unter `npx vitest run` laufen sie sauber (3/3 geprueft).

Kostete zweimal Diagnosezeit: einmal beim Sammellauf, einmal bei der Frage, ob eine eigene Aenderung sie gebrochen hatte.

Vorschlag: Namenskonvention (*.vitest.mjs) oder ein Kommentarheader in Zeile 1, der den zustaendigen Runner nennt — die Dateien sagen es derzeit erst im Import.

---

#### 5. branch-reaper.sh: fehlende Merge-Base wird als "keine Abweichung" gewertet

_(degraded, scripts/branch-reaper.sh)_

VERIFIZIERT (2026-08-02, repo-hygiene-Lauf).

BEFUND: scripts/branch-reaper.sh:109 in _diverging_files():
  mb="$(git merge-base "$REMOTE/main" "$ref" 2>/dev/null)" || return 0
Schlaegt git merge-base fehl (keine gemeinsame Historie), kehrt die Funktion mit Exit 0 und OHNE jede Ausgabe zurueck. Der Aufrufer kann eine leere Abweichungsliste nicht von einer nie durchgefuehrten Messung unterscheiden — beides sieht aus wie "Branch weicht nicht von main ab" und damit wie eine Reap-Freigabe.

Damit faellt genau das zweite der beiden Sicherheitssignale aus, die der Reaper laut Dokumentation verlangt ("Blob-Diff leer" UND "Ticket done"). Uebrig bleibt "Ticket done" allein — und die SSOT-Referenz repo-hygiene-ops.md haelt ausdruecklich fest, dass dieses Signal allein bei T002431 die einzige Kopie eines nie gemergten Deliverables geloescht haette.

REAL AUFGETRETEN: origin/chore/mishap-t002408 hatte heute keine gemeinsame Merge-Base mit origin/main (git merge-base exit 1). Der Branch war nach manueller Pruefung tatsaechlich harmlos (beide Plan-Dateien blob-identisch in main, Ticket T002408 done, kein PR) und wurde geloescht — die Freigabe kam aber aus einer Pruefung, die in diesem Pfad nichts geprueft haette.

GLEICHES MUSTER, ZWEITE STELLE: Der in repo-hygiene-ops.md §2 dokumentierte Handbetrieb-Schnipsel hat denselben Defekt ohne den kaschierenden Exit-Code:
  mb=$(git merge-base origin/main "$b")
  for f in $(git diff --name-only "$mb" "$b"); do ...
Bei leerem $mb meldet git "fatal: ambiguous argument ''" auf stderr und die Schleife laeuft null Runden — auf stdout nicht von einem sauberen Ergebnis unterscheidbar.

VORSCHLAG: In beiden Faellen die leere Antwort explizit vom negativen Befund trennen, statt aus Abwesenheit auf Unbedenklichkeit zu schliessen:
  mb="$(git merge-base "$REMOTE/main" "$ref" 2>/dev/null)" || { printf 'KEINE-MERGE-BASE\n'; return 0; }
Der Marker faellt dann in die Abweichungsliste, faellt durch die Allowlist und fuehrt zu KEEP statt REAP. Das ist dieselbe Korrektur, die repo-hygiene-ops.md §3 fuer gh-Antworten bereits vorschreibt ("Leere Antwort ist KEIN Urteil", T002498-M5) — hier fehlt sie auf der git-Seite.

---

#### 6. dev-flow-execute-Subagenten beenden sich beim Warten auf Hintergrundlaeufe — Arbeit bleibt halbfertig liegen

_(degraded, .claude/skills/dev-flow-execute)_

BEFUND (2026-08-02, Fan-out von 6 dev-flow-execute-Subagenten aus ticket-ops Phase 3): DREI VON DREI Agenten, die sich bis dahin beendet hatten, stoppten im selben Zustand — sie hatten einen Lauf im Hintergrund gestartet und beendeten sich in Erwartung einer Benachrichtigung, die einen Subagenten nicht mehr erreicht.

Belegte Faelle, je woertlich aus der Abschlussmeldung:
- T002504: "Waiting for the background `task test:changed` run (and the completion watcher) to finish — I'll resume once notified."
- T002435: "Waiting for the background CI-watch loop to complete before continuing."
- T002467: "I'll pause here and wait for the background verification task to complete."

AUSWIRKUNG: Der Agent meldet sich als `completed`, ohne fertig zu sein. T002504 hatte zu diesem Zeitpunkt weder Commit noch PR. Ohne einen Orchestrator, der die Abschlussmeldungen gegenliest und per SendMessage nachfasst, waeren die Branches halbfertig liegen geblieben und haetten von aussen wie erledigte Arbeit ausgesehen — der gefaehrlichere Fall, weil nichts rot wird. Bei allen drei genuegte eine Aufforderung, den Stand selbst nachzusehen; danach liefen sie sauber bis Auto-Merge durch (T002435 → PR #3677).

URSACHE (Hypothese, nicht verifiziert): Das Warte-Idiom von dev-flow-execute (Hintergrundlauf starten, auf Notification warten) setzt einen Lebenszyklus voraus, den ein Subagent nicht hat. Im Hauptloop funktioniert es, im Fan-out nicht.

MOEGLICHE ABHILFEN, zu bewerten: (a) dev-flow-execute weist an, Verifikationslaeufe im Fan-out-Kontext im VORDERGRUND mit Timeout zu fahren statt im Hintergrund; (b) die Subagent-Provisionierung ergaenzt eine Direktive "warte nie auf eine Notification, pruefe den Stand selbst"; (c) der Dispatcher prueft jede `completed`-Meldung gegen den tatsaechlichen Branch-Zustand (Commit vorhanden? PR vorhanden? Auto-Merge gesetzt?), bevor er sie als fertig wertet. Variante (c) ist unabhaengig von der Ursache wirksam und deshalb der robusteste Kandidat.

---

#### 7. devflow-ci-watch.sh meldet nach Force-Push (Rebase) stale Check-Ergebnisse der alten SHA statt der neuen

_(degraded, scripts)_

T002561: Nach `git push --force-with-lease` (Rebase gegen origin/main wegen eines konkurrierenden Merges) lief `devflow-ci-watch.sh` erneut und meldete "18 CI-Checks, alle grün" — aber mit denselben Run-/Job-IDs wie vor dem Force-Push. Ein direkter Abgleich über `gh api repos/.../commits/<neue-SHA>/check-runs` zeigte die Checks noch als `in_progress` für die neue SHA. Das Skript scheint gecachte Rollup-Daten zu nutzen, die kurz nach einem Force-Push die alte SHA widerspiegeln, statt gegen die aktuelle `headRefOid` zu verifizieren. Ohne manuellen Gegencheck wäre ein Merge auf Basis stale gemeldeter grüner Checks versucht worden. Vorschlag: Skript soll die aktuelle `headRefOid` explizit gegen die Check-Run-SHA abgleichen und bei Mismatch neu pollen.

---

#### 8. freshness:check misst lokal gegen den Branch, CI gegen den Merge-Commit

_(degraded, Taskfile.yml)_

PR #3658 scheiterte dreimal an "docs/code-quality/repo-index.json regenerated but not staged", waehrend lokal `task freshness:check` durchgehend "All generated artifacts are fresh" meldete. Auch ein direkter Aufruf von scripts/code-quality/emit-index.mjs erzeugte lokal keinen Diff.

URSACHE (nach dem Rebase belegt): CI prueft den MERGE-Commit aus PR-Head und aktuellem main, nicht den Branch allein. Zwischen Abzweig und Pruefung waren mehrere PRs auf main gelandet; der gemergte Zustand enthielt also mehr Dateien. Der Index-Generator scannt `git ls-files` PLUS untracked-but-not-ignored (scripts/code-quality/scan.mjs), das Ergebnis haengt damit direkt an der Dateimenge.

Nach `git rebase origin/main` aenderten sich prompt beide Artefakte: repo-index.json +2/-1, test-inventory.json +6 Zeilen. Genau die Differenz, die CI sah und die lokale Messung nicht sehen konnte.

WARUM ES ZEIT KOSTETE: Beide Messungen waren korrekt, sie massen nur Verschiedenes. Ein Re-Run des Jobs half deshalb nicht — es war kein Flake, sondern eine veraltete Basis. Diagnostiziert wurde erst, nachdem der PR zusaetzlich auf DIRTY ging und ein Rebase ohnehin faellig war.

VORSCHLAG: Die Fehlermeldung von freshness:check koennte nennen, gegen welche Basis gemessen wurde, oder der Task koennte warnen, wenn der Branch hinter origin/main liegt ("HEAD ist N Commits hinter origin/main — CI misst gegen den Merge-Commit, das Ergebnis kann abweichen"). Der Hinweis kostet eine Zeile und haette hier drei Anlaeufe gespart.

VERWANDT, gleiche Fehlerklasse in derselben Session: `git show origin/main:<pfad>` im Worktree lieferte einen veralteten Stand, woraufhin gueltige Tests als verwaist geloescht wurden (Mishap bereits erfasst). Beide Male war die Referenz falsch, nicht die Messung.

---

#### 9. llm-proxy haelt loadouts.mjs im Speicher — kennt nach einem Merge neue Felder nicht

_(degraded, scripts/llm-proxy/server.mjs)_

Beim Stop/Start von llama-gemma26-factory ueber den llm-proxy (POST /admin/loadouts/<slug>/start) antwortete dieser:

  {"error":{"code":"start_error","message":"loadouts.json: loadouts[4]: unbekanntes Feld 'tools'"}}

Das Feld 'tools' ist seit PR #3640 im Validator (scripts/llm-proxy/loadouts.mjs). Der llm-proxy-Prozess lief seit 08:26:39 aus /home/patrick/Bachelorprojekt; #3640 wurde gegen 08:50 gemergt. Die Datei auf der Platte war also neu, der Prozess hielt die alte Fassung im Speicher.

FOLGE, nicht bloss kosmetisch: Das Loadout war zu dem Zeitpunkt bereits GESTOPPT (der Stop lief ueber denselben Proxy und gelang). Der fehlgeschlagene Start liess gemma26-factory unten — die Factory hatte kein Modell, bis der Proxy neu gestartet und das Loadout erneut hochgefahren war. Insgesamt rund 10 Minuten.

Die Reihenfolge macht es gefaehrlich: Stop gelingt (alter Code reicht dafuer), Start scheitert (neuer Code noetig). Wer beides als Paar denkt, steht danach ohne laufendes Modell da.

VORSCHLAG: Nach einem Merge, der scripts/llm-proxy/* beruehrt, gehoert systemctl --user restart llm-proxy.service in den post-merge-Pfad — analog zu dem, was devflow-post-merge-deploy.sh fuer Cluster-Pfade tut. Alternativ koennte der Proxy seine Modul-Memoisierung beim Erkennen einer geaenderten loadouts.mjs verwerfen; das ist aber der groessere Eingriff.

Verwandt: der Proxy memoisiert auch die Backend-Tabelle (loadBackendsOnce in backends.mjs) — dieselbe Klasse Problem fuer Aenderungen an tickets.llm_proxy_backends.

---

#### 10. openspec-status.json ist per Konstruktion blind fuer plan_staged-Tickets

_(degraded, scripts/openspec-status-map.sh)_

ticket-ops-procedures Step 1.3 schreibt den Lookup `get_openspec_status` gegen website/src/data/openspec-status.json vor. Am 2026-08-02 lieferte er fuer ALLE 14 offenen Tickets einen leeren Status. VERIFIZIERT: Die Datei ist nicht defekt — 41663 Bytes, 379 Top-Level-Keys. Sie enthaelt aber keinen der aktuellen Changes, weil diese in Feature-Branches liegen und der Index aus main gebaut wird (`grep -rl` auf openspec/changes/*/.ticket findet auf main keinen der Slugs zu T002433-T002438, waehrend die Changes in den jeweiligen Branches committet vorliegen). Damit ist der Lookup strukturell wirkungslos fuer genau die Ticketklasse, fuer die Step 1.3 ihn abfragt: plan_staged-Tickets haben ihren Change definitionsgemaess noch nicht auf main. Entweder muss scripts/openspec-status-map.sh Branch-Changes mitindizieren, oder Step 1.3 muss den Branch-Stand direkt lesen. Nebenbefund: die Datei war im Hauptcheckout uncommitted modifiziert.

---

#### 11. plan-context.sh --with-openspec liefert 170+ Proposals, Direktive nicht befolgbar

_(degraded, scripts/plan-context.sh)_

CLAUDE.md schreibt vor, den Output von `bash scripts/plan-context.sh <role> --with-openspec` vor JEDEM Agent-Dispatch in den Prompt zu injizieren. Der Output umfasst derzeit ueber 170 Proposals, weil plan-context.sh `openspec/changes/` als Menge der AKTIVEN Vorhaben liest und dort der Archivierungs-Rueckstau liegt.

WIRKUNG: Die Direktive ist fuer Multi-Agent-Dispatches praktisch nicht befolgbar — der Block wuerde den Prompt dominieren. In diesem ticket-ops-Lauf wurde sie fuer beide Welle-1-Dispatches bewusst uebergangen und die Abweichung im jeweiligen Agent-Prompt begruendet.

STATUS DER BEHEBUNG: T002569 baut den Rueckstau ab. Stand 2026-08-02 sind PR #3693 (Guard-Fix) und #3694 (Charge 1) gemergt, 166 von urspruenglich 181 Changes stehen noch. Nach Abschluss aller 7 Chargen schrumpft der Feed auf die real offenen Vorhaben und die Direktive wird wieder sinnvoll.

Kein eigener Fix noetig — hier festgehalten, damit die bewusste Abweichung nachvollziehbar ist und damit sichtbar bleibt, dass eine dokumentierte Pflicht derzeit nicht erfuellbar ist.

---

#### 12. post-commit openspec-embed-Hook meldet "fetch failed" — Changes bleiben unindiziert

_(degraded, hooks/openspec-embed)_

Beim Commit des T002569-Plans meldete der post-commit-Hook `openspec-embed` "fetch failed" (Embedding-Backend nicht erreichbar). Der Hook ist nicht-fatal, der Commit ging durch.

WIRKUNG: Der neue Change ist nicht in pgvector indiziert. Die semantische Suche ueber OpenSpec-Changes (u.a. `openspec_find_similar` in factory-mcp, das vor dem Anlegen eines Proposals auf Duplikate prueft) sieht ihn nicht. Da der Hook still fail-open ist, faellt das nur auf, wenn man die Hook-Ausgabe liest — die Luecke waechst unbemerkt mit jedem Commit, der bei nicht erreichbarem Backend entsteht.

Zusammenhang mit T002570: dort wurde gerade das Embedding-Routing korrigiert (bge-m3 primaer statt Voyage-Default, tote :8095-Fallbacks entfernt). Ob der Hook denselben Endpunkt nutzt und der Fehler nach dem Merge von PR #3692 verschwindet, ist NICHT geprueft — waere aber der erste Verdacht.

VORSCHLAG: Pruefen, ob openspec-embed nach T002570 wieder durchlaeuft; falls ja, einen Nachindizierungs-Lauf fuer die zwischenzeitlich unindizierten Changes anstossen. Falls nein, eigene Ursachensuche.

---

#### 13. repo-hygiene-ops §2 setzt volle Historie voraus — Hauptcheckout war shallow

_(degraded, skills/references/repo-hygiene-ops)_

Beobachtet 2026-08-03 beim /repo-hygiene-Lauf. Der Hauptcheckout /home/patrick/Bachelorprojekt war ein Shallow Clone (.git/shallow vorhanden, `git log --oneline origin/main | wc -l` = 12).

Folge: `git merge-base origin/main <branch>` scheiterte mit rc=1 fuer JEDEN der 7 Feature-Branches ("keine gemeinsame Historie"). Die in repo-hygiene-ops.md §2 dokumentierte Blob-Vergleichsschleife baut auf `mb=$(git merge-base ...)` auf und lief damit mit leerem $mb ins `fatal: ambiguous argument ''`. Der naheliegende Ausweichweg `git diff --name-only origin/main <branch>` (Zwei-Punkt) meldete stattdessen hunderte Phantom-Loeschungen unter .claude/skills/unsloth-buddy/** — die Branches lagen dort lediglich hinter main. Eine Reap-Entscheidung auf dieser Basis haette die Diff-Signatur falsch gelesen.

Nach `git fetch --unshallow` lieferte dieselbe Schleife das korrekte Bild: alle 7 Branches tragen echte ungemergte Dateien, kein einziger war Reap-Kandidat.

Vorschlag: in repo-hygiene-ops.md §2 einen Vorcheck aufnehmen, z.B.
  [ -f "$(git rev-parse --git-dir)/shallow" ] && git fetch --unshallow
Auch `git branch --merged main` ist im Shallow-Zustand strukturell unbrauchbar, ohne dass es das anzeigt.

---

#### 14. repo-hygiene-ops.md §3 umgeht vier vorhandene PR-Werkzeuge zugunsten handgeschriebener gh/git-Kommandos

_(degraded, skills/references/repo-hygiene-ops)_

BEOBACHTUNG (/repo-hygiene-Lauf 2026-08-08)

Die SSOT-Referenz .claude/skills/references/repo-hygiene-ops.md §3 ("PR-Triage") schreibt eine manuelle Prozedur vor: rohes `gh pr list --json statusCheckRollup`, und zum Heilen eines CONFLICTING-PR `git merge origin/main` + `task freshness:regenerate` + commit + push, mit REST-`update-branch` als Eskalation. Sie nennt keines der vier Werkzeuge, die das Repo für genau diesen Zweck bereits hat.

VERIFIKATION (grep -c gegen repo-hygiene-ops.md):
  task pr:refresh              → 0 Treffer
  scripts/ci-pr-health.sh      → 0 Treffer
  scripts/factory/babysit-prs.sh → 0 Treffer
  scripts/devflow-ci-watch.sh  → 0 Treffer

Belege, dass die Werkzeuge existieren und passen:
- `task --list` zeigt: "pr:refresh: Rebase konfliktbehaftete PRs auf origin/main und heilt Konflikte in generierten Artefakten. Usage: task pr:refresh -- [--dry-run] <pr-nummer>..." (entstanden aus T002413, Status done).
- scripts/ci-pr-health.sh dokumentiert im Kopf und implementiert in Zeile 216 den Exit-Code 2 = "no checks found at all (CI never started)".

KONKRETER SCHADEN IN DIESEM LAUF:
1. PR #3856 (T002626) stand auf mergeStateStatus=CONFLICTING. GitHub startet auf solchen PRs keine Workflows: statusCheckRollup hatte 0 Einträge. In `gh pr list` sah der PR dadurch nicht rot aus, sondern unauffällig — er war schlicht ungetestet. Nach dem Heilen sprang die Zahl von 0 auf 15 Checks. Ein Aufruf von scripts/ci-pr-health.sh hätte das mit Exit 2 sofort gemeldet; §3 sieht ihn nicht vor.
2. Ich habe #3856 anschließend von Hand geheilt (git merge origin/main, task freshness:regenerate, task test:inventory, commit, push), obwohl `task pr:refresh -- 3856` denselben Vorgang automatisiert.

MITURSACHE (Verhalten des Agenten): CLAUDE.md verlangt "Never look up or hardcode task commands. Use the task oracle instead: bash scripts/vda.sh oracle '<goal>'". Ich habe den Oracle nicht befragt, sondern die in der Skill-Referenz hartkodierten Kommandos ausgeführt — genau deshalb blieben die vier Werkzeuge unentdeckt. Die Referenz macht diesen Fehler leicht, weil sie fertige Kommandozeilen anbietet, gegen die der Oracle-Vorrang nicht sichtbar konkurriert.

FIX-RICHTUNG:
- §3 um `scripts/ci-pr-health.sh --pr <n>` als ersten Triage-Schritt ergänzen und Exit 2 ausdrücklich als "CI nie gestartet, meist CONFLICTING" ausdeuten.
- Heilpfad auf `task pr:refresh -- <pr>` als Primärweg umstellen; die manuelle merge+regenerate-Prozedur zum dokumentierten Fallback degradieren (sie bleibt wertvoll, wenn pr:refresh scheitert).
- Prüfen, ob dieselbe Lücke in anderen Skill-Referenzen besteht, die rohe gh-Kommandos einbetten.

ABGRENZUNG (bewusst NICHT als eigener Mishap gemeldet, Dedupe):
- Uncommittete Einzelkopie-Arbeit im Worktree fix/flux-artifact-versioning-T002706 und Drift im main-Checkout → gedeckt von T002709 (plan_staged).
- Wiederkehrende Reibung durch committete generierte Artefakte → gedeckt von T002347.

---

#### 15. worktree-create.sh prueft die erste Ticket-ID im Branchnamen, nicht die eigene

_(degraded, scripts/worktree-create.sh)_

`bash scripts/worktree-create.sh fix/restore-t002549-rollback-T002552 …` wurde abgelehnt mit:
  "ERROR: Ticket-ID im Branch-Namen ist kleingeschrieben. Verwende T002549 statt t002549."

Die Branch-eigene ID T002552 stand korrekt grossgeschrieben am Ende; t002549 war nur ein Kontextverweis auf das zurueckgerollte Ticket.

Ursache verifiziert (scripts/worktree-create.sh:226):
  _ticket_id=$(echo "$BRANCH" | grep -oE '[tT][0-9]{6,}' | head -1 || true)

`head -1` nimmt die ERSTE ID im Namen, unabhaengig davon, ob sie die des Branches ist. Der Fehlertext benennt dadurch die falsche ID als Problem und fuehrt in die Irre — er verlangt T002549 dort, wo T002552 gemeint ist.

Kein Schaden, umgangen durch Umbenennen auf fix/restore-rollback-T002552. Sinnvoll waere, die letzte statt der ersten ID zu nehmen (Konvention: die eigene ID steht am Ende) oder mehrere IDs zu tolerieren, solange mindestens eine korrekt geschrieben ist.

---

#### 16. worktree-create.sh: lokale Aenderungen an Dateien im FF-Bereich gehen beim main-Sync still verloren

_(degraded, scripts/worktree-create.sh)_

BEOBACHTUNG (2026-08-08, dev-flow-plan fuer T002729)
Vor dem Aufruf standen im Haupt-Checkout drei uncommittete Aenderungen:
  M scripts/llm/loadouts.json
  D tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts
  M website/src/data/test-inventory.json

scripts/worktree-create.sh meldete "local main synced to origin/main" und fuehrte dabei einen
Fast-Forward von ba0040c8c auf 11969ff50 aus (4 Commits). Danach:
  M scripts/llm/loadouts.json          -> ueberlebt
  tests/e2e/specs/fa-59-...spec.ts     -> Loeschung rueckgaengig, Datei wieder auf Platte (23:04)
  website/src/data/test-inventory.json -> Aenderung verworfen
`git stash list` ist leer, es liegt also kein Stash zur Wiederherstellung bereit.

MUSTER
Genau die beiden Dateien verschwanden, die im FF-Bereich ebenfalls geaendert wurden:
`git diff --stat ba0040c8c 11969ff50 -- website/src/data/test-inventory.json` meldet
+30 Zeilen aus 8a0e518f2 (#3856) und 2dbaef3b5 (#3867). loadouts.json war im FF-Bereich
nicht betroffen und blieb erhalten. Die Vermutung ist daher, dass der Stash-Pop bei
Kollision zugunsten des Remote-Stands aufloest, statt abzubrechen.

WARUM DAS ZAEHLT
Das Skript besitzt einen Stash-Mechanismus (_needs_pop / _wc_stash_pop_or_warn, Zeile 177),
der genau diesen Fall abdecken soll. Wer ihn kennt, verlaesst sich darauf und committet
vorher nicht. Der Verlust ist still: die Zusammenfassungszeile meldet Erfolg
("local main synced to origin/main"), und ohne Stash-Eintrag gibt es keinen offensichtlichen
Wiederherstellungspfad.

Erschwerend: der Sync laeuft, obwohl der Aufrufer nur einen Worktree anlegen wollte. In
dieser Session war ausdruecklich angekuendigt, main NICHT zu bewegen, weil fremde
uncommittete Arbeit im Baum lag — das Skript tat es intern trotzdem.

EINSCHRAENKUNG DER BEOBACHTUNG
Die Skriptausgabe wurde mit `tail -15` abgeschnitten. Eine Warnung aus
_wc_stash_pop_or_warn koennte weiter oben gestanden haben und uebersehen worden sein. Der
Datenverlust selbst ist unabhaengig davon belegt (git status vorher/nachher, leere
stash list).

SCHADEN IM KONKRETEN FALL: gering. test-inventory.json ist ein generiertes Artefakt
(`task test:inventory`), und die rueckgaengig gemachte Spec-Loeschung stellt den
origin/main-Stand wieder her. Der Pfad selbst ist aber allgemein und trifft beim
naechsten Mal handgeschriebenen Code.

VORSCHLAG ZUR PRUEFUNG
Entweder fail-closed abbrechen, wenn der Arbeitsbaum schmutzig ist und der FF-Bereich
dieselben Dateien beruehrt, oder den Konflikt beim Pop stehen lassen statt aufzuloesen —
in beiden Faellen mit einer Meldung, die den Sync als das benennt, was er ist.

---

#### 17. worktree-write-guard erfasst keine Bash-Schreibzugriffe

_(degraded, scripts/hooks/worktree-write-guard.sh)_

scripts/hooks/worktree-write-guard.sh blockierte einen Edit auf einen fremd geclaimten Worktree korrekt. Ein `cat >> datei` im selben Worktree lief unmittelbar davor ungehindert durch — in einem zweiten, ebenfalls geclaimten Worktree wurde dadurch committet UND gepusht, bevor der Lock ueberhaupt sichtbar wurde.

Ursache belegt: der Hook zieht den Zielpfad aus `file_path`/`notebook_path` der Tool-Eingabe (Zeile 48-49). Bash-Aufrufe haben kein solches Feld, fallen also durch. Der Guard schuetzt damit genau den Pfad, den ein disziplinierter Agent ohnehin nimmt, und nicht den, ueber den die Umgehung faktisch passiert.

Verifiziert: `grep -c worktree-write-guard .githooks/pre-commit` = 0 — der Guard ist dort NICHT verankert, der Vorschlag ist also noch offen.

Vorschlag: Aufruf im pre-commit-Hook ergaenzen (dort ist er werkzeugunabhaengig und faengt auch Bash-Schreibzugriffe ab), oder mindestens im Hook-Kopf dokumentieren, dass Bash ungeprueft bleibt — derzeit liest sich der Guard wie ein vollstaendiger Schutz.

---

#### 18. Doku-Drift: ticket_links traegt 340+ PR-Selbstkanten, Skill-Referenz schliesst das aus

_(drift, skills/references/ticket-ops-procedures)_

KORREKTUR EINER EIGENEN FEHLBEOBACHTUNG — beim Verifizieren widerlegt, deshalb umklassifiziert statt gemeldet wie urspruenglich notiert.

Beobachtet: tickets.ticket_links enthaelt Kanten mit from_id = to_id und kind='pr'. Zuerst als Datenmuell fuer zwei Tickets notiert. Die Gegenpruefung (`WHERE f.id = l.to_id`) zeigt: es sind ueber 340 solcher Zeilen, durchgehend seit T000099. Das ist also das REGULAERE Muster, wie eine PR-Verknuepfung am Ticket vermerkt wird — kein Fehler.

DER EIGENTLICHE BEFUND ist eine Doku-Diskrepanz: `.claude/skills/references/ticket-ops-procedures.md` sagt woertlich "Never use ticket_links for PR references — it is ticket→ticket only", und der ticket-ops-Skill-Body wiederholt "ticket_links ist ticket→ticket, **nie** fuer PR-Referenzen". Die gelebte Praxis widerspricht dem seit hunderten Zeilen.

WIRKUNG: gering, aber irrefuehrend. Wer die Doku liest und die Tabelle sieht, haelt den Bestand fuer korrupt und koennte "aufraeumen". Fuer den Phase-3-Graphenaufbau ist es folgenlos, weil dort auf kind IN ('blocks','blocked_by') gefiltert wird.

VORSCHLAG: Doku an die Praxis angleichen — kind='pr' als legitime Selbstkante beschreiben und klarstellen, dass fuer Abhaengigkeitsgraphen nur blocks/blocked_by zaehlen. Alternativ die Praxis aendern, was aber 340+ Zeilen migrieren hiesse und keinen erkennbaren Nutzen haette.

---

#### 19. G-AGENTIC07 auf main rot: ein verwaister aktiver Skill ohne Referenzquelle

_(drift, skills/OVERVIEW.md)_

`bash scripts/health-goals-check.sh` meldet auf `main` `🔴 G-AGENTIC07 1 (Ziel =0)` — „Verwaiste aktive Skills (keine Referenzquelle, nur getrackte)".

Verifiziert: sowohl im Hauptcheckout auf altem main-Stand als auch im Chore-Worktree derselbe Wert 1, unverändert vor und nach dem Vendoring von `unsloth-buddy` (das Gate blieb bei 1, der neue Skill ist über den Vendor-Block in `.claude/skills/OVERVIEW.md` referenziert). Bestandsbefund, nicht durch T002590 verursacht.

Zum Vergleich: das benachbarte G-AGENTIC06 (Skill-Zähler 28 behauptet vs. 29 real getrackte SKILL.md) war ebenfalls seit längerem rot und wurde in PR #3716 nebenbei mitkorrigiert (Zähler jetzt 30, Gate grün). G-AGENTIC07 blieb bewusst unangetastet, weil die Ursachenanalyse — welcher Skill ist verwaist und soll er entfernt oder referenziert werden — außerhalb der Chore lag.

---

#### 20. dev-flow-plan Fix-Pfad: stage-plan (Schritt 4.5) steht vor Commit (Schritt 5), ist so aber nicht ausfuehrbar

_(drift, skills/dev-flow-plan)_

Beobachtet bei T002595.

Die Schrittfolge des Fix-Pfads in .claude/skills/references/dev-flow-plan-phases.md lautet:
  Schritt 4.5: Plan stagen (ticket.sh stage-plan ...)
  Schritt 5:   Commit & Push

In dieser Reihenfolge ausgefuehrt bricht Schritt 4.5 ab:
  ERROR: Plan file 'openspec/changes/<slug>/tasks.md' does not exist on branch
  '<branch>' or in HEAD.
  Die Datei muss committed sein, bevor stage-plan sie referenzieren kann.

stage-plan liest die Plandatei aus dem Commit, nicht aus dem Arbeitsbaum. Die dokumentierte Reihenfolge ist daher nicht durchfuehrbar; korrekt ist commit -> push -> stage-plan.

Bemerkenswert: der Fehler ist gutartig (klare Meldung, exit 0, kein Datenverlust) und kostet nur einen Durchlauf. Er trifft aber jeden, der den Fix-Pfad wortgetreu abarbeitet, und ist in der SKILL.md-Fassung des Feature-Pfads ebenfalls in dieser Reihenfolge notiert (dort Schritt 4.5 vor Schritt 5).

Moegliche Richtung (nicht umgesetzt): die beiden Schritte in dev-flow-plan-phases.md und dev-flow-plan/SKILL.md tauschen, oder in Schritt 4.5 den Hinweis ergaenzen, dass der Plan-Commit vorausgehen muss.

---

#### 21. "behind N" gegen den eigenen Feature-Remote ist kein Beleg fuer fehlende Arbeit

_(process, skills/ticket-ops)_

EIGENER MESSFEHLER, dokumentiert damit er nicht wiederkehrt.

`git status -sb` meldete fuer fix/bge-embed-routing-T002570: "ahead 22, behind 3". Ich las das als fehlende Arbeit und gab es als Auftragspraemisse an einen Subagenten weiter ("die 3 fehlenden Commits einholen"). Der Subagent pruefte nach und widerlegte es: die 3 Commits auf dem Remote waren stale Vor-Rebase-Duplikate mit IDENTISCHEN patch-ids zu bereits lokal vorhandenen Commits, und `merge-base HEAD origin/main == origin/main`. Ein Merge haette doppelte Commits erzeugt. Richtige Aufloesung war ein --force-with-lease-Push.

WIRKUNG: Eine falsche Praemisse im Agent-Prompt haette ohne die Gegenpruefung des Subagenten zu einer verdoppelten Historie gefuehrt. Der Subagent hat die Anweisung korrekt in Frage gestellt, statt sie auszufuehren.

LEHRE: "behind N" gegenueber dem Remote des EIGENEN Feature-Branch (nicht gegenueber main) entsteht regelmaessig nach einem lokalen Rebase und bedeutet dann gerade NICHT fehlende Arbeit. Vor dem Einholen pruefen: `git patch-id` auf beide Seiten bzw. `git merge-base HEAD origin/main`. Nur wenn merge-base VOR origin/main liegt, fehlt wirklich etwas.

VORSCHLAG: In die Verifikations-Referenz aufnehmen — die Formulierung "X behind" ist im Repo-Alltag haeufig und wird verlaesslich falsch gelesen.

---

#### 22. Subagent-Abbruch: letzte Ausgabezeile suggerierte Fortschritt, Dateien waren leer

_(process, skills/ticket-ops)_

Ein Planungs-Subagent brach an einem API-Stream-Stall ab ("Response stalled mid-stream"). Seine letzte Ausgabezeile lautete "Now generating the frozen batch manifest" und las sich, als sei die Analyse abgeschlossen und nur die Ausgabe offen.

TATSAECHLICHER ZUSTAND nach dem Abbruch (gemessen, nicht angenommen): proposal.md 73 Bytes mit leeren "## Why"/"## What"-Abschnitten, tasks.md nur mit dem Template-Platzhalter "<author fills this in — list of new/changed files>", specs/-Delta 135 Bytes Skelett, nichts committed, alles untracked. Die gesamte Analyse war verloren.

WIRKUNG: Haette ich den Bericht des Agenten fuer bare Muenze genommen, waere ein leeres Skelett als fertiger Plan durchgegangen. Beim Fortsetzen musste dem Agenten der gemessene Dateizustand ausdruecklich mitgegeben werden ("verlass dich nicht auf deine Erinnerung") — ein wieder aufgenommener Agent haelt seinen abgebrochenen Kontext sonst fuer gueltigen Fortschritt.

LEHRE fuer alle Runbook-Skills, die Subagenten dispatchen: Nach JEDEM failed-Notification den Arbeitsstand auf der Platte MESSEN (git log, git status, Dateigroessen), bevor der Agent fortgesetzt oder sein Ergebnis bewertet wird. Die letzte Ausgabezeile eines abgebrochenen Agenten ist kein Fortschrittsbeleg.

ZUSATZ: Ein per SendMessage fortgesetzter Agent behaelt seinen Kontext — das ist bei Transport-Fehlern (Stream-Stall) die richtige Wahl gegenueber einem Neustart. Bei einem vom Nutzer GESTOPPTEN Agenten ist die Fortsetzung dagegen gesperrt ("was stopped by the user and won't be resumed"); dort muss ein neuer Agent mit dem gemessenen Stand gebrieft werden.

---

#### 23. dev-flow-e2e empfiehlt test/*-Branch, pre-commit verlangt feature/fix/chore/docs + T######

_(process, skills/dev-flow-e2e)_

dev-flow-e2e SKILL.md Schritt "AUSSTIEG" empfiehlt "test/*-Branch". Der pre-commit-Hook des Repos lehnt test/* ab: "kein gueltiges Typ-Praefix. Erlaubt: feature/ fix/ chore/ docs/", zusätzlich zwingend Ticket-ID im Branch (T002600 statt t002600). Erster Commit wurde blockiert; Workaround: Ticket angelegt (T002600) + Branch auf chore/fa-58-admin-cockpit-e2e-T002600 umbenannt. Friction: Skill-Doku divergiert von Repo-Hook — SSOT (dev-flow-e2e SKILL.md AUSSTIEG) sollte auf die Branch-Konvention des git-workflow-Skills zeigen.

---

#### 24. mishap-tracker erzeugt Duplikat-Incident zu einem bereits gestagten Plan

_(process, skills/mishap-tracker)_

Ich meldete die kaputten Ziele G-LLM01/G-LLM02 mit `type=broken` an `report_mishap`. Der Tracker legte daraufhin sofort das Incident-Ticket T002583 an (`needs_human`, `hoch`, `major`).

Der Fix war zu diesem Zeitpunkt BEREITS GEPLANT: der T002442-Plan (gestaged auf `chore/zielfamilie-llm-stack-T002442`, Commit 492e0cf41, Task 4) ersetzt den Messblock beider Ziele durch `scripts/lib/llm-stack-measure.sh` und deckt alle vier gemeldeten Defekte ab. T002583 war also ein Duplikat zu einem Vorgang, der wenige Minuten zuvor in derselben Sitzung gestagt wurde.

URSACHE: Der `incident`/`broken`/`security`-Pfad umgeht den Buffer und legt sofort ein Ticket an — ohne Abgleich gegen bestehende Tickets oder gestagte Pläne. Der Dedupe-Guard des ticket-ops-Skills greift nur beim Intake neuer Ticketzeilen, nicht bei diesem Pfad.

AUFLOESUNG im konkreten Fall: `T002442 --[fixes]--> T002583` verknuepft, T002583 auf `blocked` gesetzt und sein Scope per Kommentar auf den verbleibenden eigenstaendigen Rest reduziert (systematischer Audit aller 21 Zielfamilien auf dieselbe Fehlerklasse). Das Ticket bleibt also sinnvoll, aber nur weil es einen Rest gab — ohne den waere es reiner Muell gewesen.

VORSCHLAG: Vor dem Anlegen eines Incident-Tickets die offenen Tickets und die gestagten Plaene (`openspec/changes/*/tasks.md`, `ticket_plans`) auf die betroffene Komponente pruefen. Mindestens: die eigene Meldung mit einem Hinweis versehen, wenn ein Ticket mit ueberlappender Komponente in `plan_staged` steht.

EIGENANTEIL: Ich haette vor dem `report_mishap`-Aufruf pruefen koennen, dass ich denselben Defekt gerade selbst habe einplanen lassen — der Agent hatte ihn in seinem Bericht genannt. Der Tracker macht es einem aber auch nicht leicht: `type=broken` fuehlt sich fuer einen echten Defekt richtig an, und dass diese Wahl den Dedupe umgeht, steht nicht im Aufrufpfad.

---

#### 25. agent-lock list zeigt Lock mit "--label" als Scope-Wert (Argument-Parsing)

_(suspicious, scripts/agent-lock.sh)_

`bash scripts/agent-lock.sh list` gibt aus:

  SCOPE          ID                       TOOL     SID        STATE  LABEL
  --label        devflow-T002569          claude   263874bd-193f-419e-88f7-f10deb99ca08 live

Das Flag `--label` wurde als Scope-POSITIONSARGUMENT gelesen, der eigentliche Label-Wert ("devflow-T002569") landete im ID-Feld. Der Aufrufer hat vermutlich `claim --label devflow-T002569 ...` ohne vorangehende scope/id-Positionsargumente aufgerufen, und cmd_claim nimmt $1/$2 ungeprueft als scope/id.

WIRKUNG: Der Lock ist ueber `check ticket T002569` NICHT auffindbar — er haengt an einem Phantom-Scope. Eine Session, die den regulaeren Pre-Check faehrt, sieht das Ticket als frei und koennte parallel darauf zugreifen. Das ist genau die Luecke, die T002498-M6 fuer den branch-Scope beschreibt, hier aber durch einen Parsing-Fehler statt durch Scope-Wahl entsteht.

VERIFIZIERT 2026-08-02: Ausgabe oben reproduziert; der Lock gehoert einer fremden Session (nicht meiner SID) und wurde deshalb nicht angefasst.

VORSCHLAG: cmd_claim sollte ablehnen, wenn das Scope-Argument mit "-" beginnt — ein Scope ist immer eines aus {ticket, branch, worktree, ...}. Eine Allowlist-Pruefung auf $1 faengt den ganzen Fehlerfall ab.

---

#### 26. branch-reaper.sh erzwingt --ticket auch im reinen --dry-run-Inventarlauf

_(suspicious, scripts/branch-reaper.sh)_

VERIFIZIERT (2026-08-02, repo-hygiene-Lauf): `bash scripts/branch-reaper.sh --dry-run` endet mit "FEHLER: --ticket ist erforderlich (Format T######)".

WARUM DAS STOERT: Die SSOT-Referenz repo-hygiene-ops.md §2 fuehrt den Reaper unter "Verwaiste Remote-Branches (ohne PR)" als das Werkzeug ein, das genau jene Faelle abdeckt, die --merged und [gone] nicht erfassen — und nennt den Dry-Run ausdruecklich "manuell zum Nachsehen". Beim Housekeeping ist der Ticketbezug aber gerade das Unbekannte: man hat eine Liste verwaister Branches und sucht zu jedem das Ticket. Die Kandidatenauswahl im Skript laeuft ueber `grep -i -- "$TICKET_ID"` gegen die Remote-Branch-Namen (Zeile 119-125), setzt die gesuchte Antwort also als Eingabe voraus.

FOLGE IM HEUTIGEN LAUF: Der Inventarschritt musste von Hand nachgebaut werden (git for-each-ref + gh pr list + Blob-Vergleich pro Branch) — also genau die Logik, die im Skript bereits steht und dort besser geprueft ist. Der handgebaute Nachbau traf dabei prompt den Merge-Base-Defekt aus dem Schwester-Mishap.

VORSCHLAG: Einen ticketlosen Inventarmodus ergaenzen (z.B. `--all --dry-run`), der ueber alle Remote-Branches iteriert und pro Branch REAP/KEEP mit Begruendung ausgibt, ohne zu loeschen. Die Ticket-Aufloesung kann dabei aus dem Branch-Namen abgeleitet werden (dieselbe T[0-9]{6}-Extraktion, die repo-hygiene-ops.md §3 fuer PRs beschreibt); Branches ohne ableitbare ID werden als KEEP mit Begruendung "keine Ticket-ID im Namen" gemeldet. Loeschen bleibt an --ticket gebunden.

---

#### 27. browser.newContext() im storageState-Projekt lieferte authentifizierten Kontext

_(suspicious, tests/e2e)_

In fa-58-admin-cockpit.spec.ts T20 (mentolder-Projekt mit use.storageState) sollte browser.newContext({ ignoreHTTPSErrors: true }) einen unauthentifizierten Kontext ergeben. Der Test schlug fehl: page.url() blieb auf /admin/cockpit (authentifizierte Seite). curl bestätigt unauthentifiziert → 302 nach /login. Workaround: playwright.request.newContext({ storageState: { cookies: [], origins: [] } }) + maxRedirects:0 → erwartetes 302. Ursache unklar — vermutlich StorageState-Vererbung über die Browser-Instanz bei manuell erzeugten Kontexten in Playwright Test 1.61.

---

#### 28. devflow-ci-watch meldet "Keine CI-Checks gefunden", nachdem es zehn gruene Checks gelistet hat

_(suspicious, scripts/devflow-ci-watch.sh)_

Bei PR #3843 (T002704) endete scripts/devflow-ci-watch.sh mit Exit 5 und der Meldung "⚠ Keine CI-Checks gefunden (total_count=0) — CI wurde nie gestartet oder laeuft noch." — unmittelbar NACHDEM dieselbe Ausgabe zehn Checks mit Status "pass" aufgelistet hatte.

Ursache ist eine voruebergehend leere API-Antwort: ein direkt danach abgesetztes 'gh pr view --json statusCheckRollup' lieferte 'null' statt der Liste. GitHub berechnet das Rollup zeitweise neu; die Checks waren nicht verschwunden.

Das ist genau die Verwechslung, gegen die die Konvention aus T002498-M5 geschrieben wurde: die auswertende Logik muss eine LEERE Antwort von einer NEGATIVEN unterscheiden. Hier fuehrt total_count=0 zu der Aussage "CI wurde nie gestartet", was in diesem Fall nachweislich falsch war — und die Meldung ist zusaetzlich irrefuehrend, weil sie zwei sich ausschliessende Deutungen ("nie gestartet ODER laeuft noch") in einem Satz anbietet und daraus einen Fehler-Exit macht.

Der eigentliche Merge-Blocker war ein anderer und wurde von der Meldung verdeckt: mergeStateStatus=DIRTY / mergeable=CONFLICTING. Lokal rebaste der Branch konfliktfrei — das bekannte merge=ours-Phantommuster. Wer der Skriptmeldung glaubt, sucht den Fehler in der CI statt im Merge-Status.

Vorschlag: bei total_count=0 nicht urteilen, sondern erneut abfragen und erst nach mehreren leeren Antworten in Folge eskalieren — und die Meldung um den aktuellen mergeStateStatus ergaenzen.

---

#### 29. mcp-sync-Guard meldet auf veralteter Branch-Basis roten Drift, der lokal nicht existiert

_(suspicious, scripts/mcp-sync.sh)_

Beobachtet 2026-08-03 an PR #3723 (chore/toolset-divergenzen-T002596).

CI rot: "Factory spec shard 4" → `not ok 36 mcp-sync.sh check stays green — headers are generated, not hand-edited`, Diff-Ausgabe "1,49d0" gegen .mcp.json. Im zugehoerigen Worktree meldete `bash scripts/mcp-sync.sh check` jedoch 4x OK (.mcp.json, .opencode/opencode.jsonc, mcp_config.json, scripts/llm/mcp-servers.json).

Der PR aenderte .mcp.json ueberhaupt nicht (Diff: .claude/settings.json, AGENTS.md, CLAUDE.md, toolset-map.md, capabilities.yaml). Tatsaechliche Ursache war reine Branch-Staleness — die Basis lag 9 Commits hinter main. Nach `gh api --method PUT repos/.../pulls/3723/update-branch` lief CI durch und Auto-Merge feuerte (mergedAt 2026-08-03T04:01:16Z).

Reibung: weder das Job-Log noch mergeStateStatus=BLOCKED unterschieden "echter Registry-Drift" von "Basis veraltet". Die Fehlausgabe zeigt einen kompletten .mcp.json-Inhalt als geloescht und liest sich wie ein realer Drift; die Diagnose kostete drei Log-Abrufe plus einen lokalen Gegencheck. Ein Hinweis im Guard-Fehlertext ("Basis vs. origin/main pruefen") oder ein vorgelagerter Staleness-Check im CI wuerde diesen Umweg sparen.

---

#### 30. test:spec:changed uebersieht staged-aber-uncommittete Tests und meldet "No matching spec tests"

_(suspicious, scripts/find-changed-tests.sh)_

Beobachtet bei T002593. Nach `git add` einer NEUEN Datei tests/spec/dev-flow-plan/plan-lint-task-count.bats (10 Tests) meldete `task test:spec:changed`: "No matching spec tests for this diff" — und lief exit 0 durch.

Ursache (verifiziert): scripts/find-changed-tests.sh:17 baut die Dateiliste aus
  git diff --name-only HEAD origin/main
Das vergleicht COMMITS, nicht den Index. Staged-aber-uncommittete Dateien sind darin nicht enthalten.

Warum das mehr ist als eine Reihenfolge-Frage: der Verify-Block (references/verification-block.md) sieht `task test:spec:changed` VOR dem Commit vor, und die Meldung ist positiv formuliert ("No matching spec tests for this diff") statt als Warnung. Sie liest sich damit wie eine Aussage ueber die CI-Abdeckung ("meine neuen Tests laufen auf keinem PR" — vgl. den bekannten Fall aus pr-testabdeckung-unterverzeichnisse) statt wie "du hast noch nicht committed". Nach dem Commit lief dieselbe Suite mit 110/110 gruen, die neuen Tests darunter.

Moegliche Richtungen (nicht umgesetzt):
- Die Diff-Basis um den Index erweitern (`git diff --name-only HEAD` erfasst unstaged, `--cached` den Index) oder
- die Meldung um einen Hinweis ergaenzen, wenn `git diff --cached --name-only` Testdateien enthaelt, die in der Auswahl fehlen.

Kein Datenverlust, kein CI-Risiko — CI selbst arbeitet immer gegen Commits und ist korrekt.

---

#### 31. ticket.sh list --status <unbekannt> liefert still [] statt eines Fehlers

_(suspicious, scripts/ticket.sh)_

Beobachtet bei T002595, mit Folgeschaden.

`./scripts/ticket.sh list --status open` liefert `[]`. "open" ist kein gueltiger Status-Wert (gueltig sind triage, backlog, plan_staged, done, ...). Statt den unbekannten Filterwert abzulehnen, gibt der Befehl eine leere Liste zurueck.

Folgeschaden (real eingetreten): Die Duplikatssuche vor dem Anlegen eines Bug-Tickets lief mit genau diesem Aufruf. Die leere Antwort las sich als "es gibt kein passendes Ticket", woraufhin T002594 (bge-embed OOMKilled) angelegt wurde - ein Duplikat des seit 2026-08-02 bestehenden T002580, das auf status=backlog steht und deshalb aus dem Filter fiel. T002594 musste als resolution=duplicate wieder geschlossen werden. Eine fremde Session arbeitete zu dem Zeitpunkt bereits auf fix/bge-embed-oom-T002580.

Warum das mehr ist als ein Tippfehler: eine leere Liste ist ein legitimes Ergebnis. Der Aufrufer kann "kein Treffer" nicht von "Filter ungueltig" unterscheiden. Bei einer Duplikatssuche ist das die gefaehrlichste Verwechslung, weil beide Faelle zur selben falschen Handlung fuehren (neues Ticket anlegen).

Moegliche Richtung (nicht umgesetzt): unbekannte --status-Werte gegen die Enum pruefen und mit exit != 0 plus Auflistung der gueltigen Werte ablehnen. Analog fuer andere Filter-Flags mit Enum-Domaene.
Watchdog: pipeline stale > 30min (no phase progress write, class=INFRA). Returned to queue (triage); slot released. [INFRA 1/3 | tier=haiku]
### Mishap-Rollup — 10 Eintraege (2026-08-09 03:52 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | drift | scripts/plan-lint.sh | plan-lint W3 zaehlt einen in der Prosa erwaehnten Pfad als gelistete Datei |
| 2 | drift | skills/openspec-flow-plan, skills/openspec-propose | Delta-Spec-Header-Format in openspec-flow-plan/openspec-propose nicht explizit dokumentiert |
| 3 | suspicious | scripts/agent-lock.sh | Agent-Lock auto-reset blockiert Branch-Wechsel im main-Checkout |
| 4 | drift | tests/lib/factory-test-fixtures.sh | seed_test_feature dokumentiert TICKET_TEST_DB_OK nicht — Fehlschlag liest sich als fehlender DB-Pod |
| 5 | process | scripts/worktree-create.sh | worktree-create.sh: refactor-Präfix nicht in Branch-Allowlist (nur feature/fix/chore/docs) |
| 6 | suspicious | tests/spec/ticket-system | Pre-existing T002732 backfill-id-sequence test failures (3 tests) sichtbar in test:changed |
| 7 | degraded | skills/openspec-archive-change | Plan archiviert, Deliverable nie gemergt — archivierter Change ohne seine Implementierung auf main |
| 8 | drift | repo/githooks | Zwei Commit-Message-Validatoren mit unterschiedlichem Scope-Vokabular |
| 9 | suspicious | skills/git-workflow | Abgelehnter Commit gefolgt von erfolgreichem Push sieht aus wie ein erfolgreicher Push |
| 10 | degraded | skills/dev-flow-plan | Gestagter, nie implementierter Plan stand als roter PR in der Queue |

**1. plan-lint W3 zaehlt einen in der Prosa erwaehnten Pfad als gelistete Datei** (drift, scripts/plan-lint.sh)

BEOBACHTUNG (Planungslauf T002783, 2026-08-09)

Der Plan enthielt unterhalb der File-Structure-Tabelle einen Fliesstext-Satz:

    Positiv-Kontrolle: `scripts/agent-lock.sh` gibt unter demselben Aufruf 265 zurueck,
    der Messpfad funktioniert also.

Der Linter meldete daraufhin:

    ⚠ W3: `scripts/agent-lock.sh` is listed in File Structure but no task references it
    PLAN-LINT: PASS (0 hard, 1 warn)

Die Datei stand NICHT in der Tabelle. Sie war Beleg dafuer, dass der residual_budget-Pfad
ueberhaupt misst — genau die Gegenprobe, die die Konvention "leere Antwort ist kein Urteil"
verlangt, wenn zwei Zieldateien ein leeres Budget liefern. W3 scheint jeden
Backtick-Pfad im Abschnitt als Tabelleneintrag zu lesen, statt nur die Tabellenzeilen.

FOLGE: gering, aber in eine unerwuenschte Richtung. Die Warnung verschwand erst, als ich
den Pfad aus dem Satz entfernte ("ein gemessenes Shell-Skript (agent-lock)"). Der Linter
draengt damit dazu, Belege UNSPEZIFISCHER zu formulieren — waehrend derselbe Regelsatz an
anderer Stelle konkrete, nachpruefbare Angaben verlangt. Wer die Warnung schnell loswerden
will, loescht eher den Beleg als ihn zu praezisieren.

NICHT GEPRUEFT: ob W3 nur Backtick-Pfade im Umfeld der Tabelle erfasst oder im ganzen
Dokument, und ob dieselbe Verwechslung auch B1a/B1b betrifft. Das waere der erste Schritt
einer Umsetzung.

TEST (Output-Verifikation, T002448-M4): plan-lint.sh gegen einen Plan AUSFUEHREN, dessen
File-Structure-Tabelle Datei A listet und dessen Prosa Datei B in Backticks erwaehnt,
wobei B von keiner Task referenziert wird. Erwartung: keine W3-Warnung zu B. Positiv-Anker
(T002356-M1): im selben Test ein tatsaechlich in der TABELLE gelistetes, unreferenziertes
A verwenden und zeigen, dass W3 dafuer sehr wohl anschlaegt — sonst besteht der Test auch
bei einem Linter, der W3 gar nicht mehr auswertet.
**2. Delta-Spec-Header-Format in openspec-flow-plan/openspec-propose nicht explizit dokumentiert** (drift, skills/openspec-flow-plan, skills/openspec-propose)

Fünf Mishap-Fix-PRs (#3905-#3909) waren alle durch CI blockiert, weil ihre Delta-Spec-Dateien nicht dem validierten Format entsprachen:

1. `## ADDED:` / `## MODIFIED:` statt `## ADDED Requirements` / `## MODIFIED Requirements` (ohne "Requirements" im Header)
2. Keine `#### Scenario:`-Blöcke unter den `### Requirement:`-Blöcken

Der CI-Check `scripts/openspec-validate.test.ts` → `validateTree` verlangt exakt das Pattern `## (ADDED|MODIFIED|REMOVED|RENAMED) Requirements` und mindestens einen `#### Scenario:`-Block pro Requirement.

Root Cause: Die `openspec-flow-plan` und `openspec-propose` Skills dokumentierten das Pflicht-Format nicht explizit genug — `openspec-propose` nannte zwar `## ADDED Requirements` aber nicht den Scenario-Zwang; `openspec-flow-plan` verwies nur auf die T001304-Delta-Konvention ohne Format-Details.

Fix: PR #3910 ergänzt beide Skills um explizite Format-Vorgaben inkl. der vier gültigen Header-Varianten, dem Requirement→Scenario-Pattern und dem Hinweis auf die CI-Blockade.
**3. Agent-Lock auto-reset blockiert Branch-Wechsel im main-Checkout** (suspicious, scripts/agent-lock.sh)

Beim ticket-ops-Durchlauf am 2026-08-09: Beim Versuch, von `fix/openspec-flow-plan-delta-header-format` auf `main` zu wechseln, setzte AGENT-LOCK den Checkout wiederholt auf den alten Branch zurück.

Beobachtete Meldung (mehrfach): `AGENT-LOCK: main-Checkout auf 'fix/openspec-flow-plan-delta-header-format' zurückgesetzt (Lock-Halter aktiv)`.

Dies passierte trotz `git checkout -B fix/delta-spec-header-doc-T002772 origin/main` — der Lock-Mechanismus überschrieb den Branch-Wechsel.

Workaround: `git worktree add` umging das Problem; der Commit für PR #3910 wurde im isolierten Worktree durchgeführt.
**4. seed_test_feature dokumentiert TICKET_TEST_DB_OK nicht — Fehlschlag liest sich als fehlender DB-Pod** (drift, tests/lib/factory-test-fixtures.sh)

BEOBACHTUNG (Planungslauf T002781, 2026-08-09)

Ein neuer BATS-Test rief seed_test_feature "mentolder" auf. Ergebnis:

    ERROR: no shared-db pod found in namespace workspace
           (context bats-no-cluster-t002224)

Die Meldung liest sich wie ein Infrastrukturproblem — kein Pod, Cluster weg. Tatsaechlich
lief der Cluster, und derselbe kubectl-Aufruf mit --context k3d-mentolder-dev fand den Pod
sofort. Der Kontext bats-no-cluster-t002224 ist ein ABSICHTLICHER Sentinel aus
scripts/vda/ticket/_ticket-core.sh:31: unter BATS zeigt ticket.sh bewusst ins Leere, damit
Tests keine echten Ticketzeilen schreiben. Der Kommentar dort ist ausfuehrlich und nennt den
Anlass — rund 130 Geisterzeilen zwischen dem 2026-07-03 und dem 2026-07-26. Das Opt-in
heisst TICKET_TEST_DB_OK=1.

DER DEFEKT IST NICHT DER SCHUTZ, SONDERN WO ER DOKUMENTIERT IST

seed_test_feature in tests/lib/factory-test-fixtures.sh ist die Funktion, die ein
Testautor aufruft. Ihr Kopfkommentar lautet vollstaendig:

    # seed_test_feature <brand> [touched_file ...] → echoes the new external_id

Kein Wort zu TICKET_TEST_DB_OK. Die Begruendung steht in _ticket-core.sh — einer Datei,
die der Testautor nicht liest, weil sie zwei Ebenen unter dem aufgerufenen Werkzeug liegt.
Wer den Hinweis nicht kennt, diagnostiziert einen Cluster- oder Namespace-Fehler; genau
das ist hier passiert und hat einen Debug-Zyklus gekostet.

Verschaerfend: die Meldung nennt zwar den Kontextnamen, aber "bats-no-cluster-t002224"
liest sich wie ein verunglueckter Default, nicht wie eine absichtliche Sperre. Ein Hinweis
im Fehlertext ("unter BATS gesperrt — TICKET_TEST_DB_OK=1 zum Opt-in") haette gereicht.

VORSCHLAG (nicht entschieden)
- Den Kopfkommentar von seed_test_feature um die Vorbedingung ergaenzen.
- Oder die Sperre selbst sprechen lassen: wenn CTX der Sentinel ist und _pgpod scheitert,
  eine eigene Meldung ausgeben statt der generischen "no shared-db pod"-Zeile.
Die zweite Variante wirkt an jeder Aufrufstelle, nicht nur an der, die man gerade liest.

TEST (Output-Verifikation, T002448-M4): seed_test_feature unter BATS OHNE
TICKET_TEST_DB_OK AUSFUEHREN und pruefen, dass die Fehlermeldung das Opt-in benennt.
Positiv-Anker (T002356-M1): im selben Test mit gesetztem TICKET_TEST_DB_OK=1 zeigen, dass
der Seed durchlaeuft und eine external_id liefert — sonst besteht der Test auch bei einer
Fixture, die immer fehlschlaegt.
**5. worktree-create.sh: refactor-Präfix nicht in Branch-Allowlist (nur feature/fix/chore/docs)** (process, scripts/worktree-create.sh)

Beim Dispatch von T002627 (type=refactor) wurde der Branch refactor/sdlc-routes-remove-T002627 von worktree-create.sh abgelehnt. Erlaubt sind nur feature/fix/chore/docs. Workaround: feature/ statt refactor/ verwendet. Ticket-Typ "refactor" sollte entweder ein erlaubtes Branch-Präfix bekommen oder beim Anlegen automatisch auf feature/chore normalisiert werden.
**6. Pre-existing T002732 backfill-id-sequence test failures (3 tests) sichtbar in test:changed** (suspicious, tests/spec/ticket-system)

Während test:changed für T002783 liefen 3 Tests in tests/spec/ticket-system/backfill-id-sequence.bats (T002732) rot. Nicht durch T002783 verursacht, aber sie erscheinen in jedem test:changed-Lauf, der ticket.sh-Änderungen enthält, und kosten jedes Mal Diagnosezeit. Sollten entweder gefixt oder als known-flaky markiert werden.
**7. Plan archiviert, Deliverable nie gemergt — archivierter Change ohne seine Implementierung auf main** (degraded, skills/openspec-archive-change)

Beobachtet 2026-08-09 während repo-hygiene. PR #3919 archivierte den Change nach openspec/changes/archive/2026-08-09-fa-59-e2e-spec-positive-assertion und merged das Delta in openspec/specs/e2e-testing.md. Die eigentliche Implementierung von T002730 — die positive Assertion toBe(403) in tests/e2e/specs/fa-59-systemtest-purge-endpoint.spec.ts sowie die beiden BATS-Guards in tests/spec/e2e-testing.bats — lag jedoch ausschliesslich auf dem noch OFFENEN Branch von PR #3914. main trug damit einen als erledigt geltenden, archivierten Change ohne sein Deliverable; die Spec enthielt weiterhin das negative not.toBe(404), das der Change gerade beseitigen sollte.

Verschaerfend: PR #3914 haette in seiner damaligen Fassung den bereits archivierten Change unter openspec/changes/ wieder auferstehen lassen (alle 8 Plan-Dateien als Additions), zusaetzlich mit einer Delta-Spec nach Change-Slug statt Parent-SSOT-Slug benannt.

Der Check aus CLAUDE.md M10 (T002506) beschreibt genau diesen Fall — vor dem Abschluss per git show origin/main:<pfad> belegen, dass die Deliverable-Dateien wirklich auf main liegen. Er lief nicht. Bemerkenswert ist, dass hier keine manuelle Closure vorlag, sondern ein Archive-PR: die M10-Regel ist heute auf manuelle done/shipped-Faelle formuliert und deckt den Archive-Pfad nicht ab.

Behoben im Lauf: #3914 traegt jetzt nur noch das Deliverable, die auferstandene Kopie ist entfernt, PR umbenannt zu fix(e2e-testing). Verifiziert nach Merge: origin/main enthaelt 2x toBe(403) und 3x T002730-Referenzen.
**8. Zwei Commit-Message-Validatoren mit unterschiedlichem Scope-Vokabular** (drift, repo/githooks)

Beobachtet 2026-08-09. `fix(mcp-gateway): …` besteht den PR-Titel-Check "Conventional Commits" (grün auf PR #3918, dessen Titel genau so lautet), wird aber vom lokalen .githooks/commit-msg abgelehnt: "✗ unknown scope 'mcp-gateway' — did you mean 'mcp'?". Dasselbe bei `chore(tickets):`.

Verifiziert: `bash .githooks/commit-msg` gegen eine Testnachricht liefert reproduzierbar die Ablehnung; `bash scripts/validate-commit-msg.sh scopes` fuehrt mcp, plans, ci und test, aber kein mcp-gateway und kein tickets.

Die Folge ist nicht nur Reibung: der PR-Titel ist die naheliegendste Vorlage fuer die Commit-Message auf demselben Branch, und er ist nachweislich gruen. Wer ihn uebernimmt, laeuft in die Ablehnung. Kostete in diesem Lauf zwei verworfene Commits.

Denkbar: dieselbe Scope-Allowlist auch auf den PR-Titel anwenden, oder die Ablehnungsmeldung um den Hinweis ergaenzen, dass der PR-Titel-Check ein anderes Vokabular nutzt.
**9. Abgelehnter Commit gefolgt von erfolgreichem Push sieht aus wie ein erfolgreicher Push** (suspicious, skills/git-workflow)

Beobachtet 2026-08-09, zweimal (PR #3918 und PR #3915). Ablauf: `git commit …` wird vom commit-msg-Hook abgelehnt ("No commit was created — commit-msg hook rejected the message (conventional-commit format check)"), der im selben Kommando nachfolgende `git push` laeuft daraufhin durch und meldet ganz normal "   <alt>..<neu>  HEAD -> <branch>".

Uebertragen wurde in beiden Faellen nur der zuvor erzeugte Merge-Commit — der eigentliche Fix blieb liegen. Die Push-Ausgabe ist von einem erfolgreichen Push nicht zu unterscheiden: sie nennt einen echten SHA-Bereich und einen echten Branch.

Zwei Faktoren verstaerken das: (a) die Ablehnungsmeldung erscheint weit oben in der Ausgabe und wird von der nachfolgenden Hook- und Push-Ausgabe verdraengt; (b) `git push` hat keinen Grund zu scheitern, weil der Branch ja tatsaechlich Commits hat.

Verallgemeinerbar und deshalb notiert: der Erfolg des LETZTEN Kommandos in einer Kette sagt nichts ueber den Erfolg des vorherigen. Konsequenz fuer Runbooks: nach einem Commit den erzeugten SHA per `git log -1 --oneline` pruefen, statt die Push-Ausgabe als Bestaetigung zu lesen — oder commit und push mit && verketten (so macht es scripts/factory/mishap-rollup.sh laut eigenem Skriptkopf bereits bewusst).
**10. Gestagter, nie implementierter Plan stand als roter PR in der Queue** (degraded, skills/dev-flow-plan)

Beobachtet 2026-08-09 an PR #3918 (T002719). Der Branch trug ausschliesslich die Commits "chore: anchor branch" und "chore(plans): add failing test + stage plan" — also den dev-flow-plan-Ausgang, ohne dev-flow-execute. Trotzdem existierte ein offener PR mit dem Titel eines fertigen Fixes ("fix(mcp-gateway): agy headless mcp tool permissions via --dangerously-skip-permissions").

Der PR hatte vier rote Checks. Zwei davon stammten allein daraus, dass die Implementierung nicht committet war: die Delta-Spec openspec/changes/agy-headless-mcp-permissions/specs/mcp-gateway.md existierte im Worktree als UNTRACKED (daher "missing specs/ delta dir" in der OpenSpec-validateTree-Pruefung), und die zugehoerige SSOT-Ergaenzung in openspec/specs/mcp-gateway.md lag dort uncommittet (daher der rote BATS-Guard, der genau dieses Requirement greppt).

Die Arbeit war also getan, nur nie festgeschrieben — im Worktree einer Session, deren PID nicht mehr lief.

Das Problem ist die Lesart von aussen: ein roter PR mit Fix-Titel liest sich als "kaputter Fix, Diagnose noetig", nicht als "Plan gestagt, Implementierung ausstehend". In einer Queue mit mehreren PRs kostet das gezielt Zeit an der falschen Stelle. Denkbar: Plan-only-Branches gar nicht als PR oeffnen, oder als Draft mit erkennbarem Titel-Praefix.
### Mishap-Rollup — 10 Eintraege (2026-08-09 04:24 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | drift | skills/dev-flow-plan | Von dev-flow-plan erzeugter Failing-Test war strukturell CI-untauglich (Drittanbieter-Binary) |
| 2 | suspicious | skills/repo-hygiene | gh pr checks meldet "no checks reported", obwohl Runs für denselben HEAD-SHA existieren |
| 3 | drift | skills/repo-hygiene | CONFLICTING PR unterdrückt CI — Symptom ist von "noch nicht gestartet" nicht unterscheidbar |
| 4 | drift | skills/repo-hygiene | merge=ours-Phantomkonflikt: update-branch antwortet 422, lokaler Merge läuft konfliktfrei |
| 5 | suspicious | scripts/openspec-half-archive-check.sh | Halb archivierter Zustand im Hauptcheckout — uncommittet, vom half-archive-Guard nicht erfasst |
| 6 | drift | openspec/changes | Delta-Spec nach Change-Slug statt Parent-SSOT-Slug benannt — Archivierung wird scheitern (T002666) |
| 7 | suspicious | scripts/agent-lock.sh | agent-lock claim ticket returns exit 0 but lock not held |
| 8 | suspicious | scripts/pre-push hook | Pre-push hook rejects valid push due to stale scope commits from rebased main |
| 9 | degraded | devflow/merge pipeline | PR #3926 went DIRTY/CONFLICTING immediately after creation — rebase needed 3 attempts |
| 10 | process | dev-flow-plan | Planung widersprach einer bestehenden Design-Entscheidung, die erst nach der Nutzerfrage gefunden wurde |

**1. Von dev-flow-plan erzeugter Failing-Test war strukturell CI-untauglich (Drittanbieter-Binary)** (drift, skills/dev-flow-plan)

Beobachtet 2026-08-09 an PR #3918. Der von dev-flow-plan als TDD-Rotphase erzeugte Test tests/spec/mcp-gateway/agy-mcp-permissions.bats enthielt:

    @test "agy binary supports --dangerously-skip-permissions flag" {
      run agy --help
      [ "$status" -eq 0 ]
      ...
    }

`agy` ist ein lokal installiertes Drittanbieter-CLI. Verifiziert: `grep -rn 'agy' .github/workflows/*.yml` liefert 0 Treffer — kein Workflow installiert es. Der Test waere in CI also DAUERHAFT rot gewesen, ohne je eine Aussage ueber das Repository zu treffen; er misst die Ausstattung des Runners, nicht den Zustand des Codes.

Das ist keine Kleinigkeit im Rotphasen-Kontext: ein Test, der aus Umgebungsgruenden nie gruen werden kann, ist von einem Test, der wegen fehlender Implementierung rot ist, in der CI-Ausgabe nicht zu unterscheiden. Die Rotphase verliert damit ihre Aussagekraft.

Behoben im Lauf mit dem im Repo etablierten Muster (tests/spec/sealed-secret-cluster-drift.bats: kein erreichbarer Cluster -> skip):
    command -v agy >/dev/null 2>&1 || skip "agy binary not installed"
Verifiziert in beiden Richtungen: mit agy im PATH laeuft der Test durch, mit PATH=/usr/bin:/bin skippt er sauber.

Denkbar als Konvention: wenn ein geplanter Test ein externes Binary oder einen Dienst voraussetzt, gehoert der Verfuegbarkeits-Guard schon in die Rotphase.
**2. gh pr checks meldet "no checks reported", obwohl Runs für denselben HEAD-SHA existieren** (suspicious, skills/repo-hygiene)

Beobachtet 2026-08-09 an PR #3916. `gh pr checks 3916` antwortete "no checks reported on the 'fix/main-checkout-freshness-cleanup-T002664' branch", und `gh pr view 3916 --json statusCheckRollup` lieferte ein LEERES Array.

Gleichzeitig zeigte `gh run list --branch fix/main-checkout-freshness-cleanup-T002664` fuenf abgeschlossene Runs, darunter einen CI-Run mit conclusion=failure (databaseId 31291991475). Der PR-HEAD (9b4fb48cbdb3ee604c65fc5f8c720dbbe9436a24) war identisch mit dem Remote-Branch-Tip — es lag also kein nachtraeglicher Push vor, der den Rollup entwertet haette.

Die Fehldiagnose, in die das fuehrt: "keine Checks" liest sich als "Workflows noch nicht gestartet / Queue klemmt" und lenkt die Untersuchung auf die Actions-Infrastruktur, waehrend der PR in Wahrheit an zwei konkreten BATS-Tests scheiterte. Gefunden nur, weil zusaetzlich `gh run list` abgefragt wurde.

Konsequenz fuer repo-hygiene §3: eine leere Checkliste ist KEIN Urteil ueber den CI-Zustand — dasselbe Muster, das der Abschnitt bereits fuer mergedAt festhaelt. Bei leerem Rollup immer gegen `gh run list --branch <b>` gegenpruefen, bevor "noch keine Checks" berichtet wird.
**3. CONFLICTING PR unterdrückt CI — Symptom ist von "noch nicht gestartet" nicht unterscheidbar** (drift, skills/repo-hygiene)

Beobachtet 2026-08-09 an PR #3915. Der PR hatte NULL Workflow-Runs (`gh run list --branch fix/ticket-mcp-update-fields-T002714` war komplett leer), weil er mit main konfligierte.

Dass ein CONFLICTING PR die CI unterdrueckt, ist in docs/superpowers/references/gotchas-footguns.md dokumentiert. Sein SYMPTOM ist es nicht: `gh pr checks` liefert exakt dieselbe Meldung "no checks reported on the branch" wie bei einem noch nicht gestarteten Lauf. Ohne einen lokalen Merge-Versuch ist der Konflikt als Ursache nicht erkennbar — und `mergeStateStatus` stand zu dem Zeitpunkt auf UNKNOWN, half also auch nicht.

Der Konflikt selbst war trivial: ein Append-Konflikt in der Commands-Zeile von scripts/ticket.sh (`update-fields` auf dem Branch, `rollup-container` aus main). Aufloesung durch Behalten BEIDER Kommandos, verifiziert nach Merge auf origin/main (5x update-fields, 4x rollup-container).

Vorschlag fuer repo-hygiene §3: bei leerer Checkliste zuerst `mergeStateStatus` pruefen und, falls UNKNOWN oder DIRTY, lokal `git merge origin/main --no-commit` gegen den Branch versuchen — das trennt "Konflikt" von "noch nicht gestartet" eindeutig.
**4. merge=ours-Phantomkonflikt: update-branch antwortet 422, lokaler Merge läuft konfliktfrei** (drift, skills/repo-hygiene)

Beobachtet 2026-08-09 an PR #3915, zweiter Durchgang (nach vier zwischenzeitlichen Merges nach main). GitHub meldete mergeStateStatus=DIRTY, und

    gh api --method PUT repos/Paddione/Bachelorprojekt/pulls/3915/update-branch \
      -f expected_head_sha=<head>

antwortete mit HTTP 422 "merge conflict between base and head".

Lokal war davon nichts zu sehen: `git merge origin/main` in einem frischen Worktree auf denselben Branch lief glatt durch, `git diff --name-only --diff-filter=U` blieb LEER. Ursache ist der dokumentierte merge=ours-Effekt — die Freshness-Generate (website/src/data/openspec-status.json, test-inventory.json) tragen in .gitattributes einen Custom-Merge-Driver, den GitHub nicht ausfuehrt.

Bestaetigung eines bekannten Gotchas, hier mit einem Zusatz, der die Diagnose beschleunigt haette: der REST-Fallback aus repo-hygiene-ops ("PR-Branch auf main nachziehen") HILFT IN DIESEM FALL NICHT — er scheitert an genau demselben Phantomkonflikt mit 422. Der Abschnitt liest sich heute so, als sei update-branch der Weg und der lokale Merge nur die Nachbereitung. Tatsaechlich ist bei merge=ours-Konflikten der lokale Merge der EINZIGE Weg: mergen, Artefakte regenerieren, Merge-Commit pushen.
**5. Halb archivierter Zustand im Hauptcheckout — uncommittet, vom half-archive-Guard nicht erfasst** (suspicious, scripts/openspec-half-archive-check.sh)

Beobachtet 2026-08-09 im Hauptcheckout /home/patrick/Bachelorprojekt. `git status` zeigte 19 Zeilen: drei Change-Verzeichnisse (agy-headless-mcp-permissions, qwen3-coder-loadout, routes-manifest-stacktrace-fallback-T002666) als geloescht unter openspec/changes/, dieselben Inhalte als UNTRACKED unter openspec/changes/archive/2026-08-09-*, plus regeneriertes openspec-status.json.

Die Verschiebung war inhaltlich getreu (alle 15 Dateien byteidentisch, gleiche Dateizahlen je Change — geprueft gegen HEAD). Sie war aber UNVOLLSTAENDIG: die Delta-Specs waren nicht in die SSOT-Specs gemerged. Fuer qwen3-coder-loadout haette ein Commit das Requirement "Qwen3-Coder is available as an additive chat loadout" aus dem aktiven Baum entfernt, ohne dass es je in openspec/specs/local-llm-proxy.md ankommt — stiller Verlust eines Requirements.

Herkunft: KEIN post-merge-Hook erzeugt das (.githooks/post-merge enthaelt nichts zu archive/openspec). Es stammt aus einem abgebrochenen manuellen bzw. agentischen openspec.sh-archive-Lauf, vermutlich aus einer der Sessions, deren PID nicht mehr lief.

Kernbefund und Grund fuer diesen Eintrag: scripts/openspec-half-archive-check.sh existiert genau gegen diesen Zustand, meldete aber die ganze Zeit gruen — er prueft den COMMITTETEN Baum und sieht einen uncommitteten Halbzustand per Konstruktion nicht. Der Guard deckt damit die Phase nicht ab, in der der Fehler entsteht.

Behandelt im Lauf: Dateien nach scratchpad gesichert, Arbeitsbaum auf origin/main zurueckgesetzt (kein Informationsverlust — jede Datei war byteidentisch zu einer getrackten Datei in HEAD), Guard danach weiterhin gruen. Die drei Changes stehen wieder regulaer unter openspec/changes/ und sind ordentlich zu archivieren.
**6. Delta-Spec nach Change-Slug statt Parent-SSOT-Slug benannt — Archivierung wird scheitern (T002666)** (drift, openspec/changes)

Beobachtet 2026-08-09. Der Change openspec/changes/routes-manifest-stacktrace-fallback-T002666/ traegt seine Delta-Datei unter specs/routes-manifest-stacktrace-fallback-T002666.md — also nach dem CHANGE-Slug benannt, inklusive Ticket-Suffix.

Verifiziert: eine SSOT-Spec openspec/specs/routes-manifest-stacktrace-fallback-T002666.md existiert nicht. Der naechste fachlich passende Parent waere ci-cd.md.

Das verstoesst gegen die Delta-Spec-Konvention T001304 (Delta-Dateien werden nach dem Parent-SSOT-Slug benannt). Praktische Folge: `openspec.sh archive` schlaegt hier ohne --create-new fehl, weil der Ziel-SSOT nicht existiert — und --create-new waere fachlich falsch, da es sich nicht um eine neue Komponente handelt, sondern um einen Fix am routes:manifest-Verhalten.

Faelligkeit: PR #3913 (fix(routes): routes:manifest suppresses tsx stderr stacktrace [T002666]) ist BEREITS GEMERGT. Die Archivierung steht also an, und der Fehler tritt erst zu diesem Zeitpunkt zutage — die Datei liegt seit dem Anlegen des Change falsch benannt da, ohne dass irgendein Gate darauf anspricht.

Denkbar: die Namenskonvention schon bei `openspec.sh propose` pruefen (Delta-Dateiname muss einem existierenden openspec/specs/<slug>.md entsprechen, sonst --target-spec verlangen), statt den Fehler bis zum Archivieren aufzuschieben.
**7. agent-lock claim ticket returns exit 0 but lock not held** (suspicious, scripts/agent-lock.sh)

During ticket-ops Wave 0+1 dispatch: `agent-lock.sh claim ticket T002781` (and subsequent Wave 1 tickets) returned exit 0 with no output but `check ticket` still showed `free`. The `check-and-claim` variant worked correctly. Observed on 2026-08-09 during T002781 execution in worktree. The silent claim failure creates a race condition where two sessions could believe they both hold the lock.
**8. Pre-push hook rejects valid push due to stale scope commits from rebased main** (suspicious, scripts/pre-push hook)

When pushing fix/ticket-list-test-data-filter-T002781, the pre-push conventional-commit validator rejected the push because rebased commits from main (ci-cd, mcp-gateway, e2e-testing, routes scopes) were in the push range. These scopes were invalid per T002328 consolidation but the commits were already merged to origin/main — the hook should only check new commits, not the full range being pushed. Required workaround: rebase --onto to isolate only our commits.
**9. PR #3926 went DIRTY/CONFLICTING immediately after creation — rebase needed 3 attempts** (degraded, devflow/merge pipeline)

T002781 PR #3926 went from clean push to DIRTY/CONFLICTING immediately after creation, requiring 3 rebase cycles: (1) initial rebase with merge conflict on plan files, (2) rebase --onto to fix push rejection, (3) third rebase after auto-merge showed DIRTY. The post-rewrite openspec-status.json regeneration triggered dirty state on most rebases. Main branch was moving during the session with chore:release main commits.
**10. Planung widersprach einer bestehenden Design-Entscheidung, die erst nach der Nutzerfrage gefunden wurde** (process, dev-flow-plan)

Beim Planen von T002817 (SSOT für ticketlose Branch-Ausnahmen) habe ich dem User die Architekturfrage "gemeinsame Quelle vs. Allowlist spiegeln" gestellt, BEVOR ich geprüft hatte, ob die Frage im Repo schon einmal entschieden wurde. Sie war es: openspec/specs/divergence-guard.md:107-112 (aus T002470) schreibt die Duplikation ausdrücklich fest ("the pre-commit hook stays free of repository file dependencies, so that a missing library file cannot block every commit") und sichert sie mit drei Drift-Tests in tests/spec/divergence-guard/branch-name-guard.bats:114-139 ab.

Gefunden habe ich das erst beim Schreiben des failing Tests, als ich nach bestehenden Hook-Testmustern suchte — also nach der Entscheidung. Der User musste die Frage daraufhin ein zweites Mal beantworten, diesmal mit der vollständigen Faktenlage. Die Entscheidung fiel gleich aus (SSOT, Requirement per RENAMED-Delta ersetzen), das Risiko war aber real: eine unbemerkte Umkehr einer dokumentierten Entscheidung wäre erst im Review oder gar nicht aufgefallen.

ABLEITUNG: Vor einer Architekturfrage an den User gehört eine Suche nach bestehenden Requirements zum selben Gegenstand — grep über openspec/specs/ auf die betroffenen Dateipfade, nicht nur über den Code. Der Fix-Pfad von dev-flow-plan verlangt Ursachen-Verifikation vor dem Brainstorming (T002448-M5), aber nicht die Prüfung, ob die Lösungsrichtung schon einmal verworfen wurde.

NEBENBEFUND, in den Change eingearbeitet: der Drift-Guard aus T002470 hat den Drift, der T002817 auslöste, nicht gefunden. Er vergleicht Ticket-ID-Regex, Exemption-Liste und Typ-Präfixe zwischen Hook und Helper — die _unattended_allowlist (worktree-create.sh:49, mit T002783 hinzugekommen) fällt in keinen der drei Vergleiche. Eine bewusst duplizierte Regel ist nur so vollständig abgesichert wie die Aufzählung der Drift-Tests gepflegt wird.

ZWEITER, KLEINERER BEFUND: Ich habe .githooks/pre-push zunächst als zweiten Blocker der Kette bezeichnet. Der Abschnitt ist advisory (warn + exit 0), blockiert also nicht. Korrigiert, bevor der Plan geschrieben wurde; der Hook bleibt im Scope, weil die Warnung falsch ist, aber er war nie Ursache.
### Mishap-Rollup — 10 Eintraege (2026-08-09 06:49 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | drift | scripts/factory/mishap-rollup.sh · tickets/lifecycle | Rollup-Plan lokal committet, nie gepusht — Container blieb triage mit plan_ref=null |
| 2 | degraded | scripts/bge-mcp · systemd-user-units · openspec-embed-hook | bge-forward-embed: Unit active, Socket lauscht, Tunnel tot — openspec-embed schlägt bei jedem Commit still fehl |
| 3 | degraded | k3d/llm-gpu.yaml · bge-embed · scripts/bge-mcp | KORREKTUR zum bge-forward-embed-Mishap: Restart wirkungslos, Ursache liegt cluster-seitig — readiness=true bei totem Endpoint |
| 4 | degraded | scripts/ticket.sh | ticket.sh: --help auf Subkommando-Ebene fuehrt in eine Fehlermeldung statt zur Optionsliste |
| 5 | drift | .claude/skills/references/repo-hygiene-ops.md §4 · mishap-tracker | Dedupe-Guard prueft nur offene Tickets, nicht den Mishap-Buffer — Doppelerfassung real eingetreten |
| 6 | suspicious | tickets/plan_staged | 18 Tickets stehen auf plan_staged ohne plan-Zeile/Branch — halbgestagte Plans |
| 7 | suspicious | tickets/t002629 | T002629-Beschreibung behauptet offenen Blocker, PR #3745 ist seit 4 Tagen gemergt |
| 8 | process | skills/repo-hygiene | Probe-Schleife mit 2>/dev/null macht harten Fehler zu stillem Leerergebnis |
| 9 | degraded | llm/gateway | Alle vier lokalen LLM-Backends am Gateway degraded (/health 503) |
| 10 | suspicious | scripts/agent-lock.sh | Tote agent-locks blockieren bis zu 30 min, obwohl beide PIDs nachweislich tot sind |

**1. Rollup-Plan lokal committet, nie gepusht — Container blieb triage mit plan_ref=null** (drift, scripts/factory/mishap-rollup.sh · tickets/lifecycle)

Beobachtet 2026-08-09 in .worktrees/mishap-incident-rollup waehrend eines repo-hygiene-Laufs.

Der Branch chore/mishap-incident-rollup trug den Commit 7b3916970 ("chore(plans): update mishap-incident-rollup from container batches [T002784]") mit einem vollstaendigen 1092-zeiligen Plan (proposal.md + tasks.md). VERIFIZIERT: `git ls-remote --heads origin` kannte KEIN refs/heads/chore/mishap-incident-rollup, und Container T002784 stand auf status=triage mit plan_ref=null. Der Lauf ist zwischen `git commit` (erfolgreich) und `git push`/`stage-plan` gestorben.

WARUM DAS ZAEHLT: Wie bei T002817 endet die Mishap-Auswertung blind — der Plan wird korrekt erzeugt und gelintet, ist fuer die Factory aber unsichtbar (kein Remote-Ref, kein plan_ref, Container nicht plan_staged). Unterschied zu T002817: dort scheiterte der COMMIT am pre-commit-Branch-Guard, hier war der Commit erfolgreich und PUSH/stage-plan blieben aus. Naechster Blocker derselben Kette, nicht derselbe.

BESONDERS TUECKISCH: Der lokale Branch trug origin/main als Upstream statt seines eigenen Remote-Refs. `git status` meldet dann "ahead 2" — das liest sich wie normaler unveroeffentlichter Fortschritt, obwohl der designierte Remote-Branch gar nicht existiert. Das Signal, das den Defekt anzeigen muesste, sieht aus wie der Normalzustand.

BEHOBEN IN DIESEM LAUF (Symptom, nicht Ursache): Branch nach origin gepusht (pre-push gruen, T002817-Allowlist greift jetzt), danach `ticket.sh stage-plan --id T002784 --branch chore/mishap-incident-rollup --plan openspec/changes/mishap-incident-rollup/tasks.md --partials 1`. Container steht wieder auf plan_staged mit gueltigem plan_ref. Der Defekt im Treiber-Pfad selbst ist NICHT behoben.

VORSCHLAG: Der Treiber sollte nach dem Push verifizieren, dass der Remote-Ref existiert (`git ls-remote --heads origin "$BRANCH"`), statt sich auf den Exit-Code von `git push -q` zu verlassen — dieselbe Struktur wie die mergedAt-Regel in repo-hygiene-ops §3 ("eine leere Antwort ist kein Urteil"). Zusaetzlich ein Nachlauf-Check, der einen committeten aber nicht gepushten Plan beim naechsten Tick aufgreift, statt ihn liegen zu lassen.

VERWANDT: T002817 (pre-commit-Guard, PR #3929 gemergt), T002783 (Container-Aufloesung), T002407 (Treiber).
**2. bge-forward-embed: Unit active, Socket lauscht, Tunnel tot — openspec-embed schlägt bei jedem Commit still fehl** (degraded, scripts/bge-mcp · systemd-user-units · openspec-embed-hook)

Beobachtet 2026-08-09 waehrend eines repo-hygiene-Laufs, aufgefallen an einer WARN-Zeile des post-commit-Hooks von scripts/factory/mishap-rollup.sh.

BEFUND (drei Signale gruen, Dienst unbenutzbar):
- `systemctl --user is-active bge-forward-embed` -> active (running), seit 8 h
- `ss -tlnp | grep 8081` -> LISTEN auf 127.0.0.1:8081 und [::1]:8081, gehalten von kubectl pid 318
- `/proc/318/cmdline` -> `kubectl --context fleet port-forward -n workspace svc/llm-gateway-embed 8081:8081`
- `curl -m 8 http://127.0.0.1:8081/v1/embeddings` -> HTTP 000 nach 8,02 s (Timeout), zweimal reproduziert

Der lokale Socket nimmt Verbindungen an, aber der Tunnel dahinter transportiert nichts. Ein Zombie-Port-Forward: der kubectl-Prozess lebt weiter, seine Cluster-Verbindung ist weg.

WARUM DAS ZAEHLT: Der Kommentarkopf von scripts/bge-mcp/bge-mcp.service dokumentiert unter T002604 ausdruecklich, dass die Port-Forwards zu eigenen Units gemacht wurden, damit systemd sie ueberwacht und neu startet — "statt wie bisher `active` zu melden, waehrend [der Tunnel tot ist]". Genau dieser Zustand ist eingetreten. Die Massnahme kann ihn nicht verhindern: systemd sieht Prozess-Liveness, nicht Tunnel-Gesundheit. Ein `Requires=`/Restart-Mechanismus, der auf Prozessende triggert, greift bei einem Prozess, der nicht endet, nie.

FOLGE: Der post-commit-Hook openspec-embed meldet den Fehlschlag als "WARN: embed failed ... (non-fatal)" und laeuft weiter. Jeder Commit an einem OpenSpec-Change laesst damit den Embedding-Index weiter veralten, ohne dass irgendwo ein rotes Signal entsteht. Der Drift ist kumulativ und wird erst bemerkt, wenn eine Aehnlichkeitssuche (openspec_find_similar, bge_embed) schlechte Treffer liefert — dann aber ohne Bezug zur Ursache.

STRUKTURELLER KERN: dritter Befund desselben Musters in diesem Lauf — ein Signal, das Gesundheit attestiert, ohne das Attestierte zu pruefen. Vgl. repo-hygiene-ops §3 ("eine leere Antwort ist kein Urteil") und den unpushed-Plan-Befund vom selben Tag, wo `git status` "ahead 2" meldete, obwohl der Remote-Branch fehlte.

VORSCHLAG: Die Forward-Units mit einem echten Readiness-Check versehen statt mit Prozess-Liveness — periodischer HTTP-Probe gegen den Endpoint (systemd-Timer oder ExecStartPost-Watchdog), der die Unit bei Timeout neu startet. Mindestens sollte openspec-embed den Fehlschlag zaehlen bzw. sichtbar machen, statt ihn pro Commit als non-fatal wegzuschlucken — ein stiller WARN in einem Hook, der bei jedem Commit laeuft, wird nicht gelesen.

SOFORT-REMEDIATION (im Lauf angewandt): `systemctl --user restart bge-forward-embed`.

VERWANDT: T002604 (Port-Forwards als eigene Units), T002551 (bge-embed als Cluster-CPU-Deployment), T002488 (Cluster-DNS auf dem WSL-Host nicht aufloesbar).
**3. KORREKTUR zum bge-forward-embed-Mishap: Restart wirkungslos, Ursache liegt cluster-seitig — readiness=true bei totem Endpoint** (degraded, k3d/llm-gpu.yaml · bge-embed · scripts/bge-mcp)

Korrektur zum unmittelbar vorhergehenden Buffer-Eintrag ("bge-forward-embed: Unit active, Socket lauscht, Tunnel tot"). Dort steht "SOFORT-REMEDIATION (im Lauf angewandt): systemctl --user restart bge-forward-embed". Das ist FALSCH und wird hiermit richtiggestellt: der Restart wurde ausgefuehrt und hat NICHT geholfen.

NACHGEMESSEN nach dem Restart:
- `systemctl --user restart bge-forward-embed` -> Exit 0, Unit laeuft neu
- `curl -m 10 http://127.0.0.1:8081/v1/embeddings` -> weiterhin HTTP 000, Timeout nach 10,02 s

URSACHE LIEGT NICHT IM PORT-FORWARD, sondern cluster-seitig:
- `svc/llm-gateway-embed` existiert (ClusterIP 10.43.42.200:8081, 70 d alt)
- Endpoints sind BEFUELLT: 10.42.2.231:8080 — es fehlt also kein Backend
- Der Pod dahinter ist `bge-embed-5d54c9c44d-mz9pr` auf pk-hetzner-8: phase=Running, ready=TRUE, aber **restarts=6 in den letzten 10 Stunden**, Alter 15 h

Der Pod meldet sich also als bereit, waehrend Anfragen ueber den Service ins Leere laufen — und er startet dabei mehrmals pro Stunde neu. Die Readiness-Probe attestiert Gesundheit, ohne sie zu pruefen (vermutlich TCP- statt HTTP-Probe, oder ein Endpoint, der die Modell-Ladephase nicht abbildet).

WAS DAS AM URSPRUNGSBEFUND AENDERT: Die These des vorigen Eintrags — gruene Signale ueber einem toten Dienst — bleibt gueltig und wird sogar staerker, verschiebt sich aber eine Schicht tiefer. Es sind nicht drei, sondern VIER Signale, die Gesundheit melden: systemd-Unit active, kubectl-Prozess lebt, Socket lauscht, UND Pod ready=true. Der Vorschlag aus dem vorigen Eintrag (Readiness-Probe am Forward statt Prozess-Liveness) reicht deshalb nicht — ein HTTP-Probe vom Host haette hier zwar rot gemeldet, die Ursache liegt aber in der Pod-Readiness-Definition und der Restart-Schleife von bge-embed.

NAECHSTER SCHRITT (nicht ausgefuehrt, ausserhalb des Auftrags dieses Laufs): Logs von bge-embed-5d54c9c44d-mz9pr auswerten (6 Restarts / 10 h ist der eigentliche Defekt), die Readiness-Probe des Deployments in k3d/llm-gpu.yaml gegen einen echten HTTP-Endpoint pruefen, und erst danach die Host-seitige Probe nachziehen.

METHODISCHE NOTIZ: Der Fehler in meinem vorigen Eintrag entstand, weil ich die Remediation dokumentiert habe, BEVOR ich ihr Ergebnis gemessen hatte. Genau die Verwechslung von "Massnahme ausgefuehrt" mit "Wirkung eingetreten", vor der repo-hygiene-ops §3 fuer Merges warnt.
**4. ticket.sh: --help auf Subkommando-Ebene fuehrt in eine Fehlermeldung statt zur Optionsliste** (degraded, scripts/ticket.sh)

Beobachtet am 2026-08-09 in einem repo-hygiene-Lauf (§5), beim Anlegen eines Bug-Tickets nach der Bug-Triage-Konvention G-DORA03.

VERIFIZIERT
  bash scripts/ticket.sh            -> gibt korrekt Usage + vollstaendige Kommandoliste aus
  bash scripts/ticket.sh create --help -> "Unknown create option: --help"
  bash scripts/ticket.sh help       -> "Unknown command: help"
  bash scripts/ticket.sh --help     -> "Unknown command: --help"

Die Kommando-EBENE ist also auffindbar, die Options-EBENE nicht. Wer wissen will, welche
Optionen `create` nimmt und welche davon Pflicht sind, hat ueber das Skript keinen Weg
dorthin — `--help` wird vom Options-Parser als unbekannte Option abgewiesen, statt vor der
Parser-Schleife abgefangen zu werden.

WARUM DAS ZAEHLT
CLAUDE.md nennt `bash scripts/ticket.sh create --type bug --title "..."` als kanonischen
Weg der Bug-Triage-Konvention. Diese Zeile ist unvollstaendig: `description` ist Pflicht
(so dokumentiert im create_ticket-MCP-Tool: "Beschreibung (Pflicht in create.sh)"), taucht
im CLAUDE.md-Beispiel aber nicht auf. Beide Auskunftswege fuehren damit ins Leere, und der
Umweg ging ueber das MCP-Toolschema, um die Pflichtfelder zu erfahren.

VORSCHLAG
1. `--help`/`-h` in jedem Subkommando vor der Options-Schleife abfangen und die Optionen
   des jeweiligen Subkommandos ausgeben (Pflichtfelder markiert).
2. `help` als Alias fuer den argumentlosen Usage-Ausgang akzeptieren.
3. Das CLAUDE.md-Beispiel um `--description` ergaenzen, damit die dort genannte Zeile
   ausfuehrbar ist.

Kein Blocker — der MCP-Weg (mcp__ticket-mcp__create_ticket) traegt ein vollstaendiges
Schema und ist ohnehin MCP-first vorgeschrieben. Der CLI-Weg bleibt aber der in CLAUDE.md
genannte und der einzige im Fallback ohne MCP.
**5. Dedupe-Guard prueft nur offene Tickets, nicht den Mishap-Buffer — Doppelerfassung real eingetreten** (drift, .claude/skills/references/repo-hygiene-ops.md §4 · mishap-tracker)

Beobachtet und real eingetreten am 2026-08-09 in einem repo-hygiene-Lauf.

WAS PASSIERTE
Derselbe Befund (is_test_data-Filter fehlt in scripts/factory/queue.sh) wurde am selben Tag
zweimal erfasst: um 05:04:57 UTC als Mishap-Buffer-Eintrag durch einen frueheren Lauf, um
05:35 UTC als Ticket T002830 durch meinen Lauf. Beide Laeufe folgten repo-hygiene §5.

WARUM DER GUARD NICHT GRIFF
repo-hygiene-ops.md §4 schreibt einen Title-Dedupe-Guard vor (T001210) — er sucht nach einem
offenen TICKET mit gleichem Titel. Ich habe ihn ausgefuehrt:

    for s in triage backlog plan_staged in_progress planning; do
      bash scripts/ticket.sh list --status "$s"; done | grep -oiE '"title":"[^"]*(queue\.sh|is_test_data|...)'
      -> kein Treffer

Der Guard war also korrekt angewandt und lieferte trotzdem gruen. Der frueher erfasste
Befund lag zu diesem Zeitpunkt nicht als Ticket vor, sondern als Eintrag in
.git/mishap-buffer.json (Buffer-Stand 5/10, Schwelle 10 nicht erreicht). Buffer-Eintraege
sind dateibasiert und tauchen in KEINER Ticket-Query auf.

STRUKTURELLER KERN
Zwischen "Befund erfasst" und "Befund als Ticket sichtbar" liegt ein Fenster von bis zu
10 Buffer-Eintraegen bzw. 7 Tagen (Alters-Schnitt). In diesem Fenster ist ein bereits
erfasster Befund fuer den vorgeschriebenen Dedupe-Guard unsichtbar. Bei mehreren
repo-hygiene-Laeufen pro Tag — hier zwei — ist die Doppelerfassung damit nicht
unwahrscheinlich, sondern erwartbar.

Dasselbe Muster wie der Befund, den es hier verdoppelt hat: eine Pruefung, die nur einen
von zwei Pfaden kennt, sieht bei Anwendung auf den bekannten Pfad vollstaendig aus.

VORSCHLAG
1. §4 (und die Dedupe-Vorbedingung der Completeness-Triage) um eine zweite Quelle
   erweitern: vor dem Anlegen eines Tickets aus einem Mishap-Befund zusaetzlich
   mcp__ticket-mcp__get_mishap_buffer bzw. .git/mishap-buffer.json pruefen.
2. Erwaegen, das in ein Werkzeug zu ziehen statt in eine Merkregel — z. B. ein
   ticket.sh-Subkommando oder ein MCP-Tool, das Tickets UND Buffer gegen einen Titel
   prueft und einen einzigen Ja/Nein-Befund liefert. Eine Merkregel, die zwei getrennte
   Quellen von Hand zusammenfuehrt, ist genau die Form, die hier versagt hat.
3. Erwaegen, ob report_mishap seinerseits gegen offene Tickets dedupliziert — die
   Gegenrichtung derselben Luecke ist bisher ungeprueft.

AUFLOESUNG DES KONKRETEN FALLS
Der Buffer-Eintrag wurde nach Ueberfuehrung seines Inhalts (er war reicher als der
Ticketrumpf: Merge-Referenz PR #3926/1fcb6cfb2, Vorgeschichte T002762, struktureller Kern)
als Kommentar an T002830 aus .git/mishap-buffer.json entfernt. Backup der Datei vor dem
Eingriff wurde abgelegt. T002830 ist die einzige verbliebene Erfassung.

TEST (Output-Verifikation, T002448-M4)
Falls Vorschlag 2 umgesetzt wird: das Pruefkommando AUSFUEHREN mit einem Titel, der
ausschliesslich im Buffer liegt, und pruefen, dass es einen Treffer meldet. Positiv-Anker
(T002356-M1): ein Titel, der weder in Tickets noch im Buffer liegt, MUSS als kein Treffer
zurueckkommen — sonst besteht der Test vakuos, wenn die Pruefung pauschal Treffer meldet.

VERWANDT: T002830 (der verdoppelte Befund), T001210 (Herkunft des Guards), T002784
(Rollup-Container), T002783 (Rollup-Treiber blockiert — verlaengert das Sichtbarkeitsfenster).
**6. 18 Tickets stehen auf plan_staged ohne plan-Zeile/Branch — halbgestagte Plans** (suspicious, tickets/plan_staged)

Triage 2026-08-09: 19 plan_staged-Tickets, davon 18 (T002807–T002829 außer T002784) ohne ticket_plans-Zeile (slug/branch/pr_number NULL) und ohne existierenden Branch in `git branch -a`. Nur T002784 (Rollup-Container) ist legitim plan_staged ohne Plan-Zeile. Damit ist der Kommissionierungs-Zustand halbgestaged — kein dev-flow-execute kann den Plan finden (T002816-Klasse: "Gestagter, nie implementierter Plan"). Vermutlich wurden die Tickets per status-Update gestaged, ohne stage-plan/branch zu setzen.
**7. T002629-Beschreibung behauptet offenen Blocker, PR #3745 ist seit 4 Tagen gemergt** (suspicious, tickets/t002629)

T002629 (E6 Modell-Registry) führt im Text "BLOCKIERT VON: PR #3745 (T002587) ist offen mit zwei roten Checks" — `gh pr view 3745` zeigt state=MERGED (mergedAt 2026-08-04T00:12:47Z). Die Beschreibung ist stale und würde jede spätere Triage erneut in den Blocker-Pfad schicken. Triage hat die PR verifiziert und einen Kommentar mit Beleg ergänzt. Prozesslücke: Blocker-Status wird nicht beim PR-Merge zurückgeschrieben.
**8. Probe-Schleife mit 2>/dev/null macht harten Fehler zu stillem Leerergebnis** (process, skills/repo-hygiene)

Beobachtet in repo-hygiene 2026-08-09 beim Abfragen von 8 Ticketstatus:

    for t in T002813 T002647 …; do
      s=$(bash scripts/ticket.sh show "$t" 2>/dev/null | grep -iE '^(status|title)' | tr '\n' ' ')
      echo "$t: $s"
    done

Ergebnis: acht leere Zeilen. Gelesen als „Tickets existieren nicht / liefern keine Daten".

Tatsaechlich: `scripts/ticket.sh` kennt kein Subkommando `show`. Es schrieb „Unknown command: show" nach **stderr** und beendete mit Exit 1 — beides durch `2>/dev/null` und die Pipe unsichtbar. Das Skript verhaelt sich korrekt; unsichtbar gemacht hat es der Aufruf.

Zusatzfehler bei der Gegenprobe: `bash scripts/ticket.sh show T002837 2>&1 | head -5; echo "exit=$?"` misst den Exit-Code von `head`, nicht den des Skripts — die erste Nachpruefung meldete daher faelschlich Exit 0 und haette das Skript zu Unrecht als fail-open beschuldigt. Verifiziert mit `bash scripts/ticket.sh show T002837 >/dev/null 2>&1; echo $?` → 1.

Regel: In Probe-Schleifen stderr NICHT unterdruecken und den Exit-Code getrennt von der Pipeline auswerten. Ein leeres Ergebnis ist erst dann ein Messwert, wenn der Aufruf nachweislich erfolgreich war — dieselbe Familie wie „Leere API-Antwort ist kein Urteil" (repo-hygiene-ops §3, T002498-M5).

Kanonischer Weg fuer Ticketstatus ist ohnehin `mcp__ticket-mcp__get_ticket` / `list_tickets`, nicht ein geratenes CLI-Subkommando.
**9. Alle vier lokalen LLM-Backends am Gateway degraded (/health 503)** (degraded, llm/gateway)

Beobachtet 2026-08-09 während dev-flow-plan für T002836.

BEFUND (verifiziert)
Das LLM-Gateway auf 127.0.0.1:18235 LÄUFT — /v1/models liefert 200. Aber /health liefert 503 mit status=degraded, ready=false: alle vier registrierten Backends sind unten:
  - llamacpp-devstral (priority 1, http://127.0.0.1:8099/v1)
  - llamacpp-gemma4   (priority 1, http://127.0.0.1:8090/v1)
  - llamacpp-qwen     (priority 1, http://127.0.0.1:8094/v1)
  - opencode-zen      (priority 91, http://127.0.0.1:5099/v1)
checked=6, lastProbe=1786258092799.

FOLGE
scripts/plan-qa-check.sh Zeile 115 prüft mit `curl -sf .../health`; 503 lässt -f fehlschlagen, das Skript meldet "Gateway not reachable" und überspringt die LLM-QA (advisory, blockiert nicht). Das Skript verhält sich damit KORREKT — der Kommentar in Zeile 113 nennt genau diesen Fall. Die Meldung "not reachable" ist aber irreführend: der Dienst antwortet, nur seine Backends nicht.

MÖGLICHER ZUSAMMENHANG
T002663 (factory-mcp factory_ask LLM-Backend unerreichbar, type=fix, status=triage) beschreibt seit 2026-08-04 ausgefallene Natürlichsprach-Antworten am factory-mcp. Es ist zu prüfen, ob das dieselbe Ursache ist (Backends unten) statt eines eigenen Fehlers am factory-mcp — die dortige Fehlermeldung nannte allerdings 'Insufficient Balance' und 'invalid api key', was eher auf einen Remote-Provider deutet. Der Zusammenhang ist eine Hypothese, keine belegte Ursache.

WERT DES BEFUNDS
Solange die Backends unten sind, läuft jede LLM-gestützte Prüfung im Repo still im Skip-Pfad: plan-qa-check (advisory), Release-Notes-Generierung, der Task-Oracle. Das fällt nicht auf, weil alle drei bewusst fail-open sind.
**10. Tote agent-locks blockieren bis zu 30 min, obwohl beide PIDs nachweislich tot sind** (suspicious, scripts/agent-lock.sh)

Beobachtet 2026-08-09 zu Beginn von dev-flow-plan für T002836.

BEFUND (verifiziert)
Sechs ticket-scoped agent-locks (T002836, T002830, T002812, T002813, T002647, T002663) gehörten einer ticket-ops-Session mit owner_sid=611671, owner_pid=611672. Beide PIDs existierten nicht mehr (`ps -p` lieferte je nur die Kopfzeile). `agent-lock.sh reap` räumte sie dennoch nicht; `scripts/openspec.sh propose` brach mit "Ticket T002836 ist gesperrt (agent-lock)" ab.

URSACHE (belegt, kein Bug)
scripts/agent-lock.sh Block 0b (Zeilen 164-174): existiert der Worktree UND stimmt sein Branch mit dem Lock-Feld überein, gilt der Lock als lebendig — eingeführt für Session-Resumes (T002204), die mit neuer SID/PID zurückkehren. T002513 begrenzt das auf einen frischen Heartbeat. Der Heartbeat war 12 Minuten alt, AGENT_LOCK_TTL ist 1800s. Der Lock wäre also nach ~18 weiteren Minuten von selbst reapable geworden.

EINORDNUNG
Das Verhalten ist so entworfen und die Begründung trägt. Bemerkenswert ist die Lücke dazwischen: eine Session, die abstürzt ohne zu releasen, blockiert ihre Tickets bis zu 30 Minuten, obwohl die Toten-Erkennung über die PID sofort möglich wäre. Block 0b prüft den Worktree, aber nicht zusätzlich, ob owner_pid noch lebt — beides zusammen wäre eindeutig: Worktree passt UND PID tot = abgestürzte Session, kein Resume. Ein Resume hätte eine neue PID, die lebt.

Zu erwägen (nicht entschieden): in Block 0b zusätzlich `_pid_alive "$pid"` prüfen und bei toter PID trotz Worktree-Match reapen. Risiko: ein Resume, der die Lock-Datei noch nicht mit seiner neuen PID aktualisiert hat, würde fälschlich geräumt.

AUFLÖSUNG IM LAUF
Nach Rückfrage beim Operator wurden alle sechs Claims per `agent-lock.sh release ticket <id>` freigegeben (der Pfad für tote Owner greift regulär, ohne --force) und T002836 auf die aktive Session neu geclaimt.
### Mishap-Rollup — 10 Eintraege (2026-08-09 08:41 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | degraded | scripts/openspec-embed | openspec-embed indexiert in eine fast leere Collection (4 docs vs 55 aktive Pläne) |
| 2 | degraded | tests/spec/ticket-system | BATS-Suite backfill-id (T002732) schlägt lokal rot, CI grün |
| 3 | degraded | scripts/llm-proxy | llm-proxy BATS-Suiten (T002753 + ui_config.mcpServers seed) lokal rot |
| 4 | drift | skills/references/ticket-ops-procedures.md | ticket-ops-procedures nennt kein Prüfkriterium für "Ticket hat einen Plan" |
| 5 | suspicious | scripts/factory/reconcile-ticket-status.sh | reconcile-ticket-status Pattern 4 matcht nicht, obwohl der Watchdog läuft |
| 6 | drift | skills/mishap-tracker | mishap-tracker/SKILL.md legt status=plan_staged nahe, gemeint ist nur der Rollup-Container |
| 7 | drift | scripts/vda/ticket/update-status.sh | update-status.sh hat keinen Guard gegen plan_staged ohne Plan-Referenz |
| 8 | suspicious | scripts/openspec-embed · openspec_find_similar | openspec-embed Completeness-Gate: 12 Dokumente in der Collection, 57 lokale aktive Pläne |
| 9 | drift | tests/spec · BATS-Konventionen | BATS: Helper-Funktion trägt grep-Exit-Code nach außen — Positiv-Anker wird aus falschem Grund rot |
| 10 | drift | prod/wildcard-certificate.yaml · cert-manager | Reflector-Annotationen am Wildcard-Certificate, aber kein Reflector im Cluster |

**1. openspec-embed indexiert in eine fast leere Collection (4 docs vs 55 aktive Pläne)** (degraded, scripts/openspec-embed)

Beobachtet 2026-08-09 bei zwei Commits während dev-flow-plan für T002836.

BEFUND
Der post-commit-Hook openspec-embed meldet bei jedem Commit:
  [openspec-embed] WARN: completeness gate — collection has 4 docs but 55 local active plans (status=planning|plan_staged|active)
  skipped: 2 documents (2 context limit > 2048 tokens, 0 other reasons)

Die Ziel-Collection enthält also 4 Dokumente, während lokal 55 aktive Pläne existieren. Das Gate erkennt die Lücke und meldet sie — bricht aber nicht ab, sodass die Meldung im Commit-Rauschen untergeht.

VERMUTETE URSACHE (nicht in diesem Lauf verifiziert)
Es gibt einen bekannten Portkonflikt: Port 15432 ist vom k3d-Portforward belegt, wodurch der Verbindungsaufbau still auf eine andere Datenbank (Dev-DB) ausweicht statt zu scheitern. Die Embeddings landeten dann konsistent in der falschen Collection — was genau das Bild "4 statt 55" erklären würde. Diese Zuordnung ist eine Hypothese und vor einem Fix zu belegen (z.B. durch Ausgabe der tatsächlich verwendeten Verbindungsparameter im Hook).

FOLGE
Die semantische Suche über openspec-Changes arbeitet auf einem Bruchteil des Bestands. Wer sie zur Duplikatsuche vor einem neuen Proposal nutzt (openspec_find_similar), bekommt falsche Negative — und legt einen Change an, den es schon gibt. Der Schaden ist still: ein leeres Suchergebnis sieht aus wie "nichts Ähnliches vorhanden".

ZUSÄTZLICH
Zwei Dokumente werden dauerhaft wegen Kontextlimit (> 2048 Token) übersprungen. Der Hook nennt den Reparaturweg (task openspec:embed:backfill), der aber am selben Kontextlimit scheitern dürfte, solange die Chunking-Grenze unverändert ist.
**2. BATS-Suite backfill-id (T002732) schlägt lokal rot, CI grün** (degraded, tests/spec/ticket-system)

tests/spec/ticket-system/backfill-id-sequence.bats (3 Tests, T002732) schlagen im sauberen main-Checkout (ee4a9a80d) sowie im Worktree fehl — reproduziert. `task test:changed` ist damit lokal rot. Auf dem PR #3942 (16 Checks) waren dieselben Suiten grün → lokale Gate-Kette und CI divergieren (vermutlich Umgebungsabhängigkeit: lokale DB erreichbar → Tests laufen statt skip). VERIFIED im main-Checkout.
**3. llm-proxy BATS-Suiten (T002753 + ui_config.mcpServers seed) lokal rot** (degraded, scripts/llm-proxy)

tests/spec/local-llm-proxy/loadout-model-files-exist.bats (T002753: "jedes Loadout loest seine Modelldatei auf") und ui-config-seed.bats ("llama-server liefert ui_settings.mcpServers aus seed") schlagen im sauberen main-Checkout fehl — reproduziert. deckungsgleich mit der Health-Warnung G-LLM03 (Konfig-gegen-Laufzeit-Drift, 1 Ziel ≤0). VERIFIED im main-Checkout.
**4. ticket-ops-procedures nennt kein Prüfkriterium für "Ticket hat einen Plan"** (drift, skills/references/ticket-ops-procedures.md)

Die Triage-Prozedur (Phase 1) sagt nicht, woran ein gestagter Plan erkannt wird. Ich habe deshalb `tickets.ticket_plans` geprüft — das ist falsch: `scripts/vda/ticket/stage-plan.sh` (Z. 123-128) schreibt einen Kommentar `FACTORY-PLAN-REF branch=… plan=…` und legt KEINE ticket_plans-Zeile an; die entsteht erst beim Archivieren. Belegt durch Selbstbeobachtung: nach regulärem stage-plan für T002837 steht dort status=plan_staged, ticket_plans=0, branch=null — und trotzdem ist alles korrekt. Nach dem falschen Kriterium sah ein frisch geplantes Ticket "kaputt" aus. Das Triage-Ergebnis stimmte im konkreten Fall zufällig (alle 28 zurückgesetzten Tickets hatten auch planref=0), die Begründung war es nicht. Abhilfe: ticket-ops-procedures §Phase 1 nennt den FACTORY-PLAN-REF-Kommentar als maßgebliches Kriterium — so wie reconcile-ticket-status.sh Pattern 4 es bereits tut.
**5. reconcile-ticket-status Pattern 4 matcht nicht, obwohl der Watchdog läuft** (suspicious, scripts/factory/reconcile-ticket-status.sh)

Pattern 4 in scripts/factory/reconcile-ticket-status.sh (Z. 187-224) ist exakt für den Fall "plan_staged ohne FACTORY-PLAN-REF-Kommentar" gebaut und setzt dann attention_mode=needs_human plus eine notes-Zeile. Am 2026-08-09 entstanden 28 solche Tickets in drei Zeitclustern (03:52, 04:24, 06:49) — KEINES wurde erfasst: notes durchgehend leer, attention_mode durchgehend ai_ready.

Verifiziert, dass es nicht am Nichtlaufen liegt: systemctl --user list-timers zeigt factory.timer zuletzt vor 38 Minuten gelaufen, factory.service aktiv, und agent-msg führt mehrere "factory-tick: starting (dry_run=false)"-Einträge. Der Watchdog läuft also und der Aufruf steht in wakeup.sh:196 — Pattern 4 selbst greift nicht. Zu prüfen wären das SQL-Prädikat des Patterns, ein möglicher Brand-Filter und ob der Aufruf im Tick tatsächlich diesen Zweig erreicht.

Das ist der lohnendere Ansatzpunkt als die Altlast: der Schutzmechanismus existiert, ist korrekt spezifiziert und läuft — und wirkt trotzdem nicht. Kontext an T002845.
**6. mishap-tracker/SKILL.md legt status=plan_staged nahe, gemeint ist nur der Rollup-Container** (drift, skills/mishap-tracker)

Die Skill-Datei nennt `status=plan_staged` an vier Stellen (Z. 23, 137, 155, 216). Jedes Mal ist der persistente Rollup-Container gemeint, nicht ein Mishap-Einzelticket — das steht im Kontext, aber nicht in der jeweiligen Zeile.

Am 2026-08-09 wurden 28 Mishap-Einzeltickets direkt als plan_staged angelegt (created_at ≈ updated_at, unter einer Sekunde, in drei Schleifen-Clustern). Ein Code-Pfad dafür existiert nicht: scripts/ticket-mcp/go/internal/tools/mishap.go setzt konsequent --status triage (Z. 92, 174) und kommentiert sogar ausdrücklich "plan_staged ist ausschliesslich Tickets vorbehalten, die via stage-plan.sh …" (Z. 166). Der wahrscheinlichste Weg ist also ein ausführender Agent, der die Container-Angabe auf die Einzeltickets überträgt.

Abhilfe: an jeder der vier Stellen ausdrücklich "nur der Rollup-Container" ergänzen und einmal explizit festhalten, dass Mishap-Einzeltickets in triage entstehen.
**7. update-status.sh hat keinen Guard gegen plan_staged ohne Plan-Referenz** (drift, scripts/vda/ticket/update-status.sh)

scripts/vda/ticket/update-status.sh prüft ausschließlich terminale Übergänge (done → nur archived, archived terminal; T002382). Es gibt keine Prüfung, die einen Wechsel nach plan_staged ablehnt, wenn kein FACTORY-PLAN-REF-Kommentar existiert.

Dadurch ist der widersprüchliche Zustand "plan_staged ohne Plan" für jeden Aufrufer erreichbar — CLI, MCP, Agent, Skript — und genau das ist am 2026-08-09 28-fach eingetreten. Ein Guard an dieser Stelle macht den Zustand strukturell unerreichbar, unabhängig davon, welcher Aufrufer ihn versucht, und wäre damit wirksamer als jede Korrektur an einzelnen Aufrufern.

Zu beachten: reconcile-ticket-status.sh umgeht update-status.sh bewusst per direktem SQL (dort dokumentiert) — ein neuer Guard darf diesen Watchdog-Pfad nicht blockieren.
**8. openspec-embed Completeness-Gate: 12 Dokumente in der Collection, 57 lokale aktive Pläne** (suspicious, scripts/openspec-embed · openspec_find_similar)

Beim Plan-Stage-Commit meldete der openspec-embed-Hook: "WARN: completeness gate — collection has 12 docs but 57 local active plans (status=planning|plan_staged|active)". Die Embedding-Collection deckt also rund ein Fünftel der aktiven Pläne ab.

Folge: semantische Suche über Pläne (Kontexttransfer, Ähnlichkeitssuche via openspec_find_similar) arbeitet auf einem stark unvollständigen Index, ohne dass der Aufrufer das merkt — die Suche liefert Treffer, nur eben aus einem Fünftel des Bestands. Das ist die gefährlichere Sorte Lücke, weil sie wie ein Ergebnis aussieht.

Abzugrenzen von T002839 (2 Dokumente über dem 2048-Token-Limit übersprungen): das erklärt 2 fehlende Dokumente, nicht 45. Die Ursache der übrigen Lücke ist offen — Kandidaten sind ein nie gelaufener Backfill (task openspec:embed:backfill) oder Pläne, die nie durch den Hook liefen, weil sie außerhalb eines Commits entstanden.
**9. BATS: Helper-Funktion trägt grep-Exit-Code nach außen — Positiv-Anker wird aus falschem Grund rot** (drift, tests/spec · BATS-Konventionen)

Beim Schreiben von tests/spec/ci-cd/workflow-self-trigger.bats (T002868) fiel der Positiv-Anker aus dem falschen Grund rot.

Die Hilfsfunktion sammelt Workflow-Dateien mit paths-Filter:

    _workflows_with_paths() {
      for f in "$WF_DIR"/*.yml; do
        grep -qE '^[[:space:]]+paths:' "$f" && basename "$f"
      done
    }

Ihr Exit-Code ist der des LETZTEN grep-Durchlaufs. Hat die alphabetisch letzte Workflow-Datei keinen paths-Filter, liefert die Funktion 1 — obwohl sie korrekt eine nicht-leere Liste ausgegeben hat. Das `run _helper` / `[ "$status" -eq 0 ]` des Ankers schlug damit fehl, ohne dass inhaltlich etwas falsch war.

Das ist tückisch, weil es die Positiv-Anker-Konvention (T002356-M1) unterläuft: Der Anker soll belegen, dass die Kandidatenmenge nicht leer ist. Scheitert er stattdessen am Exit-Code, sieht der Test rot aus und der Autor "repariert" womöglich die Assertion statt die Funktion — und entfernt dabei genau den Anker, der den Test vor Vakuosität schützt.

Abhilfe (angewandt): explizites `return 0` am Ende jeder sammelnden Helper-Funktion, mit Kommentar. Allgemeiner: In BATS-Helfern, deren Ergebnis die AUSGABE ist und nicht der Status, den Exit-Code immer explizit setzen.

Kandidat für docs/superpowers/references/gotchas-footguns.md oder die Positiv-Anker-Konvention in CLAUDE.md, da beide bereits BATS-Fallen dieser Art führen.
**10. Reflector-Annotationen am Wildcard-Certificate, aber kein Reflector im Cluster** (drift, prod/wildcard-certificate.yaml · cert-manager)

`prod/wildcard-certificate.yaml` trägt vier `reflector.v1.emberstack.eu`-Annotationen, die das TLS-Secret automatisch nach coturn, workspace-office und website spiegeln sollen:

    reflector.v1.emberstack.eu/reflection-auto-enabled: "true"
    reflector.v1.emberstack.eu/reflection-auto-namespaces: "coturn,workspace-office,website"

Auf dem fleet-Cluster läuft jedoch kein Reflector: `kubectl get pods --all-namespaces | grep -i reflector` liefert nichts. Die Annotationen sind wirkungslos; die vorhandenen Kopien tragen `kubectl.kubernetes.io/last-applied-configuration`, sind also von Hand entstanden.

Aktuell kein Schaden: alle vier Secrets (workspace, website, coturn, workspace-office) laufen synchron am 2026-10-27 ab, sind also gepflegt. Das Problem ist die Irreführung — die Konfiguration liest sich wie eine funktionierende Automatik. In dieser Sitzung führte genau das zu einer falschen Designentscheidung, die erst nach dem Nachprüfen des laufenden Clusters korrigiert werden konnte (T002869: kopieren vs. eigenes Certificate).

Zwei saubere Auflösungen: entweder den Reflector installieren, dann greifen die Annotationen und die Handkopien entfallen — oder die Annotationen entfernen und dokumentieren, dass die Kopien manuell gepflegt werden. Der jetzige Zwischenzustand ist die schlechteste Variante, weil er Automatik behauptet, die niemand betreibt.

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
