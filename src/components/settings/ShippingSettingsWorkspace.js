"use client";

import { useCallback, useRef, useState } from "react";

import { useSettingsDirty } from "./useSettingsDraft";
import { mergeShippingEntity } from "./shipping-settings.helpers";
import Link from "next/link";
import AdminField from "../admin/ui/AdminField";
import AdminButton from "../admin/ui/AdminButton";
import AdminSelect from "../admin/ui/AdminSelect";
import AdminStatusChip from "../admin/ui/AdminStatusChip";
import ShippingSettingsEditor from "./ShippingSettingsEditor";
import ShippingSettingsWorkspaceHeader from "./ShippingSettingsWorkspaceHeader";
import ShippingSettingsWorkspaceSkeleton from "./ShippingSettingsWorkspaceSkeleton";
import ShippingSettingsWorkspaceStatusStack from "./ShippingSettingsWorkspaceStatusStack";
import styles from "./SettingsWorkspace.module.css";

const MODE_OPTIONS = [
  { value: "LIVE_RATES", label: "Live carrier rates" },
  { value: "MANUAL", label: "Manual rates" },
  { value: "HYBRID", label: "Live with fallback" },
];

const MODE_CARD_DESCRIPTIONS = {
  LIVE_RATES: "Customers see real-time rates from the carrier.",
  MANUAL: "Customers see your fixed manual rates at checkout.",
  HYBRID: "Doopify tries live rates first, then falls back to manual rates if allowed.",
};

const FALLBACK_BEHAVIOR_OPTIONS = [
  { value: "SHOW_FALLBACK", label: "Show configured fallback rates" },
  { value: "HIDE_SHIPPING", label: "Hide shipping (show checkout error)" },
  { value: "MANUAL_QUOTE", label: "Show manual quote request" },
];

class ApiRequestError extends Error {
  constructor(message, details) {
    super(message || "Request failed");
    this.name = "ApiRequestError";
    this.details = details;
  }
}

function formatFieldErrors(details) {
  const fieldErrors = details?.fieldErrors;
  if (!fieldErrors || typeof fieldErrors !== "object") {
    return "";
  }

  const entries = Object.entries(fieldErrors)
    .filter(([, value]) => Array.isArray(value) && value.length > 0)
    .map(([field, value]) => `${field}: ${value.join(", ")}`);

  return entries.length ? entries.join(" | ") : "";
}

function getErrorMessage(error, fallback = "Request failed") {
  if (error instanceof ApiRequestError) {
    const fieldErrorText = formatFieldErrors(error.details);
    return fieldErrorText ? `${error.message} (${fieldErrorText})` : error.message;
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

async function parseApiJson(response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new ApiRequestError(payload?.error || "Request failed", payload?.details);
  }
  return payload.data;
}

function formatMoney(amount, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount || 0));
}

function renderRateSummary(rate, currency) {
  if (rate.rateType === "FREE") {
    if (rate.freeOverAmount != null) {
      return `Free over ${formatMoney(rate.freeOverAmount, currency)}`;
    }
    return "Free";
  }
  if (rate.rateType === "WEIGHT_BASED") {
    return `${formatMoney(rate.amount, currency)} weight-based`;
  }
  if (rate.rateType === "PRICE_BASED") {
    return `${formatMoney(rate.amount, currency)} price-based`;
  }
  return formatMoney(rate.amount, currency);
}

