# Stil-Datenbank

Eine Sammlung geernteter Gestaltungsbausteine, aus der die Modelle Ideen und
Farbwelten ziehen. Sie speist sich **zuerst aus eigenem Material**: nach E14
werden abgeschlossene Prototypen in wiederverwendbare Komponenten zerlegt, und
jede davon dient zugleich als Geschmacks- und Farbbeispiel. Externe Quellen
kommen erst danach dazu.

Nützlich ist das nur, weil das Kit Themes als **Datenschicht** führt (E11):
Tokens sind austauschbar, CSS-Werte nicht. Ein Eintrag mit hartkodierten Farben
wäre in einem anderen Theme schlicht falsch — und deshalb als Vorlage wertlos.

## Die drei Beitragsregeln (D14)

Ein Baustein kommt **nur mit allen dreien** ins Kit. Fehlt eines davon, bleibt
er im Projekt liegen, wo er entstanden ist.

### 1. Beleg-Ausschnitt

Der tatsächliche Code, nicht seine Beschreibung. Er muss im Referenz-Board oder
in der Cockpit-Hülle sichtbar sein — ein Beispiel, das man nirgends in Aktion
sehen kann, lässt sich auch nicht beurteilen.

### 2. Ausschließlich Token-Bezüge

Keine Hex-Farbe, keine feste Größe in `px`, `pt`, `em` oder `rem`. Nur
`var(--token)`, und jedes verwendete Token muss in
[`../kit/tokens.css`](../kit/tokens.css) definiert sein.

Das ist die Regel, an der die meisten Kandidaten scheitern, und zwar an
Kleinigkeiten. `.panel--rail` etwa wäre ein naheliegender Beleg für die
Leistenansicht — enthält aber `max-height: 2.5rem` und ist damit
regelwidrig. Aufgenommen wurden deshalb nur die token-reinen Regeln desselben
Blocks. Lieber ein kleinerer Ausschnitt als ein unsauberer.

### 3. Verzeichniseintrag mit Zweck und Herkunft

Ein Eintrag in [`index.json`](index.json) mit **Zweck** und
**Herkunftsprojekt**. Der Zweck beschreibt die Gestaltungs*absicht* — wofür der
Baustein da ist, nicht wie er gebaut ist. Das ist der Text, den ein Modell
liest, wenn es einen passenden Baustein sucht; eine Bauanleitung hilft ihm dabei
nicht.

## Aufbau

| Datei | Inhalt |
|---|---|
| `schema.json` | JSON-Schema (draft-07) für einen Eintrag, `additionalProperties: false` |
| `index.json` | Verzeichnis aller Einträge — die Antwortquelle für `GET /api/cockpit/styles` |
| `<id>.json` | Ein Eintrag pro Datei, Dateiname gleich `id` |

## Einen Eintrag hinzufügen

1. `<id>.json` nach `schema.json` anlegen (`id` in kebab-case, gleich dem Dateinamen).
2. Den Eintrag in `index.json` ergänzen — `id`, `name`, `zweck`, `herkunft`.
3. Prüfen:

```bash
tests/unit/lib/bats-core/bin/bats tests/spec/sdlc-cockpit/k9-stil-datenbank.bats
```

Die Prüfung deckt alle drei Regeln ab: Pflichtfelder, Token-Existenz gegen
`tokens.css`, keine festen Werte im Ausschnitt, und Vollständigkeit des
Verzeichnisses in beide Richtungen.
