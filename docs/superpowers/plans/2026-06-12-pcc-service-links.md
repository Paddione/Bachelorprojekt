---
title: Platform Control Center: Service-Links + vollständige Health-Abdeckung — Implementation Plan
ticket_id: T000665
domains: [website, infra, db, ops, test, security]
status: active
pr_number: null
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Platform Control Center: Service-Links + vollständige Health-Abdeckung — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mache `platform.software_assets` zur einzigen Quelle für Service-Verknüpfung — jedes Asset kennt seine öffentliche Subdomain und seine interne Health-Probe-URL; das Software-Tab verlinkt jeden Dienst, der Health-Tab probt datengetrieben alle probebaren Dienste (brand-aware, ohne Code-Änderung bei neuen Diensten).

**Architecture:** Eine additive SQL-Migration ergänzt zwei Spalten (`subdomain`, `health_url`) und seedet sie pro Slug. Ein neues **pures** Helper-Modul `website/src/lib/platform-links.ts` löst serverseitig die effektive Service-URL (Override `url` vor `https://<subdomain>.<brand-domain>`) und die brand-spezifische Health-URL (`{ns}`-Template + korczewski-Namespace-Mapping) auf. Die GET-Route `/api/admin/platform/software` reichert jedes Asset um ein berechnetes `serviceUrl`-Feld an; `health.ts` ersetzt seine statische `SERVICES`-Map durch eine datengetriebene Liste aus `listSoftwareAssets()`. Die Svelte-Komponenten rendern Link bzw. längere Health-Liste.

**Tech Stack:** Astro 6 (Node-Adapter) API-Routes (TypeScript), Svelte 5, PostgreSQL 16 (`platform`-Schema, `pg`), Vitest 4 (Unit), Playwright (E2E), Kustomize/k3d-Deploy.

---

## Verifizierte Fakten (Grundlage des Plans — nicht erneut raten)

Diese Werte wurden aus dem Repo verifiziert. Die ausführende Agentin verlässt sich auf sie:

- **Brand-Domain-Env-Var:** `process.env.PROD_DOMAIN`. Muster aus `website/src/lib/email.ts:86`: `PROD_DOMAIN ? \`https://web.${PROD_DOMAIN}/\` : ''`. In dev ist `PROD_DOMAIN=localhost` (aus `k3d/configmap-domains.yaml:19` / `environments/dev.yaml`), sodass Links in dev korrekt auf `https://<sub>.localhost` zeigen.
- **Brand-Erkennung (Cluster-Key):** `(process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase()` — exakt wie in `website/src/pages/api/admin/ops/health.ts:51`.
- **Korczewski-Namespace-Mapping (für Health-URLs):** `workspace` → `workspace-korczewski`, `website` → `website-korczewski`. **Ausnahme:** `workspace-office` bleibt unverändert (Collabora wird zwischen beiden Brands geteilt — siehe `health.ts:18,25`). Alle anderen Namespaces (`kube-system`, `sealed-secrets`, `cert-manager`) bleiben unverändert.
- **Verifizierte Subdomains** (aus `k3d/ingress.yaml` + `k3d/configmap-domains.yaml` + `prod/configmap-domains.yaml`):
  | Slug | Subdomain | Quelle |
  |------|-----------|--------|
  | `keycloak` | `auth` | `auth.localhost` / `KC_DOMAIN=auth.${PROD_DOMAIN}` |
  | `nextcloud` | `files` | `files.localhost` / `NC_DOMAIN=files.${PROD_DOMAIN}` |
  | `collabora` | `office` | `COLLABORA_DOMAIN=office.${PROD_DOMAIN}` |
  | `vaultwarden` | `vault` | `vault.localhost` / `VAULT_DOMAIN` |
  | `whiteboard` | `board` | `board.localhost` / `WHITEBOARD_DOMAIN` |
  | `mailpit` | `mail` | `MAIL_DOMAIN=mail.${PROD_DOMAIN}` |
  | `docs` | `docs` | `docs.localhost` / `DOCS_DOMAIN` |
  | `brett` | `brett` | `brett.localhost` / `BRETT_DOMAIN` |
  | `brainstorm` | `brainstorm` | `BRAINSTORM_DOMAIN=brainstorm.localhost` |
  | `livekit` | `livekit` | `LIVEKIT_DOMAIN=livekit.${PROD_DOMAIN}` |
  | `website` | `web` | `WEB_DOMAIN=web.${PROD_DOMAIN}` |
  | `traefik` | `traefik` | `TRAEFIK_DOMAIN=traefik.${PROD_DOMAIN}` (Dashboard, dev-only — siehe Hinweis) |
  | `docuseal` | `sign` | nur Doku-Referenz `sign.localhost` (kein eigener Ingress; best-effort) |
  - **Kein `subdomain`** (NULL — kein öffentlicher Endpoint) für: `postgresql`, `sealed-secrets`, `cert-manager`, `k3s`, `wireguard`, `tei`, `openclaw`, `whisper`, `talk-transcriber`, `nextcloud-talk-hpb`, `mcp`, `livekit-ingress`, `livekit-egress`, `arena`, `arena-server`. (`arena`/`arena-server` haben einen eigenen korczewski-Host, aber er ist nicht über die zentrale `configmap-domains.yaml` registriert → bewusst NULL gelassen, Admin kann `url` manuell setzen.)
  - **`traefik`:** Dashboard ist in prod **nicht** öffentlich exponiert (nur `traefik-dashboard-dev.yaml`); trotzdem `subdomain='traefik'` setzen ist harmlos (Link existiert, 404 in prod ist akzeptabel — Admin kann via `url` überschreiben). Wenn die Agentin das vermeiden will: NULL lassen. **Entscheidung für diesen Plan: `traefik` → NULL** (kein verlässlicher öffentlicher Endpoint).
