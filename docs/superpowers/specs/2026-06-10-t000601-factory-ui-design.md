# Spec: Factory UI — Control Panel (Kill-Switch, Caps, Dry-Run)

**Ticket:** T000601
**Datum:** 2026-06-10
**Status:** draft

---

## Ziel

Der `/dev-status`-Screen erhaelt einen neuen Tab "Control Panel", der Factory-Betriebsparameter direkt aus der Browser-UI steuerbar macht. Operatoren koennen per Toggle den Autopiloten ab- und zuschalten (Kill-Switch), den Dry-Run-Modus aktivieren, sowie die parallelen Slots (1–8) und das Tageslimit konfigurieren — ohne direkt in Kubernetes-Secrets oder die Datenbank einzugreifen. Die Darstellung folgt der etablierten Industrial/Loft-Aesthetik des Factory-Floors: schweres Raster, Monospace, Foerderband-Metapher.

---

## Scope

### In-Scope

- Neuer Tab "Control Panel" im `/dev-status`-Screen (neben dem vorhandenen Factory-Floor-Tab)
- 2x2-Grid aus vier Kontrollkarten (280x200px, Surface `#1e2736`, 2px Solid-Border `#2d3748`)
  - **Karte 1 — Kill-Switch:** 80px Toggle-Button; OFF-Zustand = `#ef4444` mit Glow-Shadow, ON-Zustand = `#22c55e` mit Glow-Shadow; AUTOPILOT Pilot-Light (LED-Indikator)
  - **Karte 2 — Dry-Run:** Toggle `#f59e0b`; Warndreieck-Icon; Label "TEST MODE"
  - **Karte 3 — Slot-Cap:** Stepper 1–8 mit Segment-Dot-Reihe (Balkenanzeige, Monospace-Label "PARALLELE SLOTS")
  - **Karte 4 — Daily-Cap:** Stepper (sinnvoller Bereich 1–50) mit numerischer Anzeige, Label "TAGES-LIMIT"
- Status-Streifen am unteren Rand: `last_activity`-Timestamp + Watchdog Pilot-Light (Indikator fuer Watchdog-Staleness aus `control.watchdogStale`)
- API-Endpunkt `GET /api/admin/factory-control` — gibt aktuellen State zurueck
- API-Endpunkt `PATCH /api/admin/factory-control` — persistiert Aenderungen (optimistic update im Frontend, Rollback bei Fehler)
- Watchdog-Status wird aus bestehendem `GET /api/factory-floor` (`control.watchdogStale`) bezogen
- Mobile-Layout: alle vier Karten stacked (1-Spalte), Touch-Toggles min. 64px Hoehe, +/- Stepper-Buttons min. 44px, volle Funktionsparitaet

### Explizit NICHT in-Scope

- Aenderungen an der Factory-Pipeline selbst (pipeline.js, autopilot.sh, worker-scripts)
- Historien-Log oder Audit-Trail der Steueraenderungen
- Rollenbasierte Zugriffskontrolle unterhalb der bestehenden Admin-Auth-Schicht
- Echtzeit-Push via WebSocket (Polling reicht fuer dieses Control Panel)
- Alarmierung / Benachrichtigungen bei Kill-Switch-Aktivierung
- Einbindung in Keycloak-Feingranulierung (Sub-Roles)

---

## Design-Entscheidungen

### Farben

| Token            | Hex       | Verwendung                                      |
|------------------|-----------|-------------------------------------------------|
| `bg-base`        | `#0d1117` | Seiten-Hintergrund                              |
| `surface`        | `#1e2736` | Karten-Hintergrund                              |
| `border-default` | `#2d3748` | Karten-Rand, Stepper-Rahmen                     |
| `amber`          | `#f59e0b` | Dry-Run Toggle, Warndreieck, Stepper-Highlight  |
| `green`          | `#22c55e` | Kill-Switch ON, Watchdog-OK-Pilot-Light         |
| `red`            | `#ef4444` | Kill-Switch OFF, Watchdog-Stale-Pilot-Light     |
| `text-mono`      | `#e2e8f0` | Alle Labels, Werte (font-family: monospace)     |
| `dim`            | `#64748b` | Sekundaere Labels, Timestamp-Text               |

### Komponenten

