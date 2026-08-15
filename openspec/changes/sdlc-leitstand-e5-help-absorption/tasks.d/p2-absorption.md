# p2 — Satelliten-Absorption + Redirect-Hygiene (Rolle: website)

_Voraussetzung: E3+E4 gemerged — Decks sind vollwertige Flächen (DeckWissen trägt seit E4 den API-Katalog)._

## Tasks

- [ ] **`DeckWissen.svelte` erweitern.** `PromptLibraryManager.svelte` als Prompt-Bibliothek-
      Modul aufnehmen (Design §S2: Wissen = API-Katalog · OpenSpec-Suche · Prompt-Bibliothek);
      Datenbeschaffung wie auf `prompts.astro` (`listPrompts`) — die SSR-Ladung wandert in die
      Deck-Props bzw. eine bestehende `/sdlc/api/`-Route, kein Direkt-DB-Zugriff aus der
      Komponente. `data-purpose-id`-Anker gemäß Registry-Schlüssel setzen.
- [ ] **`DeckKi.svelte` erweitern.** `KiKonfiguration.svelte` als Modul aufnehmen (bisheriger
      Inhalt von `ki-konfiguration.astro`); `data-purpose-id`-Anker setzen.
- [ ] **Drei Satellitenseiten löschen.** `repohealth.astro` (Inhalt = GoalsDashboard, seit E3
      im Qualität-Deck), `prompts.astro`, `ki-konfiguration.astro` entfernen. Danach
      Nav-Quellen bereinigen: `grep -rn 'repohealth\|/sdlc/prompts\|ki-konfiguration'
      components/website/src` und jede gefundene Nav-/Link-Stelle auf das Deck-Ziel
      umstellen — der Guard `tests/spec/sdlc-cockpit/navigation-no-dead-links.bats` muss
      grün bleiben.
- [ ] **`redirect-map.ts` erweitern + normalisieren.** Neue Einträge:
      `/sdlc/repohealth → /sdlc/cockpit?deck=qualitaet`,
      `/sdlc/prompts → /sdlc/cockpit?deck=wissen`,
      `/sdlc/ki-konfiguration → /sdlc/cockpit?deck=ki`. Bestehende Cockpit-Ziele mit
      `?tab=` auf das E3-Schema umstellen (`?tab=planung → ?station=planung`,
      `?tab=analytics → ` Leerlauf-KPI-Raster also ohne Parameter, `?tab=kosten → ?deck=plattform`) —
      die E3-URL-Weiche liest `tab` nicht, diese Redirects landen sonst auf der
      Default-Ansicht. `login-redirect-all-pages.bats` gegenprüfen (gelöschte Seiten
      verschwinden aus dessen Erwartungsliste, falls dort enumeriert).

## Verifikation (Partial-lokal)

```bash
grep -c 'tab=' components/website/src/middleware/redirect-map.ts   # Soll: 0 für Cockpit-Ziele
tests/unit/lib/bats-core/bin/bats -r tests/spec/sdlc-cockpit/navigation-no-dead-links.bats
```
