/**
 * DISCOUNT STRATA SERVICE — Sales Garut Platform
 * Official volume-based discount tiers per category
 */

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
    name: 'Semua Produk Unilever Indonesia',
    brandScope: 'SariWangi, SariMurni, SariMelati',
    color: 'purple',
    icon: 'coffee',
    description: 'Semua varian teh celup dan teh kantong resmi Unilever Indonesia (SariWangi, SariMelati, SariMurni).',
    tiers: [
      { min: 0, max: 5.999, discPct: 0, label: '0 - 5 ktn', badge: '0%' },
      { min: 6, max: 19.999, discPct: 2, label: '6 - 19 ktn', badge: '2%' },
      { min: 20, max: 49.999, discPct: 3, label: '20 - 49 ktn', badge: '3%' },
      { min: 50, max: Infinity, discPct: 5, label: '≥ 50 ktn', badge: '5%' }
    ]
  }
};

function classifyItem(it) {
  if (!it) return null;
  const p = (it.principal || '').toUpperCase();
  const b = (it.brand || '').toUpperCase();
  const name = (it.item_name || '').toUpperCase();

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

  // 4. Unilever
  if (p === 'UNILEVER INDONESIA' || b.includes('SARI') || name.includes('SARIWANGI') || name.includes('SARIMELATI') || name.includes('SARIMURNI')) {
    return DISCOUNT_STRATA_RULES.UNILEVER;
  }

  // 5. Kopi Non-RTD (Caffino & Kopi Tubruk Gadjah)
  if (p === 'SUMBER KOPI PRIMA' || b.includes('CAFFINO') || b.includes('GADJAH') || name.includes('CAFFINO') || name.includes('GADJAH') || name.includes('KOPI')) {
    return DISCOUNT_STRATA_RULES.KOPI_NON_RTD;
  }

  // Fallback to Fox's / Confectionery for remaining snacks
  return DISCOUNT_STRATA_RULES.CANDY_FOXS;
}

function getDiscountForQty(categoryKey, qty) {
  const category = typeof categoryKey === 'string' ? DISCOUNT_STRATA_RULES[categoryKey] : categoryKey;
  const q = parseFloat(qty) || 0;
  if (!category || !category.tiers) {
    return { discPct: 0, currentTier: null, nextTier: null, neededToNext: 0 };
  }

  let matchedTier = category.tiers[0];
  let matchedIndex = 0;
  for (let i = 0; i < category.tiers.length; i++) {
    const t = category.tiers[i];
    if (q >= t.min && q <= t.max) {
      matchedTier = t;
      matchedIndex = i;
      break;
    }
  }

  const nextTier = matchedIndex < category.tiers.length - 1 ? category.tiers[matchedIndex + 1] : null;
  const neededToNext = nextTier ? Math.max(0, Math.ceil(nextTier.min - q)) : 0;

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
  classifyItem,
  getDiscountForQty
};
