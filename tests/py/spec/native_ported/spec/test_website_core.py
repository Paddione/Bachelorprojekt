"""Native migration of tests/spec/website-core.bats."""

# (T001433 .. T900302)

import re
from pathlib import Path

import pytest

ADMIN_BASE = "components/website/src"


def _txt(p):
    return Path(p).read_text(encoding="utf-8")


def _has(text, pattern, flags=re.M):
    return re.search(pattern, text, flags) is not None


def _lines_matching(text, pattern, flags=re.M):
    return [l for l in text.splitlines() if re.search(pattern, l, flags)]


def _wc_l(p):
    return Path(p).read_bytes().count(b"\n")


@pytest.fixture
def r(repo_root):
    """Resolve repo-relative paths used by the BATS suite."""
    web = repo_root / "components" / "website"
    def p(rel):
        return repo_root / rel
    return {
        "root": repo_root,
        "web": web,
        "p": p,
        "admin_foundation": web / "src/styles/admin-foundation.css",
        "global_css": web / "src/styles/global.css",
        "admin_layout": web / "src/layouts/AdminLayout.astro",
        "sidebar_items": web / "src/lib/admin/nav-items.ts",
        "kore_css": web / "public/brand/korczewski/kore-app.css",
        "admin_responsive": web / "src/styles/admin-responsive.css",
        "perf_website_yaml": repo_root / "k3d/website.yaml",
        "perf_portrait": web / "src/components/Portrait.svelte",
        "perf_mentolder_ts": web / "src/config/brands/mentolder.ts",
        "perf_layout": web / "src/layouts/Layout.astro",
        "perf_mentolder_ing": repo_root / "prod-fleet/website-mentolder/website-ingress-web.yaml",
        "perf_korczewski_kust": repo_root / "prod-fleet/website-korczewski/kustomization.yaml",
        "mentolder_sec_headers": repo_root / "prod-fleet/website-mentolder/website-security-headers.yaml",
        "mentolder_kust": repo_root / "prod-fleet/website-mentolder/kustomization.yaml",
        "shared_middlewares": repo_root / "prod/traefik-middlewares.yaml",
        "kore_homepage": web / "src/components/kore/KoreHomepage.svelte",
        "kore_source": repo_root / "assets/branding/korczewski/kore-app.css",
        "kore_colors_source": repo_root / "assets/branding/korczewski/colors_and_type.css",
        "mentolder_colors_source": repo_root / "assets/branding/mentolder/colors_and_type.css",
    }


# ── T001433: Token alias layer ──

def test_t001433_alias_admin_foundation_css_color_bearing_tokens_all_reference_var(r):
    text = _txt(r["global_css"])
    tokens = ["--admin-bg", "--admin-sidebar-bg", "--admin-surface", "--admin-surface-hover", "--admin-border",
              "--admin-border-bright", "--admin-primary", "--admin-primary-muted", "--admin-accent", "--admin-text",
              "--admin-text-mute", "--admin-text-disabled", "--admin-success", "--admin-danger", "--admin-info",
              "--admin-warning"]
    for token in tokens:
        assert _has(text, rf"^[ \t]*{re.escape(token)}[ \t]*:[ \t]*var\(--"), f"missing alias for {token}"


def test_t001433_alias_admin_layout_astro_loads_global_css_before_admin_foundation_css(r):
    matching = [l for l in _txt(r["admin_layout"]).splitlines() if re.search(r"global.css|admin-foundation.css", l)]
    gi = next((i for i, l in enumerate(matching) if re.search("global.css", l)), None)
    fi = next((i for i, l in enumerate(matching) if re.search("admin-foundation.css", l)), None)
    assert gi is not None and fi is not None
    assert gi < fi


def test_t001433_alias_kore_app_css_overrides_admin_primary_with_copper(r):
    buf, last = "", ""
    for line in _txt(r["kore_css"]).splitlines():
        if re.match(r"^[ \t]*body\.kore[ \t]*\{", line):
            buf = ""
        buf = buf + "\n" + line
        if re.match(r"^[ \t]*\}[ \t]*$", line):
            last = buf
    assert _has(last, r"body\.kore[ \t]*\{")
    assert _has(last, r"--admin-primary:[ \t]+var\(--copper\)")


