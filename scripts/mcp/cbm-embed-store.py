#!/usr/bin/env python3
"""cbm-embed-store.py — content-hash-keyed vector store for the K3 symbol layer.

Ticket T900993 (plan k3-embed-store-rerank task 2). Replaces the /tmp vector
checkpoints of the 2026-10-04 demo with a durable, drift-proof artifact pair.

Store layout (both under <repo-root>/.codebase-memory/, gitignored):

    embed-index.jsonl    append-ordered JSONL, one line per vector:
                         {"key","hash","model","dim","vector"}
    embed-manifest.json  sidecar manifest: corpus sha256, freshness receipt
                         id + timestamp, model, dim, counts

Key scheme mirrors the frozen corpus (docs/brain/corpus-freeze.json):

    repo@commit:path:symbol

`identity_of` strips the repo@commit prefix, so a commit rotation rekeys a
vector without re-embedding it when the content hash is unchanged. The
content hash is sha256 over model name + exact embedding input text — a
model bump invalidates every vector by construction.

All readers fail closed on malformed input: a corrupted artifact raises
EmbedStoreError instead of returning partial data. Stdlib only, no network.
"""

import argparse
import hashlib
import json
import math
import os
import sys
import tempfile
from datetime import datetime, timezone

SCHEMA_VERSION = "k3-embed-store/1"
ARTIFACT_NAME = "embed-index.jsonl"
MANIFEST_NAME = "embed-manifest.json"
DEFAULT_MODEL = "bge-m3"
VECTOR_DECIMALS = 6


class EmbedStoreError(Exception):
    """Raised on any malformed store input — consumers must fail closed."""


def eprint(msg):
    print(msg, file=sys.stderr)


def utc_now_iso():
    return datetime.now(timezone.utc).isoformat()


