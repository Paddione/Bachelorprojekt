"""Native migration of tests/spec/website-schema/fk-targets-unique.bats."""

import re
import yaml


def test_features_foreign_key_targets_are_primary_or_unique(repo_root):
    manifest = yaml.safe_load((repo_root / "k3d/website-schema.yaml").read_text())
    block = manifest["data"].get("ensure-bachelorprojekt-schema.sh")
    assert block, "Ensure-schema script not found"
    columns = set(re.findall(r"REFERENCES bachelorprojekt\.features\(([a-z_]+)\)", block))
    assert columns, "No features foreign keys found"
    for column in columns - {"id"}:
        pattern = rf"bachelorprojekt\.features ADD CONSTRAINT [a-z_]+ UNIQUE \({column}\)"
        assert re.search(pattern, block), f"features({column}) lacks UNIQUE constraint"
