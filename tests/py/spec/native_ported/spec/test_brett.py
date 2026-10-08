"""Native migration of tests/spec/brett.bats."""
# (Systembrett-Vollausbau, T001931 and follow-ups)
# Structural gates: each `grep` of the bats original becomes a line-based search

# over the file (regex for ERE patterns, literal for grep -F / BRE patterns).

import os
import re
import shutil
from pathlib import Path

import pytest


@pytest.fixture
def brett(repo_root: Path):
    base = repo_root / "components" / "brett"
    return {"src": base / "src", "pub": base / "public"}


def _lines(path: Path) -> list[str]:
    assert path.is_file(), f"missing file: {path}"
    return path.read_text(encoding="utf-8").split("\n")


def _has(path: Path, pattern: str, fixed: bool = False) -> bool:
    for line in _lines(path):
        if (pattern in line) if fixed else re.search(pattern, line):
            return True
    return False


def _nonempty(path: Path) -> bool:
    return path.is_file() and path.stat().st_size > 0


def _awk_range(text: str, start: str, end: str | None) -> str:
    """Emulates awk '/start/,/end/' (end None means 0, i.e. up to EOF)."""
    out = []
    inside = False
    for line in text.split("\n"):
        if not inside and start in line:
            inside = True
        if inside:
            out.append(line)
            if end is not None and end in line:
                inside = False
    return "\n".join(out)


# ── Task 2: shared types & message union ─────────────────────────────────────

def test_state_ts_figure_carries_hidden_and_opacity(brett):
    state = brett["src"] / "types" / "state.ts"
    assert _has(state, r"hidden\?: boolean")
    assert _has(state, r"opacity\?: number")


def test_state_ts_zone_carries_variant(brett):
    assert _has(brett["src"] / "types" / "state.ts", r"variant\?: 'filled' \| 'frame'")


def test_messages_ts_declares_zone_update_and_figure_hide_set_client_variants(brett):
    msgs = brett["src"] / "types" / "messages.ts"
    assert _has(msgs, r"type: 'zone_update'")
    assert _has(msgs, r"type: 'figure_hide_set'")


def test_messages_ts_declares_zone_updated_and_figure_hidden_changed_server_variants(brett):
    msgs = brett["src"] / "types" / "messages.ts"
    assert _has(msgs, r"type: 'zone_updated'")
    assert _has(msgs, r"type: 'figure_hidden_changed'")


# ── Task 3/4: server admin gate registration ─────────────────────────────────

def test_ws_handler_admin_types_contains_zone_update_and_figure_hide_set(brett):
    ws = brett["src"] / "server" / "ws-handler.ts"
    assert _has(ws, r"'zone_update'")
    assert _has(ws, r"'figure_hide_set'")


def test_figures_ts_apply_mutation_handles_zone_update_and_figure_hide_set(brett):
    figs = brett["src"] / "server" / "figures.ts"
    assert _has(figs, r"case 'zone_update'")
    assert _has(figs, r"case 'figure_hide_set'")


# ── Task 4: server-side hidden filtering (E9) ────────────────────────────────

def test_hidden_filter_ts_exists_and_exports_per_recipient_filter_api(brett):
    hf = brett["src"] / "server" / "hidden-filter.ts"
    assert _nonempty(hf)
    assert _has(hf, r"export function filterSnapshotFigures\b")
    assert _has(hf, r"export function translateBroadcastForRole\b")


def test_rooms_ts_exports_broadcast_role_aware(brett):
    assert _has(brett["src"] / "server" / "rooms.ts", r"export function broadcastRoleAware\b")


# ── Task 5: i18n core + locale dictionaries (E8) ─────────────────────────────

def test_i18n_ts_exists_and_exports_t_and_set_lang(brett):
    i18n = brett["src"] / "client" / "i18n.ts"
    assert _nonempty(i18n)
    assert _has(i18n, r"export function t\b")
    assert _has(i18n, r"export function setLang\b")


def test_all_four_locale_dictionaries_exist_and_export_a_default(brett):
    for lang in ("de", "en", "fr", "es"):
        path = brett["src"] / "client" / "locales" / f"{lang}.ts"
        assert _nonempty(path)
        assert _has(path, r"export default")