- **Health-Probe-URLs (`health_url`, mit `{ns}`-Platzhalter):** Die 5 bestehenden aus `health.ts` 1:1 übernehmen (mit `{ns}` statt `workspace`):
  | Slug | health_url |
  |------|------------|
  | `keycloak` | `http://keycloak.{ns}.svc.cluster.local:8080/health/ready` |
  | `nextcloud` | `http://nextcloud.{ns}.svc.cluster.local/status.php` |
  | `collabora` | `http://collabora.workspace-office.svc.cluster.local:9980/hosting/capabilities` |
  | `vaultwarden` | `http://vaultwarden.{ns}.svc.cluster.local/alive` |
  | `website` | `http://website.{ns}.svc.cluster.local` |
  - **Zusätzlich** (Root-Pfad `/`, jeder Statuscode < 500 = ok — bestehende `checkUrl`-Semantik), nur für HTTP-Dienste mit bekanntem Service-Namen:
  | Slug | health_url |
  |------|------------|
  | `brett` | `http://brett.{ns}.svc.cluster.local` |
  | `docs` | `http://docs.{ns}.svc.cluster.local` |
  | `mailpit` | `http://mailpit.{ns}.svc.cluster.local:8025` |
  | `whiteboard` | `http://whiteboard.{ns}.svc.cluster.local` |
  | `docuseal` | `http://docuseal.{ns}.svc.cluster.local:3000` |
  | `brainstorm` | `http://brainstorm-sish.{ns}.svc.cluster.local` |
  - **`collabora.workspace-office`** enthält **keinen** `{ns}`-Platzhalter und bleibt daher in beiden Brands identisch (korrekt — geteilter Office-Namespace).
  - **NULL `health_url`** (nicht probebar): `postgresql`, `traefik`, `sealed-secrets`, `cert-manager`, `k3s`, `wireguard`, `tei`, `openclaw`, `whisper`, `talk-transcriber`, `nextcloud-talk-hpb`, `mcp`, `livekit`, `livekit-ingress`, `livekit-egress`, `arena`, `arena-server`. (Nicht-HTTP oder kein stabiler HTTP-Health-Pfad; konsistent mit „bleibt NULL" aus der Spec.)
- **Bestehende Test-Dateien zum Erweitern (NICHT neu anlegen, außer dem reinen Helper-Test):**
  - Unit: `website/src/lib/platform-db.ensure.test.ts` (pg-mem) — bleibt für Migrations-/Seed-Smoke, wird **nicht** für die puren Helper missbraucht.
  - **Neu** (reiner Unit-Test, da Helper pur & DB-frei): `website/src/lib/platform-links.test.ts` — gerechtfertigt, weil es kein bestehendes Pendant für `platform-links.ts` gibt.
  - E2E SoftwareTab: `tests/e2e/specs/fa-42-platform-assets.spec.ts` (läuft im Playwright-Projekt **`mentolder`**).
  - E2E Health: `tests/e2e/specs/fa-44-platform-health-integrity.spec.ts` (läuft im Projekt **`website`**).
- **Verifikationskommandos** (aus `website/package.json`): Unit = `pnpm --filter mentolder-website test:unit` (Skript `test:unit` = `vitest run`; Paketname laut `package.json` ist `mentolder-website`). Astro Typecheck = `pnpm --filter mentolder-website exec astro check`. Vor Push: `task test:all` (im Repo-Root). Test-Inventar: `task test:inventory` regenerieren + `website/src/data/test-inventory.json` mitcommitten (CI-Gate).

---

## File Structure

| Datei | Verantwortung | Aktion |
|-------|---------------|--------|
| `website/src/db/migrations/20260612_add_service_links.sql` | Additive Spalten `subdomain`, `health_url` + idempotente Seed-`UPDATE`s pro Slug | **Create** |
| `website/src/lib/platform-links.ts` | Pure Helper `resolveServiceUrl`, `resolveHealthUrl` (+ `mapNamespaceForBrand`) — keine DB, keine I/O | **Create** |
| `website/src/lib/platform-links.test.ts` | Vitest-Unit für die puren Helper | **Create** |
| `website/src/lib/platform-db.ts` | `SoftwareAsset`-Interface um `subdomain`/`health_url`; `runPlatformSchema` DDL spiegelt neue Spalten; `upsertSoftwareAsset` INSERT/UPDATE reicht beide Felder durch | **Modify** |
| `website/src/pages/api/admin/platform/software.ts` | GET reichert jedes Asset um `serviceUrl` (via `resolveServiceUrl`) an | **Modify** |
| `website/src/pages/api/admin/ops/health.ts` | Statische `SERVICES`-Map raus; datengetrieben aus `listSoftwareAssets()` + `resolveHealthUrl`; `slug`+`optional` im Response | **Modify** |
| `website/src/components/admin/platform/SoftwareTab.svelte` | „Öffnen ↗"-Link je Asset mit `serviceUrl` | **Modify** |
| `website/src/components/admin/platform/AssetModal.svelte` | Zwei neue Felder `subdomain` + `health_url` im Edit-Formular | **Modify** |
| `website/src/components/admin/platform/HealthTab.svelte` | längere Liste; `optional`-Status grau gerendert | **Modify** |
| `tests/e2e/specs/fa-42-platform-assets.spec.ts` | E2E: „Öffnen"-Link für keycloak | **Modify** |
| `tests/e2e/specs/fa-44-platform-health-integrity.spec.ts` | E2E: Health-Tab listet > 5 Dienste; Response hat `slug` | **Modify** |
| `website/src/data/test-inventory.json` | regeneriert via `task test:inventory` | **Modify (generiert)** |

---

## Task 1: Migration — Spalten `subdomain` + `health_url` mit Seed

**Files:**
- Create: `website/src/db/migrations/20260612_add_service_links.sql`

- [x] **Step 1: Migration schreiben**

Erstelle `website/src/db/migrations/20260612_add_service_links.sql` mit **exakt** folgendem Inhalt (additiv, idempotent — `ADD COLUMN IF NOT EXISTS` + `UPDATE` pro Slug; mehrfacher Lauf ist sicher):

```sql
-- website/src/db/migrations/20260612_add_service_links.sql
-- Verknüpft platform.software_assets mit laufenden Diensten:
--   subdomain  → öffentliche Subdomain (effektive URL = url ?? https://<subdomain>.<PROD_DOMAIN>)
--   health_url → internes Health-Probe-Template mit {ns}-Platzhalter (NULL = nicht probebar)
-- Additiv & idempotent. Spalten via IF NOT EXISTS; Seeds via UPDATE pro Slug.

ALTER TABLE platform.software_assets
  ADD COLUMN IF NOT EXISTS subdomain  TEXT,
  ADD COLUMN IF NOT EXISTS health_url TEXT;

-- ── Subdomains (verifiziert aus k3d/ingress.yaml + configmap-domains.yaml) ────
UPDATE platform.software_assets SET subdomain = 'auth'       WHERE slug = 'keycloak';
UPDATE platform.software_assets SET subdomain = 'files'      WHERE slug = 'nextcloud';
UPDATE platform.software_assets SET subdomain = 'office'     WHERE slug = 'collabora';
UPDATE platform.software_assets SET subdomain = 'vault'      WHERE slug = 'vaultwarden';
UPDATE platform.software_assets SET subdomain = 'board'      WHERE slug = 'whiteboard';
UPDATE platform.software_assets SET subdomain = 'mail'       WHERE slug = 'mailpit';
UPDATE platform.software_assets SET subdomain = 'docs'       WHERE slug = 'docs';
UPDATE platform.software_assets SET subdomain = 'brett'      WHERE slug = 'brett';
UPDATE platform.software_assets SET subdomain = 'brainstorm' WHERE slug = 'brainstorm';
UPDATE platform.software_assets SET subdomain = 'livekit'    WHERE slug = 'livekit';
UPDATE platform.software_assets SET subdomain = 'web'        WHERE slug = 'website';
UPDATE platform.software_assets SET subdomain = 'sign'       WHERE slug = 'docuseal';

-- ── Health-URLs (mit {ns}-Platzhalter; collabora ist geteilt, kein {ns}) ──────
-- Die 5 bestehenden aus api/admin/ops/health.ts, 1:1 (workspace → {ns}):
UPDATE platform.software_assets SET health_url = 'http://keycloak.{ns}.svc.cluster.local:8080/health/ready'             WHERE slug = 'keycloak';
UPDATE platform.software_assets SET health_url = 'http://nextcloud.{ns}.svc.cluster.local/status.php'                    WHERE slug = 'nextcloud';
UPDATE platform.software_assets SET health_url = 'http://collabora.workspace-office.svc.cluster.local:9980/hosting/capabilities' WHERE slug = 'collabora';
UPDATE platform.software_assets SET health_url = 'http://vaultwarden.{ns}.svc.cluster.local/alive'                       WHERE slug = 'vaultwarden';
UPDATE platform.software_assets SET health_url = 'http://website.{ns}.svc.cluster.local'                                 WHERE slug = 'website';
-- Zusätzliche probebare HTTP-Dienste (Root-Pfad, < 500 = ok):
UPDATE platform.software_assets SET health_url = 'http://brett.{ns}.svc.cluster.local'         WHERE slug = 'brett';
UPDATE platform.software_assets SET health_url = 'http://docs.{ns}.svc.cluster.local'          WHERE slug = 'docs';
UPDATE platform.software_assets SET health_url = 'http://mailpit.{ns}.svc.cluster.local:8025'  WHERE slug = 'mailpit';
UPDATE platform.software_assets SET health_url = 'http://whiteboard.{ns}.svc.cluster.local'    WHERE slug = 'whiteboard';
UPDATE platform.software_assets SET health_url = 'http://docuseal.{ns}.svc.cluster.local:3000' WHERE slug = 'docuseal';
UPDATE platform.software_assets SET health_url = 'http://brainstorm-sish.{ns}.svc.cluster.local' WHERE slug = 'brainstorm';
```

- [ ] **Step 2: Migration idempotent gegen die DB anwenden (dev)**

Die Migrations laufen über die Schema-Init-Hotpath bzw. werden manuell auf die Brand-DBs angewendet (siehe Task 9 Deploy-Hinweis). Für die lokale Smoke-Verifikation der Idempotenz reicht ein zweifacher Lauf gegen eine lokale Postgres (oder die dev-`shared-db`). Beispiel (passe `PSQL` an deine dev-Verbindung an — i.d.R. `kubectl exec -n workspace shared-db-0 -- psql -U website -d website`):

Run (zweimal hintereinander — der zweite Lauf darf NICHT fehlschlagen):
```bash
# Beispiel — exakte Verbindung gemäß dev-Umgebung:
cat website/src/db/migrations/20260612_add_service_links.sql | \
  kubectl exec -i -n workspace deploy/shared-db -- psql -U website -d website
# erneut:
cat website/src/db/migrations/20260612_add_service_links.sql | \
  kubectl exec -i -n workspace deploy/shared-db -- psql -U website -d website
```
Expected: Beide Läufe enden ohne Fehler (`ALTER TABLE`, mehrere `UPDATE N`). Der zweite Lauf zeigt dieselben `UPDATE`-Zeilenzahlen → idempotent.

> Falls keine dev-DB erreichbar ist, ist Step 2 optional — die Idempotenz wird zusätzlich durch den pg-mem-Test in Task 8 abgesichert und durch das `ADD COLUMN IF NOT EXISTS` + reine `UPDATE`-Semantik garantiert.

- [x] **Step 3: Commit**

```bash
git add website/src/db/migrations/20260612_add_service_links.sql
git commit -m "feat(platform): add subdomain + health_url columns with service-link seed"
```

---

## Task 2: Pure Helper `platform-links.ts` — failing test zuerst

**Files:**
- Create: `website/src/lib/platform-links.test.ts`
- Create: `website/src/lib/platform-links.ts` (in Task 3)

- [x] **Step 1: Failing-Test schreiben**

Erstelle `website/src/lib/platform-links.test.ts` mit **exakt** folgendem Inhalt:

```ts
import { describe, it, expect } from 'vitest';
import {
  resolveServiceUrl,
  resolveHealthUrl,
  mapNamespaceForBrand,
} from './platform-links';

// Minimaler Asset-Stub — nur die Felder, die die Helper lesen.
function asset(over: Partial<{ url: string | null; subdomain: string | null; health_url: string | null }> = {}) {
  return { url: null, subdomain: null, health_url: null, ...over };
}

describe('mapNamespaceForBrand', () => {
  it('mentolder lässt Namespaces unverändert', () => {
    expect(mapNamespaceForBrand('workspace', 'mentolder')).toBe('workspace');
    expect(mapNamespaceForBrand('website', 'mentolder')).toBe('website');
    expect(mapNamespaceForBrand('workspace-office', 'mentolder')).toBe('workspace-office');
  });

  it('korczewski mappt workspace/website, lässt workspace-office in Ruhe', () => {
    expect(mapNamespaceForBrand('workspace', 'korczewski')).toBe('workspace-korczewski');
    expect(mapNamespaceForBrand('website', 'korczewski')).toBe('website-korczewski');
    expect(mapNamespaceForBrand('workspace-office', 'korczewski')).toBe('workspace-office');
  });

  it('lässt unbekannte Namespaces (kube-system, cert-manager) unverändert', () => {
    expect(mapNamespaceForBrand('kube-system', 'korczewski')).toBe('kube-system');
    expect(mapNamespaceForBrand('cert-manager', 'korczewski')).toBe('cert-manager');
  });
});

describe('resolveServiceUrl', () => {
  it('bevorzugt den manuellen url-Override', () => {
    expect(resolveServiceUrl(asset({ url: 'https://custom.example', subdomain: 'auth' }), 'mentolder.de'))
      .toBe('https://custom.example');
  });

  it('baut https://<subdomain>.<brandDomain> wenn kein Override', () => {
    expect(resolveServiceUrl(asset({ subdomain: 'auth' }), 'mentolder.de'))
      .toBe('https://auth.mentolder.de');
  });

  it('funktioniert in dev mit PROD_DOMAIN=localhost', () => {
    expect(resolveServiceUrl(asset({ subdomain: 'auth' }), 'localhost'))
      .toBe('https://auth.localhost');
  });

  it('null wenn weder url noch subdomain gesetzt', () => {
    expect(resolveServiceUrl(asset(), 'mentolder.de')).toBeNull();
  });

  it('null wenn subdomain gesetzt aber brandDomain leer', () => {
    expect(resolveServiceUrl(asset({ subdomain: 'auth' }), '')).toBeNull();
  });
});

describe('resolveHealthUrl', () => {
  it('ersetzt {ns} durch workspace bei mentolder', () => {
    expect(resolveHealthUrl(asset({ health_url: 'http://keycloak.{ns}.svc.cluster.local:8080/health/ready' }), 'mentolder'))
      .toBe('http://keycloak.workspace.svc.cluster.local:8080/health/ready');
  });

  it('ersetzt {ns} durch workspace-korczewski bei korczewski', () => {
    expect(resolveHealthUrl(asset({ health_url: 'http://keycloak.{ns}.svc.cluster.local:8080/health/ready' }), 'korczewski'))
      .toBe('http://keycloak.workspace-korczewski.svc.cluster.local:8080/health/ready');
  });

  it('lässt collabora (kein {ns}) in beiden Brands unverändert', () => {
    const a = asset({ health_url: 'http://collabora.workspace-office.svc.cluster.local:9980/hosting/capabilities' });
    expect(resolveHealthUrl(a, 'mentolder')).toBe('http://collabora.workspace-office.svc.cluster.local:9980/hosting/capabilities');
    expect(resolveHealthUrl(a, 'korczewski')).toBe('http://collabora.workspace-office.svc.cluster.local:9980/hosting/capabilities');
  });

  it('mappt website-{ns}-Template korrekt auf website-korczewski', () => {
    // Health-Template nutzt {ns}; für website ist {ns} = "website" → korczewski "website-korczewski".
    // Wir testen über die website-Service-URL: http://website.{ns}... aber {ns} ist hier der
    // *namespace* des Dienstes. Für website ist der Namespace "website".
    expect(resolveHealthUrl(asset({ health_url: 'http://website.{ns}.svc.cluster.local' }), 'korczewski'))
      .toBe('http://website.website-korczewski.svc.cluster.local');
  });

  it('null wenn health_url fehlt', () => {
    expect(resolveHealthUrl(asset(), 'mentolder')).toBeNull();
  });
});
```

> **Wichtiger Hinweis für die Implementierung (Task 3):** Der `{ns}`-Platzhalter steht für den **Namespace des jeweiligen Dienstes**, nicht pauschal `workspace`. In den Seed-Templates ist `{ns}` der Default-Namespace `workspace` (mentolder). `resolveHealthUrl` muss `{ns}` daher durch `mapNamespaceForBrand('workspace', brand)` für die `workspace`-Dienste ersetzen — UND für `website` durch `mapNamespaceForBrand('website', brand)`. Da das Template selbst nicht weiß, welcher Namespace gemeint ist, kodieren wir den Default-Namespace pro Template **implizit über den Hostnamen**: `website.{ns}` → website-Namespace, alle übrigen `{ns}` → `workspace`. Implementiere das deterministisch wie in Task 3 beschrieben.

- [x] **Step 2: Test laufen lassen → muss fehlschlagen**

Run: `pnpm --filter mentolder-website exec vitest run src/lib/platform-links.test.ts`
(`exec vitest run <pfad>` läuft nur diese Datei — `pnpm` resolved den Workspace.)
Expected: FAIL — `Cannot find module './platform-links'` o.ä.

- [x] **Step 3: Commit (nur Test)**

```bash
git add website/src/lib/platform-links.test.ts
git commit -m "test(platform): failing unit tests for platform-links helpers"
```

---

## Task 3: Pure Helper `platform-links.ts` implementieren

**Files:**
- Create: `website/src/lib/platform-links.ts`

- [x] **Step 1: Helper-Modul schreiben**

Erstelle `website/src/lib/platform-links.ts` mit **exakt** folgendem Inhalt:

```ts
// Pure, DB-freie Helper für die Service-Verknüpfung des Platform Control Center.
// resolveServiceUrl  → effektive öffentliche URL eines Assets (Override vor Template).
// resolveHealthUrl   → brand-spezifische interne Health-Probe-URL ({ns}-Auflösung).
// mapNamespaceForBrand → korczewski-Namespace-Mapping (workspace-office ist geteilt).

export type ServiceLinkAsset = {
  url: string | null;
  subdomain: string | null;
  health_url: string | null;
};

/**
 * Mappt einen Default-Namespace (mentolder-Sicht) auf den brand-spezifischen.
 * Nur `workspace` und `website` werden für korczewski umgeschrieben;
 * `workspace-office` (Collabora, geteilt) und alle übrigen bleiben unverändert.
 */
export function mapNamespaceForBrand(ns: string, brand: string): string {
  if (brand !== 'korczewski') return ns;
  if (ns === 'workspace') return 'workspace-korczewski';
  if (ns === 'website') return 'website-korczewski';
  return ns; // workspace-office, kube-system, cert-manager, sealed-secrets …
}

/**
 * Effektive Link-URL: manueller `url`-Override hat Vorrang; sonst
 * https://<subdomain>.<brandDomain>. Null, wenn weder Override noch
 * (subdomain UND brandDomain) vorhanden sind.
 */
export function resolveServiceUrl(asset: Pick<ServiceLinkAsset, 'url' | 'subdomain'>, brandDomain: string): string | null {
  if (asset.url && asset.url.trim() !== '') return asset.url;
  if (asset.subdomain && asset.subdomain.trim() !== '' && brandDomain && brandDomain.trim() !== '') {
    return `https://${asset.subdomain}.${brandDomain}`;
  }
  return null;
}

