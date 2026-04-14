# Design: Live-Transkription in Nextcloud Talk

**Datum:** 2026-04-13  
**Status:** Genehmigt  
**Scope:** Echtzeit-Transkription während laufender Talk-Calls mit Chat-Ausgabe (<10 s Verzögerung), automatisch für alle Räume ohne manuelle Einladung

---

## Ziel

Während eines Nextcloud Talk-Calls soll ein Bot automatisch der Konferenz beitreten, Audio in 10-Sekunden-Chunks erfassen, über Whisper transkribieren und das Ergebnis als Chat-Nachricht im selben Talk-Raum posten.

| Anforderung | Wert |
|---|---|
| Transkriptions-Latenz | < 10 Sekunden |
| Ausgabe-Kanal | Talk-Chat-Nachrichten (Bot-Badge) |
| Aktivierung | Automatisch bei Gesprächsbeginn — kein Nutzereingriff |
| Geltungsbereich | Alle Talk-Räume global |

---

## Architektur

```
Call startet in einem beliebigen Room
  └─► Nextcloud Talk Bot API — sendet Webhook an talk-transcriber:8000
        └─► talk-transcriber-Pod tritt dem Call headless bei
              (Firefox + geckodriver, identisch mit talk-recording)
              ├─► Audio in 10-s-Chunks buffern (RAM, kein Disk)
              ├─► POST → http://whisper:8000/v1/audio/transcriptions
              └─► POST → Nextcloud Talk Chat API (Bot-Badge-Nachricht)
```

### Komponenten

| Komponente | Rolle |
|---|---|
| `talk-transcriber` Pod | Headless Firefox, tritt Calls bei, bufft Audio, ruft Whisper + Talk-API auf |
| `whisper` Pod | faster-whisper-server, OpenAI-kompatibler STT-Endpunkt, bereits deployed |
| Nextcloud Talk Bot API | Webhook-Trigger wenn Call startet; Bot kann Nachrichten ins Room posten |
| `TRANSCRIBER_SECRET` | Shared secret zwischen Talk und talk-transcriber für Bot-Authentifizierung |

### Warum kein separates WebRTC-Client-Protokoll

Der einzige praxistaugliche Weg, Audio aus einem Nextcloud Talk WebRTC-Call zu extrahieren, ist der Headless-Browser-Ansatz (Firefox + geckodriver), den `talk-recording` bereits verwendet. Eigene WebRTC-Stacks (aiortc, pion etc.) wären erheblich komplexer und weniger stabil gegenüber Talk-Protokollupdates.

---

## Implementierung

### Risiko: talk-transcriber-Image

Das `nextcloud/aio-talk-recording`-Image ist primär auf Aufnahme ausgelegt. Ein `TRANSCRIPTION_ENABLED`-Env-Flag existiert in der aktuellen Version voraussichtlich **nicht**. Daher wird ein eigenes Image verwendet:

**Primär: Custom Python-Image** (`ghcr.io/nextcloud/aio-talk-recording`-ähnlich, aber Python-basiert):
- `nc-py-api` für Talk Bot Webhook + Chat-Posting
- `playwright` (Firefox headless) zum Beitreten des Calls + Audio-Capture
- `pyaudio` / WebRTC-Chunk-Extraktion aus dem geckodriver-Stream
- `httpx` für Whisper-API

**Alternativ-Fallback (einfacher, falls primär nicht umsetzbar):**
- Selbes `nextcloud/aio-talk-recording`-Image, startet zusätzlich einen Wrapper-Prozess der die aufgenommenen Audio-Chunks live an Whisper weiterleitet statt sie zu speichern

Da das primäre Image gebaut werden muss, wird es als lokales Dockerfile im Repo `k3d/talk-transcriber/` definiert. k3d importiert es per `task cluster:create`.

### Geänderte Dateien

| Datei | Aktion |
|---|---|
| `k3d/talk-transcriber/Dockerfile` | Neu: Python-Image (nc-py-api, playwright, httpx) |
| `k3d/talk-transcriber/app.py` | Neu: Webhook-Empfänger + Audio-Capture + Whisper + Chat-Post |
| `k3d/talk-transcriber.yaml` | Neu: Deployment + Service |
| `k3d/kustomization.yaml` | Modify: `talk-transcriber.yaml` als Ressource eintragen |
| `k3d/secrets.yaml` | Modify: `TRANSCRIBER_SECRET` eintragen |
| `scripts/transcriber-setup.sh` | Neu: `occ talk:bot:install` + Config-Set |
| `Taskfile.yml` | Modify: neuer `workspace:transcriber-setup`-Task + Aufruf in `workspace:up` |

### `k3d/talk-transcriber/app.py` — Logik-Übersicht

