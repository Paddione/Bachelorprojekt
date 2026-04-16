<div class="page-hero">
  <span class="page-hero-icon">🤖</span>
  <div class="page-hero-body">
    <div class="page-hero-title">MCP Actions</div>
    <p class="page-hero-desc">Referenz aller Aktionen, die Claude Code über die verbundenen MCP-Server ausführen kann: Kubernetes, Postgres, Browser, Grafana, Prometheus.</p>
    <div class="page-hero-meta">
      <span class="page-hero-tag">Claude Code KI</span>
      <span class="page-hero-tag">MCP Server</span>
    </div>
  </div>
  <a href="#/" class="page-hero-back">← Übersicht</a>
</div>

# MCP-Aktionen Referenz

Alle Aktionen, die Claude Code ueber die verbundenen MCP-Server ausfuehren kann.

### Konfiguration

| Aktion | Beschreibung |
|--------|-------------|
| `configuration_contexts_list` | Alle verfuegbaren kubeconfig-Kontexte und deren Server-URLs auflisten |
| `configuration_view` | Aktuelle kubeconfig-YAML anzeigen (vollstaendig oder minimiert fuer aktuellen Kontext) |

### Namespaces & Events

| Aktion | Beschreibung |
|--------|-------------|
| `namespaces_list` | Alle Namespaces im Cluster auflisten |
| `events_list` | Cluster-Events (Warnungen, Fehler, Zustandsaenderungen) zur Fehlersuche auflisten |

### Nodes

| Aktion | Beschreibung |
|--------|-------------|
| `nodes_top` | CPU-/Speicherverbrauch der Nodes anzeigen (via Metrics Server) |
| `nodes_stats_summary` | Detaillierte Node-Statistiken: CPU, Speicher, Dateisystem, Netzwerk, PSI-Metriken |
| `nodes_log` | Logs eines Nodes abrufen (kubelet, kube-proxy oder beliebiger Log-Dateipfad) |

### Pods

| Aktion | Beschreibung |
|--------|-------------|
| `pods_list` | Alle Pods ueber alle Namespaces auflisten |
| `pods_list_in_namespace` | Pods in einem bestimmten Namespace auflisten (unterstuetzt Label-/Field-Selektoren) |
| `pods_get` | Vollstaendiges Manifest eines bestimmten Pods abrufen |
| `pods_log` | Logs eines Pods oder bestimmten Containers ansehen (unterstuetzt vorherigen Container) |
| `pods_exec` | Befehl in einem Pod-Container ausfuehren (Shell-Zugriff) |
| `pods_run` | Neuen Pod aus einem Image starten (ephemere/Debug-Pods) |
| `pods_delete` | Pod nach Name loeschen |
| `pods_top` | CPU-/Speicherverbrauch der Pods anzeigen (via Metrics Server) |

### Generische Ressourcen

| Aktion | Beschreibung |
|--------|-------------|
| `resources_list` | Beliebige Kubernetes-Ressource nach apiVersion + kind auflisten (Deployments, Services, Ingresses usw.) |
| `resources_get` | Bestimmte Ressource nach apiVersion, kind und Name abrufen |
| `resources_create_or_update` | YAML/JSON-Ressourcen-Manifest anwenden (erstellen oder aktualisieren) |
| `resources_delete` | Ressource nach apiVersion, kind und Name loeschen |
| `resources_scale` | Replica-Anzahl eines Deployments oder StatefulSets abfragen oder setzen |

---

## Playwright Browser (`mcp-browser`)

Vollstaendige Browser-Automatisierung via `@playwright/mcp` (Microsoft). Fuehrt headloses Chromium im Cluster aus.

Aktionen verwenden ein **Accessibility-Snapshot-Modell** -- `browser_snapshot` liefert eine strukturierte DOM-Referenz, andere Aktionen adressieren Elemente ueber deren `ref` aus dem Snapshot.

### Navigation

| Aktion | Beschreibung |
|--------|-------------|
| `browser_navigate` | Zu einer URL navigieren |
| `browser_navigate_back` | Zurueck zur vorherigen Seite im Verlauf |
| `browser_wait_for` | Auf das Erscheinen/Verschwinden von Text warten oder N Sekunden pausieren |

### Seiten-Inspektion

| Aktion | Beschreibung |
|--------|-------------|
| `browser_snapshot` | Accessibility-Tree der aktuellen Seite erfassen (bevorzugt gegenueber Screenshot fuer Interaktionen) |
| `browser_take_screenshot` | PNG/JPEG-Screenshot des Viewports, der gesamten Seite oder eines bestimmten Elements |
| `browser_console_messages` | Alle Browser-Konsolennachrichten zurueckgeben (Fehler/Warnung/Info/Debug) |
| `browser_network_requests` | Alle Netzwerk-Requests seit Seitenladung auflisten (filterbar nach URL-Muster, inkl. Header/Body) |

### Interaktion

