---
title: EmbeddingGemma Dense-Profil und parallele CPU-Laufzeit
domains: [llm, infrastructure, retrieval]
status: planned
---

# embeddinggemma-dense-768 — Implementation Plan

## File Structure

Worktree: `/home/patrick/.worktrees/Bachelorprojekt-37ac27be/feature/embeddinggemma-dense-768`, Ausgangsrevision `bc0772bf551fed0f23ca8eb58deb23dc8f74ad0b`, Spec `../design.md`. Jeder Bash-Aufruf beginnt mit `export AGENT_LOCK_SID=codex-embeddinggemma-20261026`. Dieses Partial besitzt ausschließlich die folgenden Implementierungsdateien; sämtliche Bachelor-Testdateien gehören p3.

| Aktion | target_files | Verantwortung |
|---|---|---|
| Neu | `scripts/lib/dense-embedding.mjs` | Seiteneffektfreies Modell-/Prompt-/Dimensionsprofil und verlustfreies tokenbasiertes Splitten |
| Neu | `scripts/lib/dense-embedding.d.mts` | Typisierte Exporte für TypeScript-Consumer |
| Ändern | `scripts/bge-mcp/server.mjs` | Kompatibler MCP-Toolname, Purpose und Modellidentität für Gemma |
| Neu | `k3d/llm-gemma-embed.yaml` | Paralleler CPU-Gemma-Dienst und geparkter Bulk-Pool; eigener Service |
| Ändern | `k3d/llm-gpu.yaml` | BGE-Dense-Retirement erst nach abgeschlossenem Cutover; BGE-Reranker erhalten |
| Ändern | `k3d/kustomization.yaml` | Gemma-Ressourcen registrieren |
| Ändern | `dev-local/core/kustomization.yaml` | Gemma-Ressourcen registrieren |
| Ändern | `k3d/sdlc-stack/kustomization.yaml` | Gemma-Ressourcen registrieren |
| Ändern | `dev-local/components/llm-services/deployment.yaml` | Künftige embed-Kette ausschließlich Gemma, Rerank-/LFM-/ColBERT-Ketten erhalten |
| Ändern | `devmesh/pk-tablet/loadouts.json` | Alten Tablet-Dense-Loadout deaktivieren; Tablet-Reranker erhalten |
| Ändern | `scripts/llm/loadouts.json` | Embed-Rückfallkette Gemma; alten Desktop-BGE-Dense-Loadout deaktiviert halten |
| Ändern | `environments/dev.yaml` | Dense-Modellkennung und kanonischer Gemma-Endpunkt |
| Ändern | `environments/mentolder.yaml` | Dense-Modellkennung und kanonischer Gemma-Endpunkt |
| Ändern | `environments/schema.yaml` | Dokumentierter Modell-/Dimensions-/Kontextvertrag |
| Ändern | `k3d/dev-stack/sdlc-console.yaml` | Gemma-Modellkennung für den Query-Consumer |
| Ändern | `k3d/sdlc-stack/sdlc-console.yaml` | Gemma-Modellkennung für den Query-Consumer |

Alle Quellpfade werden im Worktree gelesen/geschrieben. Keine verschlüsselte Environment-Datei, kein Token und keine gerenderte Secret-Konfiguration ist Teil dieses Partials. Keine Änderung an `k3d/llm-retrieval-gpu.yaml`, `k3d/llm-retrieval-maxsim.yaml`, `scripts/mcp/cbm-embed-*.py` oder dem separaten Qwen-/LFM-Graphraum.

## Ziel und Freigabegrenze

Gemma wird zunächst parallel zu BGE über `llm-gateway-gemma-embed` bereitgestellt. Die spätere Quellkonfiguration darf bereits die fertige Gemma-Kette beschreiben, wird aber vor kompletter Migration nicht ausgerollt. Shadow-Reindex spricht ausdrücklich den Gemma-Service an. Der laufende BGE-Service und seine Leser/Writer bleiben bis zur vollständigen Shadow-Abnahme unverändert. Kein Cluster-Apply, keine Prozess-Neuladung und keine Umstellung der kanonischen Route aus diesem Implementierungspartial heraus.

