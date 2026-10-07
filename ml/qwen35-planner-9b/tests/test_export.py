import json

import numpy as np
import pytest
from safetensors.numpy import save_file

from planner.export import GraftError, graft


def mk(d, tensors, cfg):
    d.mkdir()
    save_file(tensors, str(d / "model-00001.safetensors"))
    (d / "model.safetensors.index.json").write_text(
        json.dumps({"metadata": {}, "weight_map": {k: "model-00001.safetensors" for k in tensors}}))
    (d / "config.json").write_text(json.dumps(cfg))


ORIG_CFG = {"text_config": {"mtp_num_hidden_layers": 1}}


def test_graft_copies_missing_mtp(tmp_path):
    mk(tmp_path / "o", {"mtp.a": np.ones(2, np.float32), "model.visual.v": np.ones(1, np.float32),
                        "x": np.ones(1, np.float32)}, ORIG_CFG)
    mk(tmp_path / "m", {"x": np.ones(1, np.float32), "model.visual.v": np.ones(1, np.float32)},
       {"text_config": {}})
    assert graft(tmp_path / "m", tmp_path / "o") == 1
    idx = json.loads((tmp_path / "m" / "model.safetensors.index.json").read_text())
    assert idx["weight_map"]["mtp.a"] == "model-graft.safetensors"
    assert idx["weight_map"]["model.visual.v"] == "model-00001.safetensors"
    cfg = json.loads((tmp_path / "m" / "config.json").read_text())
    assert cfg["text_config"]["mtp_num_hidden_layers"] == 1


def test_graft_shape_mismatch(tmp_path):
    mk(tmp_path / "o", {"mtp.a": np.ones(2, np.float32), "model.visual.v": np.ones(1, np.float32)}, ORIG_CFG)
    mk(tmp_path / "m", {"mtp.a": np.ones(3, np.float32)}, {"text_config": {}})
    with pytest.raises(GraftError, match="shape"):
        graft(tmp_path / "m", tmp_path / "o")


def test_graft_missing_in_original(tmp_path):
    mk(tmp_path / "o", {"x": np.ones(1, np.float32)}, ORIG_CFG)
    mk(tmp_path / "m", {"x": np.ones(1, np.float32)}, {"text_config": {}})
    with pytest.raises(GraftError, match="mtp."):
        graft(tmp_path / "m", tmp_path / "o")


def test_graft_is_idempotent(tmp_path):
    mk(tmp_path / "o", {"mtp.a": np.ones(2, np.float32), "model.visual.v": np.ones(1, np.float32)}, ORIG_CFG)
    mk(tmp_path / "m", {"x": np.ones(1, np.float32)}, {"text_config": {}})
    assert graft(tmp_path / "m", tmp_path / "o") == 2
    assert graft(tmp_path / "m", tmp_path / "o") == 0
