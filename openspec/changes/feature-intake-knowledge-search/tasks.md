---
title: "Feature Intake: Semantischer Duplikatcheck + dynamischer Feature-Pool"
ticket_id: T000978
domains: [ai/factory]
status: completed
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Feature Intake Knowledge-Search — Implementation Plan

Erweitert den Feature Intake Skill um zwei Verbesserungen:
1. Semantischer Duplikatcheck via pgvector (`<=>`) gegen die `specs_plans`-Collection
2. Dynamischer Feature-Pool aus indizierten Proposal-Dokumenten in Modus D

---

## File Structure

```
scripts/knowledge/
  search-similar.mjs          ← NEU: CLI-Searcher mit Voyage-Embedding + pgvector
Taskfile.yml                  ← knowledge:search Task einfügen (nach knowledge:reindex, ~Zeile 4558)
.claude/skills/feature-intake/
  SKILL.md                    ← Modus D Schritt 1 + Block 1 + Schritt 4, Modus B Übergabe
```

---

## Aufgabe 1: `scripts/knowledge/search-similar.mjs` erstellen

**Ziel:** Neues CLI-Script, das eine Freitext-Query gegen die `specs_plans`-Collection per
pgvector-Cosine-Similarity absucht und Treffer als JSON auf stdout ausgibt.
Nutzt denselben `lib-knowledge-pg.mjs`-Stack wie `ingest-markdown.mjs`.

**Dateien:**
- `scripts/knowledge/search-similar.mjs` — neu erstellen

**Implementierung:**

Das Script folgt dem Muster von `ingest-markdown.mjs`: ES-Module, `makePool()` +
`callVoyage()` aus `lib-knowledge-pg.mjs`, logs auf stderr, JSON-Output auf stdout.

```javascript
#!/usr/bin/env node
/**
 * search-similar.mjs — Semantic similarity search against a knowledge collection.
 *
 * Config via environment variables (set by `task knowledge:search`):
 *   QUERY      — search query text (required)
 *   SOURCE     — collection source filter (default: "specs_plans")
 *   LIMIT      — max results (default: 5)
 *   THRESHOLD  — minimum score 0..1 (default: 0.65)
 *   VOYAGE_API_KEY — Voyage AI API key (absent → graceful error JSON, exit 0)
 *   PGURL      — postgres connection string (set by task via port-forward)
 *
 * CLI args (override env, for interactive use):
 *   --query <text>  --source <source>  --limit <n>  --threshold <f>
 *
 * Output (stdout): JSON  { results: [{title, score, snippet, source_uri}] }
 *             OR   JSON  { error: "<message>", results: [] }
 * Logs  (stderr):  diagnostic messages only
 */

import { makePool, callVoyage } from './lib-knowledge-pg.mjs';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--') && i + 1 < args.length) {
      out[args[i].slice(2)] = args[++i];
    }
  }
  return out;
}

async function main() {
  const cli       = parseArgs();
  const query     = cli.query     ?? process.env.QUERY;
  const source    = cli.source    ?? process.env.SOURCE    ?? 'specs_plans';
  const limit     = parseInt(cli.limit     ?? process.env.LIMIT     ?? '5',    10);
  const threshold = parseFloat(cli.threshold ?? process.env.THRESHOLD ?? '0.65');

  if (!query) {
    process.stderr.write('ERROR: QUERY is required (env QUERY or --query <text>)\n');
    process.exit(1);
  }

  if (!process.env.VOYAGE_API_KEY) {
    process.stdout.write(JSON.stringify({ error: 'VOYAGE_API_KEY not set', results: [] }) + '\n');
    process.exit(0);
  }

  const pool = makePool();
  try {
    process.stderr.write(`Embedding query: "${query}"\n`);
    const { embeddings } = await callVoyage([query], 'query');
    const vecLiteral = `[${embeddings[0].join(',')}]`;

    const sql = `
      SELECT d.title,
             d.source_uri,
             1 - (kc.embedding <=> $1::vector) AS score,
             kc.text                            AS snippet
      FROM   knowledge.chunks      kc
      JOIN   knowledge.documents   d  ON d.id = kc.document_id
      JOIN   knowledge.collections c  ON c.id = kc.collection_id
      WHERE  c.source = $2
        AND  1 - (kc.embedding <=> $1::vector) >= $3
      ORDER BY kc.embedding <=> $1::vector
      LIMIT  $4
    `;

    process.stderr.write(`Searching source="${source}" threshold=${threshold} limit=${limit}\n`);
    const { rows } = await pool.query(sql, [vecLiteral, source, threshold, limit]);

    const results = rows.map(r => ({
      title:      r.title,
      score:      Math.round(parseFloat(r.score) * 10000) / 10000,
      snippet:    r.snippet.slice(0, 300),
      source_uri: r.source_uri,
    }));

    process.stderr.write(`Found ${results.length} result(s) above threshold.\n`);
    process.stdout.write(JSON.stringify({ results }) + '\n');
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  process.stderr.write(`ERROR: ${err.message}\n`);
  process.stdout.write(JSON.stringify({ error: err.message, results: [] }) + '\n');
  process.exit(0);
});
```

