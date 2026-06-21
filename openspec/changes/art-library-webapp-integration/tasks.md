---
title: Art Library — Brand-Asset-Vokabular in Webapp importieren
ticket_id: T001033
domains: [website]
status: active
date: 2026-06-21
spec_ref: docs/superpowers/specs/2026-06-21-art-library-webapp-integration-design.md
openspec_ref: openspec/changes/art-library-webapp-integration/
file_locks: []
shared_changes: false
batch_id: null
parent_feature: null
depends_on_plans: []
---

# Art Library Webapp Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Das vorhandene mentolder Brand-Asset-Vokabular (`art-library/sets/mentolder/portfolio/`: 3 Archetypen, 6 Props, 6 Terrain, 5 Logos) in der Website materialisieren, in Hero + ServiceRow verdrahten und in einer Admin-Galerie browse-bar machen — analog zum bereits vollständigen korczewski-Muster.

**Architecture:** Rein statische Assets — SVGs werden als committed files nach `website/public/brand/mentolder/` kopiert (kein K8s-ConfigMap-Mount; `website/public/` wird beim Docker-Build ins Image gelegt). Ein per Hand gebautes SVG-Sprite (`icons.svg`) liefert die Service-Icons via `<use href=…#prop-*>`. Die Admin-Galerie liest das Manifest serverseitig über einen neuen `/api/admin/art-library` Endpoint und rendert es in einer Svelte-Komponente, die den bestehenden E2E-Kontrakt aus `tests/e2e/specs/dashboard-art.spec.ts` (`.art-grid`/`.art-card`/`.art-panel`/`.art-palette-row`/`.art-empty`) erfüllt.

**Tech Stack:** Astro + Svelte 5 (Runes), TypeScript (`APIRoute`), BATS, Playwright; statische SVG-Sprites; `jq`/`node` für Manifest-Validierung.

## Global Constraints

- **S1 Zeilenlimits (wirksame Schwelle = statisches Limit, da alle drei geänderten Dateien NICHT-baselined sind):**
  - `website/src/config/brands/mentolder.ts` — Ist **423** · Limit `.ts` = **600** → Budget **+177**.
  - `website/src/components/ServiceRow.svelte` — Ist **280** · Limit `.svelte` = **500** → Budget **+220**.
  - `tests/unit/test_art_library_manifest.bats` — Ist **20** · Limit `.bash` (BATS) = **300** → Budget reichlich.
  - Neue Dateien mit Wachstumsreserve unter dem jeweiligen Limit schneiden: `ArtLibrary.svelte` (.svelte ≤ 500), `art-library.ts` (.ts ≤ 600), `assets.astro` (.astro ≤ 400, Ist 17).
- **S2 Import-Zyklen:** Der neue API-Endpoint liest das Manifest mit `node:fs` als pure Lese-Logik; **kein** Rück-Import von API-/DB-Schichten in Helper. `ArtLibrary.svelte` holt Daten ausschließlich per `fetch('/api/admin/art-library')` (gleiches Muster wie `AssetGallery.svelte`) — kein direkter Import des Manifests in die Svelte-Komponente.
- **S3 Hardcodierte Hostnamen:** In `website/src/` sind `*.mentolder.de`/`*.korczewski.de` String-Literale verboten. Dieser Plan referenziert NUR relative Pfade (`/brand/mentolder/...`, `/api/admin/art-library`) — keine Brand-Domains in Code.
- **S4 Orphan:** Keine neuen `k3d/*.yaml` oder `scripts/*.sh`/`*.mjs`. Die neue API-Route (`pages/api/...`) und Svelte-Komponente werden von Astro auto-discovered bzw. von `assets.astro` importiert — kein Orphan-Risiko.
- **Manifest ist SSOT, kein Code-Duplikat:** Asset-Liste, Namen, Tags, Palette werden **ausschließlich** aus `art-library/sets/mentolder/manifest.json` gelesen (serverseitig im API-Endpoint). Niemals die Asset-Liste in TS hardcoden.
- **Pfad-Auflösung Manifest → Datei:** Im `manifest.json` referenzieren die `files.*`-Werte FLAT-Namen (`characters_digital50.portrait.svg`, `props_compass.svg`). Die echten Dateien liegen subdir-basiert unter `portfolio/{kind}/{name}` (`portfolio/characters/digital50.portrait.svg`). Die Auflösungsregel ist exakt die aus `art-library/_tooling/validate-manifest.mjs`: `flatname.match(/^([a-z]+)_(.+)$/)` → `{group1}/{group2}` unter `portfolio/`. Public-URL-Mapping daraus: `/brand/mentolder/{group1}/{group2}`.
- **TypeScript-Typen existieren bereits:** `website/src/config/types.ts:55` hat `iconSpriteId?: string`, `:138` `avatarType: 'image' | 'initials'`, `:139` `avatarSrc?: string`. **Keine Type-Änderung nötig** in Phase 3.
- **Bestehende Tests erweitern statt neu anlegen:** Der BATS-Test wird in `tests/unit/test_art_library_manifest.bats` ergänzt (existiert). Der E2E-Spec `tests/e2e/specs/dashboard-art.spec.ts` existiert und wird angepasst (siehe Phase 5).

---

## File Structure

| Path | Type | Purpose |
|------|------|---------|
| `website/public/brand/mentolder/characters/*.svg` | new (copy) | 6 Archetyp-SVGs (portrait+figurine × 3), kopiert aus `portfolio/characters/` |
| `website/public/brand/mentolder/props/*.svg` | new (copy) | 6 Prop-SVGs, kopiert aus `portfolio/props/` |
| `website/public/brand/mentolder/terrain/*.svg` | new (copy) | 6 Terrain-Swatches, kopiert aus `portfolio/terrain/` |
| `website/public/brand/mentolder/logos/*.svg` | new (copy) | 5 Logo-SVGs, kopiert aus `portfolio/logos/` |
| `website/public/brand/mentolder/icons.svg` | new | SVG-Sprite mit 6 `<symbol id="prop-*">` — Service-Icons via `<use>` |
| `website/src/config/brands/mentolder.ts` | modify | `services[].iconSpriteId` befüllen; `homepage.avatarSrc` → Portrait |
| `website/src/components/ServiceRow.svelte` | modify | Default-Fallback `iconSpriteBrand` von hardcode `'korczewski'` auf `undefined`-sicheren Wert (kosmetischer Robustheits-Fix) |
| `website/src/pages/api/admin/art-library.ts` | new | GET-Endpoint: liest Manifest serverseitig, gibt `{brand, assets[]}` zurück |
| `website/src/components/admin/ArtLibrary.svelte` | new | Galerie: `.art-grid`/`.art-card`/`.art-panel`/`.art-palette-row`/`.art-empty` |
| `website/src/pages/admin/assets.astro` | modify | Art-Library als zweiter Tab/Bereich neben AssetGallery einbinden |
| `tests/unit/test_art_library_manifest.bats` | modify | mentolder-Set-@tests analog zu korczewski |
| `tests/e2e/specs/dashboard-art.spec.ts` | modify | Erwartung umkehren: mentolder ist jetzt POPULATED (nicht mehr `.art-empty`) |

