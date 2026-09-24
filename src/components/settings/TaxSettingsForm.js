"use client";
import { useState } from "react";
import AdminButton from "../admin/ui/AdminButton";
import AdminField from "../admin/ui/AdminField";
import AdminInput from "../admin/ui/AdminInput";
import AdminSelect from "../admin/ui/AdminSelect";
import { calculateTaxPreview } from "./tax-preview.helpers";
import { jsonRequest, settingsRequest } from "./settings-api";
import styles from "./SettingsWorkspace.module.css";

const EMPTY_RULE = {
  name: "",
  countryCode: "US",
  provinceCode: "",
  ratePercent: 0,
  isActive: true,
  priority: 0,
};
const normalizeRule = (rule) => ({
  ...rule,
  ratePercent: Number(rule.rate) * 100,
});
export default function TaxSettingsForm({ initialSettings, initialRules }) {
  const [settings, setSettings] = useState(initialSettings);
  const [rules, setRules] = useState(() => initialRules.map(normalizeRule));
  const [newRule, setNewRule] = useState(EMPTY_RULE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState({
    subtotal: "100",
    shippingAmount: "0",
    country: "US",
    province: "",
  });
  const [result, setResult] = useState(null);
  async function perform(work) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
      setNotice("Tax settings saved.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  function saveSettings(event) {
    event.preventDefault();
    perform(async () => {
      const updated = await settingsRequest(
        "/api/settings/tax",
        jsonRequest("PATCH", {
          ...settings,
          defaultTaxRatePercent: Number(settings.defaultTaxRatePercent),
          originCountry: settings.originCountry || null,
          originState: settings.originState || null,
          originPostalCode: settings.originPostalCode || null,
        }),
      );
      setSettings(updated);
    });
  }
  function saveRule(rule) {
    perform(async () => {
      const data = {
        name: rule.name,
        countryCode: rule.countryCode,
        provinceCode: rule.provinceCode || null,
        rate: Number(rule.ratePercent) / 100,
        isActive: rule.isActive,
        priority: Number(rule.priority),
      };
      const saved = await settingsRequest(
        `/api/settings/tax-rules${rule.id ? `/${rule.id}` : ""}`,
        jsonRequest(rule.id ? "PATCH" : "POST", data),
      );
      setRules((current) =>
        rule.id
          ? current.map((item) =>
              item.id === rule.id ? normalizeRule(saved) : item,
            )
          : [...current, normalizeRule(saved)],
      );
      if (!rule.id) setNewRule(EMPTY_RULE);
    });
  }
  function removeRule(rule) {
    perform(async () => {
      await settingsRequest(`/api/settings/tax-rules/${rule.id}`, {
        method: "DELETE",
      });
      setRules((current) => current.filter((item) => item.id !== rule.id));
    });
  }
  function ruleFields(rule, patch) {
    return (
      <div className={styles.drawerFormGrid}>
        {[
          ["name", "Name"],
          ["countryCode", "Country"],
          ["provinceCode", "State / province"],
          ["ratePercent", "Rate (%)"],
          ["priority", "Priority"],
        ].map(([key, label]) => (
          <AdminField key={key} label={label}>
            <AdminInput
              value={rule[key] ?? ""}
              type={
                key === "ratePercent" || key === "priority" ? "number" : "text"
              }
              min={0}
              step={key === "ratePercent" ? "0.01" : undefined}
              onChange={(event) =>
                patch({ ...rule, [key]: event.target.value })
              }
            />
          </AdminField>
        ))}
        <label>
          <input
            type="checkbox"
            checked={rule.isActive}
            onChange={(event) =>
              patch({ ...rule, isActive: event.target.checked })
            }
          />{" "}
          Active
        </label>
      </div>
    );
  }
  return (
    <div className={styles.configStack}>
      <h1>Taxes & duties</h1>
      <form onSubmit={saveSettings} className={styles.configStack}>
        {[
          ["enabled", "Collect taxes"],
          ["taxShipping", "Tax shipping"],
          ["pricesIncludeTax", "Prices include tax"],
        ].map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={settings[key]}
              onChange={(event) =>
                setSettings({ ...settings, [key]: event.target.checked })
              }
            />{" "}
            {label}
          </label>
        ))}
        <AdminField label="Tax strategy">
          <AdminSelect
            options={[
              { value: "NONE", label: "None" },
              { value: "MANUAL", label: "Manual" },
            ]}
            value={settings.strategy}
            onChange={(value) => setSettings({ ...settings, strategy: value })}
          />
        </AdminField>
        <div className={styles.drawerFormGrid}>
          {[
            ["defaultTaxRatePercent", "Default tax rate (%)"],
            ["originCountry", "Tax origin country"],
            ["originState", "Tax origin state"],
            ["originPostalCode", "Tax origin postal code"],
          ].map(([key, label]) => (
            <AdminField key={key} label={label}>
              <AdminInput
                type={key === "defaultTaxRatePercent" ? "number" : "text"}
                min={0}
                max={key === "defaultTaxRatePercent" ? 100 : undefined}
                step={key === "defaultTaxRatePercent" ? "0.01" : undefined}
                value={settings[key] ?? ""}
                onChange={(event) =>
                  setSettings({ ...settings, [key]: event.target.value })
                }
              />
            </AdminField>
          ))}
        </div>
        <AdminButton type="submit" disabled={busy}>
          Save tax configuration
        </AdminButton>
      </form>
      <h2>Tax regions</h2>
      {rules.map((rule) => (
        <section key={rule.id}>
          {ruleFields(rule, (updated) =>
            setRules((current) =>
              current.map((item) => (item.id === rule.id ? updated : item)),
            ),
          )}
          <AdminButton disabled={busy} onClick={() => saveRule(rule)}>
            Save rule
          </AdminButton>
          <AdminButton
            disabled={busy}
            variant="ghost"
            onClick={() => removeRule(rule)}
          >
            Delete rule
          </AdminButton>
        </section>
      ))}
      <section>
        <h3>Add tax region</h3>
        {ruleFields(newRule, setNewRule)}
        <AdminButton disabled={busy} onClick={() => saveRule(newRule)}>
          Add rule
        </AdminButton>
      </section>
      <section>
        <h2>Tax preview</h2>
        <p>
          Estimate only. Checkout calculates the final amount on the server.
        </p>
        <div className={styles.drawerFormGrid}>
          {[
            ["subtotal", "Subtotal"],
            ["shippingAmount", "Shipping"],
            ["country", "Destination country"],
            ["province", "Destination state"],
          ].map(([key, label]) => (
            <AdminField key={key} label={label}>
              <AdminInput
                value={preview[key]}
                onChange={(event) =>
                  setPreview({ ...preview, [key]: event.target.value })
                }
              />
            </AdminField>
          ))}
        </div>
        <AdminButton
          onClick={() => {
            try {
              setResult(calculateTaxPreview(preview, settings, rules));
              setError("");
            } catch (failure) {
              setError(failure.message);
            }
          }}
        >
          Calculate estimate
        </AdminButton>
        {result && (
          <p role="status">
            Estimated tax: {result.estimatedTax.toFixed(2)}. Total:{" "}
            {result.totalWithTax.toFixed(2)}. {result.note}
          </p>
        )}
      </section>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
