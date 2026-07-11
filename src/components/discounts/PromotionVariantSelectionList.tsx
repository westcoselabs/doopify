"use client";

import type { ReactNode } from "react";

import AdminButton from "@/components/admin/ui/AdminButton";
import AdminInput from "@/components/admin/ui/AdminInput";
import type { PromotionVariantSelection } from "@/components/discounts/promotions-ui.helpers";

import styles from "./PromotionVariantSelectionList.module.css";

type PromotionVariantSelectionListProps = {
  browseAction: ReactNode;
  emptyHelper: string;
  emptyTitle: string;
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
  browseAction,
  emptyHelper,
  emptyTitle,
  onChangeQuantity,
  onRemove,
  quantityLabel,
  rows,
  title,
  validationMessage = "",
}: PromotionVariantSelectionListProps) {
  const hasRows = rows.length > 0;

  return (
    <div className={styles.list}>
      <div className={styles.header}>
        <div className={styles.headerCopy}>
          <p className={styles.label}>{title}</p>
          {validationMessage ? <p className={styles.validation}>{validationMessage}</p> : null}
        </div>
        <div className={styles.headerAction}>{browseAction}</div>
      </div>

      {hasRows ? (
        <div className={styles.rowsCard}>
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
                  <AdminButton
                    className={styles.removeButton}
                    onClick={() => onRemove(row.variantId)}
                    size="sm"
                    variant="danger"
                  >
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
        </div>
      )}
    </div>
  );
}
