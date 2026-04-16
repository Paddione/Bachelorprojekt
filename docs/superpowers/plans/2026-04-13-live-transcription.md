# Live-Transkription Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy a headless-browser bot that automatically joins every Nextcloud Talk call, transcribes audio in 10-second chunks via Whisper, and posts the result as chat messages in the same room.

**Architecture:** A Python/FastAPI service (`talk-transcriber`) polls every 10 s for rooms with active calls, joins headlessly via Playwright (Firefox), captures the PulseAudio output with FFmpeg, and streams 10-second WAV chunks to the existing `whisper` service. Transcripts are posted to the Talk OCS chat API as the `transcriber-bot` Nextcloud user. No user action required — the bot joins automatically when `hasCall` is true.

**Tech Stack:** Python 3.11, FastAPI, Playwright (Firefox), FFmpeg, PulseAudio, Xvfb, httpx; Kubernetes (k3d/Kustomize); Go-Task (Taskfile); local Docker registry (`registry.localhost:5000`)

---

## Dateiübersicht

| Datei | Aktion | Verantwortung |
|---|---|---|
| `k3d/secrets.yaml` | Modify | Add `TRANSCRIBER_BOT_PASSWORD` |
| `k3d/talk-transcriber/Dockerfile` | Create | Python image with PulseAudio + FFmpeg + Playwright |
| `k3d/talk-transcriber/app.py` | Create | Polling loop, browser join, audio capture, Whisper call, chat post |
| `k3d/talk-transcriber.yaml` | Create | Deployment + Service manifest |
| `k3d/kustomization.yaml` | Modify | Add `talk-transcriber.yaml` as resource |
| `scripts/transcriber-setup.sh` | Create | Create `transcriber-bot` Nextcloud user |
| `Taskfile.yml` | Modify | Add `workspace:transcriber-build`, `workspace:transcriber-setup`; wire into `workspace:up` |

---

### Task 1: TRANSCRIBER_BOT_PASSWORD in secrets.yaml

**Files:**
- Modify: `k3d/secrets.yaml`

**Kontext:** `k3d/secrets.yaml` enthält alle Dev-Secrets als `workspace-secrets` Secret. Das neue Secret `TRANSCRIBER_BOT_PASSWORD` wird vom `talk-transcriber`-Pod und vom Setup-Script genutzt.

- [ ] **Schritt 1: Secret eintragen**

Datei: `k3d/secrets.yaml` — am Ende des `stringData`-Blocks (vor dem `---`) nach `RECORDING_SECRET` einfügen:

```yaml
  TRANSCRIBER_BOT_PASSWORD: "devtranscriberbotpassword123"
```

Der vollständige relevante Block sieht danach so aus:
```yaml
  RECORDING_SECRET: "devrecordingsecret1234567890abcde"
  TRANSCRIBER_BOT_PASSWORD: "devtranscriberbotpassword123"
```

- [ ] **Schritt 2: Validierung**

```bash
grep TRANSCRIBER_BOT_PASSWORD k3d/secrets.yaml
```

Erwartetes Ergebnis: `  TRANSCRIBER_BOT_PASSWORD: "devtranscriberbotpassword123"`

- [ ] **Schritt 3: Commit**

```bash
git add k3d/secrets.yaml
git commit -m "feat(secrets): add TRANSCRIBER_BOT_PASSWORD for live transcription bot"
```

---

### Task 2: Dockerfile und app.py

**Files:**
- Create: `k3d/talk-transcriber/Dockerfile`
- Create: `k3d/talk-transcriber/app.py`

**Kontext:** Das Image muss Firefox (headless) + PulseAudio (virtual audio sink) + FFmpeg (audio capture) + Python mit Playwright enthalten. Das Image wird in die lokale k3d-Registry `registry.localhost:5000` gepusht und im Deployment via `image: registry.localhost:5000/talk-transcriber:latest` referenziert. `imagePullPolicy: Always` ist nicht nötig, da wir den Tag `latest` nutzen und lokal pushen.

