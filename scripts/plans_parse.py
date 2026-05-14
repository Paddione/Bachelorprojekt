#!/usr/bin/env python3
"""Parse a superpowers plan markdown file → structured JSON for tracking/pending/."""
import sys, json, re, os
from pathlib import Path

SECTION_KEYWORDS = {
    'architecture': 'architecture',
    'arch': 'architecture',
    'data model': 'data-flow',
    'data flow': 'data-flow',
    'flow': 'data-flow',
    'hot path': 'architecture',
    'cold path': 'architecture',
    'task': 'tasks',
    'files': 'files',
    'gotcha': 'gotchas',
    'error': 'gotchas',
    'agent': 'other',
    'wiring': 'other',
    'retroactive': 'tasks',
    'backfill': 'tasks',
    'overview': 'overview',
}

def classify_section(heading: str) -> str:
    h = heading.lower()
    for keyword, stype in SECTION_KEYWORDS.items():
        if keyword in h:
            return stype
    return 'other'

def parse_frontmatter(lines: list) -> tuple:
    """Return (frontmatter_dict, body_start_index). Raises if no frontmatter."""
    if not lines or lines[0].strip() != '---':
        raise ValueError("No YAML frontmatter found (expected leading ---)")
    end = next((i for i, l in enumerate(lines[1:], 1) if l.strip() == '---'), None)
    if end is None:
        raise ValueError("Unclosed frontmatter block")
    fm = {}
    for line in lines[1:end]:
        if ':' not in line:
            continue
        key, _, val = line.partition(':')
        key = key.strip()
        val = val.strip()
        if val.startswith('[') and val.endswith(']'):
            # e.g. [infra, db]
            fm[key] = [v.strip() for v in val[1:-1].split(',') if v.strip()]
        elif val.lower() == 'null':
            fm[key] = None
        elif val.isdigit():
            fm[key] = int(val)
        else:
            fm[key] = val
    return fm, end + 1

def parse_plan(file_path: str) -> dict:
    path = Path(file_path)
    lines = path.read_text().splitlines(keepends=True)
    fm, body_start = parse_frontmatter(lines)

    body_lines = lines[body_start:]
    body = ''.join(body_lines)

    # Split by H2 headings
    h2_pattern = re.compile(r'^## (.+)$', re.MULTILINE)
    sections = []
    matches = list(h2_pattern.finditer(body))

    # Content before first H2 = overview
    pre = body[:matches[0].start()].strip() if matches else body.strip()
    if pre:
        sections.append({'seq': 0, 'section_type': 'overview', 'content': pre})

    for i, m in enumerate(matches):
        heading = m.group(1).strip()
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        content = (heading + '\n' + body[start:end]).strip()
        sections.append({
            'seq': len(sections),
            'section_type': classify_section(heading),
            'content': content,
        })

    slug = path.stem  # filename without extension
    return {
        'type': 'plan',
        'slug': slug,
        'title': fm.get('title', slug),
        'domains': fm.get('domains', []),
        'status': fm.get('status', 'active'),
        'pr_number': fm.get('pr_number'),
        'file_path': str(path),
        'sections': sections,
        'brainstorm_choice': fm.get('brainstorm_choice') or None,
        'brainstorm_session': fm.get('brainstorm_session') or None,
    }