**Fehlerbehandlung:** `callVoyage()` wirft bei HTTP-Fehlern — der äußere `catch` fängt das
und gibt `{error: "<message>", results: []}` zurück (exit 0), damit SKILL.md-Flows
fortfahren können statt abzubrechen.

**Akzeptanzkriterium:**
- `node --check scripts/knowledge/search-similar.mjs` gibt keinen Syntaxfehler
- `VOYAGE_API_KEY="" QUERY="test" PGURL="postgres://x:y@localhost:5432/website" node scripts/knowledge/search-similar.mjs` gibt `{"error":"VOYAGE_API_KEY not set","results":[]}` aus (exit 0)
- To verify it fails without QUERY: `PGURL="..." node scripts/knowledge/search-similar.mjs` → exit 1

---

## Aufgabe 2: `knowledge:search`-Task in `Taskfile.yml` ergänzen

**Ziel:** Neuer Taskfile-Task nach dem Muster von `knowledge:reindex` (Zeile 4538).
Liest Secrets aus dem Cluster, baut Port-Forward auf und ruft `search-similar.mjs` auf.

**Dateien:**
- `Taskfile.yml` — Block nach `knowledge:reindex` (nach Zeile 4558, vor `knowledge:crawl`)

**Implementierung:**

Direkt nach dem Ende des `knowledge:reindex`-Tasks (Zeile 4558) einfügen:

```yaml
  knowledge:search:
    desc: "Semantic similarity search in knowledge collections (QUERY=<text>, SOURCE=specs_plans, LIMIT=5, THRESHOLD=0.65, ENV=dev|mentolder|korczewski)"
    vars:
      ENV: '{{.ENV | default "mentolder"}}'
      QUERY: '{{.QUERY}}'
      SOURCE: '{{.SOURCE | default "specs_plans"}}'
      LIMIT: '{{.LIMIT | default "5"}}'
      THRESHOLD: '{{.THRESHOLD | default "0.65"}}'
    cmds:
      - |
        if [ -z "{{.QUERY}}" ]; then
          echo "Usage: task knowledge:search QUERY=\"<text>\" [SOURCE=specs_plans] [LIMIT=5] [THRESHOLD=0.65] [ENV=mentolder]" >&2
          exit 1
        fi

        source scripts/env-resolve.sh "{{.ENV}}"
        ctx_flag=""
        [ "{{.ENV}}" != "dev" ] && ctx_flag="--context $ENV_CONTEXT"
        NS="${WORKSPACE_NAMESPACE:-workspace}"

        WEBSITE_DB_PASSWORD=$(kubectl $ctx_flag get secret workspace-secrets -n "$NS" \
          -o jsonpath="{.data.WEBSITE_DB_PASSWORD}" 2>/dev/null | base64 -d)
        if [ -z "$WEBSITE_DB_PASSWORD" ]; then
          echo "ERROR: WEBSITE_DB_PASSWORD not found in workspace-secrets" >&2; exit 1
        fi
        VOYAGE_API_KEY=$(kubectl $ctx_flag get secret workspace-secrets -n "$NS" \
          -o jsonpath="{.data.VOYAGE_API_KEY}" 2>/dev/null | base64 -d)
        # VOYAGE_API_KEY intentionally allowed empty — script handles graceful fallback

        kubectl $ctx_flag -n "$NS" port-forward svc/shared-db 5432:5432 \
          >/tmp/knowledge-search-pf.log 2>&1 &
        PF=$!
        trap 'kill $PF 2>/dev/null' EXIT
        sleep 2

        PGURL="postgres://website:${WEBSITE_DB_PASSWORD}@localhost:5432/website" \
        VOYAGE_API_KEY="${VOYAGE_API_KEY}" \
        QUERY="{{.QUERY}}" SOURCE="{{.SOURCE}}" LIMIT="{{.LIMIT}}" THRESHOLD="{{.THRESHOLD}}" \
          node scripts/knowledge/search-similar.mjs
```

