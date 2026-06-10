# Design Spec: Deterministischer Factory Scout

**Ticket:** T000594
**Branch:** feature/factory-scout-deterministic
**Date:** 2026-06-10

## Problem

Der aktuelle Scout-Agent (nach PR #1536) nutzt Claude Sonnet 4.6 für File-Discovery — ein LLM
für eine Aufgabe, die vollständig deterministisch lösbar ist. LLMs haben hier keine Vorteile
gegenüber grep/find und bringen nur Latenz (~3–5s), Kosten (~€0.006/Run) und Nicht-Determinismus.

Die einzige Aufgabe des Scouts ist: _Welche Dateien wird dieses Feature berühren?_ Das ist
Mustererkennung auf Dateinamen und -inhalten — exakt was grep/find kann.

## Ziel

Ersetze den LLM-Scout-Agent vollständig durch ein deterministisches Bash-Script
`scripts/factory/scout.sh`, das dasselbe SCOUT_SCHEMA-konforme JSON liefert:

```json
{
  "complexity": "simple|medium|complex",
  "touched_files": ["/absolute/path/to/file.ts", ...],
  "risk_areas": ["k8s-manifests", "db-migration", ...],
  "similar_tickets": ["T000XXX", ...],
  "estimated_slots": 1
}
```

## Non-Goals

- Kein LLM-Enrichment für `complex`-Features in diesem PR (kann später ergänzt werden).
- Keine Änderung am SCOUT_SCHEMA.
- Keine Änderung an Downstream-Konsumenten (conflict-check.sh, resolvePartialServices,
  Deploy-Gate-2 — alle bleiben unverändert).
- Kein Ersetzen von `find-similar-tickets.mjs` (pgvector bleibt, wird fail-soft aufgerufen).

## Design

### `scripts/factory/scout.sh`

Neues Script, CLI-Signatur:
```bash
bash scripts/factory/scout.sh \
  --ticket-id T000XXX \
  --title   "Feature-Titel" \
  --slug    "feature-slug" \
  --description "Beschreibung..." \
  --repo    /home/patrick/Bachelorprojekt
```
Gibt JSON nach stdout aus, Exit 0 bei Erfolg, Exit 1 bei fatalen Fehlern.

#### Phase 1: Keyword-Extraktion

```bash
# Aus Titel: erste 4 aussagekräftigen Wörter (>3 Zeichen, lowercase)
# Aus Slug: alle Teile mit >2 Zeichen
TITLE_WORDS=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '\n' \
  | awk 'length>3' | head -4 | tr '\n' ' ')
SLUG_PARTS=$(echo "$SLUG" | tr '-' '\n' | awk 'length>2' | tr '\n' ' ')
```

#### Phase 2: File-Discovery (drei Strategien)

**Strategie A — Keyword-Grep** (semantische Nähe):
```bash
# Grep nach Titel-Keywords in Quelldateien
grep -rl --include="*.ts" --include="*.js" --include="*.svelte" --include="*.astro" \
  --include="*.yaml" --include="*.sh" \
  "$KEYWORD1" "$REPO/website/src" "$REPO/scripts" "$REPO/brett" "$REPO/k3d" 2>/dev/null \
  | head -20
```
Pro Keyword einzeln, Ergebnisse vereinigen.

**Strategie B — Namens-Pattern** (strukturelle Nähe):
```bash
find "$REPO/website/src" "$REPO/scripts" "$REPO/brett" -type f \
  \( -name "*.ts" -o -name "*.js" -o -name "*.svelte" -o -name "*.astro" \) \
  2>/dev/null | grep -iE "$(echo $SLUG_PARTS | tr ' ' '|')" | head -20
```

**Strategie C — k3d/Manifest-Scan** (bei infra-Schlüsselwörtern):
```bash
# Nur wenn Titel/Slug Wörter wie "deploy", "manifest", "config", "secret", "cert" enthält
grep -rl "$KEYWORD" "$REPO/k3d" "$REPO/environments" 2>/dev/null | head -10
```

Deduplication: `sort -u`, relative Pfade zu absoluten expandieren.

#### Phase 3: Komplexitäts-Klassifikation

```bash
FILE_COUNT=$(echo "$TOUCHED" | grep -c .)
# Subsysteme = eindeutige erste Pfadkomponente nach $REPO/
SUBSYSTEMS=$(echo "$TOUCHED" | sed "s|$REPO/||" | cut -d/ -f1 | sort -u | wc -l)
HAS_MIGRATION=$(echo "$TOUCHED" | grep -qE "migration|\.sql$" && echo 1 || echo 0)
HAS_K8S=$(echo "$TOUCHED" | grep -qE "^$REPO/(k3d|prod|environments)/" && echo 1 || echo 0)

if   [[ $FILE_COUNT -le 3 && $SUBSYSTEMS -le 1 && $HAS_MIGRATION -eq 0 && $HAS_K8S -eq 0 ]]; then
  COMPLEXITY=simple; SLOTS=1
elif [[ $FILE_COUNT -le 10 && $SUBSYSTEMS -le 2 && $HAS_MIGRATION -eq 0 ]]; then
  COMPLEXITY=medium; SLOTS=2
else
  COMPLEXITY=complex; SLOTS=4
fi
```

**Fallback bei 0 gefundenen Dateien:** `complexity=medium`, `estimated_slots=2`.
Grund: Bei 0 Treffern ist unklar wie groß das Feature ist — lieber zu hoch als zu niedrig
schätzen (Konsequenz: LLM-Modell wird nicht fälschlicherweise auf `haiku` gesetzt).

#### Phase 4: Risk-Areas aus `classify-paths.sh`

```bash
# Reuse der vorhandenen Pattern-Tabelle
source "$REPO/scripts/factory/classify-paths.sh"

RISKS=()
echo "$TOUCHED" | grep -qE "^$REPO/k3d/"           && RISKS+=("k8s-manifests")
echo "$TOUCHED" | grep -qE "migration|\.sql$"       && RISKS+=("db-migration")
echo "$TOUCHED" | grep -qE "keycloak|realm"         && RISKS+=("sso-oidc")
echo "$TOUCHED" | grep -qE "secret|credentials"     && RISKS+=("secrets-handling")
echo "$TOUCHED" | grep -qE "pipeline\.js|factory/"  && RISKS+=("factory-pipeline")
echo "$TOUCHED" | grep -qE "^$REPO/environments/"   && RISKS+=("env-config")
echo "$TOUCHED" | grep -qE "auth/"                  && RISKS+=("authentication")
```

#### Phase 5: Similar Tickets (fail-soft)

```bash
SIMILAR="[]"
if command -v npx &>/dev/null; then
  SIMILAR=$(cd "$REPO/website" && timeout 15 npx tsx scripts/find-similar-tickets.mjs \
    "$TITLE $DESCRIPTION" 5 2>/dev/null) || SIMILAR="[]"
  # Valides JSON?
  echo "$SIMILAR" | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" \
    2>/dev/null || SIMILAR="[]"
fi
```

#### Phase 6: JSON-Output

```bash
# jq für sicheres JSON-Encoding (Sonderzeichen in Pfaden)
jq -n \
  --argjson touched "$(printf '%s\n' $TOUCHED | jq -R . | jq -s .)" \
  --arg complexity "$COMPLEXITY" \
  --argjson risks "$(printf '%s\n' "${RISKS[@]}" | jq -R . | jq -s .)" \
  --argjson similar "$SIMILAR" \
  --argjson slots "$SLOTS" \
  '{complexity:$complexity, touched_files:$touched, risk_areas:$risks,
    similar_tickets:$similar, estimated_slots:$slots}'
```

### `pipeline.js` — Scout-Phase ersetzen

Aktueller LLM-Agent-Call (Zeilen 174–208) wird ersetzt durch:

```js
// ── ① Scout (deterministisch) ───────────────────────────────────────────────
phase('Scout')
phaseEvent('scout', 'entered', 'Codebase-Analyse gestartet')

// Liveness-Touch direkt (kein Agent nötig)
try {
  require('child_process').execFileSync(
    'bash', [`${REPO}/scripts/ticket.sh`, 'touch', '--id', String(A.ticket_id)],
    { stdio: 'ignore', timeout: 10000 }
  )
} catch { /* best-effort */ }

// Deterministischer Scout
const scoutJson = require('child_process').execFileSync(
  'bash',
  [`${REPO}/scripts/factory/scout.sh`,
   '--ticket-id',    String(A.ticket_id),
   '--title',        String(A.title),
   '--slug',         String(A.slug ?? ''),
   '--description',  String(A.description ?? ''),
   '--repo',         REPO],
  { encoding: 'utf8', timeout: 60000 }
)
const scout = JSON.parse(scoutJson)

// Schema-Validierung (rudimentär, analog zur Harness-Validierung)
if (!scout.complexity || !Array.isArray(scout.touched_files)) {
  throw new Error(`Scout output invalid: ${scoutJson.slice(0, 200)}`)
}
```

Der `scout:persist`-Agent (Zeilen 194–199) bleibt erhalten (ruft `ticket.sh set-touched-files` auf).
Alternativ kann er zu einem direkten `execFileSync`-Call werden — beides ist valide.

## Downstream: Was sich NICHT ändert

| Code | Verhalten |
|------|-----------|
| `featureComplexity = scout.complexity` (Zeile 212) | identisch |
| `featureTouchedFiles = scout.touched_files` (Zeile 213) | identisch |
| `isSimple = scout.complexity === 'simple'` (Zeile 223) | identisch |
| `conflict-check.sh` mit `scout.touched_files.join(' ')` | identisch |
| `resolvePartialServices(featureTouchedFiles)` | identisch |
| Deploy Gate-2 `paths_are_escalate_class(...)` | identisch |
| `provision({ risk: scout.risk_areas?.length ? 'high' : 'low' })` | identisch |

## Tests

### Neue BATS-Tests in `tests/local/FA-SF-63-scout-deterministic.bats`

- `scout.sh --help` gibt Usage aus (exit 0)
- Aufruf mit bekannten Ticket-Daten gibt valides JSON zurück
- `touched_files` ist Array (auch wenn leer: `[]`)
- `complexity` ist einer von `simple|medium|complex`
- `risk_areas` enthält "k8s-manifests" wenn k3d-Datei in touched_files
- `risk_areas` enthält "db-migration" wenn migration in touched_files
- Bei `--slug ""` (leer): kein Absturz, Fallback zu `medium`
- Pipeline: `node --check scripts/factory/pipeline.js` weiterhin OK
- FA-SF-20 (alle 13 Contract-Assertions): weiterhin grün

### Manuelle Smoke-Test

```bash
bash scripts/factory/scout.sh \
  --ticket-id T000001 \
  --title "add booking confirmation email" \
  --slug "add-booking-confirmation-email" \
  --description "Send email after booking is confirmed" \
  --repo /home/patrick/Bachelorprojekt
# Erwartung: touched_files enthält website/src/**/*email* oder *booking* Dateien
```

## Risiken

- **Falsch-Negativ bei ungewöhnlichen Feature-Titeln**: Keywords ohne Überlappung zu Dateinamen
  → Fallback auf `complexity=medium`, `touched_files=[]`. Conflict-Check fällt auf DB-Lookup zurück.
  Akzeptabel: schlechter als vor PR #1536 (wo DeepSeek auch 0 lieferte) kann es nicht werden.
- **`jq` nicht installiert**: `jq` ist auf dem WSL-Host verfügbar, auf CI-Runner prüfen.
  Fallback: reines Bash-JSON-Encoding (kein jq).
- **Symlink `node_modules`**: Der Worktree hat verlinkte node_modules — `npx tsx` sollte funktionieren.

## Metriken (erwartet)

| Metrik | Vorher (LLM) | Nachher (deterministisch) |
|--------|--------------|--------------------------|
| Latenz Scout-Phase | 3–5s | ~200ms |
| Kosten/Run | ~€0.006 | €0 |
| `touched_files` bei bekannten Keywords | 0 | ≥1 |
| Reproduzierbar | ❌ | ✅ |
