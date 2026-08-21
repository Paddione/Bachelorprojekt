---
title: "mishap-incident-rollup-2026-08-21-T012445 — Implementation Plan"
ticket_id: T012445
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-21-T012445 — Implementation Plan

_Container-Ticket: T012445_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-21 15:56 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

> ### Mishap-Rollup — 10 Eintraege (2026-08-19 12:02 UTC)
> 
> | # | Typ | Komponente | Titel |
> |---|---|---|---|
> | 1 | suspicious | scripts/branch-reaper.sh | branch-reaper --sweep prüft nicht, ob ein Branch in einem lebenden Worktree ausgecheckt ist |
> | 2 | drift | tests/spec (worktree-Fixtures) | BATS-Worktree-Tests lassen leere Fixture-Verzeichnisse unter .worktrees/ liegen |
> | 3 | degraded | llm-proxy | Task dispatch to gemma12 returned empty result (T012645) |
> | 4 | degraded | scripts/branch-reaper.sh | branch-reaper --sweep timeout at 120s with 4 candidates |
> | 5 | suspicious | ticket-mcp | ticket-mcp list_tickets liefert bei komma-separiertem status-Filter still eine leere Liste |
> | 6 | suspicious | scripts/sdlc/kubelet-cert-check.sh | kubelet cert repair still reports matching dual-stack nodes as FAIL |
> | 7 | degraded | local-llm/loadouts | gemma12-vision MTP draft crashes on measured three-slot configuration |
> | 8 | suspicious | health-goals/G-OPS01 | G-OPS01 conflates historical Job debris with live service degradation |
> | 9 | degraded | k3d/backup-cronjob.yaml | db-backup sidecar could retain CPU requests indefinitely |
> | 10 | drift | workspace/ntfy-tokens | ntfy SealedSecret key casing drifted from Deployment contract |
> 
> **1. branch-reaper --sweep prüft nicht, ob ein Branch in einem lebenden Worktree ausgecheckt ist** (suspicious, scripts/branch-reaper.sh)
> 
> Beim Hygiene-Lauf am 2026-08-19 löschte `scripts/branch-reaper.sh --sweep` die Remote-Refs von drei Branches, die zu diesem Zeitpunkt in Worktrees ausgecheckt waren (feature/hybrid-github-actions-runners-T012446, fix/gitlab-runner-crashloop-fix-T012413, chore/agent-md-refresh-T012433). Das Skript merkt das erst nachträglich und meldet "KEEP local <branch> — lokaler Ref nicht entfernbar (z.B. in einem Worktree ausgecheckt)" — der Remote-Ref ist da schon weg.
> 
> Verifiziert: `grep -n 'worktree' scripts/branch-reaper.sh` liefert keinen Treffer, das Skript kennt den Begriff nicht. Die einzige Prüfung ist der PR/Ticket/Blob-Dreiklang.
> 
> Warum es zählt: hier folgenlos, weil alle drei PRs gemergt waren und der Lauf vorher manuell gegengeprüft wurde. Arbeitet aber eine parallele Session in so einem Worktree und hat ungepushte Commits, verliert sie ohne Vorwarnung ihren Upstream mitten im Lauf — und der Reaper-Archiv-Tag deckt nur den Stand ab, der zum Löschzeitpunkt auf dem Remote lag.
> 
> Naheliegender Zuschnitt: `git worktree list --porcelain` vor der Löschentscheidung auswerten und einen ausgecheckten Branch als KEEP mit eigener Begründung führen — analog zum bestehenden "offener pull request"-KEEP.
> **2. BATS-Worktree-Tests lassen leere Fixture-Verzeichnisse unter .worktrees/ liegen** (drift, tests/spec (worktree-Fixtures))
> 
> Am 2026-08-19 meldete `scripts/git-worktree-health.sh orphans` vier Orphan-Worktrees im Arbeits-Worktree e2e-korczewski-skip-T012489: .worktrees/t002375-p2-mine, .worktrees/t002412-aaa, .worktrees/t002412-lebend, .worktrees/t002412-zzz.
> 
> Verifiziert vor dem Aufräumen: alle vier waren leere Verzeichnisse (`ls -a` zeigte nur . und ..), angelegt um 02:09 — also Fixture-Reste eines BATS-Laufs, keine echten Worktrees. Sie wurden per rmdir entfernt, danach meldete der Guard sauber.
> 
> Warum es zählt: der Orphan-Guard ist ein Sicherheitsnetz für echten Objektspeicher-Schaden. Wenn Testläufe ihn routinemäßig mit leeren Fixture-Verzeichnissen füllen, wird sein Befund zum Rauschen und ein echter Orphan fällt nicht mehr auf. Die Namen (t002412-*, t002375-*) zeigen auf die Worktree-Tests dieser Ticket-Nummern — deren teardown räumt das angelegte Verzeichnis nicht ab.
> **3. Task dispatch to gemma12 returned empty result (T012645)** (degraded, llm-proxy)
> 
> Dispatching T012645 to gemma12 via task tool returned empty result. Polling job_id with get_task_result returned "job not found". Task may have timed out or been lost in the proxy queue. Second dispatch attempt was cancelled by user. Not a blocker — user handles T012645 manually.
> **4. branch-reaper --sweep timeout at 120s with 4 candidates** (degraded, scripts/branch-reaper.sh)
> 
> First --sweep run timed out at 120s after deleting 2 of 4 REAP candidates. The pre-push hooks (quality:check, validate-commit-msg) run on each delete, adding ~30s per branch. 180s timeout sufficed on retry. Consider raising default timeout or batching remote deletes.
> **5. ticket-mcp list_tickets liefert bei komma-separiertem status-Filter still eine leere Liste** (suspicious, ticket-mcp)
> 
> Beobachtet im repo-hygiene-Lauf 2026-08-19.
> 
> `mcp__ticket-mcp__list_tickets({ status: "triage,ready,in_progress,blocked", limit: 50 })` antwortete mit `[]` — ohne Fehler, ohne Hinweis. Derselbe Aufruf mit `status: "triage"` liefert korrekt T012900 zurueck. Der Filter wird offenbar als ein einzelner Statuswert behandelt und matcht dann nichts, statt die Liste zu splitten oder den ungueltigen Wert abzulehnen.
> 
> Wirkung: Genau die Fehlerklasse, vor der repo-hygiene-ops §3 warnt ("eine leere Antwort ist kein Urteil"), hier im Werkzeug selbst. Ein Aufrufer, der mehrere Status auf einmal abfragt, liest "keine offenen Tickets" und uebersieht den gesamten Backlog. Im Lauf stand der leeren Antwort ein `factory_status.backlog = 1` gegenueber — nur diese Gegenprobe hat den Fehler sichtbar gemacht.
> 
> Reproduktion:
  > mcp__ticket-mcp__list_tickets({ status: "triage,ready,in_progress,blocked", limit: 50 })  -> []
  > mcp__ticket-mcp__list_tickets({ status: "triage", limit: 10 })                            -> T012900
