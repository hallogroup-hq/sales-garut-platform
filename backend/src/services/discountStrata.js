/**
 * DISCOUNT STRATA SERVICE — Sales Garut Platform
 * Official volume-based discount tiers per category
 * Includes dual-layer stacking discount for SariWangi / Unilever:
 * 1. Reguler Discount (berlaku semua SKU SariWangi): 1-5 ktn (0.75%), 6-10 ktn (1.00%), >=11 ktn (1.25%)
 * 2. Support Promo Outlet (Strata Selected SKU GT): 6-19 ktn (2%), 20-49 ktn (3%), 50-99 ktn (5%), >=100 ktn (7%)
 * Total diskon = Reguler + Selected SKU (jika SKU terpilih dan memenuhi syarat)
 */

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
  { min: 0, max: 0.999, discPct: 0, label: '< 1 ktn', badge: '0%', desc: 'Tidak ada diskon' },
  { min: 1, max: 5.999, discPct: 0.75, label: '1 - 5 ktn', badge: '0.75%', desc: 'Reguler toko kecil' },
  { min: 6, max: 10.999, discPct: 1.00, label: '6 - 10 ktn', badge: '1.00%', desc: 'Reguler toko medium' },
  { min: 11, max: Infinity, discPct: 1.25, label: '≥ 11 ktn', badge: '1.25%', desc: 'Reguler grosir maksimal' }
];

const SARIWANGI_SELECTED_TIERS = [
  { min: 0, max: 5.999, discPct: 0, label: '< 6 ktn', badge: '0%', desc: 'Belum masuk strata promo' },
  { min: 6, max: 19.999, discPct: 2.00, label: '6 - 19 ktn', badge: '2.00%', desc: 'Promo outlet tier 1' },
  { min: 20, max: 49.999, discPct: 3.00, label: '20 - 49 ktn', badge: '3.00%', desc: 'Promo outlet tier 2' },
  { min: 50, max: 99.999, discPct: 5.00, label: '50 - 99 ktn', badge: '5.00%', desc: 'Promo outlet tier 3' },
  { min: 100, max: Infinity, discPct: 7.00, label: '≥ 100 ktn', badge: '7.00%', desc: 'Promo outlet tier 4 (Maksimal)' }
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
  }
  if (SARIWANGI_SELECTED_SKUS.includes(code)) return true;
  return SARIWANGI_SELECTED_DETAILS.some(d => d.item_code === code || (name && name === d.item_name));
}

function matchTier(tiers, qty) {
  const q = parseFloat(qty) || 0;
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
  return { matchedTier, matchedIndex, nextTier, neededToNext };
}

