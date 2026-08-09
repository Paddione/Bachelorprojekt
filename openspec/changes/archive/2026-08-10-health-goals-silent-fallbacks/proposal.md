# Proposal: health-goals-silent-fallbacks

## Why

Der Health-Goal-Report meldet Zustände, die er nicht gemessen hat. Drei Messungen
fallen still aus, und der Ausfall ist im Report von einem Ergebnis nicht zu
unterscheiden — er erscheint als `n/a` oder, schlimmer, als gelbes „offenes Ziel".
Das ist die Wiederholung von T002583, wo G-LLM01 nie maß und G-LLM02 vakuos grün
meldete.

**Symptom und Ursache getrennt** (Bug-Triage-Konvention T002448-M5) — alle
Ursachen sind auf `main` @600863701 reproduziert, keine ist Hypothese:

| Ziel | Symptom (beobachtet) | Ursache (belegt) |
|---|---|---|
| G-IF01 | Wert `-\n-`, Shell-Fehler `[: integer expression expected`, zählt als offen | `mcp.yaml` führt seit dem Registry-Umbau nur `clients`/`cluster`; die Messung liest `servers` → Menge immer leer. Der Abbruch `print('-'); exit(0)` wirft `SystemExit`, das folgende bare `except:` fängt es und druckt ein zweites `-` |
| G-DEP01 (**Gate**) | `n/a` | `pnpm audit --json` liefert ein pretty-printed Einzelobjekt mit `advisories`-Map, der Parser liest zeilenweise als JSON-Lines → `AttributeError: 'str' object has no attribute 'get'` → Fallback-Zweig |
| G-DEP02 | Wert `3\n-` | `pnpm outdated` endet **mit** Funden als Exit 1 (verifiziert); unter `set -o pipefail` (Zeile 23) hängt der Fallback-Zweig ein zweites Token an, nachdem der korrekte Wert bereits gedruckt wurde |

Dazu drei Migrationsreste des SDLC-Splits (6959c722e verschob
`goals-data.generated.json` nach `website/src/lib/sdlc/`). Die **schreibende**
Seite wurde nachgezogen und wäre bei einem Fehler laut gebrochen; die **lesenden**
Stellen haben einen stillen Fallback und blieben zurück:

- `scripts/health-goals-update.sh:38` — `task health:goals:drift` bricht ab
  („nicht gefunden — Drift-Report nicht möglich", reproduziert)
- `scripts/health-goals-llm-fill.sh:33` — keine Kandidatenbasis
- `scripts/factory/auto-close-merged.sh:64` — Allowlist generierter Artefakte
  greift nicht mehr; plan-only PRs, die die JSON regenerieren, gelten fälschlich
  als Implementierung

Der offene Branch `fix/sdlc-split-followup-T002639` zieht `health-goals.yml` und
den Freshness-Guard nach, fasst diese drei aber nicht an — sie fallen durch beide
Netze.

## What

Beide Gruppen teilen eine Fehlerklasse: **der Fehlerpfad ist stumm**. Der Fix
adressiert die Klasse, nicht nur die sechs Fundstellen.

1. **Messlogik in prüfbare Helfer auslagern** (`scripts/lib/`). Die drei defekten
   Parser lagen als inline-Python im Checker und waren nur im Volllauf prüfbar —
   mit `pnpm`-Timeout bis 180 s und `node_modules`, das der CI-Job nicht hat.
   Genau deshalb blieben die Defekte so lange unentdeckt. Als stdin-fütterbare
   Helfer sind sie in Millisekunden gegen Fixtures testbar. Nebeneffekt, der hier
   zählt: `health-goals-check.sh` steht bei 787 von 800 S1-Zeilen — das Auslagern
   schrumpft die Datei, statt die verbleibenden 13 Zeilen Budget zu verbrauchen.
2. **G-IF01 gegen die reale Registry-Struktur**: nur `clients` mit
   `transport: http` (vier: mcp-kubernetes:18080, mcp-postgres:13001,
   factory-mcp:13003, bge-mcp:13005), Host/Port aus der `endpoint`-URL. Die neun
   stdio-Clients werden per `command` gestartet und haben keinen Port, der
   antworten könnte — sie gehören nicht in die Zählung.
3. **Leere Kandidatenmenge verletzt das Ziel**, statt es zu überspringen. Das ist
   die bereits in `goals.md` dokumentierte, aber nie implementierte Absicht
   („eine komplett leere Registry soll nicht fälschlich grün melden"). Damit fällt
   ein erneuter Schema-Wandel sofort auf.
4. **`except Exception:` statt bare `except:`** — sonst fängt der Handler den
   eigenen `SystemExit`.
5. **Drei tote Pfade nachziehen** auf `website/src/lib/sdlc/`.

## Non-Goals

- **Die Ziele selbst erreichen.** Nach dem Fix misst G-DEP01 erstmals wirklich und
  kann dabei rot werden. Das ist ein eigener Vorgang mit eigener Bewertung — hier
  wird die Messung repariert, nicht ihr Ergebnis.
- **Die übrigen Messungen auditieren.** Dass dieselbe Klasse anderswo steckt, ist
  plausibel (T002583 war derselbe Befund an anderer Stelle), aber ein Reihen-Audit
  sprengt diesen Fix.
- **`tests/spec/health-goals.bats` anfassen** — die Datei liegt im offenen
  T002639. Neue Blöcke gehen nach `tests/spec/health-goals/<slug>.bats` (T002416).

_Ticket: T002648_
