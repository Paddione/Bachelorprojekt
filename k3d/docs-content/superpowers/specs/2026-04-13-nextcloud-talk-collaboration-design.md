# Design: Nextcloud Talk Collaboration Tools

**Datum:** 2026-04-13  
**Status:** Genehmigt  
**Scope:** Whiteboard-Tab in Talk-Rooms, Collabora-Dokumente in Talk, Forms-App, Polls (built-in), Aufnahme + Transkription via Whisper

---

## Ziel

Alle Collaboration-Tools sollen innerhalb von Nextcloud Talk-Konferenzen nutzbar sein:

| Feature | Mechanismus | Handlungsbedarf |
|---|---|---|
| Whiteboard-Tab im Call | Nextcloud `whiteboard`-App + Backend-URL + JWT | **Fehlt** |
| Collabora-Dokument im Call | richdocuments WOPI-Allowlist für Pod-Netz | **Fehlt** |
| Forms in Talk teilen | Nextcloud `forms`-App | **Fehlt** |
| Polls im Call | Built-in in `spreed` seit Talk 17 | Kein Aufwand |
| Aufnahme von Calls | `talk-recording`-Pod + `recording-setup.sh` | Pod läuft, Setup bereits in `workspace:up` |
| Transkription nach Aufnahme | Whisper (immer an) + `stt_whisper2` + `assistant` | **Whisper nicht in kustomization.yaml; Apps fehlen** |

---

## Architektur

### Whiteboard

Der Whiteboard-Pod (`whiteboard:3002`, `board.localhost`) läuft bereits und ist vom Browser erreichbar. Die Nextcloud-App-Seite fehlt vollständig.

```
Browser (Talk-Call)
  └─► Nextcloud (spreed-App zeigt Whiteboard-Tab)
        └─► occ config: collabBackendUrl = http(s)://board.<domain>
              └─► WebSocket → whiteboard:3002
                    └─► JWT-Validierung via WHITEBOARD_JWT_SECRET
```

Die `collabBackendUrl` muss die **öffentliche** URL sein (Browser-seitig), nicht die interne Service-URL. Der Scheme wird dynamisch bestimmt:
- `*.localhost` → `http://`  
- Alles andere → `https://`

Der JWT-Secret kommt aus `workspace-secrets/WHITEBOARD_JWT_SECRET` — derselbe Wert den der Whiteboard-Pod bereits nutzt.

### Collabora in Talk

Collabora läuft im Namespace `workspace-office`. Ohne WOPI-Allowlist lehnt Nextcloud WOPI-Callbacks von der Collabora-Pod-IP ab, weil sie aus einem anderen Subnetz kommt.

```
Talk-Room: Datei öffnen
  └─► Nextcloud richdocuments (WOPI-Host)
        └─► Collabora (workspace-office namespace) → WOPI-Request zurück an Nextcloud
              └─► Nextcloud prüft: IP in wopi_allowlist? → RFC-1918 erlaubt → OK
```

Allowlist: `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16` — ausschließlich cluster-internes RFC-1918-Netz, kein Internet-Zugriff möglich.

### Forms

Nextcloud Forms (`forms`-App) ermöglicht das Erstellen von Formularen, die als Link in Talk-Rooms geteilt werden. Keine weitere Konfiguration nötig.

### Aufnahme

Der `talk-recording`-Pod läuft bereits und ist in `kustomization.yaml` eingetragen. `scripts/recording-setup.sh` registriert das Backend in Nextcloud Talk. Dieser Flow ist vollständig und wird nicht geändert.

### Transkription

```
Talk-Aufnahme fertig → Datei in Nextcloud Files
  └─► Nextcloud assistant-App (KI-Hub) erkennt: STT-Provider vorhanden
        └─► stt_whisper2 → POST http://whisper:8000/v1/audio/transcriptions
              └─► faster-whisper-server (Medium-Modell, CPU, int8)
                    └─► Transkript → txt-Datei neben Aufnahme in Nextcloud Files
```

`stt_whisper2` implementiert die `ISpeechToTextProvider`-Schnittstelle. Nextcloud Talk erkennt registrierte STT-Provider automatisch und zeigt nach jeder Aufnahme den Button **„Aufnahme transkribieren"**.

**Whisper-Startverhalten:** Beim ersten Start lädt der Pod das Medium-Modell (~1,5 GB) herunter. Das `startupProbe` ist mit `failureThreshold: 30 × periodSeconds: 10` = 5 Minuten konfiguriert. Andere Services starten parallel; Transkription ist erst nach abgeschlossenem Download verfügbar.