# ── T002239-M2: Brand source files ──

def test_t002239_m2_source_kore_app_css_carries_admin_primary_copper_override(r):
    assert r["kore_source"].is_file()
    assert _has(_txt(r["kore_source"]), r"--admin-primary:[ \t]+var\(--copper\)")


def test_t002239_m2_source_korczewski_colors_and_type_css_has_no_google_fonts_cdn_import(r):
    assert r["kore_colors_source"].is_file()
    assert "googleapis" not in _txt(r["kore_colors_source"])


def test_t002239_m2_source_mentolder_colors_and_type_css_has_no_google_fonts_cdn_import(r):
    assert r["mentolder_colors_source"].is_file()
    assert "googleapis" not in _txt(r["mentolder_colors_source"])


# ── T001433: Sidebar ──

def test_t001433_sidebar_nav_definition_fuehrt_keine_im_prod_build_entfernten_sdlc_routen(r):
    text = _txt(r["sidebar_items"])
    assert len(re.findall(r"href:[ \t]*'/admin/", text)) >= 1
    assert not _has(text, r"href:[ \t]*'(/admin/cockpit|/admin/pipeline|/dev-status|/admin/planungsbuero)'")


# ── T001471: admin responsive parity ──

def test_t001471_responsive_admin_responsive_css_exists(r):
    assert r["admin_responsive"].is_file()


def test_t001471_responsive_admin_layout_astro_imports_admin_responsive_css(r):
    assert "styles/admin-responsive.css" in _txt(r["admin_layout"])


def test_t001471_responsive_stylesheet_has_mobile_table_fallback_767px_and_overflow_x(r):
    text = _txt(r["admin_responsive"])
    assert _has(text, r"max-width:[ \t]*767px")
    assert _has(text, r"overflow-x:[ \t]*auto")


def test_t001471_responsive_stylesheet_excludes_cockpit_from_mobile_table_rule(r):
    assert 'data-container="cockpit"' in _txt(r["admin_responsive"])


def test_t001471_responsive_stylesheet_has_table_collapse_container_query(r):
    text = _txt(r["admin_responsive"])
    assert ".admin-table-collapse" in text
    assert _has(text, r"max-width:[ \t]*480px")


def test_t001471_responsive_stylesheet_has_desktop_block_1024px_with_admin_form_wide(r):
    text = _txt(r["admin_responsive"])
    assert _has(text, r"min-width:[ \t]*1024px")
    assert ".admin-form-wide" in text


def test_t001471_collapse_rechnungen_astro_stays_exactly_592_lines_budget_0(r):
    assert _wc_l(r["web"] / "src/pages/admin/rechnungen.astro") == 592


def test_t001471_collapse_projekte_astro_stays_exactly_408_lines_budget_0(r):
    assert _wc_l(r["web"] / "src/pages/admin/projekte.astro") == 408


def test_t001471_collapse_rechnungen_tags_a_table_with_admin_table_collapse(r):
    assert "admin-table-collapse" in _txt(r["web"] / "src/pages/admin/rechnungen.astro")


def test_t001471_collapse_projekte_tags_a_table_with_admin_table_collapse(r):
    assert "admin-table-collapse" in _txt(r["web"] / "src/pages/admin/projekte.astro")


def test_t001471_collapse_zeiterfassung_tags_a_table_with_admin_table_collapse(r):
    assert "admin-table-collapse" in _txt(r["web"] / "src/pages/admin/zeiterfassung.astro")


def test_t001471_ui_admin_tabs_has_a_mobile_scroll_media_query(r):
    f = r["web"] / "src/components/admin/ui/AdminTabs.svelte"
    text = _txt(f)
    assert _has(text, r"max-width:[ \t]*767px")
    assert _has(text, r"overflow-x:[ \t]*auto")


