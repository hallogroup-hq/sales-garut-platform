import os
import re
import sys
import time
import zipfile
import sqlite3
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta

def col_to_idx(cell_ref):
    m = re.match(r'([A-Z]+)', cell_ref)
    if not m:
        return 0
    letters = m.group(1)
    num = 0
    for c in letters:
        num = num * 26 + (ord(c) - ord('A') + 1)
    return num - 1

def parse_excel_date(val_str):
    if not val_str:
        return '2026-01-01'
    try:
        val_float = float(val_str)
        # Excel epoch is 1899-12-30
        dt = datetime(1899, 12, 30) + timedelta(days=val_float)
        return dt.strftime('%Y-%m-%d')
    except Exception:
        return str(val_str)[:10]

MONTH_MAP = {
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
}

SALESMAN_NAME_MAP = {
    'ANDI AGUNG GUMILAR': ('305032', 'ANDI AGUNG GUMILAR'),
    'Ibna Faizal Rahman': ('305030', 'Ibna Faizal Rahman'),
    'Mega Nugraha': ('305029', 'Mega Nugraha'),
    'Muhamad Fikri Hambali': ('107075', 'Muhamad Fikri Hambali'),
    'Muhammad Zulfa Akbar': ('305033', 'Muhammad Zulfa Akbar'),
    'Mulyana': ('305028', 'Mulyana'),
    'Risan Setiawan': ('305031', 'Risan Setiawan'),
    'DSM_GARUT': ('DSM_GARUT', 'DSM GARUT')
}

def main():
    start_time = time.time()
    raw_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../New Raw Data/master data.xlsx'))
    db_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../../sales_garut.db'))

    if not os.path.exists(raw_path):
        print(f"Error: Raw file not found at {raw_path}")
        sys.exit(1)

    print(f"Opening {raw_path}...")
    with zipfile.ZipFile(raw_path, 'r') as z:
        print("Reading sharedStrings.xml...")
        ss = []
        with z.open('xl/sharedStrings.xml') as f:
            for event, elem in ET.iterparse(f, events=('end',)):
                if elem.tag.endswith('si'):
                    t = elem.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                    val = t.text if (t is not None and t.text) else ''
                    if not val:
                        runs = elem.findall('.//{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t')
                        val = ''.join([r.text for r in runs if r.text])
                    ss.append(val)
                    elem.clear()
        print(f"Loaded {len(ss):,} shared strings in {time.time() - start_time:.1f}s.")

        print("Streaming and aggregating sheet1.xml...")
        agg = {} # key -> dict of metrics
        outlets_seen = {}
        products_seen = {}
        
        headers_2026 = {} # inv_num -> header tuple
        lines_2026 = []   # list of line tuples

        row_count = 0
        with z.open('xl/worksheets/sheet1.xml') as f:
            for event, elem in ET.iterparse(f, events=('end',)):
                if not elem.tag.endswith('row'):
                    continue
                row_count += 1
                if row_count == 1:
                    elem.clear()
                    continue

                row_dict = {}
                for c in elem.findall('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}c'):
                    ref = c.attrib.get('r')
                    if not ref:
                        continue
                    idx = col_to_idx(ref)
                    t = c.attrib.get('t')
                    v = c.find('{http://schemas.openxmlformats.org/spreadsheetml/2006/main}v')
                    val = v.text if v is not None else ''
                    if t == 's' and val != '':
                        try:
                            val = ss[int(val)]
                        except Exception:
                            val = ''
                    row_dict[idx] = val
                elem.clear()

                # Extract key fields
                try:
                    year_val = int(row_dict.get(3, '0') or '0')
                except Exception:
                    year_val = 0
                month_str = (row_dict.get(4, '') or '').strip().lower()
                month_val = MONTH_MAP.get(month_str[:3], 0)
                if year_val < 2020 or month_val == 0:
                    continue

                raw_salesman_code = (row_dict.get(7, '') or '').strip()
                raw_salesman_name = (row_dict.get(8, '') or '').strip()
                sales_group = (row_dict.get(65, '') or '').strip() or 'SAVORIA'
                
                # Canonical salesman mapping
                if raw_salesman_name in SALESMAN_NAME_MAP:
                    sm_id, sm_name = SALESMAN_NAME_MAP[raw_salesman_name]
                elif sales_group.upper() in ('SCM', 'SMC'):
                    sm_id, sm_name = 'SMC_GARUT', raw_salesman_name or 'SMC Garut Team'
                elif 'DSM' in raw_salesman_name.upper():
                    sm_id, sm_name = 'DSM_GARUT', 'DSM GARUT'
                else:
                    sm_id, sm_name = (raw_salesman_code or 'SAVORIA_OTH'), (raw_salesman_name or 'Savoria (Others)')

                doc_num = (row_dict.get(13, '') or '').strip()
                cust_code = (row_dict.get(25, '') or '').strip()
                cust_name = (row_dict.get(26, '') or '').strip()
                principal = (row_dict.get(28, '') or '').strip() or 'SAVORIA'
                brand = (row_dict.get(29, '') or '').strip() or 'OTHERS'
                item_code = (row_dict.get(32, '') or '').strip()
                item_name = (row_dict.get(33, '') or '').strip()
                group_sku = (row_dict.get(63, '') or '').strip() or brand
                category_sku = (row_dict.get(71, '') or '').strip() or 'OTHERS'

                try:
                    sales_ctn = float(row_dict.get(38, '0') or '0')
                except Exception:
                    sales_ctn = 0.0
                try:
                    sales_netto = float(row_dict.get(41, '0') or '0')
                except Exception:
                    sales_netto = 0.0
                try:
                    sales_dpp = float(row_dict.get(44, '0') or '0')
                except Exception:
                    sales_dpp = 0.0
                try:
                    primary_qty = float(row_dict.get(37, '0') or '0')
                except Exception:
                    primary_qty = sales_ctn
                try:
                    before_disc = float(row_dict.get(39, '0') or '0')
                except Exception:
                    before_disc = sales_netto
                try:
                    disc_amt = float(row_dict.get(40, '0') or '0')
                except Exception:
                    disc_amt = 0.0
                try:
                    vat_amt = float(row_dict.get(42, '0') or '0')
                except Exception:
                    vat_amt = 0.0

                retur_reason = (row_dict.get(45, '') or '').strip()
                is_non_omzet = 1 if row_dict.get(54, '') == '1' else 0

                # Track unique outlets & products
                if cust_code and cust_code not in outlets_seen:
                    outlets_seen[cust_code] = (cust_name, row_dict.get(19, ''), row_dict.get(68, ''))
                if item_code and item_code not in products_seen:
                    products_seen[item_code] = (item_name, principal, brand, group_sku, category_sku)

                # Aggregation key: (year, month, salesman_id, salesman_name, sales_group, principal, brand, group_sku)
                agg_key = (year_val, month_val, sm_id, sm_name, sales_group, principal, brand, group_sku)
                if agg_key not in agg:
                    agg[agg_key] = {
                        'net_ctn': 0.0,
                        'gross_ctn': 0.0,
                        'retur_ctn': 0.0,
                        'net_val': 0.0,
                        'dpp_val': 0.0,
                        'outlets': set(),
                        'invoices': set()
                    }
                
                entry = agg[agg_key]
                if not is_non_omzet:
                    entry['net_ctn'] += sales_ctn
                    entry['net_val'] += sales_netto
                    entry['dpp_val'] += sales_dpp

                    if sales_ctn > 0:
                        entry['gross_ctn'] += sales_ctn
                    else:
                        entry['retur_ctn'] += abs(sales_ctn)

                    if cust_code and sales_ctn > 0:
                        entry['outlets'].add(cust_code)
                    if doc_num:
                        entry['invoices'].add(doc_num)

                # Collect detailed 2026 transactions
                if year_val == 2026 and doc_num and cust_code and item_code:
                    tx_date = parse_excel_date(row_dict.get(11))
                    due_date = parse_excel_date(row_dict.get(12))
                    unit_type = row_dict.get(27, 'Sales') or 'Sales'
                    top_days = 0
                    try:
                        top_days = int(float(row_dict.get(16, 0) or 0))
                    except Exception:
                        top_days = 0
                    credit_limit = 0.0
                    try:
                        credit_limit = float(row_dict.get(49, 0) or 0)
                    except Exception:
                        credit_limit = 0.0

                    if doc_num not in headers_2026:
                        headers_2026[doc_num] = (
                            doc_num, tx_date, due_date, cust_code, sm_id,
                            sm_id, unit_type, top_days, credit_limit, None
                        )
                    line_id = f"LN_{doc_num}_{row_count}"
                    lines_2026.append((
                        line_id, doc_num, item_code, primary_qty, sales_ctn,
                        before_disc, disc_amt, 0.0, 0.0, sales_netto, vat_amt, sales_dpp,
                        retur_reason, is_non_omzet
                    ))

                if row_count % 50000 == 0:
                    print(f"  Processed {row_count:,} rows...")

        print(f"Finished scanning {row_count:,} rows. Found {len(agg):,} aggregation groups.")
        print(f"2026 detail: {len(headers_2026):,} headers, {len(lines_2026):,} lines.")

    print(f"Connecting to database at {db_path}...")
    con = sqlite3.connect(db_path)
    cur = con.cursor()

    cur.execute("PRAGMA foreign_keys = OFF;")
    cur.execute("BEGIN TRANSACTION;")

    # 1. Upsert products
    print(f"Upserting {len(products_seen):,} products...")
    for itm_code, (itm_name, prn, brd, grp_sku, cat_sku) in products_seen.items():
        cur.execute("""
            INSERT INTO dim_product (item_code, item_name, principal, category_sku, brand, group_sku)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT (item_code) DO UPDATE SET
              item_name=EXCLUDED.item_name,
              principal=EXCLUDED.principal,
              brand=EXCLUDED.brand,
              group_sku=EXCLUDED.group_sku;
        """, (itm_code, itm_name or itm_code, prn, cat_sku, brd, grp_sku))

    # 2. Clear and insert agg_monthly_sales_movement
    print(f"Inserting {len(agg):,} rows into agg_monthly_sales_movement...")
    cur.execute("DELETE FROM agg_monthly_sales_movement;")
    
    agg_rows = []
    for (yr, mo, s_id, s_nm, s_grp, prn, brd, g_sku), data in agg.items():
        row_id = f"{yr}_{mo:02d}_{s_id}_{prn[:10]}_{brd[:15]}_{g_sku[:15]}".replace(' ', '_')
        period_key = f"{yr}-{mo:02d}"
        oa_count = len(data['outlets'])
        inv_count = len(data['invoices'])
        agg_rows.append((
            row_id, yr, mo, period_key, s_id, s_nm, s_grp, prn, brd, g_sku,
            round(data['net_ctn'], 4), round(data['gross_ctn'], 4), round(data['retur_ctn'], 4),
            round(data['net_val'], 2), round(data['dpp_val'], 2),
            oa_count, inv_count
        ))

    cur.executemany("""
        INSERT OR REPLACE INTO agg_monthly_sales_movement (
            id, year, month, period_key, salesman_id, salesman_name, sales_group,
            principal, brand, group_sku, net_cartons, gross_cartons, retur_cartons,
            net_value, dpp_value, active_outlets, total_invoices
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
    """, agg_rows)

    con.commit()
    cur.execute("PRAGMA foreign_keys = ON;")
    print("Running WAL checkpoint...")
    cur.execute("PRAGMA wal_checkpoint(FULL);")
    con.close()

    total_time = time.time() - start_time
    print(f"=== Successfully populated agg_monthly_sales_movement with {len(agg_rows):,} rows in {total_time:.1f} seconds! ===")

if __name__ == '__main__':
    main()
