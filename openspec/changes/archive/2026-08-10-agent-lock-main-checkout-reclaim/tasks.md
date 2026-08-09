---
title: "agent-lock-main-checkout-reclaim — Implementation Plan"
ticket_id: T002809
domains: [scripts, test]
status: plan_staged
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# agent-lock-main-checkout-reclaim — Implementation Plan

_Ticket: T002809_

## File Structure

| Datei | Rolle |
|---|---|
| `scripts/agent-lock.sh` | Neuer Befehl `cmd_reclaim_main_checkout` + Dispatch-Eintrag `reclaim-main-checkout` |
| `scripts/agent-lock-guards.sh` | `cmd_guard_postcheckout`-Warnmeldung um Hinweis auf `reclaim-main-checkout` ergänzen |
| `tests/spec/active-sessions-hub/agent-lock-main-checkout-reclaim.bats` | Nachweis — liegt bereits rot vor (RED, siehe unten) |

`scripts/agent-lock.sh` steht bei 557 Zeilen und ist nicht gebaselinet; wirksame Schwelle ist
damit das `.sh`-Limit 800 aus `docs/code-quality/gates.yaml`, Budget 243. Die Änderung fügt
rund 20 Zeilen hinzu (neue Funktion `cmd_reclaim_main_checkout` + ein Dispatch-Case) — deutlich
unter Budget, kein Split nötig.

`scripts/agent-lock-guards.sh` steht bei 63 Zeilen, ebenfalls nicht gebaselinet, wirksame
Schwelle 800, Budget 737. Die Änderung fügt eine Hinweiszeile zur bestehenden Warnmeldung hinzu.

## Root-Cause (verifiziert, nicht Hypothese — siehe proposal.md)

`cmd_guard_postcheckout` (`scripts/agent-lock-guards.sh`) überspringt seinen Revert nur, wenn
`owner_sid` des `main-checkout`-Locks exakt der aktuellen `_my_sid()` entspricht. Der
Self-Claim-Mechanismus (`_self_claim_main_checkout`, Label `auto: pre-commit self-claim` /
`$_SELF_CLAIM_LABEL` in `scripts/agent-lock.sh`) verankert bei jedem Commit die SID der
committenden Session. `cmd_claim` überschreibt ohne `--force` keinen bestehenden Lock einer
anderen lebenden SID (`scripts/agent-lock.sh` Zeilen 334–349). Eine SPÄTERE Session mit einer
ANDEREN SID (z.B. ein neuer Subagenten-Dispatch derselben Bedienperson) kann diesen
Bookkeeping-Lock also nie aktualisieren — jeder ihrer Checkouts wird von
`cmd_guard_postcheckout` als Fremdzugriff gewertet und zurückgesetzt. Reproduziert via:

```bash
AGENT_LOCK_SID=session-A bash scripts/agent-lock.sh claim main-checkout '' \
  --branch fix/old-branch --label 'auto: pre-commit self-claim'
git checkout -b fix/new-branch main
AGENT_LOCK_SID=session-B bash scripts/agent-lock.sh guard-postcheckout
# → HEAD zurueckgesetzt auf fix/old-branch
```

## Tasks

### Task 1 — Failing-Test-Step (RED, bereits verifiziert)

