const optionalNumber = value => value == null || value === '' ? null : Number(value);
const optionalText = value => String(value || '').trim() || null;

export function manualRatePayload(form) {
  return {
    name: form.name.trim(),
    regionCountry: optionalText(form.regionCountry)?.toUpperCase() || null,
    regionStateProvince: optionalText(form.regionStateProvince),
    rateType: form.rateType,
    amount: form.rateType === 'FREE' ? 0 : Number(form.amount),
    minWeight: form.rateType === 'WEIGHT_BASED' ? optionalNumber(form.minWeight) : null,
    maxWeight: form.rateType === 'WEIGHT_BASED' ? optionalNumber(form.maxWeight) : null,
    minSubtotal: form.rateType === 'PRICE_BASED' ? optionalNumber(form.minSubtotal) : null,
    maxSubtotal: form.rateType === 'PRICE_BASED' ? optionalNumber(form.maxSubtotal) : null,
    freeOverAmount: form.rateType === 'FREE' ? optionalNumber(form.freeOverAmount) : null,
    estimatedDeliveryText: optionalText(form.estimatedDeliveryText),
    isActive: Boolean(form.isActive),
  };
}

const collections = { packages: 'shippingPackages', locations: 'shippingLocations', 'manual-rates': 'shippingManualRates', 'fallback-rates': 'shippingFallbackRates' };
export function mergeShippingEntity(settings, url, method, result) {
  const [, resource, id] = url.split('/shipping/')[1].match(/^([^/]+)(?:\/([^/]+))?$/);
  const key = collections[resource];
  if (!key) throw new Error('Unknown shipping resource');
  if (method === 'DELETE') return { ...settings, [key]: settings[key].filter(row => row.id !== id) };
  const saved = { ...result };
  for (const field of ['amount', 'minSubtotal', 'maxSubtotal', 'freeOverAmount']) {
    if (`${field}Cents` in saved) saved[field] = saved[`${field}Cents`] == null ? null : saved[`${field}Cents`] / 100;
  }
  const rows = settings[key].filter(row => row.id !== saved.id).map(row => saved.isDefault ? { ...row, isDefault: false } : row);
  return { ...settings, [key]: [...rows, saved].sort((a, b) => Number(Boolean(b.isDefault)) - Number(Boolean(a.isDefault)) || String(a.createdAt).localeCompare(String(b.createdAt))) };
}
