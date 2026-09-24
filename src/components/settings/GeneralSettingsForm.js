"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import AdminButton from "../admin/ui/AdminButton";
import AdminInput from "../admin/ui/AdminInput";
import AdminField from "../admin/ui/AdminField";
import AdminSelect from "../admin/ui/AdminSelect";
import {
  STORE_CURRENCY_OPTIONS,
  STORE_TIMEZONE_OPTIONS,
} from "@/lib/store-settings-options";
import { jsonRequest, settingsRequest } from "./settings-api";
import styles from "./SettingsWorkspace.module.css";

export default function GeneralSettingsForm({ initialStore }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialStore);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const patch = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  };
  async function save(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const fields = Object.fromEntries(
        [
          "name",
          "email",
          "phone",
          "address1",
          "city",
          "province",
          "postalCode",
          "country",
          "currency",
          "timezone",
        ].map((key) => [key, draft[key] ?? ""]),
      );
      await settingsRequest("/api/settings", jsonRequest("PATCH", fields));
      setMessage("Store settings saved.");
      router.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={save} className={styles.configStack}>
      <header className={styles.pageIntro}><h1>General</h1><p>Your store identity, contact details and regional preferences.</p></header>
      <div className={styles.drawerFormGrid}>
        {[
          ["name", "Store name"],
          ["email", "Store contact email"],
          ["phone", "Phone"],
          ["address1", "Public business address"],
          ["city", "City"],
          ["province", "State / province"],
          ["postalCode", "Postal code"],
          ["country", "Country"],
        ].map(([key, label]) => (
          <AdminField key={key} label={label}>
            <AdminInput
              value={draft[key] || ""}
              type={key === "email" ? "email" : "text"}
              required={key === "name" || key === "email"}
              onChange={(event) => patch(key, event.target.value)}
            />
          </AdminField>
        ))}
        <AdminField label="Currency">
          <AdminSelect
            value={draft.currency}
            options={STORE_CURRENCY_OPTIONS}
            onChange={(value) => patch("currency", value)}
          />
        </AdminField>
        <AdminField label="Time zone">
          <AdminSelect
            value={draft.timezone}
            options={STORE_TIMEZONE_OPTIONS}
            onChange={(value) => patch("timezone", value)}
          />
        </AdminField>
      </div>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      <AdminButton type="submit" disabled={saving}>
        {saving ? "Saving…" : "Save settings"}
      </AdminButton>
    </form>
  );
}
