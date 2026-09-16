# Design: devmesh-k3d-decommission

## Goals

- Kein Datenverlust beim Abbau des k3d-Clusters.
- Nach dem Change zeigt kein aktiver Default mehr auf einen toten Context.
- Doku und Spec beschreiben dieselben zwei Contexts, die tatsächlich existieren.

## Non-Goals

- Umbau des Verzeichnisnamens `k3d/`.
- Änderungen an fleet.

## Kontext (gemessen 2026-09-11)

```bash
# aktive Verweise auf den k3d-Context, pro Datei
git grep -n 'k3d-mentolder-dev' -- . ':!openspec/changes/archive' ':!docs/superpowers/plans' \
  ':!docs/superpowers/specs/archive' | cut -d: -f1 | sort | uniq -c | sort -rn
# Stand 1c924b5b9: rund 40 Dateien, Spitze taskfiles/Taskfile.sdlc.yml (14)

grep -n 'FACTORY_CTX=' scripts/factory/lib.sh    # "${FACTORY_CTX:-k3d-mentolder-dev}"
grep -n 'CTX="${TICKET_CTX' scripts/ticket.sh    # "${TICKET_CTX:-fleet}"
```

## Decisions

### D1 — Abbau nur nach Gate

Der k3d-Cluster ist die einzige Kopie der lokalen `pocket_id`-Passkeys. Das Gate verlangt einen
bestandenen Migrationsvergleich (SP-3) und einen frischen Dump außerhalb des Clusters. Ohne
beides bricht `task devmesh:acceptance` mit Exit 1 ab, und der Abbau-Task verweigert den Lauf.

### D2 — `FACTORY_CTX` auf fleet, nicht auf devmesh

Die Factory arbeitet auf der führenden Ticket-DB (ADR-007 A, fleet). devmesh ist durch den
SP-3-Guard für Schreibzugriffe gesperrt; ein Default auf devmesh würde jeden Factory-Aufruf
fehlschlagen lassen. Der Kommentar T003544 in `lib.sh` verlangt Gleichlauf mit `ticket.sh`
und `_ticket-core.sh`, die bereits `fleet` nutzen.

### D3 — Kubelet-Zertifikats-Prüfung entfällt

Die vier Kubelet-Requirements lösen ein k3d-spezifisches Problem: Docker vergibt Node-IPs neu,
das Kubelet-Zertifikat behält die alte SAN. Auf Bare-Metal-k3s mit fester LAN-Adresse tritt das
nicht auf. Die x509-Übersetzung im Ticket-Tooling verweist auf das gelöschte Prüfskript und
entfällt mit.

### D4 — Requirements mit „local k3d" im Namen werden umbenannt

Nach `wsl-exit-nachzug` beschreiben „Local k3d cluster runs the SDLC stack…" und „Mixed runtime —
local k3d…" bereits fleet, tragen aber den alten Namen und behaupten, es gebe keinen k3d-Context
mehr — was bis zu diesem Change falsch war. Umbenennung plus Neufassung macht Namen und Inhalt
wahr und nennt devmesh als Entwicklungs-Context.

### D5 — Guard mit Positiv-Anker

`no-k3d-context.bats` prüft zuerst, dass die Suche selbst funktioniert (ein bekannter Treffer in
einer archivierten Datei wird gefunden), dann dass die aktive Suche leer ist. Ohne Anker wäre
ein falscher Pfad-Ausschluss ein stilles Grün (Konvention `tests/CLAUDE.md`).

## Risks

- **R1** Übersehene Aufrufer mit hart kodiertem `--context k3d-mentolder-dev` in Nicht-Textdateien
  (z. B. systemd-Units in `scripts/dev-host-units/`). Der Guard sucht über alle getrackten Dateien.
- **R2** Laufende Sessions mit `FACTORY_CTX` aus der Umgebung merken den Wechsel nicht; die
  Doku nennt `unset FACTORY_CTX` als Umstellungsschritt.
- **R3** `ws-ubuntu-1` hat 243 G Disk; als Agent ohne `storage=true` unkritisch.

## Testing

- BATS `tests/spec/local-dev-mesh/no-k3d-context.bats` (Positiv-Anker + leere aktive Suche).
- BATS `tests/spec/local-dev-mesh/factory-ctx-default.bats`: `lib.sh` sourcen ohne
  `FACTORY_CTX` → Wert `fleet`.
- BATS für `task devmesh:acceptance` mit gestubbtem Migrationsvergleich: fehlender Dump → Exit 1.
- Live-Abnahme: `kubectl config get-contexts -o name` auf PK-Desktop listet `fleet`, `devmesh`
  (und `hetzner`), kein `k3d-*`; `task devmesh:status` meldet vier Knoten.
