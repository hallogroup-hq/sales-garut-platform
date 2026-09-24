-- ====================================================================
-- SALES GARUT INTELLIGENCE PLATFORM — DATABASE SCHEMA (PostgreSQL DDL)
-- Reference: Sales Garut Intelligence Platform PRD v0.2
-- ====================================================================

-- 1. Organizational Hierarchy
CREATE TABLE IF NOT EXISTS org_district (
    district_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS org_sub_dso (
    sub_dso_id VARCHAR(50) PRIMARY KEY,
    district_id VARCHAR(50) NOT NULL REFERENCES org_district(district_id),
    name VARCHAR(100) NOT NULL
);

CREATE TABLE IF NOT EXISTS org_spv (
    spv_id VARCHAR(50) PRIMARY KEY,
    sub_dso_id VARCHAR(50) NOT NULL REFERENCES org_sub_dso(sub_dso_id),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL
);

CREATE TABLE IF NOT EXISTS org_salesman (
    salesman_id VARCHAR(50) PRIMARY KEY,
    spv_id VARCHAR(50) REFERENCES org_spv(spv_id),
    name VARCHAR(100) NOT NULL,
    code VARCHAR(50) NOT NULL,
    role VARCHAR(50) DEFAULT 'SALESMAN',
    salesman_type VARCHAR(50) DEFAULT 'Kanvas', -- 'Kanvas', 'GT', 'CB', 'OTHER'
    sales_division VARCHAR(50) DEFAULT 'Canvas',
    sales_group VARCHAR(50) DEFAULT 'SAVORIA', -- 'SAVORIA', 'SMC', 'SAVORIA_OTHERS'
    target_cl INTEGER DEFAULT 375,
    visit_cycle VARCHAR(50) DEFAULT '3 Minggu',
    has_rayon BOOLEAN DEFAULT 1,
    max_rayon INTEGER DEFAULT 15,
    is_active BOOLEAN DEFAULT 1
);

-- 2. Geographic & Route Dimensions
CREATE TABLE IF NOT EXISTS dim_rayon (
    rayon_id VARCHAR(50) PRIMARY KEY,
    code VARCHAR(10) NOT NULL UNIQUE, -- 'R01' to 'R15'
    name VARCHAR(100) NOT NULL,
    default_salesman_id VARCHAR(50) REFERENCES org_salesman(salesman_id)
);

CREATE TABLE IF NOT EXISTS dim_kecamatan (
    kecamatan_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    kabupaten VARCHAR(100) DEFAULT 'KAB. GARUT',
    provinsi VARCHAR(100) DEFAULT 'JAWA BARAT',
    geo_boundary_json TEXT -- Nullable GeoJSON polygon
);

CREATE TABLE IF NOT EXISTS dim_pasar (
    pasar_id VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    is_pasar BOOLEAN DEFAULT 0
);

-- 3. Canonical Outlet & Identity Mapping
CREATE TABLE IF NOT EXISTS dim_outlet (
    outlet_id VARCHAR(50) PRIMARY KEY, -- Canonical UUID / System ID
    canonical_name VARCHAR(150) NOT NULL,
    address_text TEXT,
    current_salesman_id VARCHAR(50) REFERENCES org_salesman(salesman_id),
    current_rayon_id VARCHAR(50) REFERENCES dim_rayon(rayon_id),
    kecamatan_id VARCHAR(50) REFERENCES dim_kecamatan(kecamatan_id),
    pasar_id VARCHAR(50) REFERENCES dim_pasar(pasar_id),
    cluster_tier VARCHAR(50) DEFAULT 'retail 1', -- 'retail 1', 'Retail 2', 'Retail 3', 'Semi Grosir', 'Grosir', 'Star Outlet'
    is_mbg BOOLEAN DEFAULT 0, -- Program Makan Bergizi Gratis (separate program flag)
    channel VARCHAR(50) DEFAULT 'GT',
    credit_limit NUMERIC(15, 2) DEFAULT 0,
    term_of_payment INTEGER DEFAULT 0,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    is_active_cl BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outlet_alias (
    alias_id VARCHAR(50) PRIMARY KEY,
    outlet_id VARCHAR(50) NOT NULL REFERENCES dim_outlet(outlet_id),
    source_system VARCHAR(50) NOT NULL, -- 'ERP', 'DSO', 'SFA', 'LEGACY'
    source_customer_code VARCHAR(100) NOT NULL UNIQUE,
    source_customer_name VARCHAR(150),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS outlet_assignment_history (
    assignment_id VARCHAR(50) PRIMARY KEY,
    outlet_id VARCHAR(50) NOT NULL REFERENCES dim_outlet(outlet_id),
    salesman_id VARCHAR(50) NOT NULL REFERENCES org_salesman(salesman_id),
    rayon_id VARCHAR(50) REFERENCES dim_rayon(rayon_id),
    valid_from TIMESTAMP NOT NULL,
    valid_to TIMESTAMP,
    changed_by VARCHAR(100),
    change_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Product Hierarchy & SKU Master
CREATE TABLE IF NOT EXISTS dim_product (
    item_code VARCHAR(50) PRIMARY KEY,
    item_name VARCHAR(150) NOT NULL,
    principal VARCHAR(100) NOT NULL,
    category_sku VARCHAR(100) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    group_sku VARCHAR(100) NOT NULL,
    subbrand VARCHAR(100),
    conversion_pcs_inner NUMERIC(10, 2) DEFAULT 1,
    conversion_pcs_carton NUMERIC(10, 2) NOT NULL DEFAULT 1,
    must_have_line VARCHAR(50) DEFAULT 'NONE', -- 'KTG', 'DELI', 'RTD', 'FOX', 'UHT', 'NONE'
    incentive_group VARCHAR(50) DEFAULT 'NON_KOPI_NON_BVG', -- 'KOPI', 'BEVERAGE', 'NON_KOPI_NON_BVG'
    is_active BOOLEAN DEFAULT 1
);

-- 5. Import Batch & Audit Infrastructure
CREATE TABLE IF NOT EXISTS import_batch (
    batch_id VARCHAR(50) PRIMARY KEY,
    dataset_type VARCHAR(50) NOT NULL, -- 'TRANSACTIONS', 'CUSTOMER_LIST', 'TARGETS', 'INCENTIVE_VALUE_TARGETS', 'STOCK', 'AR'
    filename VARCHAR(255) NOT NULL,
    file_hash_sha256 VARCHAR(64) NOT NULL,
    uploader_id VARCHAR(50) NOT NULL,
    status VARCHAR(50) NOT NULL, -- 'STAGED', 'COMMITTED', 'ROLLED_BACK', 'FAILED'
    total_rows INTEGER DEFAULT 0,
    valid_rows INTEGER DEFAULT 0,
    warning_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    error_details_json TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    committed_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_log (
    audit_id VARCHAR(50) PRIMARY KEY,
    user_id VARCHAR(50) NOT NULL,
    user_name VARCHAR(100) NOT NULL,
    user_role VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL, -- 'CREATE', 'UPDATE', 'DELETE', 'IMPORT_COMMIT', 'IMPORT_ROLLBACK', 'REASSIGN_OUTLET'
    entity_type VARCHAR(50) NOT NULL, -- 'outlet', 'target', 'calendar', 'must_have', 'npl', 'settings'
    entity_id VARCHAR(100) NOT NULL,
    before_state_json TEXT,
    after_state_json TEXT,
    ip_address VARCHAR(50),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Sales Transactions (Fact Headers & Lines)
CREATE TABLE IF NOT EXISTS fact_sales_header (
    document_number VARCHAR(100) PRIMARY KEY,
    transaction_date DATE NOT NULL,
    due_date DATE,
    period_year INTEGER,
    period_month INTEGER,
    outlet_id VARCHAR(50) NOT NULL REFERENCES dim_outlet(outlet_id),
    invoice_salesman_id VARCHAR(50) NOT NULL REFERENCES org_salesman(salesman_id),
    current_owner_salesman_id VARCHAR(50) REFERENCES org_salesman(salesman_id),
    unit_type VARCHAR(50) NOT NULL DEFAULT 'Sales', -- 'Sales', 'Return'
    payment_term_days INTEGER DEFAULT 0,
    credit_limit NUMERIC(15, 2) DEFAULT 0,
    import_batch_id VARCHAR(50) REFERENCES import_batch(batch_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fact_sales_line (
    line_id VARCHAR(50) PRIMARY KEY,
    document_number VARCHAR(100) NOT NULL REFERENCES fact_sales_header(document_number) ON DELETE CASCADE,
    item_code VARCHAR(50) NOT NULL REFERENCES dim_product(item_code),
    primary_quantity NUMERIC(12, 4) NOT NULL,
    carton_quantity NUMERIC(12, 4) NOT NULL,
    sales_before_discount NUMERIC(15, 2) NOT NULL,
    discount_amount NUMERIC(15, 2) DEFAULT 0,
    discount_distributor NUMERIC(15, 2) DEFAULT 0,
    discount_principal NUMERIC(15, 2) DEFAULT 0,
    sales_netto NUMERIC(15, 2) NOT NULL,
    vat_amount NUMERIC(15, 2) DEFAULT 0,
    dpp_amount NUMERIC(15, 2) NOT NULL,
    return_reason VARCHAR(100),
    is_non_omzet BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS agg_monthly_sales_movement (
    id VARCHAR(100) PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    period_key VARCHAR(7) NOT NULL,
    salesman_id VARCHAR(50) NOT NULL,
    salesman_name VARCHAR(100) NOT NULL,
    sales_group VARCHAR(50) DEFAULT 'SAVORIA',
    principal VARCHAR(100) NOT NULL,
    brand VARCHAR(100) NOT NULL,
    group_sku VARCHAR(100),
    net_cartons NUMERIC(15, 4) NOT NULL DEFAULT 0,
    gross_cartons NUMERIC(15, 4) NOT NULL DEFAULT 0,
    retur_cartons NUMERIC(15, 4) NOT NULL DEFAULT 0,
    net_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
    dpp_value NUMERIC(18, 2) NOT NULL DEFAULT 0,
    active_outlets INTEGER NOT NULL DEFAULT 0,
    total_invoices INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_agg_monthly_period ON agg_monthly_sales_movement(year, month);
CREATE INDEX IF NOT EXISTS idx_agg_monthly_salesman ON agg_monthly_sales_movement(salesman_id);
CREATE INDEX IF NOT EXISTS idx_agg_monthly_brand ON agg_monthly_sales_movement(brand);
CREATE INDEX IF NOT EXISTS idx_agg_monthly_principal ON agg_monthly_sales_movement(principal);

-- 6b. Single-Counted Distinct Active Outlets (Authoritative Truth from Raw Data Pivot)
CREATE TABLE IF NOT EXISTS fact_distinct_active_outlet (
    id VARCHAR(100) PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER,
    period_key VARCHAR(10) NOT NULL,
    salesman_id VARCHAR(50),
    salesman_name VARCHAR(100),
    sales_group VARCHAR(50) DEFAULT 'SAVORIA',
    group_sku VARCHAR(100) DEFAULT 'ALL',
    distinct_active_outlets INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_fdao_lookup ON fact_distinct_active_outlet(year, month, salesman_id);
CREATE INDEX IF NOT EXISTS idx_fdao_period ON fact_distinct_active_outlet(period_key);

-- 7. Targets
CREATE TABLE IF NOT EXISTS fact_quantity_target (
    target_id VARCHAR(50) PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    salesman_id VARCHAR(50) NOT NULL REFERENCES org_salesman(salesman_id),
    group_sku VARCHAR(100) NOT NULL,
    target_cartons NUMERIC(12, 4) NOT NULL,
    target_value NUMERIC(15, 2) DEFAULT 0,
    import_batch_id VARCHAR(50) REFERENCES import_batch(batch_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sales_target UNIQUE (year, month, salesman_id, group_sku)
);

CREATE TABLE IF NOT EXISTS fact_incentive_value_target (
    id VARCHAR(50) PRIMARY KEY,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    salesman_id VARCHAR(50) NOT NULL REFERENCES org_salesman(salesman_id),
    target_value NUMERIC(15, 2) NOT NULL,
    import_batch_id VARCHAR(50) REFERENCES import_batch(batch_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_incentive_value_target UNIQUE (year, month, salesman_id)
);

-- 8. Inventory & Accounts Receivable
CREATE TABLE IF NOT EXISTS fact_inventory_snapshot (
    snapshot_date DATE NOT NULL,
    item_code VARCHAR(50) NOT NULL REFERENCES dim_product(item_code),
    saldo_administrasi_ctn NUMERIC(12, 4) NOT NULL,
    bon_produk_ctn NUMERIC(12, 4) NOT NULL,
    available_stock_ctn NUMERIC(12, 4) NOT NULL,
    stok_fisik_ctn NUMERIC(12, 4) NOT NULL,
    stok_perjalanan_ctn NUMERIC(12, 4) NOT NULL,
    import_batch_id VARCHAR(50) REFERENCES import_batch(batch_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (snapshot_date, item_code)
);

CREATE TABLE IF NOT EXISTS fact_ar_invoice (
    invoice_number VARCHAR(100) PRIMARY KEY,
    outlet_id VARCHAR(50) NOT NULL REFERENCES dim_outlet(outlet_id),
    salesman_id VARCHAR(50) REFERENCES org_salesman(salesman_id),
    invoice_date DATE NOT NULL,
    due_date DATE NOT NULL,
    faktur_netto NUMERIC(15, 2) NOT NULL,
    sudah_bayar NUMERIC(15, 2) DEFAULT 0,
    saldo_piutang NUMERIC(15, 2) NOT NULL,
    overdue_days INTEGER NOT NULL,
    as_of_date DATE NOT NULL,
    import_batch_id VARCHAR(50) REFERENCES import_batch(batch_id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Product Program & Incentive Configuration
CREATE TABLE IF NOT EXISTS must_have_program_config (
    line_code VARCHAR(50) PRIMARY KEY, -- 'KTG', 'DELI', 'RTD', 'FOX', 'UHT'
    line_name VARCHAR(100) NOT NULL,
    target_penetration_pct NUMERIC(5, 2) NOT NULL, -- 45.0, 45.0, 30.0, 35.0, 40.0
    is_active BOOLEAN DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS npl_campaign (
    campaign_id VARCHAR(50) PRIMARY KEY,
    campaign_name VARCHAR(100) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE,
    target_m1_penetration_pct NUMERIC(5, 2) DEFAULT 70.0,
    target_m3_penetration_pct NUMERIC(5, 2) DEFAULT 85.0,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS npl_campaign_sku (
    campaign_id VARCHAR(50) NOT NULL REFERENCES npl_campaign(campaign_id) ON DELETE CASCADE,
    item_code VARCHAR(50) NOT NULL REFERENCES dim_product(item_code) ON DELETE CASCADE,
    PRIMARY KEY (campaign_id, item_code)
);

CREATE TABLE IF NOT EXISTS incentive_rule (
    rule_id VARCHAR(50) PRIMARY KEY,
    component_number INTEGER NOT NULL,
    component_name VARCHAR(100) NOT NULL,
    mangkok_amount NUMERIC(15, 2) NOT NULL,
    min_achievement_pct NUMERIC(5, 2) NOT NULL,
    max_achievement_pct NUMERIC(5, 2) NOT NULL,
    payout_rule_type VARCHAR(50) NOT NULL, -- 'PROPORTIONAL_CAPPED', 'BINARY_FULL', 'FORMULA_TBD'
    is_active BOOLEAN DEFAULT 1,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 10. Business Calendar & Settings
CREATE TABLE IF NOT EXISTS business_calendar (
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    total_hk INTEGER NOT NULL, -- Total working days
    as_of_hke INTEGER NOT NULL, -- Elapsed working days
    monitoring_date DATE,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (year, month)
);

CREATE TABLE IF NOT EXISTS business_settings (
    key VARCHAR(100) PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. App Users & RBAC
CREATE TABLE IF NOT EXISTS app_user (
    user_id VARCHAR(50) PRIMARY KEY,
    username VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    role VARCHAR(50) NOT NULL, -- 'DSM', 'SPV', 'SALESMAN'
    scope_spv_id VARCHAR(50) REFERENCES org_spv(spv_id),
    scope_salesman_id VARCHAR(50) REFERENCES org_salesman(salesman_id),
    can_upload_sales BOOLEAN DEFAULT 0,
    can_edit_customer BOOLEAN DEFAULT 0,
    can_edit_target BOOLEAN DEFAULT 0,
    can_manage_incentive BOOLEAN DEFAULT 0,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 12. Program Toko Berjalan (Trade Promo & Loyalty Programs - media_1789304819065.png)
CREATE TABLE IF NOT EXISTS store_loyalty_program (
    program_id VARCHAR(50) PRIMARY KEY,
    program_name VARCHAR(150) NOT NULL,
    program_type VARCHAR(50) DEFAULT 'LOYALTY', -- 'LOYALTY', 'DISPLAY', 'TRADE_PROMO'
    product_focus VARCHAR(100) DEFAULT 'KOPI TUBRUK GADJAH',
    start_date DATE,
    end_date DATE,
    is_active BOOLEAN DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS store_loyalty_program_outlet (
    row_id VARCHAR(50) PRIMARY KEY,
    program_id VARCHAR(50) NOT NULL REFERENCES store_loyalty_program(program_id) ON DELETE CASCADE,
    customer_code VARCHAR(100) NOT NULL,
    customer_name VARCHAR(150) NOT NULL,
    target_cartons NUMERIC(10, 2) NOT NULL DEFAULT 0,
    strata VARCHAR(50),
    reward_strata_pct NUMERIC(6, 3) DEFAULT 0,
    est_reward_amount NUMERIC(15, 2) DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for high-performance aggregations
CREATE INDEX IF NOT EXISTS idx_sales_header_date ON fact_sales_header(transaction_date);
CREATE INDEX IF NOT EXISTS idx_sales_header_period ON fact_sales_header(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_sales_header_outlet ON fact_sales_header(outlet_id);
CREATE INDEX IF NOT EXISTS idx_sales_header_salesman ON fact_sales_header(invoice_salesman_id);
CREATE INDEX IF NOT EXISTS idx_sales_header_owner ON fact_sales_header(current_owner_salesman_id);
CREATE INDEX IF NOT EXISTS idx_sales_line_doc ON fact_sales_line(document_number);
CREATE INDEX IF NOT EXISTS idx_sales_line_item ON fact_sales_line(item_code);
CREATE INDEX IF NOT EXISTS idx_outlet_alias_code ON outlet_alias(source_customer_code);
CREATE INDEX IF NOT EXISTS idx_target_period ON fact_quantity_target(year, month);
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
