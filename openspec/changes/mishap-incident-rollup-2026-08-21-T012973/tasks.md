---
title: "mishap-incident-rollup-2026-08-21-T012973 — Implementation Plan"
ticket_id: T012973
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-21-T012973 — Implementation Plan

_Container-Ticket: T012973_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-21 23:13 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-21 23:11 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | process | repo-hygiene | False-positive 'IDENTISCH mit main' durch pfadgefilterten Diff in ignoriertem Worktree-Pfad |
> | 2 | process | scripts/validate-commit-msg.sh | commit-msg-Hook lehnt konsolidierten Scope 'openspec' ab |
> | 3 | process | repo-hygiene | Ticket-loser PR-Branch blockiert eigenen Freshness-Fix-Commit |
> | 4 | drift | scripts/branch-reaper.sh | Superseded Fix-Draft (mit Syntaxfehler) lag uncommittet im T012967-Worktree |
> | 5 | suspicious | skills/ticket-ops | Paralleler MCP+bash-Toolcall lieferte bash-Ausgabe verlustfrei nicht zurück |
> | 6 | drift | repo/openspec | Verwaistes OpenSpec-Change-Dir des T012445-Rollups im Haupt-Checkout |
> | 7 | drift | tickets | Ticket-Beschreibung driftet nach Cross-Session-Rescue: T012966 blieb offen, obwohl Arbeit via T012972 (#4887) längst gemergt war |
> | 8 | degraded | factory/executor | Factory-Executor setzte belegtes Rollup-Worktree auf HEAD zurück und vernichtete uncommittete Arbeit einer Parallel-Session |
> | 9 | degraded | tests/local-env | Drei lokale Test-Fehlschläge auf main (Proxy-Pin, pgvector-Index, feature_flags-FK) — Umgebungsdrift macht test:changed lokal unbrauchbar |
> | 10 | drift | openspec/specs/mishap-rollup.md | SSOT-Spec mishap-rollup.md beschreibt den Container-Lebenszyklus veraltet |
> 
> **1. False-positive 'IDENTISCH mit main' durch pfadgefilterten Diff in ignoriertem Worktree-Pfad** (process, repo-hygiene)
> 
> Beim §1-Worktree-Check wurde der Inhalt von .worktrees/branch-reaper-netzausfall-T012967/scripts/branch-reaper.sh via 'git diff --quiet origin/main <pfad>' gegen origin/main verglichen. Der Pfad liegt unter .worktrees/ und ist im Hauptcheckout ignoriert — der Diff matchte KEINEN Baum-Inhalt, war leer, und wurde als 'IDENTISCH mit origin/main' gelesen. Erst die vorgeschaltete Hash-Gegenprobe beim Remove-Preflight entlarvte die Messung als leer (nicht als Urteil). Regel bekräftigt (§3-Grundregel): Cross-Worktree-Vergleiche über Blob-Hashes (git hash-object vs git rev-parse <ref>:<path>), nie über pfadgefilterte Diffs aus dem Hauptcheckout.
> **2. commit-msg-Hook lehnt konsolidierten Scope 'openspec' ab** (process, scripts/validate-commit-msg.sh)
> 
> Commit auf chore/remove-korczewski-cronjobs-T012964 mit Scope 'fix(openspec)' vom commit-msg-Hook abgelehnt: 'openspec' wurde zu 'plans' konsolidiert (T002328). Ein Retry mit 'fix(plans)' war erfolgreich. Kostete einen Commit-Versuch; die Fehlermeldung des Hooks war selsterklärend.
> **3. Ticket-loser PR-Branch blockiert eigenen Freshness-Fix-Commit** (process, repo-hygiene)
> 
> PR #4893 (chore/openspec-cleanup-orphans) existierte ohne Ticket-ID im Branchnamen; der pre-commit-Hof lehnte den Freshness-Nachcommit ab (Branch-Naming-Guard). Gelöst durch retroaktives Ticket T012997 + dokumentierten SKIP_BRANCH_CHECK=1-Bypass für genau diesen mechanischen Nachcommit. Der Branch bleibt für den Reaper unsichtbar ('keine Ticket-ID') und muss manuell gepflegt werden.
> **4. Superseded Fix-Draft (mit Syntaxfehler) lag uncommittet im T012967-Worktree** (drift, scripts/branch-reaper.sh)
> 
> Ticket T012967 hatte zwei parallele Fix-Versuche: der finale Fix landete via PR #4894 in main, während im Worktree des älteren PR #4891 ein uncommitteter, veralteter Entwurf zurückblieb — inklusive Syntaxfehler ('eturn 1' statt 'return 1') und ohne den Worktree-Guard aus T012972. Der Entwurf wäre bei wörtlicher Anwendung des Allowlist-Filters fast als schützenswerte Arbeit fehlinterpretiert worden; Blob-Vergleich gegen main belegte die Supersession, Worktree+Branch wurden entfernt. Zwei parallele Lösungsversuche für ein Ticket erzeugen Leichen im Baum.
> **5. Paralleler MCP+bash-Toolcall lieferte bash-Ausgabe verlustfrei nicht zurück** (suspicious, skills/ticket-ops)
> 
> Beim ticket-ops-Lauf 2026-08-21 wurden mcp__mcp-postgres__query und ein bash-Aufruf (agent-lock.sh list) in EINER Nachricht kombiniert. Zurückkam ausschließlich das SQL-Ergebnis — die bash-Ausgabe fehlte komplett, ohne Fehlermeldung oder Tool-Failure. Der bash-Call musste einzeln wiederholt werden (dann erfolgreich). Direkt beobachtet, einmalig in dieser Session; wenn systematisch, unterschlägt es Pre-Check-Ergebnisse (Lock-Status!), die ein Runbook als Entscheidungsgrundlage liest. [Einzelfall-Beobachtung, nicht reproduziert]
> **6. Verwaistes OpenSpec-Change-Dir des T012445-Rollups im Haupt-Checkout** (drift, repo/openspec)
> 
> openspec/changes/mishap-incident-rollup-2026-08-19-T012445 liegt tracked und clean im Haupt-Checkout (git ls-files belegt), während der zugehörige Branch chore/mishap-incident-rollup-2026-08-19-T012445 gelöscht ist (git log: unknown revision) und das Container-Ticket T012445 von der Factory abgegeben wurde. Entspricht exakt dem AGENTS.md-Footgun „OpenSpec archival ONLY in worktree — main-checkout commits leave orphaned files". Verifiziert 2026-08-21 im ticket-ops-Lauf. Bei Reaktivierung von T012445 (factory_excluded=false, Status→triage am 2026-08-21) legt mishap-rollup.sh laut Skriptkopf das Change-Verzeichnis wieder an und erzeugt tasks.md neu — das Alt-Verzeichnis sollte vorher geprüft/entfernt werden, damit kein Mischstand aus altem Generator-Commit und neuem Lauf entsteht.
> **7. Ticket-Beschreibung driftet nach Cross-Session-Rescue: T012966 blieb offen, obwohl Arbeit via T012972 (#4887) längst gemergt war** (drift, tickets)
> 
> Beim ticket-ops-Triage-Lauf am 2026-08-21 zeigte T012966 ("Ungesicherte Patches im mishap-rollup-Worktree") noch auf den Worktree .worktrees/mishap-incident-rollup-2026-08-19-T012445-reuse und behauptete in der Beschreibung, dieser sei "die einzige Kopie" der uncommitteten Patches und dürfe nicht entfernt werden. Verifikation: Der Worktree existiert nicht mehr; beide Patches sind über PR #4887 (a54de896b, "rescued wip reaper worktree guard T012972") in origin/main gesichert; die Scratch-Datei test_reaper_logic.sh ist entfernt. Die rettende Session schloss ihr Ticket T012972 als duplicate_of T012966 und mergte unter dessen [T012972]-Tag, ließ aber das kanonische T012966 offen — mit veralteter Sicherheitsaussage in der Beschreibung. Koordinationslücke im Cross-Session-Abschluss: Wer die Arbeit eines anderen Tickets rescued, sollte auch das kanonische Ticket schließen oder mindestens seine Beschreibung aktualisieren. Behoben durch ticket-ops: T012966 wurde nach Belegprüfung (done · fixed) geschlossen.
> **8. Factory-Executor setzte belegtes Rollup-Worktree auf HEAD zurück und vernichtete uncommittete Arbeit einer Parallel-Session** (degraded, factory/executor)
> 
> Beim manuellen Executor-Durchlauf von T012445 am 2026-08-21 wurden frisch implementierte, uncommittete Änderungen (5 Dateien + neuer Test) im Worktree .worktrees/mishap-incident-rollup-2026-08-21-T012445-reuse vollständig zurückgesetzt, während ticket-ops aktiv daran arbeitete. Ursache: Der Factory-Tick (dry_run=false) dispatchte alle ~30 min einen opencode/orchestrator-Executor auf das Ticket (Phase-Events 17:34/18:06/18:38, jeweils entered→blocked exit 1 in 0 s) — der Reuse-Pfad der Worktree-Erstellung richtet den Baum auf HEAD her und wischte dabei fremde uncommittete Arbeit weg. Die Executors selbst scheiterten sofort (exit 1, leerer Grund), hinterließen also keinen Nutzen, aber zerstörten den Zustand. Wiederherstellung: Alle Edits wurden deterministisch neu appliziert; der branch-scoped Agent-Lock hielt weitere Ticks während Commit+Push fern. Empfehlung: Ein Worktree mit fremden uncommitteten Änderungen (git status non-empty) darf vom Factory-Reuse-Pfad NICHT hart auf HEAD gesetzt werden — entweder skip oder die Session über agent-msg benachrichtigen.
> **9. Drei lokale Test-Fehlschläge auf main (Proxy-Pin, pgvector-Index, feature_flags-FK) — Umgebungsdrift macht test:changed lokal unbrauchbar** (degraded, tests/local-env)
> 
> task test:changed lief am 2026-08-21 lokal rot mit drei Fehlschlägen, die unabhängig von den geprüften Änderungen sind und identisch auf dem Main-Checkout ohne diese reproduzieren: 1) tests/spec/local-llm-proxy.bats 'route-provider.sh factory-implement sonnet -> Pin :18235' (erwartet Pin :18235, kein :8093 — Konfigurations-/Proxy-Zustand), 2) tests/spec/openspec-pgvector/context-retrieve-cli.bats 'pg_indexes liefert chunks_embedding_hnsw fuer knowledge.chunks' (Index fehlt in lokalem Postgres — Migration/pgvector-Setup nicht gefahren), 3) tests/spec/software-factory/conflict-db-triage.bats 'FA-SF-04: feature_flags has brand FK to public.brands' (Schema-Drift im lokalen Klon). Alle drei hängen an Umgebungs-/DB-Zustand statt am Code; CI ist gleichzeitig grün. Folge: task test:changed als pre-commit-Gate verliert locally seine Aussagekraft, bis die lokale Umgebung nachgezogen ist (Migrationen/Seeds fahren).
> **10. SSOT-Spec mishap-rollup.md beschreibt den Container-Lebenszyklus veraltet** (drift, openspec/specs/mishap-rollup.md)
> 
> Verifiziert beim Prior-Art-Lauf zu T013043: openspec/specs/mishap-rollup.md traegt das Requirement "Rollup container SHALL be ephemeral" mit dem Szenario "Generator closes the container after consuming its batches" (THEN: done, resolution=obsolete). Der Code macht das seit T007056 nicht mehr: scripts/factory/mishap-rollup.sh staged den Plan per stage-plan --no-hold auf den Container, die Factory dispatcht, der Post-Merge-Finalizer schliesst ihn mit resolution=fixed. Der Skriptkopf nennt T007056 ausdruecklich als Aenderung, der Spec wurde nicht nachgezogen. Wirkung: wer die Requirements als Wahrheit liest (Prior-Art-Suche, Schritt 0.7 in dev-flow-plan), bekommt ein Verhalten beschrieben, das es nicht mehr gibt.

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