Nach p2, p3 und dem Root-p4 müssen sämtliche bestandsführenden Dense-Tabellen und Devflow-Caches vollständig im neuen Profil vorliegen, bevor Modell-/Routing-Konfiguration und Reader gemeinsam umgeschaltet werden. Alte BGE-Vektoren bleiben als Rollback-Bestand erhalten und werden nicht in-place in 768 Dimensionen umgewandelt. Tablet-Dense darf kein Glied der neuen embed-Kette sein, bis ein eigener Gemma-Smoke dessen Modellidentität, Promptvertrag und 768 Dimensionen bestätigt; Tablet-Rerank bleibt durchgehend Mitglied der rerank-Kette.

## S1-Budget und übrige Gates

Quelle: `docs/code-quality/gates.yaml`, `docs/code-quality/baseline.json` und `scripts/code-quality/gates/s1-filesize.mjs`, gemessen auf obiger Revision. Kein aufgeführter Pfad hat einen S1-Baseline-Eintrag. Die S1-Dateierweiterung ist maßgeblich, nicht eine pauschale Grenze für YAML/JSON.

| Datei | Ist-Zeilen | Budget | Wirksame Schwelle | Schnitt |
|---|---:|---:|---:|---|
| `scripts/lib/dense-embedding.mjs` | 0, neu | 800 | 800 | Neue Implementierung auf höchstens 240 Zeilen schneiden |
| `scripts/lib/dense-embedding.d.mts` | 0, neu | 800 | 800 | Deklaration auf höchstens 70 Zeilen schneiden |
| `scripts/bge-mcp/server.mjs` | 321 | 479 | 800 | Format-/Split-/Validierungslogik in das neue Pure-Modul extrahieren |

Für die übrigen target_files existiert wegen `.yaml`/`.json` kein S1-Extension-Limit und kein Baseline-Key. Gemessene Zeilen: `k3d/llm-gemma-embed.yaml` neu; `k3d/llm-gpu.yaml` 454; `k3d/kustomization.yaml` 146; `dev-local/core/kustomization.yaml` 205; `k3d/sdlc-stack/kustomization.yaml` 29; `dev-local/components/llm-services/deployment.yaml` 102; `devmesh/pk-tablet/loadouts.json` 61; `scripts/llm/loadouts.json` 540; `environments/dev.yaml` 75; `environments/mentolder.yaml` 139; `environments/schema.yaml` 1838; `k3d/dev-stack/sdlc-console.yaml` 146; `k3d/sdlc-stack/sdlc-console.yaml` 171. Keine Baseline-/Ignore-Erweiterung. Bei zwischenzeitlicher Revision die Messung wiederholen.

S2: Das Profil importiert weder Router noch DB-/Web-Schichten. `.d.mts` verwendet konkrete String-Union- und Array-Typen ohne `any`. S3: URLs aus vorhandener Environment-/Service-Konfiguration; keine Brand-Domain-Literale ergänzen. S4: Alle drei Kustomizations referenzieren das neue Manifest; Profil wird von MCP und p2-Consumern importiert. Image-Pins bleiben explizit.

## Task p1.1 — Gemeinsamen Dense-Vertrag implementieren

Runtime: Node.js für `.mjs`, TypeScript für Consumer. Nur Profil und Deklaration ändern. Timeout pro lokalem Test 300 Sekunden. Testfälle werden von p3 geschrieben; zuerst den dort bereitgestellten fokussierten Vertragstest mit `node --test scripts/lib/dense-embedding.test.mjs` ausführen, expected: FAIL vor Implementierung, danach Exit 0.

Verbindliche Exporte:

