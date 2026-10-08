"""Native migration of tests/spec/admin-ui-modal-drawer.bats (13 cases)."""
import re
import pytest


@pytest.fixture
def admin_ui(repo_root):
    return repo_root / 'components/website/src/components/admin/ui'


@pytest.fixture
def modal(admin_ui):
    return (admin_ui / 'AdminModal.svelte').read_text()


def test_modal_native_dialog(modal):
    assert '<dialog' in modal
    assert 'data-testid="admin-modal"' in modal


def test_modal_test_id(modal):
    assert 'data-testid=' in modal


def test_modal_heading_reference(modal):
    ref = re.search(r'aria-labelledby=\{([A-Za-z0-9_]+)\}', modal)
    assert ref
    assert 'id={' + ref.group(1) + '}' in modal


def test_modal_open_close(modal):
    assert 'showModal' in modal
    assert 'close()' in modal


def test_modal_bindable(modal):
    assert re.search(r'open\s*=\s*\$bindable\(', modal)


def test_modal_callback(modal):
    assert re.search(r'onclose|on:close', modal)


def test_modal_snippets(modal):
    assert 'body' in modal
    assert 'footer' in modal


def test_drawer_exists(admin_ui):
    assert (admin_ui / 'AdminDrawer.svelte').is_file()


def test_drawer_accessibility(admin_ui):
    text = (admin_ui / 'AdminDrawer.svelte').read_text()
    assert 'data-testid' in text
    assert 'aria-labelledby' in text


def test_migrated_selectors(modal, admin_ui):
    assert 'data-testid' in modal
    assert 'data-testid' in (admin_ui / 'AdminDrawer.svelte').read_text()


def test_ticket_create_nonmigration():
    pytest.skip('Original nonmigration case was unconditional success (`|| true`)')


def test_version_drawer_nonmigration():
    pytest.skip('Original nonmigration case had no assertion')


def test_modal_component_test(admin_ui):
    # Original grep against a directory had no status assertion. Check the intended artifact.
    assert any(admin_ui.glob('AdminModal.test.*'))
