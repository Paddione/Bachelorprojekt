# Proposal: docs-content-test-paths

## Why

`tests/unit/test-docs-content.bats` prüft einen Docs-Aufbau, den es nicht mehr
gibt. Es liest aus `k3d/docs-content` (handgepflegtes Docsify-Verzeichnis) und
aus einer Shell-HTML unter `docs-site` — beide Pfade existieren nicht. Ein Lauf
am 2026-08-10 ergab 7 von 12 roten Assertions; die übrigen 5 sind vakuos grün,
weil `grep … || true` auf ein fehlendes Verzeichnis eine leere Trefferliste
liefert und „nichts gefunden" als Erfolg gilt. Der Test steht deshalb in
`tests/unit/.coverage-allowlist` und läuft in keinem Gate mit.

Der Inhalt wird heute von `scripts/build-docs.mjs` aus `docs/` nach
`k3d/docs-content-built/` kompiliert. Die entscheidende Frage ist nicht, welchen
Pfad man einträgt, sondern ob das jeweils geprüfte Verhalten überhaupt noch
existiert. Ein blind umgebogener Pfad würde Zusicherungen behaupten, die niemand
mehr gibt.

## What

Je Assertion begründet entschieden — nachziehen, umschreiben oder löschen:

| Alte Assertion | Entscheidung | Grund |
|---|---|---|
| keine Mattermost-Referenzen | löschen | Korpus ist heute eine generierte Aggregation aus `docs/**`, eingefrorenen Schnappschüssen, Repo- und Plugin-Skills und Agent-Definitionen. Mattermost steht dort legitim in `agents/bachelorprojekt-test.html`, `findings.html` (Audit-Beleg) und `contributing.html` („spiegeln entfernte Services wider") |
| keine InvoiceNinja-Referenzen | löschen | dieselben Fundstellen, dieselbe Begründung |
| keine Stripe-Referenzen | löschen | `stripe_invoice_id` ist eine reale Spalte im gerenderten Schema-Diagramm (`datamodel-workflow.html`, `db-schema.html`); zusätzlich nennen Drittanbieter-Plugin-Docs Stripe. Der Guard würde verbieten, das eigene Schema zu dokumentieren |
| keine veraltete Cluster-Topologie | umschreiben | Absicht bleibt gültig, Korpus wird eng gefasst auf gepflegte Top-Level-Dokumente `docs/*.md`; eingefrorene Schnappschüsse und Archive dürfen die alte Topologie benennen |
| jeder Sidebar-Link hat eine Datei | umschreiben | `_sidebar.md` ist weg, die Navigation erzeugt `scripts/docs-gen/navigation.mjs` in jede Seite. Absicht („kein toter Link") bleibt und wird gegen die Bauausgabe geprüft |
| Sidebar beginnt mit Quickstarts-Gruppe | löschen | das Navigationsmodell kennt keine Quickstarts-Gruppe; die Gruppen stehen in `DOC_GROUPS`/`CATEGORY_ORDER`. Ein Umbiegen erfände eine Anforderung |
| Sidebar enthält alle drei Quickstart-Links | umschreiben | überlebende Absicht: die drei Quickstart-Seiten werden ausgeliefert. Sie sind bewusst nicht in der Sidebar — das wird nicht behauptet |
| Sidebar-Label „MCP-Server (Claude Code)" | löschen | war eine Docsify-Sidebar-Zeile. Labels kommen heute aus dem Seitentitel (`claude-code.html` heißt „MCP-Server"); die Paarung sichert niemand mehr zu |
| Shell setzt `data-brand` aus dem Hostnamen | löschen | Shell-Datei entfernt, `data-brand` kommt in der gesamten Bauausgabe nicht vor. Das Docs-Theme ist markenneutral |
| Shell definiert Token-Blöcke je Brand | löschen | dieselbe entfernte Datei |
| jede Service-Seite hat einen Mermaid-Block | umschreiben | Verhalten lebt: 12 Seiten tragen je ein Diagramm. Quelle ist die gebaute HTML (vorgerendert, keine ```mermaid-Fences), und `keycloak` fällt von der Liste — Pocket ID hat Keycloak abgelöst |
| Glossar und Decisions nicht-trivial | nachziehen | beide werden ausgeliefert; nur Pfad und Endung ändern sich, Schwelle wird von Zeilen auf Wörter im Textinhalt umgestellt |

Dazu ein neuer Konventions-Guard: keine `*.bats`-Datei darf auf die
abgeschalteten Docs-Pfade zeigen. Er hält genau den Rückfall auf, der diesen
Fehler entstehen ließ, und wird erst grün, wenn die Altdatei entfernt ist.

_Ticket: T003142_
