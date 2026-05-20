const SAMPLE_IMAGE_LIBRARY = [
  '/images/product-1.jpg',
  '/images/product-2.jpg',
  '/images/product-3.jpg',
  '/images/product-4.jpg',
  '/images/product-large.jpg',
];

const VALID_STATUSES = ['active', 'draft', 'archived'];
const VALID_SALES_MODES = ['standard', 'coming_soon', 'presale'];
const VALID_FULFILLMENT_TYPES = ['physical', 'digital'];
export const LOW_STOCK_THRESHOLD = 5;
const PRODUCT_STATE_META = {
  active: { label: 'Active', tone: 'success' },
  draft: { label: 'Draft', tone: 'warning' },
  scheduled: { label: 'Scheduled', tone: 'info' },
  archived: { label: 'Archived', tone: 'danger' },
};

function createId(prefix = 'id') {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }

  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function createEntityId(prefix) {
  return createId(prefix);
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function trimString(value) {
  return String(value ?? '').trim();
}

function parseIsoDate(value) {
  if (!value) {
    return null;
  }

  const parsed = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isFuturePublishDate(value, now = new Date()) {
  const publishDate = parseIsoDate(value);
  if (!publishDate) {
    return false;
  }

  return publishDate.getTime() > now.getTime();
}

export function getComputedProductState(product, now = new Date()) {
  const status = VALID_STATUSES.includes(product?.status) ? product.status : 'draft';

  if (status === 'archived') {
    return 'archived';
  }

  if (isFuturePublishDate(product?.publishedAt, now)) {
    return 'scheduled';
  }

  if (status === 'active') {
    return 'active';
  }

  return 'draft';
}

export function getComputedProductStateMeta(product, now = new Date()) {
  const state = getComputedProductState(product, now);
  return {
    state,
    label: PRODUCT_STATE_META[state].label,
    tone: PRODUCT_STATE_META[state].tone,
  };
}

function parseMoney(value) {
  const parsed = Number.parseFloat(String(value ?? '0').replace(/[^0-9.-]/g, ''));
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }

  return Number(parsed.toFixed(2));
}

export function formatMoney(value) {
  return `$${parseMoney(value).toFixed(2)}`;
}

function normalizeMoney(value) {
  return parseMoney(value).toFixed(2);
}

function normalizeInventory(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }

  return parsed;
}

function parseNumericInput(value) {
  const rawValue = String(value ?? '').trim();
  const sanitizedValue = rawValue.replace(/[^0-9.-]/g, '');

  if (!sanitizedValue || sanitizedValue === '-' || sanitizedValue === '.' || sanitizedValue === '-.') {
    return {
      isNumeric: false,
      value: null,
    };
  }

  const parsedValue = Number.parseFloat(sanitizedValue);

  return {
    isNumeric: !Number.isNaN(parsedValue),
    value: Number.isNaN(parsedValue) ? null : parsedValue,
  };
}

function parseIntegerInput(value) {
  const rawValue = String(value ?? '').trim();

  if (!rawValue) {
    return {
      isNumeric: false,
      value: null,
    };
  }

  const parsedValue = Number.parseInt(rawValue, 10);

  return {
    isNumeric: !Number.isNaN(parsedValue),
    value: Number.isNaN(parsedValue) ? null : parsedValue,
  };
}

function normalizeVariantWeight(value) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === 'string' && !value.trim()) {
    return null;
  }

  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }

  if (numeric < 0) {
    return null;
  }

  return Number(numeric.toFixed(4));
}

function normalizeVariantWeightUnit(value) {
  const normalized = trimString(value).toLowerCase();
  if (['g', 'kg', 'oz', 'lb'].includes(normalized)) {
    return normalized;
  }
  return 'kg';
}

function normalizeSalesMode(value) {
  const normalized = trimString(value).toLowerCase();
  if (VALID_SALES_MODES.includes(normalized)) {
    return normalized;
  }
  return 'standard';
}

function normalizeFulfillmentType(value) {
  const normalized = trimString(value).toLowerCase();
  if (VALID_FULFILLMENT_TYPES.includes(normalized)) {
    return normalized;
  }
  return 'physical';
}

function normalizeTagList(tags = []) {
  return [...new Set(tags.map(trimString).filter(Boolean))];
}

function normalizeOptionGroupName(name) {
  return trimString(name);
}

function normalizeOptionValues(values = []) {
  return [...new Set(values.map(trimString).filter(Boolean))];
}

export function sanitizeOptions(options = []) {
  const seenNames = new Set();

  return options
    .map(option => {
      const name = normalizeOptionGroupName(option.name);
      const values = normalizeOptionValues(option.values);

      return {
        id: option.id || createId('option'),
        name,
        values,
      };
    })
    .filter(option => {
      if (!option.name || !option.values.length) {
        return false;
      }

      const lookup = option.name.toLowerCase();
      if (seenNames.has(lookup)) {
        return false;
      }

      seenNames.add(lookup);
      return true;
    });
}

