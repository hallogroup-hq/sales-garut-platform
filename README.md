# Sales Garut Intelligence Platform

> Platform intelijen operasional dan analitik penjualan terpadu untuk DSO Garut (`DSO Garut All` / `Sub-DSO GARUT`).

---

## 📌 Ringkasan Eksekutif

**Sales Garut Intelligence Platform** dirancang untuk mendigitalkan operasi penjualan, melacak performa rute salesman (*kanvas*, *CB*, *GT*), penetrasi lini fokus (*Must Have* & *NPL*), program loyalitas toko mitra berjalan (*Trade Promo*), ketersediaan stok gudang (*Dual Stock Cover*), umur piutang (*AR Aging*), serta pemetaan coverage geografis di seluruh 42 kecamatan Kabupaten Garut.

* **User Persona:** Aghia (Sales Manager / Admin DSM)
* **Status Sistem:** `DEVELOPMENT / PRE-UAT (v0.9.5)`
* **Engine Basis Data:** SQLite (Native Node.js 26 `node:sqlite`) dengan dukungan dual-engine PostgreSQL (`DATABASE_URL`).
* **Test Suite:** 31 Unit & Regression Tests (100% Pass Rate).

---

## 🚀 Fitur Utama

### 1. Beranda — Executive Command Center
* **Pace Hari Kerja (Senin–Jumat):** Kalkulasi otomatis 21 HK total, HKE berjalan (15 HK / 71,4%), sisa 6 HK, proyeksi *Latest Estimate* (LE), GAP bulanan, dan GAP harian yang dibutuhkan untuk mencapai target.
* **Choropleth Peta Wilayah Garut:** Visualisasi geografis 42 kecamatan dengan pewarnaan tier penetrasi outlet (`≥ 80%`, `60–79%`, `40–59%`, `20–39%`, `< 20%`), tooltip interaktif, dan modal perbesaran wilayah.
* **KPI Ribbon & Kartu Ringkasan:** Realisasi penjualan MTD (KTN & Nilai Netto Jt), pencapaian target %, estimasi payout insentif tim, ringkasan NPL >90 hari, dan peringatan stok kritis.

