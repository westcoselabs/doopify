"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import AppShell from "../AppShell";
import AdminButton from "../admin/ui/AdminButton";
import AdminCard from "../admin/ui/AdminCard";
import AdminDrawer from "../admin/ui/AdminDrawer";
import AdminEmptyState from "../admin/ui/AdminEmptyState";
import AdminField from "../admin/ui/AdminField";
import AdminInput from "../admin/ui/AdminInput";
import AdminSelect from "../admin/ui/AdminSelect";
import AdminStatusChip from "../admin/ui/AdminStatusChip";
import AdminTextarea from "../admin/ui/AdminTextarea";
import {
  buildCheckoutMethodDraft,
  buildCheckoutMethodPatch,
  isCheckoutMethodEqual,
  providerSelectionToLegacyUsage,
} from "./shipping-checkout-method.helpers";
import ShippingSettingsWorkspaceHeader from "./ShippingSettingsWorkspaceHeader";
import ShippingSettingsWorkspaceSkeleton from "./ShippingSettingsWorkspaceSkeleton";
import ShippingSettingsWorkspaceStatusStack from "./ShippingSettingsWorkspaceStatusStack";
import styles from "./SettingsWorkspace.module.css";

const PROVIDER_OPTIONS = [
  { value: "NONE", label: "None" },
  { value: "SHIPPO", label: "Shippo" },
  { value: "EASYPOST", label: "EasyPost" },
];

const MODE_OPTIONS = [
  { value: "LIVE_RATES", label: "Live carrier rates" },
  { value: "MANUAL", label: "Manual rates" },
  { value: "HYBRID", label: "Hybrid" },
];

const MODE_CARD_DESCRIPTIONS = {
  LIVE_RATES: "Customers see real-time rates from your selected provider.",
  MANUAL: "Customers see your fixed manual rates at checkout.",
  HYBRID: "Doopify tries live rates first, then falls back to manual rates if allowed.",
};

const FALLBACK_BEHAVIOR_OPTIONS = [
  { value: "SHOW_FALLBACK", label: "Show configured fallback rates" },
  { value: "HIDE_SHIPPING", label: "Hide shipping (show checkout error)" },
  { value: "MANUAL_QUOTE", label: "Show manual quote request" },
];

const PROVIDER_USAGE_OPTIONS = [
  { value: "LIVE_AND_LABELS", label: "Live rates and label buying" },
  { value: "LABELS_ONLY", label: "Label buying only" },
  { value: "LIVE_RATES_ONLY", label: "Live rates only" },
];

const PROVIDER_USAGE_HELPER_COPY = {
  LIVE_AND_LABELS:
    "Checkout uses live carrier rates and Doopify can also buy labels after orders are paid.",
  LABELS_ONLY:
    "Checkout does not request live carrier rates. Doopify can buy labels only after orders are paid.",
  LIVE_RATES_ONLY:
    "Checkout uses live carrier rates, but label purchase remains disabled for this provider.",
};

const DEFAULT_PACKAGE_FORM = {
  id: "",
  name: "",
  type: "BOX",
  length: "",
  width: "",
  height: "",
  dimensionUnit: "IN",
  emptyPackageWeight: "",
  weightUnit: "OZ",
  isDefault: true,
  isActive: true,
};

const DEFAULT_LOCATION_FORM = {
  id: "",
  name: "",
  contactName: "",
  email: "",
  company: "",
  address1: "",
  address2: "",
  city: "",
  stateProvince: "",
  postalCode: "",
  country: "US",
  phone: "",
  isDefault: true,
  isActive: true,
};

const DEFAULT_MANUAL_RATE_FORM = {
  id: "",
  name: "",
  regionCountry: "US",
  regionStateProvince: "",
  rateType: "FLAT",
  amount: "",
  minWeight: "",
  maxWeight: "",
  minSubtotal: "",
  maxSubtotal: "",
  freeOverAmount: "",
  estimatedDeliveryText: "",
  isActive: true,
};

const DEFAULT_FALLBACK_RATE_FORM = {
  id: "",
  name: "",
  regionCountry: "US",
  regionStateProvince: "",
  amount: "",
  estimatedDeliveryText: "",
  isActive: true,
};

const DEFAULT_PROVIDER_FORM = {
  provider: "NONE",
  usage: "LIVE_AND_LABELS",
  token: "",
};

const DEFAULT_MANUAL_FULFILLMENT_FORM = {
  manualFulfillmentInstructions: "",
  manualTrackingBehavior: "",
};

const DEFAULT_LOCAL_DELIVERY_FORM = {
  localDeliveryEnabled: false,
  localDeliveryPrice: "",
  localDeliveryMinimumOrder: "",
  localDeliveryCoverage: "",
  localDeliveryInstructions: "",
};

const DEFAULT_PICKUP_FORM = {
  pickupEnabled: false,
  pickupLocation: "",
  pickupInstructions: "",
  pickupEstimate: "",
};

const DEFAULT_PACKING_SLIP_FORM = {
  packingSlipUseLogo: true,
  packingSlipShowSku: true,
  packingSlipShowProductImages: false,
  packingSlipFooterNote: "",
};

