---
name: mishap-tracker
description: 'Use at the END of any runbook or dev-flow skill to file the frictions it accumulated — batches every MISHAP_LOG entry into one aggregate ticket instead of N individual ones, reusing an open "Mishap collection" ticket if one exists. Triggers on mishap, MISHAP_LOG, friction report, "report what went wrong", scripts/hooks/mishap-tracker.sh, and the closing step of dev-flow-plan, dev-flow-execute, dev-flow-chore, infra-ops, incident-response and ticket-ops.'
---

# mishap-tracker

Batches all execution mishaps into **one aggregate ticket** rather than creating N individual tickets.

Called as the final step of runbook skills that maintain a `MISHAP_LOG`.

### Branch-Naming-Konvention (T002240 + T002783 — Groß-/Kleinschreibung)

Es gibt zwei Fälle:

**1. Rollup-Container-Branch (persistent, ticketlos, allowlistet):**

```bash
branch="chore/mishap-incident-rollup"   # persistenter Branch, kein Ticket-Suffix
```

Der Branch wird nie gelöscht, das Ticket (`"Mishap Rollup — fortlaufende Sammlung"`,
`type=chore`, `status=plan_staged` — **nur der Rollup-Container**, nicht die einzelnen
Mishap-Tickets) bleibt dauerhaft offen. `worktree-create.sh --unattended`
überspringt den Namens-Guard für diesen Branch (Allowlist). Die gemeinsame Auflösung
erfolgt über `ticket.sh rollup-container --brand <brand>`.

**2. Einzel-Mishap-Branch (mit Ticket-ID):**

```bash
ext_id="<T-ID aus ticket.sh>"       # z.B. T002239 — bleibt GROSS (pre-commit: T[0-9]{6,})
slug=$(echo "$ext_id" | tr '[:upper:]' '[:lower:]')   # openspec-Slug bleibt lowercase
branch="chore/mishap-<ext-id>"      # Branch-Name mit GROSSEM Ticket-Suffix
# Beispiel: branch="chore/mishap-T002239"
```

- Der **Branch** trägt die Ticket-ID GROSS (`T[0-9]{6,}`) — sonst schlägt die pre-commit-Prüfung fehl.
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
| `degraded` | `minor` | `mittel` | `needs_human` | Buffer → Rollup-Container |
| `suspicious` | `minor` | `mittel` | `ai_ready` | Buffer → Rollup-Container |
| `drift` | `trivial` | `niedrig` | `ai_ready` | Buffer → Rollup-Container |

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
- `"Mishap gespeichert (3/10). Noch 7 bis zum Rollup-Container-Append."` → weiter melden, Buffer sammelt
- `"Rollup-Container-Append: 10 Mishaps an den Container angehaengt. Verbleibend: 2."` → Schwelle (10) erreicht, Rollup-Container wurde befüllt (`mishap-mcp` hängt per `add-comment` an den `plan_staged`-Rollup-Container an)

---

## Step 3: Buffer am Session-Ende liegen lassen

Nach dem letzten `report_mishap`-Aufruf den Buffer-Stand ansehen — **aber nicht flushen**:

```
mcp__ticket-mcp__get_mishap_buffer()
```

**Restliche Einträge bleiben liegen. Das ist der Normalfall, kein Fehlerzustand.**

Der Buffer ist dateibasiert (`mishap-buffer.json` im gemeinsamen Git-Verzeichnis, aufgelöst über
`git rev-parse --git-common-dir`) und damit **persistent**: er überlebt Sessionwechsel,
Worktrees und Neustarts. Ein liegen gebliebener Eintrag wird vom nächsten `report_mishap`
mitgezählt und geht nicht verloren. Wenn die Schwelle von 10 Einträgen erreicht wird oder ein Stale-Flush auslöst, hängt `ticket-mcp` die Einträge als strukturierten Kommentar an den zentralen Rollup-Container ("Mishap Rollup — fortlaufende Sammlung").
> einen dev-flow-Zyklus, der wieder in diesem Schritt endet. Bei ≥ 1 Bundle pro Zyklus ist der
> Rückstand per Konstruktion nicht abbaubar — am 27.07.2026 entstanden so 32 Bundles, 19 blieben
> offen. Den Flush aus Sorge vor Datenverlust wiederherzustellen ist der Rückfall in genau dieses
> Verhalten; die Sorge ist unbegründet (siehe Persistenz oben).

An den Rollup-Container angehängt wird auf zwei Wegen, beide ohne Session-Bezug:

