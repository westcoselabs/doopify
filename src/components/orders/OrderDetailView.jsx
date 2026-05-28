"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import AdminButton from "../admin/ui/AdminButton";
import AdminCard from "../admin/ui/AdminCard";
import AdminEmptyState from "../admin/ui/AdminEmptyState";
import AdminField from "../admin/ui/AdminField";
import AdminInput from "../admin/ui/AdminInput";
import AdminStatusChip from "../admin/ui/AdminStatusChip";
import AdminTextarea from "../admin/ui/AdminTextarea";
import OrderAdjustmentsCard from "./OrderAdjustmentsCard";
import { useSettings } from "../../context/SettingsContext";
import { formatDateTimeForDisplay } from "../../lib/date-time-format";
import styles from "./OrderDetailView.module.css";

function normalizeOrderNumber(orderNumber) {
  return String(orderNumber || "").replace(/^#/, "");
}

export function orderStatusChipTone(status) {
  const normalized = String(status || "").toUpperCase();
  if (["PAID", "FULFILLED", "SHIPPED", "OPEN", "DELIVERED", "SUCCESS"].includes(normalized)) return "success";
  if (["FAILED", "VOIDED", "CANCELLED", "DECLINED", "EXHAUSTED", "CLOSED"].includes(normalized)) return "danger";
  if (["PENDING", "PARTIALLY_REFUNDED", "PARTIALLY_FULFILLED", "PARTIALLY SHIPPED", "UNFULFILLED", "NOT SHIPPED", "IN_TRANSIT", "REQUESTED", "RECEIVED"].includes(normalized)) return "warning";
  return "neutral";
}

function digitalDeliveryStatusLabel(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") return "Active";
  if (normalized === "REVOKED") return "Revoked";
  if (normalized === "EXPIRED") return "Expired";
  if (normalized === "EXHAUSTED") return "Download limit reached";
  return "Pending";
}

function digitalDeliveryStatusTone(status) {
  const normalized = String(status || "").toUpperCase();
  if (normalized === "ACTIVE") return "success";
  if (normalized === "REVOKED" || normalized === "EXHAUSTED") return "danger";
  if (normalized === "EXPIRED" || normalized === "PENDING") return "warning";
  return "neutral";
}

function formatMoney(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatAddress(address) {
  if (!address) return "Not provided";
  if (typeof address === "string") return address.trim() || "Not provided";

  const lines = [
    address.firstName && address.lastName
      ? `${address.firstName} ${address.lastName}`
      : address.firstName || address.lastName || "",
    address.company,
    address.address1,
    address.address2,
    [address.city, address.province, address.postalCode].filter(Boolean).join(", "),
    address.country,
    address.phone ? `Phone: ${address.phone}` : "",
  ].filter(Boolean);

  return lines.join("\n") || "Not provided";
}

function parseErrorMessage(json, fallback) {
  if (json?.error && typeof json.error === "string") return json.error;
  return fallback;
}

function SectionDivider({ label }) {
  return (
    <div className={styles.sectionDivider}>
      <span className={styles.sectionEyebrow}>{label}</span>
    </div>
  );
}

function SkeletonBlock({ className = "" }) {
  return <div className={`${styles.skeletonBlock} ${className}`} />;
}

function OrderDetailSkeleton() {
  return (
    <div className={styles.page} data-testid="order-detail-skeleton">
      <nav className={styles.breadcrumbs}>
        <span className={styles.inlineLinkButton} aria-hidden="true">&lt;- Orders</span>
      </nav>
      <div className={styles.headerCard}>
        <SkeletonBlock className={styles.skeletonTitle} />
        <SkeletonBlock className={styles.skeletonMeta} />
        <div className={styles.chipsRow}>
          <SkeletonBlock className={styles.skeletonChip} />
          <SkeletonBlock className={styles.skeletonChip} />
          <SkeletonBlock className={styles.skeletonChip} />
        </div>
      </div>
      <div className={styles.grid}>
        <div className={styles.mainColumn}>
          <AdminCard className={styles.card} variant="panel">
            <SkeletonBlock className={styles.skeletonCardTitle} />
            <SkeletonBlock className={styles.skeletonRow} />
            <SkeletonBlock className={styles.skeletonRow} />
            <SkeletonBlock className={styles.skeletonRow} />
          </AdminCard>
          <AdminCard className={styles.card} variant="panel">
            <SkeletonBlock className={styles.skeletonCardTitle} />
            <SkeletonBlock className={styles.skeletonRowTall} />
            <SkeletonBlock className={styles.skeletonRowTall} />
          </AdminCard>
          <AdminCard className={styles.card} variant="panel">
            <SkeletonBlock className={styles.skeletonCardTitle} />
            <SkeletonBlock className={styles.skeletonRow} />
            <SkeletonBlock className={styles.skeletonRow} />
            <SkeletonBlock className={styles.skeletonRow} />
          </AdminCard>
        </div>
        <div className={styles.sideColumn}>
          <AdminCard className={styles.sideCard} variant="panel">
            <SkeletonBlock className={styles.skeletonCardTitle} />
            <SkeletonBlock className={styles.skeletonRowTall} />
            <SkeletonBlock className={styles.skeletonRow} />
          </AdminCard>
          <AdminCard className={styles.sideCard} variant="panel">
            <SkeletonBlock className={styles.skeletonCardTitle} />
            <SkeletonBlock className={styles.skeletonRowTall} />
          </AdminCard>
          <AdminCard className={styles.sideCard} variant="panel">
            <SkeletonBlock className={styles.skeletonCardTitle} />
            <SkeletonBlock className={styles.skeletonRowTall} />
          </AdminCard>
        </div>
      </div>
    </div>
  );
}

function providerLabel(provider) {
  if (provider === "SHIPPO") return "Shippo";
  if (provider === "EASYPOST") return "EasyPost";
  return "Carrier";
}

export const STORE_DEFAULT_LABEL_PROVIDER_OPTION = "STORE_DEFAULT";

function hasPrefetchedTimelineData(order) {
  if (!order) return false;
  if (order.timelineLoaded === false) return false;
  if (Array.isArray(order.timeline) || Array.isArray(order.events) || Array.isArray(order.customerVisibleNotes)) {
    return true;
  }
  return false;
}

function hasPrefetchedFulfillmentData(order) {
  if (!order) return false;
  if (order.fulfillmentLoaded === false) return false;
  if (Array.isArray(order.fulfillments) || Array.isArray(order.shippingLabels) || Array.isArray(order.shipments)) {
    return true;
  }
  return false;
}

function hasPrefetchedDigitalDeliveryData(order) {
  if (!order) return false;
  if (order.digitalDeliveryLoaded === false) return false;
  return Boolean(order.digitalDelivery && typeof order.digitalDelivery === "object");
}

function normalizeConnectedProviders(input) {
  const values = Array.isArray(input) ? input : [];
  const orderedProviders = ["EASYPOST", "SHIPPO"];
  return orderedProviders.filter((provider) => values.includes(provider));
}

export function resolveOrderLabelProviderSelection(input) {
  const connectedProviders = normalizeConnectedProviders(input?.connectedProviders);
  const storeDefaultProvider =
    connectedProviders.find((provider) => provider === input?.storeDefaultProvider) || null;
  const fallbackProvider = storeDefaultProvider || connectedProviders[0] || "";
  const selectedChoiceRaw = String(input?.selectedChoice || "").trim().toUpperCase();
  const selectedChoice =
    selectedChoiceRaw === STORE_DEFAULT_LABEL_PROVIDER_OPTION
      ? STORE_DEFAULT_LABEL_PROVIDER_OPTION
      : connectedProviders.includes(selectedChoiceRaw)
        ? selectedChoiceRaw
        : connectedProviders.length > 1
          ? STORE_DEFAULT_LABEL_PROVIDER_OPTION
          : fallbackProvider;
  const selectedProvider =
    selectedChoice === STORE_DEFAULT_LABEL_PROVIDER_OPTION
      ? fallbackProvider
      : connectedProviders.find((provider) => provider === selectedChoice) || "";
  const selectedProviderDisconnected = Boolean(
    selectedChoice !== STORE_DEFAULT_LABEL_PROVIDER_OPTION &&
      selectedChoice &&
      !connectedProviders.includes(selectedChoice)
  );

  return {
    connectedProviders,
    storeDefaultProvider,
    selectedChoice,
    selectedProvider,
    providerOverride:
      selectedChoice === STORE_DEFAULT_LABEL_PROVIDER_OPTION ? undefined : selectedProvider || undefined,
    selectedProviderDisconnected,
    storeDefaultMissing: selectedChoice === STORE_DEFAULT_LABEL_PROVIDER_OPTION && !storeDefaultProvider,
  };
}

function statusTextForShipment(input) {
  if (input.hasLabel) return "Label purchased";
  if (input.trackingNumber || input.trackingUrl) return "Tracking added manually";
  return "Shipped";
}

function normalizeShipmentCards({ fulfillments, shippingLabels, currency }) {
  const fulfillmentById = new Map((fulfillments || []).map((entry) => [entry.id, entry]));
  const labelCards = (shippingLabels || []).map((label) => {
    const linkedFulfillment = label.fulfillmentId ? fulfillmentById.get(label.fulfillmentId) : null;
    return {
      id: `label:${label.id}`,
      hasLabel: true,
      statusText: statusTextForShipment({ hasLabel: true }),
      carrier: label.carrier || linkedFulfillment?.carrier || null,
      service: label.service || linkedFulfillment?.service || null,
      trackingNumber: label.trackingNumber || linkedFulfillment?.trackingNumber || null,
      trackingUrl: label.trackingUrl || linkedFulfillment?.trackingUrl || null,
      labelUrl: label.labelUrl || linkedFulfillment?.labelUrl || null,
      provider: label.provider || null,
      labelCost:
        typeof label.labelAmount === "number"
          ? label.labelAmount
          : typeof label.labelAmountCents === "number"
            ? Number(label.labelAmountCents) / 100
            : null,
      currency: label.currency || currency,
      createdAt: label.createdAt || linkedFulfillment?.createdAt || null,
    };
  });

  const fulfillmentWithoutLabel = (fulfillments || []).filter(
    (entry) => !(shippingLabels || []).some((label) => label.fulfillmentId === entry.id)
  );

  const manualCards = fulfillmentWithoutLabel.map((entry) => ({
    id: `fulfillment:${entry.id}`,
    hasLabel: false,
    statusText: statusTextForShipment({
      hasLabel: false,
      trackingNumber: entry.trackingNumber,
      trackingUrl: entry.trackingUrl,
    }),
    carrier: entry.carrier || null,
    service: entry.service || null,
    trackingNumber: entry.trackingNumber || null,
    trackingUrl: entry.trackingUrl || null,
    labelUrl: entry.labelUrl || null,
    provider: null,
    labelCost: null,
    currency,
    createdAt: entry.createdAt || null,
  }));

  return [...labelCards, ...manualCards].sort((left, right) => {
    const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
    return rightTime - leftTime;
  });
}

export default function OrderDetailView({
  order,
  isLoading = false,
  isNotFound = false,
  onOrderRefreshed = null,
}) {
  const { settings } = useSettings();
  const [liveOrder, setLiveOrder] = useState(order);
  const initialShippingCapabilities = order?.shippingCapabilities || {};
  const initialConnectedProviders = Array.isArray(initialShippingCapabilities.connectedProviders)
    ? initialShippingCapabilities.connectedProviders
    : [];
  const initialStoreDefaultLabelProvider = initialShippingCapabilities.labelProvider || null;
  const [refreshing, setRefreshing] = useState(false);
  const [pageError, setPageError] = useState("");
  const [ratesLoading, setRatesLoading] = useState(false);
  const [buyingLabel, setBuyingLabel] = useState(false);
  const [creatingManual, setCreatingManual] = useState(false);
  const [rateQuotes, setRateQuotes] = useState([]);
  const [labelRatesError, setLabelRatesError] = useState("");
  const [rateProvider, setRateProvider] = useState("");
  const [selectedRateId, setSelectedRateId] = useState("");
  // EasyPost requires the original shipment id to avoid creating a duplicate shipment on purchase.
  const [selectedShipmentId, setSelectedShipmentId] = useState("");
  const [selectedQuantities, setSelectedQuantities] = useState({});
  const [fulfillmentMethod, setFulfillmentMethod] = useState(
    initialConnectedProviders.length ? "BUY_LABEL" : "MANUAL_TRACKING"
  );
  const [selectedLabelProviderChoice, setSelectedLabelProviderChoice] = useState(() =>
    initialConnectedProviders.length > 1
      ? STORE_DEFAULT_LABEL_PROVIDER_OPTION
      : initialStoreDefaultLabelProvider || initialConnectedProviders[0] || ""
  );
  const [ratesLoadAttempted, setRatesLoadAttempted] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [parcel, setParcel] = useState({
    weightOz: "12",
    lengthIn: "10",
    widthIn: "8",
    heightIn: "4",
  });
  const [manualForm, setManualForm] = useState({
    carrier: "",
    service: "",
    trackingNumber: "",
    trackingUrl: "",
  });
  const [manualSendTrackingEmail, setManualSendTrackingEmail] = useState(false);
  const [labelSendTrackingEmail, setLabelSendTrackingEmail] = useState(false);
  const [internalNoteDraft, setInternalNoteDraft] = useState("");
  const [customerNoteDraft, setCustomerNoteDraft] = useState("");
  const [sendCustomerNoteEmail, setSendCustomerNoteEmail] = useState(false);
  const [savingInternalNote, setSavingInternalNote] = useState(false);
  const [savingCustomerNote, setSavingCustomerNote] = useState(false);
  const [statusActionLoading, setStatusActionLoading] = useState("");
  const [timelineLoaded, setTimelineLoaded] = useState(() => hasPrefetchedTimelineData(order));
  const [timelineLoading, setTimelineLoading] = useState(() => Boolean(order) && !hasPrefetchedTimelineData(order));
  const [fulfillmentLoaded, setFulfillmentLoaded] = useState(() => hasPrefetchedFulfillmentData(order));
  const [fulfillmentLoading, setFulfillmentLoading] = useState(
    () => Boolean(order) && !hasPrefetchedFulfillmentData(order)
  );
  const [digitalDeliveryLoaded, setDigitalDeliveryLoaded] = useState(() =>
    hasPrefetchedDigitalDeliveryData(order)
  );
  const [digitalDeliveryLoading, setDigitalDeliveryLoading] = useState(
    () => Boolean(order) && !hasPrefetchedDigitalDeliveryData(order)
  );
  const [digitalDeliveryActionLoading, setDigitalDeliveryActionLoading] = useState("");
  const [secondaryReloadKey, setSecondaryReloadKey] = useState(0);

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    setLiveOrder(order);
    const timelinePrefetched = hasPrefetchedTimelineData(order);
    const fulfillmentPrefetched = hasPrefetchedFulfillmentData(order);
    const digitalDeliveryPrefetched = hasPrefetchedDigitalDeliveryData(order);
    setTimelineLoaded(timelinePrefetched);
    setTimelineLoading(Boolean(order) && !timelinePrefetched);
    setFulfillmentLoaded(fulfillmentPrefetched);
    setFulfillmentLoading(Boolean(order) && !fulfillmentPrefetched);
    setDigitalDeliveryLoaded(digitalDeliveryPrefetched);
    setDigitalDeliveryLoading(Boolean(order) && !digitalDeliveryPrefetched);
    setSecondaryReloadKey((current) => current + 1);
  }, [order]);

  const currentOrder = liveOrder || order;
  const currency = currentOrder?.currency || "USD";
  const storeTimeZone = settings?.timezone;
  const lineItems = currentOrder?.lineItems || [];
  const fulfillments = currentOrder?.fulfillments || [];
  const shippingLabels = currentOrder?.shippingLabels || [];
  const discounts = currentOrder?.discounts || currentOrder?.discountApplications || [];
  const customerVisibleNotes = currentOrder?.customerVisibleNotes || [];
  const timeline = currentOrder?.timeline || [];
  const shippingAddress = currentOrder?.shippingSummary?.address || currentOrder?.shippingAddress || null;
  const billingAddress = currentOrder?.billingAddress || null;
  const shippingCapabilities = currentOrder?.shippingCapabilities || {};
  const connectedProviders = Array.isArray(shippingCapabilities.connectedProviders)
    ? shippingCapabilities.connectedProviders
    : [];
  const storeDefaultLabelProvider = shippingCapabilities.labelProvider || null;
  const labelProviderSelection = useMemo(
    () =>
      resolveOrderLabelProviderSelection({
        connectedProviders,
        storeDefaultProvider: storeDefaultLabelProvider,
        selectedChoice: selectedLabelProviderChoice,
      }),
    [connectedProviders, selectedLabelProviderChoice, storeDefaultLabelProvider]
  );
  const selectedProviderForLabel = labelProviderSelection.selectedProvider;
  const selectedProviderOverride = labelProviderSelection.providerOverride;
  const hasAnyConnectedProvider = connectedProviders.length > 0;
  const canBuyShippingLabel = Boolean(currentOrder?.availableActions?.canBuyShippingLabel);
  const hasCustomerEmail =
    currentOrder?.emailCapabilities?.hasCustomerEmail ??
    Boolean(currentOrder?.email || currentOrder?.customer?.email);
  const digitalDelivery = currentOrder?.digitalDelivery || null;
  const hasDigitalDelivery = Boolean(digitalDelivery?.hasDigitalItems);
  const digitalDeliveryPanelReady = digitalDeliveryLoaded && !digitalDeliveryLoading;
  const emailProviderConfigured = Boolean(currentOrder?.emailCapabilities?.providerConfigured);
  const fulfillmentPanelReady = fulfillmentLoaded && !fulfillmentLoading;
  const timelinePanelReady = timelineLoaded && !timelineLoading;
  const shipmentCards = useMemo(
    () => normalizeShipmentCards({ fulfillments, shippingLabels, currency }),
    [fulfillments, shippingLabels, currency]
  );

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    setInternalNoteDraft(currentOrder?.notes || "");
    setCustomerNoteDraft("");
    setSendCustomerNoteEmail(false);
    setManualSendTrackingEmail(hasCustomerEmail);
    setLabelSendTrackingEmail(hasCustomerEmail);
    setFulfillmentMethod(hasAnyConnectedProvider ? "BUY_LABEL" : "MANUAL_TRACKING");
    setSelectedLabelProviderChoice(
      connectedProviders.length > 1
        ? STORE_DEFAULT_LABEL_PROVIDER_OPTION
        : shippingCapabilities.labelProvider || connectedProviders[0] || ""
    );
    setRatesLoadAttempted(false);
  }, [
    currentOrder?.id,
    currentOrder?.notes,
    hasCustomerEmail,
    hasAnyConnectedProvider,
    connectedProviders,
    shippingCapabilities.labelProvider,
  ]);

  const chips = useMemo(
    () => [
      {
        key: "payment",
        label: currentOrder?.paymentStatusRaw || currentOrder?.paymentStatus || "unknown",
        prefix: "Payment",
      },
      {
        key: "shipping",
        label: currentOrder?.shippingStatus || currentOrder?.fulfillmentStatus || "unknown",
        prefix: "Shipping",
      },
      {
        key: "order",
        label: currentOrder?.orderStatus || currentOrder?.status || "unknown",
        prefix: "Order",
      },
    ],
    [currentOrder]
  );

  const fulfillableItems = useMemo(() => {
    const fulfilledByItem = new Map();
    for (const item of lineItems) {
      fulfilledByItem.set(item.id, 0);
    }
    for (const fulfillment of fulfillments) {
      const status = String(fulfillment?.status || "").toUpperCase();
      if (["CANCELLED", "ERROR", "FAILURE"].includes(status)) continue;
      for (const item of fulfillment?.items || []) {
        fulfilledByItem.set(item.orderItemId, (fulfilledByItem.get(item.orderItemId) || 0) + Number(item.quantity || 0));
      }
    }
    return lineItems
      .map((item) => {
        const remaining = Number(item.quantity || 0) - (fulfilledByItem.get(item.id) || 0);
        return {
          id: item.id,
          title: item.title || "Item",
          variantTitle: item.variantTitle || item.variant || "",
          variantId: item.variantId || undefined,
          remainingQuantity: Math.max(0, remaining),
        };
      })
      .filter((item) => item.remainingQuantity > 0);
  }, [lineItems, fulfillments]);

  const selectedRateQuote = useMemo(
    () =>
      rateQuotes.find((quote) => {
        const quoteId = quote.providerRateId || quote.id;
        return quoteId === selectedRateId;
      }) || null,
    [rateQuotes, selectedRateId]
  );

  function dismissToast(toastId) {
    setToasts((current) => current.filter((toast) => toast.id !== toastId));
  }

  function showToast(message, tone = "success", options = {}) {
    const toastId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const toast = {
      id: toastId,
      tone,
      message,
      persistent: Boolean(options.persistent),
    };
    setToasts((current) => [...current, toast]);

    if (!toast.persistent) {
      const duration = options.durationMs ?? 4200;
      window.setTimeout(() => {
        setToasts((current) => current.filter((entry) => entry.id !== toastId));
      }, duration);
    }

    return toastId;
  }

  function clearQuoteSelection() {
    setRateQuotes([]);
    setRateProvider("");
    setSelectedRateId("");
    setSelectedShipmentId("");
    setRatesLoadAttempted(false);
    setLabelRatesError("");
  }

  useEffect(() => {
// eslint-disable-next-line react-hooks/set-state-in-effect -- intentional effect-driven state sync for existing async/load flow
    clearQuoteSelection();
  }, [selectedLabelProviderChoice]);

  useEffect(() => {
    if (!currentOrder?.orderNumberValue) return;

    const normalizedOrderNumber = normalizeOrderNumber(currentOrder.orderNumber);
    let cancelled = false;

    const mergeSecondaryPayload = (payload) => {
      setLiveOrder((previous) => {
        if (!previous) return previous;
        return {
          ...previous,
          ...payload,
          availableActions: {
            ...(previous.availableActions || {}),
            ...(payload.availableActions || {}),
          },
        };
      });
    };

    async function loadTimelinePanel() {
      setTimelineLoading(true);
      try {
        const response = await fetch(`/api/orders/${normalizedOrderNumber}/detail/timeline`, { cache: "no-store" });
        const json = await response.json();
        if (!response.ok || !json?.success) {
          throw new Error(parseErrorMessage(json, "Failed to load timeline details."));
        }
        if (!cancelled) {
          mergeSecondaryPayload(json.data || {});
        }
      } catch {
        if (!cancelled) {
          showToast("Timeline could not be loaded right now.", "error");
        }
      } finally {
        if (!cancelled) {
          setTimelineLoaded(true);
          setTimelineLoading(false);
        }
      }
    }

    async function loadFulfillmentPanel() {
      setFulfillmentLoading(true);
      try {
        const response = await fetch(`/api/orders/${normalizedOrderNumber}/detail/fulfillment`, { cache: "no-store" });
        const json = await response.json();
        if (!response.ok || !json?.success) {
          throw new Error(parseErrorMessage(json, "Failed to load fulfillment details."));
        }
        if (!cancelled) {
          mergeSecondaryPayload(json.data || {});
        }
      } catch {
        if (!cancelled) {
          showToast("Fulfillment details could not be loaded right now.", "error");
        }
      } finally {
        if (!cancelled) {
          setFulfillmentLoaded(true);
          setFulfillmentLoading(false);
        }
      }
    }

    async function loadDigitalDeliveryPanel() {
      setDigitalDeliveryLoading(true);
      try {
        const response = await fetch(`/api/orders/${normalizedOrderNumber}/digital-delivery`, {
          cache: "no-store",
        });
        const json = await response.json();
        if (!response.ok || !json?.success) {
          throw new Error(parseErrorMessage(json, "Failed to load digital delivery details."));
        }
        if (!cancelled) {
          mergeSecondaryPayload({
            digitalDelivery: json.data || null,
            digitalDeliveryLoaded: true,
          });
        }
      } catch {
        if (!cancelled) {
          showToast("Digital delivery details could not be loaded right now.", "error");
        }
      } finally {
        if (!cancelled) {
          setDigitalDeliveryLoaded(true);
          setDigitalDeliveryLoading(false);
        }
      }
    }

    void Promise.all([loadTimelinePanel(), loadFulfillmentPanel(), loadDigitalDeliveryPanel()]);

    return () => {
      cancelled = true;
    };
  }, [currentOrder?.orderNumberValue, secondaryReloadKey]);

  function normalizeItemsPayload() {
    const payload = [];
    for (const item of fulfillableItems) {
      const raw = selectedQuantities[item.id];
      if (raw == null || raw === "") continue;
      const quantity = Number.parseInt(String(raw), 10);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;
      if (quantity > item.remainingQuantity) {
        throw new Error(`Quantity for ${item.title} exceeds remaining fulfillable units.`);
      }
      payload.push({ orderItemId: item.id, variantId: item.variantId, quantity });
    }
    if (!payload.length) {
      throw new Error("Select at least one item quantity before creating fulfillment or buying a label.");
    }
    return payload;
  }

  function normalizeParcelPayload() {
    const parsed = {
      weightOz: Number(parcel.weightOz),
      lengthIn: Number(parcel.lengthIn),
      widthIn: Number(parcel.widthIn),
      heightIn: Number(parcel.heightIn),
    };
    if (Object.values(parsed).some((v) => !Number.isFinite(v) || v <= 0)) {
      throw new Error("Package dimensions must be valid positive numbers.");
    }
    return parsed;
  }

  async function refreshOrder() {
    if (!currentOrder?.orderNumber) return;
    setRefreshing(true);
    setPageError("");
    try {
      const response = await fetch(
        `/api/orders/${normalizeOrderNumber(currentOrder.orderNumber)}/detail`,
        { cache: "no-store" }
      );
      const json = await response.json();
      if (json?.success) {
        setLiveOrder(json.data);
        setTimelineLoaded(false);
        setTimelineLoading(true);
        setFulfillmentLoaded(false);
        setFulfillmentLoading(true);
        setDigitalDeliveryLoaded(false);
        setDigitalDeliveryLoading(true);
        setSecondaryReloadKey((current) => current + 1);
        if (typeof onOrderRefreshed === "function") {
          await onOrderRefreshed();
        }
        return;
      }
      setPageError(parseErrorMessage(json, "Failed to refresh order details."));
    } catch {
      setPageError("Failed to refresh order details.");
    } finally {
      setRefreshing(false);
    }
  }

  async function loadShippingRates() {
    if (!currentOrder?.orderNumberValue) return;
    setPageError("");
    setRatesLoading(true);
    setLabelRatesError("");
    try {
      if (!selectedProviderForLabel) {
        throw new Error("Select a connected label provider before loading label rates.");
      }
      if (labelProviderSelection.selectedProviderDisconnected) {
        throw new Error(`${providerLabel(selectedProviderForLabel)} is not currently connected.`);
      }
      const items = normalizeItemsPayload();
      const parcelPayload = normalizeParcelPayload();
      const response = await fetch(`/api/orders/${normalizeOrderNumber(currentOrder.orderNumber)}/shipping-rates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, parcel: parcelPayload, provider: selectedProviderOverride }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(parseErrorMessage(json, "Failed to load label rates."));
      const quotes = Array.isArray(json.data?.quotes) ? json.data.quotes : [];
      setRateQuotes(quotes);
      setRateProvider(json.data?.provider || selectedProviderForLabel);
      const firstQuote = quotes[0];
      setSelectedRateId(firstQuote?.providerRateId || firstQuote?.id || "");
      setSelectedShipmentId(
        typeof firstQuote?.metadata?.shipmentId === "string" ? firstQuote.metadata.shipmentId : ""
      );
      setRatesLoadAttempted(true);
      if (!quotes.length) {
        const message = `No label rates returned from ${providerLabel(selectedProviderForLabel)}. Check destination ZIP/postal code, ship-from address, package dimensions, and enabled carriers in your provider account.`;
        setLabelRatesError(message);
        showToast(message, "info");
      } else {
        setLabelRatesError("");
        showToast(`${providerLabel(selectedProviderForLabel)} label rates loaded.`, "success");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load label rates.";
      setRateQuotes([]);
      setSelectedRateId("");
      setSelectedShipmentId("");
      setRatesLoadAttempted(true);
      setLabelRatesError(message);
      showToast(message, "error");
    } finally {
      setRatesLoading(false);
    }
  }

  async function buyShippingLabel() {
    if (!currentOrder?.orderNumberValue) return;
    setPageError("");
    setBuyingLabel(true);
    const providerName = providerLabel(selectedProviderForLabel || rateProvider);
    const loadingToastId = showToast(`Purchasing label from ${providerName}...`, "info", { persistent: true });
    try {
      const items = normalizeItemsPayload();
      const parcelPayload = normalizeParcelPayload();
      if (!selectedRateId) throw new Error("Select a label rate before buying a label.");
      const response = await fetch(`/api/orders/${normalizeOrderNumber(currentOrder.orderNumber)}/shipping-labels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerRateId: selectedRateId,
          shipmentId: selectedShipmentId || undefined,
          provider: selectedProviderOverride,
          sendTrackingEmail: Boolean(labelSendTrackingEmail),
          items,
          parcel: parcelPayload,
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(parseErrorMessage(json, "Failed to buy shipping label."));
      const duplicate = Boolean(json.data?.duplicate);
      const trackingEmail = json.data?.trackingEmail || null;
      if (duplicate) {
        showToast("Label already existed for this rate. Existing shipment was reused.", "info");
      } else if (trackingEmail?.queued) {
        showToast("Label purchased. Order marked shipped. Tracking email queued.", "success");
      } else if (trackingEmail?.requested && trackingEmail?.skippedReason === "EMAIL_PROVIDER_NOT_CONFIGURED") {
        showToast("Label purchased. Order marked shipped. Email was not sent because no email provider is configured.", "info");
      } else if (trackingEmail?.requested && trackingEmail?.skippedReason === "MISSING_CUSTOMER_EMAIL") {
        showToast("Label purchased. Order marked shipped. Customer email is missing, so no email was sent.", "info");
      } else {
        showToast("Label purchased. Order marked shipped.", "success");
      }
      await refreshOrder();
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : `${providerName} could not purchase this label. Check the address/package and try again.`,
        "error"
      );
    } finally {
      dismissToast(loadingToastId);
      setBuyingLabel(false);
    }
  }

  async function createManualTrackingFulfillment() {
    if (!currentOrder?.orderNumberValue) return;
    setCreatingManual(true);
    try {
      const items = normalizeItemsPayload();
      const response = await fetch(`/api/orders/${normalizeOrderNumber(currentOrder.orderNumber)}/manual-fulfillment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items,
          carrier: manualForm.carrier || undefined,
          service: manualForm.service || undefined,
          trackingNumber: manualForm.trackingNumber || undefined,
          trackingUrl: manualForm.trackingUrl || undefined,
          sendTrackingEmail: Boolean(manualSendTrackingEmail),
        }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(parseErrorMessage(json, "Failed to add manual tracking."));
      const trackingEmail = json.data?.trackingEmail || null;
      if (trackingEmail?.queued) {
        showToast("Tracking saved, order marked shipped, and customer email queued.", "success");
      } else if (trackingEmail?.requested && trackingEmail?.skippedReason === "EMAIL_PROVIDER_NOT_CONFIGURED") {
        showToast("Tracking saved and order marked shipped. Email was not sent because no email provider is configured.", "info");
      } else if (trackingEmail?.requested && trackingEmail?.skippedReason === "MISSING_CUSTOMER_EMAIL") {
        showToast("Tracking saved and order marked shipped. Customer email is missing, so no email was sent.", "info");
      } else {
        showToast("Tracking saved and order marked shipped.", "success");
      }
      setManualForm((prev) => ({ ...prev, trackingNumber: "", trackingUrl: "" }));
      await refreshOrder();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to add manual tracking.", "error");
    } finally {
      setCreatingManual(false);
    }
  }

  async function updateOrderStatusPatch(patch, loadingKey, successMessage) {
    if (!currentOrder?.orderNumberValue) return;
    setStatusActionLoading(loadingKey);
    try {
      const response = await fetch(`/api/orders/${normalizeOrderNumber(currentOrder.orderNumber)}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(parseErrorMessage(json, "Failed to update order status."));
      showToast(successMessage, "success");
      await refreshOrder();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to update order status.", "error");
    } finally {
      setStatusActionLoading("");
    }
  }

  async function saveInternalNote() {
    if (!currentOrder?.orderNumberValue) return;
    setSavingInternalNote(true);
    try {
      const response = await fetch(`/api/orders/${normalizeOrderNumber(currentOrder.orderNumber)}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ internalNote: internalNoteDraft }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(parseErrorMessage(json, "Failed to save internal note."));
      showToast("Internal note updated.", "success");
      await refreshOrder();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to save internal note.", "error");
    } finally {
      setSavingInternalNote(false);
    }
  }

  async function addCustomerVisibleNote() {
    if (!currentOrder?.orderNumberValue) return;
    setSavingCustomerNote(true);
    try {
      const response = await fetch(`/api/orders/${normalizeOrderNumber(currentOrder.orderNumber)}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customerNote: customerNoteDraft, sendCustomerEmail: sendCustomerNoteEmail }),
      });
      const json = await response.json();
      if (!response.ok || !json?.success) throw new Error(parseErrorMessage(json, "Failed to add customer-visible note."));
      const sent = Boolean(json.data?.emailDelivery?.sent);
      const attempted = Boolean(json.data?.emailDelivery?.attempted);
      const failed = attempted && !sent;
      showToast(
        failed
          ? "Customer-visible note saved, but email delivery failed."
          : sent
            ? "Customer-visible note saved and emailed."
            : "Customer-visible note saved.",
        failed ? "error" : "success"
      );
      setCustomerNoteDraft("");
      setSendCustomerNoteEmail(false);
      await refreshOrder();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to add customer-visible note.", "error");
    } finally {
      setSavingCustomerNote(false);
    }
  }

  async function copyTrackingValue(value) {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      showToast("Tracking copied.", "success");
    } catch {
      showToast("Could not copy tracking number.", "error");
    }
  }

  async function copyDigitalDownloadLink(grantId) {
    if (!grantId) return;
    setDigitalDeliveryActionLoading(`copy:${grantId}`);
    try {
      const response = await fetch(`/api/digital-download-grants/${grantId}/link`, { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json?.success) {
        throw new Error(parseErrorMessage(json, "Could not resolve download link."));
      }
      const rawPath = String(json.data?.downloadUrl || "").trim();
      if (!rawPath) {
        throw new Error("Could not resolve download link.");
      }
      const urlToCopy = rawPath.startsWith("http")
        ? rawPath
        : `${window.location.origin}${rawPath}`;
      await navigator.clipboard.writeText(urlToCopy);
      showToast("Download link copied.", "success");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not copy download link.", "error");
    } finally {
      setDigitalDeliveryActionLoading("");
    }
  }

  async function resendDigitalDeliveryEmail() {
    if (!currentOrder?.orderNumberValue) return;
    setDigitalDeliveryActionLoading("resend");
    try {
      const response = await fetch(
        `/api/orders/${normalizeOrderNumber(currentOrder.orderNumber)}/digital-delivery/resend`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }
      );
      const json = await response.json();
      if (!response.ok || !json?.success) {
        throw new Error(parseErrorMessage(json, "Could not resend digital download email."));
      }
      showToast("Digital download email queued.", "success");
      await refreshOrder();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not resend digital download email.",
        "error"
      );
    } finally {
      setDigitalDeliveryActionLoading("");
    }
  }

  async function revokeDigitalGrant(grantId) {
    if (!grantId) return;
    const confirmed = window.confirm(
      "Revoke access for this download? Existing links will stop working immediately."
    );
    if (!confirmed) return;

    setDigitalDeliveryActionLoading(`revoke:${grantId}`);
    try {
      const response = await fetch(`/api/digital-download-grants/${grantId}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await response.json();
      if (!response.ok || !json?.success) {
        throw new Error(parseErrorMessage(json, "Could not revoke digital download access."));
      }
      showToast("Digital download access revoked.", "success");
      await refreshOrder();
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Could not revoke digital download access.",
        "error"
      );
    } finally {
      setDigitalDeliveryActionLoading("");
    }
  }

  async function regenerateDigitalGrant(grantId) {
    if (!grantId) return;
    const confirmed = window.confirm(
      "Regenerating this link will invalidate the previous download URL. Continue?"
    );
    if (!confirmed) return;

    setDigitalDeliveryActionLoading(`regenerate:${grantId}`);
    try {
      const response = await fetch(`/api/digital-download-grants/${grantId}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const json = await response.json();
      if (!response.ok || !json?.success) {
        throw new Error(parseErrorMessage(json, "Could not regenerate download link."));
      }
      showToast("Digital download link regenerated.", "success");
      await refreshOrder();
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Could not regenerate download link.", "error");
    } finally {
      setDigitalDeliveryActionLoading("");
    }
  }

  if (isLoading) {
    return <OrderDetailSkeleton />;
  }

  if (isNotFound && !currentOrder) {
    return (
      <div className={styles.page}>
        <nav className={styles.breadcrumbs}>
          <Link className={styles.inlineLinkButton} href="/orders">&lt;- Orders</Link>
        </nav>
        <AdminEmptyState
          description="This order may have been removed or the identifier may be invalid."
          title="Order not found"
        />
      </div>
    );
  }

  if (!currentOrder) {
    return (
      <div className={styles.page}>
        <nav className={styles.breadcrumbs}>
          <Link className={styles.inlineLinkButton} href="/orders">&lt;- Orders</Link>
        </nav>
        <AdminEmptyState
          description="We could not load this order right now. Try again in a moment."
          title="Unable to load order"
        />
      </div>
    );
  }

  const hasStatusActions =
    currentOrder?.availableActions?.canMarkPaid ||
    currentOrder?.availableActions?.canMarkPaymentPending ||
    currentOrder?.availableActions?.canMarkFulfilled ||
    currentOrder?.availableActions?.canMarkUnfulfilled;

  return (
    <div className={styles.page}>
      {/* Breadcrumb */}
      <nav className={styles.breadcrumbs}>
        <Link className={styles.inlineLinkButton} href="/orders">&lt;- Orders</Link>
      </nav>

      {pageError ? (
        <div className={styles.feedbackBanner}>
          <p className={styles.errorText}>{pageError}</p>
        </div>
      ) : null}

      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {/* â”€â”€ Header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <AdminCard className={styles.headerCard} variant="panel">
        <div className={styles.headerTop}>
          <div className={styles.headerMeta}>
            <h1 className={styles.title}>{currentOrder.orderNumber}</h1>
            <p className={styles.meta}>
              {formatDateTimeForDisplay(currentOrder.createdAt, {
                timeZone: storeTimeZone,
                fallbackText: "Unknown",
              })} - via{" "}
              {currentOrder.sourceChannel || currentOrder.channel || "online store"}
            </p>
          </div>
          <div className={styles.headerActions}>
            <AdminButton loading={refreshing} onClick={refreshOrder} size="sm" variant="secondary">
              Refresh
            </AdminButton>
            <AdminButton onClick={() => window.print()} size="sm" variant="ghost">
              Print
            </AdminButton>
          </div>
        </div>

        <div className={styles.chipsRow}>
          {chips.map((chip) => (
            <span className={styles.chipGroup} key={chip.key}>
              <span className={styles.chipLabel}>{chip.prefix}</span>
              <AdminStatusChip tone={orderStatusChipTone(chip.label)}>{chip.label}</AdminStatusChip>
            </span>
          ))}
        </div>

        {hasStatusActions ? (
          <div className={styles.actionRow}>
            {currentOrder?.availableActions?.canMarkPaid ? (
              <AdminButton
                loading={statusActionLoading === "markPaid"}
                onClick={() => updateOrderStatusPatch({ paymentStatus: "PAID" }, "markPaid", "Payment status updated to PAID.")}
                size="sm"
                variant="secondary"
              >
                Mark paid
              </AdminButton>
            ) : null}
            {currentOrder?.availableActions?.canMarkPaymentPending ? (
              <AdminButton
                loading={statusActionLoading === "markPending"}
                onClick={() => updateOrderStatusPatch({ paymentStatus: "PENDING" }, "markPending", "Payment status updated to PENDING.")}
                size="sm"
                variant="secondary"
              >
                Mark payment pending
              </AdminButton>
            ) : null}
            {currentOrder?.availableActions?.canMarkFulfilled ? (
              <AdminButton
                loading={statusActionLoading === "markFulfilled"}
                onClick={() => updateOrderStatusPatch({ fulfillmentStatus: "FULFILLED" }, "markFulfilled", "Order marked shipped.")}
                size="sm"
                variant="secondary"
              >
                Mark shipped
              </AdminButton>
            ) : null}
            {currentOrder?.availableActions?.canMarkUnfulfilled ? (
              <AdminButton
                loading={statusActionLoading === "markUnfulfilled"}
                onClick={() => updateOrderStatusPatch({ fulfillmentStatus: "UNFULFILLED" }, "markUnfulfilled", "Order marked as not shipped.")}
                size="sm"
                variant="secondary"
              >
                Mark not shipped
              </AdminButton>
            ) : null}
          </div>
        ) : null}
      </AdminCard>

      <div className={styles.grid}>
        {/* â”€â”€ Main column â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className={styles.mainColumn}>

          {/* â”€â”€ Fulfillment history â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <AdminCard className={styles.card} variant="panel">
            <h3 className={styles.cardTitle}>Fulfillment</h3>
            {!fulfillmentPanelReady ? (
              <p className={styles.metaText}>Loading fulfillment details...</p>
            ) : fulfillments.length ? (
              <div className={styles.fulfillmentList}>
                {fulfillments.map((entry) => (
                  <div className={styles.fulfillmentRow} key={entry.id}>
                    <div className={styles.fulfillmentInfo}>
                      <strong>{entry.carrier || "Carrier pending"}</strong>
                      <p>
                        {entry.service || "Service pending"}
                        {entry.trackingNumber ? ` - ${entry.trackingNumber}` : ""}
                      </p>
                      <div className={styles.fulfillmentLinks}>
                        {entry.trackingUrl ? (
                          <a className={styles.inlineLinkButton} href={entry.trackingUrl} rel="noreferrer" target="_blank">
                            Track shipment
                          </a>
                        ) : null}
                        {entry.labelUrl ? (
                          <a className={styles.inlineLinkButton} href={entry.labelUrl} rel="noreferrer" target="_blank">
                            Reprint label
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <AdminStatusChip tone={orderStatusChipTone(entry.status)}>{entry.status}</AdminStatusChip>
                  </div>
                ))}
              </div>
            ) : (
              <AdminEmptyState
                description="No fulfillments have been created for this order yet."
                icon="local_shipping"
                title="No fulfillment records"
              />
            )}

            {fulfillmentPanelReady && shippingLabels.length ? (
              <>
                <SectionDivider label="Shipping labels" />
                <div className={styles.labelList}>
                  {shippingLabels.map((label) => (
                    <div className={styles.labelRow} key={label.id}>
                      <div>
                        <strong>{label.carrier || label.provider || "Carrier"}</strong>
                        <p>{label.trackingNumber || "Tracking pending"}</p>
                      </div>
                      {label.labelUrl ? (
                        <a className={styles.inlineLinkButton} href={label.labelUrl} rel="noreferrer" target="_blank">
                          Print / reprint
                        </a>
                      ) : (
                        <span className={styles.metaText}>Label URL unavailable</span>
                      )}
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </AdminCard>

          {/* Fulfillment setup */}
          <AdminCard className={styles.card} variant="panel">
            <h3 className={styles.cardTitle}>Create fulfillment</h3>
            <p className={styles.cardSubtitle}>Choose how you want to fulfill this order.</p>

            {!fulfillmentPanelReady ? (
              <p className={styles.metaText}>Loading fulfillment state...</p>
            ) : fulfillableItems.length ? (
              <div className={styles.selectorList}>
                {fulfillableItems.map((item) => (
                  <label className={styles.selectorRow} key={item.id}>
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.variantTitle || "Default variant"} · {item.remainingQuantity} remaining</small>
                    </span>
                    <input
                      className={styles.quantityInput}
                      max={item.remainingQuantity}
                      min={0}
                      onChange={(event) =>
                        setSelectedQuantities((prev) => ({ ...prev, [item.id]: event.target.value }))
                      }
                      placeholder="0"
                      type="number"
                      value={selectedQuantities[item.id] ?? ""}
                    />
                  </label>
                ))}
              </div>
            ) : (
              <p className={styles.metaText}>All line items are already fulfilled.</p>
            )}

            <SectionDivider label="Fulfillment method" />
            <div className={styles.methodCards}>
              <button
                className={`${styles.methodCard} ${fulfillmentMethod === "BUY_LABEL" ? styles.methodCardActive : ""}`}
                disabled={!fulfillmentPanelReady}
                onClick={() => setFulfillmentMethod("BUY_LABEL")}
                type="button"
              >
                <strong>Buy shipping label</strong>
                <span>Purchase postage through a connected provider, create fulfillment, and save tracking automatically.</span>
              </button>
              <button
                className={`${styles.methodCard} ${fulfillmentMethod === "MANUAL_TRACKING" ? styles.methodCardActive : ""}`}
                disabled={!fulfillmentPanelReady}
                onClick={() => setFulfillmentMethod("MANUAL_TRACKING")}
                type="button"
              >
                <strong>Add tracking manually</strong>
                <span>Use this if you already bought postage outside Doopify.</span>
              </button>
            </div>

            {fulfillmentMethod === "BUY_LABEL" ? (
              <>
                <SectionDivider label="Buy shipping label" />
                <p className={styles.helperNote}>
                  Buy postage using your connected provider. This can be used even when the customer selected manual, flat, or free shipping at checkout.
                </p>
                {!hasAnyConnectedProvider ? (
                  <div className={styles.noProviderNotice}>
                    <span>
                      No label provider connected. Configure label providers in{" "}
                      <Link className={styles.inlineLinkButton} href="/admin/settings/shipping">
                        Shipping settings
                      </Link>
                      .
                    </span>
                  </div>
                ) : (
                  <>
                    {labelProviderSelection.connectedProviders.length > 1 ? (
                      <div className={styles.providerSelectorRow}>
                        <div className={styles.providerSelectorHeader}>
                          <span className={styles.metaText}>Label provider</span>
                          <Link className={styles.inlineLinkButton} href="/admin/settings/shipping">
                            Manage providers
                          </Link>
                        </div>
                        <div className={styles.providerSelectorButtons}>
                          <button
                            className={`${styles.providerSelectorButton} ${selectedLabelProviderChoice === STORE_DEFAULT_LABEL_PROVIDER_OPTION ? styles.providerSelectorButtonActive : ""}`}
                            onClick={() => setSelectedLabelProviderChoice(STORE_DEFAULT_LABEL_PROVIDER_OPTION)}
                            type="button"
                          >
                            Store default
                          </button>
                          {labelProviderSelection.connectedProviders.map((provider) => (
                            <button
                              className={`${styles.providerSelectorButton} ${selectedLabelProviderChoice === provider ? styles.providerSelectorButtonActive : ""}`}
                              key={provider}
                              onClick={() => setSelectedLabelProviderChoice(provider)}
                              type="button"
                            >
                              {providerLabel(provider)}
                            </button>
                          ))}
                        </div>
                        <p className={styles.metaText}>
                          {labelProviderSelection.storeDefaultProvider
                            ? `Store default: ${providerLabel(labelProviderSelection.storeDefaultProvider)}`
                            : "Store default is not configured. A connected provider will be used."}
                        </p>
                      </div>
                    ) : (
                      <div className={styles.providerSingleRow}>
                        <span className={styles.metaText}>Label provider</span>
                        <span className={styles.providerSingleMeta}>
                          {providerLabel(selectedProviderForLabel)} · Connected
                        </span>
                        <Link className={styles.inlineLinkButton} href="/admin/settings/shipping">
                          Manage providers
                        </Link>
                      </div>
                    )}

                    {labelProviderSelection.selectedProviderDisconnected ? (
                      <p className={styles.providerInlineError}>
                        {providerLabel(selectedProviderForLabel)} is disconnected. Choose a connected provider or update Shipping settings.
                      </p>
                    ) : null}

                    <h4 className={styles.workflowTitle}>Buy shipping label with {providerLabel(selectedProviderForLabel || rateProvider)}</h4>
                    <div className={styles.formGrid}>
                      <AdminField hint="Required for label purchase." label="Weight (oz)">
                        <AdminInput
                          min="0"
                          onChange={(event) => setParcel((prev) => ({ ...prev, weightOz: event.target.value }))}
                          step="0.01"
                          type="number"
                          value={parcel.weightOz}
                        />
                      </AdminField>
                      <AdminField label="Length (in)">
                        <AdminInput
                          min="0"
                          onChange={(event) => setParcel((prev) => ({ ...prev, lengthIn: event.target.value }))}
                          step="0.01"
                          type="number"
                          value={parcel.lengthIn}
                        />
                      </AdminField>
                      <AdminField label="Width (in)">
                        <AdminInput
                          min="0"
                          onChange={(event) => setParcel((prev) => ({ ...prev, widthIn: event.target.value }))}
                          step="0.01"
                          type="number"
                          value={parcel.widthIn}
                        />
                      </AdminField>
                      <AdminField label="Height (in)">
                        <AdminInput
                          min="0"
                          onChange={(event) => setParcel((prev) => ({ ...prev, heightIn: event.target.value }))}
                          step="0.01"
                          type="number"
                          value={parcel.heightIn}
                        />
                      </AdminField>
                    </div>
                    <label className={styles.checkboxRow}>
                      <input
                        checked={labelSendTrackingEmail}
                        disabled={!hasCustomerEmail}
                        onChange={(event) => setLabelSendTrackingEmail(event.target.checked)}
                        type="checkbox"
                      />
                      <span>
                        Email tracking to customer
                        {!hasCustomerEmail ? (
                          <span className={styles.inlineHelper}>Customer email is missing for this order.</span>
                        ) : null}
                      </span>
                    </label>
                    <div className={styles.actionRow}>
                      <AdminButton
                        disabled={!fulfillmentPanelReady || labelProviderSelection.selectedProviderDisconnected}
                        loading={ratesLoading}
                        onClick={loadShippingRates}
                        size="sm"
                        variant="secondary"
                      >
                        Get label rates
                      </AdminButton>
                    </div>

                    {ratesLoading ? <p className={styles.metaText}>Loading label rates…</p> : null}
                    {!ratesLoading && ratesLoadAttempted && !rateQuotes.length ? (
                      <AdminEmptyState
                        description={
                          labelRatesError ||
                          "No rates were returned for this package. Adjust parcel details or try another provider."
                        }
                        title="No label rates available"
                      />
                    ) : null}
                    {rateQuotes.length ? (
                      <>
                        <p className={styles.metaText}>{providerLabel(rateProvider || selectedProviderForLabel)} label rates</p>
                        <div className={styles.rateList}>
                          {rateQuotes.map((quote) => {
                            const rateId = quote.providerRateId || quote.id;
                            const selected = selectedRateId === rateId;
                            const quoteProvider = quote.source || rateProvider || selectedProviderForLabel;
                            return (
                              <label className={`${styles.rateRow} ${selected ? styles.rateRowSelected : ""}`} key={rateId}>
                                <input
                                  checked={selected}
                                  name="shipping-rate"
                                  onChange={() => {
                                    setSelectedRateId(rateId);
                                    setSelectedShipmentId(
                                      typeof quote.metadata?.shipmentId === "string" ? quote.metadata.shipmentId : ""
                                    );
                                  }}
                                  type="radio"
                                />
                                <span>
                                  <strong>
                                    <span className={styles.rateProviderBadge}>{providerLabel(quoteProvider)}</span>
                                    {" "}
                                    {quote.carrier || "Carrier"} · {quote.service || "Service"}
                                  </strong>
                                  <small>
                                    {formatMoney((quote.amountCents || 0) / 100, quote.currency || currency)}
                                    {quote.estimatedDeliveryText ? ` · ${quote.estimatedDeliveryText}` : ""}
                                  </small>
                                </span>
                              </label>
                            );
                          })}
                          <div className={styles.actionRow}>
                            <AdminButton
                              disabled={!fulfillmentPanelReady || !canBuyShippingLabel || !selectedRateQuote}
                              loading={buyingLabel}
                              onClick={buyShippingLabel}
                              size="sm"
                            >
                              {selectedRateQuote
                                ? `Buy label with ${providerLabel(selectedProviderForLabel || rateProvider)} — ${formatMoney((selectedRateQuote.amountCents || 0) / 100, selectedRateQuote.currency || currency)}`
                                : `Buy label with ${providerLabel(selectedProviderForLabel || rateProvider)}`}
                            </AdminButton>
                          </div>
                        </div>
                      </>
                    ) : null}
                  </>
                )}
              </>
            ) : (
              <>
                <SectionDivider label="Add tracking manually" />
                <p className={styles.helperNote}>Use this if you already bought postage outside Doopify.</p>
                <div className={styles.formGrid}>
                  <AdminField label="Carrier">
                    <AdminInput
                      onChange={(event) => setManualForm((prev) => ({ ...prev, carrier: event.target.value }))}
                      placeholder="UPS, FedEx, USPS…"
                      value={manualForm.carrier}
                    />
                  </AdminField>
                  <AdminField label="Service">
                    <AdminInput
                      onChange={(event) => setManualForm((prev) => ({ ...prev, service: event.target.value }))}
                      placeholder="Ground, Priority…"
                      value={manualForm.service}
                    />
                  </AdminField>
                </div>

                <div className={styles.formStack}>
                  <AdminField label="Tracking number">
                    <AdminInput
                      onChange={(event) => setManualForm((prev) => ({ ...prev, trackingNumber: event.target.value }))}
                      placeholder="1Z…"
                      value={manualForm.trackingNumber}
                    />
                  </AdminField>
                  <AdminField label="Tracking URL" hint="Optional — link the customer can click to track their shipment.">
                    <AdminInput
                      onChange={(event) => setManualForm((prev) => ({ ...prev, trackingUrl: event.target.value }))}
                      placeholder="https://tracking.example.com/..."
                      value={manualForm.trackingUrl}
                    />
                  </AdminField>
                </div>

                <label className={styles.checkboxRow}>
                  <input
                    checked={manualSendTrackingEmail}
                    disabled={!hasCustomerEmail}
                    onChange={(event) => setManualSendTrackingEmail(event.target.checked)}
                    type="checkbox"
                  />
                  <span>
                    Email tracking to customer
                    {!hasCustomerEmail ? (
                      <span className={styles.inlineHelper}>Customer email is missing for this order.</span>
                    ) : null}
                  </span>
                </label>
                {manualSendTrackingEmail && !emailProviderConfigured ? (
                  <p className={styles.metaText}>If no email provider is configured, tracking will still be saved.</p>
                ) : null}

                <div className={styles.actionRow}>
                  <AdminButton
                    disabled={!fulfillmentPanelReady}
                    loading={creatingManual}
                    onClick={createManualTrackingFulfillment}
                    size="sm"
                  >
                    {manualSendTrackingEmail
                      ? "Save tracking, mark shipped, and email customer"
                      : "Save tracking and mark shipped"}
                  </AdminButton>
                </div>
                <p className={styles.emailLogHint}>
                  After saving, check{" "}
                  <Link className={styles.inlineLinkButton} href="/admin/webhooks?tab=email">
                    email delivery logs
                  </Link>{" "}
                  for tracking email status.
                </p>
              </>
            )}
          </AdminCard>
          {/* â”€â”€ Line items â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <AdminCard className={styles.card} variant="panel">
            <h3 className={styles.cardTitle}>Line items</h3>
            {lineItems.length ? (
              <div className={styles.lineItemList}>
                {lineItems.map((item) => {
                  const unitPrice = item.price ?? (Number(item.priceCents || 0) / 100);
                  const totalPrice = item.total ?? (unitPrice * Number(item.quantity || 0));
                  const hasDiscount = Number(item.totalDiscountCents || 0) > 0 || Number(item.totalDiscount || 0) > 0;
                  return (
                    <div className={styles.lineItemRow} key={item.id}>
                      <div className={styles.lineItemDetails}>
                        <span className={styles.lineItemTitle}>{item.title}</span>
                        <span className={styles.lineItemVariant}>{item.variantTitle || item.variant || "Default variant"}</span>
                        {hasDiscount ? (
                          <span className={styles.lineItemDiscount}>
                            Discount: -{formatMoney(
                              item.totalDiscount ?? Number(item.totalDiscountCents || 0) / 100,
                              currency
                            )}
                          </span>
                        ) : null}
                      </div>
                      <div className={styles.lineItemMeta}>
                        <span className={styles.lineItemQtyPrice}>
                          {item.quantity} x {formatMoney(unitPrice, currency)}
                        </span>
                        <strong className={styles.lineItemTotal}>
                          {formatMoney(totalPrice, currency)}
                        </strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <AdminEmptyState
                description="No line items were found for this order."
                icon="inventory_2"
                title="No line items"
              />
            )}
          </AdminCard>

          {/* â”€â”€ Payment summary â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <AdminCard className={styles.card} variant="panel">
            <h3 className={styles.cardTitle}>Payment summary</h3>
            <div className={styles.summaryRows}>
              <div className={styles.summaryRowMuted}>
                <span>Subtotal</span>
                <span>{formatMoney(currentOrder.subtotal, currency)}</span>
              </div>
              <div className={styles.summaryRowMuted}>
                <span>Shipping paid by customer
                  {currentOrder.shippingMethodName ? (
                    <span style={{ display: "block", fontSize: "0.76rem", marginTop: "0.1rem" }}>
                      {currentOrder.shippingMethodName}
                    </span>
                  ) : null}
                </span>
                <span>{formatMoney(currentOrder.shippingAmount, currency)}</span>
              </div>
              <div className={styles.summaryRowMuted}>
                <span>Tax</span>
                <span>{formatMoney(currentOrder.taxAmount, currency)}</span>
              </div>
              {Number(currentOrder.discountAmount || 0) > 0 ? (
                <div className={styles.summaryRowMuted}>
                  <span>Discounts</span>
                  <span>-{formatMoney(currentOrder.discountAmount, currency)}</span>
                </div>
              ) : null}
              <div className={styles.summaryDivider} />
              <div className={styles.summaryTotal}>
                <span>Total</span>
                <span>{formatMoney(currentOrder.total, currency)}</span>
              </div>
            </div>

            {/* Discount codes applied - only show when codes exist */}
            {discounts.length ? (
              <>
                <div className={styles.summaryDivider} style={{ marginTop: "1rem" }} />
                <div className={styles.discountTagList}>
                  {discounts.map((discount) => (
                    <div className={styles.discountTagRow} key={discount.id}>
                      <span className={styles.discountTagCode}>
                        {discount.code || "Manual"}
                      </span>
                      <span className={styles.discountTagTitle}>
                        {discount.title || "Discount"}
                        {discount.method
                          ? ` - ${String(discount.method).replaceAll("_", " ").toLowerCase()}`
                          : ""}
                      </span>
                      <span className={styles.discountTagAmount}>
                        -{formatMoney(
                          discount.amount ?? Number(discount.amountCents || 0) / 100,
                          currency
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </AdminCard>

          {/* â”€â”€ Returns & refunds (OrderAdjustmentsCard) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <OrderAdjustmentsCard
            onOrderRefresh={refreshOrder}
            orderId={currentOrder.id}
            orderNumber={currentOrder.orderNumber}
            paymentStatus={currentOrder.paymentStatusRaw || currentOrder.paymentStatus}
          />

          {/* â”€â”€ Timeline â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <AdminCard className={styles.card} variant="panel">
            <h3 className={styles.cardTitle}>Timeline</h3>
            {!timelinePanelReady ? (
              <p className={styles.metaText}>Loading timeline...</p>
            ) : timeline.length ? (
              <div className={styles.timelineList}>
                {timeline.map((entry) => (
                  <div className={styles.timelineRow} key={entry.id}>
                    <strong>{entry.event || entry.title || entry.type}</strong>
                    {entry.detail ? <p>{entry.detail}</p> : null}
                    <small>{formatDateTimeForDisplay(entry.createdAt, { timeZone: storeTimeZone, fallbackText: "Unknown" })}</small>
                  </div>
                ))}
              </div>
            ) : (
              <AdminEmptyState
                description="No timeline events have been recorded yet."
                icon="schedule"
                title="No timeline events"
              />
            )}
          </AdminCard>
        </div>

        {/* â”€â”€ Sidebar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
        <div className={styles.sideColumn}>

          <AdminCard className={styles.sideCard} variant="panel">
            <h3 className={styles.cardTitle}>Shipment</h3>
            {!fulfillmentPanelReady ? (
              <p className={styles.metaText}>Loading shipment details...</p>
            ) : shipmentCards.length ? (
              <div className={styles.shipmentCardList}>
                {shipmentCards.map((shipment) => (
                  <div className={styles.shipmentCard} key={shipment.id}>
                    <div className={styles.shipmentCardHeader}>
                      <strong>{shipment.statusText}</strong>
                      {shipment.provider ? <span className={styles.metaText}>{providerLabel(shipment.provider)}</span> : null}
                    </div>
                    <p className={styles.metaText}>
                      {shipment.carrier || "Carrier pending"}
                      {shipment.service ? ` · ${shipment.service}` : ""}
                    </p>
                    {shipment.trackingNumber ? <p className={styles.noteText}>Tracking: {shipment.trackingNumber}</p> : null}
                    {shipment.labelCost != null ? (
                      <p className={styles.metaText}>Label cost: {formatMoney(shipment.labelCost, shipment.currency || currency)}</p>
                    ) : null}
                    <div className={styles.shipmentActionsRow}>
                      {shipment.labelUrl ? (
                        <a className={styles.inlineLinkButton} href={shipment.labelUrl} rel="noreferrer" target="_blank">
                          Print label
                        </a>
                      ) : null}
                      {shipment.trackingNumber ? (
                        <button className={styles.textActionButton} onClick={() => copyTrackingValue(shipment.trackingNumber)} type="button">
                          Copy tracking
                        </button>
                      ) : null}
                      {shipment.trackingUrl ? (
                        <a className={styles.inlineLinkButton} href={shipment.trackingUrl} rel="noreferrer" target="_blank">
                          View tracking
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <AdminEmptyState
                description="No shipments have been created yet."
                icon="local_shipping"
                title="No shipments"
              />
            )}
            <p className={styles.metaText}>
              <Link className={styles.inlineLinkButton} href="/admin/webhooks?tab=email">
                Check delivery logs
              </Link>{" "}
              for queued tracking emails.
            </p>
          </AdminCard>

          {digitalDeliveryPanelReady && hasDigitalDelivery ? (
            <AdminCard className={styles.sideCard} variant="panel">
              <div className={styles.digitalDeliveryHeader}>
                <div>
                  <h3 className={styles.cardTitle}>Digital delivery</h3>
                  <p className={styles.metaText}>Download access for this order.</p>
                </div>
                <AdminButton
                  loading={digitalDeliveryActionLoading === "resend"}
                  onClick={resendDigitalDeliveryEmail}
                  size="sm"
                  variant="secondary"
                >
                  Resend email
                </AdminButton>
              </div>
              {digitalDelivery?.pending && !digitalDelivery?.grants?.length ? (
                <AdminEmptyState
                  description="Digital items were purchased, but download grants are still pending."
                  icon="download"
                  title="Pending digital delivery"
                />
              ) : (
                <div className={styles.digitalDeliveryList}>
                  {(digitalDelivery?.grants || []).map((grant) => (
                    <div className={styles.digitalDeliveryRow} key={grant.grantId}>
                      <div className={styles.digitalDeliveryTitleRow}>
                        <strong>{grant.title || grant.fileName || "Digital download"}</strong>
                        <AdminStatusChip
                          tone={digitalDeliveryStatusTone(grant.status)}
                        >
                          {digitalDeliveryStatusLabel(grant.status)}
                        </AdminStatusChip>
                      </div>
                      {grant.fileName ? <p className={styles.metaText}>{grant.fileName}</p> : null}
                      <p className={styles.metaText}>
                        Downloads used: {grant.downloadCount} of {grant.downloadLimit}
                      </p>
                      <p className={styles.metaText}>
                        Expires:{" "}
                        {formatDateTimeForDisplay(grant.expiresAt, {
                          timeZone: storeTimeZone,
                          fallbackText: "Unknown",
                        })}
                      </p>
                      {grant.lastDownloadedAt ? (
                        <p className={styles.metaText}>
                          Last downloaded:{" "}
                          {formatDateTimeForDisplay(grant.lastDownloadedAt, {
                            timeZone: storeTimeZone,
                            fallbackText: "Unknown",
                          })}
                        </p>
                      ) : null}
                      {grant.deliveryEmailStatus ? (
                        <p className={styles.metaText}>Delivery email: {grant.deliveryEmailStatus}</p>
                      ) : null}
                      {Array.isArray(grant.events) && grant.events.length ? (
                        <div className={styles.digitalEventList}>
                          {grant.events.slice(0, 3).map((event) => (
                            <p className={styles.metaText} key={event.id}>
                              {event.label} ·{" "}
                              {formatDateTimeForDisplay(event.occurredAt, {
                                timeZone: storeTimeZone,
                                fallbackText: "Unknown",
                              })}
                            </p>
                          ))}
                        </div>
                      ) : null}
                      <div className={styles.digitalActionRow}>
                        <button
                          className={styles.textActionButton}
                          disabled={digitalDeliveryActionLoading === `copy:${grant.grantId}` || !grant.deliveryTokenAvailable}
                          onClick={() => copyDigitalDownloadLink(grant.grantId)}
                          type="button"
                        >
                          {digitalDeliveryActionLoading === `copy:${grant.grantId}` ? "Copying..." : "Copy link"}
                        </button>
                        <button
                          className={styles.textActionButton}
                          disabled={digitalDeliveryActionLoading === `revoke:${grant.grantId}`}
                          onClick={() => revokeDigitalGrant(grant.grantId)}
                          type="button"
                        >
                          {digitalDeliveryActionLoading === `revoke:${grant.grantId}` ? "Revoking..." : "Revoke access"}
                        </button>
                        <button
                          className={styles.textActionButton}
                          disabled={digitalDeliveryActionLoading === `regenerate:${grant.grantId}`}
                          onClick={() => regenerateDigitalGrant(grant.grantId)}
                          type="button"
                        >
                          {digitalDeliveryActionLoading === `regenerate:${grant.grantId}`
                            ? "Regenerating..."
                            : "Regenerate link"}
                        </button>
                      </div>
                      <p className={styles.metaText}>
                        Regenerating this link will invalidate the previous download URL.
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </AdminCard>
          ) : null}

          {/* â”€â”€ Notes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <AdminCard className={styles.sideCard} variant="panel">
            <h3 className={styles.cardTitle}>Notes</h3>
            <div className={styles.noteStack}>
              <AdminField label="Internal note">
                <AdminTextarea
                  onChange={(event) => setInternalNoteDraft(event.target.value)}
                  placeholder="Internal order note - not visible to the customer"
                  rows={3}
                  value={internalNoteDraft}
                />
              </AdminField>
              <div className={styles.actionRow}>
                <AdminButton loading={savingInternalNote} onClick={saveInternalNote} size="sm" variant="secondary">
                  Save internal note
                </AdminButton>
              </div>
            </div>

            <SectionDivider label="Customer update" />

            <div className={styles.noteStack}>
              <AdminField hint="Optional customer-facing update." label="Customer-visible note">
                <AdminTextarea
                  onChange={(event) => setCustomerNoteDraft(event.target.value)}
                  placeholder="Share a shipping or order update with the customer"
                  rows={3}
                  value={customerNoteDraft}
                />
              </AdminField>
              <label className={styles.checkboxRow}>
                <input
                  checked={sendCustomerNoteEmail}
                  onChange={(event) => setSendCustomerNoteEmail(event.target.checked)}
                  type="checkbox"
                />
                <span>Email this note to the customer</span>
              </label>
              <div className={styles.actionRow}>
                <AdminButton loading={savingCustomerNote} onClick={addCustomerVisibleNote} size="sm">
                  Add customer note
                </AdminButton>
              </div>
            </div>

            {!timelinePanelReady ? (
              <>
                <SectionDivider label="Note history" />
                <p className={styles.metaText}>Loading note history...</p>
              </>
            ) : customerVisibleNotes.length ? (
              <>
                <SectionDivider label="Note history" />
                <div className={styles.noteHistoryList}>
                  {customerVisibleNotes.map((entry) => (
                    <div className={styles.noteHistoryRow} key={entry.id}>
                      <strong>{entry.note}</strong>
                      <small>{formatDateTimeForDisplay(entry.createdAt, { timeZone: storeTimeZone, fallbackText: "Unknown" })}</small>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <>
                <SectionDivider label="Note history" />
                <AdminEmptyState
                  description="No customer-visible notes were added yet."
                  icon="note_stack"
                  title="No notes"
                />
              </>
            )}
          </AdminCard>

          {/* â”€â”€ Customer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <AdminCard className={styles.sideCard} variant="panel">
            <h3 className={styles.cardTitle}>Customer</h3>
            <div className={styles.infoBlock}>
              <p>{currentOrder.customer?.name || "Guest customer"}</p>
              <p>{currentOrder.customer?.email || currentOrder.email || "No email"}</p>
              <p>{currentOrder.customer?.phone || "No phone"}</p>
            </div>
          </AdminCard>

          {/* â”€â”€ Shipping address â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <AdminCard className={styles.sideCard} variant="panel">
            <h3 className={styles.cardTitle}>Shipping address</h3>
            <p className={styles.addressText}>{formatAddress(shippingAddress)}</p>
          </AdminCard>

          {/* â”€â”€ Billing address â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
          <AdminCard className={styles.sideCard} variant="panel">
            <h3 className={styles.cardTitle}>Billing address</h3>
            <p className={styles.addressText}>{formatAddress(billingAddress)}</p>
          </AdminCard>
        </div>
      </div>
      <div className={styles.toastViewport}>
        {toasts.map((toast) => (
          <div
            className={`${styles.toast} ${toast.tone === "error" ? styles.toastError : toast.tone === "success" ? styles.toastSuccess : styles.toastInfo}`}
            key={toast.id}
            role="status"
          >
            <p>{toast.message}</p>
            <button aria-label="Dismiss notification" onClick={() => dismissToast(toast.id)} type="button">×</button>
          </div>
        ))}
      </div>
    </div>
  );
}




