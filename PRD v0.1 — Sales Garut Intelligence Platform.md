# SALES GARUT INTELLIGENCE PLATFORM
## Product Requirements Document — v0.1

**Status:** Discovery / Foundation PRD  
**Project:** Sales Garut  
**Primary User:** District Sales Manager  
**Initial Territory:** Garut District  
**Initial Data Period:** 2025–2026  
**Primary Data Source:** Existing Excel / CSV / raw sales data  
**Development Environment:** Antigravity  
**Document Purpose:** Foundation for Data Discovery, Product Design, and Application Development

---

# 1. PRODUCT VISION

Sales Garut Intelligence Platform adalah sebuah **end-to-end Sales Management, Sales Force Automation, and Business Intelligence platform** yang dirancang untuk membantu District Sales Manager, Supervisor, dan Salesman:

- memonitor penjualan,
- mengukur pencapaian target,
- mengelola customer dan outlet,
- memonitor coverage,
- memahami performa salesman,
- menganalisa performa brand / sub-brand / SKU,
- menganalisa territory berdasarkan kecamatan dan sektor,
- memahami kontribusi dan perilaku setiap outlet,
- memonitor aktivitas field sales,
- melakukan GPS-based visit tracking,
- mengukur KPI,
- memonitor Focus Product dan NPL,
- menghitung / memproyeksikan incentive,
- dan pada tahap berikutnya mengintegrasikan stock serta stock cover.

Platform tidak boleh hanya menjadi "Excel yang dipindahkan ke website".

Tujuan utamanya adalah mengubah data operasional menjadi:

**MONITORING → ANALYSIS → INSIGHT → ACTION**

---

# 2. CORE PRODUCT PRINCIPLE

Platform harus mengikuti prinsip:

### 2.1 Simple for User

Mayoritas pengguna bukan orang teknis.

Interface harus:

- intuitive,
- minimal learning curve,
- menggunakan bahasa bisnis yang familiar,
- tidak membutuhkan pemahaman database,
- tidak membutuhkan pemahaman BI tools.

---

### 2.2 Powerful Behind the Scene

Walaupun interface sederhana, sistem harus mampu menangani:

- multi-dimensional analysis,
- historical data,
- drill-down,
- geographic analysis,
- transaction analysis,
- customer analysis,
- sales force activity,
- KPI,
- inventory,
- automated insight.

---

### 2.3 Data Driven

Sistem tidak boleh membuat asumsi bisnis sebagai fakta.

Business logic harus:

1. berasal dari requirement yang telah disepakati,
2. berasal dari existing Excel logic,
3. atau ditandai sebagai assumption dan divalidasi.

---

### 2.4 Expandable

Walaupun dimulai dari Garut, architecture tidak boleh terlalu hard-coded.

Struktur harus memungkinkan:

**District → Territory → SPV → Salesman → Kecamatan → Sektor → Outlet**

sehingga platform dapat dikembangkan untuk district lain di masa depan.

---

# 3. PRIMARY BUSINESS OBJECTIVES

Platform harus mampu menjawab minimal pertanyaan berikut.

### Sales

- Berapa sales hari ini?
- Berapa sales MTD?
- Berapa sales YTD?
- Berapa target?
- Berapa achievement?
- Bagaimana growth vs previous period?
- Bagaimana growth vs LY?
- Brand mana yang mendorong growth?
- Brand mana yang menjadi masalah?

### Sales Force

- Salesman mana yang perform?
- Salesman mana yang underperform?
- Apakah aktivitas visit sebanding dengan hasil?
- Berapa effective call?
- Berapa visit-to-order conversion?
- Bagaimana productivity masing-masing salesman?

### Customer

- Berapa total CL?
- Berapa active outlet?
- Berapa inactive/dormant?
- Outlet mana yang menjadi revenue driver?
- Outlet mana yang mengalami penurunan?
- Outlet mana yang berpotensi?
- Outlet mana yang berisiko hilang?

### Territory

- Kecamatan mana yang strongest?
- Kecamatan mana yang underdeveloped?
- Kecamatan mana yang mengalami decline?
- Bagaimana coverage setiap salesman?
- Apakah pembagian territory seimbang?

### Product

- Brand mana yang tumbuh?
- Sub-brand mana yang tumbuh?
- SKU mana yang menjadi driver?
- SKU mana yang decline?
- Bagaimana product mix?
- Bagaimana Focus Product achievement?
- Bagaimana NPL performance?

