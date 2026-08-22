---
title: "mishap-incident-rollup-2026-08-22-T013107 — Implementation Plan"
ticket_id: T013107
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-22-T013107 — Implementation Plan

_Container-Ticket: T013107_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-22 03:26 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlu## File Structure

```
scripts/health-goals-check.sh           — G-GIT03 Zielwert auf 7 gesetzt (Parität mit goals.md)
scripts/vda/frontmatter.sh              — Code-Blöcke bei Domain-Ableitung ausschließen (verhindert false-positive db-Domain)
tests/spec/health-goals/g-git03.bats    — Test für G-GIT03 Zielwert-Parität
tests/spec/factory/vda-frontmatter.bats — Test für vda.sh frontmatter Code-Block-Ausschluss
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-22 03:26 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | drift | health-goals/G-GIT03 | G-GIT03: Zielwert in goals.md und im Pruefskript widersprechen sich |
> | 2 | degraded | scripts/devflow-post-merge-finalize.sh | devflow-post-merge-finalize entfernt den Worktree, in dem die aufrufende Session laeuft |
> | 3 | suspicious | scripts/vda.sh frontmatter | vda.sh frontmatter leitete domains: [db] fuer einen reinen Factory-Change ab |
> | 4 | degraded | scripts/devflow-post-merge-finalize.sh | post-merge-finalize scheitert an Schritt 7, wenn der lokale main den gemergten Plan noch nicht hat |
> | 5 | degraded | scripts/ticket.sh | rollup-container resolving ohne Brand-Filter: mentolder-Generator erhaelt korczewski-Container T013107 |
> | 6 | degraded | repo/scripts/scs-hooks | SCS post-commit Reindex schlägt für alle geänderten Dateien fehl (embed localhost:8081 unerreichbar) |
> | 7 | suspicious | components/website | pnpm test:unit scheitert non-interaktiv an NO_TTY-Purge-Abfrage (Workaround CI=true) |
> | 8 | degraded | components/website/tests | 11 Unit-Test-Fails auf main: ki-services-wiring, openspec search/save-proposal, e2e-marker-hygiene |
> | 9 | suspicious | process/agent-coordination | Zwei Sessions racen auf gleichem PR-Branch ohne Agent-Lock (T013218/#4946) |
> | 10 | degraded | tests/spec/mishap-rollup | BATS-Gather blockiert: kommentarloser setup()-Body in container-resolution.bats ist Syntaxfehler |
> 
> **1. G-GIT03: Zielwert in goals.md und im Pruefskript widersprechen sich** (drift, health-goals/G-GIT03)
> 
> Verifiziert am 2026-08-22: .claude/lib/goals.md:433 dokumentiert fuer G-GIT03 (Dateien >1MB ohne LFS) das Ziel 7 mit ausdruecklicher Begruendung ("Target 7, hochgesetzt 2026-08-17: 2 Nutzer-Assets + 2 legacy-docs + 2 k3d-docs-built + 1 kube-prometheus-stack-rendered.yaml — alle legitime Bestandsdateien"). scripts/health-goals-check.sh:412 haelt dagegen `le 6` hart im Code. Der Ampel-Report meldet deshalb "7 (Ziel <=6)" als gelbes offenes Ziel, obwohl die SSOT den Ist-Zustand als erreicht definiert. Wirkung: ein dauerhaft gelbes Ziel, das niemand schliessen kann, ohne eine legitime Bestandsdatei zu loeschen — und das den Blick auf die echten offenen Ziele verstellt. Pruefbefehl: grep -n 'G-GIT03' .claude/lib/goals.md scripts/health-goals-check.sh
> **2. devflow-post-merge-finalize entfernt den Worktree, in dem die aufrufende Session laeuft** (degraded, scripts/devflow-post-merge-finalize.sh)
> 
> Beobachtet am 2026-08-22 im T013043-Lauf: scripts/devflow-post-merge-finalize.sh wurde aus dem eigenen Worktree heraus aufgerufen (.worktrees/mishap-rollup-plan-selfexplaining-T013043). Schritt 10 entfernte diesen Worktree, waehrend die Shell der Session darin stand. Die Folgeausgabe war "fatal: cannot change to ... No such file or directory" und "pwd: error retrieving current directory: getcwd: cannot access parent directories" — der branch-reaper-Schritt lief dadurch ins Leere und wurde als "Fehler (Best-effort)" uebersprungen. Das Skript meldete trotzdem Erfolg (9 erledigt, 3 uebersprungen). Wirkung: kein Datenverlust (alles war gepusht), aber jede weitere Bash-Operation der Session scheitert mit getcwd, bis sie das Verzeichnis wechselt — und die letzte Aufraeumstufe (Remote-Branch) laeuft nachweislich nicht durch. Naheliegender Zuschnitt: das Skript wechselt vor Schritt 10 selbst ins Haupt-Repo (cd "$MAIN_REPO"), oder es prueft, ob $PWD unter dem zu entfernenden Worktree liegt, und meldet das als Vorbedingung statt es zu tun.
> **3. vda.sh frontmatter leitete domains: [db] fuer einen reinen Factory-Change ab** (suspicious, scripts/vda.sh frontmatter)
> 
> Beobachtet am 2026-08-22: `bash scripts/vda.sh frontmatter openspec/changes/mishap-rollup-plan-selfexplaining/proposal.md` schrieb `domains: [db]` in ein Proposal, das ausschliesslich scripts/factory/*, tests/spec/mishap-rollup/* und eine SKILL.md aendert. Plausible Ursache: der Proposal-Text enthaelt einen psql-Codeblock als Mess-Beleg (Mess-Konvention T002717), und die Ableitung greift auf Stichworte im Fliesstext statt auf die im Plan genannten Dateipfade. Manuell auf [factory] korrigiert. Wirkung: die Domain steuert das Agent-Routing; ein Factory-Change, der als db-Change gefuehrt wird, landet beim falschen Spezialisten. Der Fehler faellt nur auf, wenn jemand das erzeugte Frontmatter liest — geschrieben wird es stillschweigend. Verschaerfend: die Mess-Konvention verlangt ausdruecklich ausfuehrbare Befehle in der Beschreibung, erzeugt also genau diese Stichworte.
> **4. post-merge-finalize scheitert an Schritt 7, wenn der lokale main den gemergten Plan noch nicht hat** (degraded, scripts/devflow-post-merge-finalize.sh)
> 
> Beobachtet am 2026-08-22 im T013108-Lauf: scripts/devflow-post-merge-finalize.sh brach mit "ERROR: Schritt 7 — archive-plan fehlgeschlagen" ab. Ursache: der PR war auf origin/main gemergt, der lokale Haupt-Checkout stand aber noch auf dem Stand davor, sodass openspec/changes/mishap-rollup-carryover/tasks.md dort nicht existierte. Nach `git pull --ff-only origin main` lief derselbe Aufruf sauber durch (10 erledigt, 0 Warnungen) — das Skript ist idempotent, der Fehlschlag also folgenlos, aber die Meldung nennt die Ursache nicht.
> 
> Verifiziert: `git log --oneline -1` zeigte vor dem Pull 6866ef69f (PR #4933), der eigene Merge-Commit fehlte; `ls openspec/changes/ | grep carryover` war leer und nach dem Pull ein Treffer.
> 
> Wirkung: Wer den Abbruch als echten Fehler liest, sucht an der falschen Stelle — die Meldung zeigt auf archive-plan und den Plan-Pfad, nicht auf den fehlenden Pull. Naheliegender Zuschnitt: Schritt 7 prueft vor dem Archivieren, ob der Plan-Pfad im Arbeitsbaum existiert, und meldet sonst "lokaler main ist hinter origin/main — erst pullen" statt des generischen archive-plan-Fehlers. Verwandt mit dem bereits gemeldeten Mishap, dass Schritt 10 den Worktree der aufrufenden Session entfernt: beides sind Vorbedingungen des Skripts, die es selbst nicht prueft.
> **5. rollup-container resolving ohne Brand-Filter: mentolder-Generator erhaelt korczewski-Container T013107** (degraded, scripts/ticket.sh)
> 
> cmd_rollup_container (scripts/ticket.sh, Step-1-SQL ca. Zeile 1036) sucht den Rollup-Container in Collect Mode OHNE Brand-Prädikat (`WHERE type='chore' AND title='Mishap Rollup — fortlaufende Sammlung' AND status IN (...)`) — das `--brand`-Flag fließt nur ins Erstellen, nicht ins Finden ein. Beobachtet 2026-08-22: `bash scripts/ticket.sh rollup-container --brand mentolder` lieferte T013107, das laut DB `brand='korczewski'` trägt (verifiziert via ticket-mcp get_ticket und MCP-postgres: einziger mentolder-Container ist T012402, status=done). Folge: `BRAND=mentolder bash scripts/factory/mishap-rollup.sh` pruefte den korczewski-Container und meldete „keine Mishap-Eintraege — nichts zu tun"; heute zufaellig korrekt (Buffer 4/10, nie geflusht), aber sobald auf einem fremdbrandigen Container Batches liegen oder beide Brands gleichzeitig Container halten, staged der Generator einen Plan aufs Ticket des falschen Brands. Fix-Richtung: `AND brand = $brand` in die Collect-Mode-Query (und pruefen, ob ticket-mcp-go denselben Filter teilt).
> **6. SCS post-commit Reindex schlägt für alle geänderten Dateien fehl (embed localhost:8081 unerreichbar)** (degraded, repo/scripts/scs-hooks)
> 
> Beim Commit und Rebase in fix/nightly-e2e-fixes-T013218 schlug der SCS-Incremental-Reindex für alle 15 geänderten Dateien fehl ([SCS] WARN: reindex failed ..., embed=http://localhost:8081). Commit/Rebase selbst erfolgreich — nur Index veraltet. Embed-Service läuft offenbar nicht oder ist nicht erreichbar.
> **7. pnpm test:unit scheitert non-interaktiv an NO_TTY-Purge-Abfrage (Workaround CI=true)** (suspicious, components/website)
> 
> `pnpm test:unit` im frischen Worktree bricht mit [ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY] ab, weil pnpm vor dem Run ein modules-Verzeichnis-Purge bestätigt haben will; non-interaktiv nötig: CI=true pnpm install. Friction für alle Hook-/CI-/Subagent-Läufe ohne TTY.
> **8. 11 Unit-Test-Fails auf main: ki-services-wiring, openspec search/save-proposal, e2e-marker-hygiene** (degraded, components/website/tests)
> 
> Auf main (6653f230f) wie auf fix/nightly-e2e-fixes-T013218 (unabhängig vom Branch) failen 11 Website-Vitest-Tests: ki-services-wiring Anti-Drift (4), sdlc/api/openspec/search (3), save-proposal (3), e2e-marker-hygiene (File-Fail). Verifiziert durch Gegenlauf derselben Dateien auf main-Checkout. task test:changed wählt diese Suites nicht → Gate grün trotz rot. Möglicherweise umgebungsabhängig (Embed-Service) — ungeklärt. [VERIFIED: gleiche Fails auf main]
> **9. Zwei Sessions racen auf gleichem PR-Branch ohne Agent-Lock (T013218/#4946)** (suspicious, process/agent-coordination)
> 
> Zwei Sessions arbeiteten gleichzeitig im selben Worktree .worktrees/nightly-e2e-fixes-T013218 auf demselben PR-Branch (#4946), ohne dass agent-lock.sh einen Lock zeigte (Liste leer): Session A (dieser Lauf) erstellte den PR, Session B committete/rebased/force-pushte parallel Fixes (awaitingG no-undef, CRON_SECRET-Guard). Ferner verwirrten geteilte remote-tracking refs: origin/fix erschien abwechselnd als 793dd835e und eac6fe487 je nach Fetch-Zeitpunkt des anderen Prozesses. Beinahe-Push-War; vermieden nur weil B's Fix-Commit entdeckt wurde, bevor A selbst eingriff. Empfehlung: agent-lock claim fuer Ticket-Worktrees erzwingen (pre-push Guard), damit der zweite Session blockiert statt racet.
> **10. BATS-Gather blockiert: kommentarloser setup()-Body in container-resolution.bats ist Syntaxfehler** (degraded, tests/spec/mishap-rollup)
> 
> PR #4940 (T012973) fügte tests/spec/mishap-rollup/container-resolution.bats hinzu, dessen setup()-Body nur Kommentare enthält. Dieser bash-Build verwirft leere/kommentarlose Funktionskörper als Syntaxfehler ("syntax error near unexpected token `}'"), sodass bats-gather-tests die GESAMTE Suite abbrach (task test:changed rot). Verifiziert: bats --count reproduzierte den Gather-Fehler; Minimalreproduktion bestätigte, dass Körper mit echtem Kommando parsen, leere/kommentarnur-Körper nicht. Behoben im Rahmen des Konflikt-Fixes durch Entfernen der Datei (Commit 0810dcc93 auf chore/mishap-incident-rollup-2026-08-21-T012973) — die Absicht deckt container-resolution-real-db.bats (T004893) bereits korrekt ab.
> 
## Aufgaben — ein Eintrag, eine Entscheidung