const DISCOUNT_STRATA_RULES = {
  KOPI_NON_RTD: {
    id: 'KOPI_NON_RTD',
    name: 'Kopi Bubuk / Sachet (Non-RTD)',
    brandScope: 'Kopi Gadjah & Caffino (selain beverage/RTD)',
    color: 'amber',
    icon: 'coffee',
    description: 'Semua varian kopi sachet, bag, pouch, renteng, dan box Kopi Tubruk Gadjah dan Caffino.',
    tiers: [
      { min: 0, max: 1.999, discPct: 0, label: '0 - 1 ktn', badge: '0%' },
      { min: 2, max: 7.999, discPct: 2, label: '2 - 7 ktn', badge: '2%' },
      { min: 8, max: 14.999, discPct: 3, label: '8 - 14 ktn', badge: '3%' },
      { min: 15, max: Infinity, discPct: 4, label: '≥ 15 ktn', badge: '4%' }
    ]
  },
  BEVERAGE_RTD_MILKLIFE: {
    id: 'BEVERAGE_RTD_MILKLIFE',
    name: 'Beverage RTD, MilkLife UHT & Yoghurt',
    brandScope: 'MilkLife UHT/ESL, Yoghurt Drink, Oat Life & Caffino RTD Botol',
    color: 'blue',
    icon: 'milk',
    description: 'Semua produk cair siap minum (RTD), MilkLife ESL/UHT (Kids, Teens, Full Cream), Yoghurt Drink, dan RTD botol.',
    tiers: [
      { min: 0, max: 0.999, discPct: 0, label: '< 1 ktn', badge: '0%' },
      { min: 1, max: 2.999, discPct: 1, label: '1 - 2 ktn', badge: '1%' },
      { min: 3, max: 9.999, discPct: 2, label: '3 - 9 ktn', badge: '2%' },
      { min: 10, max: Infinity, discPct: 3, label: '≥ 10 ktn', badge: '3%' }
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
      { min: 0, max: 0.999, discPct: 0, label: '< 1 ktn', badge: '0%' },
      { min: 1, max: 4.999, discPct: 2, label: '1 - 4 ktn', badge: '2%' },
      { min: 5, max: Infinity, discPct: 3, label: '≥ 5 ktn', badge: '3%' }
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
      { min: 0, max: 0.999, discPct: 0, label: '< 1 ktn', badge: '0%' },
      { min: 1, max: 4.999, discPct: 2, label: '1 - 4 ktn', badge: '2%' },
      { min: 5, max: Infinity, discPct: 3, label: '≥ 5 ktn', badge: '3%' }
    ]
  },
  UNILEVER: {
    id: 'UNILEVER',
    name: 'SariWangi (Reguler & Selected SKU Promo)',
    brandScope: 'Semua Teh SariWangi, SariMurni & SariMelati (Region Jabar & JBKS)',
    color: 'purple',
    icon: 'coffee',
    description: 'Diskon reguler berlaku untuk semua SKU SariWangi. Untuk 6 SKU Terpilih (Selected SKU), diskon promo otomatis DITAMBAHKAN ke diskon reguler bila memenuhi kriteria masing-masing.',
    isDualStrata: true,
    regulerTiers: SARIWANGI_REGULER_TIERS,
    selectedSkuTiers: SARIWANGI_SELECTED_TIERS,
    selectedSkus: SARIWANGI_SELECTED_DETAILS,
    tiers: SARIWANGI_REGULER_TIERS
  },
  SARIWANGI_REGULER: {
    id: 'SARIWANGI_REGULER',
    name: 'SariWangi — Diskon Reguler (Semua SKU)',
    brandScope: 'Berlaku untuk seluruh SKU SariWangi & SariMurni (Region Jbks dan Jabar)',
    color: 'purple',
    icon: 'coffee',
    description: 'Strata reguler: 1-5 ktn (0.75%), 6-10 ktn (1.00%), ≥ 11 ktn (1.25%).',
    tiers: SARIWANGI_REGULER_TIERS
  },
  SARIWANGI_SELECTED_SKU: {
    id: 'SARIWANGI_SELECTED_SKU',
    name: 'SariWangi — Support Promo Outlet (6 Selected SKU GT)',
    brandScope: 'Khusus 6 SKU Terpilih: SariWangi Asli 48x25, Asli 288x4, Melati 48x25, SariMurni 48x25, SariMurni 180x5, SariMurni 48x20',
    color: 'indigo',
    icon: 'sparkles',
    description: 'Strata promo: 6-19 ktn (2.00%), 20-49 ktn (3.00%), 50-99 ktn (5.00%), ≥ 100 ktn (7.00%). Ditambahkan ke diskon reguler bila memenuhi kriteria.',
    tiers: SARIWANGI_SELECTED_TIERS,
    selectedSkus: SARIWANGI_SELECTED_DETAILS
  }
};

function classifyItem(it) {
  if (!it) return null;
  const p = (it.principal || '').toUpperCase();
  const b = (it.brand || '').toUpperCase();
  const name = (it.item_name || '').toUpperCase();
  const code = (it.item_code || '').trim();

  // 1. Beverage RTD & MilkLife (all liquid ready to drink)
  if (p === 'GLOBAL DAIRY ALAMI' || name.includes(' RTD') || name.includes('CAF RTD') || name.includes('BEVERAGE') || 
      name.includes('HYDROPLUS') || name.includes('YUZU') || name.includes('ISOTONIC') || name.includes('TEA MIX') || 
      name.includes('ORANGE GO') || name.includes('CHOCOLUV')) {
    return DISCOUNT_STRATA_RULES.BEVERAGE_RTD_MILKLIFE;
  }

  // 2. Candy FOX'S
  if (b.includes('FOX') || name.includes('FOX') || name.includes('SHOT MINT')) {
    return DISCOUNT_STRATA_RULES.CANDY_FOXS;
  }

  // 3. Prima Top Boga (5Days, Deli Daily)
  if (p === 'PRIMA TOP BOGA' || b.includes('5DAYS') || b.includes('DELI') || name.includes('5DAYS') || name.includes('DELI')) {
    return DISCOUNT_STRATA_RULES.PRIMA_TOP_BOGA;
  }

  // 4. Unilever / SariWangi
  if (p === 'UNILEVER INDONESIA' || b.includes('SARI') || name.includes('SARIWANGI') || name.includes('SARIMELATI') || name.includes('SARIMURNI') || SARIWANGI_SELECTED_SKUS.includes(code)) {
    return DISCOUNT_STRATA_RULES.UNILEVER;
  }

  // 5. Kopi Non-RTD (Caffino & Kopi Tubruk Gadjah)
  if (p === 'SUMBER KOPI PRIMA' || b.includes('CAFFINO') || b.includes('GADJAH') || name.includes('CAFFINO') || name.includes('GADJAH') || name.includes('KOPI')) {
    return DISCOUNT_STRATA_RULES.KOPI_NON_RTD;
  }

  // Fallback to Fox's / Confectionery for remaining snacks
  return DISCOUNT_STRATA_RULES.CANDY_FOXS;
}

