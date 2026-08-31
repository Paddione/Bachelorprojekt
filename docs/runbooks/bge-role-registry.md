# Runbook: bge-Rollen ueber die Backend-Registry (bge-role-registry-routing)

Dieses Runbook dokumentiert die Verwaltung der Upstream-Ketten fuer die bge-Routen (`/v1/embeddings` und `/v1/rerank`) des LLM-Proxys (Port 18235).

## Architektur & Prinzipien

1. **Rollenbasierte Routen:**
   - `/v1/embeddings` -> Rolle `embed`
   - `/v1/rerank` -> Rolle `rerank`
   - Beide Routen sind strikt von der Chat-Modellaufloesung (`/v1/models`) getrennt.

2. **Registry-gesteuerte Ketten (SSOT):**
   - Die Kettenmitglieder und ihre Reihenfolge werden aus der Tabelle `tickets.llm_proxy_backends` gelesen.
   - Eine Zeile gehoert zu einer Rolle, wenn `roles` (JSONB-Array) den Rollennamen enthaelt.
   - Die Reihenfolge innerhalb der Kette wird ausschliesslich ueber die Spalte `priority` (aufsteigend) bestimmt.
   - `enabled = false` schliesst ein Backend aus der Kette aus.
   - Ist `loadout_slug` gesetzt, wird ein on-demand Loadout `{kind: 'loadout', slug}` gestartet; sonst wird `base_url` als `{kind: 'url', baseUrl}` angesprochen.

3. **Kettenreihenfolge (Topologie E2):**
   - Desktop (immer an, hohe Rechenleistung) -> Prioritaet 1
   - Cluster (always-on K8s Services) -> Prioritaet 10
   - Geraete / Laptops / Tablets (WireGuard) -> Prioritaet 20
   - Lokales CPU-Loadout (on-demand) -> Prioritaet 30

4. **Anfragegetriebenes Failover (E1):**
   - Die Registry liefert nur Mitgliedschaft und Reihenfolge.
   - Die Auswahl erfolgt rein anfragegetrieben beim Weiterleiten (Timeout/Verbindungsfehler/5xx -> naechstes Glied). Es findet kein Health-Probing via `discovery.mjs` statt.

5. **Notfall-Rueckfall (E3):**
   - Ist die Datenbank nicht erreichbar oder liefert eine leere Kette, faellt der Proxy transparent auf den `roles`-Block in `scripts/llm/loadouts.json` zurueck und loggt genau eine Warnung.

---

## Aufnahmebedingung: Aequivalenz-Gate (E5)

Vor der Aktivierung (`enabled = true`) eines neuen Backends fuer die Rolle `embed` **muss** das Aequivalenz-Gate gegen das Referenzglied ausgefuehrt werden:

```bash
OLD_EMBED_URL=http://127.0.0.1:8081/v1/embeddings \
NEW_EMBED_URL=http://127.0.0.1:8085/v1/embeddings \
node scripts/llm/measure-embedding-equivalence.mjs
```

- **Kriterium:** Exit 0 (Kosinus-Aehnlichkeit ueber alle Testtexte >= 0,99 und Dimension 1024).
- Erst nach erfolgreicher Messung darf das Backend in der Registry auf `enabled = true` gesetzt werden.

---

## Verwaltung via SQL

### Neues Backend fuer eine Rolle eintragen

```sql
INSERT INTO tickets.llm_proxy_backends
  (name, kind, base_url, api_key_env, enabled, priority, roles, loadout_slug)
VALUES
  ('tei-desktop', 'llamacpp', 'http://127.0.0.1:8085', NULL, true, 1, '["embed","rerank"]'::jsonb, NULL)
ON CONFLICT (name) DO UPDATE
  SET roles = EXCLUDED.roles,
      priority = EXCLUDED.priority,
      enabled = EXCLUDED.enabled,
      updated_at = now();
```

### Backend aktivieren / deaktivieren

```sql
UPDATE tickets.llm_proxy_backends
   SET enabled = true, updated_at = now()
 WHERE name = 'tei-desktop';
```

### Reihenfolge aendern

```sql
UPDATE tickets.llm_proxy_backends
   SET priority = 5, updated_at = now()
 WHERE name = 'cluster-embed';
```

Der Proxy pollt die Registry alle 30 Sekunden automatisch oder kann via `POST /admin/reload` sofort neu geladen werden.