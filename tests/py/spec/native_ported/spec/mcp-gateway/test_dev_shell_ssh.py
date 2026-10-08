"""Native migration of tests/spec/mcp-gateway/dev-shell-ssh.bats."""

import re
from pathlib import Path

import yaml


def _first_doc(path: Path):
    """First non-empty YAML document, mirroring the node helper `y` (filter(Boolean))."""
    docs = [d for d in yaml.safe_load_all(path.read_text(encoding="utf-8")) if d]
    return docs[0]


def _clean_lines(path: Path) -> list:
    """File lines with CR removed (tr -d '\\r')."""
    return path.read_text(encoding="utf-8").replace("\r", "").split("\n")


def _count_lines(path: Path, pattern: str) -> int:
    return sum(1 for line in _clean_lines(path) if re.search(pattern, line))


def _js_str(value) -> str:
    """JS String() rendering for the values these guards compare."""
    if value is None:
        return "undefined"
    if isinstance(value, bool):
        return "true" if value else "false"
    return str(value)


def _containers(deploy: dict, name: str = None) -> list:
    containers = deploy["spec"]["template"]["spec"]["containers"]
    return [c for c in containers if name is None or c.get("name") == name]


def _volumes(deploy: dict) -> list:
    return deploy["spec"]["template"]["spec"].get("volumes") or []


def _volname_for_claim(deploy: dict, claim: str) -> str:
    names = [v["name"] for v in _volumes(deploy) if v.get("persistentVolumeClaim", {}).get("claimName") == claim]
    return names[0] if names else ""


def _mounts(deploy: dict, volname: str) -> list:
    out = []
    for c in _containers(deploy, "dev-shell"):
        out.extend(m for m in (c.get("volumeMounts") or []) if m.get("name") == volname)
    return out


def _flat_dockerfile(path: Path) -> list:
    """Drop comment lines, join backslash continuations (sed ':a' -e '/\\\\$/N' ...)."""
    kept = [l for l in path.read_text(encoding="utf-8").replace("\r", "").split("\n")
            if not re.match(r"^\s*#", l)]
    out, buf = [], ""
    for line in kept:
        if line.endswith("\\"):
            buf += line[:-1] + " "
            continue
        out.append(buf + line)
        buf = ""
    if buf:
        out.append(buf)
    return out


def _deploy(repo_root: Path) -> dict:
    return _first_doc(repo_root / "k3d" / "dev-pod" / "deployment.yaml")


def test_dev_shell_container_exists_with_the_dev_shell_image(repo_root):
    """dev-shell container exists with the dev-shell image"""
    images = ",".join(str(c.get("image")) for c in _containers(_deploy(repo_root), "dev-shell"))
    assert images.startswith("ghcr.io/paddione/dev-shell"), images


def test_dev_shell_runs_as_uid_1000_and_the_pod_stays_runasnonroot(repo_root):
    """dev-shell runs as uid 1000 and the pod stays runAsNonRoot"""
    deploy = _deploy(repo_root)
    assert _js_str(deploy["spec"]["template"]["spec"]["securityContext"]["runAsNonRoot"]) == "true"
    sc = [
        f"{c['securityContext']['runAsUser']}/{_js_str(c['securityContext']['allowPrivilegeEscalation'])}"
        for c in _containers(deploy, "dev-shell")
    ]
    assert ",".join(sc) == "1000/false"


def test_pod_skips_the_recursive_fsgroup_chown_when_the_volume_root_already_matches(repo_root):
    """pod skips the recursive fsGroup chown when the volume root already matches"""
    sc = _deploy(repo_root)["spec"]["template"]["spec"]["securityContext"]
    assert _js_str(sc.get("fsGroup")) == "1000"
    assert _js_str(sc.get("fsGroupChangePolicy")) == "OnRootMismatch"


