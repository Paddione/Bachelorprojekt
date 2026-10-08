"""Native pytest migration of tests/spec/website-core.bats."""

import os
from pathlib import Path
import shutil
import pytest


def test_t001433_sidebar_nav_definition_fuehrt_keine_im_prod_build_entfernten_sdlc_routen_7(repo_root, run_cmd, tmp_path):
    'T001433 sidebar: Nav-Definition fuehrt keine im prod-Build entfernten SDLC-Routen'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-c', "href:[[:space:]]*'/admin/", path_sidebar_items])
    assert int(result.output) >= 1
    result = run_cmd(['grep', '-E', "href:[[:space:]]*'(/admin/cockpit|/admin/pipeline|/dev-status|/admin/planungsbuero)'", path_sidebar_items])
    assert result.returncode != 0, result.output


def test_t001471_responsive_admin_responsive_css_exists_8(repo_root, run_cmd, tmp_path):
    'T001471 responsive: admin-responsive.css exists'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    assert Path(path_admin_responsive).is_file()


def test_t001471_responsive_adminlayout_astro_imports_admin_responsive_css_9(repo_root, run_cmd, tmp_path):
    'T001471 responsive: AdminLayout.astro imports admin-responsive.css'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-F', 'styles/admin-responsive.css', path_admin_layout])
    assert result.returncode == 0, result.output


def test_t001471_responsive_stylesheet_has_mobile_table_fallback_767px_overflow_x_10(repo_root, run_cmd, tmp_path):
    'T001471 responsive: stylesheet has mobile table fallback (767px + overflow-x)'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-E', 'max-width:[[:space:]]*767px', path_admin_responsive])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'overflow-x:[[:space:]]*auto', path_admin_responsive])
    assert result.returncode == 0, result.output


def test_t001471_responsive_stylesheet_excludes_cockpit_from_mobile_table_rule_11(repo_root, run_cmd, tmp_path):
    'T001471 responsive: stylesheet excludes Cockpit from mobile table rule'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-F', 'data-container="cockpit"', path_admin_responsive])
    assert result.returncode == 0, result.output


def test_t001471_responsive_stylesheet_has_table_collapse_container_query_12(repo_root, run_cmd, tmp_path):
    'T001471 responsive: stylesheet has table-collapse container query'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-F', '.admin-table-collapse', path_admin_responsive])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'max-width:[[:space:]]*480px', path_admin_responsive])
    assert result.returncode == 0, result.output


def test_t001471_responsive_stylesheet_has_desktop_block_1024px_with_admin_form_wide_13(repo_root, run_cmd, tmp_path):
    'T001471 responsive: stylesheet has desktop block (1024px) with admin-form-wide'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-E', 'min-width:[[:space:]]*1024px', path_admin_responsive])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-F', '.admin-form-wide', path_admin_responsive])
    assert result.returncode == 0, result.output


def test_t001471_collapse_rechnungen_astro_tags_a_table_with_admin_table_collapse_16(repo_root, run_cmd, tmp_path):
    'T001471 collapse: rechnungen.astro tags a table with admin-table-collapse'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-F', 'admin-table-collapse', str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/rechnungen.astro'])
    assert result.returncode == 0, result.output


def test_t001471_collapse_projekte_astro_tags_a_table_with_admin_table_collapse_17(repo_root, run_cmd, tmp_path):
    'T001471 collapse: projekte.astro tags a table with admin-table-collapse'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-F', 'admin-table-collapse', str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/projekte.astro'])
    assert result.returncode == 0, result.output


def test_t001471_collapse_zeiterfassung_astro_tags_a_table_with_admin_table_collapse_18(repo_root, run_cmd, tmp_path):
    'T001471 collapse: zeiterfassung.astro tags a table with admin-table-collapse'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-F', 'admin-table-collapse', str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/zeiterfassung.astro'])
    assert result.returncode == 0, result.output


def test_t001471_ui_admintabs_has_a_mobile_scroll_media_query_19(repo_root, run_cmd, tmp_path):
    'T001471 ui: AdminTabs has a mobile scroll media query'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    path_f = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/ui/AdminTabs.svelte'
    result = run_cmd(['grep', '-E', 'max-width:[[:space:]]*767px', path_f])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-E', 'overflow-x:[[:space:]]*auto', path_f])
    assert result.returncode == 0, result.output