export function getVariantKey(optionValues = {}, optionNames = []) {
  if (!optionNames.length) {
    return 'default';
  }

  return optionNames.map(name => `${name}:${trimString(optionValues[name]) || '-'}`).join('|');
}

export function buildVariantTitle(optionValues = {}, optionNames = []) {
  if (!optionNames.length) {
    return 'Default';
  }

  return optionNames.map(name => trimString(optionValues[name]) || 'Unset').join(' / ');
}

function createImage(src, alt, sortOrder, metadata = {}) {
  return {
    id: metadata.id || createId('image'),
    assetId: metadata.assetId || null,
    src,
    alt: trimString(alt) || 'Product media',
    isFeatured: false,
    sortOrder,
  };
}

export function createImageAsset(src, alt, sortOrder, metadata = {}) {
  return createImage(src, alt, sortOrder, metadata);
}

function sortImages(images = []) {
  return [...images].sort((first, second) => {
    const firstOrder = Number(first.sortOrder) || 0;
    const secondOrder = Number(second.sortOrder) || 0;
    return firstOrder - secondOrder;
  });
}

export function ensureMediaState(images = [], featuredImageId = null) {
  const sortedImages = sortImages(images)
    .filter(image => image?.src)
    .map((image, index) => ({
      id: image.id || createId('image'),
      assetId: image.assetId || null,
      src: image.src,
      alt: trimString(image.alt) || 'Product media',
      isFeatured: false,
      sortOrder: index,
    }));

  if (!sortedImages.length) {
    return {
      images: [],
      featuredImageId: null,
    };
  }

  const nextFeaturedId =
    sortedImages.find(image => image.id === featuredImageId)?.id ||
    sortedImages[0].id;

  return {
    featuredImageId: nextFeaturedId,
    images: sortedImages.map(image => ({
      ...image,
      isFeatured: image.id === nextFeaturedId,
    })),
  };
}

function createDefaultVariant(product) {
  const title = 'Default';

  return {
    id: createId('variant'),
    title,
    optionValues: {},
    sku: trimString(product.sku) || `${trimString(product.title).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '') || 'SKU'}-1`,
    price: normalizeMoney(product.basePrice),
    compareAtPrice: normalizeMoney(product.compareAtPrice),
    inventoryQty: normalizeInventory(product.inventorySummary?.totalAvailable),
    continueSellingWhenOutOfStock: false,
    weight: null,
    weightUnit: 'kg',
    imageId: product.featuredImageId || null,
    isDefault: true,
    isActive: true,
  };
}

export function createDefaultVariantForProduct(product) {
  return createDefaultVariant(product);
}

function findFallbackVariant(combo, existingVariants, usedVariantIds) {
  let bestMatch = null;
  let bestScore = -1;

  existingVariants.forEach(variant => {
    if (usedVariantIds.has(variant.id)) {
      return;
    }

    const entries = Object.entries(variant.optionValues || {}).filter(([, value]) => trimString(value));
    if (!entries.length) {
      return;
    }

    const isSubsetMatch = entries.every(([name, value]) => combo[name] === value);
    if (!isSubsetMatch) {
      return;
    }

    if (entries.length > bestScore) {
      bestMatch = variant;
      bestScore = entries.length;
    }
  });

  return bestMatch;
}

function buildVariantFromTemplate(templateVariant, combo, optionNames, product, fallbackIndex, preserveTitle = false) {
  const nextSkuBase = trimString(product.sku) || 'SKU';

  return {
    id: templateVariant?.id || createId('variant'),
    title:
      (preserveTitle ? trimString(templateVariant?.title) : '') ||
      buildVariantTitle(combo, optionNames),
    optionValues: combo,
    sku: trimString(templateVariant?.sku) || `${nextSkuBase}-${fallbackIndex + 1}`,
    price: normalizeMoney(templateVariant?.price ?? product.basePrice),
    compareAtPrice: normalizeMoney(templateVariant?.compareAtPrice ?? product.compareAtPrice),
    inventoryQty: normalizeInventory(templateVariant?.inventoryQty),
    continueSellingWhenOutOfStock: Boolean(templateVariant?.continueSellingWhenOutOfStock),
    weight: normalizeVariantWeight(templateVariant?.weight),
    weightUnit: normalizeVariantWeightUnit(templateVariant?.weightUnit),
    imageId: templateVariant?.imageId || product.featuredImageId || null,
    isDefault: false,
    isActive: templateVariant?.isActive ?? true,
  };
}

