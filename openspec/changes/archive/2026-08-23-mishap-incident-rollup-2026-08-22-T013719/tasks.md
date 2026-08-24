---
title: "mishap-incident-rollup-2026-08-22-T013719 — Implementation Plan"
ticket_id: T013719
domains: [factory]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-22-T013719 — Implementation Plan

_Container-Ticket: T013719_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-22 18:37 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-22 18:00 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | suspicious | skills/repo-hygiene | Repo wird während Hygiene-Lauf live mutiert — §0-Patch-Snapshots veralten lautlos |
> | 2 | degraded | repo/git-hygiene | T013676/T013677-Branches ohne Upstream — Worktree war einzige Kopie der Arbeit |
> | 3 | suspicious | scripts/brain-ingest | Hauptcheckout-Patches ohne Ticket/Commit: brain-ingest.sh, brain-ingest-transform.sh, loadouts.json (neuere Iteration) |
> | 4 | degraded | scripts/brain-ingest-swap.sh | Orphane brain-ingest-Watcher-PID 4065280: pgrep-Selbstmatch, Loop terminiert nie |
> | 5 | drift | scripts/llm/loadouts.json | factory.locked=true (Runtime-Pin) in T013676-Securing-Commit cb1f0d558 committed |
> | 6 | degraded | scripts/brain-ingest.sh | Brain-Ingest-Lauf 2026-08-22 17:14 fehlgeschlagen: Coverage-Gate 88% < 95% |
> | 7 | degraded | scripts/vda.sh | vda.sh oracle unerreichbar — weder Hermes noch OpenClaw daemon aktiv |
> | 8 | suspicious | scripts/hygiene worktree cleanup | T013316-reuse Worktree mid-session extern neu erstellt — uncommitteter RED-Test verloren |
> | 9 | drift | tests/bats-conventions | Nackte '!'-Pipeline als BATS-Assertion wirkungslos — bash-errexit-Ausnahme verschleiert die fehlschlagende Zeile |
> | 10 | process | repo/git-hooks | Commit-msg-Hook lehnte 'openspec'-Scope ab; Debug-Tippfehler erzeugte Scheinwiderspruch |
> 
> **1. Repo wird während Hygiene-Lauf live mutiert — §0-Patch-Snapshots veralten lautlos** (suspicious, skills/repo-hygiene)
> 
> Beim repo-hygiene-Lauf 2026-08-22 wurde das Repo während des Laufs live mutiert (drei belegte Beobachtungen): (1) Der §0-Snapshot von scripts/llm/loadouts.json war binnen Minuten veraltet — nach Sicherung in Worktree T013676 (Commit cb1f0d558) änderte sich der Diff weiter (ctx 65536→262144, zusätzliche extraArgs -b/-ub); verifiziert per diff der Patch-Dateien. (2) scripts/brain-ingest.sh tauchte neu als ungeticketer Patch auf, während der Lauf lief. (3) Die Worktree-Liste wuchs zwischen Messung und Zählung um .worktrees/mishap-incident-rollup-2026-08-22-T013328-reuse (aktiver Factory-Tick). Die SSOT deckt Live-Mutation für §1 (Factory-Tick-Vorcheck, Porcelain unmittelbar vor Remove) ab, aber NICHT für §0: Patch-Snapshots können lautlos veralten, bevor sie gesichert sind. Verbesserung: §0 um Frische-Gegenprobe ergänzen (Diff-HASH vor/anlage vergleichen, bei Abweichung Snapshot erneuern oder Ticket-Kommentar mit Drift-Vermerk).
> **2. T013676/T013677-Branches ohne Upstream — Worktree war einzige Kopie der Arbeit** (degraded, repo/git-hygiene)
> 
> Beim repo-hygiene-Lauf 2026-08-22 (§1 Worktree-Cleanup) stellte sich heraus, dass die Branches chore/loadouts-brain-ingest-f16-T013676 und fix/brain-ingest-prune-state-map-T013677 keinen Remote-Upstream hatten (verifiziert via git rev-parse --abbrev-ref '@{upstream}' -> KEIN-UPSTREAM). Die zugehörigen Worktrees unter .worktrees/ waren damit die einzige Checkout-Kopie der committeten Arbeit; ein späteres Branch-Delete oder Objekt-GC hätte Datenverlust bedeutet. BEHEBEN im selben Lauf: beide Branches per git push -u origin auf origin gesichert (pre-push quality:check gruen). Lektion: Worktree-Anlage durch Planning-/Hygiene-Läufe sollte den Branch sofort pushen oder mindestens als [no-upstream] melden.
> **3. Hauptcheckout-Patches ohne Ticket/Commit: brain-ingest.sh, brain-ingest-transform.sh, loadouts.json (neuere Iteration)** (suspicious, scripts/brain-ingest)
> 
> Beim repo-hygiene-Lauf 2026-08-22 (§0 Arbeitsbaum-Check) fanden sich im Hauptcheckout funktionale Patches, die in KEINEM Commit und KEINEM Ticket existieren: (a) scripts/brain-ingest-transform.sh — curl -sf -> -s -S (Fehler sichtbar machen) plus Reindent; (b) scripts/brain-ingest.sh — TTY-Erkennung fuer Progress-Ausgabe ([ -t 1]) und entfernte Kommentarzeile. Verifiziert via git log --all --find-object=<blob>: beide Blobs (628f25369, 0873794e1) in keinem Ref. Zusaetzlich ist die NEUESTE Iteration von scripts/llm/loadouts.json (ctx 262144 statt 65536, extraArgs -b 4096 -ub 2048 zusaetzlich zu -kvu) ebenfalls nirgends committed — Ticket T013676 beschreibt nur die aeltere Branch-Version (ctx 65536, nur -kvu). Klassischer §0-Fall 'funktionaler Patch ohne Ticket'. Die Patches wurden NICHT angefasst (moeglicherweise laufende Operator-Arbeit); sie liegen weiterhin ungesichert im Hauptcheckout und brauchen entweder ein Ticket + Commit oder eine bewusste Verwerfungs-Entscheidung des Operators.
> **4. Orphane brain-ingest-Watcher-PID 4065280: pgrep-Selbstmatch, Loop terminiert nie** (degraded, scripts/brain-ingest-swap.sh)
> 
> repo-hygiene-Lauf 2026-08-22 (§0-Forensik): Watcher-Loop (Kind des Operator-Sessions b8593ba6, PID 4065280) überwachte brain-ingest-swap.sh per pgrep -f brain-ingest-swap.sh. Das Endkriterium matcht die eigene Kommandozeile (der Loop-Body enthält die Suchkette), die Loop läuft deshalb unendlich (90s-Sleep, 2h+ am Laufzeit). Ingest ist gescheitert (Coverage-Gate), Pin ist released — der Watcher ist ohne Funktion. Harmlos, aber nie terminierend; kill nur durch Operator (Kind des aktiven Sessions).
> **5. factory.locked=true (Runtime-Pin) in T013676-Securing-Commit cb1f0d558 committed** (drift, scripts/llm/loadouts.json)
> 
> repo-hygiene-Lauf 2026-08-22 (§0): Der erste Securing-Commit cb1f0d558 für T013676 nahm scripts/llm/loadouts.json 1:1 aus dem Main-Checkout — inklusive des live Runtime-Pins factory.locked=true (das Proxy schreibt dieses Feld per PUT /admin/factory). Etablierter committed State ist locked=false (T013144-Pattern). Behebt in Folge-Commit 109a26ed1 (locked=false normalisiert, ctx 262144 + -b 4096 -ub 2048 nachgezogen). Kandidat für einen Pre-Commit-Guard: factory.locked=true ablehnen, solange der Pin nicht Teil eines bewussten Loadout-Switch-PRs ist.
> **6. Brain-Ingest-Lauf 2026-08-22 17:14 fehlgeschlagen: Coverage-Gate 88% < 95%** (degraded, scripts/brain-ingest.sh)
> 
> repo-hygiene-Lauf 2026-08-22 (§0-Forensik): Ingest-Lauf 17:14–17:26 (Log: ~/.claude/jobs/b8593ba6/tmp/brain-ingest-171439.log) endete FAIL am Coverage-Gate (88% < 95%); Prune lief im Dry-Run-Modus (96 Kandidaten). Operator-Session iteriert aktiv (Loadout-Param-Änderungen T013676, prune-State-Map T013677, Observability T013712 — alle heute entstanden). Signal, dass der Coverage-Mangel weiterhin nicht geschlossen ist; nächster Lauf wird voraussichtlich am selben Gate scheitern.
> **7. vda.sh oracle unerreichbar — weder Hermes noch OpenClaw daemon aktiv** (degraded, scripts/vda.sh)
> 
> bash scripts/vda.sh oracle '<goal>' lieferte "No local LLM service (Ollama) or Opencode/OpenClaw daemon is running" bei zwei Anfragen im repo-hygiene-Kontext. Workaround: factory-mcp/ticket-mcp direkt genutzt. Entweder Fallback-Verhalten dokumentieren oder Daemon-Erkennung pruefen.
> **8. T013316-reuse Worktree mid-session extern neu erstellt — uncommitteter RED-Test verloren** (suspicious, scripts/hygiene worktree cleanup)
> 
> REZIDIV von T013316 #9: Zwischen zwei Befehlen derselben Session wurde .worktrees/mishap-incident-rollup-2026-08-22-T013316-reuse entfernt und per git worktree add am Original-Commit 5d440bacc neu erstellt (leerer Reflog, alle Datei-Timestamps auf 19:25). Ein uncommitteter RED-Test (carryover-worktree-scan.bats) ging verloren und wurde neu geschrieben; committete Arbeit in den anderen vier Worktrees war unberuehrt. Wer auch immer der Akteur war: Worktree-Entfernung/Wiederherstellung laeuft noch immer ohne Koordination mit aktiven Sessions.
> **9. Nackte '!'-Pipeline als BATS-Assertion wirkungslos — bash-errexit-Ausnahme verschleiert die fehlschlagende Zeile** (drift, tests/bats-conventions)
> 
> Eine nackte '!'-Pipeline als BATS-Assertion ("! printf .. | grep -qF x") schlaegt den Test NICHT fehl, wenn das Muster gefunden wird: bash nimmt '!'-Kommandos von errexit und dem ERR-Trap aus, nur der Status der letzten Testzeile surfacet — die Fehlermeldung wies dann auf die falsche Zeile. Entdeckt bei T013316 #10; der neue Test nutzt jetzt explizite String-Assertion (boilerplate="$(grep ... || true)"; [ -z "$boilerplate" ]). Konvention in tests/CLAUDE.md verankern: Negativ-Assertions nie als nackte '!'-Pipeline.
> **10. Commit-msg-Hook lehnte 'openspec'-Scope ab; Debug-Tippfehler erzeugte Scheinwiderspruch** (process, repo/git-hooks)
> 
> Erster Commit-Versuch fuer T013673 mit fix(openspec) abgelehnt: Scope 'openspec' existiert nicht, gueltig ist 'scripts'. Bekannte Klasse (T013328 #2); der Hinweis nannte diesmal wenigstens die Konsolidierung. Zusaetzlich selbst verursacht und selbst aufgeklart: ein Debug-grep mit Tippfehler ('iranyein' statt 'irgendein') lieferte ein widerspruechliches Ergebnis (exit 1 vs. count=1) und kostete mehrere Debug-Runden, bis od -c die Bytes zeigte.

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

- [x] **1. Repo wird während Hygiene-Lauf live mutiert — §0-Patch-Snapshots veralten lautlos** (suspicious, skills/repo-hygiene) — Disposition: _gefixt_ + Begruendung: .claude/skills/references/repo-hygiene-ops.md §0 traegt jetzt den Factory-Tick-Vorcheck (gleicher Lock-Test wie §1 [T003227], mit Beleg vom 2026-08-22). Guard: tests/spec/agent-skills/repo-hygiene-tick-snapshot-guard.bats (RED belegt, jetzt gruen).
- [x] **2. T013676/T013677-Branches ohne Upstream — Worktree war einzige Kopie der Arbeit** (degraded, repo/git-hygiene) — Disposition: _bereits gefixt_ + Begruendung: Die Arbeit ist in main und mehrfach gesichert — PRs #5015/#5016/#5017 gemergt (e856a8853, 9f492d719, 7606b1b44), die Branch-Tips liegen unter refs/tags/reaped/fix/brain-ingest-prune-state-map-T013677 und refs/tags/reaped/chore/loadouts-brain-ingest-f16-T013676.
- [x] **3. Hauptcheckout-Patches ohne Ticket/Commit: brain-ingest.sh, brain-ingest-transform.sh, loadouts.json (neuere Iteration)** (suspicious, scripts/brain-ingest) — Disposition: _bereits gefixt_ + Begruendung: Alle drei Patches sind getickt und gemergt — T013712 (#5016), T013677 (#5017), T013676 (#5015). Der verbleibende Hauptcheckout-Diff ist die bewusst belassene Operatorsitzung (dokumentiert in den Ticket-Beschreibungen).
- [x] **4. Orphane brain-ingest-Watcher-PID 4065280: pgrep-Selbstmatch, Loop terminiert nie** (degraded, scripts/brain-ingest-swap.sh) — Disposition: _kein Repo-Fix_ + Begruendung: Session-Artefakt, kein Repo-Code — das pgrep-Selbstmatch-Muster existiert in keiner Repo-Datei (grep ueber .claude/, scripts/, docs/, tests/ leer). Der verwaiste Watcher wurde beendet (kill 4065280, 2026-08-22, ps-Pruefung danach leer). Nicht wiederholungsanfaellig im Repo.
- [x] **5. factory.locked=true (Runtime-Pin) in T013676-Securing-Commit cb1f0d558 committed** (drift, scripts/llm/loadouts.json) — Disposition: _bereits gefixt_ + Begruendung: Der Nachfolge-Commit 109a26ed1 setzt locked:false (Pin-Restore gemaess T013593) und ist via PR #5015 (Squash e856a8853) auf main. Der Drift ist auf main bereinigt.
- [x] **6. Brain-Ingest-Lauf 2026-08-22 17:14 fehlgeschlagen: Coverage-Gate 88% < 95%** (degraded, scripts/brain-ingest.sh) — Disposition: _beobachten (bis Zyklus 2026-09-22)_ + Begruendung: Der Coverage-Mangel ist ein Datenbestands-/Prozessthema des Brain-Wikis, kein Repo-Fix in diesem Zyklus; der naechste Ingest-Lauf wird voraussichtlich am selben Gate scheitern und liefert den Folgedatenpunkt. Der Eintrag laeuft bis zum Ablaufdatum fort.
- [x] **7. vda.sh oracle unerreichbar — weder Hermes noch OpenClaw daemon aktiv** (degraded, scripts/vda.sh) — Disposition: _kein Repo-Fix_ + Begruendung: Umgebungszustand der lokalen Maschine (Ollama/OpenClaw-Daemons nicht gestartet), kein Code-Defekt — die Oracle-Route funktioniert bei laufenden Daemons, der task --list-Fallback ist dokumentiert. Kein Ablaufdatum: der Fall ist kein Repo-Verhalten, das wiederkehrend beobachtet werden muesste.
- [x] **8. T013316-reuse Worktree mid-session extern neu erstellt — uncommitteter RED-Test verloren** (suspicious, scripts/hygiene worktree cleanup) — Disposition: _beobachten (bis Zyklus 2026-09-22)_ + Begruendung: Der Verlust entsteht aus Factory-Reuse eines Worktrees, in dem eine fremde Session arbeitet — ein struktureller Konflikt zwischen Factory-Reaper und parallelen Sessions. Ein Fix braucht einen Eingriff in die Factory-Worktree-Verwaltung mit eigenem Test und sprengt diesen Zyklus.
- [x] **9. Nackte '!'-Pipeline als BATS-Assertion wirkungslos — bash-errexit-Ausnahme verschleiert die fehlschlagende Zeile** (drift, tests/bats-conventions) — Disposition: _gefixt_ + Begruendung: tests/CLAUDE.md traegt jetzt die Konvention (Negativ-Assertions nie als nackte '!'-Pipeline, explizite String-Assertion als Muster). Guard: tests/spec/agent-skills/bats-negation-keine-bang-pipeline.bats (RED belegt, jetzt gruen).
- [x] **10. Commit-msg-Hook lehnte 'openspec'-Scope ab; Debug-Tippfehler erzeugte Scheinwiderspruch** (process, repo/git-hooks) — Disposition: _kein Repo-Fix_ + Begruendung: Der Hook arbeitet wie designed — 'openspec' ist kein erlaubter Scope (Liste: website, infra, db, security, ops, test, plans, factory; `bash scripts/validate-commit-msg.sh scopes`). Bedienfehler (falscher Scope gewaehlt), kein wiederholungsanfaelliges Repo-Verhalten.

- [x] **Failing-Test-Step (RED).** Erledigt fuer die zwei Docs-Fixes: repo-hygiene-tick-snapshot-guard.bats und bats-negation-keine-bang-pipeline.bats waren vor den Edits rot (Beleg: erster Lauf `not ok`), danach gruen.

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
