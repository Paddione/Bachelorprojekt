---
name: mishap-tracker
description: 'Use at the END of any runbook or dev-flow skill to file the frictions it accumulated — writes each MISHAP_LOG entry as a comment on the ticket being worked on. Without ticket context an entry is logged and discarded; no collection container and no follow-up ticket is created. Only incident types (incident, broken, security) create a ticket each. Triggers on mishap, MISHAP_LOG, friction report, "report what went wrong", scripts/hooks/mishap-tracker.sh, and the closing step of dev-flow-plan, dev-flow-execute, dev-flow-chore, infra-ops, incident-response and ticket-ops.'
---

# mishap-tracker

Records execution mishaps **on the ticket that was being worked on** when they occurred. No
collection container, no cycle, no carry-over.

Incident types (`incident`, `broken`, `security`) bypass any collection and still create one
ticket each via `ticket.sh create` (s. Step 2).

Without ticket context an entry is logged to stderr and `.mishaps.log` and then discarded — it
does **not** produce a ticket. Es gibt keinen Sammel-Buffer mehr (`report_mishap`/`flush_mishap_buffer`
retiriert mit ticket-mcp-node, T900984 obsolet).

> **Der Rollup-Automat ist entfernt [T014104].** "Mishap Rollup — fortlaufende Sammlung",
> `mishap-rollup.sh` und `ticket.sh rollup-container` in aelteren Plaenen oder Kommentaren sind
> Altlasten, kein aktueller Weg.

Called as the final step of runbook skills that maintain a `MISHAP_LOG`.

### Branch-Naming-Konvention (T002240 — Gross-/Kleinschreibung)

Einzel-Mishap-Branch (mit Ticket-ID):

```bash
ext_id="<T-ID aus ticket.sh>"       # z.B. T002239 — bleibt GROSS (pre-commit: T[0-9]{6,})
slug=$(echo "$ext_id" | tr '[:upper:]' '[:lower:]')   # plan-Slug bleibt lowercase
branch="chore/mishap-<ext-id>"      # Branch-Name mit GROSSEM Ticket-Suffix
# Beispiel: branch="chore/mishap-T002239"
```

- Der **Branch** traegt die Ticket-ID GROSS (`T[0-9]{6,}`) — sonst schlaegt die pre-commit-Pruefung fehl.
- Das **plan-Verzeichnis** (slug) bleibt lowercase (Konvention).

---

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

| Mishap type | Severity | Priority | Attention mode | Verhalten |
|---|---|---|---|---|---|
| `incident` | `major` | `hoch` | `needs_human` | Sofort Ticket (kein Buffer) |
| `broken` | `major` | `hoch` | `needs_human` | Alias für `incident` — sofort Ticket |
| `security` | `critical` | `hoch` | `needs_human` | Alias für `incident` — sofort Ticket |
| `degraded` | `minor` | `mittel` | `needs_human` | Buffer → protokolliert, verworfen |
| `suspicious` | `minor` | `mittel` | `ai_ready` | Buffer → protokolliert, verworfen |
| `drift` | `trivial` | `niedrig` | `ai_ready` | Buffer → protokolliert, verworfen |

---

## Step 2: Mishaps via Hook melden (kein MCP)

Für jeden verifizierten Mishap im MISHAP_LOG:

```bash
bash scripts/hooks/mishap-tracker.sh --friction "<titel>: <beschreibung>" --ticket "$TICKET_ID" --severity <minor|major|critical>
```

**Rückmeldung auswerten:**
- Mit `--ticket`: Kommentar am bearbeiteten Ticket (`ticket.sh add-comment`); dort bleibt erhalten, was erhalten bleiben soll.
- Ohne Ticket-Kontext: Eintrag landet in `.mishaps.log`/stderr und wird verworfen — kein Sammel-Container, kein Follow-up-Ticket.
- Incident-Typen (`incident`/`broken`/`security`) erzeugen je ein eigenes Ticket:
```bash
bash scripts/ticket.sh create --type bug --title "<titel>" --description "<beschreibung>" --severity <critical|major> --priority hoch
```

