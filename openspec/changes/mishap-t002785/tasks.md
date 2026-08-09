---
title: "mishap-t002785 — Implementation Plan"
ticket_id: T002785
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-t002785 — Implementation Plan

_Ticket: T002785_

Mishap-Bundle 2026-08-09 abarbeiten — 7 offene Befunde aus Container T002784

Automatisch erzeugt von `scripts/factory/auto-chore-plan.sh` [T002390]. Die Eintraege
stammen unveraendert aus der Ticket-Beschreibung; die Diagnose dort ist die Vorgabe.

## File Structure

```
<der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Eintraege

HERKUNFT

Aus dem Mishap-Batch vom 2026-08-09 01:55 UTC (9 Eintraege), gesammelt waehrend eines
repo-hygiene-Laufs. Der Batch liegt als Kommentar am Rollup-Container T002784. Dieses
Ticket ersetzt den Plan, den scripts/factory/mishap-rollup.sh normalerweise erzeugt haette
— der Treiber ist blockiert (T002783), deshalb von Hand aufgesetzt.

ZWEI DER NEUN EINTRAEGE SIND BEREITS ERLEDIGT ODER ABGEDECKT und stehen NICHT im Scope:
  - Nr. 6 "Main-Checkout dirty" -> erledigt via T002782, gemergt als PR #3903
  - Nr. 7 "T002762 (SF-TEST-*) im Factory-Backlog" -> Ursache ist T002781 (triage)

SCOPE — sieben Befunde, jeder einzeln abschliessbar

1. [degraded] scripts/ticket.sh --attempts-Validierung scheitert bei regulaerer Nutzung.
   Gefunden bei T002620. Der Watchdog-Eskalationspfad fuehrt einen Attempt-Counter; wenn
   dessen CLI-Einstieg scheitert, ist der Zaehler-Teil nicht bedienbar und nicht live
   pruefbar. Erst reproduzieren (bash scripts/ticket.sh … --attempts <n>), dann die
   Validierung gegen die vorgesehenen Aufrufformen pruefen.

2. [degraded] Agent-Lock schuetzt nicht — zweiter Akteur ohne Lock im selben Worktree.
   Beobachtet bei T002679: ein opencode-Lauf editierte, committete und pushte im Worktree
   eines anderen Agenten, ohne Lock zu halten. Kein Schaden, aber nur durch Umsicht des
   ersten Agenten. Der Mechanismus ist kooperativ: wer ihn nicht abfragt, ist nicht
   betroffen. Zu erwaegen: Pre-Check beim Betreten eines Worktrees auf BEIDEN Wegen, oder
   eine Lockdatei IM Worktree statt nur zentral.
   -> Derselbe strukturelle Kern wie Nr. 6 und Nr. 7 unten; zusammen behandeln.

3. [degraded] Abgebrochener CI-Lauf ist in der Aggregation nicht von echtem Fehlschlag
   unterscheidbar. Bei PR #3892 erschien ein cancelled-Lauf als "10 failed"; der eine
   echte failure-Eintrag nannte im Log SHARDS_RESULT: cancelled als Ursache. Hat zwei
   Agenten Zeit gekostet, in beide Richtungen (einmal "rot, also kaputt", einmal
   "abgebrochen, also harmlos"). Ungeklaert und eigenstaendig verdaechtig: WER den Lauf
   abgebrochen hat — es gab keinen verdraengenden Folgelauf.

4. [drift] mcp-postgres liest die eingefrorene fleet-Kopie statt der lokalen SSOT.
   Port 13001 wird per kubectl --context fleet port-forward bedient (ADR-006 E3: SELECT
   ja, Writes nein). Der Triage-Lauf las dadurch drei bereits-done Tickets als offen und
   loeste redundante Closure-Writes aus. Der Freeze steht nur im Kopf von scripts/ticket.sh,
   nicht im MCP-Tool-Guide §mcp-postgres. Entweder dort ergaenzen oder 13001 auf die lokale
   shared-db umziehen.

5. [drift] Sieben Tickets stehen plan_staged OHNE Plan-Artefakte (T002768–T002774): keine
   FACTORY-PLAN-REF, keine ticket_plans-Zeile, kein Branch, kein openspec/changes/-Dir.
   Die plan_staged-Zahl speist die Factory-Kommissionierung — dispatcher-bridge wuerde
   dev-flow-execute auf plan-lose Tickets loslassen. Entweder stage-plan nachziehen oder
   Status auf triage zuruecksetzen. Bis dahin KEIN Execution-Wave-Kandidat.

6. [suspicious] repo-hygiene §0 liest den Hauptcheckout und leitet Entscheidungen daraus
   ab, haelt aber keinen Lock und prueft nicht auf nebenlaeufige Schreiber. Real
   eingetreten: waehrend eines Laufs stashte eine opencode-Planungssession den
   Arbeitsbaum; der §0-Befund, auf dem eine Nutzerentscheidung beruhte, war beim Bericht
   nicht mehr aktuell. Aufgefallen nur durch eine zufaellige Wiederholung von git status.
   Denkbar: Factory-Status/Sessions VOR §0 abfragen, oder die Inspektion am Ende
   wiederholen und vergleichen, oder einen Lock auf den Hauptcheckout nehmen.

7. [drift] Branch-Locks werden von den schnellen Reap-Signalen nicht erfasst.
   Ein Branch-Lock mit totem PID (ps -p leer) und entferntem Worktree ueberlebte zwei
   reap-Laeufe als STATE=live, waehrend im selben Lauf Ticket-Locks korrekt geerntet
   wurden und .reap.log worktree-missing nachweislich als Grund kennt (ticket/T002645).
   NACHTRAG ZUR EINORDNUNG: Der Lock wurde spaeter doch geerntet — ueber heartbeat-ttl
   nach rund 35 Minuten, NICHT ueber pid-dead/worktree-missing. Die Folge ist also eine
   Verzoegerung, keine dauerhafte Blockade. Der Befund bleibt: die schnellen Signale
   greifen bei scope=branch offenbar nicht.

QUERSCHNITT — Nr. 2, 6 und 7 sind derselbe Vorgang aus drei Blickwinkeln: Koordination
zwischen nebenlaeufigen Agenten-Sessions. Wer sie einzeln bearbeitet, loest dreimal ein
Drittel. Eine gemeinsame Betrachtung vor der Umsetzung lohnt.

TEST-KONVENTION: Output-Verifikation (T002448-M4) und Positiv-Anker bei Negativtests
(T002356-M1) gelten fuer alle Punkte. Eigene Datei je Vorgang unter
tests/spec/&lt;spec-slug&gt;/ (T002416).

## Verify (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Fuer den ersten Eintrag oben einen Test schreiben,
      der das beschriebene Fehlverhalten reproduziert. Er gehoert nach
      `tests/spec/<spec-slug>.bats` — die Spec, die das Verhalten abdeckt.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/software-factory/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [ ] **Fix-Step (GREEN).** Die Eintraege oben abarbeiten. Jeder nennt Komponente und
      vorgeschlagene Behebung. Eintraege, die sich bei der Recon als nicht zutreffend
      erweisen, werden im PR-Text begruendet verworfen statt stillschweigend uebergangen.

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