function buildCartesianCombinations(options = []) {
  if (!options.length) {
    return [];
  }

  return options.reduce((combinations, option) => {
    const nextCombinations = [];

    combinations.forEach(currentCombination => {
      option.values.forEach(value => {
        nextCombinations.push({
          ...currentCombination,
          [option.name]: value,
        });
      });
    });

    return nextCombinations;
  }, [{}]);
}

export function generateVariantsFromOptions(product, nextOptions, existingVariants = []) {
  const options = sanitizeOptions(nextOptions);
  const optionNames = options.map(option => option.name);

  if (!optionNames.length) {
    const defaultVariant = existingVariants.find(variant => variant.isDefault) || existingVariants[0] || createDefaultVariant(product);
    return [
      {
        ...buildVariantFromTemplate(defaultVariant, {}, [], product, 0, true),
        isDefault: true,
      },
    ];
  }

  const combinations = buildCartesianCombinations(options);
  const exactMatchMap = new Map();
  const usedVariantIds = new Set();

  existingVariants.forEach(variant => {
    exactMatchMap.set(getVariantKey(variant.optionValues, optionNames), variant);
  });

  return combinations.map((combo, index) => {
    const comboKey = getVariantKey(combo, optionNames);
    const exactMatch = exactMatchMap.get(comboKey);

    if (exactMatch) {
      usedVariantIds.add(exactMatch.id);
      return buildVariantFromTemplate(exactMatch, combo, optionNames, product, index, true);
    }

    const fallbackVariant = findFallbackVariant(combo, existingVariants, usedVariantIds);
    if (fallbackVariant) {
      usedVariantIds.add(fallbackVariant.id);
      return buildVariantFromTemplate(fallbackVariant, combo, optionNames, product, index);
    }

    return buildVariantFromTemplate(null, combo, optionNames, product, index);
  });
}

export function getMissingVariantCombos(options, variants = []) {
  const cleanOptions = sanitizeOptions(options);
  const optionNames = cleanOptions.map(option => option.name);

  if (!optionNames.length) {
    return [];
  }

  const existingKeys = new Set(variants.map(variant => getVariantKey(variant.optionValues, optionNames)));

  return buildCartesianCombinations(cleanOptions).filter(combo => !existingKeys.has(getVariantKey(combo, optionNames)));
}

export function syncOptionsWithVariants(options = [], variants = []) {
  const cleanOptions = sanitizeOptions(options);
  if (!cleanOptions.length || !variants.length) {
    return cleanOptions;
  }

  return cleanOptions
    .map(option => {
      const existingOrder = option.values;
      const usedValues = [...new Set(variants.map(variant => trimString(variant.optionValues?.[option.name])).filter(Boolean))];
      const orderedValues = existingOrder.filter(value => usedValues.includes(value));
      const appendedValues = usedValues.filter(value => !orderedValues.includes(value));

      return {
        ...option,
        values: [...orderedValues, ...appendedValues],
      };
    })
    .filter(option => option.values.length);
}

export function deriveInventorySummary(variants = []) {
  const normalizedVariants = variants.length
    ? variants
    : [
        {
          inventoryQty: 0,
          isActive: true,
        },
      ];

  const totalAvailable = normalizedVariants.reduce((sum, variant) => {
    if (variant?.isActive === false) {
      return sum;
    }

    return sum + normalizeInventory(variant.inventoryQty);
  }, 0);
  const stockStatus =
    totalAvailable === 0
      ? 'out-of-stock'
      : totalAvailable <= LOW_STOCK_THRESHOLD
        ? 'low-stock'
        : 'available';

  return {
    totalAvailable,
    tracked: true,
    outOfStock: totalAvailable === 0,
    lowStock: totalAvailable > 0 && totalAvailable <= LOW_STOCK_THRESHOLD,
    stockStatus,
    lowStockThreshold: LOW_STOCK_THRESHOLD,
  };
}

export function getProductTotalInventory(product) {
  if (!product) {
    return 0;
  }

  if (Number.isFinite(product.inventorySummary?.totalAvailable)) {
    return product.inventorySummary.totalAvailable;
  }

  return deriveInventorySummary(product.variants || []).totalAvailable;
}

export function getProductStockStatus(product, threshold = LOW_STOCK_THRESHOLD) {
  const totalInventory = getProductTotalInventory(product);

  if (totalInventory <= 0) {
    return 'out-of-stock';
  }

  if (totalInventory <= threshold) {
    return 'low-stock';
  }

  return 'available';
}

export function getProductStockLabel(product, threshold = LOW_STOCK_THRESHOLD) {
  const stockStatus = getProductStockStatus(product, threshold);

  if (stockStatus === 'out-of-stock') {
    return 'Out of Stock';
  }

  if (stockStatus === 'low-stock') {
    return 'Low Stock';
  }

  return 'Available';
}

