---
name: mishap-tracker
description: 'Use at the END of any runbook or dev-flow skill to record the frictions it accumulated — each MISHAP_LOG entry goes to stderr and .mishaps.log (local-only, no ticket backend since 2026-10-14). Incident types (incident, broken, security) additionally need a GitHub issue (manual). Triggers on mishap, MISHAP_LOG, friction report, "report what went wrong", scripts/hooks/mishap-tracker.sh, and the closing step of dev-flow-plan, dev-flow-execute, dev-flow-chore, infra-ops and incident-response.'
---

# mishap-tracker

Records execution mishaps **locally** (stderr + `.mishaps.log`). No collection container, no
cycle, no carry-over, no tickets — the Ticket-Backend (ticket-mcp, `ticket.sh`,
`mishap-buffer.json`, Rollup-Automat) entfiel mit dem Ticket-Retirement 2026-10-14.

Called as the final step of runbook skills that maintain a `MISHAP_LOG`.

> **Der Rollup-Automat ist entfernt [T014104].** "Mishap Rollup — fortlaufende Sammlung",
> `mishap-rollup.sh` und `ticket.sh rollup-container` in aelteren Plaenen oder Kommentaren sind
> Altlasten, kein aktueller Weg.

## Input

The calling skill accumulates a `MISHAP_LOG` — a list of entries, each with:
- `type`: `broken` | `degraded` | `suspicious` | `security` | `drift`
- `title`: Short, actionable summary
- `description`: What was observed and why it matters
- `component`: Affected subsystem (e.g., `kubeconfig`, `repo/chore/…`, `skills/<name>`)

**Preamble-Konvention für Runbook-Skills (SSOT):** Runbooks tragen am Dateianfang nur den
Zwei-Zeilen-Verweis („Führe ein `MISHAP_LOG` … siehe `mishap-tracker` §Input") — die Semantik
lebt hier: pro Anomalie, unerwartetem Zustand, kaputter Komponente, Security-Bedenken oder
Config-Drift — **auch wenn irrelevant für die aktuelle Aufgabe** — einen Eintrag mit den vier
Feldern oben anlegen und diesen Skill ganz am Ende aufrufen.

If the log is empty, report that and stop — nothing to track.

---

## Step 0: Verify Before Creating (False-Positive Guard)

Before reporting any mishap, verify the claim with a concrete check:

| Mishap type | Required verification |
|---|---|
| `broken` (import cycle) | `grep -r 'import.*<file>' <target>` to confirm the cycle actually exists |
| `broken` (file missing/stale) | `ls` or `git show HEAD:<file>` to confirm absence |
| `drift` (version mismatch) | Check current value via kubectl/grep before asserting drift |
| `suspicious` (unexpected state) | Run the command that reveals the state and confirm it |
| `security` | Always report without suppression |

**If verification contradicts the observation:** drop the mishap and log `[mishap-tracker] SKIP <title> — verified false positive: <reason>`.

**If verification is not feasible** (e.g. no cluster access): include the mishap but add `[UNVERIFIED — <reason>]` to its description.

---

## Step 1: Mishap-Typ Klassifikation

| Mishap type | Severity | Attention mode | Verhalten |
|---|---|---|---|
| `incident` | `major` | `needs_human` | Lokal loggen + manuell GitHub-Issue (Label `incident`) |
| `broken` | `major` | `needs_human` | Alias für `incident` — lokal loggen + Issue bei Handlungsbedarf |
| `security` | `critical` | `needs_human` | Alias für `incident` — lokal loggen + Issue bei Handlungsbedarf |
| `degraded` | `minor` | `needs_human` | Lokal loggen, verwerfen |
| `suspicious` | `minor` | `ai_ready` | Lokal loggen, verwerfen |
| `drift` | `trivial` | `ai_ready` | Lokal loggen, verwerfen |

---

## Step 2: Mishaps lokal melden

Für jeden verifizierten Mishap im MISHAP_LOG:

```bash
bash scripts/hooks/mishap-tracker.sh --friction "<titel>: <beschreibung> [<komponente>]" --severity <minor|major|critical>
```

Das Skript schreibt nach stderr und hängt an `./.mishaps.log` (gitignored) — Exit 0, kein
Backend, kein Buffer. `--ticket` wird als Legacy-No-op mit Warnung akzeptiert.

---

## Step 3: Summary

Report:
- Anzahl gemeldeter Mishaps
- Ob ein GitHub-Issue angelegt wurde (manuell, nur bei `incident`/`broken`/`security` mit Handlungsbedarf)
- Dass alle Einträge in `.mishaps.log` stehen und dort enden

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `operations-management` | Auftraggeber — routet Ops-Anfragen |
| Alle Runbooks | Nutzer — jedes Skill schließt mit Mishap-Report ab |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |
