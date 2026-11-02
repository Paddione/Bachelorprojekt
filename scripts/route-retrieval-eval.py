#!/usr/bin/env python3
"""Evaluate route-to-handler retrieval against the frozen handled-by map.

The input text matches p0min-embed-run.py: route id + source and handler path
+ source, with 2500 source characters each. All source is read at the map's
frozen commit, so later checkout changes cannot move the benchmark.
"""

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path, PurePosixPath
import posixpath
import re
import subprocess
import sys

CONTENT_HEAD = 2500
API_PREFIX = "components/website/src/pages/api/"
LIB_PREFIX = "components/website/src/lib/"
IMPORT_RE = re.compile(
    r"(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)"
    r"['\"]([^'\"]+)['\"]"
)


def git(repo: Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(repo), *args], capture_output=True, check=False
    )
    if result.returncode:
        raise ValueError(f"git {' '.join(args[:2])} failed: {result.stderr.decode(errors='replace').strip()}")
    return result.stdout


def load_snapshot(repo: Path) -> dict:
    corpus_file = repo / "docs/brain/corpus-freeze.json"
    map_file = repo / "docs/brain/handled-by-map.json"
    corpus = json.loads(corpus_file.read_text())
    rows = json.loads(map_file.read_text())
    revision = corpus["frozen_at_commit"]
    if len(rows) != corpus["route_count"]:
        raise ValueError("handled-by map and corpus route counts differ")
    tracked = set(git(repo, "ls-tree", "-r", "--name-only", revision).decode().splitlines())
    body_cache: dict[str, str] = {}

    def body(path: str) -> str:
        if path not in tracked:
            raise ValueError(f"missing at frozen revision: {path}")
        if path not in body_cache:
            body_cache[path] = git(repo, "show", f"{revision}:{path}").decode(errors="replace")
        return body_cache[path]

    queries: dict[str, str] = {}
    qrels: dict[str, set[str]] = {}
    route_paths: dict[str, str] = {}
    for row in rows:
        qid, path = row["id"], row["path"]
        if not qid.startswith(f"repo@{revision}:") or not path.startswith(API_PREFIX):
            raise ValueError(f"route identity does not match frozen revision: {qid}")
        if qid in queries:
            raise ValueError(f"duplicate route id: {qid}")
        short_id = path.removeprefix(API_PREFIX) + ":" + row["verb"]
        queries[qid] = short_id + "\n" + body(path)[:CONTENT_HEAD]
        qrels[qid] = {path if target == "inline:self" else target for target in row["handled_by"]}
        route_paths[qid] = path
    handlers = sorted({path for relevant in qrels.values() for path in relevant})
    documents = {path: path + "\n" + body(path)[:CONTENT_HEAD] for path in handlers}
    return {
        "revision": revision,
        "corpus_sha256": hashlib.sha256(corpus_file.read_bytes()).hexdigest(),
        "map_sha256": hashlib.sha256(map_file.read_bytes()).hexdigest(),
        "queries": queries,
        "documents": documents,
        "qrels": qrels,
        "route_paths": route_paths,
        "body": body,
        "tracked": tracked,
    }


def rank_metrics(rankings: dict[str, list[str]], qrels: dict[str, set[str]]) -> dict:
    totals = defaultdict(float)
    for qid, relevant in qrels.items():
        top = rankings[qid][:10]
        dcg = sum(1 / math.log2(rank + 2) for rank, doc in enumerate(top) if doc in relevant)
        ideal = sum(1 / math.log2(rank + 2) for rank in range(min(len(relevant), 10)))
        totals["ndcg@10"] += dcg / ideal
        totals["recall@10"] += len(set(top) & relevant) / len(relevant)
        hit = next((rank + 1 for rank, doc in enumerate(top) if doc in relevant), None)
        totals["mrr@10"] += 1 / hit if hit else 0
    return {key: round(value / len(qrels), 6) for key, value in totals.items()}


def char_ngrams(text: str) -> Counter[str]:
    text = re.sub(r"\s\s+", " ", text.lower())
    return Counter(text[i:i + n] for n in (3, 4, 5) for i in range(len(text) - n + 1))


def lexical_rankings(queries: dict[str, str], documents: dict[str, str]) -> dict[str, list[str]]:
    items = list(queries.items()) + list(documents.items())
    counts = {key: char_ngrams(text) for key, text in items}
    frequencies = Counter(term for vector in counts.values() for term in vector)
    size = len(items)

    def weights(vector: Counter[str]) -> dict[str, float]:
        result = {
            term: (1 + math.log(tf)) * (1 + math.log((1 + size) / (1 + frequencies[term])))
            for term, tf in vector.items()
        }
        norm = math.sqrt(sum(value * value for value in result.values()))
        return {term: value / norm for term, value in result.items()} if norm else {}

    postings: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for doc in documents:
        for term, weight in weights(counts[doc]).items():
            postings[term].append((doc, weight))
    rankings = {}
    for qid in queries:
        scores = defaultdict(float)
        for term, query_weight in weights(counts[qid]).items():
            for doc, document_weight in postings.get(term, ()):
                scores[doc] += query_weight * document_weight
        rankings[qid] = sorted(documents, key=lambda doc: (-scores[doc], doc))
    return rankings


def resolve_import(source: str, spec: str, tracked: set[str]) -> str | None:
    if spec.startswith("$lib/"):
        stem = LIB_PREFIX + spec.removeprefix("$lib/")
    elif spec.startswith("."):
        stem = posixpath.normpath(str(PurePosixPath(source).parent / spec))
    else:
        return None
    candidates = [stem] + [stem + ext for ext in (".ts", ".tsx", ".js", ".mjs", "/index.ts", "/index.tsx")]
    return next((path for path in candidates if path in tracked), None)


def graph_rankings(snapshot: dict) -> dict[str, list[str]]:
    tracked, body = snapshot["tracked"], snapshot["body"]
    documents = snapshot["documents"]
    direct_cache: dict[str, set[str]] = {}

    def direct(path: str) -> set[str]:
        if path not in direct_cache:
            direct_cache[path] = {
                resolved
                for spec in IMPORT_RE.findall(body(path))
                if (resolved := resolve_import(path, spec, tracked))
            }
        return direct_cache[path]

    result = {}
    for qid, route in snapshot["route_paths"].items():
        first = direct(route)
        second = {target for source in first for target in direct(source)}
        result[qid] = sorted(
            documents,
            key=lambda doc: (-(2 if doc in first else 1 if doc in second else 0), doc),
        )
    return result


def dense_rankings(queries: dict[str, str], documents: dict[str, str], model_name: str, max_length: int) -> tuple[dict[str, list[str]], str]:
    from sentence_transformers import SentenceTransformer, __version__

    model = SentenceTransformer(model_name)
    model.max_seq_length = max_length
    qids, docids = list(queries), list(documents)
    qvec = model.encode(list(queries.values()), batch_size=4, normalize_embeddings=True, show_progress_bar=False)
    dvec = model.encode(list(documents.values()), batch_size=4, normalize_embeddings=True, show_progress_bar=False)
    similarity = qvec @ dvec.T
    return {
        qid: sorted(docids, key=lambda doc: (-float(similarity[index, docids.index(doc)]), doc))
        for index, qid in enumerate(qids)
    }, __version__


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=Path(__file__).resolve().parent.parent)
    parser.add_argument("--model", help="optional SentenceTransformer model or local path")
    parser.add_argument("--max-length", type=int, default=1024)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        snapshot = load_snapshot(args.repo)
        scores = {
            "char_tfidf_3_5": rank_metrics(
                lexical_rankings(snapshot["queries"], snapshot["documents"]), snapshot["qrels"]
            ),
            "static_imports_2_hops": rank_metrics(graph_rankings(snapshot), snapshot["qrels"]),
        }
        versions = {}
        if args.model:
            rankings, versions["sentence_transformers"] = dense_rankings(
                snapshot["queries"], snapshot["documents"], args.model, args.max_length
            )
            scores["dense"] = rank_metrics(rankings, snapshot["qrels"])
        report = {
            "schema_version": 1,
            "frozen_commit": snapshot["revision"],
            "corpus_sha256": snapshot["corpus_sha256"],
            "handled_by_sha256": snapshot["map_sha256"],
            "routes": len(snapshot["queries"]),
            "handlers": len(snapshot["documents"]),
            "content_head_chars": CONTENT_HEAD,
            "max_length_tokens": args.max_length if args.model else None,
            "model": args.model,
            "versions": versions,
            "scores": scores,
            "static_imports_caveat": "qrels derive from code relations; the static baseline is diagnostic, not independent evidence of generalization",
        }
        output = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
        if args.output:
            args.output.write_text(output)
        else:
            print(output, end="")
        return 0
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print(f"route-retrieval-eval: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
