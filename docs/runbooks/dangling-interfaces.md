# Dangling Interfaces — Routen-Inventar, exakter Abgleich, Beinahe-Treffer

Zwei zusammenhängende Node-Skripte finden API-Endpunkte ohne Aufrufer und
HTTP-Aufrufe ohne Endpunkt:

| Stufe | Skript | Aufgabe | Ohne Netzwerk |
|-------|--------|---------|---------------|
| 1 | `scripts/dangling-interfaces.mjs` | Astro-Dateirouten inventarisieren, `HTTP_CALLS`-Ziele normalisieren, exakt joinen | ja |
| 2 | `scripts/dangling-interfaces-report.mjs` | τ kalibrieren, Beinahe-Treffer per Embedding, HTML-Kraftgraph | ja |

Beide Stufen sind deterministisch (Seed-basiert) und brauchen keine
Abhängigkeiten außer Node ≥ 20. Stufe 2 liest ausschließlich das JSON aus
Stufe 1 — kein Import zwischen den Modulen.

## Wann einsetzen

- Vor dem Löschen „toter“ API-Routen: erst Anbieter-Waisen prüfen, dann
  Beinahe-Treffer (Tippfehler statt echter Waise), erst zuletzt löschen.
- Nach einem Rename/Refactor: Verbraucher-Waisen zeigen Aufrufe, die ins Leere
  laufen und zur Laufzeit 404 liefern.
- Bei unklarer Service-DNS in Aufrufen (`llm-gateway:8080/api/...`).

## Stufe 1 — `scripts/dangling-interfaces.mjs`

```bash
node scripts/dangling-interfaces.mjs \
  --providers components/website/src/pages/api \
  --calls /tmp/calls.json \
  --services /tmp/k8s-services.json \
  --out /tmp/dangling-exact.json
```

Optionen:

| Flag | Pflicht | Bedeutung |
|------|---------|-----------|
| `--providers <dir>` | nein | Verzeichnis der Dateirouten; Default `components/website/src/pages/api` relativ zum Repo-Root |
| `--calls <datei>` | **ja** | JSON mit `HTTP_CALLS`-Zielen |
| `--services <datei>` | nein | Service-Namen für DNS-Stripping; fehlt die Datei, nur Warnung, Lauf geht weiter |
| `--out <datei>` | nein | Ziel-JSON; Default `dangling-exact.json` |

Exit-Codes: `0` Erfolg, `2` fehlende/ungültige Eingabe (z. B. `--calls` fehlt,
Datei nicht lesbar, keine Ziele, keine Anbieter-Routen). Die JSON-Ausgabe geht
auf stdout **und** in `--out`; Zusammenfassung und Warnungen nur auf stderr.

### Routen-Abbildung

Dateien unter `--providers` werden sortiert und wie folgt auf Routen gelegt:

| Datei | Route |
|-------|-------|
| `flux/values.ts` | `/api/flux/values` |
| `admin/index.ts` | `/api/admin` |
| `projects/[id].ts` | `/api/projects/:id` |
| `files/[...rest].ts` | `/api/files/:rest*` |
| `projekte/{id}/team.ts` | `/api/projekte/:id/team` |

Ignoriert werden `_`-Präfixe, `*.test.*`, `*.spec.*`, `*.d.ts`, `__tests__`,
`__mocks__` und `node_modules`. Im echten Repo bleiben so 317 Anbieter aus 362
Dateien übrig.

### Aufruf-Normalisierung

- Query und Fragment werden entfernt (`/api/x?limit=10` → `/api/x`).
- Trailing-Slash wird entfernt, doppelte Slashes kollabieren.
- Absolute URLs werden auf den Pfad reduziert.
- Service-DNS wird nur gestrippt, wenn ein Port vorhanden ist, der Host einen
  Punkt enthält (FQDN) oder der Host in `--services` steht. Ein einwortiger Host
  ohne Port bleibt stehen, damit relative Ziele wie `api/flux/values` nicht als
  Host fehlinterpretiert werden.
