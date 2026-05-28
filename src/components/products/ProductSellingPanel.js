"use client";

import { useEffect, useMemo, useState } from "react";
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
    subtitle:
      "No shipping flow for buyers yet. Use this to prep product metadata and linked files in admin only.",
    icon: "download",
  },
];

function formatByteSize(byteSize) {
  const parsed = Number(byteSize);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return "Unknown size";
  }

  if (parsed < 1024) {
    return `${parsed} B`;
  }

  const kb = parsed / 1024;
  if (kb < 1024) {
    return `${kb.toFixed(1)} KB`;
  }

  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(1)} MB`;
  }

  const gb = mb / 1024;
  return `${gb.toFixed(1)} GB`;
}

function parseApiError(json, fallbackMessage) {
  if (json?.error && typeof json.error === "string") {
    return json.error;
  }
  return fallbackMessage;
}

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
          ? "Digital product foundation is configured. Checkout still follows current shipping flow in this release."
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
  const draftProductId = draftProduct?.id || null;
  const isPersistedProduct = editor.mode === "existing" && Boolean(draftProductId);
  const isDigitalProduct = draftProduct?.fulfillmentType === "digital";
  const [availableDigitalAssets, setAvailableDigitalAssets] = useState([]);
  const [linkedDigitalAssets, setLinkedDigitalAssets] = useState([]);
  const [selectedDigitalAssetId, setSelectedDigitalAssetId] = useState("");
  const [isLoadingDigitalAssets, setIsLoadingDigitalAssets] = useState(false);
  const [isLoadingLinkedAssets, setIsLoadingLinkedAssets] = useState(false);
  const [isLinkingAsset, setIsLinkingAsset] = useState(false);
  const [isUnlinkingAssetId, setIsUnlinkingAssetId] = useState(null);

  const linkedDigitalAssetIds = useMemo(
    () => new Set(linkedDigitalAssets.map((assetLink) => assetLink.digitalAsset?.id || assetLink.digitalAssetId)),
    [linkedDigitalAssets]
  );
  const unlinkedDigitalAssets = useMemo(
    () => availableDigitalAssets.filter((asset) => !linkedDigitalAssetIds.has(asset.id)),
    [availableDigitalAssets, linkedDigitalAssetIds]
  );

  useEffect(() => {
    let isCancelled = false;

    if (!isPersistedProduct) {
      return () => {
        isCancelled = true;
      };
    }

    async function loadDigitalAssets() {
      setIsLoadingDigitalAssets(true);
      try {
        const response = await fetch("/api/digital-assets");
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) {
          throw new Error(parseApiError(json, "Failed to load digital assets."));
        }
        if (!isCancelled) {
          setAvailableDigitalAssets(Array.isArray(json.data?.assets) ? json.data.assets : []);
        }
      } catch (error) {
        if (!isCancelled) {
          actions.showToast(error instanceof Error ? error.message : "Failed to load digital assets.", "error");
          setAvailableDigitalAssets([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingDigitalAssets(false);
        }
      }
    }

    async function loadLinkedDigitalAssets() {
      setIsLoadingLinkedAssets(true);
      try {
        const response = await fetch(`/api/products/${draftProductId}/digital-assets`);
        const json = await response.json().catch(() => null);
        if (!response.ok || !json?.success) {
          throw new Error(parseApiError(json, "Failed to load linked digital assets."));
        }
        if (!isCancelled) {
          setLinkedDigitalAssets(Array.isArray(json.data?.assets) ? json.data.assets : []);
        }
      } catch (error) {
        if (!isCancelled) {
          actions.showToast(
            error instanceof Error ? error.message : "Failed to load linked digital assets.",
            "error"
          );
          setLinkedDigitalAssets([]);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingLinkedAssets(false);
        }
      }
    }

    loadDigitalAssets();
    loadLinkedDigitalAssets();

    return () => {
      isCancelled = true;
    };
  }, [actions, draftProductId, isPersistedProduct]);

  const handleLinkDigitalAsset = async () => {
    if (!isPersistedProduct || !selectedDigitalAssetId || isLinkingAsset || !draftProductId) {
      return;
    }

    setIsLinkingAsset(true);

    try {
      const response = await fetch(`/api/products/${draftProductId}/digital-assets`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ digitalAssetId: selectedDigitalAssetId }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(parseApiError(json, "Failed to link digital asset to product."));
      }

      const linkedAsset = json.data;
      if (linkedAsset?.id) {
        setLinkedDigitalAssets((currentLinks) => {
          const existingIndex = currentLinks.findIndex((currentLink) => currentLink.id === linkedAsset.id);
          if (existingIndex >= 0) {
            const nextLinks = [...currentLinks];
            nextLinks[existingIndex] = linkedAsset;
            return nextLinks;
          }

          return [...currentLinks, linkedAsset].sort((left, right) => {
            if (left.sortOrder !== right.sortOrder) {
              return (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
            }
            return String(left.createdAt || "").localeCompare(String(right.createdAt || ""));
          });
        });
      }

      setSelectedDigitalAssetId("");
      actions.showToast("Digital asset linked to product.", "success");
    } catch (error) {
      actions.showToast(
        error instanceof Error ? error.message : "Failed to link digital asset to product.",
        "error"
      );
    } finally {
      setIsLinkingAsset(false);
    }
  };

  const handleUnlinkDigitalAsset = async (digitalAssetId) => {
    if (!isPersistedProduct || !digitalAssetId || isUnlinkingAssetId || !draftProductId) {
      return;
    }

    setIsUnlinkingAssetId(digitalAssetId);

    try {
      const response = await fetch(`/api/products/${draftProductId}/digital-assets`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ digitalAssetId }),
      });
      const json = await response.json().catch(() => null);
      if (!response.ok || !json?.success) {
        throw new Error(parseApiError(json, "Failed to unlink digital asset."));
      }

      setLinkedDigitalAssets((currentLinks) =>
        currentLinks.filter((currentLink) => (currentLink.digitalAsset?.id || currentLink.digitalAssetId) !== digitalAssetId)
      );
      actions.showToast("Digital asset unlinked from product.", "success");
    } catch (error) {
      actions.showToast(error instanceof Error ? error.message : "Failed to unlink digital asset.", "error");
    } finally {
      setIsUnlinkingAssetId(null);
    }
  };

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

          {isDigitalProduct ? (
            <div className={styles.digitalNotice}>
              <strong>Digital checkout delivery is being configured</strong>
              <span>
                Digital fulfillment is marked on this product, but digital checkout is not live
                yet. Customers will still see the current shipping flow until digital checkout is
                completed.
              </span>
            </div>
          ) : null}
        </AdminCard>

        {isDigitalProduct ? (
          <AdminCard className={styles.panelCard} spotlight variant="card">
            <div className={styles.sectionHead}>
              <div>
                <p className={styles.eyebrow}>Digital files</p>
                <h3 className={`font-headline ${styles.title}`}>Linked digital assets</h3>
              </div>
            </div>
            <p className={styles.copy}>
              Private upload and customer delivery are not live yet. Link existing digital asset
              metadata records to this product for admin setup.
            </p>

            {!isPersistedProduct ? (
              <div className={styles.notice}>
                <strong>Save this product first</strong>
                <span>Digital assets can be linked after the product is saved to the database.</span>
              </div>
            ) : (
              <>
                <div className={styles.assetLinkRow}>
                  <label className={styles.field}>
                    <span>Available assets</span>
                    <select
                      className={`admin-input ${styles.assetSelect}`}
                      disabled={
                        isLoadingDigitalAssets ||
                        isLoadingLinkedAssets ||
                        isLinkingAsset ||
                        unlinkedDigitalAssets.length === 0
                      }
                      onChange={(event) => setSelectedDigitalAssetId(event.target.value)}
                      value={selectedDigitalAssetId}
                    >
                      <option value="">Select a digital asset</option>
                      {unlinkedDigitalAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.title} ({asset.fileName})
                        </option>
                      ))}
                    </select>
                  </label>
                  <AdminButton
                    disabled={!selectedDigitalAssetId || isLinkingAsset}
                    loading={isLinkingAsset}
                    onClick={handleLinkDigitalAsset}
                    size="sm"
                    variant="secondary"
                  >
                    Link asset
                  </AdminButton>
                </div>

                {isLoadingLinkedAssets ? (
                  <p className={styles.assetInlineMessage}>Loading linked assets...</p>
                ) : null}

                {!isLoadingLinkedAssets && linkedDigitalAssets.length === 0 ? (
                  <p className={styles.assetEmpty}>No digital files linked yet</p>
                ) : null}

                {!isLoadingLinkedAssets && linkedDigitalAssets.length > 0 ? (
                  <ul className={styles.assetList}>
                    {linkedDigitalAssets.map((assetLink) => {
                      const asset = assetLink.digitalAsset;
                      const assetId = asset?.id || assetLink.digitalAssetId;
                      if (!assetId) {
                        return null;
                      }

                      return (
                        <li key={assetLink.id || assetId} className={styles.assetItem}>
                          <div className={styles.assetMeta}>
                            <p className={styles.assetTitle}>{asset?.title || "Untitled asset"}</p>
                            <p className={styles.assetDetail}>
                              {asset?.fileName || "Unknown filename"} · {asset?.contentType || "Unknown type"} ·{" "}
                              {formatByteSize(asset?.byteSize)}
                            </p>
                          </div>
                          <AdminButton
                            disabled={Boolean(isUnlinkingAssetId)}
                            loading={isUnlinkingAssetId === assetId}
                            onClick={() => handleUnlinkDigitalAsset(assetId)}
                            size="sm"
                            variant="ghost"
                          >
                            Unlink
                          </AdminButton>
                        </li>
                      );
                    })}
                  </ul>
                ) : null}

                {!isLoadingDigitalAssets && availableDigitalAssets.length === 0 ? (
                  <div className={styles.notice}>
                    <strong>No digital assets available</strong>
                    <span>
                      Create digital asset metadata from the Digital Assets admin API flow, then
                      return to link files to this product.
                    </span>
                  </div>
                ) : null}
              </>
            )}
          </AdminCard>
        ) : null}
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