def test_t001471_ui_admin_page_header_stacks_title_and_actions_on_mobile(r):
    text = _txt(r["web"] / "src/components/admin/ui/AdminPageHeader.svelte")
    assert _has(text, r"max-width:[ \t]*767px")


def test_t001471_forms_all_six_einstellungen_views_opt_into_admin_form_wide(r):
    base = r["web"] / "src/pages/admin/einstellungen"
    for f in ("backup", "benachrichtigungen", "branding", "email", "ordner-templates", "rechnungen"):
        assert "admin-form-wide" in _txt(base / f"{f}.astro"), f"missing admin-form-wide in {f}.astro"


# ── T001490: content bundle completeness ──

DOMAINS = ["homepage", "homepage-blocks", "seo", "faq", "kontakt", "ueber-mich", "services",
           "leistungen", "stammdaten", "navigation", "footer", "referenzen", "kore-flags"]


def test_t001490_content_bundle_every_brand_has_all_13_domain_json_files(r):
    base = r["web"] / "content"
    for brand in ("mentolder", "korczewski"):
        assert (base / brand).is_dir(), f"missing brand dir {brand}"
        for d in DOMAINS:
            assert (base / brand / f"{d}.json").is_file(), f"missing {brand}/{d}.json"


def test_t001490_content_bundle_website_db_ts_no_longer_exports_deleted_content_readers(r):
    text = _txt(r["web"] / "src/lib/website-db.ts")
    for fn in ("getHomepageContent", "getUebermichContent", "getFaqContent", "getKontaktContent",
               "getServiceConfig", "getLeistungenConfig", "getReferenzen"):
        assert not _has(text, rf"^export (async )?function {fn}\b|^export const {fn}\b"), f"still exports {fn}"


def test_t001490_decommissioned_homepage_blocks_store_ts_is_removed(r):
    assert not (r["web"] / "src/lib/homepage-blocks-store.ts").exists(), "homepage-blocks-store.ts still present"
    assert not (r["web"] / "src/lib/homepage-blocks-store.test.ts").exists(), "homepage-blocks-store.test.ts still present"
    assert not (r["web"] / "src/pages/api/admin/homepage/versions.ts").exists(), "admin/homepage/versions.ts still present"
    assert not (r["web"] / "src/pages/api/admin/homepage/restore.ts").exists(), "admin/homepage/restore.ts still present"


def test_t001490_decommissioned_api_homepage_is_bundle_sourced_no_db_read_current(r):
    text = _txt(r["web"] / "src/pages/api/homepage.ts")
    assert "bundleHomepageBlocks" in text, "homepage.ts does not use bundleHomepageBlocks"
    assert "readCurrent" not in text, "homepage.ts still references readCurrent"


def test_t001490_content_bundle_export_script_registered_no_orphan(r):
    assert "content:export" in _txt(r["root"] / "taskfiles/Taskfile.data.yml")
    assert (r["root"] / "scripts/export-site-content.mjs").is_file()


def test_t001490_content_bundle_every_json_file_passes_the_zod_schema_build_time_check(r):
    pytest.skip("Pre-existing regression — T002200 follow-up")


def test_t001490_primary_frontend_schema_declared_with_astro_react_pattern_and_brand_defaults(r):
    schema = _txt(r["root"] / "environments/schema.yaml")
    assert _has(schema, r"^  - name: PRIMARY_FRONTEND$")
    lines = schema.splitlines()
    start = next(i for i, l in enumerate(lines) if re.match(r"^  - name: PRIMARY_FRONTEND$", l))
    validate = next((l for l in lines[start + 1:] if "validate:" in l), "")
    assert re.search(r'validate:[ \t]*"\^\(astro\|react\)\$"', validate), validate
    for brand in ("mentolder", "korczewski"):
        assert _has(_txt(r["root"] / f"environments/{brand}.yaml"), r"^[ \t]+PRIMARY_FRONTEND:[ \t]*(astro|react)$")
    assert _has(_txt(r["root"] / "k3d/website.yaml"), r"name:[ \t]*\$\{WEBSITE_PRIMARY_SERVICE\}")
    files = [r["root"] / "Taskfile.yml"] + [p for p in sorted((r["root"] / "taskfiles").rglob("*")) if p.is_file()]
    for needle in ("WEBSITE_PRIMARY_SERVICE", "PRIMARY_FRONTEND"):
        assert any(("$" + needle) in _txt(f) for f in files), f"Taskfile suite envsubst list missing ${needle}"


