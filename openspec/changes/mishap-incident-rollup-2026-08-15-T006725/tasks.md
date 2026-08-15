---
title: "mishap-incident-rollup-2026-08-15-T006725 — Implementation Plan"
ticket_id: T006725
domains: [factory]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# mishap-incident-rollup-2026-08-15-T006725 — Implementation Plan

_Container-Ticket: T006725_

Automatisch erzeugt von `scripts/factory/mishap-rollup.sh` [T002407] am
2026-08-15 04:33 UTC. Die Eintraege stammen aus den
Batch-Kommentaren des Container-Tickets "Mishap Rollup — fortlaufende Sammlung".

## File Structure

```
<Der Implementer traegt hier die tatsaechlich geaenderten Dateien nach>
```

## Mishap-Batches

### Mishap-Rollup — 10 Eintraege (2026-08-15 03:59 UTC)

| # | Typ | Komponente | Titel |
|---|---|---|---|
| 1 | process | session-koordination | Doppelbelegung von Worktrees durch parallele Sessions |
| 2 | degraded | infra/wsl-networking | WSL: HF-CloudFront-Downloads hingen in IPv6-SYN-SENT; gai.conf-Fix noetig |
| 3 | degraded | gh-cli | gh api transient network error bei PR-Suche im ticket-ops-Lauf |
| 4 | degraded | ticket-mcp | mishap-Buffer-Write meldet Erfolg, schreibt aber nicht, wenn Repo-Root nicht aufloesbar |
| 5 | drift | mcp-task-runner (registry: docs/agent-guide/registry/mcp.yaml) | 10 mcp-task-runner-Prozesse laufen mit ersetzter/gelöschter Binary |
| 6 | process | dev-flow / ticket-dispatch | Doppelbearbeitung T006285: Chore-Merge schloss Ticket unter gestagtem Fix-Plan |
| 7 | process | ticket-ops/dispatch | Welle-1-Dispatch kollidierte mit paralleler ticket-ops-Session (T006348 Doppel-Plan, T006285/T006368 verwaiste Pläne) |
| 8 | process | agent-lock | Drei orphaned Branch-Locks mit toten PIDs — Heartbeat lief nie, nur manueller Reap half |
| 9 | drift | factory | Merge-ohne-Close + Re-Work: T006348-Fix war 03:49Z gemergt, Sessions planten 05:17–05:40 nach |
| 10 | suspicious | gh | gh pr list lieferte stale PR-State (OPEN für einen seit 2h gemergten PR) |

**1. Doppelbelegung von Worktrees durch parallele Sessions** (process, session-koordination)

