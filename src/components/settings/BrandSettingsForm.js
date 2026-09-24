"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import AdminButton from "../admin/ui/AdminButton";
import AdminInput from "../admin/ui/AdminInput";
import AdminField from "../admin/ui/AdminField";
import { jsonRequest, settingsRequest } from "./settings-api";
import styles from "./SettingsWorkspace.module.css";

const ASSETS = [
  ["logoUrl", "Store logo"],
  ["faviconUrl", "Favicon"],
  ["checkoutLogoUrl", "Checkout logo"],
  ["emailLogoUrl", "Email logo"],
];
const FIELDS = [
  ["name", "Brand name"],
  ["supportEmail", "Support email"],
  ["emailFooterText", "Email footer"],
  ["instagramUrl", "Instagram URL"],
  ["facebookUrl", "Facebook URL"],
  ["tiktokUrl", "TikTok URL"],
  ["youtubeUrl", "YouTube URL"],
];

export default function BrandSettingsForm({ initialBrand }) {
  const router = useRouter();
  const [draft, setDraft] = useState(initialBrand);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const patch = (key, value) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice("");
  };
  async function upload(key, file) {
    if (!file) return;
    setBusy(key);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const asset = await settingsRequest("/api/media/upload", {
        method: "POST",
        body: form,
      });
      patch(key, asset.url || `/api/media/${asset.id}`);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }
  async function save(event) {
    event.preventDefault();
    setBusy("save");
    setError("");
    setNotice("");
    try {
      const payload = Object.fromEntries(
        [...ASSETS, ...FIELDS]
          .filter(([key]) => draft[key] !== initialBrand[key])
          .map(([key]) => [key, draft[key] || ""]),
      );
      const updated = await settingsRequest(
        "/api/settings/brand-kit",
        jsonRequest("PATCH", payload),
      );
      setDraft(updated);
      setNotice("Brand settings saved.");
      router.refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }
  return (
    <form onSubmit={save} className={styles.configStack}>
      <h1>Brand</h1>
      <p>
        Logos and support identity appear in your storefront, checkout, customer
        emails and packing slips. Theme colors remain managed by the storefront.
      </p>
      <div className={styles.brandFieldGrid}>
        {ASSETS.map(([key, label]) => (
          <fieldset key={key}>
            <legend>{label}</legend>
            {draft[key] && (
              <img
                src={draft[key]}
                alt={`${label} preview`}
                style={{ maxWidth: 160, maxHeight: 80 }}
              />
            )}
            <AdminField label={`${label} file`}>
              <AdminInput
                type="file"
                accept="image/*"
                disabled={Boolean(busy)}
                onChange={(event) => upload(key, event.target.files?.[0])}
              />
            </AdminField>
            <AdminField label={`${label} URL`}>
              <AdminInput
                value={draft[key] || ""}
                onChange={(event) => patch(key, event.target.value)}
              />
            </AdminField>
            <AdminButton
              type="button"
              variant="ghost"
              onClick={() => patch(key, "")}
            >
              Remove {label.toLowerCase()}
            </AdminButton>
          </fieldset>
        ))}
      </div>
      <div className={styles.drawerFormGrid}>
        {FIELDS.map(([key, label]) => (
          <AdminField key={key} label={label}>
            <AdminInput
              type={key === "supportEmail" ? "email" : "text"}
              value={draft[key] || ""}
              onChange={(event) => patch(key, event.target.value)}
            />
          </AdminField>
        ))}
      </div>
      <Link prefetch={false} href="/admin/settings/email">
        Edit email templates
      </Link>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <AdminButton type="submit" disabled={Boolean(busy)}>
        {busy ? "Saving…" : "Save branding"}
      </AdminButton>
    </form>
  );
}
