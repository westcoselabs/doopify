"use client";
import { useState } from "react";
import { useSettingsDirty } from "./useSettingsDraft";
import { manualRatePayload } from "./shipping-settings.helpers";
import AdminDrawer from "../admin/ui/AdminDrawer";
import AdminButton from "../admin/ui/AdminButton";
import AdminField from "../admin/ui/AdminField";
import AdminInput from "../admin/ui/AdminInput";
import AdminSelect from "../admin/ui/AdminSelect";
import AdminTextarea from "../admin/ui/AdminTextarea";
import styles from "./SettingsWorkspace.module.css";

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

function businessDraft(defaults, settings) {
  return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
    const value = settings?.[key];
    return [key, value == null ? fallback : typeof fallback === "string" ? String(value) : value];
  }));
}

function packageDraft(entry) {
  if (!entry) {
    return ({ ...DEFAULT_PACKAGE_FORM });
  } else {
    return ({
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

}

function locationDraft(entry) {
  if (!entry) {
    return ({ ...DEFAULT_LOCATION_FORM });
  } else {
    return ({
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

}

function manualDraft(entry) {
  if (!entry) {
    return ({ ...DEFAULT_MANUAL_RATE_FORM });
  } else {
    return ({
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

}

function fallbackDraft(entry) {
  if (!entry) {
    return ({ ...DEFAULT_FALLBACK_RATE_FORM });
  } else {
    return ({
      id: entry.id,
      name: entry.name || "",
      regionCountry: entry.regionCountry || "",
      regionStateProvince: entry.regionStateProvince || "",
      amount: String(entry.amount ?? ""),
      estimatedDeliveryText: entry.estimatedDeliveryText || "",
      isActive: Boolean(entry.isActive),
    });
  }

}


export default function ShippingSettingsEditor({ type, entry, settings, saving, error, persistEntity, persistSettings, onClose }) {
  const [locationForm, setLocationForm] = useState(() => locationDraft(type === "location" ? entry : null));
  const locationDrawerOpen = type === "location";
  const setLocationDrawerOpen = onClose;
  const [packageForm, setPackageForm] = useState(() => packageDraft(type === "package" ? entry : null));
  const packageDrawerOpen = type === "package";
  const setPackageDrawerOpen = onClose;
  const [manualForm, setManualForm] = useState(() => manualDraft(type === "manual" ? entry : null));
  const manualDrawerOpen = type === "manual";
  const setManualDrawerOpen = onClose;
  const [fallbackForm, setFallbackForm] = useState(() => fallbackDraft(type === "fallback" ? entry : null));
  const fallbackDrawerOpen = type === "fallback";
  const setFallbackDrawerOpen = onClose;
  const [manualFulfillmentForm, setManualFulfillmentForm] = useState(() => businessDraft(DEFAULT_MANUAL_FULFILLMENT_FORM, settings));
  const manualFulfillmentDrawerOpen = type === "manualFulfillment";
  const setManualFulfillmentDrawerOpen = onClose;
  const [localDeliveryForm, setLocalDeliveryForm] = useState(() => businessDraft(DEFAULT_LOCAL_DELIVERY_FORM, settings));
  const localDeliveryDrawerOpen = type === "localDelivery";
  const setLocalDeliveryDrawerOpen = onClose;
  const [pickupForm, setPickupForm] = useState(() => businessDraft(DEFAULT_PICKUP_FORM, settings));
  const pickupDrawerOpen = type === "pickup";
  const setPickupDrawerOpen = onClose;
  const [packingSlipForm, setPackingSlipForm] = useState(() => businessDraft(DEFAULT_PACKING_SLIP_FORM, settings));
  const packingSlipDrawerOpen = type === "packingSlip";
  const setPackingSlipDrawerOpen = onClose;
  const [locationDrawerError, setLocationDrawerError] = useState("");
  const [packageDrawerError, setPackageDrawerError] = useState("");
  const [manualDrawerError, setManualDrawerError] = useState("");
  const activeDraft = ({ location: locationForm, package: packageForm, manual: manualForm, fallback: fallbackForm, manualFulfillment: manualFulfillmentForm, localDelivery: localDeliveryForm, pickup: pickupForm, packingSlip: packingSlipForm })[type];
  const [baseline] = useState(activeDraft);
  const drawerDirty = Object.keys(activeDraft).some(key => activeDraft[key] !== baseline[key]);
  useSettingsDirty(drawerDirty);
  function closeDrawer() { if (!saving && (!drawerDirty || window.confirm("Discard unsaved changes?"))) onClose(); }
  const currency = settings.currency || "USD";
  const shippoInUse = settings.activeRateProvider === "SHIPPO" || settings.labelProvider === "SHIPPO";
  const resolvedShipFromEmail = normalizeOptional(locationForm.email) || normalizeOptional(settings.supportEmail) || normalizeOptional(settings.email);
  const resolvedShipFromPhone = normalizeOptional(locationForm.phone) || normalizeOptional(settings.supportPhone) || normalizeOptional(settings.phone) || normalizeOptional(settings.shippingOriginPhone);



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

    const result = await persistEntity(
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
    if (result.success) setLocationDrawerOpen(false);
    else setLocationDrawerError(result.message || "Failed to save location.");
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
      manualRatePayload(manualForm),
      manualForm.id ? "Manual rate updated." : "Manual rate added."
    );
    if (result.success) {
      setManualDrawerOpen(false);
      return;
    }
    setManualDrawerError(result.message || "Failed to save manual rate.");
  }

  async function saveFallbackRate() {
    const result = await persistEntity(
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
    if (result.success) setFallbackDrawerOpen(false);
  }

  async function saveManualFulfillmentSettings() {
    const result = await persistSettings(
      {
        manualFulfillmentInstructions: normalizeOptional(manualFulfillmentForm.manualFulfillmentInstructions),
        manualTrackingBehavior: normalizeOptional(manualFulfillmentForm.manualTrackingBehavior),
      },
      "Manual fulfillment settings saved."
    );
    if (result.success) setManualFulfillmentDrawerOpen(false);
  }

  async function saveLocalDeliverySettings() {
    const result = await persistSettings(
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
    if (result.success) setLocalDeliveryDrawerOpen(false);
  }

  async function savePickupSettings() {
    const result = await persistSettings(
      {
        pickupEnabled: Boolean(pickupForm.pickupEnabled),
        pickupLocation: normalizeOptional(pickupForm.pickupLocation),
        pickupInstructions: normalizeOptional(pickupForm.pickupInstructions),
        pickupEstimate: normalizeOptional(pickupForm.pickupEstimate),
      },
      "Pickup settings saved."
    );
    if (result.success) setPickupDrawerOpen(false);
  }

  async function savePackingSlipSettings() {
    const result = await persistSettings(
      {
        packingSlipUseLogo: Boolean(packingSlipForm.packingSlipUseLogo),
        packingSlipShowSku: Boolean(packingSlipForm.packingSlipShowSku),
        packingSlipShowProductImages: Boolean(packingSlipForm.packingSlipShowProductImages),
        packingSlipFooterNote: normalizeOptional(packingSlipForm.packingSlipFooterNote),
      },
      "Packing slip settings saved."
    );
    if (result.success) setPackingSlipDrawerOpen(false);
  }


  return <>
      {locationDrawerOpen && <AdminDrawer
        open={locationDrawerOpen}
        onClose={() => closeDrawer(setLocationDrawerOpen)}
        title={locationForm.id ? "Edit ship-from location" : "Set location"}
        subtitle="Address used for quotes, labels, and returns."
      >
        <fieldset disabled={saving} className={styles.formFields}>
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
          <AdminButton disabled={saving || !drawerDirty} size="sm" onClick={saveLocation}>
            Save location
          </AdminButton>
        </div>
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
          <p role="alert" className={styles.statusText} style={{ color: "var(--destructive, #ef4444)" }}>
            {locationDrawerError}
          </p>
        ) : null}
        </fieldset>
      </AdminDrawer>}

      {packageDrawerOpen && <AdminDrawer
        open={packageDrawerOpen}
        onClose={() => closeDrawer(setPackageDrawerOpen)}
        title={packageForm.id ? "Edit package" : "Add package"}
        subtitle="Used for live rates and label buying."
      >
        <fieldset disabled={saving} className={styles.formFields}>
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
          <AdminButton disabled={saving || !drawerDirty} size="sm" onClick={savePackage}>
            Save package
          </AdminButton>
        </div>
        </fieldset>
      </AdminDrawer>}

      {manualDrawerOpen && <AdminDrawer
        open={manualDrawerOpen}
        onClose={() => closeDrawer(setManualDrawerOpen)}
        title={manualForm.id ? "Edit manual checkout rate" : "Add manual checkout rate"}
        subtitle="Controls what customers pay at checkout - not postage."
      >
        <fieldset disabled={saving} className={styles.formFields}>
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
          <AdminField label={`Amount (${currency})`} hint={manualForm.rateType === "FLAT" ? "Fixed charge shown to every customer who matches this rate." : undefined}>
            <AdminInput type="number" value={manualForm.amount} onChange={(event) => setManualForm((current) => ({ ...current, amount: event.target.value }))} placeholder="0.00" />
          </AdminField>
        ) : null}

        {manualForm.rateType === "FREE" ? (
          <AdminField label={`Free shipping minimum (${currency})`} hint="Leave blank for free shipping on every matching order.">
            <AdminInput type="number" min="0" value={manualForm.freeOverAmount} onChange={event => setManualForm(current => ({ ...current, freeOverAmount: event.target.value }))} />
          </AdminField>
        ) : null}

        {manualForm.rateType === "PRICE_BASED" ? (
          <>
            <AdminField label={`Min order total (${currency})`} hint="Rate applies when the cart subtotal is at or above this amount. Enter 0 for no minimum.">
              <AdminInput type="number" value={manualForm.minSubtotal} onChange={(event) => setManualForm((current) => ({ ...current, minSubtotal: event.target.value }))} placeholder="0" />
            </AdminField>
            <AdminField label={`Max order total (${currency})`} hint="Rate applies when the cart subtotal is at or below this amount. Leave blank for no maximum.">
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
          <AdminButton disabled={saving || !drawerDirty} size="sm" onClick={saveManualRate}>
            Save manual rate
          </AdminButton>
        </div>
        </fieldset>
      </AdminDrawer>}

      {fallbackDrawerOpen && <AdminDrawer
        open={fallbackDrawerOpen}
        onClose={() => closeDrawer(setFallbackDrawerOpen)}
        title={fallbackForm.id ? "Edit fallback" : "Add fallback"}
        subtitle="Shown only when live rates fail."
      >
        <fieldset disabled={saving} className={styles.formFields}>
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
          <AdminButton disabled={saving || !drawerDirty} size="sm" onClick={saveFallbackRate}>
            Save fallback
          </AdminButton>
        </div>
        {error && <p role="alert">{error}</p>}
        </fieldset>
      </AdminDrawer>}

      {manualFulfillmentDrawerOpen && <AdminDrawer
        open={manualFulfillmentDrawerOpen}
        onClose={() => closeDrawer(setManualFulfillmentDrawerOpen)}
        title="Configure manual fulfillment"
        subtitle="For teams buying labels outside Doopify."
      >
        <fieldset disabled={saving} className={styles.formFields}>
        <AdminField label="Default fulfillment instructions">
          <AdminTextarea rows={4} value={manualFulfillmentForm.manualFulfillmentInstructions} onChange={(event) => setManualFulfillmentForm((current) => ({ ...current, manualFulfillmentInstructions: event.target.value }))} />
        </AdminField>
        <AdminField label="Manual tracking behavior">
          <AdminInput value={manualFulfillmentForm.manualTrackingBehavior} onChange={(event) => setManualFulfillmentForm((current) => ({ ...current, manualTrackingBehavior: event.target.value }))} placeholder="Example: Tracking number required before mark shipped" />
        </AdminField>
        <div className={styles.actionRow}>
          <AdminButton disabled={saving || !drawerDirty} size="sm" onClick={saveManualFulfillmentSettings}>
            Save settings
          </AdminButton>
        </div>
        {error && <p role="alert">{error}</p>}
        </fieldset>
      </AdminDrawer>}

      {localDeliveryDrawerOpen && <AdminDrawer
        open={localDeliveryDrawerOpen}
        onClose={() => closeDrawer(setLocalDeliveryDrawerOpen)}
        title="Local delivery"
        subtitle="ZIP/radius pricing and delivery instructions."
      >
        <fieldset disabled={saving} className={styles.formFields}>
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
          <AdminButton disabled={saving || !drawerDirty} size="sm" onClick={saveLocalDeliverySettings}>
            Save local delivery
          </AdminButton>
        </div>
        {error && <p role="alert">{error}</p>}
        </fieldset>
      </AdminDrawer>}

      {pickupDrawerOpen && <AdminDrawer
        open={pickupDrawerOpen}
        onClose={() => closeDrawer(setPickupDrawerOpen)}
        title="Pickup in store"
        subtitle="Pickup location, instructions, and estimate."
      >
        <fieldset disabled={saving} className={styles.formFields}>
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
          <AdminButton disabled={saving || !drawerDirty} size="sm" onClick={savePickupSettings}>
            Save pickup
          </AdminButton>
        </div>
        {error && <p role="alert">{error}</p>}
        </fieldset>
      </AdminDrawer>}

      {packingSlipDrawerOpen && <AdminDrawer
        open={packingSlipDrawerOpen}
        onClose={() => closeDrawer(setPackingSlipDrawerOpen)}
        title="Packing slip"
        subtitle="Logo, SKU, images, footer, and preview settings."
      >
        <fieldset disabled={saving} className={styles.formFields}>
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
          <AdminButton disabled={saving || !drawerDirty} size="sm" onClick={savePackingSlipSettings}>
            Save packing slip
          </AdminButton>
        </div>
        {error && <p role="alert">{error}</p>}
        </fieldset>
      </AdminDrawer>}
  </>;
}