- [ ] **Schritt 1: Dockerfile erstellen**

Datei: `k3d/talk-transcriber/Dockerfile`

```dockerfile
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
        xvfb \
        pulseaudio \
        ffmpeg \
        dbus \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir \
        fastapi \
        "uvicorn[standard]" \
        httpx \
        playwright

RUN playwright install firefox --with-deps

WORKDIR /app
COPY app.py .

EXPOSE 8000

CMD ["sh", "-c", \
     "pulseaudio --start --exit-idle-time=-1 --log-target=stderr 2>/dev/null; \
      uvicorn app:app --host 0.0.0.0 --port 8000"]
```

- [ ] **Schritt 2: app.py erstellen**

Datei: `k3d/talk-transcriber/app.py`

```python
#!/usr/bin/env python3
"""
talk-transcriber — Nextcloud Talk Live-Transkription
Pollt alle CHUNK_SECONDS nach aktiven Calls, tritt headless bei,
buffert Audio und schickt 10-s-Chunks an Whisper.
"""
import asyncio, os, subprocess, tempfile
from pathlib import Path

import httpx
from fastapi import FastAPI

NC_PROTO = os.environ.get("NC_PROTOCOL", "http")
NC_HOST  = os.environ.get("NC_DOMAIN", "nextcloud")
NC_URL   = f"{NC_PROTO}://{NC_HOST}"
NC_USER  = "transcriber-bot"
NC_PASS  = os.environ["TRANSCRIBER_BOT_PASSWORD"]
WHISPER  = os.environ.get("WHISPER_BASE_URL", "http://whisper:8000")
CHUNK_S  = int(os.environ.get("CHUNK_SECONDS", "10"))

app = FastAPI()
sessions: dict[str, dict] = {}  # room_token → session state


# ─── Lifecycle ────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def start() -> None:
    asyncio.create_task(poll_loop())


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "active": list(sessions)}


# ─── Polling ──────────────────────────────────────────────────────────────────

async def poll_loop() -> None:
    async with httpx.AsyncClient(
        auth=(NC_USER, NC_PASS), verify=False, timeout=10
    ) as client:
        while True:
            try:
                await tick(client)
            except Exception as exc:
                print(f"[poll] {exc}", flush=True)
            await asyncio.sleep(CHUNK_S)


async def tick(client: httpx.AsyncClient) -> None:
    r = await client.get(
        f"{NC_URL}/ocs/v2.php/apps/spreed/api/v4/room",
        headers={"OCS-APIRequest": "true", "Accept": "application/json"},
    )
    r.raise_for_status()
    rooms = r.json()["ocs"]["data"]

    live = {rm["token"] for rm in rooms if rm.get("hasCall")}
    for token in set(sessions) - live:
        _cancel(token)
    for token in live - set(sessions):
        sessions[token] = {}
        t = asyncio.create_task(run_session(token, client))
        sessions[token]["task"] = t


# ─── Session ──────────────────────────────────────────────────────────────────

async def run_session(token: str, client: httpx.AsyncClient) -> None:
    sink    = f"nc_t_{token[:6]}"
    display = f":{abs(hash(token)) % 89 + 11}"
    print(f"[{token}] starting", flush=True)

    xvfb = subprocess.Popen(["Xvfb", display, "-screen", "0", "1280x720x24"])
    subprocess.run(
        ["pactl", "load-module", "module-null-sink", f"sink_name={sink}"],
        env={**os.environ, "DISPLAY": display},
        check=False,
    )

    env = {**os.environ, "DISPLAY": display, "PULSE_SINK": sink}
    browser = _start_browser(token, env)
    sessions[token] |= {"xvfb": xvfb, "browser": browser, "sink": sink}

    await asyncio.sleep(8)  # let call establish in Firefox

    try:
        while token in sessions and sessions[token]:
            chunk = await _record_chunk(sink)
            if chunk:
                text = await _whisper(chunk)
                if text:
                    await _post_chat(client, token, f"🎙 {text}")
    except asyncio.CancelledError:
        pass
    finally:
        _teardown(token)


def _start_browser(token: str, env: dict) -> subprocess.Popen:
    """Write a one-shot Playwright script and launch it."""
    script = (
        "import asyncio\n"
        "from playwright.async_api import async_playwright\n"
        "\n"
        "async def main():\n"
        "    async with async_playwright() as p:\n"
        "        browser = await p.firefox.launch(headless=True)\n"
        "        page    = await browser.new_page()\n"
        f"        await page.goto('{NC_URL}/login')\n"
        f"        await page.fill('#user',       '{NC_USER}')\n"
        f"        await page.fill('#password',   '{NC_PASS}')\n"
        "        await page.click('#submit-form')\n"
        "        await page.wait_for_timeout(3000)\n"
        f"        await page.goto('{NC_URL}/index.php/call/{token}')\n"
        "        await asyncio.sleep(3600)  # stay up to 1 h\n"
        "        await browser.close()\n"
        "\n"
        "asyncio.run(main())\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(script)
        path = f.name
    sessions.setdefault(token, {})["_script"] = path
    return subprocess.Popen(["python3", path], env=env)


async def _record_chunk(sink: str) -> str | None:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        path = f.name
    result = subprocess.run(
        [
            "ffmpeg", "-y",
            "-f", "pulse", "-i", f"{sink}.monitor",
            "-t", str(CHUNK_S),
            "-ar", "16000", "-ac", "1", "-sample_fmt", "s16",
            path,
        ],
        capture_output=True,
    )
    if result.returncode != 0 or Path(path).stat().st_size < 2000:
        Path(path).unlink(missing_ok=True)
        return None
    return path


async def _whisper(audio_path: str) -> str:
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            with open(audio_path, "rb") as f:
                r = await c.post(
                    f"{WHISPER}/v1/audio/transcriptions",
                    files={"file": ("chunk.wav", f, "audio/wav")},
                    data={"model": "whisper-1", "language": "de"},
                )
            return r.json().get("text", "").strip() if r.is_success else ""
    finally:
        Path(audio_path).unlink(missing_ok=True)


async def _post_chat(client: httpx.AsyncClient, token: str, message: str) -> None:
    await client.post(
        f"{NC_URL}/ocs/v2.php/apps/spreed/api/v1/chat/{token}",
        headers={"OCS-APIRequest": "true"},
        json={"message": message},
    )


# ─── Cleanup ──────────────────────────────────────────────────────────────────

def _cancel(token: str) -> None:
    s = sessions.pop(token, None)
    if s and (t := s.get("task")):
        t.cancel()


def _teardown(token: str) -> None:
    s = sessions.pop(token, {})
    print(f"[{token}] stopping", flush=True)
    for key in ("browser", "xvfb"):
        if p := s.get(key):
            p.terminate()
    if path := s.get("_script"):
        Path(path).unlink(missing_ok=True)
    if sink := s.get("sink"):
        subprocess.run(
            ["pactl", "unload-module", f"sink_name={sink}"],
            capture_output=True,
        )
```