def atomic_write(path, data):
    parent = os.path.dirname(os.path.abspath(path))
    os.makedirs(parent, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=parent, prefix=".embed-store-", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            f.write(data)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def content_hash(model, text):
    """sha256 over model name + exact embedding input text (NUL-separated)."""
    if not isinstance(model, str) or not model:
        raise EmbedStoreError("content-hash-model-empty")
    if not isinstance(text, str):
        raise EmbedStoreError("content-hash-text-not-str")
    return hashlib.sha256((model + "\x00" + text).encode("utf-8")).hexdigest()


def make_key(repo, commit, path, symbol):
    for part, name in ((repo, "repo"), (commit, "commit"), (path, "path"),
                       (symbol, "symbol")):
        if not part or not isinstance(part, str):
            raise EmbedStoreError("key-part-missing:%s" % name)
    return "%s@%s:%s:%s" % (repo, commit, path, symbol)


def identity_of(key):
    """Strip the 'repo@commit:' prefix — 'repo@sha:path:symbol' -> 'path:symbol'.

    Keys without '@' are their own identity (keeps small fixtures simple)."""
    if not isinstance(key, str) or not key:
        raise EmbedStoreError("key-not-a-string")
    if "@" not in key:
        return key
    rest = key.split("@", 1)[1]
    return rest.split(":", 1)[1] if ":" in rest else rest


def artifact_path(root):
    return os.path.join(root, ".codebase-memory", ARTIFACT_NAME)


def manifest_path(root):
    return os.path.join(root, ".codebase-memory", MANIFEST_NAME)


def validate_vector(vector, dim):
    if not isinstance(vector, list) or not vector:
        raise EmbedStoreError("vector-not-a-list")
    if len(vector) != dim:
        raise EmbedStoreError("vector-dim-mismatch:%d!=%d" % (len(vector), dim))
    for x in vector:
        if isinstance(x, bool) or not isinstance(x, (int, float)) \
                or not math.isfinite(x):
            raise EmbedStoreError("vector-non-finite-component")


def validate_record(key, rec):
    if not isinstance(rec, dict):
        raise EmbedStoreError("record-not-a-dict:%s" % key)
    h = rec.get("hash")
    if not isinstance(h, str) or len(h) != 64 \
            or any(c not in "0123456789abcdef" for c in h):
        raise EmbedStoreError("record-hash-malformed:%s" % key)
    if not isinstance(rec.get("model"), str) or not rec["model"]:
        raise EmbedStoreError("record-model-missing:%s" % key)
    dim = rec.get("dim")
    if isinstance(dim, bool) or not isinstance(dim, int) or dim <= 0:
        raise EmbedStoreError("record-dim-invalid:%s" % key)
    try:
        validate_vector(rec.get("vector"), dim)
    except EmbedStoreError as exc:
        raise EmbedStoreError("%s:%s" % (exc, key)) from exc


def load_artifact(path):
    """Load the JSONL artifact into {key: record}. Missing file -> {} (first
    run). Any malformed line, duplicate key, or invalid record raises
    EmbedStoreError — never partial data."""
    if not os.path.exists(path):
        return {}
    store = {}
    try:
        with open(path, "r", encoding="utf-8") as f:
            for lineno, line in enumerate(f, 1):
                line = line.strip()
                if not line:
                    continue
                try:
                    rec = json.loads(line)
                except json.JSONDecodeError as exc:
                    raise EmbedStoreError(
                        "artifact-malformed-json:%s:%d" % (path, lineno)) from exc
                if not isinstance(rec, dict) or not isinstance(rec.get("key"), str):
                    raise EmbedStoreError(
                        "artifact-record-malformed:%s:%d" % (path, lineno))
                key = rec["key"]
                if key in store:
                    raise EmbedStoreError("artifact-duplicate-key:%s" % key)
                validate_record(key, rec)
                store[key] = rec
    except OSError as exc:
        raise EmbedStoreError("artifact-unreadable:%s" % path) from exc
    return store


def dump_artifact(records):
    lines = []
    for key, rec in records.items():
        validate_record(key, rec)
        vec = [round(float(x), VECTOR_DECIMALS) for x in rec["vector"]]
        lines.append(json.dumps(
            {"key": key, "hash": rec["hash"], "model": rec["model"],
             "dim": rec["dim"], "vector": vec},
            ensure_ascii=False, sort_keys=True))
    return "\n".join(lines) + ("\n" if lines else "")


def write_artifact(path, records):
    atomic_write(path, dump_artifact(records))
    return len(records)


def upsert(path, records):
    """Merge records into the artifact (existing order kept, new keys
    appended, updated keys rewritten in place). Returns the new total."""
    store = load_artifact(path)
    for key, rec in records.items():
        store[key] = rec
    write_artifact(path, store)
    return len(store)


def diff_by_hash(candidates, store):
    """Pure diff of {key: content_hash} candidates against {key: record} store.

    Returns {"to_embed", "unchanged", "to_prune"} (sorted key lists):
      to_embed   — candidate key whose identity is missing from the store or
                   whose content hash differs (text or model changed)
      unchanged  — candidate key whose identity exists with the same hash
                   (vector reused; the key may rotate to the new commit)
      to_prune   — store key whose identity is absent from the candidates
    """
    by_identity = {identity_of(k): k for k in store}
    candidate_identities = {identity_of(k) for k in candidates}
    to_embed, unchanged = [], []
    for key in sorted(candidates):
        ident = identity_of(key)
        old_key = by_identity.get(ident)
        if old_key is None or store[old_key].get("hash") != candidates[key]:
            to_embed.append(key)
        else:
            unchanged.append(key)
    to_prune = sorted(k for k in store
                      if identity_of(k) not in candidate_identities)
    return {"to_embed": to_embed, "unchanged": unchanged, "to_prune": to_prune}


def prune_stale(store, candidate_keys):
    """Pure: drop store entries whose identity is absent from candidate_keys.
    Returns (kept, pruned_keys)."""
    identities = {identity_of(k) for k in candidate_keys}
    kept = {k: rec for k, rec in store.items() if identity_of(k) in identities}
    pruned = sorted(k for k in store if identity_of(k) not in identities)
    return kept, pruned


def make_manifest(corpus_sha256, receipt_id, receipt_timestamp, model, dim,
                  vectors, **extra):
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "artifact": ARTIFACT_NAME,
        "corpus_sha256": corpus_sha256,
        "receipt_id": receipt_id,
        "receipt_timestamp": receipt_timestamp,
        "model": model,
        "dim": dim,
        "counts": {"vectors": vectors},
        "updated_at": utc_now_iso(),
    }
    manifest.update(extra)
    validate_manifest(manifest)
    return manifest


