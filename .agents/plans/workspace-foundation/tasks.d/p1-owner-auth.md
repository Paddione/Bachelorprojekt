---
title: p1-owner-auth — Owner-Auth-Fundament
ticket_id: T901022
domains: [website, auth]
status: ready
id: p1
role: impl
depends_on: []
target_files:
  - components/website/src/lib/owner-guard.ts
  - components/website/src/pages/owner/index.astro
  - components/website/src/pages/owner/anfragen.astro
  - components/website/src/pages/api/owner/me.ts
  - components/website/src/lib/auth.ts
---

# p1-owner-auth — Implementation Plan

Partial p1, Rolle impl, ohne depends_on. Baut das Owner-Auth-Fundament nach
freigegebenem Design: Groups-Claim-Auswertung in der Session, zentraler
`requireOwner`-Guard als pures Server-Modul, zwei minimale Owner-Seiten und
der Session-Kontext-Endpoint. Dieses Partial fasst ausschließlich die fünf
Dateien unten an.

<!-- vitest: kein neuer Test in diesem Partial nötig, weil die Abdeckung für Guard, Seiten und Endpoint im Tests-Partial p4 liegt -->

## File Structure

- `components/website/src/lib/auth.ts` Ist 340 · Schwelle 900 → Budget 560
- `components/website/src/lib/owner-guard.ts` Ist 0 (neu) · Schwelle 900 → Budget 900
- `components/website/src/pages/owner/index.astro` Ist 0 (neu) · Schwelle 1000 → Budget 1000
- `components/website/src/pages/owner/anfragen.astro` Ist 0 (neu) · Schwelle 1000 → Budget 1000
- `components/website/src/pages/api/owner/me.ts` Ist 0 (neu) · Schwelle 900 → Budget 900

## Task 1: Groups-Claim in der Session freilegen

Context. `components/website/src/lib/auth.ts` kennt heute nur synthetisierte
`realmRoles` plus Benutzernamen-Fallback. Dieser Task legt die Gruppen aus dem
Identity-Claim zusätzlich auf der Session ab, damit der Guard in Task 2 rein
über die Gruppenzugehörigkeit entscheiden kann. Die Änderung ist klein und
additiv, geplant rund 25 Zusatzzeilen, Zielstand rund 365 Zeilen bei
Schwelle 900.

Files:

- `components/website/src/lib/auth.ts`

### Steps

- [ ] `UserSession` um das optionale Feld `groups?: string[]` erweitern. Das
  Feld bleibt optional, damit alle bestehenden Session-Konstruktoren ohne
  Änderung weiter kompilieren und fehlende Gruppen fail-closed als
  Nicht-Owner zählen.
- [ ] Exportierten Helper `decodeGroupsClaim(accessToken: string): string[]`
  anlegen, gespiegelt an der verifizierten Signatur
  `decodeRealmRoles(accessToken: string): string[]`. Er liest über den
  bestehenden `decodeJwtPayload`-Pfad den `groups`-Claim des Tokens und gibt
  bei fehlendem oder anders geformtem Claim ein leeres Array zurück.
- [ ] In `exchangeCode` die Session-Gruppen befüllen: `userInfo.groups` wenn
  ein String-Array, sonst Fallback auf
  `decodeGroupsClaim(tokens.access_token)`. Typwächter mit `unknown` und
  `Array.isArray` plus Elementprüfung auf `string`, keine neuen expliziten
  any-Typen.
- [ ] Im Refresh-Pfad von `getSession` neben der bestehenden
  `realmRoles`-Neuberechnung auch `groups` aus dem frischen Access-Token neu
  ableiten, damit Gruppenwechsel spätestens beim Refresh greifen.
- [ ] `isAdmin` und die Benutzernamen-Fallbackliste unverändert lassen, der
  Owner-Pfad nutzt ausschließlich die Gruppen.

### Acceptance criteria

- `components/website/src/lib/auth.ts` exportiert `decodeGroupsClaim` und
  `UserSession` trägt `groups?: string[]`.
- `wc -l` der Datei bleibt unter Schwelle 900, Wachstum rund 25 Zeilen.
- `grep -c` für neue explizite any-Typen in der Datei meldet keinen Zuwachs
  gegenüber dem Stand vor dem Task.

## Task 2: Zentraler requireOwner-Guard als pures Modul

Context. `components/website/src/lib/owner-guard.ts` wird neu angelegt als
einzige Entscheidungsstelle für Owner-Zugriff. Serverseitig, pures Modul,
Import nur aus `./auth`, keine Rück-Importe auf DB- oder API-Schichten.
Geplant rund 110 Zeilen bei Schwelle 900, also große Wachstumsreserve.

Files:

- `components/website/src/lib/owner-guard.ts`

### Steps

- [ ] Datei mit ausschließlich diesem Import anlegen:
  ```ts
  import { getSession, type UserSession } from './auth';
  ```
- [ ] Owner-Gruppe env-basiert auflösen, ohne hartcodierte Namen im
  Verzweigungscode:
  ```ts
  const OWNER_GROUP = process.env.OWNER_GROUP ?? 'owner';
  ```
- [ ] Prädikat und Guard implementieren, beide fail-closed:
  ```ts
  export function isOwnerSession(session: UserSession | null): boolean {
    if (!session) return false;
    return session.groups?.includes(OWNER_GROUP) ?? false;
  }

  export async function requireOwner(cookieHeader: string | null): Promise<UserSession | null> {
    const session = await getSession(cookieHeader);
    if (!isOwnerSession(session)) return null;
    return session;
  }
  ```
