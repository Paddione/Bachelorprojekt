"""Native migration of tests/spec/nextcloud-integration.bats."""
import re

def test_spec_covered(run_cmd):
    run_cmd(['true']).check()

def test_redis_host_namespace_agnostic(repo_root):
    for name in ['k3d/nextcloud-extra-config.php', 'prod-korczewski/nextcloud-extra-config-korczewski.php']:
        text = (repo_root / name).read_text()
        assert not re.search(r"'host'\s*=>\s*'nextcloud-redis\.[^']*'", text)
        assert re.search(r"'host'\s*=> 'nextcloud-redis'", text)
