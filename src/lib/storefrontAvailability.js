function normalizeBadgeLabel(badge) {
  if (!badge) {
    return null;
  }

  if (badge === 'COMING_SOON') return 'Coming soon';
  if (badge === 'PRESALE') return 'Presale';
  if (badge === 'DIGITAL') return null;
  if (badge === 'BACKORDER') return 'Backorder';
  if (badge === 'SOLD_OUT') return 'Sold out';
  return null;
}

export function getStorefrontBadgeText(product) {
  const availability = product?.availability || {};
  const defaultLabel = normalizeBadgeLabel(availability.badge);

  if (
    availability.storefrontBadgeText &&
    (availability.badge === 'COMING_SOON' || availability.badge === 'PRESALE')
  ) {
    return availability.storefrontBadgeText;
  }

  return defaultLabel;
}

export function isComingSoonProduct(product) {
  return product?.availability?.effectiveSalesMode === 'COMING_SOON';
}

export function isPresaleProduct(product) {
  return product?.availability?.effectiveSalesMode === 'PRESALE';
}

export function isVariantPurchasable(product, variant, quantity = 1) {
  if (!variant) {
    return false;
  }

  if (isComingSoonProduct(product)) {
    return false;
  }

  const requested = Math.max(1, Number(quantity || 1));
  const inventory = Number(variant.inventory ?? 0);
  const continueSelling = Boolean(variant.continueSellingWhenOutOfStock);

  if (inventory >= requested) {
    return true;
  }

  return continueSelling;
}

export function getProductPrimaryVariant(product) {
  return product?.variants?.[0] || null;
}
