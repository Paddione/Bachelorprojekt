"""Native migration of tests/spec/finetune/model-registry.bats."""

import http.server
import json
import os
import threading

import pytest

STUB_PORT = 18778

FAKE_PSQL = r'''#!/bin/bash
LOG_FILE="__TMPD__/psql-calls.log"
echo "$*" >> "$LOG_FILE"
# SQL kommt seit T004445 ueber stdin (psql :'var' ersetzt nur bei stdin/-f)
STDIN_SQL="$(cat)"
[ -n "$STDIN_SQL" ] && echo "$STDIN_SQL" >> "$LOG_FILE"

TA=""
CMD=""
for arg in "$@" "$STDIN_SQL"; do
  [ "$arg" = "-t" ] && TA="$TA-t"
  [ "$arg" = "-A" ] && TA="$TA-A"
done
for arg in "$@" "$STDIN_SQL"; do
  case "$arg" in
    *insert_adapter*) CMD="insert_adapter" ;;
    *get_adapter*)    CMD="get_adapter" ;;
    *list_adapters*)  CMD="list_adapters" ;;
    *upsert_eval_score*) CMD="upsert_eval_score" ;;
    *upsert_stat_requirements*) CMD="upsert_stat_requirements" ;;
    *upsert_provenance*) CMD="upsert_provenance" ;;
  esac
done

case "$CMD" in
  insert_adapter)
    echo "${FAKE_ADAPTER_ID:-42}"
    ;;
  get_adapter)
    echo "$FAKE_GET_ADAPTER_LINE"
    ;;
  list_adapters)
    if [ "$TA" = "-t-A" ]; then :; else
      printf 'name|base_model|quantization|role|score|vram_mb|max_context\nadapter1|model1|Q8|scout|0.9|1000|32768\n'
    fi
    ;;
  upsert_*)
    : # void — nur protokollieren
    ;;
esac
exit 0
'''


class _StubHandler(http.server.BaseHTTPRequestHandler):
    """Stub llama.cpp: leere Completion => 'keine Aktion'."""

    def do_POST(self):
        self.rfile.read(int(self.headers["Content-Length"]))
        out = json.dumps({"choices": [{"text": "", "finish_reason": "stop"}]}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(out)))
        self.end_headers()
        self.wfile.write(out)

    def log_message(self, *args):
        pass


