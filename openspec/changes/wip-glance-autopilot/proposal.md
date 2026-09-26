# Proposal: wip-glance-autopilot

## Why

Der sdlc-autopilot-Loop sieht nur den **Ticket-Stand**. Was daneben liegen
bleibt, sieht er nicht: unfertige Worktrees ohne Plan und ohne PR, liegen
gebliebene Stashes, Branches ohne Ticket. In dieser Repo-Sitzung kostete das
real Arbeit — `scripts/llm/bench-orchestration.mjs` lag ueber Stunden in
einem Worktree, den niemand mehr beanspruchte, und der Cleanup-Entscheid
("loeschen oder sichern?") fiel erst nach zwei Hygiene-Laeufen.

Zusaetzlich soll die zweite GPU (RTX 3060 Ti, Qwen3.5-4B-MTP auf `:1920`) und
der PK-Tablet im LAN (LM Studio auf `:1234`) **arbeiten** statt nur zu
existieren. Der Benchmark `scripts/llm/measurements/2026-09-26-orchestration-4b.md`
zeigt: 4B-Modelle loesen unter 60 % — gut genug zum Lesen und Einordnen,
zu schwach zum Schreiben.

## What

- `scripts/wip-glance.sh` — read-only Uebersicht ueber WIP: Worktrees
  (Zustand `live` / `unlocked-dirty` / `abandoned` / `idle`), Agent-Locks,
  offene PRs, unmerged Branches, Stashes. `--json`, `--quiet`,
  `--stale-hours`.
- `scripts/wip-finish.sh` — **fail-closed** Planer/Ausfuehrer fuer
  liegengebliebenes WIP. Standard ist Planlauf; `--apply` **und** `--allow`
  noetig. Ein 4B-Rail triagiert nur (`ACT=<aktion>|REASON=<kurz>`) und
  schreibt nie Repo-Inhalt; eine nicht angebotene Aktion wird verworfen.
  Einzige Schreibaktion `commit-dirty` verlangt einen eigenen Live-Lock.
- 2× BATS-Suiten (`tests/spec/scripts/`) und ein gezielter Eintrag in
  `.opencode/skills/sdlc-autopilot/SKILL.md`.

## Keepers

- `scripts/branch-reaper.sh`, `scripts/worktree-list.sh`,
  `scripts/agent-lock.sh` bleiben die spezialisierten Werkzeuge; die neuen
  Skripte **rufen** sie auf, statt ihre Logik zu duplizieren.
- `wip-glance.sh` ist read-only, `wip-finish.sh` im Default read-only.
- Der Merge-/Push-/Delete-Pfad bleibt beim Orchestrator.

_Ticket: T900481_
