# Spec: Lernpfad-Tracking, geführtes Onboarding, Admin-Fortschrittssicht & persistenter Brainstorm-Companion

**Ticket:** _(wird von dev-flow-plan gesetzt)_
**Branch:** `feature/learning-path-tracking`
**Datum:** 2026-06-01
**Status:** design-approved
**Verwandte Tickets:** T000364 (no prod brainstorm broker), T000389/#1272 (dev-stack collab), T000304 (ensureSchemaOnce/schema-init race)

---

## 1. Vision & Goal

**`/goal`:** Das Knowledge-Tracking funktioniert, sodass Gekko loslernen kann.

Konkret:

1. **gekko wird zu seinem Sidekick geführt und passend geonboardet** — beim ersten Login öffnet sich der Sidekick, eine mehrstufige geführte Sequenz leitet ihn in seine **Agent-Anleitung**, die sein **Lernpfad** ist.
2. **Fortschritts-Mechanismus** — gekko arbeitet Goals/Tools der Agent-Anleitung ab (Status `todo → läuft → erledigt`) und schreibt je Thema eine „Das habe ich gelernt"-Notiz. Diese Notizen + Status **sind** sein getrackter Wissensfortschritt.
3. **Admins sehen den Fortschritt** — andere Admins können den Lernfortschritt **aller** User (Members *und* Admins) einsehen.
4. **Gemeinsames Brainstorming** — gekko und der Owner können **gleichzeitig** an einer dev-flow-Brainstorm-Session teilnehmen, persistent (cluster-hosted), nicht an den Laptop des Owners gebunden.

**Brands:** beide (mentolder + korczewski), brand-aware. gekko testet auf mentolder.

## 2. Scope-Entscheidungen (vom Owner bestätigt)

| Dimension | Entscheidung |
|---|---|
| Lernmodell | **Agent-Anleitung als Lernpfad** — Fortschritt = abgearbeitete Goals/Tools + Notiz pro Item |
| Lern-Surface | **Beides** — Inline-Tracking in der Anleitung **und** ein `/portal/loslernen`-Dashboard |
| Admin-Sicht | **Lernfortschritt für Members *und* Admins** (`/admin/members[/id]`) |
| Collab | **Hybrid, persistent/cluster-hosted** — Cluster-Relay als Source-of-Truth, lokales Board des Agents als Client |
| Brands | **Beide**, brand-aware |
| Struktur | **Eine kombinierte Spec + ein gestaffelter Plan** (M1–M5), gestaffeltes Deployment |
| Lernnotizen | **Getrennt** von `client_notes` (Notiz pro Lern-Item in `learning_progress.note`) |
| „Member"-Definition | **Alle Keycloak-Realm-User** des jeweiligen Brands |

## 3. Architektur-Überblick

Fünf Milestones über zwei Domänen. **Wichtig — verifizierte Namespaces:** Website-Pods laufen in `website` (mentolder) bzw. `website-korczewski` (korczewski), **nicht** in `workspace`. Der Brainstorm-Relay (M5) ist ein neuer Service in `workspace` / `workspace-korczewski` (bei Keycloak + den anderen SSO-Diensten).

```
M1 Datenmodell (db, website-schema.yaml ConfigMap)
   learning_progress + onboarding_state + brainstorm_sessions/_events
        │ teilen EINE Datenquelle
   ┌────┴───────────┬──────────────────┬─────────────────────┐
M2 Lern-Surface  M3 Onboarding     M4 Admin-Sicht        M5 Persistenter Collab
(website ns)     (website ns)      (website ns)          (workspace[-korczewski] ns + security)
inline+Dashboard geführter Sidekick /admin/members[/id]   per-brand Relay + Bridge + SSO
```

Alle Website-Milestones teilen `learning_progress` als einzige Wahrheit: „der Lernpfad" = die Anleitung, „der Fortschritt" = Status-Zeilen, „die Notizen" = das `note`-Feld, „die Admin-Sicht" = dieselben Zeilen aggregiert pro User.

---

## 4. M1 — Datenmodell (db)

