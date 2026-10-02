#!/usr/bin/env python3
"""Täglicher JSONL-Export aller Langfuse-Observationen nach MinIO [T900750]."""
import argparse
import hashlib
import hmac
import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

S3_ENDPOINT = "http://langfuse-minio:9000"
S3_BUCKET = "langfuse"
S3_ACCESS_KEY = "langfuse"
S3_SECRET_KEY = None

def _sign(key, msg):
    return hmac.new(key, msg.encode(), hashlib.sha256).digest()

def s3_put(endpoint, bucket, key, body, access, secret, region):
    host = urllib.parse.urlparse(endpoint).netloc
    now = datetime.now(timezone.utc)
    amz_date = now.strftime("%Y%m%dT%H%M%SZ")
    date_stamp = now.strftime("%Y%m%d")
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

def export_observations(date_str):
    base_url = os.environ.get("LANGFUSE_BASE_URL", "").strip()
    public_key = os.environ.get("LANGFUSE_PUBLIC_KEY", "").strip()
    secret_key = os.environ.get("LANGFUSE_SECRET_KEY", "").strip()
    
    if not public_key or not secret_key:
        print("Error: LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY required", file=sys.stderr)
        sys.exit(2)
    
    all_observations = []
    from_time = datetime.strptime(f"{date_str}T00:00:00Z", "%Y-%m-%dT%H:%M:%SZ")
    to_time = datetime.strptime(f"{date_str+1}T00:00:00Z", "%Y-%m-%dT%H:%M:%SZ")
    
    page = 1
    cursor = None
    while True:
        url = f"{base_url}/api/public/v2/observations?limit=100&fields=core,basic,io,metadata,usage,model&fromStartTime={from_time.isoformat()}Z&toStartTime={to_time.isoformat()}Z"
        if cursor:
            url += f"&cursor={cursor}"
        
        resp = urllib.request.urlopen(url, timeout=60)
        data = json.loads(resp.read())
        
        for obs in data.get("data", []):
            all_observations.append(json.dumps(obs, ensure_ascii=False))
        
        cursor = data.get("meta", {}).get("cursor")
        if not cursor or not data.get("data"):
            break
        page += 1
    
    s3_key = f"exports/observations/{date_str}.jsonl"
    body = "\n".join(all_observations).encode() + b"\n"
    
    s3_put(S3_ENDPOINT, S3_BUCKET, s3_key, body, S3_ACCESS_KEY, S3_SECRET_KEY, "us-east-1")
    print(f"exported {len(all_observations)} observations to s3://{S3_BUCKET}/{s3_key}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Export Langfuse observations to MinIO")
    parser.add_argument("--date", type=str, default=(datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d"), help="Export date (YYYY-MM-DD)")
    parser.add_argument("--print-key", action="store_true", help="Print S3 key only (no network, no env required)")
    args = parser.parse_args()
    
    if args.print_key:
        print(f"exports/observations/{args.date}.jsonl")
        sys.exit(0)
    
    try:
        export_observations(args.date)
        sys.exit(0)
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