---

## Implementierung

### Geänderte Dateien: `Taskfile.yml` + `k3d/kustomization.yaml`

**`k3d/kustomization.yaml`:** `whisper.yaml` wird als feste Ressource eingetragen (bisher nicht enthalten):
```yaml
  - whisper.yaml   # Transkription (immer an)
```

**`Taskfile.yml`**, Task `workspace:post-setup` — vier neue Blöcke nach dem bestehenden `richdocuments wopi_url`-Schritt:

**Block 1 — Whiteboard-App:**
```yaml
- '{{.NC_EXEC}} "php occ app:install whiteboard" || true'
- '{{.NC_EXEC}} "php occ app:enable whiteboard"  || true'
- |
  BOARD_DOMAIN=$(kubectl get configmap domain-config -n workspace \
    -o jsonpath='{.data.WHITEBOARD_DOMAIN}' 2>/dev/null || echo "board.localhost")
  case "${BOARD_DOMAIN}" in
    *.localhost) BOARD_URL="http://${BOARD_DOMAIN}" ;;
    *)           BOARD_URL="https://${BOARD_DOMAIN}" ;;
  esac
  WB_JWT=$(kubectl get secret workspace-secrets -n workspace \
    -o jsonpath='{.data.WHITEBOARD_JWT_SECRET}' | base64 -d)
  kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
    su -s /bin/bash www-data -c \
    "php occ config:app:set whiteboard collabBackendUrl --value='${BOARD_URL}'"
  kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
    su -s /bin/bash www-data -c \
    "php occ config:app:set whiteboard jwt_secret_key --value='${WB_JWT}'"
```

**Block 2 — Forms-App:**
```yaml
- '{{.NC_EXEC}} "php occ app:install forms" || true'
```

**Block 3 — WOPI-Allowlist:**
```yaml
- |
  {{.NC_EXEC}} "php occ config:app:set richdocuments wopi_allowlist \
    --value='10.0.0.0/8,172.16.0.0/12,192.168.0.0/16'"
```

**Block 4 — Transkription (assistant + stt_whisper2):**
```yaml
- '{{.NC_EXEC}} "php occ app:install assistant"   || true'
- '{{.NC_EXEC}} "php occ app:install stt_whisper2" || true'
- '{{.NC_EXEC}} "php occ config:app:set stt_whisper2 url     --value=http://whisper:8000/v1"'
- '{{.NC_EXEC}} "php occ config:app:set stt_whisper2 api_key --value=local"'
```

### Ausgabe-Echo erweitern

Die abschließenden `echo`-Zeilen in `post-setup` werden um fünf Einträge ergänzt:
```
Whiteboard:    http://board.localhost (Talk-Tab)
Forms:         http://files.localhost/apps/forms
WOPI:          Allowlist 10/8,172.16/12,192.168/16
Transkription: stt_whisper2 → http://whisper:8000/v1
Aufnahme:      Talk-Room > ··· > Aufnahme starten
```

---

## Idempotenz

Alle `occ app:install`-Befehle haben `|| true` — bei bereits installierter App kein Fehler.  
`occ config:app:set` überschreibt idempotent.  
Der Whiteboard-Block liest Secrets zur Laufzeit aus dem Cluster — kein Hardcoding.  
`kustomization.yaml`-Eintrag ist idempotent (Kubernetes ignoriert bereits existierende Ressourcen).

---

## Dev vs. Prod

| Umgebung | `WHITEBOARD_DOMAIN` (domain-config) | Resultierende URL |
|---|---|---|
| k3d/dev | `board.localhost` | `http://board.localhost` |
| korczewski | `board.korczewski.de` | `https://board.korczewski.de` |
| mentolder | `board.mentolder.de` | `https://board.mentolder.de` |

Keine Prod-Patches oder separaten Overlays nötig — der Scheme-Switch erfolgt automatisch.

---

## Was nicht geändert wird

- `k3d/whiteboard.yaml` — Pod ist korrekt konfiguriert, keine Änderung
- `k3d/whisper.yaml` — Pod ist korrekt konfiguriert, keine Änderung
- `k3d/talk-recording.yaml` — Recording-Pod unverändert
- `k3d/office-stack/` — Collabora-Deployment unverändert
- `scripts/talk-hpb-setup.sh` — HPB-Konfiguration unverändert
- `scripts/recording-setup.sh` — Recording-Backend-Konfiguration unverändert
- Keine neuen Tasks, keine neuen Skripte, keine neuen Manifeste