def test_dev_shell_has_no_readinessprobe_that_could_mark_the_pod_notready(repo_root):
    """dev-shell has no readinessProbe that could mark the pod NotReady"""
    deploy = _deploy(repo_root)
    # Positiv-Anker: mcp-node gatet die Service-Endpunkte mit einer readinessProbe.
    mcp_node_probes = [c for c in _containers(deploy, "mcp-node") if c.get("readinessProbe")]
    assert len(mcp_node_probes) == 1

    dev_shell = _containers(deploy, "dev-shell")
    assert ",".join(_js_str("readinessProbe" not in c) for c in dev_shell) == "true"

    commands = []
    for c in dev_shell:
        cmd = ((c.get("livenessProbe") or {}).get("exec") or {}).get("command") or []
        commands.append(" ".join(str(x) for x in cmd))
    assert "nc -z -w 2 127.0.0.1 22" in ",".join(commands)


def test_pod_declares_ip_unprivileged_port_start_0(repo_root):
    """pod declares ip_unprivileged_port_start=0"""
    sysctls = _deploy(repo_root)["spec"]["template"]["spec"]["securityContext"].get("sysctls") or []
    values = [str(s.get("value")) for s in sysctls if s.get("name") == "net.ipv4.ip_unprivileged_port_start"]
    assert ",".join(values) == "0"


def test_port_22_is_neither_a_containerport_nor_a_service_port(repo_root):
    """port 22 is neither a containerPort nor a service port"""
    deploy = _deploy(repo_root)
    svc = _first_doc(repo_root / "k3d" / "dev-pod" / "service.yaml")

    # Positiv-Anker.
    assert len(_containers(deploy, "dev-shell")) == 1
    assert len(svc.get("spec", {}).get("ports") or []) >= 1
    container_ports = [p.get("containerPort") for c in deploy["spec"]["template"]["spec"]["containers"]
                       for p in (c.get("ports") or [])]
    assert len(container_ports) >= 1

    assert len([p for p in container_ports if str(p) == "22"]) == 0
    svc_ports = []
    for p in svc["spec"].get("ports") or []:
        svc_ports.extend([p.get("port"), p.get("targetPort")])
    assert len([p for p in svc_ports if str(p) == "22"]) == 0


def test_sshd_listens_on_loopback_only_and_disables_password_and_root_login(repo_root):
    """sshd listens on loopback only and disables password and root login"""
    sshd = repo_root / "docker" / "dev-shell" / "sshd_config"
    assert sshd.is_file(), "erwartet: docker/dev-shell/sshd_config"

    # Positiv-Anker.
    assert _count_lines(sshd, r"^Port 22$") == 1

    for directive in ("ListenAddress 127.0.0.1", "PasswordAuthentication no",
                      "KbdInteractiveAuthentication no", "PermitRootLogin no",
                      "AllowUsers patrick gekko"):
        assert _count_lines(sshd, f"^{directive}$") == 1, directive

    foreign = [l for l in _clean_lines(sshd)
               if re.search(r"^ListenAddress", l) and not re.search(r"^ListenAddress 127.0.0.1$", l)]
    assert len(foreign) == 0


def test_sshd_denies_agent_socket_tunnel_and_gateway_forwarding(repo_root):
    """sshd denies agent, socket, tunnel and gateway forwarding"""
    sshd = repo_root / "docker" / "dev-shell" / "sshd_config"
    assert sshd.is_file(), "erwartet: docker/dev-shell/sshd_config"

    # Positiv-Anker: lokales TCP-Forwarding bleibt erlaubt.
    assert _count_lines(sshd, r"^AllowTcpForwarding local$") == 1

    for opt in ("AllowAgentForwarding", "AllowStreamLocalForwarding", "PermitTunnel",
                "GatewayPorts", "PermitUserEnvironment"):
        assert _count_lines(sshd, f"^{opt} no$") == 1, opt
        assert _count_lines(sshd, f"^{opt} ") == 1, opt

    assert _count_lines(sshd, r"^Match[ \t]") == 0