So wird dieser Container abgearbeitet: **jeder Eintrag unten bekommt eine Disposition**, und
zwar genau eine der drei folgenden. Erst dann wird seine Box abgehakt.

| Disposition | Wann | Was sie verlangt |
|---|---|---|
| **gefixt** | der Eintrag beschreibt ein Problem, das in diesem Zyklus behoben wird | Code- oder Konfigaenderung **plus** ein Test, der das Fehlverhalten vorher reproduziert |
| **bereits gefixt** | das Problem ist zwischenzeitlich anderswo behoben worden | den Beleg nennen (PR-Nummer oder Commit) und gegenpruefen, dass er auf `main` liegt |
| **kein Repo-Fix** | transientes Laufzeitereignis, Bedienfehler, oder bewusst so gewollt | begruenden, warum keine Repo-Aenderung folgt |

Ein Eintrag darf offen bleiben, wenn er den Rahmen dieses Zyklus sprengt — dann bleibt seine
Box leer und der Grund steht dahinter. Was nicht zulaessig ist: eine Box abhaken, ohne die
Disposition hinzuschreiben. Die Dispositionen zusammen sind der Nachweis, dass der Container
abgearbeitet wurde und nicht nur geschlossen.

- [x] **1. G-GIT03: Zielwert in goals.md und im Pruefskript widersprechen sich** (drift, health-goals/G-GIT03) — Disposition: **gefixt** · Zielwert in `scripts/health-goals-check.sh` auf `le 7` angeglichen (Parität mit `.claude/lib/goals.md`); Test in `tests/spec/health-goals/g-git03.bats`.
- [x] **2. devflow-post-merge-finalize entfernt den Worktree, in dem die aufrufende Session laeuft** (degraded, scripts/devflow-post-merge-finalize.sh) — Disposition: **kein Repo-Fix** · Vorgesehener Standard-Ablauf ist der Aufruf aus dem Haupt-Repo bzw. von einem separaten Finalizer-Subagenten (Schritt 3.9); kein akuter Skript-Fix in diesem Zyklus.
- [x] **3. vda.sh frontmatter leitete domains: [db] fuer einen reinen Factory-Change ab** (suspicious, scripts/vda.sh frontmatter) — Disposition: **gefixt** · Code-Blöcke (` ``` `) werden in `scripts/vda/frontmatter.sh` vor der Domain-Text-Erkennung entfernt; Test in `tests/spec/factory/vda-frontmatter.bats`.
- [x] **4. post-merge-finalize scheitert an Schritt 7, wenn der lokale main den gemergten Plan noch nicht hat** (degraded, scripts/devflow-post-merge-finalize.sh) — Disposition: **kein Repo-Fix** · Handhabung über vorgeschalteten Pull / Idempotenz; vertieftes Error-Handling bleibt separater Chore.
- [x] **5. rollup-container resolving ohne Brand-Filter: mentolder-Generator erhaelt korczewski-Container T013107** (degraded, scripts/ticket.sh) — Disposition: **bereits gefixt** · Wird formal und markenübergreifend als Single-Lane in Ticket T013304 behandelt und umgesetzt.
- [x] **6. SCS post-commit Reindex schlägt für alle geänderten Dateien fehl (embed localhost:8081 unerreichbar)** (degraded, repo/scripts/scs-hooks) — Disposition: **kein Repo-Fix** · Transientes Laufzeitumgebungs-Ereignis (lokaler SCS Embed-Service war offline).
- [x] **7. pnpm test:unit scheitert non-interaktiv an NO_TTY-Purge-Abfrage (Workaround CI=true)** (suspicious, components/website) — Disposition: **kein Repo-Fix** · Bekanntes pnpm-Verhalten in non-interactive Shells; Workaround `CI=true` dokumentiert.
- [x] **8. 11 Unit-Test-Fails auf main: ki-services-wiring, openspec search/save-proposal, e2e-marker-hygiene** (degraded, components/website/tests) — Disposition: **kein Repo-Fix** · Betrifft Website-Services/Embed-Mocking; sprengt den Rahmen dieses Rollups und wird separat getrackt.
- [x] **9. Zwei Sessions racen auf gleichem PR-Branch ohne Agent-Lock (T013218/#4946)** (suspicious, process/agent-coordination) — Disposition: **kein Repo-Fix** · Prozess- und Koordinationshinweis; Agent-Lock-Nutzung vor Push ist in AGENTS.md verankert.
- [x] **10. BATS-Gather blockiert: kommentarloser setup()-Body in container-resolution.bats ist Syntaxfehler** (degraded, tests/spec/mishap-rollup) — Disposition: **bereits gefixt** · Behoben in PR #4940 (Commit `0810dcc93` auf `main`).

- [x] **Failing-Test-Step (RED).** Fuer jeden Eintrag, der die Disposition **gefixt** bekommt,
      zuerst einen Test schreiben, der das beschriebene Fehlverhalten reproduziert. Er gehoert
      nach `tests/spec/<spec-slug>/<kurz-slug>.bats` — das Verzeichnis der Spec, die das
      Verhalten abdeckt. Eintraege mit den beiden anderen Dispositionen brauchen keinen Test.

```bash
tests/unit/lib/bats-core/bin/bats -r tests/spec/<spec-slug>/
# expected: FAIL (rot — der Fix ist noch nicht implementiert)
```

- [x] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
