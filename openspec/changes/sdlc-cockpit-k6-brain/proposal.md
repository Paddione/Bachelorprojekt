# Proposal: sdlc-cockpit-k6-brain

## Why

Das Cockpit zeigt heute Zustand — Tickets, Pods, Factory, Epics — aber keinen
Bezug zu dem, was über diesen Zustand aufgeschrieben wurde. Das kompilierte
Wissen liegt im Brain-Wiki (`Paddione/brain`, im Cluster als `brain`-Deployment
ausgeliefert), und niemand kommt aus einem Panel dorthin. Der Kontext-Slot der
Panels (`.lavish/kit/panel.js`, `setContext`) existiert bereits, rendert eine
Liste von `{href, label}` als Links — und hat bis heute keinen einzigen
Aufrufer.

Zwei Dinge stehen dem im Weg:

1. **Netzweg.** Im Namespace `workspace` wirkt `allow-intra-namespace-ingress`
   mit leerem `podSelector` als Default-Deny für alles von außerhalb. Für jeden
   Dienst, den die Website erreichen darf, existiert eine eigene Policy
   (`allow-website-to-shared-db-ingress`, `-pocket-id-`, `-nextcloud-`,
   `-vaultwarden-` in `k3d/network-policies.yaml`); für `brain` fehlt sie. Der
   Dienst selbst ist gesund — Selector passt, Pod 1/1, Container-Port 8787,
   Service mappt 80 auf 8787.
2. **Zuordnung.** Ein Panel weiß, worüber es spricht (ein Epic, eine Spec, eine
   Quelldatei), aber nicht, welche Wiki-Seite dazu gehört.

## What

Ein Website-Endpunkt `GET /api/admin/cockpit/brain` liest das Brain-Wiki
**cluster-intern** über den Service-Namen, erzwingt selbst `isAdmin`
(`getSession` → `isAdmin` → sonst `403`) und liefert dem Adapter eine Liste von
`{href, label}` — genau die Form, die `panel.js#setContext` bereits erwartet.
Die am `oauth2-proxy`-Rand entfallende Absicherung wird damit an der API
wiederhergestellt.

Die Zuordnung Quellpfad → Wiki-Seite ist **deterministisch aus der bestehenden
Ingest-Pipeline abgeleitet**, nicht geraten und nicht gelernt:
`scripts/brain-ingest-worklist.sh` erzeugt aus jeder Quelldatei einen Slug
(Endung ab, führender Punkt ab, `/`, `_` und Leerzeichen zu `-`,
Kleinschreibung), und `scripts/brain-ingest.sh` schreibt die transformierte
Seite nach `<brain-repo>/wiki/<slug>.md`. Aus einem bekannten Quellpfad ergibt
sich der Zielslug damit durch reine Textumformung.

**Ausdrücklich verworfen** wurden zwei Alternativen:

- *Volltextsuche im Wiki* — die Trefferqualität schwankt mit dem Inhalt, und
  Tests müssten gegen einen wechselnden Korpus ankern.
- *Semantische Zuordnung über `bge-mcp`* — das hinge ein Panel-Detail an die
  Verfügbarkeit des Embedding-Stacks, die ein eigenes offenes Thema ist
  (T002110).

Der Preis der deterministischen Wahl ist bekannt und wird angenommen: **gefunden
wird nur, was der Ingest-Konvention folgt.** Das Quellen-Manifest
(`scripts/brain/ingest-sources.yaml`) nimmt genau acht Gruppen auf — SSOT-Specs,
Runbooks, ADRs, die Gotchas-Datei, Agent-Guide-Seiten, `CLAUDE.md`/`AGENTS.md`,
die Health-Goals und die Diagramme. `website/`, `k3d/`, `scripts/` und `tests/`
werden vom Worklist-Lauf sogar aktiv weggeschnitten (`-prune`). Für solche Pfade
gibt der Endpunkt bewusst keinen Link aus, statt einen zu erfinden; die Grenze
wird im Panel benannt, nicht kaschiert.

Ein nicht erreichbarer Brain-Dienst wird ebenfalls benannt: die Antwort trägt
ein `error`-Feld, und eine leere Ergebnismenge bleibt von einem Fehler
unterscheidbar (D13).

_Ticket: T002465_
