---
ticket_id: T002658
plan_ref: openspec/changes/context-retrieval-layer/tasks.md
status: planning
date: 2026-08-04
domains: [agents, knowledge, db]
---

# context-retrieval-layer — Design

Eine Retrieval-Schicht, die zu einem Aufgabentext einen budgetierten, gerankten und
herkunfts-markierten Kontextblock liefert — statt wie heute Volltext nach Regelfilter zu
dumpen. Sie ist S1 von vier Sub-Projekten und das Fundament der übrigen drei.

## Problem

Der Kontexttransfer zwischen Orchestrator und Subagenten läuft vollständig an der bereits
vorhandenen Embedding-Infrastruktur vorbei. Vier Skripte rendern Volltext nach Regelfilter:

| Skript | Zeilen | Filterlogik |
|---|---|---|
| `scripts/plan-context.sh` | 186 | Rolle → alle Proposals dieser Domain |
| `scripts/task-context.sh` | 231 | Ticket-Bezug |
| `scripts/toolset-context.sh` | 133 | Rolle → alle freigegebenen Werkzeuge |
| `scripts/openspec-context.sh` | 99 | Pfad-Präfix gegen `component-map.yaml` → ganze Spec |

Ein Präfix-Match liefert *alles Zugehörige* — eine vollständige Spec, weil eine einzige darin
erwähnte Datei berührt wurde. Der Umfang wächst mit dem Repo, nicht mit dem Bedarf der Aufgabe.

Gleichzeitig existiert die Gegenseite bereits ungenutzt: `bge-mcp` (`bge_embed`, `bge_rerank`,
`127.0.0.1:13005`), der pgvector-Store `knowledge.chunks` mit der Collection `specs_plans`, und
`scripts/openspec-embed.mjs` als Write-Pfad. Was fehlt, ist der Read-Pfad in die Agent-Prompts.

### Blocker: fehlender Vektor-Index

`migrations/20260717-drop-unused-indexes.sql:116` droppt `knowledge.chunks_embedding_hnsw` als
„unused index"; keine spätere Migration legt ihn neu an. `openspec/specs/openspec-pgvector.md:5`
behauptet weiterhin „pgvector, HNSW `vector_cosine_ops`". Spec und Datenbank widersprechen sich
seit dem 2026-07-17.

Der Drop war zum damaligen Zeitpunkt korrekt: ein Vektor-Index erscheint in
`pg_stat_user_indexes` zwangsläufig unbenutzt, solange niemand semantisch sucht, und der
Read-Pfad `/api/openspec/search` wurde kaum aufgerufen. Prospektiv ist er fatal — genau diesen
Pfad legt S1 auf jeden Agent-Dispatch. Ohne HNSW ist jede Query ein Sequential Scan mit
Distanzberechnung über die gesamte Tabelle, und S2 vervielfacht den Korpus.

Die Wiederherstellung gehört deshalb in S1: eine Schicht, deren Grundoperation unindiziert
läuft, ist nicht sinnvoll messbar.

## Nicht-Ziele

- **S2 — Korpus-Erweiterung**: Skills, `references/*.md`, Gotchas, `capabilities.yaml` in den
  Index aufnehmen. S1 wird gegen den heutigen `specs_plans`-Korpus gebaut und getestet.
- **S3 — Injektions-Umstellung**: die vier `*-context.sh` auf S1 umstellen. S1 hat vorerst
  keinen produktiven Aufrufer ausser den Tests.
- **S4 — flüchtige Korpora**: `intel.json` und Session-Handoffs. Deren Zugriffsmuster
  (write-once/read-once) macht Caching und Invalidierung grundlegend anders.

Diese Reihenfolge ist bewusst: Retrieval über einem unvollständigen Index ist schlechter als
kein Retrieval, weil es plausibel aussehende, aber lückenhafte Treffer liefert und der
konsumierende Agent den Unterschied nicht bemerkt. Ein Volltext-Dump ist wenigstens ehrlich
vollständig.

## Architektur

### Schnittstelle

`scripts/context-retrieve.mjs`, ein Aufruf pro Dispatch:

```
--task-prompt <text>|-   Aufgabentext als Query-Quelle; '-' liest stdin
--role <rolle>           harter Metadaten-Filter; Allowlist identisch zu toolset-context.sh
--budget <tokens>        Obergrenze des Retrieval-Anteils (Default 4000, konfigurierbar)
--corpora <a,b,c>        Korpus-Whitelist; Default: alle für die Rolle freigegebenen
--json                   Diagnose statt Block: Scores, Kandidatenzahl, Token-Bilanz, mode
```

stdout trägt den Markdown-Block, stderr die Diagnostik. Der Exit-Code ist auch im Fallback `0` —
die Ehrlichkeit über Unvollständigkeit steckt im Block, nicht im Exit-Code. Ein Exit ≠ 0 würde
bei GPU-Ausfall jeden Agent-Dispatch im Repo lahmlegen.

