# Mentolder Auth, Tenant-Identität und Isolation

Inventur-Stand: Branch `chore/mentolder-parity-inventory-T901033`,
Basis `origin/main` (10e35fb79). Ticket: T901033.

Alle Befunde sind Audit-/Migrations-Befunde, keine Exploit-Nachweise. Keine
Aussage ohne Quelle; Lücken sind als `kein Test` / `kein Beleg` markiert.

## Tenant-Identität

Mandanten-Identität kommt aus dem Deployment-Environment, nicht aus der
Anfrage. Es gibt keinen zentralen `resolveBrand`-Helper aus URL/Host
(bounded grep über `lib/*.ts` und Middleware fand keinen).

- `components/website/src/pages/api/booking.ts` (Z. 19–20):
  `BRAND = process.env.BRAND || 'mentolder'`,
  `BRAND_NAME = process.env.BRAND_NAME || 'Workspace'`.
- `components/website/src/lib/auth.ts` (Z. 75):
  `BRAND = process.env.BRAND_ID ?? process.env.BRAND ?? null`; die Session
  übernimmt ihn unverändert (`session.brand = BRAND`, Z. 233 und Z. 298).
  Befund: `session.brand` ist Server-Env, keine verifizierte
  Benutzer-zu-Mandant-Zuordnung.
- `components/website/src/lib/owner-guard.ts` (Z. 20–22): `ownerBusiness`
  gibt `session.brand` zurück; Owner-Routen fallen auf
  `process.env.BRAND || 'mentolder'` zurück (Beispiel
  `pages/api/owner/kunden/[id]/korrigieren.ts`, Z. 42–46).
- Schema-Erzwingung (Auswahl, vollständig in der Parity-Matrix):
  `chk_customer_projects_brand` und `chk_cockpit_audit_brand` mit
  `CHECK (brand IN ('mentolder', 'korczewski'))`
  (`components/website/src/db/migrations/20260821_add_missing_fk_indexes_and_brand_checks.sql`,
  Z. 114–131); Erweiterung um `'massage'` für fünf Tabellen in
  `20261008_massage_brand_checks.sql` (T901440). FKs auf
  `public.brands(id)` in Buchungs-, Billing- und Inbox-Tabellen.
- `createInboxItem` hat seit T901022 einen optionalen `brand`-Parameter
  (`components/website/src/lib/messaging-db.ts`, Z. 31–60, Param Z. 44,
  `params.brand ?? null` Z. 57). Der öffentliche Buchungs-POST übergibt ihn
  nicht (booking.ts Z. 202–207); Kommentar Z. 188: Brand-Spalte bleibt NULL.
  Vor-Evidenz-Abgleich (0ff76b4): „kein expliziter Tenant-Parameter" ist
  überholt — der Parameter existiert, der öffentliche POST nutzt ihn aber
  nicht. Befund: Inbox-Zeilen aus dem öffentlichen POST sind mandantenlos
  (NULL), Filter `listInboxItems({ brand })` (messaging-db Z. 83–108)
  greift für sie nicht.
- Tabelle `public.business_memberships(user_key, brand, role)` mit
  `PRIMARY KEY (user_key, brand)` und `CHECK (role IN ('owner','member'))`
  (`components/website/src/db/migrations/20261007_business_memberships.sql`,
  T901022); FK auf `public.brands(id)` wird nur angelegt, wenn die
  Brand-Tabelle existiert.

## Auth und Mitgliedschaften

- OIDC via Pocket ID (Authorization Code Flow):
  `components/website/src/lib/auth.ts` (359 Z.). Cookie `workspace_session`
  (Z. 27), Session-Store `web_sessions` in PostgreSQL (Z. 84–96), TTL 8 h
  (Z. 147), Token-Refresh mit 60-s-Puffer (Z. 278–311).
- Admin-Erkennung `isAdmin` (Z. 251–257): `realmRoles` aus `isAdmin`-Claim
  (Z. 56–63, 231), Fallback `PORTAL_ADMIN_USERNAME` (Default `admin`,
  Z. 247–249). Gruppen aus `groups`-Claim, fail-closed (Z. 65–73, 218–223).
- `issueSession` (Z. 339–347) stellt Sessions ohne OIDC-Code-Flow aus
  (Magic-Link-Redeem, System-Test-Seeds); laut Docstring authentifiziert der
  Helper nicht — der Aufrufer verantwortet die Berechtigung.
- Owner-Guard `components/website/src/lib/owner-guard.ts` (22 Z.):
  `requireOwner` verlangt OIDC-Gruppe `workspace-owners`
  (`OWNER_GROUP`-Env, Z. 7–18), fail-closed. Keine Prüfung gegen
  `business_memberships`.
- Mitgliedschafts-Modell
  `components/website/src/lib/business-memberships.ts` (79 Z., T901022):
  Rollen `owner | member` (Z. 7), `listMembershipsForUser` /
  `listMembershipsForBrand` / `getMembership` / `addMembership` /
  `removeMembership` (Z. 34–79, parametrisiertes DML). Befund: Kein
  Routen-Code ruft `getMembership` auf (bounded grep: nur Re-Export in
  `website-db.ts` Z. 317 und Tests). Das Modell existiert als
  Datenzugriffsschicht, ist aber auf Routenebene nicht enforced.
