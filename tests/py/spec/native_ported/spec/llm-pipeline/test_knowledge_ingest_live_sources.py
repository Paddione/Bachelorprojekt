"""Native migration of tests/spec/llm-pipeline/knowledge-ingest-live-sources.bats."""

import subprocess

import pytest


@pytest.fixture(scope="module")
def rendered(repo_root, tmp_path_factory):
    """setup_file: kubectl kustomize k3d --load-restrictor=LoadRestrictionsNone > RENDERED 2>&1."""
    out = tmp_path_factory.mktemp("knowledge-ingest") / "rendered-knowledge-live-sources.yaml"
    r = subprocess.run(
        ["kubectl", "kustomize", str(repo_root / "k3d"), "--load-restrictor=LoadRestrictionsNone"],
        stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=300,
    )
    out.write_text(r.stdout + r.stderr, encoding="utf-8")
    return out


def _grep_after(path, needle, after):
    """grep -A <after> <needle> <file>: Treffer plus Folgezeilen (Treffer-Status = bool)."""
    lines = path.read_text(encoding="utf-8").splitlines()
    keep = set()
    matched = False
    for i, line in enumerate(lines):
        if needle in line:
            matched = True
            keep.update(range(i, min(len(lines), i + after + 1)))
    out = "\n".join(lines[i] for i in sorted(keep))
    return matched, out


def test_ingest_bug_tickets_mjs_configmap_liest_tickets_tickets_nicht_bugs_bug_tickets(rendered):
    matched, out = _grep_after(rendered, "ingest-bug-tickets.mjs", 45)
    assert matched, "ConfigMap-Block nicht gefunden"
    assert "FROM tickets.tickets" in out, f"kein tickets.tickets-SELECT: {out}"
    assert "FROM bugs.bug_tickets" not in out, "Legacy-SELECT noch vorhanden"


def test_ingest_prs_mjs_configmap_liest_tickets_ticket_links_nicht_bachelorprojekt_features(rendered):
    matched, out = _grep_after(rendered, "ingest-prs.mjs", 45)
    assert matched, "ConfigMap-Block nicht gefunden"
    assert "FROM tickets.ticket_links" in out, f"kein ticket_links-Join: {out}"
    assert "bachelorprojekt.features" not in out, "Legacy-Tabelle noch referenziert"


def test_zero_item_guard_vorhanden_stille_gruene_fehlerklasse(rendered):
    matched, out = _grep_after(rendered, "ingest-bug-tickets.mjs", 45)
    assert matched
    assert "live store" in out, f"Guard-Meldung fehlt: {out}"


def test_knowledge_ingest_markdown_cronjob_ist_suspendiert(rendered):
    # awk '/name: knowledge-ingest-markdown/{f=1} f{print} f&&/^apiVersion:/{exit}'
    collected = []
    started = False
    for line in rendered.read_text(encoding="utf-8").splitlines():
        if "name: knowledge-ingest-markdown" in line:
            started = True
        if started:
            collected.append(line)
            if line.startswith("apiVersion:"):
                break
    assert "suspend: true" in "\n".join(collected), "kein suspend: true am Markdown-CronJob"


def test_lokale_kopie_ingest_bug_tickets_mjs_liest_ebenfalls_tickets_tickets(repo_root):
    matched, _out = _grep_after(repo_root / "scripts/knowledge/ingest-bug-tickets.mjs", "FROM tickets.tickets", 20)
    assert matched, "lokale Kopie liest nicht tickets.tickets"


def test_lokale_kopie_ingest_prs_mjs_liest_ebenfalls_tickets_ticket_links(repo_root):
    matched, _out = _grep_after(repo_root / "scripts/knowledge/ingest-prs.mjs", "FROM tickets.ticket_links", 20)
    assert matched, "lokale Kopie liest nicht ticket_links"
