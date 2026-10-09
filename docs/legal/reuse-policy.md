# Reuse-Policy: permissive Wiederverwendung und Dritt-Lizenzen

**Status:** Verbindlich
**Datum:** 2026-10-09
**Ticket:** T901032

Diese Policy regelt, welcher Code und welches Material in diesem Repository
wiederverwendet werden darf und unter welchen Lizenzbedingungen. Jede Regel
trägt eine stabile Anker-ID in ihrer Abschnittsüberschrift; der Checker
(`scripts/legal/license-check.sh`), das Dritt-Lizenz-Manifest
(`docs/legal/third-party-manifest.json`) und die Spec-Guards
(`tests/spec/license-manifest.bats`) zitieren diese Anker.

## RP-1 — Geltungsbereich

Diese Policy gilt für eigenen Plattform- und Tooling-Code, für
Drittkomponenten (Bibliotheken, UI-Kits, Skills), für eingebettete
Lizenztexte sowie für Assets (Fonts, Bilder, Fotos, Marken, generierte
Outputs). Asset-Lizenzierung ist in `docs/legal/asset-licensing.md`
getrennt geregelt; die Release-Checkliste steht in
`docs/legal/release-attribution.md`.

## RP-2 — Eigener Code steht unter MIT

Original-Code dieses Repositorys steht unter der MIT-Lizenz im
Repo-Root (`LICENSE`, Copyright Patrick Korczewski). Bestehende gültige
MIT-Grants werden nicht zurückgezogen. Wer eigenen Code wiederverwendet,
behält Copyright- und Lizenzhinweise bei.

## RP-3 — Erlaubte Dritt-Lizenzen

Drittkomponenten unter MIT und Apache-2.0 sind erlaubt. Pflicht dabei:

- Anwendbare LICENSE- und NOTICE-Texte werden beigelegt und erhalten.
- Bei Apache-2.0 werden Änderungshinweise (modification notices) geführt.
- Jede Komponente wird mit exakt verifizierter Revision und geprüfter
  Dependency-Closure in das Dritt-Lizenz-Manifest aufgenommen; Ranges
  oder `latest`-Verweise sind keine gültigen Versionsangaben.

## RP-4 — AGPL-Sperre für den MIT-Kern

AGPL-lizenzierter Code — insbesondere Custom-Code aus AGPL-3.0-or-later
Upstreams — wird weder eingebettet noch kopiert noch als MIT umetikettiert.
Der MIT-Kern bleibt frei von Copyleft-Einbettungen. Eine AGPL-Adoption ist
nur per separatem Architektur- und Lizenzbeschluss mit Compliance-Plan
möglich; der Plan deckt das betroffene Combined Work und anwendbare
Quell-Angebots-Pflichten ab, einschließlich Netznutzung modifizierter
Versionen. Der Checker führt eine Denylist der AGPL/GPL-Familie und
scheitert fail-closed bei jedem Treffer im Manifest.

## RP-5 — Kein automatisches Relicensing

Diese Policy lizenziert kein Drittmaterial um: Dritt-Code, Fonts, Bilder,
Fotos, Marken und generierte Outputs behalten ihre eigene Lizenz. Ein
Top-Level-LICENSE im Repo-Root erstreckt sich nicht automatisch auf
Material, dessen Rechte bei Dritten liegen.

## RP-6 — Design-Repo: MIT-Code, dokumentierte Assets, Quarantäne

Code in einem Design-Repo darf MIT sein. Jedes Asset behält dokumentierte
Quelle, Inhaber, Lizenz und Permissions. Das Design-Repo startet privat;
Material mit ungeklärten Rechten bleibt in Quarantäne und wird nicht
publiziert, bis Quelle und Rechte geklärt und dokumentiert sind.

## RP-7 — Engineering-Policy ohne Abdeckungsgarantie

Diese Policy ist eine Engineering-Regel für den Arbeitsalltag. Sie ist kein
Versprechen, dass ein Top-Level-LICENSE alles abdeckt, und ersetzt keine
rechtliche Prüfung im Einzelfall. Historische MIT-Releases sind erst nach
exakt verifiziertem Archiv plus vollständiger Lizenzprüfung aller
Abhängigkeiten möglich; Standard bleibt der gepflegte permissive Upstream.
