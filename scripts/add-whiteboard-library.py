#!/usr/bin/env python3
import json, base64, uuid, time, os, sys

WHITEBOARD = 'website/public/systembrett/systembrett.whiteboard'
ASSETS_DIR = 'website/public/brand/korczewski/kore-assets'

ASSETS = [
    ('logo-mark.svg',             'Kore Logo Mark',        128,  128, 'image/svg+xml'),
    ('portrait-placeholder.svg',  'Portrait Platzhalter',  200,  250, 'image/svg+xml'),
    ('k8s-wheel.svg',             'K8s Wheel',              64,   64, 'image/svg+xml'),
    ('topology-3node.svg',        'Topology 3-Node',       320,  200, 'image/svg+xml'),
    ('topology-12node.svg',       'Topology 12-Node',      640,  410, 'image/svg+xml'),
    ('portrait.jpg',              'Portrait Foto',         200,  250, 'image/jpeg'),
]

with open(WHITEBOARD) as f:
    data = json.load(f)

ts = 1746921600000  # fixed timestamp for deterministic output

for filename, name, w, h, mime in ASSETS:
    path = os.path.join(ASSETS_DIR, filename)
    if not os.path.exists(path):
        print(f'skip (not found): {filename}')
        continue
    with open(path, 'rb') as f:
        raw = f.read()
    b64 = base64.b64encode(raw).decode()
    data_url = f'data:{mime};base64,{b64}'

    # deterministic IDs based on filename (idempotent re-runs)
    seed = int.from_bytes(filename.encode(), 'little') % (2**31)
    file_id  = f'{seed:016x}'[:16]
    elem_id  = f'{seed+1:016x}'[:16]
    item_id  = f'{seed+2:016x}'[:16]

    # skip if already present
    if any(it.get('name') == name for it in data.get('libraryItems', [])):
        print(f'skip (already present): {name}')
        continue

    data.setdefault('files', {})[file_id] = {
        'mimeType': mime,
        'id': file_id,
        'dataURL': data_url,
        'created': ts,
    }

    data.setdefault('libraryItems', []).append({
        'id': item_id,
        'status': 'published',
        'name': name,
        'elements': [{
            'type': 'image',
            'id': elem_id,
            'x': 0, 'y': 0,
            'width': w, 'height': h,
            'fileId': file_id,
            'status': 'saved',
            'angle': 0,
            'strokeColor': 'transparent',
            'backgroundColor': 'transparent',
            'fillStyle': 'solid',
            'strokeWidth': 1,
            'strokeStyle': 'solid',
            'roughness': 0,
            'opacity': 100,
            'groupIds': [],
            'frameId': None,
            'roundness': None,
            'seed': seed,
            'version': 1,
            'versionNonce': seed + 1,
            'updated': ts,
            'locked': False,
            'link': None,
            'customData': None,
            'isDeleted': False,
            'scale': [1, 1],
        }],
    })
    print(f'added: {name}')

with open(WHITEBOARD, 'w') as f:
    json.dump(data, f, separators=(',', ':'))

print('done')
