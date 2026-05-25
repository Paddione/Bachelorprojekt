---
title: dev-flow-iterate Implementation Plan
ticket_id: null
domains: []
status: active
pr_number: null
---

# dev-flow-iterate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a `dev-flow-iterate` skill that runs a full deploy→browse→logs→fix loop against a dev k3d cluster, and wire it into `dev-flow-execute` Step 4.

**Architecture:** Two file changes — a new skill file at `.claude/skills/dev-flow-iterate/SKILL.md` that owns the complete iteration loop, and a surgical replacement of Step 4 in `.claude/skills/dev-flow-execute/SKILL.md` that delegates to the new skill. No new scripts or Taskfile tasks are added; the skill reuses existing `task dev:redeploy:*`, `kubectl`, and Playwright MCP tools.

**Tech Stack:** Bash (inside skill markdown), kubectl, Playwright MCP (`mcp__plugin_playwright_playwright__browser_*`), existing `task dev:*` targets.

---

## File Map

| Action | Path |
|--------|------|
| Create | `.claude/skills/dev-flow-iterate/SKILL.md` |
| Modify | `.claude/skills/dev-flow-execute/SKILL.md` lines 311–320 |

---

### Task 1: Create `.claude/skills/dev-flow-iterate/SKILL.md`

**Files:**
- Create: `.claude/skills/dev-flow-iterate/SKILL.md`

- [ ] **Step 1: Create the skill directory and write the complete file**

```bash
mkdir -p /home/patrick/Bachelorprojekt/.claude/skills/dev-flow-iterate
```

Write `.claude/skills/dev-flow-iterate/SKILL.md` with exactly this content:

````markdown
---
name: dev-flow-iterate
description: Use when iterating on a dev k3d cluster (mentolder or korczewski) — deploys a surface, browses with Playwright MCP, tails pod logs, synthesizes issues, applies fixes, and loops until clean or user stops. Invoke standalone any time, or automatically from dev-flow-execute Step 4. Triggers on: "iterate on dev", "check dev cluster", "test on dev", "preview on dev", "dev loop".
---

# dev-flow-iterate — Dev Cluster Full-Loop Iteration

## Wann diese Skill greift

Du willst Änderungen auf einem dev k3d Cluster begutachten, bevor du einen PR öffnest.
Der Skill deployed, öffnet den Browser via Playwright MCP, liest Logs und repariert iterativ.

**Sage zu Beginn:** "Ich nutze dev-flow-iterate für die Dev-Iteration."

---

## Eingabe-Parameter

Werden vom Caller übergeben (dev-flow-execute) oder zu Beginn abgefragt:

| Parameter | Werte | Default |
|-----------|-------|---------|
| `ENV` | `mentolder` / `korczewski` | Frage User |
| `SURFACE` | `website` / `brett` / `full` | Auto-detect |

---

## Schritt 0: Cluster-Erreichbarkeit prüfen

```bash
source scripts/env-resolve.sh "$ENV"
# Exportiert: CTX_DEV, NS_DEV, DEV_DOMAIN

task dev:cluster:status ENV=$ENV
```

Falls der Cluster nicht erreichbar ist: **STOP**. Melde:
"Dev-Cluster `$ENV` nicht erreichbar — Iteration wird übersprungen."

---

## Schritt 1: Surface ermitteln

Falls `SURFACE` nicht vom Caller übergeben:

```bash
CHANGED=$(git diff --name-only origin/main)

if echo "$CHANGED" | grep -q '^brett/'; then
  SURFACE=brett
elif echo "$CHANGED" | grep -q '^k3d/\|^prod'; then
  SURFACE=full
else
  SURFACE=website
fi

echo "Surface erkannt: $SURFACE"
```

| SURFACE | Redeploy-Task | Watched pods |
|---------|--------------|--------------|
| `website` | `task dev:redeploy:website ENV=$ENV` | `app=website` |
| `brett` | `task dev:redeploy:brett ENV=$ENV` | `app=brett` |
| `full` | `task dev:deploy ENV=$ENV` | `app=website`, `app=brett` |

