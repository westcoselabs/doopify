"use client";

import { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import {
  buildVariantTitle,
  cloneProduct,
  createDefaultVariantForProduct,
  createEmptyProductDraft,
  createEntityId,
  createImageAsset,
  deriveInventorySummary,
  ensureMediaState,
  formatMoney,
  generateVariantsFromOptions,
  getComputedProductStateMeta,
  getMissingVariantCombos,
  getNextSampleImage,
  prepareProductForSave,
  reorderImage,
  sanitizeOptions,
  syncOptionsWithVariants,
  transformApiProductSummary,
  validateProduct,
} from '../lib/productUtils';
import {
  buildProductMediaPayload,
  GENERIC_MEDIA_UPLOAD_FAILURE_MESSAGE,
  MAX_MEDIA_UPLOAD_VERCEL_FORMAT_HINT,
  fetchPersistedProductDetail,
  getOversizedMediaFiles,
  parseMediaUploadResponse,
  resolveMediaUploadFailureMessage,
  resolveMediaUploadStrategy,
  syncPersistedMediaOnProduct,
} from './product-media-upload.helpers';

const ProductContext = createContext(null);

const initialState = {
  products: [],
  selectedProductId: null,
  catalog: {
    searchQuery: '',
    activeFilter: 'all',
    hasLoaded: false,
  },
  editor: {
    isOpen: false,
    mode: 'new',
    draftProduct: null,
    baselineProduct: null,
    previewImageId: null,
    autosaveEnabled: false,
    isSaving: false,
    mediaUploadsInFlight: 0,
    validationErrors: {},
  },
  confirmDialog: null,
  toasts: [],
};

// â”€â”€ Transform API product â†’ UI shape â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function transformApiProduct(product) {
  const images = (product.media || []).map(m => ({
    id: m.id,
    assetId: m.assetId || m.asset?.id || null,
    src: m.asset?.url || '',
    alt: m.asset?.altText || m.asset?.url || '',
    isFeatured: m.isFeatured,
    sortOrder: m.position ?? 0,
  }));
  const featuredImageId = images.find(i => i.isFeatured)?.id || images[0]?.id || null;

  const options = (product.options || []).map(opt => ({
    id: opt.id,
    name: opt.name,
    position: opt.position ?? 0,
    values: (opt.values || []).map(v => v.value),
  }));

  const variants = (product.variants || []).map(v => ({
    id: v.id,
    title: v.title,
    sku: v.sku || '',
    price: String(v.price ?? '0.00'),
    compareAtPrice: v.compareAtPrice != null ? String(v.compareAtPrice) : '',
    inventoryQty: v.inventory ?? 0,
    continueSellingWhenOutOfStock: Boolean(v.continueSellingWhenOutOfStock),
    weight: v.weight ?? null,
    weightUnit: v.weightUnit ?? 'kg',
    position: v.position ?? 0,
    optionValues: options.reduce((values, option, index) => {
      const parts = String(v.title || '')
        .split('/')
        .map(part => part.trim())
        .filter(Boolean);
      const inferredValue = parts[index] || (option.values.length === 1 ? option.values[0] : '');
      if (inferredValue) {
        values[option.name] = inferredValue;
      }
      return values;
    }, {}),
    imageId: featuredImageId,
    isDefault: options.length === 0,
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
    options,
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

function getEditorLocationState() {
  if (typeof window === 'undefined') {
    return { productId: null, isNew: false };
  }

  const params = new URLSearchParams(window.location.search);
  return {
    productId: params.get('product'),
    isNew: params.get('new') === '1',
  };
}

function syncEditorLocation({ productId = null, isNew = false } = {}, history = 'replace') {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);

  if (productId) {
    url.searchParams.set('product', productId);
    url.searchParams.delete('new');
  } else if (isNew) {
    url.searchParams.set('new', '1');
    url.searchParams.delete('product');
  } else {
    url.searchParams.delete('product');
    url.searchParams.delete('new');
  }

  const nextUrl = `${url.pathname}${url.search}${url.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextUrl === currentUrl) {
    return;
  }

  if (history === 'push') {
    window.history.pushState(null, '', nextUrl);
    return;
  }

  if (history === 'replace') {
    window.history.replaceState(null, '', nextUrl);
  }
}

function normalizeSkuValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

function normalizeVariantWeightForPayload(value) {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return undefined;
  }

  return numeric;
}

function mergeValidationErrors(...errorSets) {
  const mergedErrors = {};

  errorSets.forEach(errorSet => {
    if (!errorSet) {
      return;
    }

    Object.entries(errorSet).forEach(([key, value]) => {
      if (!value) {
        return;
      }

      if (key === 'variantRows') {
        mergedErrors.variantRows = mergedErrors.variantRows || {};

        Object.entries(value).forEach(([variantId, rowErrors]) => {
          mergedErrors.variantRows[variantId] = {
            ...(mergedErrors.variantRows[variantId] || {}),
            ...rowErrors,
          };
        });

        return;
      }

      mergedErrors[key] = value;
    });
  });

  if (mergedErrors.variantRows && !Object.keys(mergedErrors.variantRows).length) {
    delete mergedErrors.variantRows;
  }

  return mergedErrors;
}

function collectSkuValidationErrors(draftProduct, products) {
  if (!draftProduct) {
    return {};
  }

  const errors = {};
  const externalSkus = new Set();

  products
    .filter(product => product.id !== draftProduct.id)
    .forEach(product => {
      const productSku = normalizeSkuValue(product.sku);
      if (productSku) {
        externalSkus.add(productSku);
      }

      product.variants.forEach(variant => {
        const variantSku = normalizeSkuValue(variant.sku);
        if (variantSku) {
          externalSkus.add(variantSku);
        }
      });
    });

  const seenVariantSkus = new Map();
  const variantRows = {};

  draftProduct.variants.forEach(variant => {
    const rowErrors = {};
    const variantSku = normalizeSkuValue(variant.sku);

    if (!variantSku) {
      return;
    }

    if (externalSkus.has(variantSku)) {
      rowErrors.sku = 'SKU is already used by another product or variant.';
    } else if (seenVariantSkus.has(variantSku)) {
      rowErrors.sku = 'Variant SKUs must be unique within this product.';
    } else {
      seenVariantSkus.set(variantSku, variant.id);
    }

    if (Object.keys(rowErrors).length) {
      variantRows[variant.id] = rowErrors;
    }
  });

  if (Object.keys(variantRows).length) {
    errors.variants = errors.variants || 'Fix the highlighted variant fields before saving.';
    errors.variantRows = variantRows;
  }

  return errors;
}

function getComparableProduct(product) {
  if (!product) {
    return null;
  }

  return {
    id: product.id,
    title: product.title,
    description: product.description,
    status: product.status,
    publishedAt: product.publishedAt,
    salesMode: product.salesMode,
    presaleStartsAt: product.presaleStartsAt,
    presaleEndsAt: product.presaleEndsAt,
    availableForPurchaseAt: product.availableForPurchaseAt,
    expectedDeliveryText: product.expectedDeliveryText,
    availabilityMessage: product.availabilityMessage,
    storefrontBadgeText: product.storefrontBadgeText,
    fulfillmentType: product.fulfillmentType,
    category: product.category,
    tags: product.tags,
    vendor: product.vendor,
    sku: product.sku,
    basePrice: product.basePrice,
    compareAtPrice: product.compareAtPrice,
    featuredImageId: product.featuredImageId,
    images: (product.images || []).map(image => ({
      id: image.id,
      assetId: image.assetId || null,
      src: image.src,
      alt: image.alt,
      sortOrder: image.sortOrder,
    })),
    options: (product.options || []).map(option => ({
      id: option.id,
      name: option.name,
      values: option.values,
    })),
    variants: (product.variants || []).map(variant => ({
      id: variant.id,
      title: variant.title,
      optionValues: variant.optionValues,
      sku: variant.sku,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      inventoryQty: variant.inventoryQty,
      continueSellingWhenOutOfStock: variant.continueSellingWhenOutOfStock,
      weight: variant.weight,
      weightUnit: variant.weightUnit,
      imageId: variant.imageId,
      isDefault: variant.isDefault,
      isActive: variant.isActive,
    })),
  };
}

function makeEditorState(product, mode = 'existing') {
  const resolvedProduct = product ? prepareProductForSave(product) : null;

  return {
    isOpen: Boolean(resolvedProduct),
    mode,
    draftProduct: resolvedProduct ? cloneProduct(resolvedProduct) : null,
    baselineProduct: resolvedProduct ? cloneProduct(resolvedProduct) : null,
    previewImageId: resolvedProduct?.featuredImageId || resolvedProduct?.images?.[0]?.id || null,
    autosaveEnabled: false,
    isSaving: false,
    mediaUploadsInFlight: 0,
    validationErrors: {},
  };
}

function productReducer(state, action) {
  switch (action.type) {
    case 'LOAD_PRODUCTS': {
      const hasSelectedProduct = action.products.some(product => product.id === state.selectedProductId);
      return {
        ...state,
        products: action.products,
        catalog: {
          ...state.catalog,
          hasLoaded: true,
        },
        selectedProductId: hasSelectedProduct ? state.selectedProductId : null,
      };
    }
    case 'SET_CATALOG_LOADED':
      return {
        ...state,
        catalog: {
          ...state.catalog,
          hasLoaded: true,
        },
      };
    case 'SET_SEARCH_QUERY':
      return {
        ...state,
        catalog: {
          ...state.catalog,
          searchQuery: action.value,
        },
      };
    case 'SET_ACTIVE_FILTER':
      return {
        ...state,
        catalog: {
          ...state.catalog,
          activeFilter: action.value,
        },
      };
    case 'OPEN_EDITOR':
      return {
        ...state,
        selectedProductId: action.selectedProductId,
        editor: {
          ...makeEditorState(action.product, action.mode),
          autosaveEnabled: state.editor.autosaveEnabled,
        },
      };
    case 'SET_DRAFT_STATE':
      return {
        ...state,
        editor: {
          ...state.editor,
          draftProduct: action.draftProduct,
          previewImageId: action.previewImageId,
          validationErrors: action.clearValidation ? {} : state.editor.validationErrors,
        },
      };
    case 'RESET_DRAFT':
      return {
        ...state,
        editor: {
          ...state.editor,
          draftProduct: state.editor.baselineProduct ? cloneProduct(state.editor.baselineProduct) : null,
          previewImageId:
            state.editor.baselineProduct?.featuredImageId ||
            state.editor.baselineProduct?.images?.[0]?.id ||
            null,
          validationErrors: {},
        },
      };
    case 'SET_AUTOSAVE':
      return {
        ...state,
        editor: {
          ...state.editor,
          autosaveEnabled: action.value,
        },
      };
    case 'SET_SAVING':
      return {
        ...state,
        editor: {
          ...state.editor,
          isSaving: action.value,
        },
      };
    case 'ADJUST_MEDIA_UPLOADS':
      return {
        ...state,
        editor: {
          ...state.editor,
          mediaUploadsInFlight: Math.max(0, (state.editor.mediaUploadsInFlight || 0) + action.delta),
        },
      };
    case 'SET_VALIDATION_ERRORS':
      return {
        ...state,
        editor: {
          ...state.editor,
          validationErrors: action.errors,
        },
      };
    case 'COMMIT_PRODUCT': {
      const isExisting = state.products.some(product => product.id === action.product.id);
      const nextProducts = isExisting
        ? state.products.map(product => (product.id === action.product.id ? action.product : product))
        : [action.product, ...state.products];

      return {
        ...state,
        products: nextProducts,
        selectedProductId: action.product.id,
        editor: {
          ...makeEditorState(action.product, 'existing'),
          autosaveEnabled: state.editor.autosaveEnabled,
        },
      };
    }
    case 'SYNC_PERSISTED_PRODUCT_MEDIA': {
      const nextProducts = state.products.map(product =>
        product.id === action.productId
          ? syncPersistedMediaOnProduct(product, action.images, action.featuredImageId)
          : product
      );

      const draftMatches = state.editor.draftProduct?.id === action.productId;
      const baselineMatches = state.editor.baselineProduct?.id === action.productId;
      const nextDraft = draftMatches
        ? syncPersistedMediaOnProduct(state.editor.draftProduct, action.images, action.featuredImageId)
        : state.editor.draftProduct;
      const nextBaseline = baselineMatches
        ? syncPersistedMediaOnProduct(state.editor.baselineProduct, action.images, action.featuredImageId)
        : state.editor.baselineProduct;

      const nextPreviewImageId = draftMatches
        ? nextDraft?.images?.find(image => image.id === state.editor.previewImageId)?.id ||
          nextDraft?.featuredImageId ||
          nextDraft?.images?.[0]?.id ||
          null
        : state.editor.previewImageId;

      return {
        ...state,
        products: nextProducts,
        editor: {
          ...state.editor,
          draftProduct: nextDraft,
          baselineProduct: nextBaseline,
          previewImageId: nextPreviewImageId,
        },
      };
    }
    case 'DELETE_PRODUCT': {
      // Close the editor immediately. The fallback product will be opened
      // via an explicit async fetch in confirmDialogAction to avoid opening
      // a stale catalog summary in the editor.
      const nextProducts = state.products.filter(product => product.id !== action.productId);
      return {
        ...state,
        products: nextProducts,
        selectedProductId: null,
        editor: {
          ...state.editor,
          isOpen: false,
          mode: 'new',
          draftProduct: null,
          baselineProduct: null,
          previewImageId: null,
          validationErrors: {},
          isSaving: false,
          mediaUploadsInFlight: 0,
        },
      };
    }
    case 'CLOSE_EDITOR':
      return {
        ...state,
        editor: {
          ...state.editor,
          isOpen: false,
          draftProduct: null,
          baselineProduct: null,
          previewImageId: null,
          validationErrors: {},
          isSaving: false,
          mediaUploadsInFlight: 0,
        },
      };
    case 'SET_CONFIRM_DIALOG':
      return {
        ...state,
        confirmDialog: action.dialog,
      };
    case 'CLEAR_CONFIRM_DIALOG':
      return {
        ...state,
        confirmDialog: null,
      };
    case 'ADD_TOAST':
      return {
        ...state,
        toasts: [...state.toasts, action.toast],
      };
    case 'REMOVE_TOAST':
      return {
        ...state,
        toasts: state.toasts.filter(toast => toast.id !== action.toastId),
      };
    default:
      return state;
  }
}

export function ProductProvider({ children }) {
  const [state, dispatch] = useReducer(productReducer, initialState);

  // â”€â”€ Fetch products from API on mount â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Load lightweight summaries for the catalog list, then fetch full detail
  // for the editor if a product id is present in the URL.
  useEffect(() => {
    let isActive = true;

    async function loadProducts() {
      try {
        const r = await fetch('/api/products?pageSize=100');
        const json = await r.json();
        if (!isActive) return;
        if (!json.success) {
          dispatch({ type: 'SET_CATALOG_LOADED' });
          return;
        }

        const products = (json.data.products || []).map(transformApiProductSummary);
        dispatch({ type: 'LOAD_PRODUCTS', products });

        const locationState = getEditorLocationState();
        if (locationState.isNew) {
          const draftProduct = createEmptyProductDraft();
          dispatch({
            type: 'OPEN_EDITOR',
            product: draftProduct,
            mode: 'new',
            selectedProductId: draftProduct.id,
          });
          syncEditorLocation({ isNew: true }, 'replace');
          return;
        }

        if (locationState.productId) {
          // Fetch full detail before opening the editor â€” summaries lack options/all media/all variants.
          try {
            const detailRes = await fetch(`/api/products/${locationState.productId}`);
            const detailJson = await detailRes.json();
            if (!isActive) return;
            if (detailJson.success && detailJson.data) {
              const fullProduct = transformApiProduct(detailJson.data);
              const preparedProduct = prepareProductForSave(fullProduct);
              dispatch({
                type: 'OPEN_EDITOR',
                product: preparedProduct,
                mode: 'existing',
                selectedProductId: preparedProduct.id,
              });
              syncEditorLocation({ productId: preparedProduct.id }, 'replace');
              return;
            }
          } catch (e) {
            console.error('[ProductContext] failed to restore product from URL', e);
          }
        }

        syncEditorLocation({}, 'replace');
      } catch (err) {
        console.error('[ProductContext] fetch failed', err);
        if (isActive) {
          dispatch({ type: 'SET_CATALOG_LOADED' });
        }
      }
    }

    loadProducts();

    return () => {
      isActive = false;
    };
  }, []);

  const selectedProduct = useMemo(
    () => state.products.find(product => product.id === state.selectedProductId) || null,
    [state.products, state.selectedProductId]
  );

  const draftInventorySummary = useMemo(
    () => deriveInventorySummary(state.editor.draftProduct?.variants || []),
    [state.editor.draftProduct]
  );

  const draftFeaturedImage = useMemo(() => {
    if (!state.editor.draftProduct) {
      return null;
    }

    return (
      state.editor.draftProduct.images.find(image => image.id === state.editor.draftProduct.featuredImageId) ||
      state.editor.draftProduct.images[0] ||
      null
    );
  }, [state.editor.draftProduct]);

  const hasUnsavedChanges = useMemo(() => {
    const comparableDraft = JSON.stringify(getComparableProduct(state.editor.draftProduct));
    const comparableBaseline = JSON.stringify(getComparableProduct(state.editor.baselineProduct));
    return comparableDraft !== comparableBaseline;
  }, [state.editor.baselineProduct, state.editor.draftProduct]);

  const draftValidation = useMemo(() => {
    if (!state.editor.draftProduct) {
      return {
        isValid: true,
        errors: {},
      };
    }

    const baseValidation = validateProduct(state.editor.draftProduct);
    const skuValidationErrors = collectSkuValidationErrors(state.editor.draftProduct, state.products);
    const errors = mergeValidationErrors(baseValidation.errors, skuValidationErrors);

    return {
      isValid: Object.keys(errors).length === 0,
      errors,
    };
  }, [state.editor.draftProduct, state.products]);

  const pushToast = (message, tone = 'success') => {
    const toastId = createEntityId('toast');

    dispatch({
      type: 'ADD_TOAST',
      toast: {
        id: toastId,
        message,
        tone,
      },
    });

    setTimeout(() => {
      dispatch({
        type: 'REMOVE_TOAST',
        toastId,
      });
    }, 3200);
  };

  // Fetches full product detail from the API before opening the editor so that
  // the editor always has options, all media, and all variants â€” not a summary.
  const openExistingProduct = async (productId) => {
    try {
      const res = await fetch(`/api/products/${productId}`);
      const json = await res.json();
      if (!json.success || !json.data) return false;

      const fullProduct = transformApiProduct(json.data);
      const preparedProduct = prepareProductForSave(fullProduct);

      dispatch({
        type: 'OPEN_EDITOR',
        product: preparedProduct,
        mode: 'existing',
        selectedProductId: preparedProduct.id,
      });
      return true;
    } catch (e) {
      console.error('[ProductContext] failed to load product detail', e);
      return false;
    }
  };

  const refreshPersistedProductMedia = async productId => {
    if (!productId) {
      return false;
    }

    try {
      const refreshed = await fetchPersistedProductDetail({ productId });
      if (!refreshed.ok || !refreshed.data) {
        return false;
      }

      const refreshedProduct = transformApiProduct(refreshed.data);
      const mediaState = ensureMediaState(refreshedProduct.images, refreshedProduct.featuredImageId);
      dispatch({
        type: 'SYNC_PERSISTED_PRODUCT_MEDIA',
        productId,
        images: mediaState.images,
        featuredImageId: mediaState.featuredImageId,
      });
      return true;
    } catch (error) {
      console.error('[ProductContext] failed to refresh persisted product media', error);
      return false;
    }
  };

  const openNewProduct = () => {
    const draftProduct = createEmptyProductDraft();

    dispatch({
      type: 'OPEN_EDITOR',
      product: draftProduct,
      mode: 'new',
      selectedProductId: draftProduct.id,
    });

    return draftProduct;
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const handlePopState = () => {
      const locationState = getEditorLocationState();

      if (locationState.isNew) {
        openNewProduct();
        return;
      }

      if (locationState.productId) {
        openExistingProduct(locationState.productId).then(opened => {
          if (!opened) dispatch({ type: 'CLOSE_EDITOR' });
        });
        return;
      }

      dispatch({ type: 'CLOSE_EDITOR' });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [state.products]);

  const setDraftState = (draftProduct, previewImageId, clearValidation = false) => {
    dispatch({
      type: 'SET_DRAFT_STATE',
      draftProduct,
      previewImageId,
      clearValidation,
    });
  };

  const updateDraftProduct = updater => {
    const currentDraft = state.editor.draftProduct;
    if (!currentDraft) {
      return;
    }

    const nextDraft = updater(cloneProduct(currentDraft));
    if (!nextDraft) {
      return;
    }

    const nextPreviewImageId =
      nextDraft.images?.find(image => image.id === state.editor.previewImageId)?.id ||
      nextDraft.featuredImageId ||
      nextDraft.images?.[0]?.id ||
      null;

    setDraftState(nextDraft, nextPreviewImageId);
  };

  const saveDraft = async ({ silent = false } = {}) => {
    if (!state.editor.draftProduct || state.editor.isSaving) {
      return false;
    }
    if ((state.editor.mediaUploadsInFlight || 0) > 0) {
      if (!silent) {
        pushToast('Please wait for media uploads to finish before saving.', 'info');
      }
      return false;
    }

    const preparedProduct = prepareProductForSave(state.editor.draftProduct);
    const preparedValidation = validateProduct(preparedProduct);
    const skuValidationErrors = collectSkuValidationErrors(preparedProduct, state.products);
    const mergedPreparedErrors = mergeValidationErrors(preparedValidation.errors, skuValidationErrors);

    if (Object.keys(mergedPreparedErrors).length) {
      dispatch({
        type: 'SET_VALIDATION_ERRORS',
        errors: mergedPreparedErrors,
      });

      if (!silent) {
        pushToast('Fix the highlighted product fields before saving.', 'error');
      }
      return false;
    }

    dispatch({ type: 'SET_SAVING', value: true });

    try {
      const isNew = state.editor.mode === 'new';
      const url = isNew ? '/api/products' : `/api/products/${preparedProduct.id}`;
      const method = isNew ? 'POST' : 'PATCH';

      const body = {
        title: preparedProduct.title,
        handle: preparedProduct.handle,
        status: preparedProduct.status?.toUpperCase() || 'DRAFT',
        publishedAt: preparedProduct.publishedAt || null,
        salesMode: preparedProduct.salesMode?.toUpperCase() || 'STANDARD',
        presaleStartsAt: preparedProduct.presaleStartsAt || null,
        presaleEndsAt: preparedProduct.presaleEndsAt || null,
        availableForPurchaseAt: preparedProduct.availableForPurchaseAt || null,
        expectedDeliveryText: preparedProduct.expectedDeliveryText || '',
        availabilityMessage: preparedProduct.availabilityMessage || '',
        storefrontBadgeText: preparedProduct.storefrontBadgeText || '',
        fulfillmentType: preparedProduct.fulfillmentType?.toUpperCase() || 'PHYSICAL',
        description: preparedProduct.description,
        vendor: preparedProduct.vendor,
        productType: preparedProduct.category || preparedProduct.productType,
        tags: preparedProduct.tags,
        options: (preparedProduct.options || []).map((option, optionIndex) => ({
          name: option.name,
          position: option.position ?? optionIndex,
          values: (option.values || []).map((value, valueIndex) => ({
            value,
            position: valueIndex,
          })),
        })),
        media: buildProductMediaPayload(preparedProduct.images, preparedProduct.featuredImageId),
        variants: (preparedProduct.variants || []).map(v => ({
          id: v.id,
          title: v.title || 'Default Title',
          sku: v.sku || undefined,
          price: Number(v.price) || 0,
          compareAtPrice: v.compareAtPrice ? Number(v.compareAtPrice) : undefined,
          inventory: Number(v.inventoryQty) || 0,
          continueSellingWhenOutOfStock: Boolean(v.continueSellingWhenOutOfStock),
          weight: normalizeVariantWeightForPayload(v.weight),
          weightUnit: v.weightUnit || undefined,
          position: v.position,
        })),
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();
      if (!json.success) {
        pushToast(json.error || 'Save failed', 'error');
        dispatch({ type: 'SET_SAVING', value: false });
        return false;
      }

      // Use the server-returned product so IDs are real DB IDs
      const savedProduct = transformApiProduct(json.data);
      dispatch({ type: 'COMMIT_PRODUCT', product: savedProduct });
      syncEditorLocation({ productId: savedProduct.id }, 'replace');

      // Surface a warning toast when the server completed a partial save
      // (e.g., product saved as DRAFT but media/options attachment failed).
      if (json.warning && !silent) {
        pushToast(json.warning, 'warning');
        return true;
      }
    } catch (e) {
      console.error('[ProductContext] save failed', e);
      pushToast('Save failed â€” check your connection', 'error');
      dispatch({ type: 'SET_SAVING', value: false });
      return false;
    }

    if (!silent) {
      pushToast(`${preparedProduct.title} saved`, 'success');
    }

    return true;
  };

  const requestSelectProduct = async (productId) => {
    const opened = await openExistingProduct(productId);
    if (opened) {
      syncEditorLocation({ productId }, 'push');
    }
  };

  const requestCreateProduct = () => {
    openNewProduct();
    syncEditorLocation({ isNew: true }, 'push');
  };

  const requestDuplicateProduct = async (productId = null) => {
    const sourceId = productId || state.editor.draftProduct?.id || state.selectedProductId;
    if (!sourceId) {
      pushToast('Select a product before duplicating.', 'info');
      return null;
    }

    try {
      const response = await fetch(`/api/products/${sourceId}/duplicate`, {
        method: 'POST',
      });
      const json = await response.json();

      if (!json.success) {
        pushToast(json.error || 'Duplicate failed', 'error');
        return null;
      }

      const duplicatedProduct = transformApiProduct(json.data);
      dispatch({ type: 'COMMIT_PRODUCT', product: duplicatedProduct });
      syncEditorLocation({ productId: duplicatedProduct.id }, 'push');
      pushToast('Product duplicated as a new draft.', 'success');
      return duplicatedProduct;
    } catch (error) {
      console.error('[ProductContext] duplicate failed', error);
      pushToast('Duplicate failed', 'error');
      return null;
    }
  };

  const requestCloseEditor = () => {
    dispatch({ type: 'CLOSE_EDITOR' });
    syncEditorLocation({}, 'replace');
  };

  const cancelDraftChanges = () => {
    if (state.editor.mode === 'new') {
      dispatch({ type: 'CLOSE_EDITOR' });
      syncEditorLocation({}, 'replace');
      pushToast('New product draft discarded', 'info');
      return;
    }

    dispatch({ type: 'RESET_DRAFT' });
    pushToast('Changes reverted', 'info');
  };

  const setSearchQuery = value => {
    dispatch({ type: 'SET_SEARCH_QUERY', value });
  };

  const setActiveFilter = value => {
    dispatch({ type: 'SET_ACTIVE_FILTER', value });
  };

  const setAutosaveEnabled = value => {
    dispatch({ type: 'SET_AUTOSAVE', value });
    pushToast(value ? 'Autosave enabled' : 'Autosave disabled', 'info');
  };

  const setDraftField = (field, value) => {
    updateDraftProduct(draftProduct => {
      const nextDraft = {
        ...draftProduct,
        [field]: value,
      };

      const hasOnlyDefaultVariant =
        !draftProduct.options.length &&
        draftProduct.variants.length === 1 &&
        draftProduct.variants[0]?.isDefault;

      if (hasOnlyDefaultVariant && ['sku', 'basePrice', 'compareAtPrice'].includes(field)) {
        nextDraft.variants = draftProduct.variants.map(variant => ({
          ...variant,
          sku: field === 'sku' ? value : variant.sku,
          price: field === 'basePrice' ? value : variant.price,
          compareAtPrice: field === 'compareAtPrice' ? value : variant.compareAtPrice,
        }));
      }

      return nextDraft;
    });
  };

  const setDraftTagsFromText = value => {
    const tags = value
      .split(',')
      .map(tag => tag.trim())
      .filter(Boolean);

    setDraftField('tags', tags);
  };

  const selectPreviewImage = imageId => {
    dispatch({
      type: 'SET_DRAFT_STATE',
      draftProduct: state.editor.draftProduct,
      previewImageId: imageId,
      clearValidation: false,
    });
  };

  const addSampleImage = () => {
    updateDraftProduct(draftProduct => {
      const lastImage = draftProduct.images[draftProduct.images.length - 1];
      const nextImage = createImageAsset(
        getNextSampleImage(lastImage?.src),
        `${draftProduct.title || 'Product'} image ${draftProduct.images.length + 1}`,
        draftProduct.images.length
      );
      const mediaState = ensureMediaState(
        [...draftProduct.images, nextImage],
        draftProduct.featuredImageId || nextImage.id
      );

      pushToast('Sample image added', 'success');

      return {
        ...draftProduct,
        images: mediaState.images,
        featuredImageId: mediaState.featuredImageId,
      };
    });
  };

  const addImagesFromFiles = async (fileList, { attachToDraft = true } = {}) => {
    const files = Array.from(fileList || []);
    if (!files.length) return [];
    const oversizedFiles = getOversizedMediaFiles(files);
    if (oversizedFiles.length) {
      pushToast(MAX_MEDIA_UPLOAD_VERCEL_FORMAT_HINT, 'error');
      return [];
    }

    const uploadStrategy = resolveMediaUploadStrategy({
      editorMode: state.editor.mode,
      draftProductId: state.editor.draftProduct?.id || null,
      attachToDraft,
    });
    dispatch({ type: 'ADJUST_MEDIA_UPLOADS', delta: files.length });

    const optimisticImages = [];

    // Optimistic preview using blob URLs while upload is in flight.
    if (uploadStrategy.shouldAttachToDraft) {
      updateDraftProduct(draftProduct => {
        optimisticImages.push(
          ...files.map((file, index) =>
            createImageAsset(
              URL.createObjectURL(file),
              file.name || `${draftProduct.title || 'Product'} image ${draftProduct.images.length + index + 1}`,
              draftProduct.images.length + index
            )
          )
        );
        const mediaState = ensureMediaState(
          [...draftProduct.images, ...optimisticImages],
          draftProduct.featuredImageId || optimisticImages[0]?.id || null
        );
        return {
          ...draftProduct,
          images: mediaState.images,
          featuredImageId: mediaState.featuredImageId,
        };
      });
    }

    const uploadedAssets = [];
    let shouldRefreshPersistedMedia = false;

    for (const [fileIndex, file] of files.entries()) {
      const optimisticImage = optimisticImages[fileIndex];
      try {
        const form = new FormData();
        form.append('file', file);
        form.append('altText', file.name);
        if (uploadStrategy.shouldIncludeProductId && uploadStrategy.productId) {
          form.append('productId', uploadStrategy.productId);
        }

        const res = await fetch('/api/media/upload', { method: 'POST', body: form });
        const { json, isJson } = await parseMediaUploadResponse(res);

        if (res.ok && json?.success) {
          uploadedAssets.push(json.data);
          if (uploadStrategy.shouldAttachToDraft && optimisticImage?.id) {
            updateDraftProduct(draftProduct => {
              const nextImages = draftProduct.images.map(image =>
                image.id === optimisticImage.id
                  ? {
                      ...image,
                      assetId: json.data.id,
                      src: json.data.url,
                      alt: json.data.altText || image.alt,
                    }
                  : image
              );
              const mediaState = ensureMediaState(nextImages, draftProduct.featuredImageId || optimisticImage.id);

              return {
                ...draftProduct,
                images: mediaState.images,
                featuredImageId: mediaState.featuredImageId,
              };
            });
          }

          if (uploadStrategy.shouldIncludeProductId && uploadStrategy.productId && uploadStrategy.shouldAttachToDraft) {
            shouldRefreshPersistedMedia = true;
          }

          if (uploadStrategy.shouldIncludeProductId && Number(json.data?.linkedProducts || 0) < 1) {
            pushToast('Image uploaded, but could not attach automatically. Add it from Media Library.', 'warning');
          }
        } else {
          if (uploadStrategy.shouldAttachToDraft && optimisticImage?.id) {
            updateDraftProduct(draftProduct => {
              const nextImages = draftProduct.images.filter(image => image.id !== optimisticImage.id);
              const mediaState = ensureMediaState(
                nextImages,
                draftProduct.featuredImageId === optimisticImage.id ? null : draftProduct.featuredImageId
              );

              return {
                ...draftProduct,
                images: mediaState.images,
                featuredImageId: mediaState.featuredImageId,
              };
            });
          }
          pushToast(
            resolveMediaUploadFailureMessage({
              status: res.status,
              jsonError: json?.error || null,
              isJson,
            }),
            'error'
          );
        }
      } catch (e) {
        console.error('[addImagesFromFiles] upload error', e);
        if (uploadStrategy.shouldAttachToDraft && optimisticImage?.id) {
          updateDraftProduct(draftProduct => {
            const nextImages = draftProduct.images.filter(image => image.id !== optimisticImage.id);
            const mediaState = ensureMediaState(
              nextImages,
              draftProduct.featuredImageId === optimisticImage.id ? null : draftProduct.featuredImageId
            );

            return {
              ...draftProduct,
              images: mediaState.images,
              featuredImageId: mediaState.featuredImageId,
            };
          });
        }
        pushToast(GENERIC_MEDIA_UPLOAD_FAILURE_MESSAGE, 'error');
      } finally {
        dispatch({ type: 'ADJUST_MEDIA_UPLOADS', delta: -1 });
      }
    }

    if (shouldRefreshPersistedMedia && uploadStrategy.productId) {
      const refreshed = await refreshPersistedProductMedia(uploadStrategy.productId);
      if (!refreshed) {
        pushToast('Image uploaded, but gallery refresh failed. Reopen the product to confirm media state.', 'warning');
      }
    }

    if (uploadedAssets.length) {
      const successMessage = uploadStrategy.shouldAttachToDraft
        ? `${uploadedAssets.length} image${uploadedAssets.length > 1 ? 's' : ''} uploaded`
        : `${uploadedAssets.length} image${uploadedAssets.length > 1 ? 's' : ''} uploaded to media library`;
      pushToast(successMessage, 'success');
    }

    return uploadedAssets;
  };

  const addImagesFromLibrary = async mediaAssets => {
    const assets = Array.isArray(mediaAssets) ? mediaAssets : [mediaAssets];
    const normalizedAssets = assets.filter(asset => asset?.id && asset?.url);

    if (!normalizedAssets.length) {
      return 0;
    }

    let addedCount = 0;
    let nextPersistedMediaState = null;
    const draftProductId = state.editor.draftProduct?.id || null;
    const isPersistedProduct = state.editor.mode === 'existing' && Boolean(draftProductId);

    updateDraftProduct(draftProduct => {
      const existingAssetIds = new Set(draftProduct.images.map(image => image.assetId).filter(Boolean));
      const nextImages = [...draftProduct.images];

      normalizedAssets.forEach((asset, assetIndex) => {
        if (existingAssetIds.has(asset.id)) {
          return;
        }

        nextImages.push(
          createImageAsset(
            asset.url,
            asset.altText || asset.filename || `${draftProduct.title || 'Product'} image ${nextImages.length + 1}`,
            draftProduct.images.length + assetIndex,
            { assetId: asset.id }
          )
        );
        existingAssetIds.add(asset.id);
        addedCount += 1;
      });

      const mediaState = ensureMediaState(
        nextImages,
        draftProduct.featuredImageId || nextImages[0]?.id || null
      );
      nextPersistedMediaState = mediaState;

      return {
        ...draftProduct,
        images: mediaState.images,
        featuredImageId: mediaState.featuredImageId,
      };
    });

    if (addedCount) {
      if (isPersistedProduct && draftProductId && nextPersistedMediaState) {
        try {
          const response = await fetch(`/api/products/${draftProductId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              media: buildProductMediaPayload(
                nextPersistedMediaState.images,
                nextPersistedMediaState.featuredImageId
              ),
            }),
          });
          const json = await response.json().catch(() => null);
          if (!response.ok || !json?.success) {
            throw new Error(json?.error || 'Failed to update product media relations.');
          }

          await refreshPersistedProductMedia(draftProductId);
        } catch (error) {
          console.error('[ProductContext] failed to persist media library attachment', error);
          pushToast('Image added locally, but failed to persist product media. Save to retry sync.', 'warning');
          return addedCount;
        }
      } else if (state.editor.mode === 'new') {
        pushToast('Image staged in this new product draft. Save the product to persist media.', 'info');
      }

      pushToast(`${addedCount} image${addedCount > 1 ? 's' : ''} added from the media library`, 'success');
    } else {
      pushToast('Those images are already in the product gallery.', 'info');
    }

    return addedCount;
  };

  const replaceImageWithSample = imageId => {
    updateDraftProduct(draftProduct => ({
      ...draftProduct,
      images: draftProduct.images.map(image =>
        image.id === imageId
          ? {
              ...image,
              src: getNextSampleImage(image.src),
            }
          : image
      ),
    }));
  };

  const replaceImageWithFile = (imageId, file) => {
    if (!file) {
      return;
    }

    updateDraftProduct(draftProduct => ({
      ...draftProduct,
      images: draftProduct.images.map(image =>
        image.id === imageId
          ? {
              ...image,
              src: URL.createObjectURL(file),
              alt: file.name || image.alt,
            }
          : image
      ),
    }));
  };

  const setFeaturedImage = imageId => {
    updateDraftProduct(draftProduct => {
      const mediaState = ensureMediaState(draftProduct.images, imageId);
      return {
        ...draftProduct,
        images: mediaState.images,
        featuredImageId: mediaState.featuredImageId,
      };
    });
  };

  const moveImage = (imageId, direction) => {
    updateDraftProduct(draftProduct => {
      const nextImages = reorderImage(draftProduct.images, imageId, direction);
      const mediaState = ensureMediaState(nextImages, draftProduct.featuredImageId);
      return {
        ...draftProduct,
        images: mediaState.images,
        featuredImageId: mediaState.featuredImageId,
      };
    });
  };

  const removeImage = imageId => {
    updateDraftProduct(draftProduct => {
      const nextImages = draftProduct.images.filter(image => image.id !== imageId);
      const mediaState = ensureMediaState(
        nextImages,
        draftProduct.featuredImageId === imageId ? null : draftProduct.featuredImageId
      );
      const nextVariants = draftProduct.variants.map(variant => ({
        ...variant,
        imageId: variant.imageId === imageId ? mediaState.featuredImageId : variant.imageId,
      }));

      return {
        ...draftProduct,
        images: mediaState.images,
        featuredImageId: mediaState.featuredImageId,
        variants: nextVariants,
      };
    });
  };

  const addOptionGroup = () => {
    updateDraftProduct(draftProduct => ({
      ...draftProduct,
      options: [
        ...draftProduct.options,
        {
          id: createEntityId('option'),
          name: '',
          values: [],
        },
      ],
    }));
  };

  const removeOptionGroup = optionId => {
    updateDraftProduct(draftProduct => {
      const nextOptions = draftProduct.options.filter(option => option.id !== optionId);
      const cleanOptions = sanitizeOptions(nextOptions);
      const nextVariants = generateVariantsFromOptions(draftProduct, cleanOptions, draftProduct.variants);

      dispatch({
        type: 'SET_VALIDATION_ERRORS',
        errors: {},
      });

      return {
        ...draftProduct,
        options: nextOptions,
        variants: nextVariants,
      };
    });
  };

  const updateOptionName = (optionId, value) => {
    updateDraftProduct(draftProduct => {
      const normalizedName = value.trim();
      const duplicateOption = draftProduct.options.find(
        option => option.id !== optionId && option.name.trim().toLowerCase() === normalizedName.toLowerCase()
      );

      if (normalizedName && duplicateOption) {
        dispatch({
          type: 'SET_VALIDATION_ERRORS',
          errors: {
            ...state.editor.validationErrors,
            options: `You've already used the option name "${normalizedName}".`,
          },
        });
        return draftProduct;
      }

      const nextOptions = draftProduct.options.map(option =>
        option.id === optionId
          ? {
              ...option,
              name: value,
            }
          : option
      );
      const cleanOptions = sanitizeOptions(nextOptions);
      const nextVariants = generateVariantsFromOptions(draftProduct, cleanOptions, draftProduct.variants);

      dispatch({
        type: 'SET_VALIDATION_ERRORS',
        errors: {
          ...state.editor.validationErrors,
          options: undefined,
        },
      });

      return {
        ...draftProduct,
        options: nextOptions,
        variants: nextVariants,
      };
    });
  };

  const updateOptionValues = (optionId, valueText) => {
    updateDraftProduct(draftProduct => {
      const values = valueText
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);

      const nextOptions = draftProduct.options.map(option =>
        option.id === optionId
          ? {
              ...option,
              values,
            }
          : option
      );
      const cleanOptions = sanitizeOptions(nextOptions);
      const nextVariants = generateVariantsFromOptions(draftProduct, cleanOptions, draftProduct.variants);

      return {
        ...draftProduct,
        options: nextOptions,
        variants: nextVariants,
      };
    });
  };

  const addOptionValue = (optionId, value) => {
    const normalizedValue = String(value ?? '').trim();
    if (!normalizedValue) {
      return;
    }

    updateDraftProduct(draftProduct => {
      const nextOptions = draftProduct.options.map(option => {
        if (option.id !== optionId) {
          return option;
        }

        if (option.values.some(existingValue => existingValue.toLowerCase() === normalizedValue.toLowerCase())) {
          return option;
        }

        return {
          ...option,
          values: [...option.values, normalizedValue],
        };
      });

      const cleanOptions = sanitizeOptions(nextOptions);
      const nextVariants = generateVariantsFromOptions(draftProduct, cleanOptions, draftProduct.variants);

      return {
        ...draftProduct,
        options: nextOptions,
        variants: nextVariants,
      };
    });
  };

  const removeOptionValue = (optionId, value) => {
    updateDraftProduct(draftProduct => {
      const nextOptions = draftProduct.options.map(option =>
        option.id === optionId
          ? {
              ...option,
              values: option.values.filter(existingValue => existingValue !== value),
            }
          : option
      );

      const cleanOptions = sanitizeOptions(nextOptions);
      const nextVariants = generateVariantsFromOptions(draftProduct, cleanOptions, draftProduct.variants);

      return {
        ...draftProduct,
        options: nextOptions,
        variants: nextVariants,
      };
    });
  };

  const addVariant = () => {
    const draftProduct = state.editor.draftProduct;
    if (!draftProduct) {
      return;
    }

    if (!draftProduct.options.length) {
      updateDraftProduct(nextDraft => {
        const bootstrapOption = {
          id: createEntityId('option'),
          name: 'Option',
          values: ['Default', 'Variant 2'],
        };
        const nextOptions = [bootstrapOption];
        const cleanOptions = sanitizeOptions(nextOptions);
        const nextVariants = generateVariantsFromOptions(nextDraft, cleanOptions, nextDraft.variants);

        return {
          ...nextDraft,
          options: nextOptions,
          variants: nextVariants,
        };
      });
      pushToast('Variant option set created. Update option names and values as needed.', 'info');
      return;
    }

    const missingCombos = getMissingVariantCombos(draftProduct.options, draftProduct.variants);
    if (!missingCombos.length) {
      pushToast('All current option combinations already exist. Add a new option value to create another variant.', 'info');
      return;
    }

    updateDraftProduct(nextDraft => {
      const optionNames = sanitizeOptions(nextDraft.options).map(option => option.name);
      const combo = missingCombos[0];
      const nextVariant = {
        id: createEntityId('variant'),
        title: buildVariantTitle(combo, optionNames),
        optionValues: combo,
        sku: `${nextDraft.sku || 'SKU'}-${nextDraft.variants.length + 1}`,
        price: nextDraft.basePrice,
        compareAtPrice: nextDraft.compareAtPrice,
        inventoryQty: 0,
        continueSellingWhenOutOfStock: false,
        imageId: nextDraft.featuredImageId || null,
        isDefault: false,
        isActive: true,
      };

      return {
        ...nextDraft,
        variants: [...nextDraft.variants, nextVariant],
      };
    });
  };

  const updateVariantField = (variantId, field, value) => {
    updateDraftProduct(draftProduct => ({
      ...draftProduct,
      variants: draftProduct.variants.map(variant =>
        variant.id === variantId
          ? {
              ...variant,
              [field]: value,
            }
          : variant
      ),
    }));
  };

  const deleteVariant = variantId => {
    updateDraftProduct(draftProduct => {
      const nextVariants = draftProduct.variants.filter(variant => variant.id !== variantId);

      if (!nextVariants.length) {
        const fallbackVariant = createDefaultVariantForProduct({
          ...draftProduct,
          inventorySummary: {
            totalAvailable: 0,
          },
        });
        return {
          ...draftProduct,
          options: [],
          variants: [fallbackVariant],
        };
      }

      const nextOptions = syncOptionsWithVariants(draftProduct.options, nextVariants);

      return {
        ...draftProduct,
        options: nextOptions,
        variants: nextVariants,
      };
    });
  };

  const requestDeleteVariant = variantId => {
    const variant = state.editor.draftProduct?.variants.find(item => item.id === variantId);
    if (!variant) {
      return;
    }

    dispatch({
      type: 'SET_CONFIRM_DIALOG',
      dialog: {
        kind: 'delete-variant',
        variantId,
        title: 'Delete this variant?',
        description: `Remove ${variant.title} from the product. You can re-create it later from the option matrix if needed.`,
      },
    });
  };

  const requestDeleteProduct = () => {
    const product = state.editor.draftProduct || selectedProduct;
    if (!product) {
      return;
    }

    dispatch({
      type: 'SET_CONFIRM_DIALOG',
      dialog: {
        kind: 'delete-product',
        productId: product.id,
        title: state.editor.mode === 'new' ? 'Discard this new product?' : 'Delete this product?',
        description:
          state.editor.mode === 'new'
            ? 'This draft has not been saved yet. Discard it and close the drawer?'
            : `${product.title} will be removed from the catalog immediately.`,
      },
    });
  };

  const confirmDialogAction = async resolution => {
    const dialog = state.confirmDialog;
    if (!dialog) {
      return;
    }

    if (dialog.kind === 'delete-product' && resolution === 'confirm') {
      dispatch({ type: 'CLEAR_CONFIRM_DIALOG' });

      if (state.editor.mode === 'new') {
        dispatch({ type: 'CLOSE_EDITOR' });
        syncEditorLocation({}, 'replace');
        pushToast('New product draft discarded', 'info');
        return;
      }

      try {
        const res = await fetch(`/api/products/${dialog.productId}`, { method: 'DELETE' });
        const json = await res.json();

        if (!json.success) {
          pushToast(json.error || 'Delete failed', 'error');
          return;
        }

        const fallbackProduct = state.products.find(product => product.id !== dialog.productId) || null;
        dispatch({ type: 'DELETE_PRODUCT', productId: dialog.productId });
        pushToast('Product deleted', 'success');

        // Open the fallback product via a fresh API fetch â€” state.products contains
        // lightweight summaries, not full products safe to open in the editor.
        if (fallbackProduct) {
          await openExistingProduct(fallbackProduct.id);
          syncEditorLocation({ productId: fallbackProduct.id }, 'replace');
        } else {
          syncEditorLocation({}, 'replace');
        }
      } catch (e) {
        console.error('[ProductContext] delete failed', e);
        pushToast('Delete failed', 'error');
      }

      return;
    }

    if (dialog.kind === 'delete-variant' && resolution === 'confirm') {
      dispatch({ type: 'CLEAR_CONFIRM_DIALOG' });
      deleteVariant(dialog.variantId);
      return;
    }

    dispatch({ type: 'CLEAR_CONFIRM_DIALOG' });
  };

  const dismissConfirmDialog = () => {
    dispatch({ type: 'CLEAR_CONFIRM_DIALOG' });
  };

  const dismissToast = toastId => {
    dispatch({ type: 'REMOVE_TOAST', toastId });
  };

  const value = {
    products: state.products,
    selectedProductId: state.selectedProductId,
    selectedProduct,
    searchQuery: state.catalog.searchQuery,
    activeFilter: state.catalog.activeFilter,
    catalogLoaded: state.catalog.hasLoaded,
    editor: {
      ...state.editor,
      draftInventorySummary,
      draftFeaturedImage,
      hasUnsavedChanges,
      isUploadingMedia: (state.editor.mediaUploadsInFlight || 0) > 0,
      isDraftValid: draftValidation.isValid,
      validationErrors: draftValidation.errors,
      computedState: getComputedProductStateMeta(state.editor.draftProduct || {}),
    },
    confirmDialog: state.confirmDialog,
    toasts: state.toasts,
    formatMoney,
    actions: {
      setSearchQuery,
      setActiveFilter,
      requestSelectProduct,
      requestCreateProduct,
      requestDuplicateProduct,
      requestCloseEditor,
      cancelDraftChanges,
      saveDraft,
      setAutosaveEnabled,
      setDraftField,
      setDraftTagsFromText,
      addSampleImage,
      addImagesFromFiles,
      addImagesFromLibrary,
      replaceImageWithSample,
      replaceImageWithFile,
      selectPreviewImage,
      setFeaturedImage,
      moveImage,
      removeImage,
      addOptionGroup,
      removeOptionGroup,
      updateOptionName,
      updateOptionValues,
      addOptionValue,
      removeOptionValue,
      addVariant,
      updateVariantField,
      requestDeleteVariant,
      requestDeleteProduct,
      confirmDialogAction,
      dismissConfirmDialog,
      dismissToast,
      showToast: pushToast,
    },
  };

  return <ProductContext.Provider value={value}>{children}</ProductContext.Provider>;
}

export function useProductStore() {
  const context = useContext(ProductContext);
  if (!context) {
    throw new Error('useProductStore must be used within ProductProvider');
  }

  return context;
}


