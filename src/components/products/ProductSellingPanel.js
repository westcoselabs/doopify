"use client";

import AdminButton from "../admin/ui/AdminButton";
import AdminCard from "../admin/ui/AdminCard";
import AdminInput from "../admin/ui/AdminInput";
import AdminSelectableTile from "../admin/ui/AdminSelectableTile";
import AdminTextarea from "../admin/ui/AdminTextarea";
import { useProductStore } from "../../context/ProductContext";
import styles from "./ProductSellingPanel.module.css";

const SALES_MODES = [
  {
    value: "standard",
    title: "Standard",
    subtitle: "Visible and purchasable as a normal active product.",
    icon: "check_circle",
  },
  {
    value: "coming_soon",
    title: "Coming soon",
    subtitle: "Visible on storefront, but checkout is disabled until launch.",
    icon: "schedule",
  },
  {
    value: "presale",
    title: "Presale",
    subtitle: "Customers can buy now with clear delivery expectations.",
    icon: "rocket_launch",
  },
];

const FULFILLMENT_MODES = [
  {
    value: "physical",
    title: "Physical product",
    subtitle: "Requires shipping rates, weight, and fulfillment after order placement.",
    icon: "inventory_2",
  },
  {
    value: "digital",
    title: "Digital product",
    subtitle: "No shipping required. Customer receives secure access after payment.",
    icon: "download",
  },
];

