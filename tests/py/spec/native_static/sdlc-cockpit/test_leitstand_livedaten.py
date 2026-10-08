"""Native pytest migration of tests/spec/sdlc-cockpit/leitstand-livedaten.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_t1_sdlc_observability_redirectet_und_die_platzhalterseite_ist_entfernt_1(repo_root, run_cmd, tmp_path):
    'T1 /sdlc/observability redirectet und die Platzhalterseite ist entfernt'
    path_map = str(repo_root) + '/components/website/src/middleware/redirect-map.ts'
    path_stream = str(repo_root) + '/components/website/src/pages/sdlc/api/cockpit-floor/stream.ts'
    path_leitstand_dir = str(repo_root) + '/components/website/src/components/leitstand'
    path_registry = str(repo_root) + '/components/website/src/lib/sdlc/leitstand-purpose-registry.ts'
    result = run_cmd(['grep', '-qe', "'/sdlc/observability':", path_map])
    assert result.returncode == 0, result.output
    assert not (Path(str(repo_root) + '/components/website/src/pages/sdlc/observability.astro').exists())


def test_t2_factory_floor_stream_ts_laeuft_ueber_cockpit_listen_hub_statt_daten_poll_2(repo_root, run_cmd, tmp_path):
    'T2 factory-floor/stream.ts laeuft ueber cockpit-listen-hub statt Daten-Poll'
    path_map = str(repo_root) + '/components/website/src/middleware/redirect-map.ts'
    path_stream = str(repo_root) + '/components/website/src/pages/sdlc/api/cockpit-floor/stream.ts'
    path_leitstand_dir = str(repo_root) + '/components/website/src/components/leitstand'
    path_registry = str(repo_root) + '/components/website/src/lib/sdlc/leitstand-purpose-registry.ts'
    result = run_cmd(['grep', '-qe', 'cockpit-listen-hub', path_stream])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-ce', 'setInterval(poll', path_stream])
    assert result.returncode == 1, result.output