---

## Schritt 2: Ziel-URL ableiten

```bash
source scripts/env-resolve.sh "$ENV"
# DEV_DOMAIN ist jetzt gesetzt, z.B. dev.mentolder.de

CHANGED_ROUTE=$(git diff --name-only origin/main \
  | grep '^website/src/pages/' \
  | head -1 \
  | sed 's|website/src/pages||; s|\.astro$||; s|/index$|/|')

DEV_URL="https://${DEV_DOMAIN}${CHANGED_ROUTE:-/}"
echo "Ziel-URL: $DEV_URL"
```

Für brett-Surface: `DEV_URL="https://brett.${DEV_DOMAIN#dev.}"` (z.B. `brett.mentolder.de`).

Für korczewski ohne öffentlichen Hostname: prüfe `DEV_DOMAIN` aus env-resolve — bei reiner
IP/internem Hostname `http://` statt `https://` verwenden.

---

## Schritt 3: Iterations-Loop

Maximale Cycles: **8**. Starte mit `CYCLE=1`.

Wiederhole die folgenden Unter-Schritte, bis der User stoppt oder `CYCLE > 8`.

### 3a: Redeploy

```bash
# Wähle den passenden Task je nach SURFACE:
# SURFACE=website:
task dev:redeploy:website ENV=$ENV
# SURFACE=brett:
task dev:redeploy:brett ENV=$ENV
# SURFACE=full:
task dev:deploy ENV=$ENV
```

### 3b: Auf Readiness warten

```bash
# website:
kubectl rollout status deployment/website -n $NS_DEV --context $CTX_DEV --timeout=90s

# brett (zusätzlich bei brett oder full):
kubectl rollout status deployment/brett -n $NS_DEV --context $CTX_DEV --timeout=90s
```

Falls Timeout (exit ≠ 0): Sofort zu 3c — Logs lesen ist jetzt Pflicht; 3d (Browser) überspringen.

### 3c: Logs lesen

```bash
echo "── website logs ──"
kubectl logs -l app=website -n $NS_DEV --context $CTX_DEV --tail=50 2>/dev/null

# bei brett oder full zusätzlich:
echo "── brett logs ──"
kubectl logs -l app=brett -n $NS_DEV --context $CTX_DEV --tail=50 2>/dev/null
```

### 3d: Playwright MCP (nur wenn Pods Running)

```
browser_navigate         → { url: "$DEV_URL" }
browser_snapshot         → {}
browser_take_screenshot  → { filename: "/tmp/dev-iterate-<CYCLE>.png" }
browser_console_messages → {}
```

### 3e: Synthese

Lies alle Outputs aus 3c und 3d (Logs, Snapshot, Console-Errors, Screenshot).
Erstelle eine nummerierte Issue-Liste:

```
Issues Cycle <CYCLE>:
1. <beschreibung> — Quelle: [logs|snapshot|console]
2. ...

(oder: "Keine Issues sichtbar.")
```

### 3f: Fixes anwenden

Für jedes Issue: zeige konkreten Fix, wende ihn via Edit-Tool an.
Bei destruktiven oder unklaren Fixes: kurze Bestätigungsfrage an User bevor Anwendung.

### 3g: Loop-Entscheidung

- Issues gefunden und gefixt → frage:
  **"Cycle \<CYCLE\> abgeschlossen — \<N\> Issue(s) gefixt. Weiter mit Cycle \<CYCLE+1\>? (ja / stop)"**
- Keine Issues → frage:
  **"Cycle \<CYCLE\>: keine Issues sichtbar. Stoppen oder weiter? (stop / weiter)"**

Bei `stop`: Loop beenden, zu Schritt 4.
Bei `ja` / `weiter`: `CYCLE=$((CYCLE+1))` und zurück zu 3a.

### Cycle-Cap

Falls `CYCLE > 8`:
```
Cycle-Cap (8) erreicht. Noch offene Issues:
<Liste aus letzter Synthese>

Fortfahren mit PR oder manuell weiter iterieren?
```
Loop beenden, zu Schritt 4.

