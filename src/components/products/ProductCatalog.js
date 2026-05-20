"use client";

import Image from 'next/image';
import { useDeferredValue, useMemo } from 'react';
import {
  getComputedProductStateMeta,
  getProductFeaturedImage,
  getProductStockLabel,
  getProductVariantCount,
  productMatchesFilter,
  productMatchesSearch,
} from '../../lib/productUtils';
import { useProductStore } from '../../context/ProductContext';
import AdminButton from '../admin/ui/AdminButton';
import AdminCard from '../admin/ui/AdminCard';
import AdminDropdown from '../admin/ui/AdminDropdown';
import AdminEmptyState from '../admin/ui/AdminEmptyState';
import AdminInput from '../admin/ui/AdminInput';
import AdminStatusChip from '../admin/ui/AdminStatusChip';
import AdminTable from '../admin/ui/AdminTable';
import { getCatalogViewState, PRODUCT_CATALOG_EMPTY_STATE } from './product-catalog-view.helpers';
import styles from './ProductCatalog.module.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'available', label: 'Available' },
  { id: 'low-stock', label: 'Low Stock' },
  { id: 'out-of-stock', label: 'Out of Stock' },
  { id: 'draft', label: 'Draft' },
  { id: 'active', label: 'Active' },
];

function ProductCatalogTableSkeleton({ rows = 6 }) {
  return (
    <div className={styles.catalogSkeleton} data-testid="products-catalog-skeleton">
      {Array.from({ length: rows }).map((_, index) => (
        <div className={styles.catalogSkeletonRow} key={`catalog-skeleton-row-${index}`}>
          <div className={styles.catalogSkeletonProductCell}>
            <span className={styles.catalogSkeletonThumb} />
            <div className={styles.catalogSkeletonTextStack}>
              <span className={styles.catalogSkeletonLineTitle} />
              <span className={styles.catalogSkeletonLineMeta} />
            </div>
          </div>
          <span className={styles.catalogSkeletonChip} />
          <span className={styles.catalogSkeletonChip} />
          <span className={styles.catalogSkeletonLineSmall} />
          <span className={styles.catalogSkeletonLineSmall} />
          <span className={styles.catalogSkeletonAction} />
        </div>
      ))}
    </div>
  );
}

