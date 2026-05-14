"""Unit tests for scripts/datamodel — run via:

    python3 -m unittest discover -s scripts/datamodel/tests -v
"""
import json
import os
import sys
import unittest
from pathlib import Path

# Make the parent package importable when running tests directly.
REPO_ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO_ROOT / "scripts"))

FIXTURES = Path(__file__).resolve().parent / "fixtures"


class TestPackageWiring(unittest.TestCase):
    def test_package_importable(self):
        import datamodel  # noqa: F401 — just verifying the package wires up

    def test_fixtures_exist(self):
        self.assertTrue((FIXTURES / "minimal-workflow-map.yaml").is_file())
        self.assertTrue((FIXTURES / "sample-introspection.json").is_file())

    def test_sample_introspection_loadable(self):
        with open(FIXTURES / "sample-introspection.json") as f:
            data = json.load(f)
        self.assertEqual(len(data["tables"]), 2)


class TestDomains(unittest.TestCase):
    def test_domains_has_all_eight_groups(self):
        from datamodel.domains import DOMAINS
        expected = {
            "CRM & Communication", "Billing & Accounting",
            "Questionnaire & Coaching", "Tickets & Issues",
            "Platform & Config", "Testing & CI",
            "AI Assistant", "Bachelorprojekt & Superpowers",
        }
        self.assertEqual(set(DOMAINS.keys()), expected)

    def test_table_to_domain_resolves_known_tables(self):
        from datamodel.domains import table_to_domain
        self.assertEqual(table_to_domain("tickets", "tickets"), "Tickets & Issues")
        self.assertEqual(table_to_domain("bachelorprojekt", "features"),
                         "Bachelorprojekt & Superpowers")
        self.assertIsNone(table_to_domain("nope", "missing"))


class TestYamlLoader(unittest.TestCase):
    def test_loads_minimal_fixture(self):
        from datamodel.yaml_loader import load_workflow_map
        m = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        self.assertEqual(len(m.families), 2)
        self.assertEqual(len(m.steps), 2)
        self.assertEqual(m.steps[0].id, "dev-flow-plan")
        self.assertEqual(m.cross_skill_gaps[0].from_step, "dev-flow-plan")

    def test_rejects_unknown_family(self):
        import tempfile, yaml
        from datamodel.yaml_loader import load_workflow_map, WorkflowMapError
        bad = {
            "families": [{"id": "x", "label": "X", "color": "feature"}],
            "domain_order": [],
            "steps": [{"id": "s", "family": "MISSING", "label": "S",
                       "writes": {}, "reads": {}, "gaps": []}],
            "cross_skill_gaps": [],
            "heuristics": {},
        }
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as f:
            yaml.safe_dump(bad, f)
            path = f.name
        with self.assertRaisesRegex(WorkflowMapError, "unknown family.*MISSING"):
            load_workflow_map(path)

    def test_rejects_unknown_step_in_cross_skill_gap(self):
        import tempfile, yaml
        from datamodel.yaml_loader import load_workflow_map, WorkflowMapError
        bad = {
            "families": [{"id": "f", "label": "F", "color": "feature"}],
            "domain_order": [],
            "steps": [{"id": "a", "family": "f", "label": "A",
                       "writes": {}, "reads": {}, "gaps": []}],
            "cross_skill_gaps": [{"from": "a", "to": "ghost",
                                  "via": "x", "explanation": "y"}],
            "heuristics": {},
        }
        with tempfile.NamedTemporaryFile("w", suffix=".yaml", delete=False) as f:
            yaml.safe_dump(bad, f)
        with self.assertRaisesRegex(WorkflowMapError, "cross_skill_gaps.*ghost"):
            load_workflow_map(f.name)


class TestDbIntrospection(unittest.TestCase):
    def _fake_runner(self):
        schema_csv = (
            "table_schema,table_name,column_name,data_type,is_nullable\n"
            "tickets,tickets,id,uuid,NO\n"
            "tickets,tickets,external_id,text,NO\n"
            "tickets,tickets,brand_id,text,YES\n"
            "bachelorprojekt,features,id,uuid,NO\n"
            "bachelorprojekt,features,pr_number,integer,NO\n"
        )
        fk_csv = (
            "table_schema,table_name,column_name,fk_schema,fk_table\n"
        )
        pk_csv = (
            "table_schema,table_name,column_name\n"
            "tickets,tickets,id\n"
            "bachelorprojekt,features,id\n"
        )
        return lambda queries: [
            self._parse(schema_csv), self._parse(fk_csv), self._parse(pk_csv)
        ][:len(queries)]

    def _parse(self, csv_text):
        import csv, io
        return list(csv.DictReader(io.StringIO(csv_text)))

    def test_introspect_groups_columns_by_table(self):
        from datamodel.db import introspect_schema
        snapshot = introspect_schema(self._fake_runner())
        self.assertEqual(len(snapshot.tables), 2)
        tickets = snapshot.by_ref["tickets.tickets"]
        self.assertEqual([c.name for c in tickets.columns],
                         ["id", "external_id", "brand_id"])

    def test_introspect_marks_pk_columns(self):
        from datamodel.db import introspect_schema
        snapshot = introspect_schema(self._fake_runner())
        pk_cols = [c.name for c in snapshot.by_ref["tickets.tickets"].columns
                   if c.is_pk]
        self.assertEqual(pk_cols, ["id"])