- `DENSE_MODEL = 'embeddinggemma-300m'`.
- `DENSE_DIMENSIONS = 768`.
- `DENSE_PROFILE = 'embeddinggemma-300m:768:Q8_0:v1'`.
- `DENSE_MAX_TOKENS = 2048`.
- `formatDenseInput(text, purpose, title?)` nimmt `purpose: 'query' | 'index'`. Query wird exakt `task: search result | query: ` plus unveränderter Text. Index wird exakt `title: ` plus Titel oder `none` plus ` | text: ` plus unveränderter Text. Keine zusätzliche Präfixlogik im Proxy. Clients übergeben rohe Texte genau einmal an diese Funktion.
- `assertDenseVectors(vectors, expectedCount): void` verwirft falsche Anzahl, andere Dimensionen, nicht-numerische oder nicht-endliche Werte sowie Nullvektoren. Kein Abschneiden/Auffüllen von 1024-Vektoren. Ein leeres Ergebnis ist nur bei erwarteter Anzahl 0 zulässig.
- `splitDenseText(text, { tokenize, purpose = 'index', maxTokens = 2048 }): Promise<string[]>`. `tokenize(formattedText): Promise<number>` zählt reale Modell-Tokens einschließlich Spezialtokens und des vollständigen rollenabhängigen Prompts. Ergebnisse sind rohe Teiltexte, erst der Consumer formatiert sie zum Versand. Nichtpositive oder über dem Modellkontext liegende maxTokens ablehnen. Wenn der Prompt allein kein Zeichen zulässt, verständlich abbrechen statt in einer Schleife hängen zu bleiben.

Splitter-Invarianten: `parts.join('') === originalText`; keine Normalisierung, kein Whitespace-Verlust, keine ausgelassenen Abschnitte, keine getrennten UTF-16-Surrogatpaare. Jeder formatierte Teil wird vor Ausgabe real tokenisiert und erfüllt sein Limit. Leerer Ausgangstext wird ohne Verlust behandelt. Tokenizer-Fehler werden weitergereicht, niemals als leere Texte oder stilles Truncation-Ergebnis kaschiert. Eingefrorener Titel/Prompt muss beim Zählen und Senden identisch bleiben; Consumer mit eigenem Titel nutzen denselben finalen Formattext für die Budgetprüfung.

Akzeptanz: exakt 768 endliche Werte passieren, 1024/767/NaN/Infinity/Nullnorm/wrong count scheitern; Query- und Dokument-Präfix unterscheiden sich; Unicode, Leerzeilen, lange Einzelzeile, sehr langer Prompt und Tokenizerfehler sind abgedeckt. Keine Mischräume und kein doppeltes Präfix.

## Task p1.2 — MCP-Purpose anbinden

Nur `scripts/bge-mcp/server.mjs` ändern. Bestehende MCP-Toolnamen `bge_embed` und `bge_rerank`, HTTP-Transport, Bearer- und Timeout-Vertrag erhalten. `bge_embed` bekommt optional `purpose: 'index' | 'query'`; dokumentierter Kompatibilitätsdefault ist `index`. Rückgabe enthält mindestens `dimensions`, `embeddings` und zusätzlich `model`/`profile` als überprüfbare Identität. Jeder query-seitige Consumer wird in p4 explizit auf query umgestellt. Alte Clients dürfen nicht versehentlich als Query interpretiert werden.

MCP nutzt das gemeinsame Profil für Modell-ID, Formatierung, tokenbasierte Längenbehandlung und Antwortprüfung. Multi-Chunk-Input darf nicht still mehrere Dokumentvektoren zu einem Eingangstext zusammenfassen: Indexer splitten vorab; ein MCP-Call, der genau einen Vektor pro Text verspricht, muss zu lange Texte mit eindeutigem Fehler zurückweisen. Query-Längenfehler bleiben fail-closed. Rerank-Payload, Modell und Resultat bleiben unverändert.

