# Design — session-hub-reap-purge-fixes (T016251)

> Konsolidiert aus der Explore-Session (2026-08-24) + Prior-Art-Suche Schritt 0.7.
> Zwei Produktentscheidungen fielen im Gespräch: forwardAuth via Pocket-ID und
> Domain-Zentralisierung im Fix-Scope.

## Root Causes (verifiziert, nicht vermutet)

### RC1 — Reap löscht ungetrackte Einträge
- Symptom: `register`-Sessions verschwinden nach dem nächsten `reap`.
- Ursache: `scripts/session-hub.sh` `cmd_register` → `_upsert … "0"` schreibt
  `server_pid=0`; `cmd_reap` prüft ausschließlich `_pid_alive "$spid"`, und
  `_pid_alive()` scheitert an `[ "$1" -gt 0 ]` → "nicht lebendig" → Eintrag fliegt.
- Beleg: RED-Test `tests/spec/sessions-server/reap-untracked.bats` (schlägt auf
  `main`-Stand rot).

### RC2 — Sync/Purge-Umgebungs-Mismatch
- `cmd_*`-Mutationen spiegeln die Registry via `_sync_to_pod` NUR nach
  `k3d-mentolder-dev` / ns `workspace-dev`.
- Der CronJob `sessions-purge` (`k3d/admin-actions-cronjobs.yaml`) ruft dagegen die
  PROD-Website (`ns workspace`) auf, deren Pod die Registry nie erhält → GET immer
  `[]`, Purge No-op, `fetch(local_url)` läuft gegen `localhost` im falschen Pod.
- Schema-Drift: `archive.ts::RegistryEntry` erwartet `participants/owner/
  preferred_username` — Felder, die der Hub nie schreibt; HTML wird als `.md`
  gespeichert.

### RC3 — Prod-Gate fehlt (Dev-Pattern existiert!)
- **Prior-Art:** `k3d/dev-stack/oauth2-proxy-sessions.yaml` implementiert exakt das
  gewünschte Muster: oauth2-proxy im ForwardAuth-Modus (`--upstream=static://202`),
  Middleware `session-hub-auth` (forwardAuth) + `session-hub-errors` (401 → sign_in),
  `/oauth2`-Callback-Route mit höherer Priority, E-Mail-Allowlist per ConfigMap
  (Pocket ID hat keine Gruppen). Es gated aber nur den DEV-Domain-Pfad (sish);
  das prod-fleet-Overlay (`prod-fleet/mentolder/sessions-server.yaml`) hat keine
  Middlewares — deshalb sind die Prod-URLs offen.

### RC4 — Domain-Hardcoding
- `sessions.mentolder.de` steht in nginx-ConfigMap (:32), IngressRoute-HostRegexp,
  Certificate-DNSName, Script-Default (:21) und als `web.mentolder.de`-Fallback
  (:147,:200). Konvention: zentrale Domains in `k3d/configmap-domains.yaml`.

## Fix-Ansätze

1. **Reap:** In `cmd_reap` zusätzlich auf "untracked" prüfen: `server_pid <= 0`
   oder fehlend → Eintrag behalten. Nur positive PIDs laufen durch `_pid_alive`.
2. **Sync parametrisieren:** `_sync_to_pod` iteriert über eine Ziel-Liste
   `(context, namespace)`, Default `k3d-mentolder-dev/workspace-dev` +
   `fleet/workspace`, überschreibbar via `SESSION_HUB_SYNC_TARGETS`
   ("ctx/ns[,ctx/ns…]"). Fail-open bleibt (jeder Ziel-Fehler ist ein Skip).
3. **Website-Schemas angleichen:** Phantom-Felder aus `RegistryEntry` entfernen;
   `owner`-Fallback entfällt (Sichtbarkeitsfilter bleibt admin-seitig trivial
   wahr); Archivdatei bekommt `.html`-Endung, wenn der Fetch HTML lieferte
   (`content-type`-Header), sonst `.md`. Kein HTML→Markdown-Konvertierungsansatz
   (verworfen: neue Abhängigkeit, Nutzen fraglich).