def test_t001490_primary_frontend_github_content_token_schema_registered_dev_secret_manifest_present(r):
    assert _has(_txt(r["root"] / "environments/schema.yaml"), r"^  - name: GITHUB_CONTENT_TOKEN$")
    f = r["root"] / "k3d/website-content-token-secret.yaml"
    assert f.is_file()
    text = _txt(f)
    assert _has(text, r"name:[ \t]*website-content-token")
    assert "namespace: ${WEBSITE_NAMESPACE}" in text
    assert _has(text, r"GITHUB_CONTENT_TOKEN:")
    lines = _txt(r["root"] / "k3d/website.yaml").splitlines()
    ctx = []
    for i, l in enumerate(lines):
        if "name: GITHUB_CONTENT_TOKEN" in l:
            ctx.extend(lines[max(0, i - 1): i + 5])
    block = "\n".join(ctx)
    assert ctx, "grep -B1 -A4 fand keine Treffer"
    assert _has(block, r"secretKeyRef:")
    assert _has(block, r"name:[ \t]*website-content-token")


# ── T001922: Lighthouse perf ──

def test_t001922_perf_k3d_website_yaml_defines_website_compress_middleware(r):
    text = _txt(r["perf_website_yaml"])
    assert _has(text, r"^[ \t]*name: website-compress$")
    assert _has(text, r"compress:")


def test_t001922_perf_k3d_website_yaml_defines_website_static_cache_middleware_immutable(r):
    text = _txt(r["perf_website_yaml"])
    assert _has(text, r"^[ \t]*name: website-static-cache$")
    assert "immutable" in text.lower()


def test_t001922_perf_website_ingressroute_binds_compress_and_adds_an_astro_route(r):
    text = _txt(r["perf_website_yaml"])
    assert "middlewares:" in text
    assert "/_astro/" in text


def test_t001922_perf_portrait_svelte_hero_img_is_eager_with_fetchpriority_and_dimensions(r):
    text = _txt(r["perf_portrait"])
    assert 'loading="eager"' in text
    assert 'fetchpriority="high"' in text
    assert 'width="600"' in text
    assert 'height="750"' in text
    assert 'loading="lazy"' not in text


def test_t001922_perf_mentolder_avatar_src_references_gerald_webp_not_gerald_jpg(r):
    text = _txt(r["perf_mentolder_ts"])
    assert "avatarSrc: '/gerald.webp'" in text
    assert "avatarSrc: '/gerald.jpg'" not in text


def test_t001922_perf_global_css_has_no_font_provider_import(r):
    assert "googleapis" not in _txt(r["global_css"])


def test_t001922_perf_layout_astro_hydrates_cookie_consent_client_idle(r):
    text = _txt(r["perf_layout"])
    assert "<CookieConsent client:idle" in text
    assert "<CookieConsent client:load" not in text


def test_t001922_perf_mentolder_prod_ingress_binds_website_compress(r):
    assert "website-compress" in _txt(r["perf_mentolder_ing"])


def test_t001922_perf_korczewski_overlay_binds_website_compress_to_the_ingress_route(r):
    assert "website-compress" in _txt(r["perf_korczewski_kust"])


def test_t001929_perf_mentolder_content_bundle_avatar_src_references_gerald_webp_live_source(r):
    text = _txt(r["web"] / "content/mentolder/homepage.json")
    assert '"avatarSrc": "/gerald.webp"' in text
    assert "gerald.jpg" not in text


# ── T002052: crawlability ──

def test_t002052_crawlable_mentolder_website_ingress_does_not_reference_shared_noindex_security_headers(r):
    assert "workspace-security-headers@kubernetescrd" not in _txt(r["perf_mentolder_ing"])