| Weg | Auslöser |
|---|---|
| Schwelle | `report_mishap` hängt ab **10** Einträgen an den Rollup-Container an |
| Alters-Schnitt | Der Factory-Tick (`scripts/factory/wakeup.sh`) ruft periodisch `ticket-mcp-go --flush-stale-mishaps` auf und hängt an, sobald der älteste Eintrag ≥ 7 Tage alt ist |

**Zum Rollup-Container:** Ein persistentes Ticket (`type=chore`) mit dem Titel "Mishap Rollup —
fortlaufende Sammlung". Es wird niemals geschlossen — nicht-kritische Mishaps werden als
Kommentar-Batches an dieses Ticket gehängt. Der Rollup-Treiber
(`scripts/factory/mishap-rollup.sh`) extrahiert daraus periodisch einen Plan und staged ihn.

**Nichts entsteht direkt als `plan_staged` [T003027].** Sowohl die einzelnen Mishap-Tickets
(`scripts/ticket-mcp/go/internal/tools/mishap.go`) als auch der Container selbst
(`ticket.sh rollup-container`) werden mit `status=triage` angelegt. Der Grund ist der Guard aus
T002876: `update-status.sh` lehnt `plan_staged` ohne `FACTORY-PLAN-REF` fail-closed ab — ein
Ticket, das den gestagten Zustand behauptet, ohne einen Plan zu haben, ist widersprüchlich.
Der Unterschied zwischen beiden liegt also **nicht** in der Anlage, sondern danach: nur der
Container durchläuft `stage-plan` und erreicht dabei `plan_staged` **zusammen mit** seinem
Plan-Ref. Im eingeschwungenen Zustand steht er deshalb auf `plan_staged`.

`flush_mishap_buffer` bleibt als **bewusster manueller Schnitt** verfügbar — z. B. wenn ein
Befund sofort ein Ticket braucht. Es ist kein Pflichtschritt dieses Skills mehr:

```
mcp__ticket-mcp__flush_mishap_buffer({ brand: "<brand>" })
```

---

## Step 3.5: Rollup-Container → Plan generieren

Nicht-kritische Mishaps, die den Buffer-Schwellwert erreicht oder den Alters-Schnitt
ausgelöst haben, liegen als Kommentar-Batches am Rollup-Container-Ticket
("Mishap Rollup — fortlaufende Sammlung", `type=chore`, `status=plan_staged` — auch hier
nur der Rollup-Container, nicht die angehängten Einzel-Mishaps).

**Ausgeführt wird das Extrahieren von `scripts/factory/mishap-rollup.sh` [T002407]** — nicht von Hand:

```bash
BRAND=<brand> bash scripts/factory/mishap-rollup.sh
```

Der Factory-Tick (`wakeup.sh`) ruft es pro Brand auf, sodass liegen gebliebene Batches
von selbst aufgegriffen werden.

Was das Skript garantiert (Details im Skriptkopf `scripts/factory/mishap-rollup.sh`):

- **Fester Slug/Branch:** `mishap-incident-rollup` / `chore/mishap-incident-rollup` — der
  Branch wird nie gelöscht, das Ticket nie geschlossen.
- **Update statt Neu:** existiert das Change-Verzeichnis bereits, wird `tasks.md` neu
  erzeugt — kein Abbruch.
- **`plan-lint` als Hard Gate:** bei FAIL kein `stage-plan`, Container bleibt `plan_staged`.
- **Commit und Push `&&`-verkettet** — ein abgelehnter Commit verhindert einen Push auf
  eigener Zeile nicht.
- **No-op-Pfad:** keine unverarbeiteten Batches → Meldung und `exit 0` ohne Worktree-Anlage.

Nach erfolgreichem `stage-plan` ist der Container wieder bereit für die nächste Batch-Runde.

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
dispatched wird. Nicht-kritische Mishaps (`degraded`/`suspicious`/`drift`) können als
Kommentar am Rollup-Container-Ticket (s.o.) nachgetragen werden, sobald der MCP-Server
wieder erreichbar ist — sie laufen nicht weg, da der Buffer dateibasiert ist.

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
- Bei nicht-kritischem Bundle zusätzlich: ob ein Auto-Chore-Plan gestaged wurde
  (Branch `$branch` = `chore/mishap-<ext-id>`, `status=plan_staged` — der aus dem
  Rollup-Container extrahierte Bundle-Plan, nicht ein rohes Einzel-Mishap-Ticket) oder
  übersprungen wurde (Lint-Fehler → `status=triage`)

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

