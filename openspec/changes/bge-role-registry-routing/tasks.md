---
title: "bge-role-registry-routing — Implementation Plan"
ticket_id: T900006
domains: [db, ops, test]
status: active
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# bge-role-registry-routing — Implementation Plan

## File Structure

```
scripts/migrations/2026-08-29-bge-role-registry.sql   (new)  P1
scripts/llm-proxy/backends.mjs                        (edit) P2   52/800 → 748 frei
scripts/llm-proxy/bge-routes.mjs                      (edit) P3  218/800 → 582 frei
scripts/llm-proxy/server.mjs                          (edit) P4  755/800 →  45 frei  ⚠
scripts/llm/loadouts.json                             (edit) P5
docs/runbooks/bge-role-registry.md                    (new)  P5
tests/spec/local-llm-proxy/bge-chain-order.bats       (edit) P6
tests/spec/local-llm-proxy/bge-registry-roles.bats    (new)  P6
tests/spec/local-llm-proxy/bge-no-probe-import.bats   (new)  P6
```

## Partial-Manifest

| Partial | Rolle | target_files |
|---|---|---|
| P1 | db | `scripts/migrations/2026-08-29-bge-role-registry.sql` |
| P2 | ops | `scripts/llm-proxy/backends.mjs` |
| P3 | ops | `scripts/llm-proxy/bge-routes.mjs` |
| P4 | ops | `scripts/llm-proxy/server.mjs` |
| P5 | ops | `scripts/llm/loadouts.json`, `docs/runbooks/bge-role-registry.md` |
| P6 | test | `tests/spec/local-llm-proxy/*.bats` |

**S1-Budget-Warnung für P4:** `server.mjs` steht bei 755 von 800 Zeilen (`.mjs`-Limit
aus `docs/code-quality/gates.yaml`, nicht gebaselined). Es bleiben **45 Zeilen**. Die
Server-Änderung muss darunter bleiben; passt sie nicht, wird die Chain-Auflösung
vollständig nach `bge-routes.mjs` (582 Zeilen frei) verschoben und `server.mjs` ruft
nur eine Funktion mehr auf. Kein Zusammenziehen von Kommentaren, um Platz zu schaffen.

## P1 — Registry-Schema um Rollen erweitern

- [ ] Migration `scripts/migrations/2026-08-29-bge-role-registry.sql` anlegen, idempotent
      (`ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO UPDATE`) und reversibel im Stil von
      `scripts/migrations/2026-07-22-llm-proxy-backends.sql`:
  - `roles jsonb NOT NULL DEFAULT '[]'::jsonb` — Rollennamen, die dieses Backend bedient
  - `loadout_slug text` (nullable) — gesetzt ⇒ das Glied ist eine Loadout-Referenz
- [ ] Bestandszeilen seeden, sodass die Ketten der Reihenfolge aus E2 entsprechen
      (Desktop → Cluster → Geräte). Die `priority`-Werte sind die einzige
      Reihenfolgenquelle; keine impliziten Annahmen über die Einfügereihenfolge:

  | name | roles | priority | base_url / loadout_slug |
  |---|---|---|---|
  | `tei-desktop` | `["embed","rerank"]` | 1 | `http://127.0.0.1:8085` |
  | `cluster-embed` | `["embed"]` | 10 | `http://127.0.0.1:8081` |
  | `cluster-rerank` | `["rerank"]` | 10 | `http://127.0.0.1:8093` |
  | `lmstudio` | `["embed"]` | 20 | `http://127.0.0.1:1234` |
  | `pk-tablet-rerank` | `["rerank"]` | 20 | `http://192.168.100.12:8080` |
  | `bge-rerank-cpu` | `["rerank"]` | 30 | `loadout_slug = bge-rerank-cpu` |

- [ ] Kopfkommentar trägt die Anwendungsbefehle für **beide** Brands, wie in der
      Vorgänger-Migration (`BRAND=mentolder` und `BRAND=korczewski`).
- [ ] `tei-desktop` wird mit `enabled = false` geseedet. Die Rolle `embed` darf es erst
      führen, wenn das Äquivalenz-Gate aus P5 bestanden ist.

## P2 — Registry-Reader um die neuen Spalten erweitern

- [ ] In `scripts/llm-proxy/backends.mjs` das `SQL`-Statement um `roles` und
      `loadout_slug` erweitern und beide im Zeilen-Mapping übernehmen
      (`roles` als `JSON.parse`, `loadout_slug` als `null`-bare Zeichenkette).
- [ ] Das `Backend`-Typedef oben in der Datei um beide Felder ergänzen.
- [ ] `LLM_PROXY_BACKENDS_JSON` bleibt der Test-Einstieg: der Override-Pfad muss die
      neuen Felder ohne Sonderbehandlung durchreichen, damit P6 gegen Fixtures testen
      kann, ohne eine Datenbank zu brauchen.

## P3 — Kette aus der Registry bauen

- [ ] In `scripts/llm-proxy/bge-routes.mjs` eine Funktion `rolesFromRegistry(backends)`
      ergänzen, die dieselbe `Map<string, Array<{kind,slug?,baseUrl?}>>` liefert wie
      `loadRoles(doc)`. Damit bleiben `routeRequest()` und `defaultStartLoadout()`
      unverändert — die Gliedform ist der Vertrag zwischen beiden.
  - Zeilen mit `enabled === false` werden verworfen
  - Sortierung nach `priority` aufsteigend
  - `loadout_slug` gesetzt ⇒ `{kind:'loadout', slug}`, sonst `{kind:'url', baseUrl}`
