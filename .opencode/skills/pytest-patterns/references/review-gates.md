# Additional pytest review gates

These gates supplement, rather than repeat, this skill's existing fixture, parametrization, isolation and mocking guidance. Adapted from [beagle pytest-code-review](https://github.com/existential-birds/beagle/blob/main/plugins/beagle-python/skills/pytest-code-review/SKILL.md); no separate skill is installed.

1. List the scoped tests (both `test_*.py` and `*_test.py`) and applicable `conftest.py` files before reporting findings. Broader scope is appropriate for a full audit. Every finding cites a file/line or node id and observed evidence.
2. Identify sync/async code and the installed plugins, their versions and configuration before judging markers or event-loop behavior. In pytest-asyncio `auto` mode, async tests need no explicit asyncio marker and async fixtures are adopted automatically. In `strict` mode use the required markers and `pytest_asyncio.fixture`; AnyIO and Trio use their own plugin rules. Do not demand pytest-asyncio conventions from every async suite.
3. Distinguish mock calls from awaits: `assert_called_once_with` does not prove an async dependency was awaited. Where awaiting is the contract, inspect `AsyncMock` usage and `assert_awaited_once_with`/await counts as well as the resulting behavior.
4. For patch critiques, show the namespace where the production code looks up the symbol. Confirm the import/call path before concluding the patch targets the wrong location.
5. Read yield-fixture teardown and setup-failure handling before alleging leaks. Resources acquired before a failing setup need their own cleanup; `finally`/context managers or timely finalizers help. A missing literal `finally` alone is not a defect.
6. Verify async task cancellation is awaited, clients/connections close and fixture/test loop scopes agree. Do not copy an old custom `event_loop` fixture into modern pytest-asyncio without checking the supported lifecycle APIs.

Read current official docs: https://pytest-asyncio.readthedocs.io/en/stable/concepts.html , https://docs.pytest.org/en/stable/how-to/fixtures.html and https://docs.python.org/3/library/unittest.mock.html#unittest.mock.AsyncMock
