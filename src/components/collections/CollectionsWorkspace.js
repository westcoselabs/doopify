"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import AppShell from '../AppShell';
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
import AdminTextarea from '../admin/ui/AdminTextarea';
import AdminToolbar from '../admin/ui/AdminToolbar';
import styles from './CollectionsWorkspace.module.css';

const EMPTY_DRAFT = { id: null, title: '', handle: '', description: '', imageUrl: '', sortOrder: 'MANUAL', isPublished: true, productIds: [] };

const SORT_OPTIONS = [
  { value: 'MANUAL', label: 'Manual' },
  { value: 'NEWEST', label: 'Newest first' },
  { value: 'TITLE_ASC', label: 'Title A-Z' },
  { value: 'PRICE_ASC', label: 'Price low to high' },
  { value: 'PRICE_DESC', label: 'Price high to low' },
];
const SORT_SELECT_OPTIONS = SORT_OPTIONS.map((option) => ({ value: option.value, label: option.label }));

function slugify(text) { return String(text || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''); }
function toDraft(collection) { return { id: collection.id, title: collection.title || '', handle: collection.handle || '', description: collection.description || '', imageUrl: collection.imageUrl || '', sortOrder: collection.sortOrder || 'MANUAL', isPublished: collection.isPublished !== false, productIds: collection.productIds || [] }; }
function toCollectionSummary(collection) { return { id: collection.id, title: collection.title || '', handle: collection.handle || '', description: collection.description || '', sortOrder: collection.sortOrder || 'MANUAL', isPublished: collection.isPublished !== false, productCount: collection.productCount || 0, updatedAt: collection.updatedAt || null }; }
function sortCollectionsByUpdatedAt(collections) { return [...collections].sort((a, b) => (b.updatedAt ? new Date(b.updatedAt).getTime() : 0) - (a.updatedAt ? new Date(a.updatedAt).getTime() : 0)); }
function upsertCollectionSummary(collections, nextCollection) { const summary = toCollectionSummary(nextCollection); const existingIndex = collections.findIndex((collection) => collection.id === summary.id); if (existingIndex === -1) return sortCollectionsByUpdatedAt([summary, ...collections]); const nextCollections = [...collections]; nextCollections[existingIndex] = { ...nextCollections[existingIndex], ...summary }; return sortCollectionsByUpdatedAt(nextCollections); }

export default function CollectionsWorkspace() {
  const [collections, setCollections] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCollectionId, setSelectedCollectionId] = useState('new');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [loading, setLoading] = useState(true);
  const [loadingCollection, setLoadingCollection] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [productSearch, setProductSearch] = useState('');
  const detailRequestRef = useRef(0);

  const deferredSearchQuery = useDeferredValue(searchQuery);
  const deferredProductSearch = useDeferredValue(productSearch);

  async function loadCollectionDetail(collectionId, fallbackCollection) {
    if (!collectionId || collectionId === 'new') return null;
    const requestId = detailRequestRef.current + 1;
    detailRequestRef.current = requestId;
    setLoadingCollection(true);
    if (fallbackCollection) setDraft(toDraft(fallbackCollection));
    try {
      const response = await fetch(`/api/collections/${collectionId}`);
      const json = await response.json();
      if (detailRequestRef.current !== requestId) return null;
      if (!json.success) { setNotice(json.error || 'Collection details could not be loaded.'); return null; }
      setSelectedCollectionId(collectionId);
      setDraft(toDraft(json.data));
      return json.data;
    } catch (error) {
      console.error('[CollectionsWorkspace] failed to load collection detail', error);
      if (detailRequestRef.current === requestId) setNotice('Collection details could not be loaded right now.');
      return null;
    } finally {
      if (detailRequestRef.current === requestId) setLoadingCollection(false);
    }
  }

  async function loadWorkspace(preferredCollectionId) {
    setLoading(true);
    try {
      const [collectionsRes, productsRes] = await Promise.all([fetch('/api/collections?page=1&pageSize=100'), fetch('/api/products?pageSize=200&status=ACTIVE')]);
      const [collectionsJson, productsJson] = await Promise.all([collectionsRes.json(), productsRes.json()]);
      const nextCollectionsData = collectionsJson.success ? collectionsJson.data : null;
      const nextCollections = Array.isArray(nextCollectionsData)
        ? nextCollectionsData
        : nextCollectionsData?.collections || [];
      const nextProducts = productsJson.success ? productsJson.data?.products || [] : [];
      setCollections(nextCollections); setProducts(nextProducts);
      const selected = nextCollections.find((collection) => collection.id === preferredCollectionId) || nextCollections.find((collection) => collection.id === selectedCollectionId) || nextCollections[0] || null;
      if (selected) { setSelectedCollectionId(selected.id); await loadCollectionDetail(selected.id, selected); }
      else { detailRequestRef.current += 1; setLoadingCollection(false); setSelectedCollectionId('new'); setDraft(EMPTY_DRAFT); }
    } catch (error) { console.error('[CollectionsWorkspace] failed to load workspace', error); setNotice('Collections could not be loaded right now.'); }
    finally { setLoading(false); }
  }

// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
  useEffect(() => { loadWorkspace(); }, []);

  const filteredCollections = useMemo(() => {
    const query = deferredSearchQuery.trim().toLowerCase();
    if (!query) return collections;
    return collections.filter((collection) => collection.title.toLowerCase().includes(query) || collection.handle.toLowerCase().includes(query) || (collection.description || '').toLowerCase().includes(query));
  }, [collections, deferredSearchQuery]);

  const filteredProducts = useMemo(() => {
    const query = deferredProductSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter((product) => product.title.toLowerCase().includes(query) || (product.vendor || '').toLowerCase().includes(query) || product.handle.toLowerCase().includes(query));
  }, [products, deferredProductSearch]);

  const assignedProducts = useMemo(() => {
    const productMap = new Map(products.map((product) => [product.id, product]));
    return draft.productIds.map((productId) => productMap.get(productId)).filter(Boolean);
  }, [draft.productIds, products]);

  const isNewCollection = draft.id == null;
  const handlePreview = draft.handle.trim() || slugify(draft.title);

  function selectCollection(collection) { setSelectedCollectionId(collection.id); setNotice(''); setIsDrawerOpen(true); void loadCollectionDetail(collection.id, collection); }
  function resetToNewCollection() { detailRequestRef.current += 1; setLoadingCollection(false); setSelectedCollectionId('new'); setDraft(EMPTY_DRAFT); setNotice(''); setIsDrawerOpen(true); }
  function updateDraft(field, value) { setDraft((current) => ({ ...current, [field]: value })); }
  function toggleAssignedProduct(productId) { setDraft((current) => ({ ...current, productIds: current.productIds.includes(productId) ? current.productIds.filter((id) => id !== productId) : [...current.productIds, productId] })); }

  async function handleSave() {
    if (!draft.title.trim()) { setNotice('A collection title is required before saving.'); return; }
    const wasExisting = Boolean(draft.id); setSaving(true); setNotice('');
    const payload = { title: draft.title.trim(), handle: draft.handle.trim() || undefined, description: draft.description.trim() || undefined, imageUrl: draft.imageUrl.trim() || undefined, sortOrder: draft.sortOrder, isPublished: draft.isPublished, productIds: draft.productIds };
    try {
      const response = await fetch(draft.id ? `/api/collections/${draft.id}` : '/api/collections', { method: draft.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const json = await response.json();
      if (!json.success) { setNotice(json.error || 'Collection could not be saved.'); return; }
      setSelectedCollectionId(json.data.id); setDraft(toDraft(json.data)); setCollections((current) => upsertCollectionSummary(current, json.data)); setNotice(wasExisting ? 'Collection updated.' : 'Collection created.');
    } catch (error) { console.error('[CollectionsWorkspace] save failed', error); setNotice('Collection could not be saved.'); }
    finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!draft.id) { resetToNewCollection(); return; }
    if (!window.confirm(`Delete ${draft.title}? This cannot be undone.`)) return;
    const deletedCollectionId = draft.id; const deletedCollectionIndex = collections.findIndex((collection) => collection.id === deletedCollectionId);
    setSaving(true); setNotice('');
    try {
      const response = await fetch(`/api/collections/${draft.id}`, { method: 'DELETE' });
      const json = await response.json();
      if (!json.success) { setNotice(json.error || 'Collection could not be deleted.'); return; }
      const nextCollections = collections.filter((collection) => collection.id !== deletedCollectionId);
      setCollections(nextCollections);
      if (!nextCollections.length) { resetToNewCollection(); setNotice('Collection deleted.'); return; }
      const nextSelectedCollection = nextCollections[Math.min(deletedCollectionIndex, nextCollections.length - 1)] || nextCollections[0];
      setSelectedCollectionId(nextSelectedCollection.id); setNotice('Collection deleted.'); await loadCollectionDetail(nextSelectedCollection.id, nextSelectedCollection);
    } catch (error) { console.error('[CollectionsWorkspace] delete failed', error); setNotice('Collection could not be deleted.'); }
    finally { setSaving(false); }
  }

  return (
    <AppShell onNotificationsClick={() => setNotice('Collections are ready for merchandising work.')} onQuickActionClick={() => setNotice('Use the product library to assign products and order them.')}>
      <AdminPage className={styles.page}>
        <AdminPageHeader
          actions={<AdminButton onClick={resetToNewCollection} size="sm" variant="primary">New collection</AdminButton>}
          description="Curate storefront merchandising with publish controls."
          eyebrow="Collections"
          title="Merchandising"
        />

        <AdminCard className={styles.listPanel} variant="panel">
          <AdminToolbar>
            <AdminInput
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search collections..."
              type="search"
              value={searchQuery}
            />
            <span className={styles.resultText}>{filteredCollections.length} collections</span>
          </AdminToolbar>
          {loading ? (
            <p className={styles.notice}>Loading collections...</p>
          ) : filteredCollections.length ? (
            <AdminTable
              columns={[
                { key: 'title', header: 'Title', render: c => c.title },
                { key: 'handle', header: 'Handle', render: c => `/${c.handle}` },
                { key: 'count', header: 'Products', render: c => c.productCount },
                { key: 'status', header: 'Status', render: c => <AdminStatusChip tone={c.isPublished ? 'success' : 'warning'}>{c.isPublished ? 'Published' : 'Unpublished'}</AdminStatusChip> },
              ]}
              onRowClick={selectCollection}
              rows={filteredCollections}
              selectedId={selectedCollectionId === 'new' ? null : selectedCollectionId}
            />
          ) : (
            <AdminEmptyState
              actionLabel="Create collection"
              description="Create your first collection to start shaping storefront merchandising."
              icon="dashboard_customize"
              onAction={resetToNewCollection}
              title="No collections yet"
            />
          )}
        </AdminCard>

        <AdminDrawer
          actions={(
            <>
              <AdminButton disabled={saving || loadingCollection} onClick={() => setIsDrawerOpen(false)} size="sm" variant="ghost">Close</AdminButton>
              {!isNewCollection ? <AdminButton disabled={saving || loadingCollection} onClick={handleDelete} size="sm" variant="danger">Delete</AdminButton> : null}
              <AdminButton disabled={saving || loadingCollection} onClick={handleSave} size="sm" variant="primary">{saving ? 'Saving...' : isNewCollection ? 'Create collection' : 'Save changes'}</AdminButton>
            </>
          )}
          contextItems={[{ label: 'Collections' }, { label: draft.title || 'Untitled collection', current: true }, { label: draft.isPublished ? 'Published' : 'New' }]}
          onClose={() => setIsDrawerOpen(false)}
          open={isDrawerOpen}
          tabs={[
            {
              id: 'summary', label: 'Summary', content: (
                <div className={styles.drawerBody}>
                  {notice ? <p className={styles.notice}>{notice}</p> : null}
                  {loadingCollection ? <p className={styles.notice}>Loading collection details...</p> : null}
                  <AdminFormSection eyebrow="Identity" title="Collection details" description={`Storefront path: /collections/${handlePreview || 'collection-handle'}`}>
                    <div className={styles.formGrid}>
                      <AdminInput onChange={(event) => updateDraft('title', event.target.value)} placeholder="Summer Essentials" value={draft.title} />
                      <AdminInput onChange={(event) => updateDraft('handle', event.target.value)} placeholder={slugify(draft.title) || 'summer-essentials'} value={draft.handle} />
                      <AdminInput onChange={(event) => updateDraft('imageUrl', event.target.value)} placeholder="https://..." value={draft.imageUrl} />
                      <AdminSelect onChange={(value) => updateDraft('sortOrder', value)} options={SORT_SELECT_OPTIONS} value={draft.sortOrder} />
                    </div>
                    <label className={styles.publishRow}><input checked={draft.isPublished} onChange={(event) => updateDraft('isPublished', event.target.checked)} type="checkbox" />Published</label>
                    <AdminTextarea onChange={(event) => updateDraft('description', event.target.value)} placeholder="Explain what this collection is for and how it should feel on the storefront." rows={4} value={draft.description} />
                  </AdminFormSection>
                </div>
              ),
            },
            {
              id: 'products', label: 'Products', content: (
                <div className={styles.drawerBody}>
                  <AdminFormSection eyebrow="Assigned" title={`${assignedProducts.length} products in collection`}>
                    <div className={styles.productGrid}>
                      {assignedProducts.map((product) => (
                        <div className={styles.productRow} key={product.id}>
                          <span>{product.title}</span>
                          <AdminButton onClick={() => toggleAssignedProduct(product.id)} size="sm" variant="ghost">Remove</AdminButton>
                        </div>
                      ))}
                    </div>
                  </AdminFormSection>
                  <AdminFormSection eyebrow="Library" title="Assign products">
                    <AdminInput onChange={(event) => setProductSearch(event.target.value)} placeholder="Search products..." value={productSearch} />
                    <div className={styles.productGrid}>
                      {filteredProducts.map((product) => {
                        const isAssigned = draft.productIds.includes(product.id);
                        return (
                          <div className={styles.productRow} key={product.id}>
                            <span>{product.title}</span>
                            <AdminButton onClick={() => toggleAssignedProduct(product.id)} size="sm" variant={isAssigned ? 'secondary' : 'primary'}>{isAssigned ? 'Assigned' : 'Assign'}</AdminButton>
                          </div>
                        );
                      })}
                    </div>
                  </AdminFormSection>
                </div>
              ),
            },
          ]}
          title={draft.title || 'Untitled collection'}
        />
      </AdminPage>
    </AppShell>
  );
}

