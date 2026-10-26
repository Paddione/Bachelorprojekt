# p4 — Runbook und Desktop-Rückbau

## Task 1: Runbook auf fünf Rollen umstellen

**Files:** `bge-role-registry.md`

In `docs/runbooks/bge-role-registry.md` die Topologie (E2) um die Rollen
`lfm-embed`, `colbert-embed` und `colbert-rerank` erweitern, die neue
Reihenfolge (`embed`: Tablet 5 vor Cluster 10) festhalten und das Gate E5
klarstellen (gilt für den bge-m3-Raum mit 1024 Dimensionen; LFM- und
ColBERT-Räume haben eigene Maße, protokolliert in R6). Ergebnis der
lmstudio-Prüfung aus p2 hier vermerken.

Verify: Runbook nennt alle fünf Rollen mit Kette und das E5-Ergebnis;
`grep` nach den alten Desktop-Ports in der Topologie trifft nicht mehr.

## Task 2: Consumer-Erhebung und Desktop-Rückbau vorbereiten

**Files:** `bge-role-registry.md`

Vollständige Consumer-Erhebung für `127.0.0.1:8093`/`:8095`/`:8097`
per `grep` über beide Repos fahren (Treffer aus der Planung: R3-Liste)
und jede Fundstelle auf Proxy-Pfad (`:18235` mit Rollenpfad) oder
Entfernung umstellen. Der Rückbau selbst läuft als eigener Chore im
Dotfiles-Repo (dort liegen Units und Skripte): `serve-colbert-api`
stoppen und deaktivieren (erst wenn p3 live und stabil dient),
`devmesh-lfm-embed-forward` und `devmesh-lfm-colbert-forward`
entfernen, `serve-qwen3-embedding` und `serve-colbert-reranker` bleiben
bis dahin unangetastet. Dieser Partial committet nur die Runbook-Seite;
die Dotfiles-Schritte stehen als ausführbereite Befehlsliste im Runbook.

Verify: kein Verweis auf Desktop-Ports in Cluster-Manifesten und
Runbook-Topologie; `allow-llm-tablet-egress` per `kubectl`-Ausgabe
weiter vorhanden (D6, nur Verifikation, keine Änderung).

Commit: `docs(docs): Runbook für getrennte Retrieval-Ketten`
