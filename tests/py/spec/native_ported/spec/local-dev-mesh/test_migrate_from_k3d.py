"""Native migration of tests/spec/local-dev-mesh/migrate-from-k3d.bats."""

import os

import pytest

KUBECTL_STUB = """#!/usr/bin/env bash
echo "$*" >> "$STUB_LOG"
ctx="$(sed -nE 's/.*--context[= ]([^ ]+).*/\\1/p' <<<"$*")"
db="$(sed -nE 's/.* -d ([^ ]+).*/\\1/p' <<<"$*")"
case " $* " in
  *" config get-contexts "*) printf 'devmesh\\nfleet\\n' ;;
  *" get pod "*)             echo "pod/shared-db-0" ;;
  *" exec "*)                cat "$STUB_DIR/counts-$ctx-$db" ;;
esac
"""


@pytest.fixture
def mig(repo_root, tmp_path, monkeypatch):
    fix = tmp_path
    dump_dir = fix / "dump"
    dump_dir.mkdir()
    (fix / "bin").mkdir()
    stub_log = fix / "kubectl.log"
    stub_log.write_text("")
    src_dump = fix / "cluster.sql"
    src_dump.write_text(
        "\\connect pocket_id\n"
        "COPY public.users (id, username) FROM stdin;\n"
        "1 alice\n2 bob\n3 carol\n"
        "\\.\n"
        "COPY public.oidc_clients (id, name) FROM stdin;\n"
        "\\.\n"
        "\\connect website\n"
        "COPY tickets.tickets (id) FROM stdin;\n"
        "a\nb\nc\nd\n"
        "\\.\n"
    )
    kubectl = fix / "bin" / "kubectl"
    kubectl.write_text(KUBECTL_STUB)
    kubectl.chmod(0o755)
    monkeypatch.setenv("STUB_DIR", str(fix))
    monkeypatch.setenv("STUB_LOG", str(stub_log))
    monkeypatch.setenv("DEVMESH_DUMP_DIR", str(dump_dir))
    monkeypatch.setenv("DEVMESH_MIGRATE_DBS", "pocket_id website")
    monkeypatch.setenv("DEVMESH_SRC_DUMP", str(src_dump))
    monkeypatch.setenv("PATH", f"{fix / 'bin'}:{os.environ.get('PATH', '')}")
    monkeypatch.delenv("DEVMESH_DST_CTX", raising=False)
    return {
        "script": repo_root / "scripts" / "devmesh" / "migrate-from-k3d.sh",
        "fix": fix,
        "dump_dir": dump_dir,
        "stub_log": stub_log,
        "src_dump": src_dump,
    }


def _has_exact_line(path, line):
    return line in path.read_text().splitlines()


def test_counts_die_zeilenzahlen_kommen_aus_dem_dump_je_datenbank_eine_datei(mig, run_cmd):
    res = run_cmd(["bash", str(mig["script"]), "counts"])
    assert res.returncode == 0, res.output
    assert _has_exact_line(mig["dump_dir"] / "pocket_id.counts", "public.users|3")
    assert _has_exact_line(mig["dump_dir"] / "pocket_id.counts", "public.oidc_clients|0")
    assert _has_exact_line(mig["dump_dir"] / "website.counts", "tickets.tickets|4")


def test_verify_gleiche_zeilenzahlen_enden_mit_exit_0(mig, run_cmd):
    (mig["dump_dir"] / "pocket_id.counts").write_text("public.users|3\npublic.oidc_clients|0\n")
    (mig["dump_dir"] / "website.counts").write_text("tickets.tickets|4\n")
    (mig["fix"] / "counts-devmesh-pocket_id").write_text((mig["dump_dir"] / "pocket_id.counts").read_text())
    (mig["fix"] / "counts-devmesh-website").write_text((mig["dump_dir"] / "website.counts").read_text())
    res = run_cmd(["bash", str(mig["script"]), "verify"])
    assert res.returncode == 0, res.output
    assert any("ok" in l and "website.tickets.tickets" in l for l in res.output.splitlines())


def test_verify_abweichende_tabelle_endet_mit_exit_1_und_wird_genannt(mig, run_cmd):
    (mig["dump_dir"] / "pocket_id.counts").write_text("public.users|3\n")
    (mig["dump_dir"] / "website.counts").write_text("tickets.tickets|4\n")
    (mig["fix"] / "counts-devmesh-pocket_id").write_text((mig["dump_dir"] / "pocket_id.counts").read_text())
    (mig["fix"] / "counts-devmesh-website").write_text("tickets.tickets|3\n")
    res = run_cmd(["bash", str(mig["script"]), "verify"])
    assert res.returncode == 1, res.output
    lines = res.output.splitlines()
    assert any("ok" in l and "pocket_id.public.users" in l for l in lines)
    assert any("ABWEICHUNG" in l and "website.tickets.tickets" in l for l in lines)


def test_preflight_fehlender_dump_ist_vorbedingung_exit_2_und_wird_benannt(mig, run_cmd):
    missing = str(mig["fix"] / "gibt-es-nicht.sql.gz")
    res = run_cmd(["bash", str(mig["script"]), "preflight"], env={"DEVMESH_SRC_DUMP": missing})
    assert res.returncode == 2, res.output
    assert "gibt-es-nicht.sql.gz" in res.output


def test_preflight_vorhandener_dump_und_zulaessiges_ziel_bestehen(mig, run_cmd):
    res = run_cmd(["bash", str(mig["script"]), "preflight"])
    assert res.returncode == 0, res.output
    assert str(mig["src_dump"]) in res.output


def test_fleet_als_ziel_wird_vor_dem_ersten_kubectl_aufruf_verweigert(mig, run_cmd):
    res = run_cmd(["bash", str(mig["script"]), "verify"], env={"DEVMESH_DST_CTX": "fleet"})
    assert res.returncode == 1, res.output
    assert "verweigert" in res.output
    assert mig["stub_log"].read_text() == ""


def test_restore_ist_kein_unterbefehl_mehr(mig, run_cmd):
    res = run_cmd(["bash", str(mig["script"]), "restore"])
    assert res.returncode == 2
    assert mig["stub_log"].read_text() == ""
