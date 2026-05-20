"use client";

import { useEffect, useState } from "react";
import ProductMediaManager from "./ProductMediaManager";
import ProductSellingPanel from "./ProductSellingPanel";
import ProductStatusControl from "./ProductStatusControl";
import ProductVariantEditor from "./ProductVariantEditor";
import { useProductStore } from "../../context/ProductContext";
import { getComputedProductStateMeta, isFuturePublishDate } from "../../lib/productUtils";
import AdminButton from "../admin/ui/AdminButton";
import AdminCard from "../admin/ui/AdminCard";
import AdminDrawer from "../admin/ui/AdminDrawer";
import AdminInput from "../admin/ui/AdminInput";
import AdminSavedState from "../admin/ui/AdminSavedState";
import AdminSchedulePopover from "../admin/ui/AdminSchedulePopover";
import AdminTextarea from "../admin/ui/AdminTextarea";
import { useSettings } from "../../context/SettingsContext";
import { formatDateTimeForDisplay, resolveSafeTimeZone } from "../../lib/date-time-format";
import styles from "./ProductEditorDrawer.module.css";

function formatScheduleText(isoDate, timeZone) {
  if (!isoDate) {
    return "Not scheduled";
  }

  return formatDateTimeForDisplay(isoDate, {
    timeZone,
    fallbackText: "Not scheduled",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function SectionCard({ eyebrow, title, children }) {
  return (
    <AdminCard className={styles.sectionCard} spotlight variant="card">
      <p className={styles.sectionEyebrow}>{eyebrow}</p>
      <h3 className={`font-headline ${styles.sectionTitle}`}>{title}</h3>
      {children}
    </AdminCard>
  );
}

export default function ProductEditorDrawer() {
  const { settings } = useSettings();
  const { editor, formatMoney, actions } = useProductStore();
  const [activeTabId, setActiveTabId] = useState("basic");
  const draftProduct = editor.draftProduct;

  useEffect(() => {
    if (!editor.isOpen) {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
      setActiveTabId("basic");
    }
  }, [editor.isOpen]);

  if (!draftProduct || !editor.isOpen) {
    return null;
  }

  const isSaveDisabled =
    editor.isSaving ||
    editor.isUploadingMedia ||
    (editor.mode === "existing" && !editor.hasUnsavedChanges);
  const title = draftProduct.title || "Untitled Product";
  const saveState = editor.isSaving ? "saving" : editor.hasUnsavedChanges ? "dirty" : "saved";
  const computedState = getComputedProductStateMeta(draftProduct);
  const hasFutureSchedule = isFuturePublishDate(draftProduct.publishedAt);
  const timezone =
    resolveSafeTimeZone(settings?.timezone) ||
    Intl.DateTimeFormat().resolvedOptions().timeZone ||
    "Local timezone";
  const scheduleLabel = hasFutureSchedule
    ? `Scheduled for ${formatScheduleText(draftProduct.publishedAt, timezone)}`
    : "";
  const scheduleSummary = hasFutureSchedule
    ? scheduleLabel
    : draftProduct.publishedAt
      ? `Published ${formatScheduleText(draftProduct.publishedAt, timezone)}`
      : "Not scheduled";

  const handleStatusChange = (nextStatus) => {
    if (nextStatus === "archived" && draftProduct.status !== "archived") {
      const shouldArchive = window.confirm(
        "Archive this product? Archived products are hidden from storefront."
      );
      if (!shouldArchive) {
        return;
      }
    }

    if (nextStatus === "draft" && hasFutureSchedule) {
      const clearSchedule = window.confirm(
        "Switching to Draft clears the scheduled publish date by default. Press OK to clear it, or Cancel to keep the schedule."
      );
      actions.setDraftField("status", "draft");
      if (clearSchedule) {
        actions.setDraftField("publishedAt", null);
      }
      return;
    }

    actions.setDraftField("status", nextStatus);
  };

  const tabs = [
    {
      id: "basic",
      label: "Basic",
      content: (
        <div className={styles.drawerBody}>
          <SectionCard eyebrow="Basic" title="Product identity">
            <div className={styles.gridTwo}>
              <label className={styles.field}>
                <span>Title</span>
                <AdminInput
                  onChange={(event) => actions.setDraftField("title", event.target.value)}
                  type="text"
                  value={draftProduct.title}
                />
              </label>
              <label className={styles.field}>
                <span>Primary SKU</span>
                <AdminInput
                  onChange={(event) => actions.setDraftField("sku", event.target.value)}
                  type="text"
                  value={draftProduct.sku}
                />
              </label>
            </div>
          </SectionCard>

          <SectionCard eyebrow="Description" title="Product description">
            <label className={styles.field}>
              <span>Description</span>
              <AdminTextarea
                onChange={(event) => actions.setDraftField("description", event.target.value)}
                rows={5}
                value={draftProduct.description}
              />
            </label>
          </SectionCard>

          <SectionCard eyebrow="Pricing" title="Base merchandising price">
            <div className={styles.gridTwo}>
              <label className={styles.field}>
                <span>Price</span>
                <AdminInput
                  onChange={(event) => actions.setDraftField("basePrice", event.target.value)}
                  type="text"
                  value={draftProduct.basePrice}
                />
              </label>
              <label className={styles.field}>
                <span>Compare-at price</span>
                <AdminInput
                  onChange={(event) => actions.setDraftField("compareAtPrice", event.target.value)}
                  type="text"
                  value={draftProduct.compareAtPrice}
                />
              </label>
            </div>
            <div className={styles.pricePreview}>
              <div>
                <p className={styles.metricLabel}>Live price</p>
                <p className={styles.metricValue}>{formatMoney(draftProduct.basePrice)}</p>
              </div>
              <div>
                <p className={styles.metricLabel}>Compare-at</p>
                <p className={styles.metricSecondary}>
                  {formatMoney(draftProduct.compareAtPrice)}
                </p>
              </div>
            </div>
          </SectionCard>
        </div>
      ),
    },
    {
      id: "media",
      label: "Media",
      content: (
        <div className={styles.drawerBody}>
          <SectionCard eyebrow="Media" title="Product gallery">
            <ProductMediaManager />
          </SectionCard>
        </div>
      ),
    },
    {
      id: "selling",
      label: "Selling",
      content: (
        <div className={styles.drawerBody}>
          <ProductSellingPanel onManageInVariants={() => setActiveTabId("variants")} />
        </div>
      ),
    },
    {
      id: "variants",
      label: "Variants",
      content: (
        <div className={styles.drawerBody}>
          <SectionCard eyebrow="Variants" title="Options and combinations">
            <ProductVariantEditor />
          </SectionCard>
        </div>
      ),
    },
    {
      id: "seo",
      label: "SEO",
      content: (
        <div className={styles.drawerBody}>
          <SectionCard eyebrow="Organization" title="Category and tags">
            <div className={styles.gridTwo}>
              <label className={styles.field}>
                <span>Category</span>
                <AdminInput
                  onChange={(event) => actions.setDraftField("category", event.target.value)}
                  type="text"
                  value={draftProduct.category}
                />
              </label>
              <label className={styles.field}>
                <span>Tags</span>
                <AdminInput
                  onChange={(event) => actions.setDraftTagsFromText(event.target.value)}
                  type="text"
                  value={draftProduct.tags.join(", ")}
                />
              </label>
            </div>
          </SectionCard>
        </div>
      ),
    },
  ];

  return (
    <AdminDrawer
      activeTabId={activeTabId}
      actions={
        <>
          <AdminButton onClick={() => actions.cancelDraftChanges()} size="sm" variant="ghost">
            Cancel
          </AdminButton>
          <AdminButton
            disabled={isSaveDisabled}
            loading={editor.isSaving}
            onClick={() => actions.saveDraft()}
            size="sm"
            variant="primary"
          >
            Save
          </AdminButton>
        </>
      }
      className={`admin-spotlight ${styles.drawer}`}
      contextItems={[
        { label: "Products" },
        { label: title, current: true },
        { label: computedState.label },
      ]}
      footer={
        <div className={styles.footerState}>
          <AdminSavedState savedAgoText="just now" state={saveState} />
          {editor.isUploadingMedia ? (
            <span className={styles.uploadingNotice}>Uploading media assets...</span>
          ) : null}
        </div>
      }
      headerActions={
        <div className={styles.headerActionsWrap}>
          <ProductStatusControl
            computedState={computedState}
            onChange={handleStatusChange}
            scheduleLabel={scheduleLabel}
            value={draftProduct.status}
          />
          <AdminSchedulePopover
            onChange={(nextIso) => {
              actions.setDraftField("publishedAt", nextIso);
              if (nextIso) {
                actions.setDraftField("status", "active");
              }
            }}
            timezoneLabel={timezone}
            triggerLabel="Schedule"
            value={draftProduct.publishedAt}
          />
          <AdminButton
            onClick={() => actions.requestDuplicateProduct()}
            size="sm"
            variant="secondary"
          >
            Duplicate
          </AdminButton>
        </div>
      }
      onActiveTabChange={setActiveTabId}
      onClose={() => actions.requestCloseEditor()}
      open={editor.isOpen}
      subtitle={`Status: ${computedState.label} | Publish: ${scheduleSummary}`}
      tabs={tabs}
      title={title}
    />
  );
}
