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
    result = subprocess.run(
        ["pactl", "load-module", "module-null-sink", f"sink_name={sink}"],
        env={**os.environ, "DISPLAY": display},
        capture_output=True,
        text=True,
        check=False,
    )
    module_id = result.stdout.strip()

    env = {**os.environ, "DISPLAY": display, "PULSE_SINK": sink}
    browser = _start_browser(token, env)
    sessions[token] |= {"xvfb": xvfb, "browser": browser, "sink": sink, "module_id": module_id}

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
        f"        await page.fill('#user',       {repr(NC_USER)})\n"
        f"        await page.fill('#password',   {repr(NC_PASS)})\n"
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


# ─── Cleanup ──────────────────────────────────────────────────────────────────

def _teardown_resources(s: dict) -> None:
    for key in ("browser", "xvfb"):
        if p := s.get(key):
            p.terminate()
    if path := s.get("_script"):
        Path(path).unlink(missing_ok=True)
    if mid := s.get("module_id"):
        subprocess.run(["pactl", "unload-module", mid], capture_output=True)


def _cancel(token: str) -> None:
    s = sessions.pop(token, None)
    if s:
        if t := s.get("task"):
            t.cancel()
        _teardown_resources(s)


def _teardown(token: str) -> None:
    s = sessions.pop(token, {})
    print(f"[{token}] stopping", flush=True)
    _teardown_resources(s)