- **ControlCard:** Container 280x200px (Desktop), 100% Breite minus Gutter (Mobile); `background: #1e2736; border: 2px solid #2d3748; border-radius: 4px; padding: 20px`
- **ToggleSwitch:** CSS-only Pill-Toggle, Breite 80px (Kill-Switch), 64px (Dry-Run); Transition 200ms ease; Box-Shadow Glow bei aktivem Zustand
- **PilotLight:** 12px Kreis-LED, animierter Pulse bei aktiv, statisch grau bei inaktiv
- **SegmentDots:** Reihe von 8 Punkten (10px), ausgefuellt bis `slotCap`-Wert in `#f59e0b`, Rest in `#2d3748`
- **Stepper:** `[-] [Wert] [+]`-Layout; Buttons 44px Touch-Target; Wert zentriert, Monospace

### Mobile-Ansatz

- Breakpoint: `< 768px` → 1-Spalte-Stack, volle Breite
- Toggle-Mindesthoehe: 64px (barrierefreies Touch-Target)
- Stepper-Buttons: 44x44px, klare +/- Icons
- Status-Streifen: unter den Karten, volle Breite
- Kein abgespecktes Feature-Set — alle vier Karten immer sichtbar

### View-Switcher

- Vorhandenes Tab-System in `/dev-status` wird um "Control Panel" erweitert
- Tab-Auswahl persistiert in `localStorage` (Key: `devstatus-active-tab`)

---

## Akzeptanzkriterien

1. **Kill-Switch Toggle (OFF):** Wenn `killSwitch=true` im Backend, zeigt die Karte einen roten Toggle (`#ef4444`) mit Glow-Shadow; der AUTOPILOT Pilot-Light leuchtet rot. Ein PATCH auf `{killSwitch: false}` schaltet den Autopiloten wieder ein und wechselt die Farbe zu `#22c55e` innerhalb von 500ms.

2. **Dry-Run Toggle:** Ein aktiver Dry-Run (`dryRun=true`) zeigt Toggle in `#f59e0b` mit Warndreieck-Icon und Label "TEST MODE". Der Zustand wird per PATCH persistiert und bei Seiten-Reload korrekt wiederhergestellt (GET-Initialisierung).

3. **Slot-Cap Stepper:** Der Stepper erlaubt Werte 1–8; der [-]-Button ist bei Wert=1 deaktiviert, der [+]-Button bei Wert=8. Die Segment-Dot-Reihe zeigt exakt so viele ausgefuellte Punkte wie der aktuelle Wert. Jede Aenderung loest sofort einen PATCH aus; bei API-Fehler rollt das UI auf den vorherigen Wert zurueck.

4. **Daily-Cap Stepper:** Analog zum Slot-Cap; Bereich 1–50; bei ungueltigem Wert vom Server wird ein Fehler-Toast eingeblendet und der alte Wert restauriert.

5. **Watchdog Pilot-Light:** Der Status-Streifen zeigt den `last_activity`-Timestamp im ISO-Format sowie einen gruenen Pilot-Light wenn `watchdogStale=false` und einen roten Pilot-Light wenn `watchdogStale=true`. Der Status wird alle 30 Sekunden per Polling aus `/api/factory-floor` aktualisiert.

6. **Mobile Touch-Targets:** Auf Viewport < 768px sind alle Toggle-Elemente mindestens 64px hoch und alle Stepper-Buttons mindestens 44x44px gross. Alle Funktionen (Toggles, Stepper) sind auf einem Touch-Geraet bedienbar.

7. **Admin-Auth-Gate:** Der Endpunkt `GET /api/admin/factory-control` gibt HTTP 401 zurueck fuer nicht eingeloggte Nutzer und HTTP 403 fuer eingeloggte Nicht-Admins. Der Control-Panel-Tab ist im Frontend nur fuer Admin-Sessions sichtbar.

8. **Optimistic Update + Rollback:** Alle PATCH-Operationen aktualisieren das UI sofort (optimistic). Bei HTTP 4xx/5xx wird der vorherige Wert wiederhergestellt und ein sichtbarer Fehlerhinweis angezeigt.

---

## Nicht-Scope

- Pipeline-Logik-Aenderungen (pipeline.js, Dispatcher, Scout)
- Audit-Log oder History-View der Konfigurationsaenderungen
- Echtzeit-WebSocket-Push (Polling genuegt)
- Sub-Role-basierte Keycloak-Zugriffskontrolle
- Alarmierungs-/Benachrichtigungssystem bei Zustandsaenderungen
- Integration mit externen Monitoring-Systemen (Prometheus, Grafana)
