"""Native migration of tests/spec/workspace-foundation.bats."""

# (T901022)

import json
import os
import re
import shutil
import subprocess

import pytest

HARNESS = r"""
const ROOT = process.env.REPO_ROOT;
const mode = process.argv[2];
const out = (v) => console.log(JSON.stringify(v));
try {
  if (mode === 'me-no-cookie') {
    const { GET } = await import(`file://${ROOT}/components/website/src/pages/api/owner/me.ts`);
    const res = await GET({ request: new Request('http://probe/api/owner/me') });
    out({ status: res.status, body: await res.json() });
  } else if (mode === 'guard-matrix') {
    const g = await import(`file://${ROOT}/components/website/src/lib/owner-guard.ts`);
    const ownerGroups = process.env.WF_NEGATIVE_CONTROL === '1' ? ['workspace-users'] : ['workspace-owners'];
    out({
      nullSession: g.isOwnerSession(null),
      noGroups: g.isOwnerSession({ brand: 'brand-a' }),
      foreign: g.isOwnerSession({ groups: ['workspace-users'], brand: 'brand-a' }),
      owner: g.isOwnerSession({ groups: ownerGroups, brand: 'brand-a' }),
      business: g.ownerBusiness({ groups: ownerGroups, brand: 'brand-a' }),
    });
  } else if (mode === 'db-matrix') {
    const m = await import(`file://${ROOT}/components/website/src/lib/business-memberships.ts`);
    out({
      probe: await m.getMembership('wf-probe-user', 'mentolder'),
      foreign: await m.getMembership('wf-probe-user', 'wf-foreign-brand'),
      foreignList: await m.listMembershipsForBrand('wf-foreign-brand'),
      userList: await m.listMembershipsForUser('wf-probe-user'),
    });
  } else if (mode === 'db-seed') {
    const m = await import(`file://${ROOT}/components/website/src/lib/business-memberships.ts`);
    out(await m.addMembership({ userKey: 'wf-probe-user', brand: 'mentolder', role: 'owner' }));
  } else if (mode === 'db-unseed') {
    const m = await import(`file://${ROOT}/components/website/src/lib/business-memberships.ts`);
    out({ removed: await m.removeMembership('wf-probe-user', 'mentolder') });
  } else {
    throw new Error(`unknown harness mode: ${mode}`);
  }
} catch (err) {
  out({ harness_error: String((err && err.message) || err) });
  process.exitCode = 1;
}
process.exit(process.exitCode ?? 0);
"""

NODE_ME = (
    "const m=require(process.argv[1]);\n"
    "if (m.harness_error) { console.error('harness failed: '+m.harness_error); process.exit(1); }\n"
    "if (m.status!==401) { console.error('expected 401, got '+m.status); process.exit(1); }\n"
    "if (m.body.authenticated!==false) { console.error('expected authenticated:false'); process.exit(1); }\n"
    "if ('access_token' in m.body || 'refresh_token' in m.body) { console.error('token material leaked'); process.exit(1); }\n"
)

NODE_GUARD_DENY = (
    "const g=require(process.argv[1]);\n"
    "if (g.harness_error) { console.error('harness failed: '+g.harness_error); process.exit(1); }\n"
    "for (const k of ['nullSession','noGroups','foreign']) {\n"
    "  if (g[k]!==false) { console.error('expected '+k+'=false, got '+g[k]); process.exit(1); }\n"
    "}\n"
)

NODE_DB_DENY = (
    "const d=require(process.argv[1]);\n"
    "if (d.harness_error) { console.error('harness failed: '+d.harness_error); process.exit(1); }\n"
    "if (d.foreign!==null) { console.error('foreign membership leaked: '+JSON.stringify(d.foreign)); process.exit(1); }\n"
    "if (!Array.isArray(d.foreignList) || d.foreignList.length!==0) { console.error('foreign brand list not empty'); process.exit(1); }\n"
    "if (!d.userList.every((r) => r.brand==='mentolder')) { console.error('user list spans brands'); process.exit(1); }\n"
)

NODE_OWNER = (
    "const g=require(process.argv[1]);\n"
    "if (g.harness_error) { console.error('harness failed: '+g.harness_error); process.exit(1); }\n"
    "if (g.owner!==true) { console.error('expected owner=true, got '+g.owner); process.exit(1); }\n"
    "if (!g.business || g.business.brand!=='brand-a') { console.error('business payload wrong: '+JSON.stringify(g.business)); process.exit(1); }\n"
)

NODE_PROBE_OWNER = (
    "const d=require(process.argv[1]);\n"
    "if (!d.probe || d.probe.role!=='owner') { console.error('expected probe role owner, got '+JSON.stringify(d.probe)); process.exit(1); }\n"
)

SECRET_RE = re.compile(r"SECRET_|PRIVATE KEY|WEBSITE_TENANT_PEPPER|POCKET_ID_[A-Z_]*SECRET|Ag[A-Za-z0-9+/=]{40,}")
TOKEN_RE = re.compile(r"access_token|refresh_token")