function isoToLocalInput(isoDate) {
  if (!isoDate) {
    return "";
  }

  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  const hours = String(parsed.getHours()).padStart(2, "0");
  const minutes = String(parsed.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function localInputToIso(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function getPreviewState({ draftProduct, totalInventory, continueSellingCount }) {
  const salesMode = draftProduct.salesMode || "standard";
  const fulfillmentType = draftProduct.fulfillmentType || "physical";
  const now = Date.now();
  const launchAt = draftProduct.availableForPurchaseAt
    ? new Date(draftProduct.availableForPurchaseAt).getTime()
    : null;
  const presaleStartsAt = draftProduct.presaleStartsAt
    ? new Date(draftProduct.presaleStartsAt).getTime()
    : null;

  const comingSoonActive =
    salesMode === "coming_soon" && (launchAt == null || Number.isNaN(launchAt) || launchAt > now);
  const presalePending =
    salesMode === "presale" &&
    presaleStartsAt != null &&
    !Number.isNaN(presaleStartsAt) &&
    presaleStartsAt > now;
  const presaleActive = salesMode === "presale" && !presalePending;
  const backorderActive = totalInventory <= 0 && continueSellingCount > 0;
  const soldOut = totalInventory <= 0 && !backorderActive;

  let badge = null;
  if (comingSoonActive || presalePending) {
    badge = draftProduct.storefrontBadgeText?.trim() || "Coming soon";
  } else if (presaleActive) {
    badge = draftProduct.storefrontBadgeText?.trim() || "Presale";
  } else if (fulfillmentType === "digital") {
    badge = "Digital";
  } else if (backorderActive) {
    badge = "Backorder";
  } else if (soldOut) {
    badge = "Sold out";
  }

  const previewMessage =
    draftProduct.availabilityMessage?.trim() ||
    (comingSoonActive || presalePending
      ? "This product is launching soon. Add availability details before launch."
      : presaleActive
        ? `This item is available for presale.${draftProduct.expectedDeliveryText?.trim() ? ` ${draftProduct.expectedDeliveryText.trim()}` : ""}`
        : fulfillmentType === "digital"
          ? "Instant digital delivery after payment."
          : soldOut
            ? "This product is currently sold out."
            : "Available for immediate purchase.");

  const buttonDisabled = comingSoonActive || presalePending || soldOut;
  const buttonLabel = comingSoonActive || presalePending ? "Coming soon" : soldOut ? "Sold out" : "Add to cart";

  return {
    badge,
    previewMessage,
    buttonDisabled,
    buttonLabel,
    isPresale: presaleActive,
    isComingSoon: comingSoonActive || presalePending,
  };
}

export default function ProductSellingPanel({ onManageInVariants }) {
  const { editor, actions } = useProductStore();
  const draftProduct = editor.draftProduct;

  if (!draftProduct) {
    return null;
  }

  const totalInventory = (draftProduct.variants || []).reduce(
    (sum, variant) => sum + (Number.parseInt(variant.inventoryQty, 10) || 0),
    0
  );
  const continueSellingCount = (draftProduct.variants || []).filter(
    (variant) => variant.continueSellingWhenOutOfStock
  ).length;
  const allVariantsBackorder =
    draftProduct.variants?.length > 0 &&
    continueSellingCount === draftProduct.variants.length;
  const preview = getPreviewState({ draftProduct, totalInventory, continueSellingCount });
  const showPresaleWarning = draftProduct.salesMode === "presale" && continueSellingCount === 0;
  const pricePreview = draftProduct.basePrice || "0.00";

  return (
    <div className={styles.layout}>
      <div className={styles.stack}>
        <AdminCard className={styles.panelCard} spotlight variant="card">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>Selling</p>
              <h3 className={`font-headline ${styles.title}`}>Sales mode</h3>
            </div>
            <span className={styles.modePill}>
              {(draftProduct.salesMode || "standard").replace("_", " ")}
            </span>
          </div>
          <p className={styles.copy}>
            This tab controls storefront availability and messaging. Inventory quantities remain
            managed per variant to avoid duplicate controls.
          </p>

          <div className={styles.modeGrid}>
            {SALES_MODES.map((mode) => (
              <AdminSelectableTile
                key={mode.value}
                className={styles.modeTile}
                media={<span className={`material-symbols-outlined ${styles.modeIcon}`}>{mode.icon}</span>}
                onClick={() => actions.setDraftField("salesMode", mode.value)}
                selected={draftProduct.salesMode === mode.value}
                subtitle={mode.subtitle}
                title={mode.title}
              />
            ))}
          </div>

          {draftProduct.salesMode === "presale" ? (
            <div className={styles.conditional}>
              <div className={styles.gridTwo}>
                <label className={styles.field}>
                  <span>Presale starts</span>
                  <AdminInput
                    onChange={(event) =>
                      actions.setDraftField(
                        "presaleStartsAt",
                        localInputToIso(event.target.value)
                      )
                    }
                    type="datetime-local"
                    value={isoToLocalInput(draftProduct.presaleStartsAt)}
                  />
                </label>
                <label className={styles.field}>
                  <span>Expected delivery</span>
                  <AdminInput
                    onChange={(event) =>
                      actions.setDraftField("expectedDeliveryText", event.target.value)
                    }
                    type="text"
                    value={draftProduct.expectedDeliveryText}
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span>Customer-facing presale message</span>
                <AdminTextarea
                  onChange={(event) =>
                    actions.setDraftField("availabilityMessage", event.target.value)
                  }
                  rows={4}
                  value={draftProduct.availabilityMessage}
                />
              </label>
            </div>
          ) : null}

          {draftProduct.salesMode === "coming_soon" ? (
            <div className={styles.conditional}>
              <div className={styles.gridTwo}>
                <label className={styles.field}>
                  <span>Launch date</span>
                  <AdminInput
                    onChange={(event) =>
                      actions.setDraftField(
                        "availableForPurchaseAt",
                        localInputToIso(event.target.value)
                      )
                    }
                    type="datetime-local"
                    value={isoToLocalInput(draftProduct.availableForPurchaseAt)}
                  />
                </label>
                <label className={styles.field}>
                  <span>Badge text</span>
                  <AdminInput
                    onChange={(event) =>
                      actions.setDraftField("storefrontBadgeText", event.target.value)
                    }
                    type="text"
                    value={draftProduct.storefrontBadgeText}
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span>Customer-facing coming soon message</span>
                <AdminTextarea
                  onChange={(event) =>
                    actions.setDraftField("availabilityMessage", event.target.value)
                  }
                  rows={4}
                  value={draftProduct.availabilityMessage}
                />
              </label>
            </div>
          ) : null}
        </AdminCard>

        <AdminCard className={styles.panelCard} spotlight variant="card">
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.eyebrow}>Inventory</p>
              <h3 className={`font-headline ${styles.title}`}>Inventory summary</h3>
            </div>
            <AdminButton onClick={onManageInVariants} size="sm" variant="secondary">
              Manage in Variants
            </AdminButton>
          </div>
          <p className={styles.copy}>
            Read-only here to avoid duplicate inventory controls. Quantity and continue-selling
            rules are managed per variant.
          </p>

          <div className={styles.summaryGrid}>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Total available</p>
              <p className={styles.summaryValue}>{totalInventory}</p>
              <p className={styles.summaryNote}>Across active variants</p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Selling after sellout</p>
              <p className={styles.summaryValue}>{continueSellingCount > 0 ? "On" : "Off"}</p>
              <p className={styles.summaryNote}>
                {allVariantsBackorder
                  ? "All variants allow backorder"
                  : `${continueSellingCount} variant${continueSellingCount === 1 ? "" : "s"} allow backorder`}
              </p>
            </div>
            <div className={styles.summaryCard}>
              <p className={styles.summaryLabel}>Tracking</p>
              <p className={styles.summaryValue}>Enabled</p>
              <p className={styles.summaryNote}>Inventory decrements after paid webhook</p>
            </div>
          </div>

          {showPresaleWarning ? (
            <div className={styles.notice}>
              <strong>Presale inventory rule check</strong>
              <span>
                Continue selling is managed in Variants. Since this is a presale, confirm your
                default variant can keep selling if inventory hits zero.
              </span>
            </div>
          ) : null}
        </AdminCard>

        <AdminCard className={styles.panelCard} spotlight variant="card">
          <p className={styles.eyebrow}>Fulfillment</p>
          <h3 className={`font-headline ${styles.title}`}>Fulfillment type</h3>

          <div className={styles.fulfillmentGrid}>
            {FULFILLMENT_MODES.map((mode) => (
              <AdminSelectableTile
                key={mode.value}
                className={styles.modeTile}
                media={<span className={`material-symbols-outlined ${styles.modeIcon}`}>{mode.icon}</span>}
                onClick={() => actions.setDraftField("fulfillmentType", mode.value)}
                selected={draftProduct.fulfillmentType === mode.value}
                subtitle={mode.subtitle}
                title={mode.title}
              />
            ))}
          </div>

          {draftProduct.fulfillmentType === "digital" ? (
            <div className={styles.digitalNotice}>
              <strong>Digital delivery</strong>
              <span>
                Digital delivery workflows remain provider-backed and server-owned. This release
                adds product-level digital availability foundations only.
              </span>
            </div>
          ) : null}
        </AdminCard>
      </div>

      <aside className={styles.previewCard}>
        {preview.badge ? <span className={styles.previewBadge}>{preview.badge}</span> : null}
        <div className={styles.previewImage}>
          <span className={styles.previewPlaceholder}>Preview</span>
        </div>
        <div className={styles.previewBody}>
          <h4>{draftProduct.title || "Untitled Product"}</h4>
          <p>{preview.previewMessage}</p>
          <p className={styles.previewPrice}>${Number(pricePreview || 0).toFixed(2)}</p>
          <button
            className={`${styles.previewAction} ${preview.buttonDisabled ? styles.previewActionDisabled : ""}`}
            disabled={preview.buttonDisabled}
            type="button"
          >
            {preview.buttonLabel}
          </button>
          <div className={styles.previewMeta}>
            {preview.isPresale && draftProduct.expectedDeliveryText ? (
              <span>{draftProduct.expectedDeliveryText}</span>
            ) : null}
            <span>{draftProduct.fulfillmentType === "digital" ? "Digital" : "Physical"}</span>
          </div>
        </div>
      </aside>
    </div>
  );
}