def test_ssh_sessions_reach_the_api_server_and_do_not_self_update_claude_code(repo_root):
    """ssh sessions reach the API server and do not self-update claude code"""
    sshd = repo_root / "docker" / "dev-shell" / "sshd_config"
    assert sshd.is_file(), "erwartet: docker/dev-shell/sshd_config"

    assert _count_lines(sshd, r"^SetEnv ") == 1

    setenv_tokens = []
    for line in _clean_lines(sshd):
        if re.search(r"^SetEnv ", line):
            setenv_tokens.extend(line.split(" ", 1)[1].split(" "))
    setenv_tokens = sorted(setenv_tokens)

    for kv in ("KUBERNETES_SERVICE_HOST=kubernetes.default.svc", "KUBERNETES_SERVICE_PORT=443",
               "DISABLE_AUTOUPDATER=1"):
        assert setenv_tokens.count(kv) == 1, kv


def test_each_login_name_is_configured_with_only_its_own_authorized_keys_file(repo_root):
    """each login name is configured with only its own authorized_keys file"""
    sshd = repo_root / "docker" / "dev-shell" / "sshd_config"
    assert sshd.is_file(), "erwartet: docker/dev-shell/sshd_config"

    # Positiv-Anker: genau eine AuthorizedKeysFile-Direktive.
    assert _count_lines(sshd, r"^AuthorizedKeysFile ") == 1

    value = ""
    for line in _clean_lines(sshd):
        if re.search(r"^AuthorizedKeysFile ", line):
            value = line.split(" ", 1)[1]
    assert value
    assert " " not in value
    assert value.startswith("/")
    assert value.endswith("/%u")
    assert "%h" not in value


def test_authorized_keys_match_the_environment_registry(repo_root):
    """authorized keys match the environment registry"""
    keys = repo_root / "k3d" / "dev-pod" / "authorized-keys.yaml"
    assert keys.is_file(), "erwartet: k3d/dev-pod/authorized-keys.yaml"
    keys_doc = _first_doc(keys)
    assert f"{keys_doc['kind']}/{keys_doc['metadata']['name']}" == "ConfigMap/dev-pod-authorized-keys"

    env_doc = _first_doc(repo_root / "environments" / "mentolder.yaml")
    for user in ("patrick", "gekko"):
        var = user.upper() + "_SSH_PUBLIC_KEY"
        cm = str((keys_doc.get("data") or {}).get(user) or "").strip()
        reg = str((env_doc.get("setup_vars") or {}).get(var) or "").strip()
        assert cm
        assert reg
        assert cm == reg, user


def test_dev_shell_mounts_dev_pod_home_at_home_dev(repo_root):
    """dev-shell mounts dev-pod-home at /home/dev"""
    pvc = repo_root / "k3d" / "dev-pod" / "home-pvc.yaml"
    assert pvc.is_file(), "erwartet: k3d/dev-pod/home-pvc.yaml"
    pvc_doc = _first_doc(pvc)
    assert f"{pvc_doc['kind']}/{pvc_doc['metadata']['name']}" == "PersistentVolumeClaim/dev-pod-home"

    deploy = _deploy(repo_root)
    volname = _volname_for_claim(deploy, "dev-pod-home")
    assert volname

    mounts = [m.get("mountPath") for m in _mounts(deploy, volname)]
    assert ",".join(mounts) == "/home/dev"


def test_missing_authorized_keys_configmap_does_not_block_the_optional_dev_shell(repo_root):
    """missing authorized-keys ConfigMap does not block the optional dev-shell"""
    vols = [v for v in _volumes(_deploy(repo_root)) if v.get("name") == "authorized-keys"]
    optional = vols[0].get("configMap", {}).get("optional") if vols else None
    assert _js_str(optional) == "true"


def test_dev_shell_mounts_the_checkout_read_only(repo_root):
    """dev-shell mounts the checkout read-only"""
    deploy = _deploy(repo_root)
    volname = _volname_for_claim(deploy, "dev-pod-repo")
    assert volname, "kein PVC-Volume dev-pod-repo im Deployment"

    mounts = _mounts(deploy, volname)
    # Positiv-Anker: dev-shell mountet das Checkout.
    assert len(mounts) >= 1
    assert ",".join(_js_str(m.get("readOnly") is True) for m in mounts) == "true"


