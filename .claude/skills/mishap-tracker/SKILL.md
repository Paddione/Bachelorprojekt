---
name: mishap-tracker
description: 'Use at the END of any runbook or dev-flow skill to file the frictions it accumulated — writes each MISHAP_LOG entry as a comment on the ticket being worked on. Without ticket context an entry is logged and discarded; no collection container and no follow-up ticket is created. Only incident types (incident, broken, security) create a ticket each. Triggers on mishap, MISHAP_LOG, friction report, "report what went wrong", scripts/hooks/mishap-tracker.sh, and the closing step of dev-flow-plan, dev-flow-execute, dev-flow-chore, infra-ops, incident-response and ticket-ops.'
---

# mishap-tracker

Records execution mishaps **on the ticket that was being worked on** when they occurred. No
collection container, no cycle, no carry-over.

Incident types (`incident`, `broken`, `security`) bypass the buffer entirely and still create one
ticket each via `createIncidentTicket`.

Without ticket context an entry is logged to stderr and `.mishaps.log` and then discarded — it
does **not** produce a ticket. All three buffer drain paths behave identically: threshold,
watchdog (`FlushStaleBuffer`) and the manual `flush_mishap_buffer` [T003553].

> **Der Rollup-Automat ist entfernt [T014104].** Er legte seinen Sammel-Container bei jedem
> Factory-Tick neu an — sein Entfernen war die Ausloesebedingung fuer den naechsten — und hat
> ueber vier Zyklen keinen einzigen Eintrag disponiert. Wer in aelteren Plaenen oder
> Ticket-Kommentaren auf "Mishap Rollup — fortlaufende Sammlung", `mishap-rollup.sh` oder
> `ticket.sh rollup-container` stoesst: das sind Altlasten, kein aktueller Weg.

Called as the final step of runbook skills that maintain a `MISHAP_LOG`.

### Branch-Naming-Konvention (T002240 — Gross-/Kleinschreibung)

Einzel-Mishap-Branch (mit Ticket-ID):

```bash
ext_id="<T-ID aus ticket.sh>"       # z.B. T002239 — bleibt GROSS (pre-commit: T[0-9]{6,})
slug=$(echo "$ext_id" | tr '[:upper:]' '[:lower:]')   # openspec-Slug bleibt lowercase
branch="chore/mishap-<ext-id>"      # Branch-Name mit GROSSEM Ticket-Suffix
# Beispiel: branch="chore/mishap-T002239"
```

- Der **Branch** traegt die Ticket-ID GROSS (`T[0-9]{6,}`) — sonst schlaegt die pre-commit-Pruefung fehl.
- Das **openspec-Verzeichnis** (slug) bleibt lowercase (Konvention).

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

## Step 2: Mishaps via ticket-mcp melden

Für jeden verifizierten Mishap im MISHAP_LOG:

```
mcp__ticket-mcp__report_mishap({
  title: "<titel>",
  description: "<beschreibung>",
  component: "<komponente>",
  type: "<broken|degraded|suspicious|security|drift>",
  brand: "<brand>"
})
```

**Rückmeldung auswerten:**
- `"Incident-Ticket angelegt: T000xxx"` → sofortiges Incident-Ticket für `incident`/`broken`/`security`, kein Buffer-Eintrag
- `"Mishap gespeichert (3/10). Noch 7 bis zum Buffer-Flush."` → weiter melden, Buffer sammelt
- `"10 Mishaps protokolliert und verworfen. Buffer geleert."` → Schwelle (10) erreicht. Kein Ticket, kein Container [T014104]. Was erhalten bleiben soll, gehoert als Kommentar an das bearbeitete Ticket (`mishap-tracker.sh --ticket`)

---

## Step 3: Buffer am Session-Ende liegen lassen

Nach dem letzten `report_mishap`-Aufruf den Buffer-Stand ansehen — **aber nicht flushen**:

```
mcp__ticket-mcp__get_mishap_buffer()
```

**Restliche Eintraege bleiben liegen. Das ist der Normalfall, kein Fehlerzustand.**