Der BATS-Nachweis liegt bereits im Repo unter
`tests/spec/active-sessions-hub/agent-lock-main-checkout-reclaim.bats` und ist auf diesem
Branch **rot**, weil `reclaim-main-checkout` noch kein bekannter Dispatch-Case ist:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/agent-lock-main-checkout-reclaim.bats
# expected: FAIL (red — reclaim-main-checkout existiert noch nicht; alle drei
# Assertions scheitern mit "Usage: agent-lock.sh {claim|refresh|release|...}")
```

Der Test deckt drei Szenarien ab (siehe `specs/active-sessions-hub.md` für die formalen
Requirements):
1. Positivfall: Bookkeeping-Lock wird von einer neuen SID reklamiert, der darauffolgende
   Checkout wird NICHT zurückgesetzt (`HEAD` bleibt auf dem neuen Branch — command output
   verification, kein Source-Grep).
2. Negativfall MIT Positiv-Anker im selben Test: ein DELIBERATER Fremd-Claim (Label ≠
   `auto: pre-commit self-claim`) wird NICHT übernommen — Exit 1, Lock-Inhalt unverändert.
3. No-op-Fall: kein Lock vorhanden, oder Lock gehört bereits der aktuellen Session.

### Task 2 — `cmd_reclaim_main_checkout` implementieren (GREEN)

In `scripts/agent-lock.sh`, direkt nach `cmd_release()` (vor `cmd_check()`), neue Funktion
hinzufügen. Verwendet ausschließlich bereits vorhandene Helfer (`_lock_file`, `_with_lock`,
`_lock_field`, `_my_sid`, `_SELF_CLAIM_LABEL`, `_holder_msg`, `_write_lock`, `_now`) — keine
neuen Abhängigkeiten:

```bash
cmd_reclaim_main_checkout() {
  local f; f="$(_lock_file main-checkout)"
  [ -f "$f" ] || return 0
  _with_lock
  local owner_sid label
  owner_sid="$(_lock_field "$f" owner_sid)"
  label="$(_lock_field "$f" label)"
  [ "$owner_sid" = "$(_my_sid)" ] && return 0
  if [ "$label" != "$_SELF_CLAIM_LABEL" ]; then
    echo "AGENT-LOCK: reclaim-main-checkout abgelehnt — main-Checkout $(_holder_msg "$f")" >&2
    echo "  Das ist ein deliberater Claim, keine Bookkeeping-Eintragung. Koordiniere mit" >&2
    echo "  der haltenden Session oder nutze einen Worktree." >&2
    return 1
  fi
  local br; br="$(git rev-parse --abbrev-ref HEAD 2>/dev/null)"
  [ "$br" = "HEAD" ] && br=""
  SCOPE=main-checkout; ID=""; LABEL="$_SELF_CLAIM_LABEL"; WT=""; BRANCH="$br"; TICKET=""
  CREATED="$(_now)"; _write_lock "$f"
  echo "AGENT-LOCK: main-checkout reclaimed (vorher $owner_sid, jetzt $(_my_sid))." >&2
  return 0
}
```

Dispatch-Eintrag in `main()` ergänzen (nach `guard-postcheckout`), Usage-String erweitern:

```bash
    reclaim-main-checkout) cmd_reclaim_main_checkout "$@";;
    *) echo "Usage: agent-lock.sh {claim|refresh|release|check|check-and-claim|check-merged|list|reap|mine|guard-precommit|guard-postcheckout|reclaim-main-checkout}" >&2; return 2;;
```

**Warum kein `cmd_claim ... --force`:** `--force` in `cmd_claim` verlangt zusätzlich einen
toten `owner_pid` (Zeilen 338–345) — das wäre für einen lebenden, aber nur bookkeeping-
haltenden Vorgänger falsch verweigert. Die Unterscheidung, die hier trägt, ist NICHT
"lebt der PID", sondern "ist der Lock deliberat oder nur Buchführung" (Label), deshalb
schreibt `cmd_reclaim_main_checkout` den Lock direkt via `_write_lock`, nach demselben
Label-Gate, das `cmd_guard_precommit` bereits für denselben Zweck nutzt.

**Warum `cmd_guard_postcheckout` selbst unverändert bleibt:** die bestehende
SID-Gleichheitsprüfung (`[ "$(_lock_field "$f" owner_sid)" = "$(_my_sid)" ] && return 0`) ist
bereits korrekt — sie fehlte nur ein Weg für die aktuelle Session, `owner_sid` deliberat auf
sich selbst umzuschreiben, wenn der bisherige Halter nur Buchführung war. Der Schutz gegen
einen echten, deliberat arbeitenden Fremd-Halter bleibt vollständig erhalten (Task 1,
Negativfall).

### Task 3 — Warnhinweis in `cmd_guard_postcheckout` ergänzen (GREEN)

In `scripts/agent-lock-guards.sh`, direkt nach der bestehenden Revert-Meldung (Zeile ~58),
eine Zeile ergänzen, die den neuen Befehl als Ausweg nennt — damit ein Operator ihn beim
nächsten Vorfall findet, statt erneut `git worktree add` als Workaround zu suchen:

```bash
  if git checkout "$br" >/dev/null 2>&1; then
    echo "AGENT-LOCK: main-Checkout auf '$br' zurückgesetzt (Lock-Halter aktiv)." >&2
    echo "  Eigener Wechsel gewuenscht? 'bash scripts/agent-lock.sh reclaim-main-checkout'" >&2
    echo "  VOR dem naechsten checkout, falls der Lock nur Bookkeeping ist." >&2
  else
```

Rein additiv — keine bestehende Zeile wird verändert, keine Logikänderung an diesem File.

### Task 4 — Tests + Final Verification

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/active-sessions-hub/agent-lock-main-checkout-reclaim.bats
# expected: alle drei Tests GREEN

# Regressionscheck der bestehenden agent-lock-Suite (SID-/Claim-/Release-Verhalten
# unveraendert):
tests/unit/lib/bats-core/bin/bats -r \
  tests/spec/agent-lock-session-identity.bats \
  tests/spec/agent-lock-force-claim.bats \
  tests/spec/agent-lock-fetch-guard.bats \
  tests/spec/agent-lock-claim-persist.bats

task test:inventory   # neue .bats-Datei ins Inventar aufnehmen, mitcommitten
task test:changed
task freshness:regenerate
task freshness:check
```
