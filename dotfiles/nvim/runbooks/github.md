---
page: github
ticket: T901048
status: complete
actions:
  - pr-view
  - pr-comments
  - pr-checks
  - failure-logs
  - release-view
---

## Voraussetzungen

- `gh` authentifiziert (`gh auth status`), `gh-axi` auf PATH.
- Trennung T004612: Anzeige via `gh-axi`, maschinelles Parsen via
  `gh --json`/`-q` direkt.

## Geordnete Schritte

1. **pr-view**: PR anzeigen (Anzeige via `gh-axi pr view`).
2. **pr-comments**: PR-Kommentare anzeigen (`gh pr view --comments`).
3. **pr-checks**: Checks anzeigen (`gh pr checks` — Parsen via `gh` direkt).
4. **failure-logs**: Fehlgeschlagene Runs mit Log
   (`gh run list --status failure`, dann Log).
5. **release-view**: Release anzeigen (`gh-axi release view`).

Keine Merge-Aktion: Merge ist Abschluss per Auto-Merge, kein Editor-Schritt.

## Erwartetes Ergebnis

Fuenf Aktionen ohne Merge; Anzeige lesbar, Parsen maschinenlesbar.

## Troubleshooting

- **Nicht authentifiziert**: `gh auth login`, dann erneut.
- **Kein PR zum Branch**: Aktion meldet leeres Ergebnis statt zu raten.

## Recovery

Keine: alle Aktionen sind lesend.
