"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AdminButton from '../admin/ui/AdminButton';
import AdminDrawer from '../admin/ui/AdminDrawer';
import AdminField from '../admin/ui/AdminField';
import AdminFormSection from '../admin/ui/AdminFormSection';
import AdminInput from '../admin/ui/AdminInput';
import AdminSchedulePopover from '../admin/ui/AdminSchedulePopover';
import AdminSelect from '../admin/ui/AdminSelect';
import AdminStatusChip from '../admin/ui/AdminStatusChip';
import AdminTable from '../admin/ui/AdminTable';
import AdminToolbar from '../admin/ui/AdminToolbar';
import PromotionVariantCommandPicker from './PromotionVariantCommandPicker';
import PromotionVariantSelectionList from './PromotionVariantSelectionList';
import styles from './AutomaticPromotionsWorkspace.module.css';
import {
  appendPromotionPendingSelections,
  beginPromotionCatalogSearch,
  buildPromotionListQuery,
  buildPromotionPayloadFromDraft,
  buildPromotionPreview,
  canSubmitPromotionDraft,
  closePromotionCatalogState,
  createPromotionCatalogState,
  createPromotionDraft,
  disablePromotionById,
  extractPromotionValidationIssues,
  fetchPromotionCatalogProductDetail,
  formatPromotionStatusLabel,
  formatPromotionTypeLabel,
  fetchPromotionCatalogProducts,
  formatRewardSummary,
  getPromotionCatalogSectionState,
  getPromotionStatusTone,
  normalizePromotionDraftForType,
  openPromotionCatalogSection,
  PROMOTION_STATUSES,
  PROMOTION_TYPES,
  removePromotionSelectionRow,
  resolvePromotionCatalogProductDetailSuccess,
  resolvePromotionCatalogSearchError,
  resolvePromotionCatalogSearchSuccess,
  shouldFetchPromotionCatalog,
  shouldLoadPromotionCatalogOnOpen,
  toDraftFromDetail,
  togglePromotionPendingSelection as togglePromotionCatalogPendingSelection,
  updatePromotionSelectionRowQuantity,
  updatePromotionCatalogQuery,
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

function PromotionVariantPicker({
  addButtonLabel,
  browseButtonLabel,
  catalogError,
  catalogEligibleCount,
  catalogLoading,
  catalogProductDetailsById,
  catalogQuery,
  catalogRows,
  catalogTotalCount,
  emptyText,
  onAddSelected,
  onBrowse,
  onCancel,
  onOpenChange,
  onSearch,
  onTogglePendingVariant,
  open,
  pendingSelections,
  pickerTitle,
  searchPlaceholder,
  section,
  selectedRows,
  setCatalogQuery,
}) {
  return (
    <PromotionVariantCommandPicker
      addButtonLabel={addButtonLabel}
      browseButtonLabel={browseButtonLabel}
      catalogError={catalogError}
      catalogEligibleCount={catalogEligibleCount}
      catalogLoading={catalogLoading}
      catalogProductDetailsById={catalogProductDetailsById}
      catalogQuery={catalogQuery}
      catalogRows={catalogRows}
      catalogTotalCount={catalogTotalCount}
      emptyText={emptyText}
      onAddSelected={onAddSelected}
      onBrowse={onBrowse}
      onCancel={onCancel}
      onOpenChange={onOpenChange}
      onSearch={onSearch}
      onTogglePendingVariant={onTogglePendingVariant}
      open={open}
      pendingSelections={pendingSelections}
      pickerTitle={pickerTitle}
      searchPlaceholder={searchPlaceholder}
      section={section}
      selectedRows={selectedRows}
      setCatalogQuery={setCatalogQuery}
    />
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

export function SmartPromotionFormSections({
  catalogState,
  draft,
  onAddPendingSelections,
  onCatalogQueryChange,
  onCancelPicker,
  onOpenPicker,
  onRemoveSelection,
  onSearchCatalog,
  onTogglePendingVariant,
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
  const qualifierCatalogState = getPromotionCatalogSectionState(catalogState, 'qualifiers');
  const rewardCatalogState = getPromotionCatalogSectionState(catalogState, 'rewards');
  const missingNameMessage = !draft.name.trim() ? 'Add a promotion name.' : '';
  const qualifierMessage =
    validationByPath.qualifiers?.[0] || (!draft.qualifiers.length ? 'Add at least one required cart item.' : '');
  const rewardMessage =
    validationByPath.rewards?.[0] || (showRewards && !draft.rewards.length ? 'Add at least one reward item.' : '');

  return (
    <>
      {visible.has('offer-details') ? (
        <AdminFormSection
          className={styles.offerDetailsCard}
          headerAction={(
            <AdminSelect
              ariaLabel="Status"
              className={styles.statusPill}
              onChange={(value) => onUpdateDraft('status', value)}
              options={STATUS_OPTIONS}
              value={draft.status}
            />
          )}
          title="Offer details"
          titleTooltip="Set the offer name and promotion status."
        >
          <div className={styles.nameFieldWrap}>
            <AdminField label="Name">
              <AdminInput
                onChange={(event) => onUpdateDraft('name', event.target.value)}
                placeholder="Hoodie + Hat bundle savings"
                value={draft.name}
              />
            </AdminField>
            {validationByPath.name?.length ? (
              <small className={styles.fieldError}>{validationByPath.name[0]}</small>
            ) : missingNameMessage ? (
              <small className={styles.inlineValidationHint}>{missingNameMessage}</small>
            ) : null}
          </div>
          {showTypeCards && onTypeChange ? <PromotionTypeCards draft={draft} onTypeChange={onTypeChange} /> : null}
        </AdminFormSection>
      ) : null}

      {visible.has('qualifiers') ? (
        <AdminFormSection
          title="Required cart items"
          titleTooltip="Choose the products customers must have in their cart for this promotion to apply."
        >
          <PromotionVariantSelectionList
            browseAction={(
              <PromotionVariantPicker
                addButtonLabel="Add selected"
                browseButtonLabel="Browse products"
                catalogError={qualifierCatalogState.error}
                catalogEligibleCount={qualifierCatalogState.eligibleResultCount}
                catalogLoading={qualifierCatalogState.loading}
                catalogProductDetailsById={qualifierCatalogState.productDetailsById}
                catalogQuery={qualifierCatalogState.query}
                catalogRows={qualifierCatalogState.rows}
                catalogTotalCount={qualifierCatalogState.totalResultCount}
                emptyText="Search to find physical products and choose variants."
                onAddSelected={() => onAddPendingSelections('qualifiers')}
                onBrowse={() => onOpenPicker('qualifiers')}
                onCancel={onCancelPicker}
                onOpenChange={(nextOpen) => {
                  if (!nextOpen) onCancelPicker();
                }}
                onSearch={() => onSearchCatalog('qualifiers')}
                onTogglePendingVariant={onTogglePendingVariant}
                open={catalogState.openSection === 'qualifiers'}
                pendingSelections={qualifierCatalogState.pendingSelections}
                pickerTitle="Browse products"
                searchPlaceholder="Search products..."
                section="qualifiers"
                selectedRows={draft.qualifiers}
                setCatalogQuery={(value) => onCatalogQueryChange('qualifiers', value)}
              />
            )}
            emptyHelper="Choose the products customers must have in cart."
            emptyTitle="No required items selected."
            onChangeQuantity={(variantId, quantity) => onUpdateSelectionQuantity('qualifiers', variantId, quantity)}
            onRemove={(variantId) => onRemoveSelection('qualifiers', variantId)}
            quantityLabel="Required quantity"
            rows={draft.qualifiers}
            title="Selected required items"
            validationMessage={qualifierMessage}
          />
        </AdminFormSection>
      ) : null}

      {visible.has('reward-settings') ? (
        <AdminFormSection
          title={
            draft.type === 'PRODUCT_GROUP_DISCOUNT'
              ? 'Discount settings'
              : draft.type === 'FREE_GIFT'
                ? 'Free item'
                : 'Reward items'
          }
          titleTooltip={
            draft.type === 'PRODUCT_GROUP_DISCOUNT'
              ? 'This discount applies to the required cart items selected above.'
              : draft.type === 'FREE_GIFT'
                ? 'Choose the product that becomes free when the required cart items are present.'
                : 'Choose the products that receive the discount when the required cart items are present.'
          }
        >
          {!showRewards ? (
            <p className={styles.inlineHint}>
              This discount applies to the required cart items selected above.
            </p>
          ) : (
            <PromotionVariantSelectionList
              browseAction={(
                <PromotionVariantPicker
                  addButtonLabel="Add selected"
                  browseButtonLabel="Browse rewards"
                  catalogError={rewardCatalogState.error}
                  catalogEligibleCount={rewardCatalogState.eligibleResultCount}
                  catalogLoading={rewardCatalogState.loading}
                  catalogProductDetailsById={rewardCatalogState.productDetailsById}
                  catalogQuery={rewardCatalogState.query}
                  catalogRows={rewardCatalogState.rows}
                  catalogTotalCount={rewardCatalogState.totalResultCount}
                  emptyText="Search to find physical reward products and choose variants."
                  onAddSelected={() => onAddPendingSelections('rewards')}
                  onBrowse={() => onOpenPicker('rewards')}
                  onCancel={onCancelPicker}
                  onOpenChange={(nextOpen) => {
                    if (!nextOpen) onCancelPicker();
                  }}
                  onSearch={() => onSearchCatalog('rewards')}
                  onTogglePendingVariant={onTogglePendingVariant}
                  open={catalogState.openSection === 'rewards'}
                  pendingSelections={rewardCatalogState.pendingSelections}
                  pickerTitle="Browse rewards"
                  searchPlaceholder="Search rewards..."
                  section="rewards"
                  selectedRows={draft.rewards}
                  setCatalogQuery={(value) => onCatalogQueryChange('rewards', value)}
                />
              )}
              emptyHelper="Choose what receives the discount."
              emptyTitle="No reward items selected."
              onChangeQuantity={(variantId, quantity) => onUpdateSelectionQuantity('rewards', variantId, quantity)}
              onRemove={(variantId) => onRemoveSelection('rewards', variantId)}
              quantityLabel="Reward quantity"
              rows={draft.rewards}
              title="Selected reward items"
              validationMessage={rewardMessage}
            />
          )}
          {draft.type === 'FREE_GIFT' ? null : (
            <div className={styles.formGrid}>
              <AdminField label={draft.type === 'PRODUCT_GROUP_DISCOUNT' ? 'Discount type' : 'Reward type'}>
                <AdminSelect
                  onChange={(value) => onUpdateDraft('rewardType', value)}
                  options={REWARD_TYPE_OPTIONS.filter((option) => option.value !== 'FREE')}
                  value={draft.rewardType}
                />
              </AdminField>
              <AdminField label="Value">
                <AdminInput
                  onChange={(event) => onUpdateDraft('value', event.target.value)}
                  placeholder={draft.rewardType === 'PERCENTAGE' ? '15' : '5.00'}
                  type="number"
                  value={draft.value}
                />
                {validationByPath.value?.length ? (
                  <small className={styles.fieldError}>{validationByPath.value[0]}</small>
                ) : null}
              </AdminField>
            </div>
          )}
        </AdminFormSection>
      ) : null}

      {visible.has('schedule') ? (
        <AdminFormSection
          title="Schedule & publish"
          titleTooltip="Set activation windows and usage cap."
        >
          <div className={styles.scheduleGrid}>
            <AdminField label="Starts at">
              <AdminSchedulePopover
                applyLabel="Set start date"
                nowLabel="Start now"
                onChange={(nextIso) => onUpdateDraft('startsAt', nextIso || '')}
                scheduledLabel="Start scheduled"
                showValueLabel
                triggerLabel="Choose start date"
                value={draft.startsAt}
              />
              {validationByPath.startsAt?.length ? (
                <small className={styles.fieldError}>{validationByPath.startsAt[0]}</small>
              ) : null}
            </AdminField>
            <AdminField label="Ends at">
              <AdminSchedulePopover
                applyLabel="Set end date"
                minDate={draft.startsAt || null}
                onChange={(nextIso) => onUpdateDraft('endsAt', nextIso || '')}
                showNowAction={false}
                showValueLabel
                triggerLabel="Choose end date"
                value={draft.endsAt}
              />
              {validationByPath.endsAt?.length ? (
                <small className={styles.fieldError}>{validationByPath.endsAt[0]}</small>
              ) : null}
            </AdminField>
            <AdminField label="Usage limit">
              <AdminInput
                min="0"
                onChange={(event) => onUpdateDraft('usageLimit', event.target.value)}
                placeholder="Optional"
                type="number"
                value={draft.usageLimit}
              />
              {validationByPath.usageLimit?.length ? (
                <small className={styles.fieldError}>{validationByPath.usageLimit[0]}</small>
              ) : null}
            </AdminField>
          </div>
          {validationByPath.qualifiers?.length ? (
            <div className={styles.inlineErrorList}>
              {validationByPath.qualifiers.map((message, index) => (
                <p key={`qualifiers-${message}-${index}`}>{message}</p>
              ))}
            </div>
          ) : null}
        </AdminFormSection>
      ) : null}

      {visible.has('preview') ? (
        <AdminFormSection
          title="Preview"
          titleTooltip="Review Smart Promotion behavior before saving."
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
  const productDetailRequestsRef = useRef(new Set());
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
    productDetailRequestsRef.current.clear();
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
      [section]: removePromotionSelectionRow(current[section], variantId),
    }));
  }

  function updateSelectionQuantity(section, variantId, quantity) {
    setDraft((current) => ({
      ...current,
      [section]: updatePromotionSelectionRowQuantity(current[section], variantId, quantity),
    }));
  }

  function openCatalogPicker(section) {
    const shouldLoad = shouldLoadPromotionCatalogOnOpen(catalogState, section);
    setCatalogState((current) => openPromotionCatalogSection(current, section));
    if (shouldLoad) {
      void searchCatalog(section, { force: false });
    }
  }

  function addPendingSelections(section) {
    const pendingRows = getPromotionCatalogSectionState(catalogState, section).pendingSelections || [];
    setDraft((current) => ({
      ...current,
      [section]: appendPromotionPendingSelections(current[section], pendingRows),
    }));
    setCatalogState((current) => closePromotionCatalogState(current, section));
  }

  async function searchCatalog(section, options = { force: true }) {
    const sectionState = getPromotionCatalogSectionState(catalogState, section);
    const queryValue = sectionState.query.trim();
    if (!shouldFetchPromotionCatalog(catalogState, section, options)) {
      return;
    }
    const requestId = sectionState.requestId + 1;

    setCatalogState((current) => beginPromotionCatalogSearch(current, section));
    let result = null;
    let errorMessage = '';

    try {
      result = await fetchPromotionCatalogProducts(queryValue);
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : 'Failed to load products. Try again.';
    } finally {
      setCatalogState((current) => {
        if (result) {
          return resolvePromotionCatalogSearchSuccess(
            current,
            section,
            result.rows,
            requestId,
            queryValue,
            {
              totalResultCount: result.totalResultCount,
              eligibleResultCount: result.eligibleResultCount,
            }
          );
        }

        return resolvePromotionCatalogSearchError(
          current,
          section,
          errorMessage || 'Failed to load products. Try again.',
          requestId
        );
      });
    }
  }

  useEffect(() => {
    const openSection = catalogState.openSection;
    if (!openSection) return;

    const sectionState = getPromotionCatalogSectionState(catalogState, openSection);
    const productIdsToLoad = sectionState.rows
      .map((row) => row.id)
      .filter((productId) => productId && !sectionState.productDetailsById[productId]);

    if (!productIdsToLoad.length) return;

    let cancelled = false;

    for (const productId of productIdsToLoad) {
      const requestKey = `${openSection}:${productId}`;
      if (productDetailRequestsRef.current.has(requestKey)) {
        continue;
      }

      productDetailRequestsRef.current.add(requestKey);
      void (async () => {
        try {
          const productDetail = await fetchPromotionCatalogProductDetail(productId);
          if (!productDetail || cancelled) {
            return;
          }

          setCatalogState((current) => {
            const currentSection = getPromotionCatalogSectionState(current, openSection);
            if (!currentSection.rows.some((row) => row.id === productId)) {
              return current;
            }

            return resolvePromotionCatalogProductDetailSuccess(current, openSection, productId, productDetail);
          });
        } catch (error) {
          console.error('[AutomaticPromotionsWorkspace] failed to load product detail', error);
          if (cancelled) {
            return;
          }

          setCatalogState((current) => {
            const currentSection = getPromotionCatalogSectionState(current, openSection);
            const fallbackProduct = currentSection.rows.find((row) => row.id === productId);
            if (!fallbackProduct) {
              return current;
            }

            return resolvePromotionCatalogProductDetailSuccess(current, openSection, productId, fallbackProduct);
          });
        } finally {
          productDetailRequestsRef.current.delete(requestKey);
        }
      })();
    }

    return () => {
      cancelled = true;
    };
  }, [catalogState]);

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
      await disablePromotionById(promotionId);
      await loadPromotions();
    } catch (error) {
      console.error('[AutomaticPromotionsWorkspace] failed to disable promotion', error);
      setErrorMessage(error instanceof Error ? error.message : 'Failed to disable promotion.');
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
            onAddPendingSelections={addPendingSelections}
            onCatalogQueryChange={(section, value) =>
              setCatalogState((current) => updatePromotionCatalogQuery(current, section, value))
            }
            onCancelPicker={() =>
              setCatalogState((current) => closePromotionCatalogState(current, current.openSection))
            }
            onOpenPicker={openCatalogPicker}
            onRemoveSelection={removeSelection}
            onSearchCatalog={(section) => void searchCatalog(section)}
            onTogglePendingVariant={(section, product, variant) =>
              setCatalogState((current) =>
                togglePromotionCatalogPendingSelection(current, section, {
                  productId: product.id,
                  productTitle: product.title,
                  variantId: variant.id,
                  variantTitle: variant.title || 'Default',
                  sku: variant.sku || null,
                  fulfillmentType: product.fulfillmentType || 'PHYSICAL',
                })
              )
            }
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