def validate_manifest(manifest):
    """Fail closed: a manifest without a receipt id (or with malformed
    fields) must never validate — consumers cannot bind vectors to a graph
    state without it."""
    if not isinstance(manifest, dict):
        raise EmbedStoreError("manifest-not-a-dict")
    if manifest.get("schema_version") != SCHEMA_VERSION:
        raise EmbedStoreError("manifest-schema-mismatch:%r"
                              % (manifest.get("schema_version"),))
    receipt_id = manifest.get("receipt_id")
    if not isinstance(receipt_id, str) or not receipt_id.strip():
        raise EmbedStoreError("manifest-receipt-missing")
    for field in ("corpus_sha256", "receipt_timestamp", "model"):
        if not isinstance(manifest.get(field), str) or not manifest[field]:
            raise EmbedStoreError("manifest-field-missing:%s" % field)
    dim = manifest.get("dim")
    if isinstance(dim, bool) or not isinstance(dim, int) or dim <= 0:
        raise EmbedStoreError("manifest-dim-invalid")
    counts = manifest.get("counts")
    vectors = counts.get("vectors") if isinstance(counts, dict) else None
    if isinstance(vectors, bool) or not isinstance(vectors, int) or vectors < 0:
        raise EmbedStoreError("manifest-counts-invalid")


def load_manifest(path):
    """Load + validate the manifest. Missing or malformed -> EmbedStoreError
    (consumers must not silently fall back to a receipt-less store)."""
    if not os.path.exists(path):
        raise EmbedStoreError("manifest-missing:%s" % path)
    try:
        with open(path, "r", encoding="utf-8") as f:
            manifest = json.load(f)
    except (OSError, json.JSONDecodeError) as exc:
        raise EmbedStoreError("manifest-malformed:%s" % path) from exc
    validate_manifest(manifest)
    return manifest


def write_manifest(path, manifest):
    validate_manifest(manifest)
    atomic_write(path, json.dumps(manifest, ensure_ascii=False,
                                  indent=2, sort_keys=True) + "\n")


def verify(root):
    """Full integrity check of the store pair under root. Raises
    EmbedStoreError on any violation; returns a summary dict."""
    apath, mpath = artifact_path(root), manifest_path(root)
    manifest = load_manifest(mpath)
    store = load_artifact(apath)
    if not store:
        raise EmbedStoreError("artifact-empty:%s" % apath)
    for key, rec in store.items():
        validate_record(key, rec)
        if rec["model"] != manifest["model"]:
            raise EmbedStoreError(
                "model-mismatch:%s:%s!=%s" % (key, rec["model"],
                                              manifest["model"]))
        if rec["dim"] != manifest["dim"]:
            raise EmbedStoreError(
                "dim-mismatch:%s:%d!=%d" % (key, rec["dim"], manifest["dim"]))
    if len(store) != manifest["counts"]["vectors"]:
        raise EmbedStoreError(
            "count-mismatch:%d!=%d" % (len(store),
                                       manifest["counts"]["vectors"]))
    return {"vectors": len(store), "model": manifest["model"],
            "dim": manifest["dim"], "receipt_id": manifest["receipt_id"],
            "artifact": apath, "manifest": mpath,
            "schema_version": manifest["schema_version"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    vp = sub.add_parser("verify", help="verify artifact + manifest integrity")
    vp.add_argument("--root", default=os.getcwd(),
                    help="repo root holding .codebase-memory/ (default: cwd)")
    args = parser.parse_args()
    if args.command == "verify":
        try:
            summary = verify(args.root)
        except EmbedStoreError as exc:
            eprint(json.dumps({"ok": False, "error": str(exc)}))
            return 1
        summary["ok"] = True
        print(json.dumps(summary, ensure_ascii=False, sort_keys=True))
        return 0
    return 2


if __name__ == "__main__":
    sys.exit(main())
