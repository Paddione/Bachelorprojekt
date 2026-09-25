#!/usr/bin/env python3
"""Fake-ComfyUI fuer tests/spec/llm-local-dev/comfy-image-mcp.bats (T900379).

Bildet die HTTP-Endpunkte nach, die scripts/comfy-image-mcp/ nutzt:
/system_stats, /prompt, /history/<id>, /view, /interrupt. Stdlib only.
Nutzung: fake-comfyui.py <port>; der letzte Prompt landet in $FAKE_COMFY_DIR/last_prompt.json.
"""
import json
import os
import struct
import sys
import zlib
from http.server import BaseHTTPRequestHandler, HTTPServer

OUT_DIR = os.environ.get("FAKE_COMFY_DIR", ".")


def png(width=64, height=64):
    """Einfarbiges RGB-PNG ohne Pillow."""
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)

    row = b"\x00" + bytes([200, 60, 40]) * width
    raw = zlib.compress(row * height)
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", raw) + chunk(b"IEND", b"")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/system_stats":
            return self.reply(200, {"devices": [{"name": "cuda:0 fake", "vram_total": 8589934592, "vram_free": 6442450944}]})
        if self.path == "/history/p1":
            return self.reply(200, {"p1": {
                "status": {"status_str": "success", "completed": True, "messages": []},
                "outputs": {"9": {"images": [{"filename": "x.png", "subfolder": "", "type": "output"}]}},
            }})
        if self.path.startswith("/view"):
            return self.reply(200, png(), "image/png")
        return self.reply(404, {"error": "not found"})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = self.rfile.read(length)
        if self.path == "/interrupt":
            return self.reply(200, {})
        if self.path == "/prompt":
            with open(os.path.join(OUT_DIR, "last_prompt.json"), "wb") as fh:
                fh.write(body)
            if b"FAIL_PROMPT" in body:
                return self.reply(400, {"error": {"message": "bad"},
                                        "node_errors": {"1": {"errors": [{"message": "bad node"}]}}})
            return self.reply(200, {"prompt_id": "p1", "number": 0, "node_errors": {}})
        return self.reply(404, {"error": "not found"})


if __name__ == "__main__":
    HTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()