4. **Prod-Gate:** Dev-Muster 1:1 nach `prod-fleet/mentolder/oauth2-proxy-sessions.yaml`
   portieren: Deployment+Service (oauth2-proxy, ForwardAuth), Middlewares,
   IngressRoute-Erweiterung um `/oauth2`-Callback-Route und `middlewares:`-Block.
   Unterschiede zu dev: `websecure`-EntryPoint, https-Redirect-URLs, Cookie secure,
   Issuer-URLs über den internen Pocket-ID-Service, Secrets aus dem Prod-Secret-Bestand
   (`POCKET_ID_SESSION_HUB_SECRET`, `OAUTH2_PROXY_COOKIE_SECRET` — Vorhandensein im
   Implementer-Verifikationsschritt prüfen, SealedSecret-Pattern beachten).
5. **SESSIONS_DOMAIN:** Eintrag `SESSIONS_DOMAIN: "sessions.localhost"` in
   `k3d/configmap-domains.yaml`; nginx-ConfigMap und Script-Default lesen ihn
   (Script: `SESSION_HUB_DOMAIN="${SESSION_HUB_DOMAIN:-${SESSIONS_DOMAIN:-sessions.mentolder.de}}"`,
   nginx über denselben Env-Subst-Mechanismus wie `${DEV_DOMAIN}` im dev-stack — im
   Implementer-Schritt verifizieren, welcher Deploy-Schritt k3d-Manifeste substittiert).
   Prod-Overlay-Literale bleiben als Brand-Pinage erlaubt.

## Verworfene Alternativen

| Verworfen | Grund |
|---|---|
| Reap: pid<=0-Einträge gar nicht erst anlegen (register erzwingt echten PID-Track) | `register` dokumentiert "bereits lauschenden Port" — es gibt schlicht keinen Hub-Prozess zu tracken; Schein-PIDs würden PID-Reuse-Desaster bauen |
| Purge-CronJob auf Dev-Website umbiegen | Prod-Daten wären dann purge-los; das CronJob-Ziel ist korrekt, nur der Producer fehlt |
| Session-Seiten öffentlich lassen, Ticket-IDs streichen | User-Entscheidung 2026-08-24 für forwardAuth; Ticket-ID-Injektion ist nützlich (Form→Ticket-Verknüpfung) |
| Traefik basic-auth / IP-Allowlist statt oauth2-proxy | schwächeres Gate, kein SSO, bricht mit dem etablierten Muster |
| tunnel_pid reaktivieren | niemand liest es; sish-Tunnel-Architektur ist Geschichte |

## Edge-Cases

- `reap` mit leerer Registry / fehlender Registry-Datei → weiterhin Exit 0.
- Sync-Ziel nicht erreichbar (Context fehlt, Pod fehlt) → Skip, kein Abbruch (Bestands-
  verhalten des Dev-Ziels, jetzt für alle Ziele).
- `purgeOldSessions` bei ENOENT → leeres Ergebnis (bleibt).
- oauth2-proxy down → forwardAuth liefert 502 statt stiller Offenheit (fail-closed),
  `session-hub-errors` fängt 401; 502-Seitenszenario im Plan als manueller Check.
- Domain-Fallback-Kette: explizites `SESSION_HUB_DOMAIN` > `SESSIONS_DOMAIN` >
  bisheriger Default — alte Aufrufe bleiben funktionsfähig.

## Betroffene Subsysteme

`scripts/session-hub.sh` · `k3d/sessions-server.yaml` · `k3d/configmap-domains.yaml` ·
`prod-fleet/mentolder/*` (NEU oauth2-proxy-sessions.yaml, MODIFIED sessions-server.yaml)
· `components/website/src/lib/sessions/archive.ts` ·
`components/website/src/pages/api/admin/sessions/index.ts` · Tests unter
`tests/spec/sessions-server/`
