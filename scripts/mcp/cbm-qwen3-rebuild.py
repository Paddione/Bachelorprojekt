#!/usr/bin/env python3
"""Qwen3-Embedding-0.6B dense rebuild for the home code-graph projects.

Builds the `qwen3-graph-embedding/1` generations consumed by
`search_embedding_graph` (dense/hybrid): snapshot the live graph DB, write
the symbol corpus, embed it on GPU, validate norms/coverage, publish the
manifest the daemon validates (model/revision/pooling snapshot hashes).

Batch size 8 fits next to llama-server on the 3060 Ti. Run with
CUDA_VISIBLE_DEVICES=<3060Ti-UUID> and a torch-cu130 python, e.g. the
unsloth venv. Checkpoints per project (.partial.jsonl) so a killed run
resumes instead of restarting.

Usage:
  cbm-qwen3-rebuild.py --prepare [project ...]   # snapshot DBs + corpora (CPU only)
  cbm-qwen3-rebuild.py --run [project ...]       # GPU-embed prepared corpora, small-first
  cbm-qwen3-rebuild.py --status                  # candidate counts per project (CPU only)
"""
import collections
import hashlib
import json
import os
import pathlib
import sqlite3
import sys
import time

BASE = pathlib.Path('/home/patrick/.cache/codebase-memory-mcp')
OUT = BASE / 'qwen3-embeddings'
MODEL = 'Qwen/Qwen3-Embedding-0.6B'
REV = '97b0c614be4d77ee51c0cef4e5f07c00f9eb65b3'
SNAP = pathlib.Path(
    '/home/patrick/.cache/huggingface/hub/models--Qwen--Qwen3-Embedding-0.6B/snapshots') / REV
LABELS = ('Function', 'Method', 'Class', 'Interface', 'Section', 'Route')

PROJECTS = [
    'home-patrick-mcp-servers-task-runner',
    'home-patrick-dotfiles',
    'home-patrick-news-agent',
    'home-patrick-unsloth-boxes',
    'home-patrick-agentic-resources',
    'home-patrick',
    'home-patrick-Bachelorprojekt',
    'home-patrick-opt-llama.cpp-src',
]
BATCH = 8
QUERY_INSTRUCTION = ('Given a code search query, retrieve relevant repository '
                     'symbols and documentation sections')


def write_json(p, obj):
    t = p.with_suffix(p.suffix + '.tmp')
    t.write_text(json.dumps(obj, ensure_ascii=False, indent=2) + '\n')
    os.replace(t, p)


def status():
    for project in PROJECTS:
        manifest_path = OUT / project / 'embed-manifest.json'
        try:
            manifest = json.loads(manifest_path.read_text())
            print(f"{project}: status={manifest.get('status')} "
                  f"candidates={manifest.get('candidate_count')} "
                  f"embedded={manifest.get('embedded_count')} "
                  f"graph_indexed_at={str((manifest.get('graph') or {}).get('indexed_at'))}")
        except OSError:
            print(f"{project}: NO MANIFEST")


def prepare():
    for project in PROJECTS:
        dest = OUT / project
        dest.mkdir(exist_ok=True)
        source = sqlite3.connect(f'file:{BASE}/{project}.db?mode=ro', uri=True)
        target = sqlite3.connect(dest / 'graph-snapshot.db')
        source.backup(target)
        source.close()
        target.row_factory = sqlite3.Row
        meta = dict(target.execute(
            'select * from projects where name=?', (project,)).fetchone())
        rows = target.execute(
            'select * from nodes where project=? and label in (?,?,?,?,?,?) '
            'order by file_path,qualified_name', (project, *LABELS)).fetchall()
        candidates = []
        counts = collections.Counter()
        for row in rows:
            r = dict(row)
            if (not r['file_path'] and r['label'] != 'Route') or not r['qualified_name']:
                continue
            p = json.loads(r['properties'])
            symbol = r['qualified_name']
            text = '\n'.join(str(v) for v in [
                r['label'], r['file_path'], symbol, p.get('signature', ''),
                p.get('base_classes', ''), p.get('docstring', ''),
                json.dumps(p, sort_keys=True) if r['label'] == 'Route' else '']
                if v)[:1500]
            key = f"{project}@{meta['indexed_at']}:{r['file_path']}:{symbol}"
            candidates.append({
                'key': key, 'node_id': r['id'], 'path': r['file_path'],
                'symbol': symbol, 'kind': r['label'],
                'start_line': r['start_line'], 'end_line': r['end_line'],
                'text': text,
                'hash': hashlib.sha256(
                    (MODEL + '@' + REV + '\n' + text).encode()).hexdigest()})
            counts[r['label']] += 1
        target.close()
        corpus = '\n'.join(
            json.dumps(c, sort_keys=True, ensure_ascii=False) for c in candidates) + '\n'
        (dest / 'corpus.jsonl').write_text(corpus)
        manifest = {
            'schema': 'qwen3-graph-embedding/1', 'status': 'prepared',
            'project': project, 'graph': meta,
            'snapshot_sha256': hashlib.sha256(
                (dest / 'graph-snapshot.db').read_bytes()).hexdigest(),
            'model': MODEL, 'revision': REV, 'dtype': 'bfloat16', 'dim': 1024,
            'pooling': 'last_token', 'normalize': True, 'max_tokens': 1024,
            'text_max_characters': 1500,
            'query_instruction': QUERY_INSTRUCTION,
            'candidate_count': len(candidates), 'kinds': dict(counts),
            'corpus_sha256': hashlib.sha256(corpus.encode()).hexdigest(),
            'scope': 'all indexed Function, Method, Class, Interface, Section '
                     'and Route nodes with source identity',
            'coverage_limit': 'existing graph exclusions and parse gaps remain; '
                              'vectors bind frozen graph, not live source freshness'}
        write_json(dest / 'embed-manifest.json', manifest)
        print('PREPARED', project, len(candidates), dict(counts), flush=True)