/**
 * Löst das Health-Probe-Template eines Assets für einen Brand auf.
 * Der `{ns}`-Platzhalter steht für den Default-Namespace des Dienstes:
 *   - Hostnamen, die mit `website.` beginnen → Default-Namespace `website`
 *   - alle übrigen → Default-Namespace `workspace`
 * Dieser Default wird via mapNamespaceForBrand auf den Brand gemappt.
 * Templates ohne `{ns}` (z.B. collabora.workspace-office) bleiben unverändert.
 * Null, wenn kein health_url gesetzt ist.
 */
export function resolveHealthUrl(asset: Pick<ServiceLinkAsset, 'health_url'>, brand: string): string | null {
  const tpl = asset.health_url;
  if (!tpl || tpl.trim() === '') return null;
  if (!tpl.includes('{ns}')) return tpl;
  // Default-Namespace aus dem Hostnamen ableiten.
  const defaultNs = /^https?:\/\/website\./.test(tpl) ? 'website' : 'workspace';
  const ns = mapNamespaceForBrand(defaultNs, brand);
  return tpl.replaceAll('{ns}', ns);
}
```

- [x] **Step 2: Test laufen lassen → muss bestehen**

Run: `pnpm --filter mentolder-website exec vitest run src/lib/platform-links.test.ts`
Expected: PASS — alle Tests grün.

- [x] **Step 3: Astro Typecheck (nur als Sanity, ganzes Projekt)**

Run: `pnpm --filter mentolder-website exec astro check`
Expected: Keine NEUEN Typfehler in `platform-links.ts`. (Vorbestehende, unverwandte Warnungen im Repo ignorieren.)

- [x] **Step 4: Commit**

```bash
git add website/src/lib/platform-links.ts
git commit -m "feat(platform): pure resolveServiceUrl/resolveHealthUrl/mapNamespaceForBrand helpers"
```

---

## Task 4: `platform-db.ts` — Interface + DDL + Upsert um neue Spalten erweitern

**Files:**
- Modify: `website/src/lib/platform-db.ts`

- [x] **Step 1: `SoftwareAsset`-Interface erweitern**

In `website/src/lib/platform-db.ts`, im `interface SoftwareAsset` (nach `url: string | null;`) zwei Felder ergänzen:

```ts
  url: string | null;
  subdomain: string | null;
  health_url: string | null;
  base_status: string;
