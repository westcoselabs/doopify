"use client";

import AdminButton from "@/components/admin/ui/AdminButton";
import AdminInput from "@/components/admin/ui/AdminInput";
import type { PromotionVariantSelection } from "@/components/discounts/promotions-ui.helpers";

import styles from "./PromotionVariantSelectionList.module.css";

type PromotionVariantSelectionListProps = {
  addAnotherButtonLabel?: string;
  browseButtonLabel: string;
  changeButtonLabel?: string;
  emptyHelper: string;
  emptyTitle: string;
  onBrowse: () => void;
  onChangeQuantity: (variantId: string, quantity: number) => void;
  onRemove: (variantId: string) => void;
  quantityLabel: string;
  rows: PromotionVariantSelection[];
  title: string;
  validationMessage?: string | null;
};

function formatFulfillmentTypeLabel(fulfillmentType: string | null | undefined) {
  if (!fulfillmentType) return "";
  if (fulfillmentType === "PHYSICAL") return "";
  return fulfillmentType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export default function PromotionVariantSelectionList({
  addAnotherButtonLabel = "Add another",
  browseButtonLabel,
  changeButtonLabel = "Change",
  emptyHelper,
  emptyTitle,
  onBrowse,
  onChangeQuantity,
  onRemove,
  quantityLabel,
  rows,
  title,
  validationMessage = "",
}: PromotionVariantSelectionListProps) {
  const hasRows = rows.length > 0;
  const browseActionLabel =
    rows.length > 1 ? addAnotherButtonLabel : hasRows ? changeButtonLabel : browseButtonLabel;

  return (
    <div className={styles.list}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.label}>{title}</p>
          {validationMessage ? <p className={styles.validation}>{validationMessage}</p> : null}
        </div>
        {hasRows ? (
          <AdminButton onClick={onBrowse} size="sm" variant="ghost">
            {browseActionLabel}
          </AdminButton>
        ) : null}
      </div>

      {hasRows ? (
        <div className={styles.rows}>
          {rows.map((row) => {
            const fulfillmentTypeLabel = formatFulfillmentTypeLabel(row.fulfillmentType);

            return (
              <div className={styles.row} key={row.variantId}>
                <div className={styles.rowCopy}>
                  <strong className={styles.productTitle}>{row.productTitle}</strong>
                  <p className={styles.variantTitle}>{row.variantTitle || "Default"}</p>
                  <div className={styles.metaRow}>
                    {row.sku ? <span className={styles.metaPill}>SKU {row.sku}</span> : null}
                    {fulfillmentTypeLabel ? (
                      <span className={styles.metaPill}>{fulfillmentTypeLabel}</span>
                    ) : null}
                  </div>
                </div>

                <div className={styles.rowActions}>
                  <label className={styles.quantityField}>
                    <span>{quantityLabel}</span>
                    <AdminInput
                      aria-label={`${quantityLabel} for ${row.productTitle} ${row.variantTitle}`}
                      min="1"
                      onChange={(event) =>
                        onChangeQuantity(row.variantId, Number(event.target.value || 1))
                      }
                      type="number"
                      value={String(row.quantity)}
                    />
                  </label>
                  <AdminButton onClick={() => onRemove(row.variantId)} size="sm" variant="ghost">
                    Remove
                  </AdminButton>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <div className={styles.emptyCopy}>
            <p>{emptyTitle}</p>
            <small>{emptyHelper}</small>
          </div>
          <AdminButton onClick={onBrowse} size="sm" variant="secondary">
            {browseButtonLabel}
          </AdminButton>
        </div>
      )}
    </div>
  );
}
