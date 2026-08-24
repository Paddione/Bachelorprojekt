# Proposal: session-hub-reap-purge-fixes

## Why

Vier zusammenhängende Defekte am Sessions-Stack, gefunden im Audit von `scripts/session-hub.sh`, `k3d/sessions-server.yaml`, `prod-fleet/mentolder/sessions-server.yaml` und der Website-API-Routen unter `src/pages/api/admin/sessions/`:

1. **Reap löscht register-Einträge sofort (Bug, beobachtbar):** `cmd_register` schreibt `server_pid=0` (`scripts/session-hub.sh:117`); `_pid_alive("0")` ist false, weil `[ "0" -gt 0 ]` fehlschlägt. Der nächste `reap`-Lauf entfernt damit JEDE über `register` (bzw. `POST /api/admin/sessions`) angelegte Session. Symptom vs. Ursache: Symptom = Karten verschwinden still; Ursache (verifiziert am Code-Pfad `cmd_reap` → `_pid_alive`) = ungetrackte PIDs werden wie tote PIDs behandelt. Kein Spec-Szenario fordert das — beide Reap-Szenarien nutzen explizit tote PIDs (999999).

2. **Purge-Pipeline läuft ins Leere:** Der CronJob `sessions-purge` (`k3d/admin-actions-cronjobs.yaml`, ns `workspace`) ruft die PROD-Website auf; die liest/schreibt den Registry-Pfad im HOME des Prod-Pods. Aber `_sync_to_pod` spiegelt die Registry ausschließlich in den Dev-Pod (`k3d-mentolder-dev` / ns `workspace-dev`). Folgen: Prod-GET liefert immer `[]`, Prod-Purge ist permanenter No-op, und `purgeOldSessions` fetcht `local_url` (= `localhost:*`) im falschen Pod → `content_available` immer false. Dazu Schema-Drift: `RegistryEntry` in `components/website/src/lib/sessions/archive.ts` erwartet `participants`/`owner`/`preferred_username` — Felder, die `session-hub.sh` nie schreibt (`owner` also immer `"unknown"`, der Nicht-Admin-Sichtbarkeitsfilter tot); gefetchtes HTML wird als `.md` abgelegt.

3. **Öffentliche Ticket-ID-Exposure:** Session-Seiten sind ohne Auth erreichbar (IngressRoute ohne Middleware) und enthalten via `start-form` injizierte Ticket-IDs. **Entscheidung (User, 2026-08-24):** Gate via traefik `forwardAuth`-Middleware auf Pocket-ID an der IngressRoute — Ticket-ID-Injektion bleibt damit unkritisch.

4. **Domain-Hardcoding gegen Repo-Konvention:** `sessions.mentolder.de` steht wörtlich in der nginx-ConfigMap (`k3d/sessions-server.yaml:32`), IngressRoute-HostRegexp + Certificate-DNSName (`prod-fleet/mentolder/sessions-server.yaml`) und im Script-Default (`scripts/session-hub.sh:21`) samt `web.mentolder.de`-Fallback (:147,:200) — während AGENTS.md alle Domains in `k3d/configmap-domains.yaml` zentralisiert. **Entscheidung (User, 2026-08-24):** Zentralisierung gehört in diesen Fix.

## What

1. **Reap fixen:** `cmd_reap` behandelt `server_pid <= 0` / fehlend als "kein Prozess getrackt" → Eintrag bleibt. Nur positive PIDs werden auf Lebendigkeit geprüft.
2. **Sync/Purge verdrahten:** `_sync_to_pod` parametrisieren (Context/Namespace), sodass neben dem Dev- auch der Prod-Website-Pod beliefert wird; Purge-CronJob bleibt am Prod-Ziel, trifft jetzt echte Daten. Website-seitig `SessionEntry`/`RegistryEntry` an die real geschriebenen Felder angleichen (Phantom-Felder entfernen), Archiv-Dateiendung an tatsächlichen Content koppeln.
3. **forwardAuth-Gate:** Pocket-ID-forwardAuth-Middleware an die sessions-IngressRoute im prod-Overlay; unauthentifizierte Requests landen beim Login.
4. **SESSIONS_DOMAIN zentralisieren:** Eintrag in `k3d/configmap-domains.yaml`; nginx-ConfigMap und Script-Default ziehen die Domain daraus bzw. aus `SESSION_HUB_DOMAIN` mit Fallback auf die zentrale Config; `api_url`-Fallback nutzt `WEB_DOMAIN`. Prod-Overlay-Literale (`*.sessions.mentolder.de` in Cert/HostRegexp) bleiben als Brand-Pinage erlaubt.
5. **Nits im Zug:** `/health` setzt Content-Type via `default_type` statt doppeltem Header durch `add_header`; Header-Kommentar in `session-hub.sh` listet `regen`; `deregister` räumt konsequent nur noch `server_pid` (tunnel_pid-Vestige entfällt mit).

Abhängigkeit: Change `consolidate-sessions-specs` (T016250) landet zuerst — beide Changes editieren `openspec/specs/sessions-server.md`.

_Ticket: T016251_
