# Design-Asset Consumer-Map — Abhaengigkeiten (T901038)

Baseline: `docs/design-assets/manifest.json` (PRE, 872 Dateien,
20.924.022 Bytes), Manifest-SHA-256:
`8000b0571b9941acb9f753aa022000f9b4a05ff7a7cc334ed2960fdf765df094`.
Alle Mappings sind gegen reale Repo-Dateien aufgeloest (nur gelesen).
`scripts/assets-sync.sh` wurde nicht ausgefuehrt.

## 1. Sync-Skript-Mappings (`scripts/assets-sync.sh`, nur gelesen)

| Quelle | Ziel | Modus | Verifikation (Manifest-Hashes) |
|---|---|---|---|
| assets/audio/ | components/brett/public/assets/sfx/ | `rsync -a --delete` — destruktiv | 63/63 byte-identisch |
| assets/game/ | components/brett/public/assets/combat/ | `rsync -a --delete` — destruktiv | 7/7 byte-identisch |
| assets/branding/ | components/website/public/brand/ | `rsync -a` — additiv, kein `--delete` („nur eine Teilmenge lebt in `assets/branding/`") | 56/58 byte-identisch; `korczewski/colors_and_type.css` und `mentolder/colors_and_type.css` divergiert |

Die beiden `--delete`-Mappings loeschen consumer-seitige Dateien ohne
Quelle — deshalb darf das Skript nie als Inventur-Schritt laufen
(Ticket-Verbot). Die additiven 23 Brand-Dateien ohne `assets/branding/`-Zwilling
(Starter, Favicons, OG-Bilder, `massage/`, divergierte Token-CSS) wuerden ein
`--delete` dort vernichten.

## 2. Design-System-Build (`packages/design-system/build.mjs`)

- `extractTokens()` liest `components/website/public/brand/mentolder/colors_and_type.css`
  (Consumer-Pfad!) und schreibt `packages/design-system/_tokens.css` mit
  GENERATED-Kopf — aktuell STALE (2 Hunks Drift, siehe Katalog).
- `copyAssets()` kopiert `props/`- und `logos/`-SVGs aus dem Brand-Verzeichnis
  nach `packages/design-system/assets/` — 11/11 byte-identisch.
- `assembleCard()` injiziert Tokens, `_card.css` und SVG-Grids in `cards/*.html`
  (`tokens:start`-Regionen belegt).
- Upload: nur `cards/**` geht per DesignSync raus (`config.json`:
  `uploadGlobs`, NOTES.md); `_tokens.css`, `_card.css`, `assets/` sind lokale
  Build-Inputs.

Umgekehrte Kopplung: Die Quelle (`_tokens.css`, Snapshots) wird aus dem
Consumer (`website/public/brand/`) abgeleitet statt umgekehrt. Das ist als
bewusstes Follow-up notiert (Extraktion umkehren) und wird hier nicht
gefixt. `config.json` bestaetigt die Richtung explizit
(`tokenSource: website/public/brand/mentolder/colors_and_type.css`).

## 3. Leitstand-Build (`design/leitstand-ds/build.mjs`)

- `extractTokens()` liest `components/website/src/styles/sdlc-leitstand.css`
  — ausserhalb des Inventur-Scope — nach `design/leitstand-ds/_tokens.css`
  (aktuell byte-identisch, in sync).
- `copyAssets()` kopiert 6 Cockpit-Glyphen aus
  `components/website/public/cockpit/*.svg` — ebenfalls ausserhalb Scope —
  nach `design/leitstand-ds/assets/icons/` (6/6 identisch).
- Karten in `design/leitstand-ds/cards/` werden wie im Design-System assembliert.

Follow-up: Token- und Icon-Quellen liegen ausserhalb der sechs Scope-Roots;
bei Scope-Erweiterung als eigene Wurzeln aufnehmen.

## 4. Website-Brand-Consumer (`/brand/*`-URLs, grep-Belege)

- `components/website/src/layouts/Layout.astro` — OG-Bilder, Favicons,
  `site.webmanifest` beider Marken (`/brand/korczewski/…`, `/brand/mentolder/…`).
- `components/website/src/layouts/PortalLayout.astro` — Favicon und
  `korczewski/colors_and_type.css` + `kore-app.css` (konditional).
- `components/website/src/lib/starters/contract-mentolder.html` und
  `contract-korczewski.html` — `colors_and_type.css`, `print.css`/`app.css`,
  Logo-SVGs.
- `components/website/src/config/brands/korczewski.ts` —
  `/brand/korczewski/identity.svg` als Identity-Bild.

Alle Consumer nutzen relative URL-Pfade (`/brand/…`), keine absoluten
WSL-Pfade — konform zur Ticket-Vorgabe.

## 5. Brett-Public-Consumer (`/assets/*`-URLs)

- Figure-Pack und Coaching (statische Belege):
  `components/brett/src/client/ui/persons.ts` (`/assets/figure-pack/faces/…`,
  `/assets/coaching/brand.mjs`), `appearance.ts` (`/assets/figure-pack/…`,
  `placement_spec.json`), `skin.ts` (Kommentar auf
  `brett/public/assets/figure-pack/colors_and_type.css`),
  `server/presets.ts` (figure-pack-Referenzen).
- `sfx/` und `combat/`: kein statischer Import in `components/brett/src`
  gefunden (Laufzeit-/dynamisch konstruierte URLs); sie werden als statische
  Public-Dateien ausgeliefert. Die Spiegel-Beziehung ist trotzdem belegt:
  rsync-Mapping plus 63/63- bzw. 7/7-Hash-Gleichheit.
- `characters/`, `props/`, `terrain/`: 46 weitere Brett-Dateien mit
  Hash-Zwilling in `assets/` (Manifest-Duplikatgruppen).

## 6. Art-Library (`assets/art-library/`)

- Quelle: brand-scopierte SVG-Sets mit `manifest.json` + `manifest.schema.json`
  (`assets/art-library/README.md`).
- Deploy: Kustomize-`configMapGenerator` materialisiert das aktive Set als
  ConfigMap `art-library`; Brett- und Website-Pods mounten sie unter
  `/app/public/art-library/` (laut README, `optional: true`).
- Website-Admin-Galerie: `components/website/src/pages/api/admin/art-library.ts`.

## 7. Design-Sync (`.design-sync/`)

- Einweg-Fluss aus dem externen `mentolder-web`-Build:
  `dist/assets/index-*.css` + Fonts-`@import` → `.design-sync/design-tokens.css`
  (NOTES.md-Re-sync-Checkliste, Schritte 1–5).
- Consumer ist die DesignSync-Pipeline (`.ds-sync/`, ausserhalb Scope);
  `config.json` (`projectId`, `componentSrcMap`) und `overrides/` steuern sie.

## 8. Zielzustand (Ticket-Vorgaben, hier noch nicht umgesetzt)

- Generierte Outputs werden als gepinnte Releases mit Pruefsummen
  ausgeliefert; Consumer nutzen nie mutable `latest`-Referenzen.
- Consumer nutzen nie absolute WSL-Pfade (heute eingehalten: `/brand/…`,
  `/assets/…`, relative Imports).
- Migration laeuft copy-first mit Hash-Verifikation; alte Quellen werden erst
  nach bestandener Consumer-Verifikation und explizitem Cleanup-Gate
  geloescht.
- Keine API-Keys, Kundendaten, Portraits ohne Consent oder Modell-Binaries
  committen — Fundstelle: `components/brett/public/assets/figure-pack/faces/portrait-*.png`
  (siehe Katalog, Rechte `unverified`).
