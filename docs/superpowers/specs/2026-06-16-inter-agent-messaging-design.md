---
ticket_id: T000882
plan_ref: docs/superpowers/plans/2026-06-16-inter-agent-messaging.md
status: active
date: 2026-06-16
---

# Inter-Agent-Messaging + Edit-Collision-Detection (hcom-Muster) — Design-Spec

**Ticket:** T000882 · **Branch:** `feature/inter-agent-messaging`
**Quelle des Musters:** [hcom](https://github.com/aannoo/hcom) (headless-commander Inter-Agent-Comms)

## Problem

Parallele Agent-Sessions (Claude Code, Gemini, OpenClaw) teilen sich **einen Checkout / ein
`.git`** und kollidieren heute **still** über den Index: silent reverts, HEAD-Bewegungen,
gegenseitiges `git add -A`. Der dokumentierte Dauerschmerz „Concurrent agent sessions share
the working tree".

`agent-lock.sh` (T000510) löst den **Mutex** (wer hält welchen Ticket-/Branch-/main-Checkout-
Claim) korrekt über atomare Filesystem-Claims — ist aber **passiv**: es weiß *wer woran
arbeitet*, erkennt aber **keine echten Edit-Kollisionen am selben File** und bietet **keinen
Kommunikationskanal** zwischen lebenden Sessions.

## Ziel

Zwei leichte, additive Schichten **auf** den bestehenden Primitiven — kein Ersatz:

1. **Aktive Edit-Collision-Detection** im `.githooks/pre-commit`: warnt, bevor ein Commit
   Dateien anfasst, die eine *andere lebende Session* gerade in-flight hat.
2. **Leichter Inter-Agent-Message-Channel** (hcom-Stil): lebende Sessions können sich
   Nachrichten schicken (broadcast oder gerichtet) und lesen.

## Explizit NICHT-Ziele (verworfene Alternative)

Der ursprüngliche Vorschlag „Plans as SSoT with a coordination Token" (Runtime-Felder
`coordination_token` / `wait` / `published_artifacts` im **committeten** Plan-Frontmatter)
wird **verworfen**, weil er drei bereits existierende, robustere Primitive nachbauen würde:

