#!/usr/bin/env python3
"""cbm-embed-client.py — HTTP embedding client & endpoint probing (T900993).

Split out of cbm-embed-sync.py (S1 filesize gate). Handles batch embedding,
fan-out across multiple endpoints, retry logic with backoff, and live endpoint
probing with fallback to local inference endpoints. Standard library only.
"""

from __future__ import annotations

import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

EMBED_BATCH = 16
EMBED_TIMEOUT_S = 300
EMBED_ATTEMPTS = 4
EMBED_BACKOFF_S = (2, 5, 10)
DEFAULT_EMBED_URL = "http://127.0.0.1:18235/v1/lfm/embeddings"

# Ein Raum, ein Pfad: Der CBM-Index ist LFM-Raum (Modell-Label
# lfm25-embedding-350m, siehe cbm-embed-sync.py). Der bge-Pfad
# (/v1/embeddings) faellt hier bewusst raus — Quer-Fallback wuerde den
# Index still beschaedigen; lieber 503 als falsche Vektoren.
FALLBACK_EMBED_URLS = [
    "http://127.0.0.1:18235/v1/lfm/embeddings",
]


def _auth_headers(base=None):
    # Optionaler Bearer wie in scripts/bge-mcp/server.mjs: direkte
    # llama.cpp-Endpunkte ignorieren ihn, der Cluster-Proxy verlangt ihn.
    headers = dict(base or {})
    token = os.environ.get("LLM_PROXY_ADMIN_TOKEN", "")
    if token:
        headers["Authorization"] = "Bearer %s" % token
    return headers

if "cbm_sync_graph" in sys.modules:
    SyncError = sys.modules["cbm_sync_graph"].SyncError
else:
    class SyncError(Exception):
        """Raised on embed failure; mapped to SyncError in caller."""


def eprint(*a):
    print(*a, file=sys.stderr)


def normalize_embed_url(url: str) -> str:
    url = (url or "").rstrip("/")
    if url.endswith("/v1/embeddings"):
        return url
    # Rollen-Pfade des Proxy sind bereits vollständig (/v1/<rolle>/embeddings
    # bzw. /v1/colbert/rerank); Anhaengen wuerde sie korrumpieren.
    if re.search(r"/v1/[^/]+/(embeddings|rerank)$", url):
        return url
    if url.endswith("/v1"):
        return url + "/embeddings"
    return url + "/v1/embeddings"


def embed_batch(texts, url, model, timeout):
    body = json.dumps({"model": model, "input": list(texts)}).encode("utf-8")
    req = urllib.request.Request(
        url, data=body, headers=_auth_headers({"Content-Type": "application/json"}))
    last = None
    for attempt in range(EMBED_ATTEMPTS):
        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                data = json.load(resp)
            if not isinstance(data, dict) or not isinstance(data.get("data"), list):
                raise SyncError("embed-envelope-malformed")
            vecs = [None] * len(data["data"])
            for item in data["data"]:
                idx = item.get("index")
                if isinstance(idx, int) and 0 <= idx < len(vecs):
                    vecs[idx] = item.get("embedding")
            if any(v is None for v in vecs):
                raise SyncError("embed-index-gaps")
            return vecs
        except SyncError:
            raise
        except Exception as exc:
            last = exc
            if attempt < EMBED_ATTEMPTS - 1:
                delay = EMBED_BACKOFF_S[min(attempt, len(EMBED_BACKOFF_S) - 1)]
                eprint("  embed retry %d/%d in %ds: %r"
                       % (attempt + 1, EMBED_ATTEMPTS, delay, exc))
                time.sleep(delay)
    raise SyncError("embed-failed-after-%d-attempts:%r"
                          % (EMBED_ATTEMPTS, last))