def test_all_four_locale_dictionaries_have_identical_key_count(brett):
    counts = {}
    for lang in ("de", "en", "fr", "es"):
        path = brett["src"] / "client" / "locales" / f"{lang}.ts"
        counts[lang] = sum(1 for l in _lines(path) if re.search(r"^\s*'[a-zA-Z0-9_.]+':", l))
    assert counts["de"] > 0
    assert counts["de"] == counts["en"]
    assert counts["de"] == counts["fr"]
    assert counts["de"] == counts["es"]


# ── Task 6: zones client + zone_updated handler ──────────────────────────────

def test_ws_message_ground_handles_zone_updated(brett):
    assert _has(brett["src"] / "client" / "ws-message-ground.ts", r"zone_updated")


def test_zone_editor_ts_exists(brett):
    assert _nonempty(brett["src"] / "client" / "ui" / "zone-editor.ts")


# ── Task 8: 2D/3D camera modes (E3) ──────────────────────────────────────────

def test_camera_modes_ts_exists_and_exports_toggle_api(brett):
    cm = brett["src"] / "client" / "camera-modes.ts"
    assert _nonempty(cm)
    assert _has(cm, r"export function (toggleMode|getActiveCamera)\b")


# ── Task 9: POV panel + dialog mode (E5) ─────────────────────────────────────

def test_pov_panel_ts_exists(brett):
    assert _nonempty(brett["src"] / "client" / "ui" / "pov-panel.ts")


# ── Task 10: viewing-cone indicator (E6) ─────────────────────────────────────

def test_view_cone_ts_exists_and_exports_update_cone(brett):
    vc = brett["src"] / "client" / "view-cone.ts"
    assert _nonempty(vc)
    assert _has(vc, r"export function updateCone\b")


# ── Task 11: snapping & alignment guides (E7) ────────────────────────────────

def test_snapping_ts_exists_and_exports_snap(brett):
    sn = brett["src"] / "client" / "snapping.ts"
    assert _nonempty(sn)
    assert _has(sn, r"export function snap\b")


# ── Task 12: hidden-figure client wiring (E9 client) ─────────────────────────

def test_fig_panel_wires_figure_hide_set(brett):
    assert _has(brett["src"] / "client" / "ui" / "fig-panel.ts", "figure_hide_set", fixed=True)


# ── Task 6: feature-flag default-enable ──────────────────────────────────────

def test_index_html_seeds_brett_features_defaults(brett):
    assert _has(brett["pub"] / "index.html", "__brettFeatures", fixed=True)


# ── T002006: Controls-Rework (brett-controls-rework) ─────────────────────────

def test_t002006_admin_templates_route_resolves_brand_from_brett_brand(brett):
    assert _has(brett["src"] / "server" / "routes" / "admin.ts", "BRETT_BRAND", fixed=True)


def test_t002006_dblclick_floor_action_is_a_pure_testable_module(brett):
    mod = brett["src"] / "client" / "board-dblclick.ts"
    assert _nonempty(mod)
    assert _has(mod, r"export function dblclickFloorAction")
    assert _has(brett["src"] / "client" / "board-boot.ts", "board-dblclick", fixed=True)


def test_t002006_lobby_template_dropdown_surfaces_empty_and_error_feedback(brett):
    lobby = brett["src"] / "client" / "ui" / "lobby.ts"
    assert _has(lobby, "Keine Vorlagen vorhanden", fixed=True)
    assert _has(lobby, "Vorlagen konnten nicht geladen werden", fixed=True)


def test_t002006_shared_style_select_primitive_is_used_by_hud_topbar_and_zone_editor(brett):
    ui = brett["src"] / "client" / "ui"
    assert _has(ui / "primitives.ts", r"export function styleSelect")
    assert _has(ui / "hud.ts", "styleSelect", fixed=True)
    assert _has(ui / "topbar-participants.ts", "styleSelect", fixed=True)
    assert _has(ui / "zone-editor.ts", "styleSelect", fixed=True)


def test_t002006_fig_panel_spawn_without_open_ws_surfaces_user_feedback(brett):
    assert _has(brett["src"] / "client" / "ui" / "fig-panel.ts", "spawnOfflineNotice", fixed=True)


# ── T002050: fig-panel edge-drawer + whole-figure drag & 360° rotation ───────

def test_t002050_figure_drag_ts_exists_and_exports_body_rotation_helpers(brett):
    fd = brett["src"] / "client" / "figure-drag.ts"
    assert _nonempty(fd)
    assert _has(fd, r"export function edgeTabVisible\b")
    assert _has(fd, r"export function rotateFacing\b")
    assert _has(fd, r"export function applyGrabOffset\b")


