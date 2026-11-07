#!/usr/bin/env bash
# scripts/lib/obs-file-evidence.sh — Log-/File-Evidenz fuer OBS01/CAP01/SLO01 ohne Prometheus.
# Eigner-Entscheid: kein Prometheus auf devmesh; Messbasis sind Dateien statt Queries.
# Die Messfunktionen in scripts/lib/runtime-health-measure.py nehmen die Dateien
# per --input (Env: HG_SCRAPE_INPUT / HG_CAPACITY_INPUT / HG_SLO_INPUT, siehe
# scripts/lib/health-goals-measure.sh) — dieses Skript erzeugt sie.
#
#   scrape --targets <json> --out <json>   Targets proben -> Prometheus-Vektor-JSON
#   capacity --out <json> [--context CTX]  PVC-Snapshot -> Vektor-Zeilen (Ratio)
#   slo-append --log <jsonl> [--targets <json>]  Brand-Proben anhaengen
#   slo-window --log <jsonl> --out <json> [--days N] [--min-samples N] [--min-days N]
#     7d-Fenster (Default) aggregieren; zu wenig Historie -> Exit 2 (Messung: n/a).
#     Default: >= 7 Proben aus >= 6 Tagen (Tages-Kadenz des health-goals-Laufs).
#
# Exit: 0 = Evidenz geschrieben, 1 = Bedien-/Voraussetzungsfehler, 2 = zu wenig
# Historie (slo-window) bzw. leere Basis (scrape/capacity) — fail-closed.
set -euo pipefail

usage() {
  sed -n '2,/^#$/p' "$0" | sed 's/^# \{0,1\}//'
  exit 1
}

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "obs-file-evidence: $1 fehlt" >&2; exit 1; }
}

cmd_scrape() {
  need_cmd curl; need_cmd python3
  local targets="" out=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --targets) targets="$2"; shift 2 ;;
      --out) out="$2"; shift 2 ;;
      *) usage ;;
    esac
  done
  [[ -n "$targets" && -n "$out" ]] || usage
  [[ -f "$targets" ]] || { echo "obs-file-evidence: targets-Datei fehlt: $targets" >&2; exit 1; }
  local ts
  ts=$(date +%s)
  python3 - "$targets" "$out" "$ts" <<'PY'
import json, subprocess, sys, urllib.request
targets_file, out_file, ts = sys.argv[1], sys.argv[2], int(sys.argv[3])
try:
    with open(targets_file, encoding="utf-8") as fh:
        spec = json.load(fh)
except (OSError, ValueError) as exc:
    print(f"obs-file-evidence: targets unlesbar: {exc}", file=sys.stderr)
    sys.exit(1)
targets = spec.get("targets")
if not isinstance(targets, list) or not targets:
    print("obs-file-evidence: keine targets definiert", file=sys.stderr)
    sys.exit(1)
rows = []
for entry in targets:
    if not isinstance(entry, dict) or not entry.get("url"):
        print("obs-file-evidence: target ohne url uebersprungen", file=sys.stderr)
        continue
    url = entry["url"]
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "obs-file-evidence/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            up = 200 <= resp.status < 400
    except Exception:
        up = False
    metric = {"job": str(entry.get("job", "file-probe"))}
    for label in ("brand", "instance"):
        if entry.get(label) is not None:
            metric[label] = str(entry[label])
    rows.append({"metric": metric, "value": [ts, "1" if up else "0"]})
if not rows:
    print("obs-file-evidence: leere Scrape-Basis", file=sys.stderr)
    sys.exit(2)
with open(out_file, "w", encoding="utf-8") as fh:
    json.dump({"status": "success", "data": {"resultType": "vector", "result": rows}}, fh)
print(f"obs-file-evidence: {len(rows)} targets -> {out_file}")
PY
}

