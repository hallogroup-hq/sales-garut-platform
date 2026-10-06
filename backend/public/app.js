// ====================================================================
// SALES GARUT INTELLIGENCE PLATFORM — CLIENT APPLICATION (SPA)
// User: Aghia (Sales Manager / Admin DSM)
// Reference: PRD v0.2
// ====================================================================

let currentTab = 'beranda';
let globalFilters = {
  year: 2026,
  month: 9,
  spvId: '',
  salesmanId: '',
  salesGroup: '',
  rayonId: '',
  principal: '',
  brand: '',
  subbrand: '',
  groupSku: '',
  kecamatanId: ''
};

// ==============================================================
// Authentication & User Session Management
// ==============================================================
window.currentUser = null;
try {
  const savedUser = localStorage.getItem('sales_garut_user');
  if (savedUser) {
    window.currentUser = JSON.parse(savedUser);
  }
} catch (e) {
  window.currentUser = null;
}

function authHeaders() {
  const headers = {};
  if (window.currentUser) {
    headers['x-user-id'] = window.currentUser.userId;
    headers['x-username'] = window.currentUser.username;
  }
  return headers;
}

function isSuperAdmin() {
  return Boolean(window.currentUser && (window.currentUser.role === 'DSM' || window.currentUser.permissions?.canUploadSales));
}

function updateHeaderUserProfile() {
  const avatarEl = document.getElementById('user-avatar');
  const nameEl = document.getElementById('user-fullname');
  const roleEl = document.getElementById('user-role-label');

  if (window.currentUser) {
    if (nameEl) nameEl.textContent = window.currentUser.fullName || window.currentUser.username;
    if (avatarEl) avatarEl.textContent = window.currentUser.avatarText || 'AG';
    if (roleEl) {
      if (window.currentUser.role === 'DSM') {
        roleEl.textContent = 'Super Admin (DSM)';
        roleEl.className = 'text-[10px] text-emerald-600 font-semibold';
      } else if (window.currentUser.role === 'SPV') {
        roleEl.textContent = 'Supervisor (Hanya Lihat)';
        roleEl.className = 'text-[10px] text-blue-600 font-semibold';
      } else {
        roleEl.textContent = 'Salesman / Viewer (Hanya Lihat)';
        roleEl.className = 'text-[10px] text-slate-500 font-semibold';
      }
    }
  }
}

function checkAuthModal() {
  const modal = document.getElementById('login-modal');
  if (!modal) return;
  if (!window.currentUser) {
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
  } else {
    modal.classList.add('hidden');
    modal.style.display = 'none';
    updateHeaderUserProfile();
  }
}

async function handleLoginSubmit(event) {
  if (event) event.preventDefault();
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');
  const errorContainer = document.getElementById('login-error-container');
  const submitBtn = document.getElementById('btn-login-submit');

  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';

  if (!username || !password) {
    if (errorContainer) {
      errorContainer.textContent = 'Username dan password wajib diisi.';
      errorContainer.classList.remove('hidden');
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Memverifikasi...`;
    lucide.createIcons();
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.success && data.user) {
      window.currentUser = data.user;
      localStorage.setItem('sales_garut_user', JSON.stringify(data.user));
      checkAuthModal();
      if (errorContainer) errorContainer.classList.add('hidden');
      initApp();
    } else {
      if (errorContainer) {
        errorContainer.textContent = data.error || 'Username atau password salah.';
        errorContainer.classList.remove('hidden');
      }
    }
  } catch (err) {
    if (errorContainer) {
      errorContainer.textContent = 'Gagal menghubungi server: ' + err.message;
      errorContainer.classList.remove('hidden');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<span>Masuk ke Sistem</span><i data-lucide="arrow-right" class="w-4 h-4"></i>`;
      lucide.createIcons();
    }
  }
}



function togglePasswordVisibility() {
  const p = document.getElementById('login-password');
  const icon = document.getElementById('eye-icon');
  if (!p) return;
  if (p.type === 'password') {
    p.type = 'text';
    if (icon) icon.setAttribute('data-lucide', 'eye-off');
  } else {
    p.type = 'password';
    if (icon) icon.setAttribute('data-lucide', 'eye');
  }
  lucide.createIcons();
}

async function logout() {
  if (confirm('Apakah Anda yakin ingin keluar dari sistem?')) {
    try {
      await fetch('/api/auth/logout', { method: 'POST', headers: authHeaders() });
    } catch (e) {}
    localStorage.removeItem('sales_garut_user');
    window.currentUser = null;
    checkAuthModal();
  }
}

function openChangePasswordQuick() {
  window.activeDataCenterSubView = 'users';
  navigate('datacenter');
  setTimeout(() => {
    const el = document.getElementById('input-new-password');
    if (el) {
      el.focus();
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 200);
}

// Application Boot
document.addEventListener('DOMContentLoaded', () => {
  updateHeaderDate();
  setInterval(updateHeaderDate, 30000);
  checkAuthModal();
  if (window.currentUser) {
    initApp();
  }
});

window.addEventListener('hashchange', () => {
  const hash = window.location.hash.replace('#', '');
  if (hash && hash !== currentTab) {
    navigate(hash);
  }
});

async function initApp() {
  await loadFilterOptions();
  updateMobileFilterSummary();
  const hash = window.location.hash.replace('#', '');
  if (hash) {
    currentTab = hash;
  }
  navigate(currentTab);
  lucide.createIcons();
}

// Tab Filter Ribbon Adaptor
function adaptFilterRibbonForTab(tab) {
  const princSelect = document.getElementById('filter-principal');
  const brandSelect = document.getElementById('filter-brand');
  const subbrandSelect = document.getElementById('filter-subbrand');
  const groupSkuSelect = document.getElementById('filter-group-sku');
  const spvSelect = document.getElementById('filter-spv');
  const groupSelect = document.getElementById('filter-sales-group');
  const periodSelect = document.getElementById('filter-period');

  if (tab === 'sariwangi') {
    // Hide non-relevant filters for SariWangi
    if (spvSelect && spvSelect.parentElement) spvSelect.parentElement.classList.add('hidden');
    if (groupSelect && groupSelect.parentElement) groupSelect.parentElement.classList.add('hidden');
    if (subbrandSelect && subbrandSelect.parentElement) subbrandSelect.parentElement.classList.add('hidden');
    if (groupSkuSelect && groupSkuSelect.parentElement) groupSkuSelect.parentElement.classList.add('hidden');

    // Lock Principal to UNILEVER INDONESIA
    if (princSelect) {
      if (!princSelect.dataset.originalHtml) princSelect.dataset.originalHtml = princSelect.innerHTML;
      princSelect.innerHTML = '<option value="UNILEVER INDONESIA" selected>UNILEVER INDONESIA (Terkunci)</option>';
      princSelect.disabled = true;
      princSelect.classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
    }

    // Lock Brand to SARIWANGI
    if (brandSelect) {
      if (!brandSelect.dataset.originalHtml) brandSelect.dataset.originalHtml = brandSelect.innerHTML;
      brandSelect.innerHTML = '<option value="SARIWANGI" selected>SARIWANGI (Terkunci)</option>';
      brandSelect.disabled = true;
      brandSelect.classList.add('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
    }

    // Ensure Period options include Semua Periode (Kumulatif)
    if (periodSelect) {
      if (!periodSelect.querySelector('option[value=""]')) {
        const allOpt = document.createElement('option');
        allOpt.value = '';
        allOpt.textContent = 'Semua Periode (Kumulatif)';
        periodSelect.insertBefore(allOpt, periodSelect.firstChild);
      }
      if (window.sariwangiState && window.sariwangiState.filters.period !== undefined) {
        periodSelect.value = window.sariwangiState.filters.period;
      }
    }
  } else {
    // Restore normal filter ribbon
    if (spvSelect && spvSelect.parentElement) spvSelect.parentElement.classList.remove('hidden');
    if (groupSelect && groupSelect.parentElement) groupSelect.parentElement.classList.remove('hidden');
    if (subbrandSelect && subbrandSelect.parentElement) subbrandSelect.parentElement.classList.remove('hidden');
    if (groupSkuSelect && groupSkuSelect.parentElement) groupSkuSelect.parentElement.classList.remove('hidden');

    if (princSelect) {
      princSelect.disabled = false;
      princSelect.classList.remove('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
      if (princSelect.dataset.originalHtml) {
        princSelect.innerHTML = princSelect.dataset.originalHtml;
      }
      princSelect.value = globalFilters.principal || '';
    }

    if (brandSelect) {
      brandSelect.disabled = false;
      brandSelect.classList.remove('bg-slate-100', 'text-slate-500', 'cursor-not-allowed');
      if (brandSelect.dataset.originalHtml) {
        brandSelect.innerHTML = brandSelect.dataset.originalHtml;
      }
      brandSelect.value = globalFilters.brand || '';
    }
  }
}

// Router
function navigate(tab) {
  currentTab = tab;
  adaptFilterRibbonForTab(tab);
  document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
  const activeNav = document.getElementById(`nav-${tab}`);
  if (activeNav) activeNav.classList.add('active');

  const main = document.getElementById('main-content');
  main.innerHTML = `<div class="flex items-center justify-center py-20 text-slate-400 text-sm"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mr-2"></i> Memuat data...</div>`;
  lucide.createIcons();

  if (tab === 'beranda') renderBeranda();
  else if (tab === 'map') {
    renderBeranda().then(() => {
      openGarutMapModal(window.currentKecCoverage, window.currentCovStats);
    });
  }
  else if (tab === 'penjualan') renderPenjualan();
  else if (tab === 'sariwangi') renderSariwangiAnalytics();
  else if (tab === 'trend') renderTrend();
  else if (tab === 'performance') renderPerformance();
  else if (tab === 'outlet') renderOutlet();
  else if (tab === 'salesman') renderSalesman();
  else if (tab === 'program') renderProgram();
  else if (tab === 'stock') renderStock();
  else if (tab === 'pricelist') renderPricelist();
  else if (tab === 'datacenter') renderDataCenter();
  else if (tab === 'settings') renderSettings();
}

// Mobile sidebar drawer toggle helper
function toggleSidebar(forceState) {
  const sidebar = document.getElementById('app-sidebar');
  const backdrop = document.getElementById('sidebar-backdrop');
  if (!sidebar) return;
  const isCurrentlyOpen = !sidebar.classList.contains('-translate-x-full');
  const shouldOpen = forceState !== undefined ? forceState : !isCurrentlyOpen;

  if (shouldOpen) {
    sidebar.classList.remove('-translate-x-full');
    if (backdrop) backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.add('-translate-x-full');
    if (backdrop) backdrop.classList.add('hidden');
  }
}

function getTodayLocalDateString() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function highlightSearchMatch(text, query) {
  if (!text) return '';
  if (!query) return escapeHtml(text);
  const escapedText = escapeHtml(text);
  const escapedQuery = String(query).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!escapedQuery) return escapedText;
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return escapedText.replace(regex, '<mark class="bg-amber-100 text-amber-900 font-bold px-0.5 rounded">$1</mark>');
}

function getFilterQuery() {
  const params = new URLSearchParams();
  params.append('year', globalFilters.year);
  params.append('month', globalFilters.month);
  params.append('asOfDate', getTodayLocalDateString());
  if (globalFilters.spvId) params.append('spvId', globalFilters.spvId);
  if (globalFilters.salesmanId) params.append('salesmanId', globalFilters.salesmanId);
  if (globalFilters.salesGroup) params.append('salesGroup', globalFilters.salesGroup);
  if (globalFilters.rayonId) params.append('rayonId', globalFilters.rayonId);
  if (globalFilters.principal) params.append('principal', globalFilters.principal);
  if (globalFilters.brand) params.append('brand', globalFilters.brand);
  if (globalFilters.subbrand) params.append('subbrand', globalFilters.subbrand);
  if (globalFilters.groupSku) params.append('groupSku', globalFilters.groupSku);
  if (globalFilters.kecamatanId) params.append('kecamatanId', globalFilters.kecamatanId);
  return params.toString();
}

function formatHeaderDateNow() {
  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const dayNames = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const now = new Date();
  const dayName = dayNames[now.getDay()] || '';
  const day = now.getDate();
  const monthName = monthNames[now.getMonth() + 1] || '';
  const year = now.getFullYear();
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} WIB`;
  return `${dayName}, ${day} ${monthName} ${year} | ${timeStr}`;
}

function updateHeaderDate(cal) {
  const el = document.getElementById('header-date');
  if (!el) return;
  // Tanggal di atas dibuat menjadi tgl hari ini saat URL dibuka (hari actual hari ini)
  el.textContent = formatHeaderDateNow();
}

async function loadFilterOptions() {
  try {
    const res = await fetch('/api/filters/options');
    const data = await res.json();

    // Populate Periods
    const periodSelect = document.getElementById('filter-period');
    if (periodSelect && data.periods && data.periods.length > 0) {
      const currentVal = `${globalFilters.year}-${String(globalFilters.month).padStart(2, '0')}`;
      periodSelect.innerHTML = data.periods.map(p => {
        const val = `${p.year}-${String(p.month).padStart(2, '0')}`;
        const isSelected = val === currentVal ? 'selected' : '';
        return `<option value="${val}" ${isSelected}>${p.label || val}</option>`;
      }).join('');
    }

    // Populate SPV
    const spvSelect = document.getElementById('filter-spv');
    if (spvSelect) {
      spvSelect.innerHTML = '<option value="">Semua SPV</option>' + data.spvs.map(s => `<option value="${s.spv_id}">${s.name} (${s.code})</option>`).join('');
    }

    // Populate Salesman Group
    const groupSelect = document.getElementById('filter-sales-group');
    if (groupSelect && data.salesGroups) {
      groupSelect.innerHTML = '<option value="">Semua Group</option>' + data.salesGroups.map(g => `<option value="${g.id}">${g.name}</option>`).join('');
    }

    // Populate Salesman
    const salesSelect = document.getElementById('filter-salesman');
    if (salesSelect) {
      salesSelect.innerHTML = '<option value="">Semua Salesman</option>' + data.salesmen.map(s => `<option value="${s.salesman_id}">${s.name}</option>`).join('');
    }

    // Populate Rayon
    const rayonSelect = document.getElementById('filter-rayon');
    if (rayonSelect && data.rayons) {
      rayonSelect.innerHTML = '<option value="">Semua Rayon</option>' + data.rayons.map(r => `<option value="${r.rayon_id}">${r.code || r.name}</option>`).join('');
    }

    // Populate Principal
    const princSelect = document.getElementById('filter-principal');
    if (princSelect && data.principals) {
      princSelect.innerHTML = '<option value="">Semua Principal</option>' + data.principals.map(p => `<option value="${p}">${p}</option>`).join('');
    }

    // Populate Brand
    const brandSelect = document.getElementById('filter-brand');
    if (brandSelect && data.brands) {
      brandSelect.innerHTML = '<option value="">Semua Brand</option>' + data.brands.map(b => `<option value="${b}">${b}</option>`).join('');
    }

    // Populate Subbrand
    const subbrandSelect = document.getElementById('filter-subbrand');
    if (subbrandSelect && data.subbrands) {
      subbrandSelect.innerHTML = '<option value="">Semua Subbrand</option>' + data.subbrands.map(s => `<option value="${s}">${s}</option>`).join('');
    }

    // Populate Group SKU
    const groupSkuSelect = document.getElementById('filter-group-sku');
    if (groupSkuSelect && data.groupSkus) {
      groupSkuSelect.innerHTML = '<option value="">Semua Group SKU</option>' + data.groupSkus.map(g => `<option value="${g}">${g}</option>`).join('');
    }

    // Populate Kecamatan
    const kecSelect = document.getElementById('filter-kecamatan');
    if (kecSelect && data.kecamatans) {
      kecSelect.innerHTML = '<option value="">Semua Kecamatan</option>' + data.kecamatans.map(k => `<option value="${k.kecamatan_id}">${k.name}</option>`).join('');
    }
  } catch (e) {
    console.error('Error loading filter options:', e);
  }
}

function toggleMobileFilter(forceState) {
  const ribbon = document.getElementById('global-filter-ribbon');
  const chevron = document.getElementById('mobile-filter-chevron');
  if (!ribbon) return;

  const isClosed = ribbon.classList.contains('hidden');
  const openIt = forceState !== undefined ? forceState : isClosed;

  if (openIt) {
    ribbon.classList.remove('hidden');
    ribbon.classList.add('flex');
    if (chevron) chevron.style.transform = 'rotate(180deg)';
  } else {
    ribbon.classList.add('hidden');
    ribbon.classList.remove('flex');
    if (chevron) chevron.style.transform = 'rotate(0deg)';
  }
}

function updateMobileFilterSummary() {
  const summaryEl = document.getElementById('mobile-filter-summary');
  if (!summaryEl) return;

  const pEl = document.getElementById('filter-period');
  const spvEl = document.getElementById('filter-spv');
  const slsEl = document.getElementById('filter-salesman');
  const grpEl = document.getElementById('filter-sales-group');
  const rynEl = document.getElementById('filter-rayon');
  const prnEl = document.getElementById('filter-principal');
  const brdEl = document.getElementById('filter-brand');
  const sbdEl = document.getElementById('filter-subbrand');
  const gskEl = document.getElementById('filter-group-sku');
  const kecEl = document.getElementById('filter-kecamatan');

  const parts = [];
  if (pEl && pEl.selectedIndex >= 0) parts.push(pEl.options[pEl.selectedIndex].text);
  if (spvEl && spvEl.value) parts.push(spvEl.options[spvEl.selectedIndex].text);
  if (grpEl && grpEl.value) parts.push(grpEl.options[grpEl.selectedIndex].text);
  if (slsEl && slsEl.value) parts.push(slsEl.options[slsEl.selectedIndex].text);
  if (rynEl && rynEl.value) parts.push(rynEl.options[rynEl.selectedIndex].text);
  if (prnEl && prnEl.value) parts.push(prnEl.options[prnEl.selectedIndex].text);
  if (brdEl && brdEl.value) parts.push(brdEl.options[brdEl.selectedIndex].text);
  if (sbdEl && sbdEl.value) parts.push(sbdEl.options[sbdEl.selectedIndex].text);
  if (gskEl && gskEl.value) parts.push(gskEl.options[gskEl.selectedIndex].text);
  if (kecEl && kecEl.value) parts.push(kecEl.options[kecEl.selectedIndex].text);

  if (parts.length === 1) parts.push('Semua SPV');
  summaryEl.textContent = parts.join(' • ');
}

function applyFilters() {
  if (currentTab === 'sariwangi') {
    const pEl = document.getElementById('filter-period');
    window.sariwangiState.filters.period = pEl ? pEl.value : '';
    const slsEl = document.getElementById('filter-salesman');
    window.sariwangiState.filters.salesman = (slsEl && slsEl.selectedIndex > 0) ? slsEl.options[slsEl.selectedIndex].text : '';
    const rynEl = document.getElementById('filter-rayon');
    window.sariwangiState.filters.rayon = (rynEl && rynEl.selectedIndex > 0) ? rynEl.options[rynEl.selectedIndex].text : '';
    const kecEl = document.getElementById('filter-kecamatan');
    window.sariwangiState.filters.kecamatan = (kecEl && kecEl.selectedIndex > 0) ? kecEl.options[kecEl.selectedIndex].text : '';

    updateMobileFilterSummary();
    if (window.innerWidth < 1024) {
      toggleMobileFilter(false);
    }
    renderSariwangiAnalytics();
    return;
  }

  const pVal = document.getElementById('filter-period').value.split('-');
  globalFilters.year = parseInt(pVal[0], 10);
  globalFilters.month = parseInt(pVal[1], 10);
  globalFilters.spvId = document.getElementById('filter-spv') ? document.getElementById('filter-spv').value : '';
  globalFilters.salesmanId = document.getElementById('filter-salesman') ? document.getElementById('filter-salesman').value : '';
  const grpEl = document.getElementById('filter-sales-group');
  globalFilters.salesGroup = grpEl ? grpEl.value : '';
  globalFilters.rayonId = document.getElementById('filter-rayon') ? document.getElementById('filter-rayon').value : '';
  globalFilters.principal = document.getElementById('filter-principal') ? document.getElementById('filter-principal').value : '';
  globalFilters.brand = document.getElementById('filter-brand') ? document.getElementById('filter-brand').value : '';
  globalFilters.subbrand = document.getElementById('filter-subbrand') ? document.getElementById('filter-subbrand').value : '';
  globalFilters.groupSku = document.getElementById('filter-group-sku') ? document.getElementById('filter-group-sku').value : '';
  globalFilters.kecamatanId = document.getElementById('filter-kecamatan') ? document.getElementById('filter-kecamatan').value : '';

  updateMobileFilterSummary();
  if (window.innerWidth < 1024) {
    toggleMobileFilter(false);
  }

  navigate(currentTab);
}

function resetFilters() {
  if (currentTab === 'sariwangi') {
    const pEl = document.getElementById('filter-period');
    if (pEl) pEl.value = '2026-09';
    if (document.getElementById('filter-salesman')) document.getElementById('filter-salesman').value = '';
    if (document.getElementById('filter-rayon')) document.getElementById('filter-rayon').value = '';
    if (document.getElementById('filter-kecamatan')) document.getElementById('filter-kecamatan').value = '';
    window.sariwangiState.filters = {
      period: '2026-09',
      salesman: '',
      rayon: '',
      kecamatan: '',
      skuType: 'ALL',
      search: ''
    };
    updateMobileFilterSummary();
    if (window.innerWidth < 1024) {
      toggleMobileFilter(false);
    }
    renderSariwangiAnalytics();
    return;
  }

  document.getElementById('filter-period').value = '2026-09';
  if (document.getElementById('filter-spv')) document.getElementById('filter-spv').value = '';
  if (document.getElementById('filter-salesman')) document.getElementById('filter-salesman').value = '';
  if (document.getElementById('filter-sales-group')) document.getElementById('filter-sales-group').value = '';
  if (document.getElementById('filter-rayon')) document.getElementById('filter-rayon').value = '';
  if (document.getElementById('filter-principal')) document.getElementById('filter-principal').value = '';
  if (document.getElementById('filter-brand')) document.getElementById('filter-brand').value = '';
  if (document.getElementById('filter-subbrand')) document.getElementById('filter-subbrand').value = '';
  if (document.getElementById('filter-group-sku')) document.getElementById('filter-group-sku').value = '';
  if (document.getElementById('filter-kecamatan')) document.getElementById('filter-kecamatan').value = '';
  globalFilters.salesGroup = '';
  globalFilters.rayonId = '';
  globalFilters.principal = '';
  globalFilters.brand = '';
  globalFilters.subbrand = '';
  globalFilters.groupSku = '';
  globalFilters.kecamatanId = '';
  updateMobileFilterSummary();
  if (window.innerWidth < 1024) {
    toggleMobileFilter(false);
  }
  applyFilters();
}

function resetProductFilters() {
  if (document.getElementById('filter-principal')) document.getElementById('filter-principal').value = '';
  if (document.getElementById('filter-brand')) document.getElementById('filter-brand').value = '';
  if (document.getElementById('filter-subbrand')) document.getElementById('filter-subbrand').value = '';
  if (document.getElementById('filter-group-sku')) document.getElementById('filter-group-sku').value = '';
  globalFilters.principal = '';
  globalFilters.brand = '';
  globalFilters.subbrand = '';
  globalFilters.groupSku = '';
  updateMobileFilterSummary();
  applyFilters();
}

function sortDataRows(array, key, direction) {
  return [...array].sort((a, b) => {
    let valA = a[key] !== undefined && a[key] !== null ? a[key] : '';
    let valB = b[key] !== undefined && b[key] !== null ? b[key] : '';
    if (typeof valA === 'string') {
      return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return direction === 'asc' ? valA - valB : valB - valA;
  });
}

// ==============================================================
// GARUT CHOROPLETH SVG MAP SYSTEM (media_1789303707623.jpg)
// ==============================================================
let garutMapCache = null;

async function getGarutMap() {
  if (garutMapCache) return garutMapCache;
  try {
    const res = await fetch('/garut_map.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    garutMapCache = await res.json();
    return garutMapCache;
  } catch (err) {
    console.error('Error fetching Garut Map:', err);
    return null;
  }
}

// Immediately trigger prefetch on script load
getGarutMap();

const cleanKecName = s => (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function getCoverageTier(covPct, regCount) {
  if (!regCount || regCount === 0) {
    return { fill: '#f1f5f9', stroke: '#cbd5e1', tier: 'empty', label: 'Belum Ada Outlet' };
  }
  if (covPct >= 80) return { fill: '#16a34a', stroke: '#15803d', tier: '80', label: '≥ 80%' };
  if (covPct >= 60) return { fill: '#4ade80', stroke: '#22c55e', tier: '60', label: '60 – 79%' };
  if (covPct >= 40) return { fill: '#facc15', stroke: '#eab308', tier: '40', label: '40 – 59%' };
  if (covPct >= 20) return { fill: '#fb923c', stroke: '#f97316', tier: '20', label: '20 – 39%' };
  return { fill: '#f87171', stroke: '#ef4444', tier: '0', label: '< 20%' };
}

async function renderGarutChoropleth(containerId, tooltipId, coverageList, totalStats) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const mapData = await getGarutMap();
  if (!mapData || !mapData.features) {
    container.innerHTML = `<div class="text-xs text-slate-400 py-8 text-center">Peta tidak tersedia</div>`;
    return;
  }

  const covMap = new Map();
  (coverageList || []).forEach(item => {
    covMap.set(cleanKecName(item.kecamatanName), item);
  });

  // Tally counts for legend
  const counts = { '80': 0, '60': 0, '40': 0, '20': 0, '0': 0, 'empty': 0 };

  const pathsHtml = mapData.features.map(f => {
    const norm = cleanKecName(f.name);
    const cData = covMap.get(norm);
    const reg = cData ? cData.registeredOutlets : 0;
    const act = cData ? cData.activeOutlets : 0;
    const cov = cData ? cData.coveragePct : 0;
    const cartons = cData ? cData.actualCartons : 0;
    const sales = cData ? cData.salesValue : 0;
    const tierInfo = getCoverageTier(cov, reg);

    counts[tierInfo.tier]++;

    return `<path id="map-kec-${f.code || norm}"
      class="garut-kec-path cursor-pointer transition-all duration-150"
      d="${f.path}"
      fill="${tierInfo.fill}"
      stroke="#ffffff"
      stroke-width="0.8"
      data-name="${f.name}"
      data-reg="${reg}"
      data-act="${act}"
      data-cov="${cov}"
      data-cartons="${cartons}"
      data-sales="${sales}"
      data-tier="${tierInfo.tier}"
    ></path>`;
  }).join('');

  // Update legend counts in DOM if elements exist
  const el80 = document.getElementById('legend-count-80');
  const el60 = document.getElementById('legend-count-60');
  const el40 = document.getElementById('legend-count-40');
  const el20 = document.getElementById('legend-count-20');
  const el0 = document.getElementById('legend-count-0');
  const elEmpty = document.getElementById('legend-count-empty');

  if (el80) el80.textContent = `${counts['80']} kec`;
  if (el60) el60.textContent = `${counts['60']} kec`;
  if (el40) el40.textContent = `${counts['40']} kec`;
  if (el20) el20.textContent = `${counts['20']} kec`;
  if (el0) el0.textContent = `${counts['0']} kec`;
  if (elEmpty) elEmpty.textContent = `${counts['empty']} kec`;

  container.innerHTML = `
    <svg viewBox="${mapData.viewBox}" class="w-full h-full max-h-[250px] drop-shadow-sm select-none" preserveAspectRatio="xMidYMid meet">
      <g id="garut-kec-group">
        ${pathsHtml}
      </g>
    </svg>
  `;

  // Attach hover & click events
  const tooltip = document.getElementById(tooltipId);
  const detailTitle = document.getElementById('map-detail-title');
  const detailName = document.getElementById('map-detail-name');
  const detailStats = document.getElementById('map-detail-stats');

  const paths = container.querySelectorAll('.garut-kec-path');

  paths.forEach(p => {
    const onEnter = (e) => {
      p.style.stroke = '#0f172a';
      p.style.strokeWidth = '2.2px';
      p.style.filter = 'drop-shadow(0 2px 6px rgba(0,0,0,0.35))';
      p.style.opacity = '1';

      paths.forEach(other => {
        if (other !== p) other.style.opacity = '0.65';
      });

      const name = p.getAttribute('data-name');
      const reg = parseInt(p.getAttribute('data-reg')) || 0;
      const act = parseInt(p.getAttribute('data-act')) || 0;
      const cov = parseFloat(p.getAttribute('data-cov')) || 0;
      const cartons = parseFloat(p.getAttribute('data-cartons')) || 0;

      if (detailTitle) detailTitle.textContent = 'Wilayah Dipilih';
      if (detailName) detailName.textContent = name;
      if (detailStats) {
        if (reg > 0) {
          detailStats.innerHTML = `
            <span>${act}/${reg} Outlet</span>
            <span class="font-bold ${cov >= 60 ? 'text-emerald-700' : (cov >= 40 ? 'text-amber-700' : 'text-rose-700')}">${cov}% Cov</span>
          `;
        } else {
          detailStats.innerHTML = `<span class="text-slate-400 italic">Belum ada outlet terdaftar</span>`;
        }
      }

      if (tooltip) {
        tooltip.classList.remove('hidden');
        tooltip.innerHTML = `
          <p class="font-bold text-white text-xs">${name}</p>
          <div class="mt-1 space-y-0.5 text-[10px] text-slate-200">
            <p class="flex justify-between gap-3"><span>Coverage:</span> <strong class="${cov >= 60 ? 'text-emerald-400' : (cov >= 40 ? 'text-amber-300' : 'text-rose-300')}">${cov}%</strong></p>
            <p class="flex justify-between gap-3"><span>Outlet Aktif:</span> <strong>${act} / ${reg}</strong></p>
            ${reg > 0 ? `<p class="flex justify-between gap-3"><span>Penjualan:</span> <strong>${cartons} KTN</strong></p>` : ''}
          </div>
        `;
        updateTooltipPos(e);
      }
    };

    const updateTooltipPos = (e) => {
      if (!tooltip) return;
      const targetParent = tooltip.offsetParent || container;
      const rect = targetParent.getBoundingClientRect();
      const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
      if (clientX === undefined || clientY === undefined) return;

      const x = clientX - rect.left + 12;
      const y = clientY - rect.top + 12;
      const maxX = Math.max(8, rect.width - 145);
      const maxY = Math.max(8, rect.height - 85);
      tooltip.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
    };

    const onLeave = () => {
      p.style.stroke = '#ffffff';
      p.style.strokeWidth = '0.8px';
      p.style.filter = 'none';

      paths.forEach(other => {
        other.style.opacity = '1';
      });

      if (tooltip) tooltip.classList.add('hidden');
      if (detailTitle) detailTitle.textContent = 'Sorot / Klik Wilayah';
      if (detailName) detailName.textContent = 'Kabupaten Garut';
      if (detailStats && totalStats) {
        detailStats.innerHTML = `
          <span>${(totalStats.registeredOutlets || 0).toLocaleString('id-ID')} Outlet</span>
          <span class="font-bold text-blue-700">${totalStats.coveragePct || 0}% Cov</span>
        `;
      }
    };

    p.addEventListener('mouseenter', onEnter);
    p.addEventListener('mousemove', updateTooltipPos);
    p.addEventListener('mouseleave', onLeave);
    p.addEventListener('touchstart', (e) => {
      onEnter(e);
    }, { passive: true });

    p.addEventListener('click', () => {
      const name = p.getAttribute('data-name');
      const reg = parseInt(p.getAttribute('data-reg')) || 0;
      if (reg > 0) {
        const kecSelect = document.getElementById('filter-kecamatan');
        if (kecSelect) {
          for (let i = 0; i < kecSelect.options.length; i++) {
            if (cleanKecName(kecSelect.options[i].text).includes(cleanKecName(name)) || cleanKecName(name).includes(cleanKecName(kecSelect.options[i].text))) {
              kecSelect.selectedIndex = i;
              break;
            }
          }
        }
        applyFilters();
        navigate('outlet');
      } else {
        if (detailStats) {
          detailStats.innerHTML = `<span class="text-amber-600 font-semibold">Belum ada rute aktif di ${name}</span>`;
        }
      }
    });
  });
}

async function openGarutMapModal(coverageData, totalStats) {
  const modal = document.getElementById('modal-container');
  const content = document.getElementById('modal-content');
  if (!modal || !content) return;

  if (!coverageData || !totalStats) {
    if (window.currentKecCoverage && window.currentCovStats) {
      coverageData = window.currentKecCoverage;
      totalStats = window.currentCovStats;
    } else {
      try {
        const res = await fetch(`/api/dashboard/executive?${getFilterQuery()}`);
        const d = await res.json();
        coverageData = d.kecamatanCoverage;
        totalStats = d.coverage;
        window.currentKecCoverage = coverageData;
        window.currentCovStats = totalStats;
      } catch (err) {
        console.error('Failed to load coverage data for map:', err);
      }
    }
  }

  const mapData = await getGarutMap();
  const covMap = new Map();
  (coverageData || []).forEach(item => {
    covMap.set(cleanKecName(item.kecamatanName), item);
  });

  const sortedList = (mapData?.features || []).map(f => {
    const norm = cleanKecName(f.name);
    const c = covMap.get(norm) || { registeredOutlets: 0, activeOutlets: 0, coveragePct: 0, actualCartons: 0, salesValue: 0 };
    return { name: f.name, code: f.code, ...c };
  }).sort((a, b) => (b.coveragePct - a.coveragePct) || (b.registeredOutlets - a.registeredOutlets));

  content.innerHTML = `
    <div class="flex items-center justify-between pb-4 border-b border-slate-200">
      <div class="flex items-center gap-2.5">
        <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <i data-lucide="map" class="w-5 h-5"></i>
        </div>
        <div>
          <h3 class="text-base font-bold text-slate-800">Peta Distribusi & Coverage Kecamatan Kabupaten Garut</h3>
          <p class="text-xs text-slate-500">Visualisasi geografis 42 kecamatan dan penetrasi outlet aktif</p>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <a href="https://www.google.com/maps/search/?api=1&query=Kabupaten+Garut" target="_blank" rel="noopener noreferrer" class="text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 transition">
          <i data-lucide="map-pin" class="w-3.5 h-3.5"></i>
          <span>Buka di Google Maps</span>
        </a>
        <button onclick="document.getElementById('modal-container').classList.add('hidden')" class="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100">
          <i data-lucide="x" class="w-5 h-5"></i>
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 mt-4">
      <!-- Big Map (7 cols) -->
      <div class="lg:col-span-7 bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col items-center justify-center relative min-h-[420px]">
        <div id="modal-map-container" class="w-full h-full flex items-center justify-center">
          <!-- Big SVG Map -->
        </div>
        <div id="modal-map-tooltip" class="absolute hidden pointer-events-none z-20 bg-slate-900/90 text-white text-xs px-3 py-2 rounded-lg shadow-xl backdrop-blur-sm border border-slate-700"></div>
      </div>

      <!-- Detail Table & Legend (5 cols) -->
      <div class="lg:col-span-5 flex flex-col justify-between space-y-4">
        <div>
          <h4 class="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Peringkat Coverage per Kecamatan</h4>
          <div class="max-h-[380px] overflow-y-auto scrollbar-thin border border-slate-200 rounded-lg">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-100 text-slate-700 font-semibold sticky top-0">
                <tr>
                  <th class="py-2 px-3">Kecamatan</th>
                  <th class="py-2 px-2 text-right">Outlet</th>
                  <th class="py-2 px-2 text-right">Coverage</th>
                  <th class="py-2 px-2 text-right">KTN</th>
                  <th class="py-2 px-2 text-center w-8">Maps</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${sortedList.map((k, i) => `
                  <tr class="hover:bg-blue-50/50 transition cursor-pointer" onclick="filterByKecamatanAndClose('${k.name}')">
                    <td class="py-2 px-3 flex items-center gap-1.5 font-medium text-slate-800">
                      <span class="w-2 h-2 rounded-full shrink-0 ${k.registeredOutlets === 0 ? 'bg-slate-300' : (k.coveragePct >= 60 ? 'bg-emerald-500' : (k.coveragePct >= 40 ? 'bg-amber-500' : 'bg-rose-500'))}"></span>
                      <span class="truncate max-w-[120px]">${k.name}</span>
                    </td>
                    <td class="py-2 px-2 text-right text-slate-600">${k.activeOutlets}/${k.registeredOutlets}</td>
                    <td class="py-2 px-2 text-right font-bold ${k.coveragePct >= 60 ? 'text-emerald-600' : (k.coveragePct >= 40 ? 'text-amber-600' : (k.registeredOutlets > 0 ? 'text-rose-600' : 'text-slate-400'))}">${k.registeredOutlets > 0 ? k.coveragePct + '%' : '—'}</td>
                    <td class="py-2 px-2 text-right text-slate-700 font-semibold">${k.actualCartons || 0}</td>
                    <td class="py-2 px-2 text-center" onclick="event.stopPropagation()">
                      <a href="https://www.google.com/maps/search/?api=1&query=Kecamatan+${encodeURIComponent(k.name)}+Garut" target="_blank" rel="noopener noreferrer" class="text-slate-400 hover:text-emerald-600 p-1 inline-flex items-center" title="Buka di Google Maps">
                        <i data-lucide="external-link" class="w-3.5 h-3.5"></i>
                      </a>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <div class="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex justify-between items-center">
          <div>
            <span class="text-slate-500 block text-[10px]">Total Terdaftar</span>
            <span class="font-bold text-slate-800 text-sm">${totalStats?.registeredOutlets ? totalStats.registeredOutlets.toLocaleString('id-ID') : 0} Outlet</span>
          </div>
          <div>
            <span class="text-slate-500 block text-[10px]">Coverage Garut</span>
            <span class="font-bold text-emerald-700 text-sm">${totalStats?.coveragePct || 0}%</span>
          </div>
          <button onclick="navigate('outlet'); document.getElementById('modal-container').classList.add('hidden')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-semibold text-xs transition">
            Lihat Semua Outlet
          </button>
        </div>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  lucide.createIcons();

  await renderGarutChoropleth('modal-map-container', 'modal-map-tooltip', coverageData, totalStats);
}

function filterByKecamatanAndClose(kecName) {
  const kecSelect = document.getElementById('filter-kecamatan');
  if (kecSelect) {
    for (let i = 0; i < kecSelect.options.length; i++) {
      if (cleanKecName(kecSelect.options[i].text).includes(cleanKecName(kecName)) || cleanKecName(kecName).includes(cleanKecName(kecSelect.options[i].text))) {
        kecSelect.selectedIndex = i;
        break;
      }
    }
  }
  document.getElementById('modal-container').classList.add('hidden');
  navigate('outlet');
}

// ==============================================================
// 1. BERANDA — EXECUTIVE COMMAND CENTER (media_1789300952398.jpg)
// ==============================================================
async function renderBeranda() {
  const main = document.getElementById('main-content');
  try {
    const res = await fetch(`/api/dashboard/executive?${getFilterQuery()}`);
    const data = await res.json();
    const s = data.summary.sales;
    const c = data.summary.coverage;
    const cal = data.summary.calendar;

    updateHeaderDate(cal);

    const achvBadgeClass = s.achievementPct >= 80 ? 'text-emerald-700 bg-emerald-100' : (s.achievementPct >= 60 ? 'text-amber-700 bg-amber-100' : 'text-rose-700 bg-rose-100');

    let html = `
      <!-- Sub-header Title -->
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
        <div>
          <h2 class="text-xl font-bold text-slate-800 tracking-tight">Beranda</h2>
          <p class="text-xs text-slate-500">Executive Command Center — Monitor kinerja penjualan, progres insentif dan coverage area secara real-time</p>
        </div>
        <div class="flex items-center gap-2 text-xs">
          <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-200 font-medium">
            <i data-lucide="shield-check" class="w-3.5 h-3.5"></i> Single Source of Truth
          </span>
        </div>
      </div>

      <!-- Executive Timegone & Daily Pace Banner (Senin s/d Jumat) -->
      <div class="bg-gradient-to-r from-slate-900 via-blue-950 to-indigo-900 text-white p-4 sm:p-5 rounded-2xl shadow-lg border border-slate-800 flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        <div class="flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300 flex-shrink-0">
            <i data-lucide="clock" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="flex items-center gap-2 flex-wrap">
              <span class="text-xs font-bold uppercase tracking-wider text-blue-300">Pace Operasional (Senin s/d Jumat)</span>
              ${cal.isFullMonth ? `
                <span class="text-[10px] px-2.5 py-0.5 rounded-full font-bold bg-blue-500/20 text-blue-300 border border-blue-400/40">
                  BULAN SELESAI (FULL MONTH)
                </span>
              ` : `
                <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${s.achievementPct >= (cal.timegonePct || 80.0) ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40' : (s.achievementPct >= (cal.timegonePct || 80.0) - 15 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'bg-rose-500/20 text-rose-300 border border-rose-500/40')}">
                  ${s.hasTarget && s.achievementPct !== null ? (s.achievementPct >= (cal.timegonePct || 80.0) ? 'ON PACE (Ahead Timerate)' : (s.achievementPct >= (cal.timegonePct || 80.0) - 15 ? 'NEEDS ATTENTION' : 'BEHIND PACE')) : 'STANDBY'}
                </span>
              `}
            </div>
            <p class="text-base font-extrabold text-white mt-0.5">
              ${cal.isFullMonth ? `
                Realisasi Penuh: <span class="text-emerald-400">${cal.monFriTotalHk || cal.totalHk || 25}</span> / ${cal.monFriTotalHk || cal.totalHk || 25} HK 
                <span class="text-slate-400 text-xs font-normal">(Bulan Telah Ditutup / Full Month)</span>
              ` : `
                HKE Berjalan: <span class="text-emerald-400">${cal.monFriAsOfHke !== undefined ? cal.monFriAsOfHke : (cal.asOfHke || 20)}</span> / ${cal.monFriTotalHk || cal.totalHk || 25} HK 
                <span class="text-slate-400 text-xs font-normal">(Sisa ${cal.monFriRemainingHk !== undefined ? cal.monFriRemainingHk : (cal.remainingHk || 5)} Hari Kerja • Siklus ${cal.totalWeeks || 5} Minggu)</span>
              `}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white/5 border border-white/10 p-3 rounded-xl text-xs">
          <!-- Timegone -->
          <div>
            <span class="text-slate-400 text-[10px] block">Timegone (Timerate)</span>
            <span class="font-extrabold ${cal.isFullMonth ? 'text-blue-300' : 'text-amber-300'} text-sm">${cal.isFullMonth ? '100.0%' : (cal.timegonePct || 80.0) + '%'}</span>
          </div>
          <!-- Capaian MTD -->
          <div>
            <span class="text-slate-400 text-[10px] block">${cal.isFullMonth ? 'Capaian Target Final' : 'Capaian Target MTD'}</span>
            <span class="font-extrabold ${s.hasTarget && s.achievementPct !== null ? (s.achievementPct >= (cal.timegonePct || 80.0) ? 'text-emerald-400' : 'text-rose-400') : 'text-slate-400'} text-sm">${s.hasTarget && s.achievementPct !== null ? s.achievementPct + '%' + (cal.isFullMonth ? ' (Final)' : '') : 'N/A'}</span>
          </div>
          <!-- GAP Bulanan -->
          <div>
            <span class="text-slate-400 text-[10px] block">GAP Bulanan (KTN)</span>
            <span class="font-extrabold text-white text-sm">${s.gapMonthlyCartons !== null && s.hasTarget ? s.gapMonthlyCartons.toLocaleString('id-ID') + ' KTN' : 'N/A'}</span>
          </div>
          <!-- GAP Harian -->
          <div>
            <span class="text-slate-400 text-[10px] block">GAP Harian (Sisa HK)</span>
            <span class="font-extrabold ${cal.isFullMonth ? 'text-slate-300' : 'text-emerald-400'} text-sm">${cal.isFullMonth ? '0 KTN/hr (Selesai)' : (s.gapDailyMonFri !== null && s.hasTarget ? s.gapDailyMonFri.toLocaleString('id-ID') + ' KTN/hr' : (s.gapDaily !== null && s.hasTarget ? s.gapDaily.toLocaleString('id-ID') + ' KTN/hr' : 'N/A'))}</span>
          </div>
        </div>
      </div>

      <!-- Total Performance Quick Banner & CTA -->
      <div class="bg-gradient-to-r from-blue-900 to-indigo-950 p-4 sm:p-5 rounded-2xl border border-blue-800/80 text-white shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div class="flex items-center gap-3.5">
          <div class="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 shrink-0">
            <i data-lucide="bar-chart-2" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-bold uppercase tracking-wider text-emerald-300">Total Performance Intelligence</span>
              <span class="text-[10px] px-2 py-0.5 rounded-full font-bold bg-white/10 text-slate-200">1-Page Deep Dive</span>
            </div>
            <h3 class="text-sm sm:text-base font-bold text-white mt-0.5">Analisis Total Performa DSO, Kinerja Salesman & Kontribusi Sub-brand</h3>
            <p class="text-xs text-slate-300 mt-0.5">Rincian terpadu target vs aktual, peringkat tim sales, dan pergerakan varian SKU di seluruh Garut.</p>
          </div>
        </div>
        <div class="flex items-center gap-3 w-full md:w-auto justify-end shrink-0">
          <button onclick="navigate('performance')" class="w-full md:w-auto px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs rounded-xl shadow-md transition flex items-center justify-center gap-2">
            <span>Buka Summary Performance</span>
            <i data-lucide="arrow-right" class="w-4 h-4"></i>
          </button>
        </div>
      </div>

      <!-- Top KPI Cards Ribbon (8 Cards) -->
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        <!-- 1. Target KTN -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Target KTN</span>
            <i data-lucide="target" class="w-3.5 h-3.5 text-blue-500"></i>
          </div>
          <p class="text-lg font-bold text-slate-800">${s.hasTarget && s.targetCartons !== null ? s.targetCartons.toLocaleString('id-ID') : '<span class="text-slate-400 text-sm">Belum tersedia</span>'}</p>
          <p class="text-[10px] text-slate-500 font-medium flex items-center gap-0.5 mt-0.5" title="${s.hasTarget && s.targetValue ? 'Nilai Target: Rp ' + s.targetValue.toLocaleString('id-ID') : ''}">${s.hasTarget && s.targetValue ? 'Rp ' + (s.targetValue / 1000000).toFixed(1) + ' Jt' : (s.hasTarget ? '+8% vs lalu' : 'Target belum diatur')}</p>
        </div>

        <!-- 2. Actual KTN -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Actual KTN</span>
            <i data-lucide="package-check" class="w-3.5 h-3.5 ${cal.isFullMonth ? 'text-blue-500' : 'text-emerald-500'}"></i>
          </div>
          <p class="text-lg font-bold text-slate-800">${s.actualCartons.toLocaleString('id-ID')}</p>
          <p class="text-[10px] ${cal.isFullMonth ? 'text-blue-600' : 'text-emerald-600'} font-medium flex items-center gap-0.5 mt-0.5"><i data-lucide="${cal.isFullMonth ? 'check-circle' : 'trending-up'}" class="w-2.5 h-2.5"></i> ${cal.isFullMonth ? 'Realisasi Penuh (Full Month)' : 'MTD Realisasi'}</p>
        </div>

        <!-- 3. Achievement -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Achievement</span>
            <i data-lucide="award" class="w-3.5 h-3.5 text-amber-500"></i>
          </div>
          <p class="text-lg font-bold text-slate-800">${s.hasTarget && s.achievementPct !== null ? s.achievementPct + '%' : '<span class="text-slate-400 text-sm">N/A</span>'}</p>
          <span class="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${cal.isFullMonth ? 'bg-blue-50 text-blue-700 border border-blue-200' : (s.hasTarget && s.latestEstimateAchvPct !== null ? achvBadgeClass : 'bg-slate-100 text-slate-500')} mt-0.5">${cal.isFullMonth ? 'Final Realisasi: ' + (s.achievementPct !== null ? s.achievementPct + '%' : 'N/A') : ('LE ' + (s.hasTarget && s.latestEstimateAchvPct !== null ? s.latestEstimateAchvPct + '%' : 'N/A'))}</span>
        </div>

        <!-- 4. Gap -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Gap Target</span>
            <i data-lucide="trending-down" class="w-3.5 h-3.5 text-rose-500"></i>
          </div>
          <p class="text-lg font-bold text-slate-800">${s.hasTarget && s.remainingTarget !== null ? s.remainingTarget.toLocaleString('id-ID') : '<span class="text-slate-400 text-sm">N/A</span>'}</p>
          <p class="text-[10px] ${s.hasTarget && s.remainingTarget === 0 ? 'text-emerald-600 font-semibold' : 'text-rose-600'} font-medium mt-0.5">${s.hasTarget ? (s.remainingTarget === 0 ? 'Target tercapai!' : (cal.isFullMonth ? 'sisa target final' : 'sisa target')) : 'target belum ada'}</p>
        </div>

        <!-- 5. Sales Value -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Sales Value</span>
            <i data-lucide="coins" class="w-3.5 h-3.5 text-purple-500"></i>
          </div>
          <p class="text-lg font-bold text-slate-800">Rp ${(s.salesNettoValue / 1000000).toFixed(1)} Jt</p>
          <p class="text-[10px] ${s.hasTarget && s.targetValue ? 'text-purple-700 font-semibold' : 'text-emerald-600'} font-medium mt-0.5" title="${s.hasTarget && s.targetValue ? 'Target: Rp ' + s.targetValue.toLocaleString('id-ID') : ''}">${s.hasTarget && s.targetValue ? 'Tgt: Rp ' + (s.targetValue / 1000000).toFixed(1) + ' Jt (' + (Math.round((s.salesNettoValue / s.targetValue) * 1000) / 10) + '%)' : (cal.isFullMonth ? 'Netto Full Month' : 'Netto MTD')}</p>
        </div>

        <!-- 6. Registered Outlet (CL) -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Registered (CL)</span>
            <i data-lucide="store" class="w-3.5 h-3.5 text-teal-500"></i>
          </div>
          <p class="text-lg font-bold text-slate-800">${c.registeredOutlets.toLocaleString('id-ID')}</p>
          <p class="text-[10px] text-slate-400 mt-0.5">Universe Outlet</p>
        </div>

        <!-- 7. Active Outlet (OC) -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Active (OC)</span>
            <i data-lucide="shopping-bag" class="w-3.5 h-3.5 text-blue-600"></i>
          </div>
          <p class="text-lg font-bold text-slate-800">${c.activeOutletsMtd.toLocaleString('id-ID')}</p>
          <p class="text-[10px] text-emerald-600 font-medium mt-0.5">Aktif Order MTD</p>
        </div>

        <!-- 8. Coverage & 4 States -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Coverage</span>
            <i data-lucide="map-pin" class="w-3.5 h-3.5 text-emerald-600"></i>
          </div>
          <p class="text-lg font-bold text-slate-800">${c.coveragePct}%</p>
          <p class="text-[10px] text-slate-500 font-medium mt-0.5 truncate" title="${c.activeOutletsMtd} Aktif, ${c.dormant60dOutlets} Dormant, ${c.neverOrderedOutlets || 0} Belum Pernah Order">${c.dormant60dOutlets} Dormant • ${c.neverOrderedOutlets || 0} Belum Order</p>
        </div>
      </div>

      <!-- Middle Section: Trend, Top 5 Salesmen, and Kecamatan Coverage Map -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- Trend Penjualan & Achievement (5 cols) -->
        <div class="lg:col-span-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between overflow-hidden">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h3 class="font-bold text-slate-800 text-sm">Trend Penjualan & Achievement</h3>
              <p class="text-[11px] text-slate-500">Pergerakan Historis (${data.trendMonths && data.trendMonths.length ? data.trendMonths[0].name + ' - ' + data.trendMonths[data.trendMonths.length - 1].name + ' ' + cal.year : 'Jan - Mei 2026'})</p>
            </div>
            <span class="text-[10px] bg-slate-100 text-slate-600 px-2 py-1 rounded font-medium">Bulanan</span>
          </div>

          <!-- Interactive Proportional Bar Chart -->
          <div class="h-44 w-full flex items-end justify-between pt-2 pb-2 px-1 border-b border-slate-100 overflow-hidden">
            ${(() => {
              const maxTrendKtn = Math.max(...(data.trendMonths || []).map(m => Number(m.ktn) || 0), 100);
              return (data.trendMonths || []).map(m => {
                const ktnVal = Number(m.ktn) || 0;
                const barH = Math.max(8, Math.min(84, Math.round((ktnVal / maxTrendKtn) * 80)));
                const formattedKtn = ktnVal >= 1000 ? Math.round(ktnVal).toLocaleString('id-ID') : ktnVal.toFixed(1);
                return `
                  <div class="flex flex-col items-center flex-1 h-full justify-end px-1 group">
                    <div class="text-[10px] font-bold text-blue-600 mb-1 whitespace-nowrap">${formattedKtn}</div>
                    <div class="w-full flex items-end justify-center" style="height: 86px;">
                      <div class="w-6 md:w-7 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t-sm shadow-sm transition-all duration-300 group-hover:from-blue-500 group-hover:to-blue-300" style="height: ${barH}px;" title="${m.name}: ${ktnVal.toLocaleString('id-ID')} KTN (${m.achv}%)"></div>
                    </div>
                    <span class="text-[10px] font-semibold text-slate-600 mt-1.5">${m.name}</span>
                    <span class="text-[9px] text-emerald-600 font-bold">${m.achv}%</span>
                  </div>
                `;
              }).join('');
            })()}
          </div>
          <div class="flex items-center justify-center gap-4 text-[10px] text-slate-500 pt-2">
            <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 bg-blue-600 rounded-sm"></span> Actual KTN</span>
            <span class="flex items-center gap-1"><span class="w-2.5 h-2.5 bg-emerald-500 rounded-sm"></span> Achv %</span>
          </div>
        </div>

        <!-- Top 5 Salesman (4 cols) -->
        <div class="lg:col-span-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div class="flex items-center justify-between mb-2">
            <div>
              <h3 class="font-bold text-slate-800 text-sm">Top Salesman</h3>
              <p class="text-[11px] text-slate-500">Berdasarkan Volume & Achievement</p>
            </div>
            <button onclick="navigate('salesman')" class="text-xs text-blue-600 hover:underline font-semibold flex items-center gap-0.5">
              Lihat Semua <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>

          <div class="divide-y divide-slate-100 text-xs">
            ${data.topSalesmen.map((s, idx) => `
              <div class="py-2.5 flex items-center justify-between hover:bg-slate-50/80 px-2 rounded-lg transition cursor-pointer" onclick="navigate('salesman')">
                <div class="flex items-center gap-2.5">
                  <span class="w-5 h-5 rounded-full ${idx === 0 ? 'bg-amber-100 text-amber-700 font-extrabold' : 'bg-slate-100 text-slate-600'} text-[11px] flex items-center justify-center">
                    ${idx + 1}
                  </span>
                  <div>
                    <p class="font-bold text-slate-800">${s.salesmanName}</p>
                    <p class="text-[10px] text-slate-400">${(s.salesmanName?.includes('DSM') || s.salesGroup === 'SAVORIA_OTHERS' || s.salesGroup === 'SCM' || s.salesGroup === 'SMC' || !s.spvName) ? '—' : s.spvName} • Cov: ${s.activeOutlets}/${s.registeredOutlets} (${s.coveragePct}%)</p>
                  </div>
                </div>
                <div class="text-right">
                  <p class="font-bold text-slate-800">${s.actualCartons} KTN</p>
                  <span class="inline-block text-[10px] font-bold px-1.5 py-0.2 rounded ${s.hasTarget && s.achievementPct !== null ? (s.achievementPct >= 80 ? 'badge-success' : 'badge-warning') : 'bg-slate-100 text-slate-500'}">
                    ${s.hasTarget && s.achievementPct !== null ? s.achievementPct + '%' : 'N/A'}
                  </span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Coverage per Kecamatan Garut (4 cols) matching media_1789303707623.jpg -->
        <div class="lg:col-span-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <i data-lucide="map" class="w-4 h-4"></i>
              </div>
              <div>
                <h3 class="font-bold text-slate-800 text-sm">Coverage per Kecamatan (Garut)</h3>
                <p class="text-[11px] text-slate-400">Peta sebaran & pencapaian wilayah</p>
              </div>
            </div>
            <button onclick="openGarutMapModal(window.currentKecCoverage, window.currentCovStats)" class="text-xs text-blue-600 hover:text-blue-800 hover:underline font-semibold flex items-center gap-1 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition">
              <span>Perbesar</span> <i data-lucide="maximize-2" class="w-3 h-3"></i>
            </button>
          </div>

          <!-- Map & Legend Grid matching Mockup -->
          <div class="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center my-1 relative">
            <!-- SVG Map Canvas (7 cols) -->
            <div class="sm:col-span-7 relative flex items-center justify-center min-h-[220px] max-h-[260px] bg-slate-50/50 rounded-lg p-1.5 border border-slate-100 overflow-hidden">
              <div id="garut-map-container" class="w-full h-full flex items-center justify-center">
                <div class="text-xs text-slate-400 py-10 flex items-center gap-1.5">
                  <i data-lucide="loader-2" class="w-3.5 h-3.5 animate-spin"></i> Memuat peta Garut...
                </div>
              </div>
              <div id="map-tooltip" class="absolute hidden pointer-events-none z-20 bg-slate-900/90 text-white text-[11px] px-2.5 py-1.5 rounded-lg shadow-lg backdrop-blur-sm border border-slate-700/50">
              </div>
            </div>

            <!-- Legend & Stats (5 cols) -->
            <div class="sm:col-span-5 flex flex-col justify-between h-full space-y-2">
              <!-- Tier Legend matching media_1789303707623.jpg -->
              <div class="space-y-1 text-[11px] text-slate-600">
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block shrink-0"></span> ≥ 80%</span>
                  <span class="font-bold text-slate-700" id="legend-count-80">0 kec</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-green-400 inline-block shrink-0"></span> 60 – 79%</span>
                  <span class="font-bold text-slate-700" id="legend-count-60">0 kec</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block shrink-0"></span> 40 – 59%</span>
                  <span class="font-bold text-slate-700" id="legend-count-40">0 kec</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-orange-400 inline-block shrink-0"></span> 20 – 39%</span>
                  <span class="font-bold text-slate-700" id="legend-count-20">0 kec</span>
                </div>
                <div class="flex items-center justify-between">
                  <span class="flex items-center gap-1.5"><span class="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block shrink-0"></span> &lt; 20%</span>
                  <span class="font-bold text-slate-700" id="legend-count-0">0 kec</span>
                </div>
                <div class="flex items-center justify-between pt-0.5 border-t border-slate-100">
                  <span class="flex items-center gap-1.5 text-slate-400"><span class="w-2.5 h-2.5 rounded-full bg-slate-200 inline-block shrink-0"></span> Belum ada outlet</span>
                  <span class="font-medium text-slate-400" id="legend-count-empty">0 kec</span>
                </div>
              </div>

              <!-- Live Hover / Selection Detail Panel -->
              <div id="map-hover-detail" class="bg-blue-50/60 p-2 rounded-lg border border-blue-100/80 text-left">
                <p class="text-[10px] uppercase tracking-wider text-blue-600 font-bold" id="map-detail-title">Sorot / Klik Wilayah</p>
                <p class="text-xs font-bold text-slate-800 truncate" id="map-detail-name">Kabupaten Garut</p>
                <div class="flex items-center justify-between text-[11px] text-slate-600 mt-0.5" id="map-detail-stats">
                  <span>${c.registeredOutlets.toLocaleString('id-ID')} Outlet</span>
                  <span class="font-bold text-blue-700">${c.coveragePct}% Cov</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Bottom Totals matching Mockup -->
          <div class="mt-2 pt-2 border-t border-slate-100 grid grid-cols-2 gap-2 text-left">
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <i data-lucide="store" class="w-4 h-4"></i>
              </div>
              <div>
                <p class="text-[10px] text-slate-400 font-medium leading-none">Total Outlet</p>
                <p class="font-bold text-slate-800 text-sm mt-0.5">${c.registeredOutlets.toLocaleString('id-ID')}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <div class="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <i data-lucide="pie-chart" class="w-4 h-4"></i>
              </div>
              <div>
                <p class="text-[10px] text-slate-400 font-medium leading-none">Coverage</p>
                <p class="font-bold text-emerald-700 text-sm mt-0.5">${c.coveragePct}%</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Lower Section: Performa Produk (KTN) & Must Have Progress -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- Performa Produk (KTN Table - 7 cols) -->
        <div class="lg:col-span-7 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between mb-3">
            <div>
              <h3 class="font-bold text-slate-800 text-sm">Performa Komponen Insentif (KTN & Nilai)</h3>
              <p class="text-[11px] text-slate-500">Evaluasi pencapaian 6 komponen insentif operasional Garut</p>
            </div>
            <span class="text-[11px] bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 rounded">Mei 2026</span>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-slate-50 text-slate-600 font-semibold border-y border-slate-200">
                <tr>
                  <th class="py-2 px-3">#</th>
                  <th class="py-2 px-3">Komponen</th>
                  <th class="py-2 px-3 text-right">Target</th>
                  <th class="py-2 px-3 text-right">Actual</th>
                  <th class="py-2 px-3 text-right">Achv %</th>
                  <th class="py-2 px-3 text-right">Gap</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-medium">
                <tr class="hover:bg-slate-50">
                  <td class="py-2 px-3 text-slate-400">1</td>
                  <td class="py-2 px-3 font-bold text-slate-800">Kopi (Qty)</td>
                  <td class="py-2 px-3 text-right">4.100 KTN</td>
                  <td class="py-2 px-3 text-right font-bold text-blue-600">2.850 KTN</td>
                  <td class="py-2 px-3 text-right font-bold text-emerald-600">69,5%</td>
                  <td class="py-2 px-3 text-right text-rose-600">-1.250</td>
                </tr>
                <tr class="hover:bg-slate-50">
                  <td class="py-2 px-3 text-slate-400">2</td>
                  <td class="py-2 px-3 font-bold text-slate-800">Beverage (Qty)</td>
                  <td class="py-2 px-3 text-right">2.900 KTN</td>
                  <td class="py-2 px-3 text-right font-bold text-blue-600">1.980 KTN</td>
                  <td class="py-2 px-3 text-right font-bold text-emerald-600">68,3%</td>
                  <td class="py-2 px-3 text-right text-rose-600">-920</td>
                </tr>
                <tr class="hover:bg-slate-50">
                  <td class="py-2 px-3 text-slate-400">3</td>
                  <td class="py-2 px-3 font-bold text-slate-800">Non Kopi & Non Bvg (Qty)</td>
                  <td class="py-2 px-3 text-right">2.750 KTN</td>
                  <td class="py-2 px-3 text-right font-bold text-blue-600">1.620 KTN</td>
                  <td class="py-2 px-3 text-right font-bold text-amber-600">58,9%</td>
                  <td class="py-2 px-3 text-right text-rose-600">-1.130</td>
                </tr>
                <tr class="hover:bg-slate-50">
                  <td class="py-2 px-3 text-slate-400">4</td>
                  <td class="py-2 px-3 font-bold text-slate-800">Value - All (Rp)</td>
                  <td class="py-2 px-3 text-right">Rp 5.250 Jt</td>
                  <td class="py-2 px-3 text-right font-bold text-blue-600">Rp 3.820 Jt</td>
                  <td class="py-2 px-3 text-right font-bold text-emerald-600">72,8%</td>
                  <td class="py-2 px-3 text-right text-rose-600">-1.430 Jt</td>
                </tr>
                <tr class="hover:bg-slate-50">
                  <td class="py-2 px-3 text-slate-400">5</td>
                  <td class="py-2 px-3 font-bold text-slate-800">OC Must Have SKU (Qty)</td>
                  <td class="py-2 px-3 text-right">1.250 Outlet</td>
                  <td class="py-2 px-3 text-right font-bold text-blue-600">890 Outlet</td>
                  <td class="py-2 px-3 text-right font-bold text-emerald-600">71,2%</td>
                  <td class="py-2 px-3 text-right text-rose-600">-360</td>
                </tr>
                <tr class="hover:bg-slate-50 bg-slate-50/50">
                  <td class="py-2 px-3 text-slate-400">6</td>
                  <td class="py-2 px-3 font-bold text-slate-600">AR Performance (%)</td>
                  <td class="py-2 px-3 text-right text-slate-400">70%</td>
                  <td class="py-2 px-3 text-right text-slate-400">58%</td>
                  <td class="py-2 px-3 text-right font-bold text-slate-400">TBD</td>
                  <td class="py-2 px-3 text-right text-slate-400">Formula TBD</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Must Have Tracker (5 cols) -->
        <div class="lg:col-span-5 bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <div class="flex items-center justify-between mb-2">
            <div>
              <h3 class="font-bold text-slate-800 text-sm">Must Have Tracker (Coverage Outlet)</h3>
              <p class="text-[11px] text-slate-500">Target penetrasi lini fokus vs realisasi outlet aktif</p>
            </div>
            <button onclick="navigate('program')" class="text-xs text-blue-600 hover:underline font-semibold">Detail</button>
          </div>

          <div class="space-y-3 my-auto">
            ${data.mustHave.map(m => `
              <div class="p-2 bg-slate-50 rounded-lg border border-slate-100">
                <div class="flex justify-between items-center text-xs mb-1">
                  <span class="font-bold text-slate-800">${m.lineCode}</span>
                  <span class="text-[11px] text-slate-500">Target: <strong class="text-blue-600">${m.targetPenetrationPct}%</strong> (${m.targetOc} Toko)</span>
                </div>
                <div class="flex justify-between items-center text-[10px] text-slate-500 mb-1">
                  <span>Realisasi: <strong class="text-slate-700">${m.actualPenetrationPct}%</strong> (${m.actualOc} Toko)</span>
                  <span class="font-bold ${m.progressToTargetPct >= 100 ? 'text-emerald-600' : 'text-amber-600'}">Progres: ${m.progressToTargetPct}%</span>
                </div>
                <div class="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                  <div class="h-2 rounded-full ${m.progressToTargetPct >= 100 ? 'bg-emerald-500' : 'bg-blue-600'}" style="width: ${Math.min(m.progressToTargetPct, 100)}%;"></div>
                </div>
              </div>
            `).join('')}
          </div>

          <div class="pt-2 border-t border-slate-100 text-[11px] text-slate-500 flex justify-between">
            <span>Standar Penetrasi: KTG 45%, DELI 45%, RTD 30%</span>
            <span class="font-bold text-blue-600">Terpenuhi 4/5 Lini</span>
          </div>
        </div>
      </div>

      <!-- Bottom Row: Pace Hari Kerja, Ringkasan Insentif, NPL, Peringatan Stock -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Pace Hari Kerja -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5"><i data-lucide="calendar" class="w-3.5 h-3.5 text-blue-500"></i> Pace Hari Kerja</span>
            <span class="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded font-bold">${cal.timeRatePct}% Berjalan</span>
          </div>
          <div class="grid grid-cols-3 gap-2 text-center py-2 bg-slate-50 rounded-lg my-2">
            <div>
              <p class="text-slate-400 text-[10px]">HK</p>
              <p class="text-sm font-bold text-slate-800">${cal.totalHk}</p>
            </div>
            <div>
              <p class="text-slate-400 text-[10px]">HKE</p>
              <p class="text-sm font-bold text-blue-600">${cal.asOfHke}</p>
            </div>
            <div>
              <p class="text-slate-400 text-[10px]">Sisa HK</p>
              <p class="text-sm font-bold text-rose-600">${cal.remainingHk}</p>
            </div>
          </div>
          <div class="flex justify-between text-xs pt-1">
            <span class="text-slate-500">Gap / Hari:</span>
            <span class="font-bold text-rose-600">${s.gapDailyPace} KTN/hari</span>
          </div>
          <div class="flex justify-between text-xs pt-0.5">
            <span class="text-slate-500">LE Projection:</span>
            <span class="font-bold text-emerald-600">${s.latestEstimateAchvPct}% (${s.latestEstimateCartons} KTN)</span>
          </div>
        </div>

        <!-- Ringkasan Insentif (Estimasi) -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5"><i data-lucide="coins" class="w-3.5 h-3.5 text-amber-500"></i> Ringkasan Insentif</span>
            <span class="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">+12% vs lalu</span>
          </div>
          <p class="text-xl font-extrabold text-slate-800 mt-2">Rp ${data.totalIncentiveEstimated.toLocaleString('id-ID')}</p>
          <p class="text-[11px] text-slate-500 mb-2">Estimasi payout tim salesman MTD</p>
          <div class="w-full bg-slate-100 rounded-full h-2 overflow-hidden mb-2">
            <div class="bg-gradient-to-r from-amber-400 to-emerald-500 h-2 rounded-full" style="width: 68%;"></div>
          </div>
          <div class="flex justify-between text-[11px] text-slate-500">
            <span>68,8% dari total mangkok</span>
            <button onclick="navigate('salesman')" class="text-blue-600 font-bold hover:underline">Detail Insentif</button>
          </div>
        </div>

        <!-- NPL (Piutang) -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5"><i data-lucide="receipt" class="w-3.5 h-3.5 text-purple-500"></i> NPL & Piutang</span>
            <button onclick="navigate('stock')" class="text-[10px] text-blue-600 font-semibold hover:underline">Detail AR</button>
          </div>
          <div class="space-y-2 mt-2">
            <div class="flex justify-between items-center text-xs">
              <span class="text-slate-500">Total Piutang:</span>
              <span class="font-bold text-slate-800">Rp ${data.arSummary.totalPiutangJt} Jt</span>
            </div>
            <div class="flex justify-between items-center text-xs">
              <span class="text-slate-500">NPL > 90 Hari:</span>
              <span class="font-bold text-rose-600">Rp ${data.arSummary.nplOver90dJt} Jt (${data.arSummary.nplPct}%)</span>
            </div>
            <div class="p-2 bg-rose-50 rounded-lg text-[11px] text-rose-700 border border-rose-100 mt-1">
              Perhatian: 4 outlet menunggak pembayaran > 60 hari.
            </div>
          </div>
        </div>

        <!-- Peringatan Stock -->
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs font-bold text-slate-800 flex items-center gap-1.5"><i data-lucide="alert-triangle" class="w-3.5 h-3.5 text-rose-500"></i> Peringatan Stock</span>
            <button onclick="navigate('stock')" class="text-[10px] text-blue-600 font-semibold hover:underline">Lihat Gudang</button>
          </div>
          <div class="space-y-1.5 mt-1 text-xs">
            ${data.stockWarnings.map(w => `
              <div class="flex items-center justify-between py-1 border-b border-slate-100 last:border-0">
                <span class="truncate max-w-[130px] font-medium text-slate-700" title="${w.item_name}">${w.item_name}</span>
                <span class="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${w.status === 'Habis stock' ? 'badge-danger' : 'badge-warning'}">
                  ${w.status} (${w.available_stock_ctn} ktn)
                </span>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    main.innerHTML = html;
    lucide.createIcons();

    // Render Garut Choropleth SVG Map (media_1789303707623.jpg)
    window.currentKecCoverage = data.kecamatanCoverage;
    window.currentCovStats = c;
    await renderGarutChoropleth('garut-map-container', 'map-tooltip', data.kecamatanCoverage, c);

    // Populate alert bell dropdown
    const alertsList = document.getElementById('alerts-list');
    if (alertsList && data.insights) {
      alertsList.innerHTML = data.insights.map(ins => `
        <div class="p-2 rounded-lg ${ins.level === 'DANGER' ? 'bg-rose-50 text-rose-800 border border-rose-100' : 'bg-slate-50 text-slate-800 border border-slate-100'}">
          <p class="font-bold text-[11px]">${ins.title}</p>
          <p class="text-[10px] mt-0.5">${ins.message}</p>
        </div>
      `).join('');
    }
  } catch (err) {
    main.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl border border-rose-200">Gagal memuat Beranda: ${err.message}</div>`;
  }
}

// ==============================================================
// 2. OUTLET 360 & CUSTOMER INTELLIGENCE (media_1789300944198.jpg)
// ==============================================================
let outletStatusFilter = 'all';
let outletSortKey = 'name';
let outletSortDir = 'asc';

async function filterOutletStatus(status) {
  outletStatusFilter = status;
  await renderOutlet();
}

function toggleOutletSort(key) {
  if (outletSortKey === key) {
    outletSortDir = outletSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    outletSortKey = key;
    outletSortDir = 'asc';
  }
  renderOutlet();
}

async function renderOutlet() {
  const main = document.getElementById('main-content');
  try {
    const q = new URLSearchParams(getFilterQuery());
    if (outletStatusFilter && outletStatusFilter !== 'all') q.set('status', outletStatusFilter);
    if (window.globalOutletSearch) q.set('search', window.globalOutletSearch);

    const activeProdFilters = [];
    if (globalFilters.principal) activeProdFilters.push(`Principal: ${globalFilters.principal}`);
    if (globalFilters.brand) activeProdFilters.push(`Brand: ${globalFilters.brand}`);
    if (globalFilters.subbrand) activeProdFilters.push(`Subbrand: ${globalFilters.subbrand}`);
    if (globalFilters.groupSku) activeProdFilters.push(`Group SKU: ${globalFilters.groupSku}`);
    if (globalFilters.salesGroup) activeProdFilters.push(`Sales Group: ${globalFilters.salesGroup}`);

    const res = await fetch(`/api/outlets?${q.toString()}`);
    const data = await res.json();

    // Synchronize top header search input with active search term
    const topSearchInput = document.getElementById('global-search');
    if (topSearchInput && window.globalOutletSearch !== undefined) {
      if (topSearchInput.value !== window.globalOutletSearch) {
        topSearchInput.value = window.globalOutletSearch;
      }
      const clearBtn = document.getElementById('global-search-clear-btn');
      if (clearBtn) {
        if (window.globalOutletSearch) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
      }
    }

    const sortIcon = (col) => {
      if (outletSortKey !== col) return `<span class="text-slate-300 ml-1 font-normal">⇅</span>`;
      return outletSortDir === 'asc' ? `<span class="text-blue-600 ml-1 font-bold">▲</span>` : `<span class="text-blue-600 ml-1 font-bold">▼</span>`;
    };

    const sortedOutlets = sortDataRows(data.outlets || [], outletSortKey, outletSortDir);

    let html = `
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-slate-800 tracking-tight">Outlet 360 & Customer Intelligence</h2>
          <p class="text-xs text-slate-500">Lihat performa, potensi, dan peluang di setiap outlet untuk mendorong pertumbuhan penjualan.</p>
        </div>
        <div class="flex items-center gap-2">
          <button onclick="openGarutMapModal(window.currentKecCoverage, window.currentCovStats)" class="text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-3 py-1.5 rounded-lg shadow-sm flex items-center gap-1.5 transition">
            <i data-lucide="map" class="w-3.5 h-3.5"></i>
            <span>Peta Wilayah</span>
          </button>
          <span class="text-xs font-bold text-slate-700 bg-white px-3.5 py-1.5 rounded-lg border border-slate-200 shadow-sm">
            Menampilkan <span class="text-blue-600">${data.currentPageCount}</span> dari <span class="text-slate-900">${data.filteredCount}</span> outlet <span class="text-slate-400 font-normal">(Total Universe: ${data.totalUniverse.toLocaleString('id-ID')} CL)</span>
          </span>
        </div>
      </div>

      <!-- Filter status tabs -->
      <div class="flex flex-wrap items-center gap-2 text-xs">
        <button onclick="filterOutletStatus('all')" class="px-3 py-1.5 rounded-lg font-semibold transition ${outletStatusFilter === 'all' ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'}">
          Semua Outlet
        </button>
        <button onclick="filterOutletStatus('ACTIVE')" class="px-3 py-1.5 rounded-lg font-semibold transition ${outletStatusFilter === 'ACTIVE' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'}">
          Aktif MTD
        </button>
        <button onclick="filterOutletStatus('INACTIVE_MTD')" class="px-3 py-1.5 rounded-lg font-semibold transition ${outletStatusFilter === 'INACTIVE_MTD' ? 'bg-amber-500 text-white shadow-sm' : 'bg-white text-amber-700 border border-amber-200 hover:bg-amber-50'}">
          Inaktif MTD (<60 Hari)
        </button>
        <button onclick="filterOutletStatus('DORMANT_60D')" class="px-3 py-1.5 rounded-lg font-semibold transition ${outletStatusFilter === 'DORMANT_60D' ? 'bg-rose-600 text-white shadow-sm' : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'}">
          Dormant (>60 Hari)
        </button>
        <button onclick="filterOutletStatus('NEVER_ORDERED')" class="px-3 py-1.5 rounded-lg font-semibold transition ${outletStatusFilter === 'NEVER_ORDERED' ? 'bg-slate-700 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-300 hover:bg-slate-100'}">
          Belum Pernah Order
        </button>
      </div>

      <!-- Outlets Grid / Directory -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 class="font-bold text-sm text-slate-800">Daftar Pelanggan (Customer Directory)</h3>
            <div class="text-xs text-slate-500">Klik outlet untuk membuka lembar analisis lengkap <strong>Outlet 360</strong></div>
          </div>

          <!-- Inline Search Input in Customer Directory -->
          <div class="flex items-center gap-2">
            <div class="relative w-64 sm:w-72">
              <i data-lucide="search" class="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"></i>
              <input
                type="text"
                id="table-outlet-search-input"
                value="${escapeHtml(window.globalOutletSearch || '')}"
                oninput="handleTableOutletSearch(event)"
                placeholder="Cari toko / kode outlet..."
                class="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-8 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
              />
              ${window.globalOutletSearch ? `
                <button type="button" onclick="clearGlobalSearch()" class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-600 transition" title="Hapus pencarian">
                  <i data-lucide="x-circle" class="w-3.5 h-3.5"></i>
                </button>
              ` : ''}
            </div>
          </div>
        </div>

        ${window.globalOutletSearch ? `
          <div class="px-4 py-2 bg-blue-50/70 border-b border-blue-100 flex items-center justify-between text-xs text-blue-900">
            <span>Hasil pencarian untuk: <strong class="text-blue-950 font-bold">"${escapeHtml(window.globalOutletSearch)}"</strong> (${data.filteredCount} outlet ditemukan)</span>
            <button onclick="clearGlobalSearch()" class="text-blue-700 hover:text-blue-900 font-bold underline text-[11px] flex items-center gap-1">
              <i data-lucide="rotate-ccw" class="w-3 h-3"></i>
              <span>Reset Pencarian</span>
            </button>
          </div>
        ` : ''}

        ${activeProdFilters.length > 0 ? `
          <div class="px-4 py-2 bg-indigo-50/80 border-b border-indigo-100 flex items-center justify-between text-xs text-indigo-900">
            <span class="flex items-center gap-1.5">
              <i data-lucide="filter" class="w-3.5 h-3.5 text-indigo-600"></i>
              <span>Filter Produk Aktif: <strong class="text-indigo-950 font-bold">${escapeHtml(activeProdFilters.join(' • '))}</strong> (Data penjualan Jan-Sep & status disesuaikan produk)</span>
            </span>
            <button onclick="resetProductFilters()" class="text-indigo-700 hover:text-indigo-950 font-bold underline text-[11px] flex items-center gap-1">
              <i data-lucide="x" class="w-3 h-3"></i>
              <span>Hapus Filter Produk</span>
            </button>
          </div>
        ` : ''}

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs">
            <thead class="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 select-none">
              <tr>
                <th onclick="toggleOutletSort('name')" class="py-3 px-4 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">Nama Outlet ${sortIcon('name')}</th>
                <th onclick="toggleOutletSort('salesmanName')" class="py-3 px-4 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">Salesman ${sortIcon('salesmanName')}</th>
                <th onclick="toggleOutletSort('rayon')" class="py-3 px-4 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">Rayon ${sortIcon('rayon')}</th>
                <th onclick="toggleOutletSort('kecamatan')" class="py-3 px-4 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">Kecamatan ${sortIcon('kecamatan')}</th>
                <th onclick="toggleOutletSort('cluster')" class="py-3 px-4 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">Cluster ${sortIcon('cluster')}</th>
                <th class="py-3 px-2 text-right whitespace-nowrap font-semibold">Jan</th>
                <th class="py-3 px-2 text-right whitespace-nowrap font-semibold">Feb</th>
                <th class="py-3 px-2 text-right whitespace-nowrap font-semibold">Mar</th>
                <th class="py-3 px-2 text-right whitespace-nowrap font-semibold">Apr</th>
                <th class="py-3 px-2 text-right whitespace-nowrap font-semibold">Mei</th>
                <th class="py-3 px-2 text-right whitespace-nowrap font-semibold">Jun</th>
                <th class="py-3 px-2 text-right whitespace-nowrap font-semibold">Jul</th>
                <th class="py-3 px-2 text-right whitespace-nowrap font-semibold">Agu</th>
                <th class="py-3 px-2 text-right whitespace-nowrap font-bold bg-blue-50/60 text-blue-900">Sep</th>
                <th class="py-3 px-3 text-right whitespace-nowrap font-bold bg-indigo-50/70 text-indigo-900">Avg 3 Bln</th>
                <th class="py-3 px-3 text-right whitespace-nowrap font-bold bg-purple-50/70 text-purple-900">Avg 6 Bln</th>
                <th onclick="toggleOutletSort('status')" class="py-3 px-4 text-center cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">Status ${sortIcon('status')}</th>
                <th onclick="toggleOutletSort('daysSinceLastOrder')" class="py-3 px-4 text-right cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">Hari Sejak Order ${sortIcon('daysSinceLastOrder')}</th>
                <th class="py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-medium">
              ${sortedOutlets.length === 0 ? `
                <tr>
                  <td colspan="19" class="py-12 text-center text-slate-500">
                    <div class="flex flex-col items-center justify-center gap-2 max-w-sm mx-auto">
                      <div class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                        <i data-lucide="search-x" class="w-6 h-6"></i>
                      </div>
                      <p class="font-bold text-slate-800 text-sm">Tidak ada outlet yang sesuai</p>
                      <p class="text-xs text-slate-500">
                        ${window.globalOutletSearch ? `Tidak ditemukan outlet dengan kata kunci "${escapeHtml(window.globalOutletSearch)}".` : 'Tidak ada data outlet untuk filter yang dipilih.'}
                      </p>
                      ${window.globalOutletSearch ? `
                        <button onclick="clearGlobalSearch()" class="mt-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm">
                          Reset Pencarian
                        </button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              ` : sortedOutlets.map(o => `
                <tr class="hover:bg-blue-50/50 transition cursor-pointer" onclick="openOutlet360('${o.outletId}')">
                  <td class="py-3 px-4">
                    <div class="flex items-center gap-2.5">
                      <div class="w-7 h-7 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                        <i data-lucide="store" class="w-3.5 h-3.5"></i>
                      </div>
                      <div>
                        <p class="font-bold text-slate-800">${o.name}</p>
                        <p class="text-[10px] text-slate-400 font-mono">${o.outletId}</p>
                      </div>
                    </div>
                  </td>
                  <td class="py-3 px-4 text-slate-700">${o.salesmanName}</td>
                  <td class="py-3 px-4 font-bold text-blue-600">${o.rayon}</td>
                  <td class="py-3 px-4 text-slate-600">${o.kecamatan}</td>
                  <td class="py-3 px-4"><span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[10px]">${o.cluster}</span></td>
                  <td class="py-3 px-2 text-right font-mono text-slate-600">${(o.monthlySales?.m1 || 0).toLocaleString('id-ID')}</td>
                  <td class="py-3 px-2 text-right font-mono text-slate-600">${(o.monthlySales?.m2 || 0).toLocaleString('id-ID')}</td>
                  <td class="py-3 px-2 text-right font-mono text-slate-600">${(o.monthlySales?.m3 || 0).toLocaleString('id-ID')}</td>
                  <td class="py-3 px-2 text-right font-mono text-slate-600">${(o.monthlySales?.m4 || 0).toLocaleString('id-ID')}</td>
                  <td class="py-3 px-2 text-right font-mono text-slate-600">${(o.monthlySales?.m5 || 0).toLocaleString('id-ID')}</td>
                  <td class="py-3 px-2 text-right font-mono text-slate-600">${(o.monthlySales?.m6 || 0).toLocaleString('id-ID')}</td>
                  <td class="py-3 px-2 text-right font-mono text-slate-600">${(o.monthlySales?.m7 || 0).toLocaleString('id-ID')}</td>
                  <td class="py-3 px-2 text-right font-mono text-slate-600">${(o.monthlySales?.m8 || 0).toLocaleString('id-ID')}</td>
                  <td class="py-3 px-2 text-right font-mono font-bold text-blue-700 bg-blue-50/30">${(o.monthlySales?.m9 || 0).toLocaleString('id-ID')}</td>
                  <td class="py-3 px-3 text-right font-mono font-extrabold text-indigo-700 bg-indigo-50/40">${(o.avgLast3Months || 0).toLocaleString('id-ID')}</td>
                  <td class="py-3 px-3 text-right font-mono font-extrabold text-purple-700 bg-purple-50/40">${(o.avgLast6Months || 0).toLocaleString('id-ID')}</td>
                  <td class="py-3 px-4 text-center">
                    <span class="px-2 py-0.5 rounded text-[10px] font-bold ${o.stateCode === 'ACTIVE' ? 'badge-success' : (o.stateCode === 'DORMANT_60D' ? 'badge-danger' : (o.stateCode === 'INACTIVE_MTD' ? 'badge-warning' : 'bg-slate-200 text-slate-700'))}">
                      ${o.status}
                    </span>
                  </td>
                  <td class="py-3 px-4 text-right font-bold ${o.daysSinceLastOrder !== null && o.daysSinceLastOrder >= 60 ? 'text-rose-600' : 'text-slate-800'}">
                    ${o.daysSinceLastOrder === null ? '<span class="text-slate-400 italic font-normal">Belum pernah order</span>' : o.daysSinceLastOrder + ' hari'}
                  </td>
                  <td class="py-3 px-4 text-right">
                    <button class="px-2.5 py-1 bg-blue-600 text-white rounded text-[11px] font-semibold hover:bg-blue-700 transition">
                      Buka 360
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;

    main.innerHTML = html;
    lucide.createIcons();
  } catch (err) {
    main.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Gagal memuat daftar outlet: ${err.message}</div>`;
  }
}

// Modal Dialog for Outlet 360 (Exact match to media_1789300944198.jpg)
async function openOutlet360(outletId) {
  const modal = document.getElementById('modal-container');
  const modalContent = document.getElementById('modal-content');
  modal.classList.remove('hidden');

  modalContent.innerHTML = `<div class="text-center py-20 text-slate-500"><i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto mb-2 text-blue-600"></i>Memuat profil Outlet 360...</div>`;
  lucide.createIcons();

  try {
    const res = await fetch(`/api/outlets/${outletId}/360`);
    const o = await res.json();
    const idn = o.identity;
    const sm = o.summaryMetrics;

    modalContent.innerHTML = `
      <!-- Close Button -->
      <button onclick="closeModal()" class="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>

      <!-- Outlet 360 Header -->
      <div class="flex items-start gap-4 pb-4 border-b border-slate-200">
        <div class="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center flex-shrink-0">
          <i data-lucide="store" class="w-8 h-8"></i>
        </div>
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2.5">
            <h2 class="text-xl font-bold text-slate-800 truncate">${idn.canonicalName}</h2>
            <span class="badge-success text-xs font-bold px-2.5 py-0.5 rounded-full">${idn.status}</span>
          </div>
          <div class="flex items-center gap-2 text-xs text-slate-500 mt-1">
            <span class="font-mono text-slate-700 font-semibold">ID: ${idn.outletId}</span>
            <span>•</span>
            <span>Alias: ${idn.aliases.join(', ') || idn.canonicalName}</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(idn.canonicalName + ' ' + (idn.address || idn.kecamatan) + ' Garut')}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold rounded-lg hover:bg-emerald-100 transition flex items-center gap-1 shadow-sm">
            <i data-lucide="map-pin" class="w-3.5 h-3.5"></i> Maps
          </a>
          <button class="px-3 py-1.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 transition">Bagikan</button>
          <button class="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition flex items-center gap-1 shadow-sm">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i> Buat Kunjungan
          </button>
        </div>
      </div>

      <!-- Info Chips Grid -->
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 py-4 border-b border-slate-100 text-xs">
        <div>
          <span class="text-slate-400 text-[10px] block">Salesman</span>
          <span class="font-bold text-slate-800">${idn.salesmanName}</span>
        </div>
        <div>
          <span class="text-slate-400 text-[10px] block">Rayon / Beat</span>
          <span class="font-bold text-blue-600">${idn.rayon}</span>
        </div>
        <div>
          <span class="text-slate-400 text-[10px] block">Kecamatan</span>
          <span class="font-bold text-slate-800">${idn.kecamatan}</span>
        </div>
        <div>
          <span class="text-slate-400 text-[10px] block">Tipe Outlet</span>
          <span class="font-bold text-slate-800">${idn.tipeOutlet}</span>
        </div>
        <div>
          <span class="text-slate-400 text-[10px] block">Status Kredit</span>
          <span class="font-bold text-emerald-600">${idn.statusKredit}</span>
        </div>
        <div>
          <span class="text-slate-400 text-[10px] block">Limit Kredit / TOP</span>
          <span class="font-bold text-slate-800">Rp ${(idn.limitKredit / 1000000).toFixed(0)} Jt (${idn.topDays} hr)</span>
        </div>
      </div>

      <!-- Summary Metrics & Recommendations Row -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 my-4">
        <!-- Tren Penjualan -->
        <div class="lg:col-span-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <span class="text-[11px] text-slate-500 font-medium">Tren Penjualan (3 Bln)</span>
          <p class="text-lg font-bold text-slate-800 mt-1">Rp ${sm.trenPenjualanJt} Jt</p>
          <span class="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5"><i data-lucide="trending-up" class="w-3 h-3"></i> +${sm.trenPenjualanGrowthPct}% vs lalu</span>
          <div class="h-16 flex items-end justify-between pt-2 gap-1 border-b border-slate-200 mt-1">
            <div class="w-2 bg-blue-300 rounded-t h-8"></div>
            <div class="w-2 bg-blue-300 rounded-t h-10"></div>
            <div class="w-2 bg-blue-300 rounded-t h-12"></div>
            <div class="w-2 bg-blue-500 rounded-t h-14"></div>
          </div>
        </div>

        <!-- Frekuensi Order -->
        <div class="lg:col-span-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <span class="text-[11px] text-slate-500 font-medium">Frekuensi Order</span>
          <p class="text-lg font-bold text-slate-800 mt-1">${sm.frekuensiOrderBulan} kali/bulan</p>
          <span class="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5"><i data-lucide="trending-up" class="w-3 h-3"></i> +20% stabil</span>
          <div class="h-16 flex items-end justify-between pt-2 gap-1 border-b border-slate-200 mt-1">
            <div class="w-2 bg-emerald-300 rounded-t h-6"></div>
            <div class="w-2 bg-emerald-300 rounded-t h-9"></div>
            <div class="w-2 bg-emerald-300 rounded-t h-11"></div>
            <div class="w-2 bg-emerald-500 rounded-t h-14"></div>
          </div>
        </div>

        <!-- Rata-rata Nilai Drop -->
        <div class="lg:col-span-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <span class="text-[11px] text-slate-500 font-medium">Rata-rata Nilai Drop</span>
          <p class="text-lg font-bold text-slate-800 mt-1">Rp ${sm.rataRataDropJt} Jt</p>
          <span class="text-[10px] font-bold text-rose-600 flex items-center gap-0.5"><i data-lucide="trending-down" class="w-3 h-3"></i> -7% drop</span>
          <div class="h-16 flex items-end justify-between pt-2 gap-1 border-b border-slate-200 mt-1">
            <div class="w-2 bg-purple-300 rounded-t h-14"></div>
            <div class="w-2 bg-purple-300 rounded-t h-12"></div>
            <div class="w-2 bg-purple-300 rounded-t h-11"></div>
            <div class="w-2 bg-purple-500 rounded-t h-10"></div>
          </div>
        </div>

        <!-- Insight & Rekomendasi (4 cols) -->
        <div class="lg:col-span-4 bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm text-xs">
          <div class="flex items-center gap-1.5 font-bold text-slate-800 mb-2">
            <i data-lucide="sparkles" class="w-4 h-4 text-amber-500"></i> Insight & Rekomendasi
          </div>
          <div class="space-y-2">
            ${o.recommendations.map(r => `
              <div class="p-2 rounded-lg ${r.type === 'SUCCESS' ? 'bg-emerald-50 text-emerald-800' : (r.type === 'WARNING' ? 'bg-rose-50 text-rose-800' : 'bg-blue-50 text-blue-800')} text-[11px]">
                <p class="font-bold">${r.title}</p>
                <p class="text-[10px] mt-0.5">${r.desc}</p>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- Second Row: Product Mix, Top 5 SKU, Must Have & AR Overdue -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 my-4">
        <!-- Product Mix (4 cols) -->
        <div class="lg:col-span-4 bg-white p-3.5 rounded-xl border border-slate-200 text-xs">
          <h4 class="font-bold text-slate-800 mb-2">Product Mix (Brand)</h4>
          <div class="space-y-2 mt-3">
            ${o.productMix.map(p => `
              <div>
                <div class="flex justify-between text-[11px] mb-1">
                  <span class="text-slate-600">${p.name}</span>
                  <span class="font-bold text-slate-800">${p.pct}%</span>
                </div>
                <div class="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                  <div class="h-2 rounded-full" style="width: ${p.pct}%; background-color: ${p.color}"></div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Top 5 SKU (4 cols) -->
        <div class="lg:col-span-4 bg-white p-3.5 rounded-xl border border-slate-200 text-xs">
          <h4 class="font-bold text-slate-800 mb-2">Top SKU Dibeli</h4>
          <div class="divide-y divide-slate-100">
            ${o.topSkus.map(s => `
              <div class="py-1.5 flex items-center justify-between">
                <span class="truncate max-w-[170px] text-slate-700">${s.sku}</span>
                <span class="font-bold text-slate-800">Rp ${s.penjualanJt} Jt</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Must Have & AR Status (4 cols) -->
        <div class="lg:col-span-4 bg-white p-3.5 rounded-xl border border-slate-200 text-xs flex flex-col justify-between">
          <div>
            <h4 class="font-bold text-slate-800 mb-2">Must Have & Penetrasi</h4>
            <div class="p-3 bg-blue-50 rounded-xl text-center">
              <span class="text-2xl font-bold text-blue-700">${o.mustHave.tersediaCount} / ${o.mustHave.totalTargetCount}</span>
              <p class="text-[11px] text-blue-600 font-medium">SKU Must Have Tersedia (${o.mustHave.penetrationPct}%)</p>
            </div>
          </div>

          <div class="pt-3 border-t border-slate-100">
            <h4 class="font-bold text-slate-800 mb-1">Piutang / AR Status</h4>
            <div class="flex justify-between text-[11px]">
              <span class="text-slate-500">Total Piutang:</span>
              <span class="font-bold text-slate-800">Rp ${(o.arOverdue.totalAr / 1000000).toFixed(1)} Jt</span>
            </div>
            <div class="flex justify-between text-[11px]">
              <span class="text-slate-500">Overdue:</span>
              <span class="font-bold text-rose-600">Rp ${(o.arOverdue.overdue / 1000000).toFixed(1)} Jt (${o.arOverdue.overduePct}%)</span>
            </div>
          </div>
        </div>
      </div>
    `;
    lucide.createIcons();
  } catch (err) {
    modalContent.innerHTML = `<div class="p-6 text-rose-600">Gagal memuat outlet: ${err.message}</div>`;
  }
}

function closeModal() {
  const mc = document.getElementById('modal-container');
  if (mc) mc.classList.add('hidden');
  const am = document.getElementById('app-modal');
  if (am) am.classList.add('hidden');
}

// Global Escape listener to close modals
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

// ==============================================================
// 3. DATA CENTER — IMPORT EXCEL WIZARD (media_1789300934965.jpg)
// ==============================================================
let stagedUpload = null;
window.activeDataCenterCategory = window.activeDataCenterCategory || 'TRANSACTIONS';
window.activeDataCenterSubView = window.activeDataCenterSubView || 'import'; // 'import' or 'users'

const DATACENTER_CATEGORIES = {
  TRANSACTIONS: {
    name: 'Sales Transaction',
    desc: 'Data Penjualan Field',
    icon: 'file-spreadsheet',
    masterFile: 'master data.xlsx',
    reqCols: ['Document Number', 'Tanggal', 'Kode Outlet', 'Salesman Code', 'Item Code', 'Sales Ctn', 'Sales Netto', 'Year', 'MONTH'],
    info: 'Mendukung pembaruan faktur dan transaksi penjualan. Kolom Year dan MONTH otomatis diselaraskan dengan periode akuntansi ERP.'
  },
  CUSTOMER_LIST: {
    name: 'Customer List',
    desc: 'Master Pelanggan & Rute',
    icon: 'users',
    masterFile: 'DATA CL.xlsx',
    reqCols: ['Kode Outlet', 'Nama Outlet', 'Alamat Outlet', 'DSO', 'SUB - DSO', 'SALES TYPE', 'Kode Sales', 'Salesman Name', 'Rayon', 'pasar'],
    info: 'Memetakan master outlet ke salesman dan rayon. Menjaga riwayat perpindahan outlet dan identitas pelanggan.'
  },
  TARGETS: {
    name: 'Target Quantity',
    desc: 'Target Bulanan Qty & Rp',
    icon: 'target',
    masterFile: 'TARGET KUANTITI SALES.xlsx',
    reqCols: ['PRINCIPAL', 'Sales Name', 'Brand', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'],
    info: 'Fokus utama pada Target Qty (KTN). Nilai target rupiah otomatis dihitung dinamis dari harga satuan produk riil.'
  },
  STOCK: {
    name: 'Stock Gudang',
    desc: 'Stok Produk & Persediaan',
    icon: 'boxes',
    masterFile: 'DATA STOK.xlsx',
    reqCols: ['Kode', 'Produk', 'SKU', 'Satuan', 'Saldo Stok Administrasi', 'Bon Produk', 'Allocated Stock', 'Available Stock', 'Stok Fisik', 'Stok dalam Perjalanan'],
    info: 'Snapshot ketersediaan stok fisik dan administrasi gudang Garut untuk mendeteksi overstock & out-of-stock.'
  },
  AR: {
    name: 'Aging Piutang (AR)',
    desc: 'Faktur Piutang & Jatuh Tempo',
    icon: 'receipt',
    masterFile: 'piutang aktif.xlsx',
    reqCols: ['Kode Outlet', 'Outlet', 'Tgl Faktur', 'No Faktur', 'Tgl J. Tempo', 'Total Harga', 'Potongan', 'DPP', 'PPN', 'Faktur Netto', 'Sudah Bayar', 'Saldo Piutang'],
    info: 'Memantau saldo piutang berjalan, umur piutang (Aging Buckets 1-30, 31-60, 61-90, >90 hari NPL), dan batas kredit.'
  },
  INCENTIVE_VALUE_TARGETS: {
    name: 'Incentive Target',
    desc: 'Target Nilai Per Salesman',
    icon: 'award',
    masterFile: 'Template_Incentive_Target.xlsx',
    reqCols: ['Salesman', 'Target Value (Rupiah)', 'Target Kopi Cartons', 'Target Bvg Cartons', 'Target Non Kopi Bvg Cartons'],
    info: 'Target nilai insentif per salesman untuk perhitungan Komponen 4 (Value All) dan komponen turunan.'
  }
};

function selectDataCenterCategory(catKey) {
  window.activeDataCenterCategory = catKey;
  stagedUpload = null;
  renderDataCenter();
}

function switchDataCenterSubView(subView) {
  window.activeDataCenterSubView = subView;
  renderDataCenter();
}

function downloadCurrentTemplate() {
  const cat = window.activeDataCenterCategory || 'TRANSACTIONS';
  window.open(`/api/datacenter/templates/${cat}`, '_blank');
}

async function renderDataCenter() {
  const main = document.getElementById('main-content');
  const catKey = window.activeDataCenterCategory || 'TRANSACTIONS';
  const cat = DATACENTER_CATEGORIES[catKey] || DATACENTER_CATEGORIES.TRANSACTIONS;
  const isSuper = isSuperAdmin();

  main.innerHTML = `
    <!-- Data Center Header -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-2 border-b border-slate-200">
      <div>
        <div class="flex items-center gap-2">
          <h2 class="text-xl font-bold text-slate-800 tracking-tight">Data Center</h2>
          ${isSuper ? `<span class="badge-success text-[10px] font-bold px-2 py-0.5 rounded">Super User: Full Akses</span>` : `<span class="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded">Akses: Hanya Lihat (Viewer)</span>`}
        </div>
        <p class="text-xs text-slate-500 mt-0.5">Kelola data master, perbarui data transaksi, stok, piutang, dan target bulanan secara terpusat.</p>
      </div>

      <!-- Sub Navigation Buttons -->
      <div class="flex items-center gap-2">
        <button onclick="switchDataCenterSubView('import')" class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${window.activeDataCenterSubView === 'import' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
          <i data-lucide="upload-cloud" class="w-4 h-4"></i>
          <span>Import Data Master</span>
        </button>
        ${isSuper ? `
          <button onclick="switchDataCenterSubView('users')" class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${window.activeDataCenterSubView === 'users' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}">
            <i data-lucide="users" class="w-4 h-4"></i>
            <span>Kelola Pengguna & Kata Sandi</span>
          </button>
        ` : ''}
      </div>
    </div>

    <!-- Viewer Restriction Notice if Viewer -->
    ${!isSuper ? `
      <div class="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs flex items-start gap-3">
        <i data-lucide="shield-alert" class="w-5 h-5 text-amber-600 shrink-0 mt-0.5"></i>
        <div>
          <strong class="font-bold">Mode Akses Terbatas (Viewer):</strong>
          <p class="mt-0.5 text-amber-700 leading-relaxed">Anda saat ini login sebagai <strong class="text-amber-900">${window.currentUser?.fullName || 'Viewer'}</strong> (${window.currentUser?.roleLabel || 'Staff'}). Anda dapat melihat seluruh analitik, memeriksa riwayat berkas, dan mengunduh format template master, namun hak unggah (upload), simpan (commit), dan perubahan data dibatasi hanya untuk Super User (Aghia Anggala).</p>
        </div>
      </div>
    ` : ''}

    ${window.activeDataCenterSubView === 'users' ? `
      <!-- ========================================== -->
      <!-- SUB-VIEW: KELOLA PENGGUNA & KATA SANDI     -->
      <!-- ========================================== -->
      <div class="space-y-6">
        <!-- Ganti Kata Sandi Super User (Aghia Anggala) -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm max-w-xl">
          <div class="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
            <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <i data-lucide="key-round" class="w-5 h-5"></i>
            </div>
            <div>
              <h3 class="font-bold text-slate-800 text-sm">Ganti Kata Sandi Akun Anda (Aghia Anggala)</h3>
              <p class="text-[11px] text-slate-500">Ubah kata sandi standar (12345) ke kata sandi baru pribadi Anda.</p>
            </div>
          </div>

          <form onsubmit="handlePasswordChangeSubmit(event)" class="space-y-3">
            <div id="password-change-alert" class="hidden p-3 rounded-xl text-xs font-semibold"></div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Kata Sandi Baru</label>
              <input type="password" id="input-new-password" required placeholder="Masukkan kata sandi baru..." class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none">
            </div>
            <div>
              <label class="block text-xs font-bold text-slate-700 mb-1">Konfirmasi Kata Sandi Baru</label>
              <input type="password" id="input-confirm-password" required placeholder="Ulangi kata sandi baru..." class="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none">
            </div>
            <button type="submit" id="btn-change-password" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition flex items-center gap-1.5">
              <i data-lucide="check" class="w-4 h-4"></i>
              <span>Simpan Kata Sandi Baru</span>
            </button>
          </form>
        </div>

        <!-- Daftar Pengguna Sistem -->
        <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
            <div>
              <h3 class="font-bold text-slate-800 text-sm">Daftar Akun Pengguna & Hak Akses</h3>
              <p class="text-[11px] text-slate-500">Manajemen akses peran Super Admin, Supervisor, dan Salesman.</p>
            </div>
            <button onclick="openAddUserModal()" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition flex items-center gap-1">
              <i data-lucide="user-plus" class="w-3.5 h-3.5"></i> Tambah User Baru
            </button>
          </div>

          <div id="users-table-container" class="overflow-x-auto text-xs">
            <div class="py-8 text-center text-slate-400"><i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto mb-2"></i>Memuat daftar pengguna...</div>
          </div>
        </div>
      </div>
    ` : `
      <!-- ========================================== -->
      <!-- SUB-VIEW: IMPORT DATA MASTER               -->
      <!-- ========================================== -->
      <!-- Category Tabs Selector -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        ${Object.entries(DATACENTER_CATEGORIES).map(([key, item]) => {
          const isActive = key === catKey;
          return `
            <div onclick="selectDataCenterCategory('${key}')" class="p-3 bg-white rounded-xl border transition cursor-pointer flex items-center gap-2.5 ${isActive ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md bg-blue-50/20' : 'border-slate-200 hover:border-blue-300 shadow-sm'}">
              <i data-lucide="${item.icon}" class="w-4 h-4 ${isActive ? 'text-blue-600' : 'text-slate-500'}"></i>
              <div class="min-w-0">
                <p class="text-xs font-bold ${isActive ? 'text-blue-900' : 'text-slate-800'} truncate">${item.name}</p>
                <p class="text-[10px] text-slate-400 truncate">${item.desc}</p>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Active Category Details & Template Download Card -->
      <div class="bg-gradient-to-r from-blue-50/80 via-slate-50 to-emerald-50/40 p-4 rounded-2xl border border-blue-200/80 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-md shadow-blue-700/20">
            <i data-lucide="${cat.icon}" class="w-5 h-5"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h4 class="font-bold text-slate-800 text-sm">${cat.name} — Format Berkas Master</h4>
              <span class="text-[10px] bg-blue-100 text-blue-800 font-mono font-bold px-2 py-0.5 rounded">${cat.masterFile}</span>
            </div>
            <p class="text-xs text-slate-600 mt-1">${cat.info}</p>
            <div class="mt-2 text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
              <strong class="text-slate-700">Kolom Master Diharapkan:</strong>
              ${cat.reqCols.slice(0, 6).map(c => `<span class="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[10px] text-slate-600">${c}</span>`).join('')}
              ${cat.reqCols.length > 6 ? `<span class="text-[10px] text-slate-400">+ ${cat.reqCols.length - 6} kolom lainnya</span>` : ''}
            </div>
          </div>
        </div>

        <button onclick="downloadCurrentTemplate()" class="px-4 py-2.5 bg-white hover:bg-slate-50 text-blue-700 border border-blue-300 font-bold text-xs rounded-xl shadow-sm transition flex items-center gap-2 shrink-0 self-start md:self-center">
          <i data-lucide="download" class="w-4 h-4 text-blue-600"></i>
          <span>Unduh Format Master (.xlsx)</span>
        </button>
      </div>

      <!-- Drag and Drop Dropzone -->
      ${isSuper ? `
        <div id="dropzone" ondragover="event.preventDefault()" ondrop="handleDrop(event)" class="border-2 border-dashed border-blue-300 bg-blue-50/40 rounded-2xl p-8 text-center transition hover:bg-blue-50/70 cursor-pointer" onclick="document.getElementById('file-input').click()">
          <input type="file" id="file-input" class="hidden" onchange="handleFileSelect(event)" accept=".xlsx,.xls,.csv">
          <div class="w-14 h-14 bg-white rounded-2xl shadow-sm text-blue-600 flex items-center justify-center mx-auto mb-3">
            <i data-lucide="upload-cloud" class="w-8 h-8"></i>
          </div>
          <h3 class="font-bold text-slate-800 text-sm">Drag & Drop file <span class="text-blue-600 underline">${cat.name}</span> di sini</h3>
          <p class="text-xs text-slate-500 mt-1">atau <span class="text-blue-600 font-semibold underline">klik untuk memilih file</span> dari komputer Anda (Format Excel .xlsx, .xls, .csv)</p>
          <p class="text-[10px] text-slate-400 mt-2">Sistem otomatis mendeteksi baris header dan memvalidasi tipe data sebelum disimpan.</p>
          <button class="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg shadow-sm">
            Pilih File ${cat.name}
          </button>
        </div>
      ` : `
        <div class="border-2 border-dashed border-slate-300 bg-slate-50/60 rounded-2xl p-8 text-center cursor-not-allowed">
          <div class="w-14 h-14 bg-white rounded-2xl shadow-sm text-slate-400 flex items-center justify-center mx-auto mb-3">
            <i data-lucide="lock" class="w-7 h-7"></i>
          </div>
          <h3 class="font-bold text-slate-600 text-sm">Upload Dinonaktifkan untuk Akun Viewer</h3>
          <p class="text-xs text-slate-400 mt-1">Silakan login sebagai Super User (Aghia Anggala) untuk mengunggah atau memperbarui data master.</p>
        </div>
      `}

      <!-- Validation & Mapping Preview Container -->
      <div id="validation-preview-container" class="space-y-4">
        <!-- Injected after upload -->
      </div>

      <!-- Recent Batches Table -->
      <div class="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
          <div>
            <h3 class="font-bold text-slate-800 text-sm">Riwayat Batch Import Data</h3>
            <p class="text-[11px] text-slate-500">Daftar transaksi berkas master yang telah disimpan ke database.</p>
          </div>
          <button onclick="loadRecentBatches()" class="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition" title="Refresh">
            <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
          </button>
        </div>
        <div id="recent-batches-container" class="overflow-x-auto text-xs">
          <div class="py-6 text-center text-slate-400"><i data-lucide="loader-2" class="w-4 h-4 animate-spin mx-auto mb-1"></i> Memuat riwayat...</div>
        </div>
      </div>
    `}
  `;
  lucide.createIcons();

  if (window.activeDataCenterSubView === 'users') {
    loadUserManagement();
  } else {
    loadRecentBatches();
  }
}

async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;
  uploadAndValidate(file);
}

async function handleDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (!file) return;
  uploadAndValidate(file);
}

async function uploadAndValidate(file) {
  const preview = document.getElementById('validation-preview-container');
  if (!preview) return;
  preview.innerHTML = `<div class="p-6 text-center text-slate-500 bg-white rounded-xl border border-slate-200"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto text-blue-600 mb-2"></i>Menganalisis dan memvalidasi berkas ${file.name}...</div>`;
  lucide.createIcons();

  const formData = new FormData();
  formData.append('file', file);
  if (window.activeDataCenterCategory) {
    formData.append('datasetType', window.activeDataCenterCategory);
  }

  try {
    const res = await fetch('/api/datacenter/validate', {
      method: 'POST',
      headers: authHeaders(),
      body: formData
    });
    const data = await res.json();
    stagedUpload = data;

    const validPct = data.totalRows > 0 ? ((data.validRows / data.totalRows) * 100).toFixed(1) : 0;
    const warnPct = data.totalRows > 0 ? ((data.warningRows / data.totalRows) * 100).toFixed(1) : 0;
    const errPct = data.totalRows > 0 ? ((data.errorRows / data.totalRows) * 100).toFixed(1) : 0;
    const isSuper = isSuperAdmin();

    preview.innerHTML = `
      <!-- File Metadata Card -->
      <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div class="flex items-center gap-3">
          <i data-lucide="check-circle" class="w-6 h-6 text-emerald-600 shrink-0"></i>
          <div>
            <h4 class="font-bold text-slate-800 text-sm">File terdeteksi sebagai format <span class="text-emerald-700 underline font-extrabold">${data.datasetType}</span></h4>
            <p class="text-xs text-slate-600">${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB) • ${data.totalRows.toLocaleString('id-ID')} baris terbaca</p>
          </div>
        </div>
        ${isSuper ? `
          <button onclick="commitStagedImport()" id="btn-commit-import" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-700/20 transition flex items-center justify-center gap-1.5 shrink-0">
            <i data-lucide="save" class="w-4 h-4"></i> Simpan & Commit ke Database
          </button>
        ` : `
          <span class="px-3 py-1.5 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold border border-slate-200">Akses Viewer (Hanya Lihat)</span>
        `}
      </div>

      <!-- Split Layout: Column Mapping & Validation Results -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 text-xs">
        <!-- Column Mapping (5 cols) -->
        <div class="lg:col-span-5 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h4 class="font-bold text-slate-800 mb-1">Pemetaan Kolom & Identitas Data</h4>
          <p class="text-[11px] text-slate-500 mb-3">Kolom otomatis dipetakan sesuai struktur master data Garut</p>

          <div class="space-y-2 max-h-56 overflow-y-auto scrollbar-thin pr-1">
            ${(DATACENTER_CATEGORIES[data.datasetType]?.reqCols || ['Kolom Data']).map(col => `
              <div class="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span class="font-medium text-slate-700">${col}</span>
                <span class="badge-success px-2 py-0.5 rounded text-[10px] font-bold">OK Terpetakan</span>
              </div>
            `).join('')}
          </div>

          <div class="mt-4 p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-blue-800 text-[11px] flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5"></i>
            <span><strong>Target Value Dinamis:</strong> Jika mengunggah target kuantiti, nilai rupiah target dihitung otomatis via perkalian harga satuan produk historis.</span>
          </div>
        </div>

        <!-- Hasil Validasi Data Cards & Table (7 cols) -->
        <div class="lg:col-span-7 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <h4 class="font-bold text-slate-800 mb-3">Hasil Validasi Data</h4>

          <div class="grid grid-cols-4 gap-2 mb-4">
            <div class="p-2.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-center">
              <span class="text-[10px] font-semibold block">Valid</span>
              <span class="text-sm font-extrabold">${data.validRows.toLocaleString('id-ID')}</span>
              <span class="text-[9px] block text-emerald-600">${validPct}%</span>
            </div>
            <div class="p-2.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200 text-center">
              <span class="text-[10px] font-semibold block">Warning</span>
              <span class="text-sm font-extrabold">${data.warningRows}</span>
              <span class="text-[9px] block text-amber-600">${warnPct}%</span>
            </div>
            <div class="p-2.5 rounded-lg bg-rose-50 text-rose-800 border border-rose-200 text-center">
              <span class="text-[10px] font-semibold block">Error</span>
              <span class="text-sm font-extrabold">${data.errorRows}</span>
              <span class="text-[9px] block text-rose-600">${errPct}%</span>
            </div>
            <div class="p-2.5 rounded-lg bg-slate-50 text-slate-800 border border-slate-200 text-center">
              <span class="text-[10px] font-semibold block">Total</span>
              <span class="text-sm font-extrabold">${data.totalRows.toLocaleString('id-ID')}</span>
              <span class="text-[9px] block text-slate-500">Baris</span>
            </div>
          </div>

          <!-- Catatan Validasi Data -->
          <div class="border border-slate-200 rounded-lg overflow-hidden">
            <div class="bg-slate-50 px-3 py-1.5 font-bold text-[11px] text-slate-700 border-b border-slate-200 flex justify-between">
              <span>Catatan Validasi Data</span>
              <span class="${data.errors.length === 0 ? 'text-emerald-700 font-bold' : 'text-rose-600'}">${data.errors.length === 0 ? 'Status: Siap Simpan' : 'Ditemukan Kendala'}</span>
            </div>
            <div class="max-h-48 overflow-y-auto p-2.5 space-y-1.5 scrollbar-thin text-[11px]">
              ${data.warnings.length === 0 && data.errors.length === 0 ? `
                <p class="text-emerald-600 font-semibold p-2 flex items-center gap-1.5"><i data-lucide="check" class="w-4 h-4"></i> Seluruh data lulus validasi tanpa error fatal. Siap disimpan ke database.</p>
              ` : `
                ${data.errors.map(e => `<p class="text-rose-600 font-medium">❌ ${e}</p>`).join('')}
                ${data.warnings.map(w => `<p class="text-amber-600 font-medium">⚠️ ${w}</p>`).join('')}
              `}
            </div>
          </div>
        </div>
      </div>
    `;
    lucide.createIcons();
  } catch (err) {
    preview.innerHTML = `<div class="p-4 bg-rose-50 text-rose-700 rounded-xl">Gagal memvalidasi berkas: ${err.message}</div>`;
  }
}

async function commitStagedImport() {
  if (!stagedUpload) return;
  const btn = document.getElementById('btn-commit-import');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> Menyimpan ke Database...`;
    lucide.createIcons();
  }

  try {
    const res = await fetch('/api/datacenter/commit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify({
        stagedFilePath: stagedUpload.stagedFilePath,
        datasetType: stagedUpload.datasetType
      })
    });
    const result = await res.json();
    if (result.success) {
      alert(`Berhasil mengimpor ${result.committedRows.toLocaleString('id-ID')} baris data ke database sistem!`);
      stagedUpload = null;
      renderDataCenter();
    } else {
      alert('Gagal mengimpor: ' + (result.error || 'Terjadi kesalahan sistem'));
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Coba Simpan Ulang`;
        lucide.createIcons();
      }
    }
  } catch (err) {
    alert('Kesalahan jaringan saat menyimpan: ' + err.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="save" class="w-4 h-4"></i> Coba Simpan Ulang`;
      lucide.createIcons();
    }
  }
}

async function loadRecentBatches() {
  const container = document.getElementById('recent-batches-container');
  if (!container) return;
  try {
    const res = await fetch('/api/datacenter/batches', { headers: authHeaders() });
    const data = await res.json();
    const batches = data.batches || [];

    if (batches.length === 0) {
      container.innerHTML = `<p class="py-6 text-center text-slate-400">Belum ada riwayat batch yang tercatat.</p>`;
      return;
    }

    container.innerHTML = `
      <table class="w-full text-left">
        <thead>
          <tr class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
            <th class="py-2.5 px-3">Batch ID</th>
            <th class="py-2.5 px-3">Tipe Data</th>
            <th class="py-2.5 px-3">Nama Berkas</th>
            <th class="py-2.5 px-3 text-right">Total Baris</th>
            <th class="py-2.5 px-3">Waktu Import</th>
            <th class="py-2.5 px-3 text-center">Status</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${batches.map(b => `
            <tr class="hover:bg-slate-50/60">
              <td class="py-2.5 px-3 font-mono font-bold text-slate-700">${b.batch_id}</td>
              <td class="py-2.5 px-3">
                <span class="px-2 py-0.5 rounded font-bold text-[10px] ${b.dataset_type === 'TARGETS' ? 'bg-amber-100 text-amber-800' : (b.dataset_type === 'AR' ? 'bg-rose-100 text-rose-800' : (b.dataset_type === 'STOCK' ? 'bg-emerald-100 text-emerald-800' : 'bg-blue-100 text-blue-800'))}">
                  ${b.dataset_type}
                </span>
              </td>
              <td class="py-2.5 px-3 text-slate-800 font-medium">${b.filename || 'Upload'}</td>
              <td class="py-2.5 px-3 text-right font-bold text-slate-700">${(b.total_rows || 0).toLocaleString('id-ID')}</td>
              <td class="py-2.5 px-3 text-slate-500">${b.created_at ? new Date(b.created_at).toLocaleString('id-ID') : '—'}</td>
              <td class="py-2.5 px-3 text-center">
                <span class="badge-success px-2 py-0.5 rounded text-[10px] font-bold">${b.status || 'COMMITTED'}</span>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<p class="py-4 text-center text-rose-600">Gagal memuat riwayat batch: ${err.message}</p>`;
  }
}

async function loadUserManagement() {
  const container = document.getElementById('users-table-container');
  if (!container) return;
  try {
    const res = await fetch('/api/users', { headers: authHeaders() });
    const data = await res.json();
    const users = data.users || [];

    container.innerHTML = `
      <table class="w-full text-left">
        <thead>
          <tr class="bg-slate-50 text-slate-500 font-bold border-b border-slate-200">
            <th class="py-2.5 px-3">Username</th>
            <th class="py-2.5 px-3">Nama Lengkap</th>
            <th class="py-2.5 px-3">Peran (Role)</th>
            <th class="py-2.5 px-3">Hak Akses</th>
            <th class="py-2.5 px-3 text-center">Status</th>
            <th class="py-2.5 px-3 text-center">Aksi</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          ${users.map(u => `
            <tr class="hover:bg-slate-50/60">
              <td class="py-2.5 px-3 font-bold text-slate-800">${u.username}</td>
              <td class="py-2.5 px-3 text-slate-700">${u.full_name}</td>
              <td class="py-2.5 px-3">
                <span class="px-2 py-0.5 rounded font-bold text-[10px] ${u.role === 'DSM' ? 'bg-emerald-100 text-emerald-800' : (u.role === 'SPV' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-700')}">
                  ${u.role === 'DSM' ? 'Super Admin' : (u.role === 'SPV' ? 'Supervisor' : 'Salesman / Staff')}
                </span>
              </td>
              <td class="py-2.5 px-3 text-slate-600">
                ${u.can_upload_sales ? '<span class="text-emerald-700 font-bold">Full Edit & Upload</span>' : '<span class="text-slate-400">Hanya Lihat (View Only)</span>'}
              </td>
              <td class="py-2.5 px-3 text-center">
                <span class="badge-success px-2 py-0.5 rounded text-[10px] font-bold">Aktif</span>
              </td>
              <td class="py-2.5 px-3 text-center">
                <button onclick="promptChangeUserPassword('${u.user_id}', '${u.username}')" class="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-semibold text-[10px] transition">
                  Ganti Password
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<p class="py-4 text-center text-rose-600">Gagal memuat data pengguna: ${err.message}</p>`;
  }
}

async function handlePasswordChangeSubmit(event) {
  event.preventDefault();
  const p1 = document.getElementById('input-new-password')?.value;
  const p2 = document.getElementById('input-confirm-password')?.value;
  const alertEl = document.getElementById('password-change-alert');

  if (!p1 || p1.trim().length === 0) {
    alertEl.className = 'p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200';
    alertEl.textContent = 'Password baru tidak boleh kosong.';
    alertEl.classList.remove('hidden');
    return;
  }

  if (p1 !== p2) {
    alertEl.className = 'p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200';
    alertEl.textContent = 'Konfirmasi password tidak cocok.';
    alertEl.classList.remove('hidden');
    return;
  }

  try {
    const userId = window.currentUser?.userId || 'USR_AGHIA';
    const res = await fetch(`/api/users/${userId}/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify({ newPassword: p1.trim() })
    });
    const data = await res.json();
    if (data.success) {
      alertEl.className = 'p-3 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200';
      alertEl.textContent = 'Kata sandi berhasil diperbarui! Silakan gunakan kata sandi baru untuk login berikutnya.';
      alertEl.classList.remove('hidden');
      document.getElementById('input-new-password').value = '';
      document.getElementById('input-confirm-password').value = '';
    } else {
      alertEl.className = 'p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200';
      alertEl.textContent = data.error || 'Gagal mengubah kata sandi.';
      alertEl.classList.remove('hidden');
    }
  } catch (err) {
    alertEl.className = 'p-3 rounded-xl text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200';
    alertEl.textContent = 'Kesalahan jaringan: ' + err.message;
    alertEl.classList.remove('hidden');
  }
}

async function promptChangeUserPassword(userId, username) {
  const newPass = prompt(`Masukkan kata sandi baru untuk user "${username}":`);
  if (!newPass || newPass.trim().length === 0) return;

  try {
    const res = await fetch(`/api/users/${userId}/password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders()
      },
      body: JSON.stringify({ newPassword: newPass.trim() })
    });
    const data = await res.json();
    if (data.success) {
      alert(`Kata sandi untuk "${username}" berhasil diubah.`);
    } else {
      alert('Gagal mengubah password: ' + (data.error || 'Terjadi kesalahan'));
    }
  } catch (err) {
    alert('Kesalahan jaringan: ' + err.message);
  }
}

function openAddUserModal() {
  const u = prompt('Masukkan Username baru (contoh: spv_garut_2):');
  if (!u) return;
  const name = prompt('Masukkan Nama Lengkap pengguna:');
  if (!name) return;
  const role = prompt('Pilih Peran: Ketik "SPV" (Supervisor), "SALESMAN", atau "DSM" (Super Admin):', 'SPV');
  if (!role) return;
  const pass = prompt('Masukkan Password awal:', '12345');
  if (!pass) return;

  fetch('/api/users', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders()
    },
    body: JSON.stringify({
      username: u.trim(),
      fullName: name.trim(),
      role: role.trim().toUpperCase(),
      password: pass.trim()
    })
  }).then(r => r.json()).then(data => {
    if (data.success) {
      alert('Pengguna baru berhasil ditambahkan.');
      loadUserManagement();
    } else {
      alert('Gagal menambahkan pengguna: ' + (data.error || 'Terjadi kesalahan'));
    }
  }).catch(e => alert('Error: ' + e.message));
}

// ==============================================================
// 4. PENJUALAN — PERFORMANCE DRILLDOWN
// ==============================================================
// 4. PENJUALAN — PERFORMANCE DRILLDOWN & GROUP SKU
// ==============================================================
window.penjualanViewMode = 'group'; // 'group' or 'sku'
window.penjualanPeriodMode = 'monthly'; // 'monthly' or 'ytd'
window.penjualanSortKey = 'actualCartons';
window.penjualanSortDir = 'desc';

async function renderPenjualan() {
  const main = document.getElementById('main-content');
  try {
    const res = await fetch(`/api/sales/performance?${getFilterQuery()}`);
    const data = await res.json();
    window.salesPerformanceData = data;

    renderPenjualanContent();
  } catch (err) {
    main.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Gagal memuat penjualan: ${err.message}</div>`;
  }
}

function switchPenjualanView(mode) {
  window.penjualanViewMode = mode;
  renderPenjualanContent();
}

function switchPenjualanPeriodMode(pm) {
  window.penjualanPeriodMode = pm;
  renderPenjualanContent();
}

function sortPenjualanTable(colKey) {
  if (window.penjualanSortKey === colKey) {
    window.penjualanSortDir = window.penjualanSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    window.penjualanSortKey = colKey;
    window.penjualanSortDir = 'desc';
  }
  renderPenjualanContent();
}

function renderPenjualanContent() {
  const main = document.getElementById('main-content');
  const data = window.salesPerformanceData;
  if (!data) return;

  const mode = window.penjualanViewMode;
  const periodMode = window.penjualanPeriodMode || 'monthly';
  const sortKey = window.penjualanSortKey;
  const sortDir = window.penjualanSortDir;

  const sortIcon = (col) => {
    if (sortKey !== col) return `<span class="text-slate-300 ml-1">⇅</span>`;
    return sortDir === 'asc' ? `<span class="text-blue-600 ml-1 font-bold">▲</span>` : `<span class="text-blue-600 ml-1 font-bold">▼</span>`;
  };

  const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const curMonthName = monthNames[globalFilters.month] || `Bulan ${globalFilters.month}`;

  const ytdSummary = data.summary?.ytd || {
    asOfMonth: globalFilters.month,
    targetCartons: 0,
    targetValue: 0,
    actualCartons: 0,
    salesNetto: 0,
    achievementPct: 0,
    valueAchievementPct: 0,
    gapCartons: 0,
    gapValue: 0
  };

  // Map rows according to periodMode
  let rawRows = [];
  if (mode === 'group') {
    rawRows = (data.groupSkus || []).map(g => {
      if (periodMode === 'ytd' && g.ytd) {
        return {
          ...g,
          targetCartons: g.ytd.targetCartons,
          targetValue: g.ytd.targetValue,
          actualCartons: g.ytd.actualCartons,
          achievementPct: g.ytd.achievementPct,
          valueAchievementPct: g.ytd.valueAchievementPct,
          gapCartons: g.ytd.gapCartons,
          gapValue: g.ytd.gapValue,
          salesNetto: g.ytd.salesNetto,
          contributionPct: ytdSummary.actualCartons > 0 ? Math.round((g.ytd.actualCartons / ytdSummary.actualCartons) * 1000) / 10 : 0
        };
      }
      return g;
    });
  } else {
    rawRows = data.products || [];
  }

  const sortedRows = sortDataRows(rawRows, sortKey, sortDir);

  let rowsHtml = '';
  if (mode === 'group') {
    rowsHtml = sortedRows.map((g, idx) => `
      <tr class="hover:bg-blue-50/50 transition">
        <td class="py-2.5 px-4 text-slate-400 font-mono text-center">${idx + 1}</td>
        <td class="py-2.5 px-4 font-bold text-slate-800 flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0"></span>
          <span>${g.groupSku}</span>
        </td>
        <td class="py-2.5 px-4 font-semibold text-blue-600">${g.brand || '—'}</td>
        <td class="py-2.5 px-4 text-slate-600">${g.principal || 'SAVORIA'}</td>
        <td class="py-2.5 px-4 text-right font-medium">
          <div>${g.targetCartons > 0 ? g.targetCartons.toLocaleString('id-ID') : '<span class="text-slate-400">Belum ada</span>'}</div>
          ${g.targetValue > 0 ? `<div class="text-[10px] text-slate-400 font-normal">Rp ${(g.targetValue / 1000000).toFixed(1)} Jt</div>` : ''}
        </td>
        <td class="py-2.5 px-4 text-right font-extrabold text-slate-900">${g.actualCartons.toLocaleString('id-ID')}</td>
        <td class="py-2.5 px-4 text-right font-bold ${g.targetCartons > 0 ? (g.achievementPct >= 80 ? 'text-emerald-600' : (g.achievementPct >= 60 ? 'text-amber-600' : 'text-rose-600')) : 'text-slate-400'}">
          <div>${g.targetCartons > 0 ? g.achievementPct + '%' : 'N/A'}</div>
          ${g.targetValue > 0 ? `<div class="text-[10px] ${g.valueAchievementPct >= 80 ? 'text-emerald-600' : 'text-amber-600'} font-normal">Val: ${g.valueAchievementPct}%</div>` : ''}
        </td>
        <td class="py-2.5 px-4 text-right font-semibold ${g.targetCartons > 0 ? (g.gapCartons > 0 ? 'text-rose-600' : 'text-emerald-600') : 'text-slate-400'}">
          <div>${g.targetCartons > 0 ? (g.gapCartons > 0 ? '-' + g.gapCartons.toLocaleString('id-ID') : 'Tercapai') : '—'}</div>
          ${g.targetValue > 0 && g.gapValue > 0 ? `<div class="text-[10px] text-rose-500 font-normal">-Rp ${(g.gapValue / 1000000).toFixed(1)} Jt</div>` : ''}
        </td>
        <td class="py-2.5 px-4 text-right font-mono font-medium">Rp ${(g.salesNetto / 1000000).toFixed(1)} Jt</td>
        <td class="py-2.5 px-4 text-right font-extrabold text-blue-700">${g.contributionPct}%</td>
        <td class="py-2.5 px-4 text-right font-extrabold text-indigo-700 bg-indigo-50/30 font-mono">${(g.stockOnHand || 0).toLocaleString('id-ID')}</td>
        <td class="py-2.5 px-4 text-right font-bold bg-indigo-50/30 ${(g.stockCoverDays || 0) < 7 ? 'text-rose-600' : ((g.stockCoverDays || 0) <= 25 ? 'text-emerald-600' : 'text-amber-600')}">
          ${(g.stockCoverDays || 0).toLocaleString('id-ID')} hr
        </td>
      </tr>
    `).join('');
  } else {
    rowsHtml = sortedRows.map((p, idx) => `
      <tr class="hover:bg-slate-50 transition">
        <td class="py-2.5 px-4 text-slate-400 font-mono text-center">${idx + 1}</td>
        <td class="py-2.5 px-4 font-bold text-slate-800">${p.principal}</td>
        <td class="py-2.5 px-4 font-semibold text-blue-600">${p.brand}</td>
        <td class="py-2.5 px-4 text-slate-700 font-medium">${p.groupSku}</td>
        <td class="py-2.5 px-4 text-right font-medium">
          <div>${p.targetCartons > 0 ? p.targetCartons.toLocaleString('id-ID') : '<span class="text-slate-400">—</span>'}</div>
          ${p.targetValue > 0 ? `<div class="text-[10px] text-slate-400 font-normal">Rp ${(p.targetValue / 1000000).toFixed(1)} Jt</div>` : ''}
        </td>
        <td class="py-2.5 px-4 text-right font-extrabold text-slate-900">${p.actualCartons.toLocaleString('id-ID')}</td>
        <td class="py-2.5 px-4 text-right font-bold ${p.targetCartons > 0 ? (p.achievementPct >= 80 ? 'text-emerald-600' : (p.achievementPct >= 60 ? 'text-amber-600' : 'text-rose-600')) : 'text-slate-400'}">
          <div>${p.targetCartons > 0 ? p.achievementPct + '%' : 'N/A'}</div>
          ${p.targetValue > 0 ? `<div class="text-[10px] ${p.valueAchievementPct >= 80 ? 'text-emerald-600' : 'text-amber-600'} font-normal">Val: ${p.valueAchievementPct}%</div>` : ''}
        </td>
        <td class="py-2.5 px-4 text-right font-semibold ${p.targetCartons > 0 ? (p.gapCartons > 0 ? '-' + p.gapCartons.toLocaleString('id-ID') : 'Tercapai') : '—'}">
          <div>${p.targetCartons > 0 ? (p.gapCartons > 0 ? '-' + p.gapCartons.toLocaleString('id-ID') : 'Tercapai') : '—'}</div>
          ${p.targetValue > 0 && p.gapValue > 0 ? `<div class="text-[10px] text-rose-500 font-normal">-Rp ${(p.gapValue / 1000000).toFixed(1)} Jt</div>` : ''}
        </td>
        <td class="py-2.5 px-4 text-right font-mono font-medium">Rp ${(p.salesNetto / 1000000).toFixed(1)} Jt</td>
        <td class="py-2.5 px-4 text-right font-extrabold text-blue-700">${p.contributionPct}%</td>
        <td class="py-2.5 px-4 text-right font-extrabold text-indigo-700 bg-indigo-50/30 font-mono">${(p.stockOnHand || 0).toLocaleString('id-ID')}</td>
        <td class="py-2.5 px-4 text-right font-bold bg-indigo-50/30 ${(p.stockCoverDays || 0) < 7 ? 'text-rose-600' : ((p.stockCoverDays || 0) <= 25 ? 'text-emerald-600' : 'text-amber-600')}">
          ${(p.stockCoverDays || 0).toLocaleString('id-ID')} hr
        </td>
      </tr>
    `).join('');
  }

  main.innerHTML = `
    <!-- Header -->
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold text-slate-800 tracking-tight">Analisis Kinerja Penjualan</h2>
        <p class="text-xs text-slate-500">Drilldown performa penjualan Target vs Actual, Pencapaian, dan Gap secara Bulanan & Year-to-Date (YTD 2026).</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <!-- Period Mode Toggle (Monthly vs YTD) -->
        <div class="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200 text-xs font-semibold">
          <button onclick="switchPenjualanPeriodMode('monthly')" class="px-3 py-1.5 rounded-lg transition ${periodMode === 'monthly' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
            📅 ${curMonthName}
          </button>
          <button onclick="switchPenjualanPeriodMode('ytd')" class="px-3 py-1.5 rounded-lg transition ${periodMode === 'ytd' ? 'bg-blue-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
            📈 YTD 2026 (Jan–${curMonthName})
          </button>
        </div>

        <!-- View Toggle Pills -->
        <div class="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200 text-xs">
          <button onclick="switchPenjualanView('group')" class="px-3 py-1.5 rounded-lg font-bold transition ${mode === 'group' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
            Group SKU
          </button>
          <button onclick="switchPenjualanView('sku')" class="px-3 py-1.5 rounded-lg font-bold transition ${mode === 'sku' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
            Detail SKU
          </button>
        </div>
      </div>
    </div>

    <!-- Year-to-Date (YTD 2026) Executive Summary Ribbon -->
    <div class="mt-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-4 text-white shadow-md border border-blue-900/50">
      <div class="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[10px] font-extrabold rounded tracking-wide">
            KUMULATIF YEAR TO DATE 2026
          </span>
          <span class="text-xs text-slate-300">Periode: <strong>Januari – ${curMonthName} 2026</strong></span>
        </div>
        <span class="text-[11px] text-blue-200">
          Realisasi Bulan Ini: <strong>${data.summary.totalCartons.toLocaleString('id-ID')} KTN</strong> ${data.summary.totalSalesNetto ? '• Rp ' + (data.summary.totalSalesNetto / 1000000).toFixed(1) + ' Jt' : ''}
        </span>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
        <!-- YTD Target -->
        <div class="bg-white/5 rounded-xl p-3 border border-white/10">
          <div class="text-[11px] font-semibold text-blue-300 uppercase tracking-wider flex items-center gap-1.5">
            <i data-lucide="target" class="w-3.5 h-3.5 text-blue-400"></i> Target YTD 2026
          </div>
          <div class="text-lg md:text-2xl font-black mt-1 font-mono text-white">
            ${ytdSummary.targetCartons.toLocaleString('id-ID')} <span class="text-xs font-normal text-slate-300 font-sans">KTN</span>
          </div>
          <div class="text-[11px] text-blue-200 mt-0.5">
            Rp ${(ytdSummary.targetValue / 1000000000).toFixed(2)} Milyar (Target Val)
          </div>
        </div>

        <!-- YTD Actual -->
        <div class="bg-white/5 rounded-xl p-3 border border-white/10">
          <div class="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
            <i data-lucide="check-circle-2" class="w-3.5 h-3.5 text-emerald-400"></i> Actual YTD 2026
          </div>
          <div class="text-lg md:text-2xl font-black mt-1 font-mono text-emerald-300">
            ${ytdSummary.actualCartons.toLocaleString('id-ID')} <span class="text-xs font-normal text-slate-300 font-sans">KTN</span>
          </div>
          <div class="text-[11px] text-emerald-200 mt-0.5">
            Rp ${(ytdSummary.salesNetto / 1000000000).toFixed(2)} Milyar Netto
          </div>
        </div>

        <!-- YTD Achievement % -->
        <div class="bg-white/5 rounded-xl p-3 border border-white/10">
          <div class="text-[11px] font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
            <i data-lucide="percent" class="w-3.5 h-3.5 text-amber-400"></i> Pencapaian YTD
          </div>
          <div class="text-lg md:text-2xl font-black mt-1 font-mono ${ytdSummary.achievementPct >= 80 ? 'text-emerald-300' : 'text-amber-300'}">
            ${ytdSummary.achievementPct}% <span class="text-xs font-normal text-slate-300 font-sans">Qty</span>
          </div>
          <div class="text-[11px] text-slate-300 mt-0.5">
            Val: <strong class="text-white">${ytdSummary.valueAchievementPct}%</strong> (Omzet)
          </div>
        </div>

        <!-- YTD Gap -->
        <div class="bg-white/5 rounded-xl p-3 border border-white/10">
          <div class="text-[11px] font-semibold text-rose-300 uppercase tracking-wider flex items-center gap-1.5">
            <i data-lucide="alert-circle" class="w-3.5 h-3.5 text-rose-400"></i> GAP YTD 2026
          </div>
          <div class="text-lg md:text-2xl font-black mt-1 font-mono ${ytdSummary.gapCartons > 0 ? 'text-rose-400' : 'text-emerald-400'}">
            ${ytdSummary.gapCartons > 0 ? '-' + ytdSummary.gapCartons.toLocaleString('id-ID') : 'Tercapai'} <span class="text-xs font-normal text-slate-300 font-sans">${ytdSummary.gapCartons > 0 ? 'KTN' : ''}</span>
          </div>
          <div class="text-[11px] ${ytdSummary.gapValue > 0 ? 'text-rose-300' : 'text-emerald-300'} mt-0.5">
            ${ytdSummary.gapValue > 0 ? '-Rp ' + (ytdSummary.gapValue / 1000000).toFixed(1) + ' Jt' : 'Target Value Tercapai'}
          </div>
        </div>
      </div>
    </div>

    <!-- Table Container -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs mt-4">
      <div class="p-3 bg-slate-50/80 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div class="flex items-center gap-2">
          <span class="text-xs font-bold text-slate-700">
            ${mode === 'group' ? 'Daftar Kategori Group SKU' : 'Daftar Produk Lengkap'} 
            <span class="text-slate-400 font-normal">(${mode === 'group' ? (data.groupSkus || []).length : data.products.length} baris)</span>
          </span>
          <span class="px-2 py-0.5 rounded text-[10px] font-bold ${periodMode === 'ytd' ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'}">
            ${periodMode === 'ytd' ? 'Mode: Kumulatif YTD 2026' : `Mode: Bulan ${curMonthName}`}
          </span>
        </div>
        <span class="text-[11px] text-slate-400 italic">Klik header kolom untuk sortir Naik (▲) / Turun (▼)</span>
      </div>
      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-left">
          <thead class="bg-slate-100/80 text-slate-700 font-bold border-b border-slate-200 select-none">
            <tr>
              <th class="py-3 px-4 text-center w-12">#</th>
              <th onclick="sortPenjualanTable('${mode === 'group' ? 'groupSku' : 'principal'}')" class="py-3 px-4 cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center">${mode === 'group' ? 'Group SKU' : 'Principal'} ${sortIcon(mode === 'group' ? 'groupSku' : 'principal')}</div>
              </th>
              <th onclick="sortPenjualanTable('brand')" class="py-3 px-4 cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center">Brand ${sortIcon('brand')}</div>
              </th>
              ${mode === 'group' ? `
                <th onclick="sortPenjualanTable('principal')" class="py-3 px-4 cursor-pointer hover:bg-slate-200/60 transition">
                  <div class="flex items-center">Principal ${sortIcon('principal')}</div>
                </th>
              ` : `
                <th onclick="sortPenjualanTable('groupSku')" class="py-3 px-4 cursor-pointer hover:bg-slate-200/60 transition">
                  <div class="flex items-center">Group SKU ${sortIcon('groupSku')}</div>
                </th>
              `}
              <th onclick="sortPenjualanTable('targetCartons')" class="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-end">Target ${periodMode === 'ytd' ? 'YTD' : 'KTN'} / Val ${sortIcon('targetCartons')}</div>
              </th>
              <th onclick="sortPenjualanTable('actualCartons')" class="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-end">Actual ${periodMode === 'ytd' ? 'YTD' : 'KTN'} ${sortIcon('actualCartons')}</div>
              </th>
              <th onclick="sortPenjualanTable('achievementPct')" class="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-end">Achv % ${sortIcon('achievementPct')}</div>
              </th>
              <th onclick="sortPenjualanTable('gapCartons')" class="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-end">GAP Target ${sortIcon('gapCartons')}</div>
              </th>
              <th onclick="sortPenjualanTable('salesNetto')" class="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-end">Sales Netto ${sortIcon('salesNetto')}</div>
              </th>
              <th onclick="sortPenjualanTable('contributionPct')" class="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-end">Kontribusi % ${sortIcon('contributionPct')}</div>
              </th>
              <th onclick="sortPenjualanTable('stockOnHand')" class="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition bg-indigo-50/50">
                <div class="flex items-center justify-end text-indigo-900">Stock on Hand (KTN) ${sortIcon('stockOnHand')}</div>
              </th>
              <th onclick="sortPenjualanTable('stockCoverDays')" class="py-3 px-4 text-right cursor-pointer hover:bg-slate-200/60 transition bg-indigo-50/50">
                <div class="flex items-center justify-end text-indigo-900">Stock Cover (Hari) ${sortIcon('stockCoverDays')}</div>
              </th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
  lucide.createIcons();
}

// ==============================================================
// 4B. TREND & MOVEMENT SALES ANALYTICS
// ==============================================================
window.trendState = {
  dimension: 'salesman', // 'salesman', 'principal', 'brand'
  metric: 'qty',         // 'qty', 'value', 'oa'
  periodRange: '2026',   // '2026', 'all', '2025'
  chartType: 'bar',      // 'bar', 'line'
  searchTerm: '',
  sortCol: 'total',
  sortDir: 'desc',
  outletId: '',
  outletName: ''
};

async function renderTrend() {
  const main = document.getElementById('main-content');
  try {
    const { dimension, metric, periodRange, outletId } = window.trendState;

    const query = new URLSearchParams({
      dimension,
      metric,
      periodRange,
      outletId: outletId || '',
      spvId: globalFilters.spvId || '',
      salesGroup: globalFilters.salesGroup || '',
      salesmanId: globalFilters.salesmanId || '',
      rayonId: globalFilters.rayonId || '',
      principal: globalFilters.principal || '',
      brand: globalFilters.brand || '',
      subbrand: globalFilters.subbrand || '',
      groupSku: globalFilters.groupSku || '',
      kecamatanId: globalFilters.kecamatanId || '',
      asOfDate: getTodayLocalDateString()
    });

    const res = await fetch(`/api/analytics/movement?${query.toString()}`);
    if (!res.ok) throw new Error('Gagal memuat data movement');
    const data = await res.json();
    window.movementData = data;

    renderTrendView();
  } catch (err) {
    main.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Gagal memuat Trend & Movement: ${err.message}</div>`;
  }
}

function switchTrendDimension(dim) {
  window.trendState.dimension = dim;
  renderTrend();
}

function switchTrendMetric(m) {
  window.trendState.metric = m;
  renderTrend();
}

function switchTrendPeriod(p) {
  window.trendState.periodRange = p;
  renderTrend();
}

function switchTrendChartType(type) {
  window.trendState.chartType = type;
  initTrendCharts();
}

function handleTrendSearch(e) {
  window.trendState.searchTerm = (e.target.value || '').toLowerCase();
  renderTrendMatrixBody();
}

function sortTrendMatrix(col) {
  if (window.trendState.sortCol === col) {
    window.trendState.sortDir = window.trendState.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    window.trendState.sortCol = col;
    window.trendState.sortDir = 'desc';
  }
  renderTrendMatrixBody();
}

function exportTrendCsv() {
  const { dimension, metric, periodRange, outletId } = window.trendState;
  const query = new URLSearchParams({
    dimension,
    metric,
    periodRange,
    outletId: outletId || '',
    spvId: globalFilters.spvId || '',
    salesGroup: globalFilters.salesGroup || '',
    salesmanId: globalFilters.salesmanId || '',
    rayonId: globalFilters.rayonId || '',
    principal: globalFilters.principal || '',
    brand: globalFilters.brand || '',
    subbrand: globalFilters.subbrand || '',
    groupSku: globalFilters.groupSku || '',
    kecamatanId: globalFilters.kecamatanId || ''
  });
  window.location.href = `/api/analytics/movement/export?${query.toString()}`;
}

function renderTrendView() {
  const main = document.getElementById('main-content');
  const data = window.movementData;
  if (!data) return;

  const { dimension, metric, periodRange, chartType } = window.trendState;
  const summary = data.summary || {};

  const metricLabel = metric === 'value' ? 'Nilai Omzet (Rp Netto)' : metric === 'oa' ? 'Outlet Aktif (OA)' : 'Volume (Karton)';
  const dimLabel = dimension === 'principal' ? 'Principal' : dimension === 'brand' ? 'Brand' : 'Salesman';

  const momBadge = summary.momGrowthPct !== null ? `
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold ${summary.momGrowthPct >= 0 ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}">
      ${summary.momGrowthPct >= 0 ? '▲ +' : '▼ '}${summary.momGrowthPct}% vs bln lalu
    </span>
  ` : '';

  main.innerHTML = `
    <!-- Top Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
      <div>
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">INTELLIGENCE ANALYTICS</span>
          <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">TARGET 2026 INGESTED</span>
        </div>
        <h1 class="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight mt-1">Trend & Movement Sales</h1>
        <p class="text-xs text-slate-500 mt-0.5">Analisis tren dan dinamika pergerakan penjualan bulanan periode 2025–2026</p>
      </div>

      <div class="flex items-center gap-2">
        <button onclick="exportTrendCsv()" class="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-sm transition">
          <i data-lucide="download" class="w-4 h-4"></i>
          <span>Unduh CSV</span>
        </button>
      </div>
    </div>

    <!-- 4 KPI Summary Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mt-5">
      <!-- Card 1: Total Volume -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between text-slate-500 mb-1">
          <span class="text-xs font-semibold">Total Volume Sales</span>
          <i data-lucide="package" class="w-4 h-4 text-blue-500"></i>
        </div>
        <div class="text-xl md:text-2xl font-extrabold text-slate-900 font-mono">
          ${(summary.totalQty || 0).toLocaleString('id-ID')} <span class="text-xs font-normal text-slate-500 font-sans">KTN</span>
        </div>
        <div class="mt-2 flex items-center justify-between text-[11px] text-slate-500">
          <span>Periode terpilih</span>
          ${momBadge}
        </div>
      </div>

      <!-- Card 2: Total Nilai Netto -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between text-slate-500 mb-1">
          <span class="text-xs font-semibold">Total Nilai Omzet</span>
          <i data-lucide="banknote" class="w-4 h-4 text-emerald-500"></i>
        </div>
        <div class="text-xl md:text-2xl font-extrabold text-slate-900 font-mono">
          Rp ${((summary.totalValue || 0) / 1000000000).toFixed(2)} <span class="text-xs font-normal text-slate-500 font-sans">Milyar</span>
        </div>
        <div class="mt-2 text-[11px] text-slate-500">
          Rp ${(summary.totalValue || 0).toLocaleString('id-ID')} Netto
        </div>
      </div>

      <!-- Card 3: Rata-rata OA -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between text-slate-500 mb-1">
          <span class="text-xs font-semibold">Rata-rata Outlet Aktif (OA)</span>
          <i data-lucide="store" class="w-4 h-4 text-amber-500"></i>
        </div>
        <div class="text-xl md:text-2xl font-extrabold text-slate-900 font-mono">
          ${(summary.avgMonthlyOa || 0).toLocaleString('id-ID')} <span class="text-xs font-normal text-slate-500 font-sans">Toko/bln</span>
        </div>
        <div class="mt-2 text-[11px] text-slate-500">
          Penetrasi belanja unik bulanan
        </div>
      </div>

      <!-- Card 4: Bulan Terakhir -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between text-slate-500 mb-1">
          <span class="text-xs font-semibold">Realisasi Bulan Berjalan</span>
          <i data-lucide="calendar" class="w-4 h-4 text-violet-500"></i>
        </div>
        <div class="text-xl md:text-2xl font-extrabold text-slate-900 font-mono">
          ${metric === 'value' ? 'Rp ' + ((summary.currentMonthVal || 0) / 1000000).toFixed(1) + ' Jt' : (summary.currentMonthVal || 0).toLocaleString('id-ID')}
        </div>
        <div class="mt-2 text-[11px] text-slate-500 flex items-center justify-between">
          <span>Bulan lalu: ${metric === 'value' ? 'Rp ' + ((summary.prevMonthVal || 0) / 1000000).toFixed(1) + ' Jt' : (summary.prevMonthVal || 0).toLocaleString('id-ID')}</span>
        </div>
      </div>
    </div>

    <!-- YoY & Full Year Milestone Comparison Panel -->
    ${(() => {
      const yoy = data.yearOverYearComparison;
      if (!yoy) return '';
      const fy = yoy.fullYear2025VsYtd2026;
      const ytd = yoy.ytd2025VsYtd2026;
      const monthNames = ['', 'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
      const asMonthName = monthNames[yoy.asOfMonth] || ('Bulan ' + yoy.asOfMonth);

      return `
      <div class="mt-5 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-5 text-white shadow-lg border border-indigo-800/40">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-white/10 gap-2 mb-4">
          <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 text-[10px] font-black rounded-lg tracking-wider uppercase">
              MILESTONE & YEAR-OVER-YEAR (YOY) BENCHMARK
            </span>
            <span class="text-xs text-slate-300">Cut-off Posisi: <strong>Januari – ${asMonthName} 2026</strong></span>
          </div>
          <span class="text-[11px] text-indigo-200">
            Komparasi Makro Historis 2025 vs Realisasi 2026
          </span>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <!-- Card 1: Full Year 2025 vs Year to Date 2026 -->
          <div class="bg-white/5 rounded-xl p-4 border border-white/10 flex flex-col justify-between hover:bg-white/[0.08] transition">
            <div>
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                  <i data-lucide="award" class="w-4 h-4 text-amber-400"></i>
                  1. Full Year 2025 vs Year to Date 2026
                </span>
                <span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${fy.achievedPctQty >= 75 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'}">
                  ${fy.achievedPctQty}% Tercapai
                </span>
              </div>
              <p class="text-[11px] text-slate-300 mt-1">
                Progress akumulasi penjualan YTD 2026 terhadap total realisasi 1 tahun penuh 2025 (12 Bulan).
              </p>

              <div class="mt-4 flex items-baseline gap-2">
                <div class="text-2xl lg:text-3xl font-black font-mono text-white">
                  ${fy.achievedPctQty}%
                </div>
                <div class="text-xs font-semibold ${fy.gapPctQty < 0 ? 'text-rose-400' : 'text-emerald-400'} font-mono">
                  GAP: ${fy.gapPctQty}% (${fy.gapQty.toLocaleString('id-ID')} KTN)
                </div>
              </div>

              <!-- Progress bar -->
              <div class="w-full bg-white/10 rounded-full h-2.5 mt-2.5 overflow-hidden">
                <div class="bg-gradient-to-r from-blue-500 to-indigo-400 h-2.5 rounded-full" style="width: ${Math.min(fy.achievedPctQty, 100)}%"></div>
              </div>

              <div class="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/10 text-xs">
                <div>
                  <div class="text-[10px] text-slate-400 uppercase tracking-wide">Realisasi FY 2025 (12 Bln)</div>
                  <div class="font-bold font-mono text-slate-200 mt-0.5">${fy.totalQty2025.toLocaleString('id-ID')} KTN</div>
                  <div class="text-[10px] text-indigo-200">Rp ${(fy.totalValue2025 / 1000000000).toFixed(2)} Milyar</div>
                </div>
                <div>
                  <div class="text-[10px] text-slate-400 uppercase tracking-wide">Realisasi YTD 2026 (Jan–${asMonthName})</div>
                  <div class="font-bold font-mono text-emerald-300 mt-0.5">${fy.totalQtyYtd2026.toLocaleString('id-ID')} KTN</div>
                  <div class="text-[10px] text-emerald-200">Rp ${(fy.totalValueYtd2026 / 1000000000).toFixed(2)} Milyar</div>
                </div>
              </div>
            </div>

            <div class="mt-3 pt-2 text-[11px] text-slate-400 flex items-center justify-between border-t border-white/5">
              <span>Gap Nilai Omzet:</span>
              <strong class="${fy.gapValue < 0 ? 'text-rose-400' : 'text-emerald-400'} font-mono">
                ${fy.gapValue < 0 ? '-Rp ' + Math.abs(fy.gapValue / 1000000).toFixed(1) + ' Jt' : 'Surplus'}
              </strong>
            </div>
          </div>

          <!-- Card 2: Year to Date 2025 vs Year to Date 2026 -->
          <div class="bg-white/5 rounded-xl p-4 border border-white/10 flex flex-col justify-between hover:bg-white/[0.08] transition">
            <div>
              <div class="flex items-center justify-between">
                <span class="text-xs font-bold text-emerald-300 flex items-center gap-1.5">
                  <i data-lucide="git-compare" class="w-4 h-4 text-emerald-400"></i>
                  2. Year to Date 2025 vs Year to Date 2026
                </span>
                <span class="px-2 py-0.5 rounded text-[10px] font-extrabold ${ytd.growthPctQty >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}">
                  ${ytd.growthPctQty >= 0 ? 'Surplus YoY' : 'Defisit YoY'}
                </span>
              </div>
              <p class="text-[11px] text-slate-300 mt-1">
                Perbandingan Apple-to-Apple periode yang sama (Januari – ${asMonthName}) antara 2025 dan 2026.
              </p>

              <div class="mt-4 flex items-baseline gap-2">
                <div class="text-2xl lg:text-3xl font-black font-mono ${ytd.growthPctQty >= 0 ? 'text-emerald-300' : 'text-rose-400'}">
                  ${ytd.growthPctQty >= 0 ? '+' : ''}${ytd.growthPctQty}%
                </div>
                <div class="text-xs font-semibold ${ytd.diffQty >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-mono">
                  ${ytd.diffQty >= 0 ? 'Surplus +' : 'Defisit '}${ytd.diffQty.toLocaleString('id-ID')} KTN
                </div>
              </div>

              <!-- Metric tags -->
              <div class="mt-2.5 flex items-center gap-2">
                <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-white/10 text-slate-200">
                  Growth Qty: <strong class="${ytd.growthPctQty >= 0 ? 'text-emerald-300' : 'text-rose-400'}">${ytd.growthPctQty >= 0 ? '+' : ''}${ytd.growthPctQty}%</strong>
                </span>
                <span class="px-2 py-0.5 rounded text-[11px] font-semibold bg-white/10 text-slate-200">
                  Growth Value: <strong class="${ytd.growthPctValue >= 0 ? 'text-emerald-300' : 'text-rose-400'}">${ytd.growthPctValue >= 0 ? '+' : ''}${ytd.growthPctValue}%</strong>
                </span>
              </div>

              <div class="grid grid-cols-2 gap-2 mt-4 pt-3 border-t border-white/10 text-xs">
                <div>
                  <div class="text-[10px] text-slate-400 uppercase tracking-wide">YTD 2025 (Jan–${asMonthName})</div>
                  <div class="font-bold font-mono text-slate-200 mt-0.5">${ytd.totalQtyYtd2025.toLocaleString('id-ID')} KTN</div>
                  <div class="text-[10px] text-indigo-200">Rp ${(ytd.totalValueYtd2025 / 1000000000).toFixed(2)} Milyar</div>
                </div>
                <div>
                  <div class="text-[10px] text-slate-400 uppercase tracking-wide">YTD 2026 (Jan–${asMonthName})</div>
                  <div class="font-bold font-mono text-emerald-300 mt-0.5">${ytd.totalQtyYtd2026.toLocaleString('id-ID')} KTN</div>
                  <div class="text-[10px] text-emerald-200">Rp ${(ytd.totalValueYtd2026 / 1000000000).toFixed(2)} Milyar</div>
                </div>
              </div>
            </div>

            <div class="mt-3 pt-2 text-[11px] text-slate-400 flex items-center justify-between border-t border-white/5">
              <span>Gap Nilai Netto (YoY):</span>
              <strong class="${ytd.diffValue >= 0 ? 'text-emerald-400' : 'text-rose-400'} font-mono">
                ${ytd.diffValue >= 0 ? '+Rp ' + (ytd.diffValue / 1000000).toFixed(1) + ' Jt' : '-Rp ' + Math.abs(ytd.diffValue / 1000000).toFixed(1) + ' Jt'}
              </strong>
            </div>
          </div>
        </div>
      </div>
      `;
    })()}

    <!-- Dedicated Outlet Trend Search Bar & Suggestion Dropdown -->
    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mt-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2">
            <i data-lucide="store" class="w-4 h-4 text-blue-600"></i>
            <h3 class="text-xs font-bold text-slate-800">Cari & Analisis Trend Toko / Outlet</h3>
          </div>
          <p class="text-[11px] text-slate-500 mt-0.5">Ketik kode atau nama outlet untuk menganalisis histori penjualan & omzet toko spesifik.</p>
        </div>

        <div class="relative w-full sm:w-80 md:w-96">
          <div class="relative flex items-center">
            <i data-lucide="search" class="w-4 h-4 absolute left-3 text-slate-400"></i>
            <input
              type="text"
              id="trend-outlet-search-input"
              autocomplete="off"
              placeholder="Cari nama toko / kode outlet..."
              value="${escapeHtml(window.trendState.outletName || '')}"
              oninput="handleTrendOutletInput(event)"
              onfocus="handleTrendOutletFocus(event)"
              class="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-8 py-2 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition"
            />
            ${window.trendState.outletId ? `
              <button type="button" onclick="clearTrendOutlet()" class="absolute right-2.5 text-slate-400 hover:text-rose-600 transition" title="Hapus Filter Toko">
                <i data-lucide="x-circle" class="w-4 h-4"></i>
              </button>
            ` : ''}
          </div>

          <!-- Dropdown Suggestions Container -->
          <div id="trend-outlet-suggestions" class="hidden absolute left-0 right-0 top-full mt-1.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto z-50 divide-y divide-slate-100 text-xs">
          </div>
        </div>
      </div>

      ${data.dsoMovement?.isOutletScope ? `
        <div class="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[10px] uppercase">Trend Outlet Aktif</span>
            <span class="text-xs font-bold text-slate-900">${data.dsoMovement.outletInfo.name}</span>
            <span class="text-[11px] font-mono text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Kode: ${data.dsoMovement.outletInfo.code}</span>
            ${data.dsoMovement.outletInfo.rayonCode ? `<span class="text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Rayon: ${data.dsoMovement.outletInfo.rayonCode}</span>` : ''}
            ${data.dsoMovement.outletInfo.salesmanName ? `<span class="text-[11px] text-slate-600 bg-slate-100 px-1.5 py-0.5 rounded">Salesman: ${data.dsoMovement.outletInfo.salesmanName}</span>` : ''}
            ${data.dsoMovement.outletInfo.clusterTier ? `<span class="text-[11px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">Cluster: ${data.dsoMovement.outletInfo.clusterTier}</span>` : ''}
          </div>
          <button type="button" onclick="clearTrendOutlet()" class="inline-flex items-center gap-1.5 px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold transition shadow-sm">
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
            <span>Kembali ke Total DSO</span>
          </button>
        </div>
      ` : ''}
    </div>

    <!-- Dedicated Card: Movement (Store Trend OR Total DSO) -->
    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-5">
      <div class="flex flex-col md:flex-row md:items-center justify-between pb-3 border-b border-slate-100 gap-3">
        <div>
          <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 ${data.dsoMovement?.isOutletScope ? 'bg-indigo-100 text-indigo-800' : 'bg-blue-100 text-blue-800'} text-[10px] font-bold rounded">
              ${data.dsoMovement?.isOutletScope ? 'TREND TOKO: ' + escapeHtml(data.dsoMovement.outletInfo.name) : 'TOTAL DSO GARUT'}
            </span>
            <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">DUAL-AXIS LINE CHART</span>
          </div>
          <h2 class="text-sm md:text-base font-bold text-slate-800 flex items-center gap-2 mt-1">
            <i data-lucide="activity" class="w-4 h-4 text-blue-600"></i>
            <span>
              ${data.dsoMovement?.isOutletScope 
                ? 'Movement Toko: ' + escapeHtml(data.dsoMovement.outletInfo.name) + (globalFilters.groupSku ? ' • Group SKU: ' + globalFilters.groupSku : '') + (globalFilters.brand ? ' • Brand: ' + globalFilters.brand : '')
                : 'Movement Total DSO: Volume (KTN) & Outlet Aktif (OA)' + (globalFilters.groupSku ? ' • Group SKU: ' + globalFilters.groupSku : '') + (globalFilters.brand ? ' • Brand: ' + globalFilters.brand : '')
              }
            </span>
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">
            ${data.dsoMovement?.isOutletScope 
              ? 'Pergerakan volume penjualan (karton) dan nilai omzet bulanan toko ' + escapeHtml(data.dsoMovement.outletInfo.name)
              : 'Pergerakan total volume penjualan (karton) dan penetrasi outlet aktif unik bulanan DSO Garut'
            }
          </p>
        </div>

        <!-- Badges summary -->
        <div class="flex flex-wrap items-center gap-2">
          <div class="bg-blue-50 border border-blue-200/60 px-3 py-1.5 rounded-lg text-left">
            <div class="text-[10px] text-blue-600 font-semibold uppercase tracking-wider">Total Volume</div>
            <div class="text-xs md:text-sm font-extrabold text-blue-900 font-mono">
              ${(data.dsoMovement?.totals?.totalVolume || summary.totalQty || 0).toLocaleString('id-ID')} <span class="text-[10px] font-normal text-slate-500">KTN</span>
            </div>
          </div>
          <div class="bg-emerald-50 border border-emerald-200/60 px-3 py-1.5 rounded-lg text-left">
            <div class="text-[10px] text-emerald-600 font-semibold uppercase tracking-wider">
              ${data.dsoMovement?.isOutletScope ? 'Total Frekuensi Order' : 'Rata-rata OA'}
            </div>
            <div class="text-xs md:text-sm font-extrabold text-emerald-900 font-mono">
              ${data.dsoMovement?.isOutletScope 
                ? (data.dsoMovement.totals.totalInvoices || 0).toLocaleString('id-ID') + ' <span class="text-[10px] font-normal text-slate-500">Order</span>'
                : (data.dsoMovement?.totals?.avgOa || summary.avgMonthlyOa || 0).toLocaleString('id-ID') + ' <span class="text-[10px] font-normal text-slate-500">Toko/bln</span>'
              }
            </div>
          </div>
          <div class="bg-indigo-50 border border-indigo-200/60 px-3 py-1.5 rounded-lg text-left">
            <div class="text-[10px] text-indigo-600 font-semibold uppercase tracking-wider">Total Omzet</div>
            <div class="text-xs md:text-sm font-extrabold text-indigo-900 font-mono">
              ${(data.dsoMovement?.totals?.totalValue || summary.totalValue || 0) >= 1000000000 
                ? 'Rp ' + (((data.dsoMovement?.totals?.totalValue || summary.totalValue || 0)) / 1000000000).toFixed(2) + ' <span class="text-[10px] font-normal text-slate-500">M</span>'
                : 'Rp ' + (((data.dsoMovement?.totals?.totalValue || summary.totalValue || 0)) / 1000000).toFixed(1) + ' <span class="text-[10px] font-normal text-slate-500">Jt</span>'
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Line Chart Total DSO -->
      <div class="mt-4 relative" style="min-height: 290px;">
        <canvas id="trendDsoCanvas"></canvas>
      </div>

      <!-- Tabel Kecil: Angka Bulanan Movement Total DSO -->
      <div class="mt-5 pt-4 border-t border-slate-100">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-3">
          <h3 class="text-xs font-bold text-slate-700 flex items-center gap-1.5">
            <i data-lucide="table" class="w-3.5 h-3.5 text-blue-600"></i>
            <span>
              ${data.dsoMovement?.isOutletScope 
                ? 'Tabel Ringkasan Angka Movement Bulanan: ' + escapeHtml(data.dsoMovement.outletInfo.name)
                : 'Tabel Ringkasan Angka Movement Bulanan Total DSO'
              }
            </span>
          </h3>
          <span class="text-[11px] text-slate-400">
            ${data.dsoMovement?.isOutletScope 
              ? 'Rincian per bulan volume, frekuensi transaksi, dan omzet toko'
              : 'Rincian per bulan volume, target, gap, OA, dan omzet'
            }
          </span>
        </div>

        <div class="overflow-x-auto scrollbar-thin rounded-lg border border-slate-200">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 select-none">
              <tr>
                <th class="py-2.5 px-3 text-center w-10">No</th>
                <th class="py-2.5 px-3">Periode</th>
                <th class="py-2.5 px-3 text-right">Volume (KTN)</th>
                <th class="py-2.5 px-3 text-right">MoM Vol (%)</th>
                ${data.dsoMovement?.isOutletScope ? `
                  <th class="py-2.5 px-3 text-right">Frekuensi Order</th>
                  <th class="py-2.5 px-3 text-right">Nilai Omzet (Rp Netto)</th>
                  <th class="py-2.5 px-3 text-right text-emerald-800 bg-emerald-50/50">MoM Omzet (%)</th>
                ` : `
                  <th class="py-2.5 px-3 text-right">Target (KTN)</th>
                  <th class="py-2.5 px-3 text-right">Pencapaian</th>
                  <th class="py-2.5 px-3 text-right text-emerald-800 bg-emerald-50/50">Outlet Aktif (OA)</th>
                  <th class="py-2.5 px-3 text-right">MoM OA (%)</th>
                  <th class="py-2.5 px-3 text-right">Nilai Omzet (Rp Netto)</th>
                `}
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700 font-medium">
              ${(data.dsoMovement?.monthlyTable || []).map((m, idx) => {
                const momVolBadge = m.momVolPct !== null
                  ? `<span class="inline-flex items-center font-mono text-[11px] font-semibold ${m.momVolPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${m.momVolPct >= 0 ? '▲ +' : '▼ '}${m.momVolPct}%</span>`
                  : `<span class="text-slate-300">—</span>`;

                const isCurrentMonth = m.year === 2026 && m.month === 9;

                if (data.dsoMovement?.isOutletScope) {
                  const momValBadge = m.momValPct !== null
                    ? `<span class="inline-flex items-center font-mono text-[11px] font-semibold ${m.momValPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${m.momValPct >= 0 ? '▲ +' : '▼ '}${m.momValPct}%</span>`
                    : `<span class="text-slate-300">—</span>`;

                  return `
                    <tr class="hover:bg-slate-50/80 transition ${isCurrentMonth ? 'bg-blue-50/30' : ''}">
                      <td class="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">${idx + 1}</td>
                      <td class="py-2 px-3 font-bold text-slate-900 whitespace-nowrap">
                        ${m.label}
                        ${isCurrentMonth ? '<span class="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-extrabold rounded">MTD</span>' : ''}
                      </td>
                      <td class="py-2 px-3 text-right font-mono font-bold text-blue-900">
                        ${m.volumeCartons.toLocaleString('id-ID')}
                      </td>
                      <td class="py-2 px-3 text-right">
                        ${momVolBadge}
                      </td>
                      <td class="py-2 px-3 text-right font-mono text-slate-700">
                        ${m.totalInvoices || 0} Invoice
                      </td>
                      <td class="py-2 px-3 text-right font-mono text-slate-800 font-bold whitespace-nowrap">
                        Rp ${m.volumeValue.toLocaleString('id-ID')}
                      </td>
                      <td class="py-2 px-3 text-right font-mono bg-emerald-50/20">
                        ${momValBadge}
                      </td>
                    </tr>
                  `;
                }

                const momOaBadge = m.momOaPct !== null
                  ? `<span class="inline-flex items-center font-mono text-[11px] font-semibold ${m.momOaPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${m.momOaPct >= 0 ? '▲ +' : '▼ '}${m.momOaPct}%</span>`
                  : `<span class="text-slate-300">—</span>`;

                const achvBadge = m.achvPct !== null
                  ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono ${m.achvPct >= 100 ? 'bg-emerald-100 text-emerald-800' : m.achvPct >= 70 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}">${m.achvPct}%</span>`
                  : `<span class="text-slate-300">—</span>`;

                return `
                  <tr class="hover:bg-slate-50/80 transition ${isCurrentMonth ? 'bg-blue-50/30' : ''}">
                    <td class="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">${idx + 1}</td>
                    <td class="py-2 px-3 font-bold text-slate-900 whitespace-nowrap">
                      ${m.label}
                      ${isCurrentMonth ? '<span class="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-extrabold rounded">MTD</span>' : ''}
                    </td>
                    <td class="py-2 px-3 text-right font-mono font-bold text-blue-900">
                      ${m.volumeCartons.toLocaleString('id-ID')}
                    </td>
                    <td class="py-2 px-3 text-right">
                      ${momVolBadge}
                    </td>
                    <td class="py-2 px-3 text-right font-mono text-slate-600">
                      ${m.targetCartons > 0 ? m.targetCartons.toLocaleString('id-ID') : '<span class="text-slate-300">—</span>'}
                    </td>
                    <td class="py-2 px-3 text-right">
                      ${achvBadge}
                    </td>
                    <td class="py-2 px-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">
                      ${m.activeOutlets.toLocaleString('id-ID')} <span class="text-[10px] font-normal text-slate-400">Toko</span>
                    </td>
                    <td class="py-2 px-3 text-right">
                      ${momOaBadge}
                    </td>
                    <td class="py-2 px-3 text-right font-mono text-slate-800 whitespace-nowrap">
                      ${m.volumeValue >= 1000000000 ? 'Rp ' + (m.volumeValue / 1000000000).toFixed(2) + ' M' : 'Rp ' + (m.volumeValue / 1000000).toFixed(1) + ' Jt'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot class="bg-slate-100 text-slate-800 font-bold border-t-2 border-slate-300">
              <tr>
                <td colspan="2" class="py-2.5 px-3 font-extrabold text-slate-900 text-center uppercase tracking-wider text-[11px]">
                  TOTAL / RATA-RATA
                </td>
                <td class="py-2.5 px-3 text-right font-mono font-extrabold text-blue-950">
                  ${(data.dsoMovement?.totals?.totalVolume || 0).toLocaleString('id-ID')}
                </td>
                <td class="py-2.5 px-3 text-right text-slate-400">—</td>
                ${data.dsoMovement?.isOutletScope ? `
                  <td class="py-2.5 px-3 text-right font-mono text-slate-700">
                    ${(data.dsoMovement?.totals?.totalInvoices || 0).toLocaleString('id-ID')} Inv
                  </td>
                  <td class="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900 whitespace-nowrap">
                    Rp ${(data.dsoMovement?.totals?.totalValue || 0).toLocaleString('id-ID')}
                  </td>
                  <td class="py-2.5 px-3 text-right text-slate-400">—</td>
                ` : `
                  <td class="py-2.5 px-3 text-right font-mono text-slate-700">
                    ${(data.dsoMovement?.totals?.totalTarget || 0).toLocaleString('id-ID')}
                  </td>
                  <td class="py-2.5 px-3 text-right">
                    ${data.dsoMovement?.totals?.achvPct !== null ? `<span class="px-2 py-0.5 bg-blue-100 text-blue-900 rounded font-mono text-[10px] font-bold">${data.dsoMovement.totals.achvPct}%</span>` : '—'}
                  </td>
                  <td class="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-900 bg-emerald-100/50">
                    ${(data.dsoMovement?.totals?.avgOa || 0).toLocaleString('id-ID')} <span class="text-[10px] font-normal text-slate-600">Avg/bln</span>
                  </td>
                  <td class="py-2.5 px-3 text-right text-slate-400">—</td>
                  <td class="py-2.5 px-3 text-right font-mono font-extrabold text-slate-900 whitespace-nowrap">
                    Rp ${(((data.dsoMovement?.totals?.totalValue || 0)) / 1000000000).toFixed(2)} M
                  </td>
                `}
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>

    <!-- Control Toolbar (Dimensions, Metrics, Period) -->
    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mt-5 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <!-- Dimension Switcher -->
        <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <span class="text-slate-400 px-2 text-[11px]">Dimensi:</span>
          <button onclick="switchTrendDimension('salesman')" class="px-3 py-1.5 rounded-md transition ${dimension === 'salesman' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
            By Salesman
          </button>
          <button onclick="switchTrendDimension('principal')" class="px-3 py-1.5 rounded-md transition ${dimension === 'principal' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
            By Principal
          </button>
          <button onclick="switchTrendDimension('brand')" class="px-3 py-1.5 rounded-md transition ${dimension === 'brand' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
            By Brand
          </button>
        </div>

        <!-- Metric Switcher -->
        <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <span class="text-slate-400 px-2 text-[11px]">Metrik:</span>
          <button onclick="switchTrendMetric('qty')" class="px-3 py-1.5 rounded-md transition ${metric === 'qty' ? 'bg-blue-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
            Volume (KTN)
          </button>
          <button onclick="switchTrendMetric('value')" class="px-3 py-1.5 rounded-md transition ${metric === 'value' ? 'bg-blue-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
            Nilai (Rp Netto)
          </button>
          <button onclick="switchTrendMetric('oa')" class="px-3 py-1.5 rounded-md transition ${metric === 'oa' ? 'bg-blue-600 text-white shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
            Outlet Aktif (OA)
          </button>
        </div>

        <!-- Period Range Switcher -->
        <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <span class="text-slate-400 px-2 text-[11px]">Periode:</span>
          <button onclick="switchTrendPeriod('2026')" class="px-3 py-1.5 rounded-md transition ${periodRange === '2026' ? 'bg-white text-emerald-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
            2026 (Jan–Sep)
          </button>
          <button onclick="switchTrendPeriod('all')" class="px-3 py-1.5 rounded-md transition ${periodRange === 'all' ? 'bg-white text-emerald-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
            2025–2026 (Full)
          </button>
          <button onclick="switchTrendPeriod('2025')" class="px-3 py-1.5 rounded-md transition ${periodRange === '2025' ? 'bg-white text-emerald-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
            2025 (Historis)
          </button>
        </div>

        <!-- Chart Type Switcher -->
        <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs font-semibold">
          <button onclick="switchTrendChartType('bar')" class="px-2.5 py-1 rounded ${chartType === 'bar' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}" title="Tampilan Batang">
            <i data-lucide="bar-chart-2" class="w-4 h-4"></i>
          </button>
          <button onclick="switchTrendChartType('line')" class="px-2.5 py-1 rounded ${chartType === 'line' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}" title="Tampilan Garis">
            <i data-lucide="line-chart" class="w-4 h-4"></i>
          </button>
        </div>
      </div>
    </div>

    <!-- Main Movement Chart Card -->
    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
        <div>
          <h2 class="text-sm md:text-base font-bold text-slate-800 flex items-center gap-2">
            <i data-lucide="trending-up" class="w-4 h-4 text-blue-600"></i>
            <span>Grafik Movement Penjualan ${dimLabel} (${metricLabel})</span>
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">Pergerakan per bulan untuk Top Entitas dan Target 2026</p>
        </div>
      </div>

      <div class="mt-4 relative" style="min-height: 320px;">
        <canvas id="trendMovementCanvas"></canvas>
      </div>
    </div>

    <!-- Secondary Chart: Outlet Aktif (OA) Movement -->
    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-5">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
        <div>
          <h2 class="text-sm md:text-base font-bold text-slate-800 flex items-center gap-2">
            <i data-lucide="store" class="w-4 h-4 text-emerald-600"></i>
            <span>Grafik Penetrasi Outlet Aktif (OA) Bulanan ${dimLabel}</span>
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">Jumlah toko/outlet unik yang bertransaksi setiap bulannya</p>
        </div>
      </div>

      <div class="mt-4 relative" style="min-height: 250px;">
        <canvas id="trendOaCanvas"></canvas>
      </div>
    </div>

    <!-- Data Matrix Breakdown Table -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm mt-5 overflow-hidden">
      <div class="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
            <i data-lucide="table" class="w-4 h-4 text-slate-600"></i>
            <span>Matriks Realisasi & Target Movement Bulanan</span>
          </h3>
          <p class="text-xs text-slate-500">Rincian per ${dimLabel} across all months with Total & Pencapaian Target</p>
        </div>

        <div class="flex items-center gap-2">
          <div class="relative">
            <i data-lucide="search" class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input type="text" oninput="handleTrendSearch(event)" placeholder="Cari ${dimLabel.toLowerCase()}..." class="bg-white border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none w-48">
          </div>
        </div>
      </div>

      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-left text-xs border-collapse">
          <thead class="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 select-none">
            <tr>
              <th class="py-2.5 px-3 text-center w-10">#</th>
              <th onclick="sortTrendMatrix('name')" class="py-2.5 px-3 cursor-pointer hover:bg-slate-200/70 transition">
                <div class="flex items-center gap-1">${dimLabel} <span>⇅</span></div>
              </th>
              ${data.timeline.map(t => `
                <th onclick="sortTrendMatrix('${t.key}')" class="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/70 transition">
                  <div class="flex items-center justify-end gap-1">${t.label} <span>⇅</span></div>
                </th>
              `).join('')}
              <th onclick="sortTrendMatrix('total')" class="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/70 transition font-extrabold text-blue-900 bg-blue-50/50">
                <div class="flex items-center justify-end gap-1">TOTAL <span>⇅</span></div>
              </th>
              <th onclick="sortTrendMatrix('targetCartons')" class="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/70 transition">
                <div class="flex items-center justify-end gap-1">TARGET '26 <span>⇅</span></div>
              </th>
              <th onclick="sortTrendMatrix('achvPct')" class="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/70 transition">
                <div class="flex items-center justify-end gap-1">ACHV % <span>⇅</span></div>
              </th>
              <th onclick="sortTrendMatrix('momPct')" class="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-200/70 transition">
                <div class="flex items-center justify-end gap-1">MoM % <span>⇅</span></div>
              </th>
            </tr>
          </thead>
          <tbody id="trend-matrix-body" class="divide-y divide-slate-100 text-slate-700 font-medium">
            <!-- Populated dynamically -->
          </tbody>
        </table>
      </div>
    </div>
  `;

  lucide.createIcons();
  renderTrendMatrixBody();
  initTrendCharts();
}

function renderTrendMatrixBody() {
  const tbody = document.getElementById('trend-matrix-body');
  if (!tbody || !window.movementData) return;

  const data = window.movementData;
  const { metric, searchTerm, sortCol, sortDir } = window.trendState;
  let rows = [...(data.matrix || [])];

  if (searchTerm) {
    rows = rows.filter(r => (r.name || '').toLowerCase().includes(searchTerm));
  }

  // Sort rows
  rows.sort((a, b) => {
    let aVal = a[sortCol];
    let bVal = b[sortCol];
    if (sortCol.includes('-')) {
      aVal = (a.periods && a.periods[sortCol]) || 0;
      bVal = (b.periods && b.periods[sortCol]) || 0;
    }
    if (aVal === null || aVal === undefined) aVal = -999999999;
    if (bVal === null || bVal === undefined) bVal = -999999999;
    if (typeof aVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const formatVal = (v) => {
    if (v === null || v === undefined) return '-';
    if (metric === 'value') {
      if (Math.abs(v) >= 1000000) return `Rp ${(v / 1000000).toFixed(1)} Jt`;
      return `Rp ${Math.round(v).toLocaleString('id-ID')}`;
    }
    return v.toLocaleString('id-ID');
  };

  tbody.innerHTML = rows.map((r, idx) => {
    const achvColor = r.achvPct >= 90 ? 'text-emerald-600 font-bold' : r.achvPct >= 70 ? 'text-amber-600 font-bold' : r.achvPct !== null ? 'text-rose-600 font-bold' : 'text-slate-400';
    const momColor = r.momPct > 0 ? 'text-emerald-600 font-semibold' : r.momPct < 0 ? 'text-rose-600 font-semibold' : 'text-slate-400';

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">${idx + 1}</td>
        <td class="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">
          ${r.name}
        </td>
        ${data.timeline.map(t => {
          const val = r.periods ? r.periods[t.key] : 0;
          return `
            <td class="py-2.5 px-3 text-right font-mono text-[11px] text-slate-800">
              ${val > 0 ? formatVal(val) : '<span class="text-slate-300">—</span>'}
            </td>
          `;
        }).join('')}
        <td class="py-2.5 px-3 text-right font-mono font-extrabold text-blue-800 bg-blue-50/40">
          ${formatVal(r.total)}
        </td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-600">
          ${r.targetCartons > 0 ? r.targetCartons.toLocaleString('id-ID') : '<span class="text-slate-400">—</span>'}
        </td>
        <td class="py-2.5 px-3 text-right font-mono ${achvColor}">
          ${r.achvPct !== null ? `${r.achvPct}%` : '—'}
        </td>
        <td class="py-2.5 px-3 text-right font-mono text-[11px] ${momColor}">
          ${r.momPct !== null ? `${r.momPct > 0 ? '+' : ''}${r.momPct}%` : '—'}
        </td>
      </tr>
    `;
  }).join('');
}

function initTrendCharts() {
  const data = window.movementData;
  if (!data || !window.Chart) return;

  const { metric, chartType } = window.trendState;

  // Destroy previous instances
  if (window.trendDsoChartInstance) {
    window.trendDsoChartInstance.destroy();
    window.trendDsoChartInstance = null;
  }
  if (window.trendChartInstance) {
    window.trendChartInstance.destroy();
    window.trendChartInstance = null;
  }
  if (window.trendOaChartInstance) {
    window.trendOaChartInstance.destroy();
    window.trendOaChartInstance = null;
  }

  // 0. DSO Total Movement Chart (Dual-Axis: Volume KTN & Outlet Aktif OA OR Omzet Toko)
  const ctxDso = document.getElementById('trendDsoCanvas');
  if (ctxDso && data.dsoMovement) {
    const isOutletScope = !!data.dsoMovement.isOutletScope;
    let dsoDatasets = [];

    if (isOutletScope) {
      dsoDatasets = [
        {
          type: 'line',
          label: 'Volume Toko (KTN)',
          data: data.dsoMovement.volumeSeries,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.12)',
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#2563eb',
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Nilai Omzet Toko (Rp Netto)',
          data: data.dsoMovement.valSeries,
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.08)',
          borderWidth: 3,
          fill: false,
          tension: 0.3,
          pointRadius: 5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#059669',
          yAxisID: 'y1'
        }
      ];
    } else {
      dsoDatasets = [
        {
          type: 'line',
          label: 'Volume Penjualan (KTN)',
          data: data.dsoMovement.volumeSeries,
          borderColor: '#2563eb',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
          borderWidth: 3,
          fill: true,
          tension: 0.3,
          pointRadius: 4.5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#2563eb',
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Outlet Aktif (OA Toko)',
          data: data.dsoMovement.oaSeries,
          borderColor: '#059669',
          backgroundColor: 'rgba(5, 150, 105, 0.08)',
          borderWidth: 3,
          fill: false,
          tension: 0.3,
          pointRadius: 4.5,
          pointHoverRadius: 7,
          pointBackgroundColor: '#059669',
          yAxisID: 'y1'
        }
      ];

      if (data.dsoMovement.targetSeries && data.dsoMovement.targetSeries.some(t => t > 0)) {
        dsoDatasets.push({
          type: 'line',
          label: 'Target Volume (KTN)',
          data: data.dsoMovement.targetSeries,
          borderColor: '#dc2626',
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false,
          tension: 0.1,
          pointRadius: 3,
          pointHoverRadius: 6,
          pointBackgroundColor: '#dc2626',
          yAxisID: 'y'
        });
      }
    }

    window.trendDsoChartInstance = new Chart(ctxDso, {
      type: 'line',
      data: {
        labels: data.dsoMovement.labels,
        datasets: dsoDatasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 14,
              font: { size: 11, family: 'Plus Jakarta Sans', weight: 'bold' }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || '';
                const val = context.parsed.y;
                if (context.dataset.yAxisID === 'y1') {
                  if (isOutletScope) {
                    return `${label}: Rp ${Math.round(val).toLocaleString('id-ID')}`;
                  }
                  return `${label}: ${val.toLocaleString('id-ID')} Toko`;
                }
                return `${label}: ${val.toLocaleString('id-ID')} KTN`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11, weight: 'bold' } }
          },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            title: {
              display: true,
              text: isOutletScope ? 'Volume Toko (Karton)' : 'Volume (Karton)',
              font: { size: 11, weight: 'bold', family: 'Plus Jakarta Sans' },
              color: '#2563eb'
            },
            ticks: {
              font: { size: 11 },
              callback: function(val) {
                return val.toLocaleString('id-ID');
              }
            }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            title: {
              display: true,
              text: isOutletScope ? 'Nilai Omzet (Rp Netto)' : 'Outlet Aktif (Toko Unik)',
              font: { size: 11, weight: 'bold', family: 'Plus Jakarta Sans' },
              color: '#059669'
            },
            ticks: {
              font: { size: 11 },
              callback: function(val) {
                if (isOutletScope) {
                  if (Math.abs(val) >= 1000000000) return (val / 1000000000).toFixed(1) + 'M';
                  if (Math.abs(val) >= 1000000) return (val / 1000000).toFixed(0) + 'Jt';
                  return 'Rp ' + val.toLocaleString('id-ID');
                }
                return val.toLocaleString('id-ID');
              }
            }
          }
        }
      }
    });
  }

  // 1. Movement Chart
  const ctxMovement = document.getElementById('trendMovementCanvas');
  if (ctxMovement) {
    const datasets = data.chart.series.map(s => ({
      label: s.name,
      data: s.data,
      backgroundColor: s.color + (chartType === 'line' ? '20' : 'CC'),
      borderColor: s.color,
      borderWidth: chartType === 'line' ? 2.5 : 1,
      fill: chartType === 'line' ? false : true,
      tension: 0.3
    }));

    // Add target line if target exists
    if (data.chart.monthlyTargets && data.chart.monthlyTargets.some(t => t > 0)) {
      datasets.unshift({
        type: 'line',
        label: 'Target Bulanan 2026',
        data: data.chart.monthlyTargets,
        borderColor: '#dc2626',
        borderWidth: 2,
        borderDash: [5, 5],
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 6
      });
    }

    window.trendChartInstance = new Chart(ctxMovement, {
      type: chartType,
      data: {
        labels: data.chart.labels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              font: { size: 11, family: 'Plus Jakarta Sans' }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                let label = context.dataset.label || '';
                if (label) label += ': ';
                const val = context.parsed.y;
                if (metric === 'value') {
                  return label + 'Rp ' + Math.round(val).toLocaleString('id-ID');
                } else if (metric === 'oa') {
                  return label + val.toLocaleString('id-ID') + ' Toko';
                }
                return label + val.toLocaleString('id-ID') + ' KTN';
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            ticks: {
              font: { size: 11 },
              callback: function(value) {
                if (metric === 'value') {
                  if (Math.abs(value) >= 1000000000) return (value / 1000000000).toFixed(1) + 'M';
                  if (Math.abs(value) >= 1000000) return (value / 1000000).toFixed(0) + 'Jt';
                }
                return value.toLocaleString('id-ID');
              }
            }
          }
        }
      }
    });
  }

  // 2. OA Movement Chart
  const ctxOa = document.getElementById('trendOaCanvas');
  if (ctxOa && data.oaChart) {
    const oaDatasets = data.oaChart.series.map(s => ({
      label: s.name,
      data: s.data,
      borderColor: s.color,
      backgroundColor: s.color + '20',
      borderWidth: 2,
      fill: false,
      tension: 0.3,
      pointRadius: 2.5
    }));

    window.trendOaChartInstance = new Chart(ctxOa, {
      type: 'line',
      data: {
        labels: data.oaChart.labels,
        datasets: oaDatasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: {
            position: 'top',
            labels: {
              boxWidth: 12,
              font: { size: 11, family: 'Plus Jakarta Sans' }
            }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                return (context.dataset.label || '') + ': ' + context.parsed.y.toLocaleString('id-ID') + ' Toko Aktif';
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: {
              callback: function(val) { return val.toLocaleString('id-ID'); }
            }
          }
        }
      }
    });
  }
}

// -------------------------------------------------------------
// Trend Toko Autocomplete & Outlet Movement Handlers
// -------------------------------------------------------------
let trendOutletDebounceTimer = null;

async function handleTrendOutletInput(e) {
  const val = (e && e.target ? e.target.value : '').trim();
  const dropdown = document.getElementById('trend-outlet-suggestions');
  if (!dropdown) return;

  if (val.length < 2) {
    dropdown.innerHTML = '';
    dropdown.classList.add('hidden');
    return;
  }

  clearTimeout(trendOutletDebounceTimer);
  trendOutletDebounceTimer = setTimeout(async () => {
    try {
      dropdown.innerHTML = `
        <div class="p-3 text-center text-slate-400">
          <i data-lucide="loader-2" class="w-4 h-4 animate-spin inline mr-1 text-blue-600"></i> Mencari outlet...
        </div>
      `;
      dropdown.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();

      const res = await fetch(`/api/outlets/search-suggestions?q=${encodeURIComponent(val)}`);
      if (!res.ok) throw new Error('Gagal mengambil saran');
      const data = await res.json();
      const suggestions = data.suggestions || [];

      if (suggestions.length === 0) {
        dropdown.innerHTML = `
          <div class="p-4 text-center text-slate-500">
            <p class="font-bold text-slate-700">Outlet tidak ditemukan</p>
            <p class="text-[11px] text-slate-400 mt-0.5">Tidak ada outlet yang cocok dengan "${escapeHtml(val)}"</p>
          </div>
        `;
        return;
      }

      dropdown.innerHTML = suggestions.map(s => {
        const highlightedName = highlightSearchMatch(s.outlet_name, val);
        const highlightedCode = highlightSearchMatch(s.outlet_code, val);

        return `
          <div
            onclick="selectTrendOutlet('${s.outlet_id}', '${escapeHtml(s.outlet_name).replace(/'/g, "\\'")}', '${escapeHtml(s.outlet_code).replace(/'/g, "\\'")}')"
            class="p-2.5 hover:bg-blue-50/80 cursor-pointer transition flex items-center justify-between gap-2"
          >
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-1.5 flex-wrap">
                <span class="font-bold text-slate-800 text-xs">${highlightedName}</span>
                <span class="px-1.5 py-0.5 bg-slate-100 text-slate-600 font-mono text-[10px] rounded">Kode: ${highlightedCode}</span>
                ${s.rayon_code ? `<span class="px-1.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-semibold rounded">${escapeHtml(s.rayon_code)}</span>` : ''}
              </div>
              <div class="text-[10px] text-slate-400 mt-0.5 flex items-center gap-2 truncate">
                ${s.salesman_name ? `<span>Sales: <strong class="text-slate-600 font-normal">${escapeHtml(s.salesman_name)}</strong></span>` : ''}
                ${s.kecamatan ? `<span>• Kec: ${escapeHtml(s.kecamatan)}</span>` : ''}
                ${s.cluster_tier ? `<span class="px-1 bg-amber-50 text-amber-700 rounded">${escapeHtml(s.cluster_tier)}</span>` : ''}
              </div>
            </div>
            <div class="shrink-0 text-right">
              <span class="inline-flex items-center gap-1 px-2 py-1 bg-blue-50 text-blue-700 hover:bg-blue-600 hover:text-white rounded text-[11px] font-bold transition">
                <span>Pilih</span>
                <i data-lucide="chevron-right" class="w-3 h-3"></i>
              </span>
            </div>
          </div>
        `;
      }).join('');
      dropdown.classList.remove('hidden');
      if (window.lucide) lucide.createIcons();
    } catch (err) {
      dropdown.innerHTML = `<div class="p-3 text-rose-500 text-center">Gagal memuat saran: ${err.message}</div>`;
    }
  }, 200);
}

function handleTrendOutletFocus(e) {
  const val = (e && e.target ? e.target.value : '').trim();
  if (val.length >= 2) {
    handleTrendOutletInput(e);
  }
}

function selectTrendOutlet(outletId, outletName, outletCode) {
  window.trendState.outletId = outletId;
  window.trendState.outletName = outletName;
  const dropdown = document.getElementById('trend-outlet-suggestions');
  if (dropdown) dropdown.classList.add('hidden');
  renderTrend();
}

function clearTrendOutlet() {
  window.trendState.outletId = '';
  window.trendState.outletName = '';
  const input = document.getElementById('trend-outlet-search-input');
  if (input) input.value = '';
  const dropdown = document.getElementById('trend-outlet-suggestions');
  if (dropdown) dropdown.classList.add('hidden');
  renderTrend();
}

// Close trend outlet suggestions on outside click
document.addEventListener('click', (e) => {
  const dropdown = document.getElementById('trend-outlet-suggestions');
  const input = document.getElementById('trend-outlet-search-input');
  if (dropdown && !dropdown.classList.contains('hidden')) {
    if (input && (input === e.target || input.contains(e.target))) return;
    if (dropdown.contains(e.target)) return;
    dropdown.classList.add('hidden');
  }
});

// ==============================================================
// 4b. SUMMARY & TOTAL PERFORMANCE ANALYTICS (DSO, SALESMAN, SUBBRAND)
// ==============================================================
window.performanceState = {
  activeView: 'dso', // 'dso', 'salesman', 'subbrand'
  searchTerm: '',
  salesmanSortCol: 'actualCartons',
  salesmanSortDir: 'desc',
  subbrandSortCol: 'actualCartons',
  subbrandSortDir: 'desc',
  filterPrincipal: '',
  filterBrand: ''
};

window.perfChartInstance = null;
window.perfMixChartInstance = null;

async function renderPerformance() {
  const main = document.getElementById('main-content');
  try {
    const res = await fetch(`/api/analytics/total-performance?${getFilterQuery()}`);
    if (!res.ok) throw new Error('Gagal memuat data Total Performance');
    const data = await res.json();
    window.performanceData = data;

    renderPerformanceView();
  } catch (err) {
    main.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Gagal memuat Summary Performance: ${err.message}</div>`;
  }
}

function switchPerformanceView(view) {
  window.performanceState.activeView = view;
  window.performanceState.searchTerm = '';
  renderPerformanceView();
}

function exportPerformanceCsvAction() {
  const view = window.performanceState.activeView;
  window.location.href = `/api/analytics/total-performance/export?${getFilterQuery()}&view=${view}`;
}

function handlePerformanceSearch(e) {
  window.performanceState.searchTerm = (e.target.value || '').toLowerCase();
  renderPerformanceView();
}

function sortPerformanceSalesman(col) {
  if (window.performanceState.salesmanSortCol === col) {
    window.performanceState.salesmanSortDir = window.performanceState.salesmanSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    window.performanceState.salesmanSortCol = col;
    window.performanceState.salesmanSortDir = 'desc';
  }
  renderPerformanceView();
}

function sortPerformanceSubbrand(col) {
  if (window.performanceState.subbrandSortCol === col) {
    window.performanceState.subbrandSortDir = window.performanceState.subbrandSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    window.performanceState.subbrandSortCol = col;
    window.performanceState.subbrandSortDir = 'desc';
  }
  renderPerformanceView();
}

function renderPerformanceView() {
  const main = document.getElementById('main-content');
  const data = window.performanceData;
  if (!data) return;

  const { activeView, searchTerm, salesmanSortCol, salesmanSortDir, subbrandSortCol, subbrandSortDir } = window.performanceState;
  const kpis = data.kpis || {};
  const cal = kpis.calendar || {};

  // Build active filter tags
  const activeTags = [];
  if (globalFilters.year && globalFilters.month) activeTags.push(`Periode: ${kpis.month === 9 ? 'September' : 'Bulan ' + kpis.month} ${kpis.year}`);
  if (globalFilters.spvId) activeTags.push(`SPV: ${globalFilters.spvId}`);
  if (globalFilters.salesGroup) activeTags.push(`Group: ${globalFilters.salesGroup}`);
  if (globalFilters.salesmanId) activeTags.push(`Salesman: ${globalFilters.salesmanId}`);
  if (globalFilters.rayonId) activeTags.push(`Rayon: ${globalFilters.rayonId}`);
  if (globalFilters.principal) activeTags.push(`Principal: ${globalFilters.principal}`);
  if (globalFilters.brand) activeTags.push(`Brand: ${globalFilters.brand}`);
  if (globalFilters.subbrand) activeTags.push(`Subbrand: ${globalFilters.subbrand}`);
  if (globalFilters.groupSku) activeTags.push(`Group SKU: ${globalFilters.groupSku}`);
  if (globalFilters.kecamatanId) activeTags.push(`Kecamatan: ${globalFilters.kecamatanId}`);

  let contentHtml = '';

  if (activeView === 'dso') {
    // -------------------------------------------------------------
    // TAB 1: TOTAL DSO GARUT
    // -------------------------------------------------------------
    const dsoMonthly = data.dsoMonthly || [];
    const brandMix = data.brandMix || [];

    contentHtml = `
      <!-- 6 High-Impact KPI Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
        <!-- 1. Target KTN -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Target KTN</span>
            <i data-lucide="target" class="w-3.5 h-3.5 text-blue-500"></i>
          </div>
          <p class="text-base sm:text-lg font-bold text-slate-800 font-mono">${(kpis.targetCartons || 0).toLocaleString('id-ID')}</p>
          <p class="text-[10px] text-slate-500 font-medium mt-0.5">Rp ${((kpis.targetValue || 0) / 1000000).toFixed(1)} Jt</p>
        </div>

        <!-- 2. Actual KTN -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Realisasi KTN</span>
            <i data-lucide="package-check" class="w-3.5 h-3.5 text-emerald-500"></i>
          </div>
          <p class="text-base sm:text-lg font-bold text-blue-900 font-mono">${(kpis.actualCartons || 0).toLocaleString('id-ID')}</p>
          <span class="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${kpis.achievementPct >= (cal.timegonePct || 80) ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'} mt-0.5">
            ${kpis.achievementPct !== null ? kpis.achievementPct + '% Capaian' : 'N/A'}
          </span>
        </div>

        <!-- 3. GAP Target -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Sisa GAP Target</span>
            <i data-lucide="trending-down" class="w-3.5 h-3.5 text-rose-500"></i>
          </div>
          <p class="text-base sm:text-lg font-bold text-rose-600 font-mono">${(kpis.remainingTarget || 0).toLocaleString('id-ID')}</p>
          <p class="text-[10px] text-slate-500 font-medium mt-0.5">${(kpis.gapDaily || 0).toLocaleString('id-ID')} KTN/hr</p>
        </div>

        <!-- 4. Omzet Netto -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Nilai Omzet Netto</span>
            <i data-lucide="banknote" class="w-3.5 h-3.5 text-indigo-500"></i>
          </div>
          <p class="text-base sm:text-lg font-bold text-slate-800 font-mono">Rp ${((kpis.salesNetto || 0) / 1000000).toFixed(1)} Jt</p>
          <p class="text-[10px] text-slate-400 mt-0.5">DPP: Rp ${((kpis.salesDpp || 0) / 1000000).toFixed(1)} Jt</p>
        </div>

        <!-- 5. Outlet Aktif MTD -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Outlet Aktif (OA)</span>
            <i data-lucide="store" class="w-3.5 h-3.5 text-teal-500"></i>
          </div>
          <p class="text-base sm:text-lg font-bold text-emerald-800 font-mono">${(kpis.activeOutletsMtd || 0).toLocaleString('id-ID')} <span class="text-xs font-normal text-slate-400">Toko</span></p>
          <p class="text-[10px] text-slate-500 font-medium mt-0.5">Coverage: <strong class="text-emerald-700">${kpis.coveragePct}%</strong> / ${(kpis.registeredOutlets || 0).toLocaleString('id-ID')} CL</p>
        </div>

        <!-- 6. Pace Operasional -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <div class="flex items-center justify-between text-slate-500 mb-1">
            <span class="text-[11px] font-semibold uppercase">Pace Operasional</span>
            <i data-lucide="clock" class="w-3.5 h-3.5 text-amber-500"></i>
          </div>
          <p class="text-base sm:text-lg font-bold text-slate-800 font-mono">${cal.monFriAsOfHke || cal.asOfHke || 20} / ${cal.monFriTotalHk || cal.totalHk || 25} HK</p>
          <p class="text-[10px] font-medium mt-0.5 text-amber-700">Timegone: ${(cal.timegonePct || 80)}% (Sisa ${cal.monFriRemainingHk || cal.remainingHk || 5} HK)</p>
        </div>
      </div>

      <!-- Dual-Axis Line Chart: Target vs Realisasi Karton & Outlet Aktif -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <div>
            <div class="flex items-center gap-2">
              <span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">TOTAL DSO GARUT</span>
              <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">TREND 2026</span>
            </div>
            <h3 class="text-sm font-bold text-slate-800 mt-1 flex items-center gap-2">
              <i data-lucide="line-chart" class="w-4 h-4 text-blue-600"></i>
              <span>Grafik Pergerakan Bulanan: Target vs Realisasi (KTN) & Outlet Aktif (OA)</span>
            </h3>
          </div>
          <div class="text-xs text-slate-400">
            Data aktual Jan – Sep 2026 DSO Garut
          </div>
        </div>

        <div class="mt-4 relative" style="min-height: 280px;">
          <canvas id="perfDsoCanvas"></canvas>
        </div>
      </div>

      <!-- Tabel Rincian Bulanan Total DSO -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2 mb-3">
          <h3 class="text-xs font-bold text-slate-800 flex items-center gap-2">
            <i data-lucide="table" class="w-4 h-4 text-emerald-600"></i>
            <span>Tabel Ringkasan Angka Bulanan Total DSO (Tahun 2026)</span>
          </h3>
          <span class="text-xs text-slate-400">Menampilkan target, realisasi, pencapaian %, pertumbuhan MoM, OA, dan omzet</span>
        </div>

        <div class="overflow-x-auto scrollbar-thin rounded-lg border border-slate-200">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 select-none">
              <tr>
                <th class="py-2.5 px-3 text-center w-10">No</th>
                <th class="py-2.5 px-3">Periode</th>
                <th class="py-2.5 px-3 text-right">Target (KTN)</th>
                <th class="py-2.5 px-3 text-right">Realisasi (KTN)</th>
                <th class="py-2.5 px-3 text-right">Capaian (%)</th>
                <th class="py-2.5 px-3 text-right">MoM Vol (%)</th>
                <th class="py-2.5 px-3 text-right text-emerald-800 bg-emerald-50/50">Outlet Aktif (OA)</th>
                <th class="py-2.5 px-3 text-right">MoM OA (%)</th>
                <th class="py-2.5 px-3 text-right">Nilai Omzet (Rp Netto)</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700 font-medium">
              ${dsoMonthly.map((m, idx) => {
                const momVolBadge = m.momVolPct !== null
                  ? `<span class="inline-flex items-center font-mono text-[11px] font-semibold ${m.momVolPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${m.momVolPct >= 0 ? '▲ +' : '▼ '}${m.momVolPct}%</span>`
                  : `<span class="text-slate-300">—</span>`;

                const momOaBadge = m.momOaPct !== null
                  ? `<span class="inline-flex items-center font-mono text-[11px] font-semibold ${m.momOaPct >= 0 ? 'text-emerald-600' : 'text-rose-600'}">${m.momOaPct >= 0 ? '▲ +' : '▼ '}${m.momOaPct}%</span>`
                  : `<span class="text-slate-300">—</span>`;

                const achvBadge = m.achievementPct !== null
                  ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono ${m.achievementPct >= 100 ? 'bg-emerald-100 text-emerald-800' : m.achievementPct >= 70 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'}">${m.achievementPct}%</span>`
                  : `<span class="text-slate-300">—</span>`;

                return `
                  <tr class="hover:bg-slate-50/80 transition ${m.isCurrentMonth ? 'bg-blue-50/30 font-bold' : ''}">
                    <td class="py-2 px-3 text-center text-slate-400 font-mono text-[11px]">${idx + 1}</td>
                    <td class="py-2 px-3 whitespace-nowrap text-slate-900">
                      ${m.monthLabel} 2026
                      ${m.isCurrentMonth ? '<span class="ml-1.5 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-[9px] font-extrabold rounded">Bulan Berjalan</span>' : ''}
                    </td>
                    <td class="py-2 px-3 text-right font-mono text-slate-600">
                      ${m.targetCartons > 0 ? m.targetCartons.toLocaleString('id-ID') : '—'}
                    </td>
                    <td class="py-2 px-3 text-right font-mono font-bold text-blue-900">
                      ${m.actualCartons.toLocaleString('id-ID')}
                    </td>
                    <td class="py-2 px-3 text-right">
                      ${achvBadge}
                    </td>
                    <td class="py-2 px-3 text-right">
                      ${momVolBadge}
                    </td>
                    <td class="py-2 px-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">
                      ${m.activeOutlets.toLocaleString('id-ID')} <span class="text-[10px] font-normal text-slate-400">Toko</span>
                    </td>
                    <td class="py-2 px-3 text-right">
                      ${momOaBadge}
                    </td>
                    <td class="py-2 px-3 text-right font-mono text-slate-800 whitespace-nowrap">
                      ${m.salesNetto >= 1000000000 ? 'Rp ' + (m.salesNetto / 1000000000).toFixed(2) + ' M' : 'Rp ' + (m.salesNetto / 1000000).toFixed(1) + ' Jt'}
                    </td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot class="bg-slate-100 text-slate-800 font-bold border-t-2 border-slate-300">
              <tr>
                <td colspan="2" class="py-2.5 px-3 text-center uppercase tracking-wider text-[11px] font-extrabold">TOTAL 2026</td>
                <td class="py-2.5 px-3 text-right font-mono">${dsoMonthly.reduce((a, b) => a + (b.targetCartons || 0), 0).toLocaleString('id-ID')}</td>
                <td class="py-2.5 px-3 text-right font-mono font-extrabold text-blue-950">${dsoMonthly.reduce((a, b) => a + (b.actualCartons || 0), 0).toLocaleString('id-ID')}</td>
                <td class="py-2.5 px-3 text-right text-slate-400">—</td>
                <td class="py-2.5 px-3 text-right text-slate-400">—</td>
                <td class="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-900 bg-emerald-100/50">
                  ${Math.round(dsoMonthly.reduce((a, b) => a + (b.activeOutlets || 0), 0) / (dsoMonthly.length || 1)).toLocaleString('id-ID')} <span class="text-[10px] font-normal text-slate-500">Avg/bln</span>
                </td>
                <td class="py-2.5 px-3 text-right text-slate-400">—</td>
                <td class="py-2.5 px-3 text-right font-mono font-extrabold whitespace-nowrap">
                  Rp ${(dsoMonthly.reduce((a, b) => a + (b.salesNetto || 0), 0) / 1000000000).toFixed(2)} M
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  } else if (activeView === 'salesman') {
    // -------------------------------------------------------------
    // TAB 2: BY SALESMAN
    // -------------------------------------------------------------
    let salesmen = (data.bySalesman || []).slice();

    if (searchTerm) {
      salesmen = salesmen.filter(s =>
        s.salesmanName.toLowerCase().includes(searchTerm) ||
        s.spvName.toLowerCase().includes(searchTerm) ||
        s.salesGroup.toLowerCase().includes(searchTerm) ||
        s.salesmanType.toLowerCase().includes(searchTerm)
      );
    }

    salesmen = sortDataRows(salesmen, salesmanSortCol, salesmanSortDir);

    const totalTgt = salesmen.reduce((acc, s) => acc + (s.targetCartons || 0), 0);
    const totalAct = salesmen.reduce((acc, s) => acc + (s.actualCartons || 0), 0);
    const totalNet = salesmen.reduce((acc, s) => acc + (s.salesNetto || 0), 0);
    const totalOa = salesmen.reduce((acc, s) => acc + (s.activeOutlets || 0), 0);
    const totalCl = salesmen.reduce((acc, s) => acc + (s.registeredOutlets || 0), 0);
    const avgAchv = totalTgt > 0 ? Math.round((totalAct / totalTgt) * 1000) / 10 : 0;

    contentHtml = `
      <!-- Salesman Performance Overview Bar -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[11px] text-slate-500 font-semibold uppercase block">Total Salesman Aktif</span>
          <span class="text-base sm:text-lg font-bold text-slate-900 font-mono">${salesmen.length} Personel</span>
          <span class="text-[10px] text-slate-400 block mt-0.5">DSO Garut</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[11px] text-slate-500 font-semibold uppercase block">Total Realisasi Salesman</span>
          <span class="text-base sm:text-lg font-bold text-blue-900 font-mono">${totalAct.toLocaleString('id-ID')} KTN</span>
          <span class="text-[10px] text-emerald-600 font-semibold block mt-0.5">${avgAchv}% Rata-rata Capaian</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[11px] text-slate-500 font-semibold uppercase block">Total Target Tim</span>
          <span class="text-base sm:text-lg font-bold text-slate-800 font-mono">${totalTgt.toLocaleString('id-ID')} KTN</span>
          <span class="text-[10px] text-rose-500 font-medium block mt-0.5">Sisa GAP: ${Math.max(0, totalTgt - totalAct).toLocaleString('id-ID')} KTN</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[11px] text-slate-500 font-semibold uppercase block">Total Outlet Dilayani</span>
          <span class="text-base sm:text-lg font-bold text-emerald-800 font-mono">${totalOa.toLocaleString('id-ID')} OA</span>
          <span class="text-[10px] text-slate-500 block mt-0.5">dari ${totalCl.toLocaleString('id-ID')} Registered CL</span>
        </div>
      </div>

      <!-- Chart: Salesman Target vs Actual -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
            <i data-lucide="bar-chart" class="w-4 h-4 text-blue-600"></i>
            <span>Grafik Perbandingan Realisasi vs Target per Salesman (KTN)</span>
          </h3>
          <span class="text-xs text-slate-400">Diurutkan berdasarkan ranking volume penjualan</span>
        </div>

        <div class="mt-4 relative" style="min-height: 290px;">
          <canvas id="perfSalesmanCanvas"></canvas>
        </div>
      </div>

      <!-- Table: Salesman Details -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
          <div>
            <h3 class="text-xs font-bold text-slate-800 flex items-center gap-2">
              <i data-lucide="users" class="w-4 h-4 text-emerald-600"></i>
              <span>Rincian Lengkap Produktivitas Tim Salesman</span>
            </h3>
            <p class="text-[11px] text-slate-400 mt-0.5">Klik pada header kolom untuk mengurutkan data (Sort)</p>
          </div>

          <!-- Search Box -->
          <div class="w-full sm:w-64 relative">
            <input type="text" oninput="handlePerformanceSearch(event)" value="${searchTerm}" placeholder="Cari nama salesman / SPV..." class="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none">
            <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
          </div>
        </div>

        <div class="overflow-x-auto scrollbar-thin rounded-lg border border-slate-200 mt-3">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 select-none">
              <tr>
                <th class="py-2.5 px-3 text-center w-10">No</th>
                <th onclick="sortPerformanceSalesman('salesmanName')" class="py-2.5 px-3 cursor-pointer hover:bg-slate-100 transition">Salesman <i data-lucide="arrow-up-down" class="w-3 h-3 inline text-slate-400"></i></th>
                <th onclick="sortPerformanceSalesman('spvName')" class="py-2.5 px-3 cursor-pointer hover:bg-slate-100 transition">SPV <i data-lucide="arrow-up-down" class="w-3 h-3 inline text-slate-400"></i></th>
                <th class="py-2.5 px-3">Tipe</th>
                <th class="py-2.5 px-3">Group</th>
                <th onclick="sortPerformanceSalesman('targetCartons')" class="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-100 transition">Target (KTN) <i data-lucide="arrow-up-down" class="w-3 h-3 inline text-slate-400"></i></th>
                <th onclick="sortPerformanceSalesman('actualCartons')" class="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-100 transition text-blue-900">Aktual (KTN) <i data-lucide="arrow-up-down" class="w-3 h-3 inline text-slate-400"></i></th>
                <th onclick="sortPerformanceSalesman('achievementPct')" class="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-100 transition">Capaian (%) <i data-lucide="arrow-up-down" class="w-3 h-3 inline text-slate-400"></i></th>
                <th class="py-2.5 px-3 text-right">GAP (KTN)</th>
                <th class="py-2.5 px-3 text-right">GAP/hr</th>
                <th onclick="sortPerformanceSalesman('activeOutlets')" class="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-100 transition text-emerald-800 bg-emerald-50/50">OA (Toko) <i data-lucide="arrow-up-down" class="w-3 h-3 inline text-slate-400"></i></th>
                <th class="py-2.5 px-3 text-right">Coverage</th>
                <th class="py-2.5 px-3 text-center">Status Pace</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700 font-medium">
              ${salesmen.map((s, idx) => {
                const achvClass = s.achievementPct >= 80 ? 'bg-emerald-100 text-emerald-800' : s.achievementPct >= 60 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800';
                const paceBadge = s.paceStatus === 'ON_TRACK'
                  ? `<span class="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[10px] font-bold">ON TRACK</span>`
                  : s.paceStatus === 'NEEDS_ATTENTION'
                  ? `<span class="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[10px] font-bold">ATTENTION</span>`
                  : `<span class="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[10px] font-bold">BEHIND</span>`;

                return `
                  <tr class="hover:bg-slate-50/80 transition">
                    <td class="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">${idx + 1}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap">
                      <div class="font-bold text-slate-900">${s.salesmanName}</div>
                      <div class="text-[10px] text-slate-400 font-mono">ID: ${s.salesmanId}</div>
                    </td>
                    <td class="py-2.5 px-3 whitespace-nowrap text-slate-700">${s.spvName}</td>
                    <td class="py-2.5 px-3 whitespace-nowrap">
                      <span class="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-semibold">${s.salesmanType}</span>
                    </td>
                    <td class="py-2.5 px-3 whitespace-nowrap text-[11px] text-slate-600">${s.salesGroup}</td>
                    <td class="py-2.5 px-3 text-right font-mono text-slate-600">${s.targetCartons > 0 ? s.targetCartons.toLocaleString('id-ID') : '—'}</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold text-blue-900">${s.actualCartons.toLocaleString('id-ID')}</td>
                    <td class="py-2.5 px-3 text-right">
                      ${s.achievementPct !== null ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold font-mono ${achvClass}">${s.achievementPct}%</span>` : '—'}
                    </td>
                    <td class="py-2.5 px-3 text-right font-mono text-rose-600">${s.gapCartons > 0 ? s.gapCartons.toLocaleString('id-ID') : '0'}</td>
                    <td class="py-2.5 px-3 text-right font-mono text-slate-500 text-[11px]">${s.gapDaily > 0 ? s.gapDaily.toLocaleString('id-ID') : '0'}</td>
                    <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">${s.activeOutlets} <span class="text-[10px] font-normal text-slate-400">/ ${s.registeredOutlets}</span></td>
                    <td class="py-2.5 px-3 text-right font-mono text-slate-700">${s.coveragePct}%</td>
                    <td class="py-2.5 px-3 text-center">${paceBadge}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
            <tfoot class="bg-slate-100 text-slate-800 font-bold border-t-2 border-slate-300">
              <tr>
                <td colspan="5" class="py-2.5 px-3 text-center uppercase tracking-wider text-[11px] font-extrabold">TOTAL TIM SALES</td>
                <td class="py-2.5 px-3 text-right font-mono">${totalTgt.toLocaleString('id-ID')}</td>
                <td class="py-2.5 px-3 text-right font-mono font-extrabold text-blue-950">${totalAct.toLocaleString('id-ID')}</td>
                <td class="py-2.5 px-3 text-right font-mono font-bold">${avgAchv}%</td>
                <td class="py-2.5 px-3 text-right font-mono text-rose-600">${Math.max(0, totalTgt - totalAct).toLocaleString('id-ID')}</td>
                <td class="py-2.5 px-3 text-right text-slate-400">—</td>
                <td class="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-900 bg-emerald-100/50">${totalOa.toLocaleString('id-ID')}</td>
                <td class="py-2.5 px-3 text-right font-mono">${totalCl > 0 ? Math.round((totalOa / totalCl) * 1000) / 10 : 0}%</td>
                <td class="py-2.5 px-3 text-center text-slate-400">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  } else {
    // -------------------------------------------------------------
    // TAB 3: BY SUB-BRAND
    // -------------------------------------------------------------
    let subbrands = (data.bySubbrand || []).slice();

    if (searchTerm) {
      subbrands = subbrands.filter(b =>
        b.subbrand.toLowerCase().includes(searchTerm) ||
        b.brand.toLowerCase().includes(searchTerm) ||
        b.principal.toLowerCase().includes(searchTerm) ||
        b.groupSku.toLowerCase().includes(searchTerm)
      );
    }

    subbrands = sortDataRows(subbrands, subbrandSortCol, subbrandSortDir);

    const totalSubVol = subbrands.reduce((acc, b) => acc + (b.actualCartons || 0), 0);
    const totalSubNet = subbrands.reduce((acc, b) => acc + (b.salesNetto || 0), 0);
    const totalSubInv = subbrands.reduce((acc, b) => acc + (b.invoiceCount || 0), 0);

    contentHtml = `
      <!-- Sub-brand Performance Overview Bar -->
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[11px] text-slate-500 font-semibold uppercase block">Total Ragam Sub-brand</span>
          <span class="text-base sm:text-lg font-bold text-slate-900 font-mono">${subbrands.length} Varian</span>
          <span class="text-[10px] text-slate-400 block mt-0.5">Memiliki transaksi aktif</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[11px] text-slate-500 font-semibold uppercase block">Total Volume Terjual</span>
          <span class="text-base sm:text-lg font-bold text-blue-900 font-mono">${totalSubVol.toLocaleString('id-ID')} KTN</span>
          <span class="text-[10px] text-slate-400 block mt-0.5">Karton riil terjual</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[11px] text-slate-500 font-semibold uppercase block">Total Omzet Bersih</span>
          <span class="text-base sm:text-lg font-bold text-indigo-900 font-mono">Rp ${(totalSubNet / 1000000).toFixed(1)} Jt</span>
          <span class="text-[10px] text-slate-400 block mt-0.5">Netto Inc PPN</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[11px] text-slate-500 font-semibold uppercase block">Total Transaksi Faktur</span>
          <span class="text-base sm:text-lg font-bold text-emerald-800 font-mono">${totalSubInv.toLocaleString('id-ID')} Faktur</span>
          <span class="text-[10px] text-slate-400 block mt-0.5">Penetrasi pasar Garut</span>
        </div>
      </div>

      <!-- Chart: Top Sub-brands -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-2">
          <h3 class="text-sm font-bold text-slate-800 flex items-center gap-2">
            <i data-lucide="bar-chart-2" class="w-4 h-4 text-emerald-600"></i>
            <span>Grafik Ranking Sub-brand Terlaris di Wilayah Garut (KTN)</span>
          </h3>
          <span class="text-xs text-slate-400">Top varian produk paling diminati outlet</span>
        </div>

        <div class="mt-4 relative" style="min-height: 290px;">
          <canvas id="perfSubbrandCanvas"></canvas>
        </div>
      </div>

      <!-- Table: Sub-brand Details -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-5">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
          <div>
            <h3 class="text-xs font-bold text-slate-800 flex items-center gap-2">
              <i data-lucide="boxes" class="w-4 h-4 text-indigo-600"></i>
              <span>Rincian Penjualan & Kontribusi per Sub-brand</span>
            </h3>
            <p class="text-[11px] text-slate-400 mt-0.5">Klik pada header kolom untuk mengurutkan (Sort)</p>
          </div>

          <!-- Search Box -->
          <div class="w-full sm:w-64 relative">
            <input type="text" oninput="handlePerformanceSearch(event)" value="${searchTerm}" placeholder="Cari nama sub-brand / brand..." class="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none">
            <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5"></i>
          </div>
        </div>

        <div class="overflow-x-auto scrollbar-thin rounded-lg border border-slate-200 mt-3">
          <table class="w-full text-left text-xs border-collapse">
            <thead class="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 select-none">
              <tr>
                <th class="py-2.5 px-3 text-center w-10">No</th>
                <th onclick="sortPerformanceSubbrand('subbrand')" class="py-2.5 px-3 cursor-pointer hover:bg-slate-100 transition">Sub-brand <i data-lucide="arrow-up-down" class="w-3 h-3 inline text-slate-400"></i></th>
                <th onclick="sortPerformanceSubbrand('brand')" class="py-2.5 px-3 cursor-pointer hover:bg-slate-100 transition">Brand <i data-lucide="arrow-up-down" class="w-3 h-3 inline text-slate-400"></i></th>
                <th class="py-2.5 px-3">Principal</th>
                <th class="py-2.5 px-3">Group SKU</th>
                <th onclick="sortPerformanceSubbrand('actualCartons')" class="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-100 transition text-blue-900">Volume (KTN) <i data-lucide="arrow-up-down" class="w-3 h-3 inline text-slate-400"></i></th>
                <th onclick="sortPerformanceSubbrand('salesNetto')" class="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-100 transition">Omzet Netto (Rp) <i data-lucide="arrow-up-down" class="w-3 h-3 inline text-slate-400"></i></th>
                <th onclick="sortPerformanceSubbrand('contributionPct')" class="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-100 transition">Share (%) <i data-lucide="arrow-up-down" class="w-3 h-3 inline text-slate-400"></i></th>
                <th onclick="sortPerformanceSubbrand('activeOutlets')" class="py-2.5 px-3 text-right cursor-pointer hover:bg-slate-100 transition text-emerald-800 bg-emerald-50/50">OA Pembeli <i data-lucide="arrow-up-down" class="w-3 h-3 inline text-slate-400"></i></th>
                <th class="py-2.5 px-3 text-right">Faktur</th>
                <th class="py-2.5 px-3 text-right">Rata-rata/KTN</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 text-slate-700 font-medium">
              ${subbrands.map((b, idx) => `
                <tr class="hover:bg-slate-50/80 transition">
                  <td class="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">${idx + 1}</td>
                  <td class="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">${b.subbrand}</td>
                  <td class="py-2.5 px-3 whitespace-nowrap text-slate-700">${b.brand}</td>
                  <td class="py-2.5 px-3 whitespace-nowrap text-[11px] text-slate-500">${b.principal}</td>
                  <td class="py-2.5 px-3 whitespace-nowrap"><span class="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded text-[10px] font-semibold">${b.groupSku}</span></td>
                  <td class="py-2.5 px-3 text-right font-mono font-bold text-blue-900">${b.actualCartons.toLocaleString('id-ID')}</td>
                  <td class="py-2.5 px-3 text-right font-mono text-slate-800 whitespace-nowrap">${b.salesNetto >= 1000000 ? 'Rp ' + (b.salesNetto / 1000000).toFixed(1) + ' Jt' : 'Rp ' + b.salesNetto.toLocaleString('id-ID')}</td>
                  <td class="py-2.5 px-3 text-right font-mono font-bold text-indigo-700">${b.contributionPct}%</td>
                  <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 bg-emerald-50/30">${b.activeOutlets} <span class="text-[10px] font-normal text-slate-400">Toko</span></td>
                  <td class="py-2.5 px-3 text-right font-mono text-slate-500">${b.invoiceCount}</td>
                  <td class="py-2.5 px-3 text-right font-mono text-slate-600 text-[11px]">Rp ${b.avgPriceCarton.toLocaleString('id-ID')}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot class="bg-slate-100 text-slate-800 font-bold border-t-2 border-slate-300">
              <tr>
                <td colspan="5" class="py-2.5 px-3 text-center uppercase tracking-wider text-[11px] font-extrabold">TOTAL SUB-BRAND</td>
                <td class="py-2.5 px-3 text-right font-mono font-extrabold text-blue-950">${totalSubVol.toLocaleString('id-ID')}</td>
                <td class="py-2.5 px-3 text-right font-mono font-extrabold whitespace-nowrap">Rp ${(totalSubNet / 1000000).toFixed(1)} Jt</td>
                <td class="py-2.5 px-3 text-right font-mono">100%</td>
                <td class="py-2.5 px-3 text-right text-slate-400">—</td>
                <td class="py-2.5 px-3 text-right font-mono">${totalSubInv.toLocaleString('id-ID')}</td>
                <td class="py-2.5 px-3 text-right text-slate-400">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    `;
  }

  main.innerHTML = `
    <!-- Top Header -->
    <div class="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200">
      <div>
        <div class="flex items-center gap-2">
          <span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">INTELLIGENCE PLATFORM</span>
          <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">SUMMARY PERFORMANCE</span>
        </div>
        <h2 class="text-xl font-bold text-slate-900 tracking-tight mt-1">Total Performance Analytics — DSO Garut</h2>
        <p class="text-xs text-slate-500 mt-0.5">Analisis angka performa komprehensif: Target vs Realisasi DSO, Produktivitas Salesman, dan Kontribusi Sub-brand</p>
      </div>

      <!-- Action Button: Export CSV -->
      <div class="flex items-center gap-2">
        <button onclick="exportPerformanceCsvAction()" class="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition flex items-center gap-1.5">
          <i data-lucide="download" class="w-4 h-4"></i>
          <span>Export CSV (${activeView.toUpperCase()})</span>
        </button>
      </div>
    </div>

    <!-- Active Filters Ribbon Tags -->
    ${activeTags.length > 0 ? `
      <div class="flex flex-wrap items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs">
        <span class="text-[11px] font-bold text-slate-500 flex items-center gap-1">
          <i data-lucide="filter" class="w-3.5 h-3.5 text-blue-600"></i> Filter Aktif:
        </span>
        ${activeTags.map(tag => `<span class="px-2 py-0.5 bg-white border border-slate-200 text-slate-700 rounded-md font-medium text-[11px] shadow-2xs">${tag}</span>`).join('')}
        <button onclick="resetFilters()" class="text-blue-600 hover:text-blue-800 text-[11px] font-semibold underline ml-2">Reset Semua</button>
      </div>
    ` : ''}

    <!-- 3 View Mode Switcher Pills -->
    <div class="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold w-full sm:w-auto self-start border border-slate-200/60">
      <button onclick="switchPerformanceView('dso')" class="flex-1 sm:flex-initial px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 ${activeView === 'dso' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
        <i data-lucide="building-2" class="w-4 h-4"></i>
        <span>🏢 By Total DSO</span>
      </button>
      <button onclick="switchPerformanceView('salesman')" class="flex-1 sm:flex-initial px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 ${activeView === 'salesman' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
        <i data-lucide="users" class="w-4 h-4"></i>
        <span>👤 By Salesman</span>
      </button>
      <button onclick="switchPerformanceView('subbrand')" class="flex-1 sm:flex-initial px-4 py-2 rounded-lg transition flex items-center justify-center gap-2 ${activeView === 'subbrand' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
        <i data-lucide="boxes" class="w-4 h-4"></i>
        <span>📦 By Sub-brand</span>
      </button>
    </div>

    <!-- Main Content Area -->
    ${contentHtml}
  `;

  lucide.createIcons();
  initPerformanceCharts();
}

function initPerformanceCharts() {
  const data = window.performanceData;
  if (!data) return;

  const { activeView } = window.performanceState;

  if (window.perfChartInstance) {
    window.perfChartInstance.destroy();
    window.perfChartInstance = null;
  }
  if (window.perfMixChartInstance) {
    window.perfMixChartInstance.destroy();
    window.perfMixChartInstance = null;
  }

  if (activeView === 'dso') {
    const ctx = document.getElementById('perfDsoCanvas');
    if (!ctx) return;

    const dsoMonthly = data.dsoMonthly || [];
    const labels = dsoMonthly.map(m => m.monthLabel);
    const targetData = dsoMonthly.map(m => m.targetCartons);
    const actualData = dsoMonthly.map(m => m.actualCartons);
    const oaData = dsoMonthly.map(m => m.activeOutlets);

    window.perfChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            type: 'line',
            label: 'Realisasi Volume (KTN)',
            data: actualData,
            borderColor: '#2563eb',
            backgroundColor: 'rgba(37, 99, 235, 0.1)',
            borderWidth: 3,
            fill: true,
            tension: 0.3,
            pointRadius: 5,
            pointBackgroundColor: '#2563eb',
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'Target Volume (KTN)',
            data: targetData,
            borderColor: '#dc2626',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            tension: 0.1,
            pointRadius: 3.5,
            pointBackgroundColor: '#dc2626',
            yAxisID: 'y'
          },
          {
            type: 'line',
            label: 'Outlet Aktif (OA Toko)',
            data: oaData,
            borderColor: '#059669',
            backgroundColor: 'rgba(5, 150, 105, 0.08)',
            borderWidth: 2.5,
            fill: false,
            tension: 0.3,
            pointRadius: 4.5,
            pointBackgroundColor: '#059669',
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: {
            position: 'top',
            labels: { boxWidth: 14, font: { size: 11, family: 'Plus Jakarta Sans', weight: 'bold' } }
          },
          tooltip: {
            callbacks: {
              label: function(context) {
                const label = context.dataset.label || '';
                const val = context.parsed.y;
                if (context.dataset.yAxisID === 'y1') return `${label}: ${val.toLocaleString('id-ID')} Toko`;
                return `${label}: ${val.toLocaleString('id-ID')} KTN`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11, weight: 'bold' } } },
          y: {
            type: 'linear',
            position: 'left',
            title: { display: true, text: 'Volume (Karton)', font: { size: 11, weight: 'bold' }, color: '#2563eb' },
            ticks: { callback: v => v.toLocaleString('id-ID') }
          },
          y1: {
            type: 'linear',
            position: 'right',
            grid: { drawOnChartArea: false },
            title: { display: true, text: 'Outlet Aktif (OA Toko)', font: { size: 11, weight: 'bold' }, color: '#059669' },
            ticks: { callback: v => v.toLocaleString('id-ID') }
          }
        }
      }
    });
  } else if (activeView === 'salesman') {
    const ctx = document.getElementById('perfSalesmanCanvas');
    if (!ctx) return;

    const salesmen = (data.bySalesman || []).slice(0, 12);
    const labels = salesmen.map(s => s.salesmanName);
    const actualData = salesmen.map(s => s.actualCartons);
    const targetData = salesmen.map(s => s.targetCartons);

    window.perfChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Aktual Penjualan (KTN)',
            data: actualData,
            backgroundColor: '#2563eb',
            borderRadius: 6
          },
          {
            label: 'Target (KTN)',
            data: targetData,
            backgroundColor: '#cbd5e1',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top', labels: { boxWidth: 12, font: { size: 11 } } },
          tooltip: {
            callbacks: {
              label: context => `${context.dataset.label}: ${context.parsed.y.toLocaleString('id-ID')} KTN`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 11 } } },
          y: {
            beginAtZero: true,
            ticks: { callback: v => v.toLocaleString('id-ID') }
          }
        }
      }
    });
  } else if (activeView === 'subbrand') {
    const ctx = document.getElementById('perfSubbrandCanvas');
    if (!ctx) return;

    const subbrands = (data.bySubbrand || []).slice(0, 12);
    const labels = subbrands.map(b => b.subbrand.length > 22 ? b.subbrand.substring(0, 20) + '...' : b.subbrand);
    const volumeData = subbrands.map(b => b.actualCartons);

    const colors = [
      '#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2',
      '#4f46e5', '#16a34a', '#ea580c', '#9333ea', '#e11d48', '#0284c7'
    ];

    window.perfChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Volume Penjualan (KTN)',
            data: volumeData,
            backgroundColor: colors.slice(0, subbrands.length),
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: context => `Volume: ${context.parsed.y.toLocaleString('id-ID')} KTN`
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { font: { size: 10 } } },
          y: {
            beginAtZero: true,
            ticks: { callback: v => v.toLocaleString('id-ID') }
          }
        }
      }
    });
  }
}

// ==============================================================
// 5. TIM SALES & INCENTIVE SCORECARD
// ==============================================================
window.salesmanSortKey = 'actualCartons';
window.salesmanSortDir = 'desc';

async function renderSalesman() {
  const main = document.getElementById('main-content');
  try {
    const res = await fetch(`/api/salesmen?${getFilterQuery()}`);
    const data = await res.json();
    window.salesmenData = data.salesmen || [];

    renderSalesmanContent();
  } catch (err) {
    main.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Gagal memuat tim sales: ${err.message}</div>`;
  }
}

function filterSalesmanByGroup(grp) {
  const groupSelect = document.getElementById('filter-sales-group');
  if (groupSelect) groupSelect.value = grp;
  globalFilters.salesGroup = grp;
  renderSalesman();
}

function sortSalesmanTable(colKey) {
  if (window.salesmanSortKey === colKey) {
    window.salesmanSortDir = window.salesmanSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    window.salesmanSortKey = colKey;
    window.salesmanSortDir = 'desc';
  }
  renderSalesmanContent();
}

function renderSalesmanContent() {
  const main = document.getElementById('main-content');
  const salesmen = window.salesmenData || [];
  const sortKey = window.salesmanSortKey;
  const sortDir = window.salesmanSortDir;

  const sortedSalesmen = sortDataRows(salesmen, sortKey, sortDir);

  const sortIcon = (col) => {
    if (sortKey !== col) return `<span class="text-slate-300 ml-1">⇅</span>`;
    return sortDir === 'asc' ? `<span class="text-blue-600 ml-1 font-bold">▲</span>` : `<span class="text-blue-600 ml-1 font-bold">▼</span>`;
  };

  const currentGrp = globalFilters.salesGroup || '';

  main.innerHTML = `
    <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div>
        <h2 class="text-xl font-bold text-slate-800 tracking-tight">Kinerja Tim Sales & Kalkulator Insentif</h2>
        <p class="text-xs text-slate-500">Evaluasi pencapaian target, timegone HK (Senin–Jumat), gap harian/bulanan, dan simulasi insentif.</p>
      </div>

      <!-- Salesman Group Filter Buttons -->
      <div class="bg-slate-100 p-1 rounded-xl flex items-center gap-1 border border-slate-200 text-xs overflow-x-auto">
        <button onclick="filterSalesmanByGroup('')" class="px-3 py-1.5 rounded-lg font-bold transition ${currentGrp === '' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
          Semua Group
        </button>
        <button onclick="filterSalesmanByGroup('SAVORIA')" class="px-3 py-1.5 rounded-lg font-bold transition ${currentGrp === 'SAVORIA' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
          SAVORIA (7 Rayon)
        </button>
        <button onclick="filterSalesmanByGroup('SCM')" class="px-3 py-1.5 rounded-lg font-bold transition ${currentGrp === 'SCM' || currentGrp === 'SMC' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
          SCM
        </button>
        <button onclick="filterSalesmanByGroup('SAVORIA_OTHERS')" class="px-3 py-1.5 rounded-lg font-bold transition ${currentGrp === 'SAVORIA_OTHERS' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
          SAVORIA (OTHERS)
        </button>
      </div>
    </div>

    <!-- Salesman Performance Table -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
      <div class="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <span class="font-bold text-slate-700 flex items-center gap-2">
          <i data-lucide="users" class="w-4 h-4 text-blue-600"></i>
          Peringkat Tim Sales Garut <span class="text-slate-400 font-normal">(${sortedSalesmen.length} Salesman)</span>
        </span>
        <span class="text-[11px] text-slate-400 italic">Klik header kolom untuk sortir Naik (▲) / Turun (▼)</span>
      </div>
      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-left">
          <thead class="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 select-none">
            <tr>
              <th class="py-3 px-3 text-center w-10">#</th>
              <th onclick="sortSalesmanTable('salesmanName')" class="py-3 px-3 cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center">Salesman ${sortIcon('salesmanName')}</div>
              </th>
              <th onclick="sortSalesmanTable('salesmanType')" class="py-3 px-3 cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center">Tipe ${sortIcon('salesmanType')}</div>
              </th>
              <th onclick="sortSalesmanTable('salesGroup')" class="py-3 px-3 cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center">Group ${sortIcon('salesGroup')}</div>
              </th>
              <th onclick="sortSalesmanTable('targetCl')" class="py-3 px-3 text-right cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-end">Target CL ${sortIcon('targetCl')}</div>
              </th>
              <th onclick="sortSalesmanTable('targetCartons')" class="py-3 px-3 text-right cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-end">Target KTN / Val ${sortIcon('targetCartons')}</div>
              </th>
              <th onclick="sortSalesmanTable('actualCartons')" class="py-3 px-3 text-right cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-end">Actual KTN ${sortIcon('actualCartons')}</div>
              </th>
              <th onclick="sortSalesmanTable('achievementPct')" class="py-3 px-3 text-right cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-end">Achv % ${sortIcon('achievementPct')}</div>
              </th>
              <th onclick="sortSalesmanTable('gapMonthly')" class="py-3 px-3 text-right cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-end">GAP Bulanan ${sortIcon('gapMonthly')}</div>
              </th>
              <th onclick="sortSalesmanTable('gapDaily')" class="py-3 px-3 text-right cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-end">GAP Harian ${sortIcon('gapDaily')}</div>
              </th>
              <th onclick="sortSalesmanTable('paceStatus')" class="py-3 px-3 text-center cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-center">Status Pace ${sortIcon('paceStatus')}</div>
              </th>
              <th onclick="sortSalesmanTable('coveragePct')" class="py-3 px-3 text-right cursor-pointer hover:bg-slate-200/60 transition">
                <div class="flex items-center justify-end">Coverage % ${sortIcon('coveragePct')}</div>
              </th>
              <th class="py-3 px-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            ${sortedSalesmen.map((s, idx) => `
              <tr class="hover:bg-blue-50/40 transition">
                <td class="py-2.5 px-3 text-slate-400 text-center font-mono">${idx + 1}</td>
                <td class="py-2.5 px-3">
                  <div class="font-bold text-slate-800">${s.salesmanName}</div>
                  <div class="text-[10px] text-slate-400">${(s.salesmanName?.includes('DSM') || s.salesGroup === 'SAVORIA_OTHERS' || s.salesGroup === 'SCM' || s.salesGroup === 'SMC' || !s.spvName) ? '—' : s.spvName}</div>
                </td>
                <td class="py-2.5 px-3">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.salesmanType === 'Kanvas' ? 'bg-blue-50 text-blue-700 border border-blue-200' : (s.salesmanType === 'GT' ? 'bg-purple-50 text-purple-700 border border-purple-200' : (s.salesmanType === 'CB' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-600'))}">
                    ${s.salesmanType || 'Kanvas'}
                  </span>
                </td>
                <td class="py-2.5 px-3 font-semibold text-slate-600 text-[11px]">${s.salesGroup === 'SMC' ? 'SCM' : (s.salesGroup || 'SAVORIA')}</td>
                <td class="py-2.5 px-3 text-right font-medium text-slate-700">${s.hasRayon ? s.targetCl + ' toko' : '—'}</td>
                <td class="py-2.5 px-3 text-right font-semibold ${s.hasTarget && s.targetCartons !== null ? 'text-slate-800' : 'text-slate-400'}">
                  <div>${s.hasTarget && s.targetCartons !== null ? s.targetCartons.toLocaleString('id-ID') : '—'}</div>
                  ${s.hasTarget && s.targetValue ? `<div class="text-[10px] text-slate-400 font-normal">Rp ${(s.targetValue / 1000000).toFixed(1)} Jt</div>` : ''}
                </td>
                <td class="py-2.5 px-3 text-right font-extrabold text-blue-700">${s.actualCartons.toLocaleString('id-ID')}</td>
                <td class="py-2.5 px-3 text-right font-bold ${s.hasTarget && s.achievementPct !== null ? (s.achievementPct >= 80 ? 'text-emerald-600' : (s.achievementPct >= 60 ? 'text-amber-600' : 'text-rose-600')) : 'text-slate-400'}">
                  ${s.hasTarget && s.achievementPct !== null ? s.achievementPct + '%' : 'N/A'}
                </td>
                <td class="py-2.5 px-3 text-right font-semibold ${s.hasTarget && s.gapMonthly !== null ? (s.gapMonthly > 0 ? 'text-rose-600' : 'text-emerald-600') : 'text-slate-400'}">
                  ${s.hasTarget && s.gapMonthly !== null ? (s.gapMonthly > 0 ? '-' + s.gapMonthly.toLocaleString('id-ID') : 'Tercapai') : 'N/A'}
                </td>
                <td class="py-2.5 px-3 text-right font-semibold ${s.hasTarget && s.gapDaily !== null ? 'text-emerald-600' : 'text-slate-400'}">
                  ${s.hasTarget && s.gapDaily !== null ? s.gapDaily.toLocaleString('id-ID') + '/hr' : 'N/A'}
                </td>
                <td class="py-2.5 px-3 text-center">
                  <span class="px-2 py-0.5 rounded text-[10px] font-bold ${s.paceStatus === 'ON_PACE' ? 'badge-success' : (s.paceStatus === 'NEEDS_ATTENTION' ? 'badge-warning' : (s.paceStatus === 'BEHIND_PACE' ? 'badge-danger' : 'bg-slate-100 text-slate-500'))}">
                    ${s.paceStatus === 'ON_PACE' ? 'On Pace' : (s.paceStatus === 'NEEDS_ATTENTION' ? 'Perhatian' : (s.paceStatus === 'BEHIND_PACE' ? 'Tertinggal' : 'N/A'))}
                  </span>
                </td>
                <td class="py-2.5 px-3 text-right">
                  <span class="font-bold text-slate-800">${s.hasRayon ? s.coveragePct + '%' : '—'}</span>
                  <div class="text-[10px] text-slate-400">${s.hasRayon ? `${s.activeOutlets}/${s.registeredOutlets}` : `${s.activeOutlets} OC`}</div>
                </td>
                <td class="py-2.5 px-3 text-center">
                  <button onclick="openIncentiveModal('${s.salesmanId}')" class="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 text-[11px] font-bold rounded-lg transition inline-flex items-center gap-1">
                    <i data-lucide="award" class="w-3 h-3"></i> Insentif
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-5">
      ${sortedSalesmen.map(s => `
        <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between hover:border-blue-300 transition">
          <div>
            <div class="flex items-center justify-between mb-2">
              <div>
                <h4 class="font-bold text-slate-800 text-sm">${s.salesmanName}</h4>
                <p class="text-[11px] text-slate-400 font-medium">${(s.salesmanName?.includes('DSM') || s.salesGroup === 'SAVORIA_OTHERS' || s.salesGroup === 'SCM' || s.salesGroup === 'SMC' || !s.spvName) ? '—' : s.spvName} • <span class="font-bold text-blue-600">${s.salesmanType || 'Kanvas'}</span></p>
              </div>
              <span class="${s.hasTarget && s.achievementPct !== null ? (s.achievementPct >= 80 ? 'badge-success' : 'badge-warning') : 'bg-slate-100 text-slate-500'} text-xs font-bold px-2 py-0.5 rounded">
                ${s.hasTarget && s.achievementPct !== null ? s.achievementPct + '%' : 'N/A'}
              </span>
            </div>

            <div class="space-y-1.5 text-xs my-3 bg-slate-50 p-2.5 rounded-lg">
              <div class="flex justify-between">
                <span class="text-slate-500">Target vs Actual:</span>
                <span class="font-semibold text-slate-800">
                  ${s.hasTarget && s.targetCartons !== null ? s.targetCartons + ' KTN' : 'Belum tersedia'} → <strong class="text-blue-600">${s.actualCartons} KTN</strong>
                </span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">GAP Harian (Sisa HK):</span>
                <span class="font-bold text-emerald-600">${s.gapDaily !== null ? s.gapDaily + ' KTN/hr' : 'N/A'}</span>
              </div>
              <div class="flex justify-between">
                <span class="text-slate-500">Coverage Outlet:</span>
                <span class="font-bold text-slate-700">${s.hasRayon ? `${s.activeOutlets} / ${s.registeredOutlets} (${s.coveragePct}%)` : `${s.activeOutlets} Toko Aktif`}</span>
              </div>
            </div>
          </div>

          <button onclick="openIncentiveModal('${s.salesmanId}')" class="w-full py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-lg transition text-center flex items-center justify-center gap-1.5">
            <i data-lucide="award" class="w-3.5 h-3.5"></i> Lihat Rincian Insentif
          </button>
        </div>
      `).join('')}
    </div>
  `;
  lucide.createIcons();
}

async function openIncentiveModal(salesmanId) {
  const modal = document.getElementById('modal-container');
  const modalContent = document.getElementById('modal-content');
  modal.classList.remove('hidden');

  modalContent.innerHTML = `<div class="text-center py-20 text-slate-500"><i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2 text-blue-600"></i>Menghitung simulasi insentif...</div>`;
  lucide.createIcons();

  try {
    const res = await fetch(`/api/salesmen/${salesmanId}/incentive?year=${globalFilters.year}&month=${globalFilters.month}`);
    const data = await res.json();

    modalContent.innerHTML = `
      <button onclick="closeModal()" class="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>

      <div class="border-b border-slate-200 pb-4 mb-4">
        <span class="text-[10px] font-bold uppercase text-blue-600 bg-blue-50 px-2 py-0.5 rounded">Rincian Insentif Salesman</span>
        <h2 class="text-xl font-bold text-slate-800 mt-1">${data.salesmanName}</h2>
        <p class="text-xs text-slate-500">${data.spvName || '—'} • Periode: ${globalFilters.month}/${data.year}</p>
      </div>

      <!-- Total Payout Banner -->
      <div class="bg-gradient-to-r from-blue-700 to-indigo-800 text-white p-5 rounded-2xl shadow-md mb-5 flex items-center justify-between">
        <div>
          <span class="text-xs text-blue-200 font-medium">Estimasi Total Insentif MTD</span>
          <p class="text-3xl font-extrabold mt-0.5">Rp ${data.totalEstimatedPayout.toLocaleString('id-ID')}</p>
          <p class="text-xs text-blue-200 mt-1">${data.payoutPercentage}% dari total mangkok (Rp ${(data.totalBaseMangkok).toLocaleString('id-ID')})</p>
        </div>
        <i data-lucide="award" class="w-12 h-12 text-amber-400"></i>
      </div>

      <!-- Component Breakdown Table -->
      <div class="border border-slate-200 rounded-xl overflow-hidden text-xs">
        <table class="w-full text-left">
          <thead class="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
            <tr>
              <th class="py-2.5 px-3">#</th>
              <th class="py-2.5 px-3">Komponen</th>
              <th class="py-2.5 px-3 text-right">Mangkok</th>
              <th class="py-2.5 px-3 text-right">Min - Max</th>
              <th class="py-2.5 px-3 text-right">Actual</th>
              <th class="py-2.5 px-3 text-right">Achv %</th>
              <th class="py-2.5 px-3 text-right">Payout (Rp)</th>
              <th class="py-2.5 px-3">Panduan / Aksi</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 font-medium">
            ${data.components.map(c => `
              <tr class="hover:bg-slate-50">
                <td class="py-2.5 px-3 text-slate-400">${c.num}</td>
                <td class="py-2.5 px-3 font-bold text-slate-800">${c.name}</td>
                <td class="py-2.5 px-3 text-right">Rp ${c.mangkok.toLocaleString('id-ID')}</td>
                <td class="py-2.5 px-3 text-right">${c.minPct}% - ${c.maxPct}%</td>
                <td class="py-2.5 px-3 text-right font-semibold">${c.actual}</td>
                <td class="py-2.5 px-3 text-right font-bold ${c.status === 'QUALIFIED' ? 'text-emerald-600' : (c.status === 'TBD' ? 'text-slate-400' : 'text-rose-600')}">${c.status === 'TBD' ? 'TBD' : c.achievementPct + '%'}</td>
                <td class="py-2.5 px-3 text-right font-bold text-slate-900">Rp ${c.payout.toLocaleString('id-ID')}</td>
                <td class="py-2.5 px-3 text-[11px] ${c.status === 'QUALIFIED' ? 'text-emerald-700' : (c.status === 'TBD' ? 'text-slate-400 italic' : 'text-rose-700 font-semibold')}">${c.note}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    lucide.createIcons();
  } catch (err) {
    modalContent.innerHTML = `<div class="p-6 text-rose-600">Gagal memuat insentif: ${err.message}</div>`;
  }
}

// ==============================================================
// 6. PROGRAM PRODUK (Trade Promo Loyalty & Must Have/NPL Tracker)
// ==============================================================
let currentProgramSubTab = 'loyalty'; // 'loyalty' | 'tracker'
let selectedLoyaltyProgramId = 'PROG_KTG_LOYALTY';
let loyaltySortKey = 'customerCode';
let loyaltySortDir = 'asc';
let cachedLoyaltyData = null;
let modalStoreRows = [];

function switchProgramSubTab(tab) {
  currentProgramSubTab = tab;
  renderProgram();
}

async function renderProgram() {
  const main = document.getElementById('main-content');
  try {
    main.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-slate-800 tracking-tight">Program Produk & Trade Promo</h2>
          <p class="text-xs text-slate-500">Monitoring target dan capaian program toko mitra berjalan serta penetrasi lini fokus produk.</p>
        </div>

        <!-- Sub-tab Navigation Pills -->
        <div class="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
          <button onclick="switchProgramSubTab('loyalty')" class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${currentProgramSubTab === 'loyalty' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
            <i data-lucide="award" class="w-3.5 h-3.5 text-amber-500"></i>
            <span>Program Toko Berjalan</span>
          </button>
          <button onclick="switchProgramSubTab('tracker')" class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${currentProgramSubTab === 'tracker' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
            <i data-lucide="target" class="w-3.5 h-3.5 text-blue-600"></i>
            <span>Must Have & NPL Tracker</span>
          </button>
        </div>
      </div>

      <div id="program-subtab-container" class="mt-2">
        <div class="p-12 text-center text-slate-400">
          <i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto mb-2 text-blue-600"></i> Memuat data program...
        </div>
      </div>
    `;
    lucide.createIcons();

    if (currentProgramSubTab === 'loyalty') {
      await renderLoyaltySubTab();
    } else {
      await renderTrackerSubTab();
    }
  } catch (err) {
    main.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Gagal memuat program: ${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// Sub-Tab 1: Program Toko Berjalan (Loyalty Kopi Tubruk Gadjah)
// Matching media_1789304819065.png
// -------------------------------------------------------------
async function renderLoyaltySubTab() {
  const container = document.getElementById('program-subtab-container');
  if (!container) return;

  try {
    // 1. Fetch available loyalty programs
    const progListRes = await fetch('/api/programs/store-loyalty');
    const progListData = await progListRes.json();
    const programs = progListData.programs || [];

    if (!programs.some(p => p.programId === selectedLoyaltyProgramId) && programs.length > 0) {
      selectedLoyaltyProgramId = programs[0].programId;
    }

    // 2. Fetch selected program details with live MTD realization
    const res = await fetch(`/api/programs/store-loyalty/${selectedLoyaltyProgramId}?sortBy=${loyaltySortKey}&sortDir=${loyaltySortDir}`);
    const data = await res.json();
    cachedLoyaltyData = data;

    const prog = data.program;
    const stores = data.stores || [];

    const sortIcon = (col) => {
      if (loyaltySortKey !== col) return `<span class="text-slate-300 ml-1 font-normal">⇅</span>`;
      return loyaltySortDir === 'asc' ? `<span class="text-blue-600 ml-1 font-bold">▲</span>` : `<span class="text-blue-600 ml-1 font-bold">▼</span>`;
    };

    container.innerHTML = `
      <!-- Program Header & Action Bar -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center gap-3">
          <div class="w-11 h-11 rounded-xl bg-gradient-to-tr from-amber-500 to-orange-400 text-white flex items-center justify-center font-bold shadow-md shadow-amber-900/20 shrink-0">
            <i data-lucide="gift" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200">Program Berjalan</span>
              <span class="text-xs text-slate-400 font-medium">Fokus SKU: <strong class="text-slate-700">${prog.productFocus}</strong></span>
            </div>
            <h3 class="text-base font-black text-slate-800 tracking-tight mt-0.5">${prog.programName}</h3>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 text-xs">
          <!-- Program Select Dropdown -->
          <div class="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1.5 shadow-sm">
            <span class="text-slate-500 font-medium">Program:</span>
            <select id="program-select-dropdown" onchange="changeLoyaltyProgram(this.value)" class="bg-transparent text-slate-800 font-bold focus:outline-none cursor-pointer">
              ${programs.map(p => `
                <option value="${p.programId}" ${p.programId === selectedLoyaltyProgramId ? 'selected' : ''}>
                  ${p.programName} (${p.totalOutlets} Toko)
                </option>
              `).join('')}
            </select>
          </div>

          <!-- Download Template CSV Button -->
          <a href="/api/programs/store-loyalty/template" download="template_program_toko_berjalan.csv" class="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg font-bold flex items-center gap-1.5 transition shadow-sm" title="Download template CSV dengan 20 toko terdaftar">
            <i data-lucide="download" class="w-3.5 h-3.5 text-blue-600"></i>
            <span>Download Template (20 Toko)</span>
          </a>

          <!-- Upload / Create Program Button -->
          <button onclick="openUploadProgramModal()" class="px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-1.5 transition shadow-sm shadow-blue-500/20">
            <i data-lucide="upload" class="w-3.5 h-3.5"></i>
            <span>Upload / Buat Program Baru</span>
          </button>
        </div>
      </div>

      <!-- Top 6 KPI Summary Cards -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
        <!-- Card 1: Toko Peserta -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Toko Peserta</span>
          <p class="text-xl font-extrabold text-slate-800 mt-1">${prog.totalStores} <span class="text-xs font-normal text-slate-500">Toko</span></p>
          <span class="text-[10px] text-slate-500">Outlet Mitra Terpilih</span>
        </div>

        <!-- Card 2: Target Total KTN -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Target Total</span>
          <p class="text-xl font-extrabold text-slate-800 mt-1">${prog.totalTargetCartons.toLocaleString('id-ID')} <span class="text-xs font-normal text-slate-500">KTN</span></p>
          <span class="text-[10px] text-blue-600 font-medium">Alokasi Target Mei</span>
        </div>

        <!-- Card 3: Realisasi MTD KTN -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Realisasi MTD</span>
          <p class="text-xl font-extrabold text-slate-800 mt-1">${prog.totalActualCartons.toLocaleString('id-ID')} <span class="text-xs font-normal text-slate-500">KTN</span></p>
          <span class="text-[10px] text-emerald-600 font-bold">${prog.overallAchvPct}% Pencapaian</span>
        </div>

        <!-- Card 4: Toko Tercapai -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Toko Capai Target</span>
          <p class="text-xl font-extrabold text-emerald-600 mt-1">${prog.achievedStoresCount} <span class="text-xs font-normal text-slate-500">/ ${prog.totalStores}</span></p>
          <span class="text-[10px] text-slate-500 font-medium">${Math.round((prog.achievedStoresCount / (prog.totalStores || 1)) * 100)}% toko capai syarat</span>
        </div>

        <!-- Card 5: Estimasi Reward Total -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Est. Reward Total</span>
          <p class="text-xl font-extrabold text-slate-800 mt-1">Rp ${(prog.totalEstReward / 1000).toLocaleString('id-ID')}k</p>
          <span class="text-[10px] text-slate-400">Total Potensi Reward</span>
        </div>

        <!-- Card 6: Reward Diraih MTD -->
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-slate-400 text-[10px] uppercase font-bold tracking-wider block">Reward Diraih</span>
          <p class="text-xl font-extrabold text-emerald-600 mt-1">Rp ${(prog.totalEarnedReward / 1000).toLocaleString('id-ID')}k</p>
          <span class="text-[10px] text-emerald-600 font-bold">Siap Dicairkan MTD</span>
        </div>
      </div>

      <!-- Filter & Search Toolbar -->
      <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm mt-4 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div class="flex items-center gap-2 flex-1 max-w-sm">
          <div class="relative w-full">
            <i data-lucide="search" class="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
            <input type="text" id="loyalty-search-input" oninput="filterLoyaltyTable()" placeholder="Cari kode atau nama toko mitra..." class="w-full bg-slate-50 border border-slate-300 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="text-slate-500 font-medium">Status Capai:</span>
          <select id="loyalty-status-filter" onchange="filterLoyaltyTable()" class="bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="all">Semua Status</option>
            <option value="Tercapai">Tercapai</option>
            <option value="Belum Capai">Belum Capai</option>
          </select>

          <span class="text-slate-500 font-medium ml-2">Strata:</span>
          <select id="loyalty-strata-filter" onchange="filterLoyaltyTable()" class="bg-slate-50 border border-slate-300 text-slate-800 rounded-lg px-2.5 py-1.5 font-medium focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="all">Semua Strata</option>
            <option value="6-20 ktn">6-20 ktn (3%)</option>
            <option value="21-50 ktn">21-50 ktn (4%)</option>
          </select>
        </div>
      </div>

      <!-- Detail Table matching media_1789304819065.png -->
      <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mt-4">
        <div class="p-3.5 border-b border-slate-200 flex items-center justify-between">
          <h4 class="font-bold text-xs text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <span>Daftar 20 Toko Program: ${prog.programName}</span>
          </h4>
          <span class="text-[11px] text-slate-500 font-medium">Klik judul kolom untuk urutkan Ascending / Descending</span>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left text-xs" id="loyalty-table">
            <thead class="bg-slate-50 text-slate-700 font-semibold border-b border-slate-200 select-none">
              <tr>
                <th class="py-3 px-3 text-center w-12 text-slate-500">No</th>
                <th onclick="toggleLoyaltySort('customerCode')" class="py-3 px-3 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">
                  Kode Toko ${sortIcon('customerCode')}
                </th>
                <th onclick="toggleLoyaltySort('customerName')" class="py-3 px-3 cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">
                  Nama Toko ${sortIcon('customerName')}
                </th>
                <th onclick="toggleLoyaltySort('targetCartons')" class="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">
                  Target (KTN) ${sortIcon('targetCartons')}
                </th>
                <th onclick="toggleLoyaltySort('strata')" class="py-3 px-3 text-center cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">
                  Strata ${sortIcon('strata')}
                </th>
                <th onclick="toggleLoyaltySort('rewardPct')" class="py-3 px-3 text-center cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">
                  Besaran Reward ${sortIcon('rewardPct')}
                </th>
                <th onclick="toggleLoyaltySort('estRewardAmount')" class="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">
                  Est Reward (Rp) ${sortIcon('estRewardAmount')}
                </th>
                <th onclick="toggleLoyaltySort('actualCartons')" class="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">
                  Realisasi MTD (KTN) ${sortIcon('actualCartons')}
                </th>
                <th onclick="toggleLoyaltySort('achievementPct')" class="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">
                  Capaian (%) ${sortIcon('achievementPct')}
                </th>
                <th onclick="toggleLoyaltySort('statusCapai')" class="py-3 px-3 text-center cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">
                  Status Capai ${sortIcon('statusCapai')}
                </th>
                <th onclick="toggleLoyaltySort('gapCartons')" class="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">
                  Gap Capai (KTN) ${sortIcon('gapCartons')}
                </th>
                <th onclick="toggleLoyaltySort('earnedRewardAmount')" class="py-3 px-3 text-right cursor-pointer hover:bg-slate-100 transition whitespace-nowrap">
                  Reward Diraih (Rp) ${sortIcon('earnedRewardAmount')}
                </th>
              </tr>
            </thead>
            <tbody id="loyalty-table-body" class="divide-y divide-slate-100 font-medium">
              <!-- Rendered via filterLoyaltyTable() -->
            </tbody>
          </table>
        </div>
      </div>
    `;
    lucide.createIcons();
    filterLoyaltyTable();
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Gagal memuat data program: ${err.message}</div>`;
  }
}

function changeLoyaltyProgram(progId) {
  selectedLoyaltyProgramId = progId;
  renderLoyaltySubTab();
}

function toggleLoyaltySort(colKey) {
  if (loyaltySortKey === colKey) {
    loyaltySortDir = loyaltySortDir === 'asc' ? 'desc' : 'asc';
  } else {
    loyaltySortKey = colKey;
    loyaltySortDir = 'asc';
  }
  renderLoyaltySubTab();
}

function filterLoyaltyTable() {
  if (!cachedLoyaltyData || !cachedLoyaltyData.stores) return;
  const q = (document.getElementById('loyalty-search-input')?.value || '').toLowerCase().trim();
  const statusF = document.getElementById('loyalty-status-filter')?.value || 'all';
  const strataF = document.getElementById('loyalty-strata-filter')?.value || 'all';

  let filtered = cachedLoyaltyData.stores.filter(s => {
    const matchQ = !q || (s.customerCode || '').toLowerCase().includes(q) || (s.customerName || '').toLowerCase().includes(q);
    const matchStatus = statusF === 'all' || s.statusCapai === statusF;
    const matchStrata = strataF === 'all' || s.strata === strataF;
    return matchQ && matchStatus && matchStrata;
  });

  filtered = sortDataRows(filtered, loyaltySortKey, loyaltySortDir);

  const tbody = document.getElementById('loyalty-table-body');
  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="12" class="text-center py-8 text-slate-400">Tidak ada data toko yang cocok dengan pencarian / filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((s, idx) => `
    <tr class="hover:bg-blue-50/40 transition">
      <td class="py-2.5 px-3 text-slate-400 font-mono text-center">${idx + 1}</td>
      <td class="py-2.5 px-3 font-mono text-slate-700 font-semibold">${s.customerCode}</td>
      <td class="py-2.5 px-3 font-bold text-slate-800">${s.customerName}</td>
      <td class="py-2.5 px-3 text-right font-extrabold text-slate-900">${s.targetCartons.toLocaleString('id-ID')}</td>
      <td class="py-2.5 px-3 text-center">
        <span class="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">${s.strata}</span>
      </td>
      <td class="py-2.5 px-3 text-center font-semibold text-blue-600">${s.rewardPct}%</td>
      <td class="py-2.5 px-3 text-right font-mono text-slate-700">Rp ${s.estRewardAmount.toLocaleString('id-ID')}</td>
      <td class="py-2.5 px-3 text-right font-extrabold ${s.actualCartons > 0 ? 'text-blue-700' : 'text-slate-400'}">${s.actualCartons.toLocaleString('id-ID')}</td>
      <td class="py-2.5 px-3 text-right font-black ${s.achievementPct >= 100 ? 'text-emerald-600' : (s.achievementPct >= 50 ? 'text-blue-600' : 'text-rose-600')}">
        ${s.achievementPct}%
      </td>
      <td class="py-2.5 px-3 text-center">
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${s.statusCapai === 'Tercapai' ? 'text-emerald-700 bg-emerald-50 border border-emerald-200' : 'text-rose-700 bg-rose-50 border border-rose-200'}">
          ${s.statusCapai === 'Tercapai' ? '✓ Tercapai' : '✕ Belum Capai'}
        </span>
      </td>
      <td class="py-2.5 px-3 text-right font-bold ${s.gapCartons === 0 ? 'text-emerald-600' : 'text-rose-600'}">
        ${s.gapCartons === 0 ? '0 (Tercapai)' : '-' + s.gapCartons.toLocaleString('id-ID')}
      </td>
      <td class="py-2.5 px-3 text-right font-mono font-bold ${s.earnedRewardAmount > 0 ? 'text-emerald-700' : 'text-slate-400'}">
        Rp ${s.earnedRewardAmount.toLocaleString('id-ID')}
      </td>
    </tr>
  `).join('');
}

// -------------------------------------------------------------
// Sub-Tab 2: Must Have SKU & NPL Tracker
// -------------------------------------------------------------
async function renderTrackerSubTab() {
  const container = document.getElementById('program-subtab-container');
  if (!container) return;

  try {
    const res = await fetch(`/api/dashboard/executive?${getFilterQuery()}`);
    const data = await res.json();

    container.innerHTML = `
      <!-- Must Have Section -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="font-bold text-slate-800 text-sm">Must Have SKU Tracker</h3>
            <p class="text-xs text-slate-500">Standar Penetrasi: KTG (45%), DELI (45%), RTD (30%), FOX (35%), UHT (40%)</p>
          </div>
          <span class="text-xs bg-blue-50 text-blue-700 font-bold px-2.5 py-1 rounded-lg border border-blue-100">
            Terpenuhi 4 dari 5 Lini
          </span>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          ${data.mustHave.map(m => `
            <div class="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between">
              <div>
                <div class="flex justify-between items-center mb-1.5">
                  <span class="font-bold text-slate-800 text-sm">${m.lineCode}</span>
                  <span class="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">${m.targetPenetrationPct}% Target</span>
                </div>

                <div class="my-2">
                  <span class="text-[10px] text-slate-400 uppercase font-semibold">Penetrasi Aktual</span>
                  <p class="text-2xl font-black text-slate-800 leading-tight">${m.actualPenetrationPct}%</p>
                  <p class="text-xs text-slate-600 mt-0.5"><strong>${m.actualOc}</strong> dari <strong>${m.targetOc}</strong> target outlet</p>
                  <p class="text-[10px] text-slate-400">(Universe CL: ${m.registeredUniverse})</p>
                </div>
              </div>

              <div>
                <div class="flex justify-between text-[11px] font-semibold mt-2 mb-1">
                  <span class="text-slate-500">Progres Target:</span>
                  <span class="${m.progressToTargetPct >= 100 ? 'text-emerald-600' : 'text-blue-600'} font-bold">${m.progressToTargetPct}%</span>
                </div>
                <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                  <div class="h-2 rounded-full ${m.progressToTargetPct >= 100 ? 'bg-emerald-500' : 'bg-blue-600'}" style="width: ${Math.min(m.progressToTargetPct, 100)}%"></div>
                </div>
                <div class="text-[10px] text-slate-400 mt-1 flex justify-between">
                  <span>Gap: ${m.gapOc} Toko</span>
                  <span>${m.progressToTargetPct >= 100 ? 'Tercapai' : 'Kurang'}</span>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- NPL Campaigns Section -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-4">
        <h3 class="font-bold text-slate-800 text-sm mb-1">NPL Launch & Repeat Order Movement</h3>
        <p class="text-xs text-slate-500 mb-4">Evaluasi kualitas repeat order (RO-1: tepat 2 order, RO-2+: 3+ order)</p>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div class="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
            <div class="flex justify-between items-center mb-2">
              <span class="font-bold text-slate-800 text-sm">Deli Daily NPL</span>
              <span class="badge-success text-[10px] font-bold px-2 py-0.5 rounded">Campaign Aktif</span>
            </div>
            <p class="text-slate-500 mb-2">Target M1: 70% • Target M3: 85%</p>
            <div class="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg text-center font-bold">
              <div><span class="text-slate-400 font-normal text-[10px] block">Penetrasi</span> 71,2%</div>
              <div><span class="text-slate-400 font-normal text-[10px] block">RO-1 (2 Order)</span> 184 Outlet</div>
              <div><span class="text-slate-400 font-normal text-[10px] block">RO-2+ (3+ Order)</span> 89 Outlet</div>
            </div>
          </div>

          <div class="p-4 rounded-xl border border-slate-200 bg-white shadow-xs">
            <div class="flex justify-between items-center mb-2">
              <span class="font-bold text-slate-800 text-sm">Kopi Tubruk Gadjah RTD</span>
              <span class="badge-success text-[10px] font-bold px-2 py-0.5 rounded">Campaign Aktif</span>
            </div>
            <p class="text-slate-500 mb-2">Target M1: 70% • Target M3: 85%</p>
            <div class="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg text-center font-bold">
              <div><span class="text-slate-400 font-normal text-[10px] block">Penetrasi</span> 54,8%</div>
              <div><span class="text-slate-400 font-normal text-[10px] block">RO-1 (2 Order)</span> 120 Outlet</div>
              <div><span class="text-slate-400 font-normal text-[10px] block">RO-2+ (3+ Order)</span> 42 Outlet</div>
            </div>
          </div>
        </div>
      </div>
    `;
    lucide.createIcons();
  } catch (err) {
    container.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Gagal memuat tracker: ${err.message}</div>`;
  }
}

// -------------------------------------------------------------
// Upload Program Modal & Template Integration
// -------------------------------------------------------------
async function openUploadProgramModal() {
  const modal = document.getElementById('modal-container');
  const modalContent = document.getElementById('modal-content');
  if (!modal || !modalContent) return;

  // Initialize with current cached store rows or empty
  modalStoreRows = (cachedLoyaltyData?.stores || []).map(s => ({
    kode_toko: s.customerCode,
    nama_toko: s.customerName,
    target_ktn: s.targetCartons,
    strata: s.strata,
    reward_pct: s.rewardPct,
    est_reward_rp: s.estRewardAmount
  }));

  modal.classList.remove('hidden');

  modalContent.innerHTML = `
    <button onclick="closeModal()" class="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition">
      <i data-lucide="x" class="w-5 h-5"></i>
    </button>
    <div class="border-b border-slate-200 pb-3 mb-4">
      <div class="flex items-center gap-2">
        <div class="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <i data-lucide="upload-cloud" class="w-5 h-5"></i>
        </div>
        <div>
          <h3 class="text-base font-bold text-slate-800">Upload / Buat Program Toko Berjalan</h3>
          <p class="text-xs text-slate-500">Atur judul program, fokus produk, dan 20 target toko peserta mitra loyalty.</p>
        </div>
      </div>
    </div>

    <form onsubmit="submitProgramUpload(event)" class="space-y-4">
      <!-- Program Info -->
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div class="md:col-span-2">
          <label class="block text-xs font-semibold text-slate-700 mb-1">
            Judul / Nama Program: <span class="text-rose-500">*</span>
          </label>
          <input type="text" id="modal-prog-name" placeholder="Contoh: Loyalty Kopi Tubruk Gadjah Q2 (bisa dikosongkan/diisi nanti)" class="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg font-bold text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-none" required value="${cachedLoyaltyData?.program?.programName || 'Loyalty Kopi Tubruk Gadjah'}">
        </div>
        <div>
          <label class="block text-xs font-semibold text-slate-700 mb-1">Fokus Produk:</label>
          <input type="text" id="modal-prog-focus" value="${cachedLoyaltyData?.program?.productFocus || 'KOPI TUBRUK GADJAH'}" class="w-full p-2 text-xs bg-white border border-slate-300 rounded-lg font-semibold text-slate-700 focus:ring-1 focus:ring-blue-500 focus:outline-none">
        </div>
      </div>

      <!-- Upload Options / Actions -->
      <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div>
          <span class="font-bold text-slate-800 block">Daftar 20 Toko Mitra</span>
          <span class="text-slate-500 text-[11px]">Upload file CSV atau edit langsung di tabel preview di bawah.</span>
        </div>
        <div class="flex items-center gap-2">
          <label class="px-3 py-1.5 bg-white hover:bg-slate-100 text-blue-700 border border-blue-200 rounded-lg font-bold cursor-pointer transition shadow-xs flex items-center gap-1.5">
            <i data-lucide="file-spreadsheet" class="w-3.5 h-3.5"></i>
            <span>Upload File CSV</span>
            <input type="file" id="modal-csv-input" accept=".csv" onchange="handleModalCsvUpload(this)" class="hidden">
          </label>
          <button type="button" onclick="loadDefault20Stores()" class="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg font-semibold transition shadow-xs flex items-center gap-1.5">
            <i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i>
            <span>Muat 20 Toko Standar</span>
          </button>
        </div>
      </div>

      <!-- Interactive Table Preview -->
      <div class="border border-slate-200 rounded-xl overflow-hidden max-h-[300px] overflow-y-auto scrollbar-thin">
        <table class="w-full text-left text-xs">
          <thead class="bg-slate-100 text-slate-700 font-semibold sticky top-0 border-b border-slate-200">
            <tr>
              <th class="py-2 px-2.5 text-center w-8">No</th>
              <th class="py-2 px-2.5">Kode Toko</th>
              <th class="py-2 px-2.5">Nama Toko</th>
              <th class="py-2 px-2.5 text-right w-24">Target (KTN)</th>
              <th class="py-2 px-2.5 text-center w-28">Strata</th>
              <th class="py-2 px-2.5 text-right w-24">Reward %</th>
              <th class="py-2 px-2.5 text-right w-28">Est. Reward (Rp)</th>
            </tr>
          </thead>
          <tbody id="modal-store-rows-tbody" class="divide-y divide-slate-100 font-medium">
            <!-- Populated via renderModalStoreRows() -->
          </tbody>
        </table>
      </div>

      <!-- Action Buttons -->
      <div class="flex justify-between items-center pt-3 border-t border-slate-100">
        <span class="text-xs text-slate-500 font-medium" id="modal-stores-count-label">
          Total: ${modalStoreRows.length} Toko Peserta
        </span>
        <div class="flex items-center gap-2">
          <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition">
            Batal
          </button>
          <button type="submit" class="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm flex items-center gap-1.5 transition">
            <i data-lucide="check" class="w-4 h-4"></i>
            <span>Simpan & Terapkan Program</span>
          </button>
        </div>
      </div>
    </form>
  `;
  lucide.createIcons();
  renderModalStoreRows();
}

function renderModalStoreRows() {
  const tbody = document.getElementById('modal-store-rows-tbody');
  const countLabel = document.getElementById('modal-stores-count-label');
  if (!tbody) return;

  if (countLabel) countLabel.textContent = `Total: ${modalStoreRows.length} Toko Peserta`;

  if (modalStoreRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-slate-400">Belum ada toko yang ditambahkan. Klik "Muat 20 Toko Standar" atau upload CSV.</td></tr>`;
    return;
  }

  tbody.innerHTML = modalStoreRows.map((row, idx) => `
    <tr class="hover:bg-slate-50 transition">
      <td class="py-2 px-2.5 text-slate-400 font-mono text-center">${idx + 1}</td>
      <td class="py-2 px-2.5">
        <input type="text" value="${row.kode_toko || ''}" onchange="updateModalRow(${idx}, 'kode_toko', this.value)" class="w-full p-1 bg-white border border-slate-200 rounded text-xs font-mono font-semibold" required>
      </td>
      <td class="py-2 px-2.5">
        <input type="text" value="${row.nama_toko || ''}" onchange="updateModalRow(${idx}, 'nama_toko', this.value)" class="w-full p-1 bg-white border border-slate-200 rounded text-xs font-medium" required>
      </td>
      <td class="py-2 px-2.5 text-right">
        <input type="number" step="0.1" value="${row.target_ktn || 20}" onchange="updateModalRow(${idx}, 'target_ktn', this.value)" class="w-20 p-1 bg-white border border-slate-200 rounded text-xs font-bold text-right" required>
      </td>
      <td class="py-2 px-2.5 text-center">
        <select onchange="updateModalRow(${idx}, 'strata', this.value)" class="p-1 bg-white border border-slate-200 rounded text-[11px]">
          <option value="6-20 ktn" ${row.strata === '6-20 ktn' ? 'selected' : ''}>6-20 ktn</option>
          <option value="21-50 ktn" ${row.strata === '21-50 ktn' ? 'selected' : ''}>21-50 ktn</option>
        </select>
      </td>
      <td class="py-2 px-2.5 text-right">
        <input type="number" step="0.1" value="${row.reward_pct || 3}" onchange="updateModalRow(${idx}, 'reward_pct', this.value)" class="w-16 p-1 bg-white border border-slate-200 rounded text-xs font-bold text-right text-blue-600" required>
      </td>
      <td class="py-2 px-2.5 text-right">
        <input type="number" value="${row.est_reward_rp || 120000}" onchange="updateModalRow(${idx}, 'est_reward_rp', this.value)" class="w-24 p-1 bg-white border border-slate-200 rounded text-xs font-mono text-right" required>
      </td>
    </tr>
  `).join('');
}

function updateModalRow(idx, field, value) {
  if (!modalStoreRows[idx]) return;
  modalStoreRows[idx][field] = value;
  if (field === 'target_ktn') {
    const tgt = parseFloat(value) || 0;
    if (tgt <= 20) {
      modalStoreRows[idx].strata = '6-20 ktn';
      modalStoreRows[idx].reward_pct = 3.0;
      modalStoreRows[idx].est_reward_rp = Math.round(tgt * 200000 * 0.03);
    } else {
      modalStoreRows[idx].strata = '21-50 ktn';
      modalStoreRows[idx].reward_pct = 4.0;
      modalStoreRows[idx].est_reward_rp = Math.round(tgt * 200000 * 0.04);
    }
    renderModalStoreRows();
  }
}

async function loadDefault20Stores() {
  try {
    const res = await fetch('/api/programs/store-loyalty/template');
    const text = await res.text();
    parseCsvIntoModal(text);
  } catch (err) {
    alert('Gagal memuat template: ' + err.message);
  }
}

function handleModalCsvUpload(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    parseCsvIntoModal(text);
  };
  reader.readAsText(file);
}

function parseCsvIntoModal(csvText) {
  const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length <= 1) {
    alert('File CSV kosong atau tidak valid.');
    return;
  }

  const rows = [];
  // Skip header line
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(',');
    if (parts.length >= 2) {
      const kode = parts[0]?.trim();
      const nama = parts[1]?.trim();
      const target = parseFloat(parts[2]?.trim()) || 20;
      const strata = parts[3]?.trim() || (target <= 20 ? '6-20 ktn' : '21-50 ktn');
      const rPct = parseFloat((parts[4] || '').replace('%', '').trim()) || (target <= 20 ? 3.0 : 4.0);
      const estRew = parseFloat(parts[5]?.trim()) || Math.round(target * 200000 * (rPct / 100));

      if (kode && nama) {
        rows.push({
          kode_toko: kode,
          nama_toko: nama,
          target_ktn: target,
          strata,
          reward_pct: rPct,
          est_reward_rp: estRew
        });
      }
    }
  }

  if (rows.length > 0) {
    modalStoreRows = rows;
    renderModalStoreRows();
  } else {
    alert('Tidak ada baris data yang terbaca dari CSV.');
  }
}

async function submitProgramUpload(e) {
  e.preventDefault();
  const progName = document.getElementById('modal-prog-name')?.value?.trim();
  const progFocus = document.getElementById('modal-prog-focus')?.value?.trim() || 'KOPI TUBRUK GADJAH';

  if (!progName) {
    alert('Nama Program wajib diisi!');
    return;
  }

  if (modalStoreRows.length === 0) {
    alert('Minimal sertakan 1 toko peserta dalam program.');
    return;
  }

  try {
    const payload = {
      programId: selectedLoyaltyProgramId || 'PROG_' + Date.now(),
      programName: progName,
      productFocus: progFocus,
      outlets: modalStoreRows.map(r => ({
        customerCode: r.kode_toko,
        customerName: r.nama_toko,
        targetCartons: parseFloat(r.target_ktn) || 0,
        strata: r.strata,
        rewardPct: parseFloat(r.reward_pct) || 0,
        estRewardAmount: parseFloat(r.est_reward_rp) || 0
      }))
    };

    const res = await fetch('/api/programs/store-loyalty', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      closeModal();
      alert(`Program "${progName}" dan ${result.outletsCount} target toko berhasil disimpan!`);
      selectedLoyaltyProgramId = result.programId;
      await renderLoyaltySubTab();
    } else {
      alert('Gagal menyimpan program: ' + (result.error || 'Terjadi kesalahan'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// ==============================================================
// 7. STOCK & PIUTANG (Dual Stock Cover & AR Ledger)
// ==============================================================
// ==============================================================
// 7. STOCK & PIUTANG (Dual Stock Cover & AR Ledger - Milestone M7)
// ==============================================================
async function renderStock() {
  const main = document.getElementById('main-content');
  try {
    const [resStock, resAr] = await Promise.all([
      fetch('/api/stock'),
      fetch('/api/ar')
    ]);
    const dataStock = await resStock.json();
    const dataAr = await resAr.json();

    const ss = dataStock.summary;
    const as = dataAr.summary;

    main.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-slate-800 tracking-tight">Stock & Piutang (AR)</h2>
          <p class="text-xs text-slate-500">Monitor kesehatan ketersediaan stok gudang (dual stock cover) dan umur piutang aktif.</p>
        </div>
        <div class="flex items-center gap-2 text-xs">
          <span class="px-2.5 py-1 bg-white border border-slate-200 rounded-md font-semibold text-slate-700 shadow-sm">
            ${ss.totalSkus} SKU Terpantau
          </span>
          <span class="px-2.5 py-1 bg-white border border-slate-200 rounded-md font-semibold text-blue-700 shadow-sm">
            Total Piutang: Rp ${as.totalPiutangJt} Jt
          </span>
        </div>
      </div>

      <!-- KPI Overview Ribbon -->
      <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div class="bg-white p-3.5 rounded-xl border border-rose-200 bg-rose-50/30 shadow-sm">
          <span class="text-[11px] font-semibold text-rose-700 uppercase block">Habis Stok (OOS)</span>
          <p class="text-xl font-extrabold text-rose-700 mt-1">${ss.outOfStockCount} SKU</p>
          <span class="text-[10px] text-rose-600 font-medium">Cover 0 hari</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-amber-200 bg-amber-50/30 shadow-sm">
          <span class="text-[11px] font-semibold text-amber-700 uppercase block">Stok Rendah</span>
          <p class="text-xl font-extrabold text-amber-700 mt-1">${ss.lowStockCount} SKU</p>
          <span class="text-[10px] text-amber-600 font-medium">< ${ss.thresholds.lowDays} hari cover</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[11px] font-semibold text-emerald-700 uppercase block">Stok Sehat</span>
          <p class="text-xl font-extrabold text-slate-800 mt-1">${ss.healthyCount} SKU</p>
          <span class="text-[10px] text-emerald-600 font-medium">${ss.thresholds.lowDays} - ${ss.thresholds.highDays} hari</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[11px] font-semibold text-blue-700 uppercase block">Overstock</span>
          <p class="text-xl font-extrabold text-slate-800 mt-1">${ss.overstockCount} SKU</p>
          <span class="text-[10px] text-blue-600 font-medium">> ${ss.thresholds.highDays} hari cover</span>
        </div>
        <div class="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm">
          <span class="text-[11px] font-semibold text-purple-700 uppercase block">Total Faktur AR</span>
          <p class="text-xl font-extrabold text-slate-800 mt-1">${as.totalInvoices} Faktur</p>
          <span class="text-[10px] text-slate-500 font-medium">Raw overdue_days utuh</span>
        </div>
      </div>

      <!-- AR Aging Distribution Bar -->
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm text-xs">
        <h3 class="font-bold text-slate-800 text-sm mb-1">Distribusi Umur Piutang Aktif (AR Aging)</h3>
        <p class="text-[11px] text-slate-500 mb-3">Total Saldo: Rp ${as.totalPiutang.toLocaleString('id-ID')} dari ${as.totalInvoices} faktur aktif</p>
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-3">
          ${as.buckets.map(b => `
            <div class="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-center">
              <span class="text-slate-500 text-[10px] block font-medium">${b.label}</span>
              <p class="text-sm font-bold text-slate-800 mt-0.5">Rp ${(b.nilai / 1000000).toFixed(1)} Jt</p>
              <span class="text-[10px] font-bold ${b.pct > 0 ? (b.name === 'Current' ? 'text-emerald-600' : 'text-amber-600') : 'text-slate-400'}">${b.pct}%</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Tables Grid: Stock Snapshots & AR Invoices -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- Stock Table (7 cols) -->
        <div class="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
          <div class="p-3.5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
            <h3 class="font-bold text-slate-800 text-sm">Ketersediaan Stok Gudang (Snapshot)</h3>
            <span class="text-[11px] text-slate-500">Menampilkan 25 SKU teratas</span>
          </div>
          <div class="overflow-x-auto max-h-96 scrollbar-thin">
            <table class="w-full text-left">
              <thead class="bg-slate-50 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                <tr>
                  <th class="py-2.5 px-3">Kode / Produk</th>
                  <th class="py-2.5 px-3 text-right">Avail (KTN)</th>
                  <th class="py-2.5 px-3 text-right">ADS / Hr</th>
                  <th class="py-2.5 px-3 text-right">Cover (Hari)</th>
                  <th class="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-medium">
                ${dataStock.items.slice(0, 25).map(it => `
                  <tr class="hover:bg-slate-50">
                    <td class="py-2 px-3">
                      <p class="font-bold text-slate-800 truncate max-w-[220px]">${it.item_name}</p>
                      <p class="text-[10px] text-slate-400 font-mono">${it.item_code}</p>
                    </td>
                    <td class="py-2 px-3 text-right font-bold text-slate-800">${it.available_stock_ctn}</td>
                    <td class="py-2 px-3 text-right text-slate-600">${it.adsCartons}</td>
                    <td class="py-2 px-3 text-right font-bold ${it.coverDays < 3 ? 'text-rose-600' : (it.coverDays > 30 ? 'text-blue-600' : 'text-emerald-600')}">${it.coverDays} hr</td>
                    <td class="py-2 px-3 text-center">
                      <span class="px-2 py-0.5 rounded text-[10px] font-bold ${it.status === 'OOS' ? 'badge-danger' : (it.status === 'LOW' ? 'badge-warning' : (it.status === 'OVERSTOCK' ? 'badge-info' : 'badge-success'))}">
                        ${it.statusLabel}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>

        <!-- AR Ledger Table (5 cols) -->
        <div class="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-xs">
          <div class="p-3.5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
            <h3 class="font-bold text-slate-800 text-sm">Faktur Piutang Aktif</h3>
            <span class="text-[11px] text-slate-500">${as.totalInvoices} Faktur</span>
          </div>
          <div class="overflow-x-auto max-h-96 scrollbar-thin">
            <table class="w-full text-left">
              <thead class="bg-slate-50 text-slate-600 font-semibold sticky top-0 border-b border-slate-200">
                <tr>
                  <th class="py-2.5 px-3">No Faktur / Outlet</th>
                  <th class="py-2.5 px-3 text-right">Saldo</th>
                  <th class="py-2.5 px-3 text-center">OD</th>
                  <th class="py-2.5 px-3 text-right">Bucket</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100 font-medium">
                ${dataAr.invoices.map(inv => `
                  <tr class="hover:bg-slate-50">
                    <td class="py-2 px-3">
                      <p class="font-bold text-slate-800 font-mono">${inv.invoice_number}</p>
                      <p class="text-[10px] text-slate-500 truncate max-w-[160px]">${inv.outlet_name || 'Outlet'}</p>
                    </td>
                    <td class="py-2 px-3 text-right font-bold text-slate-900">
                      Rp ${(inv.saldo_piutang / 1000).toLocaleString('id-ID')} rb
                    </td>
                    <td class="py-2 px-3 text-center font-bold ${inv.overdue_days > 0 ? 'text-rose-600' : 'text-emerald-600'}">
                      ${inv.overdue_days} hr
                    </td>
                    <td class="py-2 px-3 text-right">
                      <span class="px-1.5 py-0.5 rounded text-[10px] font-bold ${inv.bucket === 'CURRENT' ? 'badge-success' : (inv.bucket === '>90' ? 'badge-danger' : 'badge-warning')}">
                        ${inv.bucket}
                      </span>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
    lucide.createIcons();
  } catch (err) {
    main.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Gagal memuat stock & piutang: ${err.message}</div>`;
  }
}

// ==============================================================
// 8. PENGATURAN & AUDIT TRAIL (Admin Forms - Milestone M8)
// ==============================================================
async function renderSettings() {
  const main = document.getElementById('main-content');
  try {
    const [resData, logsRes, filtersRes] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/audit-logs'),
      fetch('/api/filters/options')
    ]);
    const data = await resData.json();
    const logsData = await logsRes.json();
    const filtersData = await filtersRes.json();

    main.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 class="text-xl font-bold text-slate-800 tracking-tight">Pengaturan & Formulir Administrasi</h2>
          <p class="text-xs text-slate-500">Kelola target penjualan, target nilai insentif, hari kerja kalender, kampanye NPL, dan penugasan rayon.</p>
        </div>
        <div class="flex items-center gap-2">
          <span class="badge-success text-xs font-bold px-3 py-1 rounded-lg">User: Aghia (Sales Manager / DSM)</span>
        </div>
      </div>

      <!-- Quick Action Admin Forms Accordion / Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        
        <!-- Form 1: Input Target Kuantiti Manual -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm text-xs">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <i data-lucide="target" class="w-4 h-4 text-blue-600"></i>
            <h3 class="font-bold text-slate-800 text-sm">Form Target Kuantiti (KTN)</h3>
          </div>
          <form onsubmit="submitManualTarget(event)" class="space-y-3">
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Salesman:</label>
                <select id="form-tgt-salesman" class="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg">
                  ${filtersData.salesmen.map(s => `<option value="${s.salesman_id}">${s.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Brand / Group SKU:</label>
                <select id="form-tgt-brand" class="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg">
                  <option value="KOPI TUBRUK GADJAH">KOPI TUBRUK GADJAH</option>
                  <option value="5DAYS">5DAYS</option>
                  <option value="MILK LIFE UHT">MILK LIFE UHT</option>
                  <option value="CAFFINO">CAFFINO</option>
                  <option value="FOX">FOX</option>
                  <option value="DELI">DELI</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Tahun:</label>
                <input type="number" id="form-tgt-year" value="2026" class="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg">
              </div>
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Bulan (1-12):</label>
                <input type="number" id="form-tgt-month" value="5" min="1" max="12" class="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg">
              </div>
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Target (Carton):</label>
                <input type="number" id="form-tgt-qty" step="0.1" placeholder="ctn" required class="w-full p-2 bg-white border border-blue-400 rounded-lg font-bold">
              </div>
            </div>
            <button type="submit" class="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition shadow-sm">
              Simpan Target Kuantiti
            </button>
          </form>
        </div>

        <!-- Form 2: Input Target Nilai Insentif Manual -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm text-xs">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <i data-lucide="award" class="w-4 h-4 text-emerald-600"></i>
            <h3 class="font-bold text-slate-800 text-sm">Form Target Nilai Insentif</h3>
          </div>
          <form onsubmit="submitIncentiveTarget(event)" class="space-y-3">
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Salesman:</label>
                <select id="form-inc-salesman" class="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg">
                  ${filtersData.salesmen.map(s => `<option value="${s.salesman_id}">${s.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Tahun:</label>
                <input type="number" id="form-inc-year" value="2026" class="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg">
              </div>
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Bulan:</label>
                <input type="number" id="form-inc-month" value="5" min="1" max="12" class="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg">
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Target Value Rupiah:</label>
                <input type="number" id="form-inc-val" placeholder="Rp 20.000.000" class="w-full p-2 bg-white border border-emerald-400 rounded-lg font-bold">
              </div>
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Target Kopi (KTN):</label>
                <input type="number" id="form-inc-kopi" placeholder="100" class="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg">
              </div>
            </div>
            <button type="submit" class="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg transition shadow-sm">
              Simpan Target Nilai Insentif
            </button>
          </form>
        </div>

        <!-- Form 3: Kalender Hari Kerja -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm text-xs">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <i data-lucide="calendar" class="w-4 h-4 text-purple-600"></i>
            <h3 class="font-bold text-slate-800 text-sm">Form Kalender Hari Kerja (HK / HKE)</h3>
          </div>
          <form onsubmit="submitCalendar(event)" class="space-y-3">
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Tahun:</label>
                <input type="number" id="form-cal-year" value="2026" class="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg">
              </div>
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Bulan:</label>
                <input type="number" id="form-cal-month" value="5" min="1" max="12" class="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg">
              </div>
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Total HK:</label>
                <input type="number" id="form-cal-hk" value="25" class="w-full p-2 bg-white border border-purple-400 rounded-lg font-bold">
              </div>
              <div>
                <label class="font-semibold text-slate-600 block mb-1">As of HKE:</label>
                <input type="number" id="form-cal-hke" value="8" class="w-full p-2 bg-white border border-purple-400 rounded-lg font-bold">
              </div>
            </div>
            <button type="submit" class="w-full py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-lg transition shadow-sm">
              Perbarui Hari Kerja
            </button>
          </form>
        </div>

        <!-- Form 4: Penugasan Outlet ke Salesman / Rayon -->
        <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm text-xs">
          <div class="flex items-center gap-2 mb-3 pb-2 border-b border-slate-100">
            <i data-lucide="shuffle" class="w-4 h-4 text-amber-600"></i>
            <h3 class="font-bold text-slate-800 text-sm">Form Penugasan Outlet (Reassignment)</h3>
          </div>
          <form onsubmit="submitReassign(event)" class="space-y-3">
            <div>
              <label class="font-semibold text-slate-600 block mb-1">ID Outlet atau Kode Alias:</label>
              <input type="text" id="form-asg-outlet" placeholder="contoh: OUT_8f5afe7f-a706-401c-be89-2f675495d8b3" required class="w-full p-2 bg-white border border-amber-400 rounded-lg font-mono">
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Salesman Baru:</label>
                <select id="form-asg-salesman" class="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg">
                  ${filtersData.salesmen.map(s => `<option value="${s.salesman_id}">${s.name}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="font-semibold text-slate-600 block mb-1">Rayon Baru:</label>
                <select id="form-asg-rayon" class="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg">
                  ${Array.from({length: 15}, (_, i) => `R${String(i+1).padStart(2, '0')}`).map(r => `<option value="${r}">${r}</option>`).join('')}
                </select>
              </div>
            </div>
            <div>
              <label class="font-semibold text-slate-600 block mb-1">Alasan Reassignment:</label>
              <input type="text" id="form-asg-note" placeholder="Catatan perubahan / rotasi" class="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg">
            </div>
            <button type="submit" class="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition shadow-sm">
              Tugaskan Ulang Outlet
            </button>
          </form>
        </div>

      </div>

      <!-- Business Settings Config List -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm text-xs">
        <h3 class="font-bold text-slate-800 text-sm mb-3">Parameter & Ambang Batas Bisnis</h3>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          ${data.settings.filter(s => s.key !== 'ar_aging_buckets').map(s => `
            <div class="p-3.5 bg-slate-50 rounded-xl border border-slate-200 flex justify-between items-center">
              <div>
                <p class="font-bold text-slate-800 text-xs">${s.label || s.key}</p>
                <p class="text-[11px] text-slate-500 mt-0.5">${s.description || ''}</p>
              </div>
              <span class="px-3 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 text-right whitespace-nowrap shadow-2xs">
                ${s.value} Hari
              </span>
            </div>
          `).join('')}

          ${(() => {
            const arSetting = data.settings.find(s => s.key === 'ar_aging_buckets');
            if (!arSetting) return '';
            const buckets = arSetting.parsedBuckets || ['Current', '1-30', '31-60', '61-90', '>90'];
            const jsonStr = encodeURIComponent(JSON.stringify(buckets));
            return `
              <div class="p-4 bg-slate-50 rounded-xl border border-slate-200 col-span-1 sm:col-span-2 lg:col-span-3">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2.5">
                  <div>
                    <p class="font-bold text-slate-800 text-sm">${arSetting.label || 'Kategori Umur Piutang (AR Aging Buckets)'}</p>
                    <p class="text-[11px] text-slate-500">${arSetting.description || 'Pengelompokan umur piutang untuk klasifikasi faktur dan rasio NPL'}</p>
                  </div>
                  <button onclick="editArBucketsModal('${jsonStr}')" class="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 rounded-lg font-bold text-xs border border-blue-200 transition flex items-center gap-1.5 self-start sm:self-auto">
                    <i data-lucide="edit-3" class="w-3.5 h-3.5"></i> Sesuaikan Kategori Bucket
                  </button>
                </div>
                <div class="flex flex-wrap gap-2 pt-1">
                  ${buckets.map(b => `
                    <span class="px-3 py-1 bg-white text-slate-800 border border-slate-300 rounded-lg font-semibold text-xs shadow-2xs flex items-center gap-1.5">
                      <span class="w-2 h-2 rounded-full ${String(b).includes('>90') || String(b).includes('NPL') ? 'bg-rose-500' : 'bg-blue-500'}"></span>
                      ${b}
                    </span>
                  `).join('')}
                </div>
              </div>
            `;
          })()}
        </div>
      </div>

      <!-- Audit Trail Table -->
      <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm text-xs">
        <div class="flex items-center justify-between mb-3">
          <div>
            <h3 class="font-bold text-slate-800 text-sm">Audit Trail (Rekam Jejak Aktivitas)</h3>
            <p class="text-slate-500 text-[11px]">Mencatat setiap import data, perubahan setting, dan mutasi outlet secara permanen.</p>
          </div>
          <span class="text-[11px] font-semibold bg-slate-100 text-slate-600 px-2 py-1 rounded">50 Catatan Terakhir</span>
        </div>

        <div class="overflow-x-auto max-h-80 scrollbar-thin">
          <table class="w-full text-left">
            <thead class="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0">
              <tr>
                <th class="py-2.5 px-3">Waktu</th>
                <th class="py-2.5 px-3">Pengguna</th>
                <th class="py-2.5 px-3">Aksi</th>
                <th class="py-2.5 px-3">Entitas</th>
                <th class="py-2.5 px-3">ID Entitas</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 font-medium">
              ${logsData.logs.map(l => `
                <tr class="hover:bg-slate-50">
                  <td class="py-2 px-3 text-slate-400 font-mono">${new Date(l.timestamp).toLocaleString('id-ID')}</td>
                  <td class="py-2 px-3 font-bold text-slate-800">${l.user_name} (${l.user_role})</td>
                  <td class="py-2 px-3"><span class="badge-info px-2 py-0.5 rounded text-[10px] font-bold">${l.action}</span></td>
                  <td class="py-2 px-3 text-slate-600">${l.entity_type}</td>
                  <td class="py-2 px-3 font-mono text-slate-500 truncate max-w-[200px]">${l.entity_id}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
    lucide.createIcons();
  } catch (err) {
    main.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Gagal memuat pengaturan: ${err.message}</div>`;
  }
}

// Admin Form Submission Handlers
async function submitManualTarget(e) {
  e.preventDefault();
  const salesmanId = document.getElementById('form-tgt-salesman').value;
  const groupSku = document.getElementById('form-tgt-brand').value;
  const year = parseInt(document.getElementById('form-tgt-year').value, 10);
  const month = parseInt(document.getElementById('form-tgt-month').value, 10);
  const targetCartons = parseFloat(document.getElementById('form-tgt-qty').value);

  try {
    const res = await fetch('/api/settings/target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salesmanId, groupSku, year, month, targetCartons })
    });
    const d = await res.json();
    if (d.success) {
      alert('Target Kuantiti berhasil disimpan!');
      renderSettings();
    } else {
      alert('Gagal: ' + d.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function submitIncentiveTarget(e) {
  e.preventDefault();
  const salesmanId = document.getElementById('form-inc-salesman').value;
  const year = parseInt(document.getElementById('form-inc-year').value, 10);
  const month = parseInt(document.getElementById('form-inc-month').value, 10);
  const targetValueRupiah = parseFloat(document.getElementById('form-inc-val').value || 0);
  const targetKopiCartons = parseFloat(document.getElementById('form-inc-kopi').value || 0);

  try {
    const res = await fetch('/api/settings/incentive-target', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ salesmanId, year, month, targetValueRupiah, targetKopiCartons })
    });
    const d = await res.json();
    if (d.success) {
      alert('Target Nilai Insentif berhasil disimpan!');
      renderSettings();
    } else {
      alert('Gagal: ' + d.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function submitCalendar(e) {
  e.preventDefault();
  const year = parseInt(document.getElementById('form-cal-year').value, 10);
  const month = parseInt(document.getElementById('form-cal-month').value, 10);
  const totalHk = parseInt(document.getElementById('form-cal-hk').value, 10);
  const asOfHke = parseInt(document.getElementById('form-cal-hke').value, 10);

  try {
    const res = await fetch('/api/settings/calendar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ year, month, totalHk, asOfHke })
    });
    const d = await res.json();
    if (d.success) {
      alert('Kalender Hari Kerja berhasil diperbarui!');
      renderSettings();
    } else {
      alert('Gagal: ' + d.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

async function submitReassign(e) {
  e.preventDefault();
  const outletId = document.getElementById('form-asg-outlet').value.trim();
  const salesmanId = document.getElementById('form-asg-salesman').value;
  const rayonId = document.getElementById('form-asg-rayon').value;
  const note = document.getElementById('form-asg-note').value.trim();

  try {
    const res = await fetch('/api/settings/outlet-assignment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outletId, salesmanId, rayonId, note })
    });
    const d = await res.json();
    if (d.success) {
      alert('Penugasan Outlet berhasil diperbarui!');
      renderSettings();
    } else {
      alert('Gagal: ' + d.error);
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

function editArBucketsModal(encoded) {
  const modal = document.getElementById('modal-container');
  const modalContent = document.getElementById('modal-content');
  modal.classList.remove('hidden');

  let currentBuckets = ['Current', '1-30', '31-60', '61-90', '>90'];
  try {
    currentBuckets = JSON.parse(decodeURIComponent(encoded));
  } catch(e) {}

  modalContent.innerHTML = `
    <button onclick="closeModal()" class="absolute top-5 right-5 text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition">
      <i data-lucide="x" class="w-5 h-5"></i>
    </button>
    <div class="border-b border-slate-200 pb-3 mb-4">
      <h3 class="text-base font-bold text-slate-800">Sesuaikan Kategori Umur Piutang (AR Aging Buckets)</h3>
      <p class="text-xs text-slate-500">Tentukan klasifikasi umur piutang dalam hari (misal: Current, 1-30, 31-60, 61-90, >90).</p>
    </div>
    <form onsubmit="submitArBuckets(event)" class="space-y-4">
      <div>
        <label class="block text-xs font-semibold text-slate-700 mb-1">Daftar Kategori Bucket (dipisahkan koma):</label>
        <input type="text" id="ar-buckets-input" value="${currentBuckets.join(', ')}" class="w-full p-2.5 text-xs bg-white border border-blue-400 rounded-lg font-medium" required>
        <p class="text-[11px] text-slate-400 mt-1">Contoh: Current, 1-30, 31-60, 61-90, >90</p>
      </div>
      <div class="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button type="button" onclick="closeModal()" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold">Batal</button>
        <button type="submit" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-sm">Simpan Kategori</button>
      </div>
    </form>
  `;
  lucide.createIcons();
}

async function submitArBuckets(e) {
  e.preventDefault();
  const inputVal = document.getElementById('ar-buckets-input').value;
  const buckets = inputVal.split(',').map(b => b.trim()).filter(Boolean);
  try {
    const res = await fetch('/api/settings/ar-buckets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buckets })
    });
    const result = await res.json();
    if (result.success) {
      closeModal();
      alert('Kategori Umur Piutang berhasil diperbarui!');
      renderSettings();
    } else {
      alert('Gagal: ' + (result.error || 'Terjadi kesalahan'));
    }
  } catch (err) {
    alert('Error: ' + err.message);
  }
}

// Global Header & Outlet Directory Search Suite
let globalSearchDebounceTimer = null;

function submitGlobalSearch(query) {
  let q = query;
  if (q === undefined || q === null) {
    const input = document.getElementById('global-search');
    q = input ? input.value : '';
  }
  q = (q || '').trim();
  window.globalOutletSearch = q;

  const topInput = document.getElementById('global-search');
  if (topInput && topInput.value !== q) {
    topInput.value = q;
  }
  const clearBtn = document.getElementById('global-search-clear-btn');
  if (clearBtn) {
    if (q) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  const tableInput = document.getElementById('table-outlet-search-input');
  if (tableInput && tableInput.value !== q) {
    tableInput.value = q;
  }

  if (currentTab !== 'outlet') {
    window.location.hash = '#outlet';
  } else {
    renderOutlet();
  }
}

function handleGlobalSearch(event) {
  if (event && event.key === 'Enter') {
    event.preventDefault();
    submitGlobalSearch();
  }
}

function handleGlobalSearchInput(event) {
  const val = event && event.target ? event.target.value : '';
  const clearBtn = document.getElementById('global-search-clear-btn');
  if (clearBtn) {
    if (val.trim()) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  clearTimeout(globalSearchDebounceTimer);
  globalSearchDebounceTimer = setTimeout(() => {
    submitGlobalSearch(val);
  }, 350);
}

function clearGlobalSearch() {
  submitGlobalSearch('');
}

function handleTableOutletSearch(event) {
  const val = event && event.target ? event.target.value : '';
  clearTimeout(globalSearchDebounceTimer);
  globalSearchDebounceTimer = setTimeout(() => {
    submitGlobalSearch(val);
  }, 300);
}

function toggleAlertsMenu() {
  const el = document.getElementById('alerts-dropdown');
  el.classList.toggle('hidden');
}

// ==============================================================
// 11. PRICELIST & SIMULATION (KATALOG, STRATA DISKON & KALKULATOR ORDER TOKO)
// ==============================================================
window.pricelistState = {
  subTab: 'katalog', // 'katalog' | 'strata' | 'simulasi'
  selectedPrincipal: 'ALL',
  searchTerm: '',
  items: [],
  principals: [],
  strataRules: null,
  simulationItems: [],
  simulationOutlet: '',
  autoApplyStrata: true,
  strataCalcCategory: 'KOPI_NON_RTD',
  strataCalcQty: 5,
  initialized: false
};

const SARIWANGI_SELECTED_SKUS = [
  '68143151', // SARIWANGI ASLI RL TB 48X(25X1.85G)
  '68143147', // SARIWANGI ASLI RL TB 288X(4X1.85G)
  '68143146', // SARIWANGI MELATI RL TB 48X(25X1.9G)
  '68143155', // SARIMURNI RL TB 48X(25X1.6G)
  '68791374', // SARIMURNI RL RB 180X(5X1.8G)
  '68143150'  // SARIMURNI RL RB 48X(20X1.8G)
];

const SARIWANGI_SELECTED_DETAILS = [
  { item_code: '68143151', item_name: 'SARIWANGI ASLI RL TB 48X(25X1.85G)' },
  { item_code: '68143147', item_name: 'SARIWANGI ASLI RL TB 288X(4X1.85G)' },
  { item_code: '68143146', item_name: 'SARIWANGI MELATI RL TB 48X(25X1.9G)' },
  { item_code: '68143155', item_name: 'SARIMURNI RL TB 48X(25X1.6G)' },
  { item_code: '68791374', item_name: 'SARIMURNI RL RB 180X(5X1.8G)' },
  { item_code: '68143150', item_name: 'SARIMURNI RL RB 48X(20X1.8G)' }
];

const SARIWANGI_REGULER_TIERS = [
  { min: 0, max: 0.999, discPct: 0, label: '< 1 ktn', badge: '0% Diskon', desc: 'Tidak ada diskon' },
  { min: 1, max: 5.999, discPct: 0.75, label: '1 - 5 ktn', badge: '0.75% Diskon', desc: 'Reguler toko kecil' },
  { min: 6, max: 10.999, discPct: 1.00, label: '6 - 10 ktn', badge: '1.00% Diskon', desc: 'Reguler toko medium' },
  { min: 11, max: Infinity, discPct: 1.25, label: '≥ 11 ktn', badge: '1.25% Diskon', desc: 'Reguler grosir maksimal' }
];

const SARIWANGI_SELECTED_TIERS = [
  { min: 0, max: 5.999, discPct: 0, label: '< 6 ktn', badge: '0% Diskon', desc: 'Belum masuk strata promo' },
  { min: 6, max: 19.999, discPct: 2.00, label: '6 - 19 ktn', badge: '2.00% Diskon', desc: 'Promo outlet tier 1' },
  { min: 20, max: 49.999, discPct: 3.00, label: '20 - 49 ktn', badge: '3.00% Diskon', desc: 'Promo outlet tier 2' },
  { min: 50, max: 99.999, discPct: 5.00, label: '50 - 99 ktn', badge: '5.00% Diskon', desc: 'Promo outlet tier 3' },
  { min: 100, max: Infinity, discPct: 7.00, label: '≥ 100 ktn', badge: '7.00% Diskon', desc: 'Promo outlet tier 4 (Maksimal)' }
];

function isSariwangiSelectedSku(itemOrCode) {
  if (!itemOrCode) return false;
  let code = '';
  let name = '';
  if (typeof itemOrCode === 'string') {
    code = itemOrCode.trim();
  } else {
    code = (itemOrCode.item_code || '').trim();
    name = (itemOrCode.item_name || '').toUpperCase().trim();
    if (itemOrCode.is_strata_selected_sku) return true;
  }
  if (SARIWANGI_SELECTED_SKUS.includes(code)) return true;
  return SARIWANGI_SELECTED_DETAILS.some(d => d.item_code === code || (name && name === d.item_name));
}

const CLIENT_STRATA_RULES = {
  KOPI_NON_RTD: {
    id: 'KOPI_NON_RTD',
    name: 'Kopi Bubuk / Sachet (Non-RTD)',
    brandScope: 'Kopi Gadjah & Caffino (selain beverage/RTD)',
    color: 'amber',
    icon: 'coffee',
    description: 'Semua varian kopi sachet, bag, pouch, renteng, dan box Kopi Tubruk Gadjah dan Caffino (non-RTD).',
    tiers: [
      { min: 0, max: 1.999, discPct: 0, label: '0 - 1 ktn', badge: '0% Diskon', desc: 'Tidak ada diskon' },
      { min: 2, max: 7.999, discPct: 2, label: '2 - 7 ktn', badge: '2% Diskon', desc: 'Diskon dasar toko' },
      { min: 8, max: 14.999, discPct: 3, label: '8 - 14 ktn', badge: '3% Diskon', desc: 'Diskon grosir medium' },
      { min: 15, max: Infinity, discPct: 4, label: '≥ 15 ktn', badge: '4% Diskon', desc: 'Diskon maksimal grosir besar' }
    ]
  },
  BEVERAGE_RTD_MILKLIFE: {
    id: 'BEVERAGE_RTD_MILKLIFE',
    name: 'Beverage RTD, MilkLife UHT & Yoghurt',
    brandScope: 'MilkLife UHT/ESL, Yoghurt Drink, Oat Life & RTD Botol',
    color: 'blue',
    icon: 'milk',
    description: 'Semua produk cair siap minum (RTD), MilkLife ESL/UHT (Kids, Teens, Full Cream), Yoghurt Drink, dan RTD botol.',
    tiers: [
      { min: 0, max: 0.999, discPct: 0, label: '< 1 ktn', badge: '0% Diskon', desc: 'Tidak ada diskon' },
      { min: 1, max: 2.999, discPct: 1, label: '1 - 2 ktn', badge: '1% Diskon', desc: 'Diskon toko kecil' },
      { min: 3, max: 9.999, discPct: 2, label: '3 - 9 ktn', badge: '2% Diskon', desc: 'Diskon kartonan' },
      { min: 10, max: Infinity, discPct: 3, label: '≥ 10 ktn', badge: '3% Diskon', desc: 'Diskon volume grosir' }
    ]
  },
  PRIMA_TOP_BOGA: {
    id: 'PRIMA_TOP_BOGA',
    name: 'Principal Prima Top Boga',
    brandScope: '5Days Croissant, Mini Choco & Deli Daily',
    color: 'rose',
    icon: 'croissant',
    description: 'Semua produk roti croissant 5Days, 5Days Mini Chocolate, dan wafer/snack Deli Daily.',
    tiers: [
      { min: 0, max: 0.999, discPct: 0, label: '< 1 ktn', badge: '0% Diskon', desc: 'Tidak ada diskon' },
      { min: 1, max: 4.999, discPct: 2, label: '1 - 4 ktn', badge: '2% Diskon', desc: 'Diskon order paket toko' },
      { min: 5, max: Infinity, discPct: 3, label: '≥ 5 ktn', badge: '3% Diskon', desc: 'Diskon grosir roti & snack' }
    ]
  },
  CANDY_FOXS: {
    id: 'CANDY_FOXS',
    name: 'Semua Candy FOX\'S',
    brandScope: 'FOX\'S Bag, Tin, Stickpack, Spring Tea & Mints',
    color: 'emerald',
    icon: 'candy',
    description: 'Semua varian permen kristal FOX\'S (Fruits, Berries, Mint, Tin, Bag, Stickpack) dan permen SHOT.',
    tiers: [
      { min: 0, max: 0.999, discPct: 0, label: '< 1 ktn', badge: '0% Diskon', desc: 'Tidak ada diskon' },
      { min: 1, max: 4.999, discPct: 2, label: '1 - 4 ktn', badge: '2% Diskon', desc: 'Diskon toples/bag reguler' },
      { min: 5, max: Infinity, discPct: 3, label: '≥ 5 ktn', badge: '3% Diskon', desc: 'Diskon grosir permen' }
    ]
  },
  UNILEVER: {
    id: 'UNILEVER',
    name: 'SariWangi — Reguler (Semua SKU)',
    brandScope: 'Semua SKU SariWangi & SariMurni (Region Jbks & Jabar)',
    color: 'purple',
    icon: 'coffee',
    description: 'Diskon reguler resmi Unilever untuk seluruh varian SariWangi: 1-5 ktn (0.75%), 6-10 ktn (1.00%), ≥ 11 ktn (1.25%).',
    tiers: SARIWANGI_REGULER_TIERS
  },
  SARIWANGI_SELECTED_SKU: {
    id: 'SARIWANGI_SELECTED_SKU',
    name: 'SariWangi — Support Promo Outlet GT (6 Selected SKU)',
    brandScope: 'Khusus 6 SKU Terpilih (Asli 48x25, Asli 288x4, Melati 48x25, Murni 48x25, 180x5, 48x20)',
    color: 'indigo',
    icon: 'sparkles',
    description: 'Promo Outlet GT: 6-19 ktn (2.00%), 20-49 ktn (3.00%), 50-99 ktn (5.00%), ≥ 100 ktn (7.00%). Ditambahkan secara kumulatif ke diskon reguler bila memenuhi kriteria masing-masing.',
    isDualStrata: true,
    tiers: SARIWANGI_SELECTED_TIERS,
    selectedSkus: SARIWANGI_SELECTED_DETAILS
  }
};

function getItemStrataCategory(it) {
  if (!it) return CLIENT_STRATA_RULES.KOPI_NON_RTD;
  const p = (it.principal || '').toUpperCase();
  const b = (it.brand || '').toUpperCase();
  const name = (it.item_name || '').toUpperCase();
  const code = (it.item_code || '').trim();

  // 1. Beverage RTD & MilkLife
  if (p === 'GLOBAL DAIRY ALAMI' || name.includes(' RTD') || name.includes('CAF RTD') || name.includes('BEVERAGE') || 
      name.includes('HYDROPLUS') || name.includes('YUZU') || name.includes('ISOTONIC') || name.includes('TEA MIX') || 
      name.includes('ORANGE GO') || name.includes('CHOCOLUV')) {
    return CLIENT_STRATA_RULES.BEVERAGE_RTD_MILKLIFE;
  }
  // 2. Candy FOX'S
  if (b.includes('FOX') || name.includes('FOX') || name.includes('SHOT MINT')) {
    return CLIENT_STRATA_RULES.CANDY_FOXS;
  }
  // 3. Prima Top Boga (5Days, Deli Daily)
  if (p === 'PRIMA TOP BOGA' || b.includes('5DAYS') || b.includes('DELI') || name.includes('5DAYS') || name.includes('DELI')) {
    return CLIENT_STRATA_RULES.PRIMA_TOP_BOGA;
  }
  // 4. Unilever / SariWangi (Selected SKU vs General Reguler)
  if (p === 'UNILEVER INDONESIA' || b.includes('SARI') || name.includes('SARIWANGI') || name.includes('SARIMELATI') || name.includes('SARIMURNI') || SARIWANGI_SELECTED_SKUS.includes(code)) {
    if (isSariwangiSelectedSku(it)) {
      return CLIENT_STRATA_RULES.SARIWANGI_SELECTED_SKU;
    }
    return CLIENT_STRATA_RULES.UNILEVER;
  }
  // 5. Kopi Non-RTD
  if (p === 'SUMBER KOPI PRIMA' || b.includes('CAFFINO') || b.includes('GADJAH') || name.includes('CAFFINO') || name.includes('GADJAH') || name.includes('KOPI')) {
    return CLIENT_STRATA_RULES.KOPI_NON_RTD;
  }
  return CLIENT_STRATA_RULES.CANDY_FOXS;
}

function getStrataDiscountInfo(categoryObj, qty, item = null) {
  const q = parseFloat(qty) || 0;
  const category = categoryObj || CLIENT_STRATA_RULES.KOPI_NON_RTD;
  const catId = category.id || '';

  const isUnileverCat = catId === 'UNILEVER' || catId === 'SARIWANGI_SELECTED_SKU' || 
                        catId === 'SARIWANGI_REGULER' ||
                        (item && ((item.principal || '').toUpperCase().includes('UNILEVER') || isSariwangiSelectedSku(item)));

  if (isUnileverCat) {
    const isSelected = catId === 'SARIWANGI_SELECTED_SKU' || isSariwangiSelectedSku(item) || (item && item.is_strata_selected_sku);

    const matchTierClient = (tiers, val) => {
      let matchedTier = tiers[0];
      let matchedIndex = 0;
      for (let i = 0; i < tiers.length; i++) {
        const t = tiers[i];
        if (val >= t.min && val <= t.max) {
          matchedTier = t;
          matchedIndex = i;
          break;
        }
      }
      const nextTier = matchedIndex < tiers.length - 1 ? tiers[matchedIndex + 1] : null;
      const neededToNext = nextTier ? Math.max(0, Math.ceil(nextTier.min - val)) : 0;
      return { matchedTier, matchedIndex, nextTier, neededToNext };
    };

    const regResult = matchTierClient(SARIWANGI_REGULER_TIERS, q);
    const regDisc = regResult.matchedTier.discPct;

    if (isSelected) {
      const selResult = matchTierClient(SARIWANGI_SELECTED_TIERS, q);
      const selDisc = selResult.matchedTier.discPct;
      const totalDisc = Math.round((regDisc + selDisc) * 100) / 100;

      // Find next upgrade threshold
      const candidates = [];
      if (regResult.nextTier && regResult.neededToNext > 0) {
        const pQty = q + regResult.neededToNext;
        const pReg = matchTierClient(SARIWANGI_REGULER_TIERS, pQty).matchedTier.discPct;
        const pSel = matchTierClient(SARIWANGI_SELECTED_TIERS, pQty).matchedTier.discPct;
        const pTot = Math.round((pReg + pSel) * 100) / 100;
        if (pTot > totalDisc) {
          candidates.push({ qty: pQty, needed: regResult.neededToNext, disc: pTot, label: `≥ ${pQty} ktn` });
        }
      }
      if (selResult.nextTier && selResult.neededToNext > 0) {
        const pQty = q + selResult.neededToNext;
        const pReg = matchTierClient(SARIWANGI_REGULER_TIERS, pQty).matchedTier.discPct;
        const pSel = matchTierClient(SARIWANGI_SELECTED_TIERS, pQty).matchedTier.discPct;
        const pTot = Math.round((pReg + pSel) * 100) / 100;
        if (pTot > totalDisc) {
          candidates.push({ qty: pQty, needed: selResult.neededToNext, disc: pTot, label: `≥ ${pQty} ktn` });
        }
      }

      let nextTier = null;
      let neededToNext = 0;
      let hint = 'Maksimal tier diskon (8.25%)!';

      if (candidates.length > 0) {
        candidates.sort((a, b) => a.needed - b.needed);
        const best = candidates[0];
        neededToNext = best.needed;
        hint = `+ ${neededToNext} ktn lagi untuk total ${best.disc}% (Reg + Promo)`;
        nextTier = {
          min: best.qty,
          discPct: best.disc,
          label: best.label,
          badge: `${best.disc}% Diskon`
        };
      }

      return {
        category: CLIENT_STRATA_RULES.SARIWANGI_SELECTED_SKU,
        qty: q,
        discPct: totalDisc,
        regularDiscPct: regDisc,
        selectedSkuDiscPct: selDisc,
        isSelectedSku: true,
        breakdown: `${regDisc}% (Reg) + ${selDisc}% (Selected) = ${totalDisc}%`,
        currentTier: {
          label: `${regResult.matchedTier.label} (Reg) + ${selResult.matchedTier.label} (Promo)`,
          badge: `${totalDisc}% Diskon`,
          discPct: totalDisc,
          desc: `Reguler: ${regResult.matchedTier.badge} + Promo: ${selResult.matchedTier.badge}`
        },
        nextTier,
        neededToNext,
        hint
      };
    } else {
      // General SariWangi (Non-Selected SKU)
      return {
        category: CLIENT_STRATA_RULES.UNILEVER,
        qty: q,
        discPct: regDisc,
        regularDiscPct: regDisc,
        selectedSkuDiscPct: 0,
        isSelectedSku: false,
        breakdown: `${regDisc}% (Reguler)`,
        currentTier: regResult.matchedTier,
        nextTier: regResult.nextTier,
        neededToNext: regResult.neededToNext,
        hint: regResult.nextTier && regResult.neededToNext > 0 
          ? `+ ${regResult.neededToNext} ktn lagi ke diskon ${regResult.nextTier.discPct}% (${regResult.nextTier.label})` 
          : 'Maksimal tier reguler'
      };
    }
  }

  // Non-Unilever categories
  const tiers = category.tiers || [];
  let matchedTier = tiers[0];
  let matchedIndex = 0;
  for (let i = 0; i < tiers.length; i++) {
    const t = tiers[i];
    if (q >= t.min && q <= t.max) {
      matchedTier = t;
      matchedIndex = i;
      break;
    }
  }

  const nextTier = matchedIndex < tiers.length - 1 ? tiers[matchedIndex + 1] : null;
  const neededToNext = nextTier ? Math.max(0, Math.ceil(nextTier.min - q)) : 0;

  return {
    category,
    qty: q,
    discPct: matchedTier.discPct,
    currentTier: matchedTier,
    nextTier,
    neededToNext,
    hint: nextTier && neededToNext > 0 ? `+ ${neededToNext} ktn lagi ke diskon ${nextTier.discPct}%` : 'Maksimal tier'
  };
}

async function renderPricelist() {
  const main = document.getElementById('main-content');
  try {
    if (!window.pricelistState.initialized || window.pricelistState.items.length === 0) {
      const res = await fetch('/api/pricelist');
      const data = await res.json();
      window.pricelistState.items = data.items || [];
      window.pricelistState.principals = data.principals || [];
      window.pricelistState.initialized = true;

      // Default sample in simulation cart if empty
      if (window.pricelistState.simulationItems.length === 0 && window.pricelistState.items.length > 0) {
        const sample1 = window.pricelistState.items.find(i => i.item_code === '30000000') || window.pricelistState.items[0];
        const sample2 = window.pricelistState.items.find(i => i.item_code === '40399') || window.pricelistState.items[1];
        if (sample1) {
          const cat1 = getItemStrataCategory(sample1);
          const d1 = getStrataDiscountInfo(cat1, 5).discPct;
          window.pricelistState.simulationItems.push({ ...sample1, qty: 5, discPct: d1 });
        }
        if (sample2) {
          const cat2 = getItemStrataCategory(sample2);
          const d2 = getStrataDiscountInfo(cat2, 2).discPct;
          window.pricelistState.simulationItems.push({ ...sample2, qty: 2, discPct: d2 });
        }
      }
    }

    const { subTab } = window.pricelistState;

    main.innerHTML = `
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-4 border-b border-slate-200">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-bold rounded">OFFICIAL PRICELIST</span>
            <span class="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded">STRATA DISKON VOLUME</span>
            <span class="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded">RETAIL PROFIT SIMULATOR</span>
          </div>
          <h1 class="text-xl md:text-2xl font-extrabold text-slate-900 tracking-tight mt-1">Pricelist & Simulation</h1>
          <p class="text-xs text-slate-500 mt-0.5">Katalog harga resmi SKU, matriks strata diskon kuantiti order, dan kalkulator keuntungan pengecer</p>
        </div>

        <!-- Sub-Tab Switcher (3 Tabs) -->
        <div class="flex flex-wrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
          <button onclick="switchPricelistSubTab('katalog')" class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${subTab === 'katalog' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
            <i data-lucide="book-open" class="w-3.5 h-3.5 text-blue-600"></i>
            <span>Katalog Resmi</span>
          </button>

          <button onclick="switchPricelistSubTab('strata')" class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${subTab === 'strata' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
            <i data-lucide="layers" class="w-3.5 h-3.5 text-emerald-600"></i>
            <span>Matriks Strata Diskon</span>
            <span class="px-1.5 py-0.2 bg-emerald-100 text-emerald-800 text-[9px] font-black rounded-full">5 Kategori</span>
          </button>

          <button onclick="switchPricelistSubTab('simulasi')" class="px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${subTab === 'simulasi' ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600 hover:text-slate-900'}">
            <i data-lucide="calculator" class="w-3.5 h-3.5 text-amber-500"></i>
            <span>Simulator Order & Margin</span>
            <span class="px-1.5 py-0.2 bg-amber-100 text-amber-800 text-[9px] font-black rounded-full">${window.pricelistState.simulationItems.length}</span>
          </button>
        </div>
      </div>

      <div id="pricelist-container" class="mt-4">
        <!-- Injected based on subTab -->
      </div>
    `;

    lucide.createIcons();
    if (subTab === 'katalog') {
      renderPricelistCatalogView();
    } else if (subTab === 'strata') {
      renderPricelistStrataView();
    } else {
      renderPricelistSimulatorView();
    }
  } catch (err) {
    main.innerHTML = `<div class="p-6 bg-rose-50 text-rose-700 rounded-xl">Gagal memuat Pricelist: ${err.message}</div>`;
  }
}

function switchPricelistSubTab(tab) {
  window.pricelistState.subTab = tab;
  renderPricelist();
}

function filterPricelistPrincipal(p) {
  window.pricelistState.selectedPrincipal = p;
  renderPricelistCatalogView();
}

function handlePricelistSearch(e) {
  window.pricelistState.searchTerm = (e.target.value || '').toLowerCase();
  renderPricelistTableBody();
}

function exportPricelistCsv() {
  const p = window.pricelistState.selectedPrincipal;
  const q = new URLSearchParams();
  if (p && p !== 'ALL') q.append('principal', p);
  window.location.href = `/api/pricelist/export?${q.toString()}`;
}

function renderPricelistCatalogView() {
  const container = document.getElementById('pricelist-container');
  if (!container) return;

  const { items, principals, selectedPrincipal } = window.pricelistState;
  let filtered = items;
  if (selectedPrincipal !== 'ALL') {
    filtered = filtered.filter(i => i.principal === selectedPrincipal);
  }

  container.innerHTML = `
    <!-- Top 4 Summary Cards -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
          <span>Total SKU Aktif</span>
          <i data-lucide="package" class="w-4 h-4 text-blue-500"></i>
        </div>
        <div class="text-xl md:text-2xl font-extrabold text-slate-900 font-mono">
          ${items.length} <span class="text-xs font-normal text-slate-500">SKU</span>
        </div>
        <div class="mt-2 text-[11px] text-slate-500">
          5 Principal Distribusi Resmi
        </div>
      </div>

      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
          <span>Principal Terpilih</span>
          <i data-lucide="building-2" class="w-4 h-4 text-emerald-500"></i>
        </div>
        <div class="text-base md:text-lg font-extrabold text-slate-900 truncate">
          ${selectedPrincipal === 'ALL' ? 'Semua Principal' : selectedPrincipal}
        </div>
        <div class="mt-2 text-[11px] text-slate-500 font-mono">
          ${filtered.length} SKU dalam daftar
        </div>
      </div>

      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
          <span>Panduan Strata Diskon</span>
          <i data-lucide="layers" class="w-4 h-4 text-emerald-600"></i>
        </div>
        <div class="text-xl md:text-2xl font-extrabold text-emerald-700 font-mono">
          5 <span class="text-xs font-normal text-slate-500">Kategori</span>
        </div>
        <div class="mt-2 text-[11px] text-slate-500">
          <button onclick="switchPricelistSubTab('strata')" class="text-emerald-700 hover:underline font-semibold">Buka Matriks Diskon →</button>
        </div>
      </div>

      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div class="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
          <span>Unduh Pricelist</span>
          <i data-lucide="file-spreadsheet" class="w-4 h-4 text-emerald-600"></i>
        </div>
        <button onclick="exportPricelistCsv()" class="w-full mt-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-sm">
          <i data-lucide="download" class="w-4 h-4"></i>
          <span>Unduh CSV Pricelist</span>
        </button>
      </div>
    </div>

    <!-- Filter & Search Toolbar -->
    <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm mt-4 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <!-- Principal Pill Switcher -->
        <div class="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs font-semibold">
          <button onclick="filterPricelistPrincipal('ALL')" class="px-3 py-1.5 rounded-lg transition ${selectedPrincipal === 'ALL' ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
            Semua (${items.length})
          </button>
          ${principals.map(p => `
            <button onclick="filterPricelistPrincipal('${p.principal}')" class="px-3 py-1.5 rounded-lg transition ${selectedPrincipal === p.principal ? 'bg-white text-blue-700 shadow-sm font-bold' : 'text-slate-600 hover:text-slate-900'}">
              ${p.principal} (${p.count})
            </button>
          `).join('')}
        </div>

        <!-- Search input -->
        <div class="relative w-full sm:w-64">
          <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input type="text" oninput="handlePricelistSearch(event)" placeholder="Cari nama / kode SKU..." class="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none">
        </div>
      </div>
    </div>

    <!-- Master Pricelist Table -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm mt-4 overflow-hidden">
      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-left text-xs border-collapse">
          <thead class="bg-slate-50 text-slate-700 font-bold border-b border-slate-200 select-none">
            <tr>
              <th class="py-2.5 px-3 text-center w-10">No</th>
              <th class="py-2.5 px-3">Kode SKU</th>
              <th class="py-2.5 px-3">Nama Produk & Kemasan</th>
              <th class="py-2.5 px-3">Strata Diskon</th>
              <th class="py-2.5 px-3 text-center">Isi/Ktn</th>
              <th class="py-2.5 px-3 text-right text-blue-900 bg-blue-50/50">PL Ktn (Inc PPN)</th>
              <th class="py-2.5 px-3 text-right">PL Ktn (Exc PPN)</th>
              <th class="py-2.5 px-3 text-right">HET Rtg/Box</th>
              <th class="py-2.5 px-3 text-right">HET Pcs</th>
              <th class="py-2.5 px-3 text-right text-emerald-800 bg-emerald-50/40">Margin Toko (%)</th>
              <th class="py-2.5 px-3 text-center">Aksi</th>
            </tr>
          </thead>
          <tbody id="pricelist-table-body" class="divide-y divide-slate-100 text-slate-700 font-medium">
            <!-- Populated dynamically -->
          </tbody>
        </table>
      </div>
    </div>
  `;

  lucide.createIcons();
  renderPricelistTableBody();
}

function renderPricelistTableBody() {
  const tbody = document.getElementById('pricelist-table-body');
  if (!tbody) return;

  const { items, selectedPrincipal, searchTerm } = window.pricelistState;
  let filtered = items;
  if (selectedPrincipal !== 'ALL') {
    filtered = filtered.filter(i => i.principal === selectedPrincipal);
  }
  if (searchTerm) {
    filtered = filtered.filter(i => 
      (i.item_code || '').toLowerCase().includes(searchTerm) ||
      (i.item_name || '').toLowerCase().includes(searchTerm) ||
      (i.brand || '').toLowerCase().includes(searchTerm)
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="11" class="py-12 text-center text-slate-400">Tidak ada produk yang cocok dengan pencarian</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((it, idx) => {
    let marginPct = it.retail_margin_pct;
    if (marginPct === null || marginPct === undefined) {
      if (it.het_pcs_inc_ppn && it.pcs_per_ktn && it.price_carton_inc_ppn) {
        const retailTotal = it.het_pcs_inc_ppn * it.pcs_per_ktn;
        if (retailTotal > 0) marginPct = Math.round(((retailTotal - it.price_carton_inc_ppn) / retailTotal) * 1000) / 10;
      } else if (it.het_inner_inc_ppn && it.isi_per_ktn && it.price_carton_inc_ppn) {
        const retailTotal = it.het_inner_inc_ppn * it.isi_per_ktn;
        if (retailTotal > 0) marginPct = Math.round(((retailTotal - it.price_carton_inc_ppn) / retailTotal) * 1000) / 10;
      }
    }

    const marginBadge = marginPct !== null && marginPct !== undefined
      ? `<span class="inline-flex items-center font-mono font-bold text-xs ${marginPct >= 15 ? 'text-emerald-700' : marginPct >= 10 ? 'text-blue-700' : 'text-amber-700'}">${marginPct}%</span>`
      : `<span class="text-slate-300">—</span>`;

    const strataCat = getItemStrataCategory(it);
    const isAlreadyInSim = window.pricelistState.simulationItems.some(s => s.item_code === it.item_code);

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">${idx + 1}</td>
        <td class="py-2.5 px-3 font-mono font-bold text-slate-800 whitespace-nowrap">
          ${it.item_code}
        </td>
        <td class="py-2.5 px-3">
          <div class="font-bold text-slate-900">${it.item_name}</div>
          <div class="text-[10px] text-slate-500 flex items-center gap-1.5 mt-0.5">
            <span class="font-semibold text-slate-600">${it.brand || it.principal}</span>
            ${it.satuan_inner ? `<span>• Isi: ${it.isi_per_ktn} ${it.satuan_inner}</span>` : ''}
          </div>
        </td>
        <td class="py-2.5 px-3 whitespace-nowrap">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-${strataCat.color}-50 text-${strataCat.color}-800 border border-${strataCat.color}-200">
            ${strataCat.name.split(' (')[0]}
          </span>
        </td>
        <td class="py-2.5 px-3 text-center font-mono text-[11px] text-slate-700 whitespace-nowrap">
          ${it.isi_per_ktn ? `${it.isi_per_ktn} ${it.satuan_inner || ''}` : '—'}
        </td>
        <td class="py-2.5 px-3 text-right font-mono font-extrabold text-blue-900 bg-blue-50/30 whitespace-nowrap">
          ${it.price_carton_inc_ppn ? 'Rp ' + Math.round(it.price_carton_inc_ppn).toLocaleString('id-ID') : '—'}
        </td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
          ${it.price_carton_exc_ppn ? 'Rp ' + Math.round(it.price_carton_exc_ppn).toLocaleString('id-ID') : '—'}
        </td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
          ${it.het_inner_inc_ppn ? 'Rp ' + Math.round(it.het_inner_inc_ppn).toLocaleString('id-ID') : '—'}
        </td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
          ${it.het_pcs_inc_ppn ? 'Rp ' + Math.round(it.het_pcs_inc_ppn).toLocaleString('id-ID') : '—'}
        </td>
        <td class="py-2.5 px-3 text-right font-mono bg-emerald-50/20 whitespace-nowrap">
          ${marginBadge}
        </td>
        <td class="py-2.5 px-3 text-center whitespace-nowrap">
          <button onclick="addToSimulation('${it.item_code}')" class="px-2 py-1 rounded text-[11px] font-bold transition flex items-center gap-1 mx-auto ${isAlreadyInSim ? 'bg-amber-100 text-amber-800' : 'bg-blue-50 hover:bg-blue-100 text-blue-700'}">
            <i data-lucide="${isAlreadyInSim ? 'check' : 'plus'}" class="w-3.5 h-3.5"></i>
            <span>${isAlreadyInSim ? 'Terpilih' : '+ Simulasi'}</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();
}

// ==============================================================
// 11B. MATRIKS STRATA DISKON VIEW
// ==============================================================
function renderPricelistStrataView() {
  const container = document.getElementById('pricelist-container');
  if (!container) return;

  const currentCatKey = window.pricelistState.strataCalcCategory || 'KOPI_NON_RTD';
  const currentQty = window.pricelistState.strataCalcQty || 5;
  const currentCalc = getStrataDiscountInfo(CLIENT_STRATA_RULES[currentCatKey], currentQty);

  container.innerHTML = `
    <!-- Header Banner -->
    <div class="bg-gradient-to-r from-emerald-900 via-teal-900 to-slate-900 p-6 rounded-2xl text-white shadow-md border border-emerald-800/40">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-2">
            <i data-lucide="shield-check" class="w-3.5 h-3.5"></i>
            <span>Ketentuan Resmi Cabang Garut</span>
          </div>
          <h2 class="text-xl md:text-2xl font-black text-white">Matriks Strata Diskon Volume Penjualan</h2>
          <p class="text-xs text-emerald-100 mt-1 max-w-2xl leading-relaxed">
            Strata diskon resmi berbasis akumulasi kuantiti karton (Ktn) per kategori produk. Skema diskon ini diterapkan secara otomatis pada kalkulator order toko untuk mendorong basket size dan volume grosir.
          </p>
        </div>

        <button onclick="switchPricelistSubTab('simulasi')" class="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black transition shadow-lg">
          <i data-lucide="calculator" class="w-4 h-4"></i>
          <span>Buka Kalkulator Simulasi Order</span>
        </button>
      </div>
    </div>

    <!-- Dual Strata Stacking Callout Banner for SariWangi -->
    <div class="mt-4 p-4 rounded-2xl bg-gradient-to-r from-purple-900/90 via-indigo-900/90 to-slate-900 text-white border border-purple-500/30 shadow-md">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-start gap-3">
          <div class="p-2.5 rounded-xl bg-purple-500/20 border border-purple-400/30 text-purple-300 shrink-0">
            <i data-lucide="plus-circle" class="w-6 h-6"></i>
          </div>
          <div>
            <div class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-500/30 text-purple-200 text-[10px] font-bold uppercase tracking-wider mb-1">
              <span>Aturan Khusus Stacking / Akumulasi Strata SariWangi</span>
            </div>
            <h4 class="text-sm md:text-base font-extrabold text-white">
              Diskon Reguler (Semua SKU) + Strata Selected SKU Promo DITAMBAHKAN!
            </h4>
            <p class="text-xs text-purple-100 mt-1 leading-relaxed">
              Bila outlet membeli salah satu dari <strong>6 Selected SKU GT</strong>, diskon reguler dan diskon promo <strong>ditambahkan</strong> secara kumulatif bila memenuhi kriteria volume karton masing-masing.
            </p>
            <div class="mt-2 p-2.5 rounded-lg bg-black/30 border border-purple-400/20 text-xs font-mono">
              <span class="text-amber-300 font-bold">Contoh Riil:</span> SariWangi Asli RL TB 288 order <strong>50 karton</strong>:
              <br class="hidden sm:inline">
              <span class="text-emerald-400 font-bold">Strata Reguler 1,25%</span> + <span class="text-indigo-300 font-bold">Strata Selected SKU 5,00%</span> = <span class="text-amber-300 font-extrabold bg-purple-950 px-2 py-0.5 rounded border border-amber-400/40 text-xs">TOTAL DISKON 6,25%</span>!
            </div>
          </div>
        </div>

        <div class="shrink-0 flex sm:flex-col gap-2">
          <button onclick="testStrataPreset('SARIWANGI_SELECTED_SKU', 50)" class="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-purple-950 rounded-xl text-xs font-black transition shadow-sm flex items-center justify-center gap-1.5">
            <i data-lucide="calculator" class="w-4 h-4"></i>
            <span>Uji Coba 50 Ktn (6.25%)</span>
          </button>
          <button onclick="testStrataPreset('SARIWANGI_SELECTED_SKU', 100)" class="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black transition shadow-sm flex items-center justify-center gap-1.5">
            <i data-lucide="zap" class="w-4 h-4"></i>
            <span>Uji Coba 100 Ktn (8.25%)</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Interactive Strata Quick-Tester Widget -->
    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm mt-4">
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
        <div>
          <h3 class="text-sm font-bold text-slate-900 flex items-center gap-2">
            <i data-lucide="sparkles" class="w-4 h-4 text-emerald-600"></i>
            <span>Kalkulator Uji Cepat Strata Diskon</span>
          </h3>
          <p class="text-xs text-slate-500 mt-0.5">Pilih kategori produk dan masukkan jumlah karton untuk melihat hasil diskon serta jarak ke tier selanjutnya</p>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <div>
            <label class="block text-[11px] font-bold text-slate-600 mb-1">Pilih Kategori:</label>
            <select id="strata-test-cat" onchange="handleStrataQuickTestChange()" class="bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500">
              ${Object.values(CLIENT_STRATA_RULES).map(r => `
                <option value="${r.id}" ${r.id === currentCatKey ? 'selected' : ''}>${r.name}</option>
              `).join('')}
            </select>
          </div>

          <div>
            <label class="block text-[11px] font-bold text-slate-600 mb-1">Qty Order (Karton):</label>
            <input type="number" id="strata-test-qty" min="0" max="999" value="${currentQty}" oninput="handleStrataQuickTestChange()" class="w-24 bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 text-xs font-mono font-bold text-slate-900 text-center focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500">
          </div>
        </div>
      </div>

      <!-- Quick Tester Result Bar -->
      <div id="strata-test-result" class="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div class="flex items-center gap-4">
          <div class="p-3 rounded-xl bg-emerald-100 text-emerald-800 font-mono font-black text-2xl">
            ${currentCalc.discPct}%
          </div>
          <div>
            <div class="text-xs font-bold text-slate-900">
              Tier Terpenuhi: <span class="text-emerald-700 font-mono font-extrabold">${currentCalc.currentTier.label} (${currentCalc.currentTier.badge})</span>
            </div>
            ${currentCalc.breakdown ? `
              <div class="text-[11px] font-bold text-indigo-700 mt-0.5">
                <span class="px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded font-mono">${currentCalc.breakdown}</span>
              </div>
            ` : ''}
            <div class="text-[11px] text-slate-600 mt-0.5">
              Kategori: <strong>${currentCalc.category.name}</strong> (${currentCalc.qty} Karton)
            </div>
          </div>
        </div>

        <div class="md:text-right">
          <div class="text-xs font-bold text-slate-700">
            ${currentCalc.nextTier ? `Tier Berikutnya: <span class="text-blue-700 font-mono font-bold">${currentCalc.nextTier.label} (${currentCalc.nextTier.badge})</span>` : '<span class="text-emerald-700 font-bold">Tier Diskon Tertinggi!</span>'}
          </div>
          <div class="text-[11px] text-amber-700 font-semibold mt-0.5">
            ${currentCalc.hint}
          </div>
        </div>
      </div>
    </div>

    <!-- Strata Category Cards Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-4">
      ${Object.values(CLIENT_STRATA_RULES).map((cat, idx) => `
        <div class="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col justify-between ${cat.id === 'SARIWANGI_SELECTED_SKU' ? 'ring-2 ring-indigo-500/30' : ''}">
          <div>
            <!-- Card Header -->
            <div class="p-4 bg-slate-50/80 border-b border-slate-200">
              <div class="flex items-center justify-between gap-2">
                <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-black bg-${cat.color}-100 text-${cat.color}-900 font-mono">
                  ${cat.isDualStrata ? 'PROMO KHUSUS GT' : `KATEGORI 0${idx + 1}`}
                </span>
                <span class="text-[10px] text-slate-500 font-medium">Resmi DSO Garut</span>
              </div>
              <h4 class="text-sm font-extrabold text-slate-900 mt-2">${cat.name}</h4>
              <p class="text-[11px] text-slate-500 font-medium mt-0.5">${cat.brandScope}</p>
            </div>

            <!-- Tiers Table -->
            <div class="p-4">
              <div class="text-[11px] font-bold text-slate-700 mb-2 flex items-center justify-between">
                <span>Volume Order (Karton)</span>
                <span>Diskon ${cat.isDualStrata ? 'Promo (+ Reguler)' : 'Strata'}</span>
              </div>
              <div class="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden">
                ${cat.tiers.map((t, tIdx) => `
                  <div class="py-2 px-3 flex items-center justify-between text-xs ${tIdx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}">
                    <div class="flex items-center gap-2">
                      <span class="font-mono font-bold text-slate-800">${t.label}</span>
                      <span class="text-[10px] text-slate-400">• ${t.desc}</span>
                    </div>
                    <span class="font-mono font-black text-${cat.color}-700 bg-${cat.color}-50 px-2 py-0.5 rounded text-xs">
                      ${t.badge}
                    </span>
                  </div>
                `).join('')}
              </div>

              ${cat.selectedSkus ? `
                <div class="mt-3 p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-lg">
                  <div class="text-[11px] font-bold text-indigo-950 mb-1.5 flex items-center justify-between">
                    <span class="flex items-center gap-1">
                      <i data-lucide="sparkles" class="w-3.5 h-3.5 text-indigo-600"></i>
                      <span>6 Selected SKU Penerima Promo:</span>
                    </span>
                    <span class="text-[9px] text-indigo-600 font-mono font-bold">Region GT</span>
                  </div>
                  <div class="space-y-1 max-h-32 overflow-y-auto pr-1 scrollbar-thin">
                    ${cat.selectedSkus.map(s => `
                      <div class="p-1 rounded bg-white border border-slate-100 flex items-center justify-between text-[10px]">
                        <span class="font-mono font-bold text-slate-800">${s.item_code}</span>
                        <span class="text-slate-600 truncate ml-2 font-medium text-[9px]">${s.item_name}</span>
                      </div>
                    `).join('')}
                  </div>
                  <div class="mt-2 pt-1.5 border-t border-indigo-200/50 text-[10px] text-indigo-900 font-medium">
                    💡 <em>Diskon promo di atas otomatis ditambahkan ke diskon reguler (0.75% s/d 1.25%).</em>
                  </div>
                </div>
              ` : ''}

              <!-- Scope description -->
              <p class="text-[11px] text-slate-500 mt-3 leading-relaxed">
                ${cat.description}
              </p>
            </div>
          </div>

          <!-- Card Footer Action -->
          <div class="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
            <span class="text-[10px] text-slate-500 font-medium">${cat.tiers.length} tingkatan strata</span>
            <button onclick="openSimulationForCategory('${cat.id}')" class="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 transition">
              <span>Simulasikan Order</span>
              <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  lucide.createIcons();
}

function testStrataPreset(catKey, qty) {
  const catEl = document.getElementById('strata-test-cat');
  const qtyEl = document.getElementById('strata-test-qty');
  if (catEl && qtyEl) {
    catEl.value = catKey;
    qtyEl.value = qty;
    handleStrataQuickTestChange();
    catEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function handleStrataQuickTestChange() {
  const catEl = document.getElementById('strata-test-cat');
  const qtyEl = document.getElementById('strata-test-qty');
  if (!catEl || !qtyEl) return;

  const catKey = catEl.value;
  const qty = parseFloat(qtyEl.value) || 0;
  window.pricelistState.strataCalcCategory = catKey;
  window.pricelistState.strataCalcQty = qty;

  const calc = getStrataDiscountInfo(CLIENT_STRATA_RULES[catKey], qty);
  const resultContainer = document.getElementById('strata-test-result');
  if (resultContainer) {
    resultContainer.innerHTML = `
      <div class="flex items-center gap-4">
        <div class="p-3 rounded-xl bg-emerald-100 text-emerald-800 font-mono font-black text-2xl">
          ${calc.discPct}%
        </div>
        <div>
          <div class="text-xs font-bold text-slate-900">
            Tier Terpenuhi: <span class="text-emerald-700 font-mono font-extrabold">${calc.currentTier.label} (${calc.currentTier.badge})</span>
          </div>
          ${calc.breakdown ? `
            <div class="text-[11px] font-bold text-indigo-700 mt-0.5">
              <span class="px-2 py-0.5 bg-indigo-50 border border-indigo-200 rounded font-mono">${calc.breakdown}</span>
            </div>
          ` : ''}
          <div class="text-[11px] text-slate-600 mt-0.5">
            Kategori: <strong>${calc.category.name}</strong> (${calc.qty} Karton)
          </div>
        </div>
      </div>

      <div class="md:text-right">
        <div class="text-xs font-bold text-slate-700">
          ${calc.nextTier ? `Tier Berikutnya: <span class="text-blue-700 font-mono font-bold">${calc.nextTier.label} (${calc.nextTier.badge})</span>` : '<span class="text-emerald-700 font-bold">Tier Diskon Tertinggi!</span>'}
        </div>
        <div class="text-[11px] text-amber-700 font-semibold mt-0.5">
          ${calc.hint}
        </div>
      </div>
    `;
  }
}

function openSimulationForCategory(catId) {
  const cat = CLIENT_STRATA_RULES[catId];
  if (!cat) return;
  // Switch to simulation subtab
  switchPricelistSubTab('simulasi');
}

// ==============================================================
// 11C. SIMULATOR ORDER & MARGIN RETAIL VIEW
// ==============================================================
function addToSimulation(itemCode) {
  const item = window.pricelistState.items.find(i => i.item_code === itemCode);
  if (!item) return;

  const existing = window.pricelistState.simulationItems.find(i => i.item_code === itemCode);
  if (existing) {
    existing.qty += 1;
    if (window.pricelistState.autoApplyStrata) {
      const cat = getItemStrataCategory(existing);
      existing.discPct = getStrataDiscountInfo(cat, existing.qty, existing).discPct;
    }
  } else {
    const cat = getItemStrataCategory(item);
    const initialQty = 1;
    const initialDisc = window.pricelistState.autoApplyStrata ? getStrataDiscountInfo(cat, initialQty, item).discPct : 0;
    window.pricelistState.simulationItems.push({
      ...item,
      qty: initialQty,
      discPct: initialDisc
    });
  }

  if (window.pricelistState.subTab === 'simulasi') {
    renderPricelistSimulatorView();
  } else {
    renderPricelist();
  }
}

function toggleAutoApplyStrata(enabled) {
  window.pricelistState.autoApplyStrata = enabled;
  if (enabled) {
    // Recalculate discount for all items based on strata
    window.pricelistState.simulationItems.forEach(it => {
      const cat = getItemStrataCategory(it);
      it.discPct = getStrataDiscountInfo(cat, it.qty, it).discPct;
    });
  }
  renderPricelistSimulatorView();
}

function updateSimulationQty(idx, qty) {
  const val = parseFloat(qty) || 0;
  if (val > 0) {
    const it = window.pricelistState.simulationItems[idx];
    it.qty = val;
    if (window.pricelistState.autoApplyStrata) {
      const cat = getItemStrataCategory(it);
      it.discPct = getStrataDiscountInfo(cat, val, it).discPct;
    }
  }
  renderSimulationSummaryAndTotals();
}

function updateSimulationDisc(idx, disc) {
  const val = parseFloat(disc) || 0;
  window.pricelistState.simulationItems[idx].discPct = Math.max(0, Math.min(100, val));
  renderSimulationSummaryAndTotals();
}

function upgradeItemToNextTier(idx) {
  const it = window.pricelistState.simulationItems[idx];
  if (!it) return;
  const cat = getItemStrataCategory(it);
  const info = getStrataDiscountInfo(cat, it.qty, it);
  if (info.nextTier) {
    it.qty = Math.ceil(info.nextTier.min);
    if (window.pricelistState.autoApplyStrata) {
      it.discPct = info.nextTier.discPct;
    }
    renderPricelistSimulatorView();
  }
}

function removeSimulationItem(idx) {
  window.pricelistState.simulationItems.splice(idx, 1);
  renderPricelistSimulatorView();
}

function clearSimulation() {
  if (confirm('Kosongkan semua item dalam simulasi?')) {
    window.pricelistState.simulationItems = [];
    renderPricelistSimulatorView();
  }
}

function renderPricelistSimulatorView() {
  const container = document.getElementById('pricelist-container');
  if (!container) return;

  const { simulationItems, autoApplyStrata } = window.pricelistState;

  container.innerHTML = `
    <!-- Top Simulator Control Header -->
    <div class="bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div class="flex-1 max-w-md">
        <label class="block text-xs font-bold text-slate-700 mb-1">Nama Outlet / Calon Pembeli:</label>
        <div class="relative">
          <i data-lucide="store" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
          <input type="text" id="sim-outlet-name" value="${window.pricelistState.simulationOutlet || ''}" oninput="window.pricelistState.simulationOutlet = this.value" placeholder="Contoh: Toko Barokah (Garut Kota)..." class="w-full bg-slate-50 border border-slate-300 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-800 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:outline-none">
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button onclick="openAddSkuToSimulationModal()" class="inline-flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm">
          <i data-lucide="plus-circle" class="w-4 h-4"></i>
          <span>Tambah SKU</span>
        </button>
        <button onclick="switchPricelistSubTab('strata')" class="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-lg text-xs font-bold transition">
          <i data-lucide="layers" class="w-4 h-4 text-emerald-600"></i>
          <span>Lihat Matriks Strata</span>
        </button>
        <button onclick="clearSimulation()" class="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition">
          <i data-lucide="rotate-ccw" class="w-4 h-4"></i>
          <span>Reset</span>
        </button>
        <button onclick="window.print()" class="inline-flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-sm">
          <i data-lucide="printer" class="w-4 h-4"></i>
          <span>Cetak Nota Simulasi</span>
        </button>
      </div>
    </div>

    <!-- Strata Automation Switch Banner -->
    <div class="mt-3 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs">
      <div class="flex items-center gap-2.5">
        <div class="p-1.5 bg-emerald-100 text-emerald-800 rounded-lg">
          <i data-lucide="sparkles" class="w-4 h-4"></i>
        </div>
        <div>
          <span class="font-bold text-emerald-950">Otomatisasi Strata Diskon Resmi Garut:</span>
          <span class="text-emerald-800 ml-1">Diskon dihitung otomatis sesuai kuantiti karton dan kategori produk (Kopi, RTD/MilkLife, Prima Top Boga, Fox's, Unilever).</span>
        </div>
      </div>

      <label class="inline-flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" onchange="toggleAutoApplyStrata(this.checked)" ${autoApplyStrata ? 'checked' : ''} class="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500">
        <span class="font-bold text-emerald-900 text-xs">Terapkan Strata Otomatis</span>
      </label>
    </div>

    <!-- 4 KPI Summary Cards (Dynamic) -->
    <div id="sim-kpi-cards" class="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mt-4">
      <!-- Injected by renderSimulationSummaryAndTotals -->
    </div>

    <!-- Simulation Table -->
    <div class="bg-white rounded-xl border border-slate-200 shadow-sm mt-4 overflow-hidden">
      <div class="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <h3 class="text-xs font-bold text-slate-800 flex items-center gap-1.5">
          <i data-lucide="calculator" class="w-4 h-4 text-blue-600"></i>
          <span>Rincian Paket Order & Potensi Margin Retailer</span>
        </h3>
        <span class="text-[11px] text-slate-500">Edit Qty Karton; Diskon otomatis mengikuti strata volume</span>
      </div>

      <div class="overflow-x-auto scrollbar-thin">
        <table class="w-full text-left text-xs border-collapse">
          <thead class="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 select-none">
            <tr>
              <th class="py-2.5 px-3 text-center w-10">No</th>
              <th class="py-2.5 px-3">Produk & Strata</th>
              <th class="py-2.5 px-3 text-right">Modal/Ktn (Inc)</th>
              <th class="py-2.5 px-3 text-center w-28">Qty Order (Ktn)</th>
              <th class="py-2.5 px-3 text-center w-32">Diskon Strata</th>
              <th class="py-2.5 px-3 text-right font-extrabold text-blue-900 bg-blue-50/40">Total Modal Toko</th>
              <th class="py-2.5 px-3 text-right">HET / Pcs</th>
              <th class="py-2.5 px-3 text-right font-bold text-emerald-900 bg-emerald-50/30">Potensi Omzet (HET)</th>
              <th class="py-2.5 px-3 text-right font-bold text-emerald-700">Laba Toko (Rp)</th>
              <th class="py-2.5 px-3 text-right font-bold text-emerald-600">Margin (%)</th>
              <th class="py-2.5 px-3 text-center w-12">Hapus</th>
            </tr>
          </thead>
          <tbody id="sim-table-body" class="divide-y divide-slate-100 text-slate-700 font-medium">
            <!-- Injected by renderSimulationSummaryAndTotals -->
          </tbody>
          <tfoot id="sim-table-foot" class="bg-slate-100 text-slate-800 font-bold border-t-2 border-slate-300">
            <!-- Injected by renderSimulationSummaryAndTotals -->
          </tfoot>
        </table>
      </div>
    </div>

    <!-- Sales Pitch & Retailer Value Proposition Memo -->
    <div id="sim-pitch-card" class="mt-4 bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-xl p-5 text-white shadow-md border border-blue-800/40">
      <!-- Injected by renderSimulationSummaryAndTotals -->
    </div>
  `;

  lucide.createIcons();
  renderSimulationSummaryAndTotals();
}

function renderSimulationSummaryAndTotals() {
  const tbody = document.getElementById('sim-table-body');
  const tfoot = document.getElementById('sim-table-foot');
  const kpiContainer = document.getElementById('sim-kpi-cards');
  const pitchContainer = document.getElementById('sim-pitch-card');

  const { simulationItems } = window.pricelistState;

  if (simulationItems.length === 0) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="py-12 text-center text-slate-400">Keranjang simulasi masih kosong. Klik "Tambah SKU" untuk memulai simulasi.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    if (kpiContainer) kpiContainer.innerHTML = '';
    if (pitchContainer) pitchContainer.innerHTML = '';
    return;
  }

  let totalKtn = 0;
  let totalModal = 0;
  let totalPotensi = 0;
  let totalLaba = 0;
  let totalHematDiskon = 0;

  tbody.innerHTML = simulationItems.map((it, idx) => {
    const qty = it.qty || 1;
    const disc = it.discPct || 0;
    const priceKtn = it.price_carton_inc_ppn || 0;
    const netPriceKtn = priceKtn * (1 - disc / 100);
    const subtotalModal = netPriceKtn * qty;
    const nominalHemat = (priceKtn * (disc / 100)) * qty;

    // Potential retail turnover
    let retailTotal = 0;
    if (it.het_pcs_inc_ppn && it.pcs_per_ktn) {
      retailTotal = qty * it.pcs_per_ktn * it.het_pcs_inc_ppn;
    } else if (it.het_inner_inc_ppn && it.isi_per_ktn) {
      retailTotal = qty * it.isi_per_ktn * it.het_inner_inc_ppn;
    } else {
      retailTotal = subtotalModal * 1.15;
    }

    const labaToko = Math.max(0, retailTotal - subtotalModal);
    const marginPct = retailTotal > 0 ? Math.round((labaToko / retailTotal) * 1000) / 10 : 0;

    totalKtn += qty;
    totalModal += subtotalModal;
    totalPotensi += retailTotal;
    totalLaba += labaToko;
    totalHematDiskon += nominalHemat;

    const cat = getItemStrataCategory(it);
    const strataInfo = getStrataDiscountInfo(cat, qty, it);

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="py-2.5 px-3 text-center text-slate-400 font-mono text-[11px]">${idx + 1}</td>
        <td class="py-2.5 px-3">
          <div class="font-bold text-slate-900">${it.item_name}</div>
          <div class="flex items-center gap-1.5 mt-0.5">
            <span class="inline-flex px-1.5 py-0.2 rounded text-[9px] font-bold bg-${cat.color}-100 text-${cat.color}-800">
              ${cat.name.split(' (')[0]}
            </span>
            ${strataInfo.isSelectedSku ? `<span class="inline-flex px-1.5 py-0.2 rounded text-[9px] font-black bg-indigo-100 text-indigo-900 border border-indigo-200">⭐ Selected SKU GT</span>` : ''}
            <span class="text-[10px] text-slate-400 font-mono">${it.item_code}</span>
          </div>
        </td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-700 whitespace-nowrap">
          Rp ${Math.round(priceKtn).toLocaleString('id-ID')}
        </td>
        <td class="py-2.5 px-3 text-center">
          <input type="number" min="1" value="${qty}" onchange="updateSimulationQty(${idx}, this.value)" class="w-16 text-center border border-slate-300 rounded px-1.5 py-1 text-xs font-mono font-bold text-blue-900 focus:outline-none focus:ring-1 focus:ring-blue-500">
          <div class="text-[9px] text-slate-500 font-mono mt-0.5">${strataInfo.currentTier.label}</div>
        </td>
        <td class="py-2.5 px-3 text-center">
          <div class="flex items-center justify-center gap-1">
            <input type="number" min="0" max="50" step="0.05" value="${disc}" onchange="updateSimulationDisc(${idx}, this.value)" class="w-16 text-center border border-slate-300 rounded px-1 py-1 text-xs font-mono font-bold text-emerald-700 focus:outline-none focus:ring-1 focus:ring-emerald-500">
            <span class="text-xs font-bold text-slate-500">%</span>
          </div>
          ${strataInfo.breakdown ? `
            <div class="text-[9px] font-bold text-indigo-700 mt-0.5" title="Rincian akumulasi diskon">
              ${strataInfo.breakdown}
            </div>
          ` : ''}
          ${strataInfo.nextTier ? `
            <div onclick="upgradeItemToNextTier(${idx})" class="text-[9px] text-amber-700 font-bold mt-0.5 cursor-pointer hover:underline" title="Klik untuk upgrade otomatis ke ${strataInfo.nextTier.discPct}%">
              ${strataInfo.hint}
            </div>
          ` : `
            <div class="text-[9px] text-emerald-600 font-bold mt-0.5">Maks Tier (${strataInfo.currentTier.badge})</div>
          `}
        </td>
        <td class="py-2.5 px-3 text-right font-mono font-extrabold text-blue-950 bg-blue-50/40 whitespace-nowrap">
          Rp ${Math.round(subtotalModal).toLocaleString('id-ID')}
        </td>
        <td class="py-2.5 px-3 text-right font-mono text-slate-600 whitespace-nowrap">
          ${it.het_pcs_inc_ppn ? 'Rp ' + Math.round(it.het_pcs_inc_ppn).toLocaleString('id-ID') : '—'}
        </td>
        <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-900 bg-emerald-50/30 whitespace-nowrap">
          Rp ${Math.round(retailTotal).toLocaleString('id-ID')}
        </td>
        <td class="py-2.5 px-3 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
          Rp ${Math.round(labaToko).toLocaleString('id-ID')}
        </td>
        <td class="py-2.5 px-3 text-right font-mono font-extrabold text-emerald-600 whitespace-nowrap">
          ${marginPct}%
        </td>
        <td class="py-2.5 px-3 text-center">
          <button onclick="removeSimulationItem(${idx})" class="p-1 text-slate-400 hover:text-rose-600 transition" title="Hapus SKU">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  const overallMarginPct = totalPotensi > 0 ? Math.round((totalLaba / totalPotensi) * 1000) / 10 : 0;

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="3" class="py-2.5 px-3 text-center font-extrabold text-slate-900 uppercase tracking-wider text-[11px]">
          TOTAL SIMULASI PAKET ORDER
        </td>
        <td class="py-2.5 px-3 text-center font-mono font-extrabold text-blue-900">
          ${totalKtn.toLocaleString('id-ID')} Ktn
        </td>
        <td class="py-2.5 px-3 text-center font-mono font-bold text-emerald-800 text-[11px]">
          Hemat Rp ${Math.round(totalHematDiskon).toLocaleString('id-ID')}
        </td>
        <td class="py-2.5 px-3 text-right font-mono font-black text-blue-950 bg-blue-100/50 whitespace-nowrap">
          Rp ${Math.round(totalModal).toLocaleString('id-ID')}
        </td>
        <td class="py-2.5 px-3 text-right text-slate-400">—</td>
        <td class="py-2.5 px-3 text-right font-mono font-black text-emerald-950 bg-emerald-100/50 whitespace-nowrap">
          Rp ${Math.round(totalPotensi).toLocaleString('id-ID')}
        </td>
        <td class="py-2.5 px-3 text-right font-mono font-black text-emerald-800 whitespace-nowrap">
          Rp ${Math.round(totalLaba).toLocaleString('id-ID')}
        </td>
        <td class="py-2.5 px-3 text-right font-mono font-black text-emerald-700 whitespace-nowrap">
          ${overallMarginPct}%
        </td>
        <td class="py-2.5 px-3"></td>
      </tr>
    `;
  }

  if (kpiContainer) {
    kpiContainer.innerHTML = `
      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
          <span>Total Karton Dipesan</span>
          <i data-lucide="package" class="w-4 h-4 text-blue-600"></i>
        </div>
        <div class="text-2xl font-black text-slate-900 font-mono">
          ${totalKtn.toLocaleString('id-ID')} <span class="text-xs font-normal text-slate-500">KTN</span>
        </div>
        <div class="mt-2 text-[11px] text-slate-500">
          ${simulationItems.length} ragam SKU produk
        </div>
      </div>

      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
          <span>Modal Belanja Toko (Netto)</span>
          <i data-lucide="wallet" class="w-4 h-4 text-blue-800"></i>
        </div>
        <div class="text-2xl font-black text-blue-900 font-mono">
          Rp ${(totalModal / 1000000).toFixed(2)} <span class="text-xs font-normal text-slate-500">Jt</span>
        </div>
        <div class="mt-2 text-[11px] text-emerald-700 font-semibold font-mono">
          Hemat Diskon: Rp ${Math.round(totalHematDiskon).toLocaleString('id-ID')}
        </div>
      </div>

      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
          <span>Potensi Omzet Toko (HET)</span>
          <i data-lucide="store" class="w-4 h-4 text-emerald-600"></i>
        </div>
        <div class="text-2xl font-black text-emerald-900 font-mono">
          Rp ${(totalPotensi / 1000000).toFixed(2)} <span class="text-xs font-normal text-slate-500">Jt</span>
        </div>
        <div class="mt-2 text-[11px] text-slate-500 font-mono">
          Rp ${Math.round(totalPotensi).toLocaleString('id-ID')}
        </div>
      </div>

      <div class="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div class="text-xs font-semibold text-slate-500 mb-1 flex items-center justify-between">
          <span>Keuntungan / Laba Toko</span>
          <i data-lucide="trending-up" class="w-4 h-4 text-emerald-500"></i>
        </div>
        <div class="text-2xl font-black text-emerald-600 font-mono">
          +Rp ${(totalLaba / 1000000).toFixed(2)} <span class="text-xs font-bold text-emerald-700">Jt</span>
        </div>
        <div class="mt-2 flex items-center justify-between text-[11px]">
          <span class="text-slate-500">Margin Bersih Toko</span>
          <span class="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-100 text-emerald-800 font-mono">${overallMarginPct}%</span>
        </div>
      </div>
    `;
  }

  if (pitchContainer) {
    const outletLabel = window.pricelistState.simulationOutlet ? `untuk <strong>${window.pricelistState.simulationOutlet}</strong>` : 'untuk Outlet Rekanan';
    pitchContainer.innerHTML = `
      <div class="flex items-start gap-3">
        <div class="p-2 bg-white/10 rounded-lg shrink-0 mt-0.5">
          <i data-lucide="sparkles" class="w-5 h-5 text-amber-400"></i>
        </div>
        <div>
          <h4 class="text-sm font-bold text-white flex items-center gap-2">
            <span>Rekomendasi Penawaran Sales & Nilai Tambah Strata Diskon ${outletLabel}</span>
          </h4>
          <p class="text-xs text-slate-200 mt-1 leading-relaxed">
            Dengan memanfaatkan strata diskon volume resmi, toko Bapak/Ibu mendapatkan potongan diskon langsung sebesar <strong>Rp ${Math.round(totalHematDiskon).toLocaleString('id-ID')}</strong>! Total modal belanja toko adalah <strong>Rp ${Math.round(totalModal).toLocaleString('id-ID')}</strong> (${totalKtn} Karton). Saat produk terjual di harga HET eceran resmi, toko berpotensi meraup omzet penjualan sebesar <strong>Rp ${Math.round(totalPotensi).toLocaleString('id-ID')}</strong> dengan keuntungan kotor langsung sebesar <strong>Rp ${Math.round(totalLaba).toLocaleString('id-ID')}</strong> (Margin: <strong>${overallMarginPct}%</strong>).
          </p>
        </div>
      </div>
    `;
  }

  lucide.createIcons();
}

window.simModalFilter = {
  search: '',
  category: 'ALL'
};

async function openAddSkuToSimulationModal() {
  const modal = document.getElementById('modal-container') || document.getElementById('app-modal');
  const modalContent = document.getElementById('modal-content');
  if (!modal || !modalContent) return;

  // Make sure items are loaded
  if (!window.pricelistState.items || window.pricelistState.items.length === 0) {
    try {
      const res = await fetch('/api/pricelist');
      const data = await res.json();
      window.pricelistState.items = data.items || [];
      window.pricelistState.principals = data.principals || [];
      window.pricelistState.initialized = true;
    } catch (err) {
      console.error('Failed to load pricelist:', err);
    }
  }

  window.simModalFilter = { search: '', category: 'ALL' };
  renderAddSkuModalBase();
  modal.classList.remove('hidden');
}

function renderAddSkuModalBase() {
  const modalContent = document.getElementById('modal-content');
  if (!modalContent) return;

  const totalItems = (window.pricelistState.items || []).length;
  const currentCat = window.simModalFilter.category;

  modalContent.innerHTML = `
    <!-- Modal Header -->
    <div class="flex items-center justify-between pb-3.5 border-b border-slate-200">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100 shadow-sm shrink-0">
          <i data-lucide="package-plus" class="w-5 h-5"></i>
        </div>
        <div>
          <h3 class="text-base font-bold text-slate-800">Tambah SKU ke Simulasi Order</h3>
          <p class="text-xs text-slate-500">Pilih dari ${totalItems} SKU pricelist resmi Garut • Strata diskon volume otomatis terhitung</p>
        </div>
      </div>
      <button onclick="closeModal()" class="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition" title="Tutup (Esc)">
        <i data-lucide="x" class="w-5 h-5"></i>
      </button>
    </div>

    <!-- Search & Category Filters -->
    <div class="pt-3 pb-2 space-y-2.5">
      <div class="relative">
        <i data-lucide="search" class="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"></i>
        <input 
          type="text" 
          id="sim-modal-search" 
          value="${window.simModalFilter.search}" 
          oninput="handleSimModalSearch(this.value)" 
          placeholder="Cari nama produk, kode SKU, atau principal (cth: Caffino, Fox, Sariwangi, MilkLife)..." 
          class="w-full bg-slate-50 border border-slate-300 rounded-xl pl-9 pr-8 py-2 text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none transition shadow-inner"
        >
        ${window.simModalFilter.search ? `
          <button onclick="handleSimModalSearch('')" class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
            <i data-lucide="x-circle" class="w-4 h-4"></i>
          </button>
        ` : ''}
      </div>

      <!-- Category Filter Pills -->
      <div class="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-[11px]">
        <button onclick="setSimModalCategory('ALL')" class="px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${currentCat === 'ALL' ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
          Semua SKU (${totalItems})
        </button>
        <button onclick="setSimModalCategory('KOPI_NON_RTD')" class="px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${currentCat === 'KOPI_NON_RTD' ? 'bg-amber-600 text-white shadow-sm' : 'bg-amber-50 text-amber-900 hover:bg-amber-100 border border-amber-200'}">
          ☕ Kopi (Gadjah & Caffino)
        </button>
        <button onclick="setSimModalCategory('BEVERAGE_RTD_MILKLIFE')" class="px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${currentCat === 'BEVERAGE_RTD_MILKLIFE' ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-50 text-blue-900 hover:bg-blue-100 border border-blue-200'}">
          🥛 RTD & MilkLife
        </button>
        <button onclick="setSimModalCategory('PRIMA_TOP_BOGA')" class="px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${currentCat === 'PRIMA_TOP_BOGA' ? 'bg-purple-600 text-white shadow-sm' : 'bg-purple-50 text-purple-900 hover:bg-purple-100 border border-purple-200'}">
          🍞 Prima Top (5Days, Deli)
        </button>
        <button onclick="setSimModalCategory('CANDY_FOXS')" class="px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${currentCat === 'CANDY_FOXS' ? 'bg-rose-600 text-white shadow-sm' : 'bg-rose-50 text-rose-900 hover:bg-rose-100 border border-rose-200'}">
          🍬 Permen FOX'S
        </button>
        <button onclick="setSimModalCategory('UNILEVER')" class="px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${currentCat === 'UNILEVER' ? 'bg-purple-600 text-white shadow-sm' : 'bg-purple-50 text-purple-900 hover:bg-purple-100 border border-purple-200'}">
          🍵 SariWangi (Semua SKU)
        </button>
        <button onclick="setSimModalCategory('SARIWANGI_SELECTED_SKU')" class="px-2.5 py-1 rounded-lg font-bold transition whitespace-nowrap ${currentCat === 'SARIWANGI_SELECTED_SKU' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-indigo-50 text-indigo-900 hover:bg-indigo-100 border border-indigo-200'}">
          ⭐ SariWangi Selected SKU (GT)
        </button>
      </div>
    </div>

    <!-- Product List Items Container -->
    <div id="sim-modal-list-container" class="max-h-[50vh] overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl my-2 scrollbar-thin">
      <!-- Injected by renderAddSkuModalItems -->
    </div>

    <!-- Bottom Cart Summary & Done Button -->
    <div id="sim-modal-footer" class="pt-3 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/90 -mx-6 -mb-6 p-4 rounded-b-2xl">
      <!-- Injected by renderAddSkuModalFooter -->
    </div>
  `;

  renderAddSkuModalItems();
  renderAddSkuModalFooter();
  lucide.createIcons();

  setTimeout(() => {
    const inp = document.getElementById('sim-modal-search');
    if (inp) inp.focus();
  }, 60);
}

function renderAddSkuModalItems() {
  const container = document.getElementById('sim-modal-list-container');
  if (!container) return;

  const { items, simulationItems } = window.pricelistState;
  const q = (window.simModalFilter.search || '').toLowerCase().trim();
  const catFilter = window.simModalFilter.category || 'ALL';

  let filtered = (items || []).filter(it => {
    if (q) {
      const match = (it.item_code || '').toLowerCase().includes(q) ||
                    (it.item_name || '').toLowerCase().includes(q) ||
                    (it.principal || '').toLowerCase().includes(q) ||
                    (it.brand || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    if (catFilter !== 'ALL') {
      if (catFilter === 'SARIWANGI_SELECTED_SKU') {
        if (!isSariwangiSelectedSku(it)) return false;
      } else if (catFilter === 'UNILEVER') {
        const cat = getItemStrataCategory(it);
        if (cat.id !== 'UNILEVER' && cat.id !== 'SARIWANGI_SELECTED_SKU') return false;
      } else {
        const cat = getItemStrataCategory(it);
        if (cat.id !== catFilter) return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="py-12 text-center text-slate-400">
        <i data-lucide="package-search" class="w-8 h-8 mx-auto mb-2 text-slate-300"></i>
        <p class="text-xs font-semibold">Tidak ada produk yang cocok dengan pencarian.</p>
        <p class="text-[11px] text-slate-400 mt-0.5">Coba kata kunci lain atau pilih kategori "Semua SKU".</p>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  const displayItems = filtered.slice(0, 80);

  container.innerHTML = displayItems.map(it => {
    const cat = getItemStrataCategory(it);
    const existing = (simulationItems || []).find(s => s.item_code === it.item_code);
    const currentQty = existing ? existing.qty : 0;
    const priceKtn = it.price_carton_inc_ppn || 0;

    return `
      <div class="p-3 flex items-center justify-between gap-3 hover:bg-slate-50 transition ${existing ? 'bg-blue-50/40' : ''}">
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-bold text-xs text-slate-900 truncate" title="${it.item_name}">${it.item_name}</span>
            <span class="inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold bg-${cat.color}-100 text-${cat.color}-800 border border-${cat.color}-200 shrink-0">
              ${cat.name.split(' (')[0]}
            </span>
          </div>
          <div class="text-[10px] text-slate-500 font-mono mt-0.5 flex flex-wrap items-center gap-x-2">
            <span class="text-blue-700 font-semibold">${it.item_code}</span>
            <span>•</span>
            <span>${it.principal}</span>
            <span>•</span>
            <span class="font-bold text-slate-700">Rp ${Math.round(priceKtn).toLocaleString('id-ID')} / Ktn</span>
            ${it.packaging ? `<span>• Isi: ${it.packaging}</span>` : ''}
          </div>
        </div>

        <div class="shrink-0 flex items-center gap-2">
          ${existing ? `
            <div class="flex items-center gap-1.5 bg-blue-100/80 border border-blue-200 rounded-lg p-1">
              <button onclick="decrementSkuFromModal('${it.item_code}')" class="w-6 h-6 rounded bg-white hover:bg-rose-50 hover:text-rose-600 text-blue-900 font-bold flex items-center justify-center text-xs transition shadow-sm" title="Kurangi 1 ktn">-</button>
              <span class="w-12 text-center font-bold text-xs text-blue-950 font-mono">${currentQty} ktn</span>
              <button onclick="incrementSkuFromModal('${it.item_code}')" class="w-6 h-6 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center text-xs transition shadow-sm" title="Tambah 1 ktn">+</button>
            </div>
          ` : `
            <button onclick="addSkuFromModal('${it.item_code}')" class="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition shadow-sm">
              <i data-lucide="plus" class="w-3.5 h-3.5"></i>
              <span>Pilih</span>
            </button>
          `}
        </div>
      </div>
    `;
  }).join('');

  lucide.createIcons();
}

function renderAddSkuModalFooter() {
  const footer = document.getElementById('sim-modal-footer');
  if (!footer) return;

  const { simulationItems } = window.pricelistState;
  let totalKtn = 0;
  let totalModal = 0;
  (simulationItems || []).forEach(it => {
    const qty = it.qty || 1;
    const disc = it.discPct || 0;
    const priceKtn = it.price_carton_inc_ppn || 0;
    totalKtn += qty;
    totalModal += (priceKtn * (1 - disc / 100)) * qty;
  });

  footer.innerHTML = `
    <div class="text-xs text-slate-600 flex items-center gap-2">
      <div class="w-2 h-2 rounded-full ${simulationItems.length > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}"></div>
      <span>Total di Keranjang: <strong class="text-blue-900 font-mono text-sm">${totalKtn} Ktn</strong> (${simulationItems.length} SKU) • Estimasi Modal: <strong class="text-emerald-700 font-mono">Rp ${Math.round(totalModal).toLocaleString('id-ID')}</strong></span>
    </div>
    <div class="flex items-center gap-2">
      <button onclick="closeModal()" class="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-1.5">
        <i data-lucide="check" class="w-4 h-4"></i>
        <span>Selesai & Lihat Simulasi</span>
      </button>
    </div>
  `;
  lucide.createIcons();
}

function handleSimModalSearch(val) {
  window.simModalFilter.search = val || '';
  const searchInput = document.getElementById('sim-modal-search');
  if (searchInput && searchInput.value !== window.simModalFilter.search) {
    searchInput.value = window.simModalFilter.search;
  }
  renderAddSkuModalItems();
}

function setSimModalCategory(catKey) {
  window.simModalFilter.category = catKey;
  renderAddSkuModalBase();
}

function addSkuFromModal(itemCode) {
  addToSimulation(itemCode);
  renderAddSkuModalItems();
  renderAddSkuModalFooter();
}

function incrementSkuFromModal(itemCode) {
  const item = window.pricelistState.simulationItems.find(i => i.item_code === itemCode);
  if (item) {
    item.qty += 1;
    if (window.pricelistState.autoApplyStrata) {
      const cat = getItemStrataCategory(item);
      item.discPct = getStrataDiscountInfo(cat, item.qty, item).discPct;
    }
  }
  renderSimulationSummaryAndTotals();
  renderAddSkuModalItems();
  renderAddSkuModalFooter();
}

function decrementSkuFromModal(itemCode) {
  const idx = window.pricelistState.simulationItems.findIndex(i => i.item_code === itemCode);
  if (idx !== -1) {
    const item = window.pricelistState.simulationItems[idx];
    if (item.qty > 1) {
      item.qty -= 1;
      if (window.pricelistState.autoApplyStrata) {
        const cat = getItemStrataCategory(item);
        item.discPct = getStrataDiscountInfo(cat, item.qty, item).discPct;
      }
    } else {
      window.pricelistState.simulationItems.splice(idx, 1);
    }
  }
  renderSimulationSummaryAndTotals();
  renderAddSkuModalItems();
  renderAddSkuModalFooter();
}

function filterAddSkuModalList(query) {
  handleSimModalSearch(query);
}

// ==============================================================
// SARIWANGI DEDICATED ANALYTICS SYSTEM
// ==============================================================
window.sariwangiState = {
  data: null,
  filters: {
    period: '2026-09',
    salesman: '',
    rayon: '',
    kecamatan: '',
    skuType: 'ALL', // 'ALL', 'TB288', 'TB48', 'SELECTED', 'REGULER'
    search: ''
  },
  outletTable: {
    page: 1,
    pageSize: 20,
    sortField: 'total_cartons',
    sortDir: 'desc',
    dropsizeFilter: 'all',
    recencyFilter: 'all',
    searchQuery: ''
  },
  selectedKecamatan: null
};

async function renderSariwangiAnalytics() {
  const main = document.getElementById('main-content');
  if (!main) return;

  main.innerHTML = `
    <div class="flex items-center justify-center py-24 text-slate-400 text-sm">
      <div class="text-center">
        <i data-lucide="loader-2" class="w-8 h-8 animate-spin mx-auto text-emerald-600 mb-3"></i>
        <p class="font-medium text-slate-700">Memuat Data Analitik SariWangi...</p>
        <p class="text-xs text-slate-400 mt-1">Mengagregasi 1,500+ outlet dan transaksi Unilever Kabupaten Garut</p>
      </div>
    </div>
  `;
  lucide.createIcons();

  try {
    const params = new URLSearchParams();
    if (window.sariwangiState.filters.period) params.set('period', window.sariwangiState.filters.period);
    if (window.sariwangiState.filters.salesman) params.set('salesman', window.sariwangiState.filters.salesman);
    if (window.sariwangiState.filters.rayon) params.set('rayon', window.sariwangiState.filters.rayon);
    if (window.sariwangiState.filters.kecamatan) params.set('kecamatan', window.sariwangiState.filters.kecamatan);
    if (window.sariwangiState.filters.skuType && window.sariwangiState.filters.skuType !== 'ALL') params.set('skuType', window.sariwangiState.filters.skuType);
    if (window.sariwangiState.filters.search) params.set('search', window.sariwangiState.filters.search);

    const res = await fetch(`/api/analytics/sariwangi?${params.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: Gagal memuat data SariWangi`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Gagal memproses analitik SariWangi');

    window.sariwangiState.data = data;
    renderSariwangiLayout(data);
  } catch (err) {
    console.error('Error rendering SariWangi Analytics:', err);
    main.innerHTML = `
      <div class="p-6 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-sm flex items-start gap-3">
        <i data-lucide="alert-triangle" class="w-5 h-5 text-rose-600 shrink-0 mt-0.5"></i>
        <div>
          <h4 class="font-bold text-rose-900">Terjadi Kesalahan Memuat Data SariWangi</h4>
          <p class="mt-1 text-xs text-rose-700">${escapeHtml(err.message)}</p>
          <button onclick="renderSariwangiAnalytics()" class="mt-3 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow-sm transition">
            Coba Lagi
          </button>
        </div>
      </div>
    `;
    lucide.createIcons();
  }
}

function renderSariwangiLayout(data) {
  const main = document.getElementById('main-content');
  if (!main) return;

  const { summary, dropsizeBrackets, promoTiers, upsellOpportunities, kecamatanDistribution, salesmanLeaderboard, filterOptions } = data;
  const currentFilters = window.sariwangiState.filters;

  // Format active period label
  let periodLabel = 'Semua Periode (Kumulatif)';
  if (currentFilters.period === '2026-09') periodLabel = 'September 2026';
  else if (currentFilters.period === '2026-10') periodLabel = 'Oktober 2026';
  else if (currentFilters.period === '2026-08') periodLabel = 'Agustus 2026';
  else if (currentFilters.period) periodLabel = currentFilters.period;

  main.innerHTML = `
    <!-- Top Header & Banner -->
    <div class="bg-gradient-to-r from-emerald-950 via-teal-900 to-slate-900 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden border border-emerald-800/40">
      <div class="absolute -right-8 -bottom-8 opacity-10 pointer-events-none">
        <i data-lucide="coffee" class="w-64 h-64 text-emerald-400"></i>
      </div>

      <div class="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="flex items-center gap-2.5">
            <span class="p-2 bg-emerald-500/20 text-emerald-300 rounded-xl border border-emerald-400/30">
              <i data-lucide="coffee" class="w-5 h-5"></i>
            </span>
            <div>
              <div class="flex items-center gap-2">
                <h1 class="text-xl sm:text-2xl font-black tracking-tight text-white">Analytics SariWangi</h1>
                <span class="text-[11px] bg-emerald-500/30 text-emerald-200 border border-emerald-400/40 font-bold px-2 py-0.5 rounded-full">
                  Unilever Dedicated
                </span>
                <span class="text-[11px] bg-blue-500/30 text-blue-200 border border-blue-400/40 font-bold px-2 py-0.5 rounded-full">
                  ${periodLabel}
                </span>
              </div>
              <p class="text-xs text-emerald-200/80 mt-0.5">
                Specialized Dashboard: Penjualan, Rata-rata Dropsize per Order, Peta Sebaran Garut, & Strata Diskon GT
              </p>
            </div>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
          <div class="bg-emerald-900/60 border border-emerald-700/50 rounded-xl px-3 py-1.5 text-right">
            <p class="text-[10px] text-emerald-300 uppercase tracking-wider font-semibold">Data Transaksi Terkini</p>
            <p class="text-xs font-bold text-white flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              s/d ${filterOptions.latestDate ? new Date(filterOptions.latestDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '02 Okt 2026'}
            </p>
          </div>
          <button onclick="exportSariwangiCsv()" class="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-xs shadow-lg shadow-emerald-500/20 transition-all hover:scale-102">
            <i data-lucide="download" class="w-4 h-4"></i>
            <span>Export CSV</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Reconciliation Callout Banner (Explaining ~90M vs 156M) -->
    <div class="bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border border-emerald-200/90 rounded-xl p-4 shadow-xs text-xs">
      <div class="flex items-start gap-3">
        <span class="p-2 bg-emerald-600 text-white rounded-lg shrink-0 mt-0.5 shadow-2xs">
          <i data-lucide="info" class="w-4 h-4"></i>
        </span>
        <div class="space-y-1.5 flex-1">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <h4 class="font-bold text-slate-800 text-sm flex items-center gap-2">
              <span>Analisis Rekonsiliasi Data Omzet SariWangi</span>
              <span class="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold">Terverifikasi 100%</span>
            </h4>
            <span class="text-[11px] text-slate-500 font-medium">
              Periode: <strong>${escapeHtml(periodLabel)}</strong>
            </span>
          </div>
          <p class="text-slate-600 leading-relaxed">
            Jika tarikan manual Anda mencatat angka <strong>sekitar Rp 90 Juta-an</strong>, itu merujuk pada produk hero <strong>SARIWANGI ASLI RL TB 288X4</strong> (Total Netto: <strong>Rp 91.883.349,-</strong> / 391,99 Ktn Kumulatif, atau <strong>Rp 82.567.517,-</strong> pada bulan September). Sedangkan angka <strong>Rp 156,6 Juta</strong> adalah gabungan seluruh 7 SKU teh Unilever (termasuk TB 48x25 Rp 57,2M, TB 48x12 Rp 4,5M, TB 24x50 Rp 2,0M, dll). Anda dapat mengklik tombol <strong>⭐ SariWangi TB 288</strong> di bawah untuk langsung beralih ke SKU hero tersebut.
          </p>
          <div class="flex flex-wrap items-center gap-2 pt-1 text-[11px] font-semibold">
            <button onclick="setSariwangiSkuType('ALL')" class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition ${currentFilters.skuType === 'ALL' ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs' : 'bg-white hover:bg-emerald-50 text-slate-700 border-slate-200'}">
              <span class="w-2 h-2 rounded-full ${currentFilters.skuType === 'ALL' ? 'bg-white' : 'bg-emerald-500'}"></span>
              <span>Total Semua 7 SKU: <strong>${currentFilters.period === '2026-09' ? 'Rp 140,9 Jt (586 Ktn)' : 'Rp 156,6 Jt (651 Ktn)'}</strong></span>
            </button>
            <button onclick="setSariwangiSkuType('TB288')" class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition ${currentFilters.skuType === 'TB288' ? 'bg-amber-600 text-white border-amber-700 shadow-xs' : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'}">
              <i data-lucide="star" class="w-3.5 h-3.5 ${currentFilters.skuType === 'TB288' ? 'text-white' : 'text-amber-600 fill-amber-500'}"></i>
              <span>Hero SKU TB 288 Saja: <strong>${currentFilters.period === '2026-09' ? 'Rp 82,6 Jt (352 Ktn)' : 'Rp 91,8 Jt (392 Ktn)'}</strong></span>
            </button>
            <button onclick="setSariwangiSkuType('TB48')" class="flex items-center gap-1.5 px-2.5 py-1 rounded-md border transition ${currentFilters.skuType === 'TB48' ? 'bg-sky-600 text-white border-sky-700 shadow-xs' : 'bg-white hover:bg-sky-50 text-slate-700 border-slate-200'}">
              <span class="w-2 h-2 rounded-full ${currentFilters.skuType === 'TB48' ? 'bg-white' : 'bg-sky-500'}"></span>
              <span>SKU TB 48X25: <strong>${currentFilters.period === '2026-09' ? 'Rp 51,3 Jt (191 Ktn)' : 'Rp 57,2 Jt (213 Ktn)'}</strong></span>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Filter Bar Card (Periode, Salesman, Rayon, Kecamatan, Segment SKU) -->
    <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div class="flex items-center gap-2">
          <i data-lucide="sliders-horizontal" class="w-4 h-4 text-emerald-600"></i>
          <span class="text-xs font-bold text-slate-800 uppercase tracking-wider">Filter Analitik Khusus SariWangi</span>
          <span class="text-[11px] text-slate-400">(Terkunci Eksklusif: Principal Unilever & Brand SariWangi)</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button onclick="resetSariwangiFilters()" class="text-xs text-slate-500 hover:text-slate-800 px-2.5 py-1 rounded hover:bg-slate-100 transition flex items-center gap-1">
            <i data-lucide="rotate-ccw" class="w-3 h-3"></i>
            <span>Reset Filter</span>
          </button>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
        <!-- Periode Filter -->
        <div>
          <label class="block text-[11px] font-semibold text-slate-600 mb-1">Periode Transaksi</label>
          <select id="filter-sw-period" onchange="applySariwangiFilters()" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none transition">
            <option value="" ${!currentFilters.period ? 'selected' : ''}>Semua Periode (Kumulatif)</option>
            <option value="2026-09" ${currentFilters.period === '2026-09' ? 'selected' : ''}>September 2026</option>
            <option value="2026-10" ${currentFilters.period === '2026-10' ? 'selected' : ''}>Oktober 2026</option>
            <option value="2026-08" ${currentFilters.period === '2026-08' ? 'selected' : ''}>Agustus 2026</option>
          </select>
        </div>

        <!-- Salesman Filter -->
        <div>
          <label class="block text-[11px] font-semibold text-slate-600 mb-1">Salesman</label>
          <select id="filter-sw-salesman" onchange="applySariwangiFilters()" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none transition">
            <option value="">Semua Salesman (${filterOptions.salesmen.length})</option>
            ${filterOptions.salesmen.map(s => `
              <option value="${escapeHtml(s.name)}" ${currentFilters.salesman === s.name ? 'selected' : ''}>
                ${escapeHtml(s.name)}
              </option>
            `).join('')}
          </select>
        </div>

        <!-- Rayon Filter -->
        <div>
          <label class="block text-[11px] font-semibold text-slate-600 mb-1">Rayon</label>
          <select id="filter-sw-rayon" onchange="applySariwangiFilters()" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none transition">
            <option value="">Semua Rayon (${filterOptions.rayons.length})</option>
            ${filterOptions.rayons.map(r => `
              <option value="${escapeHtml(r.name)}" ${currentFilters.rayon === r.name ? 'selected' : ''}>
                ${escapeHtml(r.name)}
              </option>
            `).join('')}
          </select>
        </div>

        <!-- Kecamatan Filter -->
        <div>
          <label class="block text-[11px] font-semibold text-slate-600 mb-1">Kecamatan</label>
          <select id="filter-sw-kecamatan" onchange="applySariwangiFilters()" class="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-2 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none transition">
            <option value="">Semua Kecamatan (${filterOptions.kecamatans.length})</option>
            ${filterOptions.kecamatans.map(k => `
              <option value="${escapeHtml(k.name)}" ${currentFilters.kecamatan === k.name ? 'selected' : ''}>
                ${escapeHtml(k.name)}
              </option>
            `).join('')}
          </select>
        </div>

        <!-- Quick Outlet Search -->
        <div>
          <label class="block text-[11px] font-semibold text-slate-600 mb-1">Cari Toko / Outlet</label>
          <div class="relative">
            <input type="text" id="filter-sw-search" value="${escapeHtml(currentFilters.search || '')}" onkeydown="if(event.key==='Enter') applySariwangiFilters()" placeholder="Ketik nama toko..." class="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-slate-800 font-medium focus:ring-2 focus:ring-emerald-500 focus:outline-none transition">
            <i data-lucide="search" class="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"></i>
          </div>
        </div>
      </div>

      <!-- Segment SKU Button Pills -->
      <div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
        <div class="flex flex-wrap items-center gap-1.5 text-xs">
          <span class="text-slate-500 font-semibold mr-1">Fokus SKU:</span>
          <button onclick="setSariwangiSkuType('ALL')" class="px-3 py-1 rounded-lg font-semibold transition ${currentFilters.skuType === 'ALL' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            Semua SKU SariWangi
          </button>
          <button onclick="setSariwangiSkuType('TB288')" class="px-3 py-1 rounded-lg font-semibold transition flex items-center gap-1.5 ${currentFilters.skuType === 'TB288' ? 'bg-amber-600 text-white shadow-sm' : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'}">
            <i data-lucide="star" class="w-3.5 h-3.5"></i>
            <span>⭐ SariWangi TB 288 (Hero SKU)</span>
          </button>
          <button onclick="setSariwangiSkuType('TB48')" class="px-3 py-1 rounded-lg font-semibold transition ${currentFilters.skuType === 'TB48' ? 'bg-sky-600 text-white shadow-sm' : 'bg-sky-50 text-sky-800 hover:bg-sky-100 border border-sky-200'}">
            SariWangi TB 48X25
          </button>
          <button onclick="setSariwangiSkuType('SELECTED')" class="px-3 py-1 rounded-lg font-semibold transition flex items-center gap-1.5 ${currentFilters.skuType === 'SELECTED' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'}">
            <i data-lucide="sparkles" class="w-3 h-3"></i>
            <span>6 Selected SKU GT (Promo Strata)</span>
          </button>
          <button onclick="setSariwangiSkuType('REGULER')" class="px-3 py-1 rounded-lg font-semibold transition ${currentFilters.skuType === 'REGULER' ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}">
            SKU Reguler Lainnya
          </button>
        </div>

        <div class="flex items-center gap-2">
          <button onclick="applySariwangiFilters()" class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs shadow-sm transition flex items-center gap-1.5">
            <i data-lucide="filter" class="w-3.5 h-3.5"></i>
            <span>Terapkan Filter</span>
          </button>
        </div>
      </div>
    </div>

    <!-- 5 Core KPI Summary Cards -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
      <!-- Card 1: Total Volume -->
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between text-slate-500 text-xs font-semibold">
          <span>Total Penjualan Volume</span>
          <span class="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <i data-lucide="package" class="w-4 h-4"></i>
          </span>
        </div>
        <p class="text-2xl font-black text-slate-900 mt-2 tracking-tight">
          ${summary.totalCartons.toLocaleString('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          <span class="text-xs font-bold text-slate-500 font-normal">Ktn</span>
        </p>
        <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span class="text-slate-500">Selected SKU:</span>
          <span class="font-bold text-indigo-600">${summary.selectedSkuCartons.toLocaleString('id-ID')} Ktn (${summary.selectedSkuCartonPct}%)</span>
        </div>
      </div>

      <!-- Card 2: Total Omzet Netto -->
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between text-slate-500 text-xs font-semibold">
          <span>Total Omzet Netto</span>
          <span class="p-1.5 bg-blue-50 text-blue-600 rounded-lg">
            <i data-lucide="banknote" class="w-4 h-4"></i>
          </span>
        </div>
        <p class="text-xl sm:text-2xl font-black text-slate-900 mt-2 tracking-tight truncate" title="Rp ${summary.totalNetto.toLocaleString('id-ID')}">
          Rp ${(summary.totalNetto / 1000000).toFixed(1)} <span class="text-xs font-bold text-slate-500 font-normal">Jt</span>
        </p>
        <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span class="text-slate-500">Exact Netto:</span>
          <span class="font-bold text-slate-700">Rp ${summary.totalNetto.toLocaleString('id-ID')}</span>
        </div>
      </div>

      <!-- Card 3: Outlet Transaksi (OA) -->
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between text-slate-500 text-xs font-semibold">
          <span>Outlet Transaksi (OA)</span>
          <span class="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
            <i data-lucide="store" class="w-4 h-4"></i>
          </span>
        </div>
        <p class="text-2xl font-black text-slate-900 mt-2 tracking-tight">
          ${summary.totalOA.toLocaleString('id-ID')}
          <span class="text-xs font-bold text-slate-500 font-normal">Toko</span>
        </p>
        <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span class="text-slate-500">Penetrasi Selected:</span>
          <span class="font-bold text-emerald-600">${summary.selectedSkuOA.toLocaleString('id-ID')} Toko (${summary.selectedSkuOAPct}%)</span>
        </div>
      </div>

      <!-- Card 4: Total Order Call (OC) -->
      <div class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between text-slate-500 text-xs font-semibold">
          <span>Total Order Call (OC)</span>
          <span class="p-1.5 bg-purple-50 text-purple-600 rounded-lg">
            <i data-lucide="shopping-cart" class="w-4 h-4"></i>
          </span>
        </div>
        <p class="text-2xl font-black text-slate-900 mt-2 tracking-tight">
          ${summary.totalOC.toLocaleString('id-ID')}
          <span class="text-xs font-bold text-slate-500 font-normal">Faktur</span>
        </p>
        <div class="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
          <span class="text-slate-500">Frekuensi Beli:</span>
          <span class="font-bold text-slate-700">${summary.totalOA > 0 ? (summary.totalOC / summary.totalOA).toFixed(2) : 0}x Order/Toko</span>
        </div>
      </div>

      <!-- Card 5: Rata-rata Dropsize & Omzet/OC -->
      <div class="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl p-4 border border-emerald-200 shadow-sm relative overflow-hidden">
        <div class="flex items-center justify-between text-emerald-800 text-xs font-bold">
          <span>Rata-rata Dropsize (OC)</span>
          <span class="p-1.5 bg-emerald-600 text-white rounded-lg shadow-sm">
            <i data-lucide="scale" class="w-4 h-4"></i>
          </span>
        </div>
        <p class="text-2xl font-black text-emerald-950 mt-2 tracking-tight">
          ${summary.avgDropsizeCtn}
          <span class="text-xs font-bold text-emerald-700 font-normal">Ktn/OC</span>
        </p>
        <div class="mt-2.5 pt-2 border-t border-emerald-200/60 flex items-center justify-between text-[11px]">
          <span class="text-emerald-800 font-medium">Rata-rata Omzet:</span>
          <span class="font-extrabold text-emerald-900">Rp ${summary.avgOmzetPerOC.toLocaleString('id-ID')} / OC</span>
        </div>
      </div>
    </div>

    <!-- Section: Analisis Dropsize & Omset Rata-rata per OC -->
    <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
            <i data-lucide="pie-chart" class="w-4 h-4 text-emerald-600"></i>
            <span>Analisis Dropsize & Omset Rata-rata per Order Call (OC)</span>
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Distribusi volume pembelian dan nilai omzet rata-rata berdasarkan besaran pesanan faktur SariWangi
          </p>
        </div>
        <span class="text-xs text-slate-400 font-medium self-start sm:self-auto">
          Rumus: <code class="bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">Total Volume ÷ Total OC</code>
        </span>
      </div>

      <!-- 4 Tier Comparison Cards -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Tier 1: < 1/2 Karton -->
        <div class="rounded-xl border border-amber-200 bg-amber-50/40 p-4 space-y-3 relative hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-1 bg-amber-100 text-amber-800 font-bold text-xs rounded-lg">
              ${dropsizeBrackets.under_half.label}
            </span>
            <span class="text-[11px] font-semibold text-amber-700">Eceran Mikro</span>
          </div>

          <div>
            <p class="text-2xl font-black text-slate-900 tracking-tight">
              ${dropsizeBrackets.under_half.count.toLocaleString('id-ID')}
              <span class="text-xs font-semibold text-slate-500">Order (${dropsizeBrackets.under_half.pctOrders}%)</span>
            </p>
            <p class="text-xs font-medium text-slate-500 mt-0.5">
              Volume: <strong class="text-slate-800">${dropsizeBrackets.under_half.cartons.toLocaleString('id-ID')} Ktn</strong> (${dropsizeBrackets.under_half.pctCartons}%)
            </p>
          </div>

          <div class="pt-2 border-t border-amber-200/60 space-y-1.5 text-xs">
            <div class="flex justify-between items-center text-slate-600">
              <span>Total Omzet:</span>
              <strong class="text-slate-800">Rp ${dropsizeBrackets.under_half.netto.toLocaleString('id-ID')}</strong>
            </div>
            <div class="flex justify-between items-center bg-white/80 p-2 rounded-lg border border-amber-100 font-semibold">
              <span class="text-amber-900">Rata-rata Omzet/OC:</span>
              <span class="text-amber-800 font-bold">Rp ${dropsizeBrackets.under_half.avgNettoPerOC.toLocaleString('id-ID')}</span>
            </div>
            <div class="flex justify-between items-center text-[11px] text-slate-500">
              <span>Rata-rata Dropsize:</span>
              <span class="font-medium text-slate-700">${dropsizeBrackets.under_half.avgCartonsPerOC} Ktn/OC</span>
            </div>
          </div>
        </div>

        <!-- Tier 2: 1/2 s/d 1 Karton -->
        <div class="rounded-xl border border-sky-200 bg-sky-50/40 p-4 space-y-3 relative hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-1 bg-sky-100 text-sky-800 font-bold text-xs rounded-lg">
              ${dropsizeBrackets.half_to_one.label}
            </span>
            <span class="text-[11px] font-semibold text-sky-700">Toko Sedang</span>
          </div>

          <div>
            <p class="text-2xl font-black text-slate-900 tracking-tight">
              ${dropsizeBrackets.half_to_one.count.toLocaleString('id-ID')}
              <span class="text-xs font-semibold text-slate-500">Order (${dropsizeBrackets.half_to_one.pctOrders}%)</span>
            </p>
            <p class="text-xs font-medium text-slate-500 mt-0.5">
              Volume: <strong class="text-slate-800">${dropsizeBrackets.half_to_one.cartons.toLocaleString('id-ID')} Ktn</strong> (${dropsizeBrackets.half_to_one.pctCartons}%)
            </p>
          </div>

          <div class="pt-2 border-t border-sky-200/60 space-y-1.5 text-xs">
            <div class="flex justify-between items-center text-slate-600">
              <span>Total Omzet:</span>
              <strong class="text-slate-800">Rp ${dropsizeBrackets.half_to_one.netto.toLocaleString('id-ID')}</strong>
            </div>
            <div class="flex justify-between items-center bg-white/80 p-2 rounded-lg border border-sky-100 font-semibold">
              <span class="text-sky-900">Rata-rata Omzet/OC:</span>
              <span class="text-sky-800 font-bold">Rp ${dropsizeBrackets.half_to_one.avgNettoPerOC.toLocaleString('id-ID')}</span>
            </div>
            <div class="flex justify-between items-center text-[11px] text-slate-500">
              <span>Rata-rata Dropsize:</span>
              <span class="font-medium text-slate-700">${dropsizeBrackets.half_to_one.avgCartonsPerOC} Ktn/OC</span>
            </div>
          </div>
        </div>

        <!-- Tier 3: > 1 Karton -->
        <div class="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3 relative hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-1 bg-emerald-100 text-emerald-800 font-bold text-xs rounded-lg">
              ${dropsizeBrackets.over_one.label}
            </span>
            <span class="text-[11px] font-semibold text-emerald-700">Semi Grosir</span>
          </div>

          <div>
            <p class="text-2xl font-black text-slate-900 tracking-tight">
              ${dropsizeBrackets.over_one.count.toLocaleString('id-ID')}
              <span class="text-xs font-semibold text-slate-500">Order (${dropsizeBrackets.over_one.pctOrders}%)</span>
            </p>
            <p class="text-xs font-medium text-slate-500 mt-0.5">
              Volume: <strong class="text-slate-800">${dropsizeBrackets.over_one.cartons.toLocaleString('id-ID')} Ktn</strong> (${dropsizeBrackets.over_one.pctCartons}%)
            </p>
          </div>

          <div class="pt-2 border-t border-emerald-200/60 space-y-1.5 text-xs">
            <div class="flex justify-between items-center text-slate-600">
              <span>Total Omzet:</span>
              <strong class="text-slate-800">Rp ${dropsizeBrackets.over_one.netto.toLocaleString('id-ID')}</strong>
            </div>
            <div class="flex justify-between items-center bg-white/80 p-2 rounded-lg border border-emerald-100 font-semibold">
              <span class="text-emerald-900">Rata-rata Omzet/OC:</span>
              <span class="text-emerald-800 font-bold">Rp ${dropsizeBrackets.over_one.avgNettoPerOC.toLocaleString('id-ID')}</span>
            </div>
            <div class="flex justify-between items-center text-[11px] text-slate-500">
              <span>Rata-rata Dropsize:</span>
              <span class="font-medium text-slate-700">${dropsizeBrackets.over_one.avgCartonsPerOC} Ktn/OC</span>
            </div>
          </div>
        </div>

        <!-- Tier 4: >= 6 Karton (Promo GT Threshold) -->
        <div class="rounded-xl border-2 border-purple-300 bg-gradient-to-br from-purple-50 to-indigo-50 p-4 space-y-3 relative hover:shadow-md transition">
          <div class="flex items-center justify-between">
            <span class="px-2.5 py-1 bg-purple-600 text-white font-extrabold text-xs rounded-lg shadow-sm">
              ${dropsizeBrackets.strata_promo_tier.label}
            </span>
            <span class="text-[11px] font-bold text-purple-700 flex items-center gap-1">
              <i data-lucide="award" class="w-3.5 h-3.5"></i>
              <span>Key Wholesaler</span>
            </span>
          </div>

          <div>
            <p class="text-2xl font-black text-purple-950 tracking-tight">
              ${dropsizeBrackets.strata_promo_tier.count.toLocaleString('id-ID')}
              <span class="text-xs font-semibold text-purple-700">Order (${dropsizeBrackets.strata_promo_tier.pctOrders}%)</span>
            </p>
            <p class="text-xs font-medium text-purple-800 mt-0.5">
              Volume: <strong class="text-purple-950">${dropsizeBrackets.strata_promo_tier.cartons.toLocaleString('id-ID')} Ktn</strong> (${dropsizeBrackets.strata_promo_tier.pctCartons}%)
            </p>
          </div>

          <div class="pt-2 border-t border-purple-200 space-y-1.5 text-xs">
            <div class="flex justify-between items-center text-purple-900">
              <span>Total Omzet:</span>
              <strong class="text-purple-950">Rp ${dropsizeBrackets.strata_promo_tier.netto.toLocaleString('id-ID')}</strong>
            </div>
            <div class="flex justify-between items-center bg-white p-2 rounded-lg border border-purple-200 font-semibold shadow-xs">
              <span class="text-purple-900">Rata-rata Omzet/OC:</span>
              <span class="text-purple-700 font-extrabold">Rp ${dropsizeBrackets.strata_promo_tier.avgNettoPerOC.toLocaleString('id-ID')}</span>
            </div>
            <div class="flex justify-between items-center text-[11px] text-purple-800">
              <span>Rata-rata Dropsize:</span>
              <span class="font-bold text-purple-900">${dropsizeBrackets.strata_promo_tier.avgCartonsPerOC} Ktn/OC</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Section: Peta Distribusi SariWangi di Kabupaten Garut -->
    <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h2 class="text-base font-bold text-slate-900 flex items-center gap-2">
            <i data-lucide="map" class="w-4 h-4 text-emerald-600"></i>
            <span>Peta Distribusi & Penetrasi SariWangi di Kabupaten Garut</span>
          </h2>
          <p class="text-xs text-slate-500 mt-0.5">
            Sebaran geografis berdasarkan data riil transaksi toko/outlet per kecamatan di Kabupaten Garut
          </p>
        </div>
        <div class="flex items-center gap-2 text-xs">
          <span class="inline-flex items-center gap-1.5 font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
            <span class="w-2 h-2 rounded-full bg-emerald-500"></span>
            ${kecamatanDistribution.length} Kecamatan Transaksi
          </span>
        </div>
      </div>

      <!-- Map & Kecamatan Table Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <!-- SVG Map Container (7 cols) -->
        <div class="lg:col-span-7 bg-slate-50/70 border border-slate-200/80 rounded-xl p-3 relative flex flex-col items-center justify-center min-h-[360px]">
          <div id="sariwangi-map-canvas" class="w-full flex items-center justify-center">
            <div class="py-16 text-center text-xs text-slate-400">
              <i data-lucide="loader-2" class="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-600"></i>
              Memuat Peta Garut...
            </div>
          </div>

          <!-- Dynamic Floating Tooltip -->
          <div id="sw-map-tooltip" class="absolute hidden pointer-events-none z-30 bg-slate-900/95 text-white text-[11px] px-3 py-2 rounded-xl shadow-xl backdrop-blur-sm border border-slate-700/80 max-w-xs transition-all">
          </div>

          <!-- Color Ramp Legend -->
          <div class="w-full mt-3 pt-3 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-600">
            <span class="font-bold text-slate-700">Intensitas Volume (Ktn):</span>
            <div class="flex items-center gap-1">
              <span class="w-3.5 h-3 rounded bg-emerald-50 border border-slate-200"></span> <span>0</span>
              <span class="w-3.5 h-3 rounded bg-emerald-100 ml-1"></span> <span>1-5</span>
              <span class="w-3.5 h-3 rounded bg-emerald-300 ml-1"></span> <span>5-15</span>
              <span class="w-3.5 h-3 rounded bg-emerald-500 ml-1 text-white"></span> <span>15-30</span>
              <span class="w-3.5 h-3 rounded bg-emerald-700 ml-1 text-white"></span> <span>30-50</span>
              <span class="w-3.5 h-3 rounded bg-emerald-950 ml-1 text-white"></span> <span>>50</span>
            </div>
          </div>
        </div>

        <!-- Kecamatan Leaderboard List (5 cols) -->
        <div class="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-3 space-y-2 flex flex-col max-h-[420px]">
          <div class="flex items-center justify-between pb-2 border-b border-slate-100">
            <span class="text-xs font-bold text-slate-800">Top Kecamatan (SariWangi)</span>
            <span class="text-[11px] text-slate-400">Klik kecamatan untuk filter</span>
          </div>

          <div class="overflow-y-auto scrollbar-thin space-y-1.5 flex-1 pr-1">
            ${kecamatanDistribution.map((k, idx) => `
              <div onclick="filterSariwangiByKecamatan('${escapeHtml(k.kecamatan_name)}')" class="p-2 rounded-lg border border-slate-100 hover:border-emerald-300 hover:bg-emerald-50/50 cursor-pointer transition flex items-center justify-between text-xs group">
                <div class="flex items-center gap-2">
                  <span class="w-5 h-5 rounded font-mono text-[10px] flex items-center justify-center font-bold ${idx < 3 ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}">
                    ${idx + 1}
                  </span>
                  <div>
                    <p class="font-bold text-slate-900 group-hover:text-emerald-700 transition">${escapeHtml(k.kecamatan_name)}</p>
                    <p class="text-[10px] text-slate-400">${k.active_outlets} Toko • Top: ${escapeHtml(k.top_salesman)}</p>
                  </div>
                </div>

                <div class="text-right">
                  <p class="font-extrabold text-slate-800">${k.total_cartons} <span class="text-[10px] text-slate-400 font-normal">Ktn</span></p>
                  <p class="text-[10px] text-emerald-600 font-semibold">Rp ${(k.total_netto / 1000000).toFixed(1)} Jt</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- Section: Elaborasi Multi-Perspective & Strata Promo Intelligence -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <!-- Perspective 1: Strata Rules & 6 Selected SKU GT Adoption -->
      <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div class="flex items-center justify-between border-b border-slate-100 pb-3">
          <div class="flex items-center gap-2">
            <span class="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <i data-lucide="sparkles" class="w-4 h-4"></i>
            </span>
            <div>
              <h3 class="text-sm font-bold text-slate-900">Aturan Strata Diskon SariWangi</h3>
              <p class="text-[11px] text-slate-400">Kombinasi Diskon Reguler + Support Promo 6 Selected SKU GT</p>
            </div>
          </div>
        </div>

        <!-- Rules Info Box -->
        <div class="bg-slate-50 rounded-xl p-3 border border-slate-200 text-xs space-y-2">
          <div class="flex items-start gap-2">
            <i data-lucide="info" class="w-4 h-4 text-indigo-600 shrink-0 mt-0.5"></i>
            <p class="text-slate-700 leading-relaxed text-[11px]">
              <strong>Mekanisme Tambahan Diskon:</strong> Untuk 6 SKU Terpilih (Selected SKU), diskon promo GT otomatis 
              <strong>DITAMBAHKAN</strong> ke diskon reguler bila memenuhi kriteria minimum volume karton.
            </p>
          </div>

          <div class="grid grid-cols-2 gap-2 pt-1 text-[11px]">
            <div class="bg-white p-2 rounded border border-slate-200">
              <p class="font-bold text-slate-800 text-[10px] uppercase text-purple-700">1. Strata Reguler (Semua SKU)</p>
              <p class="text-slate-600 mt-0.5">• 1 – 5 ktn: <strong>0.75%</strong></p>
              <p class="text-slate-600">• 6 – 10 ktn: <strong>1.00%</strong></p>
              <p class="text-slate-600">• ≥ 11 ktn: <strong>1.25%</strong></p>
            </div>
            <div class="bg-white p-2 rounded border border-slate-200">
              <p class="font-bold text-slate-800 text-[10px] uppercase text-indigo-700">2. Promo GT (6 Selected SKU)</p>
              <p class="text-slate-600 mt-0.5">• 6 – 19 ktn: <strong>+2.00%</strong></p>
              <p class="text-slate-600">• 20 – 49 ktn: <strong>+3.00%</strong></p>
              <p class="text-slate-600">• 50 – 99 ktn: <strong>+5.00%</strong></p>
              <p class="text-slate-600">• ≥ 100 ktn: <strong>+7.00%</strong></p>
            </div>
          </div>

          <div class="bg-emerald-50 border border-emerald-200 rounded p-2 text-[11px] text-emerald-900 flex items-center justify-between">
            <span>Contoh: Pembelian <strong>50 Karton</strong> Selected SKU:</span>
            <span class="font-black text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-300">1.25% + 5.00% = 6.25% Diskon!</span>
          </div>
        </div>

        <!-- 6 Selected SKUs GT List -->
        <div>
          <p class="text-xs font-bold text-slate-800 mb-2">Daftar 6 Selected SKU GT:</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px]">
            <div class="p-1.5 rounded bg-slate-50 border border-slate-200 text-slate-700 truncate">1. SARIWANGI ASLI RL TB 48X(25X1.85G)</div>
            <div class="p-1.5 rounded bg-slate-50 border border-slate-200 text-slate-700 truncate">2. SARIWANGI ASLI RL TB 288X(4X1.85G)</div>
            <div class="p-1.5 rounded bg-slate-50 border border-slate-200 text-slate-700 truncate">3. SARIWANGI MELATI RL TB 48X(25X1.9G)</div>
            <div class="p-1.5 rounded bg-slate-50 border border-slate-200 text-slate-700 truncate">4. SARIMURNI RL TB 48X(25X1.6G)</div>
            <div class="p-1.5 rounded bg-slate-50 border border-slate-200 text-slate-700 truncate">5. SARIMURNI RL RB 180X(5X1.8G)</div>
            <div class="p-1.5 rounded bg-slate-50 border border-slate-200 text-slate-700 truncate">6. SARIMURNI RL RB 48X(20X1.8G)</div>
          </div>
        </div>

        <!-- Promo Tier Attainment Status -->
        <div class="space-y-1.5 pt-2 border-t border-slate-100">
          <p class="text-xs font-bold text-slate-800">Pencapaian Tier Promo Selected SKU (Order Level):</p>
          <div class="grid grid-cols-4 gap-2 text-center text-xs">
            <div class="bg-purple-50 p-2 rounded-lg border border-purple-200">
              <p class="text-[10px] text-purple-700 font-bold">Tier 1 (6-19 ktn)</p>
              <p class="text-base font-black text-purple-900 mt-0.5">${promoTiers.tier1.count} <span class="text-[10px] font-normal">OC</span></p>
              <p class="text-[10px] text-purple-600 font-semibold">+2% Promo</p>
            </div>
            <div class="bg-indigo-50 p-2 rounded-lg border border-indigo-200">
              <p class="text-[10px] text-indigo-700 font-bold">Tier 2 (20-49 ktn)</p>
              <p class="text-base font-black text-indigo-900 mt-0.5">${promoTiers.tier2.count} <span class="text-[10px] font-normal">OC</span></p>
              <p class="text-[10px] text-indigo-600 font-semibold">+3% Promo</p>
            </div>
            <div class="bg-emerald-50 p-2 rounded-lg border border-emerald-200">
              <p class="text-[10px] text-emerald-700 font-bold">Tier 3 (50-99 ktn)</p>
              <p class="text-base font-black text-emerald-900 mt-0.5">${promoTiers.tier3.count} <span class="text-[10px] font-normal">OC</span></p>
              <p class="text-[10px] text-emerald-600 font-semibold">+5% Promo</p>
            </div>
            <div class="bg-amber-50 p-2 rounded-lg border border-amber-200">
              <p class="text-[10px] text-amber-700 font-bold">Tier 4 (≥100 ktn)</p>
              <p class="text-base font-black text-amber-900 mt-0.5">${promoTiers.tier4.count} <span class="text-[10px] font-normal">OC</span></p>
              <p class="text-[10px] text-amber-600 font-semibold">+7% Promo</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Perspective 2: Upsell Pipeline & Salesman Leaderboard -->
      <div class="space-y-5">
        <!-- Upsell Pipeline -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div class="flex items-center justify-between border-b border-slate-100 pb-2">
            <div class="flex items-center gap-2">
              <span class="p-1.5 bg-amber-50 text-amber-600 rounded-lg">
                <i data-lucide="trending-up" class="w-4 h-4"></i>
              </span>
              <div>
                <h3 class="text-sm font-bold text-slate-900">Peluang Upsell Strata Promo (Hot Targets)</h3>
                <p class="text-[11px] text-slate-400">Toko yang mendekati ambang batas diskon tambahan 2% / 3%</p>
              </div>
            </div>
            <span class="text-[11px] bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full">
              ${upsellOpportunities.length} Toko Potensial
            </span>
          </div>

          <div class="space-y-2 max-h-48 overflow-y-auto scrollbar-thin pr-1 text-xs">
            ${upsellOpportunities.length === 0 ? `
              <p class="text-xs text-slate-400 py-4 text-center italic">Tidak ada toko di rentang gap saat ini</p>
            ` : upsellOpportunities.slice(0, 5).map(u => `
              <div class="p-2.5 rounded-xl border border-slate-100 bg-slate-50/60 hover:bg-white hover:border-amber-300 transition flex items-center justify-between">
                <div>
                  <p class="font-bold text-slate-900">${escapeHtml(u.outlet_name)}</p>
                  <p class="text-[10px] text-slate-500">${escapeHtml(u.kecamatan)} • Sales: ${escapeHtml(u.salesman_name)}</p>
                </div>
                <div class="text-right">
                  <span class="px-2 py-0.5 bg-amber-100 text-amber-900 font-extrabold text-[10px] rounded-md">
                    Butuh +${u.gap_to_promo} Ktn
                  </span>
                  <p class="text-[10px] text-emerald-600 font-semibold mt-0.5">Ke ${u.target_tier}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Salesman Leaderboard -->
        <div class="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
          <div class="flex items-center justify-between border-b border-slate-100 pb-2">
            <div class="flex items-center gap-2">
              <span class="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <i data-lucide="users" class="w-4 h-4"></i>
              </span>
              <div>
                <h3 class="text-sm font-bold text-slate-900">Leaderboard Salesman SariWangi</h3>
                <p class="text-[11px] text-slate-400">Peringkat kontribusi volume & dropsize per salesman</p>
              </div>
            </div>
          </div>

          <div class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead>
                <tr class="text-[10px] uppercase font-bold text-slate-400 border-b border-slate-100">
                  <th class="pb-2">Salesman</th>
                  <th class="pb-2 text-right">Volume</th>
                  <th class="pb-2 text-right">Omzet</th>
                  <th class="pb-2 text-right">OA / OC</th>
                  <th class="pb-2 text-right">Dropsize</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-100">
                ${salesmanLeaderboard.map((sm, idx) => `
                  <tr class="hover:bg-slate-50/70 transition">
                    <td class="py-2 flex items-center gap-1.5 font-semibold text-slate-800">
                      <span class="w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center ${idx === 0 ? 'bg-amber-400 text-slate-900' : 'bg-slate-100 text-slate-600'}">
                        ${idx + 1}
                      </span>
                      <span>${escapeHtml(sm.salesman_name)}</span>
                    </td>
                    <td class="py-2 text-right font-bold text-slate-900">${sm.total_cartons} <span class="text-[10px] text-slate-400 font-normal">Ktn</span></td>
                    <td class="py-2 text-right text-emerald-700 font-semibold">Rp ${(sm.total_netto / 1000000).toFixed(1)}M</td>
                    <td class="py-2 text-right text-slate-600">${sm.outlet_count} / ${sm.order_count}</td>
                    <td class="py-2 text-right font-bold ${sm.avg_dropsize >= 1 ? 'text-emerald-700' : (sm.avg_dropsize >= 0.5 ? 'text-sky-700' : 'text-amber-700')}">
                      ${sm.avg_dropsize}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>

    <!-- Section: Data Outlet yang Sudah Transaksi SariWangi (Outlets Table) -->
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div class="flex items-center gap-2">
            <i data-lucide="store" class="w-5 h-5 text-emerald-600"></i>
            <h2 class="text-base font-bold text-slate-900">Data Outlet yang Sudah Transaksi SariWangi</h2>
          </div>
          <p class="text-xs text-slate-500 mt-0.5">
            Menampilkan seluruh outlet bertransaksi SariWangi dengan rincian all SKU, total volume, dropsize, diskon strata, dan last order
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <span id="sw-outlet-count-badge" class="text-xs font-bold bg-slate-100 text-slate-700 px-3 py-1.5 rounded-lg border border-slate-200">
            Menampilkan 0 dari ${data.outlets.length} Toko
          </span>
          <button onclick="exportSariwangiCsv()" class="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-lg border border-slate-300 transition flex items-center gap-1.5">
            <i data-lucide="download" class="w-3.5 h-3.5"></i>
            <span>Unduh CSV</span>
          </button>
        </div>
      </div>

      <!-- Table Filter Tools Bar -->
      <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-3 text-xs">
        <!-- Search Input -->
        <div class="relative flex-1 max-w-sm">
          <input type="text" id="sw-table-search" oninput="handleSariwangiOutletSearch(this.value)" placeholder="Cari nama toko / ID outlet..." class="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition">
          <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2"></i>
        </div>

        <!-- Filter Dropsize Pills -->
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-slate-400 font-semibold mr-1">Dropsize:</span>
          <button onclick="filterSariwangiOutletsByDropsize('all')" id="btn-sw-ds-all" class="px-2.5 py-1 rounded-md font-semibold transition bg-emerald-600 text-white shadow-xs">Semua</button>
          <button onclick="filterSariwangiOutletsByDropsize('under_half')" id="btn-sw-ds-under_half" class="px-2.5 py-1 rounded-md font-semibold transition bg-slate-100 text-slate-600 hover:bg-slate-200">&lt; 1/2 ktn</button>
          <button onclick="filterSariwangiOutletsByDropsize('half_to_one')" id="btn-sw-ds-half_to_one" class="px-2.5 py-1 rounded-md font-semibold transition bg-slate-100 text-slate-600 hover:bg-slate-200">1/2 - 1 ktn</button>
          <button onclick="filterSariwangiOutletsByDropsize('over_one')" id="btn-sw-ds-over_one" class="px-2.5 py-1 rounded-md font-semibold transition bg-slate-100 text-slate-600 hover:bg-slate-200">&gt; 1 ktn</button>
          <button onclick="filterSariwangiOutletsByDropsize('ge_six')" id="btn-sw-ds-ge_six" class="px-2.5 py-1 rounded-md font-semibold transition bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold">≥ 6 ktn (Promo)</button>
        </div>

        <!-- Filter Recency Pills -->
        <div class="flex flex-wrap items-center gap-1.5">
          <span class="text-slate-400 font-semibold mr-1">Recency:</span>
          <button onclick="filterSariwangiOutletsByRecency('all')" id="btn-sw-rc-all" class="px-2.5 py-1 rounded-md font-semibold transition bg-emerald-600 text-white shadow-xs">Semua</button>
          <button onclick="filterSariwangiOutletsByRecency('days')" id="btn-sw-rc-days" class="px-2.5 py-1 rounded-md font-semibold transition bg-slate-100 text-slate-600 hover:bg-slate-200">days lalu</button>
          <button onclick="filterSariwangiOutletsByRecency('1week')" id="btn-sw-rc-1week" class="px-2.5 py-1 rounded-md font-semibold transition bg-slate-100 text-slate-600 hover:bg-slate-200">1 week lalu</button>
          <button onclick="filterSariwangiOutletsByRecency('gt1week')" id="btn-sw-rc-gt1week" class="px-2.5 py-1 rounded-md font-semibold transition bg-slate-100 text-slate-600 hover:bg-slate-200">&gt; 1 week</button>
          <button onclick="filterSariwangiOutletsByRecency('gt2week')" id="btn-sw-rc-gt2week" class="px-2.5 py-1 rounded-md font-semibold transition bg-slate-100 text-slate-600 hover:bg-slate-200">&gt; 2 week</button>
        </div>
      </div>

      <!-- Outlets Table Content -->
      <div class="overflow-x-auto rounded-xl border border-slate-200">
        <table class="w-full text-left text-xs border-collapse">
          <thead>
            <tr class="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[11px] select-none">
              <th class="p-3 w-12 text-center">#</th>
              <th class="p-3 cursor-pointer hover:bg-slate-100 transition" onclick="sortSariwangiOutlets('outlet_name')">
                <span class="flex items-center gap-1">Nama Toko & ID <i data-lucide="arrow-up-down" class="w-3 h-3 text-slate-400"></i></span>
              </th>
              <th class="p-3">Kecamatan / Rayon</th>
              <th class="p-3">Salesman</th>
              <th class="p-3 min-w-[200px]">SKU Terbeli & Volume (Ktn)</th>
              <th class="p-3 text-right cursor-pointer hover:bg-slate-100 transition" onclick="sortSariwangiOutlets('total_cartons')">
                <span class="flex items-center justify-end gap-1">Total Volume <i data-lucide="arrow-up-down" class="w-3 h-3 text-slate-400"></i></span>
              </th>
              <th class="p-3 text-right cursor-pointer hover:bg-slate-100 transition" onclick="sortSariwangiOutlets('total_netto')">
                <span class="flex items-center justify-end gap-1">Total Omzet <i data-lucide="arrow-up-down" class="w-3 h-3 text-slate-400"></i></span>
              </th>
              <th class="p-3 text-center">Kategori Dropsize</th>
              <th class="p-3 text-center">Strata Diskon</th>
              <th class="p-3 text-right cursor-pointer hover:bg-slate-100 transition" onclick="sortSariwangiOutlets('days_ago')">
                <span class="flex items-center justify-end gap-1">Last Day Order <i data-lucide="arrow-up-down" class="w-3 h-3 text-slate-400"></i></span>
              </th>
            </tr>
          </thead>
          <tbody id="sariwangi-outlets-tbody" class="divide-y divide-slate-100">
            <!-- Dynamically populated -->
          </tbody>
        </table>
      </div>

      <!-- Pagination Footer -->
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs">
        <div class="flex items-center gap-2 text-slate-500">
          <span>Baris per halaman:</span>
          <select id="sw-page-size" onchange="changeSariwangiPageSize(this.value)" class="bg-slate-50 border border-slate-200 rounded px-2 py-1 font-semibold text-slate-700">
            <option value="15">15</option>
            <option value="25" selected>25</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <span id="sw-pagination-info" class="text-slate-400">Menampilkan 1-25</span>
        </div>

        <div id="sw-pagination-controls" class="flex items-center gap-1">
          <!-- Dynamically populated page buttons -->
        </div>
      </div>
    </div>
  `;

  lucide.createIcons();

  // Render sub-components
  renderSariwangiGarutMap(kecamatanDistribution);
  renderSariwangiOutletTable();
}

async function renderSariwangiGarutMap(distribution) {
  const container = document.getElementById('sariwangi-map-canvas');
  const tooltip = document.getElementById('sw-map-tooltip');
  if (!container) return;

  const mapData = await getGarutMap();
  if (!mapData || !mapData.features) {
    container.innerHTML = `<div class="text-xs text-slate-400 py-12 text-center">Data peta Garut tidak tersedia</div>`;
    return;
  }

  // Map kecamatan names to stats
  const distMap = new Map();
  distribution.forEach(d => {
    distMap.set(cleanKecName(d.kecamatan_name), d);
  });

  const getHeatColor = (cartons) => {
    const c = parseFloat(cartons) || 0;
    if (c <= 0) return { fill: '#f8fafc', stroke: '#e2e8f0', label: '0 ktn' };
    if (c < 5) return { fill: '#dcfce7', stroke: '#bbf7d0', label: '< 5 ktn' };
    if (c < 15) return { fill: '#86efac', stroke: '#4ade80', label: '5-15 ktn' };
    if (c < 30) return { fill: '#22c55e', stroke: '#16a34a', label: '15-30 ktn' };
    if (c < 50) return { fill: '#15803d', stroke: '#166534', label: '30-50 ktn' };
    return { fill: '#052e16', stroke: '#14532d', label: '≥ 50 ktn' };
  };

  const pathsHtml = mapData.features.map(f => {
    const norm = cleanKecName(f.name);
    const d = distMap.get(norm);
    const ctn = d ? d.total_cartons : 0;
    const act = d ? d.active_outlets : 0;
    const netto = d ? d.total_netto : 0;
    const dropsize = d ? d.avg_dropsize : 0;
    const topSm = d ? d.top_salesman : '-';
    const topSku = d ? d.top_sku : '-';
    const heat = getHeatColor(ctn);

    return `
      <path id="sw-map-kec-${norm}"
        class="sw-kec-path cursor-pointer transition-all duration-150"
        d="${f.path}"
        fill="${heat.fill}"
        stroke="#ffffff"
        stroke-width="0.9"
        data-name="${escapeHtml(f.name)}"
        data-cartons="${ctn}"
        data-outlets="${act}"
        data-netto="${netto}"
        data-dropsize="${dropsize}"
        data-salesman="${escapeHtml(topSm)}"
        data-sku="${escapeHtml(topSku)}"
      ></path>
    `;
  }).join('');

  container.innerHTML = `
    <svg viewBox="${mapData.viewBox}" class="w-full h-full max-h-[340px] drop-shadow-sm select-none" preserveAspectRatio="xMidYMid meet">
      <g id="sw-garut-kec-group">
        ${pathsHtml}
      </g>
    </svg>
  `;

  // Attach hover & click events
  const paths = container.querySelectorAll('.sw-kec-path');
  paths.forEach(p => {
    const onEnter = (e) => {
      p.style.stroke = '#0f172a';
      p.style.strokeWidth = '2px';
      p.style.filter = 'drop-shadow(0 2px 8px rgba(0,0,0,0.4))';
      p.style.opacity = '1';

      paths.forEach(other => {
        if (other !== p) other.style.opacity = '0.6';
      });

      const name = p.getAttribute('data-name');
      const ctn = parseFloat(p.getAttribute('data-cartons')) || 0;
      const act = parseInt(p.getAttribute('data-outlets')) || 0;
      const netto = parseInt(p.getAttribute('data-netto')) || 0;
      const dropsize = parseFloat(p.getAttribute('data-dropsize')) || 0;
      const sm = p.getAttribute('data-salesman');
      const sku = p.getAttribute('data-sku');

      if (tooltip) {
        tooltip.classList.remove('hidden');
        tooltip.innerHTML = `
          <div class="space-y-1">
            <div class="flex items-center justify-between gap-3 border-b border-slate-700/80 pb-1">
              <strong class="text-xs font-bold text-emerald-400">${name}</strong>
              <span class="text-[10px] bg-emerald-500/30 text-emerald-200 px-1.5 py-0.2 rounded font-semibold">${act} Toko</span>
            </div>
            <div class="space-y-0.5 text-[10px] text-slate-200 pt-0.5">
              <p class="flex justify-between gap-4"><span>Total Volume:</span> <strong class="text-white">${ctn.toLocaleString('id-ID')} Ktn</strong></p>
              <p class="flex justify-between gap-4"><span>Total Omzet:</span> <strong class="text-emerald-300">Rp ${netto.toLocaleString('id-ID')}</strong></p>
              <p class="flex justify-between gap-4"><span>Rata Dropsize:</span> <strong class="text-white">${dropsize} Ktn/OC</strong></p>
              <p class="flex justify-between gap-4 pt-1 border-t border-slate-800 text-slate-400"><span>Top Sales:</span> <span class="text-slate-300 truncate max-w-[120px]">${sm}</span></p>
            </div>
            <p class="text-[9px] text-emerald-400/80 text-center pt-1 border-t border-slate-800/80">Klik untuk memfilter rincian outlet</p>
          </div>
        `;
        updateTooltipPos(e);
      }
    };

    const updateTooltipPos = (e) => {
      if (!tooltip) return;
      const targetParent = tooltip.offsetParent || container;
      const rect = targetParent.getBoundingClientRect();
      const clientX = e.touches && e.touches[0] ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches && e.touches[0] ? e.touches[0].clientY : e.clientY;
      if (clientX === undefined || clientY === undefined) return;

      const x = clientX - rect.left + 15;
      const y = clientY - rect.top + 15;
      const maxX = Math.max(8, rect.width - 180);
      const maxY = Math.max(8, rect.height - 110);
      tooltip.style.left = `${Math.max(8, Math.min(x, maxX))}px`;
      tooltip.style.top = `${Math.max(8, Math.min(y, maxY))}px`;
    };

    const onLeave = () => {
      p.style.stroke = '#ffffff';
      p.style.strokeWidth = '0.9px';
      p.style.filter = 'none';

      paths.forEach(other => {
        other.style.opacity = '1';
      });

      if (tooltip) tooltip.classList.add('hidden');
    };

    p.addEventListener('mouseenter', onEnter);
    p.addEventListener('mousemove', updateTooltipPos);
    p.addEventListener('mouseleave', onLeave);
    p.addEventListener('touchstart', onEnter, { passive: true });

    p.addEventListener('click', () => {
      const name = p.getAttribute('data-name');
      filterSariwangiByKecamatan(name);
    });
  });
}

function renderSariwangiOutletTable() {
  const tbody = document.getElementById('sariwangi-outlets-tbody');
  const countBadge = document.getElementById('sw-outlet-count-badge');
  const paginationControls = document.getElementById('sw-pagination-controls');
  const paginationInfo = document.getElementById('sw-pagination-info');
  if (!tbody || !window.sariwangiState.data) return;

  const allOutlets = window.sariwangiState.data.outlets || [];
  const { sortField, sortDir, dropsizeFilter, recencyFilter, searchQuery, page, pageSize } = window.sariwangiState.outletTable;

  // 1. Filter Outlets
  let filtered = allOutlets.filter(o => {
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchName = (o.outlet_name || '').toLowerCase().includes(q);
      const matchId = (o.outlet_id || '').toLowerCase().includes(q);
      const matchSm = (o.salesman_name || '').toLowerCase().includes(q);
      const matchKec = (o.kecamatan || '').toLowerCase().includes(q);
      if (!matchName && !matchId && !matchSm && !matchKec) return false;
    }

    // Dropsize filter
    if (dropsizeFilter !== 'all') {
      const c = o.total_cartons;
      if (dropsizeFilter === 'under_half' && c >= 0.5) return false;
      if (dropsizeFilter === 'half_to_one' && (c < 0.5 || c > 1.0)) return false;
      if (dropsizeFilter === 'over_one' && c <= 1.0) return false;
      if (dropsizeFilter === 'ge_six' && c < 6.0) return false;
    }

    // Recency filter
    if (recencyFilter !== 'all') {
      if (recencyFilter === 'days' && o.recency_key !== 'days') return false;
      if (recencyFilter === '1week' && o.recency_key !== '1week') return false;
      if (recencyFilter === 'gt1week' && o.recency_key !== 'gt1week') return false;
      if (recencyFilter === 'gt2week' && o.recency_key !== 'gt2week') return false;
    }

    return true;
  });

  // 2. Sort Outlets
  filtered.sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];
    if (typeof valA === 'string') {
      return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }
    return sortDir === 'asc' ? (valA || 0) - (valB || 0) : (valB || 0) - (valA || 0);
  });

  // 3. Paginate
  const totalItems = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  window.sariwangiState.outletTable.page = currentPage;

  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, totalItems);
  const pagedOutlets = filtered.slice(startIdx, endIdx);

  if (countBadge) {
    countBadge.textContent = `Menampilkan ${totalItems.toLocaleString('id-ID')} dari ${allOutlets.length.toLocaleString('id-ID')} Toko`;
  }
  if (paginationInfo) {
    paginationInfo.textContent = totalItems > 0 ? `Menampilkan ${startIdx + 1} - ${endIdx} dari ${totalItems}` : 'Tidak ada data';
  }

  // 4. Render Table Rows
  if (pagedOutlets.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" class="p-8 text-center text-slate-400 italic">
          <i data-lucide="store" class="w-8 h-8 mx-auto mb-2 opacity-40"></i>
          Tidak ada outlet SariWangi yang cocok dengan filter yang dipilih
        </td>
      </tr>
    `;
    lucide.createIcons();
    return;
  }

  tbody.innerHTML = pagedOutlets.map((o, idx) => {
    const rowNum = startIdx + idx + 1;
    const recencyBadgeClass = o.recency_badge === 'emerald' ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                             o.recency_badge === 'blue' ? 'bg-blue-100 text-blue-800 border-blue-200' :
                             o.recency_badge === 'amber' ? 'bg-amber-100 text-amber-800 border-amber-200' :
                             'bg-rose-100 text-rose-800 border-rose-200';

    const dsBadgeClass = o.total_cartons >= 6 ? 'bg-purple-100 text-purple-800 border-purple-200 font-extrabold' :
                         o.total_cartons > 1 ? 'bg-emerald-100 text-emerald-800 border-emerald-200' :
                         o.total_cartons >= 0.5 ? 'bg-sky-100 text-sky-800 border-sky-200' :
                         'bg-amber-100 text-amber-800 border-amber-200';

    return `
      <tr class="hover:bg-slate-50/80 transition">
        <td class="p-3 text-center text-slate-400 font-mono text-[11px]">${rowNum}</td>
        
        <!-- Outlet Name & ID -->
        <td class="p-3">
          <p class="font-bold text-slate-900 flex items-center gap-1.5">
            <span>${escapeHtml(o.outlet_name)}</span>
            ${o.has_selected_sku ? `<span class="w-2 h-2 rounded-full bg-indigo-500 shrink-0" title="Beli Selected SKU"></span>` : ''}
          </p>
          <p class="text-[10px] text-slate-400 font-mono mt-0.5">${escapeHtml(o.outlet_id)}</p>
        </td>

        <!-- Kecamatan / Rayon -->
        <td class="p-3">
          <p class="font-medium text-slate-800">${escapeHtml(o.kecamatan)}</p>
          <p class="text-[10px] text-slate-400">${escapeHtml(o.rayon)}</p>
        </td>

        <!-- Salesman -->
        <td class="p-3 font-medium text-slate-700">
          ${escapeHtml(o.salesman_name)}
        </td>

        <!-- SKU Terbeli Breakdown -->
        <td class="p-3">
          <div class="flex flex-wrap gap-1 max-w-xs">
            ${o.skus.slice(0, 3).map(s => `
              <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${s.is_selected ? 'bg-indigo-50 text-indigo-800 border border-indigo-200/60' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
                <span class="truncate max-w-[120px]">${escapeHtml(s.item_name.replace('SARIWANGI ', '').replace('SARIMURNI ', ''))}</span>
                <strong class="font-bold">${s.cartons} ktn</strong>
              </span>
            `).join('')}
            ${o.skus.length > 3 ? `
              <span class="text-[10px] text-slate-400 font-semibold self-center">+${o.skus.length - 3} SKU</span>
            ` : ''}
          </div>
        </td>

        <!-- Total Volume -->
        <td class="p-3 text-right">
          <span class="font-black text-slate-900">${o.total_cartons}</span>
          <span class="text-[10px] text-slate-500">Ktn</span>
        </td>

        <!-- Total Omzet -->
        <td class="p-3 text-right">
          <span class="font-bold text-emerald-700">Rp ${o.total_netto.toLocaleString('id-ID')}</span>
          <p class="text-[10px] text-slate-400">${o.order_count}x order</p>
        </td>

        <!-- Dropsize Category -->
        <td class="p-3 text-center">
          <span class="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${dsBadgeClass}">
            ${escapeHtml(o.dropsize_bracket)}
          </span>
        </td>

        <!-- Strata Discount -->
        <td class="p-3 text-center">
          <div class="inline-block text-[10px] text-slate-700">
            ${o.strata?.totalDisc > 0 ? `
              <span class="px-2 py-0.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded font-extrabold">
                ${o.strata.totalDisc}%
              </span>
              <p class="text-[9px] text-slate-400 mt-0.5">Reg ${o.strata.regDisc}% + Promo ${o.strata.selDisc}%</p>
            ` : `
              <span class="text-slate-400 italic">0%</span>
            `}
          </div>
        </td>

        <!-- Last Day Order & Recency Badge -->
        <td class="p-3 text-right">
          <span class="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold border ${recencyBadgeClass} shadow-2xs" title="Tanggal faktur terakhir: ${escapeHtml(o.last_order_date)}">
            ${escapeHtml(o.recency_label)}
          </span>
          <p class="text-[10px] text-slate-400 font-mono mt-0.5">${escapeHtml(o.last_order_date)}</p>
        </td>
      </tr>
    `;
  }).join('');

  lucide.createIcons();

  // 5. Render Pagination Controls
  if (paginationControls) {
    let pagesHtml = '';
    const maxButtons = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxButtons / 2));
    let endPage = Math.min(totalPages, startPage + maxButtons - 1);
    if (endPage - startPage + 1 < maxButtons) {
      startPage = Math.max(1, endPage - maxButtons + 1);
    }

    pagesHtml += `
      <button onclick="changeSariwangiPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled class="opacity-40 cursor-not-allowed"' : 'class="hover:bg-slate-100"'} class="px-2 py-1 rounded border border-slate-200 text-slate-600">
        <i data-lucide="chevron-left" class="w-3.5 h-3.5"></i>
      </button>
    `;

    for (let p = startPage; p <= endPage; p++) {
      pagesHtml += `
        <button onclick="changeSariwangiPage(${p})" class="px-2.5 py-1 rounded text-xs font-semibold ${p === currentPage ? 'bg-emerald-600 text-white shadow-xs' : 'border border-slate-200 text-slate-700 hover:bg-slate-100'}">
          ${p}
        </button>
      `;
    }

    pagesHtml += `
      <button onclick="changeSariwangiPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled class="opacity-40 cursor-not-allowed"' : 'class="hover:bg-slate-100"'} class="px-2 py-1 rounded border border-slate-200 text-slate-600">
        <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
      </button>
    `;

    paginationControls.innerHTML = pagesHtml;
    lucide.createIcons();
  }
}

// Event Handlers for SariWangi
function applySariwangiFilters() {
  const pdSelect = document.getElementById('filter-sw-period');
  const smSelect = document.getElementById('filter-sw-salesman');
  const rySelect = document.getElementById('filter-sw-rayon');
  const kcSelect = document.getElementById('filter-sw-kecamatan');
  const searchInput = document.getElementById('filter-sw-search');

  if (pdSelect) {
    window.sariwangiState.filters.period = pdSelect.value;
    const topPeriod = document.getElementById('filter-period');
    if (topPeriod) topPeriod.value = pdSelect.value;
  }
  if (smSelect) {
    window.sariwangiState.filters.salesman = smSelect.value;
    const topSls = document.getElementById('filter-salesman');
    if (topSls) {
      for (let i = 0; i < topSls.options.length; i++) {
        if (topSls.options[i].text === smSelect.value || topSls.options[i].value === smSelect.value) {
          topSls.selectedIndex = i;
          break;
        }
      }
    }
  }
  if (rySelect) {
    window.sariwangiState.filters.rayon = rySelect.value;
    const topRyn = document.getElementById('filter-rayon');
    if (topRyn) {
      for (let i = 0; i < topRyn.options.length; i++) {
        if (topRyn.options[i].text === rySelect.value || topRyn.options[i].value === rySelect.value) {
          topRyn.selectedIndex = i;
          break;
        }
      }
    }
  }
  if (kcSelect) {
    window.sariwangiState.filters.kecamatan = kcSelect.value;
    const topKec = document.getElementById('filter-kecamatan');
    if (topKec) {
      for (let i = 0; i < topKec.options.length; i++) {
        if (topKec.options[i].text === kcSelect.value || topKec.options[i].value === kcSelect.value) {
          topKec.selectedIndex = i;
          break;
        }
      }
    }
  }
  if (searchInput) window.sariwangiState.filters.search = searchInput.value.trim();

  renderSariwangiAnalytics();
}

function resetSariwangiFilters() {
  window.sariwangiState.filters = {
    period: '2026-09',
    salesman: '',
    rayon: '',
    kecamatan: '',
    skuType: 'ALL',
    search: ''
  };
  const topPeriod = document.getElementById('filter-period');
  if (topPeriod) topPeriod.value = '2026-09';
  const topSls = document.getElementById('filter-salesman');
  if (topSls) topSls.value = '';
  const topRyn = document.getElementById('filter-rayon');
  if (topRyn) topRyn.value = '';
  const topKec = document.getElementById('filter-kecamatan');
  if (topKec) topKec.value = '';

  window.sariwangiState.outletTable.dropsizeFilter = 'all';
  window.sariwangiState.outletTable.recencyFilter = 'all';
  window.sariwangiState.outletTable.searchQuery = '';
  window.sariwangiState.outletTable.page = 1;
  renderSariwangiAnalytics();
}

function setSariwangiSkuType(skuType) {
  window.sariwangiState.filters.skuType = skuType;
  renderSariwangiAnalytics();
}

function filterSariwangiByKecamatan(kecName) {
  const kcSelect = document.getElementById('filter-sw-kecamatan');
  if (kcSelect) {
    for (let i = 0; i < kcSelect.options.length; i++) {
      if (cleanKecName(kcSelect.options[i].text).includes(cleanKecName(kecName)) || cleanKecName(kecName).includes(cleanKecName(kcSelect.options[i].text))) {
        kcSelect.selectedIndex = i;
        break;
      }
    }
  }
  const topKec = document.getElementById('filter-kecamatan');
  if (topKec) {
    for (let i = 0; i < topKec.options.length; i++) {
      if (cleanKecName(topKec.options[i].text).includes(cleanKecName(kecName)) || cleanKecName(kecName).includes(cleanKecName(topKec.options[i].text))) {
        topKec.selectedIndex = i;
        break;
      }
    }
  }
  window.sariwangiState.filters.kecamatan = kecName;
  applySariwangiFilters();
}

function filterSariwangiOutletsByDropsize(bracket) {
  window.sariwangiState.outletTable.dropsizeFilter = bracket;
  window.sariwangiState.outletTable.page = 1;

  ['all', 'under_half', 'half_to_one', 'over_one', 'ge_six'].forEach(b => {
    const btn = document.getElementById(`btn-sw-ds-${b}`);
    if (btn) {
      if (b === bracket) {
        btn.className = 'px-2.5 py-1 rounded-md font-bold transition bg-emerald-600 text-white shadow-xs';
      } else {
        btn.className = 'px-2.5 py-1 rounded-md font-semibold transition bg-slate-100 text-slate-600 hover:bg-slate-200';
      }
    }
  });

  renderSariwangiOutletTable();
}

function filterSariwangiOutletsByRecency(recency) {
  window.sariwangiState.outletTable.recencyFilter = recency;
  window.sariwangiState.outletTable.page = 1;

  ['all', 'days', '1week', 'gt1week', 'gt2week'].forEach(r => {
    const btn = document.getElementById(`btn-sw-rc-${r}`);
    if (btn) {
      if (r === recency) {
        btn.className = 'px-2.5 py-1 rounded-md font-bold transition bg-emerald-600 text-white shadow-xs';
      } else {
        btn.className = 'px-2.5 py-1 rounded-md font-semibold transition bg-slate-100 text-slate-600 hover:bg-slate-200';
      }
    }
  });

  renderSariwangiOutletTable();
}

function handleSariwangiOutletSearch(query) {
  window.sariwangiState.outletTable.searchQuery = query.trim();
  window.sariwangiState.outletTable.page = 1;
  renderSariwangiOutletTable();
}

function sortSariwangiOutlets(field) {
  const table = window.sariwangiState.outletTable;
  if (table.sortField === field) {
    table.sortDir = table.sortDir === 'asc' ? 'desc' : 'asc';
  } else {
    table.sortField = field;
    table.sortDir = 'desc';
  }
  renderSariwangiOutletTable();
}

function changeSariwangiPage(page) {
  window.sariwangiState.outletTable.page = page;
  renderSariwangiOutletTable();
  const el = document.getElementById('sariwangi-outlets-tbody');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function changeSariwangiPageSize(size) {
  window.sariwangiState.outletTable.pageSize = parseInt(size, 10) || 25;
  window.sariwangiState.outletTable.page = 1;
  renderSariwangiOutletTable();
}

function exportSariwangiCsv() {
  const params = new URLSearchParams();
  if (window.sariwangiState.filters.period) params.set('period', window.sariwangiState.filters.period);
  if (window.sariwangiState.filters.salesman) params.set('salesman', window.sariwangiState.filters.salesman);
  if (window.sariwangiState.filters.rayon) params.set('rayon', window.sariwangiState.filters.rayon);
  if (window.sariwangiState.filters.kecamatan) params.set('kecamatan', window.sariwangiState.filters.kecamatan);
  if (window.sariwangiState.filters.skuType && window.sariwangiState.filters.skuType !== 'ALL') params.set('skuType', window.sariwangiState.filters.skuType);
  if (window.sariwangiState.filters.search) params.set('search', window.sariwangiState.filters.search);

  window.location.href = `/api/analytics/sariwangi/export?${params.toString()}`;
}