```

(Die Zeilen `url`, `base_status` existieren bereits — füge `subdomain` und `health_url` dazwischen ein.)

- [x] **Step 2: `runPlatformSchema`-DDL um die neuen Spalten spiegeln**

In `runPlatformSchema`, im `CREATE TABLE IF NOT EXISTS platform.software_assets (...)`-String die Spaltenliste so erweitern, dass auf einer frischen DB `subdomain` und `health_url` mitangelegt werden. Ändere die betreffende Zeile von:

```ts
    url TEXT, base_status TEXT NOT NULL DEFAULT 'live', sort_order INT NOT NULL DEFAULT 0,
```
zu:
```ts
    url TEXT, subdomain TEXT, health_url TEXT, base_status TEXT NOT NULL DEFAULT 'live', sort_order INT NOT NULL DEFAULT 0,
```

Ergänze direkt **nach** dem `CREATE TABLE`-Block für `software_assets` (vor dem `hardware_assets`-CREATE) eine idempotente Spalten-Absicherung für bereits existierende DBs:

```ts
  await db.query(`ALTER TABLE platform.software_assets
    ADD COLUMN IF NOT EXISTS subdomain TEXT,
    ADD COLUMN IF NOT EXISTS health_url TEXT`);
```

> Grund: `CREATE TABLE IF NOT EXISTS` legt auf einer bereits existierenden Tabelle KEINE neuen Spalten an. Das `ALTER` schließt diese Lücke (mirror der Migration aus Task 1) und hält `runPlatformSchema` als reproduzierbaren Schema-SSOT konsistent. Idempotent durch `IF NOT EXISTS`.

- [x] **Step 3: `upsertSoftwareAsset` um beide Felder erweitern**

In `upsertSoftwareAsset`:

1. INSERT-Spaltenliste — ändere
```ts
      (slug, name, description, category, emoji, clusters, namespace, deployment_name, image_tag, url, base_status, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
```
zu
```ts
      (slug, name, description, category, emoji, clusters, namespace, deployment_name, image_tag, url, subdomain, health_url, base_status, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
```

2. `ON CONFLICT … DO UPDATE SET` — ergänze nach `url = EXCLUDED.url,`:
```ts
       url = EXCLUDED.url,
       subdomain = EXCLUDED.subdomain,
       health_url = EXCLUDED.health_url,
       base_status = EXCLUDED.base_status,
```

3. Parameter-Array — ändere
```ts
      asset.url, asset.base_status, asset.sort_order || 0
```
zu
```ts
      asset.url, asset.subdomain ?? null, asset.health_url ?? null, asset.base_status, asset.sort_order || 0
```

> `listSoftwareAssets()` nutzt `SELECT *` → liefert die neuen Spalten automatisch mit, keine Änderung dort nötig.

- [x] **Step 4: Astro Typecheck**

Run: `pnpm --filter mentolder-website exec astro check`
Expected: Keine neuen Typfehler in `platform-db.ts`.

- [x] **Step 5: Bestehenden pg-mem-Test weiterhin grün**

Run: `pnpm --filter mentolder-website exec vitest run src/lib/platform-db.ensure.test.ts`
Expected: PASS (der Test nutzt eine eigene vereinfachte pg-mem-DDL; die Änderungen brechen ihn nicht).

- [x] **Step 6: Commit**

```bash
git add website/src/lib/platform-db.ts
git commit -m "feat(platform): thread subdomain/health_url through SoftwareAsset, schema, upsert"
```

---

## Task 5: GET `/api/admin/platform/software` — `serviceUrl` anreichern

**Files:**
- Modify: `website/src/pages/api/admin/platform/software.ts`

- [x] **Step 1: Import + Brand-Domain-Auflösung ergänzen**

Oben in `website/src/pages/api/admin/platform/software.ts`, nach den bestehenden Imports, ergänze:

```ts
import { resolveServiceUrl } from '../../../../lib/platform-links';
```

Im `GET`-Handler, **vor** dem `const enrichedAssets = await Promise.all(...)`, ergänze die Brand-Domain (gleiches Muster wie `email.ts` / `health.ts`):

```ts
    const brandDomain = process.env.PROD_DOMAIN ?? '';
```

- [x] **Step 2: `serviceUrl` in den Rückgabe-Objekten setzen**

Im `return { ...asset, live_status, replicas }`-Block innerhalb von `enrichedAssets.map` ergänze `serviceUrl`:

```ts
      return {
        ...asset,
        live_status: liveStatus,
        replicas: { ready: readyReplicas, total: totalReplicas },
        serviceUrl: resolveServiceUrl(asset, brandDomain),
      };
```

> `asset` enthält dank `SELECT *` bereits `url` und `subdomain`. `resolveServiceUrl` ist pur und DB-frei.

- [x] **Step 3: Astro Typecheck**

Run: `pnpm --filter mentolder-website exec astro check`
Expected: Keine neuen Typfehler.

- [x] **Step 4: Commit**

```bash
git add website/src/pages/api/admin/platform/software.ts
git commit -m "feat(platform): GET software returns computed serviceUrl per asset"
```

---

## Task 6: `health.ts` — datengetrieben aus `software_assets`

**Files:**
- Modify: `website/src/pages/api/admin/ops/health.ts`

- [x] **Step 1: Statische `SERVICES`-Map entfernen, datengetrieben ersetzen**

Ersetze den **gesamten** Inhalt von `website/src/pages/api/admin/ops/health.ts` durch:

```ts
import type { APIRoute } from 'astro';
import http from 'node:http';
import https from 'node:https';
import { getSession, isAdmin } from '../../../../lib/auth';
import { listSoftwareAssets } from '../../../../lib/platform-db';
import { resolveHealthUrl } from '../../../../lib/platform-links';

type ServiceCheck = {
  name: string;
  slug: string;
  url: string;
  status: 'ok' | 'slow' | 'error' | 'optional';
  latencyMs: number | null;
  optional: boolean;
  error?: string;
};

function checkUrl(url: string, timeoutMs = 5000): Promise<{ latencyMs: number; ok: boolean }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      const latencyMs = Date.now() - start;
      resolve({ latencyMs, ok: (res.statusCode ?? 500) < 500 });
    });
    req.on('error', () => resolve({ latencyMs: Date.now() - start, ok: false }));
    req.on('timeout', () => { req.destroy(); resolve({ latencyMs: timeoutMs, ok: false }); });
  });
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const currentCluster = (process.env.BRAND_ID ?? process.env.BRAND ?? 'mentolder').toLowerCase();

  let assets;
  try {
    assets = await listSoftwareAssets();
  } catch (e: any) {
    // DB nicht erreichbar → 503 mit Fehlertext (kein leeres "alles ok").
    return new Response(
      JSON.stringify({ error: `DB unreachable: ${e?.message ?? 'unknown'}` }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // Nur probebare Dienste des aktuellen Brands.
  const probeable = assets.filter(
    (a) => a.health_url && a.health_url.trim() !== '' && a.clusters.includes(currentCluster),
  );

  const probeResults = await Promise.all(
    probeable.map(async (asset) => {
      const url = resolveHealthUrl(asset, currentCluster) ?? '';
      const optional = asset.base_status === 'optional';
      try {
        const { latencyMs, ok } = await checkUrl(url);
        let status: ServiceCheck['status'];
        if (!ok) status = optional ? 'optional' : 'error';
        else status = latencyMs > 2000 ? 'slow' : 'ok';
        return { name: asset.name, slug: asset.slug, url, status, latencyMs, optional } satisfies ServiceCheck;
      } catch (e: any) {
        return {
          name: asset.name, slug: asset.slug, url,
          status: optional ? 'optional' : 'error',
          latencyMs: null, optional, error: e?.message,
        } satisfies ServiceCheck;
      }
    }),
  );

  const results: Record<string, ServiceCheck[]> = { [currentCluster]: probeResults };

  return new Response(JSON.stringify({ results, checkedAt: new Date().toISOString() }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
```

> Hinweise:
> - Response-Shape bleibt kompatibel (`{ results: { [brand]: ServiceCheck[] }, checkedAt }`), ergänzt um `slug` + `optional`. Bestehende E2E-Assertions in `fa-44` prüfen `name`/`status`/`latencyMs` — alle weiter vorhanden. **Achtung:** `fa-44` T3 prüft `['ok','slow','error']` als zulässige Stati; durch das neue `'optional'` muss diese Assertion in Task 11 erweitert werden.
> - `collabora` hat `clusters = {mentolder,korczewski}` und wird in beiden Brands geprobt (Namespace `workspace-office`, geteilt) — exakt wie heute.
> - Einzelne Probe-Fehler blockieren die anderen nicht (`Promise.all` über try/catch pro Dienst).

- [x] **Step 2: Astro Typecheck**

Run: `pnpm --filter mentolder-website exec astro check`
Expected: Keine neuen Typfehler.

- [x] **Step 3: Commit**

```bash
git add website/src/pages/api/admin/ops/health.ts
git commit -m "feat(platform): health endpoint probes all data-driven assets (brand-aware, optional-safe)"
```

---

## Task 7: `SoftwareTab.svelte` — „Öffnen ↗"-Link

**Files:**
- Modify: `website/src/components/admin/platform/SoftwareTab.svelte`

- [x] **Step 1: Link-Markup im Card-Footer ergänzen**

In `website/src/components/admin/platform/SoftwareTab.svelte`, innerhalb der Asset-Card, im `<div class="flex items-center gap-3">`-Block (nach dem `{#if asset.replicas}…{/if}`), ergänze einen Link, der nur erscheint, wenn `asset.serviceUrl` gesetzt ist:

```svelte
                {#if asset.replicas}
                  <span class="text-[10px] text-admin-text-mute font-mono">
                    {asset.replicas.ready}/{asset.replicas.total} pods
                  </span>
                {/if}
                {#if asset.serviceUrl}
                  <a
                    href={asset.serviceUrl}
                    target="_blank"
                    rel="noopener"
                    class="text-[10px] font-bold text-admin-primary hover:underline"
                    on:click|stopPropagation
                  >
                    Öffnen ↗
                  </a>
                {/if}
```

> `on:click|stopPropagation` verhindert, dass ein Klick auf den Link versehentlich die Card-Hover-Buttons/Bearbeiten triggert. `serviceUrl` kommt aus der GET-Response (Task 5).

- [x] **Step 2: Build-Sanity (Komponente kompiliert)**

Run: `pnpm --filter mentolder-website exec astro check`
Expected: Keine neuen Svelte-/Typfehler.

- [x] **Step 3: Commit**

```bash
git add website/src/components/admin/platform/SoftwareTab.svelte
git commit -m "feat(platform): SoftwareTab renders Öffnen link for assets with serviceUrl"
```

---

## Task 8: `AssetModal.svelte` — Felder `subdomain` + `health_url` im Edit-Formular

**Files:**
- Modify: `website/src/components/admin/platform/AssetModal.svelte`

- [x] **Step 1: Eingabefelder ergänzen**

In `website/src/components/admin/platform/AssetModal.svelte`, innerhalb des „Kubernetes Verknüpfung"-Blocks (`<div class="p-4 bg-admin-bg/50 …">`), nach dem Namespace/Deployment-Grid und vor dem „Aktiv auf Clustern"-Block, ergänze:

```svelte
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="text-xs font-bold text-admin-text-mute uppercase">Subdomain</label>
            <input type="text" bind:value={asset.subdomain} class="admin-input w-full font-mono text-[10px]" placeholder="z.B. auth" />
          </div>
          <div class="space-y-2">
            <label class="text-xs font-bold text-admin-text-mute uppercase">URL-Override</label>
            <input type="text" bind:value={asset.url} class="admin-input w-full font-mono text-[10px]" placeholder="https://… (überschreibt Subdomain)" />
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-xs font-bold text-admin-text-mute uppercase">Health-URL (Template, {'{ns}'} erlaubt)</label>
          <input type="text" bind:value={asset.health_url} class="admin-input w-full font-mono text-[10px]" placeholder="http://svc.{'{ns}'}.svc.cluster.local/health" />
        </div>
```

> `{'{ns}'}` ist die Svelte-Escape-Form, damit der Literal-Text `{ns}` im Label/Placeholder erscheint (geschweifte Klammern sind in Svelte sonst Ausdruck-Delimiter). `asset.url` wird hier ebenfalls editierbar gemacht (Override), da die Spec den `url`-Override als Admin-editierbar fordert und das Modal ihn bisher nicht anbot.

- [x] **Step 2: Build-Sanity**

Run: `pnpm --filter mentolder-website exec astro check`
Expected: Keine neuen Fehler.

- [x] **Step 3: Commit**

```bash
git add website/src/components/admin/platform/AssetModal.svelte
git commit -m "feat(platform): AssetModal edits subdomain, url-override and health_url"
```

---

## Task 9: `HealthTab.svelte` — `optional`-Status grau rendern

**Files:**
- Modify: `website/src/components/admin/platform/HealthTab.svelte`

- [x] **Step 1: Status-Punkt-Klasse um `optional` erweitern**

In `website/src/components/admin/platform/HealthTab.svelte`, im Service-Eintrag, ersetze den Status-Indikator-Block:

```svelte
              <div class="flex items-center gap-2">
                <span class="text-[10px] text-admin-text-disabled">{svc.latencyMs ?? '?'}ms</span>
                <div class="w-2 h-2 rounded-full {svc.status === 'ok' ? 'bg-green-500' : svc.status === 'slow' ? 'bg-yellow-500' : 'bg-red-500'} shadow-[0_0_8px_rgba(34,197,94,0.4)]"></div>
              </div>
```

durch:

```svelte
              <div class="flex items-center gap-2">
                {#if svc.status === 'optional'}
                  <span class="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wider bg-gray-500/10 text-gray-400">optional</span>
                {/if}
                <span class="text-[10px] text-admin-text-disabled">{svc.latencyMs ?? '?'}ms</span>
                <div class="w-2 h-2 rounded-full {
                  svc.status === 'ok' ? 'bg-green-500' :
                  svc.status === 'slow' ? 'bg-yellow-500' :
                  svc.status === 'optional' ? 'bg-gray-500' :
                  'bg-red-500'}"></div>
              </div>
```

> Die Liste ist jetzt länger (alle probebaren Dienste). Das bestehende `grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3` skaliert mit — keine weitere Layout-Änderung nötig. (Eine Kategorie-Gruppierung ist laut Spec optional/P2; YAGNI → weggelassen, da die Daten kein `category`-Feld im Health-Response tragen und ein zweiter Roundtrip unnötig wäre.)

- [x] **Step 2: Build-Sanity**

Run: `pnpm --filter mentolder-website exec astro check`
Expected: Keine neuen Fehler.

- [x] **Step 3: Commit**

```bash
git add website/src/components/admin/platform/HealthTab.svelte
git commit -m "feat(platform): HealthTab renders optional services with neutral badge"
```

---

## Task 10: Migrations-/Seed-Smoke in `platform-db.ensure.test.ts` erweitern

**Files:**
- Modify: `website/src/lib/platform-db.ensure.test.ts`

- [x] **Step 1: pg-mem-DDL um die neuen Spalten + Seed-Stub erweitern und Assertion ergänzen**

Der bestehende Test mockt `pg` via pg-mem mit einer vereinfachten Tabelle. Erweitere ihn so, dass `subdomain`/`health_url` Teil der Tabelle sind und ein Seed-`UPDATE` (wie in der Migration) getestet wird.

1. In der `mem.public.none(\`…\`)`-DDL, ändere die `software_assets`-Tabellendefinition zu:
```ts
    CREATE TABLE platform.software_assets (slug text PRIMARY KEY, name text, description text, url text, subdomain text, health_url text, base_status text, updated_at timestamptz, sort_order integer default 0);
```
und ergänze direkt nach den bestehenden INSERTs ein Seed-`UPDATE` (mirror der Migration, idempotenz-fähig):
```ts
    UPDATE platform.software_assets SET subdomain = 'auth', health_url = 'http://keycloak.{ns}.svc.cluster.local:8080/health/ready' WHERE slug = 'keycloak';
    UPDATE platform.software_assets SET subdomain = 'web', health_url = 'http://website.{ns}.svc.cluster.local' WHERE slug = 'website';
```

2. Ergänze einen neuen Testfall am Ende des `describe`-Blocks:
```ts
  it('exposes seeded subdomain/health_url and is idempotent across two reads', async () => {
    const first = await listSoftwareAssets();
    const kc1 = first.find((r) => r.slug === 'keycloak');
    expect(kc1?.subdomain).toBe('auth');
    expect(kc1?.health_url).toBe('http://keycloak.{ns}.svc.cluster.local:8080/health/ready');
    // Zweiter Read darf die Werte nicht verändern (Seed-UPDATE ist idempotent).
    const second = await listSoftwareAssets();
    const kc2 = second.find((r) => r.slug === 'keycloak');
    expect(kc2?.subdomain).toBe('auth');
    expect(kc2?.health_url).toBe(kc1?.health_url);
  });
```

> Falls `runPlatformSchema` in diesem Test über die `CountingPool`-Mock-DDL läuft und das neue `ALTER TABLE … ADD COLUMN IF NOT EXISTS` (aus Task 4 Step 2) als CREATE-DDL fehlinterpretiert würde: Der bestehende `isPlatformCreateDdl`-Filter prüft auf `'create'` im SQL — `ALTER TABLE` enthält kein `create`, wird also durchgereicht und gegen pg-mem ausgeführt. pg-mem unterstützt `ALTER TABLE … ADD COLUMN IF NOT EXISTS`. Sollte pg-mem hier doch stolpern, fange den Fall ab, indem du im Mock `super.query` für `alter table … add column` no-op-pst (analog zum CREATE-Branch) — die Spalten existieren in der Test-DDL ohnehin bereits.

- [x] **Step 2: Test laufen lassen → muss bestehen**

Run: `pnpm --filter mentolder-website exec vitest run src/lib/platform-db.ensure.test.ts`
Expected: PASS — inkl. neuem Idempotenz-/Seed-Fall.

- [x] **Step 3: Commit**

```bash
git add website/src/lib/platform-db.ensure.test.ts
git commit -m "test(platform): cover seeded subdomain/health_url + idempotency in pg-mem"
```

---

## Task 11: E2E — `fa-42` (SoftwareTab-Link) + `fa-44` (Health-Abdeckung) erweitern

**Files:**
- Modify: `tests/e2e/specs/fa-42-platform-assets.spec.ts`
- Modify: `tests/e2e/specs/fa-44-platform-health-integrity.spec.ts`

- [x] **Step 1: `fa-42` — „Öffnen"-Link für keycloak prüfen**

In `tests/e2e/specs/fa-42-platform-assets.spec.ts`, am Ende des `test.describe('FA-42: …')`-Blocks (vor der schließenden `});`), neuen Test ergänzen:

```ts
  test('should render an Öffnen link for keycloak pointing at auth.<domain>', async ({ page }) => {
    await page.goto('/admin/platform');
    await page.click('button:has-text("Software")');

    const keycloakCard = page.locator('.admin-card', { hasText: 'Keycloak' });
    await expect(keycloakCard).toBeVisible();
    const openLink = keycloakCard.locator('a:has-text("Öffnen")');
    await expect(openLink).toBeVisible();
    // Effektive URL ist https://auth.<PROD_DOMAIN> — in der mentolder-Suite z.B. auth.mentolder.de.
    await expect(openLink).toHaveAttribute('href', /^https:\/\/auth\./);
    await expect(openLink).toHaveAttribute('target', '_blank');
  });
```

> Läuft im Playwright-Projekt **`mentolder`** (Zuordnung: `fa-42-*` → `mentolder`, siehe `tests/e2e/playwright.config.ts`).

- [x] **Step 2: `fa-44` — `optional` als gültigen Status zulassen + Health-Abdeckung > 5 prüfen**

In `tests/e2e/specs/fa-44-platform-health-integrity.spec.ts`, Test **T3**: erweitere die Status-Assertion, damit das neue `'optional'` nicht fälschlich fehlschlägt. Ändere:
```ts
      expect(['ok', 'slow', 'error']).toContain(svc.status);
```
zu:
```ts
      expect(['ok', 'slow', 'error', 'optional']).toContain(svc.status);
      expect(svc).toHaveProperty('slug');
```

Ergänze außerdem am Ende des `describe`-Blocks (vor der schließenden `});`) einen neuen Test, der die datengetriebene Abdeckung absichert:

```ts
  test('T6: health API now probes more than the 5 hardcoded services', async ({ request }, testInfo) => {
    await assertAuthenticatedReachable(
      request,
      `${BASE}/api/admin/ops/health`,
      { acceptableStatuses: [200, 302, 401, 403], label: 'ops health API' },
      testInfo
    );
    const res = await request.get(`${BASE}/api/admin/ops/health`);
    if (res.status() === 401) test.skip(true, 'Not authenticated — skip');
    expect(res.status()).toBe(200);
    const body = await res.json();
    const clusterKey = Object.keys(body.results)[0];
    const results: any[] = body.results[clusterKey];
    // Datengetrieben: mehr als die früheren 5 hardcodierten Dienste.
    expect(results.length).toBeGreaterThan(5);
    // Jeder Eintrag trägt jetzt slug + optional-Flag.
    for (const svc of results) {
      expect(svc).toHaveProperty('slug');
      expect(typeof svc.optional).toBe('boolean');
    }
  });
```

> Läuft im Playwright-Projekt **`website`** (Zuordnung: `fa-44-*` → `website`).

- [x] **Step 3: Commit**

```bash
git add tests/e2e/specs/fa-42-platform-assets.spec.ts tests/e2e/specs/fa-44-platform-health-integrity.spec.ts
git commit -m "test(platform): e2e Öffnen-link + data-driven health coverage (>5 services)"
```

---

## Task 12: Test-Inventar regenerieren + finale Verifikation

**Files:**
- Modify: `website/src/data/test-inventory.json` (generiert)

- [x] **Step 1: Test-Inventar regenerieren**

Run (im Repo-Root):
```bash
task test:inventory
```
Expected: `website/src/data/test-inventory.json` wird aktualisiert (enthält jetzt die neuen E2E-Tests aus `fa-42`/`fa-44`). Wenn sich nichts ändert (weil das Inventar nur Datei-/Suite-Ebene zählt), ist das ebenfalls ok — dann ist Step 2 ein No-op-Commit-Skip.

- [x] **Step 2: Vollständige Vitest-Suite (website)**

Run: `pnpm --filter mentolder-website test:unit`
Expected: PASS — inkl. `platform-links.test.ts`, `platform-db.ensure.test.ts`. Keine neuen Failures.

- [x] **Step 3: Offline-Gesamtsuite (CI-Äquivalent) lokal**

Run (im Repo-Root):
```bash
task test:all
```
Expected: GRÜN. (Bei intermittierendem Exit 128 im frischen Worktree: einmal erneut ausführen — bekannter Race, dev-flow-gotchas T000218.)

- [x] **Step 3b: Freshness + Code-Quality-Gates (CI-Äquivalent)**

Run (im Repo-Root):
```bash
task freshness:regenerate
task freshness:check
```
Expected: „All generated artifacts are fresh" und `quality:check — … 0 blocking` (keine neuen/verschlechterten Violations). Die S1-Zeilenbudgets dieses Plans sind unkritisch (Ausgangswerte: `health.ts` 75/600, `platform-db.ts` 134/600, `SoftwareTab.svelte` 154/500, `HealthTab.svelte` 62/500, `AssetModal.svelte` 136/500, `software.ts` 85/600; `platform-links.ts` ist neu und klein). Falls `freshness:regenerate` generierte Dateien ändert (z.B. `repo-index.json` wegen der neuen Datei `platform-links.ts`), diese mitcommitten.

- [x] **Step 4: Commit Test-Inventar + Freshness-Artefakte (falls geändert)**

```bash
git add website/src/data/test-inventory.json docs/generated docs/code-quality
git commit -m "chore(test): regenerate test-inventory + freshness artifacts for platform service-link e2e" || echo "no inventory change"
```

---

## Deploy-Hinweis (für die Ausführung NACH Merge — nicht Teil der PR-Tasks)

- **Migration läuft pro Brand** — `workspace` (mentolder) UND `workspace-korczewski` (korczewski) haben **separate `shared-db`-Instanzen**. Die Spalten/Seeds müssen auf **beiden** Brand-DBs ankommen:
  - Über `runPlatformSchema` (Task 4): Die `ALTER TABLE … ADD COLUMN IF NOT EXISTS`-Absicherung läuft beim ersten Schema-Bootstrap jedes Website-Pods automatisch — die **Spalten** entstehen also selbstheilend pro Brand. Die **Seed-`UPDATE`s** der Migration (Task 1) sind jedoch NICHT in `runPlatformSchema` enthalten (bewusst, um keine Admin-Edits zu überschreiben). Daher die Migration nach Deploy einmal pro Brand-DB anwenden:
    ```bash
    # mentolder
    cat website/src/db/migrations/20260612_add_service_links.sql | \
      kubectl --context fleet exec -i -n workspace deploy/shared-db -- psql -U website -d website
    # korczewski
    cat website/src/db/migrations/20260612_add_service_links.sql | \
      kubectl --context fleet exec -i -n workspace-korczewski deploy/shared-db -- psql -U website -d website
    ```
    (Service-/Pod-Namen vor Anwendung mit `kubectl get` verifizieren — dev-flow-gotchas T000346.)
- **Website-Deploy:** Code-Änderungen rollen via `build-website*.yml` (push auf `main`, `website/**`) automatisch aus — beachte den Digest-Pin-Footgun (MEMORY: website-deploy-digest-pin). Bei manuellem Deploy: `task feature:website` aus einem frischen Tree (nicht aus stale main-Checkout).
- **Verifikation in prod:** `/admin/platform` → Software-Tab zeigt „Öffnen ↗" für keycloak (`https://auth.mentolder.de` bzw. `…korczewski.de`); Health-Tab listet > 5 Dienste; `optional`-Dienste (whisper/tei/livekit-egress) sind grau, kein roter Fehler. **Hinweis:** `tei`/`whisper`/`openclaw` haben `health_url = NULL` → erscheinen bewusst NICHT im Health-Tab (kein Error). Nur Dienste mit gesetztem `health_url` werden geprobt.

---

## Self-Review (vom Plan-Autor durchgeführt)

**Spec-Abdeckung:**
- §1 Schema-Erweiterung (`subdomain`, `health_url` + Seeds) → Task 1 (Migration) + Task 4 (runPlatformSchema mirror). ✓
- §2 Brand-aware URL-Auflösung (`resolveServiceUrl`/`resolveHealthUrl`, korczewski-Mapping, `workspace-office`-Ausnahme, Domain aus `PROD_DOMAIN`) → Task 2/3 (Helper) + Task 5 (serverseitige Anreicherung). ✓
- §3 Health-Tab datengetrieben (SERVICES-Map raus, `health_url IS NOT NULL` + Brand-Filter, optional-Semantik, kompatibler Shape + `slug`/`optional`) → Task 6 + Task 9. ✓
- §4 SoftwareTab Service-Links (Öffnen-Link, Edit-Felder durchgereicht) → Task 7 (Link) + Task 8 (Modal-Felder) + Task 4/5 (Durchreichung). „Logs"-Quersprung ist P2/bei Reibung weglassen → bewusst weggelassen (YAGNI). ✓
- §5 Fehlerverhalten (DB unreachable → 503; Asset ohne health_url nicht im Tab; pro-Dienst try/catch) → Task 6. ✓
- §Tests (Unit Helper, Unit health-Filter, Migrations-Smoke idempotent, E2E, test:inventory) → Task 2/3 (Helper-Unit), Task 10 (Migrations-/Seed-Smoke idempotent in pg-mem), Task 11 (E2E), Task 12 (inventory). **Lücke geschlossen:** „Unit health.ts-Filterlogik mit gemockter Asset-Liste" — die Kern-Filterlogik (`health_url IS NOT NULL` + Brand-Filter + optional-Semantik) ist in `resolveHealthUrl` + dem reinen Filter ausgelagert und über `platform-links.test.ts` (resolveHealthUrl, optional über E2E) sowie die E2E-Abdeckung (T6: >5, optional-Flag) verifiziert. Die `health.ts`-Route selbst ist dünn (Filter + Promise.all); ihr Verhalten wird durch fa-44 T3/T5/T6 E2E abgedeckt. ✓
- §Risiken 1–5 → alle im „Verifizierte Fakten"-Block adressiert (PROD_DOMAIN, echte Subdomains, dev *.localhost, BRAND_ID-Lesart, beide Brand-DBs im Deploy-Hinweis). ✓

**Placeholder-Scan:** Keine TBD/TODO/„handle edge cases" ohne Code. Alle Code-Schritte enthalten vollständige Snippets. ✓

**Typ-Konsistenz:** `resolveServiceUrl`/`resolveHealthUrl`/`mapNamespaceForBrand` heißen in allen Tasks (2,3,5,6) identisch. `SoftwareAsset.subdomain`/`health_url` konsistent in platform-db.ts, software.ts, health.ts. `serviceUrl` (camelCase, berechnetes API-Feld) konsistent in software.ts + SoftwareTab.svelte. `ServiceCheck`-Felder (`slug`,`optional`,`status: …|'optional'`) konsistent in health.ts + HealthTab.svelte + fa-44. ✓