### Inventory — Future

- Berapa stock?
- Berapa stock cover?
- SKU mana yang berisiko OOS?
- SKU mana yang overstock?
- Apakah inventory sejalan dengan sales velocity?

---

# 4. TARGET USERS

## 4.1 District Sales Manager / Admin

Full visibility dan full management access.

Capabilities:

- melihat seluruh district,
- upload data,
- manual input,
- edit master data,
- target management,
- KPI management,
- view all analytics,
- configure system,
- export report.

---

## 4.2 Sales Supervisor

Visibility terbatas pada team/territory masing-masing.

Capabilities:

- team dashboard,
- salesman monitoring,
- outlet monitoring,
- coverage,
- visit monitoring,
- KPI,
- territory analytics,
- review activity.

---

## 4.3 Salesman

Visibility terbatas pada assigned territory/outlet.

Capabilities:

- melihat target,
- melihat achievement,
- melihat outlet,
- melakukan check-in,
- melakukan check-out,
- melakukan visit activity,
- update outlet information,
- melihat KPI pribadi.

---

# 5. HIGH-LEVEL SYSTEM MODULES

Platform minimal terdiri dari:

1. Executive Dashboard
2. Sales Dashboard
3. Salesman Dashboard
4. Territory / Geographic Dashboard
5. Customer / Outlet Management
6. Outlet 360 Analytics
7. Product / Brand Analytics
8. Coverage Analytics
9. Field Visit / GPS Tracking
10. KPI & Incentive
11. Inventory / Stock
12. Insights & Alerts
13. Data Import Center
14. Master Data Management
15. User & Access Management
16. Reports / Export

---

# 6. DATA DISCOVERY REQUIREMENT

## CRITICAL

Sebelum application development dimulai, Antigravity harus melakukan **full data discovery** terhadap seluruh file yang tersedia dalam project.

Input dapat berupa:

- XLSX
- XLS
- CSV
- existing dashboard Excel
- supporting master files
- target files
- KPI files
- inventory files
- other relevant operational data.

Antigravity **tidak boleh langsung membangun database berdasarkan asumsi.**

---

# 7. DATA DISCOVERY OUTPUT

Antigravity wajib menghasilkan:

## 7.1 Data Inventory

Untuk setiap file:

- filename
- format
- purpose
- period
- row count
- column count
- sheet names
- primary candidate key
- data type
- dependency
- duplicate potential
- data quality issue.

---

## 7.2 Data Dictionary

Untuk setiap field:

| Field | Description | Type | Source | Example | Required |
|---|---|---|---|---|---|
| Customer ID | Unique outlet identifier | String | Sales | C00123 | Yes |
| SKU | Product identifier | String | Sales | SKU001 | Yes |
| Date | Transaction date | Date | Sales | 2026-09-01 | Yes |
| Quantity | Transaction quantity | Number | Sales | 12 | Yes |
| Value | Transaction value | Number | Sales | 450000 | Yes |

Antigravity harus membedakan:

- raw field,
- derived field,
- calculated metric.

---

# 8. DATA RELATIONSHIP

Antigravity harus membuat relationship map / ERD minimal untuk:

```text
SALESMAN
   │
   ├── SPV
   │
   └── TERRITORY
          │
          └── KECAMATAN
                 │
                 └── SEKTOR
                        │
                        └── CUSTOMER
                               │
                               └── TRANSACTION
                                      │
                                      └── PRODUCT
                                             │
                                             ├── BRAND
                                             └── SUB BRAND
```

Future:

```text
CUSTOMER
   │
   └── VISIT
          │
          ├── GPS
          ├── TIMESTAMP
          └── SALES RESULT

PRODUCT
   │
   └── INVENTORY
```

Relationship aktual wajib ditentukan berdasarkan data nyata.

---

# 9. RAW DATA PRINCIPLE

Raw data harus dipertahankan sebagai **immutable source layer**.

Recommended flow:

```text
RAW DATA
   ↓
INGESTION
   ↓
VALIDATION
   ↓
STANDARDIZATION
   ↓
MASTER MAPPING
   ↓
DATA MODEL
   ↓
ANALYTICS
   ↓
DASHBOARD
```

Raw data tidak boleh diedit oleh dashboard user.

---

# 10. DATA IMPORT CENTER

User harus dapat melakukan:

### Option A — Manual Input

