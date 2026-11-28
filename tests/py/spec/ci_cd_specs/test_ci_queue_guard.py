"""CI-Queue-Guard gegen p95-Ausreisser (ci.yml).

Der Run 45996916608 (schedule) queue-te Shard 4 fuer 1158.7min bei 2.27min
reiner Laufzeit — reiner Runner-Queue-Stall, den kein `timeout-minutes`
deckt. Der Guard haelt den schedule-spezifischen Queue-Schutz (eigene
concurrency-Betrachtung, kein Cancel von main-Runs) plus den
Shard-4-Rerun-Hinweis als Kommentar in ci.yml fest.

Pruefmodus Quelltext (Test-Resultats-Konvention, Ausnahme wie
test_e2e_runner_image_pin.py): CI-Konfiguration manifestiert sich nur im
Quelltext; Zusicherungen haengen an der Semantik (cron vorhanden,
cancel-Ausdruck ereignisbedingt), nicht am Wortlaut einzelner Meldungen.
"""

import pytest
import yaml


@pytest.fixture
def ci_workflow(repo_root):
    return yaml.safe_load((repo_root / ".github/workflows/ci.yml").read_text())


@pytest.fixture
def ci_text(repo_root):
    return (repo_root / ".github/workflows/ci.yml").read_text()


def test_ci_schedule_queue_guard_present(ci_workflow, ci_text):
    # Positiv-Anker: ohne schedule-Trigger waere jeder Queue-Schutz sinnlos.
    # (YAML 1.1 parst `on:` als True-Schluessel — beide Formen abdecken.)
    on_block = ci_workflow.get("on", ci_workflow.get(True, {}))
    assert "schedule" in on_block, "schedule-Trigger fehlt (G-CI03-Regression)"
    crons = [e.get("cron", "") for e in on_block["schedule"]]
    assert any("17 3" in c for c in crons), "Nightly-cron 17 3 * * * fehlt"
    # Guard: schedule-spezifischer Queue-Schutz als Kommentar in ci.yml.
    assert "schedule-queue-guard" in ci_text, \
        "schedule-queue-guard-Marker fehlt (Queue-Stall 45996916608)"


def test_ci_no_cancel_on_main_and_rerun_hint(ci_workflow, ci_text):
    # Positiv-Anker: concurrency-Block muss existieren, sonst ist die
    # Kandidatenmenge leer und die Negativaussage unten waere vakuos.
    conc = ci_workflow.get("concurrency", {})
    assert conc, "concurrency-Block fehlt"
    assert "group" in conc, "concurrency-Gruppe fehlt"
    assert "cancel-in-progress" in conc, "cancel-in-progress fehlt"
    # Kein unbedingtes Cancel: main-Runs (push/schedule) duerfen nie
    # abgebrochen werden — Cancel nur fuer pull_request-Events.
    cancel = str(conc["cancel-in-progress"])
    assert cancel.strip() != "True", "cancel-in-progress darf auf main nie true sein"
    assert "pull_request" in cancel, \
        "cancel-in-progress muss auf pull_request begrenzt sein"
    # Rerun-Hinweis fuer Shard-4-Fails (Run 46125023106).
    assert "rerun --failed-only" in ci_text, \
        "Shard-4-Rerun-Hinweis (gh run rerun --failed-only) fehlt"
