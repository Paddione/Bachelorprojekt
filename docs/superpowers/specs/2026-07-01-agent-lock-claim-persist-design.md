---
ticket_id: T001384
plan_ref: null
status: active
date: 2026-07-01
---

# Spec: agent-lock.sh claim persistiert Lock-Datei nicht zuverlässig

## Kontext (Mishap)

`bash scripts/worktree-create.sh … && bash scripts/agent-lock.sh claim branch
<slug> --worktree <wt> --label …` liefert `exit=0`, aber die Lock-Datei
`$GIT_COMMON_DIR/agent-locks/branch__<slug>.json` existiert nicht. Erst ein
zweiter Claim-Aufruf (typischerweise aus dem Worktree) legt sie korrekt an.
Herkunft: T001380 M3 (Wave-1-Vorfall, reaper hat die Lock-Datei direkt nach
Schreiben gelöscht). Auch die parallelen Wave-1-Locks (T001404, T001387) sind
im `.reap.log` mit `worktree-missing` und `sid-dead` reaped worden — alle
frischen Claims aus der ersten Wellte sind betroffen.

## Beobachtung (Evidenz aus dem Repo)

```
.git/agent-locks/.reap.log
1782939993 ticket/T001404 worktree-missing
1782940039 ticket/T001387 worktree-missing
1782940129 ticket/T001404 sid-dead
```

Die Datei `branch__fix-t001384-agent-lock-claim-persist.json` taucht in
`agent-lock.sh list` direkt nach dem Claim entweder gar nicht oder mit
`STATE=stale` auf. Bei einem `reap` wird sie sofort gelöscht.

## Root-Cause-Analyse (zwei zusammenwirkende Defekte)

### Defekt 1 — `_reapable` prüft `worktree-missing` VOR `sid-alive`

`scripts/agent-lock.sh:87-105`:

```bash
_reapable() {
  …
  if [ -n "$wt" ] && [ "$wt" != "-" ] && [ ! -d "$wt" ]; then
    _reap_log "$f" worktree-missing; return 0; fi   # ← trippt ZUERST
  if [ -n "$sid" ]; then
    if _sid_alive "$sid"; then return 1; fi          # ← wird NIE erreicht
    …
  }
  …
}
```

Ein **lebender** Owner-SID (alive laut `pgrep -s` bzw. `CLAUDE_SESSION_ID`)
schützt die Lock-Datei **nicht** davor, vom Reaper gelöscht zu werden, wenn
der referenzierte Worktree-Pfad momentan nicht existiert. Das ist in mehreren
Szenarien der Fall:

1. **Worktree-Setup-Race:** `worktree-create.sh` schreibt den Claim, bevor
   das `git worktree add` im selben Skript den Pfad angelegt hat. Der Reaper
   aus einer parallelen Session sieht `worktree-missing` und löscht.
2. **Pfad-Drift über Maschinen-Grenzen:** in der Fleet-Deploy-Pipeline liegen
   Worktrees unter Umständen auf einem anderen Host als der Claim (z. B. der
   `k3d-dev` schreibt, der Hetzner-Build-Host liest). `[ -d "$wt" ]` ist
   lokal und liefert `false`, obwohl der Claim valide ist.
3. **Reap durch das Factory-Dispatch-Loop:** `scripts/factory/*.sh` rufen
   `agent-lock.sh reap` zyklisch auf; jeder Tick killt frische Claims, deren
   Worktree-Pfad nicht in der **gerade laufenden** Shell existiert.

**Erwartung:** Ein lebender SID ist der **stärkste** Hinweis auf eine
aktive Session. Reapability-Checks (`worktree-missing`, `heartbeat-ttl`,
`sid-dead`) dürfen erst **nach** `sid-alive` greifen, nicht davor.

### Defekt 2 — `cmd_reap` hält den Registry-Lock nicht

`scripts/agent-lock.sh:229-256` (cmd_reap):

```bash
cmd_reap() {
  local d; d="$(_lock_dir)"
  # 1) kill orphan processes, 2) prune worktree admin, 2b/2c) prune stale branches
  …
  if [ -d "$d" ]; then
    local f
    for f in "$d"/*.json; do
      [ -e "$f" ] || continue
      _reapable "$f" && rm -f "$f"      # ← KEIN _with_lock davor
    done
  fi
  return 0
}
```