Der Buffer ist dateibasiert (`mishap-buffer.json` im gemeinsamen Git-Verzeichnis, aufgeloest ueber
`git rev-parse --git-common-dir`) und damit **persistent**: er ueberlebt Sessionwechsel,
Worktrees und Neustarts. Ein liegen gebliebener Eintrag wird vom naechsten `report_mishap`
mitgezaehlt.

Laeuft der Buffer ueber (Schwelle 10) oder loest der Alters-Schnitt aus (aeltester Eintrag
≥ 7 Tage), werden die Eintraege **protokolliert und verworfen** — es entsteht kein Ticket und
kein Container [T014104]. Der Buffer ist damit ein Puffer fuer den Sessionverlauf, kein
Zulieferer eines Automaten.

| Weg | Ausloeser | Ergebnis |
|---|---|---|
| Schwelle | `report_mishap` ab **10** Eintraegen | Eintraege protokolliert, Buffer geleert |
| Alters-Schnitt | Factory-Tick ruft `ticket-mcp-go --flush-stale-mishaps` | dito, sobald der aelteste Eintrag ≥ 7 Tage alt ist |

**Der Weg, auf dem ein Mishap erhalten bleibt, ist der Ticket-Kommentar** — nicht der Buffer:

```bash
bash scripts/hooks/mishap-tracker.sh --friction "<text>" --ticket "$TICKET_ID" --severity minor
```

Ohne `--ticket` landet der Eintrag in `.mishaps.log` und auf stderr, und dort endet er. Das ist
gewollt: eine Reibung ohne Bezug zu einer Arbeit hat keinen Adressaten.

**Nichts entsteht direkt als `plan_staged` [T003027].** Mishap-Tickets
(`scripts/ticket-mcp/go/internal/tools/mishap.go`) werden mit `status=triage` angelegt. Der Grund
ist der Guard aus T002876: `update-status.sh` lehnt `plan_staged` ohne `FACTORY-PLAN-REF`
fail-closed ab — ein Ticket, das den gestagten Zustand behauptet, ohne einen Plan zu haben, ist
widerspruechlich.

`flush_mishap_buffer` bleibt als **bewusster manueller Schnitt** verfuegbar:

```
mcp__ticket-mcp__flush_mishap_buffer({ brand: "<brand>" })
```

---

## Step 3.5: Mishap-Bundle automatisch planen

Ein Mishap-**Bundle**-Ticket (`severity=minor`/`trivial`) braucht kein menschliches Urteil und
wird automatisch von `triage` nach `plan_staged` gehoben. Das erledigt
`scripts/factory/auto-chore-plan.sh` [T002390] — der Factory-Tick ruft es pro Marke auf. Diese
Skill beschreibt den Schritt **nicht** noch einmal in Prosa: das Skript ist die Quelle, der Text
war es frueher und wurde deshalb uebersprungen (am 2026-07-28 lagen 8 auto-planbare Bundles in
`triage`).

```bash
BRAND=<brand> bash scripts/factory/auto-chore-plan.sh --all [--dry-run]
```

Das Gate laesst nur `minor`/`trivial` durch. `major`/`critical` tragen `broken`- oder
`security`-Eintraege, gehoeren vor menschliche Augen und bleiben `triage`.

> Nicht zu verwechseln mit dem abgebauten Rollup-Automaten [T014104]: `auto-chore-plan.sh`
> plant ein **vorhandenes** Ticket, es erzeugt keines und legt keinen Container an.

---

## Step 4: Fallback — Kein ticket-mcp erreichbar

Falls der MCP-Server nicht antwortet, einen formatierten Block ausgeben für manuelle Eingabe unter `https://web.mentolder.de/admin/bugs`.

**Incident-Pfad:** `incident`-/`broken`-/`security`-Mishaps erfordern sofortige Aufmerksamkeit.
Lege ein Incident-Ticket manuell an:

```bash
bash scripts/ticket.sh create --type incident --title "..." --description "..." --brand <brand>
# oder via ticket-mcp (nur CLI):
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

