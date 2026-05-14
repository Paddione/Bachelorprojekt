#!/usr/bin/env python3
import tempfile, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plans_parse import parse_plan

def make_plan(extra=""):
    content = f"""---
title: Test Plan
domains: [website]
status: active
{extra}
---

# Test Plan

## Task 1: Do thing

- [ ] Step 1: Do the thing
"""
    f = tempfile.NamedTemporaryFile(suffix='.md', mode='w', delete=False)
    f.write(content)
    f.close()
    return f.name

def test_includes_brainstorm_fields():
    path = make_plan("brainstorm_choice: B\nbrainstorm_session: 123456-789012")
    result = parse_plan(path)
    assert result.get('brainstorm_choice') == 'B', \
        f"Expected 'B', got {result.get('brainstorm_choice')}"
    assert result.get('brainstorm_session') == '123456-789012', \
        f"Got {result.get('brainstorm_session')}"
    print("PASS: brainstorm fields included")

def test_missing_brainstorm_fields_are_none():
    path = make_plan()
    result = parse_plan(path)
    assert result.get('brainstorm_choice') is None, \
        f"Expected None, got {result.get('brainstorm_choice')}"
    assert result.get('brainstorm_session') is None, \
        f"Expected None, got {result.get('brainstorm_session')}"
    print("PASS: missing brainstorm fields are None")

test_includes_brainstorm_fields()
test_missing_brainstorm_fields_are_none()
