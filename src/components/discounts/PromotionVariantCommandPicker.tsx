"use client";

import { useEffect, useMemo, useRef } from 'react'

import AdminButton from '@/components/admin/ui/AdminButton'
import type {
  PromotionCatalogProduct,
  PromotionCatalogSection,
  PromotionCatalogVariant,
  PromotionPendingSelection,
  PromotionVariantSelection,
} from '@/components/discounts/promotions-ui.helpers'

type PromotionVariantCommandPickerProps = {
  addButtonLabel: string
  browseButtonLabel: string
  catalogError: string
  catalogEligibleCount: number
  catalogLoading: boolean
  catalogProductDetailsById: Record<string, PromotionCatalogProduct>
  catalogQuery: string
  catalogRows: PromotionCatalogProduct[]
  catalogTotalCount: number
  emptyText: string
  onAddSelected: () => void
  onBrowse: () => void
  onCancel: () => void
  onOpenChange: (open: boolean) => void
  onSearch: () => void
  onTogglePendingVariant: (
    section: PromotionCatalogSection,
    product: PromotionCatalogProduct,
    variant: PromotionCatalogVariant
  ) => void
  open: boolean
  pendingSelections: PromotionPendingSelection[]
  pickerTitle: string
  searchPlaceholder: string
  section: PromotionCatalogSection
  selectedRows: PromotionVariantSelection[]
  setCatalogQuery: (value: string) => void
}

function hasPendingSelection(pendingSelections: PromotionPendingSelection[], variantId: string) {
  return pendingSelections.some((entry) => entry.variantId === variantId)
}

export default function PromotionVariantCommandPicker({
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
}: PromotionVariantCommandPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null)
  const pendingCount = pendingSelections.length

  useEffect(() => {
    if (!open) return
    const timeoutId = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [open])

  useEffect(() => {
    if (!open) return
    const timeoutId = window.setTimeout(() => onSearch(), 300)
    return () => window.clearTimeout(timeoutId)
  }, [catalogQuery, onSearch, open])

  const hasSearchQuery = useMemo(() => Boolean(String(catalogQuery || '').trim()), [catalogQuery])
  const emptyMessage = useMemo(() => {
    if (catalogTotalCount > 0 && catalogEligibleCount === 0) {
      return 'No eligible physical products found. Only active physical products can be used in Smart Promotions V1.'
    }

    if (hasSearchQuery) {
      return 'No products found for this search.'
    }

    return emptyText
  }, [catalogEligibleCount, catalogTotalCount, emptyText, hasSearchQuery])

  if (!open) {
    return (
      <AdminButton onClick={onBrowse} size="sm" variant="secondary">
        {browseButtonLabel}
      </AdminButton>
    )
  }

  return (
    <div className="promotion-command-picker-overlay" role="presentation">
      <div
        aria-label={pickerTitle}
        aria-modal="true"
        className="promotion-command-picker"
        role="dialog"
      >
        <div className="promotion-command-picker__header">
          <div>
            <strong>{pickerTitle}</strong>
            <span>{pendingCount ? `${pendingCount} selected` : 'Choose variants to add'}</span>
          </div>
          <button
            aria-label={`Close ${pickerTitle}`}
            className="promotion-command-picker__close"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <span className="material-symbols-outlined" aria-hidden="true">
              close
            </span>
          </button>
        </div>

        <div className="promotion-command-picker__search">
          <input
            aria-label={`${pickerTitle} product search`}
            className="admin-input"
            onChange={(event) => setCatalogQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                onOpenChange(false)
              }
            }}
            placeholder={searchPlaceholder}
            ref={inputRef}
            type="search"
            value={catalogQuery}
          />
        </div>

        <div className="promotion-command-picker__results custom-scrollbar">
          {catalogLoading && catalogRows.length ? (
            <p className="promotion-command-picker__loading-note">Loading products...</p>
          ) : null}
          {!catalogLoading && catalogError && !catalogRows.length ? (
            <p className="promotion-command-picker__empty">{catalogError}</p>
          ) : null}
          {!catalogRows.length && catalogLoading ? (
            <p className="promotion-command-picker__empty">Loading products...</p>
          ) : null}
          {!catalogLoading && !catalogError && !catalogRows.length ? (
            <p className="promotion-command-picker__empty">{emptyMessage}</p>
          ) : null}
          {!catalogLoading && catalogError && catalogRows.length ? (
            <p className="promotion-command-picker__loading-note">{catalogError}</p>
          ) : null}

          {catalogRows.map((product) => {
            const productDetail = catalogProductDetailsById[product.id] || null
            const variants = productDetail?.variants || []
            const productMeta = `/${product.handle}${product.status ? ` · ${product.status}` : ''}`

            if (!productDetail) {
              return (
                <div className="promotion-command-picker__row" key={product.id}>
                  <span className="promotion-command-picker__row-copy">
                    <strong>{product.title}</strong>
                    <small>{productMeta}</small>
                  </span>
                  <span className="promotion-command-picker__row-status">Loading variants...</span>
                </div>
              )
            }

            if (!variants.length) {
              return (
                <div className="promotion-command-picker__row" key={product.id}>
                  <span className="promotion-command-picker__row-copy">
                    <strong>{product.title}</strong>
                    <small>{productMeta}</small>
                  </span>
                  <span className="promotion-command-picker__row-status">No variants available for this product.</span>
                </div>
              )
            }

            const toggleableVariants = variants.filter(
              (variant) => !selectedRows.some((row) => row.variantId === variant.id)
            )
            const allAlreadySelected = toggleableVariants.length === 0
            const allSelected = variants.every(
              (variant) =>
                selectedRows.some((row) => row.variantId === variant.id) ||
                hasPendingSelection(pendingSelections, variant.id)
            )
            const isPending = allSelected && !allAlreadySelected

            const toggleProduct = () => {
              if (allAlreadySelected) return
              const shouldSelect = !allSelected
              toggleableVariants.forEach((variant) => {
                const variantIsPending = hasPendingSelection(pendingSelections, variant.id)
                if (shouldSelect !== variantIsPending) {
                  onTogglePendingVariant(section, product, variant)
                }
              })
            }

            return (
              <div className="promotion-command-picker__row" key={product.id}>
                <span className="promotion-command-picker__row-copy">
                  <strong>{product.title}</strong>
                  <small>{productMeta}</small>
                </span>
                <AdminButton
                  disabled={allAlreadySelected}
                  onClick={toggleProduct}
                  size="sm"
                  variant={allAlreadySelected || isPending ? 'secondary' : 'primary'}
                >
                  {allAlreadySelected ? 'Added' : isPending ? 'Selected' : 'Add'}
                </AdminButton>
              </div>
            )
          })}
        </div>

        <div className="promotion-command-picker__footer">
          <AdminButton onClick={onCancel} size="sm" variant="ghost">
            Cancel
          </AdminButton>
          <AdminButton disabled={!pendingCount} onClick={onAddSelected} size="sm" variant="primary">
            {pendingCount ? `${addButtonLabel} (${pendingCount})` : addButtonLabel}
          </AdminButton>
        </div>
      </div>
    </div>
  )
}
