# Session-Koordination — agent-lock-Lebenszyklus (SSOT) [T000510/T000882]

Der komplette Claim/Release-Lebenszyklus für parallele Sessions. Skills verlinken hierher und
zeigen nur ihre skill-spezifischen Parameter (`--label`, Scope). Worktree-*Erzeugung* selbst ist
SSOT in `scripts/worktree-create.sh` (git-crypt-safe; Hintergrund: `superpowers:using-git-worktrees`).

## Sitzungsstart — Reaper & Nachrichten

```bash
bash scripts/agent-lock.sh reap           # Zombie-Prozesse, stale Worktrees & tote Locks räumen
bash scripts/agent-lock.sh list           # "Wer macht was": laufende Claims anderer Sessions
bash scripts/agent-msg.sh read --unread   # offene Nachrichten paralleler Sessions sichten [T000882]
```

## Claimen (vor der Arbeit)

```bash
# Branch-Claim (immer):
bash scripts/agent-lock.sh claim branch "<branch>" --worktree "<wt-pfad>" --label <skill-name> \
  || { echo "🛑 Branch wird bereits von einer lebenden Session bearbeitet — koordinieren, nicht duplizieren."; exit 1; }

# Ticket-Claim (sobald die Ticket-ID bekannt ist):
bash scripts/agent-lock.sh claim ticket "<T00XXXX>" --branch "<branch>" --worktree "<wt-pfad>" --label <skill-name> \
  || { echo "🛑 Ticket wird bereits bearbeitet — koordinieren."; exit 1; }
```

- **Exit 1** = eine lebende Session hält den Claim (Halter-Info in der Ausgabe) → koordinieren.
- **Re-Claim durch dieselbe Session** ist ein no-op-Refresh, kein Fehler — nachträgliche Claims
  (z. B. Ticket-ID erst später bekannt [T001386]) sind sicher.
- Lock-Dateien liegen unter `.git/agent-locks/` (`ticket__<id>.json`, `branch__<name>.json`) —
  Guards können `branch`/`worktree` daraus lesen (`jq -r '.branch' <lockfile>`).
- Bei Inline-Arbeit im main-Checkout: zusätzlich `claim main-checkout` — der
  `.githooks/pre-commit` sperrt sonst konkurrierende Commits anderer Sessions.

## Registry-Overlap (geteilte Hochfrequenz-Dateien)

Vor Änderungen an geteilten Registry-Dateien weiche Warnung + Claim:

```bash
for hf in k3d/configmap-domains.yaml environments/schema.yaml Taskfile.yml k3d/kustomization.yaml; do
  git diff --name-only origin/main | grep -qx "$hf" || continue
  [ "$(bash scripts/agent-lock.sh check registry "$hf" | head -1)" = "held" ] \
    && echo "⚠ $hf wird parallel bearbeitet → Keep-both-Rebase erwarten."
  bash scripts/agent-lock.sh claim registry "$hf" --ticket "$TICKET_ID" --label <skill-name> || true
done
```

## Guard Hooks (pre-commit & post-checkout)

Das `.githooks/pre-commit` ruft zwei agent-lock-Guards auf:

1. **`guard-precommit`** — Verhindert, dass eine Session einen Commit im main-Checkout macht,
   während eine ANDERE Session dort exklusiv arbeitet (erkannt am `main-checkout`-Lock mit
   einem Label, das NICHT `auto: pre-commit self-claim` ist). Fail-open: ohne Lock wird der
   Commit nicht blockiert.

2. **`guard-postcheckout`** — Nach einem `git checkout` (post-checkout Hook) prüft dieser Guard,
   ob der main-Checkout-Lock von einer ANDEREN lebenden Session gehalten wird. Falls ja
   UND kein Rebase/Merge/Cherry-Pick läuft, wird automatisch auf den Lock-Branch zurückgesetzt.
   Verhindert, dass man aus Versehen den Branch einer parallelen Session stört [T001383].

Beide Guards sind im `.githooks/post-checkout` und `.githooks/pre-commit` registriert
und werden via `git config core.hooksPath .githooks` aktiviert.

## Agent-Msg: tail & peers

Neben `read --unread` stehen weitere Kommandos zur Session-Kommunikation bereit:

```bash
# Letzte 10 Nachrichten ansehen (auch bereits gelesene)
bash scripts/agent-msg.sh tail -n 10

# Nur Nachrichten anzeigen, die an DICH adressiert sind (SID oder Label)
bash scripts/agent-msg.sh read --mine --unread

# Nur Nachrichten ab einem bestimmten Zeitstempel
bash scripts/agent-msg.sh read --since 1748822400

# Live-Sessions auflisten (delegiert an agent-lock.sh list)
bash scripts/agent-msg.sh peers
```

Nachrichten > 4096 Bytes werden automatisch gekürzt (Metrik im JSON erhalten).

## Agent-Collision (live edit collision)

Das Skript `scripts/agent-collision.sh` warnt vor Dateien, die gleichzeitig in einer
ANDEREN lebenden Session im Worktree geändert werden. Der `.githooks/pre-commit` ruft
es automatisch auf (`agent-collision.sh check --staged`). Mit `AGENT_COLLISION_STRICT=1`
wird der Commit bei Kollision abgelehnt.

```bash
# Prüfe ob staged Dateien mit anderen Sessions kollidieren
bash scripts/agent-collision.sh check --staged

# Prüfe staged + unstaged Änderungen
bash scripts/agent-collision.sh check --all

# Stille Prüfung (exit code only)
bash scripts/agent-collision.sh check --quiet
```

Erkenntnis: Liest die Lock-Dateien aus `agent-lock.sh` Registry JSON und vergleicht
`git diff --name-only HEAD` aller lebenden Worktrees. Reine lokale Bash — kein Cluster.

## Reap-Lifecycle

Der Reaper (`agent-lock.sh reap`) räumt stale Locks und Zombie-Prozesse. Ein Lock gilt
als **reapable** (eindeutig tot), wenn eine dieser Bedingungen zutrifft:

1. **PID tot** (kill -0 schlägt fehl) + Alter > Grace-Periode (`AGENT_LOCK_GRACE`, default 120s).
2. **Worktree-Pfad gelöscht** (existiert nicht mehr auf Disk).
3. **SID tot** (numeric SID; per `pgrep -s` geprüft) + Alter > Grace-Periode.
4. **Heartbeat TTL abgelaufen** (`AGENT_LOCK_TTL`, default 1800s) — für non-numeric SIDs
   (harness-provided wie `CLAUDE_SESSION_ID`), die nicht per pgrep prüfbar sind.

Der Reaper läuft automatisch in Step -1 der dev-flow-execute Pipeline und beim
Session-Start (`bash scripts/agent-lock.sh reap`). Stale Locks werden gelöscht und
ins `.reap.log` geschrieben (im Lock-Verzeichnis).

> **⚠️ M2-Lesson (T001899):** Parallele Sessions können Claims löschen, die eine andere Session
> noch aktiv nutzt. Nach jedem Reap-Fenster die eigenen Claims verifizieren:
> `bash scripts/agent-lock.sh list` — fehlt ein Claim, neu setzten.

## Freigeben (nach Merge, VOR dem Worktree-Remove)

```bash
bash scripts/agent-lock.sh release ticket "<T00XXXX>" 2>/dev/null || true
bash scripts/agent-lock.sh release branch "<branch>" 2>/dev/null || true
```