**Placement-Entscheidung (verifiziert):** `learning_progress` + `onboarding_state` werden in `k3d/website-schema.yaml` deklariert — in **beiden** Skript-Abschnitten `init-meetings-schema.sh` (frische DB) **und** `ensure-meetings-schema.sh` (postStart bei jedem Start), exakt nach dem Muster der `meetings`/`coaching.*`-Tabellen. **Nicht** Lazy-Init in der Lib.

> **Warum nicht Lazy-Init?** `client_notes`/`onboarding_items` rufen ihre `CREATE TABLE`-Inits direkt auf (`website-db.ts:2263/2330`) und **umgehen** `ensureSchemaOnce` → unter Last drohen `tuple concurrently updated`-Races (dokumentiert: T000304, `website-db.ts:34-40`). Da der Admin-Aggregat (M4) `learning_progress` **cross-user** liest, muss die Tabelle unabhängig vom ersten User-Write garantiert existieren. ConfigMap-Schema sidesteppt den Race komplett und ist versionierbar.

```sql
-- in k3d/website-schema.yaml (init- UND ensure-meetings-schema.sh), DB: website
CREATE TABLE IF NOT EXISTS learning_progress (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keycloak_user_id TEXT NOT NULL,
  brand            TEXT NOT NULL DEFAULT 'mentolder'
                     REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  item_type        TEXT NOT NULL CHECK (item_type IN ('goal','tool')),
  item_id          TEXT NOT NULL,                 -- = id aus agent-guide.generated.json
  status           TEXT NOT NULL DEFAULT 'todo'
                     CHECK (status IN ('todo','in_progress','done')),
  note             TEXT,                            -- "Das habe ich gelernt"
  started_at       TIMESTAMPTZ,
  completed_at     TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (keycloak_user_id, brand, item_type, item_id)   -- brand IM Key (Gap db-migration)
);
CREATE INDEX IF NOT EXISTS idx_learning_progress_admin_agg
  ON learning_progress (brand, keycloak_user_id);          -- Admin-Aggregat (M4)
CREATE INDEX IF NOT EXISTS idx_learning_progress_updated
  ON learning_progress (updated_at DESC);                  -- "letzte Aktivität"

CREATE TABLE IF NOT EXISTS onboarding_state (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  keycloak_user_id TEXT NOT NULL,
  brand            TEXT NOT NULL DEFAULT 'mentolder'
                     REFERENCES public.brands(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  step_id          TEXT NOT NULL,
  completed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (keycloak_user_id, brand, step_id)
);
```

> `onboarding_state` ist **neu und getrennt** von der bestehenden admin-gepflegten `onboarding_items`-Checkliste (`website-db.ts:2316`). Verschiedene Tabellen, verschiedene Zwecke (geführter Tour-State vs. CRM-Checkliste). Keine Migration der Altdaten.

**DB-Layer:** neue `website/src/lib/learning-db.ts` — **nur DML**, keine DDL:
- `getLearningProgress(keycloakUserId, brand)` → Item-Zeilen
- `upsertLearningItem(keycloakUserId, brand, itemType, itemId, {status, note})` — setzt `started_at`/`completed_at`/`updated_at` server-seitig
- `getLearningSummary(keycloakUserId, brand)` → `{done, in_progress, total, pct, lastActivity}` (gegen aktuelle Guide-IDs gerechnet)
- `listMembersLearningSummary(brand, {offset, limit})` → **DB-seitig aggregiert** (`SUM(CASE status)`, `MAX(updated_at)`), paginiert
- `markOnboardingStep(keycloakUserId, brand, stepId)` / `getOnboardingState(keycloakUserId, brand)` / `resetOnboarding(keycloakUserId, brand)`

Die Lib liest die kanonische Guide-Item-Liste aus `agent-guide.generated.json` (verifiziert: stabile String-`id` pro Goal/Tool, `agent-guide.generated.json:142-691`), um `total` und Orphan-Filter zu bestimmen.

## 5. M2 — Lern-Surface: inline **und** Dashboard (website)

