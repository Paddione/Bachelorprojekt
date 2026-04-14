# Nextcloud Talk Collaboration Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle Nextcloud-Collaboration-Features in Talk-Konferenzen aktivieren: Whiteboard-Tab, Collabora-Dokumente, Forms, Polls (built-in) und Aufnahme-Transkription via Whisper.

**Architecture:** Alle Änderungen gehen in den `workspace:post-setup`-Task in `Taskfile.yml`. Vier neue Blöcke werden nach dem bestehenden `richdocuments wopi_url`-Set (Zeile 317) und vor dem Hardening-Block eingefügt. `whisper.yaml` ist bereits in `k3d/kustomization.yaml` (Zeile 48) — kein Manifest-Change nötig.

**Tech Stack:** Nextcloud `occ`-CLI, kubectl, Go-Task (Taskfile), faster-whisper-server (OpenAI-kompatibler STT-Endpunkt)

---

## Dateiübersicht

| Datei | Aktion | Verantwortung |
|---|---|---|
| `Taskfile.yml` | Modify: Zeilen 317–318 (Insertion) + Zeilen 345–350 (Echo) | 4 neue Blöcke in `workspace:post-setup` |

---

### Task 1: Whiteboard-App installieren und konfigurieren

**Files:**
- Modify: `Taskfile.yml` nach Zeile 317

**Kontext:** Der Whiteboard-Pod läuft bereits auf `whiteboard:3002`, erreichbar als `board.localhost` (dev) bzw. `board.<domain>` (prod). Nextcloud kennt ihn nicht, weil die `whiteboard`-App nie installiert wurde. Diese App registriert den Whiteboard-Tab in jedem Talk-Room.

- [ ] **Schritt 1: Aktuellen Zustand prüfen** (falls Cluster läuft)

```bash
kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
  su -s /bin/bash www-data -c "php occ app:list" | grep whiteboard
```

Erwartetes Ergebnis: kein Output (App nicht vorhanden).

- [ ] **Schritt 2: Whiteboard-Block in `Taskfile.yml` einfügen**

Datei: `Taskfile.yml`

Den folgenden Block **nach Zeile 317** einfügen (nach dem `richdocuments wopi_url`-Befehl, vor `- echo ""`):

```yaml
      - echo ""
      - echo "Installing Nextcloud collaboration apps (Whiteboard, Forms, Transcription)..."
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

- [ ] **Schritt 3: Validierung der Taskfile-Syntax**

```bash
task --list 2>&1 | grep post-setup
```

Erwartetes Ergebnis: `workspace:post-setup` erscheint ohne Syntaxfehler.

- [ ] **Schritt 4: Verifizierung (falls Cluster läuft)**

```bash
kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
  su -s /bin/bash www-data -c "php occ config:app:get whiteboard collabBackendUrl"
```

Erwartetes Ergebnis: `http://board.localhost` (dev) bzw. `https://board.<domain>` (prod).

```bash
kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
  su -s /bin/bash www-data -c "php occ config:app:get whiteboard jwt_secret_key"
```

Erwartetes Ergebnis: Der JWT-Secret-Wert aus `workspace-secrets/WHITEBOARD_JWT_SECRET`.

- [ ] **Schritt 5: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(nextcloud): install and configure whiteboard app for Talk integration"
```

---

### Task 2: Forms-App installieren

**Files:**
- Modify: `Taskfile.yml` direkt nach dem Whiteboard-Block aus Task 1

**Kontext:** Die `forms`-App ermöglicht das Erstellen von Formularen, die als Links in Talk-Rooms geteilt und dort inline ausgefüllt werden können. Keine weitere Konfiguration nötig.

- [ ] **Schritt 1: Forms-Zeile nach dem Whiteboard-Block einfügen**

Datei: `Taskfile.yml` — nach dem Whiteboard-Block:

```yaml
      - '{{.NC_EXEC}} "php occ app:install forms" || true'
```

- [ ] **Schritt 2: Verifizierung (falls Cluster läuft)**

```bash
kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
  su -s /bin/bash www-data -c "php occ app:list --enabled" | grep forms
```

Erwartetes Ergebnis: `forms` erscheint in der Liste.

- [ ] **Schritt 3: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(nextcloud): install forms app for Talk sharing"
```

---

### Task 3: WOPI-Allowlist für Collabora setzen

**Files:**
- Modify: `Taskfile.yml` direkt nach dem Forms-Block aus Task 2

**Kontext:** Collabora läuft im Namespace `workspace-office` (anderes Subnetz als `workspace`). Ohne Allowlist lehnt Nextcloud WOPI-Callbacks von der Collabora-Pod-IP ab — Dokumente lassen sich dann nicht aus Talk heraus öffnen. RFC-1918-Netz (`10/8, 172.16/12, 192.168/16`) abzudecken ist sicher, weil diese IPs cluster-intern sind.

- [ ] **Schritt 1: WOPI-Allowlist-Block einfügen**

Datei: `Taskfile.yml` — nach dem Forms-Block:

```yaml
      - |
        {{.NC_EXEC}} "php occ config:app:set richdocuments wopi_allowlist \
          --value='10.0.0.0/8,172.16.0.0/12,192.168.0.0/16'"
```

- [ ] **Schritt 2: Verifizierung (falls Cluster läuft)**

```bash
kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
  su -s /bin/bash www-data -c "php occ config:app:get richdocuments wopi_allowlist"
```

Erwartetes Ergebnis: `10.0.0.0/8,172.16.0.0/12,192.168.0.0/16`

