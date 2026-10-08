"""Native migration of tests/spec/scripts/agent-lock-stale-holder.bats."""

import shutil
import subprocess
import tempfile
import time
from pathlib import Path

# Failing Test für T005560: `agent-lock.sh check ticket` unterscheidet heute
# nicht zwischen lebendigem und totem Halter (immer rc=3/"held"). Ein Lock mit
# totem owner_pid ist aber kein Schutz gegen Doppelbearbeitung — der Write-Guard
# von ticket.sh soll solche Stale-Holder mit Warnung durchlassen. Erwartung:
# rc=4 + Ausgabe "held-stale".


def test_check_ticket_meldet_held_stale_rc_4_bei_totem_owner_pid_t005560(run_cmd, repo_root, tmp_path):
    # Grace-Frist klein setzen (Muster wie T002849): der held-stale-Zweig greift
    # erst nach AGENT_LOCK_GRACE -- ein frischer Claim mit totem owner_pid ist ein
    # Resume-Fenster (T002849) und bleibt "held" (rc=3).
    lock_dir = Path(tempfile.mkdtemp())
    try:
        now = int(time.time())
        # Fixture wie der T005029-Vorfall: lebende (non-numerische) SID, Heartbeat
        # unter der TTL, aber toter owner_pid und Claim älter als die Grace-Frist
        # (nachweislich beendet, kein Resume-Fenster mehr); Worktree EXISTIERT und
        # Branch matcht. Die non-numerische SID verhindert das Reapen durch
        # _reapable (Block 0: SID gilt als lebendig, vor Block 0b) -- genau die
        # T005029-Lücke: der Lock bleibt ewig "held", obwohl der Halter tot ist.
        fixture_wt = tmp_path / "fixture-wt"
        fixture_wt.mkdir()
        subprocess.run(["git", "-C", str(fixture_wt), "init", "-q"], check=True)
        subprocess.run(["git", "-C", str(fixture_wt), "checkout", "-q", "-b",
                        "fix/ticket-lock-stale-pass-T005560"], check=True)
        lock_file = lock_dir / "ticket__T999999.json"
        lock_file.write_text(
            '{"scope":"ticket","id":"T999999","owner_sid":"dead-session-fixture-uuid",'
            '"owner_pid":"999999","tool":"claude","label":"dev-flow-plan",'
            f'"worktree":"{fixture_wt}","branch":"fix/ticket-lock-stale-pass-T005560",'
            '"ticket":"","host":"x",'
            f'"created_at":"{now - 30}","heartbeat_at":"{now - 30}"}}\n')

        # Positiv-Anker (T002356-M1): der Lock ist vorhanden und NICHT reapable --
        # check darf ihn nicht als "free" melden (sonst wäre der Test trivial grün).
        assert lock_file.is_file()

        result = run_cmd(
            ["bash", str(repo_root / "scripts/agent-lock.sh"), "check", "ticket", "T999999"],
            env={"AGENT_LOCK_DIR": str(lock_dir), "NOW": str(now), "AGENT_LOCK_GRACE": "5"},
        )
        assert result.returncode == 4
        assert "held-stale" in result.output
    finally:
        shutil.rmtree(lock_dir, ignore_errors=True)
