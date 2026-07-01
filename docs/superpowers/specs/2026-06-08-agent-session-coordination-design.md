---
title: "Session-Koordinationsschicht: Anti-Kollision für parallele Agenten"
ticket_id: T000510
domains: [infra]
status: active
pr_number: null
---

# Design: Session-Koordinationsschicht für parallele Agenten

**Ticket:** T000510
**Branch:** feature/agent-session-coordination
**Datum:** 2026-06-08

---

## 1. Überblick

### Problem

Mehrere Agenten-Sessions (Claude + Gemini, teils zwei Claude-Fenster) laufen gleichzeitig
im selben Checkout bzw. teilen sich das selbe `.git`. Das führt zu vier beobachteten
Kollisionsklassen:

1. **Doppelarbeit** — zwei Sessions schnappen sich dasselbe Ticket/denselben Branch
   (real passiert bei Slice 4 / T000467: zwei Sessions „completed" gleichzeitig dieselbe Arbeit).
2. **Race im main-Checkout** — zwei Sessions mutieren gleichzeitig denselben Arbeitsbaum
   (Index/HEAD/Dateien), v. a. im Chore-Pfad ohne Worktree → stille Reverts, `git add -A`
   aus der anderen Session, verschobener HEAD.
3. **Geteilte Registry-Dateien** — disjunkte Feature-Branches kollidieren trotzdem auf
   `k3d/configmap-domains.yaml` / `environments/schema.yaml` beim Merge.
4. **Zombies & stale Worktrees** — verwaiste Test-/Node-Prozesse (cwd zeigt auf gelöschten
   Worktree) + nach Merge nicht aufgeräumte Worktrees.

### Lösung (ein Satz)

Eine geteilte, dateibasierte **Claim-Registry** unter dem geteilten `.git/`, eine
tool-agnostische **Lock-Library** (`scripts/agent-lock.sh`), **vier Guards** an
Lifecycle-Punkten, ein **Reaper** für tote Zustände — plus **harte Durchsetzung** der
gefährlichen main-Checkout-Mutation über den bestehenden `.githooks/pre-commit`.

### Gewählter Ansatz

Hybrid: dateibasierte advisory Claims (cross-tool via gemeinsames Script + Instruktionen in
CLAUDE.md/GEMINI.md) + **ein** harter, tool-agnostischer Git-Hook für die einzige Kollision,
die ein vergesslicher Agent nicht selbst-policen kann (Index/HEAD-Race im main-Checkout).
Kein DB (Single-Host-WSL-Realität; alle Sessions teilen ein Filesystem).

---

## 2. Registry-Speicher

**Ort:** `$(git rev-parse --git-common-dir)/agent-locks/` (= `.git/agent-locks/`).

- Von allen Worktrees geteilt (sie teilen den common gitdir), überlebt Worktree-Erstellung
  und -Löschung, alle Sessions auf demselben WSL-Filesystem.
- **Nicht committet** (liegt in `.git/`) → kein git-crypt-Filter, keine Repo-Verschmutzung.
- Eine JSON-Datei pro Claim. Dateiname: `<scope>__<sanitized-id>.json`, wobei `/` → `--`.
  - `ticket__T000467.json`
  - `branch__feature--brett-relations.json`
  - `main-checkout.json` (Singleton, kein id-Suffix)
  - `registry__k3d--configmap-domains.yaml.json`

**JSON-Schema eines Claims:**

```json
{
  "scope": "ticket",
  "id": "T000467",
  "owner_sid": 482931,
  "owner_pid": 482935,
  "tool": "claude",
  "label": "dev-flow-execute",
  "worktree": "/tmp/wt-brett-relations",
  "branch": "feature/brett-relations",
  "ticket": "T000467",
  "host": "wsl-pk",
  "created_at": 1749300000,
  "heartbeat_at": 1749300600
}
```

**Session-Identität:** `owner_sid` = Unix-Session-ID (`ps -o sess= -p $$ | tr -d ' '`).
Für alle Subprozesse *einer* Agenten-CLI gleich, zwischen Claude/Gemini/zwei Fenstern
verschieden. Das stabile „Wer bin ich" über viele kurzlebige Bash-Tool-Calls hinweg; ein
Git-Hook (Kind derselben Session) berechnet seine eigene SID und vergleicht.

**Tool-Erkennung:** Best-effort über Umgebungsvariablen (`CLAUDE*`/`CLAUDECODE` vs
`GEMINI*`) bzw. `comm` der Ancestor-Prozesse; Fallback `"unknown"`. Nur für Anzeige, nicht
für Korrektheit.

---

## 3. Lock-Library `scripts/agent-lock.sh`

Tool-agnostisches Bash, kein DB. Kritischer Abschnitt serialisiert via `flock` auf
`$LOCKDIR/.registry.lock`; JSON-Schreiben atomar via Temp-Datei + `mv` (atomarer Rename).

### Subcommands

| Command | Verhalten | Exit |
|---------|-----------|------|
| `claim <scope> <id> [--ticket X --branch Y --worktree Z --label L]` | reapt zuerst tote Locks dieses Scopes; lebender Fremd-Lock → Halter ausgeben + Exit 1; eigener Lock → idempotenter Refresh + Exit 0; frei → schreiben + Exit 0 | 0/1/2 |
| `refresh <scope> <id>` | bumpt `heartbeat_at`, wenn ich Eigentümer bin; sonst Exit 1 | 0/1 |
| `release <scope> <id> [--force]` | entfernt Lock, wenn ich Eigentümer bin (oder `--force`) | 0/1 |
| `check <scope> <id>` | gibt Halter-JSON oder `free` aus | 0 frei/mein · 3 Fremd |
| `list` | hübsche Tabelle aller lebenden Claims („Wer macht was"-Board) | 0 |
| `reap` | entfernt tote Locks; killt cwd-tote-Worktree-Prozesse; `git worktree prune` | 0 |
| `mine` | gibt meine SID aus (Helfer) | 0 |
| `guard-precommit` | **Hook-intern**: Exit 1, wenn frischer `main-checkout`-Lock einer anderen lebenden SID existiert; sonst Exit 0. **Fail-open** bei internem Fehler. Respektiert `AGENT_LOCK_FORCE=1` | 0/1 |
| `guard-postcheckout` | **Hook-intern**: gibt **Warnung** aus (nie Exit ≠ 0), wenn eine andere Session den `main-checkout`-Lock hält | 0 |

### Staleness-Regel

Ein Lock ist **stale**, wenn eine der Bedingungen zutrifft:

- `now - heartbeat_at > AGENT_LOCK_TTL` (default **1800 s** = 30 min), **oder**
- `worktree` ist gesetzt und das Verzeichnis existiert nicht mehr, **oder**
- `owner_sid` hat keinen lebenden Prozess (`pgrep -s <sid>` leer).

**Konservativ:** `ticket`/`branch`-Claims, die nur per-TTL alt, aber deren SID noch lebendig
ist, werden **gewarnt, nicht gestohlen** (die Session könnte idle-aber-lebendig sein).
Auto-entfernt werden nur klar tote Locks (SID weg **oder** Worktree weg).

### Atomarität (Detail)

```
acquire flock on $LOCKDIR/.registry.lock   # serialisiert konkurrierende claims
  reap_scope <scope> <id>                  # tote Locks dieses Scopes weg
  if lock exists and owner_sid != my_sid and live: print holder; exit 1
  write JSON to $TMP; mv -f $TMP $LOCKFILE  # atomarer Replace
release flock
```

`mkdir -p "$LOCKDIR"` ist idempotent und race-frei; `flock` braucht die Lockdatei nur als
fd-Anker.

---

## 4. Die vier Guards

### G-A — Doppelarbeit (ticket/branch Claim)

Aufrufer: `dev-flow-plan` (nach Pfad+Ticket-Wahl), `dev-flow-execute` (beim Plan-Pickup),
`scripts/factory/dispatcher.js` (vor enqueue/claim).

```bash
agent-lock claim ticket "$TICKET" --branch "$BRANCH" --worktree "$WT" --label dev-flow-execute \
  || { echo "Abbruch: Ticket bereits in Arbeit"; exit 1; }
agent-lock claim branch "$BRANCH" --ticket "$TICKET" --worktree "$WT" --label dev-flow-execute
```

Lebender Fremd-Claim → **STOP** mit Halter-Info:
> „Ticket T000467 wird bereits bearbeitet von **gemini** (sid 482931, Worktree
> `/tmp/wt-…`, seit 14:02, label `dev-flow-execute`). Koordiniere oder wähle ein anderes Ticket."

`release` bei Skill-Abschluss / nach PR-Merge / beim Worktree-Teardown. Das ist der
direkte Slice-4-Verhinderer.

### G-B — main-Checkout-Race (Mutex + harter Git-Hook)

**Skill-Seite:** Jede Skill, die den **main**-Checkout mutiert (Chore-Pfad, Plan-Commit),
ruft `agent-lock claim main-checkout` vor der ersten Mutation. Belegt durch Fremd-Session →
**Chore-Pfad leitet in einen Worktree um** (statt inline), statt nur zu warnen.

**Hook-Seite (harte Durchsetzung):** Der **bestehende** `.githooks/pre-commit` wird
erweitert (additiv, am Anfang):

```bash
# --- agent-lock main-checkout mutex ---
if [ "$(git rev-parse --git-dir)" = "$(git rev-parse --git-common-dir)" ]; then  # = main-Checkout, kein Worktree
  if ! AGENT_LOCK_FORCE="${AGENT_LOCK_FORCE:-}" bash scripts/agent-lock.sh guard-precommit; then
    exit 1
  fi
fi
```

`agent-lock guard-precommit` lehnt ab, wenn ein **frischer** `main-checkout`-Lock einer
**anderen lebenden SID** existiert; gibt Halter-Info + Override-Hinweis aus
(`AGENT_LOCK_FORCE=1 git commit …`). **Fail-open** bei jedem internen Fehler (verwedelt nie
das git des Users). Default-Zustand (kein Lock / mein Lock / toter Lock) → Commit erlaubt.

Zusätzlich neuer **`post-checkout`**-Hook (in `.githooks/`): **Warnung** (kein Block) bei
Branch-Switch im main-Checkout, während eine andere Session den `main-checkout`-Lock hält.

> **Update (T001383, 2026-07-01):** `post-checkout` warnt nicht mehr nur, sondern **reverted
> best-effort** auf den im `main-checkout`-Lock hinterlegten `branch` (nie auf eine SHA),
> außer während eines laufenden Rebase/Merge/Cherry-Pick. `guard-precommit` self-claimt den
> Lock bei jedem Commit, damit das `branch`-Feld gefüllt bleibt. Volle Analyse:
> `docs/superpowers/specs/2026-07-01-factory-branch-switch-guard-design.md`.

Tool-agnostisch — feuert auch für Gemini und manuelles `git`.

### G-C — Geteilte Registry-Dateien (weiche Warnung)

Kuratierte Hot-File-Liste (als `AGENT_LOCK_HOTFILES` im Script, einfach erweiterbar):

```
k3d/configmap-domains.yaml
environments/schema.yaml
Taskfile.yml
k3d/kustomization.yaml
```

- **Plan-Zeit** (`dev-flow-plan`): für jede Hot-File, die der Plan laut Datei-Liste anfasst,
  `agent-lock claim registry <file> --ticket <id>` (Scope `registry` erlaubt **mehrere**
  gleichzeitige Claims — es ist ein Hinweis-Register, kein Mutex).
- **Vor Ausführung** (`dev-flow-execute`): `agent-lock check registry <file>` für die eigenen
  Hot-Files; gibt es einen **anderen** aktiven Plan-Claim → **Warnung** (kein Block):
  > „Plan für T000xyz editiert ebenfalls `environments/schema.yaml` → Keep-both-Rebase erwarten."

### G-D — Zombies & stale Worktrees (Reaper)

`agent-lock reap` läuft:

- am **Start** jeder dev-flow-Skill (ersetzt/erweitert „Schritt −1 Stale-Worktree-Audit"), und
- als **Claude `SessionStart`-Hook** in `.claude/settings.json`.

`reap` tut:

1. Killt Prozesse, deren `cwd` (`readlink /proc/<pid>/cwd`) auf einen **gelöschten** Worktree
   zeigt (kein Self-Match: matcht über cwd, nicht Kommandozeile).
2. `git worktree prune` + entfernt Worktrees bereits **gemergter** Branches.
3. Entfernt klar tote Locks (SID weg / Worktree weg / TTL).

Die Slice-4-Zombies wären damit automatisch behandelt worden.

---

## 5. Cross-Tool-Propagation

- **Script + Git-Hooks** sind per se tool-agnostisch (Bash, feuern unabhängig vom Agenten).
- **`CLAUDE.md`** und **`GEMINI.md`** bekommen eine **identische** kurze Sektion
  „Session-Koordination": Claim/Refresh/Release-Kontrakt + „Reaper am Start". `AGENTS.md` ist
  ein Symlink auf `CLAUDE.md` und folgt automatisch.
- **`.claude/settings.json`**: neuer `SessionStart`-Hook → `bash scripts/agent-lock.sh reap`.
- Ein `PreToolUse`-Hard-Block (Claude-only) bleibt **deferred** — der `pre-commit` deckt die
  gefährliche Grenze bereits tool-agnostisch ab.

---

## 6. Fehlerverhalten & Failure Modes

| Fall | Verhalten |
|------|-----------|
| Crashte Session lässt Lock zurück | Reaper räumt (SID tot / Worktree weg / TTL). Konservativ bei idle-aber-lebendig. |
| `flock`-Contention | kurz; Claim ist schneller kritischer Abschnitt. |
| Hook-internes Versagen | **fail-open** — Commit wird erlaubt, nie wedeln. |
| Legitimer Solo-Commit in main | erlaubt (kein/eigener/toter Lock → kein Block). |
| Force nötig | `AGENT_LOCK_FORCE=1` für Script **und** Hook, dokumentiert. |
| Same-Terminal-Edge (zwei Agenten teilen eine Unix-Session) | unwahrscheinlich (getrennte Terminals); dokumentierte Annahme; fällt auf advisory zurück (SIDs kollidieren → als „mein" gewertet). |
| `.git/agent-locks/` nicht beschreibbar | `claim`/`reap` warnen + Exit 0 (advisory degradiert, blockt nie). |

---

## 7. Tests

### Neue Datei: `tests/local/AGENT-LOCK-01-core.bats` (offline-sicher)

- `claim` → zweiter `claim` mit **anderer** SID schlägt fehl (Exit 1, Halter ausgegeben)
- `claim` mit **eigener** SID ist idempotent (Refresh, Exit 0)
- `refresh` bumpt `heartbeat_at`; `release` gibt frei
- `reap` entfernt SID-tote / Worktree-fehlende / TTL-abgelaufene Locks; **erhält** lebende
- `reap` killt cwd-toten-Worktree-Prozess (simuliert via `sleep` in temp-dir, dann dir löschen)
- `check` Exit-Codes (frei=0 / mein=0 / Fremd=3)
- `registry`-Scope: mehrere Claims gleichzeitig erlaubt; `check` meldet Overlap

### Neue Datei: `tests/local/AGENT-LOCK-02-precommit.bats`

- Commit in simuliertem main mit **Fremd-Live-Lock** → **blockiert**
- Commit mit **eigenem** Lock → erlaubt
- Commit mit `AGENT_LOCK_FORCE=1` → erlaubt
- Commit in einem **Worktree** (git-dir ≠ common-dir) → **nie** blockiert
- Hook-internes Versagen → fail-open (erlaubt)

### Integration

Beide BATS-Dateien in `task test:all` verdrahtet (über `tests/runner.sh` bzw. die
`test:*`-Subtask-Liste) gemäß Coverage-Guard-Konvention: jede `tests/local`-BATS muss
in `task test:all` laufen oder explizit allowlisted sein.

---

## 8. Betroffene Dateien (Implementierungs-Surface)

| Datei | Änderung |
|-------|----------|
| `scripts/agent-lock.sh` | **neu** — Lock-Library |
| `.githooks/pre-commit` | erweitern — main-checkout-Mutex-Guard (additiv, fail-open) |
| `.githooks/post-checkout` | **neu** — Branch-Switch-Warnung in main |
| `.claude/settings.json` | `SessionStart`-Hook → `agent-lock reap` |
| `.claude/skills/dev-flow-plan/SKILL.md` | reap am Start + claim ticket/branch + registry-Claims + Chore→Worktree-Umleitung |
| `.claude/skills/dev-flow-execute/SKILL.md` | reap am Start + claim beim Pickup + registry-Overlap-Warnung + release am Ende |
| `scripts/factory/dispatcher.js` | claim ticket vor enqueue/claim (Doppelarbeit-Guard) |
| `CLAUDE.md` | Sektion „Session-Koordination" |
| `GEMINI.md` | identische Sektion |
| `tests/local/AGENT-LOCK-01-core.bats` | **neu** |
| `tests/local/AGENT-LOCK-02-precommit.bats` | **neu** |
| `tests/runner.sh` / Taskfile `test:*` | beide BATS verdrahten |

---

## 9. Nicht im Scope (YAGNI)

- Cross-Machine-/DB-Claims (Single-Host-WSL-Realität; Factory-DB-Pattern bleibt für die
  Factory selbst).
- Web-Dashboard der Sessions (`agent-lock list` reicht).
- `PreToolUse`-Hard-Block für Edit/Write in main (Git-Hook deckt die Commit-Grenze ab).
- Auto-Serialisierung/Merge von Registry-Datei-Edits (nur **erkennen + warnen**).
- Verteilte Sperren über Netzwerk / mehrere Hosts.
