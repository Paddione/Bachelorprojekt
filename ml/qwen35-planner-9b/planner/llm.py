"""Minimal OpenAI-compatible client for the local llama-server."""
from __future__ import annotations

import base64
import mimetypes
from pathlib import Path

import requests


def image_part(path: str) -> dict:
    mime = mimetypes.guess_type(path)[0] or "image/png"
    data = base64.b64encode(Path(path).read_bytes()).decode()
    return {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}}


def to_openai(messages: list[dict]) -> list[dict]:
    """Convert our {type: image, image: path} blocks into data-URL image parts."""
    out = []
    for m in messages:
        content = m["content"]
        if isinstance(content, list):
            content = [image_part(b["image"]) if b.get("type") == "image" else b for b in content]
        out.append({"role": m["role"], "content": content})
    return out


def chat(base_url: str, messages: list[dict], *, think: bool, max_tokens: int,
         temperature: float = 0.7, n: int = 1, timeout: int = 1800) -> list[dict]:
    payload = {
        "messages": to_openai(messages),
        "max_tokens": max_tokens,
        "temperature": temperature,
        "top_p": 0.95 if think else 0.8,
        "n": n,
        "chat_template_kwargs": {"enable_thinking": think},
    }
    r = requests.post(f"{base_url.rstrip('/')}/v1/chat/completions", json=payload, timeout=timeout)
    r.raise_for_status()
    res = []
    for choice in r.json()["choices"]:
        msg = choice["message"]
        res.append({"content": msg.get("content") or "", "reasoning": msg.get("reasoning_content") or "",
                    "finish": choice.get("finish_reason")})
    return res
