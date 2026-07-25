#!/usr/bin/env bash
# website-config-sha.sh — Content-Hash der website-config-ConfigMap [T002156]
#
# Liest ein GERENDERTES (envsubst'd) Website-Manifest von stdin und gibt einen
# 16-stelligen Hash ueber den `data`-Block der `website-config`-ConfigMap aus.
# Der Wert wird als Pod-Template-Annotation `checksum/config` gesetzt und sorgt
# dafuer, dass eine Config-Aenderung tatsaechlich einen Rollout ausloest:
# `website-config` haengt per `envFrom` am Container, und envFrom-Werte werden
# beim Containerstart eingefroren — ein ConfigMap-Update allein erreicht
# laufende Pods nie (anders als ein gemountetes ConfigMap-Volume).
#
# WARUM NUR DER data-BLOCK (T002156):
# T002154 hashte das gesamte gerenderte Manifest. Das enthaelt den Image-Tag,
# der sich je Render-Pfad unterscheidet — die drei Pfade (Flux-Renderer,
# Taskfile, build-website.yml) haetten fuer dieselbe Config verschiedene Hashes
# berechnet und sich gegenseitig ueberschrieben, was bei jedem Reconcile einen
# unnoetigen Rollout ausgeloest haette. Ueber den data-Block ist der Hash
# pfadunabhaengig: gleiche Config => gleicher Hash, egal wer rendert.
#
# WARUM NACH envsubst:
# Der Hash muss ueber die eingesetzten WERTE laufen. Ein Kustomize-
# configMapGenerator-Suffix-Hash waere wirkungslos, weil Kustomize im Pfad
# `kustomize build | envsubst` nur den unsubstituierten Platzhalter sieht.
#
# Verwendung:
#   WEBSITE_CONFIG_SHA="$(bash scripts/website-config-sha.sh < rendered.yaml)"
set -euo pipefail

python3 -c '
import sys, yaml, hashlib, json

data = None
for doc in yaml.safe_load_all(sys.stdin):
    if not doc:
        continue
    if doc.get("kind") == "ConfigMap" and (doc.get("metadata") or {}).get("name") == "website-config":
        data = doc.get("data") or {}
        break

if data is None:
    sys.stderr.write(
        "ERROR: no ConfigMap named website-config found in the rendered manifest.\n"
        "       website-config-sha.sh expects a rendered website manifest on stdin.\n"
    )
    sys.exit(1)

# sort_keys => stabil unabhaengig von der YAML-Schluesselreihenfolge
payload = json.dumps(data, sort_keys=True, ensure_ascii=False)
print(hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16])
'
