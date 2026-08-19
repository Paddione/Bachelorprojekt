#!/usr/bin/env python3
"""Apply deterministic lifecycle metadata to a compiled Brain page."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

SOURCE_KINDS = {
    "openspec", "runbook", "adr", "gotcha", "agent-guide", "core-doc",
    "health-goal", "diagram", "github-reviewed",
}
LIFECYCLE_KEYS = (
    "source_kind", "source_revision", "observed_at", "valid_from",
    "valid_until", "superseded_by",
)


class MetadataError(ValueError):
    """A user-facing metadata validation error."""


def sha256_file(path: Path) -> str:
    try:
        return hashlib.sha256(path.read_bytes()).hexdigest()
    except OSError as exc:
        raise MetadataError(f"cannot read source: {path}") from exc


def parse_timestamp(value: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise MetadataError("timestamp must be a non-empty ISO-8601 value")
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise MetadataError(f"invalid ISO-8601 value: {value}") from exc
    if parsed.tzinfo is None:
        if "T" in normalized or " " in normalized:
            raise MetadataError(f"timestamp requires an explicit offset: {value}")
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def parse_frontmatter(markdown: str) -> tuple[list[str], str]:
    lines = markdown.splitlines(keepends=True)
    if not lines or lines[0].rstrip("\r\n") != "---":
        raise MetadataError("markdown has no leading frontmatter block")
    for index in range(1, len(lines)):
        if lines[index].rstrip("\r\n") == "---":
            return [line.rstrip("\r\n") for line in lines[1:index]], "".join(lines[index + 1 :])
    raise MetadataError("frontmatter block is not closed")


def apply_metadata(markdown: str, metadata: dict[str, str]) -> str:
    frontmatter, body = parse_frontmatter(markdown)
    filtered: list[str] = []
    insert_at: int | None = None
    for line in frontmatter:
        key = line.split(":", 1)[0].strip() if ":" in line else ""
        if key in LIFECYCLE_KEYS:
            continue
        filtered.append(line)
        if key == "status":
            insert_at = len(filtered)
    if insert_at is None:
        insert_at = len(filtered)
    lifecycle_lines = [
        f"{key}: {json.dumps(metadata[key], ensure_ascii=False)}"
        for key in LIFECYCLE_KEYS
        if key in metadata and metadata[key] != ""
    ]
    filtered[insert_at:insert_at] = lifecycle_lines
    closing_newline = "\n" if markdown.endswith("\n") else ""
    rendered_body = body
    if rendered_body.endswith("\n"):
        rendered_body = rendered_body[:-1]
    return "---\n" + "\n".join(filtered) + "\n---\n" + rendered_body + closing_newline


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True)
    parser.add_argument("--source-kind", required=True)
    parser.add_argument("--observed-at", required=True)
    parser.add_argument("--valid-from", required=True)
    parser.add_argument("--valid-until")
    parser.add_argument("--superseded-by")
    return parser


def run(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.source_kind not in SOURCE_KINDS:
            raise MetadataError(f"unsupported source kind: {args.source_kind}")
        observed_at = parse_timestamp(args.observed_at)
        valid_from = parse_timestamp(args.valid_from)
        if "T" not in args.observed_at:
            raise MetadataError("observed-at must include a time")
        valid_until = parse_timestamp(args.valid_until) if args.valid_until else None
        if valid_until is not None and valid_from >= valid_until:
            raise MetadataError("valid-from must be earlier than valid-until")
        source = Path(args.source)
        metadata = {
            "source_kind": args.source_kind,
            "source_revision": sha256_file(source),
            "observed_at": args.observed_at,
            "valid_from": args.valid_from,
        }
        if args.valid_until:
            metadata["valid_until"] = args.valid_until
        if args.superseded_by:
            metadata["superseded_by"] = args.superseded_by
        rendered = apply_metadata(sys.stdin.read(), metadata)
        sys.stdout.write(rendered)
        return 0
    except (MetadataError, OSError, UnicodeError) as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(run())
