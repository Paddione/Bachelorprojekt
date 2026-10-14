"""Native migration of tests/spec/feature-product-linking.bats."""

import json
import os
import shutil

import pytest

FIX_BRAND = "mentolder"
FIX_FEATURE_ID = "T900901"



def _out(r):
    """BATS-$output-Nachbau: stdout und stderr, getrimmt."""
    parts = [r.stdout.rstrip("\n"), r.stderr.rstrip("\n")]
    return "\n".join(p for p in parts if p)


class DbFixture:
    """DB-gestuetzte Tests: _require_db-Nachbau plus Teardown (nur mit TRACKING_DB_URL)."""

    def __init__(self, run_cmd, repo, tmp_path):
        self.run_cmd = run_cmd
        self.repo = repo
        self.script = repo / "scripts/one-shot/2026-07-21-feature-product-backfill.mjs"
        self.url = os.environ["TRACKING_DB_URL"]
        self.mapping_dir = tmp_path / "mapping"
        self.mapping_dir.mkdir()
        self.mapping = self.mapping_dir / "mapping.json"

    def psql(self, sql, check=True):
        r = self.run_cmd(["psql", "-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", self.url, "-c", sql])
        if check:
            r.check()
        return r

    def require(self):
        self.mapping.write_text(
            json.dumps([{"external_id": FIX_FEATURE_ID, "brand": FIX_BRAND,
                         "product_slug": "website", "confidence": 0.9}]) + "\n",
            encoding="utf-8",
        )
        self.psql(
            "INSERT INTO tickets.tickets (external_id, type, brand, title, description, status) "
            f"VALUES ('{FIX_FEATURE_ID}', 'feature', '{FIX_BRAND}', 'BATS fixture feature', 'desc', 'triage') "
            "ON CONFLICT (external_id) DO NOTHING"
        )

    def node(self, *args):
        env = {"BACKFILL_MAPPING_FILE": str(self.mapping), "TRACKING_DB_URL": self.url}
        return self.run_cmd(["node", str(self.script), *args], env=env)

    def parent_id(self):
        return self.psql(f"SELECT parent_id FROM tickets.tickets WHERE external_id='{FIX_FEATURE_ID}'").stdout.strip()

    def teardown(self):
        self.psql(f"DELETE FROM tickets.tickets WHERE external_id = '{FIX_FEATURE_ID}'", check=False)
        self.psql(
            "DELETE FROM tickets.tickets WHERE type='project' AND brand='" + FIX_BRAND + "' AND title='Website'"
            " AND NOT EXISTS (SELECT 1 FROM tickets.tickets f WHERE f.parent_id = tickets.tickets.id"
            " AND f.external_id <> '" + FIX_FEATURE_ID + "')",
            check=False,
        )


@pytest.fixture
def db(run_cmd, repo_root, tmp_path):
    """BATS _require_db: ohne TRACKING_DB_URL bzw. mit Prod-URL -> skip."""
    url = os.environ.get("TRACKING_DB_URL", "")
    if url == "":
        pytest.skip("TRACKING_DB_URL not set")
    if "web.mentolder.de" in url or "web.korczewski.de" in url:
        pytest.skip("refusing to run against prod URL")
    if shutil.which("psql") is None or shutil.which("node") is None:
        pytest.skip("psql/node nicht verfuegbar")
    fx = DbFixture(run_cmd, repo_root, tmp_path)
    fx.require()
    yield fx
    fx.teardown()


def test_backfill_dry_run_does_not_write(db):
    before = db.parent_id()
    r = db.node()
    assert r.returncode == 0, _out(r)
    assert db.parent_id() == before


def test_backfill_apply_links_the_fixture_feature_to_a_type_project_ticket_in_the_same_brand(db):
    r = db.node("--apply")
    assert r.returncode == 0, _out(r)
    r = db.psql(
        "SELECT p.type, p.brand FROM tickets.tickets f JOIN tickets.tickets p ON p.id = f.parent_id "
        f"WHERE f.external_id = '{FIX_FEATURE_ID}'",
        check=False,
    )
    assert r.returncode == 0, _out(r)
    assert "project" in _out(r)
    assert FIX_BRAND in _out(r)


def test_backfill_second_apply_run_is_a_no_op_idempotent(db):
    db.node("--apply").check()
    parent_after_first = db.parent_id()
    r = db.node("--apply")
    assert r.returncode == 0, _out(r)
    assert '"featuresLinked":0' in _out(r), f"second run should link 0 features: {_out(r)}"
    assert db.parent_id() == parent_after_first


def test_backfill_already_linked_features_are_never_overwritten(db):
    other_id = db.psql(
        "INSERT INTO tickets.tickets (type, brand, title, status) "
        f"VALUES ('project', '{FIX_BRAND}', 'BATS pre-existing parent', 'in_progress') RETURNING id"
    ).stdout.splitlines()[0].strip()
    db.psql(f"UPDATE tickets.tickets SET parent_id = '{other_id}' WHERE external_id = '{FIX_FEATURE_ID}'")

    db.node("--apply").check()

    r = db.psql(f"SELECT parent_id FROM tickets.tickets WHERE external_id='{FIX_FEATURE_ID}'", check=False)
    assert r.returncode == 0, _out(r)
    assert other_id in _out(r)
    db.psql(f"DELETE FROM tickets.tickets WHERE id = '{other_id}'", check=False)

# test_create_product_id_* retiriert 2026-10-14: sie riefen scripts/ticket.sh
# create auf (mit dem Ticket-System entfernt). Die Backfill-Tests oben bleiben.