function getDiscountForQty(categoryKey, qty, item = null) {
  const q = parseFloat(qty) || 0;
  
  // Check if this is Unilever / SariWangi
  const isUnileverCat = categoryKey === 'UNILEVER' || categoryKey === 'SARIWANGI' || 
                        categoryKey === 'SARIWANGI_REGULER' || categoryKey === 'SARIWANGI_SELECTED_SKU' || 
                        (item && classifyItem(item)?.id === 'UNILEVER') || 
                        (typeof item === 'string' && SARIWANGI_SELECTED_SKUS.includes(item));
  
  if (isUnileverCat) {
    const isSelected = categoryKey === 'SARIWANGI_SELECTED_SKU' || isSariwangiSelectedSku(item);
    const regResult = matchTier(SARIWANGI_REGULER_TIERS, q);
    const regDisc = regResult.matchedTier.discPct;

    if (isSelected) {
      const selResult = matchTier(SARIWANGI_SELECTED_TIERS, q);
      const selDisc = selResult.matchedTier.discPct;
      const totalDisc = Math.round((regDisc + selDisc) * 100) / 100;

      // Calculate next threshold
      const candidates = [];
      if (regResult.nextTier && regResult.neededToNext > 0) {
        const potentialQty = q + regResult.neededToNext;
        const pReg = matchTier(SARIWANGI_REGULER_TIERS, potentialQty).matchedTier.discPct;
        const pSel = matchTier(SARIWANGI_SELECTED_TIERS, potentialQty).matchedTier.discPct;
        const pTotal = Math.round((pReg + pSel) * 100) / 100;
        if (pTotal > totalDisc) {
          candidates.push({ qty: potentialQty, needed: regResult.neededToNext, disc: pTotal, label: `≥ ${potentialQty} ktn` });
        }
      }
      if (selResult.nextTier && selResult.neededToNext > 0) {
        const potentialQty = q + selResult.neededToNext;
        const pReg = matchTier(SARIWANGI_REGULER_TIERS, potentialQty).matchedTier.discPct;
        const pSel = matchTier(SARIWANGI_SELECTED_TIERS, potentialQty).matchedTier.discPct;
        const pTotal = Math.round((pReg + pSel) * 100) / 100;
        if (pTotal > totalDisc) {
          candidates.push({ qty: potentialQty, needed: selResult.neededToNext, disc: pTotal, label: `≥ ${potentialQty} ktn` });
        }
      }

      let nextTier = null;
      let neededToNext = 0;
      let hint = 'Maksimal tier diskon tercapai (8.25%)!';

      if (candidates.length > 0) {
        candidates.sort((a, b) => a.needed - b.needed);
        const best = candidates[0];
        neededToNext = best.needed;
        hint = `+ ${neededToNext} ktn lagi untuk total diskon ${best.disc}% (Reguler + Selected SKU)`;
        nextTier = {
          min: best.qty,
          discPct: best.disc,
          label: best.label,
          badge: `${best.disc}%`
        };
      }

      return {
        categoryKey: 'UNILEVER',
        categoryName: 'SariWangi (Selected SKU Promo + Reguler)',
        qty: q,
        discPct: totalDisc,
        regularDiscPct: regDisc,
        selectedSkuDiscPct: selDisc,
        isSelectedSku: true,
        breakdown: `${regDisc}% (Reguler) + ${selDisc}% (Selected SKU) = ${totalDisc}%`,
        currentTier: {
          label: `${regResult.matchedTier.label} (Reg) + ${selResult.matchedTier.label} (Promo)`,
          badge: `${totalDisc}%`,
          discPct: totalDisc
        },
        nextTier,
        neededToNext,
        hint
      };
    } else {
      // General SariWangi (non-selected SKU)
      return {
        categoryKey: 'UNILEVER',
        categoryName: 'SariWangi & Unilever (Reguler)',
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
          ? `Tambah ${regResult.neededToNext} ktn lagi untuk diskon ${regResult.nextTier.discPct}% (tier ${regResult.nextTier.label})` 
          : 'Maksimal tier diskon reguler tercapai!'
      };
    }
  }

  // Other categories (Kopi, MilkLife, Fox's, Prima Top Boga)
  const category = typeof categoryKey === 'string' ? DISCOUNT_STRATA_RULES[categoryKey] : categoryKey;
  if (!category || !category.tiers) {
    return { discPct: 0, currentTier: null, nextTier: null, neededToNext: 0 };
  }

  const { matchedTier, nextTier, neededToNext } = matchTier(category.tiers, q);

  return {
    categoryKey: category.id,
    categoryName: category.name,
    qty: q,
    discPct: matchedTier.discPct,
    currentTier: matchedTier,
    nextTier,
    neededToNext,
    hint: nextTier && neededToNext > 0 ? `Tambah ${neededToNext} ktn lagi untuk diskon ${nextTier.discPct}% (tier ${nextTier.label})` : 'Maksimal tier diskon tercapai!'
  };
}

module.exports = {
  DISCOUNT_STRATA_RULES,
  SARIWANGI_SELECTED_SKUS,
  SARIWANGI_SELECTED_DETAILS,
  SARIWANGI_REGULER_TIERS,
  SARIWANGI_SELECTED_TIERS,
  isSariwangiSelectedSku,
  classifyItem,
  getDiscountForQty
};
