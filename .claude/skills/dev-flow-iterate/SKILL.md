---
name: dev-flow-iterate
description: Use when iterating on a dev k3d cluster (mentolder or korczewski) — deploys a surface, browses with Playwright MCP, tails pod logs, synthesizes issues, applies fixes, and loops until clean or user stops. Invoke standalone any time, or automatically from dev-flow-execute Step 4. Triggers on: "iterate on dev", "check dev cluster", "test on dev", "preview on dev", "dev loop".
category: devflow
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