def test_t001471_ui_adminpageheader_stacks_title_and_actions_on_mobile_20(repo_root, run_cmd, tmp_path):
    'T001471 ui: AdminPageHeader stacks title and actions on mobile'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    path_f = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/ui/AdminPageHeader.svelte'
    result = run_cmd(['grep', '-E', 'max-width:[[:space:]]*767px', path_f])
    assert result.returncode == 0, result.output


def test_t001490_decommissioned_api_homepage_is_bundle_sourced_no_db_readcurrent_25(repo_root, run_cmd, tmp_path):
    'T001490 decommissioned: /api/homepage is bundle-sourced, no DB readCurrent'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    path_f = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/homepage.ts'
    result = run_cmd(['grep', '-F', 'bundleHomepageBlocks', path_f])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-F', 'readCurrent', path_f])
    assert result.returncode != 0, result.output


def test_t002052_crawlable_mentolder_website_ingress_does_not_reference_the_shared_noindex_security_40(repo_root, run_cmd, tmp_path):
    'T002052 crawlable: mentolder website ingress does NOT reference the shared noindex security-headers'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-q', 'workspace-security-headers@kubernetescrd', path_perf_mentolder_ing])
    assert result.returncode != 0, result.output


def test_t002052_crawlable_mentolder_website_ingress_references_its_own_website_scoped_security_hea_41(repo_root, run_cmd, tmp_path):
    'T002052 crawlable: mentolder website ingress references its own website-scoped security-headers'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-q', 'website-website-security-headers@kubernetescrd', path_perf_mentolder_ing])
    assert result.returncode == 0, result.output


def test_t002052_crawlable_mentolder_has_a_website_scoped_security_headers_middleware_without_noind_42(repo_root, run_cmd, tmp_path):
    'T002052 crawlable: mentolder has a website-scoped security-headers middleware without noindex'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    assert Path(path_mentolder_sec_headers).is_file()
    result = run_cmd(['grep', '-q', 'name: website-security-headers', path_mentolder_sec_headers])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-Ei', '^[[:space:]]*X-Robots-Tag:', path_mentolder_sec_headers])
    assert result.returncode != 0, result.output


def test_t002052_crawlable_mentolder_kustomization_wires_the_website_security_headers_middleware_43(repo_root, run_cmd, tmp_path):
    'T002052 crawlable: mentolder kustomization wires the website-security-headers middleware'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-q', 'website-security-headers.yaml', path_mentolder_kust])
    assert result.returncode == 0, result.output


def test_t002058_perf_layout_astro_imports_global_css_as_a_plain_blocking_side_effect_no_inline_blo_45(repo_root, run_cmd, tmp_path):
    'T002058 perf: Layout.astro imports global.css as a plain blocking side-effect (no ?inline bloat)'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-Eq', "^import '\\.\\./styles/global\\.css';", path_perf_layout])
    assert result.returncode == 0, result.output
    result = run_cmd(['grep', '-Eq', 'styles/global\\.css\\?inline', path_perf_layout])
    assert result.returncode != 0, result.output


def test_t002059_move_korehomepage_svelte_no_longer_renders_goalsdashboard_moved_to_admin_repohealt_46(repo_root, run_cmd, tmp_path):
    'T002059 move: KoreHomepage.svelte no longer renders GoalsDashboard (moved to /admin/repohealth)'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-q', 'GoalsDashboard.svelte', path_kore_homepage])
    assert result.returncode != 0, result.output
    result = run_cmd(['grep', '-q', '<GoalsDashboard', path_kore_homepage])
    assert result.returncode != 0, result.output


def test_t002059_move_nav_definition_fuehrt_keinen_admin_repohealth_eintrag_mehr_47(repo_root, run_cmd, tmp_path):
    'T002059 move: Nav-Definition fuehrt keinen /admin/repohealth-Eintrag mehr'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-c', "href:[[:space:]]*'/admin/", path_sidebar_items])
    assert int(result.output) >= 1
    result = run_cmd(['grep', '-Eq', "href:[[:space:]]*'/admin/repohealth'", path_sidebar_items])
    assert result.returncode != 0, result.output


def test_t002531_sidebar_nav_definition_fuehrt_weder_admin_cockpit_noch_admin_pipeline_48(repo_root, run_cmd, tmp_path):
    'T002531 sidebar: Nav-Definition fuehrt weder /admin/cockpit noch /admin/pipeline'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-Eq', "href:[[:space:]]*'/admin/cockpit'", path_sidebar_items])
    assert result.returncode != 0, result.output
    result = run_cmd(['grep', '-Eq', "href:[[:space:]]*'/admin/pipeline'", path_sidebar_items])
    assert result.returncode != 0, result.output