class TestRenderHero(unittest.TestCase):
    def _sample_map(self):
        from datamodel.yaml_loader import load_workflow_map
        return load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")

    def test_hero_svg_contains_one_rect_per_step(self):
        from datamodel.render import render_hero_svg
        svg = render_hero_svg(self._sample_map())
        self.assertEqual(svg.count('class="step-rect"'), 2)

    def test_hero_svg_contains_one_rect_per_domain(self):
        from datamodel.render import render_hero_svg
        svg = render_hero_svg(self._sample_map())
        self.assertEqual(svg.count('class="domain-pool"'), 2)

    def test_hero_svg_emits_data_attrs(self):
        from datamodel.render import render_hero_svg
        svg = render_hero_svg(self._sample_map())
        self.assertIn('data-step="dev-flow-plan"', svg)
        self.assertIn('data-domain="tickets"', svg)

    def test_hero_svg_emits_write_edges(self):
        from datamodel.render import render_hero_svg
        svg = render_hero_svg(self._sample_map())
        self.assertRegex(svg,
            r'<line[^>]+class="edge edge-write"[^>]+data-from="dev-flow-plan"[^>]+data-to="tickets"')


class TestRenderMatrix(unittest.TestCase):
    def _sample_map(self):
        from datamodel.yaml_loader import load_workflow_map
        return load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")

    def test_matrix_has_row_per_step(self):
        from datamodel.render import render_matrix
        html = render_matrix(self._sample_map())
        self.assertEqual(html.count('class="matrix-row"'), 2)

    def test_matrix_marks_writes(self):
        from datamodel.render import render_matrix
        html = render_matrix(self._sample_map())
        self.assertRegex(html,
            r'<td[^>]+class="cell cell-w"[^>]+data-step="dev-flow-plan"'
            r'[^>]+data-domain="tickets"')

    def test_matrix_emits_header_per_domain(self):
        from datamodel.render import render_matrix
        html = render_matrix(self._sample_map())
        self.assertIn('data-domain-header="tickets"', html)
        self.assertIn('data-domain-header="bachelorprojekt"', html)


class TestRenderSkillCards(unittest.TestCase):
    def _sample_map(self):
        from datamodel.yaml_loader import load_workflow_map
        return load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")

    def test_card_per_step(self):
        from datamodel.render import render_skill_cards
        html = render_skill_cards(self._sample_map())
        self.assertEqual(html.count('class="step-card"'), 2)

    def test_card_lists_writes(self):
        from datamodel.render import render_skill_cards
        html = render_skill_cards(self._sample_map())
        self.assertIn("tickets.tickets", html)
        self.assertIn("docs/superpowers/plans/*.md", html)

    def test_card_groups_by_family(self):
        from datamodel.render import render_skill_cards
        html = render_skill_cards(self._sample_map())
        self.assertIn('data-family-group="dev-flow"', html)
        self.assertIn('data-family-group="ci"', html)


class TestRenderCrossSkillGaps(unittest.TestCase):
    def _sample_map(self):
        from datamodel.yaml_loader import load_workflow_map
        return load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")

    def test_gap_rendered(self):
        from datamodel.render import render_cross_skill_gaps
        html = render_cross_skill_gaps(self._sample_map())
        self.assertIn("dev-flow-plan", html)
        self.assertIn("tracking-import", html)
        self.assertIn("Plan ticket is set", html)


class TestRenderDeepdives(unittest.TestCase):
    def _snapshot(self):
        from datamodel.db import introspect_schema
        return introspect_schema(self._fake_runner())

    def _fake_runner(self):
        schema_csv = (
            "table_schema,table_name,column_name,data_type,is_nullable\n"
            "tickets,tickets,id,uuid,NO\n"
            "tickets,tickets,external_id,text,NO\n"
            "bachelorprojekt,features,id,uuid,NO\n"
            "bachelorprojekt,features,pr_number,integer,NO\n"
        )
        fk_csv = "table_schema,table_name,column_name,fk_schema,fk_table\n"
        pk_csv = ("table_schema,table_name,column_name\n"
                  "tickets,tickets,id\nbachelorprojekt,features,id\n")
        def _parse(t):
            import csv, io
            return list(csv.DictReader(io.StringIO(t)))
        return lambda qs: [_parse(schema_csv), _parse(fk_csv), _parse(pk_csv)][:len(qs)]

    def test_deepdives_emit_one_mermaid_per_domain(self):
        from datamodel.yaml_loader import load_workflow_map
        from datamodel.render import render_domain_deepdives
        wm = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        out = render_domain_deepdives(wm, self._snapshot())
        self.assertEqual(out.count("```mermaid"), 2)

    def test_deepdives_use_erDiagram(self):
        from datamodel.yaml_loader import load_workflow_map
        from datamodel.render import render_domain_deepdives
        wm = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        out = render_domain_deepdives(wm, self._snapshot())
        self.assertIn("erDiagram", out)
        self.assertIn("tickets {", out)


