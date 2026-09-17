# p1 — Implementierung (RC1–RC4)

Frontmatter-Anker: ticket T016251 · Rolle implement · Design-Referenz `../design.md`.

## Task 1 — Reap-Semantik fixen (RC1) — `scripts/session-hub.sh`

- [ ] In `cmd_reap` ungetrackte PIDs behandeln: Einträge mit fehlendem oder
      `<= 0`em `server_pid` gehen unverändert in die Survivors-Liste; nur
      positive PIDs laufen durch `_pid_alive`.
- [ ] Verifikation: `tests/spec/sessions-server/reap-untracked.bats` grün,
      `deregister-reap.bats` bleibt grün.

## Task 2 — Sync-Ziel-Liste (RC2a) — `scripts/session-hub.sh`

- [ ] `_sync_to_pod` iteriert über Ziel-Liste, Default
      `k3d-mentolder-dev/workspace-dev fleet/workspace`, überschreibbar via
      `SESSION_HUB_SYNC_TARGETS` (`ctx/ns[,ctx/ns…]`). Pro Ziel gilt das
      bestehende Fail-open-Muster. Aufrufer (`_write`) bleiben unverändert.
- [ ] Header-Kommentar des Scripts um die neuen Subcommands/Env-Vars ergänzen
      (`regen`, `SESSION_HUB_SYNC_TARGETS`).

## Task 3 — Domain-Zentralisierung (RC4) — k3d-Manifeste + Script

- [ ] `SESSIONS_DOMAIN` in `k3d/configmap-domains.yaml` aufnehmen (Dev-Default
      analog zu den Nachbar-Domains).
- [ ] nginx-`server_name`-Regex in `k3d/sessions-server.yaml` über
      `${SESSIONS_DOMAIN}` substituieren — denselben Env-Subst-Mechanismus wie
      `${DEV_DOMAIN}` in `k3d/dev-stack/oauth2-proxy-sessions.yaml`; den
      substittierenden Deploy-/Render-Schritt verifizieren und im PR nennen.
- [ ] Script-Fallback-Kette:
      `SESSION_HUB_DOMAIN="${SESSION_HUB_DOMAIN:-${SESSIONS_DOMAIN:-sessions.mentolder.de}}"`;
      `api_url`-Fallback in `cmd_start_form`/`cmd_regen` aus `WEB_DOMAIN`
      ableiten statt hart `web.mentolder.de`.
- [ ] Nit: `/health`-Location Content-Type via `default_type text/plain` statt
      `add_header` (Doppel-Header vermeiden).

## Task 4 — Prod-ForwardAuth (RC3) — `prod-fleet/mentolder/`

- [ ] `prod-fleet/mentolder/oauth2-proxy-sessions.yaml` NEU als Port des
      Dev-Musters (`k3d/dev-stack/oauth2-proxy-sessions.yaml`): Deployment +
      Service, Allowed-Emails-ConfigMap, Middlewares (`session-hub-auth`,
      `session-hub-errors`). Anpassungen: ns `workspace`, EntryPoint `websecure`,
      https-Redirect/Whitelist-Domains, Cookie secure, interne Pocket-ID-URLs,
      Secrets via SealedSecret-Pattern (`POCKET_ID_SESSION_HUB_SECRET`,
      `OAUTH2_PROXY_COOKIE_SECRET` — Vorhandensein im Prod-Secret-Bestand prüfen;
      fehlt eins, SealedSecret-Anlage als eigenen Schritt dokumentieren).
      Non-root/readOnlyRootFilesystem (SA-GR-06) beibehalten.
- [ ] `prod-fleet/mentolder/sessions-server.yaml`: `/oauth2`-Callback-Route mit
      höherer Priority + `middlewares:` am HostRegexp-Route; neue Manifest in
      `prod-fleet/mentolder/kustomization.yaml` registrieren.
- [ ] Verifikation: `task workspace:validate` und prod-overlay-Dry-Run.

## Task 5 — Website-Schema-Angleichung (RC2b) — `components/website/src/**`

- [ ] `archive.ts`: Phantom-Felder (`participants`, `owner`,
      `preferred_username`) aus `RegistryEntry` entfernen; Archivdatei-Endung
      vom Fetch-Content-Type ableiten (`text/html` → `.html`, sonst `.md`),
      Meta-Feld entsprechend mitschreiben; Sichtbarkeitsfilter vereinfachen.
- [ ] `api/admin/sessions/index.ts`: `SessionEntry` an real geschriebene Felder
      angleichen.
- [ ] Vitest der betroffenen Pfade aktualisieren
      (`pnpm test:unit --prefix components/website`).