@pytest.fixture(scope="module")
def wf(repo_root, tmp_path_factory):
    """BATS setup_file(): resolve tsx, run the staged harness once per mode."""
    tmp = tmp_path_factory.mktemp("workspace_foundation")
    base_url = os.environ.get("WORKSPACE_FOUNDATION_BASE_URL", "http://localhost:4321")
    db_url = os.environ.get("WORKSPACE_FOUNDATION_DB_URL") or os.environ.get("SESSIONS_DATABASE_URL", "")
    tsx = ""
    if (repo_root / "node_modules" / ".bin" / "tsx").is_file():
        tsx = str(repo_root / "node_modules" / ".bin" / "tsx")
    elif (repo_root / "components" / "website" / "node_modules" / ".bin" / "tsx").is_file():
        tsx = str(repo_root / "components" / "website" / "node_modules" / ".bin" / "tsx")
    elif shutil.which("tsx"):
        tsx = "tsx"
    harness = tmp / "wf-harness.mjs"
    harness.write_text(HARNESS)
    state = {"tsx": tsx, "base_url": base_url, "db_url": db_url, "dir": tmp,
             "me": tmp / "me.json", "guard": tmp / "guard.json", "db": tmp / "db.json"}
    if tsx:
        env = {**os.environ, "REPO_ROOT": str(repo_root), "POCKET_ID_WEBSITE_SECRET": "dummy"}

        def run(mode, target, extra=None):
            e = {**env, **(extra or {})}
            p = subprocess.run([tsx, "--no-warnings", str(harness), mode], cwd=str(repo_root),
                               env=e, capture_output=True, text=True)
            if p.returncode == 0:
                target.write_text(p.stdout)
            else:
                target.write_text(json.dumps({"harness_error": f"{mode} failed to run"}))

        run("me-no-cookie", state["me"])
        run("guard-matrix", state["guard"])
        if db_url:
            p = subprocess.run([tsx, "--no-warnings", str(harness), "db-matrix"], cwd=str(repo_root),
                               env={**env, "SESSIONS_DATABASE_URL": db_url}, capture_output=True, text=True)
            state["db"].write_text(p.stdout if p.returncode == 0 else json.dumps({"harness_error": "db-unreachable"}))
    return state


def _need_tsx(wf):
    if not wf["tsx"]:
        pytest.skip("tsx not installed (root npm ci)")


def _need_db(run_cmd, wf):
    _need_tsx(wf)
    if not wf["db_url"]:
        pytest.skip("no database URL (WORKSPACE_FOUNDATION_DB_URL/SESSIONS_DATABASE_URL unset)")
    if wf["db"].is_file() and "db-unreachable" in wf["db"].read_text():
        pytest.skip("database unreachable")


def _http_get(url, out):
    if shutil.which("curl") is None:
        return None
    p = subprocess.run(["curl", "-s", "-m", "3", "-o", str(out), "-w", "%{http_code}", url],
                       capture_output=True, text=True)
    if p.returncode != 0:
        return None
    return p.stdout.strip() or None


def _node(run_cmd, script, json_path):
    return run_cmd(["node", "-e", script, str(json_path)])


def test_unauthenticated_request_to_the_owner_identity_endpoint_is_denied_without_data_leak(run_cmd, wf, tmp_path):
    _need_tsx(wf)
    r = _node(run_cmd, NODE_ME, wf["me"])
    assert r.returncode == 0, r.output
    body = tmp_path / "me-http.json"
    code = _http_get(f"{wf['base_url']}/api/owner/me", body)
    if not code:
        print("http part skipped (target unreachable)")
        return
    assert code == "401", f"FAIL: HTTP {wf['base_url']}/api/owner/me without cookie returned {code}, want 401"
    assert not TOKEN_RE.search(body.read_text(errors="replace")), "FAIL: token material in HTTP body"


def test_sessions_without_the_owner_group_are_denied(run_cmd, wf):
    _need_tsx(wf)
    r = _node(run_cmd, NODE_GUARD_DENY, wf["guard"])
    assert r.returncode == 0, r.output


def test_session_scoped_to_a_foreign_business_is_denied_cross_tenant_isolation(run_cmd, wf):
    _need_db(run_cmd, wf)
    r = _node(run_cmd, NODE_DB_DENY, wf["db"])
    assert r.returncode == 0, r.output


def test_owner_session_is_allowed_and_returns_the_identity_payload(run_cmd, wf):
    _need_tsx(wf)
    r = _node(run_cmd, NODE_OWNER, wf["guard"])
    assert r.returncode == 0, r.output
    if not wf["db"].is_file() or "db-unreachable" in wf["db"].read_text():
        print("db part skipped (no database)")
        return
    r = _node(run_cmd, NODE_PROBE_OWNER, wf["db"])
    assert r.returncode == 0, r.output


def test_owner_routes_ship_no_secret_markers_to_the_client(wf, repo_root, tmp_path):
    web = repo_root / "components" / "website" / "src" / "pages"
    owner_dirs = [web / "owner", web / "api" / "owner"]

    def files_matching(pattern, dirs):
        hits = []
        for d in dirs:
            for p in sorted(d.rglob("*")):
                if p.is_file():
                    for n, line in enumerate(p.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
                        if re.search(pattern, line):
                            hits.append(f"{p}:{n}:{line}")
        return hits

    hits = files_matching(SECRET_RE.pattern, owner_dirs)
    assert not hits, "FAIL: secret markers in owner routes:\n" + "\n".join(hits)
    hits = files_matching(r"access_token|refresh_token", owner_dirs)
    assert not hits, "FAIL: token references in owner routes:\n" + "\n".join(hits)
    hits = files_matching(r"<script", [web / "owner"])
    assert not hits, "FAIL: client script in owner pages (pure SSR expected):\n" + "\n".join(hits)
    body = tmp_path / "leak-http.json"
    code = _http_get(f"{wf['base_url']}/api/owner/me", body)
    if not code:
        print("http part skipped (target unreachable)")
        return
    assert not re.search(r"access_token|refresh_token|SECRET_", body.read_text(errors="replace")), \
        "FAIL: secret markers in HTTP body"
