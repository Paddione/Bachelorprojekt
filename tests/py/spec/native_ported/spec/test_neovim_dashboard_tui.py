"""Rendered-TUI e2e for the Neovim dashboard (T901043).

test_neovim_dashboard.py probes the Lua modules headless (nvim -l). Nothing
there looks at what a user actually sees. These tests start a real Neovim in
a detached tmux session, drive it with keys and assert on the captured
screen. Plugins come from the user's installed lazy set (snacks.nvim renders
the pages); config comes from the staged dotfiles/nvim; state is isolated.
"""

import os
import shutil
import subprocess
import time
import uuid
from pathlib import Path

import pytest

COLS, ROWS = 120, 36

# Same SSOT as the headless suite: Home order of the fifteen chapters.
HOME_TITLES = [
    "Editor", "Files & Search", "JavaScript / Frontend", "GitHub", "SDLC",
    "Repository & Code Knowledge", "AI & Agents", "Models & Inference",
    "ComfyUI & Images", "ML & Training", "Infrastructure", "MCP Servers",
    "User Services", "Tests & Plans", "Settings & Help",
]

def _data_home() -> Path:
    return Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local/share"))


class _Tui:
    def __init__(self, tmp: Path, config_src: Path, args: str = ""):
        self.name = "nvtui-" + uuid.uuid4().hex[:8]
        config = tmp / "xdg-config"
        shutil.copytree(config_src, config / "nvim")
        state = tmp / "xdg-state"
        state.mkdir()
        env = (
            f"XDG_CONFIG_HOME={config} XDG_STATE_HOME={state} "
            f"XDG_DATA_HOME={_data_home()} NVIM_DASHBOARD_OFFLINE=1"
        )
        subprocess.run(
            ["tmux", "new-session", "-d", "-s", self.name, "-x", str(COLS), "-y", str(ROWS),
             f"env {env} nvim {args}"],
            check=True,
        )

    def keys(self, *keys: str) -> None:
        subprocess.run(["tmux", "send-keys", "-t", self.name, *keys], check=True)

    def screen(self) -> str:
        out = subprocess.run(
            ["tmux", "capture-pane", "-t", self.name, "-p"],
            check=True, capture_output=True, text=True,
        )
        return out.stdout

    def wait_for(self, needle: str, timeout: float = 10.0) -> str:
        deadline = time.time() + timeout
        screen = self.screen()
        while needle not in screen and time.time() < deadline:
            time.sleep(0.25)
            screen = self.screen()
        return screen

    def close(self) -> None:
        subprocess.run(["tmux", "kill-session", "-t", self.name], capture_output=True)


@pytest.fixture
def tui_factory(repo_root, tmp_path):
    if shutil.which("nvim") is None or shutil.which("tmux") is None:
        pytest.skip("nvim oder tmux fehlt")
    config_src = Path(os.environ.get("NVIM_DASHBOARD_CONFIG_SRC", str(repo_root / "dotfiles/nvim")))
    if not (config_src / "init.lua").is_file():
        pytest.skip(f"Dashboard-Config fehlt: {config_src}")
    if not (_data_home() / "nvim/lazy/snacks.nvim").is_dir():
        pytest.skip("snacks.nvim nicht installiert (rendert die Kapitelseiten)")

    made = []

    def make(args: str = "") -> _Tui:
        sub = tmp_path / f"s{len(made)}"
        sub.mkdir()
        tui = _Tui(sub, config_src, args)
        made.append(tui)
        return tui

    yield make
    for tui in made:
        tui.close()


def _wait_started(tui: _Tui) -> None:
    # Statuszeile mit "[No Name]" erscheint, sobald die UI steht.
    tui.wait_for("[No Name]", timeout=15)


def test_neovim_dashboard_tui_chapter_page_renders_its_title_and_action_rows(tui_factory):
    tui = tui_factory()
    _wait_started(tui)
    tui.keys(":Dashboard sdlc", "Enter")
    screen = tui.wait_for("Show Ticket")
    assert "SDLC" in screen, screen
    for row in ("Show Ticket", "Find Similar Tickets", "Lint Plan", "Run CI Gates"):
        assert row in screen, f"Zeile {row!r} fehlt auf dem Bildschirm:\n{screen}"


def test_neovim_dashboard_tui_home_and_chapter_switch_back_and_forth(tui_factory):
    # Regression: opening a second dashboard while one exists rendered an
    # empty buffer (fresh buffer per open is single-shot per window).
    tui = tui_factory()
    _wait_started(tui)
    tui.keys(":Dashboard sdlc", "Enter")
    tui.wait_for("Show Ticket")
    tui.keys(":Dashboard", "Enter")
    screen = tui.wait_for("Settings & Help", timeout=10)
    assert "SDLC" in screen, screen
    tui.keys(":Dashboard sdlc", "Enter")
    screen = tui.wait_for("Show Ticket", timeout=10)
    assert "Show Ticket" in screen, screen


def test_neovim_dashboard_tui_chapter_page_is_not_an_editable_file_buffer(tui_factory):
    tui = tui_factory()
    _wait_started(tui)
    tui.keys(":Dashboard sdlc", "Enter")
    tui.wait_for("Show Ticket")
    tui.keys(":lua vim.g.probe_ft = vim.bo.filetype .. '|' .. vim.bo.buftype", "Enter")
    tui.keys(":echo g:probe_ft", "Enter")
    screen = tui.wait_for("snacks_dashboard")
    assert "snacks_dashboard|nofile" in screen, screen


def test_neovim_dashboard_tui_dashboard_command_renders_all_fifteen_chapters(tui_factory):
    tui = tui_factory()
    _wait_started(tui)
    tui.keys(":Dashboard", "Enter")
    screen = tui.wait_for("Settings & Help", timeout=5)
    missing = [t for t in HOME_TITLES if t not in screen]
    assert not missing, f"Home zeigt nicht: {missing}\n{screen}"


def test_neovim_dashboard_tui_leader_h_renders_all_fifteen_chapters(tui_factory):
    tui = tui_factory()
    _wait_started(tui)
    tui.keys("Space", "h")
    screen = tui.wait_for("Settings & Help", timeout=5)
    missing = [t for t in HOME_TITLES if t not in screen]
    assert not missing, f"<leader>h zeigt nicht: {missing}\n{screen}"


def test_neovim_dashboard_tui_plain_startup_lands_on_the_dashboard_home(tui_factory):
    tui = tui_factory()
    screen = tui.wait_for("Settings & Help", timeout=8)
    missing = [t for t in HOME_TITLES if t not in screen]
    assert not missing, f"Startbildschirm zeigt nicht: {missing}\n{screen}"
