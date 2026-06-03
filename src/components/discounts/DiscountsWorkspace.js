"use client";

import { useMemo, useState } from 'react';
import AppShell from '../AppShell';
import { useDiscounts } from '../../context/DiscountsContext';
import { DISCOUNT_METHODS, DISCOUNT_STATUSES, DISCOUNT_TYPES } from '../../lib/discountsData';
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
import AutomaticPromotionsWorkspace, {
  createPromotionCatalogState,
  SmartPromotionFormSections,
} from './AutomaticPromotionsWorkspace';
import styles from './DiscountsWorkspace.module.css';
import {
  buildPromotionPayloadFromDraft,
  buildPromotionPreview,
  canSubmitPromotionDraft,
  createPromotionDraft,
  extractPromotionValidationIssues,
} from './promotions-ui.helpers';

const LEGACY_DISCOUNT_METHODS = ['amount off products', 'amount off order', 'free shipping'];
const BROWSE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'discount-codes', label: 'Discount codes' },
  { id: 'automatic', label: 'Automatic' },
];
const CREATE_STEPS = ['type', 'details', 'schedule'];
const OFFER_TYPE_DEFINITIONS = [
  {
    id: 'amount-off-products',
    badge: 'Code or automatic',
    description: 'Discount specific products or variants.',
    example: 'Example: 15% off selected shirts.',
    flow: 'legacy',
    legacyMethod: 'amount off products',
    title: 'Amount off products',
  },
  {
    id: 'amount-off-order',
    badge: 'Code or automatic',
    description: 'Discount the order subtotal.',
    example: 'Example: $10 off orders over $75.',
    flow: 'legacy',
    legacyMethod: 'amount off order',
    title: 'Amount off order',
  },
  {
    id: 'free-shipping',
    badge: 'Code',
    description: 'Remove shipping cost with a customer-entered code.',
    example: 'Example: FREESHIP.',
    flow: 'legacy',
    legacyMethod: 'free shipping',
    title: 'Free shipping',
  },
  {
    id: 'product-group-discount',
    badge: 'Automatic',
    description: 'Discount selected products when bought together.',
    example: 'Example: Buy Hoodie + Hat and save 15%.',
    flow: 'smart',
    promotionType: 'PRODUCT_GROUP_DISCOUNT',
    title: 'Product group discount',
  },
  {
    id: 'buy-x-get-y',
    badge: 'Automatic',
    description: 'Discount a reward product when qualifying products are also in the cart.',
    example: 'Example: Buy a Hoodie, get a Hat 50% off.',
    flow: 'smart',
    note: 'Reward item must already be in cart.',
    promotionType: 'BUY_X_GET_Y',
    title: 'Buy X Get Y',
  },
  {
    id: 'free-gift',
    badge: 'Automatic',
    description: 'Make selected reward products free when qualifying products are also in the cart.',
    example: 'Example: Buy a Hoodie, get a Sticker Pack free.',
    flow: 'smart',
    note: 'Gift item must already be in cart.',
    promotionType: 'FREE_GIFT',
    title: 'Free gift',
  },
];

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