---

## Strategie-Entscheidungen (verbindlich)

1. **Kein ConfigMap-Mount.** `website/public/` landet beim Docker-Build im Image. K8s-Manifeste (`k3d/kustomization.yaml`, `k3d/website.yaml`) werden NICHT geändert. Bestätigt durch korczewski-Precedent (rein statische Dateien in `website/public/brand/korczewski/`).

2. **E2E-Kontrakt-Konflikt — AUFLÖSUNG:** Der bestehende `dashboard-art.spec.ts` enthält einen Test `'mentolder context shows empty-state (no art library)'`, der `.art-empty` für mentolder erwartet. Das **widerspricht** dem Ticket-Ziel (mentolder SOLL bestückt sein). Da dieses Ticket mentolder explizit bestückt, wird dieser Test in Phase 5 umgekehrt: mentolder rendert jetzt `.art-grid`/`.art-card`. Das `.art-empty`-Markup bleibt in der Komponente als Fallback für einen Brand OHNE Manifest (z. B. künftige Brands) erhalten und wird vom verbleibenden Empty-Pfad (API-`catch`) abgedeckt. **Hinweis:** `E2E PR` ist kein required check (siehe CLAUDE.md) → kein Merge-Block, aber wir halten den Spec konsistent.

3. **ServiceRow-„Bug":** `index.astro:120` übergibt bereits explizit `iconSpriteBrand={BRAND_ID}`. Der Hardcode-Default `'korczewski'` (ServiceRow.svelte:33) greift also im Produktivpfad nie. Der Fix ist daher rein defensiv (Robustheit, falls die Prop künftig weggelassen wird) und zeilenneutral — kein Verhaltenswechsel im aktuellen Aufrufpfad.

4. **Manifest-Validator validiert ALLE Sets gleichzeitig** (kein Per-Set-Argument). `validate-manifest.mjs` ohne Argument deckt mentolder automatisch mit ab, sobald die Dateien existieren. Der BATS-Test ruft ihn ohne Argument auf (so wie der bestehende korczewski-Test).

---

## ADD ServiceRow defensive sprite-brand fallback

### Requirement: ServiceRow fällt ohne explizite Brand-Prop nicht auf einen Fremd-Brand zurück

#### Scenario: iconSpriteBrand-Prop fehlt
- **WHEN** `ServiceRow` mit gesetztem `iconSpriteId` aber ohne `iconSpriteBrand` gerendert wird
- **THEN** der `<use href>` zeigt NICHT hartcodiert auf `/brand/korczewski/icons.svg`, sondern das Icon wird übersprungen/leer gerendert (kein Cross-Brand-Leak)

### Task 1: ServiceRow defensive sprite-brand handling

**Files:**
- Modify: `website/src/components/ServiceRow.svelte:33` (Default-Wert von `iconSpriteBrand`) und der `{#if iconSpriteId}`-Block bei `:45-47`

**Interfaces:**
- Consumes: nichts aus früheren Tasks.
- Produces: das Verhalten „Sprite wird nur gerendert, wenn `iconSpriteId` UND `iconSpriteBrand` gesetzt sind". `index.astro` füllt beide weiterhin.

- [ ] **Step 0: Failing-Test (Red) — Assets noch nicht materialisiert**

  Bevor Assets und Sprite existieren, müssen diese Tests FEHLSCHLAGEN. Das zeigt, dass die Implementierung in Tasks 2–9 tatsächlich etwas ändert (TDD-Red-Schritt).

  Run:
  ```bash
  test -d website/public/brand/mentolder/characters && echo "EXISTS — unexpected!" && exit 1 || echo "OK: characters dir not yet present (expected FAIL)"
  test -f website/public/brand/mentolder/icons.svg && echo "EXISTS — unexpected!" && exit 1 || echo "OK: icons.svg not yet present (expected FAIL)"
  ```
  Expected: **Exit 1 erwartet** — beide `test`-Befehle schlagen fehl (Verzeichnis/Datei existiert noch nicht). Dieser Schritt ist der Red-Zustand; er wird nach Task 2 und Task 3 grün. Falls das Verzeichnis bereits existiert, ist dieser Schritt zu überspringen und der Plan-Fortschritt ab Task 3 fortzusetzen.

- [ ] **Step 1: Datei lesen, Ist-Zustand bestätigen**

Run: `sed -n '28,50p' website/src/components/ServiceRow.svelte`
Expected: `iconSpriteBrand = 'korczewski'` in der Props-Destrukturierung (~Zeile 33) und ein `{#if iconSpriteId}`-Block mit `<use href={`/brand/${iconSpriteBrand}/icons.svg#${iconSpriteId}`}>`.

- [ ] **Step 2: Default-Hardcode entfernen**

Ändere die Props-Destrukturierung von:
```svelte
    iconSpriteBrand = 'korczewski',
```
zu (kein Default — Prop bleibt `undefined`, wenn nicht übergeben):
```svelte
    iconSpriteBrand,
```

- [ ] **Step 3: Render-Guard auf beide Props erweitern**

Ändere den Block von:
```svelte
    {#if iconSpriteId}
      <svg class="row-icon" viewBox="0 0 24 24" aria-hidden="true">
        <use href={`/brand/${iconSpriteBrand}/icons.svg#${iconSpriteId}`}></use>