def embed_texts(texts, url_or_urls, model, timeout=EMBED_TIMEOUT_S, log=None,
                on_batch=None, batch_fn=None, batch_size=None):
    if batch_fn is None:
        batch_fn = embed_batch
    if batch_size is None:
        batch_size = EMBED_BATCH
    if isinstance(url_or_urls, (list, tuple)):
        urls = [normalize_embed_url(u) for u in url_or_urls if u]
    else:
        urls = [normalize_embed_url(url_or_urls)]
    if not urls:
        raise SyncError("embed-no-endpoints")
    chunks = [texts[i:i + batch_size]
              for i in range(0, len(texts), batch_size)]
    assignment = shard_batches(len(chunks), urls)
    vecs_by_idx = [None] * len(chunks)
    done = [0]

    def finish(idx, vecs):
        vecs_by_idx[idx] = vecs
        done[0] += len(vecs)
        if log:
            log("  embedded %d/%d" % (done[0], len(texts)))
        if on_batch:
            base = idx * batch_size
            on_batch([(base + j, v) for j, v in enumerate(vecs)])

    if len(urls) == 1:
        for idx, chunk in enumerate(chunks):
            finish(idx, batch_fn(chunk, urls[0], model, timeout))
    else:
        from concurrent.futures import ThreadPoolExecutor, as_completed
        with ThreadPoolExecutor(max_workers=len(urls),
                                thread_name_prefix="embed-fanout") as ex:
            futs = {ex.submit(batch_fn, chunk, url, model, timeout): idx
                    for idx, (chunk, url) in enumerate(zip(chunks,
                                                           assignment))}
            for fut in as_completed(futs):
                finish(futs[fut], fut.result())
    out = []
    for vecs in vecs_by_idx:
        out.extend(vecs)
    return out


def shard_batches(n_chunks, urls):
    if not urls:
        raise SyncError("embed-no-endpoints")
    return [urls[i % len(urls)] for i in range(n_chunks)]


# Default-Timeout 10 s: Proxy-Ketten sind Tablet-first und brauchen beim
# Kaltstart laenger als 1 s; ein zu knappes Default waere falsch-negativ.
def probe_url_live(url, timeout=10.0, model=None):
    norm = normalize_embed_url(url)
    base = norm.rsplit("/v1", 1)[0]
    # Stufe 1 — Prozess lebt: Proxy meldet /livez (reine Liveness),
    # direktes llama.cpp nur /health. /health am Proxy meldet Readiness
    # ueber ALLE Rollen (Chat-Backends eingeschlossen) und ist fuer die
    # Embed-Kette die falsche Ampel — deshalb /livez zuerst.
    alive = False
    for probe_path in ("/livez", "/health"):
        try:
            req = urllib.request.Request(
                base + probe_path, headers=_auth_headers({"User-Agent": "cbm-probe"}))
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                if resp.status == 200:
                    alive = True
                    break
        except Exception:
            continue
    if not alive:
        return False
    try:
        # Modell mitgeben: Upstreams lehnen unbekannte Modelle mit 400 ab
        # (llama.cpp) — "test" waere falsch-negativ.
        body = json.dumps({"model": model or "test", "input": ["probe"]}).encode("utf-8")
        req = urllib.request.Request(norm, data=body, headers=_auth_headers({"Content-Type": "application/json"}))
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            if resp.status == 200:
                return True
    except Exception:
        pass
    return False


def resolve_embed_urls(args):
    raw = getattr(args, "embed_urls", None)
    if not raw:
        raw = os.environ.get("LLM_EMBED_URLS", "")
    urls = [u.strip() for u in (raw or "").split(",") if u.strip()]
    if urls:
        return urls
    return [getattr(args, "embed_url", DEFAULT_EMBED_URL)]


def select_live_urls(urls, model=None):
    if not urls:
        urls = [DEFAULT_EMBED_URL]

    live_urls = [u for u in urls if probe_url_live(u, model=model)]
    if live_urls:
        return live_urls

    for fb in FALLBACK_EMBED_URLS:
        if fb not in urls and probe_url_live(fb, model=model):
            eprint("  [warn] configured embedding endpoint %s unreachable, using live endpoint: %s"
                   % (urls, fb))
            return [fb]

    return urls
