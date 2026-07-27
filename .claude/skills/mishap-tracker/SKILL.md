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

Sobald ein Bundle-Ticket soeben angelegt wurde (external id `<ext-id>`), prüft dieser Schritt,
ob ein Chore-Plan automatisch erzeugt und der Software Factory zur Umsetzung übergeben werden
kann — ohne menschliche Zwischenstation.

1. **Gate auf dem lokalen `MISHAP_LOG` (NICHT `ticket.sh get`).** Berechne `has_critical` =
   „mindestens ein `MISHAP_LOG`-Eintrag mit `type` = `broken` oder `security`". Wichtig:
   `scripts/vda/ticket/get.sh` liefert **kein** `severity`- und **kein** `description`-Feld im
   JSON — ein DB-Roundtrip über `ticket.sh get` kann die Severity also nicht liefern. Das
   in-session `MISHAP_LOG` ist daher die einzige Quelle der Wahrheit (spiegelt `mishap.go`s
   `classifyBundle` → `severity=major` bei `broken`/`security`) und funktioniert zusätzlich
   offline. Falls `has_critical` → **stop**: Ticket bleibt bei `status=triage` für manuelle
   Triage (heutiges Verhalten). Sonst weiter.
2. **Slug UND Branch — zwei verschiedene Werte [T002240].**

   ```bash
   # Verzeichnis-Slug: KOMPLETT lowercase (openspec/changes/<slug>-Konvention)
   slug="mishap-$(echo "<ext-id>" | tr '[:upper:]' '[:lower:]')"   # -> mishap-t002239
   # Branch-Name: Ticket-ID UNVERAENDERT, grosses T (NICHT aus dem Slug ableiten!)
   branch="chore/mishap-<ext-id>"                                  # -> chore/mishap-T002239
   ```

   > ⚠️ **Falle (2026-07-26 live gestolpert):** `.githooks/pre-commit` erzwingt eine
   > **case-sensitive** Ticket-ID im Branch-Namen (`[[ "$_bn" =~ T[0-9]{6,} ]]`).
   > `chore/mishap-t002239` mit kleinem `t` matcht diese Regex **nicht** — der Commit
   > wird abgelehnt und Schritt 3.5 kann so nie durchlaufen. Den lowercase-Slug also
   > **ausschliesslich** fuer `openspec/changes/<slug>` verwenden, den Branch-Namen
   > immer aus der unveraenderten `<ext-id>` bauen. Den Branch-Namen aus dem
   > lowercase-Slug abzuleiten ist genau der Bug — nicht wieder einfuehren.
   >
   > Und weil ein abgelehnter Commit den nachfolgenden Push **nicht** verhindert,
   > wenn beide auf getrennten Zeilen stehen: `git commit … && git push …` immer
   > `&&`-verketten (siehe Schritt 7) und danach `git log --oneline -1` pruefen.

3. `bash scripts/openspec.sh propose "$slug" --ticket <ext-id>` — seedet das
   plan-lint-konforme `openspec/changes/$slug/tasks.md`-Skelett (headless; kein Brainstorming).
4. **Authoring an einen frischen Subagenten delegieren** (Provisionierung gemäß
   `.claude/skills/references/subagent-provisioning.md`; inkl. Anti-Context-Overflow-
   Handoff-Direktive). Die vollständigen `MISHAP_LOG`-Einträge als Kontext übergeben. Der
   Subagent befüllt `openspec/changes/$slug/tasks.md` mit:
   - je `MISHAP_LOG`-Eintrag ein Fix-Task, der die betroffene Komponente und die konkrete
     Behebung aus der `description` des Eintrags benennt;
   - mindestens einen echten RED-Failing-Test-Schritt mit dem wörtlichen Ausdruck
     `expected: FAIL` plus einem echten Runner-Aufruf (`bats … tests/spec/<file>.bats` oder
     `vitest …`) gegen eine bestehende Testdatei — die plan-lint-STRUCT2-Anforderung;
   - einen abschließenden Verify-Task mit `task test:changed`, `task freshness:regenerate`,
     `task freshness:check` (STRUCT3);
   - Pflicht-Frontmatter (`title`, `ticket_id`, `domains`, `status`) und die Form
     `# <slug> — Implementation Plan` / `## File Structure` (STRUCT1).
5. `bash scripts/plan-lint.sh openspec/changes/$slug/tasks.md` — Hard Gate. Bei FAIL: mit dem
   Linter-Output erneut delegieren (max. 2 Retries). Bleibt es rot: **kein** Aufruf von
   `stage-plan`; Ticket bleibt bei `status=triage`, Lint-Fehler im Summary melden (kein
   Rollback nötig — nichts wurde gestaged).
6. `./scripts/ticket.sh stage-plan --id <ext-id> --branch "$branch" --plan "openspec/changes/$slug/tasks.md"`
   — setzt `status=plan_staged`, schreibt den `FACTORY-PLAN-REF branch=$branch plan=…`-
   Kommentar und markiert scout/design/plan-Phase-Events als done (bestehendes
   `stage-plan.sh`-Verhalten). `--branch` bekommt den **Branch** aus Schritt 2, nicht den Slug.
7. Commit + Push des `$branch`-Branches — beide Kommandos **`&&`-verkettet** in einem Aufruf:
   `git add openspec/changes/$slug && git commit -m "chore(plans): stage $slug for factory [<ext-id>]" && git push -u origin "$branch"`.
   Danach `git log --oneline -1` pruefen: HEAD muss den neuen Commit zeigen. (Ohne `&&`
   laeuft der Push auch nach einem abgelehnten Commit und legt einen **leeren Branch** an;
   `.githooks/pre-push` blockt diesen Fall inzwischen, das ist aber der Backstop, nicht die
   Regel.)
   Ab hier erkennt die Software Factory (queue.sh/slots.sh/pipeline.js/dispatcher-bridge.sh)
   den `FACTORY-PLAN-REF` automatisch, schedult das Ticket und treibt es bis zum Merge.

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

