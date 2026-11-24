"""Tests for spec sharding logic in tests/py/conftest.py."""

import importlib.util
import json
from pathlib import Path
from unittest.mock import Mock

# conftest.py per Dateipfad laden (T002448-M4: Verhalten pruefen, kein Source-Grep).
# Ein Paket-Import (`from tests.py.conftest import ...`) haengt davon ab, ob das
# Repo-Root auf sys.path liegt — in CI (uv run) ja, lokal nein. Der Pfad-Import
# funktioniert in beiden Umgebungen identisch.
_CONFTEXT = Path(__file__).resolve().parents[1] / "conftest.py"
_spec = importlib.util.spec_from_file_location("spec_conftest", _CONFTEXT)
assert _spec is not None and _spec.loader is not None
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
_spec_module_weights = _mod._spec_module_weights
pytest_collection_modifyitems = _mod.pytest_collection_modifyitems


class DummyItem:
    def __init__(self, nodeid: str):
        self.nodeid = nodeid

    def __repr__(self) -> str:
        return f"<DummyItem {self.nodeid}>"


def _make_config(shard: int, shards: int) -> Mock:
    config = Mock()
    config._spec_shard = (shard, shards)
    config.hook.pytest_deselected = Mock()
    return config


def test_sharding_disabled_when_shards_lte_one():
    items = [
        DummyItem("spec/test_a.py::test_1"),
        DummyItem("spec/test_b.py::test_2"),
    ]
    config = _make_config(shard=1, shards=1)
    pytest_collection_modifyitems(config, items)
    assert len(items) == 2
    config.hook.pytest_deselected.assert_not_called()


def test_sharding_partitions_items_completely_and_disjointly():
    raw_items = [
        DummyItem("spec/test_heavy.py::test_1"),
        DummyItem("spec/test_heavy.py::test_2"),
        DummyItem("spec/test_heavy.py::test_3"),
        DummyItem("spec/test_heavy.py::test_4"),
        DummyItem("spec/test_medium.py::test_1"),
        DummyItem("spec/test_medium.py::test_2"),
        DummyItem("spec/test_light1.py::test_1"),
        DummyItem("spec/test_light2.py::test_1"),
        DummyItem("spec/test_light3.py::test_1"),
    ]
    shards_total = 4
    collected_per_shard = []
    all_kept = []

    for shard in range(1, shards_total + 1):
        items = list(raw_items)
        config = _make_config(shard=shard, shards=shards_total)
        pytest_collection_modifyitems(config, items)
        collected_per_shard.append([item.nodeid for item in items])
        all_kept.extend(items)

    # Every item from raw_items should appear exactly once across all shards
    assert len(all_kept) == len(raw_items)
    kept_nodeids = [item.nodeid for item in all_kept]
    assert sorted(kept_nodeids) == sorted([item.nodeid for item in raw_items])

    # Module test_heavy (4 tests) must stay together in a single shard
    heavy_shards = [
        idx for idx, shard_items in enumerate(collected_per_shard, 1)
        if any("test_heavy.py" in x for x in shard_items)
    ]
    assert len(heavy_shards) == 1


def test_sharding_balances_weights_using_lpt():
    # 4 shards, modules with test counts: 4, 3, 2, 2, 1, 1, 1, 1 (total: 15)
    # LPT distribution:
    # shard 1: 4
    # shard 2: 3
    # shard 3: 2 + 1 + 1 = 4
    # shard 4: 2 + 1 + 1 = 4
    # weights: [4, 4, 4, 4] or [4, 3, 4, 4]
    raw_items = []
    for i in range(4):
        raw_items.append(DummyItem(f"spec/test_mod4.py::test_{i}"))
    for i in range(3):
        raw_items.append(DummyItem(f"spec/test_mod3.py::test_{i}"))
    for i in range(2):
        raw_items.append(DummyItem(f"spec/test_mod2a.py::test_{i}"))
        raw_items.append(DummyItem(f"spec/test_mod2b.py::test_{i}"))
    for name in ["test_mod1a", "test_mod1b", "test_mod1c", "test_mod1d"]:
        raw_items.append(DummyItem(f"spec/{name}.py::test_0"))

    counts = []
    for shard in range(1, 5):
        items = list(raw_items)
        config = _make_config(shard=shard, shards=4)
        pytest_collection_modifyitems(config, items)
        counts.append(len(items))

    # All shards should receive between 3 and 4 tests (difference <= 1)
    assert max(counts) - min(counts) <= 1
    assert sum(counts) == len(raw_items)


def test_duration_weights_override_test_counts(tmp_path):
    # A module with few tests but high measured seconds must sort before a
    # module with many fast tests. Output-verified via _spec_module_weights,
    # not via source grep (T002448-M4).
    weights_file = tmp_path / "durations.json"
    weights_file.write_text(json.dumps({
        "version": 1,
        "per_test_s": 1.0,
        "modules": {"spec/slow.py": 100.0},
    }))
    module_items = {
        "spec/slow.py": [DummyItem("spec/slow.py::test_0")],
        "spec/fast.py": [DummyItem(f"spec/fast.py::test_{i}") for i in range(10)],
    }
    weights = _spec_module_weights(module_items, _durations_path=weights_file)
    assert weights["spec/slow.py"] == 100.0
    # Unknown module falls back to count * per_test_s.
    assert weights["spec/fast.py"] == 10.0


def test_missing_durations_file_falls_back_to_counts(tmp_path):
    module_items = {"spec/a.py": [DummyItem("spec/a.py::test_0")] * 3}
    weights = _spec_module_weights(
        module_items, _durations_path=tmp_path / "does-not-exist.json")
    assert weights == {"spec/a.py": 3.0}


def test_invalid_durations_file_falls_back_to_counts(tmp_path):
    bad = tmp_path / "bad.json"
    bad.write_text("{not json")
    module_items = {"spec/a.py": [DummyItem("spec/a.py::test_0")] * 2}
    weights = _spec_module_weights(module_items, _durations_path=bad)
    assert weights == {"spec/a.py": 2.0}
