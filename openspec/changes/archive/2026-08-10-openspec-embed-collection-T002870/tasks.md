---
title: "openspec-embed-collection-T002870 — Implementation Plan"
ticket_id: T002870
domains: [db]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# openspec-embed-collection-T002870 — Implementation Plan

_Ticket: T002870 (führend) · T002877 (relates_to, dieselbe Ursache, wird mit demselben Fix
geschlossen)_

Design: [design.md](./design.md) · Proposal: [proposal.md](./proposal.md) · Delta-Spec:
[specs/openspec-embedding.md](./specs/openspec-embedding.md)

## File Structure

```
scripts/openspec-embed-lib.sh                                              (neu, ~45 Zeilen)
scripts/openspec-embed-local.sh                                            (geändert, 97 → ~115 Zeilen · Budget 800 · nicht-baselined)
.githooks/post-commit-embed                                                (geändert, 55 → ~63 Zeilen · Budget 800 · nicht-baselined)
tests/spec/openspec-embedding/port-forward-identity-T002870.bats           (neu, bereits committed — RED)
```

Keine der geänderten Dateien ist gebaselined (`docs/code-quality/baseline.json`), beide liegen
weit unter dem `.sh`-Limit (800 Zeilen, `docs/code-quality/gates.yaml`) — kein S1-Split nötig.

## Task 1 — Failing-Test-Step (RED) — bereits erledigt

Der Test `tests/spec/openspec-embedding/port-forward-identity-T002870.bats` wurde bereits im
Plan-Stage-Commit hinzugefügt (Fix-Pfad Schritt 3 — failing test vor Plan). Er deckt alle drei
Fix-Bausteine ab: `pf_listener_pid`, `embed_output_is_success`, `in_rebase` (jeweils Positiv-
Anker + Negativfall) sowie eine Integrationsprüfung des Hooks.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/port-forward-identity-T002870.bats
# expected: FAIL (rot — scripts/openspec-embed-lib.sh existiert noch nicht; 8 von 9 Tests
# schlagen fehl, der neunte ist der Positiv-Anker für den unveränderten Normalpfad des Hooks
# und ist bereits grün)
```

Kein weiterer Schritt hier nötig — nur zur Verifikation vor Task 2 erneut laufen lassen.

## Task 2 — `scripts/openspec-embed-lib.sh` anlegen (neue, testbare Helferfunktionen)

Neue Datei, gesourced von `scripts/openspec-embed-local.sh` UND `.githooks/post-commit-embed`
(S4: kein Orphan-Skript, beide Konsumenten referenzieren es). Reine Funktionen, kein Top-Level-
Seiteneffekt beim Sourcen (`set -uo pipefail`, KEIN `set -e` auf Top-Level, damit ein Sourcen in
einem `set -euo pipefail`-Aufrufer dessen Flags nicht überschreibt).

```bash
#!/usr/bin/env bash
# scripts/openspec-embed-lib.sh — pure, testable helpers for
# scripts/openspec-embed-local.sh and .githooks/post-commit-embed.
# Sourced only, never executed directly.

# pf_listener_pid <port> -> stdout: PID of the process listening on
# 127.0.0.1:<port> (empty if none/undetectable). Prefers `ss` (iproute2,
# present on the dev host and CI runners), falls back to `lsof`.
pf_listener_pid() {
  local port="$1"
  if command -v ss >/dev/null 2>&1; then
    ss -ltnp 2>/dev/null | grep ":${port} " | grep -oP 'pid=\K[0-9]+' | head -1
  elif command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null | head -1
  fi
}

# embed_output_is_success <output-text> -> exit 0 iff the text contains an
# "indexed slug='" marker AND does NOT also contain a completeness-gate
# WARN line. A parallel warning must fail the wrapper even though the
# embed itself nominally "succeeded" (T002870/T002877 escalation).
embed_output_is_success() {
  local out="$1"
  printf '%s' "$out" | grep -q "indexed slug='" || return 1
  printf '%s' "$out" | grep -q "WARN: completeness gate" && return 1
  return 0
}

