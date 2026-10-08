"""Native migration of tests/spec/sdlc-cockpit/k9-stil-datenbank.bats."""
# (K9, T002468)
# Ergebnis-basiert: liest die Datendateien (JSON), prueft ihren Inhalt; die Route per curl.
# Daemon precondition from daemon-helper.bash (via the ported daemon-endpoints module).

import importlib.util
import json
import re
import shutil
from pathlib import Path

import pytest

REQUIRED_FIELDS = ["id", "name", "zweck", "herkunft", "beleg_ausschnitt", "token_bezuege"]


def _load_sibling(name):
    path = Path(__file__).with_name(name)
    spec = importlib.util.spec_from_file_location(f"_native_{path.stem}", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _styles(repo_root):
    return repo_root / ".lavish/styles"


def _entry_files(repo_root):
    """Alle Eintragsdateien: *.json im Styles-Verzeichnis ohne schema.json und index.json."""
    styles = _styles(repo_root)
    if not styles.is_dir():
        return []
    return sorted(
        p for p in styles.glob("*.json")
        if p.is_file() and p.name not in ("schema.json", "index.json")
    )


def _load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def _has_value(data, field):
    return isinstance(data, dict) and field in data and data[field] is not None and data[field] != ""


def _as_text(value):
    """Entspricht `jq -r`: Strings roh, Strukturen als JSON-Text."""
    if isinstance(value, str):
        return value
    return json.dumps(value, indent=2, ensure_ascii=False)


@pytest.fixture(autouse=True)
def _jq_required():
    if not shutil.which("jq"):
        pytest.skip("jq nicht verfuegbar")


def test_t002468_die_datenebene_existiert_mit_schema_und_mindestens_zwei_eintraegen(repo_root):
    styles = _styles(repo_root)
    assert styles.is_dir()
    assert (styles / "schema.json").is_file()
    count = len(_entry_files(repo_root))
    assert count >= 2, f"erwartet >= 2 Eintraege, gefunden: {count}"


def test_t002468_schema_json_ist_gueltiges_json_schema_mit_additional_properties_false(repo_root):
    schema_path = _styles(repo_root) / "schema.json"
    assert schema_path.is_file()

    # POSITIV-ANKER: die Datei ist parsebares JSON.
    schema = _load(schema_path)

    # additionalProperties:false macht das Schema erst wirksam.
    assert schema.get("additionalProperties") is False

    # Die von D14 geforderten Pflichtfelder.
    required = schema.get("required") or []
    for field in REQUIRED_FIELDS:
        assert field in required, f"Pflichtfeld fehlt in schema.json .required: {field}"


def test_t002468_jeder_eintrag_traegt_alle_pflichtfelder_d14_regel_1_und_3(repo_root):
    checked = 0
    for path in _entry_files(repo_root):
        checked += 1
        data = _load(path)
        for field in REQUIRED_FIELDS:
            assert _has_value(data, field), f"{path.name}: Pflichtfeld fehlt oder leer: {field}"

        herkunft = data.get("herkunft")
        projekt = herkunft.get("projekt") if isinstance(herkunft, dict) else None
        assert projekt is not None and projekt != "", f"{path.name}: herkunft.projekt fehlt"

        bezuege = data.get("token_bezuege")
        assert isinstance(bezuege, list) and len(bezuege) >= 1, f"{path.name}: token_bezuege leer"

    # POSITIV-ANKER: die Schleife hat tatsaechlich Eintraege geprueft.
    assert checked >= 2, f"nur {checked} Eintraege geprueft"


def test_t002468_jeder_token_bezuege_wert_ist_ein_in_tokens_css_definiertes_token_e11(repo_root):
    tokens_css = repo_root / ".lavish/kit/tokens.css"
    assert tokens_css.is_file()

    # POSITIV-ANKER: tokens.css definiert Tokens.
    known = set()
    for line in tokens_css.read_text(encoding="utf-8").splitlines():
        match = re.match(r"^\s*(--[a-z0-9-]+)", line)
        if match:
            known.add(match.group(1))
    assert len(known) >= 10

    checked = 0
    for path in _entry_files(repo_root):
        for token in _load(path).get("token_bezuege", []):
            if not token:
                continue
            checked += 1
            assert token in known, f"{path.name}: '{token}' ist in tokens.css nicht definiert"

    assert checked >= 2, f"nur {checked} Token-Bezuege geprueft"


def test_t002468_kein_beleg_ausschnitt_enthaelt_feste_farb_oder_groessenwerte_d14_regel_2(repo_root):
    # POSITIV-ANKER: Beleg-Ausschnitte verwenden tatsaechlich var(--...).
    anchored = 0
    entries = _entry_files(repo_root)
    for path in entries:
        if "var(--" in _as_text(_load(path).get("beleg_ausschnitt")):
            anchored += 1
    assert anchored >= 2, f"nur {anchored} Ausschnitte mit var(--...)"

    # NEGATIVTEST: keine Hex-Farbe und keine feste Groessenangabe.
    offenders = []
    hex_re = re.compile(r"#[0-9a-fA-F]{3,8}\b")
    size_re = re.compile(r"[0-9]+(\.[0-9]+)?(px|pt|em|rem)\b")
    for path in entries:
        snippet = _as_text(_load(path).get("beleg_ausschnitt"))
        if any(hex_re.search(line) for line in snippet.splitlines()):
            offenders.append(f"{path.name}:hex")
        if any(size_re.search(line) for line in snippet.splitlines()):
            offenders.append(f"{path.name}:size")
    assert not offenders, f"Beleg-Ausschnitte mit festen Werten: {' '.join(offenders)}"


def test_t002468_index_json_listet_jeden_eintrag_mit_zweck_und_herkunft_d14_regel_3(repo_root):
    index_path = _styles(repo_root) / "index.json"
    assert index_path.is_file()

    entries = _entry_files(repo_root)
    index = _load(index_path)
    index_entries = index.get("entries", [])

    # POSITIV-ANKER: der Index ist nicht leer.
    assert len(index_entries) >= 2
    # Jede Datei erscheint im Index und umgekehrt.
    assert len(index_entries) == len(entries), (
        f"index.json listet {len(index_entries)}, Verzeichnis hat {len(entries)} Eintraege"
    )

    for path in entries:
        entry_id = _load(path).get("id")
        matches = [e for e in index_entries if e.get("id") == entry_id]
        assert matches, f"index.json: Eintrag '{entry_id}' fehlt"
        last = matches[-1]
        herkunft = last.get("herkunft")
        projekt = herkunft.get("projekt") if isinstance(herkunft, dict) else None
        zweck = last.get("zweck")
        ok = (zweck is not None and zweck != "") and projekt is not None
        assert ok, f"index.json: Eintrag '{entry_id}' ohne Zweck/Herkunft"


def test_t002468_readme_dokumentiert_die_drei_d14_beitragsregeln(repo_root):
    readme = _styles(repo_root) / "README.md"
    assert readme.is_file()
    text = readme.read_text(encoding="utf-8")
    assert re.search(r"beleg", text, re.IGNORECASE)
    assert re.search(r"token", text, re.IGNORECASE)
    assert re.search(r"herkunft|verzeichnis", text, re.IGNORECASE)


def test_t002468_get_api_cockpit_styles_liefert_entries_und_fetched_at_d12_d13(repo_root, run_cmd):
    endpoints = _load_sibling("test_daemon_endpoints.py")
    base = endpoints._require_daemon(repo_root, run_cmd)

    result = run_cmd(["curl", "-s", f"{base}/api/cockpit/styles"])
    assert result.returncode == 0, result.output

    # D12: fetchedAt.
    assert "fetchedAt" in result.output
    # D13: entweder Nutzdaten oder ein benannter Fehler.
    if '"error"' not in result.output:
        assert '"entries"' in result.output


def test_t002468_der_styles_zugriff_laeuft_ueber_den_adapter_nicht_per_direktem_fetch_e1(repo_root):
    kit = repo_root / ".lavish/kit"

    # POSITIV-ANKER: der Adapter stellt styles() bereit.
    assert "styles" in (kit / "adapter.js").read_text(encoding="utf-8")

    def fetch_calls(path):
        return sum(
            1 for line in path.read_text(encoding="utf-8").splitlines()
            if not re.match(r"^\s*//", line) and "fetch(" in line
        )

    # GEGENPROBE: adapter.js enthaelt fetch(.
    assert fetch_calls(kit / "adapter.js") > 0
    # NEGATIVTEST: panel.js ruft nicht selbst fetch auf.
    assert fetch_calls(kit / "panel.js") == 0
