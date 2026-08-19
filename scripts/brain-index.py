#!/usr/bin/env python3
"""Shared, read-only Brain Wiki index with BM25 and lifecycle filters."""

from __future__ import annotations

import json
import math
import re
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

RESULT_METADATA = (
    "type", "tags", "status", "source_kind", "source_revision", "observed_at",
    "valid_from", "valid_until", "superseded_by",
)


def parse_datetime(value: str) -> datetime:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("expected non-empty ISO-8601 string")
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        if "T" in normalized or " " in normalized:
            raise ValueError("timestamp requires explicit UTC offset")
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _scalar(value: str) -> Any:
    value = value.strip()
    if value.startswith("[") and value.endswith("]"):
        inner = value[1:-1].strip()
        if not inner:
            return []
        return [_scalar(item) for item in inner.split(",")]
    if len(value) >= 2 and value[0] == value[-1] == '"':
        try:
            return json.loads(value)
        except json.JSONDecodeError:
            return value[1:-1]
    return value.strip("'\"")


def parse_frontmatter(content: str) -> tuple[dict[str, Any], str]:
    lines = content.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}, content.strip()
    try:
        closing = next(index for index in range(1, len(lines)) if lines[index].strip() == "---")
    except StopIteration:
        return {}, content.strip()
    metadata: dict[str, Any] = {}
    for line in lines[1:closing]:
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        metadata[key.strip()] = _scalar(value)
    return metadata, "\n".join(lines[closing + 1 :]).strip()


def freshness_for(frontmatter: dict[str, Any], as_of: datetime) -> str:
    try:
        start = parse_datetime(frontmatter["valid_from"]) if frontmatter.get("valid_from") else None
        end = parse_datetime(frontmatter["valid_until"]) if frontmatter.get("valid_until") else None
    except (TypeError, ValueError):
        return "unknown"
    if start is None and end is None:
        return "unknown"
    if start is not None and as_of < start:
        return "future"
    if end is not None and as_of >= end:
        return "stale"
    return "current"


class BrainIndex:
    """In-memory, lazily refreshed index of sorted Markdown pages."""

    def __init__(self, wiki_dir: Path):
        self.wiki_dir = Path(wiki_dir).expanduser()
        self.pages: dict[str, dict[str, Any]] = {}
        self._built = False
        self._mtimes: dict[str, int] = {}
        self._build_index()

    def _build_index(self) -> None:
        if not self.wiki_dir.is_dir():
            return
        pages: dict[str, dict[str, Any]] = {}
        mtimes: dict[str, int] = {}
        for path in sorted(self.wiki_dir.rglob("*.md")):
            try:
                content = path.read_text(encoding="utf-8")
                stat = path.stat()
            except OSError:
                continue
            frontmatter, body = parse_frontmatter(content)
            tags = frontmatter.get("tags", [])
            if isinstance(tags, str):
                tags = [tags]
            pages[path.stem] = {
                "frontmatter": frontmatter,
                "body": body,
                "path": str(path),
                "title": str(frontmatter.get("title", path.stem)),
                "tags": [str(tag) for tag in tags],
            }
            mtimes[str(path)] = stat.st_mtime_ns
        self.pages = pages
        self._mtimes = mtimes
        self._built = True

    def _wiki_changed(self) -> bool:
        if not self.wiki_dir.is_dir():
            return False
        try:
            current = {str(path): path.stat().st_mtime_ns for path in self.wiki_dir.rglob("*.md")}
        except OSError:
            return True
        return current != self._mtimes

    def _ensure_fresh(self) -> None:
        if self.wiki_dir.is_dir() and (not self._built or self._wiki_changed()):
            self._build_index()

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        return [token.lower() for token in re.findall(r"\w+", text) if len(token) > 1]

    @staticmethod
    def _extract_snippet(body: str, query_terms: list[str], radius: int = 100) -> str:
        positions = [body.lower().find(term) for term in query_terms]
        positions = [position for position in positions if position >= 0]
        if not positions:
            return body[:200] + ("..." if len(body) > 200 else "")
        position = min(positions)
        start, end = max(0, position - radius), min(len(body), position + radius)
        snippet = body[start:end]
        if start:
            snippet = "…" + snippet
        if end < len(body):
            snippet += "…"
        return snippet

    @staticmethod
    def _matches(page: dict[str, Any], *, page_type: str | None, tags: list[str] | None,
                 status: str | None, source_kind: str | None, as_of: datetime | None) -> bool:
        fm = page["frontmatter"]
        if page_type is not None and fm.get("type") != page_type:
            return False
        if status is not None and fm.get("status") != status:
            return False
        if source_kind is not None and fm.get("source_kind") != source_kind:
            return False
        if tags is not None and not set(tags).issubset(set(page["tags"])):
            return False
        if as_of is not None:
            state = freshness_for(fm, as_of)
            if state in {"stale", "future"}:
                return False
        return True

    def search(self, query: str, top_k: int = 5, *, page_type: str | None = None,
               tags: list[str] | None = None, status: str | None = None,
               source_kind: str | None = None, as_of: str | datetime | None = None) -> list[dict[str, Any]]:
        self._ensure_fresh()
        query_terms = self._tokenize(query)
        if not query_terms or not self.pages:
            return []
        instant = parse_datetime(as_of) if isinstance(as_of, str) else as_of
        filtered = {
            slug: page for slug, page in self.pages.items()
            if self._matches(page, page_type=page_type, tags=tags, status=status,
                             source_kind=source_kind, as_of=instant)
        }
        if not filtered:
            return []
        terms: dict[str, dict[str, int]] = {}
        lengths: dict[str, int] = {}
        frequency: dict[str, int] = defaultdict(int)
        for slug, page in filtered.items():
            tokens = self._tokenize(page["title"] + " " + " ".join(page["tags"]) + " " + page["body"])
            lengths[slug] = len(tokens)
            counts: dict[str, int] = defaultdict(int)
            for token in tokens:
                counts[token] += 1
            terms[slug] = dict(counts)
            for token in set(tokens):
                frequency[token] += 1
        count = len(filtered)
        average = sum(lengths.values()) / max(count, 1)
        scores: dict[str, float] = {}
        for slug in filtered:
            score = 0.0
            for term in query_terms:
                tf = terms[slug].get(term, 0)
                if not tf:
                    continue
                idf = math.log((count - frequency[term] + 0.5) / (frequency[term] + 0.5) + 1.0)
                score += idf * tf * 2.5 / (tf + 1.5 * (0.25 + 0.75 * lengths[slug] / max(average, 1)))
            if score > 0:
                scores[slug] = score
        ranked = sorted(scores.items(), key=lambda item: item[1], reverse=True)[:top_k]
        freshness_instant = instant or datetime.now(timezone.utc)
        results: list[dict[str, Any]] = []
        for slug, score in ranked:
            page = filtered[slug]
            result: dict[str, Any] = {
                "slug": slug, "score": round(score, 4), "title": page["title"],
                "snippet": self._extract_snippet(page["body"], query_terms),
                "freshness": freshness_for(page["frontmatter"], freshness_instant),
            }
            for key in RESULT_METADATA:
                if key in page["frontmatter"]:
                    result[key] = page["frontmatter"][key]
            results.append(result)
        return results

    def read_page(self, slug: str) -> dict[str, Any] | None:
        self._ensure_fresh()
        page = self.pages.get(slug)
        if page is None:
            return None
        return {"slug": slug, "frontmatter": page["frontmatter"], "body": page["body"], "path": page["path"]}