- `{id}` und `[id]` werden zu `:id` — damit matchen OpenAPI-artige Ziele.

### Akzeptierte `--calls`-Formate

```jsonc
// 1. Array von Strings
["/api/admin/users", "llm-gateway:8080/api/flux/values"]

// 2. Array von Objekten mit Ziel-Feld (to | target | url | path | route)
[{ "to": "/api/admin/users" }, { "target": "/api/bge/retrieve" }]

// 3. Graph-Export
{ "edges": [
  { "kind": "HTTP_CALLS", "to": "/api/admin/users" },
  { "kind": "IMPORTS",    "to": "ignored" }
] }
```

Kanten mit anderem `kind` als `HTTP_CALLS` werden ignoriert. Ein leeres
Ziel-Array oder eine fehlende Datei bricht mit Exit `2` und klarer Meldung ab.

### `--services`-Formate

Alle Formen werden nur gelesen, nie gegen den Cluster aufgelöst:

```jsonc
["llm-gateway", "backend", "bge-mcp"]                       // String-Array
[{ "name": "llm-gateway" }]                                 // Objekt-Array
{ "items": [{ "metadata": { "name": "llm-gateway" } }] }    // kubectl get svc -o json
{ "llm-gateway": "http://…" }                               // Map: Keys zählen
```

### Ausgabe (Stufe 1)

```jsonc
{
  "providersDir": "components/website/src/pages/api",
  "counts": { "providers": 317, "targets": 5, "matched": 3,
              "orphanProviders": 314, "orphanConsumers": 2 },
  "matched":          [{ "route": "/api/x", "target": "/api/x", "sourceFile": "x.ts" }],
  "orphanProviders":  [{ "route": "/api/y", "sourceFile": "y.ts" }],
  "orphanConsumers":  [{ "target": "/api/z" }],
  "warnings": []
}
```

## Stufe 2 — `scripts/dangling-interfaces-report.mjs`

```bash
node scripts/dangling-interfaces-report.mjs \
  --exact /tmp/dangling-exact.json \
  --json /tmp/dangling-report.json \
  --html /tmp/dangling-graph.html \
  --seed 20260101
```

| Flag | Pflicht | Bedeutung |
|------|---------|-----------|
| `--exact <datei>` | **ja** | Ausgabe von `scripts/dangling-interfaces.mjs` |
| `--json <datei>` | nein | Report-JSON; Default `dangling-report.json` |
| `--html <datei>` | nein | Kraftgraph; Default `dangling-graph.html` |
| `--seed <zahl>` | nein | Seed der Negativ-Stichprobe; Default `20260101` |

Exit `2` bei fehlendem `--exact`, unlesbarer Datei oder ungültigem JSON.

### Die drei Klassen

1. **Exakt verbunden** (`matched`) — Aufrufziel und Anbieterroute stimmen nach
   Normalisierung überein. Das ist die Grundmenge, aus der τ gelernt wird.
2. **Anbieter-Waise** (`orphanProviders`) — Route existiert, kein Aufruf zeigt
   darauf. Kandidat für Abschaltung, aber vorher Beinahe-Treffer prüfen.
3. **Verbraucher-Waise** (`orphanConsumers`) — Aufruf zeigt auf keine Route.
   Akuter Laufzeitfehler (404), unabhängig von der Graph-Darstellung.

**Beinahe-Treffer** (`nearMiss`) sind zusätzliche Kanten zwischen Verbraucher-
und Anbieter-Waisen mit Score ≥ τ. Sie sind *keine* exakten Treffer, sondern
Hinweise auf Umbenennungen/Tippfehler.

### Strukturelle Definition eines Beinahe-Treffers

Ein Beinahe-Treffer ist eine Route im **selben Elternpfad** mit abweichendem
Endsegment. Fremde Elternpfade bleiben unter `0.2` und lösen keine Kante aus —
sonst würden bloß verwandte Ressourcen das Ergebnis fluten.

