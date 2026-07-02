---
name: mishap-tracker
description: Shared utility — batches all execution mishaps into a single aggregate ticket. Reuses an existing open "Mishap collection" ticket if one exists; creates a new one otherwise. Each mishap is individually classified within the aggregate.
---

# mishap-tracker

Batches all execution mishaps into **one aggregate ticket** rather than creating N individual tickets.

Called as the final step of runbook skills that maintain a `MISHAP_LOG`.

---

## Input

The calling skill accumulates a `MISHAP_LOG` — a list of entries, each with:
- `type`: `broken` | `degraded` | `suspicious` | `security` | `drift` | `process`
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
| `process` | Observations, not assertions — no verification needed |
| `security` | Always report without suppression |

**If verification contradicts the observation:** drop the mishap and log `[mishap-tracker] SKIP <title> — verified false positive: <reason>`.

**If verification is not feasible** (e.g. no cluster access): include the mishap but add `[UNVERIFIED — <reason>]` to its description.

---

## Step 1: Mishap-Typ Klassifikation

| Mishap type | Severity | Priority | Attention mode |
|---|---|---|---|
| `broken` | `major` | `hoch` | `needs_human` |
| `security` | `critical` | `hoch` | `needs_human` |
| `degraded` | `minor` | `mittel` | `needs_human` |
| `suspicious` | `minor` | `mittel` | `ai_ready` |
| `drift` | `trivial` | `niedrig` | `ai_ready` |
| `process` | `trivial` | `niedrig` | `ai_ready` |

For `process` mishaps, set `component = 'skills/<skill-name>'`.

---

## Step 2: Mishaps via ticket-mcp melden

Für jeden verifizierten Mishap im MISHAP_LOG:

```
mcp__ticket-mcp__report_mishap({
  title: "<titel>",
  description: "<beschreibung>",
  component: "<komponente>",
  type: "<broken|degraded|suspicious|security|drift|process>",
  brand: "<brand>"
})
```

**Rückmeldung auswerten:**
- `"2/3 bis zum automatischen Bundle-Ticket"` → weiter melden, Buffer sammelt
- `"Bundle-Ticket angelegt: T000xxx"` → Ticket existiert, Factory-Tick übernimmt

---

## Step 3: Buffer am Ende flushen

Nach dem letzten `report_mishap`-Aufruf immer prüfen, ob noch Einträge im Buffer liegen:

```
mcp__ticket-mcp__get_mishap_buffer()
```

Wenn Einträge vorhanden und weniger als 3 (kein Auto-Trigger):

```
mcp__ticket-mcp__flush_mishap_buffer({ brand: "<brand>" })
```

Dies erzwingt ein Bundle-Ticket auch bei 1–2 Einträgen, damit am Session-Ende nichts verloren geht.

---

## Step 4: Fallback — Kein ticket-mcp erreichbar

Falls der MCP-Server nicht antwortet, einen formatierten Block ausgeben für manuelle Eingabe unter `https://web.mentolder.de/admin/bugs`:

```
--- Mishap-Report ---
Typ | Titel | Komponente | Beschreibung
<type> | <title> | <component> | <description>
...
```

---

## Step 5: Summary

Report:
- Anzahl gemeldeter Mishaps
- Ob ein Bundle-Ticket ausgelöst wurde (und welches `T000xxx`)
- Ob Buffer-Flush am Ende nötig war

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `operations-management` | Auftraggeber — erstellt Tickets aus Mishaps |
| Alle Runbooks | Nutzer — jedes Skill schließt mit Mishap-Report ab |
