# Proposal: headed-vision-sweep

_Ticket: T012781_

## Why

Der Route-Sweep (`tests/e2e/specs/visual-sweep.spec.ts`) fährt heute alle 106 Routen aus
`components/website/src/data/route-manifest.json` ab, schießt je Route einen Screenshot und
urteilt anschließend ausschließlich über das DOM: HTTP-Status, Redirect-Ziel, Nav-Integrität,
Link-Gesundheit. Was ein Mensch beim Draufsehen sofort erkennt — die Seite ist leer, ein
Stacktrace steht im Viewport, ein Overlay verdeckt den Inhalt, die Spalten überlagern sich —
ist im DOM oft unauffällig. Genau diese Klasse bleibt unentdeckt, obwohl die Bilder bereits
vorliegen.

Der Repo-eigene Weg dahin ist beschrieben, aber seit T002467 **wirkungslos**. Sowohl
`tests/e2e/specs/k8-headed-verify.spec.ts` als auch `.claude/skills/dev-flow-e2e/SKILL.md`
(Schritt 8.5) adressieren einen Vision-Server auf Port **8094** mit **8091** als Rückfall.
Port 8094 existiert in `scripts/llm/loadouts.json` nicht, und das Loadout hinter 8091
(`gemma26-factory`) trägt in seinen eigenen `notes` den Satz „Kein mmproj" — es kann keine
Bilder verarbeiten. Weil der Aufruf als „best-effort" gebaut ist und Fehler nur als Annotation
notiert, ist dieser Defekt nie aufgefallen: der Vision-Check meldet seit jeher „nicht
erreichbar, non-fatal" und niemand hat je ein Urteil gesehen.

Das einzige vision-fähige Loadout ist `gemma12-vision` (Gemma 4 12B QAT + `mmproj-F16.gguf`)
auf Port 8089. Es ist seit T012414 auf **drei** gleichzeitige Slots ausgelegt — eine gemessene,
keine gewählte Zahl —, und der llm-proxy führt seit
`scripts/migrations/2026-08-19-llm-proxy-parallel-slots.sql` eine passende Backend-Zeile mit
`max_inflight = 3`. Diese Kapazität liegt derzeit für Testzwecke brach.

## What

Der Sweep bekommt eine **berichtende** Vision-Stufe: jeder aufgenommene Screenshot geht
zusätzlich an `gemma12-vision` und wird gegen einen festen Fragenkatalog beurteilt. Das
Urteil landet in einer eigenen Ergebnisdatei und in der Kontaktbogen-Galerie; es lässt
**keinen** Test fehlschlagen.

Drei Sweep-Projects laufen gleichzeitig, jedes hält höchstens einen Vision-Request offen.
Damit sind clientseitig nie mehr als drei Anfragen unterwegs — passend zu den drei Slots.

Im selben Zug wird der falsche Vision-Pfad (8094/8091) in Spec, Skill und
`k8-headed-verify.spec.ts` durch den tatsächlichen ersetzt.

**Nicht Teil dieses Vorgangs:** kein CI-Gate (REQ-k8-02 bleibt unangetastet), kein neuer
Dienst, keine Änderung an den Loadouts oder am llm-proxy, keine Ablösung der bestehenden
DOM-Assertions.
