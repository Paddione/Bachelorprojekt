#!/usr/bin/env python3
"""T900990: first full embedding run under the P0-min frozen corpus.

Builds docs/brain/embed-index.json: for each held-out route (see
docs/brain/embed-eval-report.md), ranks all distinct handled_by handler
files by cosine similarity of bge-m3 embeddings and stores the top-10.

Query text: route id + route file source (head-truncated). Rationale: a
real retrieval system embeds the route source that needs a handler; the
route files import their handlers by name (e.g. lib/auth,
lib/stripe-billing), which is the operative semantic signal. A bare id
string only matches path-similar files (run 4: 1/3 top-5).
Candidate text: handler repo path + file content (head-truncated).

Env: LLM_EMBED_URL (default http://localhost:8081), LLM_EMBED_MODEL (bge-m3).
"""
import hashlib
import json
import math
import os
import sys
import urllib.request
from datetime import datetime, timezone

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EMBED_URL = os.environ.get("LLM_EMBED_URL", "http://localhost:8081")
EMBED_MODEL = os.environ.get("LLM_EMBED_MODEL", "bge-m3")
TOP_N = 10
CONTENT_HEAD = 2500
BATCH = 2


def embed(texts):
    out = []
    for i in range(0, len(texts), BATCH):
        chunk = texts[i:i + BATCH]
        req = urllib.request.Request(
            f"{EMBED_URL}/v1/embeddings",
            data=json.dumps({"model": EMBED_MODEL, "input": chunk}).encode(),
            headers={"Content-Type": "application/json"},
        )
        last = None
        for attempt in range(4):
            try:
                with urllib.request.urlopen(req, timeout=300) as r:
                    d = json.load(r)
                break
            except Exception as e:  # 503 model-reload / transient disconnect
                last = e
                print(f"  retry {attempt + 1}/4 after {e!r}", flush=True)
                import time as _t
                _t.sleep(15)
        else:
            raise last
        vecs = [e["embedding"] for e in sorted(d["data"], key=lambda e: e["index"])]
        out.extend(vecs)
        print(f"  embedded {min(i + BATCH, len(texts))}/{len(texts)}", flush=True)
    return out


def cos(a, b):
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    return dot / (na * nb) if na and nb else 0.0


def main():
    corpus_path = os.path.join(REPO, "docs/brain/corpus-freeze.json")
    hb_path = os.path.join(REPO, "docs/brain/handled-by-map.json")
    out_path = os.path.join(REPO, "docs/brain/embed-index.json")
    corpus = json.load(open(corpus_path))
    hbmap = json.load(open(hb_path))
    corpus_sha_pre = hashlib.sha256(open(corpus_path, "rb").read()).hexdigest()
    routes = corpus["routes"] if isinstance(corpus, dict) else corpus
    print(f"routes={len(routes)} hbrows={len(hbmap)}")

    handlers = sorted({
        h
        for r in hbmap
        for h in (r.get("handled_by") if isinstance(r.get("handled_by"), list) else [r.get("handled_by")])
        if h
    })
    print(f"distinct handlers={len(handlers)}")
    cand_texts = []
    for h in handlers:
        p = os.path.join(REPO, h)
        try:
            with open(p, errors="replace") as f:
                body = f.read(CONTENT_HEAD)
        except FileNotFoundError:
            body = ""
            print(f"  WARN missing handler file: {h}")
        cand_texts.append(f"{h}\n{body}")

    print("embedding candidates...")
    import tempfile as _tf
    cache_key = hashlib.sha256(
        (corpus_sha_pre + "\x00" + str(CONTENT_HEAD) + "\x00" + "\n".join(handlers)).encode()
    ).hexdigest()[:16]
    cache_path = os.path.join(_tf.gettempdir(), f"p0min-candvecs-{cache_key}.json")
    cand_vecs = None
    if os.path.exists(cache_path):
        try:
            cached = json.load(open(cache_path))
            if len(cached) == len(cand_texts):
                cand_vecs = cached
                print(f"  reused {len(cand_vecs)} cached candidate vectors")
        except Exception as e:
            print(f"  cache unreadable, re-embedding ({e!r})")
    if cand_vecs is None:
        cand_vecs = embed(cand_texts)
        json.dump(cand_vecs, open(cache_path, "w"))
    assert len(cand_vecs[0]) == 1024, f"unexpected dims {len(cand_vecs[0])}"

    held_out_ids = [
        "auth/callback.ts:GET",
        "billing/create-invoice.ts:POST",
        "brett/bot.ts:POST",
    ]
    route_by_id = {}
    for r in routes:
        for prefix in ("components/website/src/pages/api/",):
            if prefix in r["path"]:
                rid = f"{r['path'].split(prefix)[-1]}:{r.get('verb', '')}"
                route_by_id.setdefault(rid, r)
        # fallback: bare suffix match, preferring the canonical
        # pages/api/<id> route over nested duplicates (e.g. admin/)
        for qpath in ("auth/callback.ts", "billing/create-invoice.ts", "brett/bot.ts"):
            if r["path"].endswith("pages/api/" + qpath):
                route_by_id[f"{qpath}:{r.get('verb', '')}"] = r
            elif r["path"].endswith(qpath):
                route_by_id.setdefault(f"{qpath}:{r.get('verb', '')}", r)
    q_texts = []
    for qid in held_out_ids:
        r = route_by_id.get(qid, {})
        qp = os.path.join(REPO, r.get("path", ""))
        try:
            with open(qp, errors="replace") as f:
                qbody = f.read(CONTENT_HEAD)
        except FileNotFoundError:
            qbody = ""
            print(f"  WARN missing route file: {qp}")
        q_texts.append(f"{qid}\n{qbody}")
    print("embedding queries...")
    q_vecs = embed(q_texts)

    held_out = {}
    for qid, qv in zip(held_out_ids, q_vecs):
        ranked = sorted(
            ((cos(qv, cv), h) for cv, h in zip(cand_vecs, handlers)),
            reverse=True,
        )
        held_out[qid] = [h for _, h in ranked[:TOP_N]]
        print(f"{qid}: rank1={held_out[qid][0]}")

    corpus_sha = hashlib.sha256(open(corpus_path, "rb").read()).hexdigest()
    index = {
        "model": EMBED_MODEL,
        "dims": len(cand_vecs[0]),
        "corpus": "docs/brain/corpus-freeze.json",
        "corpus_sha256": corpus_sha,
        "frozen_at_commit": corpus.get("frozen_at_commit"),
        "candidate_count": len(handlers),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "held_out": held_out,
    }
    with open(out_path, "w") as f:
        json.dump(index, f, indent=2)
        f.write("\n")
    print(f"wrote {out_path}")

    expected = {
        "auth/callback.ts:GET": "components/website/src/lib/auth.ts",
        "billing/create-invoice.ts:POST": "components/website/src/lib/stripe-billing.ts",
        "brett/bot.ts:POST": "components/website/src/lib/brett-bot.ts",
    }
    ok = True
    for qid, exp in expected.items():
        hits = held_out[qid][:5]
        status = "PASS" if exp in hits else "FAIL"
        if exp not in hits:
            ok = False
        print(f"[{status}] {qid} -> {exp} (rank={hits.index(exp) + 1 if exp in hits else '>5'})")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