cmd_capacity() {
  need_cmd kubectl; need_cmd python3
  local out="" context="${HG_OPS_CTX:-devmesh}"
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --out) out="$2"; shift 2 ;;
      --context) context="$2"; shift 2 ;;
      *) usage ;;
    esac
  done
  [[ -n "$out" ]] || usage
  local nodes node summary
  if ! nodes=$(kubectl --context "$context" get nodes -o jsonpath='{range .items[*]}{.metadata.name}{"\n"}{end}' 2>/dev/null) \
    || [[ -z "$nodes" ]]; then
    echo "obs-file-evidence: kein Cluster-Zugriff (context $context)" >&2
    exit 1
  fi
  # Kubelet Summary API pro Node: pods[].volume[] mit pvcRef + capacity/availableBytes.
  # Entspricht der Prometheus-Basis (kubelet_volume_stats_*), als Datei-Snapshot.
  local blobs=()
  while IFS= read -r node; do
    [[ -n "$node" ]] || continue
    if summary=$(kubectl --context "$context" get --raw "/api/v1/nodes/${node}/proxy/stats/summary" 2>/dev/null); then
      blobs+=("$summary")
    else
      echo "obs-file-evidence: Warnung: kein stats/summary von Node $node" >&2
    fi
  done <<< "$nodes"
  [[ "${#blobs[@]}" -gt 0 ]] || { echo "obs-file-evidence: keine Node-Stats lesbar" >&2; exit 1; }
  local ts
  ts=$(date +%s)
  printf '%s\n' "${blobs[@]}" > "$(dirname "$out")/.capacity-blobs.$$.tmp"
  TS="$ts" python3 - "$out" "$(dirname "$out")/.capacity-blobs.$$.tmp" <<'PY'
import json, os, sys
out_file, blobs_file = sys.argv[1], sys.argv[2]
ts = int(os.environ["TS"])
volumes = {}
with open(blobs_file, encoding="utf-8") as fh:
    for line in fh:
        line = line.strip()
        if not line:
            continue
        try:
            summary = json.loads(line)
        except ValueError:
            continue
        for pod in summary.get("pods", []):
            ns = ((pod.get("podRef") or {}).get("namespace")) or ""
            for volume in pod.get("volume", []):
                ref = volume.get("pvcRef") or {}
                claim = ref.get("claim") or ""
                if not claim:
                    continue
                key = (ns, claim)
                try:
                    available = int(volume.get("availableBytes", 0))
                    capacity = int(volume.get("capacityBytes", 0))
                except (TypeError, ValueError):
                    continue
                if capacity > 0:
                    prev = volumes.get(key)
                    # groesste Kapazitaet gewinnt (ein PVC, ein Mount)
                    if prev is None or capacity > prev[1]:
                        volumes[key] = (available, capacity)
import os as _os
_os.unlink(blobs_file)
rows = [{"metric": {"namespace": ns, "persistentvolumeclaim": claim},
         "value": [ts, f"{avail / cap:.6f}"]}
        for (ns, claim), (avail, cap) in sorted(volumes.items())]
if not rows:
    print("obs-file-evidence: leere PVC-Basis (keine PVC-Volumes gemeldet)", file=sys.stderr)
    sys.exit(2)
with open(out_file, "w", encoding="utf-8") as fh:
    json.dump({"status": "success", "data": {"resultType": "vector", "result": rows}}, fh)
print(f"obs-file-evidence: {len(rows)} PVC-Zeilen -> {out_file}")
PY
}

cmd_slo_append() {
  need_cmd curl; need_cmd python3
  local log="" targets=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --log) log="$2"; shift 2 ;;
      --targets) targets="$2"; shift 2 ;;
      *) usage ;;
    esac
  done
  [[ -n "$log" ]] || usage
  if [[ -z "$targets" ]]; then
    targets="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/obs-targets.json"
  fi
  [[ -f "$targets" ]] || { echo "obs-file-evidence: targets-Datei fehlt: $targets" >&2; exit 1; }
  TS="$(date +%s)" python3 - "$targets" "$log" <<'PY'
import json, os, sys, urllib.request
targets_file, log_file = sys.argv[1], sys.argv[2]
ts = int(os.environ["TS"])
with open(targets_file, encoding="utf-8") as fh:
    spec = json.load(fh)
