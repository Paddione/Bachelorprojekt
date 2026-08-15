---
title: "mishap-incident-rollup-2026-08-15-T006843 — Implementation Plan"
ticket_id: T006843
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-15-T006843 — Implementation Plan

_Container-Ticket: T006843_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-15 09:37 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-15 08:47 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | process | plan-quality-gates | Plan-Subagenten schreiben invalide Commit-Scopes (llm statt ops) — Gates-Referenz kennt Allowlist nicht |
> | 2 | suspicious | scripts/devflow-post-merge-finalize.sh | devflow-post-merge-finalize hinterlässt uncommitteten status-Flip im geteilten Hauptcheckout |
> | 3 | degraded | scripts/mcp-gateway | mcp-postgres-Readonly-Pfad down: mcp-postgres-local + k3d-postgres-forward seit 06:46 CEST inaktiv |
> | 4 | suspicious | scripts/mcp-gateway | MCP-Gateway-Watchdog blind: probe.sh failt auf allen 4 Ports inkl. funktionierendem 18080 + ExecStartPre-Quoting-Bug |
> | 5 | suspicious | scripts/git-worktree-health.sh | git-worktree-health.sh objects erzeugt False-Befund während laufendem Factory-Tick (wechselnde missing-tree-Sets) |
> | 6 | drift | .github/workflows/freshness-regen.yml | freshness-regen.yml lässt überholte PRs mit aktivem Auto-Merge dauerhaft offen |
> | 7 | suspicious | plan-archive | Archiv-PR #4607 rast gegen nachfolgende Archive und steht im SSOT-Spec-Konflikt |
> | 8 | suspicious | repo/worktrees | Worktree T006842 (Ticket done/shipped) trägt uncommittete Löschungen — 2 Deliverables ungemergt |
> | 9 | drift | scripts/branch-reaper | Reaper-KEEP bei gemergten Branches ist Drift-Artefakt — Allowlist deckt specs/scripts/tests nicht ab |
> | 10 | drift | worktree/npm | npm --package-lock-only schreibt node_modules/.package-lock.json durch Worktree-Symlink |
> 
> **1. Plan-Subagenten schreiben invalide Commit-Scopes (llm statt ops) — Gates-Referenz kennt Allowlist nicht** (process, plan-quality-gates)
> 
> Beide Partial-Plaene fuer T006840 schrieben Commit-Messages mit Scope `llm` vor (`feat(llm):`/`test(llm):`) — commitlint lehnt `llm` ab, der Scope ist seit T002328 zu `ops` konsolidiert. Der Implementer korrigierte das zur Laufzeit (richtig), der Reviewer stufte es als Plan-Defect ein, und der Orchestrator musste die zwei Plan-Dateien nach dem Review nachkorrigieren (Commit 282065cdf). Friction: die plan-quality-gates-Referenz (die jeder Plan-Subagent verbindlich liest) nennt die commitlint-Scope-Allowlist nicht — Plan-Subagenten koennen den Fehler also nicht vermeiden. Vorschlag: in .claude/skills/references/plan-quality-gates.md einen Verweis auf die Scope-Allowlist (commitlint.config.cjs / validate-commit-msg, inkl. Konsolidierungen wie llm→ops) aufnehmen, damit Plaene keine invaliden Commit-Messages mehr vorschreiben.
> **2. devflow-post-merge-finalize hinterlässt uncommitteten status-Flip im geteilten Hauptcheckout** (suspicious, scripts/devflow-post-merge-finalize.sh)
> 
> Beim repo-hygiene-Lauf (2026-08-15 ~07:30 CEST) trug der geteilte Hauptcheckout einen uncommitteten status-Flip (active→completed) in openspec/changes/post-merge-finalize-archive-branch-restore/tasks.md, nachdem der Finalizer für T006791 komplett durchgelaufen war (Fix-PR #4596 + Archiv-PR #4597 gemergt). Der Flip matcht exakt das sed-Muster in scripts/devflow-post-merge-finalize.sh Z. 184, taucht aber im Archiv-Commit 04455ade4 nicht auf (archivierte tasks.md trägt weiterhin status: active). Der sed-Output landet also nirgends — er bleibt als uncommitteter Dreck im geteilten Hauptcheckout liegen (T002357/T006367-Fallenklasse: Hauptcheckout-Verschmutzung durch Parallel-Sessions). Hygiene-Resolution: Datei per git checkout -- wiederhergestellt (Inhalt ist via gemergtem Archiv gesichert). Dauerfix-Kandidat: sed-Output entweder in den Archiv-Commit übernehmen oder aus dem Script entfernen — siehe auch One-Shot scripts/fix-archive-plan-status.sh, der dieselbe Diskrepanz (archivierte Pläne mit status: active) separat behandelt.
> **3. mcp-postgres-Readonly-Pfad down: mcp-postgres-local + k3d-postgres-forward seit 06:46 CEST inaktiv** (degraded, scripts/mcp-gateway)
> 
> Beim repo-hygiene-Lauf (2026-08-15, ~08:15 CEST) war der MCP-Tool mcp-postgres (http://127.0.0.1:13001/mcp, opencode "Unable to connect") sowie localhost:15432 (Connection refused) unerreichbar. Verifiziert: ss zeigt keine Listener auf 13001/15432; systemctl --user status zeigt beide Units mcp-postgres-local.service und k3d-postgres-forward.service inactive (dead) seit 2026-08-15 06:46:13 CEST (Stop/Start-Zyklen 06:46:04–06:46:13, danach stillgelegt — Restart=always greift bei sauberem Stop nicht). Der k3d-Pod workspace/shared-db ist Running 1/1 — nur der Forward fehlt. Damit ist der kanonische Readonly-DB-Pfad für Agenten (mcp-tool-guide §mcp-postgres) down; ticket-mcp funktioniert weiter (Fallback genutzt). Möglicher Zusammenhang mit in-flight T006335 (Härtung genau dieses Gateways, PR #4601 offen) — Operator soll verifizieren und ggf. systemctl --user restart k3d-postgres-forward mcp-postgres-local ausführen.
> **4. MCP-Gateway-Watchdog blind: probe.sh failt auf allen 4 Ports inkl. funktionierendem 18080 + ExecStartPre-Quoting-Bug** (suspicious, scripts/mcp-gateway)
> 
> Verifiziert während repo-hygiene-Lauf 2026-08-15: (1) probe.sh meldet "FAIL port X: not an MCP initialize response" für alle vier Ports (18080/13000/13001/13002) — auch für 18080, über den reale MCP-Traffic (mcp-kubernetes) nachweislich funktioniert (MCP-Calls im selben Zeitraum erfolgreich). Der Watchdog kann damit echte Tunnel-Ausfälle nicht mehr von Gesunden unterscheiden. (2) mcp-gateway-watchdog.service: ExecStartPre enthält Inline-Shell-Logik (`test -f … && find … && … || true`), die systemd nicht ausführt — Journal zeigt bei jedem Tick-Lauf "/usr/bin/test: extra argument '&&'". Rate-Limit-Vorcheck und damit die dokumentierte Restart-Logik (T002543) greifen nicht.
> **5. git-worktree-health.sh objects erzeugt False-Befund während laufendem Factory-Tick (wechselnde missing-tree-Sets)** (suspicious, scripts/git-worktree-health.sh)
> 
> Beim repo-hygiene-Lauf 2026-08-15 meldete scripts/git-worktree-health.sh objects einen BEFUND (rc=1): git fsck zeigte "missing commit/tree"-Zeilen. Gegenprobe: (a) die missing-Sets wechselten zwischen zwei Läufen (Minutenabstand), (b) ein gemeldeter Tree-SHA (afc0e35cc…) war identisch mit dem Ergebnis meines eigenen git merge-tree --write-tree-Probes für fix/watchdog-factory-excluded-scope-T006364 — der Factory-Tick führt dieselben Probes aus und schreibt dabei Objekte. Nach Tick-Ende: fsck ohne missing/error-Zeilen, Check rc=0. Der Check hat — anders als der Worktree-Remove-Pfad (T003227) — keinen Tick-Vorcheck und emittiert bei laufendem Tick einen von echter Korruption ununterscheidbaren Befund. Vorschlag: tick_running()-Guard (wie §1) vorschalten oder missing-only-Zeilen als HINWEIS statt BEFUND werten, solange keine 0-Byte-Objekte vorliegen.
> **6. freshness-regen.yml lässt überholte PRs mit aktivem Auto-Merge dauerhaft offen** (drift, .github/workflows/freshness-regen.yml)
> 
> Verifiziert: PR #4616 (run 31869907522) verlor das Rennen gegen #4617 (merged 06:42 UTC) und stand danach permanent auf CONFLICTING mit aktivem Auto-Merge — das Workflow (.github/workflows/freshness-regen.yml) kennt keinen Close/Cleanup-Pfad für überholte Regens, und Plain-Auto-Merge kann den Konflikt nie auflösen. Erste beobachtete Instanz (alle früheren Regens sind merged). Vom Hygiene-Lauf geschlossen (07:13 UTC) und Branch via Reaper abgeräumt — die Lücke bleibt: jeder künftige Rennverlierer leckt erneut.
> **7. Archiv-PR #4607 rast gegen nachfolgende Archive und steht im SSOT-Spec-Konflikt** (suspicious, plan-archive)
> 
> Verifiziert via git merge-tree (rc=1, einziger Konflikt: openspec/specs/software-factory.md). Der Archiv-Branch für T006303 wurde 06:15 UTC geschnitten; danach landeten #4604/#4606/#4610/#4613 auf main und veränderten denselben Spec (u. a. factory_excluded-Sektion, Delta-Marker-Footer). Green-CI + Auto-Merge nützen nichts — der Konflikt ist dauerhaft. Eigenständiger Fehlermodus neben T006369 (Pre-Archiv-Status-JSON) und T006371 (fehlendes Status-JSON): Archiv-PRs, die main-Rennen verlieren, bekommen Spec-Konflikte. Remediation dokumentiert im PR-Kommentar.
> **8. Worktree T006842 (Ticket done/shipped) trägt uncommittete Löschungen — 2 Deliverables ungemergt** (suspicious, repo/worktrees)
> 
> Verifiziert: .worktrees/unterstuetzermodelle-device-scripts-T006842 hat 4 uncommittete Löschungen (die via #4614 gemergten pk-devices-Dateien) im Working Tree, und der Branch feature/unterstuetzermodelle-device-scripts-T006842 enthält 2 nie gemergte Deliverables (run-bootstrap-admin.cmd, run-startup.cmd — Doppelklick-Wrapper für die gemergten Startup-Scripts). Ticket T006842 ist done/shipped. Entweder steht ein Follow-up-PR aus oder die Arbeit liegt verlassen da — Worktree wurde bewusst NICHT entfernt (Fail-Closed).
> **9. Reaper-KEEP bei gemergten Branches ist Drift-Artefakt — Allowlist deckt specs/scripts/tests nicht ab** (drift, scripts/branch-reaper)
> 
> Deep-Clean-Analyse (2026-08-15, repo-hygiene §6-Empfehlung): 17/17 analysierte KEEP-Branches aus `branch-reaper.sh --sweep --dry-run` waren nachweislich längst in main (Blob-Nachweis per `--find-object` bzw. Nachfolge-Branch mit anderem Namen). Ursache: Der Reaper verlangt für ALLE Blob-Abweichungen Allowlist-Konformität, die Allowlist deckt aber `openspec/specs/*`, `openspec/changes/archive/*`, `scripts/*`, `.claude/skills/*`, `tests/*` nicht ab — nach Squash-Merge + main-Evolution ist fast jeder gemergte Branch „abweichend" und bleibt liegen. Verifikation: Subagent-Report mit Blob-SHAs je Branch (Tier A: 10 via gemergte PRs #4091/#4397/#4405/#4444/#4466/#4501/#4514/#4524/#4526/#4578; Tier B: 7 via Nachfolge-Branches). Kandidat für die T005958-Vorgehensweise (PR-Status statt Ticket-Status), verallgemeinert auf gemergte Branches.
> **10. npm --package-lock-only schreibt node_modules/.package-lock.json durch Worktree-Symlink** (drift, worktree/npm)
> 
> Beim Dep-Bump (T006997) im Worktree schrieb `npm install --package-lock-only` trotzdem `brett/node_modules/.package-lock.json` — über den node_modules-Symlink landete der Write im Hauptcheckout (mtime 1786300954 → 1786782441 beobachtet, Website/.modules.yaml blieb unberührt). Der Hauptcheckout-Marker beschrieb danach den Worktree-Lockstand (Desync). Repariert per Gegenlauf `npm install --package-lock-only` im Hauptcheckout (git-Status danach sauber). Es fehlt ein npm-Äquivalent zu scripts/guard-pnpm-install.sh (der Guard ist pnpm-only).

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