### Ablauf

1. **Pinned-Set laden** — Guardrail-Chunks aus `guardrails.yaml` und die rollenspezifischen
   `tier: caution|danger`-Einträge aus `capabilities.yaml`. Ohne Retrieval, ohne
   Budget-Anrechnung.
2. **Query embedden** — ein `bge_embed`-Aufruf über den Aufgabentext. Ergebnis gecacht per
   `sha256(query‖model)`.
3. **Kandidaten-Pull** — `embedding <=> $1` gegen `knowledge.chunks`, eingeschränkt über
   `metadata`-Prädikate (Rolle, Korpus, Status), `LIMIT 40`.
4. **Rerank** — ein `bge_rerank`-Batch über die Kandidaten, `top_k` nach Budget.
5. **Budget-Füllung** — greedy nach Rerank-Score bis zur Budget-Grenze.
6. **Rendern** mit Herkunfts-Header.

### Warum gebündelt und nicht pro Kanal

Ein Bi-Encoder wie `bge-m3` kodiert Query und Dokument unabhängig — die Dokumente einmal vorab,
die Query einmal pro Suche. Ein Cross-Encoder wie `bge-reranker-v2-m3` muss jedes
Query-Dokument-*Paar* gemeinsam durchs Modell schicken: 40 Kandidaten sind 40 Forward-Passes.
Die Kandidatenzahl vor dem Rerank ist damit die einzige Stellschraube, die GPU-seitig zählt.

Vier Kanäle mit je 20 Kandidaten kosten 80 Paare; ein gemeinsamer Pull über 40 Kandidaten kostet
40 — bei besserer Auswahl, weil das Ranking dann *zwischen* den Korpora vergleichen kann statt
jedem Kanal blind eine Quote zu garantieren.

### Warum der Aufgabentext die Query ist

Die Retrieval-Qualität hängt fast vollständig an der Query, denn der Reranker kann nur zwischen
Kandidaten unterscheiden, die der Vektor-Pull überhaupt geliefert hat. Ein Rollenname wie
`bachelorprojekt-infra` ist kein Bedeutungsträger — er zieht Chunks, die zufällig oft „infra"
sagen. Der Aufgabentext beschreibt ein Problem und zieht Chunks, die es lösen.

Rolle und Domäne gehören konsequent nicht in den Query-String, sondern als Prädikat in die
`WHERE`-Klausel: als Text verwässern sie das Signal, als Metadaten filtern sie exakt und ohne
GPU-Kosten.

## Herkunfts-Marker

Jeder Block beginnt mit einer maschinenlesbaren Zeile:

```
<!-- context-retrieve mode=retrieval corpora=specs_plans candidates=40 selected=7 budget=3820/4000 pinned=3 -->
```

`mode` ist `retrieval`, `rulefilter` oder `truncated`. Bei allem ausser `retrieval` steht
zusätzlich ein Klartext-Satz **im Block selbst**, den das empfangende Modell liest — ein
HTML-Kommentar allein wird zu leicht überlesen:

> Dieser Kontext ist unvollständig (mode=rulefilter): Retrieval war nicht verfügbar. Schliesse
> aus fehlenden Informationen nicht auf deren Nichtexistenz.

Das ist die direkte Umsetzung der Repo-Erfahrung aus T002322: `plan-context.sh` fällt bei
unbekannter Rolle still auf „alle Proposals" zurück, der Rollenfilter wirkt dann gar nicht, und
niemand bemerkt es. Retrieval trägt denselben Fallstrick in schärferer Form — ein leeres
Ergebnis ist ununterscheidbar von „nichts Relevantes vorhanden", solange der Block nicht selbst
sagt, in welchem Modus er entstanden ist.

## Pinned-Kontext

Relevanz-Ranking und Sicherheitsrelevanz sind unkorreliert. Ein Hinweis wie „`prod-fleet/*`
verwenden, nie bares `prod/`" ist zu keiner einzelnen Aufgabe besonders ähnlich — er ist zu
allen relevant. Ein reiner Similarity-Ranker rankt ihn systematisch weg, gerade weil er
allgemein formuliert ist. Genau der Kontext, der nie fehlen darf, ist der, den Retrieval als
erstes verliert.

Ein Score-Bonus verschiebt diese Grenze nur und gibt keine prüfbare Garantie: bei einem eng
passenden Korpus reicht der Bonus nicht, und der Block sieht trotzdem gefüllt aus. Deshalb ein
separates Budget — die Garantie ist dann als Test formulierbar (`--budget 0` → Guardrails
trotzdem im Output).

## Fehlerbehandlung

