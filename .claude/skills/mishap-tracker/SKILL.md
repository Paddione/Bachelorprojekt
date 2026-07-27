---
name: mishap-tracker
description: 'Use at the END of any runbook or dev-flow skill to file the frictions it accumulated — batches every MISHAP_LOG entry into one aggregate ticket instead of N individual ones, reusing an open "Mishap collection" ticket if one exists. Triggers on mishap, MISHAP_LOG, friction report, "report what went wrong", scripts/hooks/mishap-tracker.sh, and the closing step of dev-flow-plan, dev-flow-execute, dev-flow-chore, infra-ops, incident-response and ticket-ops.'
---

# mishap-tracker

Batches all execution mishaps into **one aggregate ticket** rather than creating N individual tickets.

Called as the final step of runbook skills that maintain a `MISHAP_LOG`.

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

| Mishap type | Severity | Priority | Attention mode |
|---|---|---|---|
| `broken` | `major` | `hoch` | `needs_human` |
| `security` | `critical` | `hoch` | `needs_human` |
| `degraded` | `minor` | `mittel` | `needs_human` |
| `suspicious` | `minor` | `mittel` | `ai_ready` |
| `drift` | `trivial` | `niedrig` | `ai_ready` |

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
- `"Mishap gespeichert (2/10). Noch 8 bis zum automatischen Bundle-Ticket."` → weiter melden, Buffer sammelt
- `"Bundle-Ticket angelegt: T000xxx"` → Ticket existiert, Factory-Tick übernimmt

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
mitgezählt und geht nicht verloren.

> **Warum hier früher ein erzwungener Flush stand — und warum er weg ist (T002383):**
> Der Flush erzeugte Bundle-Tickets aus 1–2 Einträgen. Jedes Bundle-Ticket verbraucht seinerseits
> einen dev-flow-Zyklus, der wieder in diesem Schritt endet. Bei ≥ 1 Bundle pro Zyklus ist der
> Rückstand per Konstruktion nicht abbaubar — am 27.07.2026 entstanden so 32 Bundles, 19 blieben
> offen. Den Flush aus Sorge vor Datenverlust wiederherzustellen ist der Rückfall in genau dieses
> Verhalten; die Sorge ist unbegründet (siehe Persistenz oben).

Gebündelt wird stattdessen auf zwei Wegen, beide ohne Session-Bezug:

| Weg | Auslöser |
|---|---|
| Schwelle | `report_mishap` bündelt automatisch ab **10** Einträgen |
| Alters-Schnitt | Der Factory-Tick (`scripts/factory/wakeup.sh`) ruft periodisch `ticket-mcp-go --flush-stale-mishaps` auf und bündelt, sobald der älteste Eintrag ≥ 7 Tage alt ist |

`flush_mishap_buffer` bleibt als **bewusster manueller Schnitt** verfügbar — z. B. wenn ein
Befund sofort ein Ticket braucht. Es ist kein Pflichtschritt dieses Skills mehr:

```
mcp__ticket-mcp__flush_mishap_buffer({ brand: "<brand>" })
```

---

## Step 3.5: Non-critical bundle → auto-chore-plan

Ein Bundle ohne kritische Einträge geht **ohne menschliche Zwischenstation** von `triage`
nach `plan_staged` und wird damit von der Software Factory aufgegriffen.

**Ausgeführt wird das von `scripts/factory/auto-chore-plan.sh` [T002390]** — nicht von Hand:

```bash
bash scripts/factory/auto-chore-plan.sh <ext-id>
```

Der Factory-Tick (`wakeup.sh`) ruft es zusätzlich mit `--all` je Brand auf, sodass liegen
gebliebene Bundles von selbst nachgezogen werden.

**Warum als Skript und nicht als Anleitung:** Dieser Schritt stand bis 2026-07-28 hier als
Prosa — und wurde in der Praxis übersprungen. Acht auto-planbare Bundles lagen deshalb in
`triage`, während der Dispatcher und die Factory beide einsatzbereit waren. Ein
Automatisierungsschritt, der von der Aufmerksamkeit des Ausführenden abhängt, ist keiner.
Deshalb steht das Verfahren **nur** im Skript; wird es hier erneut ausgeschrieben, driften
Prosa und Code wieder auseinander.

Was das Skript garantiert (Details und Begründungen im Skriptkopf):

- **Severity-Gate:** nur `minor`/`trivial`. `major`/`critical` tragen `broken`- oder
  `security`-Einträge und bleiben für menschliche Triage in `triage`.
- **`plan-lint` als Hard Gate:** bei FAIL kein `stage-plan`, Ticket bleibt `triage`.
- **Branch mit unveränderter Ticket-ID** (`chore/mishap-T002382`), Verzeichnis-Slug lowercase.
  `.githooks/pre-commit` prüft `T[0-9]{6,}` case-sensitive; ein aus dem Slug abgeleiteter
  Branch wird abgelehnt und der Schritt stirbt still (T002240).
- **Commit und Push `&&`-verkettet** — ein abgelehnter Commit verhindert einen Push auf
  eigener Zeile nicht.

Ab `plan_staged` erkennt die Factory den `FACTORY-PLAN-REF`, schedult das Ticket und treibt es
bis zum Merge.

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
- Wie viele Einträge im Buffer liegen bleiben (Normalfall — kein Flush)
- Bei nicht-kritischem Bundle zusätzlich: ob ein Auto-Chore-Plan gestaged wurde
  (Branch `$branch` = `chore/mishap-<ext-id>`, `status=plan_staged`) oder übersprungen wurde
  (Lint-Fehler → `status=triage`)

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

