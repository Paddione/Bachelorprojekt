# Proposal: sdlc-cockpit-k4-steuerung

## Why

Das SDLC-Cockpit zeigt heute Zustand, aber es greift nicht ein. E5 verlangt den
vollen Lebenszyklus inklusive Eingriff; der Auth-Schnitt
(`openspec/changes/cockpit-auth-schnitt`) hat entschieden, **wie** das geht:
Schreibaktionen, die im Cluster laufen können, gehen über die bestehende
Admin-Auth der Website — kein neuer Mechanismus.

Zugleich trägt der heutige Stand drei Stellen, die eine Fähigkeit behaupten, die
es nicht gibt oder die nicht trägt:

1. `.lavish/kit/adapter.js` hält mit `getToken()` einen Token-Abruf, der seit
   T002505 hart `null` liefert. Jeder Aufruf scheitert per Konstruktion; ein
   Leser kann „bewusst deaktiviert" nicht von „defekt" unterscheiden.
2. `.lavish/kit/panel.js` hat den Aktions-Slot nur in Rudimenten: `setActionState`
   setzt bloß eine CSS-Klasse, `confirmAction` fragt jede Aktion gleich zurück,
   der Zustand „läuft" endet nach blinden zwei Sekunden statt am Ergebnis, und
   die mobile Sperre aus D6 greift nur beim Umschalten auf Vollbild und kennt
   kein Freischalten pro Sitzung.
3. Der Adapter spricht alle Endpunkte über **eine** Basis-Konstante an. Der
   Auth-Schnitt hat festgestellt, dass ein globaler Umschalter fünf von acht
   Panels auf `404` stellte — es braucht eine Karte pro Endpunkt.

Ohne Audit-Log bleibt außerdem unbelegt, wer wann was geändert hat. E17 verlangt
es für **jede** Schreibaktion.

## What

K4 setzt aus E5 **genau eine** cluster-seitige Schreibaktion um — **Ticket-Status
setzen** — und baut dabei das vollständige Muster, an das weitere Aktionen später
andocken:

- neue Website-Endpunkte `admin/cockpit/ticket-status` (POST) und
  `admin/cockpit/audit` (GET), beide mit dem gelebten Auth-Muster
  `getSession` + `isAdmin`, sonst `403`;
- Audit-Log in der Ticket-Datenbank (`tickets.cockpit_audit`), transaktional an
  die Schreibaktion gekoppelt und als Strom-Panel lesbar;
- Endpunkt-Karte im Adapter statt einer globalen Basis-Konstante, samt
  ausdrücklicher Meldung „Quelle in diesem Kontext nicht verfügbar" für die
  dauerhaft daemon-only Endpunkte `agents` und `models` (D13);
- Entfernung der browser-seitigen Daemon-Schreibstubs `agentAction()` und
  `getToken()`; `ticketAction()` läuft künftig über die Website-API mit
  Session-Cookie;
- Vier-Zustands-Aktions-Slot (D4), abgestufte Bestätigung nach Umkehrbarkeit
  (D5) und mobile Freischaltung pro Sitzung (D6) — die Abstufung liegt in einem
  eigenen, DOM-freien Modul, damit sie messbar ist statt nur behauptet.

**Ausdrücklich nicht im Scope: PR-Merge.** Der Website-Pod hat kein Token mit
ausreichendem Scope — `k3d/website.yaml` mountet nur `GITHUB_CONTENT_TOKEN`, das
laut `environments/schema.yaml` auf `website/content/**` begrenzt ist; der
weitergehende `GITHUB_PAT` ist im Deployment nicht gesetzt. Ein Merge-Endpunkt
wäre zur Laufzeit tot. Bestätigung, Audit und Zustands-Slot entstehen trotzdem
vollständig — als Muster für den zweiten Konsumenten.

Ebenfalls nicht im Scope bleiben die lokal-only-Aktionen (Agent killen, Worktree
entfernen, Lock brechen, Terminal): es gibt keinen Netzwerkweg vom Cluster zu
einem Entwicklerrechner. Die Daemon-Stubs im Server bleiben deshalb bestehen und
weiterhin token-pflichtig — entfernt wird allein der browser-seitige Zugriff.

_Ticket: T002463_
