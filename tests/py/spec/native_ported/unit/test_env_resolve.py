"""Native migration of tests/unit/env-resolve.bats."""
import shlex
from pathlib import Path

import pytest

SCHEMA_BASE = """version: 1
env_vars:
  - name: PROD_DOMAIN
    required: true
    default_dev: "localhost"
  - name: STRIPE_PUBLISHABLE_KEY
    required: false
    default_dev: ""
  - name: MISSING_IN_ENV
    required: false
    default_dev: "dev-fallback"
setup_vars:
  - name: KC_USER1_USERNAME
    required: true
"""

PROD_YAML = """environment: prod
context: test-ctx
domain: example.test
overlay: prod-test
env_vars:
  PROD_DOMAIN: example.test
  STRIPE_PUBLISHABLE_KEY: "pk_live_51RhKrcDGTY4NP8aeqnf69F1OVgNleqjLqR5ZHi8jkzlyx\\
    LiaTEnsY5xwhgPAVV7FdNb4eRnelIzt7DUj9TTAopXg00yyxjx03t"
setup_vars:
  KC_USER1_USERNAME: alice
"""

DEV_YAML = """environment: dev
context: k3d-dev
domain: localhost
env_vars:
  PROD_DOMAIN: localhost
setup_vars:
  KC_USER1_USERNAME: devuser
"""

# Staging schema: the ENV=staging test overwrites schema.yaml with this content and
# later tests in the module run against it (same order as the BATS file).
STAGING_SCHEMA = """version: 1
env_vars:
  - name: PROD_DOMAIN
    required: true
    default_dev: "localhost"
  - name: STRIPE_PUBLISHABLE_KEY
    required: false
    default_dev: ""
  - name: MISSING_IN_ENV
    required: false
    default_dev: "dev-fallback"
  - name: WORKSPACE_NAMESPACE
    required: false
  - name: WEBSITE_NAMESPACE
    required: false
  - name: BRAND_ID
    required: true
    default_dev: "korczewski"
  - name: BRAND_NAME
    required: true
    default_dev: "KORE"
  - name: CONTACT_EMAIL
    required: true
    default_dev: "dev@localhost"
  - name: SMTP_FROM
    required: true
    default_dev: "noreply@localhost"
  - name: SMTP_USER
    required: true
    default_dev: "noreply@localhost"
  - name: SMTP_HOST
    required: true
    default_dev: "mailpit.workspace.svc.cluster.local"
  - name: SMTP_PORT
    required: true
    default_dev: "1025"
  - name: INFRA_NAMESPACE
    required: true
    default_dev: "workspace-infra"
  - name: TLS_SECRET_NAME
    required: true
    default_dev: "workspace-wildcard-tls"
  - name: TURN_PUBLIC_IP
    required: true
    default_dev: "127.0.0.1"
  - name: TURN_NODE
    required: true
    default_dev: "k3d-dev-server-0"
  - name: BRETT_DOMAIN
    required: true
    default_dev: "brett.localhost"
  - name: STREAM_DOMAIN
    required: true
    default_dev: "stream.localhost"
  - name: RECOVER_DOMAIN
    required: true
    default_dev: "recover.localhost"
  - name: OTEL_DOMAIN
    required: true
    default_dev: "otel.localhost"
  - name: WEBSITE_HOST
    required: true
    default_dev: "web.localhost"
  - name: WEBSITE_SITE_URL
    required: true
    default_dev: "http://web.localhost"
  - name: KEYCLOAK_FRONTEND_URL
    required: true
    default_dev: "http://auth.localhost"
  - name: LLM_ENABLED
    required: true
    default_dev: "false"
  - name: LLM_RERANK_ENABLED
    required: true
    default_dev: "false"
  - name: LLM_ROUTER_URL
    required: true
    default_dev: "http://llm-gateway-lmstudio.workspace.svc.cluster.local:1234"
  - name: LLM_EMBED_URL
    required: true
    default_dev: "http://llm-gateway-embed.workspace.svc.cluster.local:8081"
  - name: SYSTEMTEST_LOOP_ENABLED
    required: false
    default_dev: "false"
  - name: MEDIAVIEWER_HOST
    required: true
    default_dev: "mediaviewer.localhost"
  - name: VIDEOVAULT_DOMAIN
    required: true
    default_dev: "videovault.localhost"
setup_vars:
  - name: KC_USER1_USERNAME
    required: true
  - name: KC_USER1_EMAIL
    required: true
    validate: "^.+@.+$"
"""

