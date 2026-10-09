"""Behavioural probes for the Vision runner's authenticated Brett snapshots."""
import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[4]
RUNNER = ROOT / "tests/e2e/agent/runner.mjs"
HELPER = ROOT / "tests/e2e/agent/read-state.mjs"


def node_probe(body):
    if shutil.which("node") is None:
        pytest.skip("node binary not installed")
    script = rf"""
import assert from 'node:assert/strict';
import {{readFileSync, existsSync}} from 'node:fs';
import {{evaluateFlow}} from {json.dumps((ROOT / 'tests/e2e/agent/oracle.mjs').as_uri())};
const runner = readFileSync({json.dumps(str(RUNNER))}, 'utf8');
const helper = {json.dumps(HELPER.as_uri())};
// Before extraction, execute the actual existing readState implementation.
const readState = existsSync(new URL(helper))
  ? (await import(helper)).readState
  : new Function(runner.match(/async function readState\(page\) {{[\s\S]*?\n}}/)[0] + '; return readState;')();
const base = 'https://brett.example.test';
const flow = {{id:'snapshot', start_url:'/?room=start-room', goal_checks:[{{type:'apiEquals',path:'state.figures',value:[]}}]}};
const calls = [];
let pageUrl = base + '/?room=current-room';
let responseUrl = base + '/api/sessions/current-room/snapshot';
let payload = {{state:{{figures:[]}}, recordedAt:'2026-10-10T10:00:00.000Z'}};
let status = 200;
let malformed = false;
const page = {{url:()=>pageUrl, locator:()=>({{innerText:async()=> 'Figur'}}),
  context:()=>({{request:{{get:async(url, options)=>{{
    calls.push({{url,options}});
    return {{ok:()=>status===200,status:()=>status,url:()=>responseUrl,
      json:async()=>{{if(malformed) throw Error('invalid JSON'); return payload;}}}};
  }}}}}})}};
{body}
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT, text=True, capture_output=True, timeout=15,
    )
    assert result.returncode == 0, result.stdout + result.stderr


def test_api_snapshot_reaches_oracle_using_current_authenticated_context():
    node_probe("""
const state = await readState(page,flow,base);
assert.equal(evaluateFlow({checks:flow.goal_checks},state).pass,true);
assert.deepEqual(state,{url:pageUrl,text:'Figur',apiState:payload});
assert.equal(calls.length,1);
assert.equal(calls[0].url,base+'/api/sessions/current-room/snapshot');
assert.equal(calls[0].options.maxRedirects,0);
assert.ok(calls[0].options.timeout>0 && calls[0].options.timeout<=10000);
""")


@pytest.mark.parametrize("scenario", [
    "status=401;", "malformed=true;", "payload={};",
    "payload={state:null,recordedAt:'now'};", "payload={state:{figures:[]}};",
    "pageUrl=base+'/'; flow.start_url='/';",
    "pageUrl='https://identity.example.test/login';",
    "responseUrl='https://identity.example.test/login';",
    "responseUrl=base+'/login';",
])
def test_snapshot_failures_throw_visible_errors(scenario):
    node_probe(scenario + """
await assert.rejects(()=>readState(page,flow,base),error=>error instanceof Error && error.message.length>0);
""")


def test_foreign_origin_fails_before_request_even_with_start_room():
    node_probe("""
pageUrl='https://identity.example.test/login';
await assert.rejects(()=>readState(page,flow,base));
assert.equal(calls.length,0);
""")


def test_room_is_encoded_and_same_origin_start_room_is_fallback():
    node_probe("""
pageUrl=base+'/'; flow.start_url='/?room=a%2Fb%20%3F%23';
responseUrl=base+'/api/sessions/a%2Fb%20%3F%23/snapshot';
await readState(page,flow,base);
assert.equal(calls[0].url,responseUrl);
""")


def test_foreign_start_url_cannot_supply_room():
    node_probe("""
pageUrl=base+'/'; flow.start_url='//other.example.test/?room=foreign';
await assert.rejects(()=>readState(page,flow,base));
assert.equal(calls.length,0);
""")


def test_text_only_flows_and_assert_observations_make_no_api_request():
    node_probe("""
pageUrl='https://identity.example.test/login';
const expected={url:pageUrl,text:'Figur',apiState:{}};
assert.deepEqual(await readState(page,{goal_checks:[{type:'textContains',value:'Figur'}]},base),expected);
assert.deepEqual(await readState(page),expected);
assert.equal(calls.length,0);
""")


def test_runner_passes_flow_and_base_to_oracle_and_records_snapshot_error():
    node_probe(r"""
const source=runner.slice(runner.indexOf('async function runFlow('),runner.indexOf('\nlet flows;'));
const callsToState=[];
let shouldFail=false;
const spy=async(...args)=>{callsToState.push(args);if(shouldFail)throw Error('snapshot HTTP 401');return {apiState:payload};};
const ctx={addInitScript:async()=>{},newPage:async()=>({...page,goto:async()=>{}})};
const chromium={launch:async()=>({newContext:async()=>ctx,close:async()=>{}})};
const factory=new Function('chromium','AUTH','VIEWPORT','BASE','SYSTEM','MAX_TURNS','MAX_REPAIRS','observe','chat','parseAction','execute','readState','evaluateFlow',source+';return runFlow;');
const run=factory(chromium,'admin.json',{},base,'',1,0,async()=>[],async()=>({text:'done',usage:{}}),()=>({action:'done'}),async()=> 'done',spy,evaluateFlow);
assert.equal((await run(flow,1)).pass,true);
assert.equal(callsToState[0][1],flow);
assert.equal(callsToState[0][2],base);
shouldFail=true;
const failed=await run(flow,1);
assert.equal(failed.pass,false);
assert.equal(failed.error,'snapshot HTTP 401');
assert.equal(failed.oracle,null);
""")
