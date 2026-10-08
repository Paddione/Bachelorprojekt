"""Native migration of tests/spec/llm-local-dev/glimmer-serving-profile.bats."""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[6]
UNIT = REPO / "scripts" / "llm" / "glimmer.service"


def _read(path: Path) -> str:
    """Return file text, or '' when missing (grep on a missing file fails)."""
    return path.read_text(encoding="utf-8") if path.is_file() else ""


def _exec_start_block(text: str) -> str:
    """Emulate `sed -n '/^ExecStart=/,/^Restart=/p' | grep -v '^Restart=' | tr '\\n' ' '`."""
    out = []
    in_range = False
    for line in text.splitlines(keepends=True):
        if not in_range and line.startswith("ExecStart="):
            in_range = True
        if in_range:
            out.append(line)
            if line.startswith("Restart="):
                in_range = False
    kept = [line.rstrip("\r\n") for line in out if not line.startswith("Restart=")]
    return "".join(line + " " for line in kept)


def test_t900365_glimmer_service_carries_the_measured_serving_profile():
    # Positiv-Anker: die Unit existiert und hat genau eine ExecStart-Zeile.
    assert UNIT.is_file(), f"missing {UNIT}"
    text = UNIT.read_text(encoding="utf-8")
    exec_lines = [line for line in text.splitlines() if line.startswith("ExecStart=")]
    assert len(exec_lines) == 1

    cmd = _exec_start_block(text)
    wants = [
        "Muse-Glimmer-30B-UD-IQ3_XXS.gguf",
        "Muse-Glimmer-30B-DFlash2-Q4_K_M.gguf",
        "--spec-type draft-dflash",
        "--spec-draft-n-max 4",
        "-c 131072",
        "-ctk q8_0",
        "-ctv q8_0",
        "--alias Muse-Glimmer-30B",
        "--host 0.0.0.0",
        "--port 1919",
        "-np 1",
        "--jinja",
    ]
    missing = [want for want in wants if want not in cmd]
    assert not missing, f"glimmer.service ExecStart fehlt: {missing}"

    # Negativ-Aussagen: kein Vision-Projektor, Drafter nicht auf der 3060 Ti.
    assert "--mmproj" not in cmd
    assert "-devd CUDA1" not in cmd


def test_t900365_the_qwen_unit_is_retired():
    assert UNIT.is_file()
    assert not (REPO / "scripts" / "llm" / "qwen38-gsq.service").exists()


def test_t900365_reasoning_off_callers_also_send_reasoning_strength_low():
    callers = [
        "scripts/health-goals-payload.py",
        "scripts/arbitration/synthesize.mjs",
        "scripts/web-audit.mjs",
        "scripts/plan-qa-check.sh",
    ]
    pattern = re.compile(r"reasoning_strength[\"']?\s*[:=]+\s*[\"']low")
    missing = []
    for rel in callers:
        text = _read(REPO / rel)
        # Positiv-Anker: der Aufrufer schaltet Thinking ueberhaupt ab.
        if "enable_thinking" not in text:
            missing.append(f"{rel}: kein enable_thinking (Anker)")
            continue
        if not pattern.search(text):
            missing.append(f"{rel}: reasoning_strength low fehlt")
    assert not missing, "\n".join(missing)
