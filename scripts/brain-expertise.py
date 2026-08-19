#!/usr/bin/env python3
"""Explicit, review-gated GitHub PR expertise intake.

Only ``approve`` writes into the repository. Fetch and stage always use an
external local state directory and never perform ambient GitHub discovery.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

REPO_RE = re.compile(r"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$")
SHA_RE = re.compile(r"^[0-9a-fA-F]{40}$")
SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")
PRIVATE_KEY_RE = re.compile(r"-----BEGIN [^-\n]*PRIVATE KEY-----.*?-----END [^-\n]*PRIVATE KEY-----", re.S)
TOKEN_RE = re.compile(r"\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{20,}|Bearer\s+[A-Za-z0-9._~+/=-]{8,}|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)\b", re.I)
ASSIGNMENT_RE = re.compile(r"(?i)\b(password|passwd|secret|token|api_key|private_key)[ \t]*[:=][ \t]*([^\s,;]+)")
URL_USERINFO_RE = re.compile(r"(https?://)[^/@\s:]+(?::[^/@\s]*)?@", re.I)
TEXT_LIMIT = 20 * 1024
TOTAL_LIMIT = 2 * 1024 * 1024


class ExpertiseError(RuntimeError):
    """Expected validation or workflow error."""


def redact(text: str, counters: dict[str, int]) -> str:
    def replace(pattern: re.Pattern[str], marker: str, value: str) -> str:
        def repl(match: re.Match[str]) -> str:
            counters["redacted_fields"] += 1
            return marker
        return pattern.sub(repl, value)
    text = replace(PRIVATE_KEY_RE, "[REDACTED:private-key]", text)
    text = replace(EMAIL_RE, "[REDACTED:email]", text)
    text = replace(TOKEN_RE, "[REDACTED:credential]", text)
    def url_userinfo(match: re.Match[str]) -> str:
        counters["redacted_fields"] += 1
        return match.group(1) + "[REDACTED:credential]@"
    text = URL_USERINFO_RE.sub(url_userinfo, text)

    def assignment(match: re.Match[str]) -> str:
        counters["redacted_fields"] += 1
        return f"{match.group(1)}=[REDACTED:credential]"
    text = ASSIGNMENT_RE.sub(assignment, text)
    if len(text.encode("utf-8")) > TEXT_LIMIT:
        encoded = text.encode("utf-8")[:TEXT_LIMIT]
        text = encoded.decode("utf-8", errors="ignore") + "\n[TRUNCATED]"
        counters["truncated_fields"] += 1
    return text


def residual_secret(text: str) -> bool:
    sanitized = re.sub(r"\[REDACTED:[^\]]+\]", "", text)
    return bool(EMAIL_RE.search(sanitized) or PRIVATE_KEY_RE.search(sanitized)
                or TOKEN_RE.search(sanitized) or ASSIGNMENT_RE.search(sanitized)
                or URL_USERINFO_RE.search(sanitized))


def _require_under(root: Path, path: Path) -> Path:
    resolved = path.resolve()
    try:
        resolved.relative_to(root.resolve())
    except ValueError as exc:
        raise ValueError(f"state path escapes canonical state root: {path}") from exc
    return resolved


def _secure_state_ancestors(root: Path, parent: Path) -> None:
    root = root.resolve()
    parent = _require_under(root, parent)
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    os.chmod(root, 0o700)
    relative = parent.relative_to(root)
    current = root
    for part in relative.parts:
        current = current / part
        current.mkdir(exist_ok=True, mode=0o700)
        os.chmod(current, 0o700)


def atomic_write(path: Path, content: bytes, *, state_root_path: Path | None = None) -> None:
    if state_root_path is not None:
        path = _require_under(state_root_path, path)
        _secure_state_ancestors(state_root_path, path.parent)
    else:
        path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        if path.read_bytes() == content:
            return
        raise ExpertiseError(f"refusing to overwrite different content: {path}")
    handle = tempfile.NamedTemporaryFile(dir=path.parent, prefix=".tmp-", delete=False)
    temporary = Path(handle.name)
    try:
        os.chmod(temporary, 0o600)
        with handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
        os.chmod(path, 0o600)
    except Exception:
        temporary.unlink(missing_ok=True)
        raise


def validate_scope(args: argparse.Namespace) -> tuple[str, str, int, str]:
    if not REPO_RE.fullmatch(args.repo or ""):
        raise ValueError("--repo must be OWNER/REPO")
    if not isinstance(args.pr, int) or args.pr <= 0:
        raise ValueError("--pr must be a positive integer")
    if not SHA_RE.fullmatch(args.revision or ""):
        raise ValueError("--revision must be a 40-character hexadecimal SHA")
    owner, repository = args.repo.split("/", 1)
    if owner in {".", ".."} or repository in {".", ".."}:
        raise ValueError("repository components must not be '.' or '..'")
    return owner, repository, args.pr, args.revision.lower()


def state_root(args: argparse.Namespace) -> Path:
    repo_root = Path(args.repo_root).resolve()
    configured = args.state_dir or os.environ.get("BRAIN_EXPERTISE_STATE")
    if configured:
        state = Path(configured).expanduser().resolve()
    else:
        base = Path(os.environ.get("XDG_STATE_HOME", Path.home() / ".local/state"))
        state = (base / "bachelorprojekt/brain-expertise").resolve()
    try:
        state.relative_to(repo_root)
    except ValueError:
        pass
    else:
        raise ValueError("state directory must be outside the repository")
    return state


def state_paths(args: argparse.Namespace) -> tuple[Path, Path, Path]:
    owner, repository, pr, revision = validate_scope(args)
    root = state_root(args)
    fetched = _require_under(root, root / "fetched" / owner / repository / f"pr-{pr}" / f"{revision}.json")
    staged = _require_under(root, root / "staged" / owner / repository / f"pr-{pr}" / revision / "candidate.md")
    return root, fetched, staged


def _parse_json_stream(output: str) -> Any:
    decoder = json.JSONDecoder()
    values: list[Any] = []
    offset = 0
    while offset < len(output):
        while offset < len(output) and output[offset].isspace():
            offset += 1
        if offset >= len(output):
            break
        value, offset = decoder.raw_decode(output, offset)
        values.append(value)
    if not values:
        raise json.JSONDecodeError("empty JSON response", output, 0)
    if len(values) == 1:
        return values[0]
    if all(isinstance(value, list) for value in values):
        return [item for value in values for item in value]
    raise json.JSONDecodeError("paginated response is not an array stream", output, 0)


def gh_json(arguments: list[str]) -> Any:
    try:
        result = subprocess.run(["gh", *arguments], check=True, capture_output=True, text=True)
        return _parse_json_stream(result.stdout)
    except (subprocess.CalledProcessError, OSError, json.JSONDecodeError) as exc:
        raise ExpertiseError(f"GitHub request failed: {' '.join(arguments)}") from exc


def fetch(args: argparse.Namespace) -> None:
    owner, repository, pr, revision = validate_scope(args)
    _, fetched_path, _ = state_paths(args)
    base = f"repos/{owner}/{repository}"
    pull = gh_json(["api", f"{base}/pulls/{pr}"])
    files = gh_json(["api", "--paginate", f"{base}/pulls/{pr}/files"])
    reviews = gh_json(["api", "--paginate", f"{base}/pulls/{pr}/reviews"])
    comments = gh_json(["api", "--paginate", f"{base}/issues/{pr}/comments"])
    if not isinstance(pull, dict) or pull.get("head", {}).get("sha", "").lower() != revision:
        raise ExpertiseError("pull request head SHA does not match --revision")
    counters = {"redacted_fields": 0, "truncated_fields": 0}

    def clean(value: Any) -> str:
        return redact(str(value or ""), counters)

    selected_files = []
    for item in files if isinstance(files, list) else []:
        filename = str(item.get("filename", ""))
        patch = "" if re.search(r"\.(?:png|jpe?g|gif|pdf|zip|woff2?)$", filename, re.I) else clean(item.get("patch"))
        selected_files.append({"path": filename, "status": str(item.get("status", "")), "patch": patch})
    selected_reviews = [{"id": int(item["id"]), "source_url": str(item.get("html_url", "")),
                         "state": str(item.get("state", "")), "role": "reviewer", "body": clean(item.get("body"))}
                        for item in reviews if isinstance(item, dict) and isinstance(item.get("id"), int)]
    selected_comments = [{"id": int(item["id"]), "source_url": str(item.get("html_url", "")),
                          "role": "commenter", "body": clean(item.get("body"))}
                         for item in comments if isinstance(item, dict) and isinstance(item.get("id"), int)]
    evidence = {
        "schema_version": 1, "repository": f"{owner}/{repository}", "pull_request": pr,
        "source_url": str(pull.get("html_url", "")), "upstream_revision": revision,
        "pull": {"role": "pr-author", "title": clean(pull.get("title")), "body": clean(pull.get("body"))},
        "files": selected_files, "reviews": selected_reviews, "comments": selected_comments,
        "redaction": {"version": 1, **counters},
    }
    raw = (json.dumps(evidence, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()
    # Keep a hard, deterministic total cap without ever spilling the raw API
    # responses. Lowest-priority tail items are dropped in a stable order.
    while len(raw) > TOTAL_LIMIT:
        for key in ("comments", "reviews", "files"):
            if evidence[key]:
                evidence[key].pop()
                counters["truncated_fields"] += 1
                evidence["redaction"]["truncated_fields"] = counters["truncated_fields"]
                break
        else:
            raise ExpertiseError("redacted evidence exceeds the 2 MiB limit")
        raw = (json.dumps(evidence, ensure_ascii=False, sort_keys=True, indent=2) + "\n").encode()
    atomic_write(fetched_path, raw, state_root_path=state_root(args))
    print(fetched_path)


def load_evidence(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ExpertiseError(f"cannot read redacted evidence: {path}") from exc
    if not isinstance(data, dict) or data.get("schema_version") != 1:
        raise ExpertiseError("unsupported evidence schema")
    return data


def render_candidate(data: dict[str, Any]) -> str:
    review_ids = [item["id"] for item in data.get("reviews", [])]
    comment_ids = [item["id"] for item in data.get("comments", [])]
    lines = [
        "---", "status: staged", f"repository: {data['repository']}",
        f"pull_request: {data['pull_request']}", f"source_url: {data['source_url']}",
        f"upstream_revision: {data['upstream_revision']}",
        f"review_ids: {json.dumps(review_ids)}", f"comment_ids: {json.dumps(comment_ids)}",
        f"redaction_version: {data['redaction']['version']}",
        f"redacted_fields: {data['redaction']['redacted_fields']}",
        f"truncated_fields: {data['redaction']['truncated_fields']}", "---", "",
        "# Review candidate", "", "## Decision evidence", "",
        f"- PR: {data['pull']['title']} ({data['source_url']})", data["pull"]["body"], "",
        "## Review guidance", "",
    ]
    for item in data.get("reviews", []):
        lines.append(f"- Review {item['id']} ({item['source_url']}): {item['body']}")
    for item in data.get("comments", []):
        lines.append(f"- Comment {item['id']} ({item['source_url']}): {item['body']}")
    lines.extend(["", "## Recurring patterns", ""])
    for item in data.get("files", []):
        lines.append(f"- File evidence `{item['path']}` ({item['status']}):\n\n```diff\n{item['patch']}\n```")
    return "\n".join(lines).rstrip() + "\n"


def stage(args: argparse.Namespace) -> None:
    _, fetched_path, staged_path = state_paths(args)
    data = load_evidence(fetched_path)
    owner, repository, pr, revision = validate_scope(args)
    if (data.get("repository"), data.get("pull_request"), data.get("upstream_revision")) != (f"{owner}/{repository}", pr, revision):
        raise ExpertiseError("evidence provenance does not match requested scope")
    counters = {"redacted_fields": 0, "truncated_fields": 0}
    rendered = redact(render_candidate(data), counters)
    if residual_secret(rendered):
        raise ExpertiseError("residual secret or personal data in staged candidate")
    atomic_write(staged_path, rendered.encode(), state_root_path=state_root(args))
    print(staged_path)


def _candidate_metadata(content: str) -> dict[str, str]:
    if not content.startswith("---\n") or "\n---\n" not in content[4:]:
        raise ExpertiseError("candidate frontmatter missing")
    block = content.split("---\n", 2)[1]
    return {key.strip(): value.strip() for line in block.splitlines() if ":" in line
            for key, value in [line.split(":", 1)]}


def approve(args: argparse.Namespace) -> None:
    owner, repository, pr, revision = validate_scope(args)
    if not SLUG_RE.fullmatch(args.slug or ""):
        raise ValueError("--slug must be kebab-case")
    _, fetched_path, staged_path = state_paths(args)
    data = load_evidence(fetched_path)
    try:
        candidate = staged_path.read_text(encoding="utf-8")
    except OSError as exc:
        raise ExpertiseError(f"cannot read staged candidate: {staged_path}") from exc
    metadata = _candidate_metadata(candidate)
    expected = (f"{owner}/{repository}", str(pr), revision)
    if (metadata.get("repository"), metadata.get("pull_request"), metadata.get("upstream_revision")) != expected:
        raise ExpertiseError("candidate provenance does not match requested scope")
    known_ids = {str(item["id"]) for item in data.get("reviews", []) + data.get("comments", [])}
    candidate_ids = set(re.findall(r"(?:Review|Comment)\s+(\d+)", candidate))
    if not candidate_ids.issubset(known_ids):
        raise ExpertiseError("candidate references unknown evidence IDs")
    if residual_secret(candidate):
        raise ExpertiseError("residual secret or personal data in candidate")
    approval = f"APPROVE {owner}/{repository}#{pr}@{revision} {args.slug}"
    repo_root = Path(args.repo_root).resolve()
    filename = f"{owner.lower()}-{repository.lower()}-pr-{pr}-{revision[:12]}-{args.slug}.md"
    target = repo_root / "docs/brain-expertise/approved" / filename
    if args.approval_file:
        try:
            supplied = Path(args.approval_file).read_text(encoding="utf-8").strip()
        except OSError as exc:
            raise ExpertiseError("cannot read approval file") from exc
    elif sys.stdin.isatty():
        print(f"Repository: {owner}/{repository}\nPR: {pr}\nRevision: {revision}\nTarget: {target}")
        print(f"Redacted fields: {metadata.get('redacted_fields', 'unknown')}\nTruncated fields: {metadata.get('truncated_fields', 'unknown')}")
        supplied = input(f"Type exactly: {approval}\n> ").strip()
    else:
        raise ExpertiseError("interactive approval or --approval-file is required")
    if supplied != approval:
        raise ExpertiseError("approval statement does not match exact scope")
    review_ids = [item["id"] for item in data.get("reviews", [])]
    comment_ids = [item["id"] for item in data.get("comments", [])]
    body = candidate.split("\n---\n", 1)[1].lstrip()
    approved = "\n".join([
        "---", "type: note", "tags: [github-reviewed, expertise]", "status: active",
        "source_kind: github-reviewed", f"upstream_revision: {revision}",
        f"repository: {owner}/{repository}", f"pull_request: {pr}",
        f"source_url: {data['source_url']}", f"review_ids: {json.dumps(review_ids)}",
        f"comment_ids: {json.dumps(comment_ids)}", "---", body.rstrip(), "",
    ])
    atomic_write(target, approved.encode())
    print(target)


def parser() -> argparse.ArgumentParser:
    result = argparse.ArgumentParser(description=__doc__)
    result.add_argument("--repo-root", default=".")
    result.add_argument("--state-dir")
    subs = result.add_subparsers(dest="command", required=True)
    for command in ("fetch", "stage", "approve"):
        sub = subs.add_parser(command)
        sub.add_argument("--repo", required=True)
        sub.add_argument("--pr", required=True, type=int)
        sub.add_argument("--revision", required=True)
        if command == "approve":
            sub.add_argument("--slug", required=True)
            sub.add_argument("--approval-file")
    return result


def run(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    try:
        {"fetch": fetch, "stage": stage, "approve": approve}[args.command](args)
        return 0
    except ValueError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 2
    except ExpertiseError as exc:
        sys.stderr.write(f"error: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(run())
