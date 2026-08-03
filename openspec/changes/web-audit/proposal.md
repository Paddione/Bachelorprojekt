# Proposal: web-audit

## Why

Die technischen Audits der eigenen Brand-Seiten sind vorhanden (axe-core, Lighthouse) — aber
kein Werkzeug fällt die zwei Urteile, die ein Linter prinzipiell nicht fällen kann: ob
`alt="header-bg-2.webp"` den Bildinhalt beschreibt (semantische Beurteilung) und welche von 47
unsortierten Violations echte Nutzer treffen (Priorisierung). Die deterministische Hälfte wird
nicht nachgebaut; gefehlt hat bisher die Schicht darüber.

## What

Ein Skill mit drei Stufen: Stufe 1/2 delegieren an `task a11y:axe ENV=<brand>` und die
bestehende `lighthouserc.json` (keine eigenen Regeln), Stufe 3 rendert die Routen per Playwright,
schickt nur einen strukturierten Semantik-Extrakt (alt-Texte, meta-Tags, Überschriften-Hierarchie,
Link-Labels — kein rohes HTML) an den llm-proxy `:18235` und produziert einen Bericht mit
semantischen Befunden und einer priorisierten Rangliste. Die Modell-ID wird zur Laufzeit aus
`GET /v1/models` bezogen, Thinking clientseitig abgeschaltet. Jede Stufe ist einzeln ausfallbar;
keine bricht den Lauf ab.

_Ticket: T002612_
