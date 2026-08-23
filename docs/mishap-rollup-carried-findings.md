# Übernommene Befunde aus dem abgebauten Mishap-Rollup [T014104]

Der Mishap-Rollup-Automat wurde mit T014104 abgebaut. Beim Abbau lagen **sechs** Container-Changes
vom 2026-08-22 unarchiviert auf `main`. Ihre Delta-Dateien waren strukturell nicht archivierbar:
der Generator benannte sie nach dem **Change**-Slug statt nach dem Parent-SSOT-Slug, also zeigten
sie auf `openspec/specs/mishap-incident-rollup-<datum>-<id>.md` — eine Datei, die nie existierte.
`openspec.sh archive` lehnte jeden der sechs mit `Target … does not exist` ab. Genau deshalb sind
sie liegen geblieben.

Die Verzeichnisse wurden daher per `git mv` ins Archiv verschoben. Damit dabei keine Substanz
verloren geht, sind hier alle Befunde festgehalten, die der Automat gesammelt und **nie
disponiert** hat. Sie sind Rohmaterial für Triage, kein Arbeitsauftrag: manche sind längst
behoben, manche waren transient, manche betreffen den Automaten selbst und erledigen sich mit
seinem Abbau.

Reproduktion der Liste (Stand vor dem Abbau, `origin/main` bei `0d56ca413`):

```bash
PRE=0d56ca413
git show "$PRE" --stat >/dev/null   # Stand fixieren
git grep -h '^### Requirement:' "$PRE" -- 'openspec/changes/mishap-incident-rollup-*/specs/*.md' \
  | sed 's/^### Requirement: //' | sort -u
```

## Befunde

1. --only in health-goals-check.sh führte alle Messungen eager aus (Vollscan-Kosten für gezielten Rescan)
2. Ad-hoc git-worktree-Parsing entfernte das falsche Worktree (selbst korrigiert)
3. Bekannte Worktree/Test-Frictions: SID-Drift, BATS stderr-Mixing, pnpm-TTY-Abbruch, commitlint-Scopes
4. Brain-Ingest-Lauf 2026-08-22 17:14 fehlgeschlagen: Coverage-Gate 88% < 95%
5. Carry-over-Eskalations-Tickets haben kryptische Titel aus Task-Zeilen
6. Commit-msg-Hook lehnte 'openspec'-Scope ab; Debug-Tippfehler erzeugte Scheinwiderspruch
7. Commit-msg-Hook-Friction: drei Ablehnungen für Plan-only-Commit (Scope-Rätselraten)
8. Delegation für Review-/Finalizer-Subagenten im Subagent-Kontext unbrauchbar
9. Finalizer-Rezept erzeugte Archive-PR auf veraltetem main — DIRTY bis manueller Rebuild
10. Finalizer-Schritt 7 scheitert, wenn Plan-Datei nur im Worktree liegt
11. Flaky G-CD03 --self-test in CI-Spec-Shards (PR #4959)
12. Hauptcheckout-Patches ohne Ticket/Commit: brain-ingest.sh, brain-ingest-transform.sh, loadouts.json (neuere Iteration)
13. MODIFIED-Deltas schnürten SSOT-Szenarien ein — Archivierung zweimal am Validator gescheitert
14. Merge=Closure griff nicht bei MCP-angelegtem Chore-Ticket (T013675 blieb triage nach gemergtem PR)
15. Mishap-Rollup-Container-Vermehrung: 11 Collect-Mode-Container parallel (Dedupe-Guard-Verstoß)
16. Nackte '!'-Pipeline als BATS-Assertion wirkungslos — bash-errexit-Ausnahme verschleiert die fehlschlagende Zeile
17. OpenSpec-Archiv hinterlässt uncommitteten SSOT-Merge — main verliert Requirements aus archiviertem Change (T013528)
18. Openspec-Change von T012967 nie archiviert — Plan-Scaffold nur unter Reaper-Archiv-Tag erhalten
19. Orphane brain-ingest-Watcher-PID 4065280: pgrep-Selbstmatch, Loop terminiert nie
20. Paralleler Akteur mutiert Hauptcheckout während Hygiene-Lauf — §0-Befund löst sich mid-run auf
21. Plan-Staging übersah spec-gekoppelte BATS-Suiten — Factory-CI-Shard 4 rot
22. Plan-Status-Flip uncommittet im Hauptcheckout statt im PR (T013593 tasks.md)
23. Repo wird während Hygiene-Lauf live mutiert — §0-Patch-Snapshots veralten lautlos
24. Rollup-Eskalation scannt fremde Pläne über Worktree-Namen — False-Positive-needs_human-Tickets
25. SDLC-Skripte defaulten noch auf gemma26-throughput nach qwen38-Cutover
26. T013316-reuse Worktree mid-session extern neu erstellt — uncommitteter RED-Test verloren
27. T013676/T013677-Branches ohne Upstream — Worktree war einzige Kopie der Arbeit
28. Ticket-Claim aus dem Haupt-Checkout traegt den falschen Branch
29. Toter Planner-Session-Lock erzwang --force beim Claim von feature/ki-deck-T013302
30. Uncommittete .opencode/package.json+-Lockfile-Änderungen im mishap-rollup Worktree T013316-reuse
31. Unit-Test drohte, Live-Rollup-Container in Prod-DB anzulegen
32. Verwaiste Factory-Test-Fixtures akkumulieren ohne Sweeper — geleakte SF-REAL-Zeilen sind in der echten Queue dispatchbar
33. agent-lock.sh claim aus Subshell erzeugt SID, die ticket.sh als fremde Session wertet
34. components/website/node_modules unvollstaendig im Haupt-Checkout — pg toter Symlink, tsx ohne dist/
35. export_ticket_timeline schlägt für Brand korczewski fehl (Exit 3, keine Diagnose)
36. factory.locked=true (Runtime-Pin) in T013676-Securing-Commit cb1f0d558 committed
37. freshness:regenerate erzeugt Kollateral-Drift an .opencode/package.json
38. freshness:regenerate erzeugt repo-index.json, plan-preflight verbietet sie im selben Zug
39. gemma26-throughput-Primary weiterhin als Tab-Agent waehlbar
40. gh run list findet Checks nicht beim Rollup-Namen — Job-Name ≠ Workflow-Name liefert leere Messung
41. git-worktree-health.sh objects wertet harmloses dangling als BEFUND (Exit 1)
42. llm_proxy_request_log verliert erfolgreiches Dispatch (Blind Spot bei Incident-Analyse)
43. openspec-embed Post-Commit-Hook timeoutet wiederholt (non-fatal, ~90s/Commit)
44. plan-qa-check.sh uebersprungen — llm-proxy antwortet 503 no_backend
45. stage-plan-Hilfe verschweigt --no-hold, obwohl eine explizite Hold-Entscheidung Pflicht ist
46. svelte-check in components/website nicht installiert — Plan-Verifikationsschritt nicht ausführbar
47. test(mishap-rollup)-Scope fehlt in der test:changed-Allowlist
48. touched_files-Ableitung uebernimmt zitierte Pfade aus Plan-Prosa
49. vda.sh oracle unerreichbar — weder Hermes noch OpenClaw daemon aktiv
50. worktree-create.sh: Skill-Text zeigt Aufruf ohne Pflicht-Pfadargument
