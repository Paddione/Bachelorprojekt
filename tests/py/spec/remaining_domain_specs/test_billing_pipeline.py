"""Native migration of tests/spec/billing-pipeline.bats."""
import pytest

def test_billing_placeholder():
    pytest.skip('Original case only ran true')

def test_purge_test_flags(repo_root):
    for path in ['components/website/src/lib/billing-db.ts', 'scripts/one-shot/purge-fn-v8.sql']:
        assert 'is_test_data' in (repo_root / path).read_text()

def test_purge_customer_real_invoice_guard(repo_root):
    text = (repo_root / 'scripts/one-shot/purge-fn-v8.sql').read_text()
    assert 'bi.is_test_data = false' in text
    assert 'WHERE bi.customer_id = c.id::text)' in text

def test_billing_purge_script(repo_root):
    assert 'billing_invoices' in (repo_root / 'scripts/one-shot/purge-billing-testdata.sql').read_text()
