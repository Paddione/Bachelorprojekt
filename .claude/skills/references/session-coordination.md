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

## Freigeben (nach Merge, VOR dem Worktree-Remove)

```bash
bash scripts/agent-lock.sh release ticket "<T00XXXX>" 2>/dev/null || true
bash scripts/agent-lock.sh release branch "<branch>" 2>/dev/null || true
```
