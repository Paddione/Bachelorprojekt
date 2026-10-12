# T901791 — Proposal (WARUM + WAS)

## WARUM

Alle Grafana-Dashboard-Panels im Fleet-Artefakt tragen leere Datasource-UIDs —
Dashboards kaputt oder Fallback. Zweiter Vorfall derselben Bug-Klasse an einem
Tag (T901780); Hand-Escaping scheidet bei vendored Upstream-Content aus.

## WAS

1. `render_component`: envsubst-Liste auf Owned-Vars whitelisten
   (Menge aus Schema/Env empirisch ermitteln).
2. Skip-Liste für Fremd-Platzhalter (`datasource` u.a.) — unangetastet lassen.
3. Leftover-Fail-Closed-Check anpassen: Skip-Liste ok, fehlende Owned-Vars
   weiter Fehler.
4. Failing Tests zuerst (RED): Fixture-Render mit `${datasource}` + Owned-Var.
5. Klassifikation aller 98 Vars dokumentieren (owned/fremd).

## WAS NICHT

- Kein Hand-Escaping in vendored Dashboards.
- Keine eigene Upstream-Pipeline (Option c verworfen).
- Kein Monitoring-Overlay-Rohkopie-Hack (Option a verworfen).
- Andere Render-Pfade nur als Follow-up vermerken.