| Aktion | Beschreibung |
|--------|-------------|
| `browser_click` | Element anklicken (Einzel-, Doppel- oder Rechtsklick; mit Modifier-Tasten) |
| `browser_hover` | Maus ueber ein Element bewegen |
| `browser_type` | Text in ein editierbares Element eingeben (optional mit Enter absenden) |
| `browser_press_key` | Bestimmte Taste druecken (z.B. `ArrowLeft`, `Enter`, `Escape`) |
| `browser_fill_form` | Mehrere Formularfelder gleichzeitig ausfuellen (Textbox, Checkbox, Radio, Combobox, Slider) |
| `browser_select_option` | Eine oder mehrere Optionen in einem Dropdown auswaehlen |
| `browser_drag` | Drag-and-Drop zwischen zwei Elementen |
| `browser_file_upload` | Eine oder mehrere Dateien ueber einen File-Chooser hochladen |
| `browser_handle_dialog` | Browser-Dialog bestaetigen oder abbrechen (Alert, Confirm, Prompt) |

### Tabs

| Aktion | Beschreibung |
|--------|-------------|
| `browser_tabs` | Browser-Tabs auflisten, erstellen, schliessen oder wechseln |

### Scripting

| Aktion | Beschreibung |
|--------|-------------|
| `browser_evaluate` | JavaScript-Ausdruck auf der Seite oder gegen ein bestimmtes Element auswerten |
| `browser_run_code` | Beliebiges Playwright `async (page) => { ... }` Code-Snippet ausfuehren |

### Lebenszyklus

| Aktion | Beschreibung |
|--------|-------------|
| `browser_close` | Aktuelle Seite/Browser schliessen |
| `browser_resize` | Browserfenster auf bestimmte Breite/Hoehe aendern |

> **Tipp:** Der typische Ablauf ist `browser_navigate` → `browser_snapshot` (Element-Refs erhalten) → Interaktions-Aktionen → `browser_take_screenshot` zur Verifikation.

---

## Kubernetes Read-Only (`mcp-kubernetes` via `mcp-k8s-go`)

Ein Read-Only-Kubernetes-MCP-Server, der im Cluster als Teil von `claude-code-mcp-ops` laeuft. Wird von Claude Code zur Cluster-Inspektion ohne Schreibzugriff verwendet.

| Aktion | Beschreibung |
|--------|-------------|
| `list-k8s-contexts` | Alle Kubernetes-Kontexte aus kubeconfig auflisten |
| `list-k8s-namespaces` | Namespaces in einem bestimmten Kontext auflisten |
| `list-k8s-nodes` | Nodes in einem bestimmten Kontext auflisten |
| `list-k8s-resources` | Beliebige Ressource nach kind (und optionalem group/version/namespace) auflisten |
| `get-k8s-resource` | Vollstaendige Details einer bestimmten Ressource als JSON oder via Go-Template |
| `list-k8s-events` | Events in einem Namespace fuer einen bestimmten Kontext auflisten |
| `get-k8s-pod-logs` | Pod-Logs abrufen (unterstuetzt Container-Auswahl, Zeitfilter, Byte-Limit) |

> **Nur lesend** -- keine Erstell-, Aktualisierungs-, Loesch-, Exec- oder Skalierungs-Operationen.

---

## PostgreSQL (`mcp-postgres`)

Direkter SQL-Zugriff auf die gemeinsame PostgreSQL-Instanz (`shared-db`) im Cluster.

| Aktion | Beschreibung |
|--------|-------------|
| `query` | SQL-Abfrage (nur lesend) gegen die gemeinsame Datenbank ausfuehren |

> **Nur lesend** -- ausschliesslich `SELECT`-Abfragen. Alle Workspace-Datenbanken (Keycloak, Mattermost, Nextcloud, OpenSearch usw.) liegen auf dieser gemeinsamen Instanz und sind abfragbar.

---

> **Hinweis:** Alle folgenden MCP-Server sind sowohl im k3d-Cluster (via `k3d/claude-code-mcp-*.yaml`) als auch im Produktions-Overlay (`deploy/mcp/`) verfuegbar. Deploy: `task mcp:deploy` oder `task workspace:up`.

---

## Mattermost (`mcp-mattermost`)

Image: `legard/mcp-server-mattermost`
Verbindet sich mit Mattermost ueber dessen REST-API mit einem Bot-Token.

| Bereich | Abdeckung |
|---------|-----------|
| Kanaele | Auflisten, lesen, Nachrichten in Kanaele senden |
| Direktnachrichten | DMs senden und lesen |
| Teams | Teams und Mitgliedschaften auflisten |
| Benutzer | Benutzerprofile nachschlagen |
| Beitraege | Beitraege erstellen, lesen, darauf reagieren |

---

## Nextcloud (`mcp-nextcloud`)

Image: `ghcr.io/cbcoutinho/nextcloud-mcp-server`
Verbindet sich mit Nextcloud ueber WebDAV/API.

