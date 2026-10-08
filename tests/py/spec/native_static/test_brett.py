"""Native pytest migration of tests/spec/brett.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_state_ts_figure_carries_hidden_opacity_1(repo_root, run_cmd, tmp_path):
    'state.ts Figure carries hidden + opacity'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', 'hidden\\?: boolean', path_src + '/types/state.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'opacity\\?: number', path_src + '/types/state.ts'])
    assert result.returncode == 0, result.output


def test_state_ts_zone_carries_variant_2(repo_root, run_cmd, tmp_path):
    'state.ts Zone carries variant'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', "variant\\?: 'filled' \\| 'frame'", path_src + '/types/state.ts'])
    assert result.returncode == 0, result.output


def test_messages_ts_declares_zone_update_figure_hide_set_client_variants_3(repo_root, run_cmd, tmp_path):
    'messages.ts declares zone_update + figure_hide_set client variants'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', "type: 'zone_update'", path_src + '/types/messages.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', "type: 'figure_hide_set'", path_src + '/types/messages.ts'])
    assert result.returncode == 0, result.output


def test_messages_ts_declares_zone_updated_figure_hidden_changed_server_variants_4(repo_root, run_cmd, tmp_path):
    'messages.ts declares zone_updated + figure_hidden_changed server variants'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', "type: 'zone_updated'", path_src + '/types/messages.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', "type: 'figure_hidden_changed'", path_src + '/types/messages.ts'])
    assert result.returncode == 0, result.output


def test_ws_handler_admin_types_contains_zone_update_and_figure_hide_set_5(repo_root, run_cmd, tmp_path):
    'ws-handler ADMIN_TYPES contains zone_update and figure_hide_set'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', "'zone_update'", path_src + '/server/ws-handler.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', "'figure_hide_set'", path_src + '/server/ws-handler.ts'])
    assert result.returncode == 0, result.output


def test_figures_ts_applymutation_handles_zone_update_and_figure_hide_set_6(repo_root, run_cmd, tmp_path):
    'figures.ts applyMutation handles zone_update and figure_hide_set'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', "case 'zone_update'", path_src + '/server/figures.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', "case 'figure_hide_set'", path_src + '/server/figures.ts'])
    assert result.returncode == 0, result.output


def test_hidden_filter_ts_exists_and_exports_the_per_recipient_filter_api_7(repo_root, run_cmd, tmp_path):
    'hidden-filter.ts exists and exports the per-recipient filter API'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    assert Path(path_src + '/server/hidden-filter.ts').is_file() and Path(path_src + '/server/hidden-filter.ts').stat().st_size > 0
    result = run_cmd(['grep', '-E', 'export function filterSnapshotFigures\\b', path_src + '/server/hidden-filter.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'export function translateBroadcastForRole\\b', path_src + '/server/hidden-filter.ts'])
    assert result.returncode == 0, result.output


def test_rooms_ts_exports_broadcastroleaware_8(repo_root, run_cmd, tmp_path):
    'rooms.ts exports broadcastRoleAware'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', 'export function broadcastRoleAware\\b', path_src + '/server/rooms.ts'])
    assert result.returncode == 0, result.output


def test_i18n_ts_exists_and_exports_t_setlang_9(repo_root, run_cmd, tmp_path):
    'i18n.ts exists and exports t + setLang'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    assert Path(path_src + '/client/i18n.ts').is_file() and Path(path_src + '/client/i18n.ts').stat().st_size > 0
    result = run_cmd(['grep', '-E', 'export function t\\b', path_src + '/client/i18n.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'export function setLang\\b', path_src + '/client/i18n.ts'])
    assert result.returncode == 0, result.output


def test_ws_message_ground_handles_zone_updated_12(repo_root, run_cmd, tmp_path):
    'ws-message-ground handles zone_updated'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', 'zone_updated', path_src + '/client/ws-message-ground.ts'])
    assert result.returncode == 0, result.output


def test_zone_editor_ts_exists_13(repo_root, run_cmd, tmp_path):
    'zone-editor.ts exists'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    assert Path(path_src + '/client/ui/zone-editor.ts').is_file() and Path(path_src + '/client/ui/zone-editor.ts').stat().st_size > 0


def test_camera_modes_ts_exists_and_exports_the_toggle_api_14(repo_root, run_cmd, tmp_path):
    'camera-modes.ts exists and exports the toggle API'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    assert Path(path_src + '/client/camera-modes.ts').is_file() and Path(path_src + '/client/camera-modes.ts').stat().st_size > 0
    result = run_cmd(['grep', '-E', 'export function (toggleMode|getActiveCamera)\\b', path_src + '/client/camera-modes.ts'])
    assert result.returncode == 0, result.output


def test_pov_panel_ts_exists_15(repo_root, run_cmd, tmp_path):
    'pov-panel.ts exists'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    assert Path(path_src + '/client/ui/pov-panel.ts').is_file() and Path(path_src + '/client/ui/pov-panel.ts').stat().st_size > 0


def test_view_cone_ts_exists_and_exports_updatecone_16(repo_root, run_cmd, tmp_path):
    'view-cone.ts exists and exports updateCone'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    assert Path(path_src + '/client/view-cone.ts').is_file() and Path(path_src + '/client/view-cone.ts').stat().st_size > 0
    result = run_cmd(['grep', '-E', 'export function updateCone\\b', path_src + '/client/view-cone.ts'])
    assert result.returncode == 0, result.output


def test_snapping_ts_exists_and_exports_snap_17(repo_root, run_cmd, tmp_path):
    'snapping.ts exists and exports snap'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    assert Path(path_src + '/client/snapping.ts').is_file() and Path(path_src + '/client/snapping.ts').stat().st_size > 0
    result = run_cmd(['grep', '-E', 'export function snap\\b', path_src + '/client/snapping.ts'])
    assert result.returncode == 0, result.output


def test_fig_panel_wires_figure_hide_set_18(repo_root, run_cmd, tmp_path):
    'fig-panel wires figure_hide_set'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', 'figure_hide_set', path_src + '/client/ui/fig-panel.ts'])
    assert result.returncode == 0, result.output


def test_index_html_seeds_brettfeatures_defaults_19(repo_root, run_cmd, tmp_path):
    'index.html seeds __brettFeatures defaults'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', '__brettFeatures', path_pub + '/index.html'])
    assert result.returncode == 0, result.output


def test_t002006_admin_templates_route_resolves_brand_from_brett_brand_20(repo_root, run_cmd, tmp_path):
    'T002006: admin templates route resolves brand from BRETT_BRAND'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', 'BRETT_BRAND', path_src + '/server/routes/admin.ts'])
    assert result.returncode == 0, result.output


def test_t002006_dblclick_floor_action_is_a_pure_testable_module_21(repo_root, run_cmd, tmp_path):
    'T002006: dblclick floor action is a pure, testable module'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    assert Path(path_src + '/client/board-dblclick.ts').is_file() and Path(path_src + '/client/board-dblclick.ts').stat().st_size > 0
    result = run_cmd(['grep', '-E', 'export function dblclickFloorAction', path_src + '/client/board-dblclick.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'board-dblclick', path_src + '/client/board-boot.ts'])
    assert result.returncode == 0, result.output


def test_t002006_lobby_template_dropdown_surfaces_empty_and_error_feedback_22(repo_root, run_cmd, tmp_path):
    'T002006: lobby template dropdown surfaces empty and error feedback'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', 'Keine Vorlagen vorhanden', path_src + '/client/ui/lobby.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'Vorlagen konnten nicht geladen werden', path_src + '/client/ui/lobby.ts'])
    assert result.returncode == 0, result.output


def test_t002006_shared_styleselect_primitive_is_used_by_hud_topbar_and_zone_editor_23(repo_root, run_cmd, tmp_path):
    'T002006: shared styleSelect primitive is used by hud, topbar and zone-editor'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', 'export function styleSelect', path_src + '/client/ui/primitives.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'styleSelect', path_src + '/client/ui/hud.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'styleSelect', path_src + '/client/ui/topbar-participants.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'styleSelect', path_src + '/client/ui/zone-editor.ts'])
    assert result.returncode == 0, result.output


def test_t002006_fig_panel_spawn_without_open_ws_surfaces_user_feedback_24(repo_root, run_cmd, tmp_path):
    'T002006: fig-panel spawn without open WS surfaces user feedback'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', 'spawnOfflineNotice', path_src + '/client/ui/fig-panel.ts'])
    assert result.returncode == 0, result.output


def test_t002050_figure_drag_ts_exists_and_exports_body_rotation_helpers_25(repo_root, run_cmd, tmp_path):
    'T002050: figure-drag.ts exists and exports body/rotation helpers'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    assert Path(path_src + '/client/figure-drag.ts').is_file() and Path(path_src + '/client/figure-drag.ts').stat().st_size > 0
    result = run_cmd(['grep', '-E', 'export function edgeTabVisible\\b', path_src + '/client/figure-drag.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'export function rotateFacing\\b', path_src + '/client/figure-drag.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'export function applyGrabOffset\\b', path_src + '/client/figure-drag.ts'])
    assert result.returncode == 0, result.output


def test_t002050_state_ts_dragging_supports_body_and_rotate_drag_kinds_26(repo_root, run_cmd, tmp_path):
    'T002050: state.ts dragging supports body and rotate drag kinds'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', "kind: 'body'", path_src + '/client/state.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', "kind: 'rotate'", path_src + '/client/state.ts'])
    assert result.returncode == 0, result.output


def test_t002050_fig_panel_auto_closes_on_addfigure_and_syncs_the_edge_tab_27(repo_root, run_cmd, tmp_path):
    'T002050: fig-panel auto-closes on addFigure and syncs the edge-tab'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', 'syncEdgeTab', path_src + '/client/ui/fig-panel.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'closeFigPanel\\(\\)', path_src + '/client/ui/fig-panel.ts'])
    assert result.returncode == 0, result.output


def test_t002050_index_html_adds_the_edge_tab_and_rotation_slider_28(repo_root, run_cmd, tmp_path):
    'T002050: index.html adds the edge-tab and rotation slider'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', 'id="fig-panel-edge-tab"', path_pub + '/index.html'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', '#fig-panel-edge-tab', path_pub + '/index.html'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'id="fig-rotate-slider"', path_pub + '/index.html'])
    assert result.returncode == 0, result.output


def test_t002050_board_boot_delegates_figure_drag_rotate_to_figure_drag_module_29(repo_root, run_cmd, tmp_path):
    'T002050: board-boot delegates figure drag/rotate to figure-drag module'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-E', "from './figure-drag'", path_src + '/client/board-boot.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'initFigureDrag', path_src + '/client/board-boot.ts'])
    assert result.returncode == 0, result.output


def test_t900360_c_seedfiguremapfromstate_handles_zones_anchors_and_optik_join_flow_seeds_and_broad_34(repo_root, run_cmd, tmp_path):
    'T900360 (c): seedFigureMapFromState handles zones, anchors and optik; join flow seeds and broadcasts'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-q', 'seedFigureMapFromState', path_src + '/server/figures.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'state.zones', path_src + '/server/figures.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'state.anchors', path_src + '/server/figures.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'state.optik', path_src + '/server/figures.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'seedFigureMapFromState', path_src + '/server/ws-connection.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'deps.broadcast', path_src + '/server/ws-connection.ts'])
    assert result.returncode == 0, result.output


def test_t900360_d_join_flow_gates_auto_seed_on_brett_rooms_row_existence_and_resolves_the_is_defau_35(repo_root, run_cmd, tmp_path):
    'T900360 (d): join flow gates auto-seed on brett_rooms row existence and resolves the is_default marker'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-q', 'roomRowExists', path_src + '/server/ws-connection.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'getBrandDefaultTemplate', path_src + '/server/ws-connection.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'brett_rooms', path_src + '/server/db.ts'])
    assert result.returncode == 0, result.output


def test_t900360_e_admin_reset_board_to_default_is_exposed_in_the_admin_layer_and_005_carries_the_i_36(repo_root, run_cmd, tmp_path):
    'T900360 (e): admin_reset_board_to_default is exposed in the admin layer and 005 carries the is_default marker'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-q', "case 'admin_reset_board_to_default'", path_src + '/server/ws-admin-commands.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '--', 'admin_reset_board_to_default', path_src + '/server/ws-handler.ts'])
    assert result.returncode == 0, result.output
    path_mig = path_src + '/server/migrations/005_board_templates_full_staging.sql'
    result = run_cmd(['grep', '-qF', '--', 'is_default', path_mig])
    assert result.returncode == 0, result.output


def test_t900360_f_seedfiguresfromtemplate_reseeds_staged_lines_via_line_create_and_clears_stale_li_37(repo_root, run_cmd, tmp_path):
    'T900360 (f): seedFiguresFromTemplate reseeds staged lines via line_create and clears stale lines'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-q', 'templateState?.lines', path_src + '/server/figures.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-qF', '--', "figs.set('__lines__'", path_src + '/server/figures.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', "type: 'line_create'", path_src + '/server/figures.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'seedFiguresFromTemplate', path_src + '/server/figures.ts'])
    assert result.returncode == 0, result.output


def test_t900360_g_applytemplatetoroom_snapshot_carries_lines_38(repo_root, run_cmd, tmp_path):
    'T900360 (g): applyTemplateToRoom snapshot carries lines'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-q', 'lines: built.lines', path_src + '/server/figures.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'lines?: BrettLine', path_src + '/types/messages.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'msg.lines', path_src + '/client/ws-client.ts'])
    assert result.returncode == 0, result.output


def test_t900361_a_admin_types_contains_admin_set_board_template_39(repo_root, run_cmd, tmp_path):
    'T900361 (a): ADMIN_TYPES contains admin_set_board_template'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-q', 'admin_set_board_template', path_src + '/server/ws-handler.ts'])
    assert result.returncode == 0, result.output


def test_t900361_b_main_ts_wires_onsetboardtemplate_40(repo_root, run_cmd, tmp_path):
    'T900361 (b): main.ts wires onSetBoardTemplate'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-q', 'onSetBoardTemplate', path_src + '/client/main.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'admin_set_board_template', path_src + '/client/main.ts'])
    assert result.returncode == 0, result.output


def test_t900361_c_unknown_template_id_sends_unknown_board_template_error_41(repo_root, run_cmd, tmp_path):
    'T900361 (c): unknown template id sends unknown-board-template error'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-q', 'unknown-board-template', path_src + '/server/ws-admin-commands.ts'])
    assert result.returncode == 0, result.output


def test_t900361_d_client_maps_unknown_board_template_to_toast_42(repo_root, run_cmd, tmp_path):
    'T900361 (d): client maps unknown-board-template to toast'
    path_brett = str(repo_root) + '/components/brett'
    path_src = str(repo_root) + '/components/brett/src'
    path_pub = str(repo_root) + '/components/brett/public'
    result = run_cmd(['grep', '-q', 'unknown-board-template', path_src + '/client/ws-client.ts'])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-q', 'Vorlage nicht gefunden', path_src + '/client/ws-client.ts'])
    assert result.returncode == 0, result.output