@pytest.fixture
def reg(repo_root, tmp_path):
    """BATS setup: Fake-psql auf PATH, Stub-LLM-Server auf 127.0.0.1:18778."""
    psql = tmp_path / "psql"
    psql.write_text(FAKE_PSQL.replace("__TMPD__", str(tmp_path)), encoding="utf-8")
    psql.chmod(0o755)
    server = http.server.HTTPServer(("127.0.0.1", STUB_PORT), _StubHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    yield {
        "env": {
            "PATH": f"{tmp_path}{os.pathsep}{os.environ.get('PATH', '')}",
            "MODEL_REGISTRY_DB_URL": "postgres://fake:fake@localhost:5432/website",
            "FAKE_ADAPTER_ID": "42",
        },
        "cli": str(repo_root / "scripts" / "finetune" / "model-registry.sh"),
        "log": tmp_path / "psql-calls.log",
        "tmp": tmp_path,
        "repo": repo_root,
    }
    server.shutdown()
    server.server_close()


def _log(reg) -> str:
    return reg["log"].read_text(encoding="utf-8") if reg["log"].exists() else ""


def _no_db_calls(reg) -> bool:
    if not reg["log"].exists() or reg["log"].stat().st_size == 0:
        return True
    text = _log(reg)
    return "insert_adapter" not in text and "upsert_eval_score" not in text


def _env(reg, **extra):
    env = dict(reg["env"])
    env.update(extra)
    return env


def test_help_zeigt_usage_exit_0(run_cmd, reg):
    r = run_cmd(["bash", reg["cli"], "--help"], env=_env(reg))
    assert r.returncode == 0, r.output
    assert "Usage:" in r.output


def test_ohne_argumente_exit_1(run_cmd, reg):
    r = run_cmd(["bash", reg["cli"]], env=_env(reg))
    assert r.returncode == 1


def test_register_ruft_insert_adapter_mit_name_base_model_quant_auf(run_cmd, reg):
    r = run_cmd(["bash", reg["cli"], "register", "my-adapter", "gemma-4-9b-it", "--quant", "Q8_0"],
                env=_env(reg, FAKE_ADAPTER_ID="7"))
    assert r.returncode == 0, r.output
    text = _log(reg)
    assert "insert_adapter" in text
    # Werte als psql-Variablen (injection-sicher, T004445)
    assert "name=my-adapter" in text
    assert "base_model=gemma-4-9b-it" in text
    assert "quant=Q8_0" in text


def test_register_mit_provenienz_ruft_upsert_provenance_auf(run_cmd, reg):
    r = run_cmd(["bash", reg["cli"], "register", "my-adapter", "gemma-4-9b-it", "--corpus", "wiki",
                 "--lora-rank", "16", "--lora-alpha", "32", "--git-commit", "abc1234"],
                env=_env(reg, FAKE_ADAPTER_ID="7"))
    assert r.returncode == 0, r.output
    text = _log(reg)
    assert "upsert_provenance" in text
    for needle in ("corpus=wiki", "rank=16", "alpha=32", "git_commit=abc1234"):
        assert needle in text, needle


def test_eval_ohne_dry_run_score_landet_in_upsert_eval_score_aufruf(run_cmd, reg):
    r = run_cmd(["bash", reg["cli"], "eval", "my-adapter", "scout", "--endpoint", f"http://127.0.0.1:{STUB_PORT}/v1"],
                env=_env(reg))
    assert r.returncode == 0, r.output
    text = _log(reg)
    assert "upsert_eval_score" in text
    assert "0.54" in text
    assert '"dry_run": false' in r.output


def test_eval_mit_dry_run_macht_keine_db_calls(run_cmd, reg):
    r = run_cmd(["bash", reg["cli"], "eval", "my-adapter", "scout", "--dry-run",
                 "--endpoint", f"http://127.0.0.1:{STUB_PORT}/v1"], env=_env(reg))
    assert r.returncode == 0, r.output
    assert _no_db_calls(reg)


def test_eval_exit_2_wenn_endpunkt_down_stderr_und_kein_db_call(run_cmd, reg):
    r = run_cmd(["bash", reg["cli"], "eval", "my-adapter", "scout", "--endpoint", "http://127.0.0.1:19999/v1"],
                env=_env(reg))
    assert r.returncode == 2, r.output
    assert "nicht erreichbar" in r.output
    assert _no_db_calls(reg)


def test_stats_dry_run_json_liefert_json_mit_adapter_feld_kein_netzwerk(run_cmd, reg):
    r = run_cmd(["bash", reg["cli"], "stats", "my-adapter", "--dry-run"], env=_env(reg))
    assert r.returncode == 0, r.output
    assert '"adapter": "my-adapter"' in r.output
    assert '"throughput_toks": null' in r.output


def test_list_ruft_list_adapters_mit_role_min_score_auf(run_cmd, reg):
    r = run_cmd(["bash", reg["cli"], "list", "--role", "scout", "--min-score", "0.7"], env=_env(reg))
    assert r.returncode == 0, r.output
    text = _log(reg)
    assert "list_adapters" in text
    assert "role=scout" in text
    assert "min_score=0.7" in text
    assert "name" in r.output


def test_export_loadout_unbekannter_adapter_exit_1(run_cmd, reg):
    r = run_cmd(["bash", reg["cli"], "export-loadout", "unknown-adapter"],
                env=_env(reg, FAKE_GET_ADAPTER_LINE=""))
    assert r.returncode == 1, r.output
    assert "not found" in r.output


def test_export_loadout_mit_daten_liefert_json_block(run_cmd, reg):
    r = run_cmd(["bash", reg["cli"], "export-loadout", "my-adapter"],
                env=_env(reg, FAKE_GET_ADAPTER_LINE="5|my-adapter|gemma-4-9b-it|Q8_0|8192|32768|42.5|3500|0.85|scout"))
    assert r.returncode == 0, r.output
    assert '"slug": "my-adapter"' in r.output
    assert '"minCtx": 32768' in r.output


def test_eval_runner_validiert_das_testset_zu_kurz_exit_1(run_cmd, reg):
    short = reg["tmp"] / "short.jsonl"
    lines = (reg["repo"] / "scripts" / "finetune" / "testsets" / "agent-actions.jsonl").read_text(encoding="utf-8").splitlines(True)
    short.write_text("".join(lines[:10]), encoding="utf-8")
    r = run_cmd(["bash", reg["cli"], "eval", "my-adapter", "scout", "--testset", str(short), "--dry-run",
                 "--endpoint", f"http://127.0.0.1:{STUB_PORT}/v1"], env=_env(reg))
    assert r.returncode == 1, r.output