| Situation | Verhalten |
|---|---|
| bge nicht erreichbar / Timeout | `mode=rulefilter`, Delegation an die heutigen Skripte, hart am Budget gekappt |
| Rerank aus, Embed erreichbar | Vektor-Reihenfolge, `mode=retrieval degraded=rerank` |
| Kandidaten = 0 | leerer Block **mit** Header und Klartext-Hinweis — nie ein stiller Leerstring |
| Budget < Pinned-Set | Pinned gewinnt, `mode=truncated`, Retrieval-Anteil 0 |
| DB nicht erreichbar | wie bge-Ausfall: `mode=rulefilter` |

## Verifikation

- **Golden-Query-Set**: rund zehn reale Aufgabentexte mit je einem Chunk, der zwingend gefunden
  werden muss, als Recall-Assertion. Das ist die einzige Absicherung gegen leise
  Qualitätsregression — ohne sie merkt niemand, wenn das Ranking schlechter wird.
- **Fallback-Test**: bge-Port geschlossen → Exit 0, `mode=rulefilter`, Klartext-Hinweis vorhanden.
- **Pinned-Garantie**: `--budget 0` → Guardrails dennoch im Output.
- **Token-Bilanz**: `--json` gegen den heutigen Volltext-Umfang derselben Anfrage, als messbare
  Ersparnis statt behaupteter.
- **Index-Existenz**: Test prüft `chunks_embedding_hnsw` gegen `pg_indexes` in der Datenbank,
  nicht gegen den Text der Migrationsdatei.

Alle Tests per Command-Output-Verifikation (`run`, `$output`, `$status`) statt Source-Grep —
Repo-Konvention T002448-M4. Ablage nach `tests/spec/openspec-pgvector/` gemäss T002416 (ein
Verzeichnis pro SSOT-Spec, eine Datei pro Vorgang).

## Offene Parameter

Gemessen am 2026-08-14 gegen das Golden-Set (16 Einträge, `tests/fixtures/context-retrieve/golden-queries.json`),
alle Kombinationen ohne degraded- oder rulefilter-Fälle:

| limit | budget | Recall | ø belegte Tokens | ø Latenz |
|---|---|---|---|---|
| 20 | 2000 | 16/16 | 1770 | 9,3 s |
| 20 | 4000 | 16/16 | 3686 | 9,6 s |
| 20 | 8000 | 16/16 | 4172 | 9,3 s |
| 40 | 2000 | 16/16 | 1833 | 12,4 s |
| 40 | 4000 | 16/16 | 3801 | 13,2 s |
| 40 | 8000 | 16/16 | 6682 | 12,6 s |
| 60 | 2000 | 16/16 | 1797 | 16,2 s |
| 60 | 4000 | 16/16 | 3830 | 15,4 s |
| 60 | 8000 | 16/16 | 6825 | 16,3 s |

**Gewählt bleiben `limit=40` und `budget=4000`** (CLI-Defaults, per `--limit`/`--budget`
konfigurierbar). Die Messung bestätigt die Kostenlage aus der Vorbedingung: die Latenz skaliert
nur mit `limit` (Rerank ≈ 96 % der Dispatch-Zeit — 20 Kandidaten ≈ 9,5 s, 40 ≈ 13 s, 60 ≈ 16 s),
`budget` steuert nur die Füllmenge (2000 belegt ~1800 Tokens, 4000 ~3800, 8000 bis ~6800).
Recall ist über den gesamten Bereich 16/16, die Wahl ist also ausschließlich Recall-gegen-Latenz:
`limit=40` lässt mehr Kandidatendecke als 20 (3,5 s teurer) und kostet 3 s weniger als 60;
`budget=4000` füllt den Block ohne aufzublähen (8000 verdoppelt ihn bei gleichem Recall).

Messbefehl (T002717):

```bash
# Umgebung: Port-Forwards 8081 (embed), 8093/8094 (rerank), 5432 (shared-db);
# PGURL wird vom Skript aus dem k3d-Secret abgeleitet. CONTEXT_RETRIEVE_EMBED_TIMEOUT_MS=20000:
# der 5-s-Default ist fuer den fleet-WAN-Pfad zu knapp (3 von 9 Kombinationen zeigten im
# Erstlauf rulefilter-Artefakte durch Embed-Timeout, mit 20 s sind alle 9 artefaktfrei).
# Stand: Worktree-Branch feature/retrieval-schicht-T002658, Commits 53fd22d0b..f9d797d67.
node scripts/knowledge/kalibrierung-retrieval.mjs
```

Die Messung läuft mit der Eingangs-Truncation des Reranks (`CONTEXT_RETRIEVE_RERANK_INPUT_CHARS=4500`,
Messung 2026-08-14 im Kopf von `lib-context-retrieve.mjs`): der deployte llama.cpp kennt pro
Anfrage nur n_ctx=2048 Tokens und scheitert bei 2 GiB RAM schon darunter — gekürzt wird nur das
Rank-Signal, der gelieferte Block bleibt vollständig.
