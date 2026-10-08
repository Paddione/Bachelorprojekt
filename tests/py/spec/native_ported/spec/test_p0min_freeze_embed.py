"""Native migration of tests/spec/p0min-freeze-embed.bats."""

import hashlib
import json
import os
from pathlib import Path

import pytest

FROZEN_COMMIT = "8fed539b996fdcb89181fa8e8084fec8d299c8ab"


@pytest.fixture
def brain(repo_root):
    base = repo_root / "docs" / "brain"
    return {
        "corpus": base / "corpus-freeze.json",
        "hbmap": base / "handled-by-map.json",
        "report": base / "embed-eval-report.md",
        "index": base / "embed-index.json",
        "repo": repo_root,
    }


def _require_retrieval(brain):
    if not os.environ.get("P0MIN_FORCE_RETRIEVAL") and not brain["index"].is_file():
        pytest.skip("embed pipeline not implemented yet (no docs/brain/embed-index.json) — red-first: P0MIN_FORCE_RETRIEVAL=1 forces the binding FAIL")


def _load_index(brain):
    if not brain["index"].is_file():
        pytest.fail("embed pipeline not implemented yet (no docs/brain/embed-index.json)")
    return json.loads(brain["index"].read_text(encoding="utf-8"))


def test_p0min_g2_corpus_freeze_pin_349_routes_8fed539b(brain):
    assert brain["corpus"].is_file()
    d = json.loads(brain["corpus"].read_text(encoding="utf-8"))
    assert str(d["route_count"]) == "349"
    assert str(d["frozen_at_commit"]) == FROZEN_COMMIT


def test_p0min_g2_handled_by_map_covers_all_349_rows(brain):
    assert brain["hbmap"].is_file()
    d = json.loads(brain["hbmap"].read_text(encoding="utf-8"))
    assert len(d) == 349, len(d)
    assert all(r.get("handled_by") for r in d), "unhandled rows remain"


def test_p0min_g2_eval_report_pins_bge_m3_q8_0_1024d_corpus_hash_k3_snapshot(brain):
    assert brain["report"].is_file()
    text = brain["report"].read_text(encoding="utf-8")
    assert "bge-m3" in text
    assert "Q8_0" in text
    assert "1024" in text
    assert FROZEN_COMMIT in text
    actual = hashlib.sha256(brain["corpus"].read_bytes()).hexdigest()
    assert actual in text


def test_p0min_g2_fsd_zero_fp_denylisted_artefacts_absent_from_corpus_routes(brain):
    d = json.loads(brain["corpus"].read_text(encoding="utf-8"))
    bad = [r["id"] for r in d["routes"] if "repo-index.json" in r["path"] or "openspec-status.json" in r["path"]]
    assert not bad, bad


def test_p0min_g2_fsd_zero_fp_every_frozen_route_path_resolves_on_disk(brain):
    d = json.loads(brain["corpus"].read_text(encoding="utf-8"))
    missing = [r["path"] for r in d["routes"] if not os.path.exists(os.path.join(brain["repo"], r["path"]))]
    assert not missing, missing[:5]


def test_p0min_g2_retrieval_held_out_auth_callback_ts_get_ranks_lib_auth_ts_top_k(brain):
    _require_retrieval(brain)
    idx = _load_index(brain)
    hits = idx["held_out"]["auth/callback.ts:GET"]
    assert "components/website/src/lib/auth.ts" in hits[:5], hits


def test_p0min_g2_retrieval_held_out_billing_create_invoice_ts_post_ranks_lib_stripe_billing_ts_top_k(brain):
    _require_retrieval(brain)
    idx = _load_index(brain)
    hits = idx["held_out"]["billing/create-invoice.ts:POST"]
    assert "components/website/src/lib/stripe-billing.ts" in hits[:5], hits


def test_p0min_g2_retrieval_held_out_brett_bot_ts_post_ranks_lib_brett_bot_ts_top_k(brain):
    _require_retrieval(brain)
    idx = _load_index(brain)
    hits = idx["held_out"]["brett/bot.ts:POST"]
    assert "components/website/src/lib/brett-bot.ts" in hits[:5], hits
