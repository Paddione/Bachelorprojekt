# Proposal: active-sessions-hub

## Why

Aktive Entwicklungs-Sessions (HTML-Formulare, Brainstorming-Boards, Visual Companion) sind
derzeit nur über manuell weitergegebene `localhost`-URLs erreichbar — für externe Nutzer wie
Gekko gar nicht ohne VPN. Das erzeugt Reibung bei jeder Feature-Intake- oder Grilling-Session:
URL kopieren, HTTP-Server starten, Tunnel separat aufbauen.

Ein zentraler Hub im Mediaviewer-Panel macht alle laufenden Werkzeuge an einem Ort sichtbar
und per Klick öffenbar — für Patrick lokal und für Gekko über einen Keycloak-geschützten
sish-Tunnel ohne zusätzlichen Setup-Aufwand.

## What

- **`scripts/session-hub.sh`**: CLI zum Registrieren/Auflisten/Beenden von Sessions.
  `start-form` startet Python-HTTP-Server + sish-Tunnel + Registry-Eintrag in einem Schritt.
- **Session-Registry**: `~/.local/share/bachelorprojekt/active-sessions.json` — einfach,
  kein DB-Schema, über Website-API abstrahiert (späterer DB-Wechsel ohne UI-Änderung möglich).
- **sish-Tunnel**: `session-<slug>.dev.mentolder.de` per Session (dynamische benannte
  Subdomains via `--force-requested-subdomains=true` auf bestehendem sish-Deployment).
- **Keycloak-Gate**: `session-hub-access`-Gruppe, initial `paddione` + `gekko`. oauth2-proxy
  analog zu `brainstorm`-Setup. `SESSION_HUB_OIDC_SECRET` als neues SealedSecret-Feld.
- **Website-API**: `/api/admin/sessions` (GET/POST/DELETE), Admin-Guard.
- **`SessionsListView.svelte`**: Session-Karten (Typ-Icon, Titel, URL), Polling 10s.
- **`MediaviewerPanel.svelte`**: Im Idle-State (kein Video/Grilling) zeigt die Liste als
  Default-View; Klick → Session im Iframe öffnen.
- **Skill-Integration** (hybrid): SessionStart-Hook ruft `session-hub.sh reap` auf;
  `feature-intake`-Skill und `brainstorm-tunnel-setup.md` rufen `register` explizit auf.

_Ticket: T000975_
_Spec: docs/superpowers/specs/2026-06-20-active-sessions-hub-design.md_