export function getProductFeaturedImage(product) {
  if (!product) {
    return null;
  }

  return (
    product.featuredImage ||
    product.images?.find(image => image.id === product.featuredImageId) ||
    product.images?.[0] ||
    null
  );
}

export function getProductVariantCount(product) {
  return product?.variants?.length || 0;
}

export function deriveProduct(product) {
  const mediaState = ensureMediaState(product.images, product.featuredImageId);
  const options = sanitizeOptions(product.options);
  const variants = (product.variants?.length ? product.variants : generateVariantsFromOptions(product, options, [])).map(variant => ({
    ...variant,
    price: normalizeMoney(variant.price),
    compareAtPrice: normalizeMoney(variant.compareAtPrice),
    inventoryQty: normalizeInventory(variant.inventoryQty),
    continueSellingWhenOutOfStock: Boolean(variant.continueSellingWhenOutOfStock),
    weight: normalizeVariantWeight(variant.weight),
    weightUnit: normalizeVariantWeightUnit(variant.weightUnit),
    title: trimString(variant.title) || buildVariantTitle(variant.optionValues, options.map(option => option.name)),
  }));
  const inventorySummary = deriveInventorySummary(variants);
  const status = VALID_STATUSES.includes(product.status) ? product.status : 'draft';
  const publishedAt = parseIsoDate(product.publishedAt)?.toISOString() || null;
  const presaleStartsAt = parseIsoDate(product.presaleStartsAt)?.toISOString() || null;
  const presaleEndsAt = parseIsoDate(product.presaleEndsAt)?.toISOString() || null;
  const availableForPurchaseAt = parseIsoDate(product.availableForPurchaseAt)?.toISOString() || null;

  return {
    ...product,
    title: trimString(product.title) || 'Untitled product',
    description: String(product.description ?? ''),
    vendor: trimString(product.vendor),
    category: trimString(product.category),
    status,
    publishedAt,
    salesMode: normalizeSalesMode(product.salesMode),
    presaleStartsAt,
    presaleEndsAt,
    availableForPurchaseAt,
    expectedDeliveryText: String(product.expectedDeliveryText ?? ''),
    availabilityMessage: String(product.availabilityMessage ?? ''),
    storefrontBadgeText: String(product.storefrontBadgeText ?? ''),
    fulfillmentType: normalizeFulfillmentType(product.fulfillmentType),
    tags: normalizeTagList(product.tags),
    sku: trimString(product.sku),
    basePrice: normalizeMoney(product.basePrice),
    compareAtPrice: normalizeMoney(product.compareAtPrice),
    featuredImageId: mediaState.featuredImageId,
    featuredImage: getProductFeaturedImage({
      images: mediaState.images,
      featuredImageId: mediaState.featuredImageId,
    }),
    images: mediaState.images,
    options,
    variants,
    inventorySummary,
    createdAt: product.createdAt || new Date().toISOString(),
    updatedAt: product.updatedAt || new Date().toISOString(),
  };
}

export function deriveProducts(products = []) {
  return products.map(deriveProduct);
}

