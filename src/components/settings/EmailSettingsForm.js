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
  function patch(key, value) {
    setDraft((current) => ({ ...current, [key]: value }));
    setNotice("");
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
            patch("enabled", event.target.checked)
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
                  patch(key, event.target.value)
                }
              />
            ) : (
              <AdminInput
                type={key === "replyToEmail" ? "email" : "text"}
                value={draft[key] || ""}
                onChange={(event) =>
                  patch(key, event.target.value)
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
      <details className={styles.disclosure}>
      <summary>Send a test of the saved message</summary>
      <div className={styles.configStack}>
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
      </div>
      </details>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </form>
  );
}
export default function EmailSettingsForm({ templates }) {
  return (
    <div className={styles.configStack}>
      <header className={styles.pageIntro}>
        <h1>Customer emails</h1>
        <p>Choose which messages customers receive and make the wording your own.</p>
      </header>
      <div className={styles.compactActionRow}>
        <Link prefetch={false} href="/admin/settings/brand">Email logo and footer</Link>
        <Link prefetch={false} href="/admin/webhooks">Delivery logs</Link>
      </div>
      {templates.map((template) => (
        <details key={template.templateKey} className={styles.disclosure}>
          <summary>
            <span>{template.templateKey === "order_confirmation" ? "Order confirmation" : "Shipping update"}</span>
            <span className={styles.compactMeta}>Edit message</span>
          </summary>
          <TemplateForm initialTemplate={template} />
        </details>
      ))}
      <p className={styles.compactMeta}>Store contact details are managed in General. Each message can have its own reply-to address.</p>
    </div>
  );
}
