# Whisper — Sprachtranskription für Nextcloud Talk

## Übersicht

Whisper ist ein optionaler Transkriptionsservice, der gesprochene Sprache in Text umwandelt. 
Der Service basiert auf **faster-whisper** (KI-Modell von OpenAI, lokal ausgeführt) und integriert sich 
mit Nextcloud Talk für automatische Transkription von Anrufen und Meetings.

- **Optional** — wird nur auf Bedarf deployt (`task whisper:deploy`)
- **Cluster-intern** — kein öffentlicher Ingress-Endpunkt
- **Abhängig von:** Nextcloud Talk + talk-transcriber (Brückenservice)
- **Sprachen:** Deutsch, Englisch, und viele weitere (Medium-Modell von Whisper)

---

## Architektur

### Komponenten

**1. faster-whisper (KI-Inferenz)**
- Pod-basierter Service (Kubernetes Deployment)
- Lädt KI-Modell beim ersten Start herunter (~1.5 GB)
- HTTP-Schnittstelle auf Port 8000 (`/health`, `/transcribe`)
- CPU-Inferenz (Default) oder GPU-Beschleunigung (optional)

**2. talk-transcriber (Brücke zu Talk)**
- Separate Deployment, pollt auf aktive Nextcloud-Talk-Anrufe
- Tritt Calls headless bei (Firefox + PulseAudio) als Bot-User
- Sendet Audio in Chunks an Whisper
- Nach Anrufende: speichert Transkript in Nextcloud + Website-Datenbank

**3. Website-API-Integration**
- Talk-transcriber sendet finales Transkript an `/api/meeting/save-transcript`
- Website speichert Transkript als Markdown-Datei in Nextcloud + Datenbanktabelle `transcripts`

---

## Deployment

### Installation

```bash
task whisper:deploy      # faster-whisper + talk-transcriber deployen
```

Dies erstellt zwei Deployments im `workspace`-Namespace:
- `whisper` (faster-whisper-server)
- `talk-transcriber` (Brückenservice)

### Überprüfung des Status

```bash
task workspace:status              # Zeigt Pod-Status
kubectl get pods -n workspace | grep whisper   # Detaillierter Pod-Status

task workspace:logs -- whisper     # faster-whisper Logs
task workspace:logs -- talk-transcriber        # talk-transcriber Logs
```

### Modell-Download

Beim ersten Start lädt faster-whisper das Medium-Modell herunter (~1.5 GB). 
Dies kann mehrere Minuten dauern. Die `startupProbe` in der Deployment-Konfiguration 
wartet auf Verfügbarkeit (30s InitialDelay, 10s Interval, 30 Versuche = max. 5 Minuten).

---

## Konfiguration

### Ressourcen-Anforderungen

**CPU-Inferenz (Standard):**
- Requests: 2 CPU, 4 GB RAM
- Limits: 8 CPU, 8 GB RAM
- Transkription: ~10–30 Sekunden für 1 Minute Audio (je nach Last)

**GPU-Beschleunigung (Optional):**
- `docker-compose.gpu-worker.yaml` im Root-Verzeichnis
- Benötigt: NVIDIA GPU (z.B. A100, RTX4090)
- Performance: ~2–5 Sekunden für 1 Minute Audio

### Environment-Variablen (talk-transcriber)

```bash
NC_DOMAIN=nextcloud                    # Nextcloud Service Name (intern)
NC_PROTOCOL=http                       # http für Cluster-intern
NC_VERIFY_SSL=false                    # Self-Signed-Zerts zulassen
TRANSCRIBER_BOT_PASSWORD               # Credentials für Bot-User (aus Secrets)
TRANSCRIBER_SECRET                     # Talk-Bot-Secret für Authentifizierung
WEBSITE_URL=http://website.website.svc.cluster.local
CHUNK_SECONDS=5                        # Audio-Chunk-Größe für Whisper
MAX_SESSIONS=3                         # Max. gleichzeitige Transkriptionen
```

---

## Nextcloud Talk Integration

Nach dem Deploy müssen Sie Nextcloud Talk für Transkription konfigurieren:

### Admin-Konfiguration

1. **Nextcloud Admin-Panel öffnen**
   - http://files.localhost (Dev) oder https://files.korczewski.de (Prod)
   - Als Admin anmelden

2. **Transkription aktivieren**
   - Admin → Talk (oder Settings → Talk)
   - Transcription Engine: **HTTP API**
   - Service URL: `http://whisper:8000` (intern im Cluster)
   - API Token: Wird von talk-transcriber bereitgestellt (in Logs prüfen)

3. **Bot-User erstellen**
   - Nextcloud Benutzer: `transcriber-bot`
   - Passwort: Aus `workspace-secrets` (Key: `TRANSCRIBER_BOT_PASSWORD`)

### Betrieb

Nach Konfiguration:
- Benutzer starten einen Talk-Anruf
- talk-transcriber tritt automatisch bei und startet Transkription
- Nach Anrufende wird Transkript in Nextcloud Files gespeichert:
  - Pfad: `/Transcripts/{YYYY-MM-DD}/{Meeting_ID}.md`
- Gleichzeitig speichert Website-API das Transkript in der `transcripts`-Tabelle

---

## Fehlerbehebung

### faster-whisper startet nicht

**Symptome:**
- Pod bleibt in `Pending` oder `CrashLoopBackOff`
- `startupProbe` schlägt fehl

**Behebung:**
```bash
kubectl logs -n workspace deployment/whisper
```
- **Speichermangel:** Node hat nicht genug RAM → Ressourcen-Requests reduzieren oder Node upgraden
- **Image-Pull-Fehler:** Registry nicht erreichbar → `imagePullPolicy: Always` prüfen, local Registry laufen lassen

### Transkription läuft nicht

**Symptome:**
- Talk-transcriber läuft, aber keine Transkripte werden erstellt

**Behebung:**
```bash
kubectl logs -n workspace deployment/talk-transcriber
```
- **Nextcloud-Verbindung fehlgeschlagen:** `NC_DOMAIN`, `NC_VERIFY_SSL` in Environment-Variablen prüfen
- **Bot-User nicht authentifiziert:** `TRANSCRIBER_BOT_PASSWORD` stimmt nicht mit Nextcloud überein
- **Whisper nicht erreichbar:** `whisper` Service nicht im Netzwerk → Port 8000 prüfen

### Speicherlecks / Performance-Degradation

- faster-whisper können bei Langzeitbetrieb Speicher verlieren
- **Lösung:** Pod regelmäßig neustarten
  ```bash
  kubectl rollout restart deployment/whisper -n workspace
  ```
- Oder via Cron-Job (täglich um 3 Uhr): In `k3d/whisper.yaml` PodDisruptionBudget + Restart-Policy konfigurieren

---

## Entfernung

Falls Sie Whisper nicht benötigen:

```bash
kubectl delete deployment whisper -n workspace
kubectl delete deployment talk-transcriber -n workspace
kubectl delete service whisper -n workspace
```

Oder: Manifeste aus `k3d/kustomization.yaml` entfernen und `task workspace:deploy` ausführen.

---

## Weitere Ressourcen

- **Services-Übersicht:** [Services](services.md)
- **Nextcloud-Konfiguration:** [Nextcloud](../benutzerhandbuch.md#nextcloud)
- **Monitoring & Logs:** `task workspace:logs -- whisper`