### 2. Penjualan & Group SKU
* **Toggle Mode Tampilan:** Beralih instan antara **Ringkasan Group SKU** (*Kopi Tubruk Gadjah Asli*, *Gadjah Manis*, *Caffino*, *Fox's*, *Deli*, *MilkLife UHT*, dll.) dan **Detail Produk SKU**.
* **Pengurutan Kolom (Ascending / Descending):** Klik judul kolom untuk mengurutkan data target, realisasi, capaian %, gap, omzet, dan kontribusi.

### 3. Outlet 360 & Customer Intelligence
* **4 Status Pelanggan Terpisah:**
  * `Aktif MTD`: Bertransaksi di bulan berjalan.
  * `Inaktif MTD (<60 Hari)`: Belum order bulan ini, tetapi bertransaksi dalam 60 hari terakhir.
  * `Dormant (>60 Hari)`: Tidak bertransaksi lebih dari 60 hari.
  * `Belum Pernah Order`: Terdaftar di CL dengan 0 transaksi historis (`daysSinceLastOrder: null`).
* **Directory Counters:** Menampilkan jumlah baris saat ini, hasil filter, dan total universe (`3.597 CL`).
* **Lembar Analisis Outlet 360:** Riwayat transaksi, tren frekuensi beli, matriks produk dibeli, umur piutang outlet, dan penugasan salesman.

### 4. Tim Sales & Rayon
* **Filter Grup Salesman:** Dukungan kategori `SAVORIA` (salesman organik dengan rayon R01–R15), `SMC`, dan `SAVORIA_OTHERS` (`has_rayon = 0` untuk mitra luar tanpa mengacaukan pembagi coverage rute).
* **Aturan Denominator Rute:** Denominator kalkulasi rute outlet strictly hanya menghitung outlet yang berada di bawah salesman yang memiliki rayon operasional (`has_rayon = 1`).
* **Metrik GAP & Status Laju:** GAP Bulanan, GAP Harian per sisa HK, dan status laju (*ON PACE*, *NEEDS ATTENTION*, *BEHIND PACE*).

### 5. Program Produk: Trade Promo Loyalty & Must Have/NPL
* **Program Toko Berjalan:** Pemantauan program loyalitas toko mitra (contoh: *Loyalty Kopi Tubruk Gadjah*) dengan 20 toko peserta, strata reward (3% s/d 4%), target KTN, estimasi reward, realisasi MTD, capaian %, status capai, dan reward diraih.
* **Download Template & Upload Program:** Unduh template CSV 20 toko terdaftar (`/api/programs/store-loyalty/template`) dan modal interaktif untuk mengunggah CSV atau mengatur target 20 toko langsung sebelum disimpan.
* **Must Have & NPL Tracker:** 4 metrik independen per lini produk (*Actual Penetrasi %*, *Target Penetrasi %*, *Target Outlet*, dan *Progres Target %*) serta pelacakan repeat order (*RO-1* dan *RO-2+*).

### 6. Stock Health & Piutang (AR Ledger)
* **Dual Stock Cover:** Evaluasi ketersediaan stok fisik gudang berbasis *Target Run Rate* dan *Actual 3-Month Moving Average (3M-MA)* dengan deteksi risiko OOS dan *Overstock*.
* **AR Aging Ledger:** Klasifikasi umur piutang (*Current*, *1–15*, *16–30*, *31–60*, *>60 hari / NPL*) dengan konfigurasi kategori fleksibel di menu Pengaturan.

---

## 🛠️ Instalasi & Menjalankan Aplikasi

### Prasyarat
* **Node.js:** Versi 22 atau lebih baru (direkomendasikan Node.js 26 untuk native `node:sqlite`).
* **NPM:** Bawaan Node.js.

### 1. Masuk ke Direktori Backend & Pasang Dependensi
```bash
cd backend
npm install
```

### 2. Jalankan Pengujian Otomatis
```bash
npm test
```
Seluruh 31 unit & regression tests akan berjalan dan memverifikasi integritas kalkulasi bisnis.

### 3. Jalankan Server Aplikasi
```bash
npm start
```
Aplikasi web dapat diakses langsung melalui browser di:  
👉 **`http://localhost:3001`**

---

## 📂 Struktur Repositori

```
├── backend/
│   ├── public/                 # Antarmuka Web SPA (HTML5, Tailwind, JS, SVG Map)
│   │   ├── app.js              # State management, router, dan logika tampilan
│   │   ├── garut_map.json      # GeoJSON/SVG data batas 42 kecamatan Garut
│   │   └── index.html          # Shell aplikasi responsif (Desktop, Tablet, Mobile)
│   ├── src/
│   │   ├── db/                 # Koneksi database dan initial seeder
│   │   ├── routes/             # Endpoint REST API Express (/api/...)
│   │   ├── services/           # Business logic engines (metrics, calendar, import, dll.)
│   │   └── server.js           # Entrypoint Express server
│   └── tests/                  # 31 automated test suites (Node test runner)
├── PRD v0.1 — Sales Garut Intelligence Platform.md
├── Sales_Garut_Intelligence_Platform_PRD_v0.2.pdf
├── master data.xlsx            # Master data produk dan outlet referensi
├── DATA CL.xlsx                # Customer list Garut referensi
├── TARGET KUANTITI SALES.xlsx  # Target kuantiti sales referensi
├── DATA STOK.xlsx              # Data posisi stok gudang referensi
├── piutang aktif.xlsx          # Data piutang aktif referensi
└── README.md
```

---

## 👥 Tim & Pengembang
* **Organisasi:** Hallo Group (`hallogroup-hq`)
* **Slogan:** *Garut Lebih Kuat Bersama — Good People Great Execution*
