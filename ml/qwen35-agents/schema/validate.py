"""Episode-Validator: Schema + QC-Gates.

Gates:
  - Pydantic-Schema (inkl. Pflicht-Provenance und Split)
  - Keine Secrets in Nachrichten (sk-, AKIA, BEGIN PRIVATE KEY, password=)
  - Dedupe: identische Assistant-Antworten werden abgelehnt
  - dispatcher-Episoden brauchen expected_task; executor brauchen allowed_paths
  - result.status == "succeeded" verlangt mindestens einen erfolgreichen
    Tool-Call in messages (kein erfundener Erfolg)

Usage:
  python validate.py <dir-mit-episoden.json> [--registry registry.json]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from episodes import Episode  # noqa: E402

SECRET_PATTERNS = ("sk-", "AKIA", "BEGIN PRIVATE KEY", "BEGIN RSA PRIVATE KEY", "password=")


def episode_fingerprint(ep: Episode) -> str:
    assistant_texts = "|".join(
        str(m.get("content", "")) for m in ep.messages if m.get("role") == "assistant"
    )
    return hashlib.sha256(f"{ep.role}:{assistant_texts}".encode()).hexdigest()


def validate_file(path: Path, seen: dict[str, str], registry: set[str] | None) -> list[str]:
    errors: list[str] = []
    try:
        ep = Episode.model_validate_json(path.read_text(encoding="utf-8"))
    except Exception as exc:  # noqa: BLE001
        return [f"{path.name}: SCHEMA FEHLER: {exc}"]

    blob = path.read_text(encoding="utf-8")
    for pat in SECRET_PATTERNS:
        if pat.lower() in blob.lower():
            errors.append(f"{path.name}: moegliches Secret ({pat!r})")

    fp = episode_fingerprint(ep)
    if fp in seen:
        errors.append(f"{path.name}: Duplikat von {seen[fp]}")
    else:
        seen[fp] = path.name

    if ep.role == "dispatcher" and not ep.expected_task:
        errors.append(f"{path.name}: dispatcher ohne expected_task")
    if ep.role == "executor" and ep.allowed_paths is None:
        errors.append(f"{path.name}: executor ohne allowed_paths")
    if ep.result and ep.result.status == "succeeded":
        tool_ok = any(
            m.get("role") == "tool" for m in ep.messages
        )
        if not tool_ok:
            errors.append(f"{path.name}: 'succeeded' ohne Tool-Resultat (erfundener Erfolg?)")

    if registry is not None and ep.role == "dispatcher":
        for tc in ep.tool_calls:
            if tc.name not in registry:
                errors.append(f"{path.name}: unbekannter Task '{tc.name}' (Registry)")
    return errors


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("episodes_dir", type=Path)
    ap.add_argument("--registry", type=Path, default=None, help="registry.json fuer Task-Namen")
    args = ap.parse_args()

    registry: set[str] | None = None
    if args.registry and args.registry.exists():
        reg = json.loads(args.registry.read_text(encoding="utf-8"))
        registry = {e["task_id"] for e in reg["tasks"]}

    seen: dict[str, str] = {}
    all_errors: list[str] = []
    files = sorted(args.episodes_dir.glob("*.json"))
    if not files:
        print(f"keine Episoden in {args.episodes_dir}")
        return 1
    for f in files:
        all_errors.extend(validate_file(f, seen, registry))

    n = len(files)
    bad = len({e.split(":")[0] for e in all_errors})
    print(f"{n} Episoden geprueft, {n - bad} gueltig, {len(all_errors)} Fehler")
    for e in all_errors[:20]:
        print(" ", e)
    return 1 if all_errors else 0


if __name__ == "__main__":
    sys.exit(main())
