"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
import AppShell from '../AppShell';
import { useDiscounts } from '../../context/DiscountsContext';
import AdminButton from '../admin/ui/AdminButton';
import AdminCard from '../admin/ui/AdminCard';
import AdminDrawer from '../admin/ui/AdminDrawer';
import AdminEmptyState from '../admin/ui/AdminEmptyState';
import AdminField from '../admin/ui/AdminField';
import AdminFormSection from '../admin/ui/AdminFormSection';
import AdminInput from '../admin/ui/AdminInput';
import AdminPage from '../admin/ui/AdminPage';
import AdminPageHeader from '../admin/ui/AdminPageHeader';
import AdminSelect from '../admin/ui/AdminSelect';
import AdminStatusChip from '../admin/ui/AdminStatusChip';
import AdminTable from '../admin/ui/AdminTable';
import AdminToolbar from '../admin/ui/AdminToolbar';
import {
  createPromotionCatalogState,
  SmartPromotionFormSections,
} from './AutomaticPromotionsWorkspace';
import styles from './DiscountsWorkspace.module.css';
import {
  buildPromotionPayloadFromDraft,
  canSubmitPromotionDraft,
  createPromotionDraft,
  extractPromotionValidationIssues,
  formatPromotionStatusLabel,
  formatPromotionTypeLabel,
  getPromotionStatusTone,
  normalizePromotionDraftForType,
} from './promotions-ui.helpers';

const LEGACY_DISCOUNT_METHODS = ['amount off products', 'amount off order', 'free shipping'];
const BROWSE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'discount-codes', label: 'Discount codes' },
  { id: 'automatic', label: 'Automatic' },
];
const CREATE_METHODS = {
  LEGACY: 'discount-code',
  SMART: 'automatic-offer',
};
const CREATE_STEPS = ['method', 'type', 'details'];
const METHOD_CHOICES = [
  {
    id: CREATE_METHODS.LEGACY,
    badge: 'Code',
    description: 'Customer enters a code at checkout.',
    bestFor: 'Best for: SUMMER20, VIP offers, free shipping.',
    title: 'Discount code',
  },
  {
    id: CREATE_METHODS.SMART,
    badge: 'Automatic',
    description: 'Applies automatically when cart rules are met.',
    bestFor: 'Best for: bundles, Buy X Get Y, free gifts.',
    title: 'Automatic offer',
  },
];
const OFFER_TYPE_DEFINITIONS = [
  {
    id: 'amount-off-products',
    badge: 'Code',
    description: 'Discount selected products or variants.',
    flow: 'legacy',
    legacyMethod: 'amount off products',
    title: 'Amount off products',
    typeKey: 'legacy_amount_off_products',
  },
  {
    id: 'amount-off-order',
    badge: 'Code',
    description: 'Discount the order subtotal.',
    flow: 'legacy',
    legacyMethod: 'amount off order',
    title: 'Amount off order',
    typeKey: 'legacy_amount_off_order',
  },
  {
    id: 'free-shipping',
    badge: 'Code',
    description: 'Remove shipping cost with a code.',
    flow: 'legacy',
    legacyMethod: 'free shipping',
    title: 'Free shipping',
    typeKey: 'legacy_free_shipping',
  },
  {
    id: 'product-group-discount',
    badge: 'Automatic',
    description: 'Discount selected products when bought together.',
    flow: 'smart',
    promotionType: 'PRODUCT_GROUP_DISCOUNT',
    title: 'Product group discount',
    typeKey: 'PRODUCT_GROUP_DISCOUNT',
  },
  {
    id: 'buy-x-get-y',
    badge: 'Automatic',
    description: 'Discount reward products when qualifiers are in cart.',
    flow: 'smart',
    promotionType: 'BUY_X_GET_Y',
    title: 'Buy X Get Y',
    typeKey: 'BUY_X_GET_Y',
  },
  {
    id: 'free-gift',
    badge: 'Automatic',
    description: 'Make selected reward products free.',
    flow: 'smart',
    promotionType: 'FREE_GIFT',
    title: 'Free gift',
    typeKey: 'FREE_GIFT',
  },
];
const AUTOMATIC_TYPE_NOTE =
  "V1 note: Buy X Get Y and Free Gift do not auto-add reward items. Reward items must already be in the customer's cart.";
const LEGACY_TYPE_BY_METHOD = {
  'amount off products': 'Amount off products',
  'amount off order': 'Amount off order',
  'free shipping': 'Free shipping',
};

function createDiscountDraft(type) {
  return {
    id: `draft_${Date.now()}`,
    title: '',
    code: '',
    type,
    method: 'amount off products',
    status: 'scheduled',
    combinesWith: [],
    startsAt: new Date().toISOString().slice(0, 16),
    endsAt: '',
    usageCount: 0,
    summary: '',
    customerEligibility: 'Everyone',
    salesChannel: 'All channels',
    valueType: 'percentage',
    value: '',
    minimumRequirementType: 'none',
    minimumRequirementValue: '',
    usageLimit: '',
    appliesTo: 'All products',
    updatedAt: '',
  };
}

function buildLegacyDiscountPreview(draft) {
  const title = draft.code?.trim() || draft.title?.trim() || 'this code';
  const valueText =
    draft.method === 'free shipping'
      ? 'free shipping'
      : draft.valueType === 'fixed'
        ? `$${draft.value || '0'} off`
        : `${draft.value || '0'}% off`;

  if (draft.method === 'amount off products') {
    return `Customers can enter ${title} at checkout to receive ${valueText} selected products.`;
  }

  if (draft.method === 'amount off order') {
    return `Customers can enter ${title} at checkout to receive ${valueText} the order subtotal.`;
  }

  return `Customers can enter ${title} at checkout to receive free shipping.`;
}

function deriveLegacyStatus(draft) {
  if (draft.endsAt && new Date(draft.endsAt).getTime() < Date.now()) return 'expired';
  if (draft.startsAt) {
    const startsAt = new Date(draft.startsAt).getTime();
    if (!Number.isNaN(startsAt) && startsAt > Date.now()) return 'scheduled';
  }
  return draft.status || 'active';
}

function formatLegacyTypeLabel(method) {
  return LEGACY_TYPE_BY_METHOD[method] || method;
}