Untuk data kecil atau koreksi.

### Option B — Excel Upload

User melakukan:

**Drag & Drop Excel**

Sistem membaca file dan melakukan auto-detection.

Contoh:

> File detected as Sales Transaction.

Sistem menampilkan mapping:

| Excel Column | System Field |
|---|---|
| Tanggal | Transaction Date |
| Kode Customer | Customer ID |
| Nama Produk | Product |
| Qty | Quantity |
| Total Sales | Sales Value |

User dapat melakukan mapping manual jika diperlukan.

---

# 11. DATA VALIDATION

Sebelum import:

System melakukan:

- duplicate detection,
- missing value detection,
- invalid date detection,
- unknown customer detection,
- unknown SKU detection,
- unknown salesman detection,
- invalid numeric value,
- inconsistent mapping.

Contoh:

**Import Validation**

```text
1,284,220 rows

✓ Valid       1,280,120
⚠ Warning         4,100
✕ Error               0
```

User tidak boleh dipaksa memahami technical error.

Error harus ditampilkan dengan bahasa sederhana.

---

# 12. EXISTING EXCEL LOGIC DISCOVERY

Existing Excel dashboard harus dianalisa oleh Antigravity.

Antigravity wajib mengidentifikasi:

- formulas,
- pivots,
- calculated fields,
- lookup logic,
- filters,
- KPI calculations,
- target calculations,
- achievement calculations,
- existing dashboard structure,
- data transformation,
- manual processes.

Output:

### Existing Logic Map

```text
RAW DATA
   ↓
Transformation
   ↓
Calculation
   ↓
Pivot
   ↓
Dashboard
```

Setiap logic penting harus didokumentasikan sebelum dimigrasikan.

---

# 13. EXECUTIVE DASHBOARD

Home screen harus memberikan **situational awareness dalam <30 seconds**.

Primary cards:

### SALES

- Actual
- Target
- Achievement
- Growth

### ACTIVE OUTLET

- Actual
- CL
- Active %

### COVERAGE

- Visit coverage
- Customer coverage

### SALES FORCE

- Headcount
- Active salesman
- Performance

### PRODUCT

- Focus Product
- NPL

### INVENTORY — Future

- Stock
- Stock Cover
- Risk

---

# 14. SALES ANALYTICS

Sales dapat dianalisa berdasarkan:

- Date
- Day
- Week
- Month
- Quarter
- YTD
- Salesman
- SPV
- Territory
- Kecamatan
- Sektor
- Customer
- Channel
- Brand
- Sub Brand
- SKU.

---

# 15. SALES VS TARGET

System harus mendukung:

- value achievement,
- quantity achievement,
- MTD achievement,
- YTD achievement,
- target gap,
- growth,
- achievement ranking.

Example:

```text
Target       Rp 2.10 B
Actual       Rp 1.82 B
Achievement     86.7%
Gap          Rp 280 M
```

System harus membedakan:

**achievement percentage**

dengan

**growth percentage.**

---

# 16. SALES TREND

Trend dapat ditampilkan berdasarkan:

- total sales,
- brand,
- sub-brand,
- SKU,
- salesman,
- kecamatan,
- sektor,
- customer.

System harus mendukung:

- daily,
- weekly,
- monthly,
- rolling period,
- MoM,
- WoW,
- YoY / LY.

---

# 17. BRAND / PRODUCT ANALYTICS

Hierarchy:

```text
Category
   ↓
Brand
   ↓
Sub Brand
   ↓
SKU
```

Metrics:

- Sales Value
- Sales Quantity
- Target
- Achievement
- Growth
- Contribution
- Active Outlet
- Average Sales / Outlet
- Product Mix.

---

# 18. TERRITORY ANALYTICS

Primary hierarchy:

```text
District
 ↓
SPV
 ↓
Salesman
 ↓
Kecamatan
 ↓
Sektor
 ↓
Outlet
```

System harus dapat membandingkan:

- sales,
- target,
- achievement,
- active outlet,
- coverage,
- growth,
- productivity.

---

# 19. GEOGRAPHIC DASHBOARD

Map-based dashboard harus menunjukkan:

- salesman territory,
- customer location,
- active outlet,
- visited outlet,
- ordering outlet,
- sales density,
- coverage,
- opportunity.

Map dapat difilter berdasarkan:

- salesman,
- SPV,
- brand,
- kecamatan,
- sector,
- active/inactive,
- visit status.

