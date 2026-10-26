# Dangling Graph Full — Alle Graph-Auswertungsarten, Scope als letzte Stufe

Folge-Flow zu `dangling-interfaces.md` (v1: Inventar, exakter Abgleich,
Beinahe-Treffer, HTML-Graph — wird nicht angerührt). Vier zusammenhängende
Node-Skripte decken die restlichen Auswertungsarten ab; die Scope-Ausweitung
über HTTP hinaus läuft bewusst als letzte Stufe:

| Stufe | Skript | Aufgabe | Ohne Netzwerk |
|-------|--------|---------|---------------|
| p1 | `scripts/dangling-handles-audit.mjs` | HANDLES-Lücken-Audit: Dateirouten gegen Route-Knoten | ja |
| p2 | `scripts/dangling-callers.mjs` | Aufrufer-Auflösung mit Belegpfad | ja |
| p3 | `scripts/dangling-rename-runtime.mjs` | Rename-Historie plus Laufzeit-Beleg | ja (git lokal) |
| p4 | `scripts/dangling-scope-env.mjs` | Scope-Ausweitung: EnvVars, MCP-Tools, Taskfile-Tasks | ja |

Alle Stufen sind deterministisch (Seed-basiert) und brauchen keine
Abhängigkeiten außer Node ≥ 20. Kein Modul importiert ein anderes —
die Stufen kommunizieren ausschließlich über JSON-Dateien.

## Wann einsetzen

- Vor einem Indexer-Umbau: erst das HANDLES-Audit (p1) lesen — die
  `unlinked[]`-Einträge mit `sourceFile` sind der Entscheidungsbeleg.
- Nach einem Rename/Refactor: p3 bestätigt Beinahe-Treffer aus v1 per
  `git log --follow` mit Commit-Referenz, bevor etwas per Embedding
  geraten wird; 404-/Proxy-Logs belegen echte Laufzeit-Treffer.
- Bei „toten“ Routen jenseits von HTTP: p4 findet undefinierte EnvVars,
  MCP-Tool- und Task-Referenzen (violetter Cluster).

## Stufe p1 — `scripts/dangling-handles-audit.mjs`

```bash
node scripts/dangling-handles-audit.mjs \
  --providers components/website/src/pages/api \
  --routes /tmp/route-nodes.json \
  --out /tmp/handles-audit.json
```

Optionen:

| Flag | Pflicht | Bedeutung |
|------|---------|-----------|
| `--providers <dir>` | nein | Verzeichnis der Dateirouten; Default `components/website/src/pages/api` relativ zum Repo-Root |
| `--routes <datei>` | **ja** | JSON mit Route-Knoten (Array oder `{nodes\|routes\|routeNodes}`) |
| `--out <datei>` | nein | Ziel-JSON; Default `handles-audit.json` |

Exit-Codes: `0` Erfolg, `2` fehlende/ungültige Eingabe. Die JSON-Ausgabe geht
auf stdout **und** in `--out`; die drei Zähler (`linked / unlinked / total`)
nur auf stderr. Jeder `unlinked`-Eintrag trägt `sourceFile` plus die
vermutete Route. Routen-Abbildung wie v1 (`values.ts` → `/api/flux/values`,
`index.ts` → Verzeichnisroute, `[id].ts` → `:id`, `[...rest].ts` → `:rest*`).

## Stufe p2 — `scripts/dangling-callers.mjs`

```bash
node scripts/dangling-callers.mjs \
  --calls /tmp/http-calls.json \
  --providers /tmp/providers.json \
  --out /tmp/caller-paths.json
```

Optionen:

| Flag | Pflicht | Bedeutung |
|------|---------|-----------|
| `--calls <datei>` | **ja** | JSON mit Aufrufen (Array oder `{calls\|targets\|httpCalls}`; Einträge als String oder `{caller, target}`) |
| `--providers <datei>` | **ja** | JSON mit Anbieter-Routen (Array oder `{providers\|routes}`) |
| `--out <datei>` | nein | Ziel-JSON; Default `caller-paths.json` |

Exit-Codes: `0` Erfolg, `2` fehlende/ungültige Eingabe. Ausgabe
`{ resolved, broken[] }`; jeder `broken[]`-Eintrag trägt `steps[]` mit
mindestens einem Eintrag (`{ from, to, rule }`: `strip-query`,
`strip-origin`, `strip-service-dns`, `trailing-slash`, `param-form` …) und
ein `gap`-Feld mit dem ersten nicht auflösbaren Pfadsegment. `broken[]`
speist die roten fetten Knoten des Graphen.