- [ ] **Schritt 3: Dockerfile build testen**

```bash
docker build -t talk-transcriber-test k3d/talk-transcriber/
```

Erwartetes Ergebnis: `Successfully built <id>` — Playwright-Firefox-Installation sollte ~2 min dauern.

```bash
docker rmi talk-transcriber-test
```

- [ ] **Schritt 4: Commit**

```bash
git add k3d/talk-transcriber/
git commit -m "feat(transcriber): add Python FastAPI app and Dockerfile for live transcription"
```

---

### Task 3: Kubernetes-Manifest talk-transcriber.yaml

**Files:**
- Create: `k3d/talk-transcriber.yaml`

**Kontext:** Folgt dem Muster von `k3d/talk-recording.yaml`. Image kommt aus der lokalen Registry `registry.localhost:5000`. Das Pod braucht `/dev/shm` (2 Gi) für Firefox und PulseAudio. `amd64`-NodeSelector wie talk-recording (Firefox-Binary ist x86_64-only).

- [ ] **Schritt 1: Manifest erstellen**

Datei: `k3d/talk-transcriber.yaml`

```yaml
# ── Nextcloud Talk Live-Transkription ─────────────────────────────────────────
# Pollt auf aktive Calls, tritt headless bei (Firefox + PulseAudio),
# schickt 10-s-Chunks an Whisper, postet Transkripte in den Talk-Chat.
# ─────────────────────────────────────────────────────────────────────────────
apiVersion: apps/v1
kind: Deployment
metadata:
  name: talk-transcriber
  labels:
    app: talk-transcriber
spec:
  replicas: 1
  selector:
    matchLabels:
      app: talk-transcriber
  template:
    metadata:
      labels:
        app: talk-transcriber
    spec:
      nodeSelector:
        kubernetes.io/arch: amd64
      containers:
        - name: transcriber
          image: registry.localhost:5000/talk-transcriber:latest
          env:
            - name: NC_DOMAIN
              value: "nextcloud"
            - name: NC_PROTOCOL
              value: "http"
            - name: WHISPER_BASE_URL
              value: "http://whisper:8000"
            - name: CHUNK_SECONDS
              value: "10"
            - name: TRANSCRIBER_BOT_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: workspace-secrets
                  key: TRANSCRIBER_BOT_PASSWORD
          ports:
            - containerPort: 8000
          volumeMounts:
            - name: shm
              mountPath: /dev/shm
          resources:
            requests:
              memory: 512Mi
              cpu: 250m
            limits:
              memory: 2Gi
              cpu: "2"
          readinessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 30
            periodSeconds: 15
          livenessProbe:
            httpGet:
              path: /health
              port: 8000
            initialDelaySeconds: 60
            periodSeconds: 30
      volumes:
        - name: shm
          emptyDir:
            medium: Memory
            sizeLimit: 2Gi
---
apiVersion: v1
kind: Service
metadata:
  name: talk-transcriber
spec:
  selector:
    app: talk-transcriber
  ports:
    - port: 8000
      targetPort: 8000
```