**Inline in der Agent-Anleitung** (`AgentGuideView.svelte` / `GuideCard.svelte`):
- Pro Goal/Tool: Status-Toggle (`todo → läuft → erledigt`) + aufklappbares „Das habe ich gelernt"-Notizfeld.
- Fortschrittsbalken im `SidekickHome` + Anleitung-Header (Gesamt-% aus `getLearningSummary`).
- Persistenz via `POST /api/portal/learning/track`.

**`/portal/loslernen.astro`** (neu, `website/src/pages/portal/`):
- Items nach Thema/Stage gruppiert mit Status; Fortschritt pro Thema; „zuletzt gelernt"-Notizen; „weiter lernen"-CTA, das das nächste offene Item in der Anleitung öffnet.
- Auf `PortalLayout` (Sidekick verfügbar). Verlinkt aus `SidekickHome`.

**Self-Service-Notizen:** Lernnotizen leben in `learning_progress.note`. **Kein** Eingriff in das admin-only `client_notes` (verifiziert: `createClientNote` ungated in der Lib, Admin-Gate liegt im API-Layer `api/admin/clientnotes/create.ts`). Lernnotizen sind user-erzeugt und über die self-only Track-API geschützt.

**API (`website/src/pages/api/portal/learning/`):**
- `track.ts` (POST): **self-only** — `keycloak_user_id` wird **server-seitig aus `session.sub`** abgeleitet, **niemals** aus dem Request-Body (Gap website-ux-auth). `brand` aus `session.brand`. Validiert Item gegen die Guide-IDs.
- `summary.ts` (GET): eigener Fortschritt (self-only).

## 6. M3 — Geführtes Onboarding zum Sidekick (website)

- Erweiterung des bestehenden Assistant-Trigger-/Nudge-Systems (`lib/assistant/triggers/portal.ts`, `AssistantWidget.svelte`, `assistant_first_seen`).
- **Erst-Login-Sequenz** (mehrstufig, statt des einen Willkommens-Nudges):
  1. Sidekick **auto-öffnen** (`PortalSidekick.openDrawer`) → „Das ist dein Sidekick."
  2. „Hier ist deine Agent-Anleitung — dein Lernpfad." (öffnet `agent-guide`-View)
  3. Einstieg in `/portal/loslernen` / erstes `todo`-Item.
- Schritt-Status in `onboarding_state` (brand-aware, `UNIQUE(keycloak_user_id, brand, step_id)`); jederzeit abbrechbar/snoozebar/fortsetzbar; „Onboarding neu starten" im Sidekick.
- **Brand-aware:** der Onboarding-Trigger liest `brand` aus `session.brand`, nicht aus Env — verhindert Cross-Brand-Step-Kollision (Gap website-ux-auth).

## 7. M4 — Admin-Fortschrittssicht (website)

- **`/admin/members.astro`** (neu): Tabelle aller Realm-User (Members *und* Admins) des **eigenen Brands** des Admins: Name, Rolle (admin/member via `ADMIN_USERNAMES`/`customers.is_admin`), Lern-%, erledigt/gesamt, letzte Aktivität, Onboarding-Status.
- **`/admin/members/[userId].astro`** (neu): Item-für-Item-Fortschritt, „Das habe ich gelernt"-Notizen, Completion-Timeline, Onboarding-State.
- **API:** `GET /api/admin/members/list` + `/[userId]`, beide `isAdmin()`-gated (verifiziert: `auth.ts:196-202`, Pattern `api/admin/*`).

**Performance & Limits (Gap website-ux-auth — kritisch):**
- `keycloak.listUsers()` ist auf **max=200** hart limitiert (`keycloak.ts:130`) und wird heute schon ungecacht aufgerufen (`clients.astro:16`). Daher:
  - **Cursor-Pagination** auf `/api/admin/members?offset&limit` (Keycloak `first`/`max` durchreichen), Response-Metadaten `{totalCount, hasMore}`.
  - **DB-seitige Aggregation** in `listMembersLearningSummary` (kein In-Memory-Join über alle User).
  - Optionaler 5-min-Cache für `listUsers` mit manuellem Cache-Bust.