## Stufe p3 — `scripts/dangling-rename-runtime.mjs`

```bash
node scripts/dangling-rename-runtime.mjs \
  --pairs /tmp/near-miss.json \
  --logs /tmp/proxy-404.log \
  --out /tmp/rename-runtime.json
```

Optionen:

| Flag | Pflicht | Bedeutung |
|------|---------|-----------|
| `--pairs <datei>` | **ja** | Beinahe-Treffer-Paare aus v1 (Array oder `{pairs\|nearMiss\|edges}`; Einträge `{from, to, sourceFile?}`) |
| `--logs <datei>` | **ja** | 404-/Proxy-Log (eine Anfrage pro Zeile) |
| `--out <datei>` | nein | Ziel-JSON; Default `rename-runtime.json` |

Exit-Codes: `0` Erfolg, `2` fehlende/ungültige Eingabe. Zähler auf stderr:
`confirmed / rejected / withRuntime`. `findRenames` bestätigt Paare per
`git log --follow --name-only` je Anbieter-Datei mit Commit-Referenz;
verworfene Paare fallen auf den Embedding-Pfad aus v1 zurück — kein eigener
Embedding-Code. `attachRuntime` mappt 404- und 502/503/504-Zeilen auf Knoten
(`{ node, hits, lastSeen }`); Treffer bekommen den roten Ring, bestätigte
Paare rendern blau gepunktet mit Commit-Referenz.

## Stufe p4 — `scripts/dangling-scope-env.mjs`

```bash
node scripts/dangling-scope-env.mjs \
  --root components/website/src \
  --env /tmp/defined-env.json \
  --out /tmp/scope-env.json
```

Optionen:

| Flag | Pflicht | Bedeutung |
|------|---------|-----------|
| `--root <dir>` | nein | Quellwurzel für das Inventar; Default `components/website/src` relativ zum Repo-Root |
| `--env <datei>` | **ja** | Definierte Vars (Array, `{vars\|defined}` oder Objekt mit Var-Namen als Keys) |
| `--out <datei>` | nein | Ziel-JSON; Default `scope-env.json` |

Exit-Codes: `0` Erfolg, `2` fehlende/ungültige Eingabe. `collectEnvRefs`
inventarisiert `process.env.*`- und `import.meta.env.*`-Verwendungen;
danach läuft dieselbe Inventar-plus-Match-Schleife für MCP-Tools
(`collectMcpRefs`) und Taskfile-Tasks (`collectTaskRefs`). Scope-Funde
rendern violett geclustert.

## Deutung der sechs Klassen

| Klasse | Herkunft | Rendering |
|--------|----------|-----------|
| Anbieter-Waise (exakt) | v1 | grau |
| Verbraucher-Waise (exakt) | v1 | rot fett (aus `broken[]` von p2) |
| Beinahe-Treffer (Embedding) | v1 | gelb |
| Bestätigter Rename | p3 `confirmed[]` | blau gepunktet + Commit-Referenz |
| Laufzeit-Treffer | p3 `runtime[]` | roter Ring (`hits`, `lastSeen`) |
| Scope-Fund (Env/MCP/Task) | p4 `nearMiss[]`/`orphan[]` | violetter Cluster |

## τ-Rekalibrierung

p4 kalibriert τ wie v1 per Youden-J — kalibriert, nicht geschätzt: Positive
sind deterministische 1-Edit-Varianten (`variantOf`) der definierten Namen,
Negative deterministische Zufallspaare (`sampleNegatives`, Seed
`20260101`). Rekalibrieren heißt: `--env`-Datei mit den aktuell definierten
Vars füttern und `counts.tau` aus der stderr-Zusammenfassung ablesen; die
volle Kalibrierung (`tpr`, `fpr`, `separation`, `method: youden-j`) steht im
`env.calibration`-Objekt der Ausgabe. Fällt `separation` unter `0.5`, ist das
Namensinventar zu klein oder zu ähnlich — dann erst das Inventar schärfen,
nicht τ von Hand setzen.

## Tests

```bash
npx vitest run scripts/dangling-graph-full.test.ts
```

Acht Fälle: HANDLES-Audit mit fehlender Kante, Belegpfad mit `steps[]` und
`gap`, Rename-Bestätigung mit Commit-Referenz, Scope-Env-Treffer plus eine
echte Waise ohne Kante.