```
zu:
```svelte
    {#if iconSpriteId && iconSpriteBrand}
      <svg class="row-icon" viewBox="0 0 24 24" aria-hidden="true">
        <use href={`/brand/${iconSpriteBrand}/icons.svg#${iconSpriteId}`}></use>
```

- [ ] **Step 4: Zeilenneutralität prüfen (S1)**

Run: `wc -l website/src/components/ServiceRow.svelte`
Expected: weiterhin **280** Zeilen (rein textuelle Änderungen, keine neuen Zeilen). Budget bleibt klar unter Limit 500.

- [ ] **Step 5: Commit**

```bash
git add website/src/components/ServiceRow.svelte
git commit -m "fix(website): ServiceRow renders sprite icon only when brand is set"
```

---

## ADD mentolder static brand assets

### Requirement: Alle 19 mentolder-Assets sind als statische Dateien unter website/public/brand/mentolder ausgeliefert

#### Scenario: Asset-Datei wird per URL angefragt
- **WHEN** der Browser `/brand/mentolder/characters/leadership.portrait.svg` (oder ein beliebiges Manifest-Asset) lädt
- **THEN** die Datei existiert im Build und liefert das SVG aus `portfolio/`

### Task 2: SVG-Assets materialisieren

**Files:**
- Create (copy): `website/public/brand/mentolder/characters/*.svg` (6 Dateien)
- Create (copy): `website/public/brand/mentolder/props/*.svg` (6 Dateien)
- Create (copy): `website/public/brand/mentolder/terrain/*.svg` (6 Dateien)
- Create (copy): `website/public/brand/mentolder/logos/*.svg` (5 Dateien)

**Interfaces:**
- Consumes: nichts.
- Produces: URL-Pfade `/brand/mentolder/{characters,props,terrain,logos}/<file>.svg`. Diese URLs werden in Task 4 (Config) und Task 5 (API → Galerie) referenziert. Die Subdir-Namen (`characters`/`props`/`terrain`/`logos`) entsprechen exakt dem `match`-`group1` aus der Manifest-Flat-Name-Auflösung.

- [ ] **Step 1: Quell-Layout bestätigen**

Run: `find art-library/sets/mentolder/portfolio -name '*.svg' | sort`
Expected: 23 SVGs (6 characters, 6 props, 6 terrain, 5 logos). Hinweis: characters hat 6 SVGs (portrait+figurine × 3 Archetypen).

- [ ] **Step 2: Zielverzeichnisse anlegen und kopieren**

```bash
mkdir -p website/public/brand/mentolder/characters \
         website/public/brand/mentolder/props \
         website/public/brand/mentolder/terrain \
         website/public/brand/mentolder/logos
cp art-library/sets/mentolder/portfolio/characters/*.svg website/public/brand/mentolder/characters/
cp art-library/sets/mentolder/portfolio/props/*.svg      website/public/brand/mentolder/props/
cp art-library/sets/mentolder/portfolio/terrain/*.svg    website/public/brand/mentolder/terrain/
cp art-library/sets/mentolder/portfolio/logos/*.svg      website/public/brand/mentolder/logos/
```

- [ ] **Step 3: Vollständigkeit verifizieren**

Run:
```bash
echo "characters: $(ls website/public/brand/mentolder/characters/*.svg | wc -l) (erwartet 6)"
echo "props:      $(ls website/public/brand/mentolder/props/*.svg | wc -l) (erwartet 6)"
echo "terrain:    $(ls website/public/brand/mentolder/terrain/*.svg | wc -l) (erwartet 6)"
echo "logos:      $(ls website/public/brand/mentolder/logos/*.svg | wc -l) (erwartet 5)"
```
Expected: `6 / 6 / 6 / 5` (23 SVG-Dateien gesamt).

- [ ] **Step 4: Portrait-Existenz für Hero bestätigen (wird in Task 4 verdrahtet)**

Run: `test -f website/public/brand/mentolder/characters/leadership.portrait.svg && echo OK`
Expected: `OK`

- [ ] **Step 5: Commit**

```bash
git add website/public/brand/mentolder/characters website/public/brand/mentolder/props \
        website/public/brand/mentolder/terrain website/public/brand/mentolder/logos
git commit -m "feat(website): materialize mentolder brand SVG assets into public/"
```

---

## ADD mentolder service icon sprite

### Requirement: Ein SVG-Sprite liefert die 6 Prop-Icons als referenzierbare Symbole

#### Scenario: ServiceRow referenziert ein Prop-Symbol
- **WHEN** `<use href="/brand/mentolder/icons.svg#prop-compass">` gerendert wird
- **THEN** das Sprite definiert ein `<symbol id="prop-compass" viewBox="0 0 24 24">` und das Icon erscheint in `currentColor`

### Task 3: icons.svg Sprite bauen

**Files:**
- Create: `website/public/brand/mentolder/icons.svg`
- Reference: `website/public/brand/korczewski/icons.svg` (Format-Vorlage), `art-library/sets/mentolder/portfolio/props/*.svg` (Quell-Pfade)

**Interfaces:**
- Consumes: die 6 Prop-SVGs aus Task 2 (`website/public/brand/mentolder/props/{compass,handshake,briefcase,bookmark,chat,spark}.svg`).
- Produces: Sprite mit exakt diesen Symbol-IDs (referenziert in Task 4): `prop-compass`, `prop-handshake`, `prop-briefcase`, `prop-bookmark`, `prop-chat`, `prop-spark`.

- [ ] **Step 1: Format-Vorlage + Quell-Inhalte inspizieren**

Run:
```bash
head -25 website/public/brand/korczewski/icons.svg
echo '--- compass source ---'
cat website/public/brand/mentolder/props/compass.svg
```
Expected: korczewski nutzt `<svg ... style="display:none" aria-hidden="true">` als Root mit `<symbol id="…" viewBox="0 0 24 24" fill="none" stroke="currentColor" …>`. Die Prop-Quell-SVGs liefern die Pfad-Geometrie pro Icon.

- [ ] **Step 2: Sprite-Datei schreiben**

Erzeuge `website/public/brand/mentolder/icons.svg`. Pro Prop wird der **innere Geometrie-Inhalt** (die `<path>`/`<line>`/`<circle>`-Elemente) der jeweiligen Quell-SVG aus `website/public/brand/mentolder/props/<name>.svg` in ein `<symbol>` übernommen. Root-Attribute `width`/`height` werden NICHT gesetzt; Stroke via `currentColor`. Gerüst (die `…INNER…`-Platzhalter durch den jeweiligen inneren SVG-Inhalt aus Step 1 ersetzen):

```svg
<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
  <!--
    Mentolder service icon sprite.
    Each symbol is 24x24, stroke=currentColor. Geometry copied from
    /brand/mentolder/props/<name>.svg. Reference via
    <svg><use href="/brand/mentolder/icons.svg#prop-name"/></svg>.
  -->
  <symbol id="prop-compass" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    …INNER von props/compass.svg…
  </symbol>
  <symbol id="prop-handshake" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    …INNER von props/handshake.svg…
  </symbol>
  <symbol id="prop-briefcase" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    …INNER von props/briefcase.svg…
  </symbol>
  <symbol id="prop-bookmark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    …INNER von props/bookmark.svg…
  </symbol>
  <symbol id="prop-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    …INNER von props/chat.svg…
  </symbol>
  <symbol id="prop-spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
    …INNER von props/spark.svg…
  </symbol>
</svg>
```

> **Hinweis zum `viewBox`:** Wenn eine Quell-Prop-SVG einen anderen `viewBox` als `0 0 24 24` deklariert, übernimm DEREN `viewBox` in das jeweilige `<symbol>` (nicht blind `0 0 24 24`), damit die Geometrie nicht abgeschnitten wird. In Step 1 prüfen.

- [ ] **Step 3: Sprite-Wohlgeformtheit prüfen**

Run:
```bash
node -e "const fs=require('fs');const s=fs.readFileSync('website/public/brand/mentolder/icons.svg','utf8');const ids=[...s.matchAll(/<symbol id=\"([^\"]+)\"/g)].map(m=>m[1]);console.log(ids.join(','));if(ids.length!==6)process.exit(1);"
```
Expected: `prop-compass,prop-handshake,prop-briefcase,prop-bookmark,prop-chat,prop-spark` (genau 6 Symbole).

- [ ] **Step 4: Commit**

```bash
git add website/public/brand/mentolder/icons.svg
git commit -m "feat(website): add mentolder prop icon sprite (6 symbols)"
```

---

## MODIFY mentolder brand config to use brand assets

### Requirement: Hero und ServiceRow nutzen die mentolder Brand-Assets statt Emoji/Foto-Platzhalter

#### Scenario: Homepage rendert Hero-Avatar
- **WHEN** die mentolder-Homepage gerendert wird
- **THEN** `homepage.avatarType === 'image'` und `homepage.avatarSrc` zeigt auf den Leadership-Archetyp-Portrait

#### Scenario: Service-Kachel rendert Icon
- **WHEN** eine der 5 Service-Kacheln gerendert wird
- **THEN** `iconSpriteId` ist gesetzt und das Prop-SVG erscheint (Emoji `icon` bleibt als Fallback im Config-Objekt)

### Task 4: mentolder.ts verdrahten

**Files:**
- Modify: `website/src/config/brands/mentolder.ts` — `homepage.avatarSrc` (~Zeile 81) und die 5 `services[].iconSpriteId` (bei den `icon:`-Emoji-Einträgen ~Zeile 92/134/174/215/249)

**Interfaces:**
- Consumes: Sprite-Symbol-IDs aus Task 3 (`prop-compass` etc.); Portrait-URL aus Task 2.
- Produces: `services[i].iconSpriteId` Werte, die `index.astro:118` (`iconSpriteId={service.iconSpriteId}`) an `ServiceRow` durchreicht. `homepage.avatarSrc`, das `index.astro` als `avatarType`/`avatarSrc` an die Hero-Komponente gibt.

- [ ] **Step 1: Ist-Zustand der relevanten Stellen lesen**

Run:
```bash
sed -n '78,95p' website/src/config/brands/mentolder.ts
grep -n "icon:" website/src/config/brands/mentolder.ts
```
Expected: `avatarType: 'image'`, `avatarSrc: '/gerald.jpg'` (~80-81) und 5 Service-Einträge mit `icon: '💻' / '🎯' / '🦭' / '🏢' / '🤖'` (Zeilen ~92/134/174/215/249; die weiteren `icon:`-Treffer ab ~290 gehören zu einer anderen Struktur — NICHT anfassen, nur die 5 im `services:`-Array ab Zeile 87).

- [ ] **Step 2: Hero-Portrait verdrahten**

Ändere:
```ts
    avatarSrc: '/gerald.jpg',
```
zu:
```ts
    avatarSrc: '/brand/mentolder/characters/leadership.portrait.svg',
```
(`avatarType: 'image'` bleibt unverändert — war bereits gesetzt.)

- [ ] **Step 3: iconSpriteId pro Service ergänzen (Emoji-`icon` bleibt erhalten)**

Füge in jedem der 5 Service-Objekte im `services:`-Array (ab Zeile 87) **neben** dem bestehenden `icon:`-Feld ein `iconSpriteId:` ein. Semantik-Mapping (Emoji dient nur der eindeutigen Zuordnung):

| Service-Emoji | bedeutet | iconSpriteId |
|---|---|---|
| `💻` (Digital/50+) | Orientierung/Strategie | `prop-compass` |
| `🎯` (Coaching/Sparring) | Begleitung | `prop-handshake` |
| `🦭` (Erstgespräch/Kontakt) | Erstgespräch | `prop-chat` |
| `🏢` (Beratung/Unternehmen) | Beratung | `prop-briefcase` |
| `🤖` (Transfer/Veränderung) | Veränderung | `prop-spark` |

Beispiel für den ersten Service-Eintrag (analog für alle 5 — `icon` NICHT entfernen):
```ts
      icon: '💻',
      iconSpriteId: 'prop-compass',
```

> **Zuordnungs-Verifikation beim Implementieren:** Lies pro Service `title`/`description`, um Emoji↔Bedeutung zu bestätigen, falls die Reihenfolge von obiger Annahme abweicht. Die 6. Prop `prop-bookmark` (Methode) bleibt ungenutzt — es gibt nur 5 Services; das ist erwartet (kein Fehler).

- [ ] **Step 4: Vitest (geänderte Domain) — Config bleibt valide**

Run:
```bash
cd website && npx vitest run --changed 2>&1 | tail -20; cd ..
```
Expected: keine neuen Fehler (falls Config-Snapshot/Typ-Tests existieren, bleiben sie grün). Wenn `--changed` nichts findet, fällt der Schritt in Task 10 (`task test:changed`) ohnehin nochmal an — hier nur Smoke.

- [ ] **Step 5: S1-Budget prüfen**

Run: `wc -l website/src/config/brands/mentolder.ts`
Expected: ~428 (423 + 5 `iconSpriteId`-Zeilen) — weit unter Limit 600.

- [ ] **Step 6: Commit**

```bash
git add website/src/config/brands/mentolder.ts
git commit -m "feat(website): wire mentolder hero portrait + service sprite icons"
```

---

## ADD admin art-library API endpoint

### Requirement: Ein authentifizierter GET-Endpoint liefert das mentolder-Manifest als JSON

#### Scenario: Admin ruft den Endpoint auf
- **WHEN** ein eingeloggter Admin `GET /api/admin/art-library` aufruft
- **THEN** die Antwort ist `{ brand: "mentolder", assets: Asset[] }` mit 19 Assets, jedes mit aufgelösten Public-URLs in `files`

#### Scenario: Nicht-Admin ruft den Endpoint auf
- **WHEN** ein nicht-authentifizierter/nicht-Admin-Request kommt
- **THEN** der Endpoint antwortet `401`

### Task 5: art-library.ts Endpoint

**Files:**
- Create: `website/src/pages/api/admin/art-library.ts`
- Reference: `website/src/pages/api/admin/assets.ts` (Auth-Pattern), `art-library/_tooling/validate-manifest.mjs` (Flat-Name-Auflösung)

**Interfaces:**
- Consumes: `getSession`/`isAdmin` aus `../../../lib/auth`; das Manifest auf Disk unter `art-library/sets/mentolder/manifest.json`.
- Produces: JSON-Shape `{ brand: string; tokens: Record<string,string>; assets: Array<{ id: string; kind: string; name_de: string; name_en: string; tags: string[]; palette?: Record<string,string>; animated?: boolean; files: Record<string, string> }> }`, wobei jeder `files`-Wert eine **öffentliche URL** ist (`/brand/mentolder/{kind-dir}/{name}`). Dieser Shape wird in Task 6 von `ArtLibrary.svelte` konsumiert.

- [ ] **Step 1: Auth-Pattern aus assets.ts bestätigen**

Run: `sed -n '1,22p' website/src/pages/api/admin/assets.ts`
Expected: `import type { APIRoute }`, `getSession`/`isAdmin` aus `../../../lib/auth`, `401` bei fehlendem Admin, JSON-Response mit `Content-Type: application/json`.

- [ ] **Step 2: Endpoint schreiben**

Erstelle `website/src/pages/api/admin/art-library.ts`. Das Manifest wird zur Laufzeit (Node SSR) mit `node:fs` von Disk gelesen — Pfad relativ zum Repo-Root über `process.cwd()` (Astro SSR läuft mit cwd=Projektwurzel `website/`, daher `../art-library/...`). Flat-Name → URL-Auflösung exakt wie im Validator:

```ts
import type { APIRoute } from 'astro';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getSession, isAdmin } from '../../../lib/auth';

const BRAND = 'mentolder';
// website/ is the Astro project root (process.cwd()); the repo root is one level up.
const MANIFEST_PATH = resolve(process.cwd(), '..', 'art-library', 'sets', BRAND, 'manifest.json');

// Flat manifest name (e.g. "props_compass.svg") -> public URL
// (/brand/mentolder/props/compass.svg). Mirrors validate-manifest.mjs.
function toPublicUrl(flat: string): string {
  const m = flat.match(/^([a-z]+)_(.+)$/);
  if (!m) return `/brand/${BRAND}/${flat}`;
  return `/brand/${BRAND}/${m[1]}/${m[2]}`;
}

export const GET: APIRoute = async ({ request }) => {
  const session = await getSession(request.headers.get('cookie'));
  if (!session || !isAdmin(session)) return new Response('Unauthorized', { status: 401 });

  try {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
    const assets = (manifest.assets ?? []).map((a: any) => ({
      ...a,
      files: Object.fromEntries(
        Object.entries(a.files ?? {}).map(([slot, rel]) => [slot, toPublicUrl(String(rel))]),
      ),
    }));
    return new Response(
      JSON.stringify({ brand: manifest.brand ?? BRAND, tokens: manifest.tokens ?? {}, assets }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch {
    // No manifest for this brand -> empty library (drives .art-empty in the UI).
    return new Response(JSON.stringify({ brand: BRAND, tokens: {}, assets: [] }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
```

> **cwd-Annahme verifizieren:** Falls `process.cwd()` zur Build-/SSR-Zeit NICHT `website/` ist, schlägt `readFileSync` fehl und der `catch` liefert eine leere Library (→ fälschlich `.art-empty`). In Step 3 mit einem Node-Smoke-Test gegen den aufgelösten Pfad absichern; bei Abweichung den `MANIFEST_PATH` anpassen (z. B. ohne `'..'`, falls cwd=Repo-Root).

- [ ] **Step 3: Pfad-Auflösung smoke-testen**

Run (aus `website/`, simuliert SSR-cwd):
```bash
cd website && node -e "const p=require('path').resolve(process.cwd(),'..','art-library','sets','mentolder','manifest.json');const fs=require('fs');const m=JSON.parse(fs.readFileSync(p,'utf8'));console.log('assets:',m.assets.length);if(m.assets.length!==19)process.exit(1);"; cd ..
```
Expected: `assets: 19`. Falls Fehler „no such file": `MANIFEST_PATH` in Step 2 korrigieren (cwd-Annahme war falsch).

- [ ] **Step 4: TypeScript-Check (geänderte Domain)**

Run: `cd website && npx astro check --minimumSeverity error 2>&1 | tail -15; cd ..`
Expected: keine neuen Type-Errors für `art-library.ts`. (Falls `astro check` projektweit zu rauschig ist, ist das endgültige Gate `task test:changed` in Task 10.)

- [ ] **Step 5: Commit**

```bash
git add website/src/pages/api/admin/art-library.ts
git commit -m "feat(website): add /api/admin/art-library manifest endpoint"
```

---

## ADD admin art-library gallery component

### Requirement: Die Admin-Galerie rendert Assets als Karten mit Detail-Panel und Palette

#### Scenario: Galerie lädt und rendert Karten
- **WHEN** die Komponente mountet und der API-Endpoint Assets liefert
- **THEN** `.art-grid` enthält ≥1 `.art-card`

#### Scenario: Karte wird geklickt
- **WHEN** eine `.art-card` geklickt wird
- **THEN** `.art-panel` öffnet sich und enthält ≥1 `.art-palette-row` (Farb-Swatches aus `asset.palette`)

#### Scenario: Brand ohne Manifest
- **WHEN** der Endpoint `assets: []` liefert
- **THEN** `.art-empty` mit Text „Keine Kunstbibliothek konfiguriert / No art library configured" wird gerendert

### Task 6: ArtLibrary.svelte

**Files:**
- Create: `website/src/components/admin/ArtLibrary.svelte`
- Reference: `website/src/components/admin/AssetGallery.svelte` (fetch-Pattern, ~Zeile 24)

**Interfaces:**
- Consumes: `GET /api/admin/art-library` (JSON-Shape aus Task 5: `{brand, tokens, assets[]}`, `files` als Public-URLs).
- Produces: DOM-Kontrakt für E2E (Task 8) — CSS-Klassen `.art-grid`, `.art-card`, `.art-panel`, `.art-palette-row`, `.art-empty`. Wird von `assets.astro` (Task 7) eingebunden.

- [ ] **Step 1: fetch-Pattern aus AssetGallery bestätigen**

Run: `sed -n '1,40p' website/src/components/admin/AssetGallery.svelte`
Expected: Svelte-Komponente, die in `onMount`/einem Effekt `fetch('/api/admin/assets')` aufruft und das Ergebnis in lokalem State hält. Dasselbe Muster für `/api/admin/art-library` übernehmen (Svelte 5 Runes: `$state`).

- [ ] **Step 2: Komponente schreiben**

Erstelle `website/src/components/admin/ArtLibrary.svelte` (Svelte 5 Runes). Pflicht: die 5 CSS-Klassen aus dem E2E-Kontrakt. Empty-State-Text muss `/No art library configured|Keine Kunstbibliothek/` matchen (E2E-Regex):

```svelte
<script lang="ts">
  type Asset = {
    id: string; kind: string; name_de: string; name_en: string;
    tags: string[]; palette?: Record<string, string>;
    animated?: boolean; files: Record<string, string>;
  };

  let assets = $state<Asset[]>([]);
  let selected = $state<Asset | null>(null);
  let loaded = $state(false);

  async function load() {
    try {
      const res = await fetch('/api/admin/art-library');
      const data = await res.json();
      assets = Array.isArray(data?.assets) ? data.assets : [];
    } catch {
      assets = [];
    } finally {
      loaded = true;
    }
  }

  $effect(() => { load(); });

  // Pick the most representative file URL for a card thumbnail.
  function thumb(a: Asset): string | null {
    return a.files.icon ?? a.files.portrait ?? a.files.swatch ?? a.files.svg ?? null;
  }
</script>

{#if loaded && assets.length === 0}
  <div class="art-empty">Keine Kunstbibliothek konfiguriert — No art library configured.</div>
{:else}
  <div class="art-grid">
    {#each assets as a (a.id)}
      <button class="art-card" type="button" onclick={() => (selected = a)}>
        {#if thumb(a)}
          <img src={thumb(a)} alt={a.name_de} loading="lazy" />
        {/if}
        <span class="art-card-name">{a.name_de}</span>
      </button>
    {/each}
  </div>

  {#if selected}
    <aside class="art-panel">
      <button class="art-panel-close" type="button" onclick={() => (selected = null)}>×</button>
      <h3>{selected.name_de} <small>{selected.name_en}</small></h3>
      <p class="art-panel-tags">{selected.tags.join(' · ')}</p>
      {#if selected.palette}
        <div class="art-palette">
          {#each Object.entries(selected.palette) as [name, hex]}
            <div class="art-palette-row">
              <span class="art-swatch" style={`background:${hex}`}></span>
              <span class="art-palette-name">{name}</span>
              <span class="art-palette-hex">{hex}</span>
            </div>
          {/each}
        </div>
      {/if}
    </aside>
  {/if}
{/if}

<style>
  .art-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr)); gap: 0.75rem; }
  .art-card { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; padding: 0.6rem; border: 1px solid var(--border, #2a3343); border-radius: 0.6rem; background: transparent; cursor: pointer; }
  .art-card img { width: 100%; height: 5rem; object-fit: contain; }
  .art-card-name { font-size: 0.78rem; text-align: center; }
  .art-panel { position: fixed; top: 0; right: 0; width: min(22rem, 90vw); height: 100%; padding: 1.25rem; background: var(--panel-bg, #0d1420); border-left: 1px solid var(--border, #2a3343); overflow-y: auto; }
  .art-panel-close { position: absolute; top: 0.75rem; right: 0.75rem; background: none; border: none; font-size: 1.4rem; cursor: pointer; color: inherit; }
  .art-palette-row { display: flex; align-items: center; gap: 0.6rem; margin: 0.3rem 0; }
  .art-swatch { width: 1.2rem; height: 1.2rem; border-radius: 0.3rem; border: 1px solid rgba(255,255,255,0.15); }
  .art-palette-hex { margin-left: auto; font-family: monospace; font-size: 0.78rem; opacity: 0.8; }
  .art-empty { padding: 2rem; text-align: center; opacity: 0.7; }
</style>
```

> **Hinweis Palette-Abdeckung:** Nur `character`-Assets haben `palette` im Manifest. Beim Klick auf eine Prop/Terrain/Logo-Karte (keine Palette) wird `.art-palette-row` nicht gerendert — der E2E-Test `'clicking a card opens the side panel with palette swatches'` klickt `.art-card` **nth(0)**, und das erste Asset im Manifest (`digital50`, character) HAT eine Palette. Reihenfolge daher beibehalten (Characters zuerst im Manifest) — der Test bleibt grün.

- [ ] **Step 3: S1-Budget prüfen**

Run: `wc -l website/src/components/admin/ArtLibrary.svelte`
Expected: < 120 Zeilen — weit unter Limit 500, viel Wachstumsreserve.

- [ ] **Step 4: Commit**

```bash
git add website/src/components/admin/ArtLibrary.svelte
git commit -m "feat(website): add admin ArtLibrary gallery component"
```

---

## MODIFY admin assets page to mount art-library

### Requirement: Die Art-Library ist über die Admin-Assets-Seite erreichbar mit einem klar betitelten Tab/Bereich

#### Scenario: Admin öffnet /admin/assets
- **WHEN** ein Admin `/admin/assets` lädt
- **THEN** ein Element mit Text „Art Library" (oder „Bibliothek") ist sichtbar und schaltet die `ArtLibrary`-Galerie ein

### Task 7: assets.astro einbinden

**Files:**
- Modify: `website/src/pages/admin/assets.astro` (17 Zeilen, NICHT-baselined, Limit .astro 400 — reichlich Budget)
- Reference: `website/src/components/admin/ArtLibrary.svelte` (Task 6)

**Interfaces:**
- Consumes: `ArtLibrary.svelte`.
- Produces: ein DOM-sichtbares Tab/Button mit Text matchend `/Art Library|Bibliothek/i` (E2E in Task 8 sucht genau diesen Text).

- [ ] **Step 1: Ist-Zustand lesen**

Run: `cat website/src/pages/admin/assets.astro`
Expected: importiert `AssetGallery`, rendert `<AdminLayout>` mit `<AdminPageHeader title="Assets" />` und `<AssetGallery client:load />`.

- [ ] **Step 2: ArtLibrary importieren und als Tab einbinden**

Da der E2E-Test einen klickbaren `button`/`a` mit Text „Art Library" erwartet, der die Galerie einschaltet, wird ein minimaler clientseitiger Tab-Switch per Inline-`<script>` realisiert (zwei Bereiche, Default = Assets sichtbar). Ersetze den Datei-Inhalt:

```astro
---
import AdminLayout from '../../layouts/AdminLayout.astro';
import AdminPageHeader from '../../components/admin/ui/AdminPageHeader.svelte';
import { getSession, getLoginUrl, isAdmin } from '../../lib/auth';
import AssetGallery from '../../components/admin/AssetGallery.svelte';
import ArtLibrary from '../../components/admin/ArtLibrary.svelte';

const session = await getSession(Astro.request.headers.get('cookie'));
if (!session) return Astro.redirect(getLoginUrl(Astro.url.pathname));
if (!isAdmin(session)) return Astro.redirect('/admin');
---

<AdminLayout title="Assets">
  <div style="max-width:72rem; margin:0 auto; padding:1.5rem 1.5rem 0;">
    <AdminPageHeader title="Assets" />
    <nav class="assets-tabs" role="tablist">
      <button type="button" class="assets-tab is-active" data-tab="generated">Assets</button>
      <button type="button" class="assets-tab" data-tab="art">Art Library</button>
    </nav>
  </div>

  <div data-tabpanel="generated">
    <AssetGallery client:load />
  </div>
  <div data-tabpanel="art" hidden>
    <ArtLibrary client:visible />
  </div>

  <script is:inline>
    document.querySelectorAll('.assets-tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        document.querySelectorAll('.assets-tab').forEach((b) => b.classList.toggle('is-active', b === btn));
        document.querySelectorAll('[data-tabpanel]').forEach((p) => {
          p.hidden = p.getAttribute('data-tabpanel') !== tab;
        });
      });
    });
  </script>

  <style>
    .assets-tabs { display: flex; gap: 0.5rem; margin: 1rem 0 0.5rem; }
    .assets-tab { padding: 0.45rem 0.9rem; border: 1px solid var(--border, #2a3343); border-radius: 0.5rem; background: transparent; color: inherit; cursor: pointer; }
    .assets-tab.is-active { background: var(--accent, #d7b06a); color: #0b111c; }
  </style>
</AdminLayout>
```

- [ ] **Step 3: S1-Budget prüfen**

Run: `wc -l website/src/pages/admin/assets.astro`
Expected: < 70 Zeilen — weit unter Limit 400.

- [ ] **Step 4: Commit**

```bash
git add website/src/pages/admin/assets.astro
git commit -m "feat(website): mount ArtLibrary tab on admin assets page"
```

---

## MODIFY e2e spec for populated mentolder library

### Requirement: Der E2E-Spec spiegelt wider, dass mentolder jetzt bestückt ist

#### Scenario: mentolder Admin öffnet Art Library
- **WHEN** ein mentolder-Admin den Art-Library-Tab öffnet
- **THEN** `.art-grid` mit `.art-card` rendert (NICHT `.art-empty`)

### Task 8: dashboard-art.spec.ts anpassen

**Files:**
- Modify: `tests/e2e/specs/dashboard-art.spec.ts` (letzter Test `'mentolder context shows empty-state (no art library)'`)

**Interfaces:**
- Consumes: DOM-Kontrakt aus Task 6/7.
- Produces: keinen Code-Consumer — nur Test-Erwartung. `E2E PR` ist kein required check (CLAUDE.md), daher kein Merge-Block; Anpassung dient Spec-Konsistenz.

- [ ] **Step 1: Bestehenden Test lesen**

Run: `grep -n "empty-state\|art-empty\|art-grid" tests/e2e/specs/dashboard-art.spec.ts`
Expected: der `test('mentolder context shows empty-state ...')`-Block erwartet `.art-empty` mit `/No art library configured|Keine Kunstbibliothek/`.

- [ ] **Step 2: Test umkehren — mentolder ist jetzt POPULATED**

Ersetze den gesamten `'mentolder context shows empty-state (no art library)'`-Test durch (Titel + Body):

```ts
test('mentolder context shows a populated art library', async ({ browser }) => {
  if (!hasAuthState()) { test.skip(); return; }

  const MENTOLDER_URL = (process.env.MENTOLDER_ADMIN_URL ?? 'https://web.mentolder.de/admin').replace(/\/$/, '');
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true });
  const page = await ctx.newPage();
  try {
    await page.goto(MENTOLDER_URL, { waitUntil: 'domcontentloaded' });
    const redirected = page.url().includes('auth.') || page.url().includes('realms/workspace');
    if (redirected) { test.skip(); return; }
    const artBtn = page.locator('button, a').filter({ hasText: /Art Library|Bibliothek/i }).first();
    const hasArtTab = await artBtn.isVisible({ timeout: 5_000 }).catch(() => false);
    if (!hasArtTab) { test.skip(); return; }
    await artBtn.click();
    await page.waitForSelector('.art-grid', { timeout: 8_000 });
    expect(await page.locator('.art-card').count()).toBeGreaterThan(0);
    await expect(page.locator('.art-empty')).toHaveCount(0);
  } finally {
    await ctx.close();
  }
});
```

> **`.art-empty`-Abdeckung bleibt erhalten:** Das Empty-State-Markup wird weiterhin durch den `catch`-Pfad des API-Endpoints (Brand ohne Manifest, Task 5) gerendert; es ist nur nicht mehr für mentolder erwartet. Die Komponente behält den `.art-empty`-Zweig (Task 6, Scenario 3).

- [ ] **Step 3: Lint/Compile des Specs (kein Live-Run hier)**

Run: `cd tests && npx tsc --noEmit -p . 2>&1 | grep dashboard-art || echo "no type errors in dashboard-art"; cd ..`
Expected: `no type errors in dashboard-art` (oder leere Ausgabe). Ein echter Playwright-Run gegen die Live-Umgebung läuft erst nach Deploy (separater `dev-flow-e2e`).

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/specs/dashboard-art.spec.ts
git commit -m "test(e2e): expect populated art library for mentolder"
```

---

## ADD mentolder manifest BATS coverage

### Requirement: Das mentolder-Set wird vom BATS-Validator analog zu korczewski geprüft

#### Scenario: BATS validiert mentolder-Set
- **WHEN** `test_art_library_manifest.bats` läuft
- **THEN** das mentolder-Manifest hat ≥1 character/prop/terrain/logo und der Validator-Lauf (alle Sets) exit 0

### Task 9: BATS-Test erweitern

**Files:**
- Modify: `tests/unit/test_art_library_manifest.bats` (20 Zeilen, NICHT-baselined, Limit 300)
- Reference: der bestehende korczewski-`@test` als Vorlage

**Interfaces:**
- Consumes: `art-library/sets/mentolder/manifest.json`, `art-library/_tooling/validate-manifest.mjs` (validiert ALLE Sets, kein Per-Set-Arg).
- Produces: keinen Code-Consumer. Ergebnis fließt in `task test:inventory`.

- [ ] **Step 1: Bestehende korczewski-@test als Vorlage lesen**

Run: `cat tests/unit/test_art_library_manifest.bats`
Expected: ein Validator-Lauf-`@test` (ohne Arg) + ein korczewski-`@test`, das per `jq` ≥1 pro `kind` prüft.

- [ ] **Step 2: mentolder-@tests ergänzen (analog zu korczewski, mit korrekten Erwartungen)**

Füge nach dem korczewski-`@test` an:
```bash
@test "mentolder set has at least one character, prop, terrain, and logo" {
  manifest="${REPO}/art-library/sets/mentolder/manifest.json"
  for kind in character prop terrain logo; do
    run jq -e --arg k "$kind" '.assets | map(select(.kind == $k)) | length >= 1' "$manifest"
    [ "$status" -eq 0 ]
  done
}

@test "mentolder manifest declares exactly 19 assets" {
  manifest="${REPO}/art-library/sets/mentolder/manifest.json"
  run jq -e '.assets | length == 19' "$manifest"
  [ "$status" -eq 0 ]
}
```

- [ ] **Step 3: Validator-Abhängigkeiten sicherstellen und BATS lokal laufen**

Der Validator braucht `ajv`/`ajv-formats` (installiert in `art-library/_tooling/`). Sicherstellen und Test laufen:
```bash
( cd art-library/_tooling && npm install --no-audit --no-fund >/dev/null 2>&1 || true )
bats tests/unit/test_art_library_manifest.bats
```
Expected: alle `@test`-Zeilen `ok`. Der „validator runs and exits zero"-Test deckt mentolder automatisch mit ab (alle Sets), da Task 2 die Dateien materialisiert hat.

- [ ] **Step 4: Commit**

```bash
git add tests/unit/test_art_library_manifest.bats
git commit -m "test: add mentolder art-library manifest BATS coverage"
```

---

## VERIFY full CI-gate suite

### Requirement: Alle CI-Gates sind grün und generierte Artefakte aktuell

#### Scenario: Vollständige Verifikation vor PR
- **WHEN** die finale Verifikation läuft
- **THEN** `test:changed`, `freshness:check`, OpenSpec-Validate sind grün und das Test-Inventar ist regeneriert+committet

### Task 10: Verifikation + Freshness + Inventar + OpenSpec

**Files:**
- Modify (generiert): `website/src/data/test-inventory.json` (von `task test:inventory`), ggf. weitere Freshness-Artefakte
- Verify: gesamter Diff

**Interfaces:**
- Consumes: alle vorherigen Tasks.
- Produces: einen grünen CI-Gate-Zustand + committetes Inventar.

- [ ] **Step 1: Gezielte Tests für geänderte Domains**

Run: `task test:changed`
Expected: vitest (website) + BATS-Selektion (inkl. `test_art_library_manifest.bats`) + quality grün. Bei Fehlschlag: zuerst `superpowers:systematic-debugging`, nicht raten.

- [ ] **Step 2: Test-Inventar regenerieren (BATS wurde geändert)**

Run: `task test:inventory`
Expected: `website/src/data/test-inventory.json` aktualisiert (neue mentolder-@tests erscheinen). Diff prüfen:
```bash
git status --short website/src/data/test-inventory.json
```

- [ ] **Step 3: Freshness regenerieren**

Run: `task freshness:regenerate`
Expected: generierte Artefakte (repo-index, test-inventory, …) aktualisiert; ggf. weitere Dateien geändert.

- [ ] **Step 4: Freshness + Quality-Ratchet (CI-Äquivalent)**

Run: `task freshness:check`
Expected: PASS — Freshness ok, `quality:check` (S1–S4-Ratchet) ok, Baseline-Key-Count unverändert (keine neuen Baseline-Einträge). Bei S1-Fehler (eine Datei über wirksamer Schwelle): die betroffene Datei real verkleinern/splitten, NICHT baselinen.

- [ ] **Step 5: OpenSpec-Tree validieren (muss VOR dem finalen Commit grün sein)**

Run: `task test:openspec`
Expected: PASS (fail-closed CI-Gate). Alternativ `bash scripts/openspec.sh validate`.

- [ ] **Step 6: Generierte Artefakte + Inventar committen**

```bash
git add website/src/data/test-inventory.json
# plus alle weiteren von freshness:regenerate geänderten Dateien:
git add -A
git commit -m "chore: regenerate test inventory + freshness artifacts for art-library"
```

- [ ] **Step 7: Abschluss-Verifikation (Evidence vor Behauptung)**

Run:
```bash
task test:changed && task freshness:check && task test:openspec && echo "ALL GATES GREEN"
```
Expected: `ALL GATES GREEN`. Erst dann ist die Implementierung fertig und PR-bereit (Übergabe an `git-workflow`/`dev-flow-execute`-PR-Schritt).

---

## Self-Review (gegen Spec)

- **Phase 1 (statische Assets)** → Task 2. ✔
- **Phase 2 (icons.svg Sprite)** → Task 3. ✔
- **Phase 3 (Config-Verdrahtung + ServiceRow)** → Task 4 (Config) + Task 1 (ServiceRow defensiver Fix). ✔ — Korrektur ggü. Spec: `avatarType` ist bereits `'image'`, nur `avatarSrc` ändert sich (war `/gerald.jpg`, nicht `'initials'`).
- **Phase 4 (Admin-Galerie)** → Task 5 (API) + Task 6 (Komponente) + Task 7 (Einbindung). ✔
- **Phase 5 (BATS + Verifikation)** → Task 9 (BATS) + Task 10 (Verifikation). ✔
- **Zusätzlich aufgedeckt:** E2E-Spec-Widerspruch (mentolder = empty) → Task 8 löst ihn auf (mentolder = populated). Spec-Acceptance „kein `.art-empty` für mentolder" wird damit erfüllt.
- **Acceptance Criteria der Spec:** 19 Assets via API (Task 5), Hero-Portrait (Task 4), 5 Service-Icons (Task 3+4), Admin-Tab `.art-grid`/`.art-card` (Task 6+7), E2E ohne `.art-empty` für mentolder (Task 8), BATS grün (Task 9), Validator grün (Task 9/10). Alle abgedeckt. ✔
- **Verifikations-Task enthält Pflicht-Steps:** `task test:changed`, `task freshness:regenerate`, `task freshness:check`, `task test:inventory` (+Inventar-Commit), `task test:openspec`. ✔