def test_t002052_crawlable_mentolder_website_ingress_references_its_own_website_scoped_security_headers(r):
    assert "website-website-security-headers@kubernetescrd" in _txt(r["perf_mentolder_ing"])


def test_t002052_crawlable_mentolder_has_website_scoped_security_headers_middleware_without_noindex(r):
    assert r["mentolder_sec_headers"].is_file()
    text = _txt(r["mentolder_sec_headers"])
    assert _has(text, r"name: website-security-headers")
    assert not _has(text, r"^[ \t]*X-Robots-Tag:", re.M | re.I)


def test_t002052_crawlable_mentolder_kustomization_wires_the_website_security_headers_middleware(r):
    assert "website-security-headers.yaml" in _txt(r["mentolder_kust"])


def test_t002052_drift_guard_shared_security_headers_explicitly_sets_x_robots_tag_noindex(r):
    lines = _txt(r["shared_middlewares"]).splitlines()
    block = []
    for i, l in enumerate(lines):
        if l == "  name: security-headers":
            block.extend(lines[i: i + 13])
    assert block, "security-headers Middleware nicht gefunden"
    text = "\n".join(block)
    assert re.search(r"X-Robots-Tag", text, re.I)
    assert re.search(r"noindex", text, re.I)


# ── T002057/T002058/T002059 ──

def test_t002058_perf_layout_astro_imports_global_css_as_plain_blocking_side_effect_no_inline_bloat(r):
    text = _txt(r["perf_layout"])
    assert _has(text, r"^import '\.\./styles/global\.css';")
    assert not _has(text, r"styles/global\.css\?inline")


def test_t002059_move_kore_homepage_no_longer_renders_goals_dashboard(r):
    text = _txt(r["kore_homepage"])
    assert "GoalsDashboard.svelte" not in text
    assert "<GoalsDashboard" not in text


def test_t002059_move_nav_definition_fuehrt_keinen_admin_repohealth_eintrag_mehr(r):
    text = _txt(r["sidebar_items"])
    assert len(re.findall(r"href:[ \t]*'/admin/", text)) >= 1
    assert not _has(text, r"href:[ \t]*'/admin/repohealth'")


def test_t002531_sidebar_nav_definition_fuehrt_weder_admin_cockpit_noch_admin_pipeline(r):
    text = _txt(r["sidebar_items"])
    assert not _has(text, r"href:[ \t]*'/admin/cockpit'")
    assert not _has(text, r"href:[ \t]*'/admin/pipeline'")


def test_t002058_perf_public_layout_astro_does_not_render_portal_sidekick(r):
    text = _txt(r["perf_layout"])
    assert not _has(text, r"<PortalSidekick|import PortalSidekick")
    assert "sidekick-panels.css" not in text


def test_t002666_build_route_manifest_mjs_suppresses_tsx_error_stacktrace_on_stderr_when_tsx_fails(r):
    text = _txt(r["root"] / "scripts/build-route-manifest.mjs")
    assert _has(text, r"stdio:[ \t]*\['pipe',[ \t]*'pipe',[ \t]*'pipe'\]|stdio:[ \t]*'pipe'")


# ── T900297 / T900302 ──

def test_t900297_src_pages_admin_contains_no_client_scripts_or_stylesheets_that_collide_with_astro_routes(r):
    assert not (r["web"] / "src/pages/admin/applications.ts").exists()
    assert not (r["web"] / "src/pages/admin/applications.css").exists()


def test_t900297_applications_astro_is_decoupled_from_brett_and_links_back_to_admin(r):
    app = r["web"] / "src/pages/admin/applications.astro"
    assert app.is_file()
    assert not _has(_txt(app), r"Zurück zum Brett|Brett-Kanban", re.M | re.I)


def test_t900302_application_specific_api_endpoints_exist_under_id_directory(r):
    base = r["web"] / "src/pages/api/internal/applications"
    for f in ("index.ts", "detail.ts", "timeline.ts", "dossiers.ts"):
        assert (base / "[id]" / f).is_file(), f"[id]/{f} fehlt"