---

## Schritt 4: Rückkehr

- Aufgerufen von `dev-flow-execute` → Kontrolle zurück an **Schritt 5 (PR)**.
- Standalone → Ende. Berichte Zusammenfassung: Cycles gelaufen, Issues gefixt.
````

- [ ] **Step 2: Verify the file exists and has the frontmatter**

```bash
head -5 /home/patrick/Bachelorprojekt/.claude/skills/dev-flow-iterate/SKILL.md
```

Expected output:
```
---
name: dev-flow-iterate
description: Use when iterating on a dev k3d cluster...
---
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/dev-flow-iterate/SKILL.md
git commit -m "feat(skills): add dev-flow-iterate skill"
```

---

### Task 2: Edit `dev-flow-execute` Step 4

**Files:**
- Modify: `.claude/skills/dev-flow-execute/SKILL.md` (lines 311–320)

- [ ] **Step 1: Replace Step 4 content**

In `.claude/skills/dev-flow-execute/SKILL.md`, find and replace this exact block:

Old (lines 311–320):
```markdown
## Schritt 4: Pre-Merge Preview auf dev k3d (optional)

> Der dev.mentolder.de Stack läuft auf k3s-1 (SSH-Zugang erforderlich). Prüfe mit `task dev:cluster:status`. Dieser Schritt ist optional — falls kein dev-Stack erreichbar, lokal verifizieren und direkt auf Prod deployen.

```bash
task dev:cluster:status
task dev:deploy           # voller Stack — oder gezielt:
task dev:redeploy:website # nur Website-Pod
task dev:redeploy:brett   # nur Brett-Pod
```
```

New:
```markdown
## Schritt 4: Dev-Iteration (optional)

Rufe `dev-flow-iterate` auf. Übergib:
- `ENV`: Branch-Kontext (`mentolder` für alle mentolder-Branches, `korczewski` für korczewski-spezifische)
- `SURFACE`: nicht setzen — der Skill erkennt es automatisch aus `git diff --name-only origin/main`

Der Skill prüft Cluster-Erreichbarkeit selbst. Falls nicht erreichbar, beendet er sich sofort.
Nach dem letzten Cycle übergibt er die Kontrolle zurück an Schritt 5 (PR).
```

- [ ] **Step 2: Verify the replacement — Step 4 no longer contains the old task commands**

```bash
grep -n "dev:redeploy\|dev:deploy\|k3s-1" \
  /home/patrick/Bachelorprojekt/.claude/skills/dev-flow-execute/SKILL.md
```

Expected: no output (those strings are gone from the file).

- [ ] **Step 3: Verify Step 5 is still intact immediately after Step 4**

```bash
grep -n "Schritt 4\|Schritt 5" \
  /home/patrick/Bachelorprojekt/.claude/skills/dev-flow-execute/SKILL.md
```

Expected: both lines present, Schritt 5 line number is just a few lines after Schritt 4.

- [ ] **Step 4: Commit**

```bash
git add .claude/skills/dev-flow-execute/SKILL.md
git commit -m "feat(skills): wire dev-flow-iterate into dev-flow-execute step 4"
```

---

## Spec Coverage Check

| Spec requirement | Task |
|-----------------|------|
| New standalone skill file | Task 1 |
| Cluster selection mentolder/korczewski via env-resolve | Task 1 Step 1 (Schritt 0) |
| Surface auto-detect from git diff | Task 1 Step 1 (Schritt 1) |
| Route inference from changed pages | Task 1 Step 1 (Schritt 2) |
| Cycle: redeploy → rollout-wait → logs → Playwright → synthesize → fix → ask | Task 1 Step 1 (Schritt 3) |
| 8-cycle cap with summary | Task 1 Step 1 (Schritt 3, Cycle-Cap) |
| dev-flow-execute Step 4 replaced | Task 2 |
| Caller handoff back to Step 5 | Task 1 Step 1 (Schritt 4) |
