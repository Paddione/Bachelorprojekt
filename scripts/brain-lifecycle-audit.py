#!/usr/bin/env python3
"""Report-only audit of Brain provenance, validity intervals, and claim edges."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

REQUIRED_LIFECYCLE = ("source_kind", "source_revision", "observed_at", "valid_from")
CLAIM_RE = re.compile(r"^claim::\s*([^=]+?)\s*=\s*(.+?)\s*$")
SOURCE_RE = re.compile(r"^source::\s+Bachelorprojekt\s+(.+?)\s*$")


class AuditError(ValueError):
    """A structurally invalid page or CLI input."""


def parse_timestamp(value: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise AuditError("empty timestamp")
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise AuditError(f"invalid ISO-8601 value: {value}") from exc
    if parsed.tzinfo is None:
        if "T" in normalized or " " in normalized:
            raise AuditError(f"timestamp requires an explicit offset: {value}")
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _parse_scalar(value: str) -> Any:
    value = value.strip()
    if not value:
        return ""
    if value.startswith("["):
        if not value.endswith("]"):
            raise AuditError("unterminated flat list")
        inner = value[1:-1].strip()
        return [] if not inner else [_parse_scalar(item) for item in inner.split(",")]
    if value.startswith(("{", "|", ">", "&", "*")):
        raise AuditError("nested YAML is not supported")
    if len(value) >= 2 and value[0] == value[-1] == '"':
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError as exc:
            raise AuditError("invalid quoted scalar") from exc
        if not isinstance(parsed, str):
            raise AuditError("only string scalars are supported")
        return parsed
    return value.strip("'\"")


def _frontmatter(content: str) -> tuple[dict[str, Any], str]:
    lines = content.splitlines()
    if not lines or lines[0] != "---":
        raise AuditError("missing leading frontmatter")
    try:
        closing = next(index for index in range(1, len(lines)) if lines[index] == "---")
    except StopIteration as exc:
        raise AuditError("frontmatter is not closed") from exc
    metadata: dict[str, Any] = {}
    for line in lines[1:closing]:
        if line.startswith((" ", "\t")):
            raise AuditError("nested YAML is not supported")
        if not line.strip():
            continue
        if ":" not in line:
            raise AuditError(f"invalid frontmatter line: {line}")
        key, value = line.split(":", 1)
        key = key.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", key):
            raise AuditError(f"invalid frontmatter key: {key}")
        metadata[key] = _parse_scalar(value)
    return metadata, "\n".join(lines[closing + 1 :])


@dataclass(frozen=True)
class PageRecord:
    slug: str
    path: Path
    metadata: dict[str, Any]
    body: str
    valid_from: datetime | None
    valid_until: datetime | None
    claims: tuple[tuple[str, str], ...]
    source_path: str | None


def load_page(path: Path) -> PageRecord:
    try:
        metadata, body = _frontmatter(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeError) as exc:
        raise AuditError(f"cannot read {path}") from exc
    try:
        start = parse_timestamp(str(metadata["valid_from"])) if metadata.get("valid_from") else None
        end = parse_timestamp(str(metadata["valid_until"])) if metadata.get("valid_until") else None
        if metadata.get("observed_at"):
            parse_timestamp(str(metadata["observed_at"]))
    except AuditError as exc:
        raise AuditError(f"{path.name}: {exc}") from exc
    claims: list[tuple[str, str]] = []
    source_path: str | None = None
    for line in body.splitlines():
        claim = CLAIM_RE.fullmatch(line)
        if claim and claim.group(1).strip() and claim.group(2).strip():
            claims.append((" ".join(claim.group(1).split()), " ".join(claim.group(2).split())))
        source = SOURCE_RE.fullmatch(line)
        if source:
            source_path = source.group(1).strip()
    return PageRecord(path.stem, path, metadata, body, start, end, tuple(claims), source_path)


def interval_overlaps(a: PageRecord, b: PageRecord) -> bool:
    if a.valid_from is None or b.valid_from is None:
        return False
    a_end = a.valid_until or datetime.max.replace(tzinfo=timezone.utc)
    b_end = b.valid_until or datetime.max.replace(tzinfo=timezone.utc)
    return max(a.valid_from, b.valid_from) < min(a_end, b_end)


def _hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def collect_findings(pages: list[PageRecord], source_root: Path, as_of: datetime) -> list[dict]:
    findings: list[dict[str, Any]] = []
    slugs = {page.slug for page in pages}
    root = source_root.resolve()
    for page in pages:
        missing = [key for key in REQUIRED_LIFECYCLE if not page.metadata.get(key)]
        if missing:
            findings.append({"code": "metadata_unknown", "slug": page.slug, "missing": missing})
        if page.valid_from is not None and page.valid_until is not None and page.valid_until <= page.valid_from:
            findings.append({"code": "invalid_interval", "slug": page.slug,
                             "valid_from": page.metadata.get("valid_from"),
                             "valid_until": page.metadata.get("valid_until")})
        target = page.metadata.get("superseded_by")
        if target and target not in slugs:
            findings.append({"code": "missing_superseded_target", "slug": page.slug, "target": target})
        if page.source_path and page.metadata.get("source_kind") != "github-reviewed":
            candidate = (root / page.source_path).resolve()
            try:
                candidate.relative_to(root)
            except ValueError:
                findings.append({"code": "source_unavailable", "slug": page.slug,
                                 "source_path": page.source_path})
                continue
            if not candidate.is_file():
                findings.append({"code": "source_unavailable", "slug": page.slug,
                                 "source_path": page.source_path})
                continue
            current = _hash(candidate)
            recorded = str(page.metadata.get("source_revision", ""))
            if recorded and recorded != current:
                findings.append({"code": "stale_source", "slug": page.slug,
                                 "source_path": page.source_path,
                                 "recorded_revision": recorded, "current_revision": current})
    claims: dict[str, list[tuple[PageRecord, str]]] = {}
    for page in pages:
        for key, value in page.claims:
            claims.setdefault(key, []).append((page, value))
    for key, entries in claims.items():
        for left_index, (left, left_value) in enumerate(entries):
            for right, right_value in entries[left_index + 1 :]:
                if left_value == right_value or not interval_overlaps(left, right):
                    continue
                pair = sorted(((left.slug, left_value), (right.slug, right_value)))
                findings.append({"code": "conflicting_claim", "slug": pair[0][0],
                                 "value": pair[0][1], "other_slug": pair[1][0],
                                 "other_value": pair[1][1], "claim_key": key})
    findings.sort(key=lambda item: (
        str(item.get("code", "")), str(item.get("slug", "")),
        str(item.get("other_slug", "")), str(item.get("claim_key", "")),
    ))
    return findings


def _iso(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def build_report(pages: list[PageRecord], findings: list[dict], as_of: datetime) -> dict:
    counts: dict[str, int] = {}
    for finding in findings:
        counts[finding["code"]] = counts.get(finding["code"], 0) + 1
    return {"schema_version": 1, "as_of": _iso(as_of),
            "summary": {"page_count": len(pages), "finding_count": len(findings), "by_code": counts},
            "findings": findings}


def run(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--brain-repo", required=True)
    parser.add_argument("--source-root", default=".")
    parser.add_argument("--format", choices=("text", "json"), default="text")
    parser.add_argument("--as-of")
    args = parser.parse_args(argv)
    try:
        wiki = Path(args.brain_repo) / "wiki"
        if not wiki.is_dir():
            raise AuditError(f"wiki directory not found: {wiki}")
        as_of = parse_timestamp(args.as_of) if args.as_of else datetime.now(timezone.utc)
        pages = [load_page(path) for path in sorted(wiki.glob("*.md"))]
        findings = collect_findings(pages, Path(args.source_root), as_of)
        report = build_report(pages, findings, as_of)
        if args.format == "json":
            print(json.dumps(report, ensure_ascii=False, sort_keys=True))
        else:
            print(f"Brain lifecycle audit: pages={len(pages)} findings={len(findings)} as_of={report['as_of']}")
            for item in findings:
                detail = " ".join(f"{key}={item[key]}" for key in sorted(item) if key != "code")
                print(f"{item['code']}: {detail}")
        return 1 if findings else 0
    except (AuditError, OSError, UnicodeError) as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 2


if __name__ == "__main__":
    raise SystemExit(run())
