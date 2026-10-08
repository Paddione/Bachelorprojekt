"""Native migration of tests/unit/agent-msg.bats."""
import json

import pytest


@pytest.fixture
def msg(repo_root, tmp_path, run_cmd):
    """Helper-Aufrufe wie _post/_read im BATS-Original; AGENT_MSG_DIR liegt unter tmp_path."""
    helper = str(repo_root / "scripts" / "agent-msg.sh")
    msg_dir = tmp_path / "msgs"

    def _call(sid, *args):
        return run_cmd(["bash", helper, *args], env={"AGENT_LOCK_SID": sid, "AGENT_MSG_DIR": str(msg_dir)})

    class Msg:
        dir = msg_dir

        def post(self, sid, *args):
            return _call(sid, "post", *args)

        def read(self, sid, *args):
            return _call(sid, "read", *args)

        def tail(self, *args):
            return run_cmd(["bash", helper, "tail", *args], env={"AGENT_MSG_DIR": str(msg_dir)})

    return Msg()


def test_post_read_roundtrip(msg):
    msg.post("1111", "hello world").check()
    r = msg.read("2222")
    r.check()
    assert "hello world" in r.output


def test_unread_delivers_each_message_exactly_once_per_sid(msg):
    msg.post("1111", "first").check()
    msg.post("1111", "second").check()
    r = msg.read("2222", "--unread")
    r.check()
    assert "first" in r.output
    assert "second" in r.output
    r = msg.read("2222", "--unread")
    r.check()
    assert r.output == ""


def test_unread_cursor_is_per_sid_independent_readers(msg):
    msg.post("1111", "broadcast-msg").check()
    r = msg.read("2222", "--unread")
    assert "broadcast-msg" in r.output
    r = msg.read("3333", "--unread")
    assert "broadcast-msg" in r.output


def test_directed_to_is_delivered_only_to_target_via_mine(msg):
    msg.post("1111", "for two", "--to", "2222").check()
    r = msg.read("2222", "--mine")
    r.check()
    assert "for two" in r.output
    r = msg.read("3333", "--mine")
    r.check()
    assert "for two" not in r.output


def test_broadcast_without_to_reaches_everyone_via_mine(msg):
    msg.post("1111", "all hands").check()
    r = msg.read("9999", "--mine")
    r.check()
    assert "all hands" in r.output


def test_text_over_4kb_is_truncated_and_warns_on_stderr(msg):
    big = "x" * 5000
    r = msg.post("1111", big)
    r.check()
    assert "truncat" in r.output.lower()
    lines = (msg.dir / "log.jsonl").read_text(encoding="utf-8").splitlines()
    lengths = [len(json.loads(line)["text"]) for line in lines if line.strip()]
    assert lengths, "no record written"
    assert all(n <= 4096 for n in lengths)


def test_tail_prints_human_readable_lines(msg):
    msg.post("1111", "line one").check()
    r = msg.tail("-n", "1")
    r.check()
    assert "line one" in r.output
