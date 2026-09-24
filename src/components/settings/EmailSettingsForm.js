"use client";
import { useState } from "react";
import Link from "next/link";
import AdminButton from "../admin/ui/AdminButton";
import AdminField from "../admin/ui/AdminField";
import AdminInput from "../admin/ui/AdminInput";
import AdminTextarea from "../admin/ui/AdminTextarea";
import { jsonRequest, settingsRequest } from "./settings-api";
import styles from "./SettingsWorkspace.module.css";

const TEXT_FIELDS = [
  ["subject", "Subject"],
  ["preheader", "Preheader"],
  ["headerTitle", "Heading"],
  ["bodyText", "Message"],
  ["buttonLabel", "Button label"],
  ["footerText", "Footer"],
  ["replyToEmail", "Reply-to email"],
];
function TemplateForm({ initialTemplate }) {
  const [draft, setDraft] = useState(initialTemplate.fields);
  const [recipient, setRecipient] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const path = `/api/email-templates/${initialTemplate.templateKey}`;
  async function action(kind) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (kind === "save") {
        const result = await settingsRequest(
          path,
          jsonRequest("PATCH", {
            ...draft,
            replyToEmail: draft.replyToEmail || null,
          }),
        );
        setDraft(result.fields);
        setNotice("Template saved.");
      } else if (kind === "reset") {
        const result = await settingsRequest(`${path}/reset`, {
          method: "POST",
        });
        setDraft(result.fields);
        setNotice("Template reset to defaults.");
      } else {
        const result = await settingsRequest(
          `${path}/send-test`,
          jsonRequest("POST", { recipientEmail: recipient }),
        );
        if (!result.sent)
          throw new Error(result.error || "No test email was sent.");
        setNotice("Saved template test email sent.");
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        action("save");
      }}
      className={styles.configStack}
    >
      <h2>
        {initialTemplate.templateKey === "order_confirmation"
          ? "Order confirmation"
          : "Shipping update"}
      </h2>
      <label>
        <input
          type="checkbox"
          checked={draft.enabled}
          onChange={(event) =>
            setDraft({ ...draft, enabled: event.target.checked })
          }
        />{" "}
        Enable this message
      </label>
      <div className={styles.drawerFormGrid}>
        {TEXT_FIELDS.map(([key, label]) => (
          <AdminField key={key} label={label}>
            {key === "bodyText" ? (
              <AdminTextarea
                value={draft[key] || ""}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
              />
            ) : (
              <AdminInput
                type={key === "replyToEmail" ? "email" : "text"}
                value={draft[key] || ""}
                onChange={(event) =>
                  setDraft({ ...draft, [key]: event.target.value })
                }
              />
            )}
          </AdminField>
        ))}
      </div>
      <p>
        Template variables:{" "}
        {
          "{{orderNumber}}, {{storeName}}, {{customerName}}, {{trackingNumber}}, {{trackingUrl}}"
        }
        .
      </p>
      <div className={styles.compactActionRow}>
        <AdminButton type="submit" disabled={busy}>
          Save template
        </AdminButton>
        <AdminButton
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => action("reset")}
        >
          Reset to defaults
        </AdminButton>
      </div>
      <AdminField label="Test recipient">
        <AdminInput
          type="email"
          value={recipient}
          onChange={(event) => setRecipient(event.target.value)}
        />
      </AdminField>
      <AdminButton
        type="button"
        variant="secondary"
        disabled={busy || !recipient}
        onClick={() => action("test")}
      >
        Send saved template test
      </AdminButton>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
export default function EmailSettingsForm({ templates, storeEmail }) {
  const [email, setEmail] = useState(storeEmail || "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function saveSender(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await settingsRequest("/api/settings", jsonRequest("PATCH", { email }));
      setMessage("Sender identity saved.");
    } catch (failure) {
      setMessage(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={styles.configStack}>
      <h1>Customer email</h1>
      <form onSubmit={saveSender}>
        <AdminField label="Sender / store contact email">
          <AdminInput
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </AdminField>
        <AdminButton type="submit" disabled={busy}>
          Save sender
        </AdminButton>
        {message && <p role="status">{message}</p>}
      </form>
      <p>
        <Link prefetch={false} href="/admin/settings/brand">
          Email logo and branding
        </Link>{" "}
        ·{" "}
        <Link prefetch={false} href="/admin/webhooks">
          View delivery logs
        </Link>
      </p>
      {templates.map((template) => (
        <TemplateForm key={template.templateKey} initialTemplate={template} />
      ))}
    </div>
  );
}