```python
# Webhook-Empfänger (FastAPI, Port 8000)
# POST /webhook → Nextcloud ruft dies auf wenn Call startet
#   1. Raum-Token + Nextcloud-URL aus Webhook-Body extrahieren
#   2. Firefox headless starten, Call beitreten
#   3. Audio-Stream aufzeichnen, alle 10 s als WAV-Chunk ausschneiden
#   4. Chunk → POST http://whisper:8000/v1/audio/transcriptions
#   5. Transkript → POST Nextcloud Talk API /ocs/v2.php/apps/spreed/api/v1/chat/{token}
#      (als Bot-User mit TRANSCRIBER_SECRET authentifiziert)
#   6. Weiter bis Call endet (Call-Ende-Webhook oder Verbindungsverlust)
```

### `scripts/transcriber-setup.sh` — Kernbefehle

```bash
#!/usr/bin/env bash
set -euo pipefail

TRANSCRIBER_SECRET=$(kubectl get secret workspace-secrets -n workspace \
  -o jsonpath='{.data.TRANSCRIBER_SECRET}' | base64 -d)

NC_EXEC='kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
  su -s /bin/bash www-data -c'

# Bot global registrieren (--feature=webhook: empfängt Call-Ereignisse)
eval ${NC_EXEC} "\"php occ talk:bot:install \
  --url=http://talk-transcriber:8000/webhook \
  --secret=${TRANSCRIBER_SECRET} \
  --name='Live-Transkription' \
  --feature=webhook \
  --feature=response\""

# Live-Transkription in spreed aktivieren
eval ${NC_EXEC} '"php occ config:app:set spreed call_transcription_enabled --value=yes"'
```

### `k3d/talk-transcriber.yaml` — Struktur

```yaml
# Deployment
image: talk-transcriber:local   # lokales Build, via k3d image import
env:
  - NC_DOMAIN: nextcloud
  - NC_PROTOCOL: http
  - WHISPER_BASE_URL: http://whisper:8000
  - TRANSCRIBER_SECRET: (aus workspace-secrets)
  - ALLOW_ALL: "true"
  - SKIP_VERIFY: "true"
ports: [8000]
resources: requests 256Mi/100m, limits 1Gi/1

# Service
port: 8000
```

### `Taskfile.yml` — neuer Task

```yaml
workspace:transcriber-setup:
  desc: Register Talk transcriber bot in Nextcloud
  cmds:
    - bash scripts/transcriber-setup.sh
```

Aufruf in `workspace:up` direkt nach `workspace:recording-setup`.

---

## Idempotenz

- `talk:bot:install` ist idempotent: bei bereits registriertem Bot-Namen kein Fehler
- `config:app:set` überschreibt idempotent
- Der Bot-Pod startet neu bei neuem Bild-Tag (k3d image import)

---

## Dev vs. Prod

| Umgebung | Whisper-URL | Nextcloud-URL |
|---|---|---|
| k3d/dev | `http://whisper:8000` | `http://nextcloud` |
| korczewski | `http://whisper:8000` (cluster-intern) | `http://nextcloud` (cluster-intern) |

Kein Unterschied nötig — alle URLs sind cluster-intern.

---

## Was nicht geändert wird

- `k3d/whisper.yaml` — bereits deployed, keine Änderung
- `k3d/talk-recording.yaml` — Aufnahme-Feature unverändert
- `scripts/recording-setup.sh` — Aufnahme-Konfiguration unverändert
- Nextcloud-OIDC-Konfiguration, Keycloak, Mattermost — keine Berührung

---

## Einschränkungen / Offene Punkte

1. **Audio-Extraktion aus WebRTC im Container**: Playwright/Firefox kann Audio abspielen aber nicht einfach raw-sampeln. Workaround: PulseAudio virtual sink + FFmpeg loopback-capture im Container (bekannte Technik aus talk-recording).
2. **Bot-Authentifizierung vs. Call-Beitritt**: Das Talk Bot API erlaubt Nachrichten-Posting mit dem Secret, aber der Headless-Browser-Join erfordert einen echten Nextcloud-User-Account für den Transkriptions-Bot. Daher: `occ user:add transcriber-bot` in setup-Script.
3. **Skalierung**: Bei 2+ simultanen Calls läuft jede Instanz in einem eigenen Firefox-Prozess. Für MVP: `replicas: 1`, max. 1 simultaner Call (ausreichend für kleine Teams).
4. **Talk Bot "call started"-Webhook**: Die Nextcloud Talk Bot API unterstützt primär `message`- und `reaction`-Events. Ein dediziertes `call-started`-Event ist in der API möglicherweise nicht verfügbar. Fallback: Der Transcriber-Pod pollt alle 10 Sekunden `GET /ocs/v2.php/apps/spreed/api/v4/room` (mit Bot-User-Credentials) und tritt automatisch bei, sobald ein Raum `participantType` mit aktivem Call hat — ohne Webhook-Abhängigkeit.