```text
gleiche Route                     → 1.0
anderer Elternpfad                → 0.2 · Kosinus(Elternvektoren)   (≤ 0.2)
gleicher Elternpfad               → 0.3 + 0.7 · Endsegment-Ähnlichkeit
  Endsegment-Ähnlichkeit          = 0.5 · Levenshtein + 0.5 · 3-Gramm-Kosinus
beide Enden Wildcard (`:id`)      → 0.35
```

Embedding: FNV-1a-gehashte Vektoren (512 Dimensionen) aus Segment-Tokens,
Zeichen-4-Grammen und benachbarten Segment-Bigrammen. Kein Modellserver, kein
Netzwerk.

### τ kalibrieren

`calibrateThreshold` lernt τ aus dem Lauf selbst:

- **Positiva:** alle exakt verbundenen Paare (`matched`).
- **Negativa:** deterministische Zufallspaare aus dem **gesamten**
  Routen-Universum (Treffertexte + beide Waisenklassen), Anzahl
  `min(400, max(24, unique · 4))`, erzeugt mit `mulberry32(seed)`.
- **Auswahl:** (1) niedrigstes τ mit TPR ≥ 0.98 und FPR = 0; (2) sonst
  niedrigstes τ mit TPR ≥ 0.98 und FPR ≤ 0.02; (3) sonst beste Trennung
  TPR − FPR. τ ist der Mittelpunkt zwischen beobachteten Score-Grenzen, kein
  Literal im Code.

Der Report protokolliert `method`, `tpr`, `fpr`, `separation` und die
Negativ-Perzentile `p50/p95/max`. Beispiel aus dem Referenzlauf: τ = **0.7477**
(`lowest-tau-tpr98-fpr0`), Positiva 1.0, Negativ-Maximum 0.4954, genau ein
Beinahe-Treffer `/api/bge/retrive` → `/api/bge/retrieve` (0.8401).

Zum Rekalibrieren genügt ein anderer `--seed`; τ ändert sich dann nur, wenn sich
die Score-Verteilung der Negativa verschiebt. Ein anderes Inventar (`--providers`)
oder andere Aufrufe (`--calls`) kalibrieren automatisch neu.

### HTML-Kraftgraph

Eigenständige Datei mit Inline-CSS/SVG — kein CDN, kein Build, kein JavaScript
nötig. Darstellung:

- **orange, geclustert:** Anbieter-Waisen, gruppiert nach Pfadpräfix. Die
  Auswahl erfolgt ausgewogen über die Cluster (nicht alphabetisch), sonst zeigt
  der Graph bei großen Inventaren nur `admin`.
- **rot, fett:** Verbraucher-Waisen (Laufzeitfehler).
- **rot gestrichelt, mit Score:** Beinahe-Treffer-Kanten.

Obergrenzen: 80 Anbieter und 60 Verbraucher; der Graph nennt die Kürzung. Für
die vollständige Liste gilt das JSON (`/tmp/dangling-report.json`).

## Tests

```bash
npx vitest run scripts/dangling-interfaces.test.ts
```

Die Suite prüft Routen-Abbildung (`values.ts` → `/api/flux/values`, `[id]` →
`:id`, Query-Strip), die drei `--calls`-Formate, Provider-Filterung, den exakten
Split, einen Beinahe-Treffer ≥ τ, eine echte Waise ohne Kante sowie beide CLIs
(fehlende Datei → Exit ≠ 0, Erfolgspfad schreibt `--out`).

## Grenzen

- Die Inventur liest Dateirouten, keine zur Laufzeit generierten Endpunkte.
- Aufrufziele kommen aus einem Export (Graph/Repo-Scan); das Skript scannt
  keinen Code nach `fetch`/`$fetch`.
- Service-DNS wird nur heuristisch gestrippt; bei ungewöhnlichen Hosts
  `--services` mitgeben.
- τ ist eine Trennschwelle auf dieser Stichprobe, kein universeller Wert.