- Admin-Routen prüfen `getSession` + `isAdmin` → 401
  (Beispiele `pages/api/admin/inbox.ts` Z. 8–11,
  `pages/api/admin/inbox/[id]/action.ts` Z. 18–21).
- URL/Brand-Theme ist keine Autorisierung: Brand-Auflösung erfolgt
  ausschließlich über Env (s. o.); kein Theme-/Host-Signal fließt in
  `isAdmin`, `requireOwner` oder `getMembership` ein (bounded: kein
  Theme-Modul in `lib/*.ts` gefunden).

## Scope: Jobs, Dateien, Cache, Nachrichten, Rechnungen

- Jobs: `assets.generation_jobs` (3D-Pipeline) hat keine Brand-Spalte
  (`components/website/src/db/migrations/20260607_create_generation_jobs.sql`).
  Befund: mandantenlos auf Schema-Ebene (bounded: diese Migration).
- Dateien/Assets: Die Assets-Schema-Migrationen
  (`20260520_create_assets_schema.sql`, `20260521_create_platform_assets.sql`)
  enthalten keine Brand-Spalte. Befund: mandantenlos auf Schema-Ebene
  (bounded: diese Migrationen).
- Cache: `components/website/src/lib/caldav-cache.ts` (128 Z.) ist trotz
  Namens kein Cache-Speicher, sondern CalDAV-Fetch, iCal-Parsing und
  Berlin-Datums-Helfer (Exporte Z. 18–125). Die Coaching-Insights-Cache-
  Tabelle hat keine Brand-Spalte
  (`20260813_coaching_questionnaire_insights_cache.sql`, bounded grep ohne
  Treffer). Kein brand-geschlüsselter In-Memory-Cache in `lib/*.ts`
  gefunden (bounded grep über `new Map`: nur Ergebnis-Maps,
  OIDC-State-Store, keine Mandanten-Caches).
- Nachrichten: `inbox_items.brand` ist nullable (s. o.). Admin-Liste
  `GET /api/admin/inbox.ts` übergibt keinen Brand-Filter
  (`listInboxItems({ status, type, includeTest })`, Z. 20) und
  `countPendingByType()` ist ungefiltert (Z. 21) — Befund: mandantenlose
  Admin-Sicht. Admin-Aktion `getInboxItem(id)` ohne Brand-Prüfung
  (action.ts Z. 27). Gegenbeispiel mit Scope: Owner-Kunden-Routen filtern
  `listInboxItems({ brand, type: 'booking' })` mit Session-Brand
  (korrigieren.ts Z. 46–53, analog zusammenfuehren/loeschen/export).
- Rechnungen: `massage_invoices.brand NOT NULL` mit
  `UNIQUE (brand, invoice_year, invoice_number)` und Brand-Indizes
  (`20261008_invoices.sql`, Z. 19–63); `listInvoices(brand)` filtert nach
  Brand (invoices.ts Z. 412–417). `recordPayment` (invoice-payments.ts
  Z. 30–164) hat keinen Brand-Parameter (Input Z. 17–26) und lädt per
  `SELECT … WHERE id FOR UPDATE` (Z. 38–40); der Brand wird der Zeile
  entnommen (Z. 76). Befund: keine Brand-Gegenprüfung bei der
  Zahlungsbuchung (Audit-Befund, kein Exploit-Nachweis).
- Infrastruktur-Namespace-Evidenz: ADR-003
  (`docs/adr/ADR-003-brand-namespace-split.md`, accepted 2026-05-05,
  T001298) trennt Marken via Kubernetes-Namespaces `workspace`
  (mentolder) und `workspace-korczewski` (korczewski) mit Namespace-RBAC;
  `shared-db` ist explizit Cross-cutting-Ressource. Das ist
  Namespace-Evidenz, kein Beleg für Row-Level-Multi-Tenancy.

## Isolations-Testlücken

- `components/website/src/lib/__tests__/business-memberships.test.ts`:
  `describe('cross-tenant isolation')` — User von Business A sieht keine
  Zeilen von B (gemockte Datenzugriffsschicht, keine Routen-/Request-Ebene).
- `components/website/src/lib/__tests__/owner-guard.test.ts`: Guard-Tests
  vorhanden. `components/website/src/lib/auth.test.ts`: 21 `it`/`test`-Blöcke.
- `components/website/src/lib/messaging-db.test.ts`: vorhanden; kein
  Request-Level-Test, der Admin-Inbox ohne Brand-Filter gegen
  mandantenfremde Zeilen prüft (`kein Test`, bounded grep).
- `components/website/src/lib/assistant/actions/portal/profile-isolation.test.ts`
  prüft Assistant-Aktions-Whitelists (portal vs. admin), keine
  Mandanten-Isolation — darf nicht als Tenant-Beleg zitiert werden.
- Beobachtete Lücken (Befunde, keine Schwachstellen-Nachweise):
  Session-Brand aus Env statt verifizierter Mitgliedschaft; Inbox-Zeilen des
  öffentlichen POST mit Brand NULL; Admin-Inbox ohne Brand-Filter;
  `recordPayment` ohne Brand-Parameter; Jobs/Assets/Cache-Tabellen ohne
  Brand-Spalte; Mitgliedschafts-Modell ohne Routen-Enforcement.
