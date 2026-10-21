"""Unit and security tests for SandboxEngine."""

import pytest
from components.python_sandbox.src.engine import SandboxEngine


@pytest.fixture
def engine():
    return SandboxEngine()


def test_basic_execution(engine):
    code = "print('Hello from Sandbox!')\nprint(42 * 2)"
    res = engine.execute(code)
    assert res.success is True
    assert res.exit_code == 0
    assert "Hello from Sandbox!" in res.stdout
    assert "84" in res.stdout
    assert res.timed_out is False
    assert res.duration_ms > 0


def test_filesystem_isolation(engine):
    # Attempt to read protected host files outside sandbox
    code = """
import os
files_to_check = ['/etc/shadow', '/home/patrick/.ssh', '/root']
accessible = []
for f in files_to_check:
    if os.path.exists(f):
        accessible.append(f)
print('Accessible:', accessible)
"""
    res = engine.execute(code)
    assert res.success is True
    # Host files must be completely invisible/absent inside sandbox
    assert "Accessible: []" in res.stdout


def test_network_isolation(engine):
    # Attempt socket connection - must fail because network namespace is unshared
    code = """
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(1.0)
try:
    s.connect(('127.0.0.1', 80))
    print('CONNECTED')
except Exception as e:
    print('BLOCKED:', type(e).__name__)
"""
    res = engine.execute(code)
    assert res.success is True
    assert "BLOCKED:" in res.stdout
    assert "CONNECTED" not in res.stdout


def test_input_files_and_artifact_collection(engine):
    code = """
with open('input.txt', 'r') as f:
    text = f.read().strip()
with open('result.json', 'w') as f:
    f.write(f'{{"processed": "{text.upper()}"}}')
print('DONE')
"""
    files = {"input.txt": "hello devmesh"}
    res = engine.execute(code, files=files)
    assert res.success is True
    assert "DONE" in res.stdout
    assert "result.json" in res.artifacts
    assert '{"processed": "HELLO DEVMESH"}' in res.artifacts["result.json"]


def test_execution_timeout(engine):
    code = """
import time
time.sleep(5)
print('COMPLETED')
"""
    res = engine.execute(code, timeout_seconds=1)
    assert res.success is False
    assert res.timed_out is True
    assert res.exit_code == 124
    assert "COMPLETED" not in res.stdout


def test_memory_limit(engine):
    # Allocate 300MB when limit is 64MB
    code = """
try:
    data = b'x' * (300 * 1024 * 1024)
    print('ALLOCATED')
except MemoryError:
    print('MEMORY_LIMIT_EXCEEDED')
"""
    res = engine.execute(code, memory_limit_mb=64)
    assert res.success is True
    assert "MEMORY_LIMIT_EXCEEDED" in res.stdout or res.exit_code != 0
    assert "ALLOCATED" not in res.stdout


def test_path_traversal_rejection(engine):
    code = "print('ok')"
    with pytest.raises(ValueError, match="Path traversal"):
        engine.execute(code, files={"../../outside.txt": "bad"})


def test_pytest_runner_pass(engine):
    source = "def add(a, b): return a + b\n"
    test_code = """
from app import add
def test_add():
    assert add(2, 3) == 5
    assert add(-1, 1) == 0
"""
    res = engine.run_pytest(test_code=test_code, source_files={"app.py": source})
    assert res.success is True
    assert res.passed == 1
    assert res.failed == 0
    assert res.exit_code == 0


def test_pytest_runner_fail(engine):
    source = "def add(a, b): return a - b\n"
    test_code = """
from app import add
def test_add():
    assert add(2, 3) == 5
"""
    res = engine.run_pytest(test_code=test_code, source_files={"app.py": source})
    assert res.success is False
    assert res.failed == 1
    assert res.exit_code != 0


def test_bwrap_unavailable_raises_runtime_error():
    engine = SandboxEngine(bwrap_path="/nonexistent/bwrap")
    with pytest.raises(RuntimeError, match="Bubblewrap"):
        engine.execute("print('fail')")
    with pytest.raises(RuntimeError, match="Bubblewrap"):
        engine.run_pytest("def test_x(): pass")