class TestHeuristics(unittest.TestCase):
    def _snapshot_with_dangling_id(self):
        from datamodel.db import introspect_schema
        schema_csv = (
            "table_schema,table_name,column_name,data_type,is_nullable\n"
            "tickets,tickets,id,uuid,NO\n"
            "tickets,tickets,owner_id,uuid,YES\n"
            "tickets,tickets,external_id,text,NO\n"
            "keycloak,user,id,uuid,NO\n"
            "keycloak,user,realm_id,uuid,NO\n"
        )
        fk_csv = "table_schema,table_name,column_name,fk_schema,fk_table\n"
        pk_csv = ("table_schema,table_name,column_name\n"
                  "tickets,tickets,id\nkeycloak,user,id\n")
        def _parse(t):
            import csv, io
            return list(csv.DictReader(io.StringIO(t)))
        return introspect_schema(
            lambda qs: [_parse(schema_csv), _parse(fk_csv), _parse(pk_csv)][:len(qs)]
        )

    def test_unbound_fk_finds_id_columns_without_fk(self):
        from datamodel.yaml_loader import load_workflow_map
        from datamodel.heuristics import unbound_fk_candidates
        wm = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        snap = self._snapshot_with_dangling_id()
        results = unbound_fk_candidates(snap, wm.heuristics)
        refs = {r["ref"] for r in results}
        self.assertIn("tickets.tickets.owner_id", refs)
        self.assertIn("tickets.tickets.external_id", refs)
        # keycloak excluded
        self.assertNotIn("keycloak.user.realm_id", refs)

    def test_table_with_no_writer_flags_orphan_tables(self):
        from datamodel.yaml_loader import load_workflow_map
        from datamodel.heuristics import tables_without_writer
        wm = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        snap = self._snapshot_with_dangling_id()
        orphans = tables_without_writer(snap, wm)
        # keycloak.user excluded; tickets.tickets is declared as writer target
        self.assertEqual(orphans, [])


class TestRenderFooter(unittest.TestCase):
    def test_footer_summarizes_counts(self):
        from datamodel.render import render_footer
        html = render_footer(
            tables_total=42,
            tables_with_writer=30,
            unbound_fk_hits=7,
            cross_skill_gap_count=3,
        )
        self.assertIn("30", html)
        self.assertIn("42", html)
        self.assertIn("7", html)
        self.assertIn("3", html)


class TestAssemblePage(unittest.TestCase):
    def test_assembles_all_sections(self):
        from datamodel.yaml_loader import load_workflow_map
        from datamodel.db import introspect_schema
        from datamodel.render import assemble_page
        wm = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        schema_csv = (
            "table_schema,table_name,column_name,data_type,is_nullable\n"
            "tickets,tickets,id,uuid,NO\n"
            "bachelorprojekt,features,id,uuid,NO\n"
        )
        fk_csv = "table_schema,table_name,column_name,fk_schema,fk_table\n"
        pk_csv = ("table_schema,table_name,column_name\n"
                  "tickets,tickets,id\nbachelorprojekt,features,id\n")
        def _parse(t):
            import csv, io
            return list(csv.DictReader(io.StringIO(t)))
        snap = introspect_schema(
            lambda qs: [_parse(schema_csv), _parse(fk_csv), _parse(pk_csv)][:len(qs)]
        )
        md = assemble_page(wm, snap)
        self.assertIn("# Datamodel × Workflow", md)
        self.assertIn('class="hero-svg"', md)
        self.assertIn('class="matrix"', md)
        self.assertIn('class="step-card"', md)
        self.assertIn("```mermaid", md)
        self.assertIn('class="coverage-footer"', md)
        self.assertIn('<style>', md)
        self.assertIn('<script>', md)


class TestPageWiring(unittest.TestCase):
    def test_assembled_page_has_handlers(self):
        from datamodel.yaml_loader import load_workflow_map
        from datamodel.db import introspect_schema
        from datamodel.render import assemble_page
        wm = load_workflow_map(FIXTURES / "minimal-workflow-map.yaml")
        snap = introspect_schema(lambda qs: [[]] * len(qs))
        md = assemble_page(wm, snap)
        self.assertIn('window.dm', md)
        self.assertIn('onclick="dm.cellClick(this)"', md)
        self.assertIn('addEventListener', md)


class TestCli(unittest.TestCase):
    def test_writes_output_to_path(self):
        import tempfile
        from datamodel.build_datamodel import build
        with tempfile.NamedTemporaryFile("w", suffix=".md", delete=False) as f:
            out_path = f.name
        result = build(
            map_path=str(FIXTURES / "minimal-workflow-map.yaml"),
            out_path=out_path,
            runner=lambda qs: [[]] * len(qs),
        )
        self.assertTrue(result["ok"])
        from pathlib import Path
        text = Path(out_path).read_text()
        self.assertIn("# Datamodel × Workflow", text)
        self.assertIn('class="hero-svg"', text)
        self.assertIn('class="matrix"', text)


if __name__ == "__main__":
    unittest.main()