def test_t002058_perf_public_layout_astro_does_not_render_portalsidekick_astro_hoists_island_css_re_49(repo_root, run_cmd, tmp_path):
    'T002058 perf: public Layout.astro does not render PortalSidekick (Astro hoists island CSS render-blocking)'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-Eq', '<PortalSidekick|import PortalSidekick', path_perf_layout])
    assert result.returncode != 0, result.output
    result = run_cmd(['grep', '-q', 'sidekick-panels\\.css', path_perf_layout])
    assert result.returncode != 0, result.output


def test_t002666_build_route_manifest_mjs_suppresses_tsx_error_stacktrace_on_stderr_when_tsx_fails_50(repo_root, run_cmd, tmp_path):
    'T002666: build-route-manifest.mjs suppresses tsx error stacktrace on stderr when tsx fails'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    result = run_cmd(['grep', '-E', "stdio:[[:space:]]*\\['pipe',[[:space:]]*'pipe',[[:space:]]*'pipe'\\]|stdio:[[:space:]]*'pipe'", str(repo_root / 'tests/spec') + '/../../scripts/build-route-manifest.mjs'])
    assert result.returncode == 0, result.output


def test_t900297_src_pages_admin_contains_no_client_scripts_or_stylesheets_that_collide_with_astro__51(repo_root, run_cmd, tmp_path):
    'T900297: src/pages/admin/ contains no client scripts or stylesheets that collide with Astro routes'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    assert not (Path(str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/applications.ts').is_file())
    assert not (Path(str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/applications.css').is_file())


def test_t900297_applications_astro_is_decoupled_from_brett_and_links_back_to_admin_52(repo_root, run_cmd, tmp_path):
    'T900297: applications.astro is decoupled from Brett and links back to /admin'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    path_app_astro = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/admin/applications.astro'
    assert Path(path_app_astro).is_file()
    result = run_cmd(['grep', '-Ei', 'Zurück zum Brett|Brett-Kanban', path_app_astro])
    assert result.returncode != 0, result.output


def test_t900302_application_specific_api_endpoints_exist_under_id_directory_53(repo_root, run_cmd, tmp_path):
    'T900302: application-specific API endpoints exist under [id]/ directory'
    path_admin_foundation = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-foundation.css'
    path_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_admin_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/AdminLayout.astro'
    path_sidebar_nav = str(repo_root / 'tests/spec') + '/../../components/website/src/components/admin/AdminSidebarNav.astro'
    path_sidebar_items = str(repo_root / 'tests/spec') + '/../../components/website/src/lib/admin/nav-items.ts'
    path_kore_css = str(repo_root / 'tests/spec') + '/../../components/website/public/brand/korczewski/kore-app.css'
    path_admin_responsive = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/admin-responsive.css'
    path_perf_website_yaml = str(repo_root / 'tests/spec') + '/../../k3d/website.yaml'
    path_perf_portrait = str(repo_root / 'tests/spec') + '/../../components/website/src/components/Portrait.svelte'
    path_perf_mentolder_ts = str(repo_root / 'tests/spec') + '/../../components/website/src/config/brands/mentolder.ts'
    path_perf_global_css = str(repo_root / 'tests/spec') + '/../../components/website/src/styles/global.css'
    path_perf_layout = str(repo_root / 'tests/spec') + '/../../components/website/src/layouts/Layout.astro'
    path_perf_mentolder_ing = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-ingress-web.yaml'
    path_perf_korczewski_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-korczewski/kustomization.yaml'
    path_mentolder_sec_headers = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/website-security-headers.yaml'
    path_mentolder_kust = str(repo_root / 'tests/spec') + '/../../prod-fleet/website-mentolder/kustomization.yaml'
    path_shared_middlewares = str(repo_root / 'tests/spec') + '/../../prod/traefik-middlewares.yaml'
    path_kore_homepage = str(repo_root / 'tests/spec') + '/../../components/website/src/components/kore/KoreHomepage.svelte'
    path_kore_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/kore-app.css'
    path_kore_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/korczewski/colors_and_type.css'
    path_mentolder_colors_source = str(repo_root / 'tests/spec') + '/../../assets/branding/mentolder/colors_and_type.css'
    path_base = str(repo_root / 'tests/spec') + '/../../components/website/src/pages/api/internal/applications'
    assert Path(path_base + '/[id]/index.ts').is_file()
    assert Path(path_base + '/[id]/detail.ts').is_file()
    assert Path(path_base + '/[id]/timeline.ts').is_file()
    assert Path(path_base + '/[id]/dossiers.ts').is_file()
