#!/usr/bin/env python3
"""Taeglicher JSONL-Export aller Langfuse-Observations nach MinIO [T900750].

Exportiert alle Observations des Vortags (UTC) mit Input und Output als JSONL
nach s3://<bucket>/exports/observations/<YYYY-MM-DD>.jsonl. Nur Python-Stdlib,
SigV4 wird selbst signiert.

Aufruf:
  python3 scripts/langfuse/export_traces.py [--date YYYY-MM-DD] [--print-key]

Exit-Codes: 0 ok, 1 API/S3-Fehler, 2 Konfiguration fehlt.
"""
import argparse
import base64
import datetime
import hashlib
import hmac
import json
import os
import sys
import urllib.parse
import urllib.request

REQUIRED_ENV = (
    "LANGFUSE_BASE_URL",
    "LANGFUSE_PUBLIC_KEY",
    "LANGFUSE_SECRET_KEY",
    "S3_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY",
    "S3_SECRET_KEY",
)


def _sign(key, msg):
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()


def s3_put(endpoint, bucket, key, body, access, secret, region):
    host = urllib.parse.urlparse(endpoint).netloc
    now = datetime.datetime.now(datetime.timezone.utc)
    amz_date, date_stamp = now.strftime("%Y%m%dT%H%M%SZ"), now.strftime("%Y%m%d")
    payload_hash = hashlib.sha256(body).hexdigest()
    path = f"/{bucket}/{urllib.parse.quote(key)}"
    canonical = "\n".join(["PUT", path, "", f"host:{host}", f"x-amz-content-sha256:{payload_hash}",
                           f"x-amz-date:{amz_date}", "", "host;x-amz-content-sha256;x-amz-date", payload_hash])
    scope = f"{date_stamp}/{region}/s3/aws4_request"
    to_sign = "\n".join(["AWS4-HMAC-SHA256", amz_date, scope, hashlib.sha256(canonical.encode()).hexdigest()])
    k = _sign(_sign(_sign(_sign(("AWS4" + secret).encode(), date_stamp), region), "s3"), "aws4_request")
    sig = hmac.new(k, to_sign.encode(), hashlib.sha256).hexdigest()
    auth = (f"AWS4-HMAC-SHA256 Credential={access}/{scope}, "
            "SignedHeaders=host;x-amz-content-sha256;x-amz-date, Signature=" + sig)
    req = urllib.request.Request(endpoint + path, data=body, method="PUT", headers={
        "x-amz-date": amz_date, "x-amz-content-sha256": payload_hash, "Authorization": auth})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.status


def fetch_observations(base_url, public_key, secret_key, date_str, next_day):
    """Alle Observations eines Tages per Cursor-Pagination holen (R2: max 50/Seite mit IO)."""
    token = base64.b64encode(f"{public_key}:{secret_key}".encode()).decode()
    headers = {"Authorization": f"Basic {token}"}
    lines = []
    cursor = None
    while True:
        params = {"limit": "100", "fields": "core,basic,io,metadata,usage,model",
                  "fromStartTime": f"{date_str}T00:00:00Z",
                  "toStartTime": f"{next_day}T00:00:00Z"}
        if cursor:
            params["cursor"] = cursor
        url = base_url.rstrip("/") + "/api/public/v2/observations?" + urllib.parse.urlencode(params)
        try:
            req = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(req, timeout=60) as r:
                payload = json.loads(r.read())
        except Exception as exc:
            print(f"Error: Langfuse observations API failed ({type(exc).__name__})", file=sys.stderr)
            sys.exit(1)
        data = payload.get("data", [])
        for obs in data:
            lines.append(json.dumps(obs, ensure_ascii=False).encode("utf-8"))
        cursor = payload.get("meta", {}).get("cursor")
        if not cursor or not data:
            break
    return lines


def main():
    yesterday = (datetime.datetime.now(datetime.timezone.utc)
                 - datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    parser = argparse.ArgumentParser(description="Export Langfuse observations of one day to MinIO as JSONL")
    parser.add_argument("--date", default=yesterday, help="Export date (YYYY-MM-DD, default: gestern UTC)")
    parser.add_argument("--print-key", action="store_true",
                        help="Print S3 key only, no network, no env required")
    args = parser.parse_args()
    try:
        day = datetime.datetime.strptime(args.date, "%Y-%m-%d")
    except ValueError:
        print(f"Error: --date must be YYYY-MM-DD, got {args.date!r}", file=sys.stderr)
        return 2
    next_day = (day + datetime.timedelta(days=1)).strftime("%Y-%m-%d")
    key = f"exports/observations/{args.date}.jsonl"
    if args.print_key:
        print(key)
        return 0
    missing = [v for v in REQUIRED_ENV if not os.environ.get(v, "").strip()]
    if missing:
        print(f"Error: missing required env: {', '.join(missing)}", file=sys.stderr)
        return 2
    cfg = {v: os.environ[v].strip() for v in REQUIRED_ENV}
    region = os.environ.get("S3_REGION", "us-east-1").strip() or "us-east-1"
    lines = fetch_observations(cfg["LANGFUSE_BASE_URL"], cfg["LANGFUSE_PUBLIC_KEY"],
                               cfg["LANGFUSE_SECRET_KEY"], args.date, next_day)
    body = b"\n".join(lines) + b"\n" if lines else b"\n"
    try:
        s3_put(cfg["S3_ENDPOINT"], cfg["S3_BUCKET"], key, body,
               cfg["S3_ACCESS_KEY"], cfg["S3_SECRET_KEY"], region)
    except Exception as exc:
        print(f"Error: S3 upload failed ({type(exc).__name__})", file=sys.stderr)
        return 1
    print(f"exported {len(lines)} observations to s3://{cfg['S3_BUCKET']}/{key}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