export default function DiscountsWorkspace() {
  const { discounts, addDiscount, updateDiscount } = useDiscounts();
  const [browseFilter, setBrowseFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [selectedDiscountId, setSelectedDiscountId] = useState(discounts[0]?.id || null);
  const [builderMode, setBuilderMode] = useState(null);
  const [draftDiscount, setDraftDiscount] = useState(null);
  const [createDrawerOpen, setCreateDrawerOpen] = useState(false);
  const [createStep, setCreateStep] = useState('type');
  const [selectedPromotionType, setSelectedPromotionType] = useState(null);
  const [smartDraft, setSmartDraft] = useState(() => createPromotionDraft());
  const [smartSaving, setSmartSaving] = useState(false);
  const [smartValidationIssues, setSmartValidationIssues] = useState([]);
  const [smartErrorMessage, setSmartErrorMessage] = useState('');
  const [smartCatalogState, setSmartCatalogState] = useState(() => createPromotionCatalogState());
  const [automaticPromotionRefreshToken, setAutomaticPromotionRefreshToken] = useState(0);

  const visibleDiscounts = useMemo(() => discounts.filter((discount) => {
    const searchMatch = [discount.title, discount.method, discount.summary].join(' ').toLowerCase().includes(searchQuery.trim().toLowerCase());
    const typeMatch = typeFilter === 'all' || discount.type === typeFilter;
    const statusMatch = statusFilter === 'all' || discount.status === statusFilter;
    const methodMatch = methodFilter === 'all' || discount.method === methodFilter;
    return searchMatch && typeMatch && statusMatch && methodMatch;
  }), [discounts, searchQuery, statusFilter, typeFilter, methodFilter]);

  const selectedDiscount = visibleDiscounts.find((discount) => discount.id === selectedDiscountId) || discounts.find((discount) => discount.id === selectedDiscountId) || null;
  const selectedOfferDefinition = OFFER_TYPE_DEFINITIONS.find((offer) => offer.id === selectedPromotionType) || null;
  const isLegacyCreate = selectedOfferDefinition?.flow === 'legacy';
  const isSmartCreate = selectedOfferDefinition?.flow === 'smart';
  const canSubmitSmartPromotion = useMemo(() => canSubmitPromotionDraft(smartDraft), [smartDraft]);
  const typeOptions = [{ value: 'all', label: 'All types' }, ...DISCOUNT_TYPES.map((type) => ({ value: type, label: type }))];
  const statusOptions = [{ value: 'all', label: 'All status' }, ...DISCOUNT_STATUSES.map((status) => ({ value: status, label: status }))];
  const methodOptions = [{ value: 'all', label: 'All methods' }, ...DISCOUNT_METHODS.map((method) => ({ value: method, label: method }))];
  const valueTypeOptions = [
    { value: 'percentage', label: 'Percentage' },
    { value: 'fixed', label: 'Fixed amount' },
  ];
  const requirementTypeOptions = [
    { value: 'none', label: 'None' },
    { value: 'subtotal', label: 'Minimum purchase amount' },
    { value: 'quantity', label: 'Minimum quantity of items' },
  ];

  function resetCreateFlow() {
    setCreateDrawerOpen(false);
    setCreateStep('type');
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
    setCreateStep('type');
    setSelectedPromotionType(null);
    setDraftDiscount(null);
    setSmartDraft(createPromotionDraft());
    setSmartSaving(false);
    setSmartValidationIssues([]);
    setSmartErrorMessage('');
    setSmartCatalogState(createPromotionCatalogState());
  }

  function openEditor(discount) {
    setBuilderMode(discount.type);
    setDraftDiscount({ ...discount });
    setSelectedDiscountId(discount.id);
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

    setSelectedDiscountId(nextDiscount.id);
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

      setAutomaticPromotionRefreshToken((current) => current + 1);
      setBrowseFilter('automatic');
      resetCreateFlow();
    } catch (error) {
      console.error('[DiscountsWorkspace] failed to save smart promotion', error);
      setSmartErrorMessage('Failed to save promotion.');
    } finally {
      setSmartSaving(false);
    }
  }

  async function searchSmartCatalog() {
    setSmartCatalogState((current) => ({
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
      if (smartCatalogState.query.trim()) {
        query.set('search', smartCatalogState.query.trim());
      }

      const response = await fetch(`/api/products?${query.toString()}`);
      const payload = await response.json();
      if (!payload?.success) {
        setSmartCatalogState((current) => ({
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
      setSmartCatalogState((current) => ({
        ...current,
        rows: physicalProducts,
        loading: false,
      }));
    } catch (error) {
      console.error('[DiscountsWorkspace] catalog search failed', error);
      setSmartCatalogState((current) => ({
        ...current,
        rows: [],
        error: 'Failed to search product catalog.',
        loading: false,
      }));
    }
  }

  async function loadSmartProductDetail(productId) {
    if (smartCatalogState.productDetailsById[productId]) return;

    try {
      const response = await fetch(`/api/products/${productId}`);
      const payload = await response.json();
      if (!payload?.success) {
        setSmartCatalogState((current) => ({
          ...current,
          error: payload?.error || 'Failed to load product variants.',
        }));
        return;
      }

      setSmartCatalogState((current) => ({
        ...current,
        productDetailsById: {
          ...current.productDetailsById,
          [productId]: payload.data,
        },
      }));
    } catch (error) {
      console.error('[DiscountsWorkspace] failed to load product detail', error);
      setSmartCatalogState((current) => ({
        ...current,
        error: 'Failed to load product variants.',
      }));
    }
  }

  function updateSmartDraft(field, value) {
    setSmartDraft((current) => ({ ...current, [field]: value }));
    setSmartValidationIssues([]);
  }

  function removeSmartSelection(section, variantId) {
    setSmartDraft((current) => ({
      ...current,
      [section]: current[section].filter((row) => row.variantId !== variantId),
    }));
  }

  function updateSmartSelectionQuantity(section, variantId, quantity) {
    const nextQuantity = Number.isFinite(quantity) ? Math.max(1, Math.round(quantity)) : 1;
    setSmartDraft((current) => ({
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

  function addSmartVariantToSelection(section, product, variant) {
    if (product.fulfillmentType !== 'PHYSICAL') {
      setSmartCatalogState((current) => ({
        ...current,
        error: 'Only physical variants are eligible for Smart Promotions in V1.',
      }));
      return;
    }

    setSmartCatalogState((current) => ({ ...current, error: '' }));
    setSmartDraft((current) => {
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

  const createDrawerActions = (() => {
    if (createStep === 'type') {
      return (
        <>
          <AdminButton onClick={resetCreateFlow} size="sm" variant="ghost">
            Cancel
          </AdminButton>
          <AdminButton
            disabled={!selectedOfferDefinition}
            onClick={() => setCreateStep('details')}
            size="sm"
            variant="primary"
          >
            Continue
          </AdminButton>
        </>
      );
    }

    if (createStep === 'details') {
      return (
        <>
          <AdminButton onClick={() => setCreateStep('type')} size="sm" variant="ghost">
            Back
          </AdminButton>
          <AdminButton onClick={() => setCreateStep('schedule')} size="sm" variant="primary">
            Continue
          </AdminButton>
        </>
      );
    }

    return (
      <>
        <AdminButton onClick={() => setCreateStep('details')} size="sm" variant="ghost">
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
        <p className={styles.helperCopy}>
          Browse discount codes and automatic offers from one promotions workspace.
        </p>

        {browseFilter !== 'automatic' ? (
          <AdminCard className={styles.panel} variant="panel">
            {browseFilter === 'all' ? (
              <div className={styles.sectionIntro}>
                <h2>Discount codes</h2>
                <p>Customer-entered codes for order, product, or shipping discounts.</p>
              </div>
            ) : null}
            <AdminToolbar>
              <AdminInput onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search discount codes..." type="search" value={searchQuery} />
              <AdminSelect onChange={setTypeFilter} options={typeOptions} value={typeFilter} />
              <AdminSelect onChange={setStatusFilter} options={statusOptions} value={statusFilter} />
              <AdminSelect onChange={setMethodFilter} options={methodOptions} value={methodFilter} />
            </AdminToolbar>

            {visibleDiscounts.length ? (
              <AdminTable
                columns={[
                  { key: 'title', header: 'Name', render: (discount) => discount.title },
                  { key: 'methodType', header: 'Method', render: () => 'Code' },
                  { key: 'summary', header: 'Type', render: (discount) => discount.method },
                  { key: 'status', header: 'Status', render: (discount) => <AdminStatusChip tone={discount.status === 'active' ? 'success' : discount.status === 'scheduled' ? 'warning' : 'neutral'}>{discount.status}</AdminStatusChip> },
                  { key: 'usage', header: 'Usage', render: (discount) => `${discount.usageCount || 0} / ${discount.usageLimit || 'No cap'}` },
                  { key: 'updated', header: 'Updated', render: () => 'Draft session' },
                ]}
                onRowClick={(discount) => setSelectedDiscountId(discount.id)}
                rows={visibleDiscounts}
                selectedId={selectedDiscount?.id || null}
              />
            ) : (
              <AdminEmptyState
                actionLabel="Create promotion"
                description="Create a code discount to start promotions."
                icon="sell"
                onAction={openCreateFlow}
                title="No discount codes yet"
              />
            )}
            {selectedDiscount ? (
              <AdminFormSection description="Current discount configuration and performance" eyebrow="Discount detail" title={selectedDiscount.title}>
                <div className={styles.detailGrid}>
                  <div><strong>Method:</strong> Code</div>
                  <div><strong>Type:</strong> {selectedDiscount.method}</div>
                  <div><strong>Status:</strong> {selectedDiscount.status}</div>
                  <div><strong>Usage:</strong> {selectedDiscount.usageCount || 0}</div>
                  <div><strong>Customer eligibility:</strong> {selectedDiscount.customerEligibility}</div>
                  <div><strong>Sales channels:</strong> {selectedDiscount.salesChannel}</div>
                </div>
                <div className={styles.detailActions}><AdminButton onClick={() => openEditor(selectedDiscount)} size="sm" variant="secondary">Edit discount</AdminButton></div>
              </AdminFormSection>
            ) : null}
          </AdminCard>
        ) : null}

        {browseFilter !== 'discount-codes' ? (
          <AdminCard className={styles.panel} variant="panel">
            {browseFilter === 'all' ? (
              <div className={styles.sectionIntro}>
                <h2>Automatic offers</h2>
                <p>Cart-aware Smart Promotions powered by the existing promotions service.</p>
              </div>
            ) : null}
            <AutomaticPromotionsWorkspace
              externalCreateToken={automaticPromotionRefreshToken}
              hideCreateAction
            />
          </AdminCard>
        ) : null}

        <AdminDrawer
          actions={createDrawerActions}
          contextItems={[
            { label: 'Promotions' },
            { label: 'Create promotion' },
            { current: true, label: createStep === 'type' ? 'Type' : createStep === 'details' ? 'Details' : 'Schedule & publish' },
          ]}
          onClose={resetCreateFlow}
          open={createDrawerOpen}
          subtitle={
            createStep === 'type'
              ? 'Choose how this offer should work.'
              : createStep === 'details'
                ? 'Add the offer details based on the promotion type you selected.'
                : 'Set timing, limits, and review what customers will experience.'
          }
          title="Create promotion"
        >
          <div className={styles.drawerBody}>
            {createStep === 'type' ? (
              <AdminFormSection
                description="Choose how this offer should work."
                eyebrow="Type"
                title="Choose your promotion type"
              >
                <div className={styles.offerChoiceGrid}>
                  {OFFER_TYPE_DEFINITIONS.map((offer) => (
                    <button
                      aria-pressed={selectedPromotionType === offer.id}
                      className={`${styles.offerChoiceCard} ${selectedPromotionType === offer.id ? styles.offerChoiceCardActive : ''}`}
                      key={offer.id}
                      onClick={() => onSelectOfferType(offer.id)}
                      type="button"
                    >
                      <div className={styles.offerChoiceTopRow}>
                        <div className={styles.offerChoiceHeader}>
                          <span className={styles.offerChoiceRadio} aria-hidden="true" />
                          <strong>{offer.title}</strong>
                        </div>
                        <span className={styles.offerChoiceBadge}>{offer.badge}</span>
                      </div>
                      <p>{offer.description}</p>
                      <small>{offer.example}</small>
                      {offer.note ? <small>{offer.note}</small> : null}
                    </button>
                  ))}
                </div>
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
              </>
            ) : null}

            {createStep === 'details' && isSmartCreate ? (
              <>
                {smartErrorMessage ? <p className={styles.errorBanner}>{smartErrorMessage}</p> : null}
                <SmartPromotionFormSections
                  catalogState={smartCatalogState}
                  draft={smartDraft}
                  onAddVariant={addSmartVariantToSelection}
                  onCatalogQueryChange={(value) =>
                    setSmartCatalogState((current) => ({
                      ...current,
                      query: value,
                    }))
                  }
                  onLoadProductDetail={loadSmartProductDetail}
                  onRemoveSelection={removeSmartSelection}
                  onSearchCatalog={searchSmartCatalog}
                  onUpdateDraft={updateSmartDraft}
                  onUpdateSelectionQuantity={updateSmartSelectionQuantity}
                  validationIssues={smartValidationIssues}
                  visibleSections={['offer-details', 'qualifiers', 'qualifier-catalog', 'reward-settings', 'reward-catalog']}
                />
              </>
            ) : null}

            {createStep === 'schedule' && isLegacyCreate && draftDiscount ? (
              <>
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

            {createStep === 'schedule' && isSmartCreate ? (
              <>
                {smartErrorMessage ? <p className={styles.errorBanner}>{smartErrorMessage}</p> : null}
                <SmartPromotionFormSections
                  catalogState={smartCatalogState}
                  draft={smartDraft}
                  onAddVariant={addSmartVariantToSelection}
                  onCatalogQueryChange={(value) =>
                    setSmartCatalogState((current) => ({
                      ...current,
                      query: value,
                    }))
                  }
                  onLoadProductDetail={loadSmartProductDetail}
                  onRemoveSelection={removeSmartSelection}
                  onSearchCatalog={searchSmartCatalog}
                  onUpdateDraft={updateSmartDraft}
                  onUpdateSelectionQuantity={updateSmartSelectionQuantity}
                  validationIssues={smartValidationIssues}
                  visibleSections={['schedule', 'preview']}
                />
                <AdminFormSection
                  description="Preview the cart behavior in plain English."
                  eyebrow="Summary"
                  title="Promotion summary"
                >
                  <p className={styles.previewText}>{buildPromotionPreview(smartDraft)}</p>
                </AdminFormSection>
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
      </AdminPage>
    </AppShell>
  );
}
