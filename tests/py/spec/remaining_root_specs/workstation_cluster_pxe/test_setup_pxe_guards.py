"""Native migration of tests/spec/workstation-cluster-pxe/setup-pxe-guards.bats."""
import pytest

@pytest.fixture
def pxe(repo_root, run_cmd, tmp_path):
    key = tmp_path / 'id_test.pub'
    key.write_text('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAITESTKEYTESTKEYTESTKEY test@example\n')
    return lambda args: run_cmd(['bash', str(repo_root / 'scripts/pxe/setup-pxe.sh'), *args]), key, tmp_path

def test_help(pxe):
    execute, _, _ = pxe
    result = execute(['--help'])
    result.check()
    assert '--ssh-key' in result.output
    assert 'proxy-dhcp' in result.output.lower()

def test_missing_key(pxe):
    execute, _, _ = pxe
    result = execute([])
    assert result.returncode != 0
    assert 'ssh-key' in result.output.lower()

def test_private_key(pxe):
    execute, _, tmp = pxe
    private = tmp / 'id_test'
    private.write_text('-----BEGIN OPENSSH ' + 'PRIV' + 'ATE KEY-----\nabc\n')
    assert execute(['--ssh-key', str(private)]).returncode != 0

def test_valid_key_passes_guard(pxe):
    execute, key, _ = pxe
    result = execute(['--ssh-key', str(key), '--shutdown', 'halt'])
    assert result.returncode != 0
    assert 'ssh-key' not in result.output.lower()
    assert 'shutdown' in result.output.lower()

def test_invalid_http_port(pxe):
    execute, key, _ = pxe
    result = execute(['--ssh-key', str(key), '--http-port', 'achtzig'])
    assert result.returncode != 0
    assert 'http-port' in result.output.lower()

def test_missing_node_map(pxe):
    execute, key, tmp = pxe
    result = execute(['--ssh-key', str(key), '--node-map', str(tmp / 'fehlt.map')])
    assert result.returncode != 0
    assert 'node-map' in result.output.lower()

def test_status(pxe):
    execute, _, tmp = pxe
    result = execute(['--status', '--root', str(tmp / 'leer')])
    result.check()
    assert 'pxe' in result.output.lower()

def test_stop(pxe):
    execute, _, tmp = pxe
    execute(['--stop', '--root', str(tmp / 'leer')]).check()

# Prueft die generierte dnsmasq-Konfiguration ueber deren Ausgabe (--print-dnsmasq-conf), nicht den Quelltext.
def test_print_dnsmasq_conf_beantwortet_uefi_im_proxy_modus(pxe, run_cmd):
    execute, _, tmp = pxe
    result = execute(['--print-dnsmasq-conf', '--iface', 'eth9', '--server-ip', '192.0.2.10', '--root', str(tmp / 'pxe')])
    result.check()
    lines = result.stdout.splitlines()
    assert 'dhcp-range=192.0.2.10,proxy' in lines
    services = [l for l in lines if l.startswith('pxe-service=')]
    assert any(l.startswith('pxe-service=tag:efi-x86_64,X86-64_EFI,') and l.endswith(',bootx64.efi') for l in services), services
    assert any(l.startswith('pxe-service=tag:efi-bc,BC_EFI,') and l.endswith(',bootx64.efi') for l in services), services
    import shutil
    if shutil.which('dnsmasq') is None:
        pytest.skip('dnsmasq binary not installed')
    conf = tmp / 'dnsmasq.conf'
    conf.write_text(result.stdout)
    run_cmd(['dnsmasq', '--test', f'--conf-file={conf}']).check()


# Dokumentationskonvention: Quelltext-Pruefung ist hier das angemessene Mittel.
def test_runbook_nennt_ufw_regel_fuer_dhcp_broadcast(repo_root):
    text = (repo_root / 'docs/runbooks/workstation-cluster-pxe.md').read_text()
    assert any('ufw allow in on' in l and 'port 67' in l for l in text.splitlines())
    assert '0.0.0.0' in text


# --- Profil inference (pxe-inference-tablet) --------------------------------
TABLET_MAC = '84:3A:5B:CB:12:89'


def test_inference_ohne_only_mac_bricht_ab(pxe):
    execute, key, _ = pxe
    result = execute(['--ssh-key', str(key), '--profile', 'inference', '--disk', '/dev/sda'])
    assert result.returncode != 0
    assert 'only-mac' in result.output.lower()


def test_inference_ohne_disk_bricht_ab(pxe):
    execute, key, _ = pxe
    result = execute(['--ssh-key', str(key), '--profile', 'inference', '--only-mac', TABLET_MAC])
    assert result.returncode != 0
    assert 'disk' in result.output.lower()


def test_unbekanntes_profil(pxe):
    execute, key, _ = pxe
    result = execute(['--ssh-key', str(key), '--profile', 'foo'])
    assert result.returncode != 0
    assert 'profile' in result.output.lower()


def test_only_mac_format(pxe):
    execute, key, _ = pxe
    result = execute(['--ssh-key', str(key), '--only-mac', 'zz'])
    assert result.returncode != 0
    assert 'only-mac' in result.output.lower()


def test_print_user_data_inference(pxe):
    import yaml
    execute, key, _ = pxe
    result = execute(['--print-user-data', '--ssh-key', str(key), '--profile', 'inference',
                      '--only-mac', TABLET_MAC, '--disk', '/dev/sda'])
    result.check()
    out = result.stdout
    for needle in ('ubuntu-server-minimal', 'mesa-vulkan-drivers', 'HandleLidSwitch=ignore', 'path: /dev/sda'):
        assert needle in out, needle
    assert 'k3s-join' not in out
    assert 'autoinstall' in yaml.safe_load(out)


def test_print_user_data_cluster_unveraendert(pxe):
    execute, key, _ = pxe
    result = execute(['--print-user-data', '--ssh-key', str(key)])
    result.check()
    assert 'k3s-join.sh' in result.stdout
    assert 'ubuntu-server-minimal' not in result.stdout


def test_dnsmasq_only_mac_filter(pxe):
    execute, _, tmp = pxe
    result = execute(['--print-dnsmasq-conf', '--iface', 'eth9', '--server-ip', '192.0.2.10',
                      '--root', str(tmp / 'pxe'), '--only-mac', TABLET_MAC])
    result.check()
    lines = result.stdout.splitlines()
    assert 'dhcp-mac=set:target,84:3a:5b:cb:12:89' in lines
    services = [l for l in lines if l.startswith('pxe-service=')]
    assert services and all('tag:target' in l for l in services), services


def test_dnsmasq_ohne_filter_ohne_target_tag(pxe):
    execute, _, tmp = pxe
    result = execute(['--print-dnsmasq-conf', '--iface', 'eth9', '--server-ip', '192.0.2.10',
                      '--root', str(tmp / 'pxe')])
    result.check()
    assert 'tag:target' not in result.stdout