- [ ] **Schritt 2: YAML-Syntax validieren**

```bash
kubectl apply --dry-run=client -f k3d/talk-transcriber.yaml
```

Erwartetes Ergebnis:
```
deployment.apps/talk-transcriber created (dry run)
service/talk-transcriber created (dry run)
```

- [ ] **Schritt 3: Commit**

```bash
git add k3d/talk-transcriber.yaml
git commit -m "feat(k8s): add talk-transcriber Deployment and Service"
```

---

### Task 4: Kustomization eintragen

**Files:**
- Modify: `k3d/kustomization.yaml`

**Kontext:** `talk-transcriber.yaml` muss als Ressource eingetragen werden. Der Whisper-Eintrag steht bei Zeile 48. `talk-transcriber` kommt direkt danach.

- [ ] **Schritt 1: Ressource eintragen**

Datei: `k3d/kustomization.yaml` — nach der Zeile `- whisper.yaml` einfügen:

```yaml
  - talk-transcriber.yaml  # Live-Transkription Bot
```

- [ ] **Schritt 2: Kustomize-Build validieren**

```bash
kustomize build k3d/ | grep -A3 "name: talk-transcriber"
```

Erwartetes Ergebnis: Deployment und Service erscheinen im Output.

- [ ] **Schritt 3: Commit**

```bash
git add k3d/kustomization.yaml
git commit -m "feat(kustomize): add talk-transcriber to workspace resource list"
```

---

### Task 5: Setup-Script erstellen

**Files:**
- Create: `scripts/transcriber-setup.sh`

**Kontext:** Folgt dem Muster von `scripts/recording-setup.sh`. Das Script legt den Nextcloud-User `transcriber-bot` an, den der Pod für API-Calls und Browser-Login nutzt. `|| true` macht alle Befehle idempotent — bei bereits existierendem User kein Fehler.

- [ ] **Schritt 1: Script erstellen**

