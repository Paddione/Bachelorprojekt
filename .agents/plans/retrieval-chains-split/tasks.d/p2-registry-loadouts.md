# p2 — Registry und E3-Rückfall

Voraussetzung: p3 ist live (der MaxSim-Dienstname steht, die Registry zeigt
erst auf Erreichbares).

## Task 1: lmstudio-Dimension prüfen

**Files:** `deployment.yaml`

Vor jeder Kettenänderung das Runbook-Gate E5 für Kette `embed` ausführen:
Referenzglied ist der Cluster-bge (`llm-gateway-embed`, 1024 Dimensionen).
Ist das lmstudio-Modell ein anderer Vektorraum, verliert der
`lmstudio`-Eintrag die Rolle `embed` (Backend-Zeile bleibt für andere
Nutzung erhalten). Ergebnis (Modellname, Dimension, Entscheidung) ins
Runbook-Protokoll in p4 übernehmen.

Verify: Gate-Skript laut `docs/runbooks/bge-role-registry.md` mit Exit 0
bei Bestätigung; bei Entfernung: Kette `embed` enthält kein lmstudio mehr
(`kubectl`-Ausgabe der Registry prüfen).

## Task 2: Backend-Registry fortschreiben

**Files:** `deployment.yaml`

In `LLM_PROXY_BACKENDS_JSON`: `tablet-embed` von Priorität 15 auf 5
anheben. Neu aufnehmen (alle Priorität 10, je eigene Rolle, kein
Quer-Eintrag): `cluster-lfm-embed` auf
`http://llm-gateway-lfm-embed.workspace.svc.cluster.local:8081` (Rolle
`lfm-embed`), `cluster-lfm-colbert` auf
`http://llm-gateway-lfm-colbert.workspace.svc.cluster.local:8081` (Rolle
`colbert-embed`), `cluster-colbert-maxsim` auf den Dienst aus p3 (Rolle
`colbert-rerank`). Bestehende `rerank`-Kette (Tablet 5, Cluster 10)
unverändert lassen.

Verify: Registry-Dump aus dem Cluster lesen und Reihenfolge je Rolle
prüfen (Tablet vor Cluster in `embed`); `task workspace:validate` grün.

## Task 3: E3-Rückfall spiegeln

**Files:** `loadouts.json`

Den Top-Level-Block `roles` in `scripts/llm/loadouts.json` auf die neue
Topologie umstellen: `embed` und `rerank` ohne Desktop-Loopbacks (Tablet-
und Cluster-Adressen), dazu `lfm-embed`, `colbert-embed` und
`colbert-rerank` mit denselben Zielen wie die Registry (Tablet entfällt
dort, es trägt nur bge). Format-Guard beachten
(`scripts/llm/loadouts-format.mjs`, via `task llm:loadouts:check`).

Verify: `node -e "loadRoles(...)"`-Probe je Rolle (fünf Ketten, alle
Glieder `kind url`); `task llm:loadouts:check` grün.

Commit: `feat(infra): getrennte Retrieval-Ketten in Registry und Rückfall`