export default function ShippingSettingsWorkspace({
  initialSettings,
  canViewDeveloper = false,
} = {}) {
  const [loading, setLoading] = useState(!initialSettings);
  const [editor, setEditor] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modeSaveState, setModeSaveState] = useState("saved");
  const [modeSaveError, setModeSaveError] = useState("");
  const loadRequestIdRef = useRef(0);

  const [settings, setSettings] = useState(initialSettings);

  const [mode, setMode] = useState(initialSettings?.shippingMode || "MANUAL");
  const activeRateProvider = settings?.activeRateProvider || "NONE";
  const labelProvider = settings?.labelProvider || "NONE";
  const [fallbackBehavior, setFallbackBehavior] = useState(initialSettings?.fallbackBehavior || "SHOW_FALLBACK");

  const [savedCheckoutMethod, setSavedCheckoutMethod] = useState(
    { mode: initialSettings?.shippingMode || "MANUAL", fallbackBehavior: initialSettings?.fallbackBehavior || "SHOW_FALLBACK" }
  );

  const packages = settings?.shippingPackages || [];
  const locations = settings?.shippingLocations || [];
  const manualRates = settings?.shippingManualRates || [];
  const fallbackRates = settings?.shippingFallbackRates || [];
  const currency = settings?.currency || "USD";

  const checkoutMethodDirty = mode !== savedCheckoutMethod.mode || fallbackBehavior !== savedCheckoutMethod.fallbackBehavior;

  useSettingsDirty(checkoutMethodDirty);


  const load = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    setError("");
    try {
      const shipping = await fetch("/api/settings/shipping?view=workspace", { cache: "no-store" }).then(parseApiJson);
      if (requestId !== loadRequestIdRef.current) return;

      setSettings(shipping);
      setMode(shipping.shippingMode || "MANUAL");
      setFallbackBehavior(shipping.fallbackBehavior || "SHOW_FALLBACK");
      setSavedCheckoutMethod({mode:shipping.shippingMode || "MANUAL",fallbackBehavior:shipping.fallbackBehavior || "SHOW_FALLBACK"});
      setModeSaveState("saved");
      setModeSaveError("");
      setLoading(false);

    } catch (loadError) {
      if (requestId !== loadRequestIdRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Failed to load shipping settings");
      setLoading(false);
    }
  }, []);


  async function persistSettings(patch, message) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await fetch("/api/settings/shipping?view=workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then(parseApiJson);
      setNotice(message || "Saved.");
      setSettings(current => ({ ...current, ...Object.fromEntries(Object.keys(patch).map(key => [key, updated[key]])) }));
      return { success: true, data: updated };
    } catch (saveError) {
      const messageText = getErrorMessage(saveError, "Failed to save shipping settings");
      setError(messageText);
      return { success: false, message: messageText };
    } finally {
      setSaving(false);
    }
  }

  async function persistEntity(url, method, payload, successMessage = "Saved.") {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined,
      }).then(parseApiJson);
      setNotice(successMessage);
      setSettings(current => mergeShippingEntity(current, url, method, updated));
      return { success: true };
    } catch (persistError) {
      const message = getErrorMessage(persistError, "Save failed");
      setError(message);
      return { success: false, message };
    } finally {
      setSaving(false);
    }
  }

  async function saveCheckoutMethod() {
    setModeSaveState("saving");
    setModeSaveError("");
    const result = await persistSettings(
      { shippingMode: mode, fallbackBehavior },
      "Checkout shipping method saved."
    );
    if (result.success) {
      const persistedDraft = { mode, fallbackBehavior };
      setSavedCheckoutMethod(persistedDraft);
      setModeSaveState("saved_just_now");
      setModeSaveError("");
    } else {
      setModeSaveState("error");
      setModeSaveError(result.message || "Save failed");
    }
    return result;
  }

  function openPackageDrawer(entry) { setError(""); setEditor({ type: "package", entry }); }
  function openLocationDrawer(entry) { setError(""); setEditor({ type: "location", entry }); }
  function openManualRateDrawer(entry) { setError(""); setEditor({ type: "manual", entry }); }
  function openFallbackRateDrawer(entry) { setError(""); setEditor({ type: "fallback", entry }); }

  const content = (
    <>
      <div className={styles.pageWrap}>
        <ShippingSettingsWorkspaceHeader onRefresh={() => { if (!checkoutMethodDirty || window.confirm("Discard unsaved changes and refresh?")) load(); }} />

        {loading ? <ShippingSettingsWorkspaceSkeleton /> : null}
        <ShippingSettingsWorkspaceStatusStack
          error={error}
          notice={notice}
        />

        {!loading ? (
          <div className={styles.configStack}>
            <section className={styles.configSection}>
              <div className={styles.sectionHeading}>
                <h2>Checkout rates</h2>
              </div>
              <div className={styles.shippingModeGrid}>
                {MODE_OPTIONS.map((option) => {
                  const selected = mode === option.value;
                  return (
                    <button
                      type="button"
                      aria-pressed={selected}
                      key={option.value}
                      className={`${styles.shippingModeCard} ${selected ? styles.shippingModeCardActive : ""}`}
                      onClick={() => {
                        setMode(option.value);
                        setModeSaveState("dirty");
                        setModeSaveError("");
                      }}
                    >
                      <div className={styles.shippingModeHeader}>
                        <p className={styles.shippingModeTitle}>{option.label}</p>
                        <AdminStatusChip tone={selected ? "success" : "neutral"}>
                          {selected ? "Selected" : "Not selected"}
                        </AdminStatusChip>
                      </div>
                      <p className={styles.shippingModeDescription}>{MODE_CARD_DESCRIPTIONS[option.value]}</p>
                    </button>
                  );
                })}
              </div>
              <div className={styles.shippingModeFooter}>
                {mode !== "MANUAL" && <AdminField label="If live rates are unavailable">
                  <AdminSelect
                    value={fallbackBehavior}
                    onChange={(value) => {
                      setFallbackBehavior(value);
                      setModeSaveState("dirty");
                      setModeSaveError("");
                    }}
                    options={FALLBACK_BEHAVIOR_OPTIONS}
                  />
                </AdminField>}
              </div>
              <div className={styles.actionRow}>
                <AdminButton disabled={saving || !checkoutMethodDirty} onClick={saveCheckoutMethod} size="sm" variant="secondary">
                  {saving ? "Saving..." : "Save checkout method"}
                </AdminButton>
              </div>
              {mode !== "MANUAL" && activeRateProvider === "NONE" && (
                <p className={styles.statusBlock} role="status">
                  Live shipping rates are unavailable. Ask your developer to enable a shipping service.
                  {canViewDeveloper && <Link prefetch={false} href="/admin/system/developer">View Developer status</Link>}
                </p>
              )}
              <p className={styles.compactMeta}>
                {modeSaveState === "saving"
                  ? "Saving checkout method..."
                  : modeSaveState === "saved_just_now"
                    ? "Checkout rate method saved."
                    : checkoutMethodDirty
                      ? "Unsaved changes. Save checkout method before leaving this section."
                      : modeSaveState === "error"
                        ? modeSaveError || "Save failed. Review the current selection and retry."
                        : "No unsaved checkout-method changes."}
              </p>
            </section>

            <section className={styles.configSection}>
              <div className={styles.sectionHeading}>
                <h2>Your shipping rates</h2>
              </div>
              <p className={styles.statusText}>Set the amounts customers pay when using manual rates or live rates with fallback.</p>
              {manualRates.length ? (
                manualRates.map((rate) => (
                  <div className={styles.configRow} key={rate.id}>
                    <p className={styles.statusText}>
                      <strong>{rate.name}</strong> · {rate.regionCountry || "All regions"} ·{" "}
                      {renderRateSummary(rate, currency)}
                      {rate.estimatedDeliveryText ? ` · ${rate.estimatedDeliveryText}` : ""}
                    </p>
                    <div className={styles.actionRow}>
                      {!rate.isActive ? <AdminStatusChip tone="warning">Inactive</AdminStatusChip> : null}
                      <AdminButton size="sm" variant="secondary" onClick={() => openManualRateDrawer(rate)}>
                        Edit
                      </AdminButton>
                    </div>
                  </div>
                ))
              ) : (
                <p className={styles.compactMeta}>No manual rates yet. Add a fixed price, free shipping or an order-based rate.</p>
              )}
              <div className={styles.actionRow}>
                <AdminButton size="sm" variant="secondary" onClick={() => openManualRateDrawer(null)}>
                  Add manual rate
                </AdminButton>
              </div>
            </section>

            <details className={styles.disclosure}>
              <summary><strong>Fallback rates</strong><span className={styles.compactMeta}>{fallbackRates.length} saved</span></summary>
              <div className={styles.configStack}>
              <p className={styles.statusText}>Used when live rates are unavailable and your fallback policy allows them.</p>
              {fallbackRates.length ? (
                fallbackRates.map((rate) => (
                  <div className={styles.configRow} key={rate.id}>
                    <p className={styles.statusText}>
                      <strong>{rate.name}</strong> · {formatMoney(rate.amount, currency)}
                      {rate.estimatedDeliveryText ? ` · ${rate.estimatedDeliveryText}` : ""}
                    </p>
                    <div className={styles.actionRow}>
                      {!rate.isActive ? <AdminStatusChip tone="warning">Inactive</AdminStatusChip> : null}
                      <AdminButton size="sm" variant="secondary" onClick={() => openFallbackRateDrawer(rate)}>
                        Edit
                      </AdminButton>
                    </div>
                  </div>
                ))
              ) : (
                <p className={styles.compactMeta}>No fallback rates yet.</p>
              )}
              <div className={styles.actionRow}>
                <AdminButton size="sm" variant="secondary" onClick={() => openFallbackRateDrawer(null)}>
                  Add fallback rate
                </AdminButton>
              </div>
              </div>
            </details>

            <section className={styles.configSection}>
              <h2>Ship-from locations</h2>
              <p className={styles.compactMeta}>Addresses used for shipping quotes and labels.</p>
              {locations.map((location) => (
                <div className={styles.configRow} key={location.id}>
                  <div><strong>{location.name}</strong><p className={styles.compactMeta}>{[location.address1, location.city, location.country].filter(Boolean).join(", ")}</p></div>
                  <div className={styles.compactActionRow}>
                    {location.isDefault && <AdminStatusChip tone="success">Default</AdminStatusChip>}
                    {!location.isActive && <AdminStatusChip tone="neutral">Inactive</AdminStatusChip>}
                    <AdminButton size="sm" variant="secondary" onClick={() => openLocationDrawer(location)}>Edit location</AdminButton>
                  </div>
                </div>
              ))}
              {!locations.length && <p>No shipping locations yet.</p>}
              <div><AdminButton variant="secondary" size="sm" onClick={() => openLocationDrawer(null)}>Add location</AdminButton></div>
            </section>
            <section className={styles.configSection}>
              <div className={styles.sectionHeading}>
                <h2>Packages</h2>
              </div>
              {packages.length ? (
                packages.map((entry) => (
                  <div className={styles.packageRow} key={entry.id}>
                    <div className={styles.requirementMain}>
                      <p className={styles.compactRowTitle}>{entry.name}</p>
                      <p className={styles.compactRowDescription}>
                        {entry.length} x {entry.width} x {entry.height} {entry.dimensionUnit}
                      </p>
                      <p className={styles.compactMeta}>
                        Empty package: {entry.emptyPackageWeight} {entry.weightUnit}
                      </p>
                    </div>
                    <div className={styles.shippingProviderActions}>
                      {entry.isDefault ? <AdminStatusChip tone="success">Default</AdminStatusChip> : null}
                      {!entry.isActive ? <AdminStatusChip tone="warning">Inactive</AdminStatusChip> : null}
                      <AdminButton size="sm" variant="secondary" onClick={() => openPackageDrawer(entry)}>
                        Edit
                      </AdminButton>
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.packageEmptyState}>
                  <p className={styles.compactRowDescription}>
                    No packages yet. Add a default package so live rates and labels can estimate shipping.
                  </p>
                  <AdminButton size="sm" variant="secondary" onClick={() => openPackageDrawer(null)}>
                    Add package
                  </AdminButton>
                </div>
              )}
              {packages.length ? (
                <div className={styles.actionRow}>
                  <AdminButton size="sm" variant="secondary" onClick={() => openPackageDrawer(null)}>
                    Add package
                  </AdminButton>
                </div>
              ) : null}
            </section>

            <section className={styles.configSection}>
              <div className={styles.sectionHeading}>
                <h2>Fulfillment & local delivery</h2>
              </div>
              <div className={styles.configRow}>
                <div><strong>Manual fulfillment</strong><p className={styles.compactMeta}>Instructions and tracking defaults for your team.</p></div>
                <AdminButton size="sm" variant="secondary" onClick={() => { setError(""); setEditor({ type: "manualFulfillment" }); }}>Edit instructions</AdminButton>
              </div>
              <div className={styles.configRow}>
                <p className={styles.statusText}>
                  <strong>Local delivery</strong> · Offer delivery by ZIP code or radius.
                </p>
                <div className={styles.actionRow}>
                  <AdminStatusChip tone={settings.localDeliveryEnabled ? "success" : "neutral"}>
                    {settings.localDeliveryEnabled ? "Enabled" : "Disabled"}
                  </AdminStatusChip>
                  <AdminButton size="sm" variant="secondary" onClick={() => { setError(""); setEditor({ type: "localDelivery" }); }}>
                    Set up
                  </AdminButton>
                </div>
              </div>
              <div className={styles.configRow}>
                <p className={styles.statusText}>
                  <strong>Pickup in store</strong> · Let customers pick up from your location.
                </p>
                <div className={styles.actionRow}>
                  <AdminStatusChip tone={settings.pickupEnabled ? "success" : "neutral"}>
                    {settings.pickupEnabled ? "Enabled" : "Disabled"}
                  </AdminStatusChip>
                  <AdminButton size="sm" variant="secondary" onClick={() => { setError(""); setEditor({ type: "pickup" }); }}>
                    Set up
                  </AdminButton>
                </div>
              </div>
              <div className={styles.configRow}>
                <p className={styles.statusText}>
                  <strong>Packing slip</strong> · Logo, SKU, product images, and footer note.
                </p>
                <div className={styles.actionRow}>
                  <AdminButton size="sm" variant="secondary" onClick={() => { setError(""); setEditor({ type: "packingSlip" }); }}>
                    Edit
                  </AdminButton>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>

      {editor && <ShippingSettingsEditor key={editor.type + (editor.entry?.id || "new")} {...editor} settings={settings} saving={saving} error={error} persistEntity={persistEntity} persistSettings={persistSettings} onClose={() => setEditor(null)} />}
    </>
  );

  return content;
}
