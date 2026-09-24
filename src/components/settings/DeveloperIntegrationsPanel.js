"use client";
import { useState } from "react";
import Link from "next/link";
import AdminButton from "../admin/ui/AdminButton";
import { settingsRequest } from "./settings-api";
import styles from "./SettingsWorkspace.module.css";

const ENV_NAMES = {
  stripe: [
    "STRIPE_SECRET_KEY",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
    "STRIPE_WEBHOOK_SECRET",
  ],
  resend: ["EMAIL_PROVIDER", "RESEND_API_KEY", "RESEND_WEBHOOK_SECRET"],
  smtp: [
    "EMAIL_PROVIDER",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_USERNAME",
    "SMTP_PASSWORD",
    "SMTP_FROM_EMAIL",
  ],
  shippo: [
    "SHIPPO_API_KEY",
    "SHIPPO_WEBHOOK_SECRET",
    "SHIPPING_RATE_PROVIDER",
    "SHIPPING_LABEL_PROVIDER",
  ],
  easypost: [
    "EASYPOST_API_KEY",
    "EASYPOST_WEBHOOK_SECRET",
    "SHIPPING_RATE_PROVIDER",
    "SHIPPING_LABEL_PROVIDER",
  ],
  storage: [
    "MEDIA_STORAGE_PROVIDER",
    "BLOB_READ_WRITE_TOKEN",
    "MEDIA_S3_ENDPOINT",
    "MEDIA_S3_BUCKET",
    "MEDIA_S3_ACCESS_KEY_ID",
    "MEDIA_S3_SECRET_ACCESS_KEY",
  ],
  jobs: [
    "JOB_RUNNER_SECRET",
    "WEBHOOK_RETRY_SECRET",
    "ABANDONED_CHECKOUT_SECRET",
  ],
};
const DOCS = {
  stripe: "https://docs.stripe.com/keys",
  resend: "https://resend.com/docs/dashboard/api-keys/introduction",
  smtp: "https://nodemailer.com/smtp",
  shippo: "https://docs.goshippo.com/shippoapi/public-api/",
  easypost: "https://docs.easypost.com/",
  storage: "https://vercel.com/docs/storage",
  jobs: "https://vercel.com/docs/cron-jobs",
};

export default function DeveloperIntegrationsPanel({
  initialIntegrations,
  initialReadiness,
}) {
  const [integrations, setIntegrations] = useState(initialIntegrations);
  const [readiness, setReadiness] = useState(initialReadiness);
  const [results, setResults] = useState({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function refresh() {
    setBusy("refresh");
    setError("");
    try {
      const data = await settingsRequest("/api/system/integrations");
      setIntegrations(data.integrations);
      setNotice("Environment status refreshed.");
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }
  async function test(id) {
    setBusy(id);
    setError("");
    try {
      const result = await settingsRequest(
        `/api/system/integrations/${id}/test`,
        { method: "POST" },
      );
      setResults((current) => ({ ...current, [id]: result }));
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }
  async function runReadiness() {
    setBusy("readiness");
    setError("");
    try {
      setReadiness(
        await settingsRequest("/api/readiness/run", { method: "POST" }),
      );
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy("");
    }
  }
  async function copyNames(id) {
    try {
      await navigator.clipboard.writeText(ENV_NAMES[id].join("\n"));
      setNotice("Environment variable names copied.");
    } catch {
      setError(
        "Clipboard unavailable. Select the variable names below to copy them.",
      );
    }
  }
  return (
    <div className={styles.configStack}>
      <h1>Environment & integrations</h1>
      <p>Developers configure infrastructure. Doopify operates the store.</p>
      <p>
        Configure environment variables on your host, then restart or redeploy.
        Configured means required environment values are present. Connection
        tests run only when requested. Webhook ready means a signing secret is
        present; verified receipts are shown in delivery logs and launch checks.
      </p>
      <div className={styles.compactActionRow}>
        <AdminButton disabled={Boolean(busy)} onClick={refresh}>
          Refresh status
        </AdminButton>
        <Link prefetch={false} href="/admin/webhooks">
          View delivery logs
        </Link>
      </div>
      {integrations.map((integration) => (
        <section key={integration.id} className={styles.configSection}>
          <h2>{integration.id === "smtp" ? "SMTP" : integration.id}</h2>
          <p>
            {integration.configured ? "Configured" : "Missing"}
            {integration.mode
              ? ` · ${integration.mode === "test" ? "Test" : "Live"}`
              : ""}
            {integration.webhookReady !== null
              ? ` · Webhook ${integration.webhookReady ? "ready" : "missing"}`
              : ""}
          </p>
          {integration.missing.length > 0 && (
            <p>Missing: {integration.missing.join(", ")}</p>
          )}
          <div className={styles.compactActionRow}>
            {!["storage", "jobs"].includes(integration.id) && (
              <AdminButton
                disabled={Boolean(busy) || !integration.configured}
                onClick={() => test(integration.id)}
              >
                {busy === integration.id ? "Testing…" : "Test connection"}
              </AdminButton>
            )}
            <AdminButton
              variant="secondary"
              onClick={() => copyNames(integration.id)}
            >
              Copy env variable names
            </AdminButton>
            <a href={DOCS[integration.id]} target="_blank" rel="noreferrer">
              View docs
            </a>
          </div>
          <details>
            <summary>Environment variables</summary>
            <pre>{ENV_NAMES[integration.id].join("\n")}</pre>
          </details>
          {results[integration.id] && (
            <p role="status">
              {results[integration.id].ok ? "Healthy" : "Error"} ·{" "}
              {results[integration.id].checkedAt}
              {results[integration.id].error
                ? ` · ${results[integration.id].error}`
                : ""}
            </p>
          )}
        </section>
      ))}
      <section>
        <h2>Store readiness</h2>
        <p>
          {readiness.lastRunAt
            ? `Last checked: ${readiness.lastRunAt}`
            : "No launch check has been run yet."}
        </p>
        <AdminButton disabled={Boolean(busy)} onClick={runReadiness}>
          {busy === "readiness" ? "Checking…" : "Run launch check"}
        </AdminButton>
        {(readiness.checks || []).map((check) => (
          <div key={check.id}>
            <h3>
              {check.title} · {check.status.replaceAll("_", " ")}
            </h3>
            <p>{check.summary}</p>
            {check.ctaRoute && (
              <Link prefetch={false} href={check.ctaRoute}>
                {check.ctaLabel || "View details"}
              </Link>
            )}
          </div>
        ))}
      </section>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>
  );
}