---

# 20. CUSTOMER / OUTLET MASTER

Minimum fields yang diharapkan:

- Customer ID
- Customer Name
- Address
- Kecamatan
- Desa
- Sektor
- Salesman
- SPV
- Channel
- Sub-channel
- Latitude
- Longitude
- Status
- Opening Date
- Classification.

Field aktual wajib disesuaikan dengan raw data.

---

# 21. OUTLET 360°

Setiap outlet memiliki halaman detail.

Contoh:

### Outlet ABC

**Sales YTD:** Rp48.2M

**Contribution:** 2.7%

**Last Order:** 3 days ago

**Average Order:** Rp1.2M

**Order Frequency:** 8x/month

**Active Status:** Active

---

## Outlet Sales Trend

Menampilkan historical trend.

---

## Brand Mix

Menampilkan kontribusi brand/sub-brand/SKU.

---

## Order Behaviour

Metrics potensial:

- order frequency,
- average order value,
- average quantity,
- repeat rate,
- recency,
- sales velocity.

---

# 22. OUTLET CONTRIBUTION

Outlet dapat diranking berdasarkan:

- sales value,
- quantity,
- contribution %,
- growth,
- decline,
- cumulative contribution.

Potential segmentation:

### Driver

High sales + positive growth

### Core

High sales + stable

### Potential

Low sales + high growth

### At Risk

High historical sales + declining

### Dormant

Tidak melakukan transaksi dalam threshold tertentu.

Threshold wajib configurable.

---

# 23. OUTLET FLUCTUATION ANALYSIS

System harus mampu mendeteksi perubahan abnormal.

Contoh:

Historical average:

Rp3.5M/week

Current:

Rp1.9M/week

System:

> **Sales decline -46% vs 4-week average**

Potential contributing factors:

- order frequency decline,
- SKU decline,
- brand decline,
- salesman visit decline,
- no order,
- territory issue.

---

# 24. REPEAT / RETENTION ANALYTICS

Metrics potensial:

- repeat outlet,
- repeat rate,
- order frequency,
- days since last order,
- dormant outlet,
- reactivated outlet,
- new active outlet,
- churned outlet.

Semua definisi harus divalidasi berdasarkan data aktual.

---

# 25. SALES FORCE ACTIVITY

Salesman harus dapat melakukan:

### Check In

System mencatat:

- salesman,
- customer,
- date,
- timestamp,
- GPS,
- distance from outlet,
- device/session identifier jika diperlukan.

### Check Out

System mencatat:

- timestamp,
- duration,
- result/activity.

---

# 26. GPS VISIT VALIDATION

Visit dapat dikategorikan:

### Valid Visit

Check-in berada dalam configurable radius dari outlet.

### Invalid Visit

GPS terlalu jauh dari outlet.

Radius harus configurable.

Contoh:

**Valid radius: 100 meter**

Namun threshold final harus ditentukan melalui business validation.

---

# 27. VISIT ACTIVITY

Salesman dapat mencatat hasil visit:

- order,
- no order,
- new outlet,
- follow-up,
- product presentation,
- collection,
- other configured activity.

System harus memungkinkan reason code.

---

# 28. VISIT VS SALES ANALYTICS

Platform harus menghubungkan activity dengan outcome.

Metrics:

### Visit Count

### Ordering Outlet

### Visit-to-Order Conversion

### Sales / Visit

### Sales / Productive Call

### New Outlet Conversion

### Repeat Visit Conversion

Tujuan:

**Activity → Productivity → Sales**

bukan sekadar monitoring GPS.

---

# 29. PLANNED VS ACTUAL VISIT

Future/optional feature:

Supervisor dapat membuat target visit:

```text
Planned Visit: 15
Actual Visit: 13
Achievement: 86.7%
```

System dapat menunjukkan outlet yang belum dikunjungi.

---

# 30. ROUTE ANALYTICS

System dapat menyimpan sequence visit:

```text
Outlet A
 ↓
Outlet B
 ↓
Outlet C
 ↓
Outlet D
```

Potential metrics:

- number of visits,
- travel distance,
- first visit time,
- last visit time,
- average visit duration,
- route efficiency.

Route optimization dapat menjadi future feature.

---

# 31. KPI MANAGEMENT

System harus mendukung KPI configurable.

Potential KPI:

- Sales Achievement
- Quantity Achievement
- Focus Product
- NPL
- Active Outlet
- Coverage
- Effective Call
- Productivity
- Other company-specific KPI.

KPI weight harus configurable.

---

# 32. SALESMAN SCORECARD

Example:

```text
SALESMAN A

Sales Achievement       96%
Focus Product          105%
NPL                     90%
Active Outlet          108%
Coverage                94%

Overall Score           98.2
Rank                    #2 / 7
```

Formula harus configurable.

---

# 33. INCENTIVE

Future feature.

System dapat mendukung incentive rule:

- achievement threshold,
- tier,
- multiplier,
- KPI weighting,
- maximum/minimum payout.

Potential:

> "Rp12M additional sales required to reach next incentive tier."

Actual incentive rules harus berasal dari business rules yang valid.

---

# 34. STOCK / INVENTORY — PHASE 2

Inventory data:

- SKU
- Warehouse / distributor
- Stock
- Date
- Inbound
- Outbound
- Adjustment.

Potential analytics:

### Stock Cover

```text
Current Stock
÷
Average Daily Sales
```

---

# 35. INVENTORY INTELLIGENCE

System dapat mengidentifikasi:

### OOS Risk

Low stock + high sales velocity.

### Overstock Risk

High stock + low sales velocity.

### Healthy

Stock level sesuai sales velocity.

### Slow Moving

Stock tinggi + sales rendah.

---

# 36. INSIGHT ENGINE

Dashboard tidak hanya menampilkan angka.

System harus menghasilkan **small business insights**.

Example:

> **Sales is +8% vs LY, primarily driven by Brand A and Kecamatan X.**

> **Coverage declined 5%, despite stable sales.**

> **23 high-contribution outlets have not ordered within the last 21 days.**

> **Salesman B has the highest visit activity but below-average visit-to-order conversion.**

Insights harus memiliki:

- metric,
- comparison,
- significance,
- recommended investigation/action where appropriate.

---

# 37. ALERTS

Potential alert categories:

### Sales

- target gap,
- sales decline,
- sudden fluctuation.

### Outlet

- dormant,
- high-value outlet decline,
- no order.

### Territory

- coverage decline,
- underperforming area.

### Product

- SKU decline,
- Focus Product gap,
- NPL gap.

### Inventory

- OOS risk,
- overstock.

Alerts harus configurable.

---

# 38. SEARCH

Global search harus memungkinkan user mencari:

- customer,
- salesman,
- SKU,
- brand,
- kecamatan.

Search result harus langsung membawa user ke relevant detail page.

---

# 39. FILTER SYSTEM

Global filters:

- Period
- SPV
- Salesman
- Brand
- Sub Brand
- SKU
- Kecamatan
- Sector
- Channel
- Customer status.

Filter harus konsisten.

Jika user mengubah filter:

**dashboard dan chart yang relevan harus ikut berubah.**

---

# 40. EXPORT

User dapat export:

- dashboard,
- table,
- customer list,
- sales report,
- salesman performance,
- KPI,
- outlet analytics.

Potential formats:

- Excel
- CSV
- PDF.

---

# 41. USER EXPERIENCE

Design principles:

### "Simple outside, intelligent inside."

Interface harus:

- clean,
- modern,
- eye pleasing,
- professional,
- minimal,
- mobile friendly,
- readable,
- low cognitive load.

Hindari:

- terlalu banyak chart dalam satu screen,
- terlalu banyak warna,
- jargon teknis,
- complex menus,
- unnecessary animations.

---

# 42. VISUAL DESIGN DIRECTION

Recommended visual direction:

**Modern FMCG Sales Command Center**

Characteristics:

- clean cards,
- strong typography,
- clear hierarchy,
- restrained colors,
- clear status indicators,
- premium but not flashy,
- data-first,
- mobile responsive.

Status color semantics:

🟢 Healthy / Positive  
🟡 Attention  
🔴 Critical  
🔵 Informational

Actual color palette dapat ditentukan pada UI design phase.

---

# 43. MOBILE FIRST FOR SALESMAN

Salesman kemungkinan besar menggunakan smartphone.

Mobile priority:

1. Check-in
2. Check-out
3. Outlet search
4. Outlet detail
5. Target
6. Achievement
7. Visit history
8. Activity input.

DSM/SPV dashboard dapat dioptimalkan untuk desktop tetapi tetap responsive.

---

# 44. OFFLINE CONSIDERATION

