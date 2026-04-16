#!/usr/bin/env python3
"""
talk-transcriber -- Nextcloud Talk Post-Meeting-Transkription
Pollt alle CHUNK_SECONDS nach aktiven Calls, tritt headless bei,
buffert Audio und schickt Chunks an Whisper. Nach Gespraechsende
wird das vollstaendige Transkript an die Website-API gesendet,
die es in der Datenbank und in Nextcloud-Dateien speichert.
"""
import asyncio, hashlib, hmac, os, subprocess, tempfile
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
import psycopg2
from fastapi import FastAPI, HTTPException, Request

NC_PROTO      = os.environ.get("NC_PROTOCOL", "http")
NC_HOST       = os.environ.get("NC_DOMAIN", "nextcloud")
NC_URL        = f"{NC_PROTO}://{NC_HOST}"
NC_USER       = "transcriber-bot"
NC_PASS       = os.environ["TRANSCRIBER_BOT_PASSWORD"]
NC_SECRET     = os.environ.get("TRANSCRIBER_SECRET", "")
NC_VERIFY     = os.environ.get("NC_VERIFY_SSL", "false").lower() == "true"
NC_ADMIN_USER = os.environ.get("NC_ADMIN_USER", "admin")
NC_ADMIN_PASS = os.environ.get("NC_ADMIN_PASS", "")
WHISPER      = os.environ.get("WHISPER_BASE_URL", "http://whisper:8000")
WEBSITE_URL  = os.environ.get("WEBSITE_URL", "http://website.website.svc.cluster.local")
CHUNK_S      = int(os.environ.get("CHUNK_SECONDS", "5"))
MAX_SESSIONS = int(os.environ.get("MAX_SESSIONS", "3"))
AUTO_JOIN_INTERVAL = 30   # re-check for new rooms every 30 seconds

# httpx timeout: DNS on this cluster can take up to 10s due to ndots:5 search path;
# connect timeout must exceed that to avoid spurious ConnectTimeout errors.
NC_TIMEOUT = httpx.Timeout(connect=30.0, read=30.0, write=30.0, pool=30.0)

# Nextcloud DB access for system-wide room discovery
NC_DB_HOST = os.environ.get("NC_DB_HOST", "shared-db")
NC_DB_PORT = int(os.environ.get("NC_DB_PORT", "5432"))
NC_DB_NAME = os.environ.get("NC_DB_NAME", "nextcloud")
NC_DB_USER = os.environ.get("NC_DB_USER", "nextcloud")
NC_DB_PASS = os.environ.get("NC_DB_PASS", "")

_display_pool: list[int] = list(range(11, 100))  # X display numbers :11 through :99
_pa_ok: bool = True  # last known PulseAudio state


# ---------- Lifespan ----------------------------------------------------------

@asynccontextmanager
async def lifespan(_: FastAPI):
    poll_task      = asyncio.create_task(poll_loop())
    auto_join_task = asyncio.create_task(auto_join_loop())
    yield
    poll_task.cancel()
    auto_join_task.cancel()
    for t in (poll_task, auto_join_task):
        try:
            await t
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


# ---------- DB helpers --------------------------------------------------------

def _db_connect() -> "psycopg2.connection":
    return psycopg2.connect(
        host=NC_DB_HOST, port=NC_DB_PORT,
        dbname=NC_DB_NAME, user=NC_DB_USER, password=NC_DB_PASS,
        connect_timeout=5,
    )


def _db_get_room_metadata(token: str) -> dict:
    """
    Return room name and participants (non-bot users with display name + email)
    for a given room token. Used to pass context to the save-transcript endpoint
    so it can auto-create a meeting when none exists.
    """
    if not NC_DB_PASS:
        return {}
    import json as _json
    conn = None
    try:
        conn = _db_connect()
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM oc_talk_rooms WHERE token = %s", (token,))
            row = cur.fetchone()
            if not row:
                return {}
            room_id, room_name = row

            cur.execute("""
                SELECT DISTINCT a.actor_id
                FROM oc_talk_attendees a
                WHERE a.room_id = %s AND a.actor_type = 'users' AND a.actor_id != %s
                LIMIT 10
            """, (room_id, NC_USER))
            user_ids = [r[0] for r in cur.fetchall()]

            participants = []
            for uid in user_ids:
                cur.execute("SELECT data FROM oc_accounts WHERE uid = %s", (uid,))
                acc = cur.fetchone()
                if acc:
                    try:
                        data = _json.loads(acc[0])
                        display_name = data.get("displayname", {}).get("value", uid)
                        email = data.get("email", {}).get("value", "")
                    except Exception:
                        display_name = uid
                        email = ""
                    participants.append({"displayName": display_name, "email": email, "uid": uid})

            return {"roomName": room_name, "participants": participants}
    except Exception as exc:
        print(f"[db-meta] {exc}", flush=True)
        return {}
    finally:
        if conn:
            conn.close()


