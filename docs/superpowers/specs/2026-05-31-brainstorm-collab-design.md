# Collaborative Brainstorm Tunnel (Design Spec)

- **Datum:** 2026-05-31
- **Branch:** `feature/brainstorm-collab`
- **Status:** approved (brainstorming)
- **Betrifft:** repo-eigene Patch-Skripte auf den superpowers-Companion, `Taskfile.yml` (`brainstorm:*`), oauth2-proxy/Keycloak-Gating des Brainstorm-Tunnels
- **Vorgänger/Verwandt:** `scripts/superpowers-helper-patch.sh` (bestehender `wss://`-Patch), `.claude/skills/references/brainstorm-tunnel-setup.md`

## Problem & Ziel

Der User möchte einen Brainstorm-/Dev-Flow starten und **gekko (remote) live zuschauen UND mitmachen** lassen. Befund aus der Code-Analyse: **vieles geht schon** — `task brainstorm:publish` exponiert den Companion unter `brainstorm.dev.mentolder.de` (sish, publish-key-gated), der Companion-Server hält ein **Multi-Client-WebSocket** und **broadcastet `reload`** an alle, sobald ein neuer Screen gepusht wird (Live-Sync), und Klicks fließen in denselben Event-Stream, den der Agent liest.

Vier echte Lücken bleiben (alle vom User bestätigt):
1. **Freitext-Teilnahme** — gekko kann nur klicken, nicht zurückschreiben.
2. **Identität & Präsenz** — Events sagen nicht WER (du vs gekko); niemand sieht, wer da ist.
3. **Dev-Flow zuschauen** — gekko sieht nur Brainstorm-Screens, nicht den echten Lauf (Plan-Schritt/Fortschritt).
4. **Link absichern** — die View-URL ist offen (wer den Link hat, sieht mit).

## Gewählter Ansatz (aus Brainstorming): „patch-extend"

Die Companion-Dateien (`server.cjs`, `helper.js`) liegen im **Plugin-Cache**, nicht im Repo. Das etablierte Repo-Muster ist ein **idempotentes Patch-Skript** (wie `superpowers-helper-patch.sh`). Wir erweitern damit, statt zu forken. Das vorhandene Multi-Client-WebSocket wird wiederverwendet.

### A — Client-Patch (`helper.js`)
- **Name beim Beitritt** (Prompt → `localStorage`, Key `brainstorm_who`).
- **Collab-Panel** dynamisch per JS ins DOM injiziert (kein `frame-template`-Eingriff): Präsenz-Liste + Chat-/Freitext-Box + kurzer Chat-Verlauf.
- Jedes gesendete Event wird mit `who: <name>` getaggt.
- `ws.onmessage` behandelt zusätzlich eingehende `chat`/`presence` (rendern), nicht nur `reload`.
- **Präsenz per Heartbeat**: Client sendet periodisch `{type:'presence', who, ts}`; jeder Client zeigt, wen er zuletzt gehört hat (kein Server-Socket-Bookkeeping nötig).

### B — Server-Patch (`server.cjs`, Funktion `handleMessage`)
- Eingehende `chat`/`presence`/`note`-Events werden an **alle** Clients gebroadcastet (nutzt vorhandenes `clients`-Set + `broadcast()`).
- `note`/`chat` werden zusätzlich an die `state/events`-Datei angehängt (heute nur `event.choice`), damit der Agent gekkos Text liest — **attribuiert** via `who`.
- Minimaler, klar abgegrenzter Eingriff; keine Signaturänderung nötig.

### C — Dev-Flow zuschauen
- Helper `task brainstorm:push "<titel>" "<status>"` schreibt eine Status-Screen-HTML in den Content-Dir → vorhandener Broadcast-Reload → gekko folgt dem echten Lauf (aktueller Plan-Schritt, Befehls-Zusammenfassung).
- **Ehrlich:** Das ist Helper **+ Konvention** (der Orchestrator pusht Meilensteine), kein reines Feature.

### D — Link absichern (Keycloak SSO)
- `oauth2-proxy-brainstorm` (Klon von `oauth2-proxy-docs.yaml`) + Keycloak-Client `brainstorm` + Gruppe `/brainstorm-access`, vor die `brainstorm.dev.mentolder.de`-Route gesetzt. **WebSocket-Upgrade muss durchgereicht werden** (oauth2-proxy kann das — im Plan verifizieren).
- Neuer Secret-Key `BRAINSTORM_OIDC_SECRET`, `BRAINSTORM_DOMAIN` in der Domains-Registry. gekko loggt sich via Keycloak ein; nur Gruppenmitglieder kommen rein.

### E — Ein-Befehl-Session
- `task brainstorm:collab` = vorhandener publish-Flow + sichert den Companion + druckt den SSO-Link zum Weitergeben an gekko. Teardown nutzt den vorhandenen Stop.

## Komponenten & Datenfluss

```
Du (publisher) ── task brainstorm:collab ──► publish + SSO-Link
gekko (viewer) ── brainstorm.dev.mentolder.de (oauth2-proxy + /brainstorm-access) ──► Companion
Companion server.cjs (PATCHED): reload-broadcast + chat/presence/note-relay + note→events
helper.js (PATCHED): name, presence-heartbeat, chat/free-text panel, who-tagging
task brainstorm:push ──► schreibt Status-Screen ──► broadcast reload ──► alle sehen den Lauf
events-Datei ──► Agent liest Klicks + Notizen (attribuiert)
```

## Tests

- **Patch-Idempotenz:** zweimal anwenden → stabil; nach simuliertem Plugin-Update sauber re-applybar (mirror `superpowers-helper-patch.sh`-Guard).
- **Server-Relay (headless):** zwei WebSocket-Clients; A sendet `chat` → B empfängt den Broadcast; `note` landet in der events-Datei mit `who`.
- **Manifest-Validierung:** `recovery`-artige oauth2-proxy/IngressRoute für `brainstorm` validiert; nicht in `k3d/kustomization.yaml` falls on-demand.
- **Realm-JSON** bleibt valide nach Client-/Gruppen-Ergänzung.

## Out of Scope / Non-Goals

- **Kein** Fork des Companions; nur idempotente Patches.
- **Keine** harte Server-Socket-Identität — Präsenz ist Heartbeat-basiert (soft).
- **Kein** persistenter Chat-Verlauf über die Session hinaus (events-Datei wird beim neuen Screen geleert — bewusst).
- **Keine** Änderung an der bestehenden Klick-Auswertung oder am Screen-/Reload-Mechanismus.
- **Kein** Pushen sensibler Live-Terminal-Rohausgaben automatisch — der Orchestrator pusht bewusst kuratierte Status-Screens (vermeidet Leaks an gekko).

## Risiko

Mittel. Hauptrisiken: (1) Patchen plugin-eigener Dateien — Skripte müssen idempotent sein und nach Plugin-Updates neu laufen (Muster existiert); (2) oauth2-proxy muss den WS-Upgrade für `wss://` durchreichen — im Plan verifizieren; (3) „Dev-Flow zuschauen" ist Konvention + Helper, kein Vollautomatismus. Kernmechanik (WS-Broadcast, Tunnel, Patch-Muster) existiert bereits.