Karena field sales dapat bekerja di area dengan koneksi tidak stabil, system sebaiknya mempertimbangkan:

- offline visit capture,
- local temporary storage,
- automatic synchronization ketika internet tersedia.

Ini merupakan requirement yang perlu divalidasi berdasarkan kondisi lapangan.

---

# 45. SECURITY & ACCESS

Role-based access control.

### DSM/Admin

Full access.

### SPV

Team access.

### Salesman

Own territory access.

User tidak boleh dapat melihat data di luar permission mereka.

---

# 46. AUDIT TRAIL

System sebaiknya mencatat:

- data upload,
- data modification,
- user,
- timestamp,
- old value,
- new value.

Terutama untuk:

- customer,
- target,
- KPI,
- master product,
- master salesman.

---

# 47. DATA QUALITY DASHBOARD

Admin harus dapat melihat:

### Data Health

- completeness,
- duplicates,
- unmapped customer,
- unmapped SKU,
- unmapped salesman,
- invalid transaction,
- stale master data.

---

# 48. BUSINESS METRIC DEFINITIONS

Semua metric harus memiliki definisi formal.

Contoh:

### Sales Achievement

```text
Actual Sales / Target Sales × 100%
```

### Outlet Contribution

```text
Outlet Sales / Total Sales × 100%
```

### Stock Cover

```text
Current Stock / Average Daily Sales
```

Namun formula final harus mengikuti business rules aktual.

Tidak boleh mengunci formula sebelum data discovery.

---

# 49. DATA-DRIVEN FEATURE DISCOVERY

Antigravity harus secara aktif mencari kemungkinan fitur yang belum disebutkan dalam PRD.

Contoh area eksplorasi:

- sales productivity,
- outlet potential,
- customer segmentation,
- sales concentration,
- Pareto analysis,
- basket analysis,
- SKU mix,
- cross-brand purchasing,
- whitespace analysis,
- churn,
- retention,
- cohort,
- seasonality,
- anomaly detection,
- territory imbalance,
- visit productivity,
- route efficiency,
- sales forecasting,
- target projection.

Fitur hanya direkomendasikan jika didukung oleh data yang tersedia atau dapat diperoleh secara realistis.

---

# 50. DATA GAP ANALYSIS

Antigravity wajib menghasilkan:

| Feature | Available Data | Feasibility | Missing Data |
|---|---|---|---|
| Sales Achievement | Sales + Target | High | — |
| Outlet Contribution | Transaction | High | — |
| GPS Visit | GPS + Outlet Coordinates | Medium | GPS |
| Stock Cover | Stock + Sales | High | Stock |
| Forecast | Historical Sales | Medium | More history may improve accuracy |
| Outlet Potential | Transaction + Customer | Medium | Segmentation attributes |

---

# 51. RECOMMENDED ARCHITECTURE

Architecture harus memisahkan:

### Layer 1 — Raw

Original uploaded files.

### Layer 2 — Staging

Temporary normalized data.

### Layer 3 — Master

Customer  
Product  
Salesman  
Territory  
Target.

### Layer 4 — Transaction

Sales  
Visit  
Inventory.

### Layer 5 — Analytics

Calculated metrics.

### Layer 6 — Application

Dashboard  
Mobile interface  
Admin.

### Layer 7 — Insight

Alerts  
Recommendations  
Anomaly detection.

---

# 52. DATABASE PRINCIPLE

Recommended conceptual entities:

```text
Users
Salesmen
Supervisors
Territories
Districts
Kecamatan
Sectors
Customers
Products
Brands
SubBrands
SalesTransactions
Targets
Visits
VisitActivities
KPI
KPIResults
Incentives
Inventory
Alerts
AuditLogs
```

Actual schema harus disesuaikan dengan hasil Data Discovery.

---

# 53. FEATURE BACKLOG

## MUST HAVE — V1

### Data

- Excel upload
- Manual input
- Data validation
- Customer master
- Product master
- Salesman master
- Territory master
- Target master

### Sales

- Sales dashboard
- Target
- Achievement
- Growth
- Sales trend
- Brand analysis
- SKU analysis
- Salesman analysis
- Kecamatan analysis
- Sector analysis

### Customer

- CL
- Active outlet
- Coverage
- Outlet contribution
- Outlet trend
- Outlet detail

### Sales Force

- Salesman dashboard
- KPI basic
- Team performance

