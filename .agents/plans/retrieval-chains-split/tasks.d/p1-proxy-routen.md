# p1 — Proxy-Routen für LFM und ColBERT

## Task 1: Neue Pfade auf Rollen abbilden

**Files:** `bge-routes.mjs`

Erweitere `ROLE_PATHS` um `/v1/lfm/embeddings` → `lfm-embed`,
`/v1/colbert/embeddings` → `colbert-embed` und `/v1/colbert/rerank` →
`colbert-rerank`. Sonst keine Logikänderung: `loadRoles`,
`rolesFromRegistry`, `resolveRoleChain`, `callEntry` und `routeRequest`
arbeiten rollenneutral; leere Kette meldet weiter 503 mit Grund je Glied.
Kommentarkopf um die drei Rollen und ihre Vektorräume ergänzen (bge-m3 mit
1024 Dimensionen, LFM- und ColBERT-Räume getrennt, kein Quer-Fallback).

Verify: `node --test scripts/llm-proxy/bge-routes.test.mjs` bleibt grün
(Altfälle unverändert).

## Task 2: Server-Weiterleitung für die neuen Pfade

**Files:** `server.mjs`

Behandele die drei neuen Pfade in der POST-Weiterleitung exakt wie die
bestehenden Rollenpfade: bei `rolesError` 503 (`bge_roles_unconfigured`),
sonst Body lesen, Kette per `resolveRoleChain` auflösen, `routeRequest`
aufrufen und Antwort mit `x-llm-proxy-bge-upstream`-Kopfzeile
zurückschreiben. Der kanonische Pfad wird unverändert an den Upstream
gereicht (der MaxSim-Dienst aus p3 dient ihn nativ, siehe D5).

Verify: `node --test scripts/llm-proxy/server.test.mjs` grün; manuell:
unbekannte Rolle antwortet weiter 404 (`roleForPath` liefert `null`).

Commit: `feat(scripts): getrennte Retrieval-Pfade lfm/colbert im llm-proxy`
