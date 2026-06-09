# Docs-Übersicht Redesign

**Datum:** 2026-06-10  
**Status:** Approved  
**Scope:** `k3d/docs-content-built/index.html`, `skills.html`, `agents.html`, `docs.html`

## Problem

Der aktuelle Index (`index.html`) nutzt einen interaktiven SVG-Graphen als primäre Navigation — 171 Skills + 42 Agents + 21 Docs als vernetzte Knoten. Als Mensch nicht navigierbar: keine Beschriftungen beim Laden, kein Scrollen, keine scanbare Struktur. Die Fallback-Sektionen (3 Links auf Unterseiten) sind das einzige was funktioniert.

Zusätzlich enthält `skills.html` massive Duplikate: dieselben Skills werden mehrfach gelistet weil mehrere installierte Plugin-Versionen denselben Skill registrieren (z.B. `desktop-commander-overview` 4×, Chrome DevTools 2×). 171 Einträge → ~86 einzigartige Skills.

## Ziele

- Index für beide Nutzungsmuster brauchbar: gezieltes Suchen + stöbern/entdecken
- Skills von 171 auf ~86 Einträge deduplizieren (neueste Version je Plugin)
- Skills nach Zweck gruppiert, nicht nach technischer Herkunft
- Repo-eigene Skills (Bachelorprojekt-spezifisch) visuell hervorgehoben
- Agents nach Plugin-Familie gruppiert mit sichtbaren Trigger-Keywords
- Docs mit Gruppenheadern und gefüllten Beschreibungen

## Architektur

Alle vier Seiten sind statische HTML-Dateien, generiert durch `scripts/build-docs.js`. Das Design ändert die **Generierungslogik** in `build-docs.js` und die Template-Funktionen in `scripts/templates.mjs`. Kein neues Framework, kein Servercode — nur HTML + das bestehende `app.js` für clientseitige Interaktion.

## Seiten-Design

### index.html — komplett neu

**Struktur (von oben nach unten):**

1. **Header** (bestehend, unverändert) — Logo + Suchfeld
2. **Hero** — Titel "Dokumentation", kurzer Untertitel
3. **Drei Kacheln** — Skills (86) · Agents (42) · Docs (21), jede klickbar auf die Unterseite
4. **Skills-Vorschau** — 7 Kategorie-Buttons (client-side Filter), darunter 3–4 Beispiel-Chips pro Kategorie. Kein Klick nötig um zu orientieren.
5. **Agents-Vorschau** — die 6 Bachelorprojekt-Agents als kompakte Kacheln (meistgenutzter Einstiegspunkt), danach Link zu agents.html

Der SVG-Graph (`<section class="graph-hero">`) wird vollständig entfernt. Die `fallback-section`-Blöcke werden durch die neue Struktur ersetzt.

### skills.html — überarbeitet

**Deduplizierung:** Beim Build-Schritt wird pro Skill-Name nur die neueste Pluginversion behalten. Vergleichsschlüssel: `pluginName + "--" + skillName`. Version wird als semver verglichen wenn möglich, sonst alphabetisch absteigend.

**7 Kategorien (Filter-Buttons oben, JS-seitig ohne Reload):**

| Kategorie | Quellen | Anzahl |
|-----------|---------|--------|
| Dev-Workflow | superpowers, dev-flow-* (repo) | ~18 |
| Bachelorprojekt-Infra | repo (nicht dev-flow) | ~11 |
| KI / ML | huggingface-skills | ~18 |
| Plugin- & Skill-Bau | plugin-dev, skill-creator, hookify | ~9 |
| Browser & Debugging | chrome-devtools-mcp, superpowers-chrome | ~7 |
| MCP & API | mcp-server-dev, postman, superpowers-lab:mcp-cli | ~11 |
| Claude Code & Tooling | claude-code-setup, claude-md-management, superpowers-developing-for-claude-code, remember, desktop-commander, frontend-design, superpowers-lab (ohne mcp-cli) | ~8 |

**Karten-Inhalt:** Skill-Name + Plugin-Label klein darunter. Repo-eigene Skills mit visueller Hervorhebung (★ und farblicher linker Rahmen). Sortierung innerhalb jeder Kategorie: alphabetisch.

**Filter-Implementierung:** `data-category` Attribut auf jeder Karte, JS-Toggle auf Kategorie-Buttons. Kein URL-Hash nötig — State lebt nur im DOM.

### agents.html — überarbeitet

**Gruppen:**

1. **Bachelorprojekt** (`bachelorprojekt-*`) — 6 Agents, oben (meistgenutzt)
2. **Dev-Workflow** (`feature-dev:*`, `pr-review-toolkit:*`, `code-simplifier:*`) — ~8 Agents
3. **Plugin-Bau** (`plugin-dev:*`, `hookify:*`, `agent-sdk-dev:*`) — ~7 Agents
4. **Sonstige** (Rest) — Catch-all

**Karten-Inhalt:** Agent-Name + kurze Trigger-Beschreibung (max. 1 Zeile, aus dem bestehenden `description`-Feld der Agent-Registrierung extrahiert). Derzeit zeigen Karten keinen Hinweis wann der Agent zuständig ist — das ist der wichtigste Informationsmangel.

### docs.html — leicht verbessert

**Gruppenheader** für die 21 Seiten:

- **Handbücher** — benutzerhandbuch, adminhandbuch, claude-code, contributing
- **Architektur** — architecture, bereitstellungsdetails, db-schema, datamodel-workflow, 30-bausteine
- **Audits & Reports** — datierte Audit-Dateien (2026-06-07-*), findings, db-audit
- **Entscheidungen** — decision-log, decisions, CHANGELOG
- **Referenz** — dsgvo, backup, arena, argocd, collabora, database

**Leere Beschreibungen:** Karten ohne `desc`-Text bekommen einen kurzen generierten Fallback aus dem Dateinamen (z.B. `decision-log` → "Protokoll getroffener Architektur- und Designentscheidungen").

## Datenfluss

```
docs/**/*.md + .claude/plugins/*/agents/*.md + .claude/plugins/*/skills/*.md
        ↓
  scripts/build-docs.js
        ↓  (Deduplizierung, Kategorisierung, Gruppenbildung)
  scripts/templates.mjs  ← neue Template-Funktionen: renderHub(), renderSkillsPage(), renderAgentsPage()
        ↓
  k3d/docs-content-built/*.html
```

Die Kategorisierungs-Logik wird als statisches Mapping in `build-docs.js` hinterlegt (`SKILL_CATEGORIES`-Objekt: `pluginName → kategorie`). Neue Plugins ohne Mapping landen in "Claude Code & Tooling" als Fallback.

## Fehlerbehandlung

- Skill ohne Kategorie-Mapping → Fallback-Kategorie "Claude Code & Tooling", kein Build-Fehler
- Agent ohne `description` → Karte rendert ohne Trigger-Zeile
- Doc ohne Beschreibung → generierter Fallback-Text aus Dateiname

## Tests

Bestehende CI-Checks (`task test:all`) laufen nach dem Build. Zusätzlich: `scripts/build-docs.js` gibt nach dem Lauf aus wie viele Duplikate bereinigt wurden und welche Skills kein Kategorie-Mapping haben (als Warning, kein Fehler).

## Out of Scope

- Einzelne Skill/Agent/Doc-Detailseiten — unverändert
- `app.js` Suchfunktion — bestehend, funktioniert weiter
- `style.css` — nur minimale Ergänzungen für neue CSS-Klassen (`.skill-star`, `.cat-filter-btn`)
- Inhalt der Docs-Seiten selbst (nur Übersicht/Listing ändert sich)
