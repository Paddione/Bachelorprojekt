# E2E Reachability & Test-Quality-Audit — 2026-06-07

**These: „Tests laufen grün, aber Services sind ständig nicht erreichbar oder funktionieren nicht"**

Ursache ist ein systematisches **Green-on-Skip**-Muster in der E2E-Suite. Die Playwright-Tests überspringen sich in Produktionsumgebungen selbst, wenn Services nicht erreichbar sind oder Auth-Credentials fehlen. Die CI-Nightly (`e2e.yml`) setzt `E2E_ADMIN_PASS` **nie**, wodurch die gesamte authentifizierte Testoberfläche (Admin-CRUD, Content-Hub, Inbox, Invoicing, Coaching) strukturell ausfällt — grün, ohne je etwas zu testen.

---

## Kernmechanismen des Green-on-Skip

| Mechanismus | Vorkommen | Beispiel |
|---|---|---|
| `test.skip(!E2E_ADMIN_PASS, ...)` | 35+ Specs | Admin-CRUD, Inbox, Tickets, Content-Hub-Save |
| `test.skip(!!PROD_DOMAIN, ...)` | 11 Tests in fa-27-brett | Brett API/DB vollständig ungetestet in Prod |
| `test.skip(!serviceAvailable, ...)` | 7 Tests in fa-18-transcription | Transcriber ClusterIP-only → immer Skip extern |
| `test.skip(true, ...)` (Hard-Skip) | fa-17-meeting, Teile sa-03 | Permanente Stubs, testen nie |
| `if (404) test.skip(true, ...)` | integration-smoke (Collabora) | Ein 404 (Service down) wird als Skip behandelt |
| `expect([200,503]).toContain(...)` | fa-03-video, integration-smoke | Signaling 503 = NATS-Backend tot → trotzdem grün |
| `.catch(() => null) → test.skip` | fa-livekit, fa-content-hub | Transportfehler → skip statt fail |
| `if (/redirect_uri/.test(...)) test.skip()` | sa-08-sso | Echte SSO-Fehlkonfiguration → skip statt fail |

---

## Übersichtstabelle: App × Reachability × Test-Qualität

| App | Live mentolder | Live korczewski | greenOnSkipRisk | Asserts Real Health? |
|---|---|---|---|---|
| **Website + /api** | ✅ 200, Auth korrekt, API 401 | ✅ 200, Auth korrekt, API 401 | **high** | ✅ public; ❌ authenticated |
| **Keycloak (OIDC)** | ✅ well-known 200 | ✅ well-known 200 | **high** | ❌ nur redirect-Strings |
| **Nextcloud (Files+Talk)** | ✅ 200, signaling ok | ✅ 200, signaling ok | **high** | ❌ nur Redirect-to-Login |
| **Collabora (Office)** | ✅ 200, WOPI ok | ✅ 200, urlsrc FALSCH | **high** | ❌ 404 = Skip |
| **Vaultwarden** | ✅ 200, signups disabled | ✅ 200, signups disabled | **medium** | ✅ /alive + /api/config |
| **Whiteboard** | ✅ 200 | ✅ 200 | **high** | ❌ nur status<500 |
| **DocuSeal (Signing)** | ⚠️ 302→/setup | ⚠️ 302→/setup | **high** | ❌ akzeptiert /setup |
| **Docs (Statisch)** | ✅ 302→Auth | ✅ 302→Auth | **high** | ❌ prüft Keycloak-Loginpage |
| **Mailpit** | ✅ 401 | ✅ 401 | **high** | ❌ 401 = Skip |
| **Brett (3D)** | ✅ 302→Auth | ✅ 302→Auth | **high** | ❌ 11/13 Tests skippen |
| **LiveKit (WebRTC)** | ✅ 200, Auth ok | ✅ 200, Auth ok | **high** | ✅ Auth-Gate; ❌ Server-Liveness |
| **Talk HPB + Signaling** | ✅ 200, NATS up | ✅ 200, NATS up | **high** | ❌ 100% Skip; 503=PASS |
| **Recovery Browser** | N/A (on-demand) | N/A (on-demand) | **high** | ❌ Null Coverage |

> ✅ = erreichbar, korrekt | ⚠️ = erreichbar aber defekt | ❌ = nicht gegeben

---

## Was ist aktuell tatsächlich kaputt?

### 🔴 1. DocuSeal — beide Brands unprovisioniert

`sign.mentolder.de` und `sign.korczewski.de` leiten alle Requests auf `/setup` — der First-Run-Admin-Wizard. Kein Signing möglich. Die E2E-Suite erkennt das nicht: `integration-smoke` akzeptiert `[200,301,302,401]` und `systemtest-05` klickt nie auf die echte DocuSeal-UI.

**Fix:** Instanz provisionieren; dann E2E-Test der `/setup`-Redirect als FAILURE wertet.

### 🔴 2. Collabora korczewski WOPI urlsrc hartkodiert auf mentolder

`office.korczewski.de/hosting/discovery` returned alle `urlsrc`-Attribute mit `office.mentolder.de`. Korczewski-Office-Dokumente würden den Editor von der falschen Brand laden. **Konfigurationsfehler.**