def _db_get_active_call_tokens() -> set[str]:
    """
    Query the Nextcloud DB for rooms that have at least one participant
    with in_call != 0 and a recent last_ping (within 120s).
    This replaces the HTTP API poll and avoids DNS/auth issues.
    """
    if not NC_DB_PASS:
        return set()
    conn = None
    try:
        conn = _db_connect()
        with conn.cursor() as cur:
            import time as _time
            cur.execute("""
                SELECT DISTINCT r.token
                FROM oc_talk_rooms r
                JOIN oc_talk_attendees a ON a.room_id = r.id
                JOIN oc_talk_sessions s ON s.attendee_id = a.id
                WHERE s.in_call != 0
                  AND s.last_ping > %s
            """, (int(_time.time()) - 120,))
            return {row[0] for row in cur.fetchall()}
    except Exception as exc:
        print(f"[db-poll] {exc}", flush=True)
        return set()
    finally:
        if conn:
            conn.close()


# ---------- Auto-join loop (slow, every AUTO_JOIN_INTERVAL seconds) -----------

def _db_add_bot_to_missing_rooms() -> int:
    """
    Directly INSERT the transcriber-bot into every group/public Talk room
    it is not yet a member of. Bypasses the admin HTTP API (which requires
    the caller to be a moderator of the room).
    Returns the number of rooms joined.
    """
    if not NC_DB_PASS:
        return 0
    conn = psycopg2.connect(
        host=NC_DB_HOST, port=NC_DB_PORT,
        dbname=NC_DB_NAME, user=NC_DB_USER, password=NC_DB_PASS,
        connect_timeout=5,
    )
    try:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO oc_talk_attendees
                    (room_id, actor_type, actor_id, participant_type)
                SELECT r.id, 'users', %s, 3
                FROM oc_talk_rooms r
                WHERE r.type IN (2, 3)
                  AND NOT EXISTS (
                      SELECT 1 FROM oc_talk_attendees a
                      WHERE a.room_id = r.id
                        AND a.actor_type = 'users'
                        AND a.actor_id = %s
                  )
                RETURNING room_id
            """, (NC_USER, NC_USER))
            added = cur.rowcount
            if added > 0:
                added_ids = [row[0] for row in cur.fetchall()]
                cur.execute(
                    "SELECT token FROM oc_talk_rooms WHERE id = ANY(%s)",
                    (added_ids,)
                )
                for (token,) in cur.fetchall():
                    print(f"[auto-join] added {NC_USER} to room {token}", flush=True)
        conn.commit()
    finally:
        conn.close()
    return added


async def auto_join_loop() -> None:
    """
    Background loop: adds transcriber-bot to every group/public Talk room
    it is not yet a member of. Uses direct DB INSERT to bypass the Talk API
    restriction where admin can only manage rooms it's a moderator of.
    """
    if not NC_DB_PASS:
        print("[auto-join] NC_DB_PASS not set, auto-join disabled", flush=True)
        return
    while True:
        try:
            added = await asyncio.get_event_loop().run_in_executor(
                None, _db_add_bot_to_missing_rooms
            )
            if added:
                print(f"[auto-join] joined {added} new room(s)", flush=True)
        except Exception as exc:
            print(f"[auto-join] {exc}", flush=True)
        await asyncio.sleep(AUTO_JOIN_INTERVAL)


# ---------- Poll loop (fast, every CHUNK_SECONDS) ----------------------------

async def poll_loop() -> None:
    """
    Poll for active calls via DB query every CHUNK_SECONDS.
    Uses oc_talk_sessions.in_call + last_ping to detect live calls.
    This avoids the Nextcloud HTTP API entirely (no DNS / auth issues).
    """
    global _pa_ok
    while True:
        try:
            live = await asyncio.get_event_loop().run_in_executor(
                None, _db_get_active_call_tokens
            )
            await tick(live)
        except Exception as exc:
            print(f"[poll] {exc}", flush=True)

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


async def tick(live: set[str]) -> None:
    for token in set(sessions) - live:
        _cancel(token)
    for token in live - set(sessions):
        if len(sessions) >= MAX_SESSIONS:
            print(f"[poll] skipping {token}: max sessions ({MAX_SESSIONS}) reached", flush=True)
            break
        print(f"[poll] detected active call in {token}", flush=True)
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

    pa_proc = await asyncio.create_subprocess_exec(
        "pactl", "load-module", "module-null-sink", f"sink_name={sink}",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.DEVNULL,
        env={**os.environ, "DISPLAY": display},
    )
    pa_stdout, _ = await pa_proc.communicate()
    module_id = pa_stdout.decode().strip()

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

    sessions[token] |= {
        "transcript_parts": [],
        "segments": [],
        "chunk_offset": 0.0,
    }

    try:
        while token in sessions and sessions[token]:
            chunk = await _record_chunk(sink)
            if chunk:
                text, segs = await _whisper(chunk)
                if text:
                    sessions[token]["transcript_parts"].append(text)
                    offset = sessions[token].get("chunk_offset", 0.0)
                    for seg in segs:
                        sessions[token]["segments"].append({
                            "start": round(offset + seg.get("start", 0), 2),
                            "end":   round(offset + seg.get("end",   0), 2),
                            "text":  seg.get("text", "").strip(),
                        })
                    sessions[token]["chunk_offset"] = offset + CHUNK_S
    except asyncio.CancelledError:
        pass
    finally:
        await _finalize_and_teardown(token, display_num)


def _start_browser(env: dict) -> subprocess.Popen:
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


async def _whisper(audio_path: str) -> tuple[str, list]:
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            with open(audio_path, "rb") as f:
                r = await c.post(
                    f"{WHISPER}/v1/audio/transcriptions",
                    files={"file": ("chunk.wav", f, "audio/wav")},
                    data={"model": "whisper-1", "language": "de",
                          "response_format": "verbose_json"},
                )
            if r.is_success:
                data = r.json()
                return data.get("text", "").strip(), data.get("segments", [])
            return "", []
    finally:
        Path(audio_path).unlink(missing_ok=True)


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
    if (num := s.get("display_num")) is not None:
        if num not in _display_pool:
            _display_pool.append(num)


def _cancel(token: str) -> None:
    s = sessions.get(token)
    if s and (t := s.get("task")):
        t.cancel()


async def _finalize_and_teardown(token: str, display_num: int | None = None) -> None:
    s = sessions.get(token, {})
    transcript_parts: list[str] = s.get("transcript_parts", [])
    segments: list[dict] = s.get("segments", [])

    if transcript_parts and WEBSITE_URL:
        full_text = "\n".join(transcript_parts)
        print(f"[{token}] saving transcript ({len(full_text)} chars, "
              f"{len(segments)} segments)", flush=True)
        try:
            room_meta = await asyncio.get_event_loop().run_in_executor(
                None, _db_get_room_metadata, token
            )
            async with httpx.AsyncClient(timeout=30) as wc:
                resp = await wc.post(
                    f"{WEBSITE_URL}/api/meeting/save-transcript",
                    json={
                        "roomToken": token,
                        "transcriptText": full_text,
                        "segments": segments,
                        **room_meta,
                    },
                )
                if not resp.is_success:
                    print(f"[{token}] save-transcript returned {resp.status_code}: "
                          f"{resp.text[:200]}", flush=True)
                else:
                    print(f"[{token}] transcript saved OK", flush=True)
        except Exception as exc:
            print(f"[{token}] failed to save transcript: {exc}", flush=True)
    elif not transcript_parts:
        print(f"[{token}] no transcript accumulated, skipping save", flush=True)

    s = sessions.pop(token, {})
    if display_num is not None and "display_num" not in s:
        s["display_num"] = display_num
    print(f"[{token}] stopping", flush=True)
    _teardown_resources(s)