Parallel-Welle 2026-08-15: Zwei Claude-Sessions fuhren Implementer in denselben Worktrees (T006295 ticket-ops-stale-triage, T006329 branch-reaper-sweep-empty-answer) — doppelte Agenten pro Branch, fremder PR + Auto-Merge (#4539) vor meinem Review-Gate. Aufklärung nur per Cross-Session-Nachrichten; Lock-Inhaber SID 120a229a war zunächst keiner Session eindeutig zuzuordnen (held-stale). Kein Datenverlust, aber 2 Agentenläufe verpufften.
**2. WSL: HF-CloudFront-Downloads hingen in IPv6-SYN-SENT; gai.conf-Fix noetig** (degraded, infra/wsl-networking)

Während T006361 (Finetune-Lauf 1) blockierte das WSL-IPv6-Routing Modell-Shard-Downloads von HF-CloudFront: huggingface_hub (httpx/urllib3) versuchte zuerst IPv6 (2600:9000:...) und hing dort in SYN-SENT-Retry — 20M Cache-Fortschritt in ~5 Minuten, keine Shards. curl kam über Happy-Eyeballs auf IPv4 (52.222.136.x) durch. Fix (verifiziert): /etc/gai.conf um 'precedence ::ffff:0:0/96  100' ergänzt (Backup: /etc/gai.conf.bak-20260815) — danach getaddrinfo IPv4-first, Shard-Download 18 MB/s. Der erste Versuch, die Zeile anzuhängen, schlug fehl, weil grep -q auf die auskommentierte Vorbildzeile matchte. Betrifft künftige große HF-Downloads in dieser WSL-Distro.
**3. gh api transient network error bei PR-Suche im ticket-ops-Lauf** (degraded, gh-cli)

Beim ticket-ops-Lauf 2026-08-15 schlug gh pr list --state merged --search T004893 mit error connecting to api.github.com fehl; unmittelbare Re-Probe (gh pr view 4540) liefert RC=0/MERGED. Transient, selbst geheilt per git-log-Fallback — kein Impact auf den Lauf, aber ein API-Ausfall am Beleg-Pfad.
**4. mishap-Buffer-Write meldet Erfolg, schreibt aber nicht, wenn Repo-Root nicht aufloesbar** (degraded, ticket-mcp)

ticket-mcp-go aus cwd=/tmp gestartet: report_mishap antwortete 'Mishap gespeichert (1/10)', aber kein Buffer-File entstand — findRepoRoot() vom Exe-Pfad (/usr/local/bin) laeuft ins Leere, gitCommonDir('') faellt auf rel. '.git/mishap-buffer.json' zurueck, /tmp/.git existiert nicht, der Write schlaegt still fehl und der In-Memory-Zaehler meldet trotzdem Erfolg. Eintrag ging verloren; Re-Report mit TICKET_MCP_REPO_ROOT=/home/patrick/Bachelorprojekt heilte es (3/10). Kosten: Debug-Schleife im mishap-tracker-Schritt des ticket-ops-Laufs 2026-08-15. Fix-Kandidat: WriteError nicht schlucken oder Repo-Root-Fallback auf HOME statt rel. cwd.
**5. 10 mcp-task-runner-Prozesse laufen mit ersetzter/gelöschter Binary** (drift, mcp-task-runner (registry: docs/agent-guide/registry/mcp.yaml))

runtime-drift-check.sh (T003825) meldet am 2026-08-15 ~04:45 UTC zehn laufende stdio-Prozesse von /usr/local/bin/mcp-task-runner (Startzeiten 04:15–04:42 UTC), deren /proc/<pid>/exe nicht (mehr) der Registry-Binary aus docs/agent-guide/registry/mcp.yaml entspricht (ersetzt/gelöscht). Verifikation: Guard-Ausgabe liegt vor, 10 Befunde, rc=1. Kein Eingriff durch den Hygiene-Lauf: Die Prozesse gehören parallelen Sessions (Factory-Tick + mehrere claude/opencode-Sessions); laut Guard-Doku ist das Beenden Betreiber-Entscheidung. Auflösung: Prozesse nach Tick-Ende beenden — jeder Server startet beim nächsten Tool-Aufruf neu mit der aktuellen Binary.
**6. Doppelbearbeitung T006285: Chore-Merge schloss Ticket unter gestagtem Fix-Plan** (process, dev-flow / ticket-dispatch)

Während der Chore-Ausführung für T006285 (psql()-Helper auf k3d-mentolder-dev, PR #4564, Merge 03:29:53Z) staggte eine parallele Session am 03:21:51Z einen Fix-Plan auf branch fix/mcp-tool-guide-psql-ticket-ssot-T006285 (failing Test tests/spec/mcp-skill-integration/psql-fallback-ticket-ssot.bats + Delta-Spec). Der Chore-Merge schloss das Ticket done/fixed; der gestagte RED-Test ist gegen main bereits grün (verifiziert), der Plan-Branch ist verwaist (kein Lock-Claim, nie ausgeführt, Artefakte nicht auf main). Empfehlung: Plan-Branch archivieren/löschen und OpenSpec-Change mcp-tool-guide-psql-ticket-ssot verwerfen.
**7. Welle-1-Dispatch kollidierte mit paralleler ticket-ops-Session (T006348 Doppel-Plan, T006285/T006368 verwaiste Pläne)** (process, ticket-ops/dispatch)

ticket-ops Welle-1-Dispatch (2026-08-15 ~05:05 CEST) kollidierte mit einer parallelen ticket-ops-Session, die denselben Triagе-Scope auf eigenen Branch-Slugs plante. T006348: zwei Plan-Branches parallel (fix/post-merge-finalize-guards vs. fix/devflow-finalize-hardening) — mein Stage trug am Ende den plan_ref, der Peer-Lock wurde inzwischen freigegeben; Race ist ohne Guard wiederholbar. T006285 und T006368: Peer-Pläne wurden durch meine chore-Merges (PR #4564, #4570) verwaist — von den jeweiligen Subagenten bereits am Ticket dokumentiert und gemeldet. Beleg: agent-lock list (05:01 und ~05:15 CEST), gh pr view 4564/4570 (MERGED), ticket_plans/plan_ref-Kommentare. Empfehlung: Branch-Slug-Koordination bzw. plan_ref-Race-Guard zwischen parallelen Sessions; verwaiste Branches (fix/mcp-tool-guide-psql-ticket-ssot-T006285, fix/spec-junit-shard-ignore-T006368, ggf. fix/devflow-finalize-hardening-T006348) und OpenSpec-Changes via repo-hygiene abräumen.
**8. Drei orphaned Branch-Locks mit toten PIDs — Heartbeat lief nie, nur manueller Reap half** (process, agent-lock)

Beim ticket-ops-Eskalationslauf 2026-08-15 (T006348/T006368-Konsolidierung) hingen drei Branch-Locks (fix/devflow-post-merge-finalize-guards-T006348, fix/spec-junit-shard-ignore-T006368, chore/spec-junit-shard-ignore-T006368), deren owner_pid tot war. Alle drei trugen heartbeat_at == created_at (nur der Claim-Heartbeat, danach nichts) — die Heartbeat-/Expiry-Mechanik griff nicht, ein `agent-lock.sh reap` war nötig. Zwei der Locks stammten von einer Session, die längst auf anderen Branches weiterarbeitete (eb9d9c73, neue Locks auf T005593-Rollup und T006361). Verwaiste Locks blockieren Dispatch und Cleanup, bis manuell gereapt wird.
**9. Merge-ohne-Close + Re-Work: T006348-Fix war 03:49Z gemergt, Sessions planten 05:17–05:40 nach** (drift, factory)

Fortsetzung des Musters aus T006297: PR #4572 (T006348, Merge-Status-Guard+cwd) war 2026-08-15 03:49Z gemergt, das Ticket blieb plan_staged/offen (der defekte Finalizer ist selbst der Ticket-Gegenstand). Drei Parallelsessions legten danach (05:17–05:40) zwei weitere Plan-Branches + einen dritten Implementierungs-Worktree für dasselbe Ticket an; T006368 wurde über zwei PRs doppelt gemergt (#4570 03:41Z, #4563 03:43Z) und trotzdem um 05:17–05:37 erneut bearbeitet. Watchdog-Re-Dispatch auf bereits gemergte Fixes kostet weiterhin komplette Agentenläufe (hier: 2 verwaiste Sessions, 3 Dead-Locks, 1 Eskalation).
**10. gh pr list lieferte stale PR-State (OPEN für einen seit 2h gemergten PR)** (suspicious, gh)

Im Eskalationslauf 2026-08-15 ~05:45 meldete `gh pr list --state all --json state` den PR #4563 als OPEN, obwohl er seit 03:43Z MERGED war (mergeCommit e05c19bfa); `gh pr view 4563` zeigte sofort den korrekten Zustand. Die list/search-API antwortete damit aus einem stale Cache. Konsequenz: Triage-Entscheidungen, die auf `gh pr list` aufsetzen, können Duplikat-Work ableiten, wo keiner ist. Gegenprobe (`gh pr view` pro Kandidat) vor Lösch-/Close-Entscheidungen bleibt nötig.

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