def run():
    import torch
    from transformers import AutoTokenizer, AutoModel
    import numpy as np
    torch.set_num_threads(8)
    print('GPU', torch.cuda.get_device_name(0), flush=True)
    tok = AutoTokenizer.from_pretrained(SNAP, padding_side='left', local_files_only=True)
    model = AutoModel.from_pretrained(
        SNAP, torch_dtype=torch.bfloat16,
        attn_implementation='sdpa', local_files_only=True).to('cuda').eval()

    def embed(texts):
        inp = tok(texts, padding=True, truncation=True, max_length=1024,
                  return_tensors='pt').to('cuda')
        with torch.inference_mode():
            v = model(**inp).last_hidden_state[:, -1].float()
            v = torch.nn.functional.normalize(v, p=2, dim=1)
        return v.cpu().numpy()

    smoke = ['The capital of China is Beijing.', 'Gravity attracts objects with mass.']
    query = ('Instruct: Given a web search query, retrieve relevant passages '
             'that answer the query\nQuery:What is the capital of China?')
    scores = (embed([query]) @ embed(smoke).T)[0].tolist()
    if not scores[0] > scores[1]:
        raise RuntimeError('semantic smoke test failed')
    print('SMOKE', scores, flush=True)

    for project in PROJECTS:
        dest = OUT / project
        manifest = json.loads((dest / 'embed-manifest.json').read_text())
        if manifest.get('status') != 'prepared':
            print('SKIP (not prepared):', project, manifest.get('status'), flush=True)
            continue
        candidates = [json.loads(x) for x in (dest / 'corpus.jsonl').read_text().splitlines()]
        artifact = dest / 'embed-index.partial.jsonl'
        done = {}
        if artifact.exists():
            for line in artifact.read_text().splitlines():
                r = json.loads(line)
                done[r['key']] = r['hash']
        todo = [c for c in candidates if done.get(c['key']) != c['hash']]
        todo.sort(key=lambda c: len(c['text']))
        start = time.monotonic()
        completed = len(candidates) - len(todo)
        with artifact.open('a') as f:
            for i in range(0, len(todo), BATCH):
                batch = todo[i:i + BATCH]
                try:
                    vs = embed([c['text'] for c in batch])
                except torch.cuda.OutOfMemoryError:
                    torch.cuda.empty_cache()
                    vs = np.concatenate([embed([c['text']]) for c in batch])
                if vs.shape != (len(batch), 1024) or not np.isfinite(vs).all():
                    raise RuntimeError('invalid vectors')
                for c, v in zip(batch, vs):
                    r = {k: c[k] for k in ('key', 'hash', 'node_id', 'path',
                                           'symbol', 'kind', 'start_line', 'end_line')}
                    r.update(model=MODEL, dim=1024, vector=v.tolist())
                    f.write(json.dumps(r, separators=(',', ':')) + '\n')
                f.flush()
                completed += len(batch)
                if i % 320 == 0 or completed == len(candidates):
                    elapsed = time.monotonic() - start
                    print('PROGRESS', project, completed, len(candidates),
                          round(elapsed, 1), flush=True)
        count, keys, norm_min, norm_max = 0, set(), 2., 0.
        with artifact.open() as f:
            for line in f:
                r = json.loads(line)
                v = np.asarray(r['vector'])
                norm = float(np.linalg.norm(v))
                if (r['key'] in keys or v.shape != (1024,)
                        or not np.isfinite(v).all() or abs(norm - 1) > 0.001):
                    raise RuntimeError('artifact validation failed')
                keys.add(r['key'])
                count += 1
                norm_min, norm_max = min(norm_min, norm), max(norm_max, norm)
        if keys != {c['key'] for c in candidates}:
            raise RuntimeError('coverage mismatch')
        os.replace(artifact, dest / 'embed-index.jsonl')
        manifest.update(status='complete', embedded_count=count,
                        elapsed_seconds=round(time.monotonic() - start, 2),
                        norm_range=[norm_min, norm_max], smoke_scores=scores,
                        peak_vram_mib=round(torch.cuda.max_memory_allocated() / 1024 ** 2),
                        completed_at=time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()))
        live = sqlite3.connect(f'file:{BASE}/{project}.db?mode=ro', uri=True)
        manifest['live_graph_indexed_at'] = live.execute(
            'select indexed_at from projects where name=?', (project,)).fetchone()[0]
        live.close()
        manifest['live_graph_generation_matches'] = (
            manifest['live_graph_indexed_at'] == manifest['graph']['indexed_at'])
        write_json(dest / 'embed-manifest.json', manifest)
        print('COMPLETE', project, count, manifest['elapsed_seconds'], flush=True)


if __name__ == '__main__':
    only = [a for a in sys.argv[1:] if not a.startswith('--')]
    if only:
        unknown = [p for p in only if p not in PROJECTS]
        if unknown:
            raise SystemExit(f'unknown projects: {unknown}')
        PROJECTS = only
    acted = False
    if '--prepare' in sys.argv:
        prepare()
        acted = True
    if '--status' in sys.argv:
        status()
        acted = True
    if '--run' in sys.argv:
        run()
        acted = True
    if not acted:
        print(__doc__)