| Vorschlag-Primitiv | Existiert bereits als | Warum Git-Variante schlechter |
|---|---|---|
| `token claim/release` | `agent-lock.sh` (atomare FS-Claims, Session-ID-Identität) | Git hat **kein atomares compare-and-swap** → zwei Sessions pullen, sehen kein Token, schreiben beide eins, committen → last-push-wins/Konflikt = **kaputter Mutex** |
| `wait <slug>` (blockt bis Dep done) | `scripts/factory/schedule.sh` TDR-2 Dependency-Gate (`unnest(depends_on)`, skip wenn Vorgänger ≠ `done`) | Dependency-aware **Scheduling** > Runtime-Blocking-Wait (verbrennt keine Tokens im Idle; kein commit/push/pull-Zyklus für Sichtbarkeit nötig) |
| `published_artifacts` Handoff | **main als SSoT** (B läuft nach A's Merge, liest aus main) + `dev-flow-batch` Modus 2 (shared Interface-Contract zur **Plan**-Zeit) | Git-Frontmatter als Runtime-IPC-Bus dupliziert die Migration/den Code, die schon committet sind |

→ Diese Spec **ergänzt** `agent-lock.sh`/`conflict-check.sh`, statt sie zu ersetzen.

## Bestehende Bausteine (Integrationspunkte)

- **`scripts/agent-lock.sh`** — Claims als JSON unter `$(git common-dir)/agent-locks/`.
  Jeder Claim speichert u.a. `owner_sid`, `tool`, `label`, **`worktree`**, `branch`,
  `ticket`, `created_at`, `heartbeat_at`. Commands: `claim|refresh|release|check|list|reap|mine`.
  → Liefert **Peer-Discovery** (`list`) und pro Peer den **Worktree-Pfad**.
- **`.githooks/pre-commit`** — hat bereits einen agent-lock-Slot (main-checkout-guard,
  *nur* im main-Checkout, fail-open) + git-crypt-guard + freshness-Autostage.
  → Natürlicher Einhängepunkt für die Kollisionswarnung (läuft in **jedem** Checkout/Worktree).
- **`scripts/factory/conflict-check.sh`** — DB-basierte File-Overlap-Erkennung über
  `tickets.touched_files` (nur `in_progress`/`in_review`). Für den **Factory-Dispatcher**
  zur Scheduling-Zeit. **Bleibt unangetastet** — die neue Live-Erkennung ist die lokale,
  cluster-freie Ergänzung für interaktive Sessions.

## Lösungsdesign

### Komponente A — `scripts/agent-collision.sh` (aktive Kollisionswarnung)

Reines lokales Bash, **kein Cluster/DB** → CI-/offline-sicher.

**`agent-collision.sh check [--staged|--all] [--quiet]`**
1. Ermittelt die eigenen Kandidat-Dateien:
   - `--staged` (default im Hook): `git diff --cached --name-only`
   - `--all`: zusätzlich unstaged `git diff --name-only HEAD`
2. Enumeriert **andere lebende** Claims via `agent-lock.sh list` (eigene SID ausgeschlossen,
   `stale` ausgeschlossen).
3. Für jeden Peer-Claim mit gültigem `worktree`-Feld: dessen In-Flight-Dateien =
   `git -C <peer-worktree> diff --name-only HEAD` ∪ `git -C <peer-worktree> diff --cached --name-only`.
   - Peer-Worktree existiert nicht / ist kein Git-Dir → überspringen (fail-open).
4. Schnittmenge (eigene ∩ Peer) → bei Überlappung pro Datei eine Zeile:
   `⚠ COLLISION: <file> — auch in-flight bei <tool>/<label> (sid <sid>, worktree <wt>)`.
5. Exit-Codes: **0** = keine Kollision; **1** = Kollision(en) gefunden.

**Verhalten im Hook:** WARN, **fail-open** (Standard). Der Hook blockt den Commit **nicht**,
außer `AGENT_COLLISION_STRICT=1` ist gesetzt (dann Exit 1 bei Kollision). Begründung:
getrennte Worktrees berühren legitim dieselben Dateien zeitversetzt; der main-checkout-guard
bleibt das harte Sicherheitsnetz. Konsistent mit der Fail-open-Philosophie des bestehenden
Hooks und dem „never revert after commit"-Gotcha.

**Diskovery-Reuse:** Keine neue State-Datei für „welche Dateien hält wer" — der Worktree-Pfad
steht bereits im Claim, die In-Flight-Dateien liefert Git selbst. Immer akkurat, nichts zu
synchronisieren.

### Komponente B — `scripts/agent-msg.sh` (Inter-Agent-Message-Channel)

Storage: **ein** append-only JSONL `$(git common-dir)/agent-msgs/log.jsonl` (shared über alle
Worktrees, **nie committet** — liegt innerhalb `.git/`). Pro-SID-Cursor-Datei
`agent-msgs/cursor-<sid>` markiert „bis hierher gelesen".

Nachricht (eine JSON-Zeile): `{ "ts", "from_sid", "from_tool", "from_label", "to", "text" }`
(`to` = leer für broadcast, sonst Ziel-SID oder Label).

**Commands:**
- `agent-msg.sh post <text> [--to <sid|label>]` — hängt eine Zeile an. Atomarität: O_APPEND
  ist für <PIPE_BUF (4096 B) POSIX-atomar; zusätzlich `flock` (analog `agent-lock._with_lock`)
  als Gürtel-und-Hosenträger. Text >4 KB → abschneiden + Warnung.
- `agent-msg.sh read [--unread] [--since <epoch>] [--mine]` — liest Zeilen; `--unread` nutzt
  den Cursor und schreibt ihn fort; `--mine` filtert auf `to == eigene SID|Label` + broadcasts.
- `agent-msg.sh tail [-n N]` — letzte N Zeilen menschenlesbar.
- `agent-msg.sh peers` — Bequemlichkeits-Wrapper um `agent-lock.sh list` (wer ist live).

**Peer-Discovery:** über `agent-lock.sh list` (kein eigenes Presence-System).

### Integration in Hook & Workflow

1. **`.githooks/pre-commit`** — neuer advisory Block **nach** dem main-checkout-guard,
   **vor** dem git-crypt-guard: ruft `agent-collision.sh check --staged` auf, gibt Warnungen
   auf stderr aus; blockt nur bei `AGENT_COLLISION_STRICT=1`. Fail-open: wenn das Skript
   fehlt/fehlerhaft ist, Commit läuft normal weiter (`|| true`-Semantik mit Strict-Ausnahme).
2. **`CLAUDE.md` → „Session-Koordination"** — Kontrakt ergänzen: zu Skill-Start
   `agent-msg.sh read --unread` (offene Nachrichten sichten); vor dem Anfassen geteilter
   Registry-Dateien (`k3d/configmap-domains.yaml`, `environments/schema.yaml`) optional
   `agent-msg.sh post "berühre <datei> auf <branch>"`.
3. **`dev-flow-plan` / `dev-flow-execute` (leicht):** in die bestehenden agent-lock-Schritte
   eine `agent-msg.sh read --unread`-Zeile aufnehmen (rein additiv, keine neue Pflicht-Logik).
   **Keine** Factory-Dispatcher-Änderung nötig — der pre-commit-Hook deckt Factory-Worktree-
   Agenten automatisch ab.

### Reaper-Robustheit (Lesson aus diesem Branch)

`agent-lock.sh reap` löscht via `git branch -d` alle in `main` gemergten Branches ohne
Upstream — ein **frisch erstellter Branch mit 0 Commits** zeigt auf `main`s HEAD, gilt als
„merged" und wird (samt Worktree) gelöscht. Beim Bauen daher: **sofort nach worktree-create
einen ersten Commit + push** absetzen (Branch ist `main` voraus + hat Upstream → reaper-sicher).
Optional als Härtung im Plan erwägen: `cmd_reap` so anpassen, dass Branches übersprungen
werden, deren Worktree noch lebt (`git worktree list`) — separat bewerten, nicht Kern-Scope.

## Testbarkeit (offline, BATS)

- `tests/unit/agent-collision.bats` — Fixture: zwei Worktrees via `git worktree add` in
  `$BATS_TMPDIR` (CLAUDE.md Dev-Rule #8: außerhalb des Trees, teardown-Cleanup), Claims über
  `AGENT_LOCK_DIR`-Override, `AGENT_LOCK_FAKE_ALIVE`/`AGENT_LOCK_SID` für Liveness/Identität.
  Fälle: Überlappung → Exit 1 + richtige Zeile; keine Überlappung → Exit 0; stale Peer →
  ignoriert; Peer-Worktree fehlt → fail-open Exit 0.
- `tests/unit/agent-msg.bats` — `AGENT_LOCK_DIR`/common-dir-Override: post→read roundtrip,
  `--unread` Cursor-Fortschritt, gerichtete `--to`-Filterung, broadcast, >4 KB-Truncation.
- Beide ins `task test:all` einhängen (BATS-Runner) — Coverage-Guard-Konvention: jeder neue
  `tests/unit/*.bats` muss laufen-oder-allowlisten.

## Quality-Gates (S1–S4)

- **Neue Dateien** (`agent-collision.sh`, `agent-msg.sh`, 2 bats) → S1-Baseline 0, Budget =
  Limit; klein halten.
- **`.githooks/pre-commit`** wächst um ~6–8 Zeilen → S1-Budget gegen Baseline prüfen
  (`jq '.["S1:.githooks/pre-commit"]' docs/code-quality/baseline.json`); bei Budget≈0
  zeilenneutral integrieren oder Hook-Logik in den Helfer auslagern.
- **S2**: beide Skripte pure Module, keine Import-Zyklen.
- **S3**: keine Brand-Domain-Literale (die genannten Registry-Pfade sind generisch).
- **S4**: neue Skripte werden referenziert (pre-commit → collision; CLAUDE.md/Skills → msg),
  nicht verwaist.

## Abnahmekriterien

1. Zwei lebende Sessions in getrennten Worktrees, beide ändern `X`: der zweite Commit zeigt
   die `⚠ COLLISION: X`-Warnung (und blockt mit `AGENT_COLLISION_STRICT=1`).
2. `agent-msg.sh post`/`read` roundtrip funktioniert über Worktree-Grenzen (shared common-dir).
3. `--unread` liefert jede Nachricht genau einmal pro SID.
4. Offline: alle BATS-Tests grün ohne Cluster; in `task test:all` eingehängt.
5. Fail-open: fehlt ein Peer-Worktree oder das Skript, läuft der Commit normal durch.
6. `conflict-check.sh` und `agent-lock.sh` bleiben funktional unverändert.
