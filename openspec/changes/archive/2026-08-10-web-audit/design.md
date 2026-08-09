---
title: web-audit — Design
ticket_id: T002612
domains: [website, test, llm]
status: active
date: 2026-08-03
---

# web-audit — Design

## Purpose

Ein Skill, der die vorhandenen technischen Audits der eigenen Brand-Seiten um die zwei Urteile
ergänzt, die ein Linter prinzipiell nicht fällen kann: die **semantische** Beurteilung
natürlichsprachlicher Seiteninhalte und die **Priorisierung** der Roh-Befunde.

Die deterministische Hälfte existiert bereits und wird nicht nachgebaut:

| Vorhanden | Ort |
|---|---|
| axe-core-Scan der Kern-Routen | `task a11y:axe ENV=mentolder\|korczewski`, `tests/e2e/specs/a11y-axe.spec.ts` |
| Lighthouse mit Performance-Budget ≥ 90 | `.github/workflows/ci.yml`, `lighthouserc.json` |

Was fehlt, ist die Schicht darüber. axe-core prüft Struktur: hat das `<img>` ein `alt`? Ob
`alt="header-bg-2.webp"` den Bildinhalt beschreibt, kann es nicht prüfen — formal ist das grün.
Lighthouse misst, ob eine `<meta description>` existiert und wie lang sie ist, nicht ob sie
Marken- und Leistungsbezug hat. Und 47 unsortierte Violations sind für einen Menschen
unbrauchbar, weil die fünf, die echte Nutzer treffen, darin untergehen.

## Architecture

```
.claude/skills/web-audit/SKILL.md      Skill-Body, Aufruf und Interpretation
scripts/web-audit.mjs                  Orchestrierung der drei Stufen
tests/spec/website-core/web-audit.bats Verhaltensprüfung
```

### Datenfluss

```
ENV=<brand> --routes <liste>
  │
  ├─ Stufe 1  task a11y:axe ENV=<brand>          → Violations (JSON)
  ├─ Stufe 2  lighthouse via lighthouserc.json   → Kennzahlen (JSON)
  └─ Stufe 3  Playwright-Render → Semantik-Extrakt
               → llm-proxy :18235 (ID aus /v1/models, enable_thinking:false)
                    ↓
        Bericht: semantische Befunde + priorisierte Rangliste über Stufe 1/2
                    ↓
        tmp/claude-scratch/web-audit-<brand>-<datum>.md  +  Kurzfassung auf stdout
```

### Fehlerbehandlung

Jede Stufe ist einzeln ausfallbar und meldet ihren Ausfall namentlich; keine Stufe bricht den
Lauf ab. Der Bericht kennzeichnet ausgefallene Stufen ausdrücklich, damit eine unvollständige
Prüfung nicht als vollständige gelesen wird.

### Testing

BATS unter `tests/spec/website-core/`, Verhaltensprüfung nach T002448-M4. Der Semantik-Extrakt
wird gegen eine abgelegte HTML-Fixture geprüft (deterministisch, kein Netz, kein Modell). Der
Modell-Pfad wird gegen einen Stub-Endpunkt geprüft; jeder Negativtest trägt nach T002356-M1
einen Positiv-Anker im selben Test.

## Abgrenzung

- **Kein Merge-Gate und kein CI-Job.** Der Skill läuft manuell gegen die Live-Brands.
- **Keine Bewertung fremder Seiten.** Ziel sind ausschließlich die eigenen Brands.
- **Keine visuelle Prüfung.** Screenshots und Vision-Modell gehören zum Headed-E2E-Vorgang.