STAGING_YAML = """environment: staging
context: fleet
domain: staging.example.test
overlay: prod-fleet/staging
workspace_namespace: workspace-staging
website_namespace: website-staging
env_vars:
  PROD_DOMAIN: staging.example.test
  WORKSPACE_NAMESPACE: workspace-staging
  WEBSITE_NAMESPACE: website-staging
  BRAND_NAME: "Staging"
  BRAND_ID: staging
  CONTACT_EMAIL: staging@example.test
  SMTP_FROM: staging@example.test
  SMTP_USER: staging
  SMTP_HOST: mailpit.workspace-staging.svc.cluster.local
  SMTP_PORT: "1025"
  INFRA_NAMESPACE: staging-infra
  TLS_SECRET_NAME: staging-wildcard-tls
  TURN_PUBLIC_IP: "127.0.0.1"
  TURN_NODE: pk-hetzner-4
  BRETT_DOMAIN: brett.staging.example.test
  STREAM_DOMAIN: stream.staging.example.test
  RECOVER_DOMAIN: recover.staging.example.test
  OTEL_DOMAIN: otel.staging.example.test
  WEBSITE_HOST: web.staging.example.test
  WEBSITE_SITE_URL: "https://web.staging.example.test"
  KEYCLOAK_FRONTEND_URL: "https://auth.staging.example.test"
  LLM_ENABLED: "false"
  LLM_RERANK_ENABLED: "false"
  LLM_ROUTER_URL: "http://llm-gateway-lmstudio.workspace-staging.svc.cluster.local:1234"
  LLM_EMBED_URL: "http://llm-gateway-embed.workspace-staging.svc.cluster.local:8081"
  SYSTEMTEST_LOOP_ENABLED: "false"
  MEDIAVIEWER_HOST: mediaviewer.staging.example.test
  VIDEOVAULT_DOMAIN: videovault.staging.example.test
setup_vars:
  KC_USER1_USERNAME: staging-admin
  KC_USER1_EMAIL: staging@example.test
"""


@pytest.fixture(scope="module")
def env_dir(tmp_path_factory) -> Path:
    """Module-scoped environments dir, written once like BATS setup_file."""
    d = tmp_path_factory.mktemp("env-resolve") / "environments"
    d.mkdir()
    (d / "schema.yaml").write_text(SCHEMA_BASE)
    (d / "prod.yaml").write_text(PROD_YAML)
    (d / "dev.yaml").write_text(DEV_YAML)
    return d


@pytest.fixture
def script(repo_root: Path) -> Path:
    return repo_root / "scripts" / "env-resolve.sh"


def _source(script: Path, env_name: str, env_dir: Path, echo_expr: str, prefix: str = ""):
    """Build `[prefix] source SCRIPT ENV DIR >/dev/null && echo EXPR` as a bash -c string."""
    return (f"{prefix}source {shlex.quote(str(script))} {shlex.quote(env_name)} "
            f"{shlex.quote(str(env_dir))} >/dev/null && echo \"{echo_expr}\"")


def test_multi_line_stripe_publishable_key_resolves_to_full_107_char_value(run_cmd, script, env_dir):
    cmd = _source(script, "prod", env_dir, "${#STRIPE_PUBLISHABLE_KEY}:$STRIPE_PUBLISHABLE_KEY")
    result = run_cmd(["bash", "-c", cmd])
    assert result.returncode == 0
    assert result.output == ("107:pk_live_51RhKrcDGTY4NP8aeqnf69F1OVgNleqjLqR5ZHi8jkzlyx"
                             "LiaTEnsY5xwhgPAVV7FdNb4eRnelIzt7DUj9TTAopXg00yyxjx03t")