`cmd_claim` ruft `_with_lock` und serialisiert alle Mutationen am
`.registry.lock` über `flock 9`. `cmd_reap` macht das **nicht** und löscht
Lock-Dateien außerhalb des Flocks. Folgen:

- **TOCTOU zwischen Claim und Reap:** Claim schreibt die Datei
  (`_write_lock`), Reap iteriert `*.json` und löscht sie. Der Reap sieht die
  Datei entweder gar nicht (Schreiben kam nach dem Glob) oder sieht sie und
  löscht sie, weil `_reapable` (Defekt 1) fälschlicherweise `0` zurückgibt.
- **Atomicity bricht:** das `mv -f "$tmp" "$f"` im Claim ist die einzige
  Atomar-Garantie; sobald die Datei existiert, kann sie ein nebenläufiger
  Reap jederzeit wegreißen.

**Erwartung:** `cmd_reap` muss dieselbe `_with_lock`-Sequenz wie
`cmd_claim`/`cmd_refresh`/`cmd_release` benutzen, sodass alle Mutationen am
Claim-Store serialisiert sind.

### Defekt 3 (sekundär) — `_lock_dir` resolved den Pfad nicht immer stabil

`scripts/agent-lock.sh:61-66`:

```bash
_lock_dir() {
  if [ -n "${AGENT_LOCK_DIR:-}" ]; then printf '%s\n' "$AGENT_LOCK_DIR"; return; fi
  local cd; cd="$(git rev-parse --git-common-dir 2>/dev/null)" || \
    { printf '/tmp/agent-locks\n'; return; }
  case "$cd" in /*) : ;; *) cd="$(cd "$cd" && pwd)";; esac
  printf '%s/agent-locks\n' "$cd"
}
```

Der Fallback `cd="$(cd "$cd" && pwd)"` läuft in einer **Subshell** und
benutzt den `cwd` des **rufenden** Skripts. Wird `agent-lock.sh` aus einer
Worktree-Shell aufgerufen, deren `cwd` wechselt (z. B. nach `cd $WT_PATH`),
kann der relative `git-common-dir` (`.git`) falsch resolven, wenn die
Worktree-Shell `cwd` nicht mehr im Main-Checkout hat. In der Praxis ist
das selten (Worktree-`cwd` ist meist `$WT_PATH`, und dort gibt es kein
relatives `.git` als Verzeichnis, sondern nur als Datei), aber die Robustheit
leidet.

**Erwartung:** `_lock_dir` nutzt `git -C <worktree> rev-parse --git-common-dir`
oder cached den Wert pro Prozess, statt sich auf `cwd` zu verlassen.

## Fix-Ansatz

Drei chirurgische Änderungen, alle in `scripts/agent-lock.sh`:

1. **Reihenfolge in `_reapable` umdrehen:** zuerst `_sid_alive` (→ return 1
   = nicht reapable), dann `worktree-missing`, dann `sid-dead`-Grace, dann
   `heartbeat-ttl`. Damit ist ein lebender SID ein hartes "nein" für den
   Reaper.
2. **`cmd_reap` den Registry-Lock greifen lassen:** vor dem `for f in …`
   `_with_lock` aufrufen (genau wie `cmd_claim`). Reihenfolge der Steps
   erhalten (1) Prozesse killen, 2) Worktrees prunen — beides darf ohne
   Lock laufen, weil es keine `agent-locks/*.json` berührt. Erst Schritt 3
   (lock-file sweep) braucht den Lock.
3. **`_lock_dir` robuster machen:** `cd` in einer Subshell durch explizites
   `cd "$(git rev-parse --show-toplevel)" && git rev-parse --git-common-dir`
   ersetzen, das den absoluten Pfad liefert, unabhängig vom aktuellen
   `cwd`. Fallback `/tmp/agent-locks` nur bei echtem Fehler.

Alle drei Änderungen sind additiv bzw. reorder — kein API-Change, keine
Schema-Änderung an den Lock-JSONs. Bestehende Claims bleiben lesbar.

## Subsysteme