- **Brand-Filter:** `listMembersLearningSummary(brand)` filtert auf den Brand des Admins; ein mentolder-Admin sieht keine korczewski-User (separater Brand, separate Website-DB).

## 8. M5 — Persistenter Cluster-Companion (infra + security)

> **Greenfield für Prod** (verifiziert): `Taskfile.brainstorm.yml:12` — „There is no brainstorm broker on the prod clusters (T000364)". `#1272`/T000389 war dev-stack-PoC (sish-Tunnel, localhost). `/brainstorm-access` existiert nur im **dev**-Realm. M5 baut den Prod-Relay neu. **Schwerstes Milestone, als letztes sequenziert.**

**Topologie-Entscheidung (Gap infra-relay/security-dsgvo): per-Brand, kein Cluster-Singleton.** Jeder Brand hat eigene Keycloak-Instanz (eigener Namespace, Realm-Name `workspace`) + eigene Sealed-Secrets. Cross-Brand-Token-Forgery wird durch getrennte OIDC-Clients/Secrets ausgeschlossen.

**Komponenten (je Brand, in `workspace` / `workspace-korczewski`):**
- **`brainstorm-relay` Deployment** — neuer minimaler Node-WS-Service (Code-Basis: Relay-/Presence-/Note-Logik aus `scripts/superpowers-collab/helper-collab.js` + `superpowers-collab-patch.sh`, als eigenständiger Container neu verpackt, vgl. `brett/`). Zwei logische Kanäle:
  - **Browser-Kanal** (`brainstorm.<domain>`, oauth2-proxy + Keycloak-OIDC, Gruppe `/brainstorm-access`) — für gekko/Owner-Browser.
  - **Agent-Kanal** (separater Ingress-Host/Pfad, **bridge-token**-authentifiziert, NICHT oauth2-proxy) — für die lokale Bridge.
  - Broadcastet presence/chat/note/reload/screen an alle Clients derselben `session_id`.
- **Persistenz: DB statt PVC** (Gap infra-relay: read-only-rootfs/PVC-Fallstricke vermeiden, Backup/Retention/Abfrage einfacher) — neue Tabellen im `website`-DB des Brands:
  ```sql
  CREATE TABLE IF NOT EXISTS brainstorm_sessions (
    id uuid pk default gen_random_uuid(), brand text fk brands, session_id text,
    created_at, expires_at, archived_at, deleted_at);
  CREATE TABLE IF NOT EXISTS brainstorm_events (
    id uuid pk, session_id text fk, event_type text CHECK (chat|note|presence|screen),
    who text, content text, created_at, purged_at);
  ```
- **oauth2-proxy-brainstorm** je Brand (in `prod-fleet/mentolder/` bzw. `prod-fleet/korczewski/`), eigener OIDC-Client (`brainstorm`), `--allowed-group=/brainstorm-access`. WS-Upgrade-Passthrough verifizieren; Fallback full-proxy (`--upstream=http://brainstorm-relay:80`).
- **NetworkPolicy** (Gap infra-relay — sonst CrashLoop/silent fail): egress zu kube-dns (53), zu shared-db (5432), ingress von Traefik. **Absolute** Namespace-Namen in prod-fleet (kein `${WEBSITE_NAMESPACE}`-envsubst, das nur in k3d greift).

**Lokale Bridge** (`task brainstorm:link`, neu in `Taskfile.brainstorm.yml`): der dev-flow-Agent fährt den superpowers-Companion lokal **plus** eine Bridge, die das lokale Board mit dem Cluster-Relay verbindet (Screens/Choices ↑, Notes/Chat ↓).
- **Auth (Gap infra-relay):** Bridge authentifiziert sich am **Agent-Kanal** per gesealtem `BRAINSTORM_BRIDGE_TOKEN` (per Brand). Der Browser-Kanal bleibt OIDC-gated. Beide Kanäle terminieren am selben Session-Store des Relays.