Verifikation nach p3: `node --test scripts/llm-proxy/bge-routes.test.mjs` und `python3 -m pytest tests/py/spec/native_ported/spec/local-llm-proxy/test_bge_mcp_upstream_timeout.py tests/py/spec/native_ported/spec/mcp-gateway/test_bge_mcp_windows_esm_url.py -q`; Exit 0. Ein Stub erfasst den Upstream-Body und bestätigt genau ein Präfix und den richtigen Purpose. Das tokenisierte Promptbudget wird gegen die tatsächliche neue Runtime geprüft, nicht mit BGE-Zeichenfaktoren geschätzt.

## Task p1.3 — Parallele CPU-/Bulk-Runtime deklarieren

Neues Manifest mit Deployment `gemma-embed`, geparktem Deployment `gemma-embed-bulk` (`replicas: 0`) und Service `llm-gateway-gemma-embed` auf dem bestehenden Embedding-Service-Port 8081. Beide Deployments verwenden dieselbe Modell-/Quantisierungsdatei und denselben Promptvertrag; Bulk-Pods tragen passende Service-Labels. Gewichte: `https://huggingface.co/unsloth/embeddinggemma-300m-GGUF/resolve/main/embeddinggemma-300M-Q8_0.gguf`; Modelalias `embeddinggemma-300m`, Dateiname exakt case-sensitive. Modellrevision bzw. SHA256 im Runtime-Beleg sichern.

Vorhandenen CPU-llama.cpp-Image-Pin aus `k3d/llm-gpu.yaml` übernehmen, statt ein unversioniertes Image einzuführen. `--embeddings`, Mean-Pooling gemäß GGUF, `-ngl 0`, `-t 2`, `-tb 2` gegen CPU-Limit 2000m. Eingaben maximal 2048 Tokens einschließlich Prompt; physischer Batch muss eine volle nichtkausale Sequenz aufnehmen. Bei zwei Slots mindestens 4096 Gesamtkontext vorsehen und per `/props`/Startlog bestätigen, dass pro Sequenz 2048 nutzbar sind. Speicherlimit durch Smoke unter realer maximaler Eingabe verifizieren; keine unverifizierten 2-GiB-Versprechen und kein Flash-Attention-Zwang. Aktivierungen nicht in FP16 erzwingen; GGUF-Q8-Gewichte bleiben davon getrennt.

Init-/App-Sicherheitskontext wie vorhandene Ressourcen: nicht root, keine Privilegienerweiterung, passende Dateirechte. Bulk erhält `emptyDir` statt gemeinsamen RWO-PVC und keine zwingende GPU-Nodebindung. Falls Hauptdeployment PVC nutzt, Recreate/RWO-Semantik korrekt halten. Routing-/Netzwerkregeln dürfen den neuen Service nicht aussperren; bestehende namespace-/App-Selektoren beim Rendern prüfen und nötige neue Ressourcen im selben Manifest referenzierbar definieren.

Lokale Verifikation: `kubectl kustomize k3d`, `kubectl kustomize dev-local/core`, `kubectl kustomize k3d/sdlc-stack` jeweils Exit 0 und genau eine Definition je Gemma-Ressource. Keine BGE-Reranker-/LFM-/ColBERT-Spec-Diffs. `task workspace:validate` sowie von p3 erweiterte `test_bge_bulk_pool.py`, `test_bge_thread_quota.py` und `test_bge_usecase_reachability.py` laufen grün. Keine Live-Mutation aus diesem Task.

## Task p1.4 — Künftigen Cutover eindeutig konfigurieren

