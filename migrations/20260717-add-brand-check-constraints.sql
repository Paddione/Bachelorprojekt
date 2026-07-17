-- T001925: Add CHECK constraints for brand column
-- Tables with only 'mentolder' brand (single-brand)
ALTER TABLE billing_customers ADD CONSTRAINT chk_brand_billing_customers CHECK (brand = 'mentolder');
ALTER TABLE billing_invoices ADD CONSTRAINT chk_brand_billing_invoices CHECK (brand = 'mentolder');
ALTER TABLE invoice_counters ADD CONSTRAINT chk_brand_invoice_counters CHECK (brand = 'mentolder');
ALTER TABLE leistungen_config ADD CONSTRAINT chk_brand_leistungen_config CHECK (brand = 'mentolder');
ALTER TABLE referenzen_config ADD CONSTRAINT chk_brand_referenzen_config CHECK (brand = 'mentolder');
ALTER TABLE service_config ADD CONSTRAINT chk_brand_service_config CHECK (brand = 'mentolder');
ALTER TABLE service_page_config ADD CONSTRAINT chk_brand_service_page_config CHECK (brand = 'mentolder');
ALTER TABLE site_settings ADD CONSTRAINT chk_brand_site_settings CHECK (brand = 'mentolder');
ALTER TABLE v_billing_invoices_with_state ADD CONSTRAINT chk_brand_v_billing_invoices_with_state CHECK (brand = 'mentolder');

-- Tables with both brands
ALTER TABLE folder_templates ADD CONSTRAINT chk_brand_folder_templates CHECK (brand IN ('mentolder', 'korczewski'));

-- Empty tables (allow both brands for future use)
ALTER TABLE assets ADD CONSTRAINT chk_brand_assets CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE billing_invoice_dunnings ADD CONSTRAINT chk_brand_billing_invoice_dunnings CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE billing_invoice_payments ADD CONSTRAINT chk_brand_billing_invoice_payments CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE billing_nachweis ADD CONSTRAINT chk_brand_billing_nachweis CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE billing_quotes ADD CONSTRAINT chk_brand_billing_quotes CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE billing_suppliers ADD CONSTRAINT chk_brand_billing_suppliers CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE eur_bookings ADD CONSTRAINT chk_brand_eur_bookings CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE eur_bookkeeping ADD CONSTRAINT chk_brand_eur_bookkeeping CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE free_time_windows ADD CONSTRAINT chk_brand_free_time_windows CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE homepage_block_documents ADD CONSTRAINT chk_brand_homepage_block_documents CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE homepage_block_versions ADD CONSTRAINT chk_brand_homepage_block_versions CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE learning_progress ADD CONSTRAINT chk_brand_learning_progress CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE legal_pages ADD CONSTRAINT chk_brand_legal_pages CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE onboarding_state ADD CONSTRAINT chk_brand_onboarding_state CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE prompt_library ADD CONSTRAINT chk_brand_prompt_library CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE supplier_invoices ADD CONSTRAINT chk_brand_supplier_invoices CHECK (brand IN ('mentolder', 'korczewski'));
ALTER TABLE tax_mode_changes ADD CONSTRAINT chk_brand_tax_mode_changes CHECK (brand IN ('mentolder', 'korczewski'));