**Keycloak/Security (Gap security-dsgvo):**
- gekko-User + `/brainstorm-access`-Gruppe + `brainstorm`-OIDC-Client in **beide** Realm-JSONs (`prod-mentolder/realm-workspace-mentolder.json`, `prod-korczewski/realm-workspace-korczewski.json`) — ohne Drift, beide explizit.
- **Per-Brand OIDC-Secrets:** `BRAINSTORM_OIDC_SECRET` + `BRAINSTORM_BRIDGE_TOKEN` getrennt je Brand in `environments/schema.yaml` (prod-required), getrennt gesealt (`task env:seal ENV=mentolder` **und** `ENV=korczewski`). Kein gemeinsames Secret.
- **Domains:** `brainstorm.mentolder.de` / `brainstorm.korczewski.de` in `prod`-`configmap-domains.yaml` + `environments/schema.yaml` + den per-Task-`envsubst`-Listen in `Taskfile.yml` registrieren (envsubst-Checklist).

## 9. Querschnitt — Brand-Isolation, DSGVO, Sicherheit

- **Brand-Isolation:** Jeder Brand hat eigene Website-DB (eigene `shared-db` im jeweiligen Namespace) + eigene Keycloak-Instanz. `learning_progress.brand` aus `session.brand`; Admin-Sicht brand-gefiltert.
- **DSGVO — Lernnotizen (Gap security-dsgvo, kritisch da DSGVO-by-design-Plattform):**
  - **Rechtsgrundlage** dokumentieren: Admin-Einsicht in Lernfortschritt/Notizen ist für die Coaching-/Betriebsrolle erforderlich (Art. 6(1)(b)/(f)).
  - **Transparenz:** sichtbarer Hinweis in der Lern-UI: „Dein Lernfortschritt und deine Notizen sind für Admins sichtbar."
  - **Opt-out (Stretch):** `learning_progress.hidden_from_admins BOOLEAN DEFAULT false` — user-kontrolliert; Admin-Sicht respektiert es.
  - **Retention:** Lernnotizen unbefristet (aktiver Lernstand), aber löschbar (Art. 17) über die Self-Service-UI.
- **DSGVO — Brainstorm-Persistenz:** `expires_at` default **90 Tage**; tägliche Purge-CronJob (`DELETE … WHERE expires_at < now() - 90d AND archived_at IS NULL`); User-Erasure/Export auf Anfrage.

## 10. Fehlerbehandlung / Edge-Cases

- **Orphan-Items:** Goals/Tools, die nach Anleitung-Regenerierung (`task agent-guide:maps`) wegfallen → Zeilen bleiben, werden in UI/Summary gegen die **aktuellen** Guide-IDs ignoriert.
- **Track-API:** strikt self-only (`session.sub`); ungültige/unbekannte `item_id` → 400.
- **Admin-Aggregat:** >200 User → paginiert (kein stilles Abschneiden); fehlende `learning_progress`-Zeilen → 0%/„noch nicht gestartet".
- **Relay down:** lokales Board arbeitet solo weiter (graceful degrade); Bridge-Reconnect mit Backoff.
- **SSO:** Nicht-`/brainstorm-access` → 403.
- **Bridge-Token fehlt/falsch:** Agent-Kanal weist ab (kein stiller Bypass).

## 11. Tests

- **BATS:** `learning_progress`/`onboarding_state`-Schema (Spalten, Constraints, Indizes; Muster `factory-db-schema.bats`).
- **Unit:** `learning-db` (upsert-Idempotenz, Summary-Aggregat, Orphan-Filter, brand-Isolation).
- **Relay offline-testbar (Gap testing-scope):** `brainstorm-relay`-Logik als eigenständiger Node-Service mit `relay-test.mjs`-Pattern (zwei Clients, Broadcast, DB-Persistenz, Reconnect) — **ohne Cluster** lauffähig; `task brainstorm:relay-test`.
- **Playwright (FA-/AK-IDs, beide Brands):** gekko-Onboarding (Erst-Login→Sidekick→Anleitung), Item erledigen+Notiz→persistiert, `/portal/loslernen` zeigt Fortschritt, `/admin/members` zeigt gekkos Fortschritt. Prod-Safety beachten.
- **test-inventory (CI-Gate, Gap testing-scope):** `website/src/data/test-inventory.json` via `task test:inventory` regenerieren und mitcommitten.