def test_t002050_state_ts_dragging_supports_body_and_rotate_drag_kinds(brett):
    state = brett["src"] / "client" / "state.ts"
    assert _has(state, r"kind: 'body'")
    assert _has(state, r"kind: 'rotate'")


def test_t002050_fig_panel_auto_closes_on_add_figure_and_syncs_edge_tab(brett):
    fp = brett["src"] / "client" / "ui" / "fig-panel.ts"
    assert _has(fp, r"syncEdgeTab")
    assert _has(fp, r"closeFigPanel\(\)")


def test_t002050_index_html_adds_edge_tab_and_rotation_slider(brett):
    idx = brett["pub"] / "index.html"
    assert _has(idx, r'id="fig-panel-edge-tab"')
    assert _has(idx, r"#fig-panel-edge-tab")
    assert _has(idx, r'id="fig-rotate-slider"')


def test_t002050_board_boot_delegates_figure_drag_rotate_to_figure_drag_module(brett):
    bb = brett["src"] / "client" / "board-boot.ts"
    assert _has(bb, "from './figure-drag'", fixed=True)
    assert _has(bb, r"initFigureDrag")


# ── T900360: systembrett-presets — p5 RED-to-GREEN coverage ─────────────────

def _run_psql(run_cmd, *args, env_extra=None):
    env = {"PGCONNECT_TIMEOUT": "2"}
    if env_extra:
        env.update(env_extra)
    if shutil.which("psql") is None:
        class _Missing:
            returncode = 127
            stdout = ""
            stderr = "psql: command not found"
            output = "psql: command not found"
        return _Missing()
    return run_cmd(["psql", *args], env=env)


def test_t900360_a_005_double_apply_is_idempotent_system_row_count_stable_no_dupes(run_cmd, brett):
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        pytest.skip("DATABASE_URL unset — no postgres for the 005 double-apply run")

    probe = _run_psql(run_cmd, database_url, "-tAc", "SELECT 1")
    if probe.returncode != 0:
        pytest.skip("no postgres server reachable via DATABASE_URL (probe: psql SELECT 1)")

    mig = brett["src"] / "server" / "migrations" / "005_board_templates_full_staging.sql"
    attempt = 0
    res = None
    while attempt < 3:
        res = _run_psql(
            run_cmd,
            database_url, "-v", "ON_ERROR_STOP=1", "-q",
            "-f", str(mig),
            "-tAc", "SELECT count(*) FROM brett.board_templates WHERE is_system IS TRUE",
            "-f", str(mig),
            "-tAc", "SELECT count(*) FROM brett.board_templates WHERE is_system IS TRUE",
            "-tAc", "SELECT count(*) FROM (SELECT brand, name FROM brett.board_templates "
                    "WHERE is_system IS TRUE GROUP BY brand, name HAVING count(*) > 1) d",
            env_extra={"PGOPTIONS": "-c client_min_messages=WARNING"},
        )
        if res.returncode == 0:
            break
        if "ERROR:" in res.output:
            break
        attempt += 1

    if res.returncode != 0:
        if "ERROR:" in res.output:
            raise AssertionError(res.output)
        pytest.skip(f"no postgres server reachable via DATABASE_URL (connection error after {attempt} attempts)")

    values = res.output.split("\n")
    first, second, dupes = (int(values[0]), int(values[1]), int(values[2]))
    assert first >= 3
    assert first == second
    assert dupes == 0


def test_t900360_b1_005_stages_all_three_system_template_names(brett):
    mig = brett["src"] / "server" / "migrations" / "005_board_templates_full_staging.sql"
    assert _nonempty(mig)
    for name in ("Familiensystem 4 Personen", "Team-Konflikt", "Innere Anteile"):
        assert _has(mig, name, fixed=True), f"missing {name}"


def test_t900360_b2_every_staged_state_has_two_distinct_colors_plus_facing_y_and_pose(brett):
    mig = brett["src"] / "server" / "migrations" / "005_board_templates_full_staging.sql"
    assert _nonempty(mig)
    text = mig.read_text(encoding="utf-8")
    fam = _awk_range(text, "Familiensystem 4 Personen", "Team-Konflikt")
    team = _awk_range(text, "Team-Konflikt", "Innere Anteile")
    inn = _awk_range(text, "Innere Anteile", None)
    for block in (fam, team, inn):
        colors = set(re.findall(r'"color":"#[0-9a-fA-F]{6}"', block))
        assert len(colors) >= 2
        assert "facingY" in block
        assert '"preset":' in block


