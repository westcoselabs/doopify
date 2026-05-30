"use client";

import { useCallback, useEffect, useMemo, useState } from 'react';
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

const TYPE_CARD_COPY = {
  PRODUCT_GROUP_DISCOUNT: {
    description: 'Discount selected products when they are bought together.',
    example: 'Buy Hoodie + Hat together and save 15%.',
    title: 'Product group discount',
  },
  BUY_X_GET_Y: {
    description: 'Discount reward products when qualifying products are also in the cart.',
    example: 'Buy a Hoodie, get a Hat 50% off.',
    title: 'Buy X Get Y',
  },
  FREE_GIFT: {
    description: 'Make selected reward products free when qualifying products are also in the cart.',
    example: 'Buy a Hoodie and get a Sticker Pack free.',
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

export default function AutomaticPromotionsWorkspace() {
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
  const [catalogQuery, setCatalogQuery] = useState('');
  const [catalogRows, setCatalogRows] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError, setCatalogError] = useState('');
  const [productDetailsById, setProductDetailsById] = useState({});
  const isEditMode = Boolean(draft.id);
  const validationByPath = useMemo(() => {
    const grouped = {};
    for (const issue of validationIssues) {
      const key = String(issue.path || 'general');
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(issue.message || 'Invalid value');
    }
    return grouped;
  }, [validationIssues]);
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

  function resetDrawerState(nextDraft) {
    setDraft(nextDraft);
    setValidationIssues([]);
    setCatalogRows([]);
    setCatalogQuery('');
    setCatalogError('');
    setProductDetailsById({});
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
    setDraft((current) => ({
      ...createPromotionDraft(nextType),
      ...current,
      type: nextType,
      rewards: nextType === 'PRODUCT_GROUP_DISCOUNT' ? [] : current.rewards,
      rewardType: nextType === 'FREE_GIFT' ? 'FREE' : current.rewardType,
      value: nextType === 'FREE_GIFT' ? '0' : current.value,
    }));
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
      setCatalogError('Only physical variants are eligible for Smart Promotions in V1.');
      return;
    }

    setCatalogError('');
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
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const query = new URLSearchParams({
        page: '1',
        pageSize: '20',
        status: 'ACTIVE',
      });
      if (catalogQuery.trim()) {
        query.set('search', catalogQuery.trim());
      }

      const response = await fetch(`/api/products?${query.toString()}`);
      const payload = await response.json();
      if (!payload?.success) {
        setCatalogRows([]);
        setCatalogError(parseApiErrorMessage(payload, 'Failed to search product catalog.'));
        return;
      }

      const physicalProducts = (payload.data?.products || []).filter(
        (product) => (product.fulfillmentType || 'PHYSICAL') === 'PHYSICAL'
      );
      setCatalogRows(physicalProducts);
    } catch (error) {
      console.error('[AutomaticPromotionsWorkspace] catalog search failed', error);
      setCatalogRows([]);
      setCatalogError('Failed to search product catalog.');
    } finally {
      setCatalogLoading(false);
    }
  }

  async function loadProductDetail(productId) {
    if (productDetailsById[productId]) return;

    try {
      const response = await fetch(`/api/products/${productId}`);
      const payload = await response.json();
      if (!payload?.success) {
        setCatalogError(parseApiErrorMessage(payload, 'Failed to load product variants.'));
        return;
      }

      setProductDetailsById((current) => ({
        ...current,
        [productId]: payload.data,
      }));
    } catch (error) {
      console.error('[AutomaticPromotionsWorkspace] failed to load product detail', error);
      setCatalogError('Failed to load product variants.');
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

  const topValidationMessages = validationByPath.general || [];

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

      <div className={styles.createRow}>
        <AdminButton onClick={openCreateDrawer} size="sm" variant="primary">
          Create automatic promotion
        </AdminButton>
      </div>

      <AdminTable
        columns={[
          { key: 'name', header: 'Name', render: (promotion) => promotion.name },
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
            key: 'reward',
            header: 'Reward',
            render: (promotion) =>
              formatRewardSummary({
                rewardType: promotion.rewardType,
                type: promotion.type,
                value: Number(promotion.value || 0),
              }),
          },
          { key: 'qualifierCount', header: 'Qualifiers', render: (promotion) => promotion.qualifierCount || 0 },
          { key: 'rewardCount', header: 'Rewards', render: (promotion) => promotion.rewardCount || 0 },
          {
            key: 'usage',
            header: 'Usage',
            render: (promotion) => {
              const usageLimit = promotion.usageLimit == null ? 'No cap' : promotion.usageLimit;
              return `${promotion.usageCount || 0} / ${usageLimit}`;
            },
          },
          { key: 'priority', header: 'Priority', render: (promotion) => promotion.priority },
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
          { label: 'Discounts & Promotions' },
          { label: 'Automatic promotions' },
          { current: true, label: draft.name || (isEditMode ? 'Edit promotion' : 'New promotion') },
        ]}
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        tabs={[
          {
            id: 'type',
            label: 'Promotion type',
            content: (
              <div className={styles.drawerBody}>
                <AdminFormSection
                  description="Choose a Smart Promotion type for this rule."
                  eyebrow="Step 1"
                  title="Promotion type"
                >
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
                          <strong>{copy.title}</strong>
                          <p>{copy.description}</p>
                          <small>{copy.example}</small>
                        </button>
                      );
                    })}
                  </div>
                </AdminFormSection>
              </div>
            ),
          },
          {
            id: 'buys',
            label: 'Customer buys',
            content: (
              <div className={styles.drawerBody}>
                <AdminFormSection
                  description="Select qualifier variants customers must have in their cart."
                  eyebrow="Step 2"
                  title="Customer buys"
                >
                  <VariantRowList
                    emptyText="No qualifier variants selected yet."
                    fieldLabel="Qualifier variants"
                    onChangeQuantity={(variantId, quantity) =>
                      updateSelectionQuantity('qualifiers', variantId, quantity)
                    }
                    onRemove={(variantId) => removeSelection('qualifiers', variantId)}
                    quantityLabel="Required quantity"
                    rows={draft.qualifiers}
                  />
                </AdminFormSection>
                <AdminFormSection
                  description="Search products and load variants to add qualifiers."
                  eyebrow="Catalog"
                  title="Add qualifier variants"
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
                    {!catalogLoading && !catalogRows.length ? (
                      <p className={styles.inlineHint}>Search to find products and variants.</p>
                    ) : null}
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
                                  <AdminButton
                                    onClick={() => addVariantToSelection('qualifiers', detail, variant)}
                                    size="sm"
                                    variant="secondary"
                                  >
                                    Add qualifier
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
              </div>
            ),
          },
          {
            id: 'gets',
            label: 'Customer gets',
            content: (
              <div className={styles.drawerBody}>
                <AdminFormSection
                  description={
                    draft.type === 'PRODUCT_GROUP_DISCOUNT'
                      ? 'Product group discounts apply to the selected qualifier products only in V1.'
                      : 'Select reward variants customers can receive when qualifiers are also in cart.'
                  }
                  eyebrow="Step 3"
                  title="Customer gets"
                >
                  {draft.type === 'PRODUCT_GROUP_DISCOUNT' ? (
                    <p className={styles.inlineHint}>
                      Reward product rows are not supported for product group discounts in Smart Promotions V1.
                    </p>
                  ) : (
                    <VariantRowList
                      emptyText="No reward variants selected yet."
                      fieldLabel="Reward variants"
                      onChangeQuantity={(variantId, quantity) =>
                        updateSelectionQuantity('rewards', variantId, quantity)
                      }
                      onRemove={(variantId) => removeSelection('rewards', variantId)}
                      quantityLabel="Reward quantity"
                      rows={draft.rewards}
                    />
                  )}

                  {draft.type === 'BUY_X_GET_Y' ? (
                    <p className={styles.inlineHint}>
                      Reward items must already be in the customer&apos;s cart. Auto-add gifts are not enabled in V1.
                    </p>
                  ) : null}
                  {draft.type === 'FREE_GIFT' ? (
                    <p className={styles.inlineHint}>
                      The free gift must already be in the customer&apos;s cart. Auto-add gifts are not enabled in V1.
                    </p>
                  ) : null}
                </AdminFormSection>

                {draft.type !== 'PRODUCT_GROUP_DISCOUNT' ? (
                  <AdminFormSection
                    description="Search products and load variants to add rewards."
                    eyebrow="Catalog"
                    title="Add reward variants"
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
                      {!catalogLoading && !catalogRows.length ? (
                        <p className={styles.inlineHint}>Search to find products and variants.</p>
                      ) : null}
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
                                    <AdminButton
                                      onClick={() => addVariantToSelection('rewards', detail, variant)}
                                      size="sm"
                                      variant="secondary"
                                    >
                                      Add reward
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
                ) : null}

                <AdminFormSection
                  description={
                    draft.type === 'PRODUCT_GROUP_DISCOUNT'
                      ? 'Set the discount method and value applied to selected qualifier products.'
                      : 'Set the reward method and value for this promotion.'
                  }
                  eyebrow="Reward"
                  title={draft.type === 'PRODUCT_GROUP_DISCOUNT' ? 'Discount settings' : 'Reward settings'}
                >
                  <div className={styles.formGrid}>
                    <AdminField label="Reward type">
                      <AdminSelect
                        onChange={(value) => updateDraft('rewardType', value)}
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
                        onChange={(event) => updateDraft('value', event.target.value)}
                        placeholder={draft.rewardType === 'PERCENTAGE' ? '15' : '5.00'}
                        type="number"
                        value={draft.type === 'FREE_GIFT' ? '0' : draft.value}
                      />
                    </AdminField>
                  </div>
                </AdminFormSection>
              </div>
            ),
          },
          {
            id: 'limits',
            label: 'Limits & schedule',
            content: (
              <div className={styles.drawerBody}>
                <AdminFormSection
                  description="Configure activation status, schedule, and run priority."
                  eyebrow="Step 4"
                  title="Limits and schedule"
                >
                  <div className={styles.formGrid}>
                    <AdminField label="Name">
                      <AdminInput
                        onChange={(event) => updateDraft('name', event.target.value)}
                        placeholder="Hoodie + Hat bundle savings"
                        value={draft.name}
                      />
                      {validationByPath.name?.length ? (
                        <small className={styles.fieldError}>{validationByPath.name[0]}</small>
                      ) : null}
                    </AdminField>
                    <AdminField label="Status">
                      <AdminSelect onChange={(value) => updateDraft('status', value)} options={STATUS_OPTIONS} value={draft.status} />
                    </AdminField>
                    <AdminField label="Starts at">
                      <AdminInput
                        onChange={(event) => updateDraft('startsAt', event.target.value)}
                        type="datetime-local"
                        value={draft.startsAt}
                      />
                    </AdminField>
                    <AdminField label="Ends at">
                      <AdminInput
                        onChange={(event) => updateDraft('endsAt', event.target.value)}
                        type="datetime-local"
                        value={draft.endsAt}
                      />
                    </AdminField>
                    <AdminField label="Usage limit">
                      <AdminInput
                        min="0"
                        onChange={(event) => updateDraft('usageLimit', event.target.value)}
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
                        onChange={(event) => updateDraft('priority', event.target.value)}
                        type="number"
                        value={draft.priority}
                      />
                    </AdminField>
                  </div>
                </AdminFormSection>
              </div>
            ),
          },
          {
            id: 'summary',
            label: 'Summary',
            content: (
              <div className={styles.drawerBody}>
                <AdminFormSection
                  description="Review Smart Promotions behavior before saving."
                  eyebrow="Step 5"
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
                      <strong>Qualifiers:</strong> {rowsToNameSummary(draft.qualifiers)}
                    </p>
                    <p>
                      <strong>Rewards:</strong>{' '}
                      {draft.type === 'PRODUCT_GROUP_DISCOUNT'
                        ? 'Not used in V1'
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
              </div>
            ),
          },
        ]}
        title={isEditMode ? 'Edit automatic promotion' : 'Create automatic promotion'}
      />
    </div>
  );
}