Die endgültige `embed`-Kette in Deployment-Registry und `scripts/llm/loadouts.json` verweist ausschließlich auf den Gemma-Service. Tablet bleibt in `rerank`, entfällt aus `embed`; Tablet-Dense-Loadout deaktivieren. `LLM_EMBED_MODEL` in den aufgeführten Environment-/SDLC-Dateien wird `embeddinggemma-300m`; Query- und Index-Endpoint zeigen nach der freigegebenen Migration auf denselben Modellraum. Header-/Pfad-Routing der separaten LFM- und ColBERT-Rollen unverändert lassen. Keine Alias-ID `bge-m3` für Gemma-Vektoren zurückmelden.

Altes BGE-Dense-Hauptdeployment und Bulk-Pool bis zum Rollback-fähigen Cutover erhalten. Das spätere Retirement schaltet nur Dense-BGE ab; BGE-Reranker bleibt live. Konfigurationsänderungen werden zusammen mit p2/p4 ausgeliefert, nicht vorher einzeln. Bei nicht vollständigem Shadow-Index oder Modell-/Dimensions-Mismatch darf die Umschaltung nicht stattfinden.

## Task p1.5 — Runtime-Smoke nach vollständiger Migration vorbereiten

Dieser Task beschreibt die Checks für den gemeinsamen Deployment-/Migrationsschritt nach allen Partials; er autorisiert keinen vorgezogenen Deploy. Belege nach `artifacts/embeddinggemma-dense-768/` im vorgesehenen unveröffentlichten Runtime-Artefaktverzeichnis sichern, einschließlich Zeit, Image-SHA, GGUF-SHA, CPU-Node, Threads, Ressourcen und Modellprofil; keine Tokens oder DB-Passwörter protokollieren.

1. Gemma-Dienst isoliert bereitstellen, BGE unverändert weiter betreiben. Per gezieltem Port-forward den neuen Dienst auf localhost:19886 erreichen. `/health` muss ok, `/props` muss den erwarteten Kontext/Slotvertrag zeigen.
2. Tokenizer und Embeddings mit exakt formatierten DE-/EN-Queries und Dokumenten aufrufen. Ein Input ergibt genau einen endlichen, nichtleeren 768-Vektor. Query/Dokument-Prompts werden nur einmal angewendet; 1024-Vektor-Antwort führt zu hartem Fehler.
3. Tatsächlich tokenisierte Eingaben bis zur 2048-Grenze prüfen. Zu lange Quellen werden durch `splitDenseText` verlustfrei gesplittet oder an der Query-Grenze klar abgewiesen. Kein unbemerkter Textverlust und kein Erfolg mit nur einem Präfixvektor.
4. Einen gemischten DE/EN-Satz und eine längere Code-/YAML-Eingabe seriell sowie mit zwei parallelen Requests messen; Peak-RAM und `restartCount` vor/nach sichern. Ein Neustart/OOM verwirft den Lauf und blockiert Cutover; kein wiederholtes Belasten der fehlerhaften Runtime.
5. Bulk-Pool nur in diesem abgeschlossenen Fenster auf eine zusätzliche Replika skalieren, identische Dimension/Modellidentität prüfen, anschließend wieder 0. Requests an den Service dürfen keinen BGE-Vektor erhalten.
6. Nach p2-Shadow-Abnahme und p4-Cache-Abnahme Leser/Writer gemeinsam auf das neue Profil umstellen. Danach echte Dense-Suche über MCP und Website mit aufgelösten Modellmetadaten ausführen. Tablet-Rerank und LFM/ColBERT-Endpunkte bleiben erreichbar.

Bei Fehler bleiben BGE-Reader/Writer und deren unveränderte Indizes die aktive Einheit. Keine unabhängig vorgezogene Query-Umstellung, kein Delete alter Indizes und kein gemischter Fallback.

## Root-p4-Handoff: getrenntes Dateimanifest, keine p1-Ownership

Root-Worktree `/home/patrick/.worktrees/dotfiles/feature/embeddinggemma-dense-768` besitzt die folgenden notwendigen Änderungen separat. Gemessener Ausgangsumfang: `backends.mjs` 138, `graph-cache.mjs` 66, `retrieve.mjs` 111, `symbols.mjs` 83, `graph-index.mjs` 132, `server.mjs` 232 Zeilen. Root-eigene Gates gelten, keine Bachelor-S1-Budgets übertragen.

