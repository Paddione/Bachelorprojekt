"""T901951: express v5 verbietet '*' Routen-Pfade (path-to-regexp v8).

Guard gegen die CrashLoop-Klasse aus dem Incident 2026-10-12: `app.use('*')`
wirft unter express v5 beim Boot `PathError: Missing parameter name`
(server/vite.ts). Catch-all-Middleware wird pfadlos registriert.

Pruefmodus: Quelltext-Verifikation (Banned-Pattern-Guard, Praezedenz S3);
Positiv-Anker: der Scan findet Server-Dateien (Liste nicht leer).
"""

import re

STAR_ROUTE_RE = re.compile(
    r"""\.(use|get|post|put|patch|delete|all|options|head)\(\s*['"]\*['"]"""
)


def test_no_star_routes_in_videovault_server(repo_root):
    server_dir = repo_root / "components" / "VideoVault" / "server"
    candidates = sorted(
        p
        for p in server_dir.rglob("*.ts")
        if ".test." not in p.name and ".spec." not in p.name
    )
    assert len(candidates) > 0, "Positiv-Anker: keine Server-Dateien gefunden"
    hits = []
    for path in candidates:
        text = path.read_text(encoding="utf-8")
        for lineno, line in enumerate(text.splitlines(), start=1):
            if STAR_ROUTE_RE.search(line):
                hits.append(f"{path.relative_to(repo_root)}:{lineno}")
    assert not hits, "express-v5-widrige '*'-Routen: " + ", ".join(hits)
