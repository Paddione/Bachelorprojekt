#!/usr/bin/env python3
"""
talk-transcriber -- Nextcloud Talk Live-Transkription
Pollt alle CHUNK_SECONDS nach aktiven Calls, tritt headless bei,
buffert Audio und schickt 5-s-Chunks an Whisper.
"""
import asyncio, hashlib, hmac, os, subprocess, tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Request

NC_PROTO     = os.environ.get("NC_PROTOCOL", "http")
NC_HOST      = os.environ.get("NC_DOMAIN", "nextcloud")
NC_URL       = f"{NC_PROTO}://{NC_HOST}"
NC_USER      = "transcriber-bot"
NC_PASS      = os.environ["TRANSCRIBER_BOT_PASSWORD"]
NC_SECRET    = os.environ.get("TRANSCRIBER_SECRET", "")
NC_VERIFY    = os.environ.get("NC_VERIFY_SSL", "false").lower() == "true"
WHISPER      = os.environ.get("WHISPER_BASE_URL", "http://whisper:8000")
CHUNK_S      = int(os.environ.get("CHUNK_SECONDS", "5"))
MAX_SESSIONS = int(os.environ.get("MAX_SESSIONS", "3"))

_display_pool: list[int] = list(range(11, 100))  # X display numbers :11 through :99
_pa_ok: bool = True  # last known PulseAudio state


# ---------- Lifespan ----------------------------------------------------------

@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(poll_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(lifespan=lifespan)
sessions: dict[str, dict] = {}  # room_token -> session state


# ---------- Health ------------------------------------------------------------

@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok" if _pa_ok else "degraded",
        "pulseaudio": _pa_ok,
        "active": list(sessions),
    }


# ---------- Webhook (Nextcloud Talk Bot API) ----------------------------------

@app.post("/webhook")
async def webhook(request: Request) -> dict:
    """
    Empfaengt Events von Nextcloud Talk.
    Verifiziert die HMAC-SHA256-Signatur; startet Transkription bei Call-Events.
    """
    body = await request.body()

    if NC_SECRET:
        sig_header = request.headers.get("X-Nextcloud-Talk-Signature", "")
        expected = hmac.new(NC_SECRET.encode(), body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(sig_header, expected):
            raise HTTPException(status_code=401, detail="invalid signature")

    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="invalid JSON")

    token = data.get("token") or data.get("roomToken")
    event = data.get("event", "")

    if not token:
        return {"status": "ignored", "reason": "no token"}

    if event in ("call_started", "message") or not event:
        if token not in sessions and len(sessions) < MAX_SESSIONS:
            print(f"[webhook] trigger for {token}", flush=True)
            sessions[token] = {}
            t = asyncio.create_task(run_session(token))
            sessions[token]["task"] = t
            return {"status": "started", "token": token}
        if len(sessions) >= MAX_SESSIONS:
            return {"status": "rejected", "reason": "max sessions reached"}

    return {"status": "ok"}


# ---------- Polling -----------------------------------------------------------

async def poll_loop() -> None:
    global _pa_ok
    async with httpx.AsyncClient(
        auth=(NC_USER, NC_PASS), verify=NC_VERIFY, timeout=10
    ) as client:
        while True:
            try:
                await tick(client)
            except Exception as exc:
                print(f"[poll] {exc}", flush=True)

            # Check PulseAudio health
            pa_proc = await asyncio.create_subprocess_exec(
                "pactl", "info",
                stdout=asyncio.subprocess.DEVNULL,
                stderr=asyncio.subprocess.DEVNULL,
            )
            await pa_proc.wait()
            _pa_ok = pa_proc.returncode == 0
            if not _pa_ok:
                print("[poll] WARNING: PulseAudio not responding", flush=True)

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
        if len(sessions) >= MAX_SESSIONS:
            print(f"[poll] skipping {token}: max sessions ({MAX_SESSIONS}) reached", flush=True)
            break
        sessions[token] = {}
        t = asyncio.create_task(run_session(token))
        sessions[token]["task"] = t


# ---------- Session -----------------------------------------------------------