**Akzeptanzkriterium:**
- `task knowledge:search ENV=dev 2>&1 | grep -q "Usage:"` exitiert 0 (Hinweis erscheint wenn QUERY fehlt)

---

## Aufgabe 3: SKILL.md — Modus D Schritt 1 um `SPEC_POOL`-Query erweitern

**Ziel:** Nach dem bestehenden `$EXISTING`-Load in Modus D Schritt 1 eine zweite SQL-Abfrage
ergänzen, die Proposal-Dokumente aus der `specs_plans`-Collection lädt. Kein Embedding nötig.

**Dateien:**
- `.claude/skills/feature-intake/SKILL.md`

**Implementierung:**

Lokalisierung: Modus D Schritt 1 endet mit dieser Zeile:
```
Halte diese Liste im Arbeitsgedächtnis — sie dient später beim Ticket-Anlegen zum Duplikatcheck.
```

Direkt danach (als separaten Absatz) einfügen:

```markdown
Lade außerdem die indizierten Proposal-Dokumente als dynamischen Feature-Pool:

```bash
SPEC_POOL=$(kubectl exec -n workspace deploy/shared-db -- psql -U postgres -d website -t -A -F '|' -c \
  "SELECT d.title, left(kc.text, 300), d.source_uri
   FROM knowledge.documents d
   JOIN knowledge.collections c  ON c.id = d.collection_id
   JOIN knowledge.chunks kc      ON kc.document_id = d.id AND kc.position = 0
   WHERE c.source = 'specs_plans'
     AND d.source_uri LIKE 'file:openspec/changes/%/proposal.md'
   ORDER BY d.created_at DESC
   LIMIT 30;" 2>/dev/null)
```

Halte `$SPEC_POOL` im Arbeitsgedächtnis — er wird in Schritt 2 Block 1 als dritte Karten-Gruppe
„Aus eigenen Specs" verwendet. Wenn `$SPEC_POOL` leer ist (keine Proposals indiziert), entfällt
diese Gruppe; die 60 hardcodierten Einträge bleiben als Fallback.
```

**Akzeptanzkriterium:** Schritt 1 von Modus D enthält nach der Änderung zwei separate
Bash-Blöcke: `$EXISTING` (Titel-Duplikatschutz) und `$SPEC_POOL` (dynamischer Pool).

---

## Aufgabe 4: SKILL.md — Modus D Block 1 um Gruppe „Aus eigenen Specs" erweitern

**Ziel:** Die HTML-Form-Spezifikation in Block 1 (Schritt 2) um eine dritte Karten-Gruppe
aus `$SPEC_POOL` erweitern. Die 60 hardcodierten Einträge bleiben unberührt.

**Dateien:**
- `.claude/skills/feature-intake/SKILL.md`

**Implementierung:**

Lokalisierung: Block 1 endet nach der Feature-Pool-Tabelle (letzte Zeile `| AI | ...`),
direkt vor `**Block 2 — Schmerzen**`. Dort einfügen:

```markdown
Wenn `$SPEC_POOL` nicht leer ist, rendere in Block 1 zusätzlich eine dritte Karten-Gruppe
unterhalb der hardcodierten Pool-Tabelle:

**Karten-Gruppe „Aus eigenen Specs" (dynamisch, nur wenn `$SPEC_POOL` gefüllt):**

- Überschrift: „Aus eigenen Specs" mit `(aus Knowledge-Base)` Badge
- Eine Karte pro psql-Zeile aus `$SPEC_POOL` (`title | snippet_300 | source_uri`)
- Karten-Text: `title` als Haupt-Label; erste 100 Zeichen des Snippets grau/klein darunter
- Bereichs-Tag: „Spec" (neutral)
- Gleiche Klick-/Auswahl-Logik wie hardcodierte Einträge
- Würfel-Button mischt NUR in hardcodierten Einträgen; Spec-Karten bleiben vollständig sichtbar
- `buildMarkdown()` gibt Spec-Karten mit Präfix `[Spec]` aus: `- [Spec] <title>`
- Wenn `$SPEC_POOL` leer → kein leerer Platzhalter, Gruppe wird nicht gerendert
```

**Akzeptanzkriterium:** HTML-Form zeigt dritte Gruppe wenn `$SPEC_POOL` Daten enthält;
bei leerem Pool erscheint nur die hardcodierte Auswahl (graceful fallback, kein leerer Block).

---

## Aufgabe 5: SKILL.md — Modus D Schritt 4, semantischer Duplikatcheck vor Ticket-Erstellung

**Ziel:** Pro Feature-Nennung in Schritt 4 (Tickets anlegen) vor `ticket.sh create` den
semantischen Check via `task knowledge:search` ausführen.
Score ≥ 0.80 → Block; 0.65–0.80 → Advisory; unter 0.65 oder Fehler → fortfahren.

**Dateien:**
- `.claude/skills/feature-intake/SKILL.md`

**Implementierung:**

Lokalisierung: Schritt 4 enthält einen Kommentar `# 1. Duplikatcheck gegen $EXISTING`.
Den bestehenden Code-Block (von `TICKET_RESULT=$(bash scripts/ticket.sh create` bis zum Ende
des `add-comment`-Blocks) durch folgenden ersetzen:

```bash
# 1. Titelbasierter Duplikatcheck gegen $EXISTING (bestehend)

# 2. Semantischer Duplikatcheck via pgvector (neu)
SEARCH_RESULT=$(task knowledge:search ENV=mentolder \
  QUERY="<destillierter Titel>" \
  SOURCE=specs_plans \
  LIMIT=3 \
  THRESHOLD=0.65 2>/dev/null || echo '{"results":[]}')

TOP_SCORE=$(echo "$SEARCH_RESULT" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); r=d.get('results',[]); print(r[0]['score'] if r else 0)" 2>/dev/null || echo 0)
TOP_TITLE=$(echo "$SEARCH_RESULT" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); r=d.get('results',[]); print(r[0]['title'] if r else '')" 2>/dev/null || echo "")
TOP_URI=$(echo "$SEARCH_RESULT" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); r=d.get('results',[]); print(r[0]['source_uri'] if r else '')" 2>/dev/null || echo "")
HAS_ERROR=$(echo "$SEARCH_RESULT" | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print('yes' if d.get('error') else 'no')" 2>/dev/null || echo "yes")

if [ "$HAS_ERROR" = "yes" ]; then
  echo "⚠️  Semantischer Check übersprungen (VOYAGE_API_KEY fehlt oder Fehler) — Ticket wird trotzdem angelegt."
elif (( $(echo "$TOP_SCORE >= 0.80" | bc -l 2>/dev/null || echo 0) )); then
  echo "🛑 Duplikat wahrscheinlich — Spec \"${TOP_TITLE}\" $(python3 -c "print(f'{float('$TOP_SCORE')*100:.0f}')") % ähnlich."
  echo "   Quelle: ${TOP_URI}"
  echo "   → Ticket NICHT angelegt. Bestehende Spec prüfen oder verknüpfen."
  # KEIN ticket.sh create — zur nächsten Feature-Nennung
elif (( $(echo "$TOP_SCORE >= 0.65" | bc -l 2>/dev/null || echo 0) )); then
  echo "⚠️  Ähnliche Spec: \"${TOP_TITLE}\" (Score: ${TOP_SCORE}) — Ticket trotzdem anlegen + Hinweis im Kommentar."
fi

# 3. Ticket anlegen (nur wenn kein Score >= 0.80 blockiert hat)
TICKET_RESULT=$(bash scripts/ticket.sh create \
  --type feature \
  --brand mentolder \
  --title "<destillierter Titel>" \
  --priority <hoch|mittel|niedrig — abgeleitet aus Ranking+Intensität> \
  --description "<Originalzitat aus dem Interview>" \
  --status planning)

TICKET_EXT_ID=$(echo "$TICKET_RESULT" | cut -d'|' -f1)

bash scripts/ticket.sh plan-meta set --id "$TICKET_EXT_ID" \
  --value-prop "<kern-nutzen für den User>" \
  --effort <klein|mittel|gross> \
  --areas <normalisierter-areas-key>

SIMILARITY_NOTE=""
if (( $(echo "$TOP_SCORE >= 0.65" | bc -l 2>/dev/null || echo 0) )) && \
   (( $(echo "$TOP_SCORE < 0.80"  | bc -l 2>/dev/null || echo 0) )); then
  SIMILARITY_NOTE="
**Ähnliche Spec:** \"${TOP_TITLE}\" (Score: ${TOP_SCORE})
**Spec-Quelle:** ${TOP_URI}"
fi

bash scripts/ticket.sh add-comment \
  --id "$TICKET_EXT_ID" \
  --author "feature-intake/gekkomode" \
  --body "## GekkoMode-Rücklauf $(date +%F)

**Originalzitat:** \"<exaktes Zitat>\"
**Kontext:** Primärgerät: <gerät>${SIMILARITY_NOTE}"
```

**Akzeptanzkriterium:**
- Score ≥ 0.80: kein `ticket.sh create`-Aufruf, Ausgabe `🛑 Duplikat wahrscheinlich…`
- Score 0.65–0.80: Ticket wird angelegt, Kommentar enthält `Ähnliche Spec`-Zeile
- Fehlender Key: `⚠️ Semantischer Check übersprungen`, Ticket wird trotzdem angelegt

---

## Aufgabe 6: SKILL.md — Modus B Übergabe, semantischer Check vor Ticket-Erstellung

**Ziel:** Identische Duplikatcheck-Logik wie Aufgabe 5, diesmal in Modus B
(Abschnitt „Übergabe nach Rücklauf", Schritt 2 — Tickets anlegen).

**Dateien:**
- `.claude/skills/feature-intake/SKILL.md`

**Implementierung:**

Lokalisierung: Modus B endet mit dem Code-Block der mit
`# Pro Feature aus dem Rücklauf:` + `TICKET_RESULT=$(bash scripts/ticket.sh create` beginnt.

Vor `TICKET_RESULT=$(bash scripts/ticket.sh create` denselben Semantic-Check-Block wie in
Aufgabe 5 einfügen (mit Platzhalter `<titel>` statt `<destillierter Titel>`).
Die `ticket.sh create`-Zeile selbst und alle plan-meta/add-comment-Aufrufe bleiben erhalten.

```bash
# Semantischer Duplikatcheck (wie Modus D — analog Aufgabe 5)
SEARCH_RESULT=$(task knowledge:search ENV=mentolder \
  QUERY="<titel>" SOURCE=specs_plans LIMIT=3 THRESHOLD=0.65 2>/dev/null \
  || echo '{"results":[]}')
# [Score-Extraktion + Branching identisch wie Aufgabe 5]
# Score >= 0.80 → nächstes Feature, kein ticket.sh create
# Score 0.65–0.80 → Advisory + Ticket anlegen
# Fehler/fehlender Key → Advisory + Ticket anlegen
```

**Akzeptanzkriterium:** Gleiches Verhalten wie Aufgabe 5 für Modus-B-Rückläufe.

---

## Aufgabe 7: Verifikation

**Dateien:** keine neuen

**Implementierung:**

```bash
# 1. Syntaxcheck neues Script
node --check scripts/knowledge/search-similar.mjs

# 2. Graceful-Fallback verifizieren (erwarted: VOYAGE_API_KEY not set → exit 0)
VOYAGE_API_KEY="" QUERY="test" PGURL="postgres://x:y@localhost:5432/website" \
  node scripts/knowledge/search-similar.mjs
# Expected: {"error":"VOYAGE_API_KEY not set","results":[]}   exit 0
# To verify it fails when QUERY is missing: node scripts/knowledge/search-similar.mjs → exit 1

# 3. Offline-Tests
task test:changed

# 4. Freshness
task freshness:regenerate
task freshness:check

# 5. Manueller Smoke-Test (erwartet: JSON mit results-Array, exit 0)
task knowledge:search ENV=mentolder QUERY="Chat Reaktionen" SOURCE=specs_plans
```

**Akzeptanzkriterium:**
- `node --check` grün
- `task test:changed` grün
- `task freshness:check` grün
- Graceful-Fallback gibt `{"error":"VOYAGE_API_KEY not set","results":[]}` zurück (exit 0)

---

## Implementierungsreihenfolge

1. Aufgabe 1 (Script erstellen)
2. Aufgabe 2 (Taskfile-Task) — nach Aufgabe 1
3. Aufgaben 3+4 (SKILL.md Modus D Pool) — parallel ausführbar
4. Aufgaben 5+6 (SKILL.md Duplikatcheck) — nach Aufgabe 2
5. Aufgabe 7 (Verifikation) — abschließend