function createSeedProduct({
  title,
  description,
  status,
  category,
  tags,
  vendor,
  sku,
  basePrice,
  compareAtPrice,
  imageIndexes,
  options,
  variants,
}) {
  const images = imageIndexes.map((imageIndex, index) =>
    createImage(SAMPLE_IMAGE_LIBRARY[imageIndex % SAMPLE_IMAGE_LIBRARY.length], `${title} image ${index + 1}`, index)
  );

  return deriveProduct({
    id: createId('product'),
    title,
    description,
    status,
    category,
    tags,
    vendor,
    sku,
    basePrice,
    compareAtPrice,
    featuredImageId: images[0]?.id || null,
    images,
    options,
    variants: variants.map(variant => ({
      id: createId('variant'),
      title: variant.title,
      optionValues: variant.optionValues,
      sku: variant.sku,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      inventoryQty: variant.inventoryQty,
      continueSellingWhenOutOfStock: Boolean(variant.continueSellingWhenOutOfStock),
      imageId: images[variant.imageIndex ?? 0]?.id || null,
      isDefault: variant.isDefault ?? false,
      isActive: variant.isActive ?? true,
    })),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
}

export function createSeedProducts() {
  return [
    createSeedProduct({
      title: 'Lumix Pro Wireless',
      description:
        'The Lumix Pro Wireless headphones define the next generation of acoustic engineering, pairing immersive ANC, long-form battery life, and studio-tuned detail for creators on the move.',
      status: 'active',
      category: 'Electronics',
      tags: ['Audio', 'Flagship', 'Wireless'],
      vendor: 'Lumix Labs',
      sku: 'LX-2024-W1',
      basePrice: '299.00',
      compareAtPrice: '349.00',
      imageIndexes: [0, 4, 1],
      options: [
        { id: createId('option'), name: 'Color', values: ['Midnight', 'Silver'] },
      ],
      variants: [
        { optionValues: { Color: 'Midnight' }, sku: 'LX-2024-W1-MID', price: '299.00', compareAtPrice: '349.00', inventoryQty: 84, imageIndex: 0 },
        { optionValues: { Color: 'Silver' }, sku: 'LX-2024-W1-SLV', price: '299.00', compareAtPrice: '349.00', inventoryQty: 40, imageIndex: 1 },
      ],
    }),
    createSeedProduct({
      title: 'Aether Chrono S1',
      description:
        'Aether Chrono S1 blends a sculpted stainless-steel case, adaptive wellness tracking, and a high-brightness edge display into a premium wearable built for all-day performance. The lineup balances luxury watch cues with modern smartwatch utility, making it a strong flagship option for customers who want recovery insights, training metrics, and polished everyday styling in one device.',
      status: 'draft',
      category: 'Wearables',
      tags: ['Watch', 'Health', 'Beta'],
      vendor: 'Aether Dynamics',
      sku: 'AE-2024-C1',
      basePrice: '329.00',
      compareAtPrice: '399.00',
      imageIndexes: [1, 4],
      options: [
        { id: createId('option'), name: 'Band', values: ['Sport', 'Leather'] },
        { id: createId('option'), name: 'Case', values: ['Black'] },
      ],
      variants: [
        { optionValues: { Band: 'Sport', Case: 'Black' }, sku: 'AE-2024-C1-SPT', price: '329.00', compareAtPrice: '399.00', inventoryQty: 14, imageIndex: 0 },
        { optionValues: { Band: 'Leather', Case: 'Black' }, sku: 'AE-2024-C1-LTH', price: '349.00', compareAtPrice: '419.00', inventoryQty: 8, imageIndex: 1 },
      ],
    }),
    createSeedProduct({
      title: 'Velox Run Trainer',
      description:
        'Velox Run Trainer is engineered for distance-focused runners with responsive midsole cushioning, targeted heel support, and breathable mesh zones that hold up through high-mileage training blocks. The product is positioned as an everyday performance shoe with enough grip, comfort, and visual energy to support both seasonal drops and repeat-purchase core inventory.',
      status: 'active',
      category: 'Footwear',
      tags: ['Running', 'Performance', 'Seasonal'],
      vendor: 'Velox Athletics',
      sku: 'VX-2024-R3',
      basePrice: '120.00',
      compareAtPrice: '145.00',
      imageIndexes: [2, 4, 0],
      options: [
        { id: createId('option'), name: 'Size', values: ['9', '10', '11'] },
        { id: createId('option'), name: 'Color', values: ['Flare Red'] },
      ],
      variants: [
        { optionValues: { Size: '9', Color: 'Flare Red' }, sku: 'VX-2024-R3-9', price: '120.00', compareAtPrice: '145.00', inventoryQty: 14, imageIndex: 0 },
        { optionValues: { Size: '10', Color: 'Flare Red' }, sku: 'VX-2024-R3-10', price: '120.00', compareAtPrice: '145.00', inventoryQty: 12, imageIndex: 1 },
        { optionValues: { Size: '11', Color: 'Flare Red' }, sku: 'VX-2024-R3-11', price: '120.00', compareAtPrice: '145.00', inventoryQty: 12, imageIndex: 2 },
      ],
    }),
    createSeedProduct({
      title: 'Titan X-Phone',
      description:
        'Titan X-Phone pairs flagship silicon, pro-grade imaging, and a precision-machined titanium frame into a premium handset designed for customers who care about speed, camera quality, and finish. Its storage tiers and finish variants support a high-consideration product strategy where merchandising, availability, and configuration-specific inventory all matter at launch.',
      status: 'archived',
      category: 'Mobile',
      tags: ['Mobile', 'Premium', 'Sold Out'],
      vendor: 'Titan Mobile',
      sku: 'TX-2024-X7',
      basePrice: '999.00',
      compareAtPrice: '1099.00',
      imageIndexes: [3, 4, 1],
      options: [
        { id: createId('option'), name: 'Storage', values: ['128GB', '256GB'] },
        { id: createId('option'), name: 'Finish', values: ['Obsidian', 'Steel'] },
      ],
      variants: [
        { optionValues: { Storage: '128GB', Finish: 'Obsidian' }, sku: 'TX-2024-X7-128-OBS', price: '999.00', compareAtPrice: '1099.00', inventoryQty: 0, imageIndex: 0 },
        { optionValues: { Storage: '128GB', Finish: 'Steel' }, sku: 'TX-2024-X7-128-STL', price: '999.00', compareAtPrice: '1099.00', inventoryQty: 0, imageIndex: 1 },
        { optionValues: { Storage: '256GB', Finish: 'Obsidian' }, sku: 'TX-2024-X7-256-OBS', price: '1099.00', compareAtPrice: '1199.00', inventoryQty: 0, imageIndex: 2 },
        { optionValues: { Storage: '256GB', Finish: 'Steel' }, sku: 'TX-2024-X7-256-STL', price: '1099.00', compareAtPrice: '1199.00', inventoryQty: 0, imageIndex: 1 },
      ],
    }),
  ];
}

export function createEmptyProductDraft() {
  const nextDraft = {
    id: createId('product'),
    title: 'Untitled Product',
    description: '',
    status: 'draft',
    publishedAt: null,
    salesMode: 'standard',
    presaleStartsAt: null,
    presaleEndsAt: null,
    availableForPurchaseAt: null,
    expectedDeliveryText: '',
    availabilityMessage: '',
    storefrontBadgeText: '',
    fulfillmentType: 'physical',
    category: '',
    tags: [],
    vendor: '',
    sku: '',
    basePrice: '0.00',
    compareAtPrice: '0.00',
    featuredImageId: null,
    images: [],
    options: [],
    variants: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  nextDraft.variants = [createDefaultVariant(nextDraft)];

  return deriveProduct(nextDraft);
}

export function cloneProduct(product) {
  return cloneValue(product);
}

export function getNextSampleImage(currentSrc = '') {
  const currentIndex = SAMPLE_IMAGE_LIBRARY.indexOf(currentSrc);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % SAMPLE_IMAGE_LIBRARY.length;
  return SAMPLE_IMAGE_LIBRARY[nextIndex];
}

export function reorderImage(images, imageId, direction) {
  const imageIndex = images.findIndex(image => image.id === imageId);
  if (imageIndex === -1) {
    return images;
  }

  const nextIndex = direction === 'left' ? imageIndex - 1 : imageIndex + 1;
  if (nextIndex < 0 || nextIndex >= images.length) {
    return images;
  }

  const nextImages = [...images];
  [nextImages[imageIndex], nextImages[nextIndex]] = [nextImages[nextIndex], nextImages[imageIndex]];

  return nextImages.map((image, index) => ({
    ...image,
    sortOrder: index,
  }));
}

export function productMatchesFilter(product, activeFilter) {
  if (activeFilter === 'all') {
    return true;
  }

  const stockStatus = getProductStockStatus(product);

  if (activeFilter === 'available') {
    return stockStatus === 'available';
  }

  if (activeFilter === 'low-stock') {
    return stockStatus === 'low-stock';
  }

  if (activeFilter === 'active') {
    return product.status === 'active';
  }

  if (activeFilter === 'draft') {
    return product.status === 'draft';
  }

  if (activeFilter === 'out-of-stock') {
    return stockStatus === 'out-of-stock';
  }

  return true;
}

export function productMatchesSearch(product, query) {
  const searchTerm = trimString(query).toLowerCase();
  if (!searchTerm) {
    return true;
  }

  const haystack = [
    product.title,
    product.category,
    product.vendor,
    product.sku,
    ...product.tags,
    ...product.variants.map(variant => variant.sku),
  ]
    .join(' ')
    .toLowerCase();

  return haystack.includes(searchTerm);
}

export function validateProduct(product) {
  const errors = {};
  const title = trimString(product.title);
  const basePriceInput = parseNumericInput(product.basePrice);
  const compareAtPriceInput = parseNumericInput(product.compareAtPrice);
  const rawOptions = product.options || [];
  const variants = product.variants?.length ? product.variants : [createDefaultVariant(product)];

  if (!title) {
    errors.title = 'Title is required.';
  }

  if (!basePriceInput.isNumeric) {
    errors.basePrice = 'Price must be numeric.';
  } else if (basePriceInput.value < 0) {
    errors.basePrice = 'Base price must be 0 or higher.';
  }

  if (trimString(product.compareAtPrice) && !compareAtPriceInput.isNumeric) {
    errors.compareAtPrice = 'Compare-at price must be numeric.';
  } else if (compareAtPriceInput.value < 0) {
    errors.compareAtPrice = 'Compare-at price must be 0 or higher.';
  } else if (
    basePriceInput.isNumeric &&
    compareAtPriceInput.value > 0 &&
    compareAtPriceInput.value < basePriceInput.value
  ) {
    errors.compareAtPrice = 'Compare-at price should be greater than or equal to price.';
  }

  const optionNameSet = new Set();
  rawOptions.forEach(option => {
    const optionName = normalizeOptionGroupName(option.name);
    const optionValues = (option.values || []).map(trimString).filter(Boolean);
    const lowerName = optionName.toLowerCase();

    if (!optionName && optionValues.length) {
      errors.options = 'Each option with values needs a name.';
      return;
    }

    if (!optionName && !optionValues.length) {
      return;
    }

    if (optionNameSet.has(lowerName)) {
      errors.options = 'Option names must be unique.';
    }
    optionNameSet.add(lowerName);

    if (new Set(optionValues).size !== optionValues.length) {
      errors.options = 'Option values must be unique within each option group.';
    }

    if (!optionValues.length) {
      errors.options = 'Each option needs at least one value.';
    }
  });

  const options = sanitizeOptions(rawOptions);
  const variantKeys = new Set();
  const optionNames = options.map(option => option.name);
  const variantRowErrors = {};
  variants.forEach(variant => {
    const rowErrors = {};
    const variantPriceInput = parseNumericInput(variant.price);
    const variantCompareAtInput = parseNumericInput(variant.compareAtPrice);
    const inventoryInput = parseIntegerInput(variant.inventoryQty);
    const titleParts = String(variant.title || '')
      .split('/')
      .map(part => trimString(part))
      .filter(Boolean);
    const resolvedOptionValues = optionNames.reduce((values, optionName, index) => {
      const explicitValue = trimString(variant.optionValues?.[optionName]);
      const fallbackValue = trimString(titleParts[index]);
      values[optionName] = explicitValue || fallbackValue;
      return values;
    }, {});

    if (!variantPriceInput.isNumeric) {
      rowErrors.price = 'Enter a numeric price.';
    } else if (variantPriceInput.value < 0) {
      rowErrors.price = 'Price must be 0 or higher.';
    }

    if (trimString(variant.compareAtPrice) && !variantCompareAtInput.isNumeric) {
      rowErrors.compareAtPrice = 'Enter a numeric compare-at price.';
    } else if (variantCompareAtInput.value < 0) {
      rowErrors.compareAtPrice = 'Compare-at price must be 0 or higher.';
    } else if (
      variantPriceInput.isNumeric &&
      variantCompareAtInput.value > 0 &&
      variantCompareAtInput.value < variantPriceInput.value
    ) {
      rowErrors.compareAtPrice = 'Compare-at must be at least the price.';
    }

    if (!inventoryInput.isNumeric) {
      rowErrors.inventoryQty = 'Inventory must be numeric.';
    } else if (inventoryInput.value < 0) {
      rowErrors.inventoryQty = 'Inventory cannot be negative.';
    }

    if (optionNames.length) {
      const missingOptionName = optionNames.find((name) => !trimString(resolvedOptionValues[name]));
      if (missingOptionName) {
        rowErrors.optionValues = `Variant is missing a ${missingOptionName} value.`;
      }
    }

    const variantKey = getVariantKey(resolvedOptionValues, optionNames);
    if (variantKeys.has(variantKey)) {
      rowErrors.optionValues = rowErrors.optionValues || 'Duplicate variant option combination.';
    }
    variantKeys.add(variantKey);

    if (Object.keys(rowErrors).length) {
      variantRowErrors[variant.id] = rowErrors;
    }
  });

  if (Object.keys(variantRowErrors).length) {
    errors.variants = errors.variants || 'Fix the highlighted variant fields before saving.';
    errors.variantRows = variantRowErrors;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

export function prepareProductForSave(product) {
  const baseProduct = cloneProduct(product);
  const options = sanitizeOptions(baseProduct.options);
  const mediaState = ensureMediaState(baseProduct.images, baseProduct.featuredImageId);
  const shouldGenerateFromOptions = options.length > 0;
  const baseVariants = shouldGenerateFromOptions
    ? generateVariantsFromOptions(
        {
          ...baseProduct,
          featuredImageId: mediaState.featuredImageId,
        },
        options,
        baseProduct.variants || []
      )
    : (baseProduct.variants?.length ? baseProduct.variants : [createDefaultVariant(baseProduct)]);
  const variants = baseVariants.map(variant => ({
    ...variant,
    id: variant.id || createId('variant'),
    title: trimString(variant.title) || buildVariantTitle(variant.optionValues, options.map(option => option.name)),
    sku: trimString(variant.sku),
    price: normalizeMoney(variant.price ?? baseProduct.basePrice),
    compareAtPrice: normalizeMoney(variant.compareAtPrice ?? baseProduct.compareAtPrice),
    inventoryQty: normalizeInventory(variant.inventoryQty),
    continueSellingWhenOutOfStock: Boolean(variant.continueSellingWhenOutOfStock),
    weight: normalizeVariantWeight(variant.weight),
    weightUnit: normalizeVariantWeightUnit(variant.weightUnit),
    imageId: mediaState.images.find(image => image.id === variant.imageId)?.id || mediaState.featuredImageId,
    isDefault: !options.length,
    isActive: variant.isActive ?? true,
  }));
  const syncedVariants =
    !options.length && variants.length
      ? variants.map((variant, index) => ({
          ...variant,
          title: 'Default',
          sku: trimString(baseProduct.sku) || trimString(variant.sku),
          price: normalizeMoney(baseProduct.basePrice),
          compareAtPrice: normalizeMoney(baseProduct.compareAtPrice),
          continueSellingWhenOutOfStock: Boolean(variant.continueSellingWhenOutOfStock),
          imageId:
            mediaState.images.find(image => image.id === variant.imageId)?.id ||
            mediaState.featuredImageId,
          isDefault: index === 0,
        }))
      : variants;

  return deriveProduct({
    ...baseProduct,
    title: trimString(baseProduct.title) || 'Untitled product',
    description: String(baseProduct.description ?? ''),
    status: VALID_STATUSES.includes(baseProduct.status) ? baseProduct.status : 'draft',
    publishedAt: parseIsoDate(baseProduct.publishedAt)?.toISOString() || null,
    salesMode: normalizeSalesMode(baseProduct.salesMode),
    presaleStartsAt: parseIsoDate(baseProduct.presaleStartsAt)?.toISOString() || null,
    presaleEndsAt: parseIsoDate(baseProduct.presaleEndsAt)?.toISOString() || null,
    availableForPurchaseAt: parseIsoDate(baseProduct.availableForPurchaseAt)?.toISOString() || null,
    expectedDeliveryText: String(baseProduct.expectedDeliveryText ?? ''),
    availabilityMessage: String(baseProduct.availabilityMessage ?? ''),
    storefrontBadgeText: String(baseProduct.storefrontBadgeText ?? ''),
    fulfillmentType: normalizeFulfillmentType(baseProduct.fulfillmentType),
    category: trimString(baseProduct.category),
    tags: normalizeTagList(baseProduct.tags),
    vendor: trimString(baseProduct.vendor),
    sku: trimString(baseProduct.sku),
    basePrice: normalizeMoney(baseProduct.basePrice),
    compareAtPrice: normalizeMoney(baseProduct.compareAtPrice),
    options,
    featuredImageId: mediaState.featuredImageId,
    images: mediaState.images,
    variants: syncedVariants,
    updatedAt: new Date().toISOString(),
  });
}

// ── Transform lightweight API product summary → UI catalog shape ─────────────
// Used by ProductContext on mount. The list endpoint returns summaries:
// no options, only featured media, minimal variant fields (id/price/sku/inventory).
// Editor always fetches full detail via GET /api/products/:id before opening.
export function transformApiProductSummary(product) {
  const images = (product.media || []).map(m => ({
    id: m.id,
    assetId: m.assetId || m.asset?.id || null,
    src: m.asset?.url || '',
    alt: m.asset?.altText || m.asset?.url || '',
    isFeatured: m.isFeatured,
    sortOrder: m.position ?? 0,
  }));
  const featuredImageId = images[0]?.id || null;

  // Summary variants carry: id, price (dollars), compareAtPrice, sku, inventory.
  // No title or optionValues — safe defaults for catalog display and SKU dedup.
  const variants = (product.variants || []).map((v, i) => ({
    id: v.id,
    title: 'Default',
    sku: v.sku || '',
    price: String(v.price ?? '0.00'),
    compareAtPrice: v.compareAtPrice != null ? String(v.compareAtPrice) : '',
    inventoryQty: v.inventory ?? 0,
    continueSellingWhenOutOfStock: Boolean(v.continueSellingWhenOutOfStock),
    weight: null,
    weightUnit: 'kg',
    position: i,
    optionValues: {},
    imageId: featuredImageId,
    isDefault: true,
    isActive: true,
  }));

  const firstVariant = variants[0];
  const inventorySummary = deriveInventorySummary(variants);

  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    status: (product.status || 'DRAFT').toLowerCase(),
    publishedAt: product.publishedAt || null,
    salesMode: String(product.salesMode || 'STANDARD').toLowerCase(),
    presaleStartsAt: product.presaleStartsAt || null,
    presaleEndsAt: product.presaleEndsAt || null,
    availableForPurchaseAt: product.availableForPurchaseAt || null,
    expectedDeliveryText: product.expectedDeliveryText || '',
    availabilityMessage: product.availabilityMessage || '',
    storefrontBadgeText: product.storefrontBadgeText || '',
    fulfillmentType: String(product.fulfillmentType || 'PHYSICAL').toLowerCase(),
    description: product.description || '',
    vendor: product.vendor || '',
    productType: product.productType || '',
    category: product.productType || '',
    tags: product.tags || [],
    options: [],
    variants,
    images,
    featuredImageId,
    basePrice: firstVariant?.price || '0.00',
    compareAtPrice: firstVariant?.compareAtPrice || '',
    sku: firstVariant?.sku || '',
    inventorySummary,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  };
}
