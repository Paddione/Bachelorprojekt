#!/usr/bin/env python3
import argparse, json, os, re, sys
from pathlib import Path

def find_page(wiki_dir, slug):
    for f in Path(wiki_dir).rglob("*.md"):
        if f.stem == slug:
            return f
    return None

def read_page(path):
    content = path.read_text()
    parts = content.split("---", 2)
    fm = {}
    if len(parts) >= 3:
        for line in parts[1].strip().splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                fm[k.strip()] = v.strip()
        body = parts[2].strip()
    else:
        body = content.strip()
    return {"frontmatter": fm, "body": body, "path": str(path)}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--wiki", required=True)
    parser.add_argument("--resource")
    parser.add_argument("--search")
    args = parser.parse_args()
    wiki = Path(args.wiki)
    if args.resource:
        m = re.match(r"brain://wiki/(.+)", args.resource)
        if not m:
            print("invalid resource URI", file=sys.stderr); sys.exit(1)
        page = find_page(args.wiki, m.group(1))
        if not page:
            print("not found", file=sys.stderr); sys.exit(1)
        print(json.dumps(read_page(page)))
    elif args.search:
        results = []
        for f in wiki.rglob("*.md"):
            if args.search.lower() in f.read_text().lower():
                results.append(str(f))
        print(json.dumps(results))