def test_t900360_b3_every_staged_state_carries_zones_anchors_and_optik(brett):
    mig = brett["src"] / "server" / "migrations" / "005_board_templates_full_staging.sql"
    assert _nonempty(mig)
    text = mig.read_text(encoding="utf-8")
    fam = _awk_range(text, "Familiensystem 4 Personen", "Team-Konflikt")
    team = _awk_range(text, "Team-Konflikt", "Innere Anteile")
    inn = _awk_range(text, "Innere Anteile", None)
    for block in (fam, team, inn):
        for token in ('"zones":', '"anchors":', '"floor":', '"sky":', '"lightMood":'):
            assert token in block, f"{token} missing"


def test_t900360_c_seed_path_handles_zones_anchors_optik_and_join_flow_seeds_and_broadcasts(brett):
    figs = brett["src"] / "server" / "figures.ts"
    wsc = brett["src"] / "server" / "ws-connection.ts"
    assert _has(figs, "seedFigureMapFromState", fixed=True)
    assert _has(figs, "state.zones", fixed=True)
    assert _has(figs, "state.anchors", fixed=True)
    assert _has(figs, "state.optik", fixed=True)
    assert _has(wsc, "seedFigureMapFromState", fixed=True)
    assert _has(wsc, "deps.broadcast", fixed=True)


def test_t900360_d_join_flow_gates_auto_seed_on_brett_rooms_row_existence(brett):
    wsc = brett["src"] / "server" / "ws-connection.ts"
    assert _has(wsc, "roomRowExists", fixed=True)
    assert _has(wsc, "getBrandDefaultTemplate", fixed=True)
    assert _has(brett["src"] / "server" / "db.ts", "brett_rooms", fixed=True)


def test_t900360_e_admin_reset_board_to_default_exposed_and_005_carries_is_default_marker(brett):
    mig = brett["src"] / "server" / "migrations" / "005_board_templates_full_staging.sql"
    assert _has(brett["src"] / "server" / "ws-admin-commands.ts", "case 'admin_reset_board_to_default'", fixed=True)
    assert _has(brett["src"] / "server" / "ws-handler.ts", "admin_reset_board_to_default", fixed=True)
    assert _has(mig, "is_default", fixed=True)


def test_t900360_f_seed_from_template_reseeds_staged_lines_via_line_create_and_clears_stale_lines(brett):
    figs = brett["src"] / "server" / "figures.ts"
    assert _has(figs, "templateState?.lines", fixed=True)
    assert _has(figs, "figs.set('__lines__'", fixed=True)
    assert _has(figs, "type: 'line_create'", fixed=True)
    assert _has(figs, "seedFiguresFromTemplate", fixed=True)


def test_t900360_g_apply_template_to_room_snapshot_carries_lines(brett):
    assert _has(brett["src"] / "server" / "figures.ts", "lines: built.lines", fixed=True)
    assert _has(brett["src"] / "types" / "messages.ts", "lines?: BrettLine", fixed=True)
    assert _has(brett["src"] / "client" / "ws-client.ts", "msg.lines", fixed=True)


# ── T900361: lobby preset selection applies the board template ───────────────

def test_t900361_a_admin_types_contains_admin_set_board_template(brett):
    assert _has(brett["src"] / "server" / "ws-handler.ts", "admin_set_board_template", fixed=True)


def test_t900361_b_main_ts_wires_on_set_board_template(brett):
    main = brett["src"] / "client" / "main.ts"
    assert _has(main, "onSetBoardTemplate", fixed=True)
    assert _has(main, "admin_set_board_template", fixed=True)


def test_t900361_c_unknown_template_id_sends_unknown_board_template_error(brett):
    assert _has(brett["src"] / "server" / "ws-admin-commands.ts", "unknown-board-template", fixed=True)


def test_t900361_d_client_maps_unknown_board_template_to_toast(brett):
    ws = brett["src"] / "client" / "ws-client.ts"
    assert _has(ws, "unknown-board-template", fixed=True)
    assert _has(ws, "Vorlage nicht gefunden", fixed=True)