function parseNumber(value) {
  if (value == null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeOptional(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function normalizeCountry(value) {
  return String(value || "").trim().toUpperCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

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

function formatShippingProviderName(provider) {
  if (provider === "SHIPPO") return "Shippo";
  if (provider === "EASYPOST") return "EasyPost";
  return "Provider";
}

function isVerificationTemporarilyUnavailable(message) {
  const normalized = String(message || "").trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes("timeout") ||
    normalized.includes("timed out") ||
    normalized.includes("network") ||
    normalized.includes("temporarily unavailable")
  );
}

export default function ShippingSettingsWorkspace({
  embedded = false,
  onModeSaveStateChange,
  onRegisterSaveAction,
} = {}) {
  const [loading, setLoading] = useState(true);
  const [setupStatusLoading, setSetupStatusLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modeSaveState, setModeSaveState] = useState("saved");
  const [modeSaveError, setModeSaveError] = useState("");
  const saveCheckoutMethodRef = useRef(null);
  const loadRequestIdRef = useRef(0);

  const [settings, setSettings] = useState(null);
  const [setupStatus, setSetupStatus] = useState(null);

  const [mode, setMode] = useState("MANUAL");
  const [activeRateProvider, setActiveRateProvider] = useState("NONE");
  const [labelProvider, setLabelProvider] = useState("NONE");
  const [fallbackBehavior, setFallbackBehavior] = useState("SHOW_FALLBACK");

  const [providerDrawerOpen, setProviderDrawerOpen] = useState(false);
  const [providerForm, setProviderForm] = useState(DEFAULT_PROVIDER_FORM);
  const [providerTestMessage, setProviderTestMessage] = useState("");
  const [providerVerifyLoading, setProviderVerifyLoading] = useState(false);

  const [packageDrawerOpen, setPackageDrawerOpen] = useState(false);
  const [locationDrawerOpen, setLocationDrawerOpen] = useState(false);
  const [manualDrawerOpen, setManualDrawerOpen] = useState(false);
  const [fallbackDrawerOpen, setFallbackDrawerOpen] = useState(false);
  const [manualFulfillmentDrawerOpen, setManualFulfillmentDrawerOpen] = useState(false);
  const [localDeliveryDrawerOpen, setLocalDeliveryDrawerOpen] = useState(false);
  const [pickupDrawerOpen, setPickupDrawerOpen] = useState(false);
  const [packingSlipDrawerOpen, setPackingSlipDrawerOpen] = useState(false);

  const [packageForm, setPackageForm] = useState(DEFAULT_PACKAGE_FORM);
  const [locationForm, setLocationForm] = useState(DEFAULT_LOCATION_FORM);
  const [manualForm, setManualForm] = useState(DEFAULT_MANUAL_RATE_FORM);
  const [fallbackForm, setFallbackForm] = useState(DEFAULT_FALLBACK_RATE_FORM);
  const [manualFulfillmentForm, setManualFulfillmentForm] = useState(DEFAULT_MANUAL_FULFILLMENT_FORM);
  const [localDeliveryForm, setLocalDeliveryForm] = useState(DEFAULT_LOCAL_DELIVERY_FORM);
  const [pickupForm, setPickupForm] = useState(DEFAULT_PICKUP_FORM);
  const [packingSlipForm, setPackingSlipForm] = useState(DEFAULT_PACKING_SLIP_FORM);
  const [locationValidationMessage, setLocationValidationMessage] = useState("");
  const [locationDrawerError, setLocationDrawerError] = useState("");
  const [packageDrawerError, setPackageDrawerError] = useState("");
  const [manualDrawerError, setManualDrawerError] = useState("");
  const [savedCheckoutMethod, setSavedCheckoutMethod] = useState(
    buildCheckoutMethodDraft("MANUAL", "NONE", "NONE", "SHOW_FALLBACK")
  );

  const packages = settings?.shippingPackages || [];
  const locations = settings?.shippingLocations || [];
  const manualRates = settings?.shippingManualRates || [];
  const fallbackRates = settings?.shippingFallbackRates || [];
  const currency = settings?.currency || "USD";

  const hasDefaultPackage = useMemo(
    () => packages.some((entry) => entry.isDefault && entry.isActive),
    [packages]
  );
  const hasDefaultLocation = useMemo(
    () => locations.some((entry) => entry.isDefault && entry.isActive),
    [locations]
  );
  const defaultLocationEntry = useMemo(
    () => locations.find((entry) => entry.isDefault && entry.isActive) || locations[0] || null,
    [locations]
  );
  const defaultPackageEntry = useMemo(
    () => packages.find((entry) => entry.isDefault && entry.isActive) || packages[0] || null,
    [packages]
  );
  const setupStatusPending = setupStatusLoading && !setupStatus;
  const hasProviderConnection = setupStatusPending
    ? null
    : Boolean(setupStatus?.liveProviderConnected ?? setupStatus?.providerConnected);
  const hasLabelProviderConnection = setupStatusPending
    ? null
    : Boolean(setupStatus?.labelProviderConnected ?? setupStatus?.providerConnected);
  const hasFallbackRate = useMemo(
    () => Boolean(setupStatus?.hasFallbackRate ?? fallbackRates.some((entry) => entry.isActive)),
    [fallbackRates, setupStatus?.hasFallbackRate]
  );
  const shippoInUse = activeRateProvider === "SHIPPO" || labelProvider === "SHIPPO";
  const easypostInUse = activeRateProvider === "EASYPOST" || labelProvider === "EASYPOST";
  const manualFulfillmentConfigured = Boolean(
    (manualFulfillmentForm.manualFulfillmentInstructions || "").trim() ||
      (manualFulfillmentForm.manualTrackingBehavior || "").trim()
  );
  const missingLiveRateRequirements =
    !setupStatusLoading &&
    (mode === "LIVE_RATES" || mode === "HYBRID") &&
    (!hasDefaultLocation || !hasDefaultPackage || !hasProviderConnection);
  const resolvedShipFromEmail =
    normalizeOptional(defaultLocationEntry?.email) ||
    normalizeOptional(settings?.supportEmail) ||
    normalizeOptional(settings?.email) ||
    normalizeOptional(settings?.shippingOriginEmail);
  const resolvedShipFromPhone =
    normalizeOptional(defaultLocationEntry?.phone) ||
    normalizeOptional(settings?.supportPhone) ||
    normalizeOptional(settings?.phone) ||
    normalizeOptional(settings?.shippingOriginPhone);
  const missingShipFromEmailForShippo = shippoInUse && !resolvedShipFromEmail;
  const missingShipFromPhoneForShippo = shippoInUse && !resolvedShipFromPhone;
  const checkoutMethodDraft = useMemo(
    () => buildCheckoutMethodDraft(mode, activeRateProvider, labelProvider, fallbackBehavior),
    [mode, activeRateProvider, labelProvider, fallbackBehavior]
  );
  const checkoutMethodDirty = useMemo(
    () => !isCheckoutMethodEqual(checkoutMethodDraft, savedCheckoutMethod),
    [checkoutMethodDraft, savedCheckoutMethod]
  );
  const providerVerificationPresentation = useMemo(() => {
    if (setupStatusPending) {
      return {
        tone: "neutral",
        label: "Loading saved status...",
        detail: "Loading saved verification state.",
      };
    }

    const status = String(setupStatus?.providerVerificationStatus || "").trim().toLowerCase();
    if (status === "verified") {
      return {
        tone: "success",
        label: "Verified",
        detail: "Live provider verification passed.",
      };
    }
    if (status === "configured") {
      return {
        tone: "warning",
        label: "Configured",
        detail: "Saved config is ready. Run verification to confirm live connectivity.",
      };
    }
    if (status === "verification_unavailable") {
      return {
        tone: "warning",
        label: "Verification unavailable",
        detail: "Saved configuration is present, but verification metadata is unavailable.",
      };
    }
    if (status === "needs_attention" && isVerificationTemporarilyUnavailable(setupStatus?.providerLastError)) {
      return {
        tone: "warning",
        label: "Verification unavailable",
        detail: "Saved configuration is present, but live verification is temporarily unavailable.",
      };
    }
    if (status === "needs_attention") {
      return {
        tone: "danger",
        label: "Needs attention",
        detail: setupStatus?.providerLastError || "Provider verification failed. Review credentials and retry.",
      };
    }
    return {
      tone: "warning",
      label: "Needs setup",
      detail: "Provider setup is incomplete for the selected checkout mode.",
    };
  }, [setupStatus?.providerLastError, setupStatus?.providerVerificationStatus, setupStatusPending]);
  const drawerProviderConnectionState = useMemo(() => {
    if (providerForm.provider === "NONE") {
      return {
        tone: "neutral",
        label: "Not connected",
        detail: "Select Shippo or EasyPost to connect credentials.",
      };
    }

    const matchesActiveProvider = providerForm.provider === activeRateProvider;
    const matchesLabelProvider = providerForm.provider === labelProvider;
    const connected =
      (matchesActiveProvider && Boolean(hasProviderConnection)) ||
      (matchesLabelProvider && Boolean(hasLabelProviderConnection));
    const providerName = formatShippingProviderName(providerForm.provider);

    if (setupStatusPending) {
      return {
        tone: "neutral",
        label: "Loading saved status...",
        detail: `${providerName} connection status is still loading.`,
      };
    }

    if (connected) {
      return {
        tone: "success",
        label: "Connected",
        detail: `${providerName} is connected and available with your current shipping settings.`,
      };
    }

    return {
      tone: "warning",
      label: "Not connected",
      detail: `${providerName} is not connected. Save credentials and verify connection to use this provider.`,
    };
  }, [
    providerForm.provider,
    activeRateProvider,
    labelProvider,
    hasProviderConnection,
    hasLabelProviderConnection,
    setupStatusPending,
  ]);

  const load = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;
    setLoading(true);
    setError("");
    setSetupStatusLoading(true);
    try {
      const shipping = await fetch("/api/settings/shipping", { cache: "no-store" }).then(parseApiJson);
      if (requestId !== loadRequestIdRef.current) return;

      setSettings(shipping);
      setMode(shipping.shippingMode || "MANUAL");
      setActiveRateProvider(shipping.activeRateProvider || "NONE");
      setLabelProvider(shipping.labelProvider || "NONE");
      setFallbackBehavior(shipping.fallbackBehavior || "SHOW_FALLBACK");
      setSavedCheckoutMethod(
        buildCheckoutMethodDraft(
          shipping.shippingMode || "MANUAL",
          shipping.activeRateProvider || "NONE",
          shipping.labelProvider || "NONE",
          shipping.fallbackBehavior || "SHOW_FALLBACK"
        )
      );
      setModeSaveState("saved");
      setModeSaveError("");
      setProviderForm({
        provider:
          shipping.activeRateProvider && shipping.activeRateProvider !== "NONE"
            ? shipping.activeRateProvider
            : shipping.labelProvider && shipping.labelProvider !== "NONE"
              ? shipping.labelProvider
              : "NONE",
        usage:
          shipping.shippingProviderUsage ||
          providerSelectionToLegacyUsage(shipping.activeRateProvider || "NONE", shipping.labelProvider || "NONE"),
        token: "",
      });
      setManualFulfillmentForm({
        manualFulfillmentInstructions: shipping.manualFulfillmentInstructions || "",
        manualTrackingBehavior: shipping.manualTrackingBehavior || "",
      });
      setLocalDeliveryForm({
        localDeliveryEnabled: Boolean(shipping.localDeliveryEnabled),
        localDeliveryPrice:
          shipping.localDeliveryPrice == null ? "" : String(shipping.localDeliveryPrice),
        localDeliveryMinimumOrder:
          shipping.localDeliveryMinimumOrder == null ? "" : String(shipping.localDeliveryMinimumOrder),
        localDeliveryCoverage: shipping.localDeliveryCoverage || "",
        localDeliveryInstructions: shipping.localDeliveryInstructions || "",
      });
      setPickupForm({
        pickupEnabled: Boolean(shipping.pickupEnabled),
        pickupLocation: shipping.pickupLocation || "",
        pickupInstructions: shipping.pickupInstructions || "",
        pickupEstimate: shipping.pickupEstimate || "",
      });
      setPackingSlipForm({
        packingSlipUseLogo: shipping.packingSlipUseLogo !== false,
        packingSlipShowSku: shipping.packingSlipShowSku !== false,
        packingSlipShowProductImages: Boolean(shipping.packingSlipShowProductImages),
        packingSlipFooterNote: shipping.packingSlipFooterNote || "",
      });
      setLoading(false);

      void (async () => {
        try {
          const setup = await fetch("/api/settings/shipping/setup-status", { cache: "no-store" }).then(parseApiJson);
          if (requestId !== loadRequestIdRef.current) return;
          setSetupStatus(setup);
        } catch {
          if (requestId !== loadRequestIdRef.current) return;
          // Preserve the previous saved snapshot on transient load failures
          // so the UI does not regress to setup-missing while status refreshes.
        } finally {
          if (requestId !== loadRequestIdRef.current) return;
          setSetupStatusLoading(false);
        }
      })();
    } catch (loadError) {
      if (requestId !== loadRequestIdRef.current) return;
      setError(loadError instanceof Error ? loadError.message : "Failed to load shipping settings");
      setLoading(false);
      setSetupStatusLoading(false);
    }
  }, []);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    load();
  }, [load]);

  useEffect(() => {
    if (modeSaveState === "saving" || modeSaveState === "error") return;
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    setModeSaveState(checkoutMethodDirty ? "dirty" : "saved");
  }, [checkoutMethodDirty, modeSaveState]);

  useEffect(() => {
    if (typeof onModeSaveStateChange !== "function") return;
    onModeSaveStateChange(modeSaveState, {
      errorCopy: modeSaveState === "error" ? modeSaveError || "Save failed" : "",
      dirty: checkoutMethodDirty,
    });
  }, [modeSaveState, modeSaveError, checkoutMethodDirty, onModeSaveStateChange]);

  async function persistSettings(patch, message) {
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const updated = await fetch("/api/settings/shipping", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }).then(parseApiJson);
      setNotice(message || "Saved.");
      await load();
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
      await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: payload ? JSON.stringify(payload) : undefined,
      }).then(parseApiJson);
      setNotice(successMessage);
      await load();
      return { success: true };
    } catch (persistError) {
      const message = getErrorMessage(persistError, "Save failed");
      setError(message);
      return { success: false, message };
    } finally {
      setSaving(false);
    }
  }

  const saveCheckoutMethod = useCallback(async () => {
    if ((mode === "LIVE_RATES" || mode === "HYBRID") && activeRateProvider === "NONE" && labelProvider !== "NONE") {
      const blockedMessage =
        "Checkout is set to live/hybrid, but provider usage is currently label buying only. Enable live-rate usage in the provider drawer first.";
      setError(blockedMessage);
      setModeSaveState("error");
      setModeSaveError(blockedMessage);
      return { success: false, message: blockedMessage };
    }

    setModeSaveState("saving");
    setModeSaveError("");
    const result = await persistSettings(
      buildCheckoutMethodPatch(mode, activeRateProvider, labelProvider, fallbackBehavior),
      "Checkout shipping method saved."
    );
    if (result.success) {
      const persistedDraft = buildCheckoutMethodDraft(mode, activeRateProvider, labelProvider, fallbackBehavior);
      setSavedCheckoutMethod(persistedDraft);
      setModeSaveState("saved_just_now");
      setModeSaveError("");
    } else {
      setModeSaveState("error");
      setModeSaveError(result.message || "Save failed");
    }
    return result;
  }, [mode, activeRateProvider, labelProvider, fallbackBehavior]);

  useEffect(() => {
    saveCheckoutMethodRef.current = saveCheckoutMethod;
  }, [saveCheckoutMethod]);

  useEffect(() => {
    if (typeof onRegisterSaveAction !== "function") return;
    onRegisterSaveAction(() => saveCheckoutMethodRef.current?.());
    return () => onRegisterSaveAction(null);
  }, [onRegisterSaveAction]);

  async function saveProviderSettings() {
    const provider = providerForm.provider;
    const usage = providerForm.usage;
    if (provider === "NONE") {
      setError("Select Shippo or EasyPost in provider setup.");
      return;
    }

    const isLiveAllowed = usage !== "LABELS_ONLY";
    const isLabelAllowed = usage !== "LIVE_RATES_ONLY";
    const nextActive = isLiveAllowed ? provider : "NONE";
    const nextLabel = isLabelAllowed ? provider : "NONE";

    setSaving(true);
    setError("");
    setNotice("");
    try {
      if (providerForm.token.trim()) {
        await fetch("/api/settings/shipping/connect-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ provider, apiKey: providerForm.token.trim() }),
        }).then(parseApiJson);
      }

      await fetch("/api/settings/shipping", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingLiveProvider: provider,
          shippingProviderUsage: usage,
          activeRateProvider: nextActive,
          labelProvider: nextLabel,
        }),
      }).then(parseApiJson);

      setProviderForm((current) => ({ ...current, token: "" }));
      setNotice("Provider settings saved.");
      await load();
    } catch (providerError) {
      setError(providerError instanceof Error ? providerError.message : "Failed to save provider settings");
    } finally {
      setSaving(false);
    }
  }

  async function verifyProvider() {
    const provider = providerForm.provider;
    if (provider === "NONE") {
      setError("Select a provider before verification.");
      return;
    }

    setProviderVerifyLoading(true);
    setError("");
    try {
      const data = await fetch("/api/settings/shipping/test-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      }).then(parseApiJson);

      setProviderTestMessage(data?.result?.message || "Provider verification completed.");
      await load();
    } catch (providerError) {
      setError(providerError instanceof Error ? providerError.message : "Failed to verify provider");
    } finally {
      setProviderVerifyLoading(false);
    }
  }

  async function disconnectProvider() {
    const provider = providerForm.provider;
    if (provider === "NONE") {
      setError("Select a provider to disconnect.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");
    try {
      await fetch("/api/settings/shipping/disconnect-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider }),
      }).then(parseApiJson);

      const nextActive = activeRateProvider === provider ? "NONE" : activeRateProvider;
      const nextLabel = labelProvider === provider ? "NONE" : labelProvider;
      const legacyUsage = providerSelectionToLegacyUsage(nextActive, nextLabel);
      const legacyProvider = nextActive !== "NONE" ? nextActive : nextLabel !== "NONE" ? nextLabel : null;

      await fetch("/api/settings/shipping", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shippingLiveProvider: legacyProvider,
          shippingProviderUsage: legacyUsage,
          activeRateProvider: nextActive,
          labelProvider: nextLabel,
        }),
      }).then(parseApiJson);

      setProviderForm((current) => ({ ...current, token: "" }));
      setNotice("Provider disconnected.");
      await load();
    } catch (providerError) {
      setError(providerError instanceof Error ? providerError.message : "Failed to disconnect provider");
    } finally {
      setSaving(false);
    }
  }

  async function validateLocationAddress() {
    setSaving(true);
    setError("");
    setLocationValidationMessage("");
    try {
      const data = await fetch("/api/settings/shipping/locations/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address1: locationForm.address1,
          city: locationForm.city,
          stateProvince: normalizeOptional(locationForm.stateProvince),
          postalCode: locationForm.postalCode,
          country: normalizeCountry(locationForm.country),
        }),
      }).then(parseApiJson);
      setLocationValidationMessage(data?.message || "Validation complete.");
    } catch (validationError) {
      setError(validationError instanceof Error ? validationError.message : "Address validation failed");
    } finally {
      setSaving(false);
    }
  }

  function openPackageDrawer(entry) {
    setPackageDrawerError("");
    if (!entry) {
      setPackageForm({ ...DEFAULT_PACKAGE_FORM });
    } else {
      setPackageForm({
        id: entry.id,
        name: entry.name || "",
        type: entry.type || "BOX",
        length: String(entry.length ?? ""),
        width: String(entry.width ?? ""),
        height: String(entry.height ?? ""),
        dimensionUnit: entry.dimensionUnit || "IN",
        emptyPackageWeight: String(entry.emptyPackageWeight ?? ""),
        weightUnit: entry.weightUnit || "OZ",
        isDefault: Boolean(entry.isDefault),
        isActive: Boolean(entry.isActive),
      });
    }
    setPackageDrawerOpen(true);
  }

  function openLocationDrawer(entry) {
    setLocationValidationMessage("");
    setLocationDrawerError("");
    if (!entry) {
      setLocationForm({ ...DEFAULT_LOCATION_FORM });
    } else {
      setLocationForm({
        id: entry.id,
        name: entry.name || "",
        contactName: entry.contactName || "",
        email: entry.email || "",
        company: entry.company || "",
        address1: entry.address1 || "",
        address2: entry.address2 || "",
        city: entry.city || "",
        stateProvince: entry.stateProvince || "",
        postalCode: entry.postalCode || "",
        country: entry.country || "US",
        phone: entry.phone || "",
        isDefault: Boolean(entry.isDefault),
        isActive: Boolean(entry.isActive),
      });
    }
    setLocationDrawerOpen(true);
  }

  function openManualRateDrawer(entry) {
    setManualDrawerError("");
    if (!entry) {
      setManualForm({ ...DEFAULT_MANUAL_RATE_FORM });
    } else {
      setManualForm({
        id: entry.id,
        name: entry.name || "",
        regionCountry: entry.regionCountry || "",
        regionStateProvince: entry.regionStateProvince || "",
        rateType: entry.rateType || "FLAT",
        amount: String(entry.amount ?? ""),
        minWeight: entry.minWeight == null ? "" : String(entry.minWeight),
        maxWeight: entry.maxWeight == null ? "" : String(entry.maxWeight),
        minSubtotal: entry.minSubtotal == null ? "" : String(entry.minSubtotal),
        maxSubtotal: entry.maxSubtotal == null ? "" : String(entry.maxSubtotal),
        freeOverAmount: entry.freeOverAmount == null ? "" : String(entry.freeOverAmount),
        estimatedDeliveryText: entry.estimatedDeliveryText || "",
        isActive: Boolean(entry.isActive),
      });
    }
    setManualDrawerOpen(true);
  }

  function validateManualRate() {
    if (!manualForm.name.trim()) {
      return "Rate name is required.";
    }
    const amount = parseNumber(manualForm.amount);
    if (manualForm.rateType !== "FREE" && (amount == null || amount < 0)) {
      return "Amount must be 0 or greater.";
    }
    if (manualForm.rateType === "WEIGHT_BASED") {
      const minW = parseNumber(manualForm.minWeight);
      if (minW == null) {
        return "Min weight is required for weight-based rates. Enter 0 to match all cart weights.";
      }
      const maxW = parseNumber(manualForm.maxWeight);
      if (maxW != null && minW != null && maxW < minW) {
        return "Max weight must be greater than or equal to min weight.";
      }
    }
    if (manualForm.rateType === "PRICE_BASED") {
      const minS = parseNumber(manualForm.minSubtotal);
      const maxS = parseNumber(manualForm.maxSubtotal);
      if (maxS != null && maxS > 0 && minS != null && maxS < minS) {
        return "Max order total must be greater than or equal to min order total.";
      }
    }
    return null;
  }

  function validatePackageForm() {
    if (!packageForm.name.trim()) {
      return "Package name is required.";
    }
    const length = parseNumber(packageForm.length);
    const width = parseNumber(packageForm.width);
    const height = parseNumber(packageForm.height);
    const emptyWeight = parseNumber(packageForm.emptyPackageWeight);

    if (length == null || length <= 0) {
      return "Length must be greater than 0.";
    }
    if (width == null || width <= 0) {
      return "Width must be greater than 0.";
    }
    if (height == null || height <= 0) {
      return "Height must be greater than 0.";
    }
    if (emptyWeight == null || emptyWeight <= 0) {
      return "Empty package weight must be greater than 0.";
    }

    return null;
  }

  function openFallbackRateDrawer(entry) {
    if (!entry) {
      setFallbackForm({ ...DEFAULT_FALLBACK_RATE_FORM });
    } else {
      setFallbackForm({
        id: entry.id,
        name: entry.name || "",
        regionCountry: entry.regionCountry || "",
        regionStateProvince: entry.regionStateProvince || "",
        amount: String(entry.amount ?? ""),
        estimatedDeliveryText: entry.estimatedDeliveryText || "",
        isActive: Boolean(entry.isActive),
      });
    }
    setFallbackDrawerOpen(true);
  }

  function deriveUsageForProvider(provider) {
    if (activeRateProvider === provider && labelProvider === provider) {
      return "LIVE_AND_LABELS";
    }
    if (activeRateProvider === provider) {
      return "LIVE_RATES_ONLY";
    }
    if (labelProvider === provider) {
      return "LABELS_ONLY";
    }
    return "LIVE_AND_LABELS";
  }

  function openProviderDrawerFor(provider) {
    setProviderTestMessage("");
    setProviderForm((current) => ({
      ...current,
      provider,
      usage: deriveUsageForProvider(provider),
      token: "",
    }));
    setProviderDrawerOpen(true);
  }

  async function savePackage() {
    setPackageDrawerError("");
    const packageValidationError = validatePackageForm();
    if (packageValidationError) {
      setPackageDrawerError(packageValidationError);
      return;
    }

    const result = await persistEntity(
      packageForm.id ? `/api/settings/shipping/packages/${packageForm.id}` : "/api/settings/shipping/packages",
      packageForm.id ? "PATCH" : "POST",
      {
        name: packageForm.name.trim(),
        type: packageForm.type,
        length: parseNumber(packageForm.length),
        width: parseNumber(packageForm.width),
        height: parseNumber(packageForm.height),
        dimensionUnit: packageForm.dimensionUnit,
        emptyPackageWeight: parseNumber(packageForm.emptyPackageWeight),
        weightUnit: packageForm.weightUnit,
        isDefault: Boolean(packageForm.isDefault),
        isActive: Boolean(packageForm.isActive),
      },
      packageForm.id ? "Package updated." : "Package added."
    );
    if (result.success) {
      setPackageDrawerOpen(false);
      return;
    }
    setPackageDrawerError(result.message || "Failed to save package.");
  }

  async function saveLocation() {
    setLocationDrawerError("");
    const normalizedEmail = normalizeOptional(locationForm.email);
    if (normalizedEmail && !isValidEmail(normalizedEmail)) {
      setLocationDrawerError("Email must be a valid email address.");
      return;
    }

    await persistEntity(
      locationForm.id ? `/api/settings/shipping/locations/${locationForm.id}` : "/api/settings/shipping/locations",
      locationForm.id ? "PATCH" : "POST",
      {
        name: locationForm.name.trim(),
        contactName: normalizeOptional(locationForm.contactName),
        email: normalizedEmail,
        company: normalizeOptional(locationForm.company),
        address1: locationForm.address1.trim(),
        address2: normalizeOptional(locationForm.address2),
        city: locationForm.city.trim(),
        stateProvince: normalizeOptional(locationForm.stateProvince),
        postalCode: locationForm.postalCode.trim(),
        country: normalizeCountry(locationForm.country),
        phone: normalizeOptional(locationForm.phone),
        isDefault: Boolean(locationForm.isDefault),
        isActive: Boolean(locationForm.isActive),
      },
      locationForm.id ? "Ship-from location updated." : "Ship-from location added."
    );
    setLocationDrawerOpen(false);
  }

  async function saveManualRate() {
    setManualDrawerError("");
    const validationError = validateManualRate();
    if (validationError) {
      setManualDrawerError(validationError);
      return;
    }
    const result = await persistEntity(
      manualForm.id ? `/api/settings/shipping/manual-rates/${manualForm.id}` : "/api/settings/shipping/manual-rates",
      manualForm.id ? "PATCH" : "POST",
      {
        name: manualForm.name.trim(),
        regionCountry: normalizeOptional(manualForm.regionCountry)?.toUpperCase() || null,
        regionStateProvince: normalizeOptional(manualForm.regionStateProvince),
        rateType: manualForm.rateType,
        amount: manualForm.rateType === "FREE" ? 0 : parseNumber(manualForm.amount),
        minWeight: parseNumber(manualForm.minWeight),
        maxWeight: parseNumber(manualForm.maxWeight),
        minSubtotal: parseNumber(manualForm.minSubtotal),
        maxSubtotal: parseNumber(manualForm.maxSubtotal),
        estimatedDeliveryText: normalizeOptional(manualForm.estimatedDeliveryText),
        isActive: Boolean(manualForm.isActive),
      },
      manualForm.id ? "Manual rate updated." : "Manual rate added."
    );
    if (result.success) {
      setManualDrawerOpen(false);
      return;
    }
    setManualDrawerError(result.message || "Failed to save manual rate.");
  }

  async function saveFallbackRate() {
    await persistEntity(
      fallbackForm.id
        ? `/api/settings/shipping/fallback-rates/${fallbackForm.id}`
        : "/api/settings/shipping/fallback-rates",
      fallbackForm.id ? "PATCH" : "POST",
      {
        name: fallbackForm.name.trim(),
        regionCountry: normalizeOptional(fallbackForm.regionCountry)?.toUpperCase() || null,
        regionStateProvince: normalizeOptional(fallbackForm.regionStateProvince),
        amount: parseNumber(fallbackForm.amount),
        estimatedDeliveryText: normalizeOptional(fallbackForm.estimatedDeliveryText),
        isActive: Boolean(fallbackForm.isActive),
      },
      fallbackForm.id ? "Fallback rate updated." : "Fallback rate added."
    );
    setFallbackDrawerOpen(false);
  }

  async function saveManualFulfillmentSettings() {
    await persistSettings(
      {
        manualFulfillmentInstructions: normalizeOptional(manualFulfillmentForm.manualFulfillmentInstructions),
        manualTrackingBehavior: normalizeOptional(manualFulfillmentForm.manualTrackingBehavior),
      },
      "Manual fulfillment settings saved."
    );
    setManualFulfillmentDrawerOpen(false);
  }

  async function saveLocalDeliverySettings() {
    await persistSettings(
      {
        localDeliveryEnabled: Boolean(localDeliveryForm.localDeliveryEnabled),
        localDeliveryPrice:
          parseNumber(localDeliveryForm.localDeliveryPrice) == null
            ? null
            : parseNumber(localDeliveryForm.localDeliveryPrice),
        localDeliveryMinimumOrder:
          parseNumber(localDeliveryForm.localDeliveryMinimumOrder) == null
            ? null
            : parseNumber(localDeliveryForm.localDeliveryMinimumOrder),
        localDeliveryCoverage: normalizeOptional(localDeliveryForm.localDeliveryCoverage),
        localDeliveryInstructions: normalizeOptional(localDeliveryForm.localDeliveryInstructions),
      },
      "Local delivery settings saved."
    );
    setLocalDeliveryDrawerOpen(false);
  }

  async function savePickupSettings() {
    await persistSettings(
      {
        pickupEnabled: Boolean(pickupForm.pickupEnabled),
        pickupLocation: normalizeOptional(pickupForm.pickupLocation),
        pickupInstructions: normalizeOptional(pickupForm.pickupInstructions),
        pickupEstimate: normalizeOptional(pickupForm.pickupEstimate),
      },
      "Pickup settings saved."
    );
    setPickupDrawerOpen(false);
  }

  async function savePackingSlipSettings() {
    await persistSettings(
      {
        packingSlipUseLogo: Boolean(packingSlipForm.packingSlipUseLogo),
        packingSlipShowSku: Boolean(packingSlipForm.packingSlipShowSku),
        packingSlipShowProductImages: Boolean(packingSlipForm.packingSlipShowProductImages),
        packingSlipFooterNote: normalizeOptional(packingSlipForm.packingSlipFooterNote),
      },
      "Packing slip settings saved."
    );
    setPackingSlipDrawerOpen(false);
  }

  const content = (
    <>
      <div className={styles.pageWrap}>
        <ShippingSettingsWorkspaceHeader onRefresh={load} />

        {loading ? <ShippingSettingsWorkspaceSkeleton /> : null}
        <ShippingSettingsWorkspaceStatusStack
          error={error}
          notice={notice}
          setupStatusPending={!loading && setupStatusPending}
          setupStatusPendingMessage="Loading saved status..."
        />

        {!loading ? (
          <div className={styles.configStack}>
            <section className={styles.configSection}>
              <div className={styles.sectionHeading}>
                <h3>Simple rule</h3>
              </div>
              <p className={styles.statusText}>
                Checkout rates decide what customers pay. Label providers create postage after the order is placed.
              </p>
              <p className={styles.compactMeta}>
                Keep these configured separately so pilot checkout totals stay predictable while fulfillment stays flexible.
              </p>
              <div className={styles.methodChipRow}>
                <span className={styles.methodChip}>Checkout rates</span>
                <span className={styles.methodChip}>Label buying</span>
                <span className={styles.methodChip}>Fallbacks</span>
              </div>
            </section>

            <section className={styles.configSection}>
              <div className={styles.sectionHeading}>
                <h3>Checkout rate method</h3>
              </div>
              <div className={styles.shippingModeGrid}>
                {MODE_OPTIONS.map((option) => {
                  const selected = mode === option.value;
                  return (
                    <button
                      type="button"
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
                <AdminField label="Fallback behavior">
                  <AdminSelect
                    value={fallbackBehavior}
                    onChange={(value) => {
                      setFallbackBehavior(value);
                      setModeSaveState("dirty");
                      setModeSaveError("");
                    }}
                    options={FALLBACK_BEHAVIOR_OPTIONS}
                  />
                </AdminField>
              </div>
              <div className={styles.actionRow}>
                <AdminButton disabled={saving} onClick={saveCheckoutMethod} size="sm" variant="secondary">
                  {saving ? "Saving..." : "Save checkout method"}
                </AdminButton>
              </div>
              <p className={styles.compactMeta}>
                {modeSaveState === "saving"
                  ? "Saving checkout method..."
                  : modeSaveState === "saved_just_now"
                    ? "Saved just now. Run a checkout rate quote to confirm expected customer-facing options."
                    : modeSaveState === "dirty"
                      ? "Unsaved changes. Save checkout method before leaving this section."
                      : modeSaveState === "error"
                        ? modeSaveError || "Save failed. Review the current selection and retry."
                        : "No unsaved checkout-method changes."}
              </p>
            </section>

            <section className={styles.configSection}>
              <div className={styles.sectionHeading}>
                <h3>Live rate and label provider</h3>
              </div>
              <div className={styles.shippingProviderList}>
                <div className={styles.shippingProviderRow}>
                  <div className={styles.shippingProviderMain}>
                    <p className={styles.compactRowTitle}>Shippo</p>
                    <p className={styles.compactRowDescription}>Live rates, labels, tracking, and validation.</p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone={shippoInUse ? "success" : "neutral"}>
                      {shippoInUse ? "In use" : "Not in use"}
                    </AdminStatusChip>
                    <AdminButton size="sm" variant="secondary" onClick={() => openProviderDrawerFor("SHIPPO")}>
                      Manage
                    </AdminButton>
                  </div>
                </div>
                <div className={styles.shippingProviderRow}>
                  <div className={styles.shippingProviderMain}>
                    <p className={styles.compactRowTitle}>EasyPost</p>
                    <p className={styles.compactRowDescription}>Alternative rate and label provider.</p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone={easypostInUse ? "success" : "neutral"}>
                      {easypostInUse ? "In use" : "Not in use"}
                    </AdminStatusChip>
                    <AdminButton size="sm" variant="secondary" onClick={() => openProviderDrawerFor("EASYPOST")}>
                      Manage
                    </AdminButton>
                  </div>
                </div>
                <div className={styles.shippingProviderRow}>
                  <div className={styles.shippingProviderMain}>
                    <p className={styles.compactRowTitle}>Manual fulfillment</p>
                    <p className={styles.compactRowDescription}>Mark shipped and add tracking manually.</p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone={manualFulfillmentConfigured ? "success" : "neutral"}>
                      {manualFulfillmentConfigured ? "Configured" : "Optional"}
                    </AdminStatusChip>
                    <AdminButton size="sm" variant="secondary" onClick={() => setManualFulfillmentDrawerOpen(true)}>
                      Configure
                    </AdminButton>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.configSection}>
              <div className={styles.sectionHeading}>
                <h3>Saved setup status</h3>
              </div>
              <p className={styles.compactMeta}>
                These checks read your saved settings and help confirm pilot readiness before first live traffic.
              </p>
              <div className={styles.requirementsList}>
                <div className={styles.requirementRow}>
                  <div className={styles.requirementMain}>
                    <p className={styles.compactRowTitle}>Shipping mode</p>
                    <p className={styles.compactRowDescription}>
                      {setupStatus?.shippingMode || mode}
                    </p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone="success">Configured</AdminStatusChip>
                  </div>
                </div>
                <div className={styles.requirementRow}>
                  <div className={styles.requirementMain}>
                    <p className={styles.compactRowTitle}>Live provider</p>
                    <p className={styles.compactRowDescription}>
                      {setupStatus?.shippingLiveProvider || "Not selected"}
                    </p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip
                      tone={
                        setupStatusPending
                          ? "neutral"
                          : setupStatus?.shippingMode === "MANUAL" || setupStatus?.shippingLiveProvider
                            ? "success"
                            : "warning"
                      }
                    >
                      {setupStatusPending
                        ? "Loading"
                        : setupStatus?.shippingMode === "MANUAL"
                          ? "Optional"
                          : setupStatus?.shippingLiveProvider
                            ? "Configured"
                            : "Needs setup"}
                    </AdminStatusChip>
                  </div>
                </div>
                <div className={styles.requirementRow}>
                  <div className={styles.requirementMain}>
                    <p className={styles.compactRowTitle}>Provider usage</p>
                    <p className={styles.compactRowDescription}>
                      {setupStatus?.shippingProviderUsage || providerForm.usage}
                    </p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone="success">Configured</AdminStatusChip>
                  </div>
                </div>
                <div className={styles.requirementRow}>
                  <div className={styles.requirementMain}>
                    <p className={styles.compactRowTitle}>Origin address</p>
                    <p className={styles.compactRowDescription}>Required for rates and labels.</p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone={setupStatusPending ? "neutral" : setupStatus?.hasOriginAddress ? "success" : "warning"}>
                      {setupStatusPending ? "Loading" : setupStatus?.hasOriginAddress ? "Configured" : "Needs setup"}
                    </AdminStatusChip>
                  </div>
                </div>
                <div className={styles.requirementRow}>
                  <div className={styles.requirementMain}>
                    <p className={styles.compactRowTitle}>Default package</p>
                    <p className={styles.compactRowDescription}>Required for live quotes and label estimates.</p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone={setupStatusPending ? "neutral" : setupStatus?.hasDefaultPackage ? "success" : "warning"}>
                      {setupStatusPending ? "Loading" : setupStatus?.hasDefaultPackage ? "Configured" : "Needs setup"}
                    </AdminStatusChip>
                  </div>
                </div>
                <div className={styles.requirementRow}>
                  <div className={styles.requirementMain}>
                    <p className={styles.compactRowTitle}>Manual rates</p>
                    <p className={styles.compactRowDescription}>Used for manual mode and hybrid fallback.</p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone={setupStatusPending ? "neutral" : setupStatus?.hasManualRates ? "success" : "warning"}>
                      {setupStatusPending ? "Loading" : setupStatus?.hasManualRates ? "Configured" : "Needs setup"}
                    </AdminStatusChip>
                  </div>
                </div>
                <div className={styles.requirementRow}>
                  <div className={styles.requirementMain}>
                    <p className={styles.compactRowTitle}>Fallback rate</p>
                    <p className={styles.compactRowDescription}>Shown only when live rate requests fail.</p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone={setupStatusPending ? "neutral" : hasFallbackRate ? "success" : "warning"}>
                      {setupStatusPending ? "Loading" : hasFallbackRate ? "Configured" : "Needs setup"}
                    </AdminStatusChip>
                  </div>
                </div>
              </div>
            </section>

            <section className={styles.configSection}>
              <div className={styles.sectionHeading}>
                <h3>Pilot launch checklist</h3>
              </div>
              <p className={styles.compactMeta}>
                Complete these items before enabling live-rate checkout for customers.
              </p>
              <div className={styles.requirementsList}>
                <div className={styles.requirementRow}>
                  <div className={styles.requirementMain}>
                    <p className={styles.compactRowTitle}>Ship-from location</p>
                    <p className={styles.compactRowDescription}>Address used for rates, labels, and returns.</p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone={hasDefaultLocation ? "success" : "warning"}>
                      {hasDefaultLocation ? "Ready" : "Missing"}
                    </AdminStatusChip>
                    <AdminButton
                      onClick={() => openLocationDrawer(defaultLocationEntry)}
                      size="sm"
                      variant="secondary"
                    >
                      {hasDefaultLocation ? "Edit" : "Set location"}
                    </AdminButton>
                  </div>
                </div>
                <div className={styles.requirementRow}>
                  <div className={styles.requirementMain}>
                    <p className={styles.compactRowTitle}>Default package</p>
                    <p className={styles.compactRowDescription}>Required for live quotes and label estimates.</p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone={hasDefaultPackage ? "success" : "warning"}>
                      {hasDefaultPackage ? "Ready" : "Missing"}
                    </AdminStatusChip>
                    <AdminButton
                      onClick={() => openPackageDrawer(defaultPackageEntry)}
                      size="sm"
                      variant="secondary"
                    >
                      {hasDefaultPackage ? "Edit" : "Add package"}
                    </AdminButton>
                  </div>
                </div>
                <div className={styles.requirementRow}>
                  <div className={styles.requirementMain}>
                    <p className={styles.compactRowTitle}>Provider connection</p>
                    <p className={styles.compactRowDescription}>
                      Live rates need a verified live-rate provider. Labels need a verified label provider.
                    </p>
                    <p className={styles.compactMeta}>
                      {providerVerificationPresentation.detail}
                      {setupStatus?.providerLastVerifiedAt
                        ? ` Last verified: ${new Date(setupStatus.providerLastVerifiedAt).toLocaleString()}.`
                        : ""}
                    </p>
                    {setupStatus?.providerLastError ? (
                      <p className={styles.compactMeta}>Last error: {setupStatus.providerLastError}</p>
                    ) : null}
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone={providerVerificationPresentation.tone}>
                      {providerVerificationPresentation.label}
                    </AdminStatusChip>
                    <AdminButton
                      size="sm"
                      variant="ghost"
                      disabled={providerVerifyLoading || providerForm.provider === "NONE"}
                      onClick={verifyProvider}
                    >
                      {providerVerifyLoading ? "Verifying..." : "Verify provider"}
                    </AdminButton>
                    <AdminButton
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        openProviderDrawerFor(
                          activeRateProvider !== "NONE"
                            ? activeRateProvider
                            : labelProvider !== "NONE"
                              ? labelProvider
                              : "SHIPPO"
                        )
                      }
                    >
                      Manage
                    </AdminButton>
                  </div>
                </div>
                <div className={styles.requirementRow}>
                  <div className={styles.requirementMain}>
                    <p className={styles.compactRowTitle}>Ship-from email</p>
                    <p className={styles.compactRowDescription}>
                      Required by Shippo/USPS when buying labels.
                    </p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone={missingShipFromEmailForShippo ? "warning" : "success"}>
                      {missingShipFromEmailForShippo ? "Missing" : "Ready"}
                    </AdminStatusChip>
                    <AdminButton
                      onClick={() => openLocationDrawer(defaultLocationEntry)}
                      size="sm"
                      variant="secondary"
                    >
                      {defaultLocationEntry ? "Edit" : "Set location"}
                    </AdminButton>
                  </div>
                </div>
                <div className={styles.requirementRow}>
                  <div className={styles.requirementMain}>
                    <p className={styles.compactRowTitle}>Ship-from phone</p>
                    <p className={styles.compactRowDescription}>
                      Required by Shippo/USPS when buying labels.
                    </p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone={missingShipFromPhoneForShippo ? "warning" : "success"}>
                      {missingShipFromPhoneForShippo ? "Missing" : "Ready"}
                    </AdminStatusChip>
                    <AdminButton
                      onClick={() => openLocationDrawer(defaultLocationEntry)}
                      size="sm"
                      variant="secondary"
                    >
                      {defaultLocationEntry ? "Edit" : "Set location"}
                    </AdminButton>
                  </div>
                </div>
                <div className={styles.requirementRow}>
                  <div className={styles.requirementMain}>
                    <p className={styles.compactRowTitle}>Fallback shipping rate</p>
                    <p className={styles.compactRowDescription}>Shown only if Shippo/EasyPost cannot return rates.</p>
                  </div>
                  <div className={styles.shippingProviderActions}>
                    <AdminStatusChip tone={hasFallbackRate ? "success" : "neutral"}>
                      {hasFallbackRate ? "Ready" : "Optional"}
                    </AdminStatusChip>
                    <AdminButton onClick={() => openFallbackRateDrawer(null)} size="sm" variant="secondary">
                      Add fallback
                    </AdminButton>
                  </div>
                </div>
              </div>
              {missingLiveRateRequirements ? (
                <p className={styles.statusText}>Finish the missing items before live rates or label buying can work.</p>
              ) : null}
              {missingShipFromEmailForShippo ? (
                <p className={styles.statusText}>
                  Ship-from email is required before buying Shippo labels. Add it to your shipping location or store profile.
                </p>
              ) : null}
              {missingShipFromPhoneForShippo ? (
                <p className={styles.statusText}>
                  Ship-from phone is required before buying Shippo labels. Add it to your shipping location or store profile.
                </p>
              ) : null}
              {shippoInUse ? (
                <p className={styles.statusText}>
                  Shippo/USPS labels require a ship-from email and phone number.
                </p>
              ) : null}
              {!missingLiveRateRequirements && hasLabelProviderConnection === false ? (
                <p className={styles.statusText}>Label purchase remains unavailable until a label provider is connected.</p>
              ) : null}
            </section>

            <section className={styles.configSection}>
              <div className={styles.sectionHeading}>
                <h3>Packages</h3>
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
                <h3>Manual checkout rates</h3>
              </div>
              <p className={styles.statusText}>Used in Manual mode, or as fallback in Hybrid mode.</p>
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
                <AdminEmptyState
                  title="No manual checkout rates"
                  description="Add rates if checkout should work without live carrier rates."
                  icon="paid"
                />
              )}
              <p className={styles.statusText}>Manual rates control what customers pay. They do not buy postage.</p>
              <div className={styles.actionRow}>
                <AdminButton size="sm" variant="secondary" onClick={() => openManualRateDrawer(null)}>
                  Add manual rate
                </AdminButton>
              </div>
            </section>

            <section className={styles.configSection}>
              <div className={styles.sectionHeading}>
                <h3>Fallback shipping rate</h3>
              </div>
              <p className={styles.statusText}>Shown only if Shippo/EasyPost cannot return rates.</p>
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
                <AdminEmptyState
                  title="No fallback rates"
                  description="Add fallback rates for live-provider outage paths."
                  icon="error"
                />
              )}
              <div className={styles.actionRow}>
                <AdminButton size="sm" variant="secondary" onClick={() => openFallbackRateDrawer(null)}>
                  Add fallback
                </AdminButton>
              </div>
            </section>

            <section className={styles.configSection}>
              <div className={styles.sectionHeading}>
                <h3>Local options and documents</h3>
              </div>
              <div className={styles.configRow}>
                <p className={styles.statusText}>
                  <strong>Local delivery</strong> · Offer delivery by ZIP code or radius.
                </p>
                <div className={styles.actionRow}>
                  <AdminStatusChip tone={localDeliveryForm.localDeliveryEnabled ? "success" : "neutral"}>
                    {localDeliveryForm.localDeliveryEnabled ? "Enabled" : "Disabled"}
                  </AdminStatusChip>
                  <AdminButton size="sm" variant="secondary" onClick={() => setLocalDeliveryDrawerOpen(true)}>
                    Set up
                  </AdminButton>
                </div>
              </div>
              <div className={styles.configRow}>
                <p className={styles.statusText}>
                  <strong>Pickup in store</strong> · Let customers pick up from your location.
                </p>
                <div className={styles.actionRow}>
                  <AdminStatusChip tone={pickupForm.pickupEnabled ? "success" : "neutral"}>
                    {pickupForm.pickupEnabled ? "Enabled" : "Disabled"}
                  </AdminStatusChip>
                  <AdminButton size="sm" variant="secondary" onClick={() => setPickupDrawerOpen(true)}>
                    Set up
                  </AdminButton>
                </div>
              </div>
              <div className={styles.configRow}>
                <p className={styles.statusText}>
                  <strong>Packing slip</strong> · Logo, SKU, product images, and footer note.
                </p>
                <div className={styles.actionRow}>
                  <AdminButton size="sm" variant="secondary" onClick={() => setPackingSlipDrawerOpen(true)}>
                    Edit
                  </AdminButton>
                </div>
              </div>
            </section>
          </div>
        ) : null}
      </div>

      <AdminDrawer
        open={providerDrawerOpen}
        onClose={() => setProviderDrawerOpen(false)}
        title="Manage provider"
        subtitle="Credentials, verification, usage, and disconnect."
      >
        <div className={styles.drawerStack}>
          <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
            <div className={`${styles.drawerFormGrid} ${styles.compactFormGrid}`}>
              <AdminField label="Provider">
                <AdminSelect
                  value={providerForm.provider}
                  onChange={(value) => setProviderForm((current) => ({ ...current, provider: value }))}
                  options={PROVIDER_OPTIONS}
                />
              </AdminField>
              <AdminField label="Provider usage">
                <AdminSelect
                  value={providerForm.usage}
                  onChange={(value) => setProviderForm((current) => ({ ...current, usage: value }))}
                  options={PROVIDER_USAGE_OPTIONS}
                />
              </AdminField>
              <p className={styles.statusText}>
                {PROVIDER_USAGE_HELPER_COPY[providerForm.usage] || PROVIDER_USAGE_HELPER_COPY.LIVE_AND_LABELS}
              </p>
              <p className={styles.compactMeta}>
                Live rates and label buying: checkout live rates + label purchase. Label buying only: labels only, no
                checkout live rates. Live rates only: checkout live rates only, no label purchase.
              </p>
              <AdminField label="API token">
                <AdminInput
                  type="password"
                  value={providerForm.token}
                  onChange={(event) => setProviderForm((current) => ({ ...current, token: event.target.value }))}
                  placeholder="Paste token to save or update"
                />
              </AdminField>
              <div className={styles.actionRow}>
                <span className={styles.metaText}>Connection status</span>
                <AdminStatusChip tone={drawerProviderConnectionState.tone}>
                  {drawerProviderConnectionState.label}
                </AdminStatusChip>
              </div>
              <p className={styles.compactMeta}>{drawerProviderConnectionState.detail}</p>
            </div>
            <p className={styles.compactMeta}>
              Saved keys are hidden after saving. Enter a new key only to replace the current one.
            </p>
            <p className={styles.compactMeta}>Saved credentials stay encrypted and are never rendered in raw form.</p>
            <div className={styles.compactActionRow}>
              <AdminButton disabled={saving} size="sm" variant="secondary" onClick={saveProviderSettings}>
                Save credentials
              </AdminButton>
              <AdminButton
                disabled={providerVerifyLoading || providerForm.provider === "NONE"}
                size="sm"
                variant="secondary"
                onClick={verifyProvider}
              >
                {providerVerifyLoading ? "Verifying..." : "Verify provider"}
              </AdminButton>
            </div>
          </AdminCard>
          <AdminCard as="section" className={styles.compactDrawerCard} variant="card">
            <div className={`${styles.setupCardHeader} ${styles.compactSectionHeader}`}>
              <h4>Advanced</h4>
            </div>
            <div className={styles.compactActionRow}>
              <AdminButton disabled={saving} size="sm" variant="ghost" onClick={disconnectProvider}>
                Disconnect provider
              </AdminButton>
            </div>
            {providerTestMessage ? <p className={styles.statusText}>{providerTestMessage}</p> : null}
          </AdminCard>
        </div>
      </AdminDrawer>

      <AdminDrawer
        open={locationDrawerOpen}
        onClose={() => setLocationDrawerOpen(false)}
        title={locationForm.id ? "Edit ship-from location" : "Set location"}
        subtitle="Address used for quotes, labels, and returns."
      >
        <AdminField label="Location name">
          <AdminInput value={locationForm.name} onChange={(event) => setLocationForm((current) => ({ ...current, name: event.target.value }))} />
        </AdminField>
        <AdminField label="Contact name">
          <AdminInput value={locationForm.contactName} onChange={(event) => setLocationForm((current) => ({ ...current, contactName: event.target.value }))} />
        </AdminField>
        <AdminField
          label="Email"
          hint="Used by carriers when buying labels. Required for Shippo/USPS labels."
        >
          <AdminInput
            value={locationForm.email}
            onChange={(event) => setLocationForm((current) => ({ ...current, email: event.target.value }))}
            placeholder="shipping@example.com"
          />
        </AdminField>
        <AdminField label="Company">
          <AdminInput value={locationForm.company} onChange={(event) => setLocationForm((current) => ({ ...current, company: event.target.value }))} />
        </AdminField>
        <AdminField label="Address 1">
          <AdminInput value={locationForm.address1} onChange={(event) => setLocationForm((current) => ({ ...current, address1: event.target.value }))} />
        </AdminField>
        <AdminField label="Address 2">
          <AdminInput value={locationForm.address2} onChange={(event) => setLocationForm((current) => ({ ...current, address2: event.target.value }))} />
        </AdminField>
        <AdminField label="City">
          <AdminInput value={locationForm.city} onChange={(event) => setLocationForm((current) => ({ ...current, city: event.target.value }))} />
        </AdminField>
        <AdminField label="State / province">
          <AdminInput value={locationForm.stateProvince} onChange={(event) => setLocationForm((current) => ({ ...current, stateProvince: event.target.value }))} />
        </AdminField>
        <AdminField label="Postal code">
          <AdminInput value={locationForm.postalCode} onChange={(event) => setLocationForm((current) => ({ ...current, postalCode: event.target.value }))} />
        </AdminField>
        <AdminField label="Country">
          <AdminInput value={locationForm.country} onChange={(event) => setLocationForm((current) => ({ ...current, country: event.target.value }))} />
        </AdminField>
        <AdminField label="Phone">
          <AdminInput value={locationForm.phone} onChange={(event) => setLocationForm((current) => ({ ...current, phone: event.target.value }))} />
        </AdminField>
        <label className={styles.checkboxField}>
          <AdminInput checked={Boolean(locationForm.isDefault)} onChange={(event) => setLocationForm((current) => ({ ...current, isDefault: event.target.checked }))} className={styles.settingsCheckbox} type="checkbox" />
          <span>Default location</span>
        </label>
        <label className={styles.checkboxField}>
          <AdminInput checked={Boolean(locationForm.isActive)} onChange={(event) => setLocationForm((current) => ({ ...current, isActive: event.target.checked }))} className={styles.settingsCheckbox} type="checkbox" />
          <span>Active</span>
        </label>
        <div className={styles.actionRow}>
          <AdminButton disabled={saving} size="sm" onClick={saveLocation}>
            Save location
          </AdminButton>
          <AdminButton disabled={saving} size="sm" variant="secondary" onClick={validateLocationAddress}>
            Validate address
          </AdminButton>
        </div>
        <p className={styles.compactMeta}>
          Address pre-validation is not available yet. Save this address, then verify it by loading live checkout
          rates or purchasing a test label.
        </p>
        {shippoInUse && !resolvedShipFromEmail ? (
          <p className={styles.statusText} style={{ color: "var(--warning, #f59e0b)" }}>
            Ship-from email is required for Shippo/USPS labels. Add an email here or in your store profile.
          </p>
        ) : null}
        {shippoInUse && !resolvedShipFromPhone ? (
          <p className={styles.statusText} style={{ color: "var(--warning, #f59e0b)" }}>
            Ship-from phone is required for Shippo/USPS labels. Add a phone number here or in your store profile.
          </p>
        ) : null}
        {locationDrawerError ? (
          <p className={styles.statusText} style={{ color: "var(--destructive, #ef4444)" }}>
            {locationDrawerError}
          </p>
        ) : null}
        {locationValidationMessage ? <p className={styles.statusText}>{locationValidationMessage}</p> : null}
      </AdminDrawer>

      <AdminDrawer
        open={packageDrawerOpen}
        onClose={() => setPackageDrawerOpen(false)}
        title={packageForm.id ? "Edit package" : "Add package"}
        subtitle="Used for live rates and label buying."
      >
        <AdminField label="Package name">
          <AdminInput value={packageForm.name} onChange={(event) => setPackageForm((current) => ({ ...current, name: event.target.value }))} />
        </AdminField>
        <AdminField label="Package type">
          <AdminSelect
            value={packageForm.type}
            onChange={(value) => setPackageForm((current) => ({ ...current, type: value }))}
            options={[
              { value: "BOX", label: "Box" },
              { value: "POLY_MAILER", label: "Poly mailer" },
              { value: "ENVELOPE", label: "Envelope" },
              { value: "CUSTOM", label: "Custom" },
            ]}
          />
        </AdminField>
        <AdminField label="Length">
          <AdminInput type="number" value={packageForm.length} onChange={(event) => setPackageForm((current) => ({ ...current, length: event.target.value }))} />
        </AdminField>
        <AdminField label="Width">
          <AdminInput type="number" value={packageForm.width} onChange={(event) => setPackageForm((current) => ({ ...current, width: event.target.value }))} />
        </AdminField>
        <AdminField label="Height">
          <AdminInput type="number" value={packageForm.height} onChange={(event) => setPackageForm((current) => ({ ...current, height: event.target.value }))} />
        </AdminField>
        <AdminField label="Dimension unit">
          <AdminSelect
            value={packageForm.dimensionUnit}
            onChange={(value) => setPackageForm((current) => ({ ...current, dimensionUnit: value }))}
            options={[{ value: "IN", label: "IN" }, { value: "CM", label: "CM" }]}
          />
        </AdminField>
        <AdminField label="Empty package weight">
          <AdminInput type="number" value={packageForm.emptyPackageWeight} onChange={(event) => setPackageForm((current) => ({ ...current, emptyPackageWeight: event.target.value }))} />
        </AdminField>
        <AdminField label="Weight unit">
          <AdminSelect
            value={packageForm.weightUnit}
            onChange={(value) => setPackageForm((current) => ({ ...current, weightUnit: value }))}
            options={[
              { value: "OZ", label: "OZ" },
              { value: "LB", label: "LB" },
              { value: "G", label: "G" },
              { value: "KG", label: "KG" },
            ]}
          />
        </AdminField>
        <label className={styles.checkboxField}>
          <AdminInput checked={Boolean(packageForm.isDefault)} onChange={(event) => setPackageForm((current) => ({ ...current, isDefault: event.target.checked }))} className={styles.settingsCheckbox} type="checkbox" />
          <span>Default package</span>
        </label>
        <label className={styles.checkboxField}>
          <AdminInput checked={Boolean(packageForm.isActive)} onChange={(event) => setPackageForm((current) => ({ ...current, isActive: event.target.checked }))} className={styles.settingsCheckbox} type="checkbox" />
          <span>Active</span>
        </label>
        {packageDrawerError ? (
          <p className={styles.statusText} style={{ color: "var(--destructive, #ef4444)", marginTop: 8 }}>
            {packageDrawerError}
          </p>
        ) : null}
        <div className={styles.actionRow}>
          <AdminButton disabled={saving} size="sm" onClick={savePackage}>
            Save package
          </AdminButton>
        </div>
      </AdminDrawer>

      <AdminDrawer
        open={manualDrawerOpen}
        onClose={() => setManualDrawerOpen(false)}
        title={manualForm.id ? "Edit manual checkout rate" : "Add manual checkout rate"}
        subtitle="Controls what customers pay at checkout - not postage."
      >
        <AdminField label="Rate name">
          <AdminInput value={manualForm.name} onChange={(event) => setManualForm((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Standard shipping" />
        </AdminField>
        <AdminField label="Destination country" hint="Two-letter ISO code, e.g. US, CA, GB. Leave blank to match all countries.">
          <AdminInput value={manualForm.regionCountry} onChange={(event) => setManualForm((current) => ({ ...current, regionCountry: event.target.value }))} placeholder="e.g. US - leave blank for all countries" />
        </AdminField>
        <AdminField label="State / province (optional)" hint="Leave blank to match all states or provinces in the selected country.">
          <AdminInput value={manualForm.regionStateProvince} onChange={(event) => setManualForm((current) => ({ ...current, regionStateProvince: event.target.value }))} placeholder="e.g. CA - leave blank for all states" />
        </AdminField>
        <AdminField label="Rate type">
          <AdminSelect
            value={manualForm.rateType}
            onChange={(value) => setManualForm((current) => ({ ...current, rateType: value, minWeight: "", maxWeight: "", minSubtotal: "", maxSubtotal: "", freeOverAmount: "" }))}
            options={[
              { value: "FLAT", label: "Flat rate - fixed charge for any order" },
              { value: "FREE", label: "Free shipping - no charge" },
              { value: "PRICE_BASED", label: "Order total range - different rates by cart value" },
              { value: "WEIGHT_BASED", label: "Weight-based - requires product weights" },
            ]}
          />
        </AdminField>

        {manualForm.rateType !== "FREE" ? (
          <AdminField label="Amount ($)" hint={manualForm.rateType === "FLAT" ? "Fixed charge shown to every customer who matches this rate." : undefined}>
            <AdminInput type="number" value={manualForm.amount} onChange={(event) => setManualForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" />
          </AdminField>
        ) : null}

        {manualForm.rateType === "PRICE_BASED" ? (
          <>
            <AdminField label="Min order total ($)" hint="Rate applies when the cart subtotal is at or above this amount. Enter 0 for no minimum.">
              <AdminInput type="number" value={manualForm.minSubtotal} onChange={(event) => setManualForm((current) => ({ ...current, minSubtotal: event.target.value }))} placeholder="0" />
            </AdminField>
            <AdminField label="Max order total ($)" hint="Rate applies when the cart subtotal is at or below this amount. Leave blank or enter 0 for no maximum.">
              <AdminInput type="number" value={manualForm.maxSubtotal} onChange={(event) => setManualForm((current) => ({ ...current, maxSubtotal: event.target.value }))} placeholder="Leave blank for no maximum" />
            </AdminField>
          </>
        ) : null}

        {manualForm.rateType === "WEIGHT_BASED" ? (
          <>
            <AdminField label="Min weight (oz)" hint="Minimum total cart weight in ounces. Enter 0 to match any cart weight including products with no weight set.">
              <AdminInput type="number" value={manualForm.minWeight} onChange={(event) => setManualForm((current) => ({ ...current, minWeight: event.target.value }))} placeholder="0" />
            </AdminField>
            <AdminField label="Max weight (oz)" hint="Maximum total cart weight in ounces. Leave blank for no maximum.">
              <AdminInput type="number" value={manualForm.maxWeight} onChange={(event) => setManualForm((current) => ({ ...current, maxWeight: event.target.value }))} placeholder="Leave blank for no maximum" />
            </AdminField>
            <p className={styles.statusText} style={{ fontSize: "0.8rem", color: "var(--warning, #f59e0b)", marginTop: 4 }}>
              Weight-based rates only apply when products have weights set. Add weight to each product variant in the product editor, or set min weight to 0 to match any cart.
            </p>
          </>
        ) : null}

        <AdminField label="Estimated delivery (optional)" hint="Shown to customers at checkout, e.g. 3-5 business days.">
          <AdminInput value={manualForm.estimatedDeliveryText} onChange={(event) => setManualForm((current) => ({ ...current, estimatedDeliveryText: event.target.value }))} placeholder="e.g. 3-5 business days" />
        </AdminField>
        <label className={styles.checkboxField}>
          <AdminInput checked={Boolean(manualForm.isActive)} onChange={(event) => setManualForm((current) => ({ ...current, isActive: event.target.checked }))} className={styles.settingsCheckbox} type="checkbox" />
          <span>Active</span>
        </label>
        {manualDrawerError ? (
          <p className={styles.statusText} style={{ color: "var(--destructive, #ef4444)", marginTop: 8 }}>
            {manualDrawerError}
          </p>
        ) : null}
        <div className={styles.actionRow}>
          <AdminButton disabled={saving} size="sm" onClick={saveManualRate}>
            Save manual rate
          </AdminButton>
        </div>
      </AdminDrawer>

      <AdminDrawer
        open={fallbackDrawerOpen}
        onClose={() => setFallbackDrawerOpen(false)}
        title={fallbackForm.id ? "Edit fallback" : "Add fallback"}
        subtitle="Shown only when live rates fail."
      >
        <AdminField label="Fallback name">
          <AdminInput value={fallbackForm.name} onChange={(event) => setFallbackForm((current) => ({ ...current, name: event.target.value }))} />
        </AdminField>
        <AdminField label="Destination country" hint="ISO code, e.g. US, CA. Leave blank to match all countries.">
          <AdminInput value={fallbackForm.regionCountry} onChange={(event) => setFallbackForm((current) => ({ ...current, regionCountry: event.target.value }))} placeholder="e.g. US" />
        </AdminField>
        <AdminField label="State / province (optional)" hint="Leave blank to match all states or provinces in the destination country.">
          <AdminInput value={fallbackForm.regionStateProvince} onChange={(event) => setFallbackForm((current) => ({ ...current, regionStateProvince: event.target.value }))} placeholder="Leave blank for all states" />
        </AdminField>
        <AdminField label="Amount">
          <AdminInput type="number" value={fallbackForm.amount} onChange={(event) => setFallbackForm((current) => ({ ...current, amount: event.target.value }))} />
        </AdminField>
        <AdminField label="Estimated delivery">
          <AdminInput value={fallbackForm.estimatedDeliveryText} onChange={(event) => setFallbackForm((current) => ({ ...current, estimatedDeliveryText: event.target.value }))} />
        </AdminField>
        <label className={styles.checkboxField}>
          <AdminInput checked={Boolean(fallbackForm.isActive)} onChange={(event) => setFallbackForm((current) => ({ ...current, isActive: event.target.checked }))} className={styles.settingsCheckbox} type="checkbox" />
          <span>Active</span>
        </label>
        <div className={styles.actionRow}>
          <AdminButton disabled={saving} size="sm" onClick={saveFallbackRate}>
            Save fallback
          </AdminButton>
        </div>
      </AdminDrawer>

      <AdminDrawer
        open={manualFulfillmentDrawerOpen}
        onClose={() => setManualFulfillmentDrawerOpen(false)}
        title="Configure manual fulfillment"
        subtitle="For teams buying labels outside Doopify."
      >
        <AdminField label="Default fulfillment instructions">
          <AdminTextarea rows={4} value={manualFulfillmentForm.manualFulfillmentInstructions} onChange={(event) => setManualFulfillmentForm((current) => ({ ...current, manualFulfillmentInstructions: event.target.value }))} />
        </AdminField>
        <AdminField label="Manual tracking behavior">
          <AdminInput value={manualFulfillmentForm.manualTrackingBehavior} onChange={(event) => setManualFulfillmentForm((current) => ({ ...current, manualTrackingBehavior: event.target.value }))} placeholder="Example: Tracking number required before mark shipped" />
        </AdminField>
        <div className={styles.actionRow}>
          <AdminButton disabled={saving} size="sm" onClick={saveManualFulfillmentSettings}>
            Save settings
          </AdminButton>
        </div>
      </AdminDrawer>

      <AdminDrawer
        open={localDeliveryDrawerOpen}
        onClose={() => setLocalDeliveryDrawerOpen(false)}
        title="Local delivery"
        subtitle="ZIP/radius pricing and delivery instructions."
      >
        <label className={styles.checkboxField}>
          <AdminInput checked={Boolean(localDeliveryForm.localDeliveryEnabled)} onChange={(event) => setLocalDeliveryForm((current) => ({ ...current, localDeliveryEnabled: event.target.checked }))} className={styles.settingsCheckbox} type="checkbox" />
          <span>Enable local delivery</span>
        </label>
        <AdminField label="Delivery price">
          <AdminInput type="number" value={localDeliveryForm.localDeliveryPrice} onChange={(event) => setLocalDeliveryForm((current) => ({ ...current, localDeliveryPrice: event.target.value }))} />
        </AdminField>
        <AdminField label="Minimum order">
          <AdminInput type="number" value={localDeliveryForm.localDeliveryMinimumOrder} onChange={(event) => setLocalDeliveryForm((current) => ({ ...current, localDeliveryMinimumOrder: event.target.value }))} />
        </AdminField>
        <AdminField label="ZIP codes or radius">
          <AdminTextarea rows={3} value={localDeliveryForm.localDeliveryCoverage} onChange={(event) => setLocalDeliveryForm((current) => ({ ...current, localDeliveryCoverage: event.target.value }))} placeholder="Example: 90001, 90002 or 10-mile radius from store" />
        </AdminField>
        <AdminField label="Delivery instructions">
          <AdminTextarea rows={3} value={localDeliveryForm.localDeliveryInstructions} onChange={(event) => setLocalDeliveryForm((current) => ({ ...current, localDeliveryInstructions: event.target.value }))} />
        </AdminField>
        <div className={styles.actionRow}>
          <AdminButton disabled={saving} size="sm" onClick={saveLocalDeliverySettings}>
            Save local delivery
          </AdminButton>
        </div>
      </AdminDrawer>

      <AdminDrawer
        open={pickupDrawerOpen}
        onClose={() => setPickupDrawerOpen(false)}
        title="Pickup in store"
        subtitle="Pickup location, instructions, and estimate."
      >
        <label className={styles.checkboxField}>
          <AdminInput checked={Boolean(pickupForm.pickupEnabled)} onChange={(event) => setPickupForm((current) => ({ ...current, pickupEnabled: event.target.checked }))} className={styles.settingsCheckbox} type="checkbox" />
          <span>Enable pickup</span>
        </label>
        <AdminField label="Pickup location">
          <AdminInput value={pickupForm.pickupLocation} onChange={(event) => setPickupForm((current) => ({ ...current, pickupLocation: event.target.value }))} />
        </AdminField>
        <AdminField label="Pickup instructions">
          <AdminTextarea rows={3} value={pickupForm.pickupInstructions} onChange={(event) => setPickupForm((current) => ({ ...current, pickupInstructions: event.target.value }))} />
        </AdminField>
        <AdminField label="Pickup estimate">
          <AdminInput value={pickupForm.pickupEstimate} onChange={(event) => setPickupForm((current) => ({ ...current, pickupEstimate: event.target.value }))} placeholder="Example: Ready in 2 hours" />
        </AdminField>
        <div className={styles.actionRow}>
          <AdminButton disabled={saving} size="sm" onClick={savePickupSettings}>
            Save pickup
          </AdminButton>
        </div>
      </AdminDrawer>

      <AdminDrawer
        open={packingSlipDrawerOpen}
        onClose={() => setPackingSlipDrawerOpen(false)}
        title="Packing slip"
        subtitle="Logo, SKU, images, footer, and preview settings."
      >
        <label className={styles.checkboxField}>
          <AdminInput checked={Boolean(packingSlipForm.packingSlipUseLogo)} onChange={(event) => setPackingSlipForm((current) => ({ ...current, packingSlipUseLogo: event.target.checked }))} className={styles.settingsCheckbox} type="checkbox" />
          <span>Use store logo</span>
        </label>
        <label className={styles.checkboxField}>
          <AdminInput checked={Boolean(packingSlipForm.packingSlipShowSku)} onChange={(event) => setPackingSlipForm((current) => ({ ...current, packingSlipShowSku: event.target.checked }))} className={styles.settingsCheckbox} type="checkbox" />
          <span>Show SKU</span>
        </label>
        <label className={styles.checkboxField}>
          <AdminInput checked={Boolean(packingSlipForm.packingSlipShowProductImages)} onChange={(event) => setPackingSlipForm((current) => ({ ...current, packingSlipShowProductImages: event.target.checked }))} className={styles.settingsCheckbox} type="checkbox" />
          <span>Show product images (if available)</span>
        </label>
        <AdminField label="Footer note">
          <AdminTextarea rows={3} value={packingSlipForm.packingSlipFooterNote} onChange={(event) => setPackingSlipForm((current) => ({ ...current, packingSlipFooterNote: event.target.value }))} />
        </AdminField>
        <p className={styles.statusText}>Preview uses current store logo and order data in the packing-slip print flow.</p>
        <div className={styles.actionRow}>
          <AdminButton disabled={saving} size="sm" onClick={savePackingSlipSettings}>
            Save packing slip
          </AdminButton>
        </div>
      </AdminDrawer>
    </>
  );

  if (embedded) {
    return content;
  }

  return <AppShell>{content}</AppShell>;
}