async def run_session(token: str) -> None:
    display_num = _display_pool.pop(0) if _display_pool else (abs(hash(token)) % 89 + 11)
    display = f":{display_num}"
    sink    = f"nc_t_{token[:6]}"
    print(f"[{token}] starting on display {display}", flush=True)

    xvfb = subprocess.Popen(
        ["Xvfb", display, "-screen", "0", "1280x720x24"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )

    # Load PulseAudio null-sink asynchronously (avoids blocking the event loop)
    pa_proc = await asyncio.create_subprocess_exec(
        "pactl", "load-module", "module-null-sink", f"sink_name={sink}",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
        env={**os.environ, "DISPLAY": display},
    )
    pa_stdout, _ = await pa_proc.communicate()
    module_id = pa_stdout.decode().strip()

    # Credentials are passed via env so the script file contains no secrets
    browser_env = {
        **os.environ,
        "DISPLAY": display,
        "PULSE_SINK": sink,
        "NC_URL_BOT": NC_URL,
        "NC_USER_BOT": NC_USER,
        "NC_PASS_BOT": NC_PASS,
        "CALL_TOKEN": token,
    }
    browser = _start_browser(browser_env)
    sessions[token] |= {
        "xvfb": xvfb,
        "browser": browser,
        "sink": sink,
        "module_id": module_id,
        "display_num": display_num,
    }

    await asyncio.sleep(5)  # let call establish in Firefox

    async with httpx.AsyncClient(
        auth=(NC_USER, NC_PASS), verify=NC_VERIFY, timeout=10
    ) as client:
        try:
            while token in sessions and sessions[token]:
                chunk = await _record_chunk(sink)
                if chunk:
                    text = await _whisper(chunk)
                    if text:
                        await _post_chat(client, token, f"\U0001f3a4 {text}")
        except asyncio.CancelledError:
            pass
        finally:
            _teardown(token, display_num)


def _start_browser(env: dict) -> subprocess.Popen:
    """
    Launch headless Firefox via Playwright.
    Credentials are passed through environment variables --
    the script file contains no sensitive data.
    """
    script = (
        "import asyncio, os\n"
        "from playwright.async_api import async_playwright\n"
        "\n"
        "NC_URL  = os.environ['NC_URL_BOT']\n"
        "NC_USER = os.environ['NC_USER_BOT']\n"
        "NC_PASS = os.environ['NC_PASS_BOT']\n"
        "TOKEN   = os.environ['CALL_TOKEN']\n"
        "\n"
        "async def main():\n"
        "    async with async_playwright() as p:\n"
        "        browser = await p.firefox.launch(headless=True)\n"
        "        page    = await browser.new_page()\n"
        "        await page.goto(f'{NC_URL}/login')\n"
        "        await page.fill('#user',      NC_USER)\n"
        "        await page.fill('#password',  NC_PASS)\n"
        "        await page.click('#submit-form')\n"
        "        await page.wait_for_timeout(3000)\n"
        "        await page.goto(f'{NC_URL}/index.php/call/{TOKEN}')\n"
        "        await asyncio.sleep(3600)  # stay in call up to 1 h\n"
        "        await browser.close()\n"
        "\n"
        "asyncio.run(main())\n"
    )
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(script)
        path = f.name
    return subprocess.Popen(
        ["python3", path],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


async def _record_chunk(sink: str) -> str | None:
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        path = f.name
    proc = await asyncio.create_subprocess_exec(
        "ffmpeg", "-y",
        "-f", "pulse", "-i", f"{sink}.monitor",
        "-t", str(CHUNK_S),
        "-ar", "16000", "-ac", "1", "-sample_fmt", "s16",
        path,
        stdout=asyncio.subprocess.DEVNULL,
        stderr=asyncio.subprocess.DEVNULL,
    )
    await proc.wait()
    if proc.returncode != 0 or Path(path).stat().st_size < 2000:
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


# ---------- Cleanup -----------------------------------------------------------

def _teardown_resources(s: dict) -> None:
    for key in ("browser", "xvfb"):
        if p := s.get(key):
            try:
                p.terminate()
            except Exception:
                pass
    if mid := s.get("module_id"):
        subprocess.run(["pactl", "unload-module", mid], capture_output=True)
    # Return display number to pool
    if (num := s.get("display_num")) is not None:
        if num not in _display_pool:
            _display_pool.append(num)


def _cancel(token: str) -> None:
    """Cancel a session task; cleanup is handled by run_session's finally block."""
    s = sessions.get(token)
    if s and (t := s.get("task")):
        t.cancel()
    # Do NOT pop from sessions here -- run_session finally calls _teardown


def _teardown(token: str, display_num: int | None = None) -> None:
    s = sessions.pop(token, {})
    # If display_num was passed and not in state (e.g. session init failed early), use it
    if display_num is not None and "display_num" not in s:
        s["display_num"] = display_num
    print(f"[{token}] stopping", flush=True)
    _teardown_resources(s)