function formatUpdatedDisplayLabel(value) {
  const fallbackLabel = '\u2014';
  if (!value) return fallbackLabel;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallbackLabel;
  return date.toLocaleDateString();
}

function formatUpdatedLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString();
}

function toLegacyTypeKey(method) {
  if (method === 'amount off products') return 'legacy_amount_off_products';
  if (method === 'amount off order') return 'legacy_amount_off_order';
  if (method === 'free shipping') return 'legacy_free_shipping';
  return `legacy_${String(method || '').replace(/\s+/g, '_')}`;
}

function toSmartDraftFromDetail(promotion) {
  return {
    id: promotion.id,
    name: String(promotion.name || ''),
    status: promotion.status || 'DRAFT',
    type: promotion.type || 'PRODUCT_GROUP_DISCOUNT',
    rewardType: promotion.rewardType || 'PERCENTAGE',
    value: String(promotion.value ?? ''),
    startsAt: promotion.startsAt ? new Date(new Date(promotion.startsAt).getTime() - new Date(promotion.startsAt).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '',
    endsAt: promotion.endsAt ? new Date(new Date(promotion.endsAt).getTime() - new Date(promotion.endsAt).getTimezoneOffset() * 60_000).toISOString().slice(0, 16) : '',
    usageLimit: promotion.usageLimit == null ? '' : String(promotion.usageLimit),
    priority: promotion.priority == null ? '100' : String(promotion.priority),
    qualifiers: (promotion.qualifiers || []).map((qualifier) => ({
      variantId: qualifier.variantId,
      productTitle: qualifier.productTitle,
      variantTitle: qualifier.variantTitle,
      sku: qualifier.sku || null,
      fulfillmentType: qualifier.fulfillmentType || 'PHYSICAL',
      quantity: Number(qualifier.requiredQuantity || 1),
    })),
    rewards: (promotion.rewards || []).map((reward) => ({
      variantId: reward.variantId,
      productTitle: reward.productTitle,
      variantTitle: reward.variantTitle,
      sku: reward.sku || null,
      fulfillmentType: reward.fulfillmentType || 'PHYSICAL',
      quantity: Number(reward.rewardQuantity || 1),
    })),
  };
}

function removePromotionSelection(setDraft, section, variantId) {
  setDraft((current) => ({
    ...current,
    [section]: current[section].filter((row) => row.variantId !== variantId),
  }));
}

function updatePromotionSelectionQuantity(setDraft, section, variantId, quantity) {
  const nextQuantity = Number.isFinite(quantity) ? Math.max(1, Math.round(quantity)) : 1;
  setDraft((current) => ({
    ...current,
    [section]: current[section].map((row) =>
      row.variantId === variantId
        ? {
            ...row,
            quantity: nextQuantity,
          }
        : row
    ),
  }));
}

function addPromotionVariantToSelection(setDraft, setCatalogState, section, product, variant) {
  if (product.fulfillmentType !== 'PHYSICAL') {
    setCatalogState((current) => ({
      ...current,
      error: 'Only physical variants are eligible for Smart Promotions in V1.',
    }));
    return;
  }

  setCatalogState((current) => ({ ...current, error: '' }));
  setDraft((current) => {
    const existing = current[section].find((row) => row.variantId === variant.id);
    if (existing) {
      return current;
    }

    return {
      ...current,
      [section]: current[section].concat({
        variantId: variant.id,
        productTitle: product.title,
        variantTitle: variant.title || 'Default',
        sku: variant.sku || null,
        fulfillmentType: product.fulfillmentType || 'PHYSICAL',
        quantity: 1,
      }),
    };
  });
}

function togglePromotionPendingVariant(setCatalogState, section, product, variant) {
  setCatalogState((current) => {
    const pendingRows = current.pendingSelections[section] || [];
    const exists = pendingRows.some((row) => row.variantId === variant.id);
    return {
      ...current,
      pendingSelections: {
        ...current.pendingSelections,
        [section]: exists
          ? pendingRows.filter((row) => row.variantId !== variant.id)
          : pendingRows.concat({
              productId: product.id,
              productTitle: product.title,
              variantId: variant.id,
              variantTitle: variant.title || 'Default',
              sku: variant.sku || null,
              fulfillmentType: product.fulfillmentType || 'PHYSICAL',
            }),
      },
    };
  });
}

function closePromotionCatalogPicker(setCatalogState) {
  setCatalogState((current) => ({
    ...current,
    openSection: null,
    pendingSelections: {
      ...current.pendingSelections,
      qualifiers: [],
      rewards: [],
    },
  }));
}

function openPromotionCatalogPicker(setCatalogState, searchCatalog, section) {
  setCatalogState((current) => ({
    ...current,
    openSection: section,
    error: '',
    pendingSelections: {
      ...current.pendingSelections,
      [section]: [],
    },
  }));
  void searchCatalog();
}

async function searchPromotionCatalog(catalogState, setCatalogState) {
  setCatalogState((current) => ({
    ...current,
    loading: true,
    error: '',
  }));
  try {
    const query = new URLSearchParams({
      page: '1',
      pageSize: '20',
      status: 'ACTIVE',
    });
    if (catalogState.query.trim()) {
      query.set('search', catalogState.query.trim());
    }

    const response = await fetch(`/api/products?${query.toString()}`);
    const payload = await response.json();
    if (!payload?.success) {
      setCatalogState((current) => ({
        ...current,
        rows: [],
        error: payload?.error || 'Failed to search product catalog.',
        loading: false,
      }));
      return;
    }

    const physicalProducts = (payload.data?.products || []).filter(
      (product) => (product.fulfillmentType || 'PHYSICAL') === 'PHYSICAL'
    );
    setCatalogState((current) => ({
      ...current,
      rows: physicalProducts,
      loading: false,
    }));
  } catch (error) {
    console.error('[DiscountsWorkspace] catalog search failed', error);
    setCatalogState((current) => ({
      ...current,
      rows: [],
      error: 'Failed to search product catalog.',
      loading: false,
    }));
  }
}

async function loadPromotionProductDetail(catalogState, setCatalogState, productId) {
  if (catalogState.productDetailsById[productId]) return;

  try {
    const response = await fetch(`/api/products/${productId}`);
    const payload = await response.json();
    if (!payload?.success) {
      setCatalogState((current) => ({
        ...current,
        error: payload?.error || 'Failed to load product variants.',
      }));
      return;
    }

    setCatalogState((current) => ({
      ...current,
      productDetailsById: {
        ...current.productDetailsById,
        [productId]: payload.data,
      },
    }));
  } catch (error) {
    console.error('[DiscountsWorkspace] failed to load product detail', error);
    setCatalogState((current) => ({
      ...current,
      error: 'Failed to load product variants.',
    }));
  }
}

export default function DiscountsWorkspace() {
  const { discounts, addDiscount, updateDiscount } = useDiscounts();
  const [browseFilter, setBrowseFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [builderMode, setBuilderMode] = useState(null);
  const [draftDiscount, setDraftDiscount] = useState(null);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [createStep, setCreateStep] = useState('method');
  const [selectedMethod, setSelectedMethod] = useState(null);
  const [selectedPromotionType, setSelectedPromotionType] = useState(null);
  const [smartDraft, setSmartDraft] = useState(() => createPromotionDraft());
  const [smartSaving, setSmartSaving] = useState(false);
  const [smartValidationIssues, setSmartValidationIssues] = useState([]);
  const [smartErrorMessage, setSmartErrorMessage] = useState('');
  const [smartCatalogState, setSmartCatalogState] = useState(() => createPromotionCatalogState());
  const [smartPromotions, setSmartPromotions] = useState([]);
  const [smartPromotionsLoading, setSmartPromotionsLoading] = useState(true);
  const [smartPromotionsError, setSmartPromotionsError] = useState('');
  const [smartEditOpen, setSmartEditOpen] = useState(false);
  const [smartEditDraft, setSmartEditDraft] = useState(() => createPromotionDraft());
  const [smartEditSaving, setSmartEditSaving] = useState(false);
  const [smartEditValidationIssues, setSmartEditValidationIssues] = useState([]);
  const [smartEditErrorMessage, setSmartEditErrorMessage] = useState('');
  const [smartEditCatalogState, setSmartEditCatalogState] = useState(() => createPromotionCatalogState());

  const loadSmartPromotions = useCallback(async () => {
    setSmartPromotionsLoading(true);
    setSmartPromotionsError('');
    try {
      const query = new URLSearchParams({
        page: '1',
        pageSize: '50',
      });
      const response = await fetch(`/api/promotions?${query.toString()}`);
      const payload = await response.json();
      if (!payload?.success) {
        setSmartPromotions([]);
        setSmartPromotionsError(payload?.error || 'Failed to load promotions.');
        return;
      }
      setSmartPromotions(payload.data?.promotions || []);
    } catch (error) {
      console.error('[DiscountsWorkspace] failed to load smart promotions', error);
      setSmartPromotions([]);
      setSmartPromotionsError('Failed to load promotions.');
    } finally {
      setSmartPromotionsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSmartPromotions();
  }, [loadSmartPromotions]);

  const selectedOfferDefinition = OFFER_TYPE_DEFINITIONS.find((offer) => offer.id === selectedPromotionType) || null;
  const isLegacyCreate = selectedOfferDefinition?.flow === 'legacy';
  const isSmartCreate = selectedOfferDefinition?.flow === 'smart';
  const canSubmitSmartPromotion = useMemo(() => canSubmitPromotionDraft(smartDraft), [smartDraft]);
  const canSubmitSmartEdit = useMemo(() => canSubmitPromotionDraft(smartEditDraft), [smartEditDraft]);

  const normalizedLegacyRows = useMemo(() => discounts.map((discount) => ({
    id: `discount-${discount.id}`,
    source: 'discount-code',
    sourceId: discount.id,
    name: discount.title,
    method: 'Code',
    typeLabel: formatLegacyTypeLabel(discount.method),
    typeKey: toLegacyTypeKey(discount.method),
    status: discount.status,
    statusLabel: formatPromotionStatusLabel(discount.status),
    usageLabel: `${discount.usageCount || 0} / ${discount.usageLimit || 'No cap'}`,
    updatedLabel: formatUpdatedDisplayLabel(discount.updatedAt),
    summary: discount.summary || '',
    raw: discount,
  })), [discounts]);

  const normalizedSmartRows = useMemo(() => smartPromotions.map((promotion) => ({
    id: `promotion-${promotion.id}`,
    source: 'smart-promotion',
    sourceId: promotion.id,
    name: promotion.name,
    method: 'Automatic',
    typeLabel: formatPromotionTypeLabel(promotion.type),
    typeKey: promotion.type,
    status: String(promotion.status || '').toLowerCase(),
    statusLabel: formatPromotionStatusLabel(promotion.status),
    usageLabel: `${promotion.usageCount || 0} / ${promotion.usageLimit == null ? 'No cap' : promotion.usageLimit}`,
    updatedLabel: formatUpdatedDisplayLabel(promotion.updatedAt),
    summary: formatPromotionTypeLabel(promotion.type),
    raw: promotion,
  })), [smartPromotions]);

  const unifiedRows = useMemo(() => {
    const combined = normalizedLegacyRows.concat(normalizedSmartRows);
    return combined.filter((row) => {
      const segmentMatch =
        browseFilter === 'all' ||
        (browseFilter === 'discount-codes' && row.source === 'discount-code') ||
        (browseFilter === 'automatic' && row.source === 'smart-promotion');
      const methodMatch = methodFilter === 'all' || row.method.toLowerCase() === methodFilter;
      const typeMatch = typeFilter === 'all' || row.typeKey === typeFilter;
      const statusMatch = statusFilter === 'all' || row.status === statusFilter;
      const searchNeedle = searchQuery.trim().toLowerCase();
      const searchMatch = !searchNeedle || [row.name, row.method, row.typeLabel, row.summary].join(' ').toLowerCase().includes(searchNeedle);
      return segmentMatch && methodMatch && typeMatch && statusMatch && searchMatch;
    });
  }, [browseFilter, methodFilter, normalizedLegacyRows, normalizedSmartRows, searchQuery, statusFilter, typeFilter]);

  const statusOptions = useMemo(() => {
    const options = [
      { value: 'all', label: 'All statuses' },
      { value: 'active', label: 'Active' },
      { value: 'scheduled', label: 'Scheduled' },
      { value: 'expired', label: 'Expired' },
      { value: 'draft', label: 'Draft' },
      { value: 'disabled', label: 'Disabled' },
    ];
    return options;
  }, []);

  const methodOptions = [
    { value: 'all', label: 'All methods' },
    { value: 'code', label: 'Code' },
    { value: 'automatic', label: 'Automatic' },
  ];

  const typeOptions = useMemo(() => [
    { value: 'all', label: 'All types' },
    ...OFFER_TYPE_DEFINITIONS.map((offer) => ({
      value: offer.typeKey,
      label: offer.title,
    })),
  ], []);

  const valueTypeOptions = [
    { value: 'percentage', label: 'Percentage' },
    { value: 'fixed', label: 'Fixed amount' },
  ];
  const requirementTypeOptions = [
    { value: 'none', label: 'None' },
    { value: 'subtotal', label: 'Minimum purchase amount' },
    { value: 'quantity', label: 'Minimum quantity of items' },
  ];

  const isUnifiedListLoading = smartPromotionsLoading;
  const unifiedListError = smartPromotionsError || '';
  const emptyStateContent = (() => {
    if (browseFilter === 'discount-codes') {
      return {
        title: 'No discount codes yet.',
        description: 'Create a code customers can enter at checkout.',
      };
    }
    if (browseFilter === 'automatic') {
      return {
        title: 'No automatic offers yet.',
        description: 'Create product group discounts, Buy X Get Y offers, or free gift promotions.',
      };
    }
    return {
      title: 'No promotions yet.',
      description: 'Create a discount code or automatic offer to start.',
    };
  })();

  function resetCreateFlow() {
    setCreateDrawerOpen(false);
    setCreateStep('method');
    setSelectedMethod(null);
    setSelectedPromotionType(null);
    setDraftDiscount(null);
    setSmartDraft(createPromotionDraft());
    setSmartSaving(false);
    setSmartValidationIssues([]);
    setSmartErrorMessage('');
    setSmartCatalogState(createPromotionCatalogState());
  }

  function openCreateFlow() {
    setCreateDrawerOpen(true);
    setCreateStep('method');
    setSelectedMethod(null);
    setSelectedPromotionType(null);
    setDraftDiscount(null);
    setSmartDraft(createPromotionDraft());
    setSmartSaving(false);
    setSmartValidationIssues([]);
    setSmartErrorMessage('');
    setSmartCatalogState(createPromotionCatalogState());
  }

  function openLegacyEditor(discount) {
    setBuilderMode(discount.type);
    setDraftDiscount({ ...discount });
  }

  function resetSmartEditDrawer() {
    setSmartEditOpen(false);
    setSmartEditDraft(createPromotionDraft());
    setSmartEditSaving(false);
    setSmartEditValidationIssues([]);
    setSmartEditErrorMessage('');
    setSmartEditCatalogState(createPromotionCatalogState());
  }

  async function openSmartEditDrawer(promotionId) {
    setSmartEditErrorMessage('');
    setSmartEditValidationIssues([]);
    try {
      const response = await fetch(`/api/promotions/${promotionId}`);
      const payload = await response.json();
      if (!payload?.success) {
        setSmartEditErrorMessage(payload?.error || 'Failed to load promotion details.');
        return;
      }
      setSmartEditDraft(toSmartDraftFromDetail(payload.data?.promotion || {}));
      setSmartEditCatalogState(createPromotionCatalogState());
      setSmartEditOpen(true);
    } catch (error) {
      console.error('[DiscountsWorkspace] failed to load promotion detail', error);
      setSmartEditErrorMessage('Failed to load promotion details.');
    }
  }

  function onSelectMethod(methodId) {
    setSelectedMethod(methodId);
    setSelectedPromotionType(null);
    setDraftDiscount(null);
    setSmartDraft(createPromotionDraft());
    setSmartSaving(false);
    setSmartValidationIssues([]);
    setSmartErrorMessage('');
    setSmartCatalogState(createPromotionCatalogState());
  }

  function onSelectOfferType(offerId) {
    setSelectedPromotionType(offerId);
    const definition = OFFER_TYPE_DEFINITIONS.find((offer) => offer.id === offerId);
    if (!definition) return;

    if (definition.flow === 'legacy') {
      setDraftDiscount((current) => ({
        ...(current || createDiscountDraft('discount code')),
        type: 'discount code',
        method: definition.legacyMethod,
      }));
      return;
    }

    setSmartDraft(createPromotionDraft(definition.promotionType));
    setSmartValidationIssues([]);
    setSmartErrorMessage('');
    setSmartCatalogState(createPromotionCatalogState());
  }

  function saveDraftDiscount(nextDraft = draftDiscount) {
    if (!nextDraft?.title.trim()) return;

    const normalizedCode = nextDraft.code.trim() || nextDraft.title.trim().toUpperCase().replace(/\s+/g, '');
    const summary = nextDraft.summary.trim() || buildLegacyDiscountPreview({ ...nextDraft, code: normalizedCode });
    const nextDiscount = {
      ...nextDraft,
      title: nextDraft.title.trim(),
      code: normalizedCode,
      summary,
      status: deriveLegacyStatus(nextDraft),
    };

    const isExisting = discounts.some((discount) => discount.id === nextDiscount.id);
    if (isExisting) updateDiscount(nextDiscount.id, () => nextDiscount);
    else addDiscount(nextDiscount);

    setBuilderMode(null);
    setDraftDiscount(null);
    resetCreateFlow();
  }

  async function saveSmartPromotion() {
    setSmartSaving(true);
    setSmartValidationIssues([]);
    setSmartErrorMessage('');
    try {
      const payload = buildPromotionPayloadFromDraft(smartDraft);
      const response = await fetch('/api/promotions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json();

      if (!response.ok || !responsePayload?.success) {
        if (response.status === 422) {
          setSmartValidationIssues(extractPromotionValidationIssues(responsePayload?.details));
        }
        setSmartErrorMessage(responsePayload?.error || 'Failed to save promotion.');
        return;
      }

      await loadSmartPromotions();
      resetCreateFlow();
    } catch (error) {
      console.error('[DiscountsWorkspace] failed to save smart promotion', error);
      setSmartErrorMessage('Failed to save promotion.');
    } finally {
      setSmartSaving(false);
    }
  }

  async function saveSmartEditPromotion() {
    setSmartEditSaving(true);
    setSmartEditValidationIssues([]);
    setSmartEditErrorMessage('');
    try {
      const payload = buildPromotionPayloadFromDraft(smartEditDraft);
      const response = await fetch(`/api/promotions/${smartEditDraft.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const responsePayload = await response.json();

      if (!response.ok || !responsePayload?.success) {
        if (response.status === 422) {
          setSmartEditValidationIssues(extractPromotionValidationIssues(responsePayload?.details));
        }
        setSmartEditErrorMessage(responsePayload?.error || 'Failed to save promotion.');
        return;
      }

      await loadSmartPromotions();
      resetSmartEditDrawer();
    } catch (error) {
      console.error('[DiscountsWorkspace] failed to save promotion edit', error);
      setSmartEditErrorMessage('Failed to save promotion.');
    } finally {
      setSmartEditSaving(false);
    }
  }

  async function disableSmartPromotion(promotionId) {
    const confirmed = window.confirm(
      'Disable this promotion? It will stop applying at checkout, but past orders will keep their promotion history.'
    );
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/promotions/${promotionId}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!payload?.success) {
        setSmartPromotionsError(payload?.error || 'Failed to disable promotion.');
        return;
      }
      await loadSmartPromotions();
    } catch (error) {
      console.error('[DiscountsWorkspace] failed to disable promotion', error);
      setSmartPromotionsError('Failed to disable promotion.');
    }
  }

  const createDrawerActions = (() => {
    if (createStep === 'method') {
      return (
        <>
          <AdminButton onClick={resetCreateFlow} size="sm" variant="ghost">
            Cancel
          </AdminButton>
          <AdminButton
            disabled={!selectedMethod}
            onClick={() => setCreateStep('type')}
            size="sm"
            variant="primary"
          >
            Continue to type
          </AdminButton>
        </>
      );
    }

    if (createStep === 'type') {
      return (
        <>
          <AdminButton onClick={() => setCreateStep('method')} size="sm" variant="ghost">
            Back
          </AdminButton>
          <AdminButton disabled={!selectedOfferDefinition} onClick={() => setCreateStep('details')} size="sm" variant="primary">
            Continue to details
          </AdminButton>
        </>
      );
    }

    return (
      <>
        <AdminButton onClick={() => setCreateStep('type')} size="sm" variant="ghost">
          Back
        </AdminButton>
        <AdminButton
          disabled={isLegacyCreate ? !draftDiscount?.title.trim() : !canSubmitSmartPromotion}
          loading={smartSaving}
          onClick={() => {
            if (isLegacyCreate) saveDraftDiscount();
            else if (isSmartCreate) void saveSmartPromotion();
          }}
          size="sm"
          variant="primary"
        >
          Create promotion
        </AdminButton>
      </>
    );
  })();

  return (
    <AppShell>
      <AdminPage>
        <AdminPageHeader
          actions={(
            <AdminButton onClick={openCreateFlow} size="sm" variant="primary">Create promotion</AdminButton>
          )}
          description="Create and manage discount codes and automatic offers."
          eyebrow="Marketing"
          title="Promotions"
        />

        {unifiedListError ? <p className={styles.errorBanner}>{unifiedListError}</p> : null}

        <AdminCard className={styles.panel} variant="panel">
          <div className={styles.listHeader}>
            <div className={styles.segmentedControl} role="tablist" aria-label="Promotion filters">
              {BROWSE_FILTERS.map((filter) => (
                <button
                  className={`${styles.segmentedButton} ${browseFilter === filter.id ? styles.segmentedButtonActive : ''}`}
                  key={filter.id}
                  onClick={() => setBrowseFilter(filter.id)}
                  type="button"
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <AdminButton onClick={openCreateFlow} size="sm" variant="primary">
              Create promotion
            </AdminButton>
          </div>

          <AdminToolbar>
            <AdminInput onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search promotions..." type="search" value={searchQuery} />
            <AdminSelect onChange={setStatusFilter} options={statusOptions} value={statusFilter} />
            <AdminSelect onChange={setMethodFilter} options={methodOptions} value={methodFilter} />
            <AdminSelect onChange={setTypeFilter} options={typeOptions} value={typeFilter} />
          </AdminToolbar>

          {unifiedRows.length || isUnifiedListLoading ? (
            <AdminTable
              columns={[
                { key: 'name', header: 'Name', render: (row) => row.name },
                {
                  key: 'method',
                  header: 'Method',
                  render: (row) => (
                    <span className={`${styles.methodPill} ${row.method === 'Automatic' ? styles.methodPillAutomatic : styles.methodPillCode}`}>
                      {row.method}
                    </span>
                  ),
                },
                { key: 'type', header: 'Type', render: (row) => row.typeLabel },
                {
                  key: 'status',
                  header: 'Status',
                  render: (row) => (
                    <AdminStatusChip tone={getPromotionStatusTone(String(row.status).toUpperCase())}>
                      {row.statusLabel}
                    </AdminStatusChip>
                  ),
                },
                { key: 'usage', header: 'Usage', render: (row) => row.usageLabel },
                { key: 'updated', header: 'Updated', render: (row) => row.updatedLabel },
                {
                  key: 'actions',
                  header: 'Actions',
                  render: (row) => (
                    <div className={styles.rowActions}>
                      {row.source === 'discount-code' ? (
                        <AdminButton onClick={() => openLegacyEditor(row.raw)} size="sm" variant="secondary">
                          Edit
                        </AdminButton>
                      ) : (
                        <>
                          <AdminButton onClick={() => void openSmartEditDrawer(row.sourceId)} size="sm" variant="secondary">
                            Edit
                          </AdminButton>
                          <AdminButton onClick={() => void disableSmartPromotion(row.sourceId)} size="sm" variant="ghost">
                            Disable
                          </AdminButton>
                        </>
                      )}
                    </div>
                  ),
                },
              ]}
              emptyDescription={emptyStateContent.description}
              emptyTitle={emptyStateContent.title}
              isLoading={isUnifiedListLoading}
              rows={unifiedRows}
            />
          ) : (
            <AdminEmptyState
              actionLabel="Create promotion"
              description={emptyStateContent.description}
              icon="sell"
              onAction={openCreateFlow}
              title={emptyStateContent.title}
            />
          )}
        </AdminCard>

        <AdminDrawer
          actions={createDrawerActions}
          contextItems={[
            { label: 'Promotions' },
            { label: 'Create promotion' },
            { current: true, label: createStep === 'method' ? 'Method' : createStep === 'type' ? 'Type' : 'Details' },
          ]}
          onClose={resetCreateFlow}
          open={createDrawerOpen}
          subtitle={
            createStep === 'method'
              ? 'Choose whether customers enter a code or Doopify applies the offer automatically.'
              : createStep === 'type'
                ? selectedMethod === CREATE_METHODS.LEGACY
                  ? 'These offers require customers to enter a code at checkout.'
                  : "These offers apply when the customer's cart matches your rules."
                : 'Add the offer details based on the promotion type you selected.'
          }
          title="Create promotion"
        >
          <div className={styles.drawerBody}>
            {createStep === 'method' ? (
              <AdminFormSection
                description="Choose whether customers enter a code or Doopify applies the offer automatically."
                eyebrow="Method"
                title="How should this promotion work?"
              >
                <div className={styles.offerChoiceList} aria-label="Promotion method" role="radiogroup">
                  {METHOD_CHOICES.map((choice) => (
                    <button
                      aria-checked={selectedMethod === choice.id}
                      className={`${styles.offerChoiceCard} ${selectedMethod === choice.id ? styles.offerChoiceCardActive : ''}`}
                      data-selected={selectedMethod === choice.id ? 'true' : 'false'}
                      key={choice.id}
                      onClick={() => onSelectMethod(choice.id)}
                      role="radio"
                      type="button"
                    >
                      <div className={styles.offerChoiceLeading}>
                        <span className={styles.offerChoiceRadio} aria-hidden="true" />
                        <div className={styles.offerChoiceCopy}>
                          <div className={styles.offerChoiceTitleRow}>
                            <strong>{choice.title}</strong>
                            {selectedMethod === choice.id ? <span className={styles.offerChoiceSelectionTag}>Selected</span> : null}
                          </div>
                          <p className={styles.offerChoiceDescription}>{choice.description}</p>
                          <small>{choice.bestFor}</small>
                        </div>
                      </div>
                      <span className={styles.offerChoiceBadge}>{choice.badge}</span>
                    </button>
                  ))}
                </div>
              </AdminFormSection>
            ) : null}

            {createStep === 'type' ? (
              <AdminFormSection
                description={
                  selectedMethod === CREATE_METHODS.LEGACY
                    ? 'These offers require customers to enter a code at checkout.'
                    : "These offers apply when the customer's cart matches your rules."
                }
                eyebrow="Type"
                title={selectedMethod === CREATE_METHODS.LEGACY ? 'Choose discount code type' : 'Choose automatic offer type'}
              >
                <div className={styles.offerChoiceList} aria-label="Promotion type" role="radiogroup">
                  {OFFER_TYPE_DEFINITIONS.filter((offer) =>
                    selectedMethod === CREATE_METHODS.LEGACY ? offer.flow === 'legacy' : offer.flow === 'smart'
                  ).map((offer) => (
                    <button
                      aria-checked={selectedPromotionType === offer.id}
                      className={`${styles.offerChoiceCard} ${selectedPromotionType === offer.id ? styles.offerChoiceCardActive : ''}`}
                      data-selected={selectedPromotionType === offer.id ? 'true' : 'false'}
                      key={offer.id}
                      onClick={() => onSelectOfferType(offer.id)}
                      role="radio"
                      type="button"
                    >
                      <div className={styles.offerChoiceLeading}>
                        <span className={styles.offerChoiceRadio} aria-hidden="true" />
                        <div className={styles.offerChoiceCopy}>
                          <div className={styles.offerChoiceTitleRow}>
                            <strong>{offer.title}</strong>
                            {selectedPromotionType === offer.id ? <span className={styles.offerChoiceSelectionTag}>Selected</span> : null}
                          </div>
                          <p className={styles.offerChoiceDescription}>{offer.description}</p>
                        </div>
                      </div>
                      <span className={styles.offerChoiceBadge}>{offer.badge}</span>
                    </button>
                  ))}
                </div>
                {selectedMethod === CREATE_METHODS.SMART ? <p className={styles.offerChoiceNote}>{AUTOMATIC_TYPE_NOTE}</p> : null}
              </AdminFormSection>
            ) : null}

            {createStep === 'details' && isLegacyCreate && draftDiscount ? (
              <>
                <AdminFormSection
                  description="Set the customer-facing code and core discount settings."
                  eyebrow="Details"
                  title="Discount code details"
                >
                  <div className={styles.formGrid}>
                    <AdminField label="Name">
                      <AdminInput
                        onChange={(event) => setDraftDiscount((current) => ({ ...current, title: event.target.value }))}
                        placeholder="Summer shirts sale"
                        value={draftDiscount.title}
                      />
                    </AdminField>
                    <AdminField label="Code">
                      <AdminInput
                        onChange={(event) => setDraftDiscount((current) => ({ ...current, code: event.target.value }))}
                        placeholder="SUMMER20"
                        value={draftDiscount.code}
                      />
                    </AdminField>
                    <AdminField label="Discount type">
                      <AdminSelect
                        onChange={(value) => setDraftDiscount((current) => ({ ...current, method: value }))}
                        options={LEGACY_DISCOUNT_METHODS.map((method) => ({ value: method, label: method }))}
                        value={draftDiscount.method}
                      />
                    </AdminField>
                    {draftDiscount.method !== 'free shipping' ? (
                      <>
                        <AdminField label="Value type">
                          <AdminSelect onChange={(value) => setDraftDiscount((current) => ({ ...current, valueType: value }))} options={valueTypeOptions} value={draftDiscount.valueType} />
                        </AdminField>
                        <AdminField label="Value">
                          <AdminInput onChange={(event) => setDraftDiscount((current) => ({ ...current, value: event.target.value }))} placeholder="10" type="text" value={draftDiscount.value} />
                        </AdminField>
                      </>
                    ) : (
                      <p className={styles.inlineHint}>Free shipping codes do not require a discount value.</p>
                    )}
                  </div>
                  <p className={styles.builderHint}>
                    Looking for Buy X Get Y, Free Gift, or product group savings? Use an automatic promotion type.
                  </p>
                </AdminFormSection>

                <AdminFormSection
                  description="Choose whether a minimum spend or item quantity is required."
                  eyebrow="Minimum requirement"
                  title="Minimum requirement"
                >
                  <div className={styles.formGrid}>
                    <AdminField label="Requirement type">
                      <AdminSelect onChange={(value) => setDraftDiscount((current) => ({ ...current, minimumRequirementType: value }))} options={requirementTypeOptions} value={draftDiscount.minimumRequirementType} />
                    </AdminField>
                    <AdminField label="Requirement value">
                      <AdminInput onChange={(event) => setDraftDiscount((current) => ({ ...current, minimumRequirementValue: event.target.value }))} placeholder="50" type="text" value={draftDiscount.minimumRequirementValue} />
                    </AdminField>
                  </div>
                </AdminFormSection>
                <AdminFormSection
                  description="Set timing, usage limits, and current status."
                  eyebrow="Schedule & publish"
                  title="Schedule & publish"
                >
                  <div className={styles.formGrid}>
                    <AdminField label="Starts at">
                      <AdminInput onChange={(event) => setDraftDiscount((current) => ({ ...current, startsAt: event.target.value }))} type="datetime-local" value={draftDiscount.startsAt} />
                    </AdminField>
                    <AdminField label="Ends at">
                      <AdminInput onChange={(event) => setDraftDiscount((current) => ({ ...current, endsAt: event.target.value }))} type="datetime-local" value={draftDiscount.endsAt} />
                    </AdminField>
                    <AdminField label="Usage limit">
                      <AdminInput onChange={(event) => setDraftDiscount((current) => ({ ...current, usageLimit: event.target.value }))} placeholder="Optional" type="number" value={draftDiscount.usageLimit} />
                    </AdminField>
                    <AdminField label="Status">
                      <AdminSelect onChange={(value) => setDraftDiscount((current) => ({ ...current, status: value }))} options={statusOptions.filter((option) => option.value !== 'expired')} value={draftDiscount.status} />
                    </AdminField>
                  </div>
                </AdminFormSection>
                <AdminFormSection
                  description="Review what customers will see before creating the promotion."
                  eyebrow="Preview"
                  title="Preview"
                >
                  <p className={styles.previewText}>{buildLegacyDiscountPreview(draftDiscount)}</p>
                </AdminFormSection>
              </>
            ) : null}

            {createStep === 'details' && isSmartCreate ? (
              <>
                {smartErrorMessage ? <p className={styles.errorBanner}>{smartErrorMessage}</p> : null}
                <SmartPromotionFormSections
                  catalogState={smartCatalogState}
                  draft={smartDraft}
                  onAddPendingSelections={(section) => {
                    const pendingRows = smartCatalogState.pendingSelections[section] || [];
                    for (const row of pendingRows) {
                      addPromotionVariantToSelection(
                        setSmartDraft,
                        setSmartCatalogState,
                        section,
                        {
                          id: row.productId,
                          title: row.productTitle,
                          fulfillmentType: row.fulfillmentType || 'PHYSICAL',
                        },
                        {
                          id: row.variantId,
                          title: row.variantTitle,
                          sku: row.sku || null,
                        }
                      );
                    }
                    closePromotionCatalogPicker(setSmartCatalogState);
                  }}
                  onAddVariant={(section, product, variant) => addPromotionVariantToSelection(setSmartDraft, setSmartCatalogState, section, product, variant)}
                  onCatalogQueryChange={(value) =>
                    setSmartCatalogState((current) => ({
                      ...current,
                      query: value,
                    }))
                  }
                  onCancelPicker={() => closePromotionCatalogPicker(setSmartCatalogState)}
                  onLoadProductDetail={(productId) => void loadPromotionProductDetail(smartCatalogState, setSmartCatalogState, productId)}
                  onOpenPicker={(section) =>
                    openPromotionCatalogPicker(
                      setSmartCatalogState,
                      () => searchPromotionCatalog(smartCatalogState, setSmartCatalogState),
                      section
                    )
                  }
                  onRemoveSelection={(section, variantId) => removePromotionSelection(setSmartDraft, section, variantId)}
                  onSearchCatalog={() => void searchPromotionCatalog(smartCatalogState, setSmartCatalogState)}
                  onTogglePendingVariant={(section, product, variant) =>
                    togglePromotionPendingVariant(setSmartCatalogState, section, product, variant)
                  }
                  onUpdateDraft={(field, value) => {
                    setSmartDraft((current) => ({ ...current, [field]: value }));
                    setSmartValidationIssues([]);
                  }}
                  onUpdateSelectionQuantity={(section, variantId, quantity) => updatePromotionSelectionQuantity(setSmartDraft, section, variantId, quantity)}
                  validationIssues={smartValidationIssues}
                  visibleSections={['offer-details', 'qualifiers', 'qualifier-catalog', 'reward-settings', 'reward-catalog', 'schedule', 'preview']}
                />
              </>
            ) : null}
          </div>
        </AdminDrawer>

        <AdminDrawer
          actions={(
            <>
              <AdminButton onClick={() => { setBuilderMode(null); setDraftDiscount(null); }} size="sm" variant="ghost">Cancel</AdminButton>
              <AdminButton onClick={() => saveDraftDiscount(draftDiscount)} size="sm" variant="primary">Save discount</AdminButton>
            </>
          )}
          contextItems={[
            { label: 'Promotions' },
            { label: 'Discount codes' },
            { label: draftDiscount?.title || 'Discount code', current: true },
          ]}
          onClose={() => { setBuilderMode(null); setDraftDiscount(null); }}
          open={Boolean(builderMode && draftDiscount)}
          title="Edit discount code"
        >
          {draftDiscount ? (
            <div className={styles.drawerBody}>
              <AdminFormSection eyebrow="Identity" title="Basic settings">
                <div className={styles.formGrid}>
                  <AdminField label="Name">
                    <AdminInput onChange={(event) => setDraftDiscount((current) => ({ ...current, title: event.target.value }))} placeholder="SUMMER20" type="text" value={draftDiscount.title} />
                  </AdminField>
                  <AdminField label="Code">
                    <AdminInput onChange={(event) => setDraftDiscount((current) => ({ ...current, code: event.target.value }))} placeholder="SUMMER20" type="text" value={draftDiscount.code} />
                  </AdminField>
                  <AdminField label="Discount type">
                    <AdminSelect onChange={(value) => setDraftDiscount((current) => ({ ...current, method: value }))} options={LEGACY_DISCOUNT_METHODS.map((method) => ({ value: method, label: method }))} value={draftDiscount.method} />
                  </AdminField>
                  <AdminField label="Value type">
                    <AdminSelect onChange={(value) => setDraftDiscount((current) => ({ ...current, valueType: value }))} options={valueTypeOptions} value={draftDiscount.valueType} />
                  </AdminField>
                  <AdminField label="Value">
                    <AdminInput onChange={(event) => setDraftDiscount((current) => ({ ...current, value: event.target.value }))} placeholder="10" type="text" value={draftDiscount.value} />
                  </AdminField>
                </div>
                <p className={styles.builderHint}>
                  Looking for Buy X Get Y, Free Gift, or product group savings? Use an automatic promotion type.
                </p>
              </AdminFormSection>
              <AdminFormSection eyebrow="Rules" title="Requirements">
                <div className={styles.formGrid}>
                  <AdminField label="Requirement type">
                    <AdminSelect onChange={(value) => setDraftDiscount((current) => ({ ...current, minimumRequirementType: value }))} options={requirementTypeOptions} value={draftDiscount.minimumRequirementType} />
                  </AdminField>
                  <AdminField label="Requirement value">
                    <AdminInput onChange={(event) => setDraftDiscount((current) => ({ ...current, minimumRequirementValue: event.target.value }))} placeholder="50" type="text" value={draftDiscount.minimumRequirementValue} />
                  </AdminField>
                  <AdminField label="Starts at">
                    <AdminInput onChange={(event) => setDraftDiscount((current) => ({ ...current, startsAt: event.target.value }))} type="datetime-local" value={draftDiscount.startsAt} />
                  </AdminField>
                  <AdminField label="Ends at">
                    <AdminInput onChange={(event) => setDraftDiscount((current) => ({ ...current, endsAt: event.target.value }))} type="datetime-local" value={draftDiscount.endsAt} />
                  </AdminField>
                </div>
              </AdminFormSection>
            </div>
          ) : null}
        </AdminDrawer>

        <AdminDrawer
          actions={(
            <>
              <AdminButton disabled={smartEditSaving} onClick={resetSmartEditDrawer} size="sm" variant="ghost">
                Cancel
              </AdminButton>
              <AdminButton
                disabled={!canSubmitSmartEdit}
                loading={smartEditSaving}
                onClick={() => void saveSmartEditPromotion()}
                size="sm"
                variant="primary"
              >
                Save promotion
              </AdminButton>
            </>
          )}
          contextItems={[
            { label: 'Promotions' },
            { label: 'Automatic' },
            { current: true, label: smartEditDraft.name || 'Edit promotion' },
          ]}
          onClose={resetSmartEditDrawer}
          open={smartEditOpen}
          subtitle="Review the promotion details, reward logic, and scheduling before saving."
          title="Edit promotion"
        >
          <div className={styles.drawerBody}>
            {smartEditErrorMessage ? <p className={styles.errorBanner}>{smartEditErrorMessage}</p> : null}
            <SmartPromotionFormSections
              catalogState={smartEditCatalogState}
              draft={smartEditDraft}
              onAddPendingSelections={(section) => {
                const pendingRows = smartEditCatalogState.pendingSelections[section] || [];
                for (const row of pendingRows) {
                  addPromotionVariantToSelection(
                    setSmartEditDraft,
                    setSmartEditCatalogState,
                    section,
                    {
                      id: row.productId,
                      title: row.productTitle,
                      fulfillmentType: row.fulfillmentType || 'PHYSICAL',
                    },
                    {
                      id: row.variantId,
                      title: row.variantTitle,
                      sku: row.sku || null,
                    }
                  );
                }
                closePromotionCatalogPicker(setSmartEditCatalogState);
              }}
              onAddVariant={(section, product, variant) => addPromotionVariantToSelection(setSmartEditDraft, setSmartEditCatalogState, section, product, variant)}
              onCatalogQueryChange={(value) =>
                setSmartEditCatalogState((current) => ({
                  ...current,
                  query: value,
                }))
              }
              onCancelPicker={() => closePromotionCatalogPicker(setSmartEditCatalogState)}
              onLoadProductDetail={(productId) => void loadPromotionProductDetail(smartEditCatalogState, setSmartEditCatalogState, productId)}
              onOpenPicker={(section) =>
                openPromotionCatalogPicker(
                  setSmartEditCatalogState,
                  () => searchPromotionCatalog(smartEditCatalogState, setSmartEditCatalogState),
                  section
                )
              }
              onRemoveSelection={(section, variantId) => removePromotionSelection(setSmartEditDraft, section, variantId)}
              onSearchCatalog={() => void searchPromotionCatalog(smartEditCatalogState, setSmartEditCatalogState)}
              onTogglePendingVariant={(section, product, variant) =>
                togglePromotionPendingVariant(setSmartEditCatalogState, section, product, variant)
              }
              onTypeChange={(nextType) => {
                setSmartEditDraft((current) => normalizePromotionDraftForType({
                  ...current,
                  type: nextType,
                }));
                setSmartEditValidationIssues([]);
              }}
              onUpdateDraft={(field, value) => {
                setSmartEditDraft((current) => ({ ...current, [field]: value }));
                setSmartEditValidationIssues([]);
              }}
              onUpdateSelectionQuantity={(section, variantId, quantity) => updatePromotionSelectionQuantity(setSmartEditDraft, section, variantId, quantity)}
              showTypeCards
              validationIssues={smartEditValidationIssues}
            />
          </div>
        </AdminDrawer>
      </AdminPage>
    </AppShell>
  );
}
