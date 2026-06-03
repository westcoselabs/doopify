"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminButton from '../admin/ui/AdminButton';
import AdminDrawer from '../admin/ui/AdminDrawer';
import AdminField from '../admin/ui/AdminField';
import AdminFormSection from '../admin/ui/AdminFormSection';
import AdminInput from '../admin/ui/AdminInput';
import AdminSelect from '../admin/ui/AdminSelect';
import AdminStatusChip from '../admin/ui/AdminStatusChip';
import AdminTable from '../admin/ui/AdminTable';
import AdminToolbar from '../admin/ui/AdminToolbar';
import styles from './AutomaticPromotionsWorkspace.module.css';
import {
  buildPromotionListQuery,
  buildPromotionPayloadFromDraft,
  buildPromotionPreview,
  canSubmitPromotionDraft,
  createPromotionDraft,
  extractPromotionValidationIssues,
  formatPromotionStatusLabel,
  formatPromotionTypeLabel,
  formatRewardSummary,
  getPromotionStatusTone,
  normalizePromotionDraftForType,
  PROMOTION_STATUSES,
  PROMOTION_TYPES,
} from './promotions-ui.helpers';

const STATUS_FILTER_OPTIONS = [{ value: 'ALL', label: 'All status' }].concat(
  PROMOTION_STATUSES.map((status) => ({
    value: status,
    label: formatPromotionStatusLabel(status),
  }))
);

const TYPE_FILTER_OPTIONS = [{ value: 'ALL', label: 'All types' }].concat(
  PROMOTION_TYPES.map((type) => ({
    value: type,
    label: formatPromotionTypeLabel(type),
  }))
);

const STATUS_OPTIONS = PROMOTION_STATUSES.map((status) => ({
  value: status,
  label: formatPromotionStatusLabel(status),
}));

const REWARD_TYPE_OPTIONS = [
  { value: 'PERCENTAGE', label: 'Percentage' },
  { value: 'FIXED_AMOUNT', label: 'Fixed amount' },
  { value: 'FREE', label: 'Free' },
];

export const TYPE_CARD_COPY = {
  PRODUCT_GROUP_DISCOUNT: {
    badge: 'Automatic',
    description: 'Discount selected products when bought together.',
    example: 'Example: Buy Hoodie + Hat and save 15%.',
    title: 'Product group discount',
  },
  BUY_X_GET_Y: {
    badge: 'Automatic',
    description: 'Discount a reward product when qualifying products are also in the cart.',
    example: 'Example: Buy a Hoodie, get a Hat 50% off.',
    note: 'Reward item must already be in cart.',
    title: 'Buy X Get Y',
  },
  FREE_GIFT: {
    badge: 'Automatic',
    description: 'Make selected reward products free when qualifying products are also in the cart.',
    example: 'Example: Buy a Hoodie, get a Sticker Pack free.',
    note: 'Gift item must already be in cart.',
    title: 'Free gift',
  },
};

function toLocalDateTimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function toDraftFromDetail(promotion) {
  return {
    id: promotion.id,
    name: String(promotion.name || ''),
    status: promotion.status || 'DRAFT',
    type: promotion.type || 'PRODUCT_GROUP_DISCOUNT',
    rewardType: promotion.rewardType || 'PERCENTAGE',
    value: String(promotion.value ?? ''),
    startsAt: toLocalDateTimeInput(promotion.startsAt),
    endsAt: toLocalDateTimeInput(promotion.endsAt),
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

function rowsToNameSummary(rows) {
  if (!rows.length) return 'None selected';
  const names = rows.slice(0, 2).map((row) => `${row.productTitle} (${row.variantTitle})`);
  if (rows.length > 2) names.push(`+${rows.length - 2} more`);
  return names.join(', ');
}

function parseApiErrorMessage(payload, fallback) {
  if (!payload || typeof payload !== 'object') return fallback;
  if (payload.error) return String(payload.error);
  return fallback;
}

export function createPromotionCatalogState() {
  return {
    query: '',
    rows: [],
    loading: false,
    error: '',
    productDetailsById: {},
  };
}

function VariantRowList({
  emptyText,
  fieldLabel,
  onChangeQuantity,
  onRemove,
  quantityLabel,
  rows,
}) {
  return (
    <div className={styles.selectionList}>
      <p className={styles.selectionLabel}>{fieldLabel}</p>
      {rows.length ? (
        rows.map((row) => (
          <div className={styles.selectionRow} key={row.variantId}>
            <div>
              <strong>{row.productTitle}</strong>
              <p>
                {row.variantTitle}
                {row.sku ? ` | SKU ${row.sku}` : ''}
                {row.fulfillmentType ? ` | ${row.fulfillmentType}` : ''}
              </p>
            </div>
            <div className={styles.selectionActions}>
              <AdminInput
                min="1"
                onChange={(event) => onChangeQuantity(row.variantId, Number(event.target.value || 1))}
                type="number"
                value={String(row.quantity)}
              />
              <span className={styles.quantityLabel}>{quantityLabel}</span>
              <AdminButton onClick={() => onRemove(row.variantId)} size="sm" variant="ghost">
                Remove
              </AdminButton>
            </div>
          </div>
        ))
      ) : (
        <p className={styles.inlineHint}>{emptyText}</p>
      )}
    </div>
  );
}

function PromotionTypeCards({ draft, onTypeChange }) {
  return (
    <div className={styles.typeCards}>
      {PROMOTION_TYPES.map((type) => {
        const copy = TYPE_CARD_COPY[type];
        return (
          <button
            className={`${styles.typeCard} ${draft.type === type ? styles.typeCardActive : ''}`}
            key={type}
            onClick={() => onTypeChange(type)}
            type="button"
          >
            <div className={styles.typeCardTopRow}>
              <div className={styles.typeCardHeader}>
                <span className={styles.typeCardDot} aria-hidden="true" />
                <strong>{copy.title}</strong>
              </div>
              <span className={styles.typeCardBadge}>{copy.badge}</span>
            </div>
            <p>{copy.description}</p>
            <small>{copy.example}</small>
            {copy.note ? <small>{copy.note}</small> : null}
          </button>
        );
      })}
    </div>
  );
}

function PromotionCatalogSection({
  addLabel,
  catalogError,
  catalogLoading,
  catalogQuery,
  catalogRows,
  emptyText,
  loadProductDetail,
  onAdd,
  productDetailsById,
  searchCatalog,
  setCatalogQuery,
  title,
}) {
  return (
    <AdminFormSection
      description="Search products and load variants to add eligible items."
      eyebrow="Catalog"
      title={title}
    >
      <div className={styles.catalogToolbar}>
        <AdminInput
          onChange={(event) => setCatalogQuery(event.target.value)}
          placeholder="Search products..."
          type="search"
          value={catalogQuery}
        />
        <AdminButton onClick={searchCatalog} size="sm" variant="secondary">
          Search
        </AdminButton>
      </div>
      {catalogError ? <p className={styles.inlineError}>{catalogError}</p> : null}
      <div className={styles.catalogList}>
        {catalogLoading ? <p className={styles.inlineHint}>Loading product catalog...</p> : null}
        {!catalogLoading && !catalogRows.length ? <p className={styles.inlineHint}>{emptyText}</p> : null}
        {catalogRows.map((product) => {
          const detail = productDetailsById[product.id];
          return (
            <div className={styles.catalogProduct} key={product.id}>
              <div className={styles.catalogProductHeader}>
                <div>
                  <strong>{product.title}</strong>
                  <p>Fulfillment: {product.fulfillmentType || 'PHYSICAL'}</p>
                </div>
                <AdminButton onClick={() => void loadProductDetail(product.id)} size="sm" variant="ghost">
                  Load variants
                </AdminButton>
              </div>
              {detail?.variants?.length ? (
                <div className={styles.catalogVariantList}>
                  {detail.variants.map((variant) => (
                    <div className={styles.catalogVariantRow} key={variant.id}>
                      <span>
                        {variant.title || 'Default'}
                        {variant.sku ? ` | SKU ${variant.sku}` : ''}
                      </span>
                      <AdminButton onClick={() => onAdd(detail, variant)} size="sm" variant="secondary">
                        {addLabel}
                      </AdminButton>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </AdminFormSection>
  );
}

export function SmartPromotionFormSections({
  catalogState,
  draft,
  onAddVariant,
  onCatalogQueryChange,
  onLoadProductDetail,
  onRemoveSelection,
  onSearchCatalog,
  onTypeChange,
  onUpdateDraft,
  onUpdateSelectionQuantity,
  showTypeCards = false,
  validationIssues = [],
  visibleSections = ['offer-details', 'qualifiers', 'qualifier-catalog', 'reward-settings', 'reward-catalog', 'schedule', 'preview'],
}) {
  const validationByPath = useMemo(() => {
    const grouped = {};
    for (const issue of validationIssues) {
      const key = String(issue.path || 'general');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(issue.message || 'Invalid value');
    }
    return grouped;
  }, [validationIssues]);
  const topValidationMessages = validationByPath.general || [];
  const showRewards = draft.type !== 'PRODUCT_GROUP_DISCOUNT';
  const visible = new Set(visibleSections);

  return (
    <>
      {visible.has('offer-details') ? (
        <AdminFormSection
          description="Set the offer name and promotion status."
          eyebrow="Offer details"
          title="Offer details"
        >
          <div className={styles.formGrid}>
            <AdminField label="Name">
              <AdminInput
                onChange={(event) => onUpdateDraft('name', event.target.value)}
                placeholder="Hoodie + Hat bundle savings"
                value={draft.name}
              />
              {validationByPath.name?.length ? (
                <small className={styles.fieldError}>{validationByPath.name[0]}</small>
              ) : null}
            </AdminField>
            <AdminField label="Status">
              <AdminSelect onChange={(value) => onUpdateDraft('status', value)} options={STATUS_OPTIONS} value={draft.status} />
            </AdminField>
          </div>
          {showTypeCards && onTypeChange ? <PromotionTypeCards draft={draft} onTypeChange={onTypeChange} /> : null}
        </AdminFormSection>
      ) : null}

      {visible.has('qualifiers') ? (
        <AdminFormSection
          description="Select qualifier products and quantities customers must have in their cart."
          eyebrow="Customer must buy"
          title="Customer must buy"
        >
          <VariantRowList
            emptyText="No qualifier variants selected yet."
            fieldLabel="Qualifier variants"
            onChangeQuantity={(variantId, quantity) => onUpdateSelectionQuantity('qualifiers', variantId, quantity)}
            onRemove={(variantId) => onRemoveSelection('qualifiers', variantId)}
            quantityLabel="Required quantity"
            rows={draft.qualifiers}
          />
        </AdminFormSection>
      ) : null}

      {visible.has('qualifier-catalog') ? (
        <PromotionCatalogSection
          addLabel="Add qualifier"
          catalogError={catalogState.error}
          catalogLoading={catalogState.loading}
          catalogQuery={catalogState.query}
          catalogRows={catalogState.rows}
          emptyText="Search to find products and variants."
          loadProductDetail={onLoadProductDetail}
          onAdd={(product, variant) => onAddVariant('qualifiers', product, variant)}
          productDetailsById={catalogState.productDetailsById}
          searchCatalog={onSearchCatalog}
          setCatalogQuery={onCatalogQueryChange}
          title="Add qualifier variants"
        />
      ) : null}

      {visible.has('reward-settings') ? (
        <AdminFormSection
          description={
            draft.type === 'PRODUCT_GROUP_DISCOUNT'
              ? 'Choose the discount value applied to the selected qualifier products.'
              : 'Select reward products and configure how the discount should apply.'
          }
          eyebrow={draft.type === 'PRODUCT_GROUP_DISCOUNT' ? 'Discount settings' : 'Customer receives'}
          title={draft.type === 'PRODUCT_GROUP_DISCOUNT' ? 'Discount settings' : 'Customer receives'}
        >
          {draft.type === 'PRODUCT_GROUP_DISCOUNT' ? (
            <p className={styles.inlineHint}>
              Product group discounts apply to the selected qualifier products only in V1.
            </p>
          ) : (
            <>
              <VariantRowList
                emptyText="No reward variants selected yet."
                fieldLabel="Reward variants"
                onChangeQuantity={(variantId, quantity) => onUpdateSelectionQuantity('rewards', variantId, quantity)}
                onRemove={(variantId) => onRemoveSelection('rewards', variantId)}
                quantityLabel="Reward quantity"
                rows={draft.rewards}
              />
              {draft.type === 'BUY_X_GET_Y' ? (
                <p className={styles.inlineHint}>
                  Reward items must already be in the customer&apos;s cart. Auto-add gifts are not enabled in V1.
                </p>
              ) : null}
              {draft.type === 'FREE_GIFT' ? (
                <p className={styles.inlineHint}>
                  Gift items must already be in the customer&apos;s cart. Auto-add gifts are not enabled in V1.
                </p>
              ) : null}
            </>
          )}
          <div className={styles.formGrid}>
            <AdminField label={draft.type === 'PRODUCT_GROUP_DISCOUNT' ? 'Discount type' : 'Reward type'}>
              <AdminSelect
                onChange={(value) => onUpdateDraft('rewardType', value)}
                options={
                  draft.type === 'FREE_GIFT'
                    ? [{ value: 'FREE', label: 'Free' }]
                    : REWARD_TYPE_OPTIONS.filter((option) => option.value !== 'FREE')
                }
                value={draft.type === 'FREE_GIFT' ? 'FREE' : draft.rewardType}
              />
            </AdminField>
            <AdminField label="Value">
              <AdminInput
                disabled={draft.type === 'FREE_GIFT'}
                onChange={(event) => onUpdateDraft('value', event.target.value)}
                placeholder={draft.rewardType === 'PERCENTAGE' ? '15' : '5.00'}
                type="number"
                value={draft.type === 'FREE_GIFT' ? '0' : draft.value}
              />
            </AdminField>
          </div>
        </AdminFormSection>
      ) : null}

      {visible.has('reward-catalog') && showRewards ? (
        <PromotionCatalogSection
          addLabel="Add reward"
          catalogError={catalogState.error}
          catalogLoading={catalogState.loading}
          catalogQuery={catalogState.query}
          catalogRows={catalogState.rows}
          emptyText="Search to find products and variants."
          loadProductDetail={onLoadProductDetail}
          onAdd={(product, variant) => onAddVariant('rewards', product, variant)}
          productDetailsById={catalogState.productDetailsById}
          searchCatalog={onSearchCatalog}
          setCatalogQuery={onCatalogQueryChange}
          title="Add reward variants"
        />
      ) : null}

      {visible.has('schedule') ? (
        <AdminFormSection
          description="Set activation windows, usage cap, and tie-break priority."
          eyebrow="Schedule & publish"
          title="Schedule & publish"
        >
          <div className={styles.formGrid}>
            <AdminField label="Starts at">
              <AdminInput
                onChange={(event) => onUpdateDraft('startsAt', event.target.value)}
                type="datetime-local"
                value={draft.startsAt}
              />
            </AdminField>
            <AdminField label="Ends at">
              <AdminInput
                onChange={(event) => onUpdateDraft('endsAt', event.target.value)}
                type="datetime-local"
                value={draft.endsAt}
              />
            </AdminField>
            <AdminField label="Usage limit">
              <AdminInput
                min="0"
                onChange={(event) => onUpdateDraft('usageLimit', event.target.value)}
                placeholder="Optional"
                type="number"
                value={draft.usageLimit}
              />
            </AdminField>
            <AdminField
              hint="Lower numbers run first when promotions tie. The best discount usually wins automatically."
              label="Priority"
            >
              <AdminInput
                onChange={(event) => onUpdateDraft('priority', event.target.value)}
                type="number"
                value={draft.priority}
              />
            </AdminField>
          </div>
        </AdminFormSection>
      ) : null}

      {visible.has('preview') ? (
        <AdminFormSection
          description="Review Smart Promotion behavior before saving."
          eyebrow="Preview"
          title="Preview"
        >
          <p className={styles.previewText}>{buildPromotionPreview(draft)}</p>
          <div className={styles.previewGrid}>
            <p>
              <strong>Type:</strong> {formatPromotionTypeLabel(draft.type)}
            </p>
            <p>
              <strong>Status:</strong> {formatPromotionStatusLabel(draft.status)}
            </p>
            <p>
              <strong>Customer must buy:</strong> {rowsToNameSummary(draft.qualifiers)}
            </p>
            <p>
              <strong>{draft.type === 'PRODUCT_GROUP_DISCOUNT' ? 'Discount settings' : 'Customer receives'}:</strong>{' '}
              {draft.type === 'PRODUCT_GROUP_DISCOUNT'
                ? formatRewardSummary({
                    rewardType: draft.rewardType,
                    type: draft.type,
                    value: Number(draft.value || 0),
                  })
                : rowsToNameSummary(draft.rewards)}
            </p>
          </div>
          <p className={styles.inlineHint}>
            Smart Promotions do not combine with discount codes in V1.
          </p>
          {topValidationMessages.length ? (
            <div className={styles.inlineErrorList}>
              {topValidationMessages.map((message, index) => (
                <p key={`${message}-${index}`}>{message}</p>
              ))}
            </div>
          ) : null}
          {validationIssues.length ? (
            <div className={styles.inlineErrorList}>
              {validationIssues.map((issue, index) => (
                <p key={`${issue.path}-${issue.code}-${index}`}>
                  {issue.path ? `${issue.path}: ` : ''}
                  {issue.message}
                </p>
              ))}
            </div>
          ) : null}
        </AdminFormSection>
      ) : null}
    </>
  );
}

export default function AutomaticPromotionsWorkspace({
  externalCreateToken = 0,
  hideCreateAction = false,
}) {
  const [promotions, setPromotions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draft, setDraft] = useState(() => createPromotionDraft());
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('ALL');
  const [errorMessage, setErrorMessage] = useState('');
  const [validationIssues, setValidationIssues] = useState([]);
  const [catalogState, setCatalogState] = useState(() => createPromotionCatalogState());
  const lastCreateTokenRef = useRef(-1);
  const isEditMode = Boolean(draft.id);
  const canSubmitPromotion = useMemo(() => canSubmitPromotionDraft(draft), [draft]);

  const loadPromotions = useCallback(async () => {
    setLoading(true);
    setErrorMessage('');
    try {
      const query = buildPromotionListQuery({
        search,
        status: statusFilter,
        type: typeFilter,
        page: 1,
        pageSize: 50,
      });
      const response = await fetch(`/api/promotions?${query}`);
      const payload = await response.json();
      if (!payload?.success) {
        setErrorMessage(parseApiErrorMessage(payload, 'Failed to load promotions.'));
        setPromotions([]);
        return;
      }
      setPromotions(payload.data?.promotions || []);
    } catch (error) {
      console.error('[AutomaticPromotionsWorkspace] failed to load promotions', error);
      setErrorMessage('Failed to load promotions.');
      setPromotions([]);
    } finally {
      setLoading(false);
    }
  }, [search, statusFilter, typeFilter]);

  useEffect(() => {
    void loadPromotions();
  }, [loadPromotions]);

  useEffect(() => {
    if (externalCreateToken !== lastCreateTokenRef.current) {
      lastCreateTokenRef.current = externalCreateToken;
      if (externalCreateToken > 0) {
        openCreateDrawer();
      }
    }
  }, [externalCreateToken]);

  function resetDrawerState(nextDraft) {
    setDraft(nextDraft);
    setValidationIssues([]);
    setCatalogState(createPromotionCatalogState());
  }

  function openCreateDrawer() {
    resetDrawerState(createPromotionDraft());
    setErrorMessage('');
    setDrawerOpen(true);
  }

  async function openEditDrawer(promotionId) {
    setErrorMessage('');
    setValidationIssues([]);
    try {
      const response = await fetch(`/api/promotions/${promotionId}`);
      const payload = await response.json();
      if (!payload?.success) {
        setErrorMessage(parseApiErrorMessage(payload, 'Failed to load promotion details.'));
        return;
      }
      resetDrawerState(toDraftFromDetail(payload.data?.promotion || {}));
      setDrawerOpen(true);
    } catch (error) {
      console.error('[AutomaticPromotionsWorkspace] failed to load promotion detail', error);
      setErrorMessage('Failed to load promotion details.');
    }
  }

  function onTypeChange(nextType) {
    setDraft((current) => {
      const nextDraft = normalizePromotionDraftForType({
        ...current,
        type: nextType,
      });
      return nextDraft;
    });
    setValidationIssues([]);
  }

  function updateDraft(field, value) {
    setDraft((current) => ({ ...current, [field]: value }));
    setValidationIssues([]);
  }

  function removeSelection(section, variantId) {
    setDraft((current) => ({
      ...current,
      [section]: current[section].filter((row) => row.variantId !== variantId),
    }));
  }

  function updateSelectionQuantity(section, variantId, quantity) {
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

  function addVariantToSelection(section, product, variant) {
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

  async function searchCatalog() {
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
          error: parseApiErrorMessage(payload, 'Failed to search product catalog.'),
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
      console.error('[AutomaticPromotionsWorkspace] catalog search failed', error);
      setCatalogState((current) => ({
        ...current,
        rows: [],
        error: 'Failed to search product catalog.',
        loading: false,
      }));
    }
  }

  async function loadProductDetail(productId) {
    if (catalogState.productDetailsById[productId]) return;

    try {
      const response = await fetch(`/api/products/${productId}`);
      const payload = await response.json();
      if (!payload?.success) {
        setCatalogState((current) => ({
          ...current,
          error: parseApiErrorMessage(payload, 'Failed to load product variants.'),
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
      console.error('[AutomaticPromotionsWorkspace] failed to load product detail', error);
      setCatalogState((current) => ({
        ...current,
        error: 'Failed to load product variants.',
      }));
    }
  }

  async function handleSavePromotion() {
    setSaving(true);
    setValidationIssues([]);
    setErrorMessage('');
    try {
      const payload = buildPromotionPayloadFromDraft(draft);
      const endpoint = draft.id ? `/api/promotions/${draft.id}` : '/api/promotions';
      const method = draft.id ? 'PATCH' : 'POST';
      const response = await fetch(endpoint, {
        method,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const responsePayload = await response.json();

      if (!response.ok || !responsePayload?.success) {
        if (response.status === 422) {
          setValidationIssues(extractPromotionValidationIssues(responsePayload?.details));
        }
        setErrorMessage(parseApiErrorMessage(responsePayload, 'Failed to save promotion.'));
        return;
      }

      setDrawerOpen(false);
      resetDrawerState(createPromotionDraft());
      await loadPromotions();
    } catch (error) {
      console.error('[AutomaticPromotionsWorkspace] failed to save promotion', error);
      setErrorMessage('Failed to save promotion.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDisablePromotion(promotionId) {
    const confirmed = window.confirm(
      'Disable this promotion? It will stop applying at checkout, but past orders will keep their promotion history.'
    );
    if (!confirmed) return;

    setErrorMessage('');
    try {
      const response = await fetch(`/api/promotions/${promotionId}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!payload?.success) {
        setErrorMessage(parseApiErrorMessage(payload, 'Failed to disable promotion.'));
        return;
      }
      await loadPromotions();
    } catch (error) {
      console.error('[AutomaticPromotionsWorkspace] failed to disable promotion', error);
      setErrorMessage('Failed to disable promotion.');
    }
  }

  return (
    <div className={styles.workspace}>
      {errorMessage ? <p className={styles.errorBanner}>{errorMessage}</p> : null}

      <AdminToolbar>
        <AdminInput
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search automatic promotions..."
          type="search"
          value={search}
        />
        <AdminSelect onChange={setStatusFilter} options={STATUS_FILTER_OPTIONS} value={statusFilter} />
        <AdminSelect onChange={setTypeFilter} options={TYPE_FILTER_OPTIONS} value={typeFilter} />
      </AdminToolbar>

      {!hideCreateAction ? (
        <div className={styles.createRow}>
          <AdminButton onClick={openCreateDrawer} size="sm" variant="primary">
            Create promotion
          </AdminButton>
        </div>
      ) : null}

      <AdminTable
        columns={[
          { key: 'name', header: 'Name', render: (promotion) => promotion.name },
          {
            key: 'method',
            header: 'Method',
            render: () => 'Automatic',
          },
          {
            key: 'type',
            header: 'Type',
            render: (promotion) => formatPromotionTypeLabel(promotion.type),
          },
          {
            key: 'status',
            header: 'Status',
            render: (promotion) => (
              <AdminStatusChip tone={getPromotionStatusTone(promotion.status)}>
                {formatPromotionStatusLabel(promotion.status)}
              </AdminStatusChip>
            ),
          },
          {
            key: 'usage',
            header: 'Usage',
            render: (promotion) => {
              const usageLimit = promotion.usageLimit == null ? 'No cap' : promotion.usageLimit;
              return `${promotion.usageCount || 0} / ${usageLimit}`;
            },
          },
          {
            key: 'updatedAt',
            header: 'Updated',
            render: (promotion) =>
              promotion.updatedAt ? new Date(promotion.updatedAt).toLocaleDateString() : '-',
          },
          {
            key: 'actions',
            header: 'Actions',
            render: (promotion) => (
              <div className={styles.rowActions}>
                <AdminButton
                  onClick={(event) => {
                    event.stopPropagation();
                    void openEditDrawer(promotion.id);
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Edit
                </AdminButton>
                <AdminButton
                  onClick={(event) => {
                    event.stopPropagation();
                    void handleDisablePromotion(promotion.id);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  Disable
                </AdminButton>
              </div>
            ),
          },
        ]}
        emptyDescription="Create product group discounts, Buy X Get Y offers, or free gift promotions."
        emptyTitle="No automatic promotions yet."
        isLoading={loading}
        onRowClick={(promotion) => {
          void openEditDrawer(promotion.id);
        }}
        rows={promotions}
      />

      <AdminDrawer
        actions={(
          <>
            <AdminButton
              disabled={saving}
              onClick={() => {
                setDrawerOpen(false);
              }}
              size="sm"
              variant="ghost"
            >
              Cancel
            </AdminButton>
            <AdminButton
              className={styles.drawerSubmitButton}
              disabled={!canSubmitPromotion}
              loading={saving}
              onClick={handleSavePromotion}
              size="sm"
              title={
                canSubmitPromotion
                  ? undefined
                  : 'Add a name, qualifier variants, and required reward/value fields before saving.'
              }
              variant="primary"
            >
              {isEditMode ? 'Save promotion' : 'Create promotion'}
            </AdminButton>
          </>
        )}
        contextItems={[
          { label: 'Promotions' },
          { label: 'Automatic' },
          { current: true, label: draft.name || (isEditMode ? 'Edit promotion' : 'New promotion') },
        ]}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        subtitle="Review the promotion details, reward logic, and scheduling before saving."
        title={isEditMode ? 'Edit promotion' : 'Create promotion'}
      >
        <div className={styles.drawerBody}>
          <SmartPromotionFormSections
            catalogState={catalogState}
            draft={draft}
            onAddVariant={addVariantToSelection}
            onCatalogQueryChange={(value) =>
              setCatalogState((current) => ({
                ...current,
                query: value,
              }))
            }
            onLoadProductDetail={loadProductDetail}
            onRemoveSelection={removeSelection}
            onSearchCatalog={searchCatalog}
            onTypeChange={onTypeChange}
            onUpdateDraft={updateDraft}
            onUpdateSelectionQuantity={updateSelectionQuantity}
            showTypeCards
            validationIssues={validationIssues}
          />
        </div>
      </AdminDrawer>
    </div>
  );
}