- Neu: `mcp-servers/devflow/lib/dense-profile.mjs` lädt die Bachelor-SSOT anhand des bereits vorhandenen `TOOLSET_HOME`-Pfads; fehlen Modul/Exports, fail-closed statt Modellkonstanten duplizieren.
- Ändern: `mcp-servers/devflow/lib/backends.mjs`: `makeBge().embed(texts, batch = 32, purpose = 'index')` transportiert Purpose zu `bge_embed`, prüft 768-Dimensionen und Profil. Direkter HTTP-Fallback formatiert mit derselben SSOT; MCP-Payload bleibt roh, damit nicht zweimal präfixiert wird.
- Ändern: `mcp-servers/devflow/server.mjs`: Task-Embedding ausdrücklich `query`.
- Ändern: `mcp-servers/devflow/lib/retrieve.mjs`: alle Query-Aufrufe ausdrücklich `query`; Knowledge-Filter und Cache-Identität Gemma. Keine Modellraum-Mischung bei Fallback.
- Ändern: `mcp-servers/devflow/graph-index.mjs`: Index-Aufrufe ausdrücklich `index`, Meta enthält `DENSE_MODEL`, `DENSE_PROFILE` und 768 Dimensionen; alten Cache nicht nur nach Contenthash weiterverwenden.
- Ändern: `mcp-servers/devflow/lib/graph-cache.mjs`: Reader/Writer und `topK` prüfen Profil, Dimensionsgleichheit, Vektoranzahl und endliche Werte. Ein 768-Query gegen 1024-Cache muss vor dem Skalarprodukt scheitern und darf keine NaN-Scores zurückgeben.
- Ändern falls dort modellgebundene Identität untergebracht wird: `mcp-servers/devflow/lib/symbols.mjs`; sonst Profilvergleich im Graph-Indexer ist ausreichend und vermeidet unnötigen Diff.
- Tests p4/p3: bestehende Bachelor-Verhaltenstests `tests/py/spec/native_ported/spec/devflow-mcp/test_graph_index.py`, `test_retrieval.py` und Fixtures unter `tests/spec/devflow-mcp/fixtures/`; zusätzlich Root-eigener fokussierter Node-Test für Loader, Fallback-Prompts und Cache-Mismatch unter `mcp-servers/devflow/tests/dense-profile.test.mjs`. Root-Whitelist `!mcp-servers/devflow/**` deckt die neue Testdatei bereits ab.

Reindex-Einstieg für Root: `node mcp-servers/devflow/graph-index.mjs --repo /home/patrick/Bachelorprojekt --full --max-minutes 30`, weitere tatsächlich vorhandene BGE-Caches nach demselben Verfahren. Der aktuelle Indexer kann Exit 0 bei Backend-Ausfall liefern; zusätzlich vollständiges Manifest, `pending = 0`, `partial = false`, Modellprofil und 768 Dimensionen prüfen. Separate `remote-workspace/embedding_graph.py`- und CBM-LFM-Store-Verträge bleiben unberührt.

## Task p1.6 — Gemeinsame Verifikation vor Abschluss

Nach p3-Tests und allen Consumer-Änderungen, im Bachelor-Worktree: `task test:changed`, `task freshness:regenerate`, `task freshness:check`, `task test:inventory` sowie `task workspace:validate`. Erst nach Commit der generierten Artefakte den Freshness-Endzustand abschließend beurteilen. Root-p4 führt seine gezielten Node-/pytest-Checks und `python3 scripts/agent-workspace.py check` im Root-Worktree aus. Kein kompletter Migrationsbeleg ohne bestandene Shadow-Vollständigkeit und die oben beschriebenen Runtime-Smoketests.