- [ ] **Schritt 3: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(nextcloud): set WOPI allowlist for cross-namespace Collabora access"
```

---

### Task 4: Transkription — assistant + stt_whisper2 installieren und konfigurieren

**Files:**
- Modify: `Taskfile.yml` direkt nach dem WOPI-Allowlist-Block aus Task 3

**Kontext:** `stt_whisper2` implementiert die Nextcloud `ISpeechToTextProvider`-Schnittstelle und spricht den faster-whisper-Server über die OpenAI-kompatible API an (`/v1/audio/transcriptions`). Die `assistant`-App ist Voraussetzung — sie stellt den KI-Hub bereit, über den Talk STT-Provider erkennt. Nach der Konfiguration erscheint in Talk nach jeder Aufnahme der Button **„Aufnahme transkribieren"**.

Der Whisper-Pod ist bereits in `k3d/kustomization.yaml` (Zeile 48) eingetragen und startet automatisch. Der Endpunkt ist `http://whisper:8000/v1` (cluster-interner Service-DNS).

- [ ] **Schritt 1: Transkriptions-Block einfügen**

Datei: `Taskfile.yml` — nach dem WOPI-Allowlist-Block:

```yaml
      - '{{.NC_EXEC}} "php occ app:install assistant"    || true'
      - '{{.NC_EXEC}} "php occ app:install stt_whisper2" || true'
      - '{{.NC_EXEC}} "php occ config:app:set stt_whisper2 url     --value=http://whisper:8000/v1"'
      - '{{.NC_EXEC}} "php occ config:app:set stt_whisper2 api_key --value=local"'
```

- [ ] **Schritt 2: Verifizierung der STT-Konfiguration (falls Cluster läuft)**

```bash
kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
  su -s /bin/bash www-data -c "php occ config:app:get stt_whisper2 url"
```

Erwartetes Ergebnis: `http://whisper:8000/v1`

```bash
kubectl exec -n workspace -c nextcloud deploy/nextcloud -- \
  su -s /bin/bash www-data -c "php occ app:list --enabled" | grep -E "assistant|stt_whisper2"
```

Erwartetes Ergebnis: beide Apps erscheinen als aktiviert.

- [ ] **Schritt 3: Whisper-Endpunkt direkt testen (falls Cluster läuft)**

```bash
kubectl exec -n workspace deploy/nextcloud -c nextcloud -- \
  curl -sf http://whisper:8000/health
```

Erwartetes Ergebnis: `{"status":"ok"}` — Whisper ist erreichbar.

- [ ] **Schritt 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(nextcloud): configure stt_whisper2 + assistant for Talk call transcription"
```

---

### Task 5: Echo-Ausgabe in post-setup erweitern

**Files:**
- Modify: `Taskfile.yml` Zeilen 345–350 (abschließende echo-Zeilen in `workspace:post-setup`)

**Kontext:** Die bestehenden `echo`-Zeilen am Ende von `post-setup` dokumentieren was aktiviert wurde. Fünf neue Einträge für die Features dieses Plans.

- [ ] **Schritt 1: Echo-Zeilen erweitern**

Datei: `Taskfile.yml` — die bestehende Block-Abschluss-Sektion (aktuell endet bei `echo "  notify_push: {{.PUSH_URL}}"`) um folgende Zeilen ergänzen:

```yaml
      - 'echo "  Whiteboard:    http://board.localhost (Talk-Tab in jedem Room)"'
      - 'echo "  Forms:         http://files.localhost/apps/forms"'
      - 'echo "  WOPI:          Allowlist 10/8,172.16/12,192.168/16 (Collabora cross-ns)"'
      - 'echo "  Transkription: stt_whisper2 → http://whisper:8000/v1"'
      - 'echo "  Aufnahme:      Talk-Room > ··· > Aufnahme starten"'
```

- [ ] **Schritt 2: Commit**

```bash
git add Taskfile.yml
git commit -m "chore(taskfile): extend post-setup echo output for collaboration features"
```

---

### Task 6: Kustomize-Validierung

**Files:** keine Änderungen

**Kontext:** Sicherstellen dass die `kustomization.yaml` (mit `whisper.yaml`) valid ist und kein Manifest kaputt ist.

- [ ] **Schritt 1: Kustomize-Build ausführen**

```bash
task workspace:validate
```

Erwartetes Ergebnis: Kein Fehler. Wenn `task` nicht verfügbar:

```bash
kustomize build k3d/ | kubectl apply --dry-run=client -f - 2>&1 | tail -5
```

- [ ] **Schritt 2: Whisper in Build-Output prüfen**

```bash
kustomize build k3d/ | grep -A3 "name: whisper"
```

Erwartetes Ergebnis: Whisper-Deployment erscheint im Output.

- [ ] **Schritt 3: End-to-End-Test (falls Cluster läuft)**

```bash
task workspace:post-setup
```

Den Output durchlesen — alle neuen Zeilen sollten ohne Fehler durchlaufen. Anschließend in Nextcloud Talk einen Test-Room öffnen und prüfen:
- Whiteboard-Tab sichtbar im Room (Pinsel-Icon oder „+" → Whiteboard)
- Im Room eine Datei teilen → öffnet sich mit Collabora
- Drei-Punkte-Menü im Call → „Aufnahme starten" sichtbar

- [ ] **Schritt 4: Abschluss-Commit (falls noch ausstehend)**

```bash
git status
git log --oneline -5
```

Alle Änderungen sollten committed sein.
