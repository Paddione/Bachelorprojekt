"""Tests for spec sharding logic in tests/py/conftest.py."""

from unittest.mock import Mock
from tests.py.conftest import pytest_collection_modifyitems


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