def test_new_manifests_are_part_of_the_kustomization(repo_root):
    """new manifests are part of the kustomization"""
    kust = _first_doc(repo_root / "k3d" / "dev-pod" / "kustomization.yaml")
    resources = kust.get("resources") or []
    found = [f for f in ("home-pvc.yaml", "authorized-keys.yaml") if f in resources]
    assert ",".join(found) == "home-pvc.yaml,authorized-keys.yaml"


def test_dev_shell_image_carries_its_toolchain_at_build_time(repo_root):
    """dev-shell image carries its toolchain at build time"""
    df = repo_root / "docker" / "dev-shell" / "Dockerfile"
    assert df.is_file(), "erwartet: docker/dev-shell/Dockerfile"
    flat = _flat_dockerfile(df)
    run_lines = [l for l in flat if l.startswith("RUN ")]
    cmd_lines = [l for l in flat if re.match(r"^(CMD|ENTRYPOINT)", l)]

    # Exakt gepinnte Versionen.
    for arg in ("KUBECTL_VERSION", "CLAUDE_CODE_VERSION", "TASK_VERSION", "GH_VERSION", "PNPM_VERSION"):
        matches = [l for l in flat if re.search(rf"^ARG {arg}=v?[0-9]+\.[0-9]+\.[0-9]+$", l)]
        assert len(matches) == 1, arg

    # Werkzeuge aus konkreten Artefakten.
    for tool in ("openssh-server", "/bin/linux/amd64/kubectl", "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}",
                 "task_linux_amd64.tar.gz", "gh_${GH_VERSION}_linux_amd64.tar.gz", "pnpm@${PNPM_VERSION}"):
        assert len([l for l in run_lines if tool in l]) >= 1, tool

    # Pruefsummen-Checks fuer die Binaerartefakte.
    assert sum(l.count("sha256sum -c") for l in run_lines) >= 3
    assert len([l for l in flat if "taskfile.dev/install.sh" in l]) == 0

    for artifact in ("kubectl.sha256)  kubectl", "task_linux_amd64.tar.gz$",
                     "gh_${GH_VERSION}_linux_amd64.tar.gz"):
        assert len([l for l in flat if artifact in l]) >= 1, artifact

    pipe_to_shell = re.compile(r"(^|[ \t])(curl|wget)[ \t][^;&|]*[ \t]*\|[ \t]*(sh|bash)|sh -c[ \t]+.*curl")
    assert len([l for l in flat if pipe_to_shell.search(l)]) == 0

    assert len(cmd_lines) >= 1
    assert len([l for l in cmd_lines if re.search(r"apt-get|apk|npm install", l)]) == 0

    # Der echte Startpfad ist entrypoint.sh.
    ep = repo_root / "docker" / "dev-shell" / "entrypoint.sh"
    ep_flat = [l for l in _clean_lines(ep) if not re.match(r"^\s*#", l)]
    assert len([l for l in ep_flat if re.search(r"^exec /usr/sbin/sshd ", l)]) == 1
    assert len([l for l in ep_flat
                if re.search(r"apt-get|apk |npm (install|i )|pnpm (add|install)|pip install|curl |wget ", l)]) == 0

    ep_raw = ep.read_text(encoding="utf-8").split("\n")
    assert len([l for l in ep_raw if re.search(r"^\s*exit 1\s*$", l)]) == 0
    assert len([l for l in ep_raw if "cp -Rn /etc/skel/. /home/dev/" in l]) == 1


def test_build_workflow_builds_the_dev_shell_image(repo_root):
    """build workflow builds the dev-shell image"""
    wf = _first_doc(repo_root / ".github" / "workflows" / "build-dev-pod.yml")
    includes = (((wf.get("jobs") or {}).get("build") or {}).get("strategy") or {}).get("matrix", {}).get("include") or []
    matches = [m for m in includes if m.get("image") == "dev-shell" and m.get("context") == "docker/dev-shell"]
    assert len(matches) == 1

    on = wf.get("on", wf.get(True)) or {}
    paths = (on.get("push") or {})["paths"]
    assert "docker/dev-shell/**" in paths