export default function ProductCatalog() {
  const { products, selectedProductId, searchQuery, activeFilter, catalogLoaded, editor, formatMoney, actions } = useProductStore();
  const deferredSearchQuery = useDeferredValue(searchQuery);

  const visibleProducts = useMemo(
    () =>
      products.filter(
        product =>
          productMatchesFilter(product, activeFilter) &&
          productMatchesSearch(product, deferredSearchQuery)
      ),
    [activeFilter, deferredSearchQuery, products]
  );

  const viewState = getCatalogViewState({
    catalogLoaded,
    hasDraftProduct: Boolean(editor.draftProduct),
    totalProducts: products.length,
    visibleProducts: visibleProducts.length,
  });

  const columns = [
    {
      key: 'product',
      header: 'Product',
      render: product => {
        const featuredImage = getProductFeaturedImage(product);
        return (
          <div className={styles.productCell}>
            <div className={styles.rowMedia}>
              {featuredImage ? (
                <Image alt={featuredImage.alt} className={styles.thumbnail} fill src={featuredImage.src} unoptimized />
              ) : (
                <div className={styles.thumbnailPlaceholder}>
                  <span className="material-symbols-outlined">image</span>
                </div>
              )}
            </div>
            <div className={styles.rowContent}>
              <p className={`font-headline ${styles.productTitle}`}>{product.title}</p>
              <p className={styles.productMeta}>{product.category || 'Uncategorized'}</p>
            </div>
          </div>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: product => {
        const state = getComputedProductStateMeta(product);
        return (
          <AdminStatusChip tone={state.tone}>
            {state.label}
          </AdminStatusChip>
        );
      },
    },
    {
      key: 'inventory',
      header: 'Inventory',
      render: product => {
        const stockStatus = product.inventorySummary.stockStatus;
        const stockLabel = getProductStockLabel(product);
        return (
          <AdminStatusChip tone={stockStatus === 'available' ? 'success' : stockStatus === 'low-stock' ? 'warning' : 'danger'}>
            {stockLabel}
          </AdminStatusChip>
        );
      },
    },
    {
      key: 'variants',
      header: 'Variants',
      render: product => {
        const variantCount = getProductVariantCount(product);
        return `${variantCount} variant${variantCount > 1 ? 's' : ''}`;
      },
    },
    {
      key: 'price',
      header: 'Price',
      render: product => formatMoney(product.basePrice),
    },
    {
      key: 'actions',
      header: '',
      render: product => (
        <div onClick={event => event.stopPropagation()}>
          <AdminDropdown
            align="end"
            trigger={(
              <AdminButton
                aria-label="Product actions"
                onClick={event => event.stopPropagation()}
                size="sm"
                variant="icon"
              >
                <span className="material-symbols-outlined" aria-hidden="true">more_horiz</span>
              </AdminButton>
            )}
          >
            <button onClick={() => actions.requestSelectProduct(product.id)} type="button">
              Open product
            </button>
            <button onClick={() => actions.requestDuplicateProduct(product.id)} type="button">
              Duplicate product
            </button>
          </AdminDropdown>
        </div>
      ),
      cellClassName: styles.actionsCell,
      headerClassName: styles.actionsHeader,
    },
  ];

  return (
    <AdminCard className={`admin-spotlight ${styles.catalogShell}`} variant="panel">
      <div className={styles.catalogHeader}>
        <div className={styles.catalogHeaderTopRow}>
            <div className={`admin-card admin-card--inset admin-spotlight ${styles.searchField}`}>
              <span className="material-symbols-outlined">search</span>
              <AdminInput
                aria-label="Search products"
                className={styles.searchInput}
                onChange={event => actions.setSearchQuery(event.target.value)}
                placeholder="Search products, SKUs, vendors, tags..."
                type="text"
                value={searchQuery}
              />
            </div>

          <AdminButton leftIcon={<span className="material-symbols-outlined">add</span>} onClick={() => actions.requestCreateProduct()} size="sm" variant="primary">
            Add product
          </AdminButton>
        </div>
      </div>

      <div className={styles.filterRow}>
        {FILTERS.map(filter => (
          <AdminButton
            key={filter.id}
            className={activeFilter === filter.id ? styles.filterButtonActive : styles.filterButton}
            onClick={() => actions.setActiveFilter(filter.id)}
            size="sm"
            type="button"
            variant={activeFilter === filter.id ? 'primary' : 'secondary'}
          >
            {filter.label}
          </AdminButton>
        ))}
      </div>

      <div className={`custom-scrollbar ${styles.listArea}`}>
        {viewState === 'loading' ? <ProductCatalogTableSkeleton rows={6} /> : null}

        {viewState === 'empty' ? (
          <AdminEmptyState
            actionLabel={PRODUCT_CATALOG_EMPTY_STATE.actionLabel}
            description={PRODUCT_CATALOG_EMPTY_STATE.description}
            icon="inventory_2"
            onAction={() => actions.requestCreateProduct()}
            title={PRODUCT_CATALOG_EMPTY_STATE.title}
          />
        ) : null}

        {viewState === 'filtered-empty' ? (
          <AdminEmptyState
            actionLabel="Clear filters"
            description="Try a broader search or switch filters to explore the rest of the catalog."
            icon="filter_alt_off"
            onAction={() => actions.setActiveFilter('all')}
            title="No matching products"
          />
        ) : null}

        {viewState === 'table' ? (
          <AdminTable
            columns={columns}
            emptyDescription="Try changing filters or creating a new product."
            emptyTitle="No products"
            getRowId={product => product.id}
            onRowClick={product => actions.requestSelectProduct(product.id)}
            rows={visibleProducts}
            selectedId={selectedProductId || editor.draftProduct?.id || null}
          />
        ) : null}
      </div>

      <div className={styles.catalogFooter}>
        <span>{visibleProducts.length} visible</span>
        <span>{products.length} total products</span>
      </div>
    </AdminCard>
  );
}
