"""Native migration of tests/spec/image-drift.bats."""
import re

def refs(repo_root, family):
    lines=[]
    for name in ['k3d','prod','prod-korczewski']:
        for path in (repo_root/name).rglob('*'):
            if path.is_file():
                for line in path.read_text(errors='replace').splitlines():
                    if re.search(r'image:\s+["\']?'+re.escape(family)+':',line):
                        if family=='busybox' and re.search(r'kube-prometheus-stack-rendered|loki-rendered|promtail-rendered',line):
                            continue
                        lines.append(line)
    return lines

def test_busybox_canonical(repo_root):
    assert all(re.search(r'busybox:1\.38\.0(@sha256|\s|$|")',line) for line in refs(repo_root,'busybox'))

def test_curl_canonical(repo_root):
    assert all(re.search(r'curlimages/curl:8\.21\.0(@sha256|\s|$|")',line) for line in refs(repo_root,'curlimages/curl'))

def normalized(line):
    value=re.sub(r'.*image:\s*','',line).replace('"','').replace("'",'')
    return re.sub(r'@sha256.*','',re.sub(r'\s*#.*','',value))

def test_busybox_single_family(repo_root):
    assert len({normalized(line) for line in refs(repo_root,'busybox')})<=1

def test_curl_single_family(repo_root):
    assert len({normalized(line) for line in refs(repo_root,'curlimages/curl')})<=1
