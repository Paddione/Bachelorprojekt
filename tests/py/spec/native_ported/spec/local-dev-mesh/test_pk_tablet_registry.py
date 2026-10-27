"""PK-Tablet in der llm-proxy-Registry des devmesh.

Rerank und Embedding laufen primaer auf dem Tablet, der Cluster ist Rueckfall
(User-Entscheidung D3 2026-10-26: Tablet Prioritaet 5, Cluster Prioritaet 10).
Geprueft werden die gerenderten Manifeste (kubectl kustomize) und die Ketten,
die der Proxy selbst daraus baut (resolveRoleChain), nicht der Quelltext.
"""
import json
import shutil

import pytest
import yaml

TABLET_ADDRESS = '100.94.91.65'


@pytest.fixture(scope='module')
def rendered(repo_root):
    if shutil.which('kubectl') is None:
        pytest.skip('kubectl binary not installed')
    import subprocess
    res = subprocess.run(
        ['kubectl', 'kustomize', '--load-restrictor', 'LoadRestrictionsNone', str(repo_root / 'dev-local' / 'core')],
        capture_output=True, text=True, timeout=180,
    )
    assert res.returncode == 0, res.stderr
    return [d for d in yaml.safe_load_all(res.stdout) if d]


def _get(docs, kind, name):
    hits = [d for d in docs if d['kind'] == kind and d['metadata']['name'] == name]
    assert len(hits) == 1, f'{kind}/{name}: {len(hits)} Treffer'
    return hits[0]


def _backends(docs):
    for d in docs:
        if d['kind'] != 'Deployment':
            continue
        for c in d['spec']['template']['spec']['containers']:
            for e in c.get('env', []) or []:
                if e.get('name') == 'LLM_PROXY_BACKENDS_JSON':
                    return e['value']
    pytest.fail('LLM_PROXY_BACKENDS_JSON in keinem Deployment gefunden')


def _chain(run_cmd, repo_root, role, backends_json):
    if shutil.which('node') is None:
        pytest.skip('node binary not installed')
    js = (
        "import { resolveRoleChain } from './scripts/llm-proxy/bge-routes.mjs';"
        "const b = JSON.parse(process.env.BACKENDS);"
        f"console.log(JSON.stringify(resolveRoleChain('{role}', b, {{}}).map(e => e.baseUrl)));"
    )
    res = run_cmd(['node', '--input-type=module', '-e', js], env={'BACKENDS': backends_json})
    res.check()
    return json.loads(res.stdout.strip().splitlines()[-1])


def test_tablet_service_und_endpointslice(rendered):
    svc = _get(rendered, 'Service', 'llm-gateway-tablet')
    assert 'selector' not in svc['spec']
    assert {p['name']: p['port'] for p in svc['spec']['ports']} == {'embed': 8081}
    eps = _get(rendered, 'EndpointSlice', 'llm-gateway-tablet')
    assert eps['metadata']['labels']['kubernetes.io/service-name'] == 'llm-gateway-tablet'
    assert [a for e in eps['endpoints'] for a in e['addresses']] == [TABLET_ADDRESS]
    assert {p['name']: p['port'] for p in eps['ports']} == {'embed': 8081}


def test_rerank_kette_ohne_tablet(rendered, run_cmd, repo_root):
    # User-Entscheidung 2026-10-26 (loest D3 fuer rerank ab): 40 Kandidaten x 400
    # Zeichen brauchen auf dem Tablet 23,7 s (iGPU) bzw. 26,8 s (AVX-512) gegen
    # 383 ms auf GPU — tablet-rerank ist aus Registry und Geraete-Loadout entfernt.
    backends = _backends(rendered)
    chain = _chain(run_cmd, repo_root, 'rerank', backends)
    assert 'llm-gateway-rerank' in chain[0]
    assert 'http://llm-gateway-tablet:8080' not in chain
    assert 'tablet-rerank' not in {b['name'] for b in json.loads(backends)}


def test_embed_kette_tablet_zuerst_cluster_als_rueckfall(rendered, run_cmd, repo_root):
    # D3 (User-Entscheidung 2026-10-26, Plan-Prioritaet 5): Tablet (Prioritaet 5)
    # ist Erstglied der embed-Kette, der Cluster (Prioritaet 10) Rueckfall.
    chain = _chain(run_cmd, repo_root, 'embed', _backends(rendered))
    assert chain[0] == 'http://llm-gateway-tablet:8081'
    # Cutover: Cluster-Rueckfall zeigt auf das Gemma-Gateway (BGE retiriert);
    # Ordnung (Tablet zuerst, Cluster als Rueckfall) unveraendert.
    assert 'llm-gateway-gemma-embed' in chain[1]


def test_loadouts_rueckfall_ohne_wireguard_adresse(run_cmd, repo_root):
    if shutil.which('node') is None:
        pytest.skip('node binary not installed')
    js = (
        "import { readLoadouts } from './scripts/llm-proxy/loadouts.mjs';"
        "const { doc } = readLoadouts('scripts/llm/loadouts.json');"
        "console.log(JSON.stringify(doc.roles));"
    )
    res = run_cmd(['node', '--input-type=module', '-e', js])
    res.check()
    roles = json.loads(res.stdout.strip().splitlines()[-1])
    urls = [u for r in roles.values() for u in r['chain']]
    # ADR-014: das WireGuard-Mesh 192.168.100.0/24 existiert nicht mehr.
    assert not any('192.168.100.' in u for u in urls), urls
    # D4 (User-Entscheidung 2026-10-26): der E3-Rueckfall fuehrt das Tablet per
    # Dienst-DNS, nicht per IP-Literal. Die IP bleibt per EndpointSlice-
    # und NetworkPolicy-Test gepinnt (siehe oben).
    assert not any(TABLET_ADDRESS in u for u in urls), urls
    assert 'http://llm-gateway-tablet:8080' not in roles['rerank']['chain']
    assert 'http://llm-gateway-tablet:8081' in roles['embed']['chain']


def test_llm_proxy_darf_das_tablet_erreichen(rendered):
    # default-deny-egress sperrt Tailnet-Ziele; ohne diese Freigabe antwortete das
    # Tablet aus workspace mit ECONNREFUSED (2026-10-26).
    pol = _get(rendered, 'NetworkPolicy', 'allow-llm-tablet-egress')
    assert pol['spec']['podSelector'] == {'matchLabels': {'app': 'llm-services'}}
    rules = pol['spec']['egress']
    cidrs = [t['ipBlock']['cidr'] for r in rules for t in r['to']]
    ports = sorted(p['port'] for r in rules for p in r['ports'])
    assert cidrs == [f'{TABLET_ADDRESS}/32']
    # Nur noch Embedding (:8081); Tablet-Rerank (:8080) entfernt 2026-10-26.
    assert ports == [8081]