- [ ] Business-Kontext als reine Abbildung der Session anbieten:
  ```ts
  export function ownerBusiness(session: UserSession): { brand: string | null } {
    return { brand: session.brand };
  }
  ```
- [ ] Reinheit prüfen, nur der `./auth`-Import ist erlaubt:
  ```bash
  grep -E "^import" components/website/src/lib/owner-guard.ts | grep -v "from './auth'" && exit 1 || true
  ```

### Acceptance criteria

- `components/website/src/lib/owner-guard.ts` exportiert `requireOwner`,
  `isOwnerSession` und `ownerBusiness`.
- Gast-Session, fehlende Gruppen und fremde Gruppen ergeben `null` bzw.
  `false`, nie eine Exception für Gast-Eingaben.
- Der Reinheits-Check oben findet keine Importe außer `./auth`.
- `wc -l` der Datei liegt deutlich unter Schwelle 900.

## Task 3: Minimale Owner-Seiten mit Guard

Context. `components/website/src/pages/owner/index.astro` und
`components/website/src/pages/owner/anfragen.astro` werden neu angelegt.
Beide prüfen serverseitig im Frontmatter über `requireOwner` und leiten
Gäste per `getLoginUrl` mit eigenem Pfad auf den Login weiter, analog zum
verifizierten Portal-Muster `getSession` plus `Astro.redirect`. Minimales
eigenständiges Markup ohne Layout-Import, damit keine weiteren
Dateiabhängigkeiten entstehen. Geplant je rund 70 Zeilen bei Schwelle 1000.
Die Listen-Datenanbindung der Anfragen-Seite liegt außerhalb dieses
Partials, die Seite liefert Guard plus Leerstand.

Files:

- `components/website/src/pages/owner/index.astro`
- `components/website/src/pages/owner/anfragen.astro`

### Steps

- [ ] `components/website/src/pages/owner/index.astro` anlegen. Frontmatter:
  ```astro
  ---
  import { requireOwner } from '../../lib/owner-guard';
  import { getLoginUrl } from '../../lib/auth';
  const session = await requireOwner(Astro.request.headers.get('cookie'));
  if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
  ---
  ```
  Markup darunter: Überschrift Owner-Bereich, Name und E-Mail aus der
  Session, Marke aus `session.brand`, Verweis auf die Route `/owner/anfragen`.
- [ ] `components/website/src/pages/owner/anfragen.astro` mit demselben
  Guard-Frontmatter anlegen. Markup: Überschrift Anfragen plus Liste im
  Leerstand mit Hinweis, dass noch keine Anfragen vorliegen.
- [ ] In beiden Dateien keine Client-Logik für Session-Prüfung einbauen, der
  Guard läuft ausschließlich serverseitig im Frontmatter.

### Acceptance criteria

- Beide Seiten rufen `requireOwner` mit dem Cookie-Header auf und leiten
  ohne Session per `getLoginUrl` mit eigenem Pfad weiter.
- Beide Seiten kommen ohne Importe außer Guard und Auth-Modul aus.
- `wc -l` beider Dateien liegt jeweils deutlich unter Schwelle 1000.

## Task 4: Owner-Session-Endpoint

Context. `components/website/src/pages/api/owner/me.ts` wird neu angelegt
und liefert den Owner-Session- und Business-Kontext als JSON. Unbefugte
Aufrufe erhalten 401 mit `{ authenticated: false }`. Die Antwort enthält
niemals Token-Material. Geplant rund 55 Zeilen bei Schwelle 900.

Files:

- `components/website/src/pages/api/owner/me.ts`

### Steps

- [ ] Handler im verifizierten `APIRoute`-Muster anlegen:
  ```ts
  import type { APIRoute } from 'astro';
  import { requireOwner, ownerBusiness } from '../../../lib/owner-guard';

  export const GET: APIRoute = async ({ request }) => {
    const session = await requireOwner(request.headers.get('cookie'));
    if (!session) {
      return new Response(JSON.stringify({ authenticated: false }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(
      JSON.stringify({
        authenticated: true,
        user: { sub: session.sub, email: session.email, name: session.name },
        business: ownerBusiness(session),
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };
  ```
- [ ] Token-Freiheit der Antwort sichern, dieser Check muss leer bleiben:
  ```bash
  grep -E "access_token|refresh_token" components/website/src/pages/api/owner/me.ts && exit 1 || true
  ```
- [ ] Alle vier neuen Dateien plus die Auth-Anpassung gemeinsam committen:
  ```bash
  git add components/website/src/lib/owner-guard.ts components/website/src/pages/owner/index.astro components/website/src/pages/owner/anfragen.astro components/website/src/pages/api/owner/me.ts components/website/src/lib/auth.ts
  git commit -m "feat(T901022): owner auth foundation [T901022]"
  ```

### Acceptance criteria

- `components/website/src/pages/api/owner/me.ts` exportiert `GET` als
  `APIRoute`, antwortet Gästen mit 401 und Owner-Sessions mit 200 plus
  Benutzer- und Business-Kontext.
- Der Token-Check oben findet keine Treffer in der Datei.
- `wc -l` der Datei liegt deutlich unter Schwelle 900.
- Der Commit enthält genau die fünf Dateien dieses Partials.