- `scripts/agent-lock.sh` (alle drei Defekte)
- `tests/spec/agent-lock-session-identity.bats` (existierend — wird **nicht**
  verändert; die neuen Regressions-Tests liegen in einer eigenen Spec-Datei)
- `tests/spec/agent-lock-claim-persist.bats` (neu — Regressions-Tests für
  Defekt 1+2+3)
- `openspec/specs/active-sessions-hub.md` (neue Requirement
  `Claim-Persistenz gegen reap-Race`)
- `.githooks/pre-commit` und `.githooks/post-checkout` (read-only — sie
  konsumieren `agent-lock.sh` und profitieren automatisch von der Korrektur)

## Edge-Cases

- **Fresh-claim in der Grace-Periode:** nach dem Schreiben ist die Datei
  mit `created_at` innerhalb `AGENT_LOCK_GRACE` (default 120s). Wenn der
  SID **tot** ist (z. B. weil der Bash-Subprozess schon beendet ist und
  die nächste Session einen anderen SID hat), soll der Reaper sie weiter
  dürfen — dafür bleibt der `sid-dead`+`age>=GRACE`-Pfad erhalten.
- **Harness-stable SID (CLAUDE_SESSION_ID):** `_sid_alive` behandelt
  nicht-numerische SIDs bereits als "always alive" und vertraut auf
  Heartbeat-TTL. Dieser Pfad ist durch Defekt 1 nicht betroffen, weil
  `worktree-missing` dort nie greift, solange der SID stimmt — _außer_,
  der SID matched nicht (neue Session, alter Pfad). Nach dem Fix ist die
  Reihenfolge robust: SID-lebend schlägt Worktree-missing, und für
  Harness-SIDs ist SID immer "lebedig" bis TTL.
- **Reap-Race bei parallelem Claim:** zwei Sessions rufen `claim` für
  verschiedene IDs quasi-gleichzeitig. Beide wollen `_with_lock`; der
  zweite wartet. Nach dem Fix serialisiert auch `cmd_reap` über den
  gleichen Lock — kein Vermischen mehr möglich.
- **Worktree-Pfad auf fremdem Host:** wenn das Worktree-Verzeichnis
  physisch nicht auf diesem Rechner existiert (z. B. `k3d-dev` schreibt,
  Hetzner liest), darf der Claim nicht durch `worktree-missing`
  reaped werden. Das ist genau die Korrektur von Defekt 1.
- **Worktree wurde `git worktree move`d:** der Pfad im Claim zeigt auf den
  alten Pfad, der nicht mehr existiert. Nach dem Fix überlebt der Claim
  mindestens bis zum Heartbeat-TTL — lange genug, dass der Owner per
  `cmd_refresh` den Pfad aktualisieren kann.

## Nicht-Ziele

- **Kein** Wechsel auf SQLite/etcd/Consul für die Lock-Registry — die
  Datei-basierte Lösung ist gewollt (offline-fähig, kein zusätzlicher
  Service, in `git-common-dir` revisionsfrei abgelegt).
- **Kein** Wechsel der Lock-Semantik von "file lock" zu "leases" — das
  wäre ein größeres Refactor, das die parallele Wave-1 (T001404 mit
  `workspace:deploy secrets` Scope) brechen würde.
- **Kein** automatisches Recovery beim Reap — der Owner soll weiterhin
  selbst per `cmd_refresh`/`cmd_claim` reagieren.

## Verifikation

- Neue BATS-Suite `tests/spec/agent-lock-claim-persist.bats` deckt ab:
  1. `claim` überlebt einen nachfolgenden `reap` mit demselben
     `CLAUDE_SESSION_ID` (lebender SID schützt vor worktree-missing).
  2. `claim` überlebt einen parallelen `reap`-Prozess ohne Lock (Defekt 2).
  3. `_lock_dir` resolved auf den gleichen Pfad, egal ob vom Main-Checkout
     oder aus einer Worktree-Shell aufgerufen (Defekt 3).
  4. Ein zweiter `claim` für dieselbe ID aus einer **anderen** Session
     wird weiterhin abgewiesen (`AGENT-LOCK: … bereits gehalten`).
- `task test:changed` und `task freshness:check` müssen grün bleiben.
