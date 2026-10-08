"""Native migration of tests/spec/client-directory.bats."""

import re
from pathlib import Path

# Guards for T901026: client-directory (minimales Kundenverzeichnis mit
# Terminhistorie, Owner-only). Style: tests/spec/notify-reminders.bats.
# IDs T901026-1..5 and T901263-1 feed components/website/src/data/test-inventory.json
# via scripts/build-test-inventory.sh.

WEB = "components/website/src"


def _routes(repo_root: Path):
    base = repo_root / WEB
    return {
        "LIST_ASTRO": base / "pages/owner/kunden.astro",
        "DETAIL_ASTRO": base / "pages/owner/kunden/[id].astro",
        "KORRIGIEREN_TS": base / "pages/api/owner/kunden/[id]/korrigieren.ts",
        "EXPORT_TS": base / "pages/api/owner/kunden/[id]/export.ts",
        "LOESCHEN_TS": base / "pages/api/owner/kunden/[id]/loeschen.ts",
        "ZUSAMMEN_TS": base / "pages/api/owner/kunden/[id]/zusammenfuehren.ts",
    }


def _lib(repo_root: Path) -> Path:
    return repo_root / WEB / "lib/clients.ts"


def _first_line(text: str, pred):
    """grep -n ... | head -1 | cut -d: -f1: 1-based line of the first match, or None."""
    for idx, line in enumerate(text.splitlines(), start=1):
        if pred(line):
            return idx
    return None


# ── Case 1: every customer route is owner-guarded (fail-closed) ─────────────

def test_t901026_1_all_kunden_routes_reference_the_owner_guard_requireowner(repo_root):
    """T901026-1: all kunden routes reference the owner guard (requireOwner)"""
    for f in _routes(repo_root).values():
        assert f.is_file(), f"missing route file: {f}"
        text = f.read_text()
        assert any(tok in text for tok in ("owner-guard", "requireOwner", "isOwnerSession")), \
            f"owner guard missing from {f}"


# ── Case 2: clients group by normalized email ──────────────────────────────

def test_t901026_2_clients_ts_groups_customers_via_normalizeclientemail(repo_root):
    """T901026-2: clients.ts groups customers via normalizeClientEmail"""
    lib = _lib(repo_root)
    assert lib.is_file(), f"missing lib file: {lib}"
    text = lib.read_text()
    assert "normalizeClientEmail" in text, "normalizeClientEmail missing from clients.ts"
    def_line = _first_line(text, lambda l: "function normalizeClientEmail" in l
                           or "const normalizeClientEmail" in l)
    use_line = _first_line(text, lambda l: "normalizeClientEmail(" in l
                           and "function normalizeClientEmail" not in l)
    assert def_line is not None, "normalizeClientEmail definition missing from clients.ts"
    assert use_line is not None, \
        "normalizeClientEmail call missing from the grouping path in clients.ts"
    assert def_line < use_line, \
        "normalizeClientEmail must be defined before its grouping-path call in clients.ts"


# ── Case 3: merges are never silent (explicit confirm + both ids) ──────────

def test_t901026_3_zusammenfuehren_ts_requires_confirm_plus_both_ids_before_merging(repo_root):
    """T901026-3: zusammenfuehren.ts requires confirm plus both ids before merging"""
    zusammen = _routes(repo_root)["ZUSAMMEN_TS"]
    assert zusammen.is_file(), f"missing endpoint file: {zusammen}"
    text = zusammen.read_text()
    assert "confirm" in text, "confirm parameter missing from zusammenfuehren.ts"
    assert "dropId" in text, "dropId (source id) missing from zusammenfuehren.ts"
    assert "keepId" in text, "keepId (target id) missing from zusammenfuehren.ts"
    guard_line = _first_line(text, lambda l: "confirm" in l)
    merge_line = _first_line(text, lambda l: "mergedFrom" in l)
    assert guard_line is not None, "confirm guard missing from zusammenfuehren.ts"
    assert merge_line is not None, "merge persist marker (mergedFrom) missing from zusammenfuehren.ts"
    assert guard_line < merge_line, "confirm guard must precede the merge persist in zusammenfuehren.ts"


# ── Case 4: CSV export format (contact + history sections) ─────────────────

def test_t901026_4_export_ts_answers_text_csv_with_kontakt_and_historie_sections(repo_root):
    """T901026-4: export.ts answers text/csv with Kontakt and Historie sections"""
    export = _routes(repo_root)["EXPORT_TS"]
    assert export.is_file(), f"missing endpoint file: {export}"
    text = export.read_text()
    assert "text/csv" in text, "text/csv content type missing from export.ts"
    assert "Feld;Wert" in text, "Kontakt header (Feld;Wert) missing from export.ts"
    assert "Datum;Art;Zusammenfassung" in text, \
        "Historie header (Datum;Art;Zusammenfassung) missing from export.ts"


# ── Case 5: deletion honours statutory retention (Steuerfristen) ────────────

def test_t901026_5_loeschen_ts_warns_about_aufbewahrung_and_guards_deletion(repo_root):
    """T901026-5: loeschen.ts warns about Aufbewahrung and guards deletion"""
    loeschen = _routes(repo_root)["LOESCHEN_TS"]
    assert loeschen.is_file(), f"missing endpoint file: {loeschen}"
    text = loeschen.read_text()
    assert "aufbewahrung" in text.lower(), "Aufbewahrungs-Hinweis missing from loeschen.ts"
    guard_line = _first_line(text, lambda l: "retentionBlocked" in l)
    delete_line = _first_line(text, lambda l: "DELETE FROM inbox_items" in l)
    assert guard_line is not None, "retention guard (retentionBlocked) missing from loeschen.ts"
    assert delete_line is not None, "DELETE statement missing from loeschen.ts"
    assert guard_line < delete_line, "retention guard must precede the DELETE in loeschen.ts"


# ── Case 6 (T901263): relative lib imports resolve to real files ───────────

def test_t901263_1_relative_lib_imports_in_kunden_routes_resolve_to_existing_files(repo_root):
    """T901263-1: relative lib imports in kunden routes resolve to existing files"""
    failures = []
    for name, f in _routes(repo_root).items():
        if not f.is_file():
            failures.append(f"missing route file: {f}")
            continue
        for match in re.findall(r"from '[^']+'", f.read_text()):
            spec = match[len("from '"):-1]
            if not spec.startswith("../"):
                continue
            base = f.parent / spec
            if not (base.is_file() or (f.parent / (spec + ".ts")).is_file()):
                failures.append(f"unresolvable import '{spec}' in {f}")
    assert not failures, "\n".join(failures)