entries = [e for e in spec.get("targets", []) if isinstance(e, dict) and e.get("brand") and e.get("url")]
if not entries:
    print("obs-file-evidence: keine Brand-Targets definiert", file=sys.stderr)
    sys.exit(1)
lines = []
for entry in entries:
    try:
        req = urllib.request.Request(entry["url"], headers={"User-Agent": "obs-file-evidence/1.0"})
        with urllib.request.urlopen(req, timeout=15) as resp:
            ok = 200 <= resp.status < 400
    except Exception:
        ok = False
    lines.append(json.dumps({"ts": ts, "brand": str(entry["brand"]), "ok": 1 if ok else 0}))
with open(log_file, "a", encoding="utf-8") as fh:
    for line in lines:
        fh.write(line + "\n")
print(f"obs-file-evidence: {len(lines)} Proben -> {log_file}")
PY
}

cmd_slo_window() {
  need_cmd python3
  # Tages-Kadenz (health-goals Messzyklus): 7 Proben aus >= 6 Tagen als Bootstrap-Basis.
  # Bei hoeherer Probe-Kadenz --min-samples entsprechend erhoehen (Prometheus-Nota:
  # 1900 Samples/7d bei 5m-Kadenz). Doku der Schwelle steht in der Fehlermeldung.
  local log="" out="" days=7 min_samples=7 min_days=6
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --log) log="$2"; shift 2 ;;
      --out) out="$2"; shift 2 ;;
      --days) days="$2"; shift 2 ;;
      --min-samples) min_samples="$2"; shift 2 ;;
      --min-days) min_days="$2"; shift 2 ;;
      *) usage ;;
    esac
  done
  [[ -n "$log" && -n "$out" ]] || usage
  [[ -f "$log" ]] || { echo "obs-file-evidence: Log fehlt: $log (noch keine Historie)" >&2; exit 2; }
  DAYS="$days" MIN_SAMPLES="$min_samples" MIN_DAYS="$min_days" python3 - "$log" "$out" <<'PY'
import datetime
import json, os, sys, time
log_file, out_file = sys.argv[1], sys.argv[2]
days = int(os.environ["DAYS"])
min_samples, min_days = int(os.environ["MIN_SAMPLES"]), int(os.environ["MIN_DAYS"])
cutoff = int(time.time()) - days * 86400
hits, total, covered_days = {}, {}, {}
try:
    with open(log_file, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
            except ValueError:
                continue
            if not isinstance(rec, dict) or rec.get("ts", 0) < cutoff:
                continue
            brand = str(rec.get("brand", ""))
            ok = rec.get("ok")
            if brand not in ("korczewski",):
                continue
            total[brand] = total.get(brand, 0) + 1
            hits[brand] = hits.get(brand, 0) + (1 if ok == 1 else 0)
            day = datetime.datetime.fromtimestamp(rec["ts"], datetime.timezone.utc).date().isoformat()
            covered_days.setdefault(brand, set()).add(day)
except OSError as exc:
    print(f"obs-file-evidence: Log unlesbar: {exc}", file=sys.stderr)
    sys.exit(1)
if not total or min(total.values()) < min_samples or min(len(d) for d in covered_days.values()) < min_days:
    span = {b: len(covered_days.get(b, ())) for b in total}
    print(f"obs-file-evidence: zu wenig Historie (n={total}, Tage={span}, "
          f"min {min_samples}/Brand an >= {min_days} Tagen)", file=sys.stderr)
    sys.exit(2)
now = int(time.time())
rows = [{"metric": {"brand": brand}, "value": [now, f"{hits[brand] / total[brand]:.6f}"]}
        for brand in sorted(total)]
with open(out_file, "w", encoding="utf-8") as fh:
    json.dump({"status": "success", "data": {"resultType": "vector", "result": rows}}, fh)
print(f"obs-file-evidence: {total} -> {out_file}")
PY
}

cmd="${1:-}"
shift || true
case "$cmd" in
  scrape) cmd_scrape "$@" ;;
  capacity) cmd_capacity "$@" ;;
  slo-append) cmd_slo_append "$@" ;;
  slo-window) cmd_slo_window "$@" ;;
  *) usage ;;
esac
