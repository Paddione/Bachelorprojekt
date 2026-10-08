"""Native migration of tests/spec/website-schema/fk-targets-unique.bats."""

import re


def _script_block(schema_text, key):
    """Body of ConfigMap script key `  <key>: |` up to the next `  name: |` key."""
    target = f"  {key}: |"
    out, active = [], False
    for line in schema_text.splitlines():
        if line == target:
            active = True
            continue
        if active and re.match(r"^  [A-Za-z0-9_.-]+: [|]", line):
            break
        if active:
            out.append(line)
    return "\n".join(out)


def test_ensure_bachelorprojekt_schema_jede_fk_zielspalte_auf_features_ist_id_oder_unique(repo_root):
    schema = (repo_root / "k3d" / "website-schema.yaml").read_text(encoding="utf-8")
    block = _script_block(schema, "ensure-bachelorprojekt-schema.sh")
    assert block, "Skript-Schluessel nicht gefunden"

    cols = sorted(set(re.findall(r"REFERENCES bachelorprojekt\.features\(([a-z_]+)\)", block)))
    # Positiv-Anker: ohne gefundene Referenz waere der Test vakuos.
    assert cols, "keine REFERENCES bachelorprojekt.features(...) gefunden"

    for col in cols:
        if col == "id":
            continue
        assert re.search(rf"bachelorprojekt\.features ADD CONSTRAINT [a-z_]+ UNIQUE \({col}\)", block), \
            f"features({col}) wird referenziert, hat aber keinen UNIQUE-Constraint"
