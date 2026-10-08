"""Native migration of tests/spec/grilling-flow.bats."""
def grilling(repo_root):
    return repo_root / 'components/website/src/lib/tickets/grilling.ts'

def test_module_exists(repo_root):
    assert grilling(repo_root).is_file()

def test_get_questionnaire(repo_root):
    assert 'getQuestionnaire' in grilling(repo_root).read_text()

def test_final_questionnaire(repo_root):
    assert 'final-grilling-v1' in grilling(repo_root).read_text()

def test_coaching_questionnaire(repo_root):
    assert 'coaching-sessions-v1' in grilling(repo_root).read_text()

def test_choices(repo_root):
    assert 'choices' in grilling(repo_root).read_text()

def test_questionnaire_unit_test(repo_root):
    assert (repo_root / 'components/website/src/lib/tickets/grilling.test.ts').is_file()