def test_single_line_env_vars_and_setup_vars_export_correctly(run_cmd, script, env_dir):
    cmd = _source(script, "prod", env_dir, "$PROD_DOMAIN|$KC_USER1_USERNAME")
    result = run_cmd(["bash", "-c", cmd])
    assert result.returncode == 0
    assert result.output == "example.test|alice"


def test_convenience_vars_env_context_domain_overlay_export_from_top_level_keys(run_cmd, script, env_dir):
    cmd = _source(script, "prod", env_dir, "$ENV_CONTEXT|$ENV_DOMAIN|$ENV_OVERLAY")
    result = run_cmd(["bash", "-c", cmd])
    assert result.returncode == 0
    assert result.output == "test-ctx|example.test|prod-test"


def test_dev_env_falls_back_to_default_dev_when_schema_var_is_missing_from_env_file(run_cmd, script, env_dir):
    cmd = _source(script, "dev", env_dir, "$MISSING_IN_ENV")
    result = run_cmd(["bash", "-c", cmd])
    assert result.returncode == 0
    assert result.output == "dev-fallback"


def test_prod_env_does_not_fall_back_to_default_dev_for_missing_vars(run_cmd, script, env_dir):
    cmd = _source(script, "prod", env_dir, "MISSING_IN_ENV=[${MISSING_IN_ENV:-<unset>}]")
    result = run_cmd(["bash", "-c", cmd])
    assert result.returncode == 0
    assert result.output == "MISSING_IN_ENV=[<unset>]"


def test_exits_non_zero_when_env_name_is_missing(run_cmd, script, env_dir):
    cmd = f"source {shlex.quote(str(script))} '' {shlex.quote(str(env_dir))}"
    result = run_cmd(["bash", "-c", cmd])
    assert result.returncode != 0
    assert "Usage:" in result.output


def test_exits_non_zero_when_env_file_does_not_exist(run_cmd, script, env_dir):
    cmd = f"source {shlex.quote(str(script))} does-not-exist {shlex.quote(str(env_dir))}"
    result = run_cmd(["bash", "-c", cmd])
    assert result.returncode != 0
    assert "Environment file not found" in result.output


def test_env_staging_resolves_overlay_namespace_context_correctly(run_cmd, script, env_dir):
    (env_dir / "schema.yaml").write_text(STAGING_SCHEMA)
    (env_dir / "staging.yaml").write_text(STAGING_YAML)
    cmd = _source(script, "staging", env_dir,
                  "$ENV_CONTEXT|$ENV_DOMAIN|$ENV_OVERLAY|$WORKSPACE_NAMESPACE|$WEBSITE_NAMESPACE|$BRAND_ID")
    result = run_cmd(["bash", "-c", cmd])
    assert result.returncode == 0
    assert result.output == "fleet|staging.example.test|prod-fleet/staging|workspace-staging|website-staging|staging"


def test_t004041_caller_set_env_vars_are_not_clobbered_by_env_resolve(run_cmd, script, env_dir):
    # Regression (T004041): a caller-set env var must win over the environments/*.yaml value.
    cmd = _source(script, "prod", env_dir, "$PROD_DOMAIN", prefix="export PROD_DOMAIN=caller.example; ")
    result = run_cmd(["bash", "-c", cmd])
    assert result.returncode == 0
    assert result.output == "caller.example"


def test_t004041_caller_set_setup_vars_are_not_clobbered_by_env_resolve(run_cmd, script, env_dir):
    # Same semantics for setup_vars: KC_USER1_USERNAME is alice in prod.yaml, the caller's bob wins.
    cmd = _source(script, "prod", env_dir, "$KC_USER1_USERNAME", prefix="export KC_USER1_USERNAME=bob; ")
    result = run_cmd(["bash", "-c", cmd])
    assert result.returncode == 0
    assert result.output == "bob"