## 12. Deployment & Rollback (gestaffelt)

- **M1–M4 (website + db):** `learning_progress`/`onboarding_state` in `website-schema.yaml` → shared-db postStart (beide Brands); Website-Image-Rebuild + Rollout via `build-website*.yml` (auto auf `website/**`-Push), Overlays `prod-fleet/website-<brand>`.
- **M5 (infra + security):** neue Manifeste (`brainstorm-relay` Deployment, brainstorm-Tabellen, Ingress, oauth2-proxy, NetworkPolicy, Purge-CronJob) in `prod-fleet/mentolder/` + `prod-fleet/korczewski/`; Sealed Secrets per Brand; gekko-Realm-Änderung + reseal beider Brands.
- **Reihenfolge (Gap testing-scope, Combined-PR-Risiko):** **M1–M4 zuerst deployen, ~24h beobachten, dann M5.** „One Plan One Dream" bleibt: ein Plan/Branch — aber der Executor **darf** M5 als Folge-PR landen, falls der Diff sonst unhandhabbar wird. Rollback: M5 → Relay-Ingress + oauth2-proxy entfernen; M1–M4 → vorheriges Website-Image zurückrollen.

## 13. Out of Scope

- Vollautomatischer Lern-Empfehlungs-Algorithmus (nur „nächstes offenes Item").
- Cross-Realm-Keycloak-Federation (per-Brand bleibt isoliert).
- Cursor-Sharing/Live-Pointer im Brainstorm (Notes/Chat/Presence genügen).
- Migration der Alt-`onboarding_items`-Checkliste in `onboarding_state`.
- Gamification/Badges über den Fortschrittsbalken hinaus.

## 14. Anhang — Verifizierte Annahmen & Korrekturen

Aus dem adversarischen Verifikations-Workflow (10 Agenten, 2026-06-01). Bestätigt: `pg.Pool`+`ensureSchemaOnce` (`website-db.ts:42`), username-basiertes `isAdmin` (`auth.ts:196-202`), `UserSession{sub,preferred_username,brand}`, stabile Guide-IDs (`agent-guide.generated.json:142-691`), `gen_random_uuid()` (pg16 core), brand-FK-Konvention (`website-schema.yaml`), website-egress-default-deny (`website.yaml:470-552`).

**Eingearbeitete Korrekturen:**
1. Website-NS = `website`/`website-korczewski`, **nicht** `workspace` (`environments/*.yaml:22`).
2. Website-Overlay = `prod-fleet/website-<brand>`; Relay-Overlay = `prod-fleet/<brand>` (workspace-NS).
3. `learning_progress` → ConfigMap-Schema (`init`/`ensure-meetings-schema.sh`), **nicht** Lazy-Init (Race T000304).
4. `client_notes`/`onboarding_items` umgehen `ensureSchemaOnce` → Antipattern **nicht** kopieren.
5. `keycloak.listUsers()` cappt bei **200** → Pagination + DB-Aggregat + Cache (M4).
6. M5 ist Prod-Greenfield (T000364), per-Brand-Topologie, Bridge-Token-Auth, NetworkPolicy, per-Brand-OIDC-Secrets, DSGVO-Retention.
7. `brand` im `UNIQUE`-Key + Admin-Aggregat-Index.

## 15. Offene Risiken / Entscheidungen für den Plan

- **R1 (mittel):** Kombinierter PR-Umfang (website+db+infra+security). Mitigation: gestaffeltes Deploy (§12), M5 ggf. Folge-PR.
- **R2 (mittel):** Bridge↔Relay-Auth über externen Token — Token-Verteilung an die Owner-Maschine (env, nicht eingecheckt).
- **R3 (niedrig):** Aktive Pläne `content-hub-help-de` + `agent-guide-e2e-filmable` berühren Sidekick/Agent-Anleitung → bei Rebase auf Datei-Kollisionen achten (`AgentGuideView.svelte`).
- **R4 (niedrig):** `hidden_from_admins`-Opt-out als Stretch — falls gestrichen, Transparenz-Hinweis genügt für DSGVO-Minimum.
