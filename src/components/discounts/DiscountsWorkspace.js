"use client";

import { useMemo, useState } from 'react';
import AppShell from '../AppShell';
import { useDiscounts } from '../../context/DiscountsContext';
import { DISCOUNT_METHODS, DISCOUNT_STATUSES, DISCOUNT_TYPES } from '../../lib/discountsData';
import AdminButton from '../admin/ui/AdminButton';
import AdminCard from '../admin/ui/AdminCard';
import AdminDrawer from '../admin/ui/AdminDrawer';
import AdminEmptyState from '../admin/ui/AdminEmptyState';
import AdminFormSection from '../admin/ui/AdminFormSection';
import AdminInput from '../admin/ui/AdminInput';
import AdminPage from '../admin/ui/AdminPage';
import AdminPageHeader from '../admin/ui/AdminPageHeader';
import AdminSelect from '../admin/ui/AdminSelect';
import AdminStatusChip from '../admin/ui/AdminStatusChip';
import AdminTable from '../admin/ui/AdminTable';
import AdminToolbar from '../admin/ui/AdminToolbar';
import AutomaticPromotionsWorkspace from './AutomaticPromotionsWorkspace';
import styles from './DiscountsWorkspace.module.css';

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

export default function DiscountsWorkspace() {
  const { discounts, addDiscount, updateDiscount } = useDiscounts();
  const [activeTab, setActiveTab] = useState('discount-codes');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('all');
  const [selectedDiscountId, setSelectedDiscountId] = useState(discounts[0]?.id || null);
  const [builderMode, setBuilderMode] = useState(null);
  const [draftDiscount, setDraftDiscount] = useState(null);

  const visibleDiscounts = useMemo(() => discounts.filter(discount => {
    const searchMatch = [discount.title, discount.method, discount.summary].join(' ').toLowerCase().includes(searchQuery.trim().toLowerCase());
    const typeMatch = typeFilter === 'all' || discount.type === typeFilter;
    const statusMatch = statusFilter === 'all' || discount.status === statusFilter;
    const methodMatch = methodFilter === 'all' || discount.method === methodFilter;
    return searchMatch && typeMatch && statusMatch && methodMatch;
  }), [discounts, searchQuery, statusFilter, typeFilter, methodFilter]);

  const selectedDiscount = visibleDiscounts.find(discount => discount.id === selectedDiscountId) || discounts.find(discount => discount.id === selectedDiscountId) || null;
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

  const openBuilder = type => {
    setBuilderMode(type);
    setDraftDiscount(createDiscountDraft(type));
  };

  const openEditor = discount => {
    setBuilderMode(discount.type);
    setDraftDiscount({ ...discount });
    setSelectedDiscountId(discount.id);
  };

  const saveDraftDiscount = () => {
    if (!draftDiscount?.title.trim()) return;

    const nextDiscount = {
      ...draftDiscount,
      title: draftDiscount.title.trim(),
      summary: draftDiscount.summary.trim() || `${draftDiscount.value || 'Custom'} ${draftDiscount.valueType === 'percentage' ? '% off' : 'off'} via ${draftDiscount.method}`,
      status: draftDiscount.startsAt ? 'scheduled' : 'active',
    };

    const isExisting = discounts.some(discount => discount.id === nextDiscount.id);
    if (isExisting) updateDiscount(nextDiscount.id, () => nextDiscount);
    else addDiscount(nextDiscount);

    setSelectedDiscountId(nextDiscount.id);
    setBuilderMode(null);
    setDraftDiscount(null);
  };

  return (
    <AppShell>
      <AdminPage>
        <AdminPageHeader
          actions={(
            activeTab === 'discount-codes' ? (
              <AdminButton onClick={() => openBuilder('discount code')} size="sm" variant="primary">Create discount code</AdminButton>
            ) : null
          )}
          description="Manage discount codes and Smart Promotions from one workspace."
          eyebrow="Marketing"
          title="Discounts & Promotions"
        />

        <div className={styles.segmentedControl}>
          <button
            className={`${styles.segmentedButton} ${activeTab === 'discount-codes' ? styles.segmentedButtonActive : ''}`}
            onClick={() => setActiveTab('discount-codes')}
            type="button"
          >
            Discount codes
          </button>
          <button
            className={`${styles.segmentedButton} ${activeTab === 'automatic-promotions' ? styles.segmentedButtonActive : ''}`}
            onClick={() => setActiveTab('automatic-promotions')}
            type="button"
          >
            Automatic promotions
          </button>
        </div>

        {activeTab === 'discount-codes' ? (
          <AdminCard className={styles.panel} variant="panel">
            <AdminToolbar>
              <AdminInput onChange={event => setSearchQuery(event.target.value)} placeholder="Search discount codes..." type="search" value={searchQuery} />
              <AdminSelect onChange={setTypeFilter} options={typeOptions} value={typeFilter} />
              <AdminSelect onChange={setStatusFilter} options={statusOptions} value={statusFilter} />
              <AdminSelect onChange={setMethodFilter} options={methodOptions} value={methodFilter} />
            </AdminToolbar>

            {visibleDiscounts.length ? (
              <AdminTable
                columns={[
                  { key: 'title', header: 'Title', render: d => d.title },
                  { key: 'summary', header: 'Summary', render: d => d.summary },
                  { key: 'method', header: 'Method', render: d => d.method },
                  { key: 'status', header: 'Status', render: d => <AdminStatusChip tone={d.status === 'active' ? 'success' : d.status === 'scheduled' ? 'warning' : 'neutral'}>{d.status}</AdminStatusChip> },
                  { key: 'type', header: 'Type', render: d => d.type },
                ]}
                onRowClick={d => setSelectedDiscountId(d.id)}
                rows={visibleDiscounts}
                selectedId={selectedDiscount?.id || null}
              />
            ) : (
              <AdminEmptyState
                actionLabel="Create discount code"
                description="Create a code discount to start promotions."
                icon="sell"
                onAction={() => openBuilder('discount code')}
                title="No discount codes yet"
              />
            )}
            {selectedDiscount ? (
              <AdminFormSection description="Current discount configuration and performance" eyebrow="Discount detail" title={selectedDiscount.title}>
                <div className={styles.detailGrid}>
                  <div><strong>Method:</strong> {selectedDiscount.method}</div>
                  <div><strong>Status:</strong> {selectedDiscount.status}</div>
                  <div><strong>Customer eligibility:</strong> {selectedDiscount.customerEligibility}</div>
                  <div><strong>Sales channels:</strong> {selectedDiscount.salesChannel}</div>
                </div>
                <div className={styles.detailActions}><AdminButton onClick={() => openEditor(selectedDiscount)} size="sm" variant="secondary">Edit discount</AdminButton></div>
              </AdminFormSection>
            ) : null}
          </AdminCard>
        ) : (
          <AdminCard className={styles.panel} variant="panel">
            <AutomaticPromotionsWorkspace />
          </AdminCard>
        )}

        <AdminDrawer
          actions={(
            <>
              <AdminButton onClick={() => { setBuilderMode(null); setDraftDiscount(null); }} size="sm" variant="ghost">Cancel</AdminButton>
              <AdminButton onClick={saveDraftDiscount} size="sm" variant="primary">Save discount</AdminButton>
            </>
          )}
          contextItems={[
            { label: 'Discounts' },
            { label: draftDiscount?.title || 'New discount code', current: true },
            { label: 'Draft' },
          ]}
          onClose={() => { setBuilderMode(null); setDraftDiscount(null); }}
          open={Boolean(builderMode && draftDiscount)}
          tabs={[
            {
              id: 'summary',
              label: 'Summary',
              content: draftDiscount ? (
                <div className={styles.drawerBody}>
                  <AdminFormSection eyebrow="Identity" title="Basic settings">
                    <div className={styles.formGrid}>
                      <AdminInput onChange={event => setDraftDiscount(current => ({ ...current, title: event.target.value, code: event.target.value }))} placeholder="SUMMER20" type="text" value={draftDiscount.title} />
                      <AdminSelect onChange={value => setDraftDiscount(current => ({ ...current, method: value }))} options={DISCOUNT_METHODS.map((method) => ({ value: method, label: method }))} value={draftDiscount.method} />
                      <AdminSelect onChange={value => setDraftDiscount(current => ({ ...current, valueType: value }))} options={valueTypeOptions} value={draftDiscount.valueType} />
                      <AdminInput onChange={event => setDraftDiscount(current => ({ ...current, value: event.target.value }))} placeholder="10" type="text" value={draftDiscount.value} />
                    </div>
                  </AdminFormSection>
                  <AdminFormSection eyebrow="Rules" title="Requirements">
                    <div className={styles.formGrid}>
                      <AdminSelect onChange={value => setDraftDiscount(current => ({ ...current, minimumRequirementType: value }))} options={requirementTypeOptions} value={draftDiscount.minimumRequirementType} />
                      <AdminInput onChange={event => setDraftDiscount(current => ({ ...current, minimumRequirementValue: event.target.value }))} placeholder="50" type="text" value={draftDiscount.minimumRequirementValue} />
                      <AdminInput onChange={event => setDraftDiscount(current => ({ ...current, startsAt: event.target.value }))} type="datetime-local" value={draftDiscount.startsAt} />
                      <AdminInput onChange={event => setDraftDiscount(current => ({ ...current, endsAt: event.target.value }))} type="datetime-local" value={draftDiscount.endsAt} />
                    </div>
                  </AdminFormSection>
                </div>
              ) : null,
            },
          ]}
          title="New discount code"
        />
      </AdminPage>
    </AppShell>
  );
}
