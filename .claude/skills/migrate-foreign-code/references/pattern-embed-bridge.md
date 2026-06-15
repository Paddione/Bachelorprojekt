# Pattern: postMessage-Embed-Bridge (Host ↔ Widget)

Wie die migrierte App als eingebettetes Widget in das Plattform-Portal integriert wird.

## Muster (generisch)

Der Host bettet die App als `<iframe>`-Widget ein. Kommunikation läuft über eine
**postMessage-Bridge** mit **Origin-Validierung auf beiden Seiten**. Der **Host besitzt die Daten**
und steuert das Widget per **Props + imperativem Handle**; das Widget bleibt zustandslos und greift
nicht selbst auf Persistenz zu. Die Bridge wird als **pure, testbare Hilfe** auf beiden Seiten
gespiegelt (gleiches Protokoll, getrennt getestet).

Die Widget-Domain wird **nie hardcodiert**, sondern über zentrale Domain-Config aufgelöst (siehe
`configmap-domains` und [pattern-data-and-auth](pattern-data-and-auth.md)) und per Env-Variable ins
Frontend injiziert.

## VideoVault-Beispiel

Die Widget-Seite der Bridge (`mediaviewer-widget/src/embed/bridge.ts`) entstand in Phase 2a; die
Host-Seite (`website/src/lib/mediaviewer-bridge.ts`) spiegelt das Protokoll in Phase 2d. Ein
**versioniertes Hilfsvideo-Manifest** (`help-videos.json`) wird über einen **Zod-validierten
Loader** geladen. Das Companion-Panel rendert den `<iframe>`, postet beim Laden `setVideos` und
empfängt `select`/`progress`/`ended`/`error` **origin-validiert**. Die Widget-Domain kommt über
`MEDIAVIEWER_HOST` (aus `configmap-domains.yaml`), injiziert ins Portal-Layout.

## Stolpersteine

- **Widget-Allowlist** muss den Host-Origin enthalten — eine fehlende Einträge-Korrektur war Teil
  von Phase 2d, sonst verwirft das Widget die Host-Messages.
- **Domain nie als Literal** im Code — immer über `configmap-domains` + Env-Injektion auflösen
  (sonst bricht Multi-Brand und das CI-Domain-Literal-Gate S3 greift in echten Service-Pfaden).