> 
> Erwartetes Verhalten: Entweder die Komma-Liste unterstuetzen (OR-Filter) oder einen ungueltigen Statuswert mit Fehler ablehnen. Ein stilles leeres Ergebnis ist beides nicht.
> 
> Dedupe geprueft (beide Quellen, §4): kein offenes Ticket mit gleichem Titel, kein Eintrag im Mishap-Buffer (Stand 4/10).
> **6. kubelet cert repair still reports matching dual-stack nodes as FAIL** (suspicious, scripts/sdlc/kubelet-cert-check.sh)
> 
> After --repair, both nodes had their current IPv4 SANs, kubectl exec recovered, but kubelet-cert-check.sh still printed FAIL because Node-IP output also contained IPv6 while SAN parsing showed an anomalous literal 0. This can make a successful repair look unsuccessful.
> **7. gemma12-vision MTP draft crashes on measured three-slot configuration** (degraded, local-llm/loadouts)
> 
> The managed gemma12-vision start on llama.cpp b10241 repeatedly failed loading mtp-gemma-4-12B-it.gguf with vector::_M_range_check, despite loadouts.json documenting this exact MTP configuration as measured. Service recovered by launching the same loadout without speculative MTP; throughput is degraded and the workaround is transient.
> **8. G-OPS01 conflates historical Job debris with live service degradation** (suspicious, health-goals/G-OPS01)
> 
> The reported 59 unhealthy pods consisted of 55 Job-owned pods plus three obsolete ReplicaSet pods and only a small number of live faults. After repairing scheduled-publish, the raw count remained 58 because historical failed/NotReady Jobs dominate the metric.
> **9. db-backup sidecar could retain CPU requests indefinitely** (degraded, k3d/backup-cronjob.yaml)
> 
> Verified in fleet/workspace: 20 daily Jobs had backup terminated with exit 0 while filen-upload remained Running after the emptyDir completion marker was lost. concurrencyPolicy Allow accumulated them until the PVC node reached 96% requested CPU. Recovered and fixed by PR #4842.
> **10. ntfy SealedSecret key casing drifted from Deployment contract** (drift, workspace/ntfy-tokens)
> 
> Verified in fleet/workspace: Deployment required NTFY_TOKEN_OPENCODE, while controller-owned ntfy-tokens exposed NTFY_TOKEN_OPEncode. The SealedSecret was corrected in place without exposing or rotating token material, and rollout completed.
> Watchdog: pipeline stale > 0min (no phase progress write, class=INFRA). Plan already staged (FACTORY-PLAN-REF branch=chore/mishap-incident-rollup-2026-08-19-T012445 plan=openspec/changes/mishap-incident-rollup-2026-08-19-T012445/tasks.md) — resuming via plan_staged instead of restarting from Scout. [INFRA ?/3 | tier=flash]
> Watchdog: pipeline stale > 0min (no phase progress write, class=INFRA). Plan already staged (FACTORY-PLAN-REF branch=chore/mishap-incident-rollup-2026-08-19-T012445 plan=openspec/changes/mishap-incident-rollup-2026-08-19-T012445/tasks.md) — resuming via plan_staged instead of restarting from Scout. [INFRA ?/3 | tier=flash]
> Watchdog: pipeline stale > 0min (no phase progress write, class=INFRA). Plan already staged (FACTORY-PLAN-REF branch=chore/mishap-incident-rollup-2026-08-19-T012445 plan=openspec/changes/mishap-incident-rollup-2026-08-19-T012445/tasks.md) — resuming via plan_staged instead of restarting from Scout. [INFRA ?/3 | tier=flash]
> Watchdog: pipeline stale > 30min (no phase progress write, class=INFRA). Plan already staged (FACTORY-PLAN-REF branch=chore/mishap-incident-rollup-2026-08-19-T012445 plan=openspec/changes/mishap-incident-rollup-2026-08-19-T012445/tasks.md) — resuming via plan_staged instead of restarting from Scout. [INFRA 1/3 | tier=haiku]
> Watchdog: pipeline stale > 30min (no phase progress write, class=INFRA). Plan already staged (FACTORY-PLAN-REF branch=chore/mishap-incident-rollup-2026-08-19-T012445 plan=openspec/changes/mishap-incident-rollup-2026-08-19-T012445/tasks.md) — resuming via plan_staged instead of restarting from Scout. [INFRA 1/3 | tier=haiku]
> Watchdog: pipeline stale > 30min (no phase progress write, class=INFRA). Plan already staged (FACTORY-PLAN-REF branch=chore/mishap-incident-rollup-2026-08-19-T012445 plan=openspec/changes/mishap-incident-rollup-2026-08-19-T012445/tasks.md) — resuming via plan_staged instead of restarting from Scout. [INFRA 2/3 | tier=sonnet]
> Unfactored: die Software Factory hat dieses Ticket nach INFRA-3 erfolglosen Watchdog-Runden abgegeben.
> 
> Status=blocked, attention_mode=needs_human, readiness.factory_excluded=true — queue.sh dispatcht es in KEINEM Zweig mehr, auch nicht nach einem Statuswechsel.
> 
> Letztes Phase-Event: implement/entered @ 2026-08-19 18:22:42.014038+00
> 
> Rueckweg (nur menschlich): ticket.sh plan-meta set --id T012445 --readiness factory_excluded=false

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