Datei: `scripts/transcriber-setup.sh`

```bash
#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# transcriber-setup.sh
# Legt den transcriber-bot-Nextcloud-User für den talk-transcriber-Pod an.
# Idempotent: bei bereits existierendem User kein Fehler.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

NAMESPACE="${NAMESPACE:-workspace}"
KUBE_CONTEXT="${KUBE_CONTEXT:-}"

_kubectl() { kubectl ${KUBE_CONTEXT:+--context "$KUBE_CONTEXT"} "$@"; }

_occ() {
  _kubectl exec -n "${NAMESPACE}" deploy/nextcloud -c nextcloud -- \
    su -s /bin/bash www-data -c "$1" 2>&1
}

echo "=== Transcriber-Bot Setup ==="

TRANSCRIBER_PASS=$(_kubectl get secret workspace-secrets -n "${NAMESPACE}" \
  -o jsonpath='{.data.TRANSCRIBER_BOT_PASSWORD}' | base64 -d)

if [ -z "${TRANSCRIBER_PASS}" ]; then
  echo "FEHLER: TRANSCRIBER_BOT_PASSWORD nicht gefunden." >&2
  exit 1
fi

# User anlegen (|| true = idempotent)
_kubectl exec -n "${NAMESPACE}" deploy/nextcloud -c nextcloud -- \
  bash -c "export OC_PASS='${TRANSCRIBER_PASS}' && \
    su -s /bin/bash www-data -c \
    'php occ user:add --display-name=\"Live-Transkription\" \
     --password-from-env transcriber-bot 2>/dev/null || true'"

echo "=== Verifizierung ==="
_occ "php occ user:info transcriber-bot" | grep -E "user_id|display"

echo ""
echo "=== Transcriber Setup abgeschlossen ==="
echo "  transcriber-bot User ist in Nextcloud registriert."
echo "  Der talk-transcriber-Pod tritt automatisch aktiven Calls bei."
```

- [ ] **Schritt 2: Script ausführbar machen**

```bash
chmod +x scripts/transcriber-setup.sh
```

- [ ] **Schritt 3: ShellCheck (falls verfügbar)**

```bash
shellcheck scripts/transcriber-setup.sh
```

Erwartetes Ergebnis: keine Fehler oder Warnungen (SC2086 für `_kubectl` ist akzeptabel und kann mit `# shellcheck disable=SC2086` unterdrückt werden).

- [ ] **Schritt 4: Commit**

```bash
git add scripts/transcriber-setup.sh
git commit -m "feat(scripts): add transcriber-setup.sh to create transcriber-bot user"
```

---

### Task 6: Taskfile — neue Tasks + workspace:up-Wiring

**Files:**
- Modify: `Taskfile.yml`

**Kontext:** Zwei neue Tasks werden nach `workspace:billing-build` (Zeile 282) eingefügt:
1. `workspace:transcriber-build` — baut und pusht das Docker-Image in die lokale Registry
2. `workspace:transcriber-setup` — ruft das Setup-Script auf

In `workspace:up` (Zeile 267) wird `workspace:transcriber-setup` direkt nach `workspace:recording-setup` eingefügt.

- [ ] **Schritt 1: workspace:transcriber-build Task einfügen**

Datei: `Taskfile.yml` — nach `workspace:billing-build` (nach Zeile ~287) einfügen:

```yaml
  workspace:transcriber-build:
    desc: Build and push talk-transcriber image to local registry
    cmds:
      - docker build -t {{.REGISTRY}}/talk-transcriber:latest k3d/talk-transcriber/
      - docker push {{.REGISTRY}}/talk-transcriber:latest
      - 'echo "✓ talk-transcriber image pushed to {{.REGISTRY}}"'

  workspace:transcriber-setup:
    desc: Build talk-transcriber image and create transcriber-bot Nextcloud user
    deps: [workspace:transcriber-build]
    cmds:
      - bash scripts/transcriber-setup.sh
```

- [ ] **Schritt 2: workspace:up erweitern**