---

## Step 3: Kein Buffer — nichts flushen

Es gibt keinen Mishap-Buffer mehr (MCP-Transport retiriert). **Eintraege in `.mishaps.log` bleiben
liegen. Das ist der Normalfall, kein Fehlerzustand.** Was erhalten bleiben soll, gehoert als
Kommentar an das bearbeitete Ticket (`mishap-tracker.sh --ticket`).

**Der Weg, auf dem ein Mishap erhalten bleibt, ist der Ticket-Kommentar** — nicht der Buffer:

```bash
bash scripts/hooks/mishap-tracker.sh --friction "<text>" --ticket "$TICKET_ID" --severity minor
```

Ohne `--ticket` landet der Eintrag in `.mishaps.log` und auf stderr, und dort endet er.

**Nichts entsteht direkt als `plan_staged` [T003027].** Mishap-Tickets werden mit `status=triage` angelegt, weil
`update-status.sh` `plan_staged` ohne `FACTORY-PLAN-REF` fail-closed ablehnt (T002876).

---

## Step 3.5: Mishap-Bundle automatisch planen

Ein Mishap-**Bundle**-Ticket (`severity=minor`/`trivial`) wurde vom `triage`-Pfad automatisch nach
`plan_staged` gehoben. Das erledigte bis **T900399** `auto-chore-plan.sh` im Factory-Baum [T002390]
— der Hygiene-Tick rief es pro Marke auf.

> **[T900399] Entfallen.** Mit dem Factory-Teardown gibt es keinen automatischen Hebepfad mehr:
> ein Bundle-Ticket wandert manuell von `triage` nach `plan_staged`. Der Rest dieses Abschnitts
> beschreibt die Gate-Regeln, die weiter gelten — `major`/`critical` tragen `broken`-/`security`-
> Einträge und bleiben `triage`; es wird **kein** Ticket erzeugt und **kein** Container angelegt.
> Ein Automationstragendes Skript an anderer Stelle ist nicht Teil von T900399.

Das Gate laesst nur `minor`/`trivial` durch. `major`/`critical` tragen `broken`- oder
`security`-Eintraege, gehoeren vor menschliche Augen und bleiben `triage`.

---

## Step 4: Fallback — Kein ticket-mcp erreichbar

Falls der MCP-Server nicht antwortet, einen formatierten Block ausgeben für manuelle Eingabe unter `https://web.mentolder.de/admin/bugs`.

**Incident-Pfad:** `incident`-/`broken`-/`security`-Mishaps erfordern sofortige Aufmerksamkeit.
Lege ein Incident-Ticket manuell an:

```bash
bash scripts/ticket.sh create --type incident --title "<titel>" \
  --description "<beschreibung>" --brand <brand>
```

Setze `attention_mode=needs_human` und `status=triage`, damit das Ticket nicht automatisch
dispatched wird. Nicht-kritische Mishaps (`degraded`/`suspicious`/`drift`) werden direkt am
bearbeiteten Ticket vermerkt — dafuer braucht es den MCP-Server gar nicht:

```bash
bash scripts/hooks/mishap-tracker.sh --friction "<text>" --ticket "$TICKET_ID"
```

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
- Wie viele Einträge im Buffer liegen bleiben (Normalfall — kein Flush)
- An welchem Ticket die Eintraege vermerkt wurden (bzw. dass kein Ticket-Kontext vorlag und
  sie verworfen wurden)

---

## Verwandte Skills

| Skill | Beziehung |
|-------|-----------|
| `operations-management` | Auftraggeber — erstellt Tickets aus Mishaps |
| Alle Runbooks | Nutzer — jedes Skill schließt mit Mishap-Report ab |


## Framework mapping

| Framework | Availability |
|-----------|-------------|
| **Claude Code** | Full — load via `load skill <name>` or matches on description triggers |
| **opencode** | Full — available as a listed skill. All tools (CLI, MCP) are framework-agnostic |
| **agy** | Full — treat the opencode path as authoritative. All CLI tools and MCP calls work identically |