- [ ] `loadRoles(doc)` bleibt unverändert erhalten — es ist ab jetzt der Rückfallpfad
      aus E3, nicht toter Code.
- [ ] **`discovery.mjs` darf nicht importiert werden.** Die Registry liefert
      Mitgliedschaft und Reihenfolge; der Health-State bleibt außen vor, sonst wird die
      anfragegetriebene Auswahl aus T002838 still zu einer probe-getriebenen.

## P4 — Server-Verdrahtung mit Rückfall

- [ ] In `scripts/llm-proxy/server.mjs` die Chain-Auflösung im Block
      `path === '/v1/embeddings' || path === '/v1/rerank'` auf `rolesFromRegistry(getBackends())`
      umstellen.
- [ ] Rückfall nach E3: wirft oder liefert die Registry-Auflösung eine leere Kette für die
      Rolle, wird `loadRoles(readLoadouts(DEFAULT_PATH).doc)` benutzt und **eine** Zeile mit
      dem Grund geloggt. Die bge-Routen dürfen nicht an einer nicht erreichbaren Datenbank
      sterben — Embedding und Rerank bedienen lokale Prozesse.
- [ ] Das Log ist einmalig pro Zustandswechsel, nicht pro Anfrage; eine unerreichbare
      Datenbank darf das Log nicht fluten.
- [ ] Das 45-Zeilen-Budget aus dem Manifest einhalten. Reicht es nicht, wandert die
      Auflösungs- und Rückfall-Logik als eine Funktion nach `bge-routes.mjs` und
      `server.mjs` behält nur den Aufruf.

## P5 — TEI, Rückfall-Konfiguration und Runbook

- [ ] TEI auf dem Desktop bereitstellen (Rolle `embed` und `rerank`, Modelle `bge-m3` und
      `bge-reranker-v2-m3`, Port 8085). Maximale Eingabelänge explizit auf 8192 setzen —
      der Default schneidet früher ab als der heutige llama.cpp-Pfad und verfälscht damit
      die Gate-Messung an den langen Testtexten.
- [ ] Äquivalenz-Gate fahren und das Ergebnis im Runbook festhalten:

```bash
OLD_EMBED_URL=http://127.0.0.1:8081/v1/embeddings \
NEW_EMBED_URL=http://127.0.0.1:8085/v1/embeddings \
node scripts/llm/measure-embedding-equivalence.mjs
# Exit 0 = Mittelwert >= 0.99. Erst danach tei-desktop auf enabled = true setzen.
```

- [ ] Den `roles`-Block in `scripts/llm/loadouts.json` als Rückfall auf dieselbe
      Reihenfolge bringen wie die Registry (Desktop → Cluster → Geräte). Beide Quellen
      dürfen nicht auseinanderlaufen; P6 sichert das ab.
- [ ] `docs/runbooks/bge-role-registry.md` anlegen: wie ein Backend einer Rolle beitritt
      (Gate fahren, Zeile einfügen, `enabled` setzen), wie die Reihenfolge über `priority`
      geändert wird, und wie der Rückfall auf `loadouts.json` erkannt wird.

## P6 — Tests (RED → GREEN)

- [ ] **Failing-Test-Step (RED).** Die drei Testdateien schreiben, bevor P1–P5 greifen.
      `bge-chain-order.bats` wird dabei von der alten Reihenfolge (Tablet/LM Studio zuerst,
      T006143 E2/E3) auf die neue umgestellt; die neuen Dateien decken die
      Registry-Auflösung und das Import-Verbot ab. Alle drei müssen auf dem heutigen Stand
      fehlschlagen:

```bash
tests/unit/lib/bats-core/bin/bats \
  tests/spec/local-llm-proxy/bge-chain-order.bats \
  tests/spec/local-llm-proxy/bge-registry-roles.bats \
  tests/spec/local-llm-proxy/bge-no-probe-import.bats
# expected: FAIL (rot — Registry-Auflösung und neue Reihenfolge existieren noch nicht)
```

- [ ] `bge-registry-roles.bats` prüft **Ergebnisse**, nicht die Quelle: es ruft die echte
      `rolesFromRegistry()` mit einem Fixture über `LLM_PROXY_BACKENDS_JSON` auf und
      sichert zu, dass die Kette nach `priority` sortiert ist, `enabled = false` fehlt und
      eine Zeile mit `loadout_slug` ein `kind === 'loadout'`-Glied ergibt. Kein
      Datenbankzugriff im Test.
- [ ] `bge-no-probe-import.bats` löst den Importgraph von `bge-routes.mjs` auf und sichert
      zu, dass `discovery.mjs` nicht darin vorkommt. Das ist der Guard gegen die
      Wiedereinführung des Probes.
- [ ] `bge-chain-order.bats` bekommt eine zweite Zusicherung: der `roles`-Rückfall in
      `loadouts.json` führt dieselbe Reihenfolge wie die Registry-Fixture.
- [ ] Neue Testdateien in der Test-Registry ergänzen, sonst schlägt
      `proxy-tests-registered.bats` fehl.

- [ ] **Fix-Step (GREEN).** Nach P1–P5 laufen alle drei Dateien grün:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/local-llm-proxy/
```

- [ ] **Final Verification.** Die drei verpflichtenden CI-Gates:

```bash
task test:changed
task freshness:regenerate
task freshness:check
```