### Access

- Login
- Role permission

---

# 54. SHOULD HAVE — V1.5

- Outlet 360
- Repeat analysis
- Dormant detection
- At-risk outlet
- Contribution segmentation
- GPS check-in/out
- Visit history
- Visit-to-order conversion
- Geographic map
- Coverage map
- Automated insights
- Alerts
- Data quality dashboard
- Advanced KPI
- Incentive calculation

---

# 55. NICE TO HAVE — V2+

- Route optimization
- Forecasting
- Outlet potential scoring
- AI recommendations
- Opportunity detection
- Advanced anomaly detection
- Inventory intelligence
- Stock cover
- OOS prediction
- Overstock detection
- Cross-brand basket analysis
- Territory optimization
- Multi-district deployment
- Advanced mobile application
- Notification system.

---

# 56. DEVELOPMENT PRINCIPLE

Antigravity harus mengikuti urutan:

```text
DISCOVER
   ↓
UNDERSTAND
   ↓
VALIDATE
   ↓
DESIGN
   ↓
MODEL
   ↓
BUILD
   ↓
TEST
   ↓
REFINE
```

**Jangan langsung build berdasarkan PRD ini.**

PRD ini merupakan foundation dan hypothesis.

---

# 57. MANDATORY ANTIGRAVITY DISCOVERY PHASE

Sebelum membuat production application, Antigravity harus:

### Step 1

Scan seluruh project files.

### Step 2

Identify all data sources.

### Step 3

Analyze all sheets and tables.

### Step 4

Analyze existing Excel formulas, pivots, queries and dashboard logic.

### Step 5

Build Data Inventory.

### Step 6

Build Data Dictionary.

### Step 7

Build Relationship / ERD.

### Step 8

Document Existing Business Logic.

### Step 9

Identify Missing Metrics.

### Step 10

Identify Data Gaps.

### Step 11

Identify Additional Analytics Opportunities.

### Step 12

Recommend architecture.

### Step 13

Create final Feature Backlog.

### Step 14

Create implementation plan.

Only after these steps are reviewed should application development begin.

---

# 58. ANTIGRAVITY MUST NOT ASSUME

Antigravity must not assume:

- customer ID structure,
- SKU hierarchy,
- salesman hierarchy,
- territory assignment,
- definition of active outlet,
- definition of repeat,
- definition of coverage,
- KPI formula,
- incentive formula,
- target allocation,
- transaction granularity,
- stock calculation.

If unclear, mark:

**TO BE VALIDATED**

rather than silently inventing logic.

---

# 59. SUCCESS CRITERIA

The platform will be considered successful if:

### DSM can answer within seconds:

> "How are we doing?"

> "Why are we missing target?"

> "Which salesman is driving/dragging performance?"

> "Which area needs attention?"

> "Which brand/SKU is causing the movement?"

> "Which outlets are contributing most?"

> "Which outlets are declining?"

> "Where is our coverage gap?"

> "Is salesman activity productive?"

> "What should I investigate today?"

### Salesman can answer:

> "Where am I against target?"

> "Which outlet should I visit?"

> "Which outlet has not ordered?"

> "What is my KPI?"

> "How is my territory performing?"

---

# 60. LONG-TERM VISION

The ultimate platform should evolve from:

**Dashboard**

→ **Monitoring System**

→ **Sales Intelligence**

→ **Sales Force Automation**

→ **Business Decision Support System**

Eventually the system should be capable of moving from:

> **"Here is what happened."**

to:

> **"Here is why it happened."**

and eventually:

> **"Here is what you should investigate or do next."**

---

# 61. INITIAL PRODUCT NORTH STAR

The platform's North Star should be:

> **Make every important sales decision visible, measurable, explainable, and actionable.**

The system should connect:

**PEOPLE + OUTLET + PRODUCT + TERRITORY + TIME + ACTIVITY + SALES + INVENTORY**

into one integrated business view.

---

# 62. CURRENT STATUS

This document is intentionally classified as:

**PRD v0.1 — FOUNDATION / DISCOVERY**

It is **not yet the final technical specification**.

The next mandatory phase is:

### DATA DISCOVERY

using the actual:

- 2025 data,
- 2026 running data,
- existing Excel dashboard,
- master data,
- target data,
- KPI data,
- and any other relevant files.

The results of that discovery will be used to produce:

**PRD v0.2 / Validated Product Specification**

before production development.