### 🔴 3. Recovery Browser — Null E2E-Coverage, sensitive-ops blind

Kein Spec prüft dass `task recovery:browse` den oauth2-proxy-Gate tatsächlich aktiviert. Ein Regression die den filebrowser `--noauth` ungeschützt exponiert wäre unsichtbar.

---

## Tests die lügen — die Top 8

### 1. Website: 35+ Specs skippen weil E2E_ADMIN_PASS nie gesetzt

`e2e.yml` setzt `E2E_ADMIN_PASS` **nie**. `mentolder-auth-setup.spec.ts:40` schreibt leeren `storageState`. Alle Admin-CRUD, Inbox, Tickets, Coaching, Content-Hub-Assertions → tot. Die gesamte `/api/*`-Backend-Testfläche ist strukturell grün ohne Coverage.

### 2. Brett: fa-27 skippt 11/13 Tests wenn PROD_DOMAIN gesetzt

`test.skip(!!process.env.PROD_DOMAIN, 'Brett API requires auth in prod')` auf Zeilen 18,32,43,51,59,65,75,83,91,108. Board-State-Read, Snapshot-CRUD, Customers, Presets — alles tot in Prod.

### 3. Collabora: 404 (Service down) → Skip

`integration-smoke.spec.ts:29-31`: `if (res.status() === 404) test.skip(true, 'Collabora not deployed')`. Office-Stack down → grün.

### 4. Talk-HPB Transkription: 100% Skip extern

`fa-18-transcription.spec.ts:4`: `TRANSCRIBER_URL` defaultet auf ClusterIP. `beforeAll` fängt Verbindungsfehler → `serviceAvailable=false` → alle 7 Tests skippen. Transcriber-Tot unsichtbar.

### 5. LiveKit: `.catch(() => null)` → toter Server = Skip

`fa-livekit.spec.ts:37-39`: `request.get(BASE).catch(() => null)` dann `if (res === null) test.skip(true)`. Pod down, DNS-Fehler → grün.

### 6. Signaling: 503 wird als PASS akzeptiert

`fa-03-video.spec.ts:31` + `integration-smoke` 2×: `expect([200,503]).toContain(status)`. 503 = NATS-Backend tot, Signaling kann keine Calls vermitteln → trotzdem grün.

### 7. Keycloak: Redirect-String-Tests ohne echten Login

`fa-15-oidc` prüft nur dass `/api/auth/login` den String `openid-connect/auth` im Location-Header hat — folgt nie dem Redirect. Keycloak könnte 503 sein → grün.

### 8. Docs: T4 prüft Keycloak-Loginpage, nicht Docs-Inhalt

`fa-13-docs.spec.ts:35-45` navigiert zu `DOCS_URL` (unauthenticated) → wird zu Keycloak redirected. Assertions (#app sichtbar, kein "500/502") bestehen auf der Keycloak-Loginpage. Docs-Content komplett down → grün.

---

## Remediation: `assertReachableOrFail` Helper

```typescript
// tests/e2e/lib/health-assertions.ts (NEU)
import { expect } from '@playwright/test';

const IS_PROD = !!process.env.PROD_DOMAIN;

export async function assertReachableOrFail(
  url: string,
  testInfo: { skip: (cond: boolean, reason: string) => void },
  opts?: { expectedStatus?: number; allowSkipInDev?: boolean }
) {
  const response = await fetch(url, { redirect: 'manual' });

  if (!response.ok && response.status !== (opts?.expectedStatus ?? 200)) {
    if (IS_PROD) {
      throw new Error(
        `Service unreachable in PROD: ${url} returned ${response.status}`
      );
    }
    if (opts?.allowSkipInDev !== false) {
      testInfo.skip(true, `Service not reachable in dev: ${url} → ${response.status}`);
    } else {
      throw new Error(`Service unreachable: ${url} → ${response.status}`);
    }
  }
  return response;
}
```

**Sanierungsregeln:**

1. **Prod:** Nicht erreichbarer Service → **immer Hard-Failure** (`throw`), nie Skip
2. **Dev:** Skip akzeptabel, aber nur als `test.fixme()`
3. **`E2E_ADMIN_PASS` muss in `e2e.yml`** — ohne das sind 35+ Specs wertlos
4. **ClusterIP-only Services** brauchen In-Cluster-Runner, nicht Playwright

---

## Statistik

| Metrik | Wert |
|---|---|
| Apps auditiert | 13 |
| `greenOnSkipRisk: high` | 12 von 13 |
| `test.skip(` insgesamt | 230× |
| Konditionale Skips | 167× |
| `E2E_ADMIN_PASS` in CI | ❌ Nicht gesetzt |
| Tatsächlich kaputt | 2 (DocuSeal /setup, Collabora urlsrc) |
| Null Coverage | 1 (Recovery Browser) |
| Konfigurationsfehler | 1 (Collabora cross-brand urlsrc) |

**Kurzgefasst:** Die Suite beweist dass HTTP-Endpunkte antworten. Sie beweist nicht dass Services funktionieren.
