# p2 — `expect`-Schema: Registry-Felder + Guard-Pflicht

## Ziel
Jeder der 18 live Einträge in `docs/agent-guide/registry/domains.yaml` bekommt:
```yaml
expect:
  status: [200]              # Erst-Antwort-Codes, unAuthentifiziert
  redirect_to_contains: "sso" # nur bei 3xx-Erwartung
```
Startwerte aus den Live-Proben 2026-10-28 (PROGRESS-Chronik des Goals):
mentolder `auth,board,office,react,web→200`, `downloads,files,grafana,remote,
studio,traefik→302`, `mail,otel→401`, Apex `→301`; devmesh `auth,massage,mail,
dna→200`, `agent-board→302→/verbund`, `web→302→/sdlc/cockpit`, `brain→302→SSO`,
`llm,graph,sessions→404-kein-Root`. **Achtung**: Diese Hostnamen decken sich
nur teilweise mit den 18 Registry-IDs (Registry: 19 Domains, davon 1 frozen) —
p2 mappt jede Registry-ID einzeln und verifiziert den Wert per Live-Lauf
(`task domains:probe` ab Tailnet-Host). Weicht die Realität begründet ab
(z. B. toter 404-Host aus der 2026-10-28-Liste), wird der `expect`-Wert an die
Realität angepasst UND die Abweichung im PR-Body begründet — nie umgekehrt.

## Guard (`scripts/domains-check.mjs`, +≈30 Zeilen, Limit 800)
Fail-closed Erweiterung in `check()`:
- `status: live` ohne `expect`-Block (oder ohne nicht-leeres `expect.status`) → Verstoß.
- `expect.status` enthält nur 1xx/2xx/3xx/4xx-Ganzzahlen → sonst Verstoß.
- `frozen|retired` mit `expect`-Block → Hinweis-Verstoß (tote Erwartungen
  verrotten; entfernen).
Bestehende Fixture-Tests in `test_domains_registry.py` NICHT anfassen
(disjunkt zu p4); bei Bedarf eigene Fixture im p4-Test.

## Gates
- `task domains:check` grün (18 live × `expect` vorhanden, Matrix sauber).
- `task domains:map` regeneriert ohne Diff, wenn die Karte keine
  Expect-Spalte bekommt (Empfehlung: keine — Scope klein halten).
