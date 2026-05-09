# Ops-Dashboard `/admin/ops` — Design-Spezifikation

**Datum:** 2026-05-09  
**Status:** Genehmigt  

## Kontext

Das bestehende `/admin/monitoring` ist auf Beobachtung ausgelegt (Pod-Status, Events, Logs als Snapshot). Es fehlt eine Steuerungsoberfläche für den täglichen Cluster-Betrieb ohne Terminal. Der frühere lokale Operator-Dashboard (PR #555 entfernt) wird durch diese integrierte Seite ersetzt.

## Entscheidungen

| Frage | Entscheidung | Begründung |
|-------|-------------|------------|
| Neue Seite oder Monitoring erweitern | Neue Seite `/admin/ops` | Klare Trennung Beobachten ↔ Steuern |
| Layout | Tab-Navigation | Übersichtlich, erweiterbar, bekanntes Muster |
| Deployment | Im bestehenden Website-Pod | Gleiche Auth/RBAC, kein Infrastruktur-Mehraufwand |
| Sprache | Deutsch | Benutzer-Anforderung |
| Rebuild aus Browser | Nicht möglich | Docker-Build braucht das Host-System; nur Rollout Restart |

## Seiten-Struktur

```
website/src/pages/admin/ops.astro          ← neue Astro-Seite
website/src/components/admin/OpsConsole.svelte   ← Tab-Shell
website/src/components/admin/ops/
  GesundheitTab.svelte
  DienstTab.svelte
  LogsTab.svelte
  ArgoCDOpsTab.svelte
  DatenbankTab.svelte
  DnsZertTab.svelte
```

## Tabs

### 🩺 Gesundheit
HTTP-Erreichbarkeit aller Dienste beider Cluster prüfen. Jeder Dienst wird mit einem GET-Request gegen seine öffentliche URL (oder interne Cluster-URL) getestet.

**Anzeige:** Ampel-Karte pro Dienst (🟢 OK / 🟡 Langsam >2 s / 🔴 Fehler), Antwortzeit in ms. Beide Cluster (mentolder + korczewski) nebeneinander.

**Dienste:** Keycloak, Nextcloud, Collabora, Vaultwarden, DocuSeal, LiveKit, Website (je Cluster wo vorhanden).

**Auto-Refresh:** alle 30 Sekunden. Fehler-Karte hat "Als Bug-Ticket erfassen"-Button.

**API:** `GET /api/admin/ops/health?cluster=mentolder|korczewski` — führt HTTP-Checks serverseitig durch und gibt `{ service, url, status, latencyMs }[]` zurück.

---

### 🔄 Dienste
Alle Deployments in `workspace` (mentolder) und `workspace-korczewski` (korczewski) mit Status (gewünschte/laufende Replicas).

**Aktionen pro Deployment:**
- **Neu starten** — `kubectl rollout restart deployment/<name> -n <ns>` (Rollout Restart, kein Rebuild)
- **Skalieren** — Replica-Anzahl setzen

**Globale Aktionen:**
- **Website neu starten** (beide Cluster) — rollout restart auf `website` in `website` + `website-korczewski`
- **Brett neu starten** — rollout restart auf `brett` in `workspace` + `workspace-korczewski`

Jede Aktion öffnet einen deutschen Bestätigungs-Dialog. Nach Bestätigung → API-Aufruf → Toast-Feedback.

Die bestehenden Restart/Scale-Endpunkte hardcoden `namespace/workspace` — sie werden **nicht** für korczewski wiederverwendet. Stattdessen: neue Endpunkte unter `/api/admin/ops/deployments/[ns]/[name]/restart` und `/scale`, die den Namespace als Pfad-Parameter nehmen.

---

### 📋 Logs
Live-Log-Stream per Server-Sent Events (SSE).

**Auswahl:** Namespace → Pod → Container. Namespaces: `workspace`, `workspace-korczewski`, `argocd`, `website`, `website-korczewski`.

**Stream:** `GET /api/admin/ops/logs/stream?ns=&pod=&container=&tail=200` — Astro-Endpoint öffnet k8s Logs API mit `follow=true` und leitet als `text/event-stream` weiter.

**UI-Features:**
- Auto-Scroll ans Ende (abschaltbar)
- Log-Färbung nach Level: INFO=grün, WARN=gelb, ERROR=rot, sonstige=grau
- Echtzeit-Filter (Textsuche)
- "Stream stoppen/starten"-Button

---

### 🚀 ArgoCD
Status aller ArgoCD-Apps (über ArgoCD REST API, intern: `argocd-server.argocd.svc.cluster.local`).

**Anzeige:** App-Name, Sync-Status (Synced/OutOfSync), Health-Status (Healthy/Degraded/Missing), letzter Sync-Zeitstempel.

**Aktionen:**
- **Sync** — `POST /api/admin/ops/argocd/sync` mit `{ app }` → ArgoCD API `POST /api/v1/applications/{name}/sync`
- **Hard Refresh** — gleicher Endpunkt mit `{ hard: true }`

ArgoCD-Token: Der website-Pod bekommt Zugriff auf das `argocd-initial-admin-secret` im `argocd`-Namespace (oder ein dediziertes Read+Sync-ServiceAccount-Token). Falls der Token nicht konfiguriert ist, zeigt der Tab einen Direkt-Link zur ArgoCD-UI statt der App-Liste.

**API:** `GET /api/admin/ops/argocd/apps` (Liste), `POST /api/admin/ops/argocd/sync` (Sync auslösen).

---

### 💾 Datenbank
Backup und Restore für beide Cluster.

**Backup auslösen:** `POST /api/admin/ops/backup?cluster=mentolder|korczewski` — erstellt einen k8s Job aus dem bestehenden Backup-CronJob-Spec (`db-backup` im Namespace `workspace` bzw. `workspace-korczewski`).

**Backup-Liste:** `GET /api/admin/ops/backup/list?cluster=` — listet Dateien im Backup-PVC (Zeitstempel, Größe).

**Restore:** Datenbank auswählen (`keycloak | nextcloud | vaultwarden | website | docuseal | all`) + Snapshot → Bestätigungs-Dialog mit Warnung → `POST /api/admin/ops/restore` → Restore-Job erstellen.

Restore ist destruktiv — Dialog zeigt explizite Warnung auf Deutsch: *"Achtung: Diese Aktion überschreibt die aktuelle Datenbank unwiderruflich."*

---

### 🌐 DNS & Zertifikate
Zertifikat-Status und DNS-Pinning.

**Zertifikate:** `GET /api/admin/ops/certs?cluster=` — liest das TLS-Secret (mentolder: `workspace-wildcard-tls`, korczewski: `korczewski-tls`) aus k8s, parst `notAfter`, zeigt Ablaufdatum + Days-to-Expiry. Farbe: >30 Tage=grün, 10–30=gelb, <10=rot.

**Zertifikat-Erneuerung:** `POST /api/admin/ops/certs/renew` — löscht das Certificate-Objekt damit cert-manager es neu ausstellt.

**LiveKit DNS-Pinning:** `POST /api/admin/ops/dns/pin?cluster=` — ruft ipv64 API mit aktuellem Node-IP auf (APPLY=true). API-Key aus Website-Secret (`IPV64_API_KEY`).

**DNS-Anzeige:** Aktuelle A-Records für `livekit.<domain>` und `stream.<domain>` anzeigen.

## Datenfluss

```
Browser (Svelte)
  ↓ fetch / SSE
Astro API Routes (/api/admin/ops/*)
  ├─→ k8s API (via ServiceAccount im website-Pod)
  ├─→ ArgoCD REST API (argocd-server.argocd.svc.cluster.local)
  └─→ ipv64 REST API (extern, für DNS)
```

## RBAC-Erweiterungen

Der `website`-ServiceAccount braucht zusätzliche RBAC-Rechte:

| Ressource | Verben | Namespace |
|-----------|--------|-----------|
| `pods/log` | `get` | `workspace-korczewski`, `argocd`, `website-korczewski` |
| `deployments` | `get`, `list`, `patch` | `workspace-korczewski`, `website-korczewski` |
| `jobs` | `create`, `get`, `list` | `workspace`, `workspace-korczewski` |
| `secrets` (TLS) | `get` | `workspace`, `workspace-korczewski` |
| `certificates.cert-manager.io` | `delete` | `workspace`, `workspace-korczewski` |

## Scope-Abgrenzung

- **Im Scope:** Gesundheits-Checks, Rollout Restart, Scale, Live-Logs, ArgoCD Sync, DB Backup/Restore, DNS-Pinning, Cert-Status/Erneuerung
- **Nicht im Scope:** Docker-Build + Image-Import (braucht Host-System), vollständige ArgoCD-Verwaltung (dafür ArgoCD-UI), Node-Shell/Exec

## Verbindung zur bestehenden Monitoring-Seite

`/admin/monitoring` bleibt unverändert (Beobachtung: Pod-Status, Events, Snapshot-Logs, Bug-Tickets aus Events). `/admin/ops` ist die Steuerungsebene. Beide Seiten verlinken aufeinander.
