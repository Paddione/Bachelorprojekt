## MODIFIED Requirements

### Requirement: Sidekick-Panel-Navigation mit kontextabhängigem Menü

The system SHALL render a role-aware home menu in the Sidekick panel that shows
admin-exclusive views (Projekttickets, KI-Qualität, Logs, Agentic Terminal) only
to admin users, and SHALL display numeric badges for pending items on the corresponding
menu entries. The admin menu SHALL expose an `Agentic Terminal` entry (view id `terminal`)
in place of the former `Final Grilling` entry; the `grilling` view id SHALL no longer be a
selectable Sidekick view.

#### Scenario: Admin-Nutzer sieht Agentic-Terminal statt Final Grilling

- **GIVEN** der Sidekick wird mit `helpContext = 'admin'` gemountet
- **WHEN** die `SidekickHome`-Komponente rendert
- **THEN** ist ein Menüeintrag mit dem Titel `Agentic Terminal` (id `terminal`, `show: isAdmin`) sichtbar
- **AND** es existiert kein Menüeintrag mit dem Titel `Final Grilling`

#### Scenario: Portal-Nutzer sieht kein Agentic-Terminal

- **GIVEN** der Sidekick wird mit `helpContext = 'portal'` gemountet
- **WHEN** die `SidekickHome`-Komponente rendert
- **THEN** ist der `Agentic Terminal`-Eintrag nicht sichtbar (Admin-exklusiv)

---

### Requirement: sidekick:navigate CustomEvent für bekannte Views

The system SHALL accept a `sidekick:navigate` CustomEvent with a known `view` value (`terminal`,
`mediaviewer`) without throwing a JavaScript error; unknown views SHALL return `null` and produce
no navigation. The `grilling` view value SHALL be removed from the known-view set.

#### Scenario: Navigation zu View "terminal" löst keinen Fehler aus

- **GIVEN** der Sidekick ist geöffnet
- **WHEN** `window.dispatchEvent(new CustomEvent('sidekick:navigate', { detail: { view: 'terminal', jumpTo: null } }))` aufgerufen wird
- **THEN** wird kein JavaScript-Fehler geworfen und die aktive View wechselt auf `terminal`

#### Scenario: Navigation zu View "mediaviewer" löst keinen Fehler aus

- **GIVEN** der Sidekick ist geöffnet
- **WHEN** `window.dispatchEvent(new CustomEvent('sidekick:navigate', { detail: { view: 'mediaviewer', jumpTo: null } }))` aufgerufen wird
- **THEN** wird kein JavaScript-Fehler geworfen

---

### Requirement: Agentic-Terminal-View rendert eingebettetes ttyd-Terminal

The system SHALL provide a `terminal` Sidekick view that renders a `TerminalSessionHost`
component. The component SHALL embed an iframe pointing at `https://${terminalHost}/`
(configured via a `terminalHost` prop, default `terminal.localhost`) and SHALL offer an
"In neuem Tab öffnen" fallback link in the panel header. No `postMessage` host bridge SHALL
be established (ttyd communicates over its own WebSocket).

#### Scenario: Admin öffnet die Agentic-Terminal-View

- **GIVEN** ein Admin hat den Sidekick geöffnet und `terminalHost = 'terminal.localhost'`
- **WHEN** er den Menüeintrag `Agentic Terminal` auswählt
- **THEN** wird ein iframe mit `title="Agentic Terminal"` und `src="https://terminal.localhost/"` gerendert
- **AND** ein Link "In neuem Tab öffnen" mit `href="https://terminal.localhost/"` und `target="_blank"` ist sichtbar