Datei: `Taskfile.yml` — in `workspace:up` nach Zeile 267 (`- task: workspace:recording-setup`) einfügen:

```yaml
      - task: workspace:transcriber-setup
```

Die Sektion sieht danach so aus:
```yaml
      - task: workspace:call-setup
      - task: workspace:recording-setup
      - task: workspace:transcriber-setup
      - echo ""
      - 'echo "✓ Workspace MVP stack is fully deployed and configured!"'
```

- [ ] **Schritt 3: Task-Syntax validieren**

```bash
task --list 2>&1 | grep transcriber
```

Erwartetes Ergebnis:
```
workspace:transcriber-build   Build and push talk-transcriber image to local registry
workspace:transcriber-setup   Create transcriber-bot Nextcloud user for live call transcription
```

- [ ] **Schritt 4: Commit**

```bash
git add Taskfile.yml
git commit -m "feat(taskfile): add transcriber-build and transcriber-setup tasks"
```

---

### Task 7: Build, Import und Kustomize-Validierung

**Files:** keine Änderungen

**Kontext:** Abschluss-Validierung. Das Image muss mindestens einmal erfolgreich gebaut und per `kustomize build` validiert werden können. Falls der Cluster läuft, wird auch der Pod-Start geprüft.

- [ ] **Schritt 1: Kustomize-Build ausführen**

```bash
task workspace:validate
```

Falls `task` nicht verfügbar:
```bash
kustomize build k3d/ | kubectl apply --dry-run=client -f - 2>&1 | tail -10
```

Erwartetes Ergebnis: kein Fehler, `talk-transcriber` Deployment und Service erscheinen.

- [ ] **Schritt 2: talk-transcriber im Build-Output prüfen**

```bash
kustomize build k3d/ | grep -A5 "name: talk-transcriber"
```

Erwartetes Ergebnis: Deployment-Spec mit Image `registry.localhost:5000/talk-transcriber:latest` erscheint.

- [ ] **Schritt 3: Image bauen und in Registry pushen**

```bash
task workspace:transcriber-build
```

Erwartetes Ergebnis: Docker-Build läuft durch (Playwright-Firefox-Download ~2 min), danach:
```
✓ talk-transcriber image pushed to localhost:5000
```

- [ ] **Schritt 4: Verifizierung (falls Cluster läuft)**

```bash
kubectl rollout status deploy/talk-transcriber -n workspace --timeout=120s
```

Erwartetes Ergebnis: `deployment "talk-transcriber" successfully rolled out`

```bash
kubectl exec -n workspace deploy/talk-transcriber -- curl -sf http://localhost:8000/health
```

Erwartetes Ergebnis: `{"status":"ok","active":[]}`

- [ ] **Schritt 5: Transcriber-Bot User anlegen (falls Cluster läuft)**

```bash
task workspace:transcriber-setup
```

Erwartetes Ergebnis:
```
=== Transcriber-Bot Setup ===
=== Verifizierung ===
  user_id: transcriber-bot
  ...
=== Transcriber Setup abgeschlossen ===
```

- [ ] **Schritt 6: End-to-End-Test (falls Cluster läuft)**

```bash
# Einen Talk-Room mit aktivem Call öffnen und 30 s warten.
# Dann im Transcriber-Log prüfen:
kubectl logs -n workspace deploy/talk-transcriber --tail=20
```

Erwartetes Ergebnis: Zeilen wie `[<token>] starting` und `[<token>] stopping` erscheinen wenn ein Call gestartet und beendet wird.

```bash
# Health-Check mit aktivem Call:
kubectl exec -n workspace deploy/talk-transcriber -- curl -sf http://localhost:8000/health
```

Erwartetes Ergebnis: `{"status":"ok","active":["<room-token>"]}` — der aktive Call erscheint in der Liste.

- [ ] **Schritt 7: Abschluss-Commit (falls noch ausstehend)**

```bash
git status
git log --oneline -7
```

Alle Änderungen sollten committed sein.