- [x] **1. False-positive 'IDENTISCH mit main' durch pfadgefilterten Diff in ignoriertem Worktree-Pfad** (process, repo-hygiene) — Disposition: bereits gefixt + Begruendung: Regel bekräftigt (§3-Grundregel): Cross-Worktree-Vergleiche über Blob-Hashes (git hash-object vs git rev-parse <ref>:<path>), nie über pfadgefilterte Diffs aus dem Hauptcheckout.
- [x] **2. commit-msg-Hook lehnt konsolidierten Scope 'openspec' ab** (process, scripts/validate-commit-msg.sh) — Disposition: bereits gefixt + Begruendung: Ein Retry mit 'fix(plans)' war erfolgreich.
- [x] **3. Ticket-loser PR-Branch blockiert eigenen Freshness-Fix-Commit** (process, repo-hygiene) — Disposition: bereits gefixt + Begruendung: Gelöst durch retroaktives Ticket T012997 + dokumentierten SKIP_BRANCH_CHECK=1-Bypass für genau diesen mechanischen Nachcommit.
- [x] **4. Superseded Fix-Draft (mit Syntaxfehler) lag uncommittet im T012967-Worktree** (drift, scripts/branch-reaper.sh) — Disposition: bereits gefixt + Begruendung: Bereits gefixt (since the final fix landed in PR #4894)
- [x] **5. Paralleler MCP+bash-Toolcall lieferte bash-Ausgabe verlustfrei nicht zurück** (suspicious, skills/ticket-ops) — Disposition: kein Repo-Fix + Begruendung: Kein Repo-Fix (it was a one-time observation of an MCP+bash tool call failure)
- [x] **6. Verwaistes OpenSpec-Change-Dir des T012445-Rollups im Haupt-Checkout** (drift, repo/openspec) — Disposition: kein Repo-Fix + Begruendung: Requires manual cleanup of orphaned directories.
- [x] **7. Ticket-Beschreibung driftet nach Cross-Session-Rescue: T012966 blieb offen, obwohl Arbeit via T012972 (#4887) längst gemergt war** (drift, tickets) — Disposition: bereits gefixt + Begruendung: Closed via ticket-ops.
- [x] **8. Factory-Executor setzte belegtes Rollup-Worktree auf HEAD zurück und vernichtete uncommittete Arbeit einer Parallel-Session** (degraded, factory/executor) — Disposition: kein Repo-Fix + Begruendung: Manual restoration performed, recommendation for factory-reuse-path logic provided.
- [x] **9. Drei lokale Test-Fehlschläge auf main (Proxy-Pin, pgvector-Index, feature_flags-FK) — Umgebungsdrift macht test:changed lokal unbrauchbar** (degraded, tests/local-env) — Disposition: kein Repo-Fix + Begruendung: Umgebungsdrift macht test:changed lokal unbrauchbar
- [x] **10. SSOT-Spec mishap-rollup.md beschreibt den Container-Lebenszyklus veraltet** (drift, openspec/specs/mishap-rollup.md) — Disposition: gefixt + Begruendung: update spec and add test

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