| Bereich | Abdeckung |
|---------|-----------|
| Dateien | Dateien und Ordner auflisten, lesen, hochladen, verschieben, loeschen |
| Kalender | Kalender auflisten, Termine lesen/erstellen/aktualisieren/loeschen (CalDAV) |
| Kontakte | Adressbuecher auflisten, Kontakte lesen/erstellen/aktualisieren/loeschen (CardDAV) |

---

## Invoice Ninja (`mcp-invoiceninja`)

Image: `ckanthony/openapi-mcp` -- eine OpenAPI-zu-MCP-Bruecke.
Stellt die gesamte Invoice Ninja REST-API als MCP-Tools bereit, gesteuert durch die `invoiceninja-openapi` ConfigMap. Die Tool-Liste spiegelt die Invoice Ninja API-Oberflaeche:

| Bereich | Abdeckung |
|---------|-----------|
| Kunden | CRUD auf Kundendatensaetzen |
| Rechnungen | Rechnungen erstellen, senden, archivieren, loeschen |
| Angebote | Angebote erstellen und verwalten |
| Zahlungen | Zahlungen erfassen und verwalten |
| Produkte | Produkt-/Dienstleistungskatalog verwalten |
| Ausgaben | Ausgaben erfassen |
| Berichte | Finanzberichte generieren |

---

## Keycloak (`mcp-keycloak`)

Image: `quay.io/sshaaf/keycloak-mcp-server`
Verwendet SSE-Transport (nicht streamable-HTTP). Erfordert ein gueltiges Keycloak-Bearer-Token bei jedem Request.

| Bereich | Abdeckung |
|---------|-----------|
| Benutzer | Benutzer erstellen, lesen, aktualisieren, loeschen; Passwoerter zuruecksetzen |
| Gruppen | Gruppen und Mitgliedschaften verwalten |
| Rollen | Realm-/Client-Rollen zuweisen und verwalten |
| Clients | OIDC-Clients auflisten und inspizieren |
| Sessions | Aktive Sessions auflisten und widerrufen |
| Realms | Realm-Konfiguration inspizieren |

---

## GitHub (`mcp-github`)

Image: `ghcr.io/github/github-mcp-server` (offizieller GitHub MCP-Server)
**Standardmaessig deaktiviert** (`replicas: 0`) -- erfordert einen GitHub PAT via `task mcp:set-github-pat`.

| Bereich | Abdeckung |
|---------|-----------|
| Repositories | Auflisten, suchen, Repo-Details abrufen |
| Issues | Issues erstellen, lesen, aktualisieren, kommentieren |
| Pull Requests | PRs erstellen, auflisten, reviewen, mergen |
| Code | Code durchsuchen, Dateiinhalte lesen, Commits abrufen |
| Actions | Workflow-Laeufe und Jobs auflisten |
| Releases | Releases auflisten und abrufen |

---

## Stripe (`mcp-stripe`)

Image: `@stripe/agent-toolkit` (offizieller Stripe MCP)
Erfordert einen Stripe Secret Key.

| Bereich | Abdeckung |
|---------|-----------|
| Kunden | Kunden erstellen, auflisten, abrufen |
| Zahlungsabsichten | Payment Intents erstellen und bestaetigen |
| Rechnungen | Rechnungen erstellen, senden, stornieren |
| Abonnements | Abonnements erstellen und verwalten |
| Produkte & Preise | Produktkatalog und Preisgestaltung verwalten |
| Rueckerstattungen | Rueckerstattungen ausstellen und auflisten |
| Kontostand | Kontostand abrufen |

---

## Zusammenfassung

| MCP-Server | Aktionen | Kategorie |
|------------|----------|-----------|
| Gmail | 7 | Persoenliche Produktivitaet |
| Google Calendar | 9 | Persoenliche Produktivitaet |
| FRITZ!Box | 4 | Heimnetzwerk / Infrastruktur |
| IDE | 2 | Entwicklungs-Tooling |
| Kubernetes | 20 | Cluster-Operationen |
| Playwright Browser | 21 | Browser-Automatisierung |
| Kubernetes Read-Only | 7 | Cluster-Inspektion (Claude Code-seitig) |
| PostgreSQL | 1 | Gemeinsame DB, nur lesender SQL-Zugriff |
| — *nur deploy/mcp Overlay (laeuft nicht in k3d)* — | | |
| Mattermost | ~5 Bereiche | Chat, Kanaele, DMs, Beitraege |
| Nextcloud | ~3 Bereiche | Dateien, Kalender, Kontakte |
| Invoice Ninja | ~7 Bereiche | Vollstaendige Billing-API via OpenAPI-Bruecke |
| Keycloak | ~6 Bereiche | SSO Benutzer-/Gruppen-/Rollenverwaltung |
| GitHub | ~6 Bereiche | Repos, Issues, PRs, Actions (PAT erforderlich) |
| Stripe | ~7 Bereiche | Zahlungen, Rechnungen, Abonnements |
| **Gesamt (k3d laufend)** | **71** | |