# in_rebase -> exit 0 iff a rebase (merge or apply) is in progress in the
# current git worktree.
in_rebase() {
  [[ -d "$(git rev-parse --git-path rebase-merge 2>/dev/null)" ]] && return 0
  [[ -d "$(git rev-parse --git-path rebase-apply 2>/dev/null)" ]] && return 0
  return 1
}
```

Nach Anlage: `chmod +x scripts/openspec-embed-lib.sh` (Konsistenz mit den anderen `scripts/*.sh`,
auch wenn die Datei nur gesourced wird).

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/port-forward-identity-T002870.bats
# Tests 1-7 sollten jetzt GRÜN sein (pf_listener_pid, embed_output_is_success, in_rebase);
# Tests 8-9 (Hook-Integration) folgen erst nach Task 3.
```

## Task 3 — `scripts/openspec-embed-local.sh`: Identitätsprüfung + verschärfter Erfolgs-Check

Am Dateianfang (nach den bestehenden Kommentar-/Variablen-Zeilen, vor `PF_PID=""`) sourcen:

```bash
source "$HERE/openspec-embed-lib.sh"
```

**Identitätsprüfung** — ersetzt die reine TCP-Connect-Warteschleife (aktuell Zeilen ~75-77):

```bash
FOUND=0
for _ in $(seq 1 10); do
  LISTENER_PID="$(pf_listener_pid "$PF_PORT")"
  if [[ -n "$LISTENER_PID" ]]; then
    if [[ "$LISTENER_PID" == "$PF_PID" ]]; then
      FOUND=1
      break
    fi
    FOREIGN_CMD="$(ps -p "$LISTENER_PID" -o cmd= 2>/dev/null || echo unbekannt)"
    echo "[openspec-embed-local] FEHLER: Port ${PF_PORT} wird von einem fremden Prozess (PID ${LISTENER_PID}: ${FOREIGN_CMD}) belegt, nicht vom eigenen Port-Forward (PID ${PF_PID}). Beende den fremden Prozess oder setze OPENSPEC_EMBED_PF_PORT auf einen freien Port." >&2
    exit 1
  fi
  sleep 1
done
if [[ "$FOUND" -ne 1 ]]; then
  echo "[openspec-embed-local] FEHLER: eigener Port-Forward (PID ${PF_PID}) hat Port ${PF_PORT} nicht innerhalb von 10s gebunden." >&2
  exit 1
fi
```

Fällt `pf_listener_pid` mangels `ss`/`lsof` durchgehend leer aus, meldet die Schleife nach 10
Versuchen den "nicht gebunden"-Fehler — fail-visible statt Silent-Fallback; kein separater
Degradationspfad nötig (beide Tools sind auf Dev-Host und CI-Runnern vorhanden, siehe Design
§1).

**Verschärfter Erfolgs-Check** — ersetzt die bestehende Zeile
`if printf '%s' "$OUT" | grep -q "indexed slug='"; then`:

```bash
if embed_output_is_success "$OUT"; then
```

Der restliche `if`-Block (COUNT_OUT-Ausgabe, `exit 0`) bleibt unverändert; der `else`-Zweig
(`echo ... FEHLER: Embedding wurde NICHT indiziert ...`, `exit 1`) greift jetzt zusätzlich, wenn
eine `WARN: completeness gate`-Zeile in `$OUT` steht.

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/port-forward-identity-T002870.bats
# weiterhin grün für Tests 1-7; Tests 8-9 (Hook) folgen aus Task 4
```

## Task 4 — `.githooks/post-commit-embed`: Rebase-Skip

Nach dem bestehenden `CI`-Check (vor `repo_root="$(git rev-parse --show-toplevel)"`) einfügen:

```bash
repo_root="$(git rev-parse --show-toplevel)"
source "$repo_root/scripts/openspec-embed-lib.sh"

if in_rebase; then
  exit 0
fi
```

(Die vorhandene `repo_root`-Zeile wird dafür nach oben verschoben, falls sie aktuell später im
Skript steht — `source` braucht `repo_root`, um den Pfad zur Lib zu bilden.)

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/openspec-embedding/port-forward-identity-T002870.bats
# expected: alle 9 Tests GRÜN
```

## Task 5 — Finale Verifikation

```bash
task test:changed
task freshness:regenerate
task freshness:check
```

Zusätzlich, weil Test-Dateien hinzukamen (`task test:inventory` ist Teil von
`freshness:regenerate`, aber explizit erwähnt laut CLAUDE.md CI-Konvention):

```bash
task test:inventory
git status --porcelain website/src/data/test-inventory.json   # muss nach regenerate leer sein
```

Manuelle Zusatzprüfung (kein automatisierter Test, da sie einen echten Portkonflikt braucht —
optional, nur falls lokal ein k3d-Dev-Forward auf 15432 aktiv ist):

```bash
kubectl --context k3d-mentolder-dev port-forward svc/shared-db 15432:5432 -n workspace &
bash scripts/openspec-embed-local.sh <irgendein-aktiver-slug>
# erwartet: FEHLER-Meldung mit dem fremden Prozess, exit 1 — NICHT die falsche DB
```
