# Partial p3 — Auth: fail-closed Provider-Auswahl + Vitest

> **Agent:** deepseek | **Files:** website/src/lib/auth/provider.ts, website/src/lib/auth/provider.test.ts, website/src/lib/auth.ts | **Steps:** 4
> **Verify:** `cd website && npx vitest run src/lib/auth/provider.test.ts` grün; `npx tsc --noEmit` sauber

## Scope

Die fail-closed Auth-Auswahlschicht (design.md D4): primär die lokale Pocket ID
(`http://auth.localhost` / `http://pocket-id:1411`), Fallback auf die fleet-Pocket-ID
(`https://auth.mentolder.de` über das Mesh), **beide nicht erreichbar → deny, nie eine offene
Session**. `website/src/lib/auth.ts` (bestehender OIDC-Code-Flow) bezieht seine vier
Endpoints künftig lazy über den Provider. Ohne gesetzte Fallback-Env bleibt das
Prod-Verhalten bit-identisch (Single-Provider-Pass-through).

Referenz (aktueller Stand): `website/src/lib/auth.ts` — Modul-Konstanten `PI_FRONTEND_URL`,
`PI_INTERNAL_URL`, `CLIENT_ID`, `CLIENT_SECRET`, daraus `AUTH_ENDPOINT`, `TOKEN_ENDPOINT`,
`USERINFO_ENDPOINT`, `LOGOUT_ENDPOINT`; Funktionen `getLoginUrl`, `exchangeCode`,
`getLogoutUrl`, `refreshTokens`, `getSession`. Das Modul ist CommonJS (`import pg from 'pg'`
u.a.) — Import-Stil beibehalten.

## Task List

### 1. `website/src/lib/auth/provider.ts` anlegen

- [ ] **1.1** Typ `AuthProvider { id: 'local' | 'fleet'; frontendUrl: string; internalUrl:
      string }` und Konfiguration aus Env:
      - Primary: `POCKET_ID_FRONTEND_URL` / `POCKET_ID_URL` (Default wie in auth.ts heute)
      - Fallback (optional): `POCKET_ID_FALLBACK_FRONTEND_URL` /
        `POCKET_ID_FALLBACK_URL` — **fehlt eine der beiden, ist kein Fallback konfiguriert**
        (Prod-Pfad unverändert)
- [ ] **1.2** Funktion `resolveAuthProvider(): Promise<AuthProvider>` mit:
      - Health-Probe auf den Primary (`GET <internalUrl>/api/oidc/.well-known/openid-configuration`
        oder `/health` — beim Implementieren gegen die Pocket-ID-API verifizieren, welche Route
        existiert; bei 2xx → `local`)
      - Primary nicht erreichbar UND Fallback konfiguriert → Probe auf den Fallback; bei 2xx →
        `fleet`
      - Beide nicht erreichbar (oder Fehler) → `null` (fail-closed)
      - Kurzschluss: aktiver Provider wird mit TTL (~30 s) gecacht, damit nicht jeder Request
        probe-t; Fehlschlag invalidiert den Cache sofort
- [ ] **1.3** Helper `resolveEndpoints(): Promise<{ auth: string; token: string; userinfo:
      string; logout: string }>` — bildet aus dem aktiven Provider die vier Endpoints
      (Pfad-Muster wie in auth.ts: `/authorize`, `/api/oidc/token`, `/api/oidc/userinfo`,
      `/api/oidc/end-session`); bei `null`-Provider wird ein `AuthUnavailableError` geworfen
      (darf NIE stumm einen offenen Zustand liefern)
- [ ] **1.4** Export auch `hasFallbackConfigured(): boolean` und
      `clearProviderCache()` (für Tests).

### 2. `website/src/lib/auth.ts` auf Provider umstellen

- [ ] **2.1** Die vier Modul-Konstanten `AUTH_ENDPOINT`/`TOKEN_ENDPOINT`/`USERINFO_ENDPOINT`/
      `LOGOUT_ENDPOINT` entfernen; in `getLoginUrl`, `exchangeCode`, `getLogoutUrl`,
      `refreshTokens` die Endpoints lazy über `resolveEndpoints()` auflösen (await vor dem
      fetch).
- [ ] **2.2** Fehlerpfade prüfen: `exchangeCode`/`refreshTokens` geben bei Provider-Fehler
      weiterhin `null` zurück (bestehende Signatur), **nie** einen Teilerfolg; der
      `AuthUnavailableError` wird nach außen als `null`/deny übersetzt (Login zeigt 503).
- [ ] **2.3** `CLIENT_SECRET`-Boot-Fail (T001593) und `SITE_URL`/`CALLBACK_PATH`-Logik
      unverändert lassen. `getSession`-Refresh-Fehler: einmal `clearProviderCache()` +
      Re-Select, sonst Session löschen + `null` (bestehendes Verhalten).

### 3. `website/src/lib/auth/provider.test.ts` anlegen (Vitest)

- [ ] **3.1** Fall 1 (fail-closed, Pflicht): beide Provider `fetch` schlagen fehl →
      `resolveEndpoints()` wirft `AuthUnavailableError`; `exchangeCode` (gemockter Flow)
      liefert `null`; **keine** Session-Zeile wird geschrieben (Session-Pool-Mock).
- [ ] **3.2** Fall 2: Primary down, Fallback up → aktiver Provider `fleet`, Endpoints zeigen
      auf `https://auth.mentolder.de`; Login-Flow läuft über den Fallback durch.
- [ ] **3.3** Fall 3: Primary up → aktiver Provider `local`, Endpoints auf
      `http://auth.localhost` / `http://pocket-id:1411`; kein Fallback-Kontakt.
- [ ] **3.4** Fall 4: keine Fallback-Env (Prod-Konfiguration) → `hasFallbackConfigured()`
      false, `resolveAuthProvider()` liefert `local` ohne Netzwerk-Kontakt zum Fallback.
- [ ] **3.5** `fetch`/`pg` in Tests mocken (vi.mock); `clearProviderCache()` in `beforeEach`
      aufrufen.

### 4. Verifikation

- [ ] **4.1** `cd website && npx vitest run src/lib/auth/provider.test.ts` — alle vier Fälle
      grün (vorher rot, da Datei fehlt).
- [ ] **4.2** `cd website && npx tsc --noEmit` — keine neuen Fehler in `auth.ts`/`provider.ts`.
- [ ] **4.3** Bestehende Auth-Tests: `cd website && npx vitest run src/lib/auth.test.ts` —
      unverändert grün (Prod-Pfad-Äquivalenz).

## Verify

```bash
cd website && npx vitest run src/lib/auth/provider.test.ts   # 4/4 grün
cd website && npx vitest run src/lib/auth.test.ts            # unverändert grün
cd website && npx tsc --noEmit                               # sauber
```